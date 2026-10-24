const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),fs=require('fs');const server=require('../../server/server');
// Round AY: switching the selected embedded clip must not leave residue from channels
// the old clip drove but the new one does not. rotclip.glb: clip0 sways x AND rotates
// 90deg z; clip1 rises vertically (translation only). After clip0@t=1 then clip1@t=0,
// translation and rotation must both return to base.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{const p=await b.newPage({viewport:{width:800,height:600}});p.on('pageerror',e=>console.log('PAGE',e.message));await p.route('**/tests/fixtures/rotclip.glb',r=>r.fulfill({path:require('path').join(__dirname,'../fixtures/rotclip.glb'),contentType:'model/gltf-binary'}));await p.goto(base+'/preview.html');await p.evaluate(async()=>{
 document.querySelectorAll('#err,#hint,#topbar').forEach(n=>n.remove());const rec=Studio.blankExperience('clip switch');rec.target={artRect:{x:0,y:0,w:768,h:1024},natural:{w:768,h:1024}};
 rec.assets.model=await fetch('/../tests/fixtures/rotclip.glb').then(r=>r.blob());rec.elements=[{id:'m',type:'model',assetId:'model',x:0,y:0,w:.5,rot:0,modelLoop:false}];
 const scene=document.createElement('a-scene');scene.setAttribute('embedded','');scene.setAttribute('renderer','preserveDrawingBuffer: true; colorManagement: true');scene.style.cssText='position:fixed;inset:0';const light=document.createElement('a-light');light.setAttribute('type','ambient');light.setAttribute('intensity','1');scene.append(light);const camera=document.createElement('a-entity');camera.setAttribute('camera','');camera.setAttribute('position','0 0 2');scene.append(camera);const rig=document.createElement('a-entity');scene.append(rig);rig.append(Studio.buildElementEntity(rec,rec.elements[0],0,'preview'));document.body.append(scene);
 });await p.waitForFunction(()=>document.querySelector('[model-clips]')?.components['model-clips']?.mixer);
 const steps=await p.evaluate(async()=>{const e=document.querySelector('[model-clips]'),comp=e.components['model-clips'],scene=document.querySelector('a-scene');comp.pause();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));scene.renderer.setSize(800,600);scene.camera.aspect=800/600;scene.camera.updateProjectionMatrix();
  const node=e.getObject3D('mesh').getObjectByName('moving');
  const shot=(label)=>{scene.object3D.updateMatrixWorld(true);scene.renderer.render(scene.object3D,scene.camera);const c=document.createElement('canvas');c.width=800;c.height=600;c.getContext('2d').drawImage(scene.canvas,0,0);const d=c.getContext('2d').getImageData(0,0,800,600).data;let n=0,x=0,y=0;for(let i=0;i<d.length;i+=4)if(d[i]>150&&d[i+1]<60&&d[i+2]<60){n++;x+=(i/4)%800;y+=Math.floor((i/4)/800);}return{label,n,x:x/n,y:y/n,pos:node.position.toArray(),quat:node.quaternion.toArray(),png:c.toDataURL()};};
  const seek=(clip,time)=>{e.setAttribute('model-clips',{clip,speed:1,playing:false,loop:false});comp.action.time=time;comp.mixer.update(0);};
  const out=[];
  seek(0,0);out.push(shot('clip0-t0'));
  seek(0,1);out.push(shot('clip0-t1'));
  seek(1,0);out.push(shot('clip1-t0'));
  seek(1,1);out.push(shot('clip1-t1'));
  return out;});
 console.log(steps.map(({png,...x})=>x));
 for(let i=0;i<steps.length;i++)fs.writeFileSync('/downloads/model-clipswitch-'+i+'.png',Buffer.from(steps[i].png.split(',')[1],'base64'));
 const[c0,c1,s0,s1]=steps;
 assert(Math.abs(c1.pos[0]-c0.pos[0])>0.05,'clip0 sways x');
 assert(Math.abs(c1.quat[2])>0.5,'clip0 rotates z at t=1: '+c1.quat);
 assert(Math.abs(s0.pos[0]-0)<1e-3&&Math.abs(s0.pos[1]+0.25)<1e-3,'clip1 t0 translation is its own first key, not clip0 residue: '+s0.pos);
 assert(Math.abs(s0.quat[2])<1e-3&&Math.abs(s0.quat[3]-1)<1e-3,'clip1 t0 rotation residue-free: '+s0.quat);
 assert(Math.abs(s1.pos[1]-s0.pos[1])>0.05,'clip1 rises y');
 console.log('PASS clip switch leaves no residue on undriven rotation channel');}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
