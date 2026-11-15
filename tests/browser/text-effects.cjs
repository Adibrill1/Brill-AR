const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),fs=require('fs');const server=require('../../server/server');
// Entrance and exit effects ("כניסה ויציאה"). Checks: the effect descriptions themselves (every effect starts away and
// ends at rest; letter effects reveal the text in reading order, right to left for Hebrew); the exit ends right at a
// path step that hides the layer; the editor's motion tab (choosing an effect plays it on the canvas at once; speed and
// delay controls; the same controls for the ready-made movements; image/3D layers get only the whole-layer effects);
// the editor canvas and preview.html both draw the entrance (little of the text at first, all of it at rest); backup
// export/import keeps the fields and refuses bad ones; a creation without the fields looks exactly as before.
// Frame sequences of every text effect go to wt-portal-shots/anim/ (phone size, 375x812).
const SHOTS='/Users/adibrill/Desktop/brill-ar-work/wt-portal-shots/anim/';
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});try{
  fs.mkdirSync(SHOTS,{recursive:true});
  const ctx=await b.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
  const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|WebGL|GL_/.test(m.text()))errs.push(m.text());});
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined'&&typeof App!=='undefined');
  // 1) the descriptions
  const u=await p.evaluate(()=>{const el={id:'t',type:'text',text:'שלום לכולם'},out={};
    for(const fx of Studio.ENTER_EXIT.map(x=>x.id).filter(x=>x!=='none')){el.enter={fx,speed:1,delay:0};el.exit={fx,speed:1};const d=Studio.enterExitDur(el,el.enter);
      const a=Studio.fxLook(el,0,Infinity),m=Studio.fxLook(el,d/2,Infinity),z=Studio.fxLook(el,d+0.01,Infinity),o=Studio.fxLook(el,1e9,0),h=Studio.fxLook(el,1e9,d+0.1);
      out[fx]={d:+d.toFixed(2),startAway:a.a<0.05||a.s<0.4||Math.abs(a.x)+Math.abs(a.y)>0.3||!!(a.text&&a.text.e===0),mid:m.active,rest:!z.active&&z.a===1&&z.s===1&&!z.x&&!z.y&&!z.r&&!z.text&&!z.blur,goneAtEnd:o.a<0.05||o.s<0.4||!!(o.text&&o.text.e===0),beforeExit:!h.active};}
    el.enter={fx:'fade',speed:2,delay:1.5};const del=[Studio.fxLook(el,1,Infinity).hidden,Studio.fxLook(el,1.6,Infinity).hidden,Studio.enterExitDur(el,el.enter)];
    // a path that hides the layer at 3 s and shows it again at 5 s (loops every 6 s)
    const tl={id:'p',type:'image',timeline:{loop:true,dur:6,keys:[{t:0,x:0},{t:3,visible:false},{t:5,visible:true}]}};
    const times=[1,2.9,5.5,7].map(t=>Studio.fxTimes(tl,t)).map(x=>[+x.since.toFixed(2),x.until===Infinity?null:+x.until.toFixed(2)]);
    return {out,del,times,image:Studio.enterExitFor('image').map(x=>x.id),sound:Studio.enterExitFor('sound').length,text:Studio.enterExitFor('text').length,old:Studio.hasEnterExit({type:'text',text:'x'})};});
  console.log(JSON.stringify(u));
  for(const [fx,r] of Object.entries(u.out)){assert.ok(r.startAway,fx+': starts away');assert.ok(r.mid,fx+': moving half way');assert.ok(r.rest,fx+': at rest when done');assert.ok(r.goneAtEnd,fx+': gone at the end of the exit');assert.ok(r.beforeExit,fx+': untouched before the exit');}
  assert.deepEqual(u.del.slice(0,2),[true,false],'the entrance waits its delay');assert.equal(+u.del[2].toFixed(2),0.3,'speed x2: half the time');
  assert.deepEqual(u.times,[[1,2],[2.9,0.1],[0.5,3.5],[2,2]],'the exit ends right at the step that hides it, around and around');
  assert.deepEqual(u.image,['none','fade','pop','zoom','stamp','slideR','slideL','slideU','slideD','spin'],'whole-layer effects for an image');
  assert.equal(u.sound,0);assert.equal(u.text,17);assert.equal(u.old,false);
  // typewriter order: the first letter typed is the rightmost one (Hebrew)
  const order=await p.evaluate(async()=>{const el={id:'t',type:'text',text:'אבג',font:'heebo',color:'#fff'};await Studio.loadTextFonts(el);const tb=Studio.drawTextCanvas(el,64,{glyphs:true});
    return tb.glyphs.list.slice().sort((a,b)=>a.k-b.k).map(g=>Math.round(g.x0));});
  assert.ok(order[0]>order[1]&&order[1]>order[2],'typed right to left: '+order);

  // 2) the editor: a creation with a Hebrew title on a dark picture
  const id=await p.evaluate(async()=>{const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d');g.fillStyle='#202733';g.fillRect(0,0,600,800);g.fillStyle='#2e3a4d';for(let i=0;i<8;i++)g.fillRect(40+i*70,60,30,680);
    const blob=await new Promise(r=>c.toBlob(r,'image/png')),img=await Studio.loadImageBlob(blob),t=await Studio.makeTarget(img);
    const a=Studio.blankExperience('אפקטים');a.target={artRect:t.artRect,natural:{w:600,h:800},fp:Studio.artworkFingerprint(img)};a.assets.__artwork=blob;
    a.elements=[{id:'txt',type:'text',text:'שלום לכולם!',font:'heebo',color:'#ffffff',bold:true,x:0,y:0.1,w:0.8,rot:0,z:0,flush:true}];Studio.normEl(a.elements[0]);
    await Studio.save(a,{noHistory:true});return a.id;});
  await p.goto(base+'/index.html#/e/'+id);await p.reload();await p.waitForFunction(()=>App.rec&&document.querySelector('#preview'));await p.waitForTimeout(1200);
  await p.evaluate(()=>{App.select('txt');App.setTab('motion');});await p.waitForSelector('[data-ee=enter] .chip');
  const ink=async()=>{const buf=await p.locator('#preview').screenshot();return p.evaluate(async(b64)=>{const img=new Image();img.src='data:image/png;base64,'+b64;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);const d=g.getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]>215&&d[i+1]>215&&d[i+2]>215)n++;return n;},buf.toString('base64'));};
  await p.evaluate(()=>App.select(null));await p.waitForTimeout(300);const rest=await ink();await p.evaluate(()=>{App.select('txt');App.setTab('motion');});await p.waitForTimeout(300);
  assert.ok(rest>300,'the title is drawn: '+rest);
  await p.screenshot({path:SHOTS+'editor-motion-tab.png'});
  // every text effect: chosen on the chips, it plays on the canvas at once; a frame sequence of it is kept
  const seq={};
  for(const fx of ['fade','pop','zoom','stamp','slideR','slideL','slideU','slideD','spin','blur','type','words','rise','fall','wave','flicker']){
    await p.click('[data-ee=enter] .chip[data-id='+fx+']');
    const frames=[];const t0=Date.now();
    for(let i=0;i<6;i++){const buf=await p.locator('#canvas-wrap').screenshot();fs.writeFileSync(SHOTS+'enter-'+fx+'-'+i+'.png',buf);frames.push(Date.now()-t0);await p.waitForTimeout(90);}
    seq[fx]=frames;
  }
  // the first frame of the last one (flicker) is mostly dark; at rest it is whole again
  await p.click('[data-ee=enter] .chip[data-id=type]');await p.waitForTimeout(60);const early=await ink();await p.waitForTimeout(2500);const done=await ink();
  console.log('editor ink',JSON.stringify({rest,early,done}));
  assert.ok(early<rest*0.6,'typewriter: little of the title at first ('+early+' of '+rest+')');assert.ok(done>rest*0.9,'all of it at rest ('+done+')');
  // speed and delay controls; the exit too
  assert.equal(await p.locator('#inspector .ctl-slider .ctl-label',{hasText:'מהירות'}).count(),1,'one speed control for the entrance');
  assert.equal(await p.locator('#inspector .ctl-slider .ctl-label',{hasText:'לחכות לפני'}).count(),1,'a delay for the entrance');
  await p.click('[data-ee=exit] .chip[data-id=slideD]');await p.waitForTimeout(250);
  assert.equal(await p.locator('#inspector .ctl-slider .ctl-label',{hasText:'מהירות'}).count(),2,'and one for the exit');
  for(let i=0;i<5;i++){fs.writeFileSync(SHOTS+'exit-slideD-'+i+'.png',await p.locator('#canvas-wrap').screenshot());await p.waitForTimeout(150);}
  await p.click('[data-ee=enter] .chip[data-id=rise]');
  await p.waitForTimeout(400);await p.screenshot({path:SHOTS+'editor-motion-tab-chosen.png'});
  const saved=await p.evaluate(async(id)=>{await App.flush();const r=await Studio.load(id);return r.elements[0];},id);
  assert.deepEqual([saved.enter.fx,saved.exit.fx],['rise','slideD'],'saved with the creation');
  // the ready-made movement has the same speed control
  await p.click('.chip[data-id=float]');await p.waitForTimeout(300);
  assert.equal(await p.locator('#inspector .ctl-slider .ctl-label',{hasText:'מהירות'}).count(),3,'the ready-made movement: the same speed control');
  await p.click('.chip[data-id=none]>>nth=-1');
  // the text tab leads to it
  await p.evaluate(()=>App.setTab('style'));await p.waitForSelector('#to-enter-exit');assert.match(await p.textContent('#to-enter-exit'),/אותיות עולות/);
  await p.screenshot({path:SHOTS+'editor-text-tab.png'});

  // 3) preview.html draws the same entrance (slowed down so it can be watched)
  await p.evaluate(async(id)=>{const r=await Studio.load(id);r.elements[0].enter={fx:'type',speed:0.25,delay:0};delete r.elements[0].exit;r.elements[0].anim='none';await Studio.save(r,{noHistory:true});},id);
  const pv=await ctx.newPage();pv.on('pageerror',e=>errs.push('preview: '+String(e)));
  await pv.goto(base+'/preview.html#'+id);await pv.waitForFunction(()=>{const t=document.querySelector('[data-el-id=txt]');return t&&t.getObject3D('mesh')&&t.getObject3D('mesh').material.map;},null,{timeout:30000});
  const pink=async()=>{const buf=await pv.screenshot({clip:{x:45,y:215,width:285,height:380}});return pv.evaluate(async(b64)=>{const img=new Image();img.src='data:image/png;base64,'+b64;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);const d=g.getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]>215&&d[i+1]>215&&d[i+2]>215)n++;return n;},buf.toString('base64'));};
  const ps=[];for(let i=0;i<8;i++){ps.push(await pink());fs.writeFileSync(SHOTS+'preview-type-'+i+'.png',await pv.screenshot());await pv.waitForTimeout(450);}
  await pv.waitForTimeout(4000);const pend=await pink();
  console.log('preview ink',JSON.stringify({ps,pend}));
  assert.ok(Math.min(...ps)<pend*0.6&&ps.some(x=>x>pend*0.2&&x<pend*0.9),'preview.html: the title is typed in ('+ps+' → '+pend+')');
  // the artwork lost and found again (in AR its image target hides and shows): the entrance plays again
  await pv.evaluate(()=>{document.querySelector('[data-el-id=txt]').object3D.parent.visible=false;});await pv.waitForTimeout(300);
  await pv.evaluate(()=>{document.querySelector('[data-el-id=txt]').object3D.parent.visible=true;});await pv.waitForTimeout(500);
  const again=await pink();console.log('found again',again);assert.ok(again<pend*0.5,'found again: typed in again ('+again+')');
  await pv.close();

  // 4) backup export / import keeps the fields; bad values are refused; old creations unchanged
  const io=await p.evaluate(async(id)=>{const r=await Studio.load(id);r.elements[0].exit={fx:'zoom',speed:1.5};r.elements[0].animSpeed=2;const json=await Studio.exportJSON(r);
    const back=await Studio.importJSON(json,{save:false}),e=back.elements[0];
    const bad=async(v)=>{const o=JSON.parse(json);Object.assign(o.elements[0],v);try{await Studio.importJSON(JSON.stringify(o),{save:false});return false;}catch(x){return true;}};
    const pub=Studio.exportObject(r).elements[0];
    return {enter:e.enter,exit:e.exit,animSpeed:e.animSpeed,pub:[pub.enter.fx,pub.exit.fx],bad:[await bad({enter:{fx:'explode'}}),await bad({exit:{fx:'fade',speed:9}}),await bad({enter:{fx:'fade',delay:-1}}),await bad({animSpeed:0})]};},id);
  console.log(JSON.stringify(io));
  assert.deepEqual(io.enter,{fx:'type',speed:0.25,delay:0});assert.deepEqual(io.exit,{fx:'zoom',speed:1.5});assert.equal(io.animSpeed,2);assert.deepEqual(io.pub,['type','zoom'],'published scene carries them');
  assert.deepEqual(io.bad,[true,true,true,true],'bad values refused on import');
  assert.deepEqual(errs,[],'no errors');
  console.log('text-effects ok');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e);process.exit(1);});
