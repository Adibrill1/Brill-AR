const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),path=require('node:path');const server=require('../../server/server');
// Three things in the editor, on a phone-size screen: (1) after choosing the artwork a crop sheet opens, and dragging a
// corner makes the artwork smaller (continuing untouched keeps the very file); (2) the selection bar can be dragged
// away and folded to its handle, and remembers both; (3) the looks of text (neon, outline, ...) change its picture,
// keep the letters' size, are saved, show in the preview's texture, and nonsense is refused on import.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));
  const shot=async(n)=>{if(process.env.SHOTS)await p.screenshot({path:process.env.SHOTS+'/'+n+'.png'});};
  const stored=()=>p.evaluate(()=>Studio.load(App.rec.id));
  const pick=async()=>{const [fc]=await Promise.all([p.waitForEvent('filechooser'),p.locator('#btn-empty-art').click()]);await fc.setFiles(path.join(__dirname,'../fixtures/target-a.png'));await p.waitForSelector('.crop-dlg[open] .crop-box img');await p.waitForFunction(()=>document.querySelector('.crop-box img').naturalWidth>0);await p.waitForTimeout(300);};
  const fresh=async()=>{await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof App!=='undefined');await p.evaluate(()=>{location.hash='';});await p.reload();await p.locator('#btn-new, #btn-new-empty').locator('visible=true').first().click();await p.waitForSelector('#editor:not([hidden])');};
  const drag=async(x0,y0,x1,y1)=>{const c=await ctx.newCDPSession(p),t=(type,x,y)=>c.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y}]});await t('touchStart',x0,y0);for(let i=1;i<=6;i++){await t('touchMove',x0+(x1-x0)*i/6,y0+(y1-y0)*i/6);await p.waitForTimeout(20);}await t('touchEnd');await c.detach();await p.waitForTimeout(150);};

  // 1a. continue without touching the frame: the file itself is kept
  await fresh();await pick();await shot('crop-sheet');
  const nat=await p.evaluate(()=>{const i=document.querySelector('.crop-box img');return {w:i.naturalWidth,h:i.naturalHeight};});
  await p.locator('#crop-ok').click();await p.waitForFunction(()=>App.rec&&App.rec.target,null,{timeout:30000});await p.waitForTimeout(1200);
  let rec=await stored();assert.deepEqual(rec.target.natural,nat,'untouched: the whole picture');
  // 1b. drag the bottom-left corner in: a smaller picture
  await fresh();await pick();
  const fb=await p.locator('.crop-frame').boundingBox();
  await drag(fb.x+2,fb.y+fb.height-2,fb.x+fb.width*0.3,fb.y+fb.height*0.6);await shot('crop-dragged');
  const txt=await p.locator('.crop-size').textContent();
  await p.locator('#crop-ok').click();await p.waitForFunction(()=>App.rec&&App.rec.target,null,{timeout:30000});await p.waitForTimeout(1200);
  rec=await stored();
  assert.ok(Math.abs(rec.target.natural.w-nat.w*0.7)<nat.w*0.04&&Math.abs(rec.target.natural.h-nat.h*0.6)<nat.h*0.04,'cut to the frame: '+JSON.stringify(rec.target.natural)+' of '+JSON.stringify(nat)+' ('+txt+')');
  // 1c. closing the sheet changes nothing
  await p.evaluate(()=>{window.__n=JSON.stringify(App.rec.target.natural);});
  await p.locator('.tab[data-tab="layers"]').click();await p.waitForTimeout(200);
  {const [fc]=await Promise.all([p.waitForEvent('filechooser'),p.locator('#art-card button',{hasText:'החלפה'}).click()]);await fc.setFiles(path.join(__dirname,'../fixtures/target-a.png'));await p.waitForSelector('.crop-dlg[open]');await p.locator('.crop-dlg .dlg-head .icon-btn').click();await p.waitForTimeout(500);}
  assert.equal(await p.evaluate(()=>JSON.stringify(App.rec.target.natural)===window.__n),true,'closing the sheet keeps the artwork');

  // 2. the selection bar
  await p.locator('#btn-add').click();await p.locator('.add-tile',{hasText:'טקסט'}).click();await p.waitForTimeout(900);
  await p.locator('#in-text').fill('ניאון');await p.waitForTimeout(400);
  const bar=p.locator('#sel-bar'),grip=p.locator('#sel-bar .sel-grip');assert.ok(await bar.isVisible(),'the bar shows');
  const b0=await bar.boundingBox(),g0=await grip.boundingBox(),st=await p.locator('#stage').boundingBox();
  await drag(g0.x+g0.width/2,g0.y+g0.height/2,g0.x+g0.width/2-40,st.y+st.height-30);
  const b1=await bar.boundingBox();assert.ok(b1.y>b0.y+60,'dragged down: '+b0.y+' -> '+b1.y);assert.ok(b1.x>=st.x-1&&b1.x+b1.width<=st.x+st.width+1&&b1.y+b1.height<=st.y+st.height+1,'and stays on the stage');
  await shot('bar-moved');
  await grip.tap();await p.waitForTimeout(200);
  const b2=await bar.boundingBox();assert.ok(b2.width<50,'a tap folds it: '+b2.width);assert.equal(await p.locator('#sel-bar .icon-btn').first().isVisible(),false);await shot('bar-folded');
  await p.reload();await p.waitForSelector('#editor:not([hidden])');await p.waitForTimeout(800);await p.locator('.tab[data-tab="layers"]').click();await p.locator('.layer-row').first().click();await p.waitForTimeout(400);
  const b3=await bar.boundingBox();assert.ok(b3.width<50&&b3.y>b0.y+60,'remembered after a reload '+JSON.stringify(b3));
  await grip.tap();await p.waitForTimeout(200);assert.ok((await bar.boundingBox()).width>120,'a tap opens it again');
  const b4=await bar.boundingBox();assert.ok(b4.x>=st.x-1&&b4.x+b4.width<=st.x+st.width+1,'open, it is still inside the stage');

  // 3. text looks
  await p.locator('.tab[data-tab="style"]').click();await p.waitForTimeout(300);
  const grp=p.locator('#inspector .group',{hasText:'אפקט'}).last();
  const sig=()=>p.evaluate(()=>{const x=App.sel(),c=Stage.textBitmap(x).canvas,d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let s=0;for(let i=0;i<d.length;i+=97)s=(s*31+d[i])>>>0;return {s,cw:c.width,w:x.w,fx:x.textFx&&x.textFx.id};});
  const plain=await sig(),seen=new Set([plain.s]);
  for(const [id,name] of [['neon','ניאון'],['outline','קו מתאר'],['hollow','אותיות חלולות'],['shadow','צל חד'],['deep','תלת־ממד'],['gradient','מעבר צבע'],['glitch','גליץ׳'],['sticker','מדבקה']]){
    await p.locator('#inspector .group .chip',{hasText:name}).last().click();await p.waitForTimeout(700);
    const s=await sig();assert.equal(s.fx,id,name+' is set');assert.ok(!seen.has(s.s),name+' changes the picture');seen.add(s.s);
    assert.ok(Math.abs(s.w/s.cw-plain.w/plain.cw)<1e-6,name+': the letters keep their size');
    assert.equal((await stored()).elements[0].textFx.id,id,name+' is saved');
    if(id==='neon'){await p.locator('#stage').scrollIntoViewIfNeeded();await shot('text-neon');}
    if(id==='sticker')await shot('text-sticker');
  }
  await p.locator('#inspector .group .chip',{hasText:'בלי'}).last().click();await p.waitForTimeout(700);
  const back=await sig();assert.equal(back.s,plain.s,'"none" gives back the plain picture');assert.ok(Math.abs(back.w-plain.w)<1e-6,'and the plain width');assert.equal((await stored()).elements[0].textFx,undefined);
  const v=await p.evaluate(()=>[Studio.validTextFx({textFx:{id:'neon',color:'#00ffcc',amount:0.8}}),Studio.validTextFx({textFx:{id:'boom'}}),Studio.validTextFx({textFx:{id:'neon',color:'red'}}),Studio.validTextFx({textFx:{id:'neon',amount:3}}),Studio.validTextFx({})]);
  assert.deepEqual(v,[true,false,false,false,true],'validation');
  // one sheet of all the looks, for the eye
  if(process.env.SHOTS){await p.evaluate(()=>{const host=document.createElement('div');host.id='fx-sheet';host.style.cssText='position:fixed;inset:0;z-index:99999;background:#20242c;overflow:auto;padding:10px;display:grid;gap:6px;justify-items:center';
    for(const t of [{id:null,name:'רגיל'}].concat(Studio.TEXT_FX)){const c=Studio.drawTextCanvas({text:'שלום AR.',color:t.id==='shadow'||t.id==='outline'?'#ffd94d':'#ffffff',bold:true,font:'heebo',textFx:t.id?{id:t.id}:undefined},64).canvas;c.style.height='78px';host.append(c);}document.body.append(host);});
    await p.waitForTimeout(300);await shot('text-fx-sheet');await p.evaluate(()=>document.getElementById('fx-sheet').remove());}
  assert.deepEqual(errs,[],'no errors');
  console.log('PASS v2-crop-bar-textfx');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e);process.exit(1);});
