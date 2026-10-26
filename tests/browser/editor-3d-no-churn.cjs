const {chromium}=require('playwright-core'),assert=require('assert/strict'),server=require('../../server/server');
// Regression: draw() calls Editor3D.sync() on every frame; sync used to rebuild every material and texture each 250ms
// (program re-link, texture re-upload, white flashes). It must rebuild only when the composition changed.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
try{const p=await (await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.addInitScript(()=>{window.__links=0;for(const C of [WebGLRenderingContext,WebGL2RenderingContext]){const o=C.prototype.linkProgram;C.prototype.linkProgram=function(pr){window.__links++;return o.call(this,pr)}}});
 await p.goto(base+'/index.html');await p.waitForSelector('#element-list li');await p.waitForTimeout(1500);
 await p.evaluate(()=>{[...document.querySelectorAll('button,[role=tab],label')].filter(x=>x.textContent.trim()==='3D')[0].click()});await p.waitForTimeout(4000);
 const snap=()=>p.evaluate(()=>{const out=[];document.querySelector('a-scene').object3D.traverse(o=>{if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>out.push(m.uuid))});return {mats:out,rebuilds:Editor3D._test.rebuilds(),links:window.__links,textures:document.querySelector('a-scene').renderer.info.memory.textures,programs:document.querySelector('a-scene').renderer.info.programs.length}});
 const s0=await snap();await p.waitForTimeout(3500);const s1=await snap();
 console.log(JSON.stringify({s0:{...s0,mats:s0.mats.length},s1:{...s1,mats:s1.mats.length}}));
 assert(s0.mats.length>=3,'3D scene has meshes: '+s0.mats.length);
 assert.deepEqual(s1.mats,s0.mats,'material objects are not replaced while nothing changes');assert.equal(s1.rebuilds,s0.rebuilds,'no rebuild while idle: '+s0.rebuilds+' -> '+s1.rebuilds);assert.equal(s1.links,s0.links,'no shader program links while idle: '+(s1.links-s0.links));
 // a real change still rebuilds, once
 await p.evaluate(()=>{[...document.querySelectorAll('button')].find(x=>x.textContent.includes('+ טקסט')).click()});await p.waitForTimeout(2500);const s2=await snap();await p.waitForTimeout(2500);const s3=await snap();
 console.log(JSON.stringify({s2:{...s2,mats:s2.mats.length},s3:{...s3,mats:s3.mats.length}}));
 assert.equal(s2.rebuilds,s1.rebuilds+1,'adding a layer triggers exactly one rebuild: '+s1.rebuilds+' -> '+s2.rebuilds);assert(s2.mats.length>s1.mats.length,'new layer is in the 3D scene');assert.equal(s3.rebuilds,s2.rebuilds,'and then idles again');assert.deepEqual(s3.mats,s2.mats);
 assert.deepEqual(errs,[]);console.log('PASS editor-3d-no-churn (headless SwiftShader; not a phone)');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
