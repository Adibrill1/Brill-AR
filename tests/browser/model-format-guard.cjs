// Model format honesty guard: compressed GLB (Draco/Meshopt) is refused at upload with
// a clear reason and fix; OBJ-in-ZIP gets a specific refusal naming the supported paths.
// Grounded in https://www.artivive.com/resources/3d-objects (fetched 2026-10-25): glTF/GLB
// preferred, OBJ/FBX work, ZIP with textures; the official page's Blender "Compression"
// checkbox is exactly what produces the files we now refuse clearly until decoder support
// is decided (decoder libs are a separate dependency decision).
const {chromium}=require('playwright-core'),assert=require('assert/strict'),path=require('path'),server=require('../../server/server');
function glb(extensionsRequired){
  const json=Buffer.from(JSON.stringify({asset:{version:'2.0'},scene:0,scenes:[{nodes:[]}],extensionsRequired}),'utf8');
  const n=(json.length+3)&~3,out=Buffer.alloc(20+n,0x20);
  out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(n,12);out.writeUInt32LE(0x4e4f534a,16);json.copy(out,20);
  return out;
}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
const p=await b.newPage({viewport:{width:1280,height:900}});p.on('pageerror',e=>console.log('PAGEERROR:',e.message));
await p.goto(base+'/index.html');await p.waitForSelector('#element-list li');
await p.locator('#btn-new').click();await p.locator('#file-artwork').setInputFiles(path.resolve('studio/library/star.png'));await p.waitForSelector('#sec-elements:not([hidden])');
// A GLB that DECLARES KHR_draco_mesh_compression but has no compressed primitives is
// loadable (the loader never needs the decoder) - honest behavior is to accept it.
await p.locator('#file-model').setInputFiles({name:'flagged.glb',mimeType:'model/gltf-binary',buffer:glb(['KHR_draco_mesh_compression'])});
await p.waitForFunction(()=>document.querySelectorAll('#element-list li').length===1,{timeout:30000});
console.log('PASS flag-only GLB (no compressed primitives) imports - declaring the extension is not itself a failure');
// A REAL compressed file whose payload is corrupted must be refused by the decode check.
const corrupt=n=>{const fs=require('fs');const b=Buffer.from(fs.readFileSync(require('path').resolve(__dirname,'../fixtures/'+n)));
  const jsonLen=b.readUInt32LE(12);
  const doc=JSON.parse(b.subarray(20,20+jsonLen).toString());
  // find the actual compressed payload: the bufferView the mesh extension points at
  const primExt=(doc.meshes[0].primitives[0].extensions||{}).KHR_draco_mesh_compression;
  let off;
  const binStart=12+8+jsonLen+8;
  if(primExt){ // draco: payload sits inside the bufferView the primitive extension names
    const bv=doc.bufferViews[primExt.bufferView];
    off=binStart+(bv.byteOffset||0)+8;
  } else { // meshopt: payload sits at the extension's source buffer offset
    const holder=doc.bufferViews.find(x=>x.extensions&&(x.extensions.EXT_meshopt_compression||x.extensions.KHR_meshopt_compression));
    const ext=holder.extensions.EXT_meshopt_compression||holder.extensions.KHR_meshopt_compression;
    off=binStart+(ext.byteOffset||0)+8;
  }
  for(let i=0;i<48;i++)b[off+i]^=0xFF;return b;};
await p.locator('#file-model').setInputFiles({name:'broken-draco.glb',mimeType:'model/gltf-binary',buffer:corrupt('rigged-simple-draco.glb')});
await p.waitForFunction(()=>document.querySelector('#msg').textContent.includes('פגום או לא ניתן לפענוח'),{timeout:30000});
assert.equal(await p.locator('#element-list li').count(),1,'corrupted Draco file was not added');
console.log('PASS corrupted real Draco GLB refused by the decode check (names the failure)');
await p.locator('#file-model').setInputFiles({name:'broken-meshopt.glb',mimeType:'model/gltf-binary',buffer:corrupt('meshopt-cube.glb')});
await p.waitForFunction(()=>document.querySelector('#msg').textContent.match(/פגום או לא ניתן לפענוח|מפענח/),{timeout:30000});
assert.equal(await p.locator('#element-list li').count(),1,'corrupted Meshopt file was not added');
console.log('PASS corrupted real Meshopt GLB refused by the decode check');
// OBJ inside ZIP is converted since rc77 (see model-obj-zip.cjs); a zip with no model at all still refuses clearly
const bytes=await p.evaluate(()=>{const enc=x=>new TextEncoder().encode(x);return Array.from(fflate.zipSync({'readme.txt':enc('no model here')}) );});
await p.locator('#file-model').setInputFiles({name:'model.zip',mimeType:'application/zip',buffer:Buffer.from(bytes)});
await p.waitForFunction(()=>document.querySelector('#msg').textContent.includes('מודל אחד בלבד'));
assert.equal(await p.locator('#element-list li').count(),1,'model-less zip not added (only the flag-only import)');
console.log('PASS model-less ZIP refused with a clear message');
// control: a normal GLB still imports
await p.locator('#file-model').setInputFiles(path.resolve('studio/library/gem.glb'));
await p.waitForFunction(()=>document.querySelectorAll('#element-list li').length===2);
console.log('PASS uncompressed GLB still imports (control)');
// REAL compressed-geometry fixtures (not flag-only): official Khronos glTF-Sample-Assets.
// rigged-simple-draco.glb = RiggedSimple glTF-Draco variant (CC-BY-4.0, Cesium 2017,
// https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/RiggedSimple),
// repacked gltf+bin -> GLB. meshopt-cube.glb = MeshoptCubeTest glTF-Meshopt variant (CC0,
// Arseny Kapoulkine 2025, .../Models/MeshoptCubeTest), textures stripped, repacked. Both
// carry true compressed bufferViews in extensionsRequired.
const fx=n=>require('path').resolve(__dirname,'../fixtures/'+n);
await p.locator('#file-model').setInputFiles(fx('rigged-simple-draco.glb'));
await p.waitForFunction(()=>document.querySelectorAll('#element-list li').length===3,{timeout:30000});
console.log('PASS real Draco-compressed GLB (Khronos RiggedSimple) decodes at upload and imports');
await p.locator('#file-model').setInputFiles(fx('meshopt-cube.glb'));
await p.waitForFunction(()=>document.querySelectorAll('#element-list li').length===4,{timeout:30000});
// the stored asset was normalized off the ratified KHR_ spelling for the r158 loader
const norm=await p.evaluate(async()=>{const id=document.querySelector('#exp-select').value;const r=await Studio.load(id);
  const els=r.elements.filter(e=>e.type==='model');const blob=r.assets[els[els.length-1].assetId];
  const buf=await blob.arrayBuffer();const v=new DataView(buf);const len=v.getUint32(12,true);
  const doc=JSON.parse(new TextDecoder().decode(new Uint8Array(buf,20,len)));
  return {req:doc.extensionsRequired,bvExt:Object.keys((doc.bufferViews.find(b=>b.extensions)||{}).extensions||{})};});
assert.ok(norm.req.includes('EXT_meshopt_compression')&&!norm.req.includes('KHR_meshopt_compression'),'KHR_meshopt normalized to EXT at ingest: '+JSON.stringify(norm));
assert.deepEqual(norm.bvExt,['EXT_meshopt_compression'],'bufferView extension key renamed too');
console.log('PASS real Meshopt GLB (ratified KHR_ name) imports, normalized to the loader-supported spelling',norm);
// phone-width visual: the refusal must be readable, not clipped
await p.setViewportSize({width:390,height:844});await p.waitForTimeout(400);
await p.locator('#file-model').setInputFiles({name:'broken-draco-390.glb',mimeType:'model/gltf-binary',buffer:corrupt('rigged-simple-draco.glb')});
await p.waitForFunction(()=>document.querySelector('#msg').textContent.includes('פגום או לא ניתן לפענוח'),{timeout:30000});
await p.locator('#msg').scrollIntoViewIfNeeded();await p.waitForTimeout(200);
await p.screenshot({path:'/downloads/model-format-guard-390.png'});
assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow at 390px');
console.log('PASS 390px refusal message renders without horizontal overflow (representative capture)');
}catch(e){console.error(e);process.exitCode=1}finally{await b.close();server.close()}})();
