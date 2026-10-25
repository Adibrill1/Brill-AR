const {chromium}=require('playwright-core'),assert=require('assert/strict'),fs=require('fs'),server=require('../../server/server');
// Regression: a text layer's transparent canvas pixels must not render as an opaque
// box or punch depth holes through video rendered later (user report: black band
// behind added text during broadcast). Glyph pixels stay white and readable.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});try{const p=await b.newPage({viewport:{width:800,height:600}});p.on('pageerror',e=>console.log('PAGE',e.message));await p.goto('http://127.0.0.1:'+server.address().port+'/preview.html');await p.evaluate(async()=>{document.querySelectorAll('#err,#hint,#topbar').forEach(n=>n.remove());
 const rec=Studio.blankExperience('text alpha');rec.target={artRect:{x:0,y:0,w:768,h:1024}};
 rec.elements=[{id:'background',type:'video',x:0,y:0,w:1,h:.5,aspect:2,z:0},{id:'caption',type:'text',text:'HELLO',color:'#ffffff',bold:true,x:0,y:0,w:.8,h:.2,rot:0,z:.05}];
 window.build=()=>{document.querySelector('a-scene')?.remove();const s=document.createElement('a-scene');s.setAttribute('embedded','');s.setAttribute('renderer','preserveDrawingBuffer:true; colorManagement:true');s.style.cssText='position:fixed;inset:0';const assets=document.createElement('a-assets'),v=document.createElement('video');v.id='m-background';v.src='/library/orbit.mp4';v.muted=true;v.loop=true;v.autoplay=true;v.playsInline=true;assets.append(v);s.append(assets);const cam=document.createElement('a-entity');cam.setAttribute('camera','');cam.setAttribute('position','0 0 1');s.append(cam);s.append(Studio.buildElementEntity(rec,rec.elements[0],0,'preview'));s.append(Studio.buildElementEntity(rec,rec.elements[1],1,'preview'));document.body.append(s);v.play().catch(()=>{});};});
 await p.evaluate(()=>build());await p.waitForFunction(()=>{const s=document.querySelector('a-scene');const bg=document.querySelector('[data-el-id=background]')?.getObject3D('mesh'),tx=document.querySelector('[data-el-id=caption]')?.getObject3D('mesh');return !!s?.camera&&bg?.material.map?.image.readyState>=2&&tx?.material.map?.image?.complete&&tx.material.map.image.naturalWidth>0;});
 const result=await p.evaluate(()=>{const s=document.querySelector('a-scene'),back=document.querySelector('[data-el-id=background]').getObject3D('mesh'),tx=document.querySelector('[data-el-id=caption]').getObject3D('mesh');
  back.renderOrder=2; // video drawn after the text plane: reproduces the depth-hole ordering
  s.renderer.setSize(800,600);s.camera.aspect=800/600;s.camera.updateProjectionMatrix();s.object3D.updateMatrixWorld(true);
  const c=document.createElement('canvas');c.width=800;c.height=600;const g=c.getContext('2d');
  const draw=()=>{s.renderer.render(s.object3D,s.camera);g.clearRect(0,0,800,600);g.drawImage(s.canvas,0,0);};
  const geo=tx.geometry.parameters;
  const at=(x,y)=>{const pos=tx.localToWorld(new THREE.Vector3(x,y,0)).project(s.camera);return Array.from(g.getImageData(Math.round((pos.x+1)*400),Math.round((1-pos.y)*300),1,1).data);};
  draw();const corner=at(-geo.width/2*.85,geo.height/2*.85);
  tx.visible=false;draw();const behind=at(-geo.width/2*.85,geo.height/2*.85);tx.visible=true;draw();
  // count near-white glyph pixels across the frame (exact glyph position varies by font metrics)
  let white=0;const all=g.getImageData(0,0,800,600).data;for(let i=0;i<all.length;i+=4)if(all[i]>200&&all[i+1]>200&&all[i+2]>200)white++;
  return {corner,behind,white,alphaTest:tx.material.alphaTest,depthWrite:tx.material.depthWrite,png:c.toDataURL()};});
 fs.writeFileSync('/downloads/text-alpha.png',Buffer.from(result.png.split(',')[1],'base64'));
 console.log(JSON.stringify({corner:result.corner,behind:result.behind,white:result.white,alphaTest:result.alphaTest,depthWrite:result.depthWrite}));
 assert.ok(result.alphaTest>0,'text material discards fully transparent texels');
 assert.ok(result.depthWrite!==false,'glyph pixels keep writing depth so later-drawn layers cannot paint over them');
 assert.deepEqual(result.corner,result.behind,'transparent text area reveals exact video pixels, no black box');
 assert.ok(result.white>1000,'white glyphs rendered ('+result.white+' near-white pixels)');
 console.log('PASS text transparency: no opaque box, no depth hole over video');}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
