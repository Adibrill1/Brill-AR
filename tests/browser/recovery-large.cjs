const {chromium}=require('playwright-core'),assert=require('assert/strict'),server=require('../../server/server');
// Desktop-resource check of the recovery boundary: 150 layers, 3 x 30MiB media (90MiB total) ZIP -> recovery import, original untouched.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
 const p=await b.newPage();p.on('pageerror',e=>console.log('PAGE',e.message));await p.goto(base+'/index.html');await p.waitForSelector('#exp-select option',{state:'attached'});
 const out=await p.evaluate(async()=>{
  const M=30*1024*1024,r=Studio.blankExperience('שחזור גדול');r.target={artRect:{x:0,y:0,w:768,h:1024},natural:{w:768,h:1024}};r.assets={};
  r.elements=Array.from({length:150},(_,i)=>Studio.normEl({id:'e'+i,type:'image',name:'i'+i,assetId:'a'+(i%3),x:0,y:0,w:.3,h:.3,rot:0,z:.1,aspect:1}));
  for(let i=0;i<3;i++)r.assets['a'+i]=new Blob([new Uint8Array(M).fill(i+1)],{type:'image/png'});
  const zip=await Studio.exportZIP(r),res={warn:!!Studio.exportWarning(r),zipMB:Math.round(zip.size/1048576)};
  try{await Studio.importZIP(zip,{save:false});res.normal='imported';}catch(e){res.normal='refused';}
  const t0=performance.now();const back=await Studio.importZIP(zip,{save:true,recovery:true});
  res.rec={layers:back.elements.length,assets:Object.keys(back.assets).length,sizes:Object.values(back.assets).map(x=>x.size),ms:Math.round(performance.now()-t0),newId:back.id!==r.id};
  const stored=await Studio.load(back.id);res.stored=stored.elements.length;res.firstByte=[...new Uint8Array(await stored.assets.a1.slice(0,2).arrayBuffer())];
  return res;});
 assert.equal(out.normal,'refused');assert.equal(out.rec.layers,150);assert.ok(out.rec.newId);assert.equal(out.stored,150);assert.deepEqual(out.firstByte,[2,2],'media bytes intact');
 console.log('PASS recovery 150 layers + 90MiB media (desktop headless, not phone):',JSON.stringify(out));
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
