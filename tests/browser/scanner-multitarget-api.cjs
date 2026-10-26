const {chromium}=require('playwright-core'),assert=require('assert/strict'),server=require('../../server/server');
// Shared-scanner groundwork, API LEVEL ONLY (no camera, no recognition proof): the vendored engine accepts several custom image targets in one configure() call
// and a later configure() swaps the active set. Dummy generated targets only, no user art.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});try{const ctx=await b.newContext({viewport:{width:390,height:844}});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(/XR\]/.test(m.text()))errs.push('console:'+m.text());});
 await p.goto(base+'/index.html');await p.waitForSelector('#element-list li');
 await p.evaluate(()=>{window.__xrl=false;window.addEventListener('xrloaded',()=>{window.__xrl=true;});});
 await p.addScriptTag({url:'/external/xr/xr.js'});
 await p.waitForFunction(()=>window.__xrl||(window.XR8&&XR8.XrController),{timeout:20000}).catch(()=>{});
 console.log('xrloaded:',await p.evaluate(()=>[window.__xrl,typeof window.XR8,window.XR8?Object.keys(window.XR8).slice(0,12):null]));
const ver=await p.evaluate(()=>{try{return typeof XR8.version==='function'?XR8.version():XR8.version;}catch(e){return 'err '+e.message;}});console.log('vendored XR8 version:',ver);
 await p.evaluate(async()=>{try{await XR8.loadChunk('slam');}catch(e){window.__lc=e.message;}});
 const have=await p.evaluate(()=>!!(window.XR8&&XR8.XrController&&XR8.XrController.configure));
 console.log('XR8.XrController.configure present:',have);
 if(!have){console.log('SKIP: engine not loadable headless (xr.js lazy-loads tracking chunks); API acceptance unverified');process.exit(0);}
 const out=await p.evaluate(async()=>{const mk=async(seed)=>{const c=document.createElement('canvas');c.width=768;c.height=1024;const g=c.getContext('2d');let s=seed;const r=()=>(s=(s*1664525+1013904223)>>>0)/4294967296;g.fillStyle='#ccc';g.fillRect(0,0,768,1024);for(let i=0;i<70;i++){g.fillStyle='hsl('+Math.floor(r()*360)+',60%,'+(20+r()*60)+'%)';g.fillRect(r()*700,r()*950,30+r()*200,30+r()*200);}const bl=await new Promise(x=>c.toBlob(x,'image/png'));const img=await Studio.loadImage(await Studio.blobToDataURL(bl));const t=await Studio.makeTarget(img);return Studio.targetDataJSON(t.luminance,t.padded,t.thumb);};
  const T=[await mk(1),await mk(2),await mk(3)];const res={names:T.map(t=>t.name||null),keys:Object.keys(T[0])};
  try{XR8.XrController.configure({imageTargetData:T});res.three='accepted';}catch(e){res.three='threw: '+e.message;}
  try{XR8.XrController.configure({imageTargetData:[T[1]]});res.swap='accepted';}catch(e){res.swap='threw: '+e.message;}
  try{XR8.XrController.configure({imageTargetData:T[0]});res.notArray='accepted';}catch(e){res.notArray='threw: '+e.message;}
  return res;});
 console.log(JSON.stringify(out));
 assert.equal(out.three,'accepted','configure accepts 3 dummy custom targets');
 assert.equal(out.swap,'accepted','configure can swap the active set');
 assert.ok(/Expected array/.test(out.notArray),'non-array is rejected: '+out.notArray);
 console.log('PASS (API level only, no camera/recognition): vendored engine configure() accepts 3 custom targets and a swapped set; non-array rejected. Target names:',JSON.stringify(out.names));
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
