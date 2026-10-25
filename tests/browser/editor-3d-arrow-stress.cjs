const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Stress (screenshot-based representative reconstruction - NOT the user's actual saved scene):
// steep-tilt full-frame dark plane + centered starburst particles + corner star, echoing Adi's
// 08:52 phone screenshot. On a 390px phone view, every selection's arrow heads must stay inside
// the viewport and grabbable - including under wheel and pinch zoom. View-only: element data
// never changes. The real phone check on her own scene remains a separate, user-side step.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
 const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const p=await ctx.newPage();
 await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);
 const id=await p.evaluate(async()=>{const r=Studio.blankExperience('arrowstress');r.target={artRect:{x:0,y:0,w:768,h:1024},natural:{w:768,h:1024}};const c=document.createElement('canvas');c.width=768;c.height=1024;const g=c.getContext('2d');g.fillStyle='#141414';g.fillRect(0,0,768,1024);r.assets.__artwork=await new Promise(res=>c.toBlob(res));
  const blob=await fetch('/library/star.png').then(r=>r.blob());
  const big={id:'big',name:'BIG',type:'image',x:0,y:0,w:1.0,rot:0,rotX:-55,rotY:8,asset:'big.png'};r.assets['big.png']=blob; // steep tilt, like the screenshot plane
  const fx={id:'fx',name:'FX',type:'particles',x:0,y:0,w:.2,rot:0,particles:{shape:'burst',count:120}};
  const star={id:'star',name:'STAR',type:'image',x:.347,y:.36,w:.24,rot:-10,asset:'star2.png'};r.assets['star2.png']=blob;
  r.elements=[big,fx,star];r.elements.forEach(Studio.normEl);await Studio.save(r);const opt=document.createElement('option');opt.value=r.id;opt.textContent=r.name;document.querySelector('#exp-select').append(opt);return r.id;});
 await p.locator('#exp-select').selectOption(id);
 await p.waitForFunction(()=>parseFloat(document.querySelector('#preview').style.height)>300,{timeout:10000});
 await p.tap('#btn-3d');await p.waitForSelector('[data-el-root]',{state:'attached',timeout:20000});
 const tipOf=async(gi)=>{await p.evaluate(()=>Editor3D._test.scene().object3D.updateMatrixWorld(true));return p.evaluate(gi=>{const g=Editor3D._test.gizmo();const cone=g.children[gi].children[1];const v=new THREE.Vector3();cone.getWorldPosition(v);v.project(Editor3D._test.scene().camera);const r=Editor3D._test.scene().canvas.getBoundingClientRect();return {x:r.left+(v.x+1)/2*r.width,y:r.top+(-v.y+1)/2*r.height,rect:{l:r.left,t:r.top,w:r.width,h:r.height}};},gi);};
 const selectEl=async(name)=>{for(let i=0;i<4;i++){await p.evaluate(name=>{document.querySelectorAll('#element-list li').forEach(li=>{const t=li.textContent.trim().replace(/^\S+\s+/,'');if(t===name||t.startsWith(name+' '))li.click();});},name);try{await p.waitForFunction(n=>document.querySelector('#panel-name').textContent.includes(n),name,{timeout:1200});break;}catch(e){if(i===3)throw new Error('could not select '+name);}}await p.evaluate(()=>{const w=document.querySelector('#canvas-wrap');scrollTo(0,w.getBoundingClientRect().top+scrollY-8);});await p.waitForTimeout(300);};
 const inView=(pt,tag)=>{assert.ok(pt.x>pt.rect.l+2&&pt.x<pt.rect.l+pt.rect.w-2&&pt.y>pt.rect.t+2&&pt.y<pt.rect.t+pt.rect.h-2,tag+' inside viewport: '+JSON.stringify(pt));};
 const state=()=>p.evaluate(xid=>Studio.load(xid).then(r=>Object.fromEntries(r.elements.map(e=>[e.id,e]))),id);
 const checkAll=async(tag)=>{for(let i=0;i<3;i++) inView(await tipOf(i),tag+' arrow'+i);};
 // 1. every element of the representative scene: all three arrow heads inside the phone viewport
 const s0=await state();
 for(const n of ['BIG','FX','STAR']){await selectEl(n);await checkAll(n);}
 const s1=await state();
 for(const eid of ['big','fx','star']) for(const k of ['x','y','rot','rotX','rotY','w']) assert.deepStrictEqual(s1[eid][k],s0[eid][k],eid+'.'+k+' unchanged by gizmo fit');
 // 2. pinch zoom (the new two-finger gesture) keeps the fit: spread in, heads still inside
 await selectEl('FX');
 const ses=await ctx.newCDPSession(p);
 const sbox=await p.evaluate(()=>{const r=Editor3D._test.scene().canvas.getBoundingClientRect();return {x:r.left,y:r.top,width:r.width,height:r.height};});
 const cx=sbox.x+sbox.width/2,cy=sbox.y+sbox.height/2;
 await ses.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx-30,y:cy,id:1},{x:cx+30,y:cy,id:2}]});
 await ses.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-80,y:cy,id:1},{x:cx+80,y:cy,id:2}]});
 await ses.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(400);
 await checkAll('pinched-in FX');
 const z1=await p.evaluate(()=>{let z=null;Editor3D._test.scene().querySelectorAll('[camera]').forEach(n=>{z=n.getAttribute('position').z;});return z;});
 assert.ok(z1<1.15,'pinch dollied the camera in: '+z1);
 // 3. pinch back out to the far clamp region: heads still inside
 await ses.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx-90,y:cy,id:1},{x:cx+90,y:cy,id:2}]});
 await ses.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-30,y:cy,id:1},{x:cx+30,y:cy,id:2}]});
 await ses.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(400);
 await checkAll('pinched-out FX');
 const s2=await state();
 assert.strictEqual(s2.fx.x,0,'pinch stress never moved the particles element');
 console.log('PASS arrow stress (representative screenshot reconstruction): steep-tilt plane, particles, corner star - all arrow heads inside the 390px viewport across selections and pinch zoom, element data untouched');
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
