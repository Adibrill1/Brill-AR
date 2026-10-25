// OBJ+MTL+textures ZIP import (bounded 3D-format gap). Official source:
// https://www.artivive.com/resources/3d-objects (fetched 2026-10-25): OBJ works, ZIP may
// carry jpeg/png textures. Our subset is explicit in the import note: base color (Kd) and
// base texture (map_Kd) only; lighting maps, specular fields, normals are not imported.
const {chromium}=require('playwright-core'),assert=require('assert/strict'),path=require('path'),server=require('../../server/server');
const PNG_1PX='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const OBJ='mtllib model.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nusemtl redmat\nf 1/1 2/2 3/3\n';
const MTL='newmtl redmat\nKd 1 0 0\nmap_Kd tex.png\n';
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});try{
const p=await b.newPage({viewport:{width:1280,height:900}});p.on('pageerror',e=>console.log('PAGEERROR:',e.message));
await p.goto(base+'/index.html');await p.waitForSelector('#element-list li');
await p.locator('#btn-new').click();await p.locator('#file-artwork').setInputFiles(path.resolve('studio/library/star.png'));await p.waitForSelector('#sec-elements:not([hidden])');
const zip=await p.evaluate(({OBJ,MTL,PNG_1PX})=>{const enc=x=>new TextEncoder().encode(x);const png=Uint8Array.from(atob(PNG_1PX),c=>c.charCodeAt(0));return Array.from(fflate.zipSync({'model.obj':enc(OBJ),'model.mtl':enc(MTL),'tex.png':png}));},{OBJ,MTL,PNG_1PX});
await p.locator('#file-model').setInputFiles({name:'model.zip',mimeType:'application/zip',buffer:Buffer.from(zip)});
await p.waitForFunction(()=>document.querySelectorAll('#element-list li').length===1);
const note=await p.locator('#msg').innerText();
assert.ok(note.includes('Kd')&&note.includes('map_Kd'),'import note names the supported MTL subset: '+note);
console.log('PASS OBJ+MTL+texture ZIP imports and names its material subset');
// the converted GLB is valid and carries the material + texture
const id=await p.evaluate(()=>document.querySelector('#exp-select').value);
const check=await p.evaluate(async id=>{const r=await Studio.load(id);const blob=r.assets[r.elements[0].assetId];
  const buf=await blob.arrayBuffer(),v=new DataView(buf);const len=v.getUint32(12,true);
  const doc=JSON.parse(new TextDecoder().decode(new Uint8Array(buf,20,len)));
  return {mats:doc.materials,hasTex:(doc.images||[]).length===1&&(doc.textures||[]).length===1,prim:doc.meshes[0].primitives.length};},id);
assert.equal(check.mats[0].pbrMetallicRoughness.baseColorFactor[0],1,'Kd red imported');
assert.equal(check.mats[0].pbrMetallicRoughness.baseColorFactor[1],0,'Kd green=0');
assert.ok(check.hasTex,'texture embedded in the GLB');
console.log('PASS converted GLB carries base color and an embedded texture',check);
// preview renders it with the material (scene-level proof)
await p.goto(base+'/preview.html#'+id);
await p.waitForFunction(()=>document.querySelector('[gltf-model]')&&document.querySelector('[gltf-model]').object3D&&document.querySelector('[gltf-model]').getObject3D('mesh'));
const mat=await p.evaluate(()=>{let out=null;document.querySelector('[gltf-model]').object3D.traverse(n=>{if(n.material&&!out){out={color:[n.material.color.r,n.material.color.g,n.material.color.b],hasMap:!!n.material.map};}});return out;});
assert.ok(mat&&mat.hasMap,'scene material has the texture bound: '+JSON.stringify(mat));
assert.ok(mat.color[0]===1&&mat.color[1]===0,'scene material base color is the MTL red');
console.log('PASS preview scene binds the imported texture and base color',mat);
// 390px visual proof of the rendered model
await p.setViewportSize({width:390,height:844});await p.waitForTimeout(700);
await p.screenshot({path:'/downloads/model-obj-zip-390.png'});
console.log('PASS 390px preview renders the converted model (representative capture)');
// missing texture file: clear error naming it
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelectorAll('#exp-select option').length>0);
const zip2=await p.evaluate(({OBJ,MTL})=>{const enc=x=>new TextEncoder().encode(x);return Array.from(fflate.zipSync({'model.obj':enc(OBJ),'model.mtl':enc(MTL)}));},{OBJ,MTL});
await p.locator('#file-model').setInputFiles({name:'model.zip',mimeType:'application/zip',buffer:Buffer.from(zip2)});
await p.waitForFunction(()=>document.querySelector('#msg').textContent.includes('tex.png'));
assert.ok((await p.locator('#msg').innerText()).includes('טקסטורה חסרה'),'missing texture named in the error');
console.log('PASS missing texture file in ZIP fails with the file named');
// geometry-only OBJ (no mtllib line): converts too, with the same subset note
const obj3='v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n';
const zip3=await p.evaluate(o=>{const enc=x=>new TextEncoder().encode(x);return Array.from(fflate.zipSync({'plain.obj':enc(o)}));},obj3);
const before=await p.locator('#element-list li').count();
await p.locator('#file-model').setInputFiles({name:'plain.zip',mimeType:'application/zip',buffer:Buffer.from(zip3)});
await p.waitForFunction(n=>document.querySelectorAll('#element-list li').length===n+1,before);
assert.ok((await p.locator('#msg').innerText()).includes('Kd'),'geometry-only import also carries the subset note');
console.log('PASS geometry-only OBJ ZIP imports (no MTL) with the subset note');
}catch(e){console.error(e);process.exitCode=1}finally{await b.close();server.close()}})();
