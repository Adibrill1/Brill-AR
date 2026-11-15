const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// The portal's own recogniser (studio/recognize.js) picks the right artwork among many before the AR engine is told about it.
// 120 synthetic artworks plus 20 look-alikes (each shares most of its shapes with one of the others, on another ground colour)
// are described as at publish time; then camera-like views are drawn: the artwork small or large in the frame, turned,
// seen at a slant, out of focus, darker or brighter, with sensor noise, on a busy wall. Every view must name its own artwork
// (or, sometimes, nothing: never another one), artworks the camera does not show must not be named, and it must be quick.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
  const p=await (await b.newContext({viewport:{width:375,height:812}})).newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(base+'/index.html');await p.addScriptTag({url:base+'/recognize.js'});
  const r=await p.evaluate(async()=>{
    const rnd=(s)=>()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
    // an artwork: ground colour, 70 shapes, 25 strokes; a look-alike repeats the first `keep` shapes of `like` on its own ground
    function art(seed,like,keep){const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d');const r0=rnd(seed),r1=like!=null?rnd(like):r0;
      g.fillStyle=`hsl(${r0()*360},${30+r0()*40}%,${50+r0()*40}%)`;if(like!=null){r1();r1();r1();}g.fillRect(0,0,600,800);
      for(let k=0;k<95;k++){const r=(like!=null&&k<keep)?r1:r0;const sh=k<70;g.beginPath();
        if(sh){g.fillStyle=`hsl(${r()*360},${40+r()*60}%,${15+r()*70}%)`;const t=r();if(t<.4)g.arc(r()*600,r()*800,8+r()*70,0,7);else if(t<.8){g.moveTo(r()*600,r()*800);for(let j=0;j<3+r()*3;j++)g.lineTo(r()*600,r()*800);}else g.rect(r()*600,r()*800,10+r()*120,10+r()*120);g.fill();}
        else{g.strokeStyle=`hsl(${r()*360},80%,${r()*90}%)`;g.lineWidth=2+r()*10;g.moveTo(r()*600,r()*800);g.bezierCurveTo(r()*600,r()*800,r()*600,r()*800,r()*600,r()*800);g.stroke();}}
      return c;}
    const arts=[];for(let i=0;i<120;i++)arts.push({id:'a'+i,c:art(1000+i)});
    for(let i=0;i<20;i++)arts.push({id:'look'+i,c:art(5000+i,1000+i*3,62),like:'a'+(i*3)});
    const grayOf=(c)=>{const g=c.getContext('2d').getImageData(0,0,c.width,c.height);return Recognize.gray(g.data,c.width,c.height);};
    let t=performance.now();const items=arts.map(a=>({id:a.id,f:Recognize.unpack(Recognize.pack(Recognize.artFeatures(grayOf(a.c),600,800)))}));const describeMs=(performance.now()-t)/arts.length;
    const featBytes=Math.round(items.reduce((s,i)=>s+Recognize.pack(i.f).length,0)/items.length);
    t=performance.now();const ix=Recognize.buildIndex(items);const indexMs=performance.now()-t;
    // a camera view of picture c: 240x320 portrait frame
    function view(c,o){const W=240,H=320,f=document.createElement('canvas');f.width=W;f.height=H;const g=f.getContext('2d');const r=rnd(o.seed);
      g.fillStyle=`hsl(${r()*360},10%,${30+r()*40}%)`;g.fillRect(0,0,W,H);
      for(let k=0;k<40;k++){g.fillStyle=`hsla(${r()*360},${r()*40}%,${20+r()*60}%,.8)`;g.fillRect(r()*W,r()*H,4+r()*50,2+r()*20);} // a busy wall
      const ah=H*o.size,aw=ah*0.75,sl=document.createElement('canvas');sl.width=Math.round(aw);sl.height=Math.round(ah);sl.getContext('2d').drawImage(c,0,0,sl.width,sl.height);
      g.save();g.translate(W/2+o.dx*W,H/2+o.dy*H);g.rotate(o.rot*Math.PI/180);g.filter=`blur(${o.blur}px) brightness(${o.light}) contrast(.85)`;
      const S=40;for(let s=0;s<S;s++){const k=1-o.slant*(s/S);const y0=s*sl.height/S;g.drawImage(sl,0,y0,sl.width,sl.height/S+1,-aw*k/2,-ah/2+y0,aw*k,ah/S+1);} // a slant: far rows narrower
      g.restore();const id=g.getImageData(0,0,W,H);for(let i=0;i<id.data.length;i+=4){const n=(r()-.5)*22;id.data[i]+=n;id.data[i+1]+=n;id.data[i+2]+=n;}g.putImageData(id,0,0);return f;}
    const runs=[];let frameMs=0,nf=0;
    const shown=[...Array(140).keys()].filter(i=>i%3===0||i>=120); // 40 of the artworks and all 20 look-alikes, from the camera
    for(const i of shown)for(let v=0;v<3;v++){const o={seed:i*7+v,size:[.5,.68,.88][v],dx:[-.08,.05,0][v],dy:[.06,-.05,0][v],rot:[-9,6,2][v],slant:[.18,.1,.25][v],blur:[1.1,.7,1.4][v],light:[.8,1.15,.95][v]};
      const f=view(arts[i].c,o);t=performance.now();const ff=Recognize.frameFeatures(grayOf(f),240,320);const res=Recognize.match(ix,ff);frameMs+=performance.now()-t;nf++;
      runs.push({want:arts[i].id,got:Recognize.decide(res),top3:res.slice(0,3).map(x=>x.id+':'+x.inliers)});}
    // frames with no published artwork at all: only the wall, or an unknown picture
    const strangers=[];for(let k=0;k<20;k++){const c=k%2?art(9000+k):document.createElement('canvas');if(!(k%2)){c.width=600;c.height=800;}const f=view(c,{seed:300+k,size:.7,dx:0,dy:0,rot:3,slant:.1,blur:.8,light:1});const res=Recognize.match(ix,Recognize.frameFeatures(grayOf(f),240,320));strangers.push({got:Recognize.decide(res),top:res[0]&&res[0].inliers});}
    window.__sample=view(arts[30].c,{seed:1,size:.6,dx:.05,dy:0,rot:-8,slant:.2,blur:1.2,light:.85}).toDataURL();
    return {runs,strangers,describeMs,indexMs,frameMs:frameMs/nf,featBytes,n:items.length};
  });
  const right=r.runs.filter(x=>x.got===x.want).length,wrong=r.runs.filter(x=>x.got&&x.got!==x.want),none=r.runs.filter(x=>!x.got);
  const lookRight=r.runs.filter(x=>x.want.startsWith('look')&&x.got===x.want).length,lookN=r.runs.filter(x=>x.want.startsWith('look')).length;
  const hist=r.runs.map(x=>{const t=x.top3.find(s=>s.startsWith(x.want+':'));return t?+t.split(':')[1]:0;}).sort((a,b)=>a-b);console.log('right-inliers',hist.join(','));console.log('stranger-top',r.strangers.map(s=>s.top||0).join(','));console.log('wrong-top2',r.runs.map(x=>{const o=x.top3.find(s=>!s.startsWith(x.want+':'));return o?+o.split(':')[1]:0;}).sort((a,b)=>b-a).slice(0,15).join(','));console.log(JSON.stringify({artworks:r.n,views:r.runs.length,right,wrong:wrong.length,none:none.length,lookAlikes:lookRight+'/'+lookN,strangersNamed:r.strangers.filter(s=>s.got).length,describeMsPerArt:Math.round(r.describeMs),indexMs:Math.round(r.indexMs),frameMs:Math.round(r.frameMs),catalogueBytesPerArt:r.featBytes}));
  if(wrong.length)console.log('wrong:',JSON.stringify(wrong.slice(0,8)));if(none.length)console.log('none:',JSON.stringify(none.slice(0,8)));
  const shot=await p.evaluate(()=>__sample);require('fs').mkdirSync('/downloads',{recursive:true});require('fs').writeFileSync('/downloads/portal-recognize-view.png',Buffer.from(shot.split(',')[1],'base64'));
  assert.equal(wrong.length,0,'a camera view never names another artwork');
  assert.ok(right>=r.runs.length*0.75,'at least 3 of 4 single views are named right (the viewer keeps trying, about 3 frames a second, and needs 2 of 3 to agree): '+right+'/'+r.runs.length);
  assert.equal(r.strangers.filter(s=>s.got).length,0,'a wall or an unknown picture names nothing');
  assert.ok(r.frameMs<200,'a frame is matched quickly (in a worker; a phone is slower than this Mac): '+r.frameMs+'ms');
  assert.deepEqual(errs,[],'no errors');
  console.log('portal-recognize ok');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e);process.exit(1);});
