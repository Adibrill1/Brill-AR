// OBJ+MTL+textures ZIP import (bounded 3D-format gap). Official source:
// https://www.artivive.com/resources/3d-objects (fetched 2026-10-25): OBJ works, ZIP may
// carry jpeg/png textures. Our subset is explicit in the import note: base color (Kd) and
// base texture (map_Kd) only; lighting maps, specular fields, normals are not imported.
// Texture references resolve path-first (as written, then MTL/OBJ-dir relative); a
// basename match is used only when unique - same-named files in different dirs error
// clearly instead of silently picking one.
const {chromium}=require('playwright-core'),assert=require('assert/strict'),path=require('path'),server=require('../../server/server');
// Quad (partial UVs, checker material) + second triangle (plain green material).
const OBJ='mtllib robot.mtl\nv 0 0 0\nv 2 0 0\nv 2 2 0\nv 0 2 0\nv 3 0 0\nv 3 2 0\nv 2 2 0\nvt 0 0\nvt 0.5 0\nvt 0.5 0.5\nvt 0 0.5\nusemtl checkermat\nf 1/1 2/2 3/3\nf 1/1 3/3 4/4\nusemtl green\nf 2 5 6\n';
const MTL='newmtl checkermat\nKd 1 1 1\nmap_Kd ../textures/checker.png\nnewmtl green\nKd 0 1 0\n';
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});try{
const p=await b.newPage({viewport:{width:1280,height:900}});p.on('pageerror',e=>console.log('PAGEERROR:',e.message));
await p.goto(base+'/index.html');await p.waitForSelector('#element-list li');
await p.locator('#btn-new').click();await p.locator('#file-artwork').setInputFiles(path.resolve('studio/library/star.png'));await p.waitForSelector('#sec-elements:not([hidden])');
// nested zip layout: model+mtl under assets/models/, texture under assets/textures/
const zip=await p.evaluate(({OBJ,MTL})=>{const enc=x=>new TextEncoder().encode(x);
  const c=document.createElement('canvas');c.width=64;c.height=64;const g=c.getContext('2d');
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){g.fillStyle=(x+y)%2?'#0000ff':'#ff0000';g.fillRect(x*8,y*8,8,8);}
  const png=Uint8Array.from(atob(c.toDataURL('image/png').split(',')[1]),ch=>ch.charCodeAt(0));
  return Array.from(fflate.zipSync({'assets/models/robot.obj':enc(OBJ),'assets/models/robot.mtl':enc(MTL),'assets/textures/checker.png':png}));},{OBJ,MTL});
await p.locator('#file-model').setInputFiles({name:'model.zip',mimeType:'application/zip',buffer:Buffer.from(zip)});
await p.waitForFunction(()=>document.querySelectorAll('#element-list li').length===1);
const note=await p.locator('#msg').innerText();
assert.ok(note.includes('Kd')&&note.includes('map_Kd'),'import note names the supported MTL subset: '+note);
console.log('PASS nested-path OBJ+MTL+texture ZIP imports and names its material subset');
// the converted GLB: two primitives, two materials, one embedded texture, white base on the textured one
const id=await p.evaluate(()=>document.querySelector('#exp-select').value);
const check=await p.evaluate(async id=>{const r=await Studio.load(id);const blob=r.assets[r.elements[0].assetId];
  const buf=await blob.arrayBuffer(),v=new DataView(buf);const len=v.getUint32(12,true);
  const doc=JSON.parse(new TextDecoder().decode(new Uint8Array(buf,20,len)));
  return {mats:doc.materials.map(m=>({name:m.name,fac:m.pbrMetallicRoughness.baseColorFactor,tex:!!(m.pbrMetallicRoughness.baseColorTexture)})),imgs:(doc.images||[]).length,prim:doc.meshes[0].primitives.length};},id);
assert.equal(check.prim,2,'two usemtl groups -> two primitives');
assert.equal(check.mats.length,2,'two materials');
const texMat=check.mats.find(m=>m.tex),green=check.mats.find(m=>m.name==='green');
assert.ok(texMat&&texMat.fac[0]===1&&texMat.fac[1]===1,'textured material has white (non-masking) base');
assert.ok(green&&green.fac[1]===1&&green.fac[0]===0,'green material kept its Kd');
assert.equal(check.imgs,1,'exactly one embedded texture (the nested checker.png)');
console.log('PASS converted GLB carries both materials and the nested texture',JSON.stringify(check));
// preview: real pixel proof - re-render the scene and read the framebuffer; a white-base
// material with no texture would be uniform, the checker must produce red AND blue bins
await p.goto(base+'/preview.html#'+id);
await p.waitForFunction(()=>document.querySelector('[gltf-model]')&&document.querySelector('[gltf-model]').getObject3D('mesh'));
const pix=await p.evaluate(async()=>{const s=document.querySelector('a-scene');
  await new Promise(r=>{if(s.hasLoaded)r();else s.addEventListener('loaded',r,{once:true});});
  await new Promise(r=>setTimeout(r,400));
  const r=s.renderer,gl=r.getContext();r.render(s.object3D,s.camera);
  const w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,buf=new Uint8Array(w*h*4);
  gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,buf);
  let red=0,blue=0;
  for(let i=0;i<buf.length;i+=4){if(buf[i]>150&&buf[i]>buf[i+2]+80)red++;if(buf[i+2]>150&&buf[i+2]>buf[i]+80)blue++;}
  return {w,h,red,blue};},null);
assert.ok(pix.red>50,'checker red cells visible in framebuffer: '+JSON.stringify(pix));
assert.ok(pix.blue>50,'checker blue cells visible in framebuffer (proves the texture is mapped, not a base-color fallback): '+JSON.stringify(pix));
console.log('PASS framebuffer shows both checker colors (real texture mapping, white base cannot mask it)',pix);
// 390px visual proof of the rendered model
await p.setViewportSize({width:390,height:844});await p.waitForTimeout(700);
await p.screenshot({path:'/downloads/model-obj-zip-390.png'});
console.log('PASS 390px preview renders the converted model (representative capture)');
// same-named texture in two dirs with a bare map_Kd ref: clear error, never a silent pick
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelectorAll('#exp-select option').length>0);
const zipAmb=await p.evaluate(({OBJ,MTL})=>{const enc=x=>new TextEncoder().encode(x);
  const c=document.createElement('canvas');c.width=4;c.height=4;c.getContext('2d').fillRect(0,0,4,4);
  const png=Uint8Array.from(atob(c.toDataURL('image/png').split(',')[1]),ch=>ch.charCodeAt(0));
  const mtl='newmtl m\nKd 1 1 1\nmap_Kd checker.png\n';
  const obj='mtllib m.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nusemtl m\nf 1/1 2/2 3/3\n';
  return Array.from(fflate.zipSync({'m.obj':enc(obj),'m.mtl':enc(mtl),'a/checker.png':png,'b/checker.png':png}));},{OBJ,MTL});
await p.locator('#file-model').setInputFiles({name:'model.zip',mimeType:'application/zip',buffer:Buffer.from(zipAmb)});
await p.waitForFunction(()=>document.querySelector('#msg').textContent.includes('a/checker.png'));
assert.ok((await p.locator('#msg').innerText()).includes('b/checker.png'),'ambiguity error names both candidate paths');
console.log('PASS same-named textures in different dirs refuse with both paths named (no silent pick)');
// missing texture file: clear error naming it
const zip2=await p.evaluate(({OBJ,MTL})=>{const enc=x=>new TextEncoder().encode(x);return Array.from(fflate.zipSync({'model.obj':enc(OBJ),'model.mtl':enc(MTL)}));},{OBJ,MTL});
await p.locator('#file-model').setInputFiles({name:'model.zip',mimeType:'application/zip',buffer:Buffer.from(zip2)});
await p.waitForFunction(()=>document.querySelector('#msg').textContent.includes('checker.png'));
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
