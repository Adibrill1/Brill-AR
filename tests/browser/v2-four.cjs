// Four code looks on the preview page: scratch (a finger scratches the coat off), storm (a tap brings lightning),
// countdown (days to a date, the day itself), puzzle (taps swap pieces until it is solved; the sliding puzzle moves).
const assert=require('assert');
const {chromium}=require('playwright-core');const server=require('../../server/server');
const OUT=process.env.SHOTS||'';
const day=(n)=>{const t=new Date(Date.now()+n*86400000),z=v=>String(v).padStart(2,'0');return t.getFullYear()+'-'+z(t.getMonth()+1)+'-'+z(t.getDate());};
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const ctx=await b.newContext({viewport:{width:390,height:700},deviceScaleFactor:2});
  const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>{errs.push(String(e));console.log('ERR',String(e));});p.on('console',m=>{if(m.type()==='error'){errs.push(m.text());console.log('ERR',m.text().slice(0,400));}});
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined'&&window.StudioCodeFx);
  const open=async(look,extra)=>{
    await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined');
    const cid=await p.evaluate(async([look,extra])=>{const a=Studio.blankExperience('c');a.target={artRatio:1,artRect:{x:0,y:0,w:600,h:600},natural:{w:600,h:600}};
      const c=document.createElement('canvas');c.width=c.height=600;const g=c.getContext('2d');const gr=g.createLinearGradient(0,0,600,600);[[0,'#ff9a5a'],[0.5,'#ff5fa2'],[1,'#5a6bff']].forEach(([o,col])=>gr.addColorStop(o,col));g.fillStyle=gr;g.fillRect(0,0,600,600);
      g.fillStyle='#fff6';for(let i=0;i<9;i++){g.beginPath();g.arc(60+(i%3)*240,60+Math.floor(i/3)*240,50,0,7);g.fill();}g.fillStyle='#fff';g.font='bold 120px Arial';g.textAlign='center';g.fillText('1 2 3',300,340);
      a.assets.__artwork=await new Promise(r=>c.toBlob(r,'image/png'));
      const f=Object.assign(Studio.codeFxDefaults(look),extra||{});a.elements=[{id:Studio.newId(),type:'codefx',name:look,codefx:f,x:0,y:0,w:1,h:1,aspect:1,rot:0,z:0,flush:true,seq:null}];await Studio.save(a);return a.id;},[look,extra]);
    await p.goto(base+'/preview.html#'+cid);
    await p.waitForFunction(()=>{const n=document.querySelector('[studio-codefx]');return n&&n.components['studio-codefx']&&n.components['studio-codefx'].group&&n.components['studio-codefx'].group.children.length>0;},null,{timeout:20000});
    await p.waitForTimeout(1500);
  };
  const screen=(x,y)=>p.evaluate(([x,y])=>{const C=document.querySelector('[studio-codefx]').components['studio-codefx'];const v=new THREE.Vector3(x,y,0);C.group.localToWorld(v);v.project(C.el.sceneEl.camera);const r=C.el.sceneEl.canvas.getBoundingClientRect();return {x:r.left+(v.x+1)/2*r.width,y:r.top+(1-v.y)/2*r.height};},[x,y]);
  const C=(js)=>p.evaluate(new Function('const C=document.querySelector("[studio-codefx]").components["studio-codefx"];return ('+js+');'));
  const shot=async(n)=>{if(OUT)await p.screenshot({path:OUT+'/'+n+'.png'});};

  // scratch: a mouse over the coat scratches like a finger (a drag would turn the view here), then most of it, and the rest goes by itself
  await open('scratch');await shot('scratch-a');
    for(let row=0;row<3;row++){const a=await screen(-0.4,0.3-row*0.3),z=await screen(0.4,0.3-row*0.3);await p.mouse.move(a.x,a.y);await p.mouse.move(z.x,z.y,{steps:14});}
  await p.waitForTimeout(300);await shot('scratch-b');
  assert.equal(await C('C.parts.scratch.open'),0,'three lines do not open it all');
  for(let row=0;row<14;row++){const y=0.48-row*0.075,a=await screen(-0.5,y),z=await screen(0.5,y);await p.mouse.move(a.x,a.y);await p.mouse.move(z.x,z.y,{steps:10});}
  await p.waitForTimeout(250);await shot('scratch-c');await p.waitForTimeout(650);
  assert.equal(await C('C.parts.scratch.open'),1,'scratched most of the way, the rest goes by itself');

  // storm: a tap brings the lightning down there
  await open('storm');await p.waitForTimeout(400);
  const s=await screen(0.2,-0.3);await p.mouse.click(s.x,s.y);await p.waitForTimeout(40);await shot('storm-a');
  await p.waitForTimeout(1500);await shot('storm-b');

  // countdown: ten days away, and the day itself
  await open('countdown',{date:day(10),time:'00:00',kind:0});await shot('countdown-a');
  assert.ok(await C('Number.isFinite(C.parts.target)'),'the date is read');
  await open('countdown',{date:day(0),time:'00:00',kind:1,text:'יום הולדת שמח'});await p.waitForTimeout(1500);await shot('countdown-b');
  await open('countdown',{date:day(3),time:'12:30',kind:2});await shot('countdown-c');

  // puzzle: swap pieces until it is solved
  await open('puzzle',{kind:0});await shot('puzzle-a');
  const n=await C('C.parts.puzzle.n');
  const tapSlot=async(sl)=>{const at=await C('C.parts.puzzle.slotAt('+sl+')'),q=await screen(at.x,at.y);await p.mouse.click(q.x,q.y);await p.waitForTimeout(60);};
  let swaps=0;
  for(let i=0;i<n*n;i++){const board=await C('C.parts.puzzle.board.slice()');if(board[i]===i)continue;const j=board.indexOf(i);await tapSlot(i);if(i===0)await shot('puzzle-b');await tapSlot(j);swaps++;}
  await p.waitForTimeout(700);await shot('puzzle-c');
  assert.ok(await C('C.parts.puzzle.solved'),'every piece in its place: solved');
  assert.equal(await C('C.parts.puzzle.moves'),swaps,'every swap is a move');
  // the sliding puzzle: a tap next to the gap moves that piece
  await open('puzzle',{kind:2});await shot('puzzle-d');
  const gap=await C('C.parts.puzzle.board.indexOf(8)'),nb=gap%3<2?gap+1:gap-1;await tapSlot(nb);
  assert.equal(await C('C.parts.puzzle.board.indexOf(8)'),nb,'the piece slid into the gap');
  assert.equal(await C('C.parts.puzzle.moves'),1);
  // the real jigsaw: drag each piece to its place, it snaps in; more pieces from the setting
  await open('puzzle',{kind:3,pieces:3});await shot('jig-a');
  const jn=await C('C.parts.jig.pieces.length');assert.equal(jn,9,'three a row on a square picture: nine pieces');
  for(let i=0;i<jn;i++){
    const pc=await C('(p=>({x:p.pos.x,y:p.pos.y,hx:p.home.x,hy:p.home.y}))(C.parts.jig.pieces['+i+'])');
    // a piece under another may not be the top one: lift whichever is on top there until this one moves
    const from=await screen(pc.x,pc.y),to=await screen(pc.hx,pc.hy);
    await p.mouse.move(from.x,from.y);await p.mouse.down();await p.waitForTimeout(60);await p.mouse.move(to.x,to.y,{steps:8});await p.waitForTimeout(60);await p.mouse.up();await p.waitForTimeout(80);
    if(i===3)await shot('jig-b');
  }
  for(let round=0;round<4&&!(await C('C.parts.jig.solved'));round++){ // pieces that were under another: again
    const left=await C('C.parts.jig.pieces.map((p,i)=>p.locked?-1:i).filter(i=>i>=0)');
    for(const i of left){const pc=await C('(p=>({x:p.pos.x,y:p.pos.y,hx:p.home.x,hy:p.home.y}))(C.parts.jig.pieces['+i+'])');const from=await screen(pc.x,pc.y),to=await screen(pc.hx,pc.hy);
      await p.mouse.move(from.x,from.y);await p.mouse.down();await p.waitForTimeout(60);await p.mouse.move(to.x,to.y,{steps:8});await p.waitForTimeout(60);await p.mouse.up();await p.waitForTimeout(80);}
  }
  await p.waitForTimeout(600);await shot('jig-c');
  assert.ok(await C('C.parts.jig.solved'),'every piece in its place: solved');
  await open('puzzle',{kind:3,pieces:6});await shot('jig-d');assert.equal(await C('C.parts.jig.pieces.length'),36,'six a row: thirty-six pieces');
  await open('puzzle',{kind:0,pieces:5});assert.equal(await C('C.parts.puzzle.n'),5,'the swap puzzle takes the number too');
  assert.deepEqual(errs,[],'no errors');
  console.log('v2-four ok');
 }finally{await b.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
