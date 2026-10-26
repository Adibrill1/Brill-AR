const {chromium}=require('playwright-core'),assert=require('assert/strict'),path=require('path'),server=require('../../server/server');
// Visual + functional proof of the rc93 wait/cut toggle in the action editor,
// and of clipDurations capture at model upload (drives wait semantics).
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{const p=await b.newPage({viewport:{width:390,height:844}});await p.goto(base+'/index.html');await p.waitForSelector('#element-list li');await p.locator('#file-model').setInputFiles(path.resolve('tests/fixtures/multiclip.glb'));await p.waitForFunction(()=>document.querySelector('#panel-name').textContent.includes('מודל'));
 let r=await p.evaluate(async()=>Studio.load(document.querySelector('#exp-select').value));
 assert.deepEqual(r.elements.find(e=>e.type==='model').clipDurations,[2,2],'upload captures real clip durations: '+JSON.stringify(r.elements.find(e=>e.type==='model').clipDurations));
 await p.evaluate(()=>{const b=document.querySelector('#shell-tabs [data-tab="motion"]');if(b&&b.offsetParent)b.click()});await p.getByRole('button',{name:'+ רצף',exact:true}).click();await p.getByLabel('סוג פעולה חדשה').selectOption('model');await p.getByRole('button',{name:'+ פעולה על השכבה שנבחרה',exact:true}).click();
 await p.waitForSelector('[aria-label="התנהגות מעבר בין אנימציות"]');
 assert.equal(await p.locator('[aria-label="התנהגות מעבר בין אנימציות"]').inputValue(),'cut','default is cut');
 await p.getByLabel('התנהגות מעבר בין אנימציות').selectOption('wait');
 r=await p.evaluate(async()=>Studio.load(document.querySelector('#exp-select').value));
 assert.equal(r.actionSequences[0].actions[0].to.mode,'wait','wait persists');
 await p.getByLabel('התנהגות מעבר בין אנימציות').selectOption('cut');
 r=await p.evaluate(async()=>Studio.load(document.querySelector('#exp-select').value));
 assert.equal(r.actionSequences[0].actions[0].to.mode,undefined,'cut keeps exports clean (mode absent)');
 await p.getByLabel('התנהגות מעבר בין אנימציות').selectOption('wait');
 await p.locator('.action-details').screenshot({path:'/downloads/action-model-waitcut-390.png'});
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow at 390px');
 console.log('PASS wait/cut UI at 390px: toggle persists wait, cut stays the clean default, upload captures clipDurations');
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
