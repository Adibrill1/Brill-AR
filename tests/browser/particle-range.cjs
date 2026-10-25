// particle-range: Artivive-style life RANGE (min-max per particle) + start-color RANGE (two colors).
// Covers: panel authoring + persistence, export/import roundtrip, import validation of the new fields,
// per-particle life variance within bounds, per-particle start-color spread, backward compat (no range
// set = uniform life/color exactly as before), 390px panel layout, and real framebuffer proof.
const {chromium}=require('playwright-core'),assert=require('assert/strict'),server=require('../../server/server');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});try{const p=await b.newPage({viewport:{width:900,height:800}});const errors=[];p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);const id=await p.evaluate(async()=>{const r=Studio.blankExperience('range');r.target={artRect:{x:0,y:0,w:768,h:1024},natural:{w:768,h:1024}};const c=document.createElement('canvas');c.width=768;c.height=1024;c.getContext('2d').fillRect(0,0,768,1024);r.assets.__artwork=await new Promise(res=>c.toBlob(res));r.elements=[{id:'p1',type:'particles',name:'טווח',x:0,y:0,z:.1,w:.7,h:.5,seq:null,particles:{count:200,size:30,color:'#ff0000',speed:1,lifetime:1}},{id:'p2',type:'particles',name:'ישן',x:0,y:0,z:.1,w:.5,h:.4,seq:null,particles:{count:50,size:20,color:'#00ff00',speed:1,lifetime:2}}];await Studio.save(r);return r.id;});
// 1. panel authoring
await p.reload();await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.locator('#exp-select').selectOption(id);await p.locator('#element-list li').first().click();
await p.locator('#num-plife2').fill('0.2');await p.locator('#num-plife2').dispatchEvent('change');
await p.locator('#ck-pcolor2').check();await p.locator('#in-pcolor2').fill('#0000ff');await p.locator('#in-pcolor2').dispatchEvent('change');
await p.waitForFunction(async()=>{const r=await Studio.load(document.querySelector('#exp-select').value);return r.elements[0].particles.life2===0.2&&r.elements[0].particles.color2==='#0000ff';});
// 2. export/import roundtrip
const copy=await p.evaluate(async id=>{const r=await Studio.load(id);return (await Studio.importJSON(await Studio.exportJSON(r))).elements[0].particles;},id);
assert.equal(copy.life2,0.2);assert.equal(copy.color2,'#0000ff');assert.equal(copy.lifetime,1);
// 3. import validation rejects bad ranges
const rej=await p.evaluate(async id=>{const r=await Studio.load(id);const out=[];for(const mut of [p=>{p.life2=99;},p=>{p.color2='red';}]){const o=JSON.parse(await Studio.exportJSON(r));mut(o.elements[0].particles);try{await Studio.importJSON(JSON.stringify(o));out.push('accepted');}catch(e){out.push('rejected');}}return out;},id);
assert.deepEqual(rej,['rejected','rejected']);
// 4. 390px panel layout
await p.setViewportSize({width:390,height:844});await p.locator('#row-particles').screenshot({path:'/downloads/particle-range-390.png'});await p.screenshot({path:'/downloads/particle-range-390-full.png',fullPage:false});
assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
// 5. preview: per-particle life + color ranges
await p.setViewportSize({width:900,height:800});await p.goto(base+'/preview.html#'+id);
await p.waitForFunction(()=>document.querySelectorAll('[particles]').length===2&&document.querySelector('[particles]').components.particles?.points);
const probe=await p.evaluate(()=>{const cs=[...document.querySelectorAll('[particles]')].map(e=>e.components.particles);const ranged=cs.find(c=>c.data.color2),legacy=cs.find(c=>!c.data.color2);ranged.el.sceneEl.pause();ranged.ages.fill(0);ranged.tick(1000,0.0001);
 const rl=Array.from(ranged.lives),lo=Math.min(...rl),hi=Math.max(...rl);
 const sc=ranged.startColors,reds=[],blues=[];for(let i=0;i<sc.length;i+=3){reds.push(sc[i]);blues.push(sc[i+2]);}
 const colAttr=ranged.points.geometry.attributes.color.array;let redDom=0,blueDom=0;for(let i=0;i<colAttr.length;i+=3){if(colAttr[i]>.6&&colAttr[i+2]<.4)redDom++;if(colAttr[i+2]>.6&&colAttr[i]<.4)blueDom++;}
 const legacyUniform=Array.from(legacy.lives).every(v=>v===2);const legacyColor=[...Array(legacy.startColors.length/3)].every((_,k)=>legacy.startColors[k*3]===0&&legacy.startColors[k*3+1]===1&&legacy.startColors[k*3+2]===0);
 // age-lerp end state: force every particle to end of its OWN life
 for(let i=0;i<ranged.ages.length;i++)ranged.ages[i]=ranged.lives[i]-0.001;ranged.tick(1000,0.0001);
 const end=Array.from(ranged.points.geometry.attributes.color.array.slice(0,3));
 return {lo,hi,redDom,blueDom,end,legacyUniform,legacyColor,livesN:ranged.lives.length};});
assert.equal(probe.livesN,200);assert.ok(probe.lo>=0.2&&probe.hi<=1,'life bounds '+probe.lo+'..'+probe.hi);assert.ok(probe.hi-probe.lo>0.3,'life variance');
assert.ok(probe.redDom>20&&probe.blueDom>20,'start color spread '+JSON.stringify(probe));
assert.ok(probe.end[0]>.9&&probe.end[2]<.1,'end color near element red got '+probe.end); // endColor defaults to the element color in buildElementEntity
assert.ok(probe.legacyUniform&&probe.legacyColor,'backward compat');
// 6. framebuffer proof
const px=await p.evaluate(()=>{const c=[...document.querySelectorAll('[particles]')].map(e=>e.components.particles).find(c=>c.data.color2),s=c.el.sceneEl;for(let i=0;i<c.ages.length;i++)c.ages[i]=Math.random()*c.lives[i]*0.5;c.tick(1000,0.0001);s.renderer.render(s.object3D,s.camera);const gl=s.renderer.getContext(),bytes=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,bytes);let red=0,blue=0;for(let i=0;i<bytes.length;i+=4){if(bytes[i]>60&&bytes[i+2]<40&&bytes[i+1]<40)red++;if(bytes[i+2]>60&&bytes[i]<40&&bytes[i+1]<40)blue++;}return {red,blue};});
assert.ok(px.red>50&&px.blue>50,'framebuffer shows both range colors '+JSON.stringify(px));
await p.screenshot({path:'/downloads/particle-range-preview.png'});
assert.equal(errors.some(e=>/shader error|VALIDATE_STATUS|compile.*shader/i.test(e)),false,errors.join('\n'));
console.log('PASS particle range: panel+roundtrip+validation+per-particle life/color variance+backward compat',JSON.stringify({life:[probe.lo,probe.hi],red:probe.redDom,blue:probe.blueDom,px}));
 }finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
