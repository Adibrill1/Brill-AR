const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Acceptance (user request): a small "3D" button sits on the editing workspace and
// opens the on-screen preview; the 3D view offers element editing (toggle to edit
// mode) and a way back to view mode. Artivive Bridge reference: its editor has a
// "3D" button (bottom center) switching 2D->3D where elements are manipulated in 3D.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{const p=await b.newPage();await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);
 // blank experience without artwork: the button stays hidden
 const blankId=await p.evaluate(async()=>{const r=Studio.blankExperience('no art');await Studio.save(r);const opt=document.createElement('option');opt.value=r.id;opt.textContent=r.name;document.querySelector('#exp-select').append(opt);return r.id;});
 await p.locator('#exp-select').selectOption(blankId);await p.waitForTimeout(150);
 assert.ok(await p.locator('#btn-3d').isHidden(),'3D button hidden without artwork');
 // experience with artwork + one element
 const id=await p.evaluate(async()=>{const r=Studio.blankExperience('3d btn');r.target={artRect:{x:0,y:0,w:768,h:1024},natural:{w:768,h:1024}};const c=document.createElement('canvas');c.width=768;c.height=1024;const g=c.getContext('2d');g.fillStyle='#ffffff';g.fillRect(0,0,768,1024);r.assets.__artwork=await new Promise(res=>c.toBlob(res));r.elements=[{id:'t1',name:'T',type:'text',text:'I',color:'#0000ff',x:0,y:0,w:.2,rot:0}];await Studio.save(r);const opt=document.createElement('option');opt.value=r.id;opt.textContent=r.name;document.querySelector('#exp-select').append(opt);return r.id;});
 await p.locator('#exp-select').selectOption(id);await p.waitForTimeout(200);
 const btn=await p.locator('#btn-3d').boundingBox(),wrap=await p.locator('#canvas-wrap').boundingBox();
 assert.ok(btn,'3D button visible with artwork');
 assert.strictEqual((await p.locator('#btn-3d').textContent()).trim(),'3D','button labeled 3D');
 assert.ok(btn.width<=70&&btn.height<=40,'button is small: '+JSON.stringify(btn));
 assert.ok(btn.x>=wrap.x&&btn.x+btn.width<=wrap.x+wrap.width+1&&btn.y>=wrap.y&&btn.y+btn.height<=wrap.y+wrap.height+1,'button sits on the editing workspace');
 await p.locator('#preview').scrollIntoViewIfNeeded();await p.screenshot({path:'/downloads/rc60-editor-3d-button.png'});
 await p.locator('#btn-3d').click();
 await p.waitForURL(u=>u.pathname.endsWith('/preview.html')&&u.hash.length>1,{timeout:15000});

 assert.ok(!new URL(p.url()).searchParams.has('edit'),'3D button opens the on-screen preview, not edit mode');
 await p.waitForSelector('#topbar-edit-toggle',{timeout:20000});
 await p.waitForTimeout(2500);await p.screenshot({path:'/downloads/rc60-preview-edit-toggle.png'});
 assert.strictEqual((await p.locator('#topbar-edit-toggle').textContent()).trim(),'✏️ עריכה','preview offers editing');
 await p.locator('#topbar-edit-toggle').click();
 await p.waitForURL(u=>u.searchParams.get('edit')==='1',{timeout:15000});
 await p.waitForSelector('#camera-edit-panel',{timeout:20000});
 assert.strictEqual((await p.locator('#topbar-edit-toggle').textContent()).trim(),'👁 תצוגה','edit mode offers way back to view');
 await p.locator('#camera-edit-select').selectOption('t1');
 await p.locator('#camera-edit-x').fill('0.3');await p.locator('#camera-edit-x').press('Tab');
 await p.locator('#camera-edit-save').click();await p.waitForTimeout(300);
 const saved=await p.evaluate(id=>Studio.load(id).then(r=>r.elements[0].x),id);
 assert.ok(Math.abs(saved-0.3)<1e-6,'element edited from the 3D view and saved: x='+saved);
 await p.locator('#topbar-edit-toggle').click();
 await p.waitForURL(u=>!u.searchParams.has('edit')&&u.pathname.endsWith('/preview.html'),{timeout:15000});
 console.log('PASS 3D button on workspace opens on-screen preview; 3D view edits elements and toggles back');
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
