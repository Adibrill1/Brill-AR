const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Acceptance (pinch view-zoom): a two-finger spread/pinch zooms the EDITING VIEW in both the
// 2D canvas and the embedded 3D view - it never resizes the artwork or mutates elements, and
// hit-testing keeps mapping taps to the right element while zoomed.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
 const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const p=await ctx.newPage();
 await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);
 const id=await p.evaluate(async()=>{const r=Studio.blankExperience('pinchguard');r.target={artRect:{x:0,y:0,w:768,h:768},natural:{w:768,h:768}};const c=document.createElement('canvas');c.width=768;c.height=768;const g=c.getContext('2d');g.fillStyle='#ffffff';g.fillRect(0,0,768,768);r.assets.__artwork=await new Promise(res=>c.toBlob(res));
  const free={id:'free',name:'FR',type:'text',text:'FR',color:'#ff0000',x:.3,y:0,w:.12,rot:0};
  r.elements=[free];r.elements.forEach(Studio.normEl);await Studio.save(r);const opt=document.createElement('option');opt.value=r.id;opt.textContent=r.name;document.querySelector('#exp-select').append(opt);return r.id;});
 await p.locator('#exp-select').selectOption(id);
 await p.waitForFunction(()=>parseFloat(document.querySelector('#preview').style.height)>300,{timeout:10000});
 const ses=await ctx.newCDPSession(p);
 const pinch=async(box,d0,d1)=>{const cx=box.x+box.width/2,cy=box.y+box.height/2;
  await ses.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx-d0/2,y:cy,id:1},{x:cx+d0/2,y:cy,id:2}]});
  await ses.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-(d0+d1)/4,y:cy,id:1},{x:cx+(d0+d1)/4,y:cy,id:2}]});
  await ses.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-d1/2,y:cy,id:1},{x:cx+d1/2,y:cy,id:2}]});
  await ses.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await p.waitForTimeout(300);};
 const state=()=>p.evaluate(id=>Studio.load(id).then(r=>({free:r.elements.find(e=>e.id==='free'),zoom:document.querySelector('#preview').dataset.zoom})),id);
 // 1. 2D: spread zooms the view in (~3x), pinch zooms it back out (~1.5x)
 await p.evaluate(()=>{const w=document.querySelector('#canvas-wrap');scrollTo(0,w.getBoundingClientRect().top+scrollY-8);});await p.waitForTimeout(300);
 let box=await p.locator('#preview').boundingBox();
 await pinch(box,60,180);
 let s1=await state();
 assert.ok(Math.abs(parseFloat(s1.zoom)-3)<0.08,'2D spread zoomed the view ~3x: '+s1.zoom);
 await pinch(box,180,90);
 let s2=await state();
 assert.ok(Math.abs(parseFloat(s2.zoom)-1.5)<0.08,'2D pinch zoomed the view out to ~1.5x: '+s2.zoom);
 assert.strictEqual(s2.free.x,.3,'view zoom never moved the element');
 assert.strictEqual(s2.free.w,.12,'view zoom never resized the element');
 // 2. 2D: while zoomed, a tap still lands on the element under the finger (inverse mapping)
 const z=parseFloat(s2.zoom),bw=box.width;
 const sx=box.x+bw*(0.5+0.2*z),sy=box.y+box.height/2; // FR world center is 0.2*bw right of canvas center, on the midline
 await p.touchscreen.tap(sx,sy);
 try{await p.waitForFunction(()=>document.querySelector('#panel-name').textContent.includes('FR'),{timeout:2500});}
 catch(e){throw new Error('tap at zoom '+z+' did not select FR (mapping broken)');}
 // 3. 3D: spread dollies the camera in, pinch dollies it back out, inside the wheel range
 await p.evaluate(()=>{const w=document.querySelector('#canvas-wrap');scrollTo(0,w.getBoundingClientRect().top+scrollY-8);});await p.waitForTimeout(300);
 await p.tap('#btn-3d');await p.waitForSelector('[data-el-root]',{state:'attached',timeout:20000});
 await p.waitForFunction(()=>{const s=Editor3D._test.scene();return s&&s.canvas;},{timeout:20000});
 const camZ=()=>p.evaluate(()=>{let z=null;Editor3D._test.scene().querySelectorAll('[camera]').forEach(n=>{z=n.getAttribute('position').z;});return z;});
 const z0=await camZ();
 const sbox=await p.evaluate(()=>{const r=Editor3D._test.scene().canvas.getBoundingClientRect();return {x:r.left,y:r.top,width:r.width,height:r.height};});
 await pinch(sbox,60,120);
 const z1=await camZ();
 assert.ok(Math.abs(z1-z0*0.5)<0.05,'3D spread dollied in ~2x: '+z0+' -> '+z1);
 await pinch(sbox,180,60);
 const z2=await camZ();
 assert.ok(Math.abs(z2-z1*3)<0.08,'3D pinch dollied back out ~3x: '+z1+' -> '+z2);
 let s3=await state();
 assert.strictEqual(s3.free.x,.3,'3D view zoom never moved the element');
 assert.ok(!s3.free.timeline||!s3.free.timeline.keys,'view zoom created no timeline');
 console.log('PASS pinch zoom: two-finger spread/pinch zooms the 2D editing view and the 3D camera, mapping stays correct while zoomed, elements untouched');
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
