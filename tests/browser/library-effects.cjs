const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Floating light effects: (1) the black key is a soft glow key - over a blue backdrop, black disappears, half-bright red
// becomes red + half the backdrop, white stays white; a green key still cuts hard as before (the key stays for the
// user's own videos). (2) The library's floating effects are 3D models now: adding one creates a model layer at its
// start width, playing its looping clip, drawn by the real-scene layer in 2D. Headless Chrome; not an iPhone.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});try{
const p=await (await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})).newPage();const pageErrors=[];p.on('pageerror',e=>pageErrors.push(String(e)));
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(800);
// (1) shader: three source pixels (black, half red, white) over an opaque blue clear
const keyed=await p.evaluate(()=>{const run=(key)=>{const c=document.createElement('canvas');c.width=3;c.height=1;const r=new THREE.WebGLRenderer({canvas:c,alpha:true,preserveDrawingBuffer:true});r.setClearColor(0x0000ff,1);r.clear();
  const tex=new THREE.DataTexture(new Uint8Array([0,0,0,255,128,0,0,255,255,255,255,255]),3,1);tex.magFilter=tex.minFilter=THREE.NearestFilter;tex.needsUpdate=true;
  const sc=new THREE.Scene();sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),Studio.makeChromaMaterial(tex,key,.35)));r.autoClear=false;r.render(sc,new THREE.OrthographicCamera(-1,1,1,-1,0,1));
  const px=new Uint8Array(12);const gl=r.getContext();gl.readPixels(0,0,3,1,gl.RGBA,gl.UNSIGNED_BYTE,px);r.dispose();return [0,1,2].map(i=>[px[i*4],px[i*4+1],px[i*4+2]]);};
  return {black:run('#000000'),green:run('#00ff00')};});
const near=(a,e,msg)=>assert.ok(a.every((v,i)=>Math.abs(v-e[i])<=3),msg+': '+JSON.stringify(a)+' vs '+JSON.stringify(e));
near(keyed.black[0],[0,0,255],'black key: black is gone');near(keyed.black[1],[128,0,127],'black key: half red = red + half the backdrop');near(keyed.black[2],[255,255,255],'black key: white stays');
near(keyed.green[0],[0,0,0],'green key: black kept, opaque');near(keyed.green[1],[128,0,0],'green key: red kept, opaque');
// (2) add an effect from the library
const id=await p.evaluate(async()=>{const r=Studio.blankExperience('fx');r.target={artRect:{x:0,y:0,w:768,h:768},natural:{w:768,h:768}};const c=document.createElement('canvas');c.width=c.height=768;const g=c.getContext('2d');g.fillStyle='#8aa';g.fillRect(0,0,768,768);r.assets.__artwork=await new Promise(res=>c.toBlob(res));
  await Studio.save(r);const o=document.createElement('option');o.value=r.id;o.textContent=r.name;document.querySelector('#exp-select').append(o);return r.id;});
await p.locator('#exp-select').selectOption(id);await p.waitForTimeout(600);
await p.locator('#shell-tabs button[data-tab="layers"]').click().catch(()=>{});await p.getByRole('button',{name:'ספריית התחלה'}).first().click();await p.waitForSelector('#starter-library[open]');
await p.click('.library-filters button[data-group="fx"]');await p.click('[data-library-id="fx3d-neon-love"]');
await p.waitForFunction(()=>!document.querySelector('#starter-library[open]')&&document.querySelectorAll('#element-list li').length===1,null,{timeout:30000});
const el=await p.evaluate(async id=>{const e=(await Studio.load(id)).elements[0];return {type:e.type,name:e.name,w:e.w,id:e.id};},id);
assert.deepEqual([el.type,el.name,el.w],['model','שלט ניאון: אהבה',.5]);
await p.locator('#canvas-wrap').scrollIntoViewIfNeeded();
await p.waitForFunction(id=>Editor3D.drawsIn2d(id),el.id,{timeout:60000});
const t0=await p.evaluate(()=>{const c=document.querySelector('[model-clips]')?.components['model-clips'];return c&&c.mixer?c.mixer.time:null;});await p.waitForTimeout(1500);
const t1=await p.evaluate(()=>{const c=document.querySelector('[model-clips]')?.components['model-clips'];return c&&c.mixer?c.mixer.time:null;});
assert.ok(t0!=null&&t1>t0,'the effect\'s clip plays ('+t0+' -> '+t1+')');
assert.deepEqual(pageErrors,[],'no page errors');
console.log('PASS library-effects: soft black glow key (green key unchanged); a 3D effect added at its width, drawn live in 2D with its clip playing');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
