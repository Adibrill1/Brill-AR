const {chromium}=require('playwright-core'),assert=require('assert/strict'),server=require('../../server/server');
// Regression: an image added while the 3D view is already mounted got no media node, so its entity had no texture (blank white plane).
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
try{const p=await (await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})).newPage();
 await p.goto(base+'/index.html');await p.waitForSelector('#element-list li');await p.waitForTimeout(1500);
 await p.evaluate(()=>{[...document.querySelectorAll('button,[role=tab],label')].filter(x=>x.textContent.trim()==='3D')[0].click()});await p.waitForTimeout(3500);
 const n0=await p.evaluate(()=>document.querySelectorAll('[data-el-root]').length);
 await p.setInputFiles('#file-image','tests/fixtures/red.png');await p.waitForTimeout(4000);
 const r=await p.evaluate(()=>[...document.querySelectorAll('[data-el-root]')].filter(n=>n.tagName==='A-IMAGE').map(n=>{const m=n.getObject3D('mesh'),mat=m&&m.material;return {map:!!(mat&&mat.map&&mat.map.image&&mat.map.image.width)}}));
 console.log(JSON.stringify({n0,r}));assert.equal(await p.evaluate(()=>document.querySelectorAll('[data-el-root]').length),n0+1,'the added layer is in the 3D scene');
 assert(r.length>=2&&r.every(x=>x.map),'every image layer, including the one added after 3D mounted, has its texture: '+JSON.stringify(r));
 console.log('PASS editor-3d-late-media (headless; not a phone)');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
