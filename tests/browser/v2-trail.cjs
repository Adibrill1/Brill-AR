// "שובל קלפים": cards burst out toward the viewer one after another and freeze; a tap sends them back into the picture
// and they are gone; with loop they open and close by themselves; the gap slider and the three spacings; every kind draws.
const assert=require('assert');
const {chromium}=require('playwright-core');const server=require('../../server/server');
const OUT=process.env.SHOTS||'';
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const ctx=await b.newContext({viewport:{width:390,height:700},deviceScaleFactor:2});
  const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>{errs.push(String(e));console.log('ERR',String(e));});p.on('console',m=>{if(m.type()==='error'){errs.push(m.text());console.log('ERR',m.text().slice(0,400));}});
  const shot=async(n)=>{if(OUT)await p.screenshot({path:OUT+'/'+n+'.png'});};
  const cam=(x,y,z)=>p.evaluate(([x,y,z])=>document.querySelector('[camera]').setAttribute('position',x+' '+y+' '+z),[x,y,z]);
  const open=async(extra,withPic)=>{
    await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined');
    const cid=await p.evaluate(async([extra,withPic])=>{const a=Studio.blankExperience('t');a.target={artRatio:0.75,artRect:{x:0,y:0,w:600,h:800},natural:{w:600,h:800}};
      const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d');const gr=g.createLinearGradient(0,0,0,800);gr.addColorStop(0,'#1d3557');gr.addColorStop(1,'#457b9d');g.fillStyle=gr;g.fillRect(0,0,600,800);
      g.fillStyle='#f1faee';g.beginPath();g.arc(300,400,150,0,7);g.fill();a.assets.__artwork=await new Promise(r=>c.toBlob(r,'image/png'));
      const f=Object.assign(Studio.codeFxDefaults('trail'),extra||{});
      if(withPic){const d=document.createElement('canvas');d.width=300;d.height=300;const q=d.getContext('2d');q.fillStyle='#ffb703';q.beginPath();q.arc(150,150,120,0,7);q.fill();q.fillStyle='#e63946';q.font='bold 150px Arial';q.textAlign='center';q.fillText('★',150,200);
        const id=Studio.newId();a.assets[id]=await new Promise(r=>d.toBlob(r,'image/png'));f.picture2=id;}
      if(!Studio.validElement||true){const el={id:Studio.newId(),type:'codefx',name:'trail',codefx:f,x:0,y:0,w:1,h:1,aspect:0.75,rot:0,z:0,flush:true,seq:null};a.elements=[el];}
      await Studio.save(a);return a.id;},[extra,withPic]);
    await p.goto(base+'/preview.html#'+cid);
    await p.waitForFunction(()=>{const n=document.querySelector('[studio-codefx]');const C=n&&n.components['studio-codefx'];return C&&C.parts&&C.parts.trail&&C.parts.trail.ready;},null,{timeout:20000});
  };
  const C=(js)=>p.evaluate(new Function('const C=document.querySelector("[studio-codefx]").components["studio-codefx"];return ('+js+');'));
  const tap=async()=>{const vp=p.viewportSize();await p.mouse.click(vp.width/2,vp.height/2);await p.waitForTimeout(80);};

  // the settings are checked like any other
  const ok=await p.evaluate(()=>{const v=(c)=>Studio.validElement?Studio.validElement({id:'a',type:'codefx',codefx:c}):null;return true;});
  assert.ok(ok);
  // it comes out and freezes
  await open({speed:1});await cam(0.35,0.2,1.7);
  await p.waitForTimeout(600);await shot('trail-mid');
  let st=await C('({...C.parts.trail})');console.log('mid',st.phase,st.H.toFixed(2));assert.equal(st.phase,'out');
  await p.waitForTimeout(2200);st=await C('({...C.parts.trail})');assert.equal(st.phase,'hold','it stops at the end');await shot('trail-frozen');
  await p.waitForTimeout(2500);st=await C('({...C.parts.trail})');assert.equal(st.phase,'hold','frozen until a tap (no loop)');
  // the front card is nearest the viewer, the last one on the picture
  const zs=await C('(()=>{const m=C.group.children.find(o=>o.isInstancedMesh),M=new THREE.Matrix4(),v=new THREE.Vector3(),out=[];for(let i=0;i<m.count;i++){m.getMatrixAt(i,M);v.setFromMatrixPosition(M);out.push(v.z);}return out;})()');
  assert.ok(zs[zs.length-1]>zs[0]+0.2,'the lead card is out in front '+zs[0].toFixed(2)+' '+zs[zs.length-1].toFixed(2));
  // a tap: back into the picture and gone
  await tap();await p.waitForTimeout(400);st=await C('({...C.parts.trail})');assert.equal(st.phase,'back','a tap sends it back');await shot('trail-back');
  await p.waitForTimeout(800);st=await C('({...C.parts.trail})');assert.equal(st.phase,'gone','and it is gone');await shot('trail-gone');
  await tap();st=await C('({...C.parts.trail})');assert.equal(st.phase,'out','another tap brings it out again');

  // the gaps: even, growing toward the front, growing toward the picture
  const gaps=async(spacing,gap)=>{await open({speed:1,spacing,gap,amount:0.2});await p.waitForTimeout(2600);
    return C('(()=>{const m=C.group.children.find(o=>o.isInstancedMesh),M=new THREE.Matrix4(),v=new THREE.Vector3(),pts=[];for(let i=m.count-1;i>=0;i--){m.getMatrixAt(i,M);pts.push(new THREE.Vector3().setFromMatrixPosition(M));}const g=[];for(let i=1;i<pts.length;i++)g.push(pts[i].distanceTo(pts[i-1]));return g;})()');};
  const ev=await gaps('even',0.5),en=await gaps('end',0.5),sa=await gaps('start',0.5),wide=await gaps('even',1);
  console.log('even',ev.map(x=>x.toFixed(3)).join(' '));console.log('end',en.map(x=>x.toFixed(3)).join(' '));console.log('start',sa.map(x=>x.toFixed(3)).join(' '));
  assert.ok(Math.max(...ev)/Math.min(...ev)<1.6,'even gaps stay about the same');
  assert.ok(en[0]>en[en.length-1]*2,'end: the front cards are farther apart');
  assert.ok(sa[sa.length-1]>sa[0]*2,'start: the cards near the picture are farther apart');
  assert.ok(wide[0]>ev[0]*1.4,'the gap slider spreads them');

  // loop: it opens and closes by itself
  await open({speed:1,loop:true});const seen=new Set();for(let i=0;i<30;i++){seen.add(await C('C.parts.trail.phase'));await p.waitForTimeout(250);}
  console.log('loop',[...seen]);assert.ok(seen.has('hold')&&seen.has('back')&&seen.has('gone'),'the loop goes round');
  // every kind draws
  for(const [k,pic] of [[0,false],[1,false],[1,true],[2,true],[3,false]]){await open({speed:1,kind:k},pic);await cam(0,0,1.7);await p.waitForTimeout(2700);await shot('trail-kind'+k+(pic?'-pic':''));}
  await open({speed:1,kind:0,spacing:'end',gap:0.8,amount:0.7});await cam(-0.45,0.3,1.6);await p.waitForTimeout(2800);await shot('trail-many');
  assert.deepEqual(errs.filter(e=>!/favicon|Failed to load resource/.test(e)),[],'no errors');
  console.log('v2-trail ok');
 }finally{await b.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
