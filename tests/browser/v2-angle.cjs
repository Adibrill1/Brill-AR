// Four new things on the preview page: the pop-up book that opens as the phone comes near (and closes as it moves
// away), the picture that changes with the angle (a lenticular print, with a second picture), balloons a tap pops into
// confetti, and ink in water (the picture's colours spread, a finger stirs them, they gather back).
const assert=require('assert');
const {chromium}=require('playwright-core');const server=require('../../server/server');
const OUT=process.env.SHOTS||'';
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const ctx=await b.newContext({viewport:{width:390,height:700},deviceScaleFactor:2});
  const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>{errs.push(String(e));console.log('ERR',String(e));});p.on('console',m=>{if(m.type()==='error'){errs.push(m.text());console.log('ERR',m.text().slice(0,400));}});
  const shot=async(n)=>{if(OUT)await p.screenshot({path:OUT+'/'+n+'.png'});};
  const cam=(x,y,z)=>p.evaluate(([x,y,z])=>document.querySelector('[camera]').setAttribute('position',x+' '+y+' '+z),[x,y,z]);

  // ---- the pop-up book by distance ----
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined'&&typeof Reveal!=='undefined');
  const ids=await p.evaluate(async()=>{const a=Studio.blankExperience('ספר');a.target={artRatio:0.75,artRect:{x:0,y:0,w:300,h:400},natural:{w:300,h:400}};
    const pic=async(col,full,i)=>{const c=document.createElement('canvas');c.width=300;c.height=400;const g=c.getContext('2d');g.fillStyle=col;if(full)g.fillRect(0,0,300,400);else{g.beginPath();g.moveTo(150,120+i*40);g.lineTo(250,330);g.lineTo(50,330);g.fill();}return new Promise(r=>c.toBlob(r,'image/png'));};
    a.assets.__artwork=await pic('#8fd3ff',true,0);a.elements=[];
    const G=Studio.geom(a);
    for(let i=0;i<4;i++){const id=Studio.newId(),as=Studio.newId();a.assets[as]=await pic(['#8fd3ff','#2e8b57','#f4a261','#e63946'][i],i===0,i);
      a.elements.push({id,type:'image',name:'ש'+i,assetId:as,x:0,y:0,w:1,h:1,aspect:0.75,rot:0,z:+(i/3*0.3*G.artH).toFixed(4),flush:true,seq:null});}
    const g=Studio.makeGroup(a,a.elements.map(e=>e.id));g.split={spread:0.3,reveal:'popup',revealNear:true};Reveal.build(a,g);await Studio.save(a);
    return {rec:a.id,kids:a.elements.filter(e=>e.type==='image').map(e=>({id:e.id,near:!!(e.timeline&&e.timeline.near),loop:!!(e.timeline&&e.timeline.loop)}))};});
  assert.ok(ids.kids.slice(1).every(k=>k.near&&!k.loop),'the pop-up paths play by distance');
  await p.goto(base+'/preview.html#'+ids.rec);await p.waitForFunction(()=>document.querySelectorAll('[data-el-id]').length>=4);
  const rotX=()=>p.evaluate(ks=>ks.slice(1).map(k=>Math.round(document.querySelector('[data-el-id="'+k.id+'"]').object3D.rotation.x*180/Math.PI)),ids.kids);
  await cam(0,0,2);await p.waitForTimeout(2000);let r=await rotX();console.log('far',r);await shot('popup-far');
  assert.ok(r.every(v=>v>80),'far away the pages lie flat');
  await cam(0,0,1.0);await p.waitForTimeout(1600);r=await rotX();console.log('half',r);await shot('popup-half');
  await cam(0,0,0.6);await p.waitForTimeout(2000);r=await rotX();console.log('near',r);await shot('popup-near');
  assert.ok(r.every(v=>Math.abs(v)<3),'near, every page stands up');
  await cam(0,0,2);await p.waitForTimeout(2200);r=await rotX();assert.ok(r.every(v=>v>80),'moving away closes the book again');

  // ---- the code looks ----
  const open=async(look,extra,second)=>{
    await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined');
    const cid=await p.evaluate(async([look,extra,second])=>{const a=Studio.blankExperience('c');a.target={artRatio:1,artRect:{x:0,y:0,w:600,h:600},natural:{w:600,h:600}};
      const c=document.createElement('canvas');c.width=c.height=600;const g=c.getContext('2d');const gr=g.createLinearGradient(0,0,0,600);[[0,'#ff9a5a'],[0.55,'#ff5fa2'],[1,'#3b2a7a']].forEach(([o,col])=>gr.addColorStop(o,col));g.fillStyle=gr;g.fillRect(0,0,600,600);
      g.fillStyle='#ffe08a';g.beginPath();g.arc(300,330,110,0,7);g.fill();g.fillStyle='#2a1b4a';g.fillRect(0,420,600,180);g.fillStyle='#fff';g.font='bold 90px Arial';g.textAlign='center';g.fillText('A',300,360);
      a.assets.__artwork=await new Promise(r=>c.toBlob(r,'image/png'));
      const f=Object.assign(Studio.codeFxDefaults(look),extra||{});
      if(second){const d=document.createElement('canvas');d.width=800;d.height=500;const q=d.getContext('2d');q.fillStyle='#0d6e6e';q.fillRect(0,0,800,500);q.fillStyle='#b8f2e6';q.font='bold 200px Arial';q.textAlign='center';q.fillText('B',400,330);
        const id=Studio.newId();a.assets[id]=await new Promise(r=>d.toBlob(r,'image/png'));f.picture2=id;}
      a.elements=[{id:Studio.newId(),type:'codefx',name:look,codefx:f,x:0,y:0,w:1,h:1,aspect:1,rot:0,z:0,flush:true,seq:null}];await Studio.save(a);return a.id;},[look,extra,second]);
    await p.goto(base+'/preview.html#'+cid);
    await p.waitForFunction(()=>{const n=document.querySelector('[studio-codefx]');const C=n&&n.components['studio-codefx'];return C&&C.group&&C.group.children.length>0;},null,{timeout:20000});
    await p.waitForTimeout(1200);
  };
  const screen=(x,y,z)=>p.evaluate(([x,y,z])=>{const C=document.querySelector('[studio-codefx]').components['studio-codefx'];const v=new THREE.Vector3(x,y,z||0);C.group.localToWorld(v);v.project(C.el.sceneEl.camera);const r=C.el.sceneEl.canvas.getBoundingClientRect();return {x:r.left+(v.x+1)/2*r.width,y:r.top+(1-v.y)/2*r.height};},[x,y,z]);
  const C=(js)=>p.evaluate(new Function('const C=document.querySelector("[studio-codefx]").components["studio-codefx"];return ('+js+');'));

  // the picture by the angle: from the left the first picture, from the right the second
  await open('flip',{kind:0},true);
  await p.waitForFunction(()=>{let ok=false;document.querySelector('[studio-codefx]').components['studio-codefx'].group.traverse(o=>{if(o.material&&o.material.uniforms&&o.material.uniforms.uHas2&&o.material.uniforms.uHas2.value===1)ok=true;});return ok;},null,{timeout:8000});
  await cam(-0.55,0,1.0);await p.waitForTimeout(900);const left=await C('C.parts.flip.value');await shot('flip-left');
  await cam(0.04,0,1.15);await p.waitForTimeout(300);await shot('flip-middle');
  await cam(0.55,0,1.0);await p.waitForTimeout(900);const right=await C('C.parts.flip.value');await shot('flip-right');
  console.log('flip',left.toFixed(2),right.toFixed(2));assert.ok(left<0.1&&right>0.9,'it changes with the angle');
  await cam(0,0,1.15);await p.waitForTimeout(3500);const a1=await C('C.parts.flip.value');await p.waitForTimeout(1500);const a2=await C('C.parts.flip.value');
  assert.ok(Math.abs(a1-a2)>0.05,'nobody moving: it rocks by itself '+a1.toFixed(2)+' '+a2.toFixed(2));
  await open('flip',{kind:2});await cam(0.12,0,1.1);await p.waitForTimeout(500);await shot('flip-stripes');

  // balloons: a tap pops one into confetti
  await open('balloons',{kind:0});await shot('balloons-a');
  const bl=await C('C.parts.balloons.map(b=>({x:b.p.x,y:b.p.y,z:b.p.z,s:b.s,ok:b.pop<0&&b.wait<=0})).filter(b=>b.ok&&Math.abs(b.x)<0.35&&Math.abs(b.y)<0.35)[0]');
  assert.ok(bl,'a balloon in sight');const q=await screen(bl.x,bl.y,bl.z);await p.mouse.click(q.x,q.y);await p.waitForTimeout(90);await shot('balloons-pop');
  assert.equal(await C('C.parts.popped'),1,'the tap popped it');
  await p.waitForTimeout(3500);assert.ok(await C('C.parts.balloons.every(b=>b.wait<=0)'),'a new one came up');
  await open('balloons',{kind:1});await shot('balloons-gold');
  await open('balloons',{kind:2});await shot('balloons-hearts');

  // ink in water: the picture spreads, a finger stirs it, then it gathers back
  await open('ink',{kind:0});assert.ok(await C('C.parts.ink.value')<0.05,'whole at first');await shot('ink-a');
  await p.waitForTimeout(5200);const spread=await C('C.parts.ink.value');console.log('ink',spread.toFixed(2));assert.ok(spread>0.3,'it spread');await shot('ink-b');
  const m=await screen(0,0);await p.mouse.move(m.x-40,m.y);await p.mouse.move(m.x+40,m.y,{steps:10});await p.waitForTimeout(600);await shot('ink-c');
  await open('ink',{kind:1});await p.waitForTimeout(6500);await shot('ink-water');
  await open('ink',{kind:2});await p.waitForTimeout(6500);await shot('ink-smoke');

  assert.deepEqual(errs.filter(e=>!/favicon|Failed to load resource/.test(e)),[],'no errors');
  console.log('v2-angle ok');
 }finally{await b.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
