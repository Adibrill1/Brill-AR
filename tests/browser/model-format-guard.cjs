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
// Draco-flagged GLB: refused with a named reason
await p.locator('#file-model').setInputFiles({name:'draco.glb',mimeType:'model/gltf-binary',buffer:glb(['KHR_draco_mesh_compression'])});
await p.waitForFunction(()=>document.querySelector('#msg').textContent.includes('Draco'));
assert.ok((await p.locator('#msg').innerText()).includes('אינו נתמך'),'Draco refusal names the limitation');
assert.equal(await p.locator('#element-list li').count(),0,'refused model was not added');
console.log('PASS Draco-compressed GLB refused at upload with a named reason and fix');
// Meshopt-flagged GLB: same guard
await p.locator('#file-model').setInputFiles({name:'meshopt.glb',mimeType:'model/gltf-binary',buffer:glb(['EXT_meshopt_compression'])});
await p.waitForFunction(()=>document.querySelector('#msg').textContent.includes('Meshopt'));
assert.equal(await p.locator('#element-list li').count(),0,'meshopt model not added');
console.log('PASS Meshopt-compressed GLB refused at upload with a named reason and fix');
// OBJ inside ZIP: specific refusal naming supported paths
const bytes=await p.evaluate(()=>{const enc=x=>new TextEncoder().encode(x);const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),c=>c.charCodeAt(0));return Array.from(fflate.zipSync({'model.obj':enc('v 0 0 0\nv 1 0 0\nv 0 1 0\nmtllib model.mtl\nusemtl m\nf 1 2 3\n'),'model.mtl':enc('newmtl m\nKd 1 0 0\nmap_Kd tex.png\n'),'tex.png':png}));});
await p.locator('#file-model').setInputFiles({name:'model.zip',mimeType:'application/zip',buffer:Buffer.from(bytes)});
await p.waitForFunction(()=>document.querySelector('#msg').textContent.includes('OBJ'));
assert.ok((await p.locator('#msg').innerText()).includes('glb/gltf'),'OBJ-zip refusal names the supported zip contents');
assert.equal(await p.locator('#element-list li').count(),0,'OBJ zip not added');
console.log('PASS OBJ-in-ZIP refused with a specific message naming supported paths');
// control: a normal GLB still imports
await p.locator('#file-model').setInputFiles(path.resolve('studio/library/gem.glb'));
await p.waitForFunction(()=>document.querySelectorAll('#element-list li').length===1);
console.log('PASS uncompressed GLB still imports (control)');
// phone-width visual: the refusal must be readable, not clipped
await p.setViewportSize({width:390,height:844});await p.waitForTimeout(400);
await p.locator('#file-model').setInputFiles({name:'draco.glb',mimeType:'model/gltf-binary',buffer:glb(['KHR_draco_mesh_compression'])});
await p.waitForFunction(()=>document.querySelector('#msg').textContent.includes('Draco'));
await p.locator('#msg').scrollIntoViewIfNeeded();await p.waitForTimeout(200);
await p.screenshot({path:'/downloads/model-format-guard-390.png'});
assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow at 390px');
console.log('PASS 390px refusal message renders without horizontal overflow (representative capture)');
}catch(e){console.error(e);process.exitCode=1}finally{await b.close();server.close()}})();
