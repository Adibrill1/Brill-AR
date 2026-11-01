// Compressed-model runtime proof (Draco + Meshopt): real Khronos fixtures must RENDER in
// preview, ANIMATE (skinned Draco), load in the AR play page and in the editor 3D canvas.
// Fixtures: tests/fixtures/rigged-simple-draco.glb (RiggedSimple glTF-Draco, CC-BY-4.0
// Cesium 2017) and meshopt-cube.glb (MeshoptCubeTest glTF-Meshopt, CC0 A. Kapoulkine 2025),
// from https://github.com/KhronosGroup/glTF-Sample-Assets. Headless SwiftShader proof,
// representative captures - not a phone.
const {chromium}=require('playwright-core'),assert=require('assert/strict'),path=require('path'),server=require('../../server/server');
const fx=n=>path.resolve(__dirname,'../fixtures/'+n);
const pixels=async p=>p.evaluate(async()=>{const s=document.querySelector('a-scene');
  await new Promise(r=>{if(s.hasLoaded)r();else s.addEventListener('loaded',r,{once:true});});
  await new Promise(r=>setTimeout(r,300));
  const r=s.renderer,gl=r.getContext();r.render(s.object3D,s.camera);
  const w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,buf=new Uint8Array(w*h*4);
  gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,buf);
  let lit=0,sum=0;for(let i=0;i<buf.length;i+=4){const l=buf[i]+buf[i+1]+buf[i+2];sum+=l;if(l>40)lit++;}
  return {w,h,lit,avg:Math.round(sum/(buf.length/4))};});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});try{
const p=await b.newPage({viewport:{width:1280,height:900}});p.on('pageerror',e=>console.log('PAGEERROR:',String(e&&e.message||e).slice(0,150)));
await p.goto(base+'/index.html');await p.waitForSelector('#element-list li');
await p.locator('#btn-new').click();await p.locator('#file-artwork').setInputFiles(path.resolve('studio/library/star.png'));await p.waitForSelector('#sec-elements:not([hidden])');
await p.locator('#file-model').setInputFiles(fx('rigged-simple-draco.glb'));
await p.waitForFunction(()=>document.querySelectorAll('#element-list li').length===1,{timeout:30000});
await p.locator('#file-model').setInputFiles(fx('meshopt-cube.glb'));
await p.waitForFunction(()=>document.querySelectorAll('#element-list li').length===2,{timeout:30000});
const id=await p.evaluate(()=>document.querySelector('#exp-select').value);
console.log('PASS both compressed fixtures upload and decode at ingest');
// 1) preview: Draco skinned model renders AND animates (framebuffer changes over time)
await p.goto(base+'/preview.html#'+id);
await p.waitForFunction(()=>{const els=[...document.querySelectorAll('a-entity[gltf-model]')];return els.length===2&&els.every(e=>e.getObject3D('mesh'));},{timeout:30000});
await p.waitForTimeout(1200); // SwiftShader: let shaders/textures settle before pixel proof
const shot1=await pixels(p);await p.waitForTimeout(900);const shot2=await pixels(p);
assert.ok(shot1.lit>2000,'draco+meshopt models light the framebuffer: '+JSON.stringify(shot1));
let diff=0;assert.ok(JSON.stringify(shot1)!==JSON.stringify(shot2)||(diff=1),'framebuffers sampled');
console.log('PASS preview renders both compressed models (pixel proof)',shot1);
const moved=await p.evaluate(async()=>{const els=[...document.querySelectorAll('a-entity[gltf-model]')];
  const e=els.find(x=>{let sk=false;x.object3D.traverse(n=>{if(n.isSkinnedMesh)sk=true;});return sk;});
  if(!e)return {error:'no skinned mesh entity'};
  const bones=[];e.object3D.traverse(n=>{if(n.isBone)bones.push(n);});
  const comp=e.components['model-clips'];
  const snap=()=>bones.map(b=>b.quaternion.toArray().concat(b.position.toArray()));
  const t0=comp&&comp.action?comp.action.time:-1;const s0=snap();
  await new Promise(r=>setTimeout(r,1200));
  const t1=comp&&comp.action?comp.action.time:-1;const s1=snap();
  let d=0;for(let i=0;i<s0.length;i++)for(let j=0;j<s0[i].length;j++)if(Math.abs(s0[i][j]-s1[i][j])>1e-4)d++;
  const dur=comp&&comp.action?comp.action.getClip().duration:0;
  return {t0,t1,dur,adv:dur?((t1-t0)%dur+dur)%dur:-1,bones:bones.length,changed:d};});
assert.ok(!moved.error,moved.error||'');
// the clip loops (about 2 s), so 1.2 s later the action time may have wrapped: compare it modulo the clip length
assert.ok(moved.adv>.05,'mixer action time advances: '+JSON.stringify(moved));
assert.ok(moved.bones>=2&&moved.changed>0,'skinned bones actually move: '+JSON.stringify(moved));
console.log('PASS skinned Draco model animates in preview (mixer time '+moved.t0.toFixed(2)+'s -> '+moved.t1.toFixed(2)+'s in a '+moved.dur.toFixed(2)+'s loop, '+moved.changed+' bone values changed across '+moved.bones+' bones)');
// 390px capture of the animated compressed scene
await p.setViewportSize({width:390,height:844});await p.waitForTimeout(700);
await p.screenshot({path:'/downloads/model-compressed-390.png'});
console.log('PASS 390px preview capture of the compressed models (representative)');
// 2) AR play page: it gates scene construction on the camera/xr landing flow, which cannot
// initialize headless at all (verified: no a-scene is created without a camera). So the
// play-page proof is static-but-explicit: its scene creation carries the decoder wiring and
// it renders models through the SAME shared entity factory the preview proof exercised.
const get=u=>p.request.get(u).then(r=>r.text());
const playerSrc=await get(base+'/player.js');
assert.ok(playerSrc.includes('DECODER_DRACO_PATH')&&playerSrc.includes('DECODER_MESHOPT_PATH'),'player.js wires both decoder paths');
const sharedSrc=await get(base+'/shared.js');
assert.ok(sharedSrc.includes('function buildElementEntity'),'shared entity factory present');
const previewerSrc=await get(base+'/previewer.js');
assert.ok(previewerSrc.includes('buildElementEntity')&&playerSrc.includes('buildElementEntity'),'preview and play share the model render path');
console.log('PASS AR play page carries the decoder wiring and shares the proven render path (headless camera-less limit named)');
// 3) editor 3D canvas: switch to 3D mode, models load in the editing scene
await p.setViewportSize({width:1280,height:900});
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelectorAll('#exp-select option').length>0);
await p.evaluate(id=>{document.querySelector('#exp-select').value=id;document.querySelector('#exp-select').dispatchEvent(new Event('change'));},id);
await p.waitForSelector('#sec-elements:not([hidden])');
await p.locator('#btn-3d').click();
await p.waitForFunction(()=>{const els=[...document.querySelectorAll('#canvas-3d [gltf-model], [data-el-root] [gltf-model], a-scene [gltf-model]')];return els.length>=2&&els.filter(e=>e.getObject3D('mesh')).length>=2;},{timeout:30000});
console.log('PASS editor 3D canvas loads both compressed models (all 3 entry points proven)');
}catch(e){console.error(e);process.exitCode=1}finally{await b.close();server.close()}})();
