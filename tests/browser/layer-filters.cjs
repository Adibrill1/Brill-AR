// Image and video filters: the panel lists the six looks; choosing one saves it (one undo step) and "בלי" takes it off;
// the strength slider saves fxAmount; the 2D drawing differs per look and the moving looks move; the camera-free preview
// compiles the layer's own material with the filter (no shader error); imports refuse unknown looks and strengths.
const {chromium}=require('playwright-core'),assert=require('assert/strict'),server=require('../../server/server');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});try{
const ctx=await b.newContext({viewport:{width:1000,height:1000}}),p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error'&&!/Automatic fallback to software WebGL|GPU stall/.test(m.text()))errs.push(m.text().slice(0,300));});
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(800);
const id=await p.evaluate(async()=>{const id=document.querySelector('#exp-select').value,r=await Studio.load(id);r.assets.fxart=await (await fetch('assets/demo/artwork.jpg')).blob();
  r.elements.push({id:'fximg',type:'image',name:'תמונה לפילטר',assetId:'fxart',x:0,y:0,w:.6,h:.6,aspect:1,z:.02,rot:0});await Studio.save(r);return id;});
await p.reload();await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(1000);
await p.locator('#element-list li',{hasText:'תמונה לפילטר'}).first().click();await p.waitForFunction(()=>!document.querySelector('#row-crop').hidden);
assert.deepEqual(await p.$$eval('#sel-fx option',o=>o.map(x=>x.value)),['','halftone','letters','vhs','kaleido','papercut','glass']);
assert.equal(await p.locator('#sl-fx').isDisabled(),true,'no strength without a look');
const saved=()=>p.evaluate(async id=>{const el=(await Studio.load(id)).elements.find(e=>e.id==='fximg');return {fx:el.fx,fxAmount:el.fxAmount};},id);
await p.selectOption('#sel-fx','halftone');await p.waitForTimeout(800);assert.deepEqual(await saved(),{fx:'halftone',fxAmount:undefined});
await p.locator('#sl-fx').fill('0.8');await p.locator('#sl-fx').dispatchEvent('change');await p.waitForTimeout(900);assert.deepEqual(await saved(),{fx:'halftone',fxAmount:.8});
await p.selectOption('#sel-fx','');await p.waitForTimeout(800);assert.deepEqual(await saved(),{fx:undefined,fxAmount:undefined},'"בלי" takes the look and its strength off');
await p.click('#btn-undo');await p.waitForTimeout(900);assert.deepEqual(await saved(),{fx:'halftone',fxAmount:.8},'one undo step brings it back');
console.log('PASS panel: six looks, choose / strength / off, undo');
const looks=await p.evaluate(async()=>{const im=new Image();im.src='assets/demo/artwork.jpg';await im.decode();const el={type:'image'},out={};
  out.none=Studio.fxFrame(im,el,200,150,0);for(const f of Studio.FX){el.fx=f.id;out[f.id]=Studio.fxFrame(im,el,200,150,1).toDataURL();if(f.moving)out[f.id+'@3']=Studio.fxFrame(im,el,200,150,3).toDataURL();}
  el.fx='vhs';el.fxAmount=0;const weak=Studio.fxFrame(im,el,200,150,1).toDataURL();el.fxAmount=1;out.vhsStrength=weak!==Studio.fxFrame(im,el,200,150,1).toDataURL();
  out.text=Studio.fxFrame(im,{type:'text',fx:'vhs'},200,150,1);return out;});
assert.equal(looks.none,null,'no look: the media is drawn as it is');assert.equal(looks.text,null,'only images and video take a look');
const ids=['halftone','letters','vhs','kaleido','papercut','glass'];assert.equal(new Set(ids.map(i=>looks[i])).size,6,'every look draws differently');
for(const i of ['vhs','kaleido','glass'])assert.notEqual(looks[i],looks[i+'@3'],i+' moves');assert.equal(looks.vhsStrength,true,'strength changes the look');
console.log('PASS 2D: six different looks, the moving three move, strength matters');
if(await p.locator('#row-crop').isHidden())await p.locator('#element-list li',{hasText:'תמונה לפילטר'}).first().click();
await p.selectOption('#sel-fx','kaleido');for(let i=0;i<40&&(await saved()).fx!=='kaleido';i++)await p.waitForTimeout(250);assert.equal((await saved()).fx,'kaleido');
const q=await ctx.newPage();q.on('pageerror',e=>errs.push('preview: '+String(e)));q.on('console',m=>{if(m.type()==='error'&&!/Automatic fallback to software WebGL|GPU stall/.test(m.text()))errs.push('preview: '+m.text().slice(0,300));});
await q.goto(base+'/preview.html#'+id);
const mat=await q.waitForFunction(()=>{const e=document.querySelector('[data-el-id="fximg"]'),m=e&&e.getObject3D('mesh'),r=document.querySelector('a-scene')?.renderer;if(!m||!m.material||!m.material.map||!r)return false;
  const prog=r.properties.get(m.material).currentProgram;return prog&&{fx:e.getAttribute('studio-fx').mode,key:prog.cacheKey.includes('studio-fx'),runnable:prog.diagnostics?prog.diagnostics.runnable:true};},null,{timeout:30000}).then(h=>h.jsonValue());
assert.deepEqual(mat,{fx:4,key:true,runnable:true},'the layer material runs the filter program');
console.log('PASS preview: the image material compiles and runs with the kaleidoscope');
assert.deepEqual(await p.evaluate(()=>[Studio.validFx({type:'image',fx:'glass',fxAmount:.3}),Studio.validFx({type:'video'}),Studio.validFx({type:'image',fx:'blur'}),Studio.validFx({type:'text',fx:'vhs'}),Studio.validFx({type:'image',fx:'vhs',fxAmount:2})]),[true,true,false,false,false]);
console.log('PASS import check refuses unknown looks, looks on other layers, strength outside 0-1');
assert.deepEqual(errs,[]);
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
