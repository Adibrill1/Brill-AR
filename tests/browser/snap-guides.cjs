// Centre-line snap while dragging (mock interaction): single element pulls to x=0 / y=0 within ~1.8% / 1.4% of the artwork,
// shows a pink guide line during the drag, can be turned off (checkbox or Alt), and never snaps when far from the centre.
const {chromium}=require('playwright-core'),assert=require('assert/strict'),server=require('../../server/server');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const p=await (await b.newContext({viewport:{width:1280,height:900}})).newPage();let pageErrors=0;p.on('pageerror',()=>pageErrors++);
await p.goto(base+'/index.html');await p.waitForSelector('#element-list li');
await p.locator('#btn-text').click();await p.waitForSelector('#panel:not([hidden])');await p.waitForTimeout(500);
const geo=()=>p.evaluate(()=>{const c=document.getElementById('preview'),r=c.getBoundingClientRect(),id=Object.keys(window.__testBoxes)[Object.keys(window.__testBoxes).length-1];const bx=window.__testBoxes[id];return {l:r.left,t:r.top,cw:r.width,ch:r.height,bx,id}});
const elXY=async(id)=>p.evaluate(async id=>{const l=await Studio.all();const e=l.flatMap(r=>r.elements).find(e=>e.id===id);return [e.x,e.y]},(await geo()).id);
// artwork W = canvas / 1.5 (MARGIN_FRAC .25 each side); 1% of artwork width in px:
const dragTo=async(offX,offY,opts={})=>{await p.evaluate(()=>document.getElementById('preview').scrollIntoView({block:'center'}));await p.waitForTimeout(150);const g=await geo();const sx=g.l+g.bx.cx,sy=g.t+g.bx.cy;const W=g.cw/1.5,H=g.ch/1.5;const tx=g.l+g.cw/2+offX*W,ty=g.t+g.ch/2-offY*H;
 await p.mouse.move(sx,sy);await p.mouse.down();await p.mouse.move((sx+tx)/2,(sy+ty)/2,{steps:4});if(opts.alt)await p.keyboard.down('Alt');await p.mouse.move(tx,ty,{steps:4});
 let pink=null;if(opts.checkGuide){await p.waitForTimeout(100);pink=await p.evaluate(()=>{const c=document.getElementById('preview'),dpr=devicePixelRatio||1,ctx=c.getContext('2d');const x=Math.round(c.width/2),d=ctx.getImageData(x-2,Math.round(c.height/2)-200*dpr,5,1).data;let hit=false;for(let i=0;i<d.length;i+=4)if(d[i]>220&&d[i+1]<130&&d[i+2]>170)hit=true;return hit});}
 await p.mouse.up();if(opts.alt)await p.keyboard.up('Alt');await p.waitForTimeout(400);return pink;};
// 1) near centre: snaps exactly to 0 and shows the guide
const pink=await dragTo(0.008,0.006,{checkGuide:true});let [x,y]=await elXY((await geo()).id);
assert.equal(x,0,'x snapped to the centre line: '+x);assert.equal(y,0,'y snapped to the centre line: '+y);assert.equal(pink,true,'pink guide line visible while snapped');
console.log('PASS snaps to x=0,y=0 within the threshold and shows the guide');
// 2) guide is gone after release
const gone=await p.evaluate(()=>{const c=document.getElementById('preview'),dpr=devicePixelRatio||1,ctx=c.getContext('2d');const x=Math.round(c.width/2),d=ctx.getImageData(x-2,Math.round(c.height/2)-200*dpr,5,1).data;for(let i=0;i<d.length;i+=4)if(d[i]>220&&d[i+1]<130&&d[i+2]>170)return false;return true});assert.equal(gone,true,'guide removed after release');
console.log('PASS guide removed after release');
// 3) far from the centre: exact placement preserved (no snap)
await dragTo(0.25,0.2);[x,y]=await elXY((await geo()).id);assert.ok(Math.abs(x-0.25)<0.02&&Math.abs(y-0.2)<0.02&&x!==0&&y!==0,'far placement is not snapped: '+x+','+y);
console.log('PASS far from the centre: no snapping, free placement',x.toFixed(3),y.toFixed(3));
// 4) just outside the threshold: not snapped
await dragTo(0.03,0.03);[x,y]=await elXY((await geo()).id);assert.ok(x>0.02&&y>0.02,'outside the threshold is not snapped: '+x+','+y);
console.log('PASS just outside the threshold: not snapped');
// 5) Alt bypass and the checkbox bypass keep precise placement near the centre
await dragTo(0.008,0.006,{alt:true});[x,y]=await elXY((await geo()).id);assert.ok(x!==0&&Math.abs(x-0.008)<0.012,'Alt disables the snap: '+x);
await p.uncheck('#ck-snap');await dragTo(0.008,0.006);[x,y]=await elXY((await geo()).id);assert.ok(x!==0&&Math.abs(x-0.008)<0.012,'checkbox off disables the snap: '+x);
console.log('PASS Alt and the checkbox disable snapping (precise placement near the centre)');
assert.equal(pageErrors,0,'no page errors');await b.close();server.close();})().catch(e=>{console.error(e);process.exit(1)});
