const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),path=require('path');const server=require('../../server/server');
// Acceptance (embedded 3D workspace fidelity): a chroma-keyed video must render through the
// chroma-video shader in the embedded 3D editor, not as a grey placeholder plane. The grey
// fallback is reserved for clips the browser actually cannot decode.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});try{
 const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const p=await ctx.newPage();
 await p.goto(base+'/index.html');await p.waitForSelector('#element-list li');
 await p.locator('#file-video').setInputFiles(path.resolve('tests/fixtures/crop-video.mp4'));
 await p.waitForFunction(()=>document.querySelector('#video-upload-status').textContent.includes('נוסף'));
 const ids=await p.evaluate(async()=>{const r=await Studio.load(document.querySelector('#exp-select').value),v=r.elements.at(-1);v.chroma={enabled:true,color:'#00ff00',threshold:.3};
  // a plain (non-chroma) video reusing the same clip, and an image: both keep their media src on the ROOT entity
  const v2={id:'plainvid',type:'video',assetId:v.assetId,x:.4,y:-.3,w:.3};Studio.normEl(v2);
  const c=document.createElement('canvas');c.width=64;c.height=64;const g=c.getContext('2d');g.fillStyle='#ff00ff';g.fillRect(0,0,64,64);const blob=await new Promise(res=>c.toBlob(res,'image/png'));r.assets['imgasset']=blob;
  const im={id:'plainimg',type:'image',assetId:'imgasset',x:-.4,y:-.3,w:.25};Studio.normEl(im);
  r.elements.push(v2,im);await Studio.save(r);return {vid:v.id,v2:'plainvid',im:'plainimg'};});
 const vid=ids.vid;
 await p.reload();await p.waitForSelector('#element-list li');
 const canPlay=await p.evaluate(()=>document.createElement('video').canPlayType('video/mp4')!=='');
 assert.ok(canPlay,'this Chrome can decode mp4 (fixture type), so no fallback is legitimate');
 await p.evaluate(()=>{const w=document.querySelector('#canvas-wrap');scrollTo(0,w.getBoundingClientRect().top+scrollY-8);});
 await p.tap('#btn-3d');await p.waitForSelector('[data-el-root]',{state:'attached',timeout:20000});
 await p.waitForFunction(id=>document.querySelector('[chroma-video]'),vid,{timeout:20000});
 const spec=await p.evaluate(id=>{const n=document.querySelector('[data-el-root="'+id+'"]');const raw=n.querySelector('[chroma-video]')||n;const a=raw.getAttribute('chroma-video');const attr=(typeof a==='string')?a:JSON.stringify(a);return {tag:n.tagName,attr,grey:n.tagName==='A-PLANE'&&(n.getAttribute('material')||'').includes('#333'),dom:Element.prototype.getAttribute.call(raw,'chroma-video'),media:!!document.querySelector('#m3-'+CSS.escape(id)),sel:(()=>{try{return !!document.querySelector('#m3-'+id)}catch(e){return 'threw:'+e.message}})()};},vid);
 assert.ok(!spec.grey,'playable chroma clip must NOT fall back to the grey plane: '+spec.tag+' '+spec.attr);
 assert.ok(spec.attr.includes('#m3-'),'chroma src points at the local media copy: '+spec.attr);
 // shader mesh is alive with real video dimensions (proves the texture is streaming, not stalled)
 await p.waitForTimeout(1500);
 let alive=false;for(let i=0;i<40&&!alive;i++){await p.waitForTimeout(500);alive=await p.evaluate(id=>{let ok=false;document.querySelector('[data-el-root="'+id+'"]').object3D.traverse(n=>{if(n.material&&n.material.uniforms&&n.material.uniforms.map&&n.material.uniforms.map.value&&n.material.uniforms.map.value.image&&n.material.uniforms.map.value.image.videoWidth)ok=true;});return ok;},vid);}
 assert.ok(alive,'chroma shader mesh streaming real video (videoWidth>0)');
 await p.screenshot({path:'/downloads/rc63-chroma-3d.png'});
 // root-level media refs: plain video and image entities must point at the local #m3- copies
 const roots=await p.evaluate(({v2,im})=>{const pick=id=>{const n=document.querySelector('[data-el-root="'+id+'"]');if(!n)return {tag:'?'};const src=n.getAttribute('src');const raw=Element.prototype.getAttribute.call(n,'src');let ref=(src&&src.id)||(typeof src==='string'?src:null)||raw;let texLoaded=false;const mesh=n.getObject3D('mesh');if(mesh&&mesh.material&&mesh.material.map&&mesh.material.map.image)texLoaded=true;return {tag:n.tagName,ref,texLoaded};};return {v:pick(v2),i:pick(im)};},ids);
 assert.strictEqual(roots.v.tag,'A-VIDEO','plain video stays a-video: '+JSON.stringify(roots));
 assert.ok(String(roots.v.ref).includes('m3-'+ids.v2),'plain video root src rewritten to the local copy: '+JSON.stringify(roots.v));
 assert.strictEqual(roots.i.tag,'A-IMAGE','image stays a-image');
 assert.ok(String(roots.i.ref).includes('m3-'+ids.im),'image root src rewritten to the local copy: '+JSON.stringify(roots.i));
 assert.ok(roots.i.texLoaded,'image texture actually loaded from the local copy: '+JSON.stringify(roots.i));
 // negative control: an undecodable clip still gets the grey placeholder
 await p.evaluate(()=>{HTMLVideoElement.prototype.__cp=HTMLVideoElement.prototype.canPlayType;HTMLVideoElement.prototype.canPlayType=()=>'';});
 await p.tap('#btn-2d');await p.waitForTimeout(200);await p.tap('#btn-3d');await p.waitForTimeout(600);
 const grey=await p.evaluate(id=>{const n=document.querySelector('[data-el-root="'+id+'"]');return {tag:n.tagName,mat:JSON.stringify(n.getAttribute('material')||''),chroma:!!n.querySelector('[chroma-video]')};},vid);
 assert.ok(grey.tag==='A-PLANE'&&grey.mat.includes('#333')&&!grey.chroma,'undecodable clip still falls back to the grey plane: '+JSON.stringify(grey));
 console.log('PASS embedded 3D chroma: shader path for playable clips, grey plane only when undecodable; root image/video src point at local copies');
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
