const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// "הגלריה שלי": every creation as a card (newest first, artwork thumbnail, layers and date, the open one marked). From
// there: open (the work view comes back on that creation), rename (Enter saves, Escape cancels; the open one's name box
// follows), duplicate (a separate copy), delete (asks first; deleting the open one moves to another), and a new
// creation. A tab on the phone, a header button on the computer. Headless Chrome; not an iPhone.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
for(const phone of [true,false]){
const ctx=await b.newContext(phone?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1280,height:900}});const p=await ctx.newPage();const pageErrors=[];p.on('pageerror',e=>pageErrors.push(String(e)));const tag=phone?'phone':'computer';
let answer=true;p.on('dialog',d=>answer?d.accept():d.dismiss());
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(800);
const [A,B]=await p.evaluate(async()=>{const a=Studio.blankExperience('גלריה א');a.target={artRect:{x:0,y:0,w:300,h:400},natural:{w:300,h:400}};
  const c=document.createElement('canvas');c.width=300;c.height=400;const g=c.getContext('2d');g.fillStyle='#ff0000';g.fillRect(0,0,300,400);a.assets.__artwork=await new Promise(res=>c.toBlob(res));
  a.elements=[{id:'t1',name:'T1',type:'text',text:'hi',color:'#000000',x:0,y:0,w:.3,rot:0}];a.elements.forEach(Studio.normEl);
  const bb=Studio.blankExperience('גלריה ב');await Studio.save(a);await new Promise(r=>setTimeout(r,20));await Studio.save(bb);return [a.id,bb.id];});
const sel=()=>p.evaluate(()=>document.querySelector('#exp-select').value);
const tab=()=>p.evaluate(()=>document.body.dataset.tab);
const card=(id)=>p.locator('.gallery-card[data-id="'+id+'"]');
const stored=(id)=>p.evaluate(id=>Studio.load(id),id);
const openGallery=async()=>{if(phone)await p.locator('#shell-tabs [data-tab="gallery"]').click();else await p.locator('#btn-gallery').click();await p.waitForTimeout(600);};
if(phone)assert.equal(await p.locator('#btn-gallery').isVisible(),false,tag+': no header button on the phone (it has the tab)');
await openGallery();
assert.equal(await tab(),'gallery',tag+': gallery open');assert.ok(await p.locator('#sec-gallery').isVisible(),tag+': gallery shown');
assert.equal(await p.locator('#stage').isVisible(),false,tag+': the canvas is out of the way');
const all=await p.evaluate(()=>Studio.all().then(l=>l.length));assert.equal(await p.locator('.gallery-card').count(),all,tag+': a card for every creation');
assert.equal(await p.locator('.gallery-card').first().getAttribute('data-id'),B,tag+': newest first');
assert.equal(await card(A).locator('img.g-thumb').count(),1,tag+': artwork thumbnail');assert.equal(await card(B).locator('.g-thumb.empty').count(),1,tag+': placeholder without artwork');
assert.ok((await card(A).locator('.g-meta').textContent()).includes('שכבה אחת'),tag+': layer count');
const cur=await sel();assert.ok(await card(cur).evaluate(e=>e.classList.contains('current')),tag+': the open one is marked');
// rename another creation: Enter saves; Escape cancels
await card(B).locator('[data-act="rename"]').click();await card(B).locator('.g-name input').fill('שם חדש');await card(B).locator('.g-name input').press('Enter');await p.waitForTimeout(600);
assert.equal((await stored(B)).name,'שם חדש',tag+': renamed in storage');assert.equal(await card(B).locator('.g-name').textContent(),'שם חדש',tag+': and on the card');
assert.ok(await p.evaluate(B=>[...document.querySelectorAll('#exp-select option')].some(o=>o.value===B&&o.textContent.includes('שם חדש')),B),tag+': and in the list');
await card(B).locator('[data-act="rename"]').click();await card(B).locator('.g-name input').fill('לא');await card(B).locator('.g-name input').press('Escape');await p.waitForTimeout(500);
assert.equal((await stored(B)).name,'שם חדש',tag+': Escape keeps the name');
// rename the open one: its name box follows
await card(cur).locator('[data-act="rename"]').click();await card(cur).locator('.g-name input').fill('הפתוחה');await card(cur).locator('.g-name input').press('Enter');await p.waitForTimeout(900);
assert.equal((await stored(cur)).name,'הפתוחה',tag+': open one renamed');assert.equal(await p.locator('#in-exp-name').inputValue(),'הפתוחה',tag+': name box follows');
// duplicate: a separate copy with the same layers
await card(A).locator('[data-act="dup"]').click();await p.waitForTimeout(800);
assert.equal(await p.locator('.gallery-card').count(),all+1,tag+': one more card');
const copy=await p.evaluate(async A=>{const l=await Studio.all();return l.find(r=>r.name==='גלריה א (עותק)'&&r.id!==A);},A);
assert.ok(copy&&copy.elements.length===1&&copy.assets.__artwork,tag+': the copy has the layers and artwork');
// delete: dismiss keeps it; accept removes it, the open one stays open
answer=false;await card(B).locator('[data-act="del"]').click();await p.waitForTimeout(500);assert.ok(await stored(B),tag+': cancel keeps it');
answer=true;await card(B).locator('[data-act="del"]').click();await p.waitForTimeout(700);
assert.ok(!(await stored(B)),tag+': deleted');assert.equal(await card(B).count(),0,tag+': card gone');assert.equal(await sel(),cur,tag+': the open one stays');
// open by tapping the picture: back to work on that creation
await card(A).locator('.g-thumb').click();await p.waitForTimeout(1200);
assert.equal(await sel(),A,tag+': opened');assert.equal(await tab(),'layers',tag+': work view (layers, it has artwork)');
assert.equal(await p.locator('#in-exp-name').inputValue(),'גלריה א',tag+': its name');assert.ok(await p.locator('#stage').isVisible(),tag+': canvas back');
// delete the open one from the gallery: another opens, the gallery stays
await openGallery();await card(A).locator('[data-act="del"]').click();await p.waitForTimeout(1200);
assert.ok(!(await stored(A)),tag+': open one deleted');assert.notEqual(await sel(),A,tag+': another one is open');assert.equal(await tab(),'gallery',tag+': still in the gallery');
assert.equal(await p.locator('.gallery-card.current').count(),1,tag+': and it is marked');
// a new creation from the gallery: work view, at the start (no artwork yet)
const n0=await p.locator('.gallery-card').count();await p.locator('#btn-gallery-new').click();await p.waitForTimeout(1000);
assert.equal(await tab(),'create',tag+': new creation opens at the start');assert.equal(await p.evaluate(()=>Studio.all().then(l=>l.length)),n0+1,tag+': saved');
assert.deepEqual(pageErrors,[],tag+': no page errors');await ctx.close();}
console.log('PASS gallery: phone tab and computer button; cards newest first with thumbnail/layers/current; rename (Enter/Escape, open one follows); duplicate; delete (cancel, other, open one); open; new');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
