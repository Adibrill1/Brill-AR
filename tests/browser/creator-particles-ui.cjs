// UI-authored particles exercise, grounded in Artivive's CURRENT documented particle
// controls (course module-3, verified 2026-10-25): speed, direction (incl. random and
// outward-from-center), size, density, spread, templates, custom image. Over-life
// color/size/fade stay labeled as our own authoring tools (old-interface video only).
const {chromium}=require('playwright-core'),assert=require('assert/strict'),path=require('path'),server=require('../../server/server'),waitFor=require('./waitfor.cjs');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});try{
const p=await b.newPage({viewport:{width:1280,height:900}});
await p.goto(base+'/index.html');await p.waitForSelector('#element-list li');
await p.locator('#btn-new').click();await p.locator('#file-artwork').setInputFiles(path.resolve('studio/library/star.png'));await p.waitForSelector('#sec-elements:not([hidden])');
const set=async(sel,v)=>{await p.locator(sel).fill(v);await p.locator(sel).dispatchEvent('change');};
await p.locator('#btn-particles').click();await p.waitForFunction(()=>document.querySelectorAll('#element-list li').length===1);
await p.locator('#sel-pdir-mode').selectOption('random');
await set('#num-pspread','.3');await set('#num-pcount','50');
const id=await p.evaluate(()=>document.querySelector('#exp-select').value);
await waitFor(p,async id=>{const r=await Studio.load(id);const pc=r.elements[0].particles;return pc.direction===-2&&pc.spread===.3&&pc.count===50;},id); // saves are async; never navigate ahead of them
// persistence through reload
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelectorAll('#exp-select option').length>0);
await p.locator('#exp-select').selectOption(id);await p.waitForFunction(()=>document.querySelectorAll('#element-list li').length===1);
const pc=await p.evaluate(async id=>{const r=await Studio.load(id);return r.elements[0].particles;},id);
assert.equal(pc.direction,-2,'random direction mode persisted');assert.equal(pc.spread,.3,'spread persisted');assert.equal(pc.count,50,'density persisted');
console.log('PASS UI-authored particles: random direction + spread + density persist across reload');
// engine truth in preview
await p.goto(base+'/preview.html#'+id);
await p.waitForFunction(()=>document.querySelector('[data-el-id]')?.components?.particles?.vel);
const eng=await p.evaluate(()=>{const c=document.querySelector('[data-el-id]').components.particles,d=c.data,pos=c.points.geometry.attributes.position.array;let out={direction:d.direction,spread:d.spread,w:d.width};
  const angles=new Set();for(let i=0;i<10;i++){const a=Math.atan2(c.vel[i*3],c.vel[i*3+1]);angles.add(Math.round(a*10));}
  out.distinctAngles=angles.size;let maxR=0;for(let i=0;i<pos.length;i+=3){maxR=Math.max(maxR,Math.abs(pos[i]),Math.abs(pos[i+1]));}out.maxR=maxR;return out;});
assert.equal(eng.direction,-2,'engine got random mode');
assert.ok(eng.distinctAngles>=5,'random mode gives per-particle directions: '+eng.distinctAngles);
assert.ok(eng.maxR<=eng.w*.3/2+0.06,'spread shrinks the emission area: maxR='+eng.maxR+' vs width='+eng.w);
console.log('PASS engine honors random direction (varied velocities) and spread bounds the emission area',eng);
// outward mode: velocities point away from the spawn position
await p.evaluate(async id=>{const r=await Studio.load(id);r.elements[0].particles.direction=-3;await Studio.save(r);},id);
await p.goto('about:blank');await p.goto(base+'/preview.html#'+id);
await p.waitForFunction(()=>document.querySelector('[data-el-id]')?.components?.particles?.data.direction===-3);
const out=await p.evaluate(()=>{const c=document.querySelector('[data-el-id]').components.particles,pos=c.points.geometry.attributes.position.array;let ok=0,n=0;for(let i=0;i<pos.length;i+=3){const dot=pos[i]*c.vel[i]+pos[i+1]*c.vel[i+1];if(Math.abs(pos[i])+Math.abs(pos[i+1])<1e-4){continue;}n++;if(dot>0)ok++;}return {ok,n};});
assert.ok(out.ok/out.n>=.8,'outward mode: velocities point away from center: '+JSON.stringify(out));
console.log('PASS outward-from-center direction mode',out);
// phone-size visual
await p.setViewportSize({width:390,height:844});await p.waitForTimeout(600);await p.screenshot({path:'/downloads/creator-particles-ui-390.png'});
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
