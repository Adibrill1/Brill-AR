const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// "פירוק לשכבות": a picture is split into picture layers standing in depth - by depth bands and by elements cut with a
// tap. The models are stood in for (Splitter.fake): the left half is far, the right half near, and a tap cuts a square.
// The layers go far to near, the back has no hole, a cut stands in front, and all of it sits in one group. Phone, touch.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 try{
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined'&&typeof App!=='undefined');
  const id=await p.evaluate(async()=>{const a=Studio.blankExperience('פירוק');a.target={artRatio:0.75,artRect:{x:0,y:0,w:300,h:400},natural:{w:300,h:400}};
    const c=document.createElement('canvas');c.width=300;c.height=400;const g=c.getContext('2d');g.fillStyle='#3060a0';g.fillRect(0,0,150,400);g.fillStyle='#e0a040';g.fillRect(150,0,150,400);g.fillStyle='#fff';g.fillRect(180,150,60,60);
    a.assets.__artwork=await new Promise(r=>c.toBlob(r));a.elements=[];await Studio.save(a);return a.id;});
  await p.goto(base+'/index.html#/e/'+id);await p.waitForSelector('#btn-add');await p.waitForTimeout(600);
  await p.evaluate(()=>{Splitter.fake={
    depth:(c)=>{const w=c.width,h=c.height,d=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)d[y*w+x]=x<w/2?30:220;return {w,h,data:d};},
    masks:(c,pts)=>{const w=c.width,h=c.height,mk=(s)=>{const d=new Uint8Array(w*h);const px=pts[0].x*w,py=pts[0].y*h;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(Math.abs(x-px)<s*w&&Math.abs(y-py)<s*w)d[y*w+x]=255;return {w,h,data:d};};
      return [Object.assign(mk(0.05),{score:0.5}),Object.assign(mk(0.1),{score:0.9}),Object.assign(mk(0.2),{score:0.4})];}};});
  if(await p.locator('.tab[data-tab="layers"]').isVisible())await p.locator('.tab[data-tab="layers"]').click();
  await p.locator('#btn-add').click();await p.locator('dialog[open] .add-tile[data-add="split"]').click();
  await p.locator('dialog[open] .add-tile[data-split="art"]').click();
  await p.waitForTimeout(400);assert.equal(await p.evaluate(()=>!!document.querySelector('.split-status')&&/מוכן/.test(document.querySelector('.split-status').textContent)),false,'nothing heavy starts by itself');
  await p.locator('#split-depth-start').click();
  await p.waitForFunction(()=>/מוכן/.test(document.querySelector('.split-status')?.textContent||''));
  assert.ok(!(await p.locator('dialog[open] button:has-text("יצירת השכבות")').isDisabled()),'ready to build');
  // two depths in this picture: two layers
  await p.locator('dialog[open] input[type=range]').first().evaluate(n=>{n.value=2;n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));});
  await p.waitForFunction(()=>/מוכן: 2 /.test(document.querySelector('.split-status').textContent));
  // a tap cuts the white square
  await p.locator('dialog[open] button:has-text("לגזור אלמנט בנגיעה")').click();await p.waitForSelector('.split-cut-tools:not([hidden])');
  const box=await p.locator('.split-canvas').boundingBox();
  await p.locator('.split-canvas').click({position:{x:box.width*0.7,y:box.height*0.45}});
  await p.waitForFunction(()=>/כך תיגזר/.test(document.querySelector('.split-status').textContent));
  await p.locator('dialog[open] button:has-text("להוסיף כשכבה")').click();
  assert.equal(await p.locator('.split-cuts .chip').count(),1,'one cut listed');
  await p.locator('dialog[open] button:has-text("יצירת השכבות")').click();
  await p.waitForFunction(()=>App.rec.elements.some(e=>e.name==='פירוק לשכבות'),null,{timeout:20000});
  const r=await p.evaluate(async()=>{const els=App.rec.elements.filter(e=>e.type==='image');
    const alpha=async(e,fx,fy)=>{const im=await createImageBitmap(App.rec.assets[e.assetId]);const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);return g.getImageData(Math.floor(fx*im.width),Math.floor(fy*im.height),1,1).data[3];};
    const back=els.find(e=>e.name==='רקע הפירוק'),cut=els.find(e=>/גזירה/.test(e.name)),near=els.find(e=>e.name==='שכבה 1');
    return {names:els.map(e=>e.name),zs:els.map(e=>e.z),grp:App.rec.elements.find(e=>e.name==='פירוק לשכבות').type,
      backFull:[await alpha(back,0.2,0.5),await alpha(back,0.8,0.5),await alpha(back,0.7,0.45)],cutIn:await alpha(cut,0.7,0.45),cutOut:await alpha(cut,0.2,0.5),
      nearR:await alpha(near,0.9,0.8),nearL:await alpha(near,0.1,0.8),nearHole:await alpha(near,0.7,0.45),flush:els.every(e=>e.flush&&e.w===1),mode3d:App.mode3d};});
  assert.deepEqual(r.names,['רקע הפירוק','שכבה 1','גזירה 1'],'back, near band, cut: '+r.names);
  assert.ok(r.zs[0]===0&&r.zs[1]>0&&r.zs[2]>0,'standing in depth '+r.zs);
  assert.ok(r.zs.every((z,i)=>!i||z>=r.zs[i-1]),'drawn far to near');
  assert.ok(r.backFull.every(a=>a>250),'the back has no hole '+r.backFull);
  assert.ok(r.cutIn>250&&r.cutOut<5,'the cut holds only the square');
  assert.ok(r.nearR>250&&r.nearL<5&&r.nearHole<5,'the near band holds the right half without the cut');
  assert.ok(r.flush,'over the whole artwork');assert.ok(r.mode3d,'switched to the 3D view');
  // the group keeps a control for the distance between the layers
  await p.evaluate(()=>{const g=App.rec.elements.find(e=>e.name==='פירוק לשכבות');App.select(g.id);});
  await p.evaluate(()=>App.setTab('style'));
  const sl=p.locator('input.range[aria-label="מרחק בין השכבות"]');await sl.waitFor();
  const z0=await p.evaluate(()=>App.rec.elements.filter(e=>e.type==='image').map(e=>e.z));
  await sl.evaluate(n=>{n.value=0.45;n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));});
  const z1=await p.evaluate(()=>App.rec.elements.filter(e=>e.type==='image').map(e=>e.z));
  assert.equal(z1[0],z0[0],'the back stays');z0.forEach((z,i)=>{if(i)assert.ok(Math.abs(z1[i]-z*3)<0.002,'three times as far '+z+' → '+z1[i]);});
  assert.equal(await p.evaluate(()=>App.rec.elements.find(e=>e.name==='פירוק לשכבות').split.spread),0.45,'the spread is kept on the group');
  // one piece of the picture never lands in two layers: a near square on a far ground, its depth falling off at the rim
  const two=await p.evaluate(()=>{const w=120,h=120,d=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const r=Math.max(Math.abs(x-60),Math.abs(y-60));d[y*w+x]=r<25?200-r*2:r<32?200-(r-25)*20:20+y*0.3;}
    const L=Splitter.labels({w,h,data:d},4),inside=new Set();for(let y=40;y<80;y++)for(let x=40;x<80;x++)inside.add(L.data[y*w+x]);return [...inside];});
  assert.equal(two.length,1,'the square is whole in one layer '+two);
  assert.equal(errs.filter(e=>!/favicon|404/.test(e)).length,0,'no page errors: '+errs.join(' | '));
  console.log('split into layers: all checks pass');
 }finally{await b.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
