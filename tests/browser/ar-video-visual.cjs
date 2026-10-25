const {chromium}=require('playwright-core'),assert=require('assert/strict'),fs=require('fs'),path=require('path'),server=require('../../server/server');
// Visual acceptance: portrait artwork + landscape 2:1 video rendered through the actual
// 'ar' video factory must match the editor/preview proportions pixel for pixel.
// Isolated scene, not a real-device AR claim.
(async()=>{fs.copyFileSync(path.join(__dirname,'../fixtures/visual-2x1.mp4'),path.join(__dirname,'../../studio/library/tmp-visual-2x1.mp4'));await new Promise(r=>server.listen(0,'127.0.0.1',r));const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});try{const p=await b.newPage({viewport:{width:800,height:600}});p.on('pageerror',e=>console.log('PAGE',e.message));await p.goto('http://127.0.0.1:'+server.address().port+'/preview.html');await p.evaluate(async()=>{document.querySelectorAll('#err,#hint,#topbar').forEach(n=>n.remove());
 const rec=Studio.blankExperience('ar visual');rec.target={artRect:{x:0,y:0,w:768,h:1024}}; // portrait artwork
 rec.elements=[{id:'vid',type:'video',x:0,y:0,w:.9,h:.9/(2/(768/1024*.75)),aspect:2,z:0,rot:0}];
 // h chosen so normalized box matches source aspect 2 with artwork ratio, exactly as a fresh import computes
 const g=Studio.geom(rec);rec.elements[0].h=rec.elements[0].w/rec.elements[0].aspect*g.artW/g.artH;
 window.build=mode=>{document.querySelector('a-scene')?.remove();const s=document.createElement('a-scene');s.setAttribute('embedded','');s.setAttribute('renderer','preserveDrawingBuffer:true; colorManagement:true');s.style.cssText='position:fixed;inset:0';const assets=document.createElement('a-assets'),v=document.createElement('video');v.id='m-vid';v.src='/library/tmp-visual-2x1.mp4';v.muted=true;v.loop=true;v.playsInline=true;v.autoplay=true;v.preload='auto';assets.append(v);s.append(assets);const cam=document.createElement('a-entity');cam.setAttribute('camera','');cam.setAttribute('position','0 0 1');s.append(cam);const target=document.createElement('a-entity');target.id='target';target.append(Studio.buildElementEntity(rec,rec.elements[0],0,mode));s.append(target);document.body.append(s);v.play().catch(()=>{});};});
 const pump=()=>p.evaluate(()=>{const n=document.querySelector('[data-el-id=vid]');document.getElementById('target').dispatchEvent(new Event('xrextrasfound'));const c=n.components['studio-target-video'];for(let i=1;i<=60;i++)c.tick(i*16,16);});
 const snap=async(mode)=>{await p.evaluate(m=>build(m),mode);await p.waitForFunction(()=>{const mesh=document.querySelector('[data-el-id=vid]')?.getObject3D('mesh');return mesh?.material.map?.image?.readyState>=2;});if(mode==='ar')await pump();await p.waitForFunction(()=>{const mesh=document.querySelector('[data-el-id=vid]')?.getObject3D('mesh');return mesh?.material.map?.image?.readyState>=2&&mesh.material.opacity>0.95;});
  return p.evaluate(()=>{const s=document.querySelector('a-scene');s.renderer.setSize(800,600);s.camera.aspect=800/600;s.camera.updateProjectionMatrix();s.object3D.updateMatrixWorld(true);s.renderer.render(s.object3D,s.camera);
   const c=document.createElement('canvas');c.width=800;c.height=600;const g=c.getContext('2d');g.drawImage(s.canvas,0,0);const d=g.getImageData(0,0,800,600).data;
   let minX=1e9,maxX=-1,minY=1e9,maxY=-1,red=0,blue=0;
   for(let y=0;y<600;y++)for(let x=0;x<800;x++){const i=(y*800+x)*4,r=d[i],gr=d[i+1],bl=d[i+2];
    const isRed=r>120&&gr<100&&bl<100,isBlue=bl>120&&r<100&&gr<130;
    if(isRed||isBlue){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;if(isRed)red++;else blue++;}}
   return {w:maxX-minX+1,h:maxY-minY+1,ratio:(maxX-minX+1)/(maxY-minY+1),red,blue,png:c.toDataURL()};});};
 const PV=await snap('preview'),AR=await snap('ar');
 fs.writeFileSync('/downloads/rc58-ar-video-preview.png',Buffer.from(PV.png.split(',')[1],'base64'));
 fs.writeFileSync('/downloads/rc58-ar-video-ar.png',Buffer.from(AR.png.split(',')[1],'base64'));
 console.log(JSON.stringify({preview:{w:PV.w,h:PV.h,ratio:PV.ratio,red:PV.red,blue:PV.blue},ar:{w:AR.w,h:AR.h,ratio:AR.ratio,red:AR.red,blue:AR.blue}}));
 assert.ok(AR.red>2000&&AR.blue>2000,'both halves of the landscape video visible in AR render');
 assert.ok(Math.abs(AR.ratio-2)<0.15,'AR video keeps 2:1 source proportions, got '+AR.ratio);
 assert.ok(Math.abs(AR.ratio-PV.ratio)<0.02,'AR proportions match preview ('+AR.ratio+' vs '+PV.ratio+')');
 assert.ok(Math.abs(AR.w-PV.w)<4&&Math.abs(AR.h-PV.h)<4,'AR footprint matches preview pixels');
 console.log('PASS AR video factory renders identical 2:1 proportions on portrait artwork');}finally{await b.close();await new Promise(r=>server.close(r));fs.rmSync(path.join(__dirname,'../../studio/library/tmp-visual-2x1.mp4'),{force:true});}})().catch(e=>{console.error(e);process.exit(1)});
