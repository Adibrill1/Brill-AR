const {chromium}=require('playwright-core'),assert=require('assert/strict'),zlib=require('node:zlib'),server=require('../../server/server');
// Regression: tapping a visible foreground layer that is flush (same z) with a layer behind it picked the layer behind
// (ray ties ignored the stacking order). Transparent pixels of an image layer must not steal the tap either.
function png(w,h,fn){const raw=Buffer.alloc((w*4+1)*h);for(let y=0;y<h;y++){raw[y*(w*4+1)]=0;for(let x=0;x<w;x++){const c=fn(x,y),o=y*(w*4+1)+1+x*4;raw[o]=c[0];raw[o+1]=c[1];raw[o+2]=c[2];raw[o+3]=c[3]}}
 const crcT=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crcT[n]=c>>>0}const crc=b=>{let c=~0;for(const x of b)c=crcT[(c^x)&255]^(c>>>8);return(~c)>>>0};
 const ch=(t,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([l,td,c])};
 const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),ch('IHDR',ih),ch('IDAT',zlib.deflateSync(raw)),ch('IEND',Buffer.alloc(0))])}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
try{const p=await (await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})).newPage();
 await p.goto(base+'/index.html');await p.waitForSelector('#element-list li');await p.waitForTimeout(1500);
 // remove the default demo layers so only the two test layers overlap
 p.on('dialog',d=>d.accept());
 for(let i=0;i<20;i++){const n=await p.evaluate(()=>document.querySelectorAll('#element-list li').length);if(!n)break;await p.evaluate(()=>{document.querySelector('#element-list li').click();[...document.querySelectorAll('#panel button')].filter(b=>/מחיקת אלמנט/.test(b.textContent))[0].click()});await p.waitForTimeout(300)}
 assert.equal(await p.evaluate(()=>document.querySelectorAll('#element-list li').length),0,'demo layers removed');
 await p.setInputFiles('#file-video','tests/fixtures/visual-2x1.mp4');await p.waitForTimeout(1500);
 const dot=png(64,64,(x,y)=>Math.hypot(x-32,y-32)<14?[255,215,0,255]:[0,0,0,0]);
 await p.setInputFiles('#file-image',{name:'dot.png',mimeType:'image/png',buffer:dot});await p.waitForTimeout(1500);
 await p.evaluate(()=>{[...document.querySelectorAll('button,[role=tab],label')].filter(x=>x.textContent.trim()==='3D')[0].click()});await p.waitForTimeout(3500);
 const info=await p.evaluate(()=>{const rec=Studio.load?null:null;const roots=[...document.querySelectorAll('[data-el-root]')];const vid=roots.filter(n=>n.tagName==='A-VIDEO').pop(),img=roots.filter(n=>n.tagName==='A-IMAGE').pop();
  const sc=document.querySelector('a-scene'),cv=sc.canvas.getBoundingClientRect();const pr=(o,fx,fy)=>{const m=o.getObject3D('mesh');const bx=new THREE.Box3().setFromObject(m);const q=new THREE.Vector3(bx.min.x+(bx.max.x-bx.min.x)*fx,bx.min.y+(bx.max.y-bx.min.y)*fy,(bx.min.z+bx.max.z)/2).project(sc.camera);return [cv.left+(q.x+1)/2*cv.width,cv.top+(1-q.y)/2*cv.height]};
  const z=o=>{const q=new THREE.Vector3();o.getObject3D('mesh').getWorldPosition(q);return +q.z.toFixed(4)};
  const bi=new THREE.Box3().setFromObject(img.getObject3D('mesh')),bv=new THREE.Box3().setFromObject(vid.getObject3D('mesh'));
  return {vid:vid.getAttribute('data-el-root'),img:img.getAttribute('data-el-root'),zv:z(vid),zi:z(img),rov:vid.getObject3D('mesh').renderOrder,roi:img.getObject3D('mesh').renderOrder,ci:pr(img,.5,.5),ti:pr(img,.06,.94),wi:bi.max.x-bi.min.x,wv:bv.max.x-bv.min.x}});
 console.log(JSON.stringify(info));
 assert.ok(Math.abs(info.zv-info.zi)<0.0006&&info.roi>info.rov,'precondition: flush layers at the same z, the image stacked above the video '+JSON.stringify(info));
 const head=async(pt)=>{await p.touchscreen.tap(pt[0]+0,pt[1]);await p.waitForTimeout(600);return p.evaluate(()=>((document.querySelector('#panel')||{}).innerText||'').split('\n')[0].trim())};
 console.log('dbg',JSON.stringify(await p.evaluate((pt)=>{const sc=document.querySelector('a-scene');const cv=sc.canvas.getBoundingClientRect();const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((pt[0]-cv.left)/cv.width*2-1,-((pt[1]-cv.top)/cv.height*2-1)),sc.camera);const tg=[];document.querySelectorAll('[data-el-root]').forEach(n=>tg.push(n.object3D));const h=ray.intersectObjects(tg,true);return h.map(x=>[x.object.el&&x.object.el.tagName,+x.distance.toFixed(5),x.object.renderOrder,Editor3D._test.alphaAt(x),x.uv&&[+x.uv.x.toFixed(2),+x.uv.y.toFixed(2)]])},info.ci)));console.log('pre',await p.evaluate(()=>(document.querySelector('#panel').innerText||'').split('\n')[0]));const h2=await head(info.ci);assert.ok(/תמונה/.test(h2),'a tap on the visible dot selects the top image layer, not the flush video behind it (got '+JSON.stringify(h2)+')');
 const h1=await head(info.ti);assert.ok(/סרטון/.test(h1),'a tap on the transparent corner of the top image layer selects the video behind it (got '+JSON.stringify(h1)+')');
 // her case: the layer BEHIND is selected, so its handles sit on top of the foreground layer. A tap on the visible dot must still select the dot.
 const list=await p.evaluate(()=>[...document.querySelectorAll('#element-list li')].map(l=>l.textContent));console.log(JSON.stringify(list));
 await p.touchscreen.tap(info.ti[0],info.ti[1]);await p.waitForTimeout(600);assert.ok(/סרטון/.test(await p.evaluate(()=>(document.querySelector('#panel').innerText||'').split('\n')[0])),'video selected first');
 const st=await p.evaluate(()=>({n:document.querySelector('#editor-3d-host')?1:0}));
 const keyBefore=await p.evaluate(()=>JSON.stringify(Studio.exportRec?null:null));
 const h3=await head(info.ci);assert.ok(/תמונה/.test(h3),'with the video selected (its handles over the dot), a tap on the dot selects the dot (got '+JSON.stringify(h3)+')');
 console.log('PASS editor-3d-pick-overlap (headless; not a phone)');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
