const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Images and videos: "מילוי תמונת המקור" lays the layer exactly over the whole artwork (a centred crop to the artwork's
// shape, width to match, centred, flat), "↻ סיבוב 90°" turns it a quarter and fills again (sideways shape); the canvas
// shows it edge to edge. "✂️ חיתוך בגרירה" opens the whole source with the kept region as a box: pulling a corner or
// a shape chip sets the region, "אישור" saves it (the file stays whole), "ביטול" keeps the old one. A keyed layer is
// left alone. The time cube / chroma rows keep their sheet tabs. Headless Chrome, phone size; not an iPhone.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
const p=await (await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})).newPage();const pageErrors=[];p.on('pageerror',e=>pageErrors.push(String(e)));
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(800);
const id=await p.evaluate(async()=>{const r=Studio.blankExperience('crop-fill');r.target={artRect:{x:0,y:0,w:768,h:1024},natural:{w:768,h:1024}};
  const mk=(w,h,fill)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');fill(g,w,h);return new Promise(res=>c.toBlob(res));};
  r.assets.__artwork=await mk(768,1024,(g,w,h)=>{g.fillStyle='#ffffff';g.fillRect(0,0,w,h);});
  r.assets.red=await mk(400,400,(g,w,h)=>{g.fillStyle='#ff0000';g.fillRect(0,0,w,h);});
  const K={loop:false,keys:[{t:0,x:.2,y:.2,z:0,rot:0,opacity:1,scale:1,tap:'none'},{t:2,x:.3,y:.2,z:0,rot:0,opacity:1,scale:1,tap:'none'}]};
  r.elements=[{id:'pic',name:'PIC',type:'image',assetId:'red',aspect:1,x:.2,y:.2,w:.3,rot:0},{id:'kd',name:'KD',type:'image',assetId:'red',aspect:1,x:.2,y:.2,w:.2,rot:0,timeline:K}];r.elements.forEach(Studio.normEl);
  await Studio.save(r);const o=document.createElement('option');o.value=r.id;o.textContent=r.name;document.querySelector('#exp-select').append(o);return r.id;});
await p.locator('#exp-select').selectOption(id);await p.waitForFunction(()=>parseFloat(document.querySelector('#preview').style.height)>200,{timeout:10000});
const pick=async(n)=>{await p.evaluate(n=>[...document.querySelectorAll('#element-list li')].find(l=>l.textContent.includes(n)).click(),n);await p.waitForTimeout(400);};
const tab=async(k)=>{await p.evaluate(k=>{const b=document.querySelector('#panel-subtabs [data-sub="'+k+'"]');if(b&&b.offsetParent)b.click();},k);await p.waitForTimeout(250);};
const el=(eid)=>p.evaluate(async([id,eid])=>(await Studio.load(id)).elements.find(e=>e.id===eid),[id,eid]);
const near=(a,b,t=.002)=>Math.abs(a-b)<t;
assert.equal(await p.evaluate(()=>document.querySelector('#row-chroma').dataset.sub),'look','chroma row stays on the look tab');
assert.equal(await p.evaluate(()=>document.querySelector('#row-timecube').dataset.sub),'look','time cube row on the look tab');
assert.equal(await p.evaluate(()=>document.querySelector('#row-fill').dataset.sub),'pos','fill row on the position tab');
// fill: portrait artwork (3:4), square picture -> centred crop to 3:4, full width and height
await pick('PIC');await tab('pos');assert.ok(await p.locator('#btn-fill-art').isVisible(),'fill button shown for an image');
await p.locator('#btn-fill-art').click();await p.waitForTimeout(700);
let e=await el('pic');
assert.ok(near(e.x,0)&&near(e.y,0)&&near(e.w,1)&&near(e.h,1)&&e.rot===0&&near(e.crop.w,.75)&&near(e.crop.x,.125)&&near(e.crop.h,1),'fill: covers the artwork exactly: '+JSON.stringify(e));
// the canvas: red to the artwork's corners, white backdrop just outside it
const px=async()=>p.evaluate(()=>{const c=document.querySelector('#preview'),g=c.getContext('2d'),W=c.width,H=c.height,aw=W/1.5,ah=H/1.5,l=aw*.25,t=ah*.25; /* artwork + a quarter margin each side (editor MARGIN_FRAC) */const at=(x,y)=>[...g.getImageData(Math.round(x),Math.round(y),1,1).data].slice(0,3);
  return {tl:at(l+4,t+4),br:at(l+aw-5,t+ah-30),bl:at(l+4,t+ah-5),mid:at(W/2,H/2),out:at(l-6,t+ah/2)};});
let q=await px();for(const k of ['tl','br','bl','mid'])assert.ok(q[k][0]>200&&q[k][1]<60&&q[k][2]<60,'2D: red at '+k+': '+JSON.stringify(q));
assert.ok(q.out[1]>150,'2D: not past the artwork edge: '+JSON.stringify(q));
// turn 90: sideways shape (4:3), width = artwork height, turned a quarter
await p.locator('#btn-fill-rot').click();await p.waitForTimeout(700);e=await el('pic');
assert.ok(e.rot===90&&near(e.w,1024/768)&&near(e.h,.75)&&near(e.crop.w,1)&&near(e.crop.h,.75)&&near(e.crop.y,.125)&&near(e.aspect,1024/768,.003),'turn: a quarter and filled again: '+JSON.stringify(e));
q=await px();for(const k of ['tl','br','bl','mid'])assert.ok(q[k][0]>200&&q[k][1]<60,'2D turned: red at '+k+': '+JSON.stringify(q));
await p.locator('#btn-fill-rot').click();await p.waitForTimeout(600);e=await el('pic');assert.ok(e.rot===180&&near(e.w,1),'turn again: 180, upright shape');
await p.locator('#btn-fill-rot').click();await p.waitForTimeout(600);e=await el('pic');assert.ok(e.rot===-90&&near(e.w,1024/768),'and -90');
await p.locator('#btn-fill-rot').click();await p.waitForTimeout(600);e=await el('pic');assert.ok(e.rot===0&&near(e.w,1),'and back to 0');
// crop by dragging: full picture first, then pull the bottom-right corner in by a quarter
await tab('look');await p.locator('#crop-reset').click();await p.waitForTimeout(600);
await p.locator('#btn-crop-drag').click();await p.waitForSelector('#crop-modal .crop-rect');await p.waitForTimeout(400);
const st=await p.evaluate(()=>{const r=document.querySelector('#crop-modal .crop-stage').getBoundingClientRect(),h=document.querySelector('#crop-modal i[data-h="se"]').getBoundingClientRect();return {w:r.width,h:r.height,hx:h.x+h.width/2,hy:h.y+h.height/2};});
assert.ok(st.w>100&&st.h>100,'the whole source shows: '+JSON.stringify(st));
const drag=async(x0,y0,x1,y1)=>{await p.evaluate(([x0,y0,x1,y1])=>{const t=document.elementFromPoint(x0,y0),o={pointerId:7,pointerType:'touch',isPrimary:true,bubbles:true,cancelable:true};t.dispatchEvent(new PointerEvent('pointerdown',{...o,clientX:x0,clientY:y0}));for(let i=1;i<=5;i++)t.dispatchEvent(new PointerEvent('pointermove',{...o,clientX:x0+(x1-x0)*i/5,clientY:y0+(y1-y0)*i/5}));t.dispatchEvent(new PointerEvent('pointerup',{...o,clientX:x1,clientY:y1}));},[x0,y0,x1,y1]);};
const s2=await p.evaluate(()=>{const h=document.querySelector('#crop-modal i[data-h="se"]').getBoundingClientRect();return {x:h.x+h.width/2,y:h.y+h.height/2};});
await drag(s2.x,s2.y,s2.x-st.w*.25,s2.y-st.h*.25);
await p.locator('#crop-ok').click();await p.waitForTimeout(700);e=await el('pic');
assert.ok(near(e.crop.x,0,.01)&&near(e.crop.y,0,.01)&&near(e.crop.w,.75,.02)&&near(e.crop.h,.75,.02),'drag crop: corner pulled in a quarter: '+JSON.stringify(e.crop));
// shape chip: square, then cancel keeps the saved crop; then OK with 16:9
await p.locator('#btn-crop-drag').click();await p.waitForSelector('#crop-modal');await p.locator('#crop-modal [data-r="1.7778"]').click();await p.locator('#crop-cancel').click();await p.waitForTimeout(400);
e=await el('pic');assert.ok(near(e.crop.w,.75,.02)&&near(e.crop.h,.75,.02),'cancel keeps the saved crop');
await p.locator('#btn-crop-drag').click();await p.waitForSelector('#crop-modal');await p.locator('#crop-modal [data-r="1.7778"]').click();await p.locator('#crop-ok').click();await p.waitForTimeout(700);
e=await el('pic');assert.ok(near(e.aspect,16/9,.01)&&near(e.crop.w,1)&&near(e.crop.h,.5625,.003),'16:9 chip: the region has that shape: '+JSON.stringify({a:e.aspect,c:e.crop}));
// a keyed layer: fill leaves it alone, with a message
await pick('KD');await tab('pos');const k0=await el('kd');await p.locator('#btn-fill-art').click();await p.waitForTimeout(600);
assert.deepEqual(await el('kd'),k0,'keyed layer unchanged');assert.ok((await p.locator('#msg').textContent()).includes('נקודות זמן'),'and a message says why');
assert.deepEqual(pageErrors,[],'no page errors');
console.log('PASS editor-crop-fill: fill covers the artwork exactly (and turned a quarter), drag-crop and shape chips set the region, cancel keeps it, keyed layer left alone');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
