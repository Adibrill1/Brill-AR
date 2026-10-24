const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),fs=require('fs');const server=require('../../server/server');
// Regression: render the back layer after the alpha plane to reproduce video-overlay depth holes.
// Round AV: overlapping transparent image layers in the 3D scene. Blue opaque square
// behind, red square with a transparent left half in front. Checks PNG alpha (back
// shows through the hole), z-order occlusion when swapped, and 0.5-opacity blending.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{const p=await b.newPage({viewport:{width:800,height:600}});p.on('pageerror',e=>console.log('PAGE',e.message));await p.goto(base+'/preview.html');await p.evaluate(async()=>{
 document.querySelectorAll('#err,#hint,#topbar').forEach(n=>n.remove());
 const png=(draw)=>new Promise(res=>{const c=document.createElement('canvas');c.width=64;c.height=64;draw(c.getContext('2d'));c.toBlob(res,'image/png');});
 const rec=Studio.blankExperience('transparency');rec.target={artRect:{x:0,y:0,w:768,h:1024},natural:{w:768,h:1024}};
 rec.assets={back:await png(g=>{g.fillStyle='#0000ff';g.fillRect(0,0,64,64);}),front:await png(g=>{g.fillStyle='#ff0000';g.fillRect(32,0,32,64);})};
 rec.elements=[{id:'back',type:'image',assetId:'back',x:0,y:0,w:.4,rot:0,z:0},{id:'front',type:'image',assetId:'front',x:0,y:0,w:.4,rot:0,z:.05}];
 window.qa={rec};
 window.build=(frontZ,frontOpacity)=>{const old=document.querySelector('a-scene');if(old)old.remove();const r=structuredClone(rec);r.elements[1].z=frontZ;if(frontOpacity!=null)r.elements[1].opacity=frontOpacity;
  const scene=document.createElement('a-scene');scene.setAttribute('embedded','');scene.setAttribute('renderer','preserveDrawingBuffer: true; colorManagement: true');scene.style.cssText='position:fixed;inset:0';
  const assets=document.createElement('a-assets');for(const k of['back','front']){const img=document.createElement('img');img.id='m-'+k;img.src=URL.createObjectURL(r.assets[k]);assets.append(img);}scene.append(assets);
  const camera=document.createElement('a-entity');camera.setAttribute('camera','');camera.setAttribute('position','0 0 2');scene.append(camera);
  const rig=document.createElement('a-entity');scene.append(rig);r.elements.forEach((el,i)=>rig.append(Studio.buildElementEntity(r,el,i,'preview')));document.body.append(scene);};
 });
 const sample=async(label)=>{await p.evaluate(([z,o])=>build(z,o),label==='front-behind'?[-0.05,null]:label==='front-half-opacity'?[0.05,0.5]:[0.05,null]);
  await p.waitForFunction(()=>{const s=document.querySelector('a-scene');return s&&s.renderer&&s.camera&&[...document.querySelectorAll('[data-el-id]')].every(n=>n.getObject3D('mesh'));});
  return p.evaluate((label)=>{document.querySelectorAll('[data-el-id]').forEach(n=>{if(n.dataset.opacity)Studio.applyOpacity(n,parseFloat(n.dataset.opacity));});const scene=document.querySelector('a-scene');scene.renderer.setSize(800,600);scene.camera.aspect=800/600;scene.camera.updateProjectionMatrix();scene.object3D.updateMatrixWorld(true);if(label!=='front-half-opacity')document.querySelector('[data-el-id=back]').getObject3D('mesh').renderOrder=1;scene.renderer.render(scene.object3D,scene.camera);
   const c=document.createElement('canvas');c.width=800;c.height=600;c.getContext('2d').drawImage(scene.canvas,0,0);const d=c.getContext('2d').getImageData(0,0,800,600).data;
   // find the colored span on the center row, then sample left/right inside it
   const y=300;let spanL=1e9,spanR=-1;for(let x=0;x<800;x++){const i=(y*800+x)*4;if(d[i]+d[i+2]>60&&d[i+1]<80){if(x<spanL)spanL=x;if(x>spanR)spanR=x;}}
   if(spanR<0)throw new Error('no colored pixels on center row for '+label);
   const inset=Math.max(2,Math.round((spanR-spanL)/8));const at=(x)=>{const i=(y*800+x)*4;return[d[i],d[i+1],d[i+2]];};
   return{label,spanL,spanR,left:at(spanL+inset),right:at(spanR-inset),png:c.toDataURL()};},label);};
 const A=await sample('front-nearer'),B=await sample('front-behind'),C=await sample('front-half-opacity');
 [A,B,C].forEach((r,i)=>fs.writeFileSync('/downloads/alpha-depth-'+i+'-'+r.label+'.png',Buffer.from(r.png.split(',')[1],'base64')));
 console.log(JSON.stringify([A,B,C].map(({png,...x})=>x)));
 assert(A.left[2]>100&&A.left[0]<100,'A hole shows blue '+A.left);assert(A.right[0]>150&&A.right[2]<100,'A red in front '+A.right);
 assert(B.left[2]>100&&B.left[0]<100,'B left blue '+B.left);assert(B.right[2]>100&&B.right[0]<100,'B red occluded '+B.right);
 assert(C.left[2]>100&&C.left[0]<100,'C hole blue '+C.left);assert(C.right[0]>60&&C.right[2]>60,'C half-opacity blend '+C.right);
 console.log('PASS transparent PNG hole shows layer behind, z-order occlusion, half-opacity blend');}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
