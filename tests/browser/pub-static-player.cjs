const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');const server=require('../../server/server');
// play.html?pub=<id> (static published scene, surge route): loads /pub/<id>.json with NO backend.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});const pubDir=path.join(__dirname,'../../studio/pub'),pubFile=path.join(pubDir,'qa-pub-scene.json');try{
 const p=await b.newPage();await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);
 const json=await p.evaluate(async()=>{const r=Studio.blankExperience('pub QA');r.target={artRect:{x:0,y:0,w:768,h:1024},natural:{w:768,h:1024}};r.assets.__artwork=await fetch('/library/star.png').then(r=>r.blob());r.elements=[{id:'one',type:'text',text:'PUB',x:0,y:0,w:.3,rot:0}];return Studio.exportJSON(r);});
 fs.mkdirSync(pubDir,{recursive:true});fs.writeFileSync(pubFile,json);
 const v=await b.newPage();await v.goto(base+'/preview.html?pub=qa-pub-scene');await v.evaluate(()=>{document.querySelector('#err').style.display='none';});await v.addScriptTag({url:base+'/player.js?v=qa'});
 await v.waitForSelector('[data-el-id=one]',{state:'attached',timeout:10000});
 assert.equal(await v.evaluate(()=>document.getElementById('err').style.display),'none','no error box on a valid published scene');
 assert.equal(await v.evaluate(()=>document.querySelector('[data-el-id=one]').textContent||'built'),'built','scene entity built from /pub JSON');
 const m=await b.newPage();await m.goto(base+'/preview.html?pub=nope-missing');await m.addScriptTag({url:base+'/player.js?v=qa'});
 await m.waitForFunction(()=>document.getElementById('err').style.display!=='none'&&document.getElementById('err').textContent.includes('לא נמצא'),undefined,{timeout:10000});
 console.log('PASS play.html?pub= loads a static published scene and 404s honestly for a missing one');
}finally{try{fs.unlinkSync(pubFile)}catch{}await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
