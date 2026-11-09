// Pattern layers: "+ רקע ודוגמה" adds a layer drawn in code over the whole artwork, behind the other layers; the panel
// lists 16 looks (a swatch each, bringing its own colours), 8 colour sets, three colours, size, movement and 5 shapes;
// each change is saved (a swatch is one undo step); the 2D drawing differs per look, moves only with movement, and a
// round shape leaves its corners clear; the camera-free preview compiles the plane's own material with the pattern;
// imports refuse unknown looks, colours and values.
const {chromium}=require('playwright-core'),assert=require('assert/strict'),server=require('../../server/server');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});try{
const ctx=await b.newContext({viewport:{width:1000,height:1000}}),p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error'&&!/Automatic fallback to software WebGL|GPU stall/.test(m.text()))errs.push(m.text().slice(0,300));});
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(800);
const id=await p.evaluate(()=>document.querySelector('#exp-select').value);
await p.click('#btn-pattern');await p.waitForFunction(()=>!document.querySelector('#row-pattern').hidden);await p.waitForTimeout(800);
const saved=()=>p.evaluate(async id=>{const r=await Studio.load(id),g=Studio.geom(r),i=r.elements.findIndex(e=>e.type==='pattern'),el=r.elements[i];return {i,w:el.w,h:el.h,aspect:el.aspect,art:g.artW/g.artH,pattern:el.pattern};},id);
let s=await saved();
assert.equal(s.i,0,'the pattern goes behind the other layers');assert.deepEqual([s.w,s.h],[1,1],'it covers the whole artwork');assert.ok(Math.abs(s.aspect-s.art)<1e-9);
assert.deepEqual(s.pattern,{look:'liquid',colors:['#ff6b9a','#7b5cff','#ffd36e'],size:.5,speed:.35,seed:0,shape:'art'});
assert.equal(await p.locator('#pattern-looks .swatch').count(),16);assert.equal(await p.locator('#pattern-palettes .swatch').count(),8);
assert.deepEqual(await p.$$eval('#pat-shape option',o=>o.map(x=>x.value)),['art','square','circle','arch','pill']);
assert.equal(await p.locator('#pattern-looks .swatch[aria-pressed="true"]').getAttribute('data-look'),'liquid');
assert.ok(await p.$$eval('#pattern-looks .swatch-pic',ps=>ps.every(x=>x.style.backgroundImage.startsWith('url("data:image/png'))),'every swatch shows its look');
await p.click('#pattern-looks [data-look="dots"]');await p.waitForTimeout(800);s=await saved();
assert.deepEqual(s.pattern,{look:'dots',colors:['#fff4e0','#ff5a5f','#2ec4b6'],size:.5,speed:0,seed:0,shape:'art'},'a swatch brings its own colours and movement');
await p.click('#btn-undo');await p.waitForTimeout(900);s=await saved();assert.equal(s.pattern.look,'liquid','one undo step');
if(await p.locator('#row-pattern').isHidden())await p.locator('#element-list li',{hasText:'רקע 1'}).first().click();
await p.click('#pattern-looks [data-look="dots"]');await p.waitForTimeout(800);
await p.click('#pattern-palettes .swatch[aria-label="יער"]');await p.waitForTimeout(800);s=await saved();assert.deepEqual(s.pattern.colors,['#1b4332','#52b788','#d8f3dc']);
await p.locator('#pat-c2').fill('#123456');await p.waitForTimeout(1200);s=await saved();assert.deepEqual(s.pattern.colors,['#1b4332','#123456','#d8f3dc'],'one colour changes alone');
for(const [sel,v] of [['#pat-size','0.8'],['#pat-speed','0.6']]){await p.locator(sel).fill(v);await p.locator(sel).dispatchEvent('change');await p.waitForTimeout(900);}
s=await saved();assert.equal(s.pattern.size,.8);assert.equal(s.pattern.speed,.6);
await p.selectOption('#pat-shape','circle');await p.waitForTimeout(800);s=await saved();
assert.equal(s.pattern.shape,'circle');assert.equal(s.aspect,1);assert.ok(Math.abs(s.h-s.w*s.art)<1e-9,'a circle is as tall as it is wide');
await p.click('#btn-pat-shuffle');await p.waitForTimeout(800);s=await saved();assert.equal(s.pattern.seed,1);
await p.click('#btn-pat-fill');await p.waitForTimeout(800);s=await saved();assert.deepEqual([s.pattern.shape,s.w,s.h],['art',1,1],'fill: back over the whole artwork');
console.log('PASS editor: add behind, 16 looks with their colours, colour sets, colours, size, movement, shapes, shuffle, fill, undo');
const looks=await p.evaluate(()=>{const out={},el=(look,o)=>({type:'pattern',pattern:Object.assign(Studio.patternDefaults(look),o||{})}),url=(e,t)=>Studio.patternFrame(e,120,90,t).toDataURL();
  for(const pt of Studio.PATTERNS)out[pt.id]=url(el(pt.id),1);
  out.liquidStill=url(el('liquid',{speed:0}),1)===url(el('liquid',{speed:0}),4);out.liquidMoves=url(el('liquid',{speed:.5}),1)!==url(el('liquid',{speed:.5}),4);
  out.dotsMove=url(el('dots',{speed:.5}),1)!==url(el('dots',{speed:.5}),4);out.seed=url(el('terrazzo'),0)!==url(el('terrazzo',{seed:3}),0);
  out.colours=url(el('stripes'),0)!==url(el('stripes',{colors:['#000000','#ffffff','#888888']}),0);out.size=url(el('dots'),0)!==url(el('dots',{size:1}),0);
  const c=document.createElement('canvas');c.width=c.height=100;const g=c.getContext('2d');g.drawImage(Studio.patternFrame(el('dots',{shape:'circle'}),100,100,0),0,0,100,100);
  out.corner=g.getImageData(2,2,1,1).data[3];out.middle=g.getImageData(50,50,1,1).data[3];
  out.notPattern=Studio.patternFrame({type:'image'},10,10,0);return out;});
assert.equal(new Set(Studio_ids().map(i=>looks[i])).size,16,'every look draws differently');
assert.equal(looks.liquidStill,true,'no movement: the same picture over time');assert.equal(looks.liquidMoves,true);assert.equal(looks.dotsMove,true,'a repeating pattern drifts with movement');
assert.equal(looks.seed,true,'shuffle changes the random looks');assert.equal(looks.colours,true);assert.equal(looks.size,true);
assert.equal(looks.corner,0,'a circle leaves its corners clear');assert.equal(looks.middle,255);assert.equal(looks.notPattern,null);
console.log('PASS 2D: 16 different looks; movement, shuffle, colours and size change the picture; the circle is cut');
const q=await ctx.newPage();q.on('pageerror',e=>errs.push('preview: '+String(e)));q.on('console',m=>{if(m.type()==='error'&&!/Automatic fallback to software WebGL|GPU stall/.test(m.text()))errs.push('preview: '+m.text().slice(0,300));});
await q.goto(base+'/preview.html#'+id);
const mat=await q.waitForFunction(()=>{const e=document.querySelector('a-scene [studio-pattern]'),m=e&&e.getObject3D('mesh'),r=document.querySelector('a-scene')?.renderer;if(!m||!m.material||!r)return false;
  const prog=r.properties.get(m.material).currentProgram;return prog&&{look:JSON.parse(e.getAttribute('studio-pattern').values).bpMode,key:prog.cacheKey.includes('studio-pattern'),runnable:prog.diagnostics?prog.diagnostics.runnable:true};},null,{timeout:30000}).then(h=>h.jsonValue());
assert.deepEqual(mat,{look:8,key:true,runnable:true},'the plane material runs the pattern program');
console.log('PASS preview: the plane material compiles and runs with the dots');
const ok={look:'hex',colors:['#000000','#ffffff','#abcdef'],size:0,speed:1,seed:999,shape:'pill'};
assert.deepEqual(await p.evaluate(ok=>[{type:'pattern',pattern:ok},{type:'pattern',pattern:{...ok,look:'plaid'}},{type:'pattern',pattern:{...ok,colors:['red','#ffffff','#000000']}},
  {type:'pattern',pattern:{...ok,size:2}},{type:'pattern',pattern:{...ok,seed:1.5}},{type:'pattern',pattern:{...ok,shape:'star'}},{type:'pattern'},{type:'image',pattern:ok},{type:'image'}].map(Studio.validPattern),ok),
  [true,false,false,false,false,false,false,false,true]);
console.log('PASS import check refuses unknown looks, colours, values and shapes, and patterns on other layers');
assert.deepEqual(errs,[]);
function Studio_ids(){return ['liquid','soft','lights','waves','rays','topo','marble','dots','stripes','gingham','zigzag','scales','hex','arcs','hearts','terrazzo'];}
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
