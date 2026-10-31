const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Starter library: every entry's file and thumbnail is served, every GLB passes the editor's model check and parses with
// three.js GLTFLoader into meshes, the filters show the right counts, and adding a model and a loop from the dialog
// creates the two layers with the library names. Phone width (390); writes a dialog screenshot when SHOT is set.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});try{
const p=await (await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})).newPage();const pageErrors=[];p.on('pageerror',e=>pageErrors.push(String(e)));
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(1500);
const lib=await p.evaluate(async()=>{
  const out={n:StarterLibrary.entries.length,groups:{},bad:[],models:[]};
  for(const e of StarterLibrary.entries){out.groups[e.group]=(out.groups[e.group]||0)+1;
    for(const f of [e.file,e.thumb].filter(Boolean)){const r=await fetch('library/'+f);if(!r.ok)out.bad.push(f+' '+r.status);}}
  const loader=new THREE.GLTFLoader();
  for(const e of StarterLibrary.entries.filter(x=>x.kind==='model')){
    const blob=await (await fetch('library/'+e.file)).blob();let ok='ok';
    try{await Studio.validateModelBlob(blob);}catch(err){ok='validate: '+err.message;}
    if(ok==='ok'){const ab=await blob.arrayBuffer();ok=await new Promise(res=>loader.parse(ab,'',g=>{let meshes=0;g.scene.traverse(o=>{if(o.isMesh)meshes++;});res(meshes?'ok':'no meshes');},err=>res('parse: '+((err&&err.message)||err))));}
    out.models.push([e.id,ok,blob.size]);}
  return out;});
assert.equal(lib.n,50,'50 entries');assert.deepEqual(lib.groups,{original:6,model:36,loop:8});assert.deepEqual(lib.bad,[],'all files and thumbnails served');
const badModels=lib.models.filter(m=>m[1]!=='ok');assert.deepEqual(badModels,[],'every model validates and parses');
assert.ok(lib.models.every(m=>m[2]<=20*1048576),'every model under the 20MB model limit');
// dialog: filters + add one model and one loop
const openLib=async()=>{await p.locator('#shell-tabs button[data-tab="layers"]').click().catch(()=>{});await p.getByRole('button',{name:'ספריית התחלה'}).first().click();await p.waitForSelector('#starter-library[open]');};
await openLib();
const counts=await p.evaluate(()=>[...document.querySelectorAll('.library-filters button')].map(b=>b.textContent));
assert.deepEqual(counts,['הכול (50)','תלת־ממד (36)','לולאות וידאו (8)','מקוריים (6)']);
await p.click('.library-filters button[data-group="model"]');
const visible=await p.evaluate(()=>[...document.querySelectorAll('.library-card')].filter(c=>!c.hidden).length);assert.equal(visible,36,'model filter shows 36');
if(process.env.SHOT)await p.screenshot({path:process.env.SHOT});
const before=await p.evaluate(()=>document.querySelectorAll('#element-list li').length);
await p.click('[data-library-id="ph-lantern_01"]');await p.waitForFunction(n=>document.querySelectorAll('#element-list li').length>n,before,{timeout:30000});
await openLib();await p.click('.library-filters button[data-group="loop"]');await p.click('[data-library-id="loop-synthwave"]');
await p.waitForFunction(n=>document.querySelectorAll('#element-list li').length>n+1,before,{timeout:30000});await p.waitForTimeout(1500);
const added=await p.evaluate(async()=>{const r=await Studio.load(document.querySelector('#exp-select').value);return r.elements.slice(-2).map(e=>({type:e.type,name:e.name,loop:e.loop,bytes:r.assets[e.assetId]&&r.assets[e.assetId].size,mime:r.assets[e.assetId]&&r.assets[e.assetId].type}));});
assert.equal(added[0].type,'model');assert.equal(added[0].name,'פנס ישן');assert.equal(added[0].mime,'model/gltf-binary');
assert.equal(added[1].type,'video');assert.equal(added[1].name,'סינת׳ווייב');assert.equal(added[1].mime,'video/mp4');assert.notEqual(added[1].loop,false,'loop on');
assert.deepEqual(pageErrors,[],'no page errors');
console.log('PASS starter-library: 50 entries, 37 GLBs validated and parsed (largest '+(Math.max(...lib.models.map(m=>m[2]))/1048576).toFixed(1)+'MB), filters, add model + loop');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
