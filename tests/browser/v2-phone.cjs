const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),path=require('node:path');const server=require('../../server/server');
// Working from a phone: the artwork survives a stored file that will not read (the stage says so and offers another
// try instead of going blank), the same file is not read again after an undo or a save hands back a new object for it,
// and in the 3D view one finger turns the view also when the drag starts on a layer, while a tap picks the layer.
// Headless Chrome with a phone screen and touch pointers; not an iPhone.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(base+'/index.html');await p.waitForSelector('#home-empty:not([hidden])');
  await p.locator('#btn-new-empty').click();await p.waitForSelector('#editor:not([hidden])');
  const [fc]=await Promise.all([p.waitForEvent('filechooser'),p.locator('#btn-empty-art').click()]);
  await fc.setFiles(path.join(__dirname,'../fixtures/target-a.png'));
  await p.waitForFunction(()=>App.rec&&App.rec.target&&App.artState==='ok',null,{timeout:30000});
  assert.equal(await p.locator('#stage-art').isVisible(),false,'no artwork message while it shows');

  // the same stored file under a new object: kept, not read again
  const same=await p.evaluate(async()=>{const o=Studio.blobToDataURL;let n=0;Studio.blobToDataURL=(x)=>{n++;return o(x);};const a=App.rec.assets.__artwork,pic=App.art;
    App.rec.assets.__artwork=a.slice(0,a.size,a.type);await App.hydrate();Studio.blobToDataURL=o;return{n,kept:App.art===pic};});
  assert.deepEqual(same,{n:0,kept:true},'the artwork on screen is kept for the same file');

  // a file that will not read: a message with another try, not a blank stage
  await p.evaluate(async()=>{window.__o=Studio.blobToDataURL;window.__a=App.rec.assets.__artwork;Studio.blobToDataURL=async()=>{throw new Error('unreadable');};
    App.rec.assets.__artwork=new Blob([await window.__a.arrayBuffer(),new Uint8Array(1)],{type:window.__a.type});await App.hydrate();});
  assert.equal(await p.evaluate(()=>App.artState),'error','the failure is known');
  assert.ok(await p.locator('#stage-art').isVisible(),'the stage says the artwork did not load');
  assert.ok(await p.locator('#btn-art-retry').isVisible(),'and offers another try');
  // one read that fails and then works is not a failure at all
  await p.evaluate(()=>{let n=0;Studio.blobToDataURL=(x)=>{if(!n++)return Promise.reject(new Error('first read'));return window.__o(x);};});
  await p.locator('#btn-art-retry').click();
  await p.waitForFunction(()=>App.artState==='ok',null,{timeout:10000});
  assert.equal(await p.locator('#stage-art').isVisible(),false,'the message goes once the artwork is back');
  await p.evaluate(()=>{Studio.blobToDataURL=window.__o;App.rec.assets.__artwork=window.__a;});

  // flat view: zoomed in, a finger on empty space or two fingers together carry the view; at 100% it stays put
  const flat=(z)=>p.evaluate((z)=>{const c=document.getElementById('preview'),r=c.getBoundingClientRect(),x0=r.left+20,y0=r.top+r.height/2;
    const ev=(t,id,x,y)=>c.dispatchEvent(new PointerEvent(t,{pointerId:id,pointerType:'touch',isPrimary:id===3,clientX:x,clientY:y,bubbles:true,cancelable:true,button:0,buttons:t==='pointerup'?0:1}));
    document.getElementById('zoom-label').click();for(let i=0;i<z;i++)document.getElementById('btn-zoom-in').click();
    ev('pointerdown',3,x0,y0);for(let i=1;i<=6;i++)ev('pointermove',3,x0+i*5,y0+i*2);ev('pointerup',3,x0+30,y0+12);const one={x:Stage.pan.x,y:Stage.pan.y};
    ev('pointerdown',3,x0,y0);ev('pointerdown',4,x0+60,y0);for(let i=1;i<=6;i++){ev('pointermove',3,x0-i*4,y0);ev('pointermove',4,x0+60-i*4,y0);}ev('pointerup',3,x0-24,y0);ev('pointerup',4,x0+36,y0);
    return{one,two:{x:Stage.pan.x,y:Stage.pan.y},zoom:Stage.zoom};},z);
  const still=await flat(0);assert.equal(Math.abs(still.one.x)+Math.abs(still.one.y)+Math.abs(still.two.x),0,'at 100% the view does not move');
  const moved=await flat(3);
  assert.ok(Math.abs(moved.one.x-30)<1&&Math.abs(moved.one.y-12)<1,'one finger on empty space drags the zoomed view: '+JSON.stringify(moved));
  assert.ok(Math.abs(moved.two.x-6)<1,'two fingers moving together drag it too: '+JSON.stringify(moved));
  await p.evaluate(()=>{document.getElementById('zoom-label').click();});
  assert.equal(await p.evaluate(()=>Math.abs(Stage.pan.x)+Math.abs(Stage.pan.y)),0,'back at 100% the view is centred again');

  // 3D: a layer that covers the artwork leaves no empty space to drag on
  await p.locator('.tab[data-tab="layers"]').click();await p.locator('#btn-add').click();await p.locator('.add-tile',{hasText:'רקע מונפש'}).click();await p.waitForTimeout(900);
  const id=await p.evaluate(()=>App.rec.elements[0].id);
  await p.evaluate(()=>App.select(null));
  await p.locator('#btn-3d').tap();await p.waitForSelector('#editor-3d-host a-scene canvas, a-scene canvas');await p.waitForTimeout(2500);
  const touch=(steps)=>p.evaluate((steps)=>{const c=document.querySelector('a-scene canvas'),r=c.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
    const ev=(t,x,y)=>c.dispatchEvent(new PointerEvent(t,{pointerId:9,pointerType:'touch',isPrimary:true,clientX:cx+x,clientY:cy+y,bubbles:true,cancelable:true,button:0,buttons:t==='pointerup'?0:1}));
    ev('pointerdown',0,0);for(let i=1;i<=steps;i++)ev('pointermove',i*8,i*3);ev('pointerup',steps*8,steps*3);
    const rig=[...document.querySelectorAll('a-scene a-entity')].find(n=>n.querySelector('[data-el-root]')),rot=rig.getAttribute('rotation');return{x:rot.x,y:rot.y,sel:App.selId};},steps);
  const turned=await touch(10);
  assert.ok(Math.abs(turned.y)>10&&Math.abs(turned.x)>3,'a finger dragged over a layer turns the 3D view: '+JSON.stringify(turned));
  assert.equal(turned.sel,null,'and does not pick the layer');
  const tapped=await touch(0);await p.waitForTimeout(200);
  assert.equal(await p.evaluate(()=>App.selId),id,'a tap on the layer picks it');
  assert.equal(tapped.y,turned.y,'a tap does not turn the view');
  // the name of the picked layer does not sit on the 3D tools
  const over=await p.evaluate(()=>{const a=document.getElementById('sel-bar').getBoundingClientRect(),t=document.getElementById('editor-3d-tools').getBoundingClientRect();return !(a.right<=t.left||a.left>=t.right||a.bottom<=t.top||a.top>=t.bottom);});
  assert.equal(over,false,'the layer bar and the 3D tools do not overlap');
  assert.deepEqual(errs,[],'no page errors');
  console.log('ok v2-phone');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e);process.exit(1);});
