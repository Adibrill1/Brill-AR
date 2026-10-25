const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Acceptance (user request): a small "3D" button by the editing workspace opens the
// on-screen preview; the 3D view offers element editing and a way back. Phone-width
// touch: the button is fully visible without scrolling past the canvas, the flow
// works by tap, edits from the 3D view persist when returning to the editor.
// Artivive Bridge reference: a 2D/3D pill at the bottom center of the viewport.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
 const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const p=await ctx.newPage();
 await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);
 const blankId=await p.evaluate(async()=>{const r=Studio.blankExperience('no art');await Studio.save(r);const opt=document.createElement('option');opt.value=r.id;opt.textContent=r.name;document.querySelector('#exp-select').append(opt);return r.id;});
 await p.locator('#exp-select').selectOption(blankId);await p.waitForTimeout(150);
 assert.ok(await p.locator('#btn-3d').isHidden(),'3D button hidden without artwork');
 const id=await p.evaluate(async()=>{const r=Studio.blankExperience('3d btn');r.target={artRect:{x:0,y:0,w:768,h:1024},natural:{w:768,h:1024}};const c=document.createElement('canvas');c.width=768;c.height=1024;const g=c.getContext('2d');g.fillStyle='#ffffff';g.fillRect(0,0,768,1024);r.assets.__artwork=await new Promise(res=>c.toBlob(res));r.elements=[{id:'t1',name:'T',type:'text',text:'I',color:'#0000ff',x:0,y:0,w:.2,rot:0}];await Studio.save(r);const opt=document.createElement('option');opt.value=r.id;opt.textContent=r.name;document.querySelector('#exp-select').append(opt);return r.id;});
 await p.locator('#exp-select').selectOption(id);await p.waitForTimeout(250);
 assert.ok(await p.locator('#btn-3d').isHidden(),'3D button hidden while the workspace is off-screen');
 await p.waitForFunction(()=>parseFloat(document.querySelector('#preview').style.height)>300,{timeout:10000});
 await p.evaluate(()=>{const w=document.querySelector('#canvas-wrap');scrollTo(0,w.getBoundingClientRect().top+scrollY-8);});await p.waitForTimeout(300);
 const btn=await p.locator('#btn-3d').boundingBox(),wrap=await p.locator('#canvas-wrap').boundingBox();
 assert.ok(btn,'3D button visible with artwork on screen');
 assert.strictEqual((await p.locator('#btn-3d').textContent()).trim(),'3D','button labeled 3D');
 assert.ok(btn.width<=90&&btn.height<=44,'button is small: '+JSON.stringify(btn));
 assert.ok(btn.y>=0&&btn.y+btn.height<=844,'ENTIRE button visible on phone screen without scrolling: '+JSON.stringify(btn));
 assert.ok(btn.x>=wrap.x-1&&btn.x+btn.width<=wrap.x+wrap.width+1,'button centered over the editing workspace horizontally');
 assert.ok(btn.y>=wrap.y-1&&btn.y+btn.height<=wrap.y+wrap.height+1,'button over the workspace while it is on screen');
 await p.waitForTimeout(150);await p.screenshot({path:'/downloads/rc61-editor-3d-button.png'});
 await p.tap('#btn-3d');
 await p.waitForURL(u=>u.pathname.endsWith('/preview.html')&&u.hash.length>1,{timeout:15000});
 assert.ok(!new URL(p.url()).searchParams.has('edit'),'3D button opens the on-screen preview, not edit mode');
 await p.waitForSelector('#topbar-edit-toggle',{timeout:20000});
 assert.strictEqual((await p.locator('#topbar-edit-toggle').textContent()).trim(),'✏️ עריכה','preview offers editing');
 await p.tap('#topbar-edit-toggle');
 await p.waitForURL(u=>u.searchParams.get('edit')==='1',{timeout:15000});
 await p.waitForSelector('#camera-edit-panel',{timeout:20000});
 assert.strictEqual((await p.locator('#topbar-edit-toggle').textContent()).trim(),'👁 תצוגה','edit mode offers way back to view');
 await p.locator('#camera-edit-select').selectOption('t1');await p.waitForTimeout(400);
 await p.screenshot({path:'/downloads/rc61-3d-edit-mode.png'});
 await p.locator('#camera-edit-x').fill('0.3');await p.locator('#camera-edit-x').press('Tab');
 await p.tap('#camera-edit-save');await p.waitForFunction(()=>document.querySelector('#camera-edit-status').textContent.includes('נשמר'),{timeout:10000});
 await p.tap('#topbar a[href^="index.html"]');
 await p.waitForSelector('#exp-select',{timeout:15000});await p.waitForTimeout(300);
 const saved=await p.evaluate(id=>Studio.load(id).then(r=>({x:r.elements[0].x,sel:document.querySelector('#exp-select').value===id})),id);
 assert.ok(Math.abs(saved.x-0.3)<1e-6,'edit from the 3D view persists after returning to the editor: x='+saved.x);
 assert.ok(saved.sel,'return lands on the same experience');
 // tall canvas on desktop: the pill pins to the viewport bottom while scrolling the workspace
 await p.setViewportSize({width:1280,height:720});await p.waitForTimeout(250);
 await p.evaluate(()=>{const w=document.querySelector('#canvas-wrap');scrollTo(0,w.getBoundingClientRect().top+scrollY-8);});await p.waitForTimeout(250);
 const b2=await p.locator('#btn-3d').boundingBox();
 assert.ok(b2&&b2.y>=0&&b2.y+b2.height<=720,'tall workspace: ENTIRE button pinned visible: '+JSON.stringify(b2));
 await p.screenshot({path:'/downloads/rc61-editor-3d-desktop.png'});
 console.log('PASS phone-width: 3D button fully visible, tap flow, edit from 3D view persists on return; tall-canvas pin ok');
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
