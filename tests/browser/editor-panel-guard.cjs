const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Acceptance (panel editing-semantics guard): numeric inputs and sliders on a KEYED element
// must not silently fight the timeline - sampled channels write a key at the frozen playhead,
// curve-mapped positions and keyed-group geometry are refused with a message, unkeyed stays base.
// The panel also mirrors the canvas: keyed elements show the SAMPLED frame, not dead base values.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
 const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const p=await ctx.newPage();
 await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);
 const id=await p.evaluate(async()=>{const r=Studio.blankExperience('guardpanel');r.target={artRect:{x:0,y:0,w:768,h:768},natural:{w:768,h:768}};const c=document.createElement('canvas');c.width=768;c.height=768;const g=c.getContext('2d');g.fillStyle='#ffffff';g.fillRect(0,0,768,768);r.assets.__artwork=await new Promise(res=>c.toBlob(res));
  const K=(x,y)=>({loop:false,keys:[{t:0,x,y,z:0,rot:0,opacity:1,scale:1,tap:'none'},{t:2,x,y,z:0,rot:0,opacity:1,scale:1,tap:'none'}]});
  const curve={id:'curve',name:'CV',type:'text',text:'CV',color:'#0000ff',x:0,y:.2,w:.15,rot:0,timeline:Object.assign(K(0,.2),{xyMap:{baseX:0,baseY:.2,matrix:[1,0,0,1,0,0]}})};
  const keyd={id:'keyd',name:'KD',type:'text',text:'KD',color:'#aa00aa',x:-.25,y:-.2,w:.15,rot:0,timeline:K(-.25,-.2)};
  const grp={id:'grp',name:'GR',type:'group',x:-.2,y:.3,w:.2,rot:0,children:['gc'],timeline:K(-.2,.3)};
  const gc={id:'gc',name:'GC',type:'text',text:'G',color:'#00aa00',x:-.2,y:.3,w:.1,rot:0};
  const free={id:'free',name:'FR',type:'text',text:'FR',color:'#ff0000',x:.3,y:-.35,w:.12,rot:0};
  r.elements=[curve,keyd,grp,gc,free];r.elements.forEach(Studio.normEl);await Studio.save(r);const opt=document.createElement('option');opt.value=r.id;opt.textContent=r.name;document.querySelector('#exp-select').append(opt);return r.id;});
 await p.locator('#exp-select').selectOption(id);
 await p.waitForFunction(()=>parseFloat(document.querySelector('#preview').style.height)>300,{timeout:10000});
 const selectEl=async(name)=>{for(let i=0;i<4;i++){await p.evaluate(name=>{document.querySelectorAll('#element-list li').forEach(li=>{const t=li.textContent.trim().replace(/^\S+\s+/,'');if(t===name||t.startsWith(name+' '))li.click();});},name);try{await p.waitForFunction(n=>document.querySelector('#panel-name').textContent.includes(n),name,{timeout:1200});return;}catch(e){}}throw new Error('could not select '+name);};
 const setNum=(id2,v)=>p.evaluate(([id2,v])=>{const n=document.querySelector('#'+id2);n.value=String(v);n.dispatchEvent(new Event('change'));},[id2,v]);
 const setSl=(id2,v)=>p.evaluate(([id2,v])=>{const n=document.querySelector('#'+id2);n.value=String(v);n.dispatchEvent(new Event('input'));},[id2,v]);
 const state=()=>p.evaluate(id=>Studio.load(id).then(r=>({curve:r.elements.find(e=>e.id==='curve'),keyd:r.elements.find(e=>e.id==='keyd'),grp:r.elements.find(e=>e.id==='grp'),free:r.elements.find(e=>e.id==='free'),msg:document.querySelector('#msg').textContent,liveHidden:document.querySelector('#btn-tl-live').hidden,numX:document.querySelector('#num-x').value,numRot:document.querySelector('#num-rot').value})),id);
 const clearMsg=async()=>{await p.waitForTimeout(6300);};
 // 1. keyed element: panel mirrors the SAMPLED frame, num-x writes a key at the frozen playhead
 await selectEl('KD');
 let s0=await state();
 assert.strictEqual(s0.numX,'-0.25','panel shows the sampled x (keys are static here): '+s0.numX);
 assert.ok(s0.liveHidden,'starting live');
 await setNum('num-x',0.1);await p.waitForTimeout(400);
 let s1=await state();
 assert.ok(!s1.liveHidden,'panel edit on a keyed element froze the playhead');
 assert.strictEqual(s1.keyd.x,-.25,'base x untouched');
 assert.strictEqual(s1.keyd.timeline.keys.length,3,'one key added');
 const nk=s1.keyd.timeline.keys.find(k=>k.t!==0&&k.t!==2);
 assert.ok(nk&&Math.abs(nk.x-0.1)<1e-6,'new key carries the typed x: '+JSON.stringify(nk));
 assert.strictEqual(s1.numX,'0.10','panel reflects the new sampled x: '+s1.numX);
 // 2. same keyed element: opacity slider + rot/size numerics land on the same frozen key
 await setSl('sl-opacity',0.3);await p.waitForTimeout(300);
 await setNum('num-rot',45);await p.waitForTimeout(300);
 await setNum('num-w',0.3);await p.waitForTimeout(300);
 let s2=await state();
 const k2=s2.keyd.timeline.keys.find(k=>k.t===nk.t);
 assert.ok(Math.abs(k2.opacity-0.3)<1e-6,'opacity slider wrote the frozen key: '+JSON.stringify(k2));
 assert.strictEqual(k2.rot,45,'rot numeric wrote the frozen key');
 assert.ok(Math.abs((k2.scale||1)-2)<1e-6,'size numeric wrote key scale = w/base_w: '+JSON.stringify(k2));
 assert.strictEqual(s2.keyd.opacity??1,1,'base opacity untouched');
 assert.strictEqual(s2.keyd.rot,0,'base rot untouched');
 assert.strictEqual(s2.keyd.w,.15,'base w untouched');
 // 3. curve-mapped element: num-x refused with a message, no write, no freeze
 await p.locator('#btn-tl-live').click();await p.waitForTimeout(300);
 await selectEl('CV');
 await setNum('num-x',0.4);await p.waitForTimeout(300);
 let s3=await state();
 assert.ok(s3.msg.includes('ציר הזמן'),'curve gate message: "'+s3.msg+'"');
 assert.strictEqual(s3.curve.x,s0.curve.x,'curve base x unchanged');
 assert.strictEqual(s3.curve.timeline.keys.length,2,'curve: no key written');
 assert.ok(s3.liveHidden,'curve panel edit did not freeze');
 await clearMsg();
 // 4. keyed group: geometry gated, rotation writable as a key
 await selectEl('GR');
 await setNum('num-x',0);await p.waitForTimeout(300);
 let s4=await state();
 assert.ok(s4.msg.includes('קבוצה'),'group gate message: "'+s4.msg+'"');
 assert.strictEqual(s4.grp.x,-.2,'group base x unchanged');
 assert.strictEqual(s4.grp.timeline.keys.length,2,'group: no key written by a gated edit');
 await clearMsg();
 await setNum('num-rot',45);await p.waitForTimeout(300);
 let s5=await state();
 assert.strictEqual(s5.grp.timeline.keys.length,3,'group rot numeric wrote a key (supported channel)');
 assert.strictEqual(s5.grp.rot,0,'group base rot untouched');
 // 5. unkeyed element: plain base edit, no freeze, no key
 await p.locator('#btn-tl-live').click();await p.waitForTimeout(300);
 await selectEl('FR');
 await setNum('num-x',0.1);await p.waitForTimeout(300);
 let s6=await state();
 assert.strictEqual(s6.free.x,0.1,'unkeyed base edit works');
 assert.ok(!s6.free.timeline||!s6.free.timeline.keys,'unkeyed: no timeline created');
 assert.ok(s6.liveHidden,'unkeyed edit did not freeze');
 console.log('PASS panel guard: keyed numerics/sliders write keys at the frozen playhead, curve/group geometry refused, unkeyed base edits unchanged, panel mirrors the sampled frame');
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
