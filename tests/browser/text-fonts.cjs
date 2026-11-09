// Text layers: the font picker lists the Hebrew fonts; a chosen font is fetched only when used (and no other), saved as
// one undo step, and the layer re-measured in it; cut letters look the same on every redraw for one layer and shuffle
// count, change on shuffle, hide the font/colour/bold row, and draw in the camera-free preview with their fonts; every
// font file loads and every licence is served.
const {chromium}=require('playwright-core'),assert=require('assert/strict'),server=require('../../server/server');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});try{
const ctx=await b.newContext({viewport:{width:1000,height:1000}}),p=await ctx.newPage(),errs=[],fontReqs=[];p.on('pageerror',e=>errs.push(String(e)));p.on('request',r=>{if(r.url().includes('/fonts/'))fontReqs.push(r.url().split('/fonts/')[1]);});
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(800);
assert.deepEqual(fontReqs,[],'no font is fetched before a text layer uses one');
await p.click('#btn-text');await p.waitForFunction(()=>document.querySelector('#panel-name').textContent.includes('טקסט'));
const opts=await p.$$eval('#sel-font option',o=>o.map(x=>x.value));assert.equal(opts.length,12,'device font + 11 Hebrew fonts');assert.equal(opts[0],'');
const id=await p.evaluate(()=>document.querySelector('#exp-select').value);
const saved=()=>p.evaluate(async id=>{const r=await Studio.load(id),el=r.elements.filter(e=>e.type==='text').pop();return {id:el.id,font:el.font,textStyle:el.textStyle,cutSeed:el.cutSeed,aspect:el.aspect,drawn:(await Studio.loadTextFonts(el),Studio.drawTextCanvas(el,64).aspect)};},id);
const before=await saved();
await p.selectOption('#sel-font','frank');await p.waitForFunction(()=>document.fonts.check('700 32px "BA frank"','כותרת חדשה'));await p.waitForTimeout(1000);
let s=await saved();assert.equal(s.font,'frank');assert.ok(Math.abs(s.aspect-before.aspect)>before.aspect*0.01,'re-measured in the new font');
assert.ok(Math.abs(s.drawn-s.aspect)<=s.aspect*0.006,'the saved height fits the text drawn in its font');
assert.ok(fontReqs.length>0&&fontReqs.every(f=>f.startsWith('frank-')),'only the chosen font is fetched: '+fontReqs);
await p.click('#btn-undo');await p.waitForTimeout(900);s=await saved();assert.equal(s.font,undefined,'one undo step takes the font back off');
await p.click('#btn-redo');await p.waitForTimeout(900);s=await saved();assert.equal(s.font,'frank');
if(await p.locator('#row-text').isHidden())await p.locator('#element-list li',{hasText:'טקסט'}).last().click();
await p.selectOption('#sel-text-style','cut');await p.waitForFunction(()=>document.fonts.check('700 32px "BA suez"','כותרת חדשה'));await p.waitForTimeout(1000);
s=await saved();assert.equal(s.textStyle,'cut');assert.ok(Math.abs(s.drawn-s.aspect)<=s.aspect*0.006,'cut letters measured with their fonts');
assert.equal(await p.locator('#btn-cut-shuffle').isVisible(),true);assert.equal(await p.locator('#sel-font').isVisible(),false,'the cut letters pick their own fonts and colours');
const look=()=>p.evaluate(async id=>{const r=await Studio.load(id),el=r.elements.filter(e=>e.type==='text').pop();await Studio.loadTextFonts(el);return Studio.drawTextCanvas(el,64).canvas.toDataURL();},id);
const l1=await look();assert.equal(await look(),l1,'the same look on every redraw');
await p.click('#btn-cut-shuffle');await p.waitForTimeout(900);s=await saved();assert.equal(s.cutSeed,1);assert.notEqual(await look(),l1,'shuffle changes the look');
console.log('PASS editor: font picker, fetch on use (only that font), re-measure, undo/redo, cut letters fixed per seed and shuffled');
const q=await ctx.newPage();q.on('pageerror',e=>errs.push(String(e)));await q.goto(base+'/preview.html#'+id);
await q.waitForFunction(tid=>{const m=document.querySelector('[data-el-id="'+tid+'"]')?.getObject3D('mesh');return !!(m&&m.material&&m.material.map&&m.material.map.image);},s.id,{timeout:30000});
await q.waitForFunction(()=>['heebo','suez','frank','karantina'].every(f=>document.fonts.check('700 32px "BA '+f+'"','כותרת חדשה')),null,{timeout:20000});
console.log('PASS camera-free preview draws the cut letters with their fonts');
const faces=await p.evaluate(async()=>{const fs=[...document.fonts].filter(f=>/^"?BA /.test(f.family));await Promise.all(fs.map(f=>f.load().catch(()=>{})));return fs.map(f=>f.family+' '+f.weight+' '+f.status);});
assert.equal(faces.length,28);assert.deepEqual(faces.filter(f=>!f.endsWith('loaded')),[],'every font file loads');
for(const f of await p.evaluate(()=>Studio.FONTS.map(f=>f.id))){const r=await p.request.get(base+'/fonts/OFL/'+f+'.txt');assert.equal(r.status(),200,f);assert.ok((await r.text()).includes('SIL Open Font License'),f);}
console.log('PASS 28 font files load and 11 OFL licences are served');
assert.deepEqual(errs,[]);
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
