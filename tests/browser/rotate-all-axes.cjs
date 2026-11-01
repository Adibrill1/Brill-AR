const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Turning a layer on every axis: (1) panel tilt sliders write rotX/rotY with the 90° snap, (2) the 2D tilt knobs (green
// beside the right edge -> rotY, red beside the left edge -> rotX) turn it by dragging, (3) a tilted image is drawn by the real-scene
// layer in 2D (as in the experience), not flat, (4) in 3D with the rotate tool, dragging the selected layer itself tilts it.
// Headless Chrome; not an iPhone.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});try{
const p=await (await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})).newPage();const pageErrors=[];p.on('pageerror',e=>pageErrors.push(String(e)));
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(800);
const id=await p.evaluate(async()=>{const r=Studio.blankExperience('tilt');r.target={artRect:{x:0,y:0,w:768,h:768},natural:{w:768,h:768}};const c=document.createElement('canvas');c.width=c.height=768;const g=c.getContext('2d');g.fillStyle='#dde';g.fillRect(0,0,768,768);r.assets.__artwork=await new Promise(res=>c.toBlob(res));
  r.assets.cr=await (await fetch('library/stickers/crown.png')).blob();r.elements=[{id:'cr',name:'כתר',type:'image',assetId:'cr',x:0,y:0,w:.4,h:.4,aspect:1,rot:0,z:0,flush:true}];r.elements.forEach(Studio.normEl);
  await Studio.save(r);const o=document.createElement('option');o.value=r.id;o.textContent=r.name;document.querySelector('#exp-select').append(o);return r.id;});
await p.locator('#exp-select').selectOption(id);await p.locator('#canvas-wrap').scrollIntoViewIfNeeded();await p.waitForTimeout(800);
const load=()=>p.evaluate(async id=>{const e=(await Studio.load(id)).elements[0];return [e.rotX||0,e.rotY||0];},id);
await p.evaluate(()=>document.querySelector('#element-list li').click());await p.waitForTimeout(300);
// (1) sliders
await p.evaluate(()=>{for(const [i,v] of [['sl-rotx','86'],['sl-roty','-30']]){const s=document.getElementById(i);s.value=v;s.dispatchEvent(new Event('input',{bubbles:true}));s.dispatchEvent(new Event('change',{bubbles:true}));}});await p.waitForTimeout(900);
assert.deepEqual(await load(),[90,-30],'sliders: 86 snaps to 90, -30 stays');
await p.evaluate(()=>{for(const i of ['sl-rotx','sl-roty']){const s=document.getElementById(i);s.value='0';s.dispatchEvent(new Event('input',{bubbles:true}));s.dispatchEvent(new Event('change',{bubbles:true}));}});await p.waitForTimeout(900);
assert.deepEqual(await load(),[0,0]);
// (2) 2D knobs
const knobsNow=()=>p.evaluate(()=>{const b=__testBoxes.cr,r=document.querySelector('#preview').getBoundingClientRect(),c=Math.cos(b.rot),s=Math.sin(b.rot),at=(x,y)=>({x:r.left+b.cx+x*c-y*s,y:r.top+b.cy+x*s+y*c});return {y:at(b.w/2+20,0),x:at(-b.w/2-20,0)};});
const dragBy=async(pt,dx,dy)=>{await p.mouse.move(pt.x,pt.y);await p.mouse.down();for(let i=1;i<=6;i++)await p.mouse.move(pt.x+dx*i/6,pt.y+dy*i/6);await p.mouse.up();await p.waitForTimeout(900);};
await dragBy((await knobsNow()).y,80,0);assert.deepEqual(await load(),[0,40],'green knob: 80px right -> rotY 40');
await dragBy((await knobsNow()).x,0,-60); // knob positions are re-read: the layout can shift after a save
assert.deepEqual(await load(),[-30,40],'red knob: 60px up -> rotX -30');
// (3) tilted -> drawn by the real layer in 2D
await p.waitForFunction(()=>Editor3D.drawsIn2d('cr'),null,{timeout:60000});
// (4) 3D rotate tool: drag on the selected layer
await p.click('#btn-3d');await p.waitForFunction(()=>Editor3D.isActive()&&Editor3D._test.node('cr'),null,{timeout:20000});await p.waitForTimeout(800);
await p.click('#btn-3d-rotate');await p.waitForTimeout(300);
const ctr=await p.evaluate(()=>{const sc=Editor3D._test.scene(),n=Editor3D._test.node('cr');sc.object3D.updateMatrixWorld(true);const v=new THREE.Vector3();n.object3D.getWorldPosition(v);v.project(sc.camera);const r=sc.canvas.getBoundingClientRect();return {x:r.left+(v.x+1)/2*r.width+24,y:r.top+(1-v.y)/2*r.height+24};}); // inside the blue ring, off the tilt rings' lines: a drag there tilts freely
await dragBy(ctr,-40,20);assert.deepEqual(await load(),[-20,20],'3D drag on the layer: 40px left -> rotY 20, 20px down -> rotX -20');
assert.deepEqual(pageErrors,[],'no page errors');
console.log('PASS rotate-all-axes: sliders with snap, 2D tilt knobs, tilted layer drawn real in 2D, 3D drag-to-tilt');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
