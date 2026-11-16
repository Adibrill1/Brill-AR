const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// (1) The picture button beside the artwork: the gallery card's picture (__cover) becomes what the flat view shows now -
// the artwork with its layers, without editing marks, cut to the artwork's edges. Checked by colour: a red layer over the
// middle of a white artwork must be red in the cover, the corner white, and the selection outline must not be in it;
// in 3D it only says to go flat. (2) A sound layer follows its creation: while the creation's artwork is not in view
// (Studio.syncMedia with the container hidden) the sound is held and a touch does not start it; in view, it plays.
// Headless Chrome; not a phone and not the AR engine.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});try{
  const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));
  const shot=async(n)=>{if(process.env.SHOTS)await p.screenshot({path:process.env.SHOTS+'/'+n+'.png'});};
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined');
  const id=await p.evaluate(async()=>{const cv=(w,h,col)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.fillStyle=col;g.fillRect(0,0,w,h);return new Promise(r=>c.toBlob(r,'image/png'));};
    const a=Studio.blankExperience('שער');a.target={artRect:{x:0,y:0,w:300,h:400},natural:{w:300,h:400}};a.assets.__artwork=await cv(300,400,'#ffffff');a.assets.red=await cv(200,200,'#ff0000');
    a.elements=[{id:'r',type:'image',name:'אדום',assetId:'red',x:0,y:0,w:0.5,h:0.5,rot:0,z:0,aspect:1,seq:null}];await Studio.save(a);return a.id;});
  await p.goto(base+'/index.html#/e/'+id);await p.reload();await p.waitForFunction(()=>typeof App!=='undefined'&&App.rec&&App.art,null,{timeout:20000});await p.waitForTimeout(800);
  await p.evaluate(()=>{App.select('r');App.setPane('layers');});await p.waitForTimeout(400);
  assert.equal(await p.locator('#art-card #art-cover').count(),1,'the picture button beside the artwork');
  assert.equal(await p.evaluate(async()=>!!(await Studio.load(App.rec.id)).assets.__cover),false);
  await p.locator('#art-cover').click();await p.waitForFunction(async()=>!!(await Studio.load(App.rec.id)).assets.__cover,null,{timeout:10000});await shot('cover-button');
  const px=await p.evaluate(async()=>{const bl=(await Studio.load(App.rec.id)).assets.__cover,im=await Studio.loadImage(URL.createObjectURL(bl)),c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const g=c.getContext('2d');g.drawImage(im,0,0);
    const at=(u,v)=>[...g.getImageData(Math.round(u*c.width),Math.round(v*c.height),1,1).data].slice(0,3);
    // the red square covers the middle half; its edge (where the selection outline is drawn on screen) at u=0.25
    let edgeOdd=0;for(let v=0.3;v<0.7;v+=0.02)for(const u of [0.243,0.25,0.257]){const q=at(u,v),red=q[0]>200&&q[1]<70&&q[2]<70,white=q[0]>225&&q[1]>225&&q[2]>225,mix=q[0]>200&&Math.abs(q[1]-q[2])<30;if(!red&&!white&&!mix)edgeOdd++;}
    return {w:c.width,h:c.height,type:bl.type,mid:at(0.5,0.5),corner:at(0.06,0.06),edgeOdd};});
  assert.equal(px.type,'image/jpeg');assert.ok(Math.max(px.w,px.h)<=800&&Math.abs(px.w/px.h-0.75)<0.02,'cut to the artwork, small: '+px.w+'x'+px.h);
  assert.ok(px.mid[0]>200&&px.mid[1]<60&&px.mid[2]<60,'the layer is in the cover: '+px.mid);assert.ok(px.corner.every(v=>v>235),'the artwork around it: '+px.corner);
  assert.equal(px.edgeOdd,0,'no selection outline in the cover');
  // the gallery card shows it
  await p.evaluate(()=>App.setTab('style'));await p.evaluate(()=>App.select(null));await p.waitForSelector('#inspector #art-cover-big');
  await p.evaluate(()=>{App.rec.elements[0].x=0.25;App.changed();});await p.waitForTimeout(600);await p.locator('#art-cover-big').click();await p.waitForTimeout(900);
  const moved=await p.evaluate(async()=>{const bl=(await Studio.load(App.rec.id)).assets.__cover,im=await Studio.loadImage(URL.createObjectURL(bl)),c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const g=c.getContext('2d');g.drawImage(im,0,0);return [...g.getImageData(Math.round(0.9*c.width),Math.round(0.5*c.height),1,1).data].slice(0,3);});
  assert.ok(moved[0]>200&&moved[1]<60,'the second press takes the view as it is now: '+moved);
  // 3D: it asks for the flat view and changes nothing
  const before=await p.evaluate(async()=>(await Studio.load(App.rec.id)).assets.__cover.size);
  await p.locator('#btn-3d').click();await p.waitForTimeout(2500);await p.evaluate(()=>Layers.coverFromView());await p.waitForTimeout(500);
  assert.ok(await p.evaluate(()=>[...document.querySelectorAll('.toast')].some(t=>/שטוח/.test(t.textContent))),'in 3D it says to go flat');
  assert.equal(await p.evaluate(async()=>(await Studio.load(App.rec.id)).assets.__cover.size),before);
  await p.goto(base+'/index.html#/');await p.waitForSelector('img[data-cover="1"]',{timeout:15000});await shot('cover-gallery');

  // (2) a sound layer follows its creation
  const snd=await p.evaluate(async()=>{
    const ctx=new OfflineAudioContext(1,8000,8000),o=ctx.createOscillator();o.connect(ctx.destination);o.start();const buf=await ctx.startRendering(),d=buf.getChannelData(0),n=d.length,ab=new ArrayBuffer(44+n*2),v=new DataView(ab),W=(o,s)=>[...s].forEach((ch,i)=>v.setUint8(o+i,ch.charCodeAt(0)));
    W(0,'RIFF');v.setUint32(4,36+n*2,true);W(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);W(36,'data');v.setUint32(40,n*2,true);for(let i=0;i<n;i++)v.setInt16(44+i*2,d[i]*12000,true);
    const a=document.createElement('audio');a.src=URL.createObjectURL(new Blob([ab],{type:'audio/wav'}));a.loop=true;document.body.append(a);
    const root=new THREE.Object3D(),parent=new THREE.Object3D();parent.add(root);
    const container={object3D:root,querySelector:()=>null,_studioGraceMs:0},el={id:'s1',type:'sound'},rec={elements:[el]},m={kind:'audio',node:a,el};container._studioMedia=[m];
    const wait=(ms)=>new Promise(r=>setTimeout(r,ms)),out={};
    await a.play();Studio.syncMedia(container,rec);out.inView=!a.paused;
    root.visible=false;Studio.syncMedia(container,rec);await wait(50);out.goneStops=a.paused;out.blocked=a._studioBlocked;
    const t=Studio.soundOnTouch([m],{iconOnly:true});t.unlock();await wait(300);Studio.syncMedia(container,rec);out.touchKeepsQuiet=a.paused;
    root.visible=true;Studio.syncMedia(container,rec);await wait(300);out.backPlays=!a.paused;
    parent.visible=false;Studio.syncMedia(container,rec);await wait(50);out.parentGoneStops=a.paused;a.pause();a.remove();return out;});
  assert.deepEqual(snd,{inView:true,goneStops:true,blocked:true,touchKeepsQuiet:true,backPlays:true,parentGoneStops:true},JSON.stringify(snd));
  assert.deepEqual(errs,[],'no errors');
  console.log('PASS v2-cover-shot-sound-follow');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e);process.exit(1);});
