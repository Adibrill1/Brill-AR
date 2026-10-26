const {chromium}=require('playwright-core'),assert=require('assert/strict'),server=require('../../server/server');
// Grounds the duplicate-target threshold (16 of 256 dHash bits) on synthetic images (no user art): recompression/resize/brightness must be blocked,
// unrelated images and low-texture/flat must not be; crops, rotations, blur and colour changes are MEASURED and reported (documented limits, not guaranteed).
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{const p=await b.newPage({viewport:{width:390,height:844}});
 await p.goto(base+'/index.html');await p.waitForSelector('#element-list li');
 const res=await p.evaluate(async()=>{
  const rng=s=>()=>((s=Math.imul(s^s>>>15,s|1),s^=s+Math.imul(s^s>>>7,s|61),((s^s>>>14)>>>0)/4294967296));
  const mk=(seed,w=768,h=1024)=>{const r=rng(seed),c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.fillStyle='hsl('+Math.floor(r()*360)+',35%,'+(40+r()*30)+'%)';g.fillRect(0,0,w,h);for(let i=0;i<60;i++){g.fillStyle='hsl('+Math.floor(r()*360)+','+(30+r()*60)+'%,'+(15+r()*70)+'%)';const t=r();if(t<.4)g.fillRect(r()*w,r()*h,20+r()*200,20+r()*200);else if(t<.8){g.beginPath();g.arc(r()*w,r()*h,10+r()*120,0,7);g.fill();}else{g.beginPath();g.moveTo(r()*w,r()*h);g.lineTo(r()*w,r()*h);g.lineTo(r()*w,r()*h);g.fill();}}return c;};
  const tf=(src,fn)=>{const c=document.createElement('canvas');c.width=src.width;c.height=src.height;const g=c.getContext('2d');fn(g,c,src);return c;};
  const jpeg=async(c,q)=>{const bl=await new Promise(r=>c.toBlob(r,'image/jpeg',q));return Studio.loadImage(await Studio.blobToDataURL(bl));};
  const toImg=async c=>{const bl=await new Promise(r=>c.toBlob(r,'image/png'));return Studio.loadImage(await Studio.blobToDataURL(bl));};
  const fp=x=>Studio.artworkFingerprint(x),dI=(a,b)=>Studio.fingerprintDistance(fp(a),fp(b));
  // the app always fingerprints decoded <img> files, so every variant is round-tripped through PNG/JPEG into an <img> first (a canvas source is sampled differently when downscaling)
  let _imgs=new Map();const d=(a,b)=>{throw new Error('use dd')};
  const out={pos:{},neg:{},measured:{}};
  for(const seed of [11,22,33,44]){const A=mk(seed);
   const AI=await toImg(A);const dd=async(v)=>dI(AI,v instanceof HTMLImageElement?v:await toImg(v));
   out.pos['jpeg30#'+seed]=await dd(await jpeg(A,.3));
   out.pos['half#'+seed]=await dd(tf(A,(g,c,s)=>{c.width=384;c.height=512;g.drawImage(s,0,0,384,512);}));
   out.pos['bright+15%#'+seed]=await dd(tf(A,(g,c,s)=>{g.filter='brightness(115%)';g.drawImage(s,0,0);}));
   out.measured['crop5%#'+seed]=await dd(tf(A,(g,c,s)=>{g.drawImage(s,38,51,692,922,0,0,768,1024);}));
   out.measured['crop20%#'+seed]=await dd(tf(A,(g,c,s)=>{g.drawImage(s,154,205,461,614,0,0,768,1024);}));
   out.measured['rot3deg#'+seed]=await dd(tf(A,(g,c,s)=>{g.translate(384,512);g.rotate(3*Math.PI/180);g.drawImage(s,-384,-512);}));
   out.measured['rot90#'+seed]=await dd(tf(A,(g,c,s)=>{c.width=1024;c.height=768;g.translate(512,384);g.rotate(Math.PI/2);g.drawImage(s,-384,-512);}));
   out.measured['grayscale#'+seed]=await dd(tf(A,(g,c,s)=>{g.filter='grayscale(100%)';g.drawImage(s,0,0);}));
   out.measured['hueshift#'+seed]=await dd(tf(A,(g,c,s)=>{g.filter='hue-rotate(90deg)';g.drawImage(s,0,0);}));
   out.measured['blur4px#'+seed]=await dd(tf(A,(g,c,s)=>{g.filter='blur(4px)';g.drawImage(s,0,0);}));
   out.measured['mirror#'+seed]=await dd(tf(A,(g,c,s)=>{g.translate(768,0);g.scale(-1,1);g.drawImage(s,0,0);}));
   out.neg['other#'+seed]=await dd(mk(seed+1000));
  }
  const flat=tf(mk(5),(g,c)=>{g.fillStyle='#888';g.fillRect(0,0,c.width,c.height);});const faint=tf(mk(5),(g,c)=>{g.fillStyle='#888';g.fillRect(0,0,c.width,c.height);g.fillStyle='#8a8a8a';g.fillRect(100,100,300,300);});
  const FI=await toImg(flat),MI=await toImg(mk(5)),FA=await toImg(faint);out.neg['flat vs image']=dI(FI,MI);out.neg['flat vs flat']=dI(FI,FI);out.neg['faint vs flat']=dI(FA,FI);
  return out;});
 const f=o=>Object.entries(o).map(([k,v])=>k+'='+v).join(' ');
 console.log('POSITIVES (must be <=16):',f(res.pos));console.log('NEGATIVES (must be >16 or Infinity):',f(res.neg));console.log('MEASURED (documented limits):',f(res.measured));
 for(const [k,v] of Object.entries(res.pos))assert.ok(v<=16,k+' recompress/resize/brightness is blocked: '+v);
 for(const [k,v] of Object.entries(res.neg))assert.ok(v>16,k+' unrelated/low-texture is not blocked: '+v);
 console.log('PASS similarity corpus: recompression/resize/+brightness blocked on 4 synthetic images, 4 unrelated + 3 low-texture cases not blocked; crop/rotation/colour/blur/mirror measured and reported');
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
