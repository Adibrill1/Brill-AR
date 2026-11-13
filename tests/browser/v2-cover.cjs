const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Gallery cover picture ("תמונת שער"): from the card's menu she picks her own picture; it is made small (about 800 px on
// the long side) and shows on that card only. The camera still looks for the artwork: the editor, the preview and the
// published JSON keep using the artwork and never carry the cover. "לחזור לתמונת היצירה" removes it; a duplicate and a
// backup (ZIP) keep it. Phone size, touch. Headless Chrome; not an iPhone.
const SHOTS='/Users/adibrill/Desktop/brill-ar-work/wt-tools2-shots/';
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
  const ctx=await b.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
  const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined'&&typeof App!=='undefined');
  const {id,cover}=await p.evaluate(async()=>{
    const blob=(w,h,paint,type)=>{const c=document.createElement('canvas');c.width=w;c.height=h;paint(c.getContext('2d'),w,h);return new Promise(r=>c.toBlob(r,type||'image/png'));};
    const mk=async(name,color)=>{const a=Studio.blankExperience(name);a.target={artRect:{x:0,y:0,w:300,h:400},natural:{w:300,h:400}};
      a.assets.__artwork=await blob(300,400,(g)=>{g.fillStyle=color;g.fillRect(0,0,300,400);});a.elements=[];await Studio.save(a);return a.id;};
    await mk('בלי שער','#3a6a3a');const id=await mk('הפרחים של אדי','#204080');
    // her picture: big and wide, red with a yellow sun, so it is easy to tell from the blue artwork
    const big=await blob(2400,1600,(g,w,h)=>{g.fillStyle='#d01818';g.fillRect(0,0,w,h);g.fillStyle='#ffd000';g.beginPath();g.arc(w/2,h/2,h/3,0,7);g.fill();},'image/jpeg');
    const buf=new Uint8Array(await big.arrayBuffer());let s='';for(let i=0;i<buf.length;i+=0x8000)s+=String.fromCharCode.apply(null,buf.subarray(i,i+0x8000));
    return {id,cover:btoa(s)};});
  await p.goto(base+'/index.html#/');await p.waitForSelector('.card');await p.waitForTimeout(300);
  const card=()=>p.locator('.card',{hasText:'הפרחים של אדי'}).filter({hasNotText:'(עותק)'});
  const menuOf=async()=>{await card().locator('.card-more').click();await p.waitForTimeout(200);};
  const items=()=>p.locator('.menu-item').allTextContents();

  // the menu offers to choose a cover; no "back to the artwork" yet
  await menuOf();let m=await items();
  assert.ok(m.includes('לבחור תמונת שער'),'the card menu offers "לבחור תמונת שער"');assert.ok(!m.includes('לחזור לתמונת היצירה'),'no "back" before a cover is set');
  const [fc]=await Promise.all([p.waitForEvent('filechooser'),p.locator('.menu-item',{hasText:'לבחור תמונת שער'}).click()]);
  assert.equal(await fc.element().getAttribute('accept'),'image/*','pictures only');assert.equal(await fc.element().getAttribute('capture'),null,'no camera forced');
  await fc.setFiles({name:'cover.jpg',mimeType:'image/jpeg',buffer:Buffer.from(cover,'base64')});
  await p.waitForSelector('.card img[data-cover="1"]',{timeout:10000});await p.waitForTimeout(300);
  const st=await p.evaluate(async(id)=>{const r=await Studio.load(id);const bm=await createImageBitmap(r.assets.__cover),am=await createImageBitmap(r.assets.__artwork);
    return {w:bm.width,h:bm.height,size:r.assets.__cover.size,art:[am.width,am.height],els:r.elements.length};},id);
  assert.deepEqual([st.w,st.h],[800,533],'made small: 800 px on the long side ('+st.w+'x'+st.h+')');
  assert.ok(st.size<200000,'and light ('+st.size+' bytes)');assert.deepEqual(st.art,[300,400],'the artwork is untouched');assert.equal(st.els,0,'no layer was added');
  assert.equal(await card().locator('img[data-cover="1"]').count(),1,'the card shows the cover');
  assert.equal(await p.locator('.card',{hasText:'בלי שער'}).locator('img[data-cover="1"]').count(),0,'the other card keeps its artwork');
  await p.screenshot({path:SHOTS+'gallery-cover.png'});

  // the published JSON and its asset list never carry the cover; the size check names it
  const pub=await p.evaluate(async(id)=>{const r=await Studio.load(id);const o=JSON.parse(await Studio.exportJSON(r));return {keys:Object.keys(o.assets||{}),health:JSON.stringify(Studio.fileHealth?Studio.fileHealth(r):'')};},id);
  assert.ok(!pub.keys.includes('__cover')&&pub.keys.includes('__artwork'),'the published JSON has the artwork, not the cover ('+pub.keys+')');

  // the editor and the preview use the artwork (blue), never the cover (red)
  await card().locator('.card-open').click();await p.waitForSelector('#stage-tools:not([hidden])');await p.waitForTimeout(800);
  const colours=async(page)=>{const shot=(await page.screenshot()).toString('base64');return page.evaluate(async(s)=>{const im=new Image();im.src='data:image/png;base64,'+s;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);const d=g.getImageData(0,0,c.width,c.height).data;let red=0,blue=0;
    for(let i=0;i<d.length;i+=16){const [r,gr,bl]=[d[i],d[i+1],d[i+2]];if(r>180&&gr<60&&bl<60)red++;if(bl>100&&r<60&&gr<90)blue++;}return {red,blue};},shot);};
  let c=await colours(p);assert.ok(c.blue>2000&&c.red<20,'the editor shows the artwork, not the cover '+JSON.stringify(c));
  const pv=await ctx.newPage();pv.on('pageerror',e=>errs.push('preview: '+e));pv.on('console',m=>{if(m.type()==='error')errs.push('preview: '+m.text());});
  await pv.goto(base+'/preview.html#'+id);await pv.waitForFunction(()=>{const sc=document.querySelector('a-scene');return sc&&sc.hasLoaded;},null,{timeout:20000});await pv.waitForTimeout(1500);
  c=await colours(pv);assert.ok(c.blue>2000&&c.red<20,'the preview shows the artwork, not the cover '+JSON.stringify(c));await pv.close();
  // editing does not drop it
  await p.evaluate(()=>App.addLayer({id:'t',type:'text',text:'שלום',x:0,y:0,z:0,w:0.3,h:0.08,aspect:4,rot:0,flush:true,seq:null,opacity:1}));await p.waitForTimeout(400);await p.evaluate(()=>App.flush());
  assert.equal(await p.evaluate(async(id)=>!!(await Studio.load(id)).assets.__cover,id),true,'the cover stays after an edit in the editor');

  // a backup (ZIP) and a duplicate keep it
  const zip=await p.evaluate(async(id)=>{const r=await Studio.load(id);const n=await Studio.importZIP(await Studio.exportZIP(r),{save:false});return {cover:!!n.assets.__cover,same:n.assets.__cover&&n.assets.__cover.size===r.assets.__cover.size};},id);
  assert.deepEqual(zip,{cover:true,same:true},'a backup keeps the cover');
  await p.goto(base+'/index.html#/');await p.waitForSelector('.card');await p.waitForTimeout(300);
  await menuOf();await p.locator('.menu-item',{hasText:'שכפול'}).click();await p.waitForSelector('.card:has-text("(עותק)")');await p.waitForTimeout(300);
  assert.equal(await p.locator('.card',{hasText:'(עותק)'}).locator('img[data-cover="1"]').count(),1,'a duplicate keeps the cover');

  // back to the artwork
  await menuOf();m=await items();assert.ok(m.includes('לחזור לתמונת היצירה'),'now the menu offers "לחזור לתמונת היצירה"');
  await p.locator('.menu-item',{hasText:'לחזור לתמונת היצירה'}).click();await p.waitForTimeout(500);
  assert.equal(await card().locator('img[data-cover="1"]').count(),0,'the card shows the artwork again');
  assert.equal(await p.evaluate(async(id)=>'__cover' in (await Studio.load(id)).assets,id),false,'the cover is gone from the creation');

  assert.deepEqual(errs.filter(e=>!/favicon|404/.test(e)),[],'no console errors');
  await ctx.close();
  console.log('PASS v2-cover: choose from the card menu, made small, shows on that card only, editor/preview/published JSON keep the artwork, edit/backup/duplicate keep it, back to the artwork; phone size');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
