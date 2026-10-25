const {chromium}=require('playwright-core'),assert=require('node:assert/strict');
// Acceptance: unified 2D/3D workspace (Artivive Bridge pattern: one editor, a 2D/3D
// pill at the bottom center of the editing viewport). The 3D mode shows the same
// composition in place, selection is linked to the element list/panel, and the
// on-object move arrows edit the element's position for real (saved + panel sync).
(async()=>{const base='https://star-burst-ar-studio.surge.sh',b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
 const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const p=await ctx.newPage();
 await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);
 const id=await p.evaluate(async()=>{const r=Studio.blankExperience('unified 3d');r.target={artRect:{x:0,y:0,w:768,h:1024},natural:{w:768,h:1024}};const c=document.createElement('canvas');c.width=768;c.height=1024;const g=c.getContext('2d');g.fillStyle='#ffffff';g.fillRect(0,0,768,1024);r.assets.__artwork=await new Promise(res=>c.toBlob(res));r.elements=[{id:'t1',name:'T',type:'text',text:'I',color:'#0000ff',x:0,y:0,w:.2,rot:0},{id:'t2',name:'U',type:'text',text:'U',color:'#ff0000',x:0.25,y:0.25,w:.2,rot:0}];await Studio.save(r);const opt=document.createElement('option');opt.value=r.id;opt.textContent=r.name;document.querySelector('#exp-select').append(opt);return r.id;});
 await p.locator('#exp-select').selectOption(id);
 await p.waitForFunction(()=>parseFloat(document.querySelector('#preview').style.height)>300,{timeout:10000});
 await p.evaluate(()=>{const w=document.querySelector('#canvas-wrap');scrollTo(0,w.getBoundingClientRect().top+scrollY-8);});await p.waitForTimeout(300);
 assert.ok(await p.locator('#view-pill').isVisible(),'pill visible with artwork on screen');
 assert.ok(await p.locator('#btn-2d.on').count()===1,'2D active by default');
 assert.strictEqual((await p.locator('#btn-3d').textContent()).trim(),'3D','3D segment label');
 const pillBox=await p.locator('#view-pill').boundingBox();
 assert.ok(pillBox.y>=0&&pillBox.y+pillBox.height<=844,'ENTIRE pill visible without scrolling: '+JSON.stringify(pillBox));
 await p.tap('#btn-3d');
 await p.waitForSelector('[data-el-root]',{state:'attached',timeout:20000});
 assert.ok(await p.locator('#btn-3d.on').count()===1,'3D active after tap');
 assert.ok(await p.evaluate(()=>getComputedStyle(document.querySelector('#preview')).visibility==='hidden'),'2D canvas hidden in 3D mode');
 assert.strictEqual(await p.locator('[data-el-root]').count(),2,'both elements rendered in the 3D workspace');
 // project a world point to screen pixels
 const proj=async(fn)=>p.evaluate(fn);
 const clickAt=async(elId)=>{
   const pt=await p.evaluate(elId=>{const n=Editor3D._test.node(elId);const v=new THREE.Vector3();n.object3D.getWorldPosition(v);v.project(Editor3D._test.scene().camera);const r=Editor3D._test.scene().canvas.getBoundingClientRect();return {x:r.left+(v.x+1)/2*r.width,y:r.top+(-v.y+1)/2*r.height};},elId);
   return pt;
 };
 await p.waitForTimeout(800);
 const t1pt=await clickAt('t1');
 await p.mouse.click(t1pt.x,t1pt.y);await p.waitForTimeout(300);
 assert.ok((await p.locator('#element-list li.sel').textContent()).includes('T'),'tapping the element in 3D selects it in the list');
 assert.strictEqual(await p.evaluate(()=>document.querySelector('#exp-select').value),id);
 // drag the X arrow of the gizmo: selection must be t1 already
 const tip=await p.evaluate(()=>{const g=Editor3D._test.gizmo();const cone=g.children[0].children[1];const v=new THREE.Vector3();cone.getWorldPosition(v);v.project(Editor3D._test.scene().camera);const r=Editor3D._test.scene().canvas.getBoundingClientRect();return {x:r.left+(v.x+1)/2*r.width,y:r.top+(-v.y+1)/2*r.height};});
 await p.mouse.move(tip.x,tip.y);await p.mouse.down();await p.mouse.move(tip.x+60,tip.y,{steps:6});await p.mouse.up();await p.waitForTimeout(400);
 const after=await p.evaluate(id=>Studio.load(id).then(r=>r.elements.find(e=>e.id==='t1').x),id);
 assert.ok(after>0.05,'dragging the X arrow moved the element right and saved: x='+after);
 assert.ok(Math.abs(parseFloat(await p.locator('#num-x').inputValue())-after)<0.02,'panel synced to the gizmo edit');
 await p.screenshot({path:'/downloads/live62-unified-3d.png'});
 // back to 2D: canvas visible again, same composition
 await p.tap('#btn-2d');await p.waitForTimeout(300);
 assert.ok(await p.evaluate(()=>getComputedStyle(document.querySelector('#preview')).visibility==='visible'),'2D canvas back');
 assert.ok(await p.locator('#btn-2d.on').count()===1,'2D active again');
 const still=await p.evaluate(id=>Studio.load(id).then(r=>r.elements.find(e=>e.id==='t1').x),id);
 assert.ok(Math.abs(still-after)<1e-9,'position kept across view switch');
 console.log('PASS unified 2D/3D workspace: pill toggle, linked selection, move arrows edit and persist');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
