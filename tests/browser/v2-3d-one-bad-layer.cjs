const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// The editor's 3D view survives a broken layer. Before, an error thrown by one layer's per-frame code, or while one layer
// was drawn, stopped every frame before anything was drawn: the 3D view stayed grey and the flat view showed stand-in
// tiles. Here two layers are made to fail on purpose (one throws in its per-frame code, one throws while it is drawn):
// the view must keep drawing frames, the good layer must stay visible, only the layer that cannot be drawn is set
// aside, and the failures are kept in the log. Headless Chrome; the errors are simulated, not a real device fault.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
  const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined');
  const id=await p.evaluate(async()=>{const cv=(w,h,col)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.fillStyle=col;g.fillRect(0,0,w,h);return new Promise(r=>c.toBlob(r,'image/png'));};
    const a=Studio.blankExperience('תקלה');a.target={artRect:{x:0,y:0,w:300,h:400},natural:{w:300,h:400}};a.assets.__artwork=await cv(300,400,'#ffffff');for(const k of ['red','green','blue'])a.assets[k]=await cv(100,100,k);
    a.elements=['red','green','blue'].map((k,i)=>({id:k,type:'image',name:k,assetId:k,x:-0.3+i*0.3,y:0,w:0.2,h:0.2,rot:0,z:0.02,aspect:1,seq:null}));await Studio.save(a);return a.id;});
  await p.goto(base+'/index.html#/e/'+id);await p.reload();await p.waitForFunction(()=>typeof App!=='undefined'&&App.rec&&App.art,null,{timeout:20000});await p.waitForTimeout(800);
  await p.locator('#btn-3d').click();await p.waitForFunction(()=>{const s=document.querySelector('#editor-3d-host a-scene');return s&&s.__drawn>5&&s.querySelectorAll('[data-el-root]').length===3;},null,{timeout:20000});
  const drawn=()=>p.evaluate(()=>document.querySelector('#editor-3d-host a-scene').__drawn);
  // 1. a layer whose per-frame code throws
  await p.evaluate(()=>{AFRAME.registerComponent('always-throws',{tick(){throw Error('boom in a tick');}});document.querySelector('[data-el-root="red"]').setAttribute('always-throws','');});
  let d0=await drawn();await p.waitForTimeout(1500);let d1=await drawn();
  assert.ok(d1-d0>10,'frames keep being drawn while a layer throws every frame: '+(d1-d0));
  assert.equal(await p.evaluate(()=>document.querySelector('#editor-3d-host a-scene').behaviors.tick.some(c=>c.attrName==='always-throws')),false,'the failing per-frame code is dropped');
  // 2. a layer that throws while it is drawn
  await p.evaluate(()=>{document.querySelector('[data-el-root="green"]').object3D.traverse(o=>{if(o.isMesh)o.onBeforeRender=()=>{throw Error('boom in a draw');};});});
  await p.waitForTimeout(1500);d0=await drawn();await p.waitForTimeout(1500);d1=await drawn();
  assert.ok(d1-d0>10,'frames are drawn again after the layer that cannot be drawn is set aside: '+(d1-d0));
  const st=await p.evaluate(()=>{const s=document.querySelector('#editor-3d-host a-scene'),vis=k=>{let o=document.querySelector('[data-el-root="'+k+'"]').object3D,v=true;for(;o;o=o.parent)v=v&&o.visible;return v;};
    return {aside:s.__aside.map(n=>n.dataset.elRoot),red:vis('red'),green:vis('green'),log:JSON.parse(localStorage.getItem('brill-3d-errors')||'[]').map(r=>r.where)};});
  assert.ok(st.aside.includes('green'),'the layer that cannot be drawn is set aside: '+st.aside);assert.equal(st.green,false);
  assert.equal(st.red,true,'a layer whose per-frame code failed is still shown');
  assert.ok(st.log.some(w=>/^tick:/.test(w))&&st.log.includes('draw'),'both failures are in the log: '+st.log);
  console.log('PASS v2-3d-one-bad-layer',JSON.stringify(st));
}finally{await b.close();server.close();}})().catch(e=>{console.error(e);process.exit(1);});
