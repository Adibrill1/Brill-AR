const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Images and videos: "מילוי תמונת המקור" lays the layer exactly over the whole artwork (a centred crop to the artwork's
// shape, width to match, centred, flat), "↻ סיבוב 90°" turns it a quarter and fills again (sideways shape); the canvas
// shows it edge to edge. ✂️ crops right on the canvas: the whole source shows faintly, a corner or a drag of the kept
// region changes only what is kept (the picture stays put), a shape chip fixes its shape. The Delete key removes the
// selected element (not while typing in a field). A keyed layer is
// left alone. The time cube / chroma rows keep their sheet tabs. Headless Chrome, phone size; not an iPhone.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
const p=await (await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})).newPage();const pageErrors=[];p.on('pageerror',e=>pageErrors.push(String(e)));
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(800);
const id=await p.evaluate(async()=>{const r=Studio.blankExperience('crop-fill');r.target={artRect:{x:0,y:0,w:768,h:1024},natural:{w:768,h:1024}};
  const mk=(w,h,fill)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');fill(g,w,h);return new Promise(res=>c.toBlob(res));};
  r.assets.__artwork=await mk(768,1024,(g,w,h)=>{g.fillStyle='#ffffff';g.fillRect(0,0,w,h);});
  r.assets.red=await mk(400,400,(g,w,h)=>{g.fillStyle='#ff0000';g.fillRect(0,0,w,h);});
  const K={loop:false,keys:[{t:0,x:.2,y:.2,z:0,rot:0,opacity:1,scale:1,tap:'none'},{t:2,x:.3,y:.2,z:0,rot:0,opacity:1,scale:1,tap:'none'}]};
  r.elements=[{id:'pic',name:'PIC',type:'image',assetId:'red',aspect:1,x:.2,y:.2,w:.3,rot:0},{id:'kd',name:'KD',type:'image',assetId:'red',aspect:1,x:.2,y:.2,w:.2,rot:0,timeline:K}];r.elements.forEach(Studio.normEl);
  await Studio.save(r);const o=document.createElement('option');o.value=r.id;o.textContent=r.name;document.querySelector('#exp-select').append(o);return r.id;});
await p.locator('#exp-select').selectOption(id);await p.waitForFunction(()=>parseFloat(document.querySelector('#preview').style.height)>200,{timeout:10000});
const pick=async(n)=>{await p.evaluate(n=>[...document.querySelectorAll('#element-list li')].find(l=>l.textContent.includes(n)).click(),n);await p.waitForTimeout(400);};
const tab=async(k)=>{await p.evaluate(k=>{const b=document.querySelector('#panel-subtabs [data-sub="'+k+'"]');if(b&&b.offsetParent)b.click();},k);await p.waitForTimeout(250);};
const el=(eid)=>p.evaluate(async([id,eid])=>(await Studio.load(id)).elements.find(e=>e.id===eid),[id,eid]);
const near=(a,b,t=.002)=>Math.abs(a-b)<t;
assert.equal(await p.evaluate(()=>document.querySelector('#row-chroma').dataset.sub),'look','chroma row stays on the look tab');
assert.equal(await p.evaluate(()=>document.querySelector('#row-timecube').dataset.sub),'look','time cube row on the look tab');
assert.equal(await p.evaluate(()=>document.querySelector('#row-fill').dataset.sub),'pos','fill row on the position tab');
// fill: portrait artwork (3:4), square picture -> centred crop to 3:4, full width and height
await pick('PIC');await tab('pos');assert.ok(await p.locator('#btn-fill-art').isVisible(),'fill button shown for an image');
await p.locator('#btn-fill-art').click();await p.waitForTimeout(700);
let e=await el('pic');
assert.ok(near(e.x,0)&&near(e.y,0)&&near(e.w,1)&&near(e.h,1)&&e.rot===0&&near(e.crop.w,.75)&&near(e.crop.x,.125)&&near(e.crop.h,1),'fill: covers the artwork exactly: '+JSON.stringify(e));
// the canvas: red to the artwork's corners, white backdrop just outside it
const px=async()=>p.evaluate(()=>{const c=document.querySelector('#preview'),g=c.getContext('2d'),W=c.width,H=c.height,aw=W/1.5,ah=H/1.5,l=aw*.25,t=ah*.25; /* artwork + a quarter margin each side (editor MARGIN_FRAC) */const at=(x,y)=>[...g.getImageData(Math.round(x),Math.round(y),1,1).data].slice(0,3);
  return {tl:at(l+4,t+4),br:at(l+aw-5,t+ah-30),bl:at(l+4,t+ah-5),mid:at(W/2,H/2),out:at(l-6,t+ah/2)};});
let q=await px();for(const k of ['tl','br','bl','mid'])assert.ok(q[k][0]>200&&q[k][1]<60&&q[k][2]<60,'2D: red at '+k+': '+JSON.stringify(q));
assert.ok(q.out[1]>150,'2D: not past the artwork edge: '+JSON.stringify(q));
// turn 90: sideways shape (4:3), width = artwork height, turned a quarter
await p.locator('#btn-fill-rot').click();await p.waitForTimeout(700);e=await el('pic');
assert.ok(e.rot===90&&near(e.w,1024/768)&&near(e.h,.75)&&near(e.crop.w,1)&&near(e.crop.h,.75)&&near(e.crop.y,.125)&&near(e.aspect,1024/768,.003),'turn: a quarter and filled again: '+JSON.stringify(e));
q=await px();for(const k of ['tl','br','bl','mid'])assert.ok(q[k][0]>200&&q[k][1]<60,'2D turned: red at '+k+': '+JSON.stringify(q));
await p.locator('#btn-fill-rot').click();await p.waitForTimeout(600);e=await el('pic');assert.ok(e.rot===180&&near(e.w,1),'turn again: 180, upright shape');
await p.locator('#btn-fill-rot').click();await p.waitForTimeout(600);e=await el('pic');assert.ok(e.rot===-90&&near(e.w,1024/768),'and -90');
await p.locator('#btn-fill-rot').click();await p.waitForTimeout(600);e=await el('pic');assert.ok(e.rot===0&&near(e.w,1),'and back to 0');
// crop on the canvas itself (✂️): full picture first; pull the bottom-right corner in by a quarter - the picture stays put
await tab('look');await p.locator('#crop-reset').click();await p.waitForTimeout(600);
assert.ok(await p.locator('#btn-crop').isVisible(),'✂️ on the canvas for an image');await p.locator('#btn-crop').click();await p.waitForTimeout(300);
assert.ok(await p.evaluate(()=>document.querySelector('#btn-crop').classList.contains('on')),'crop mode on');
const ses=await p.context().newCDPSession(p);
const tdrag=async(x0,y0,x1,y1)=>{await ses.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x0,y:y0}]});for(let i=1;i<=6;i++){await ses.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x0+(x1-x0)*i/6,y:y0+(y1-y0)*i/6}]});await p.waitForTimeout(25);}await ses.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(600);};
const bx=()=>p.evaluate(()=>{const b=window.__testBoxes.pic,r=document.querySelector('#preview').getBoundingClientRect();return {x:r.left+b.cx,y:r.top+b.cy,w:b.w,h:b.h};});
let B=await bx();await tdrag(B.x+B.w/2,B.y+B.h/2,B.x+B.w/4,B.y+B.h/4);e=await el('pic');
assert.ok(near(e.crop.x,0,.01)&&near(e.crop.y,0,.01)&&near(e.crop.w,.75,.02)&&near(e.crop.h,.75,.02),'corner pulled in a quarter: '+JSON.stringify(e.crop));
assert.ok(near(e.w,.75,.02)&&near(e.x,-.125,.01)&&near(e.y,.09375,.01),'the picture stays put (smaller box, moved to the kept part): '+JSON.stringify({w:e.w,x:e.x,y:e.y}));
B=await bx();await tdrag(B.x,B.y,B.x+B.w/6,B.y+B.h/6);e=await el('pic');
assert.ok(near(e.crop.x,.125,.015)&&near(e.crop.y,.125,.015)&&near(e.crop.w,.75,.02),'dragging the kept region moves the crop: '+JSON.stringify(e.crop));
assert.ok(near(e.x,0,.015)&&near(e.y,0,.015),'over the still picture: '+JSON.stringify({x:e.x,y:e.y}));
// a tap outside the picture ends cropping; the item stays selected
const out=await p.evaluate(()=>{const r=document.querySelector('#preview').getBoundingClientRect();return {x:r.left+6,y:r.top+r.height-6};});
await p.touchscreen.tap(out.x,out.y);await p.waitForTimeout(400);
assert.equal(await p.evaluate(()=>document.querySelector('#btn-crop').classList.contains('on')),false,'tap outside ends cropping');
assert.ok(await p.evaluate(()=>[...document.querySelectorAll('#element-list li')].some(l=>l.className==='sel')),'and keeps the selection');
// shape chip 16:9: the kept region takes that shape (and cropping is on); Escape ends it
await p.locator('#crop-shapes [data-r="1.7778"]').click();await p.waitForTimeout(700);e=await el('pic');
assert.ok(near(e.aspect,16/9,.01)&&near(e.crop.w,1,.002)&&near(e.crop.h,.5625,.003),'16:9 chip: the region has that shape: '+JSON.stringify({a:e.aspect,c:e.crop}));
assert.ok(await p.evaluate(()=>document.querySelector('#btn-crop').classList.contains('on')),'chip turns cropping on');
await p.keyboard.press('Escape');await p.waitForTimeout(300);assert.equal(await p.evaluate(()=>document.querySelector('#btn-crop').classList.contains('on')),false,'Escape ends cropping');
await p.locator('#crop-shapes [data-r="free"]').click();await p.waitForTimeout(300);
// 3D view: no ✂️ (a 2D-view tool)
await p.locator('#btn-3d').click();await p.waitForTimeout(1500);assert.equal(await p.locator('#btn-crop').isVisible(),false,'no ✂️ in the 3D view');
await p.locator('#btn-2d').click();await p.waitForTimeout(800);assert.ok(await p.locator('#btn-crop').isVisible(),'✂️ back in 2D');
// a keyed layer: fill leaves it alone, with a message
await pick('KD');await tab('pos');const k0=await el('kd');await p.locator('#btn-fill-art').click();await p.waitForTimeout(600);
assert.deepEqual(await el('kd'),k0,'keyed layer unchanged');assert.ok((await p.locator('#msg').textContent()).includes('נקודות זמן'),'and a message says why');
// Delete key: not while typing in a field; otherwise it removes the selected element
await pick('PIC');await tab('look');await p.locator('#crop-x').focus();await p.keyboard.press('Backspace');await p.waitForTimeout(400);
assert.ok(await el('pic'),'Backspace in a field does not delete the element');
await p.evaluate(()=>document.activeElement.blur());await p.keyboard.press('Delete');await p.waitForTimeout(700);
assert.equal(await el('pic'),undefined,'Delete removes the selected element');assert.ok(await p.locator('#panel').isHidden(),'nothing selected after');
assert.deepEqual(pageErrors,[],'no page errors');
console.log('PASS editor-crop-fill: fill covers the artwork exactly (and turned a quarter), crop on the canvas (corners, moving the region, shape chips, tap outside/Escape end it), keyed layer left alone, Delete key');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
