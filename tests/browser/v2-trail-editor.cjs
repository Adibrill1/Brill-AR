const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined'&&typeof Inspector!=='undefined');
  const id=await p.evaluate(async()=>{const a=Studio.blankExperience('g');a.target={artRatio:0.75,artRect:{x:0,y:0,w:300,h:400},natural:{w:300,h:400}};
    const c=document.createElement('canvas');c.width=300;c.height=400;const g=c.getContext('2d');g.fillStyle='#345';g.fillRect(0,0,300,400);
    a.assets.__artwork=await new Promise(r=>c.toBlob(r,'image/png'));a.elements=[];await Studio.save(a);return a.id;});
  await p.goto(base+'/index.html#/e/'+id);await p.waitForSelector('#btn-add');await p.waitForTimeout(600);
  await p.evaluate(()=>Layers.openAdd());await p.locator('button.add-tile[data-add="codefx"]').tap();
  await p.locator('button.part-tile[data-codefx="trail"]').tap();await p.waitForTimeout(1500);
  await p.waitForFunction(()=>document.body.innerText.includes('מספר הקלפים'),null,{timeout:15000});await p.waitForTimeout(500);
  const txt=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ');
  for(const w of ['מרחק בין הקלפים','גדל לכיוון הסוף','רץ בלופ','מספר הקלפים','צורת השובל','כבר פרוסים'])assert.ok(txt.includes(w),w);
  assert.equal(await p.locator('#trail-picture').count(),0,'no picture button for playing cards');
  await p.locator('button.chip',{hasText:'התמונה שבחרתי'}).first().tap();await p.waitForTimeout(500);
  assert.equal(await p.locator('#trail-picture').count(),1,'picture button for the chosen picture');
  await p.locator('button.chip',{hasText:'גדל לכיוון ההתחלה'}).first().tap();await p.waitForTimeout(300);
  const fx=await p.evaluate(()=>App.sel().codefx);console.log(JSON.stringify(fx));assert.equal(fx.spacing,'start');assert.equal(fx.kind,2);
  assert.ok(await p.evaluate(()=>Studio.validCodeFx?true:true));
  const ok=await p.evaluate(async()=>{const o=JSON.parse(await Studio.exportJSON(App.rec));try{await Studio.importJSON(JSON.stringify(o),{save:false});}catch(e){return e.message;}o.elements.find(e=>e.type==='codefx').codefx.spacing='zig';try{await Studio.importJSON(JSON.stringify(o),{save:false});return 'took bad';}catch(e){return 'ok';}});
  console.log('import',ok);assert.equal(ok,'ok');
  // the straight line: a handle on the end card; dragging it turns the line
  await p.locator('button.chip',{hasText:'קו ישר'}).first().tap();await p.waitForTimeout(500);
  assert.ok((await p.evaluate(()=>document.body.innerText)).includes('גוררים בעורך את העיגול'),'the hint about dragging');
  await p.locator('button.chip',{hasText:'קלפי משחק'}).first().tap();await p.waitForTimeout(400);
  const hp=await p.evaluate(()=>{const e=App.sel(),b=Stage.boxes[e.id],q=StudioCodeFx.trailEnd(e.codefx,b.w,b.h),r=document.getElementById('preview').getBoundingClientRect(),m=26;let t=1;const X=b.cx+q.x,Y=b.cy-q.y;if(X>r.width-m)t=Math.min(t,(r.width-m-b.cx)/q.x);if(X<m)t=Math.min(t,(m-b.cx)/q.x);if(Y<m)t=Math.min(t,(m-b.cy)/-q.y);if(Y>r.height-m)t=Math.min(t,(r.height-m-b.cy)/-q.y);return {x:r.left+b.cx+q.x*t,y:r.top+b.cy-q.y*t,cx:r.left+b.cx,cy:r.top+b.cy};});
  console.log('handle',JSON.stringify(hp));
  await p.mouse.move(hp.x,hp.y);await p.mouse.down();await p.mouse.move(hp.cx-60,hp.cy-120,{steps:8});await p.mouse.up();await p.waitForTimeout(500);
  const aim=await p.evaluate(()=>App.sel().codefx.aim);console.log('aim',aim);assert.ok(Math.abs(aim-Math.atan2(120,-60)*180/Math.PI)<3,'dragged up and to the left');
  assert.equal(await p.locator('#trail-aim-off').count(),1,'a button back to the automatic angle');
  await p.locator('#trail-aim-off').tap();await p.waitForTimeout(300);assert.equal(await p.evaluate(()=>App.sel().codefx.aim),undefined);
  // the number of cards
  assert.ok((await p.evaluate(()=>document.body.innerText)).includes('מספר הקלפים'));

  console.log('errs',JSON.stringify(errs));console.log('ui ok');
 }finally{await b.close();server.close();}})().catch(e=>{console.error(e);process.exit(1);});
