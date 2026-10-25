const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),fs=require('fs');const server=require('../../server/server');
// Acceptance: the editor shows a visible workspace around the artwork (user request),
// elements outside the artwork bounds stay visible and editable there, and drag/hit
// mapping stays exact in normalized coordinates.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{const p=await b.newPage();await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);const id=await p.evaluate(async()=>{const r=Studio.blankExperience('workspace');r.target={artRect:{x:0,y:0,w:768,h:1024},natural:{w:768,h:1024}};const c=document.createElement('canvas');c.width=768;c.height=1024;const g=c.getContext('2d');g.fillStyle='#ffffff';g.fillRect(0,0,768,1024);r.assets.__artwork=await new Promise(res=>c.toBlob(res));r.elements=[{id:'inside',name:'INSIDE',type:'text',text:'I',color:'#0000ff',x:0,y:0,w:.2,rot:0},{id:'outside',name:'OUTSIDE',type:'text',text:'O',color:'#ff0000',x:-.65,y:0,w:.2,rot:0}];await Studio.save(r);const opt=document.createElement('option');opt.value=r.id;opt.textContent=r.name;document.querySelector('#exp-select').append(opt);return r.id;});await p.locator('#exp-select').selectOption(id);await p.waitForTimeout(200);
 const snap=await p.evaluate(()=>{const c=document.querySelector('#preview'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;const W=c.width,H=c.height;
  // scan the middle row: classify stage vs artwork vs red-glyph pixels
  const y=Math.floor(H/2);let artL=-1,artR=-1,stageL=null,redMinX=1e9;
  for(let x=0;x<W;x++){const i=(y*W+x)*4,r=d[i],g=d[i+1],bl=d[i+2];
   if(r>240&&g>240&&bl>240){if(artL<0)artL=x;artR=x;}
   if(r>150&&g<80&&bl<80&&x<redMinX)redMinX=x;
  }
  const i0=(y*W+4)*4;stageL=[d[i0],d[i0+1],d[i0+2]];
  return {W,H,artL,artR,stageL,redMinX,png:c.toDataURL()};});
 fs.writeFileSync('/downloads/editor-workspace.png',Buffer.from(snap.png.split(',')[1],'base64'));
 const {png,...rest}=snap;console.log(JSON.stringify(rest));
 assert.ok(snap.artL>20,'artwork starts after a visible left margin, artL='+snap.artL);
 assert.ok(snap.artR<snap.W-20,'artwork ends before a visible right margin, artR='+snap.artR+' W='+snap.W);
 assert.ok(snap.stageL[0]>200&&snap.stageL[0]<245&&Math.abs(snap.stageL[0]-snap.stageL[2])>3,'stage is the neutral workspace color, not artwork white: '+snap.stageL);
 assert.ok(snap.redMinX<snap.artL,'outside-bounds element visible on the workspace left of the artwork (red at '+snap.redMinX+' < artL '+snap.artL+')');
 // hit + drag mapping on the workspace: click the outside element, drag +24px, expect dx=24/artworkW
 await p.locator('#preview').scrollIntoViewIfNeeded();
 const cbox=await p.locator('#preview').boundingBox();
 const scale=cbox.width/snap.W;
 const clickX=cbox.x+(snap.redMinX+6)*scale,clickY=cbox.y+cbox.height/2;
 await p.mouse.move(clickX,clickY);await p.mouse.down();await p.mouse.up();
 await p.mouse.move(clickX,clickY);await p.mouse.down();await p.mouse.move(clickX+24*scale,clickY,{steps:3});await p.mouse.up();
 const moved=await p.evaluate(async(rid)=>{const rec=await Studio.load(rid);const o=rec.elements.find(e=>e.id==='outside');return {x:o.x};},id);
 const artWpx=snap.artR-snap.artL;
 assert.ok(Math.abs((moved.x-(-.65))-24/artWpx)<0.03,'drag on workspace maps to artwork-normalized dx: got '+JSON.stringify(moved)+' artWpx='+artWpx);
 console.log('PASS workspace margin: visible stage, outside element visible/clickable, drag mapping exact');
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
