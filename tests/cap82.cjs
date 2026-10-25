const {chromium}=require('playwright-core');
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const p=await ctx.newPage();
await p.goto('https://star-burst-ar-studio.surge.sh/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);
// rename the demo experience to exercise the new field on live
await p.locator('#in-exp-name').fill('ניסוי ראשון שלי');await p.locator('#in-exp-name').press('Tab');
await p.waitForTimeout(600);
await p.locator('#sec-exp').scrollIntoViewIfNeeded();await p.waitForTimeout(300);
await p.screenshot({path:'/downloads/rc82-live-rename-390.png'});
const overflow1=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,iw:innerWidth}));
// publish box full-viewport
await p.locator('#publish-box').scrollIntoViewIfNeeded();await p.waitForTimeout(400);
await p.screenshot({path:'/downloads/rc82-live-publish-390.png'});
const box=await p.evaluate(()=>{const r=document.querySelector('#publish-box').getBoundingClientRect();return {left:r.left,right:r.right,vw:innerWidth,sw:document.documentElement.scrollWidth};});
console.log(JSON.stringify({overflow1,box}));
await b.close();})().catch(e=>{console.error(e);process.exit(1)});
