const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Acceptance (2D canvas editing-semantics guard): same contract as the 3D gizmo - a canvas
// drag the timeline would silently override is REFUSED with a message (curve-mapped element,
// keyed group); a plain keyed element writes a key at the frozen playhead; unkeyed stays base.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
 const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const p=await ctx.newPage();
 await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);
 const id=await p.evaluate(async()=>{const r=Studio.blankExperience('guard2d');r.target={artRect:{x:0,y:0,w:768,h:768},natural:{w:768,h:768}};const c=document.createElement('canvas');c.width=768;c.height=768;const g=c.getContext('2d');g.fillStyle='#ffffff';g.fillRect(0,0,768,768);r.assets.__artwork=await new Promise(res=>c.toBlob(res));
  const K=(x,y)=>({loop:false,keys:[{t:0,x,y,z:0,rot:0,opacity:1,scale:1,tap:'none'},{t:2,x,y,z:0,rot:0,opacity:1,scale:1,tap:'none'}]});
  const curve={id:'curve',name:'CV',type:'text',text:'CV',color:'#0000ff',x:0,y:.2,w:.15,rot:0,timeline:Object.assign(K(0,.2),{xyMap:{baseX:0,baseY:.2,matrix:[1,0,0,1,0,0]}})};
  const keyd={id:'keyd',name:'KD',type:'text',text:'KD',color:'#aa00aa',x:-.25,y:-.2,w:.15,rot:0,timeline:K(-.25,-.2)};
  const grp={id:'grp',name:'GR',type:'group',x:-.2,y:.3,w:.2,rot:0,children:['gc'],timeline:K(-.2,.3)};
  const gc={id:'gc',name:'GC',type:'text',text:'G',color:'#00aa00',x:-.2,y:.3,w:.1,rot:0}; // child at zero offset from the group origin, so it draws where the group samples
  const free={id:'free',name:'FR',type:'text',text:'FR',color:'#ff0000',x:.3,y:-.35,w:.12,rot:0};
  const blob=await fetch('/library/star.png').then(r=>r.blob());
  const img={id:'img',name:'IM',type:'image',x:.3,y:.1,w:.15,rot:0,asset:'star.png',timeline:K(.3,.1)};r.assets['star.png']=blob;
  r.elements=[curve,keyd,grp,gc,free,img];r.elements.forEach(Studio.normEl);await Studio.save(r);const opt=document.createElement('option');opt.value=r.id;opt.textContent=r.name;document.querySelector('#exp-select').append(opt);return r.id;});
 await p.locator('#exp-select').selectOption(id);
 await p.waitForFunction(()=>parseFloat(document.querySelector('#preview').style.height)>300,{timeout:10000});
 await p.locator('#preview').scrollIntoViewIfNeeded();await p.waitForTimeout(300);
 const box=await p.locator('#preview').boundingBox();
 const aw=box.width*2/3,ah=box.height*2/3,ax=box.x+box.width/6,ay=box.y+box.height/6;
 const pt=(x,y)=>({x:ax+aw*(x+.5),y:ay+ah*(.5-y)});
 const state=()=>p.evaluate(id=>Studio.load(id).then(r=>({curve:r.elements.find(e=>e.id==='curve'),keyd:r.elements.find(e=>e.id==='keyd'),grp:r.elements.find(e=>e.id==='grp'),free:r.elements.find(e=>e.id==='free'),img:r.elements.find(e=>e.id==='img'),msg:document.querySelector('#msg').textContent,liveHidden:document.querySelector('#btn-tl-live').hidden})),id);
 const clearMsg=async()=>{await p.waitForTimeout(6300);};
 // 1. curve-mapped element: canvas drag is REFUSED with a message; nothing changes, no freeze
 let s0=await state();
 let c0=pt(0,.2);
 await p.mouse.move(c0.x,c0.y);await p.mouse.down();await p.mouse.move(c0.x+aw*.1,c0.y,{steps:4});await p.mouse.up();await p.waitForTimeout(300);
 let s1=await state();
 assert.ok(s1.msg.includes('ציר הזמן'),'curve gate message: "'+s1.msg+'"');
 assert.strictEqual(s1.curve.x,s0.curve.x,'curve base x unchanged');
 assert.strictEqual(s1.curve.timeline.keys.length,2,'curve: no key written');
 assert.ok(s1.liveHidden,'curve drag did not freeze the playhead');
 await clearMsg();
 // 2. plain keyed element: drag writes a KEY at the frozen playhead, base untouched
 let k0=pt(-.25,-.2);
 await p.mouse.move(k0.x,k0.y);await p.mouse.down();await p.mouse.move(k0.x+aw*.15,k0.y-ah*.1,{steps:5});await p.mouse.up();await p.waitForTimeout(400);
 let s2=await state();
 assert.ok(!s2.liveHidden,'keyed drag froze the playhead (btn-tl-live shown)');
 const kk=s2.keyd.timeline.keys;
 assert.strictEqual(kk.length,3,'one key added: '+JSON.stringify(kk));
 const nk=kk.find(k=>k.t!==0&&k.t!==2);
 assert.ok(nk&&Math.abs(nk.x-(-.1))<.02&&Math.abs(nk.y-(-.1))<.02,'key carries the dragged position: '+JSON.stringify(nk));
 assert.strictEqual(s2.keyd.x,-.25,'base x untouched');
 // 3. keyed group: box drag is REFUSED with a message
 await p.evaluate(()=>{document.querySelectorAll('#element-list li').forEach(li=>{const t=li.textContent.trim().replace(/^\S+\s+/,'');if(t==='GR'||t.startsWith('GR '))li.click();});});
 await p.waitForTimeout(400);await p.locator('#preview').scrollIntoViewIfNeeded();await p.waitForTimeout(200);
 let g0=pt(-.2,.3);
 await p.mouse.move(g0.x,g0.y);await p.mouse.down();await p.mouse.move(g0.x+aw*.1,g0.y,{steps:4});await p.mouse.up();await p.waitForTimeout(300);
 let s3=await state();
 assert.ok(s3.msg.includes('קבוצה'),'group gate message: "'+s3.msg+'"');
 assert.strictEqual(s3.grp.x,-.2,'group base x unchanged');
 assert.strictEqual(s3.grp.timeline.keys.length,2,'group: no key written');
 await clearMsg();
 // 4. keyed IMAGE scale handle: writes a scale key at the frozen playhead
 await p.evaluate(()=>{document.querySelectorAll('#element-list li').forEach(li=>{const t=li.textContent.trim().replace(/^\S+\s+/,'');if(t==='IM'||t.startsWith('IM '))li.click();});});
 await p.waitForTimeout(400);await p.locator('#preview').scrollIntoViewIfNeeded();await p.waitForTimeout(200);
 const dims=await p.evaluate(()=>{const i=new Image();return new Promise(res=>{i.onload=()=>res({w:i.naturalWidth,h:i.naturalHeight});i.src='/library/star.png';});});
 const ih=.15*(dims.h/dims.w)*(aw/ah)*(ah/aw); // square target: fraction-space height = w*(nh/nw)
 const ic=pt(.3,.1),hx=ic.x+aw*.15/2,hy=ic.y+ah*(.15*(dims.h/dims.w))/2;
 await p.mouse.move(hx,hy);await p.mouse.down();await p.mouse.move(hx+aw*.08,hy+ah*.08,{steps:5});await p.mouse.up();await p.waitForTimeout(400);
 let s4=await state();
 const ik=s4.img.timeline.keys;
 assert.strictEqual(ik.length,3,'scale key added: '+JSON.stringify(ik));
 const sk=ik.find(k=>k.t!==0&&k.t!==2);
 assert.ok(sk&&sk.scale>1.2,'scale key grew: '+JSON.stringify(sk));
 assert.strictEqual(s4.img.w,.15,'base width untouched');
 // 5. unkeyed element: base edit still works, no freeze, no message
 await p.locator('#btn-tl-live').click();await p.waitForTimeout(200);
 await p.locator('#preview').scrollIntoViewIfNeeded();await p.waitForTimeout(200);
 const box5=await p.locator('#preview').boundingBox();
 const pt5=(x,y)=>({x:box5.x+box5.width/6+box5.width*2/3*(x+.5),y:box5.y+box5.height/6+box5.height*2/3*(.5-y)});
 let f0=pt5(.3,-.35);
 await p.mouse.move(f0.x,f0.y);await p.mouse.down();await p.mouse.move(f0.x-aw*.1,f0.y,{steps:4});await p.mouse.up();await p.waitForTimeout(300);
 let s5=await state();
 assert.ok(Math.abs(s5.free.x-.2)<.02,'unkeyed base move works: x='+s5.free.x);
 assert.ok(s5.liveHidden,'unkeyed drag did not freeze');
 assert.strictEqual(s5.msg,'','no guard message for a plain base edit');
 console.log('PASS 2D canvas editing guard: curve/group drags refused with message, keyed drags write keys at the frozen playhead, unkeyed base edits unchanged');
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
