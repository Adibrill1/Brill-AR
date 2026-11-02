const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// On a computer the artwork view stays pinned at the top while the page scrolls under it (as on the phone), its height
// capped so the controls keep room; on a phone the 2D canvas keeps its phone size. Headless Chrome; not Safari.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
const open=async(o)=>{const p=await (await b.newContext(o)).newPage();await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(800);
  const id=await p.evaluate(async()=>{const r=Studio.blankExperience('pinned');r.target={artRect:{x:0,y:0,w:768,h:1024},natural:{w:768,h:1024}};const c=document.createElement('canvas');c.width=768;c.height=1024;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,768,1024);r.assets.__artwork=await new Promise(res=>c.toBlob(res));
    r.elements=[{id:'t',name:'T',type:'text',text:'T',color:'#f00',x:0,y:0,w:.2,rot:0}].map(Studio.normEl);await Studio.save(r);const o=document.createElement('option');o.value=r.id;o.textContent=r.name;document.querySelector('#exp-select').append(o);return r.id;});
  await p.locator('#exp-select').selectOption(id);await p.waitForFunction(()=>parseFloat(document.querySelector('#preview').style.height)>150,{timeout:10000});await p.waitForTimeout(500);return p;};
const p=await open({viewport:{width:1280,height:900}});
const at=()=>p.evaluate(()=>{const r=document.querySelector('#preview').getBoundingClientRect();return {top:r.top,h:r.height,bottom:r.bottom,inStage:!!document.querySelector('#stage #canvas-wrap'),y:scrollY};});
const a0=await at();assert.ok(a0.inStage,'computer: the view sits in the pinned stage');
assert.ok(a0.h<=900*.53+2&&a0.h>300,'computer: its height is capped to about half the screen: '+JSON.stringify(a0));
await p.evaluate(()=>scrollTo(0,document.body.scrollHeight));await p.waitForTimeout(400);const a1=await at();
assert.ok(a1.y>300,'the page scrolled: '+a1.y);assert.ok(a1.top>=0&&a1.top<20&&a1.bottom<=900,'computer: the view stays at the top while scrolling: '+JSON.stringify(a1));
const hit=await p.evaluate(()=>{const r=document.querySelector('#preview').getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2).id;});assert.equal(hit,'preview','nothing covers the pinned view');
const q=await open({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const ph=await q.evaluate(()=>document.querySelector('#preview').getBoundingClientRect().height);assert.ok(ph<=844*.37+2,'phone: the 2D canvas keeps its phone size (36vh): '+ph);
console.log('PASS editor-desktop-pinned: on a computer the view stays pinned at the top (height capped) while the page scrolls; the phone size is unchanged');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
