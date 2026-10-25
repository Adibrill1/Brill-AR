const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');const server=require('../../server/server');
// play.html?pub=<id> / preview.html?pub=<id> (static published scene, surge route), no backend.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});const pubDir=path.join(__dirname,'../../studio/pub'),pubFile=path.join(pubDir,'qa-pub-scene.json'),badFile=path.join(pubDir,'qa-pub-evil.json');try{
 const p=await b.newPage();await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);
 const json=await p.evaluate(async()=>{const r=Studio.blankExperience('pub QA');r.target={artRect:{x:0,y:0,w:768,h:1024},natural:{w:768,h:1024}};r.assets.__artwork=await fetch('/library/star.png').then(r=>r.blob());r.elements=[{id:'one',type:'text',text:'PUB',x:0,y:0,w:.3,rot:0}];return Studio.exportJSON(r);});
 fs.mkdirSync(pubDir,{recursive:true});fs.writeFileSync(pubFile,json);
 const evil=JSON.parse(json);evil.id='qa-pub-evil';evil.elements[0].onTap='link';evil.elements[0].tapUrl='javascript:window.__xss=1';fs.writeFileSync(badFile,JSON.stringify(evil));
 // AR player route: builds the scene from /pub JSON and must NOT persist into viewer storage
 const v=await b.newPage();await v.goto(base+'/preview.html?pub=qa-pub-scene');await v.evaluate(()=>{document.querySelector('#err').style.display='none';});await v.addScriptTag({url:base+'/player.js?v=qa'});
 await v.waitForSelector('[data-el-id=one]',{state:'attached',timeout:10000});
 assert.equal(await v.evaluate(()=>document.getElementById('err').style.display),'none','no error box on a valid published scene');
 assert.equal(await v.evaluate(async()=>(await Studio.all()).some(r=>r.name==='pub QA')),false,'viewing a published scene must not import it into the viewer\'s local editor storage');
 // camera-free preview route on preview.html itself (previewer.js pub branch)
 const c=await b.newPage();await c.goto(base+'/preview.html?pub=qa-pub-scene');
 await c.waitForSelector('[data-el-id=one]',{state:'attached',timeout:10000});
 assert.equal(await c.evaluate(async()=>(await Studio.all()).some(r=>r.name==='pub QA')),false,'camera-free preview must not persist either');
 assert.equal(await c.evaluate(()=>document.getElementById('topbar-edit-toggle')==null),true,'no edit toggle for pub viewers');
 // play.html camera-free link + hidden editor backlink for pub viewers
 const pl=await b.newPage();await pl.goto(base+'/play.html?pub=qa-pub-scene');
 assert.equal(await pl.evaluate(()=>{const a=document.getElementById('camfree');return !a.hidden&&a.getAttribute('href');}),'preview.html?pub=qa-pub-scene','camera-free link offered on the AR page');
 assert.equal(await pl.evaluate(()=>document.getElementById('backlink').hidden),true,'editor backlink hidden for pub viewers');
 // missing id -> honest not-found
 const m=await b.newPage();await m.goto(base+'/preview.html?pub=nope-missing');await m.addScriptTag({url:base+'/player.js?v=qa'});
 await m.waitForFunction(()=>document.getElementById('err').style.display!=='none'&&document.getElementById('err').textContent.includes('לא נמצא'),undefined,{timeout:10000});
 // traversal / bad ids never reach fetch
 const t=await b.newPage();await t.goto(base+'/preview.html?pub=..%2f..%2findex');await t.addScriptTag({url:base+'/player.js?v=qa'});
 await t.waitForFunction(()=>document.getElementById('err').textContent.includes('קישור לא תקין'),undefined,{timeout:10000});
 // javascript: tapUrl in a published JSON is refused at import
 const x=await b.newPage();await x.goto(base+'/preview.html?pub=qa-pub-evil');await x.addScriptTag({url:base+'/player.js?v=qa'});
 await x.waitForFunction(()=>document.getElementById('err').style.display!=='none',undefined,{timeout:10000});
 assert.equal(await x.evaluate(()=>window.__xss||0),0,'javascript: tap url never executes');
 console.log('PASS pub static routes: build, no-persist, camera-free link, honest 404, path guard, tap-url scheme guard');
}finally{for(const f of [pubFile,badFile])try{fs.unlinkSync(f)}catch{}await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
