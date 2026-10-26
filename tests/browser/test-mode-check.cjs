// Check tab: test mode shortcut FORWARDS to the real #btn-test-mode (no second state); label/state mirrored.
const {chromium}=require('playwright-core'),assert=require('assert/strict'),server=require('../../server/server');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const b=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
try{const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
await p.goto(base+'/index.html');await p.waitForSelector('#element-list li');
await p.getByRole('button',{name:'בדיקה ושמירה'}).click();
const px=p.locator('#btn-test-mode-check');assert(await px.isVisible());assert.equal(await px.textContent(),'מצב בדיקה');
await px.click();await p.waitForTimeout(300);
const real=await p.evaluate(()=>({t:document.getElementById('btn-test-mode').textContent,c:document.getElementById('btn-test-mode').className}));
assert.equal(real.t,'חזרה לעריכה');assert(real.c.includes('on'));
assert.equal(await px.textContent(),'חזרה לעריכה');assert.equal(await px.getAttribute('aria-pressed'),'true');
await px.click();await p.waitForTimeout(300);
assert.equal(await px.textContent(),'מצב בדיקה');assert.equal(await px.getAttribute('aria-pressed'),'false');
console.log('PASS test-mode-check');}finally{await b.close();server.close();}})().catch(e=>{console.error(e);process.exit(1)});
