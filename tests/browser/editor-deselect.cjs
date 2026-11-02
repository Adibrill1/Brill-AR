const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// A tap (phone) or click (mouse) on the grey around the artwork lets go of the selected item, in the 2D view and in the
// 3D view; a drag on empty 3D space still turns the view and keeps the selection. Headless Chrome; not an iPhone.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});try{
for(const phone of [true,false]){
const ctx=await b.newContext(phone?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1280,height:900}});const p=await ctx.newPage();const pageErrors=[];p.on('pageerror',e=>pageErrors.push(String(e)));const tag=phone?'phone':'mouse';
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(800);
const id=await p.evaluate(async()=>{const r=Studio.blankExperience('deselect');r.target={artRect:{x:0,y:0,w:768,h:768},natural:{w:768,h:768}};const c=document.createElement('canvas');c.width=c.height=768;const g=c.getContext('2d');g.fillStyle='#ffffff';g.fillRect(0,0,768,768);r.assets.__artwork=await new Promise(res=>c.toBlob(res));
  r.elements=[{id:'big',name:'BIG',type:'text',text:'BIG',color:'#ff0000',x:0,y:.1,w:.3,rot:0}];r.elements.forEach(Studio.normEl);
  await Studio.save(r);const o=document.createElement('option');o.value=r.id;o.textContent=r.name;document.querySelector('#exp-select').append(o);return r.id;});
await p.locator('#exp-select').selectOption(id);await p.waitForFunction(()=>parseFloat(document.querySelector('#preview').style.height)>200,{timeout:10000});
await p.locator('#canvas-wrap').scrollIntoViewIfNeeded();await p.waitForTimeout(500);
const tap=async(x,y)=>{if(phone)await p.touchscreen.tap(x,y);else await p.mouse.click(x,y);await p.waitForTimeout(400);};
const pick=async()=>{await p.evaluate(()=>[...document.querySelectorAll('#element-list li')].find(l=>l.textContent.includes('BIG')).click());await p.waitForTimeout(400);};
const selected=()=>p.evaluate(()=>[...document.querySelectorAll('#element-list li')].some(l=>l.className==='sel'));
// 2D: the grey margin of the canvas (above the square artwork in the 3:4 frame)
await pick();assert.ok(await selected(),tag+' 2D: selected');
const g2=await p.evaluate(()=>{const r=document.querySelector('#preview').getBoundingClientRect();return {x:r.left+r.width*.3,y:r.top+8};});
await tap(g2.x,g2.y);assert.equal(await selected(),false,tag+' 2D: a tap on the grey lets go of the item');
// 3D: a tap on empty grey space lets go; a drag there turns the view and keeps the item
await p.locator('#btn-3d').click();await p.waitForFunction(()=>Editor3D.isActive()&&document.querySelector('[data-el-root="big"]'),null,{timeout:20000});await p.waitForTimeout(900);
await pick();assert.ok(await selected(),tag+' 3D: selected');assert.ok(await p.evaluate(()=>!!Editor3D._test.gizmo()),tag+' 3D: gizmo shown');
const g3=await p.evaluate(()=>{const cv=Editor3D._test.scene().canvas,r=cv.getBoundingClientRect();for(const fy of [.06,.94,.1,.9])for(const fx of [.3,.5,.7,.2,.8]){const x=r.left+r.width*fx,y=r.top+r.height*fy;if(document.elementFromPoint(x,y)===cv)return {x,y};}return null;});
assert.ok(g3,tag+' 3D: an empty grey spot');
const r0=await p.evaluate(()=>document.querySelector('#editor-3d-rig').getAttribute('rotation').y);
if(phone){const ses=await ctx.newCDPSession(p);await ses.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:g3.x,y:g3.y}]});for(let i=1;i<=5;i++){await ses.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:g3.x+i*12,y:g3.y}]});await p.waitForTimeout(30);}await ses.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
else{await p.mouse.move(g3.x,g3.y);await p.mouse.down();await p.mouse.move(g3.x+60,g3.y,{steps:5});await p.mouse.up();}
await p.waitForTimeout(400);
assert.ok(Math.abs((await p.evaluate(()=>document.querySelector('#editor-3d-rig').getAttribute('rotation').y))-r0)>5,tag+' 3D: a drag on empty space turns the view');
assert.ok(await selected(),tag+' 3D: and keeps the selection');
await tap(g3.x,g3.y);
assert.equal(await selected(),false,tag+' 3D: a tap on the grey lets go of the item');assert.ok(await p.evaluate(()=>!Editor3D._test.gizmo()),tag+' 3D: gizmo gone');
assert.deepEqual(pageErrors,[],tag+': no page errors');await ctx.close();}
console.log('PASS editor-deselect: a tap/click on the grey lets go of the selection in 2D and 3D, on a phone and with a mouse; a drag still turns the 3D view');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
