const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Acceptance (gizmo view-fit, from Adi's phone screenshot): the RGB arrows must stay INSIDE
// the viewport with their heads visible even for a full-frame tilted plane, and stay a
// usable size when zooming. Scaling is view-only: element position/rotation never change.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
 const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const p=await ctx.newPage();
 await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);
 const id=await p.evaluate(async()=>{const r=Studio.blankExperience('fit3d');r.target={artRect:{x:0,y:0,w:768,h:1024},natural:{w:768,h:1024}};const c=document.createElement('canvas');c.width=768;c.height=1024;const g=c.getContext('2d');g.fillStyle='#ffffff';g.fillRect(0,0,768,1024);r.assets.__artwork=await new Promise(res=>c.toBlob(res));
  const blob=await fetch('/library/star.png').then(r=>r.blob());
  const big={id:'big',name:'BIG',type:'image',x:0,y:0,w:1.0,rot:0,rotX:-25,rotY:10,asset:'big.png'};r.assets['big.png']=blob;
  const small={id:'small',name:'SMALL',type:'image',x:0,y:0,w:.1,rot:0,asset:'small.png'};r.assets['small.png']=blob; // centered: edge-placed elements are edge-capped by design
  r.elements=[big,small];r.elements.forEach(Studio.normEl);await Studio.save(r);const opt=document.createElement('option');opt.value=r.id;opt.textContent=r.name;document.querySelector('#exp-select').append(opt);return r.id;});
 await p.locator('#exp-select').selectOption(id);
 await p.waitForFunction(()=>parseFloat(document.querySelector('#preview').style.height)>300,{timeout:10000});
 await p.tap('#btn-3d');await p.waitForSelector('[data-el-root]',{state:'attached',timeout:20000});
 const tipOf=async(gi)=>{await p.evaluate(()=>Editor3D._test.scene().object3D.updateMatrixWorld(true));return p.evaluate(gi=>{const g=Editor3D._test.gizmo();const cone=g.children[gi].children[1];const v=new THREE.Vector3();cone.getWorldPosition(v);v.project(Editor3D._test.scene().camera);const r=Editor3D._test.scene().canvas.getBoundingClientRect();return {x:r.left+(v.x+1)/2*r.width,y:r.top+(-v.y+1)/2*r.height,rect:{l:r.left,t:r.top,w:r.width,h:r.height}};},gi);};
 const ringPt=async(k,a)=>p.evaluate(([k,a])=>{const g=Editor3D._test.gizmo();const ring=g.children[k];const R=ring.geometry.parameters.radius;const v=new THREE.Vector3(Math.cos(a)*R,Math.sin(a)*R,0);ring.localToWorld(v);v.project(Editor3D._test.scene().camera);const r=Editor3D._test.scene().canvas.getBoundingClientRect();return {x:r.left+(v.x+1)/2*r.width,y:r.top+(-v.y+1)/2*r.height,rect:{l:r.left,t:r.top,w:r.width,h:r.height}};},[k,a]);
 const selectEl=async(name)=>{await p.evaluate(name=>{document.querySelectorAll('#element-list li').forEach(li=>{const t=li.textContent.trim().replace(/^\S+\s+/,'');if(t===name||t.startsWith(name+' '))li.click();});},name);await p.waitForTimeout(400);await p.evaluate(()=>{const w=document.querySelector('#canvas-wrap');scrollTo(0,w.getBoundingClientRect().top+scrollY-8);});await p.waitForTimeout(300);};
 const inView=(pt,tag)=>{assert.ok(pt.x>pt.rect.l+2&&pt.x<pt.rect.l+pt.rect.w-2&&pt.y>pt.rect.t+2&&pt.y<pt.rect.t+pt.rect.h-2,tag+' inside viewport: '+JSON.stringify(pt));};
 const state=()=>p.evaluate(id=>Studio.load(id).then(r=>({big:r.elements.find(e=>e.id==='big'),small:r.elements.find(e=>e.id==='small')})),id);
 // 1. the screenshot scenario: full-frame tilted plane - all three arrow heads visible
 await selectEl('BIG');
 const s0=await state();
 const sc1=await p.evaluate(()=>Editor3D._test.gizmo().scale.x);
 for(let i=0;i<3;i++) inView(await tipOf(i),'arrow'+i);
 assert.ok(sc1<1,'big plane: gizmo shrunk to fit the view, scale='+sc1);
 // 2. view-only: no element data changed by the rescale
 const s1=await state();
 for(const k of ['x','y','rot','rotX','rotY','w']) assert.deepStrictEqual(s1.big[k],s0.big[k],'big.'+k+' unchanged');
 // 3. zoom in (wheel): heads stay in view, scale adapts
 await p.evaluate(()=>{const sc=Editor3D._test.scene();sc.canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:-500,bubbles:true,cancelable:true}));});await p.waitForTimeout(300);
 const sc2=await p.evaluate(()=>Editor3D._test.gizmo().scale.x);
 for(let i=0;i<3;i++) inView(await tipOf(i),'zoomed arrow'+i);
 assert.ok(sc2<sc1,'zoom-in shrinks world size further: '+sc1+' -> '+sc2);
 // 4. small sticker: handles stay grabbable (scale grows, clamped), heads in view
 await p.evaluate(()=>{const sc=Editor3D._test.scene();sc.canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:500,bubbles:true,cancelable:true}));});await p.waitForTimeout(200);
 await selectEl('SMALL');
 const sc3=await p.evaluate(()=>Editor3D._test.gizmo().scale.x);
 assert.ok(sc3>1&&sc3<=1.6,'small element: gizmo enlarged within clamp, scale='+sc3);
 for(let i=0;i<3;i++) inView(await tipOf(i),'small arrow'+i);
 // 5. rotate mode: ring edge stays in view for the big plane too
 await selectEl('BIG');
 await p.tap('#btn-3d-rotate');await p.waitForTimeout(300);
 for(let k=0;k<3;k++) inView(await ringPt(k,Math.PI/3),'ring'+k);
 console.log('PASS 3D gizmo view-fit: arrow heads/rings stay in the viewport for full-frame tilted media and small stickers, zoom-adaptive, element data untouched');
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
