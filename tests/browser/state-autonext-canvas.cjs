const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Round AU: rendered proof that the 2D canvas preview advances the autoNext chain
// (state1 -> state2 at the configured second, red out / blue in, tab UI follows),
// an independent manual track clock keeps advancing across the switch, and a looping
// state's one-shot timeline wraps back to its start on the live canvas.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{const p=await b.newPage();await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);const id=await p.evaluate(async()=>{const r=Studio.blankExperience('autoNext QA');r.target={artRect:{x:0,y:0,w:768,h:1024},natural:{w:768,h:1024}};const c=document.createElement('canvas');c.width=768;c.height=1024;c.getContext('2d').fillRect(0,0,768,1024);r.assets.__artwork=await new Promise(res=>c.toBlob(res));r.sequences=[{id:'s1',name:'First',autoNext:{at:1.5,to:'s2'}},{id:'s2',name:'Second',autoNext:{at:1,to:'s3'}},{id:'s3',name:'Loop',loop:true}];r.tracks=[{id:'t1',name:'Manual',autoStart:false}];r.elements=[{id:'a',name:'A',type:'text',color:'#ff0000',text:'A',x:0,y:-0.2,w:.2,rot:0,seq:'s1',timeline:{keys:[{t:0,x:-0.3},{t:1,x:0.3}]}},{id:'b',name:'B',type:'text',color:'#0000ff',text:'B',x:.2,y:0,w:.2,rot:0,seq:'s2'},{id:'c',name:'C',type:'text',color:'#00ff00',text:'C',x:0,y:.25,w:.2,rot:0,track:'t1',timeline:{loop:true,keys:[{t:0,x:-0.3},{t:3,x:0.3}]}},{id:'d',name:'D',type:'text',color:'#ff00ff',text:'D',x:0,y:0,w:.2,rot:0,seq:'s3',timeline:{keys:[{t:0,x:-0.3},{t:.8,x:0.3}]}}];await Studio.save(r);const opt=document.createElement('option');opt.value=r.id;opt.textContent=r.name;document.querySelector('#exp-select').append(opt);return r.id;});
const shots=[];
const pix=(name)=>p.evaluate((match)=>{const c=document.querySelector('#preview'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0,x=0;for(let i=0;i<d.length;i+=4){const r=d[i],g=d[i+1],bl=d[i+2];const hit=match==='red'?r>100&&g<20&&bl<20:match==='blue'?bl>100&&r<20&&g<20:match==='green'?g>100&&r<20&&bl<20:r>100&&bl>100&&g<20;if(hit){n++;x+=(i/4)%c.width;}}return{n,x:n?x/n:0,png:c.toDataURL()};},name);
const snap=(im,tag)=>{shots.push([tag,im.png]);return{n:im.n,x:im.x};};
await p.locator('#exp-select').selectOption(id);
await p.waitForTimeout(250);
// before the chain advances: red (state 1) visible, blue (state 2) hidden
const before=snap(await pix('red'),'au-0-before');assert(before.n>50,'red visible in state First');
assert((await pix('blue')).n===0,'blue hidden before autoNext');
// start the manual track: green element runs on its own clock
await p.locator('[data-preview-track=t1]').click();
await p.waitForTimeout(300);const g1=await pix('green');
await p.waitForTimeout(300);const g2=await pix('green');
assert(g2.x>g1.x+5,'manual track green advancing before switch');
// wait for the autoNext switch at 1.5s into state First
await p.waitForFunction(()=>{const d=document.querySelector('#preview').getContext('2d').getImageData(0,0,10,10).data;const tabs=[...document.querySelectorAll('.seq-tab')];return tabs.some(t=>t.classList.contains('sel')&&t.textContent==='Second');},{timeout:6000});
const tab=await p.evaluate(()=>{const t=document.querySelector('.seq-tab.sel');return t?t.textContent:null;});assert.equal(tab,'Second');
const after=snap(await pix('blue'),'au-1-after-switch');assert(after.n>50,'blue visible after autoNext switch');
assert((await pix('red')).n===0,'red hidden after autoNext switch');
// independent track clock keeps advancing across the state switch
const g3=await pix('green');await p.waitForTimeout(300);const g4=await pix('green');
assert(g3.n>50&&g4.n>50,'green track still visible in state Second');
assert(g4.x>g3.x+5,'manual track green still advancing after switch');
// second hop: Second chains to Loop at 1s; the canvas follows without any click
await p.waitForFunction(()=>{const t=document.querySelector('.seq-tab.sel');return t&&t.textContent==='Loop';},{timeout:6000});
const hop2=snap(await pix('magenta'),'au-3-second-hop');assert(hop2.n>50,'magenta visible after second chain hop');
// looping state: one-shot timeline wraps back to its start on the live canvas
let peak=-1,wrapped=false;
for(let i=0;i<40;i++){await p.waitForTimeout(120);const m=await pix('magenta');if(m.n>50){if(m.x>peak)peak=m.x;else if(peak>0&&m.x<peak-40){wrapped=true;break;}}}
assert(wrapped,'looping state one-shot timeline wraps back toward start');
snap(await pix('magenta'),'au-2-loop-wrap');
shots.forEach(([tag,png])=>require('fs').writeFileSync('/downloads/'+tag+'.png',Buffer.from(png.split(',')[1],'base64')));
console.log('PASS canvas autoNext two-hop chain switch, independent track clock continuity across switch, looping-state one-shot wrap',{before:before.x,after:after.x,g:[g1.x,g2.x,g3.x,g4.x],peak});}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
