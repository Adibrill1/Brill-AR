// Claude's side of "פירוק מדויק עם Claude" (the site's studio/app/desk.js), with nothing to install: Node's own crypto,
// zlib and git. Used by the cloud routine that GitHub wakes on every new request, and by hand on Adi's computer.
//   node desk/cloud.cjs list                       open requests (no answer yet)
//   node desk/cloud.cjs get <id> <outDir>          the request: outDir/req.json + outDir/picture.<ext>
//   node desk/cloud.cjs assemble <plan.json>       layers from Canva's exported pages -> plan.outDir/L<i>.png + answer.json
//       plan: {"dir": "...", "layers": [{"name": "רקע", "file": "p2.png"}, ..., {"name": "טקסט", "file": "@text"}],
//              "text": {"with": "p1.png", "without": "p6.png"}, "spread": 0.2, "note": "", "outDir": "..."}
//   node desk/cloud.cjs send <id> <answer.json>    encrypts the layers and pushes them to the answers branch
// The private key comes from the file named by DESK_KEY (never from the repository).
// Branches: requests arrive on "layer-requests" (written only by the site); answers go to "claude/layer-answers" (cloud sessions may push only to claude/ branches), so an
// answer never wakes the routine again.
const fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto'),zlib=require('zlib');
const REQ='layer-requests',ANS=process.env.DESK_ANSWERS||'claude/layer-answers',ID=/^[A-Za-z0-9-]{4,40}$/;
const root=process.env.DESK_REPO||path.resolve(__dirname,'..'),work=process.env.DESK_WORK||path.join(require('os').tmpdir(),'desk-work');
const git=(args,cwd=root)=>cp.execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
function branchDir(br){ // a checkout of one branch in a work folder (made when missing)
  const d=path.join(work,br);fs.mkdirSync(work,{recursive:true});
  let has=true;try{git(['fetch','-q','origin',br+':refs/remotes/origin/'+br]);}catch(e){has=false;}
  if(!fs.existsSync(d)){
    if(has)git(['worktree','add','-q','-B',br,d,'origin/'+br]);
    else{git(['worktree','add','-q','--detach',d]);git(['checkout','-q','--orphan',br],d);git(['rm','-rq','--cached','--ignore-unmatch','.'],d);for(const f of fs.readdirSync(d))if(f!=='.git')fs.rmSync(path.join(d,f),{recursive:true,force:true});}
  }else if(has){git(['checkout','-q',br],d);git(['reset','-q','--hard','origin/'+br],d);}
  return d;
}
const priv=()=>crypto.createPrivateKey(fs.readFileSync(process.env.DESK_KEY||path.join(__dirname,'..','..','desk','private-key.pem')));
const unlock=(raw,b)=>{const d=crypto.createDecipheriv('aes-256-gcm',raw,b.subarray(0,12));d.setAuthTag(b.subarray(b.length-16));return Buffer.concat([d.update(b.subarray(12,b.length-16)),d.final()]);};
const lock=(raw,b)=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',raw,iv);const o=Buffer.concat([c.update(b),c.final()]);return Buffer.concat([iv,o,c.getAuthTag()]);};
const keyOf=(dir,id)=>crypto.privateDecrypt({key:priv(),padding:crypto.constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},fs.readFileSync(path.join(dir,'r',id,'key.bin')));

// ---------- PNG, just enough: 8-bit RGB/RGBA/grey/palette in, RGBA out ----------
function readPNG(buf){
  let p=8,w,h,depth,type,inter,plte=null,trns=null;const idat=[];
  while(p<buf.length){const len=buf.readUInt32BE(p),t=buf.toString('latin1',p+4,p+8),d=buf.subarray(p+8,p+8+len);p+=12+len;
    if(t==='IHDR'){w=d.readUInt32BE(0);h=d.readUInt32BE(4);depth=d[8];type=d[9];inter=d[12];}else if(t==='PLTE')plte=d;else if(t==='tRNS')trns=d;else if(t==='IDAT')idat.push(d);else if(t==='IEND')break;}
  if(depth!==8||inter)throw new Error('png: only 8-bit, not interlaced');
  const ch={0:1,2:3,3:1,4:2,6:4}[type],bpl=w*ch,raw=zlib.inflateSync(Buffer.concat(idat)),px=Buffer.alloc(h*bpl),out=Buffer.alloc(w*h*4);
  for(let y=0;y<h;y++){const f=raw[y*(bpl+1)],s=raw.subarray(y*(bpl+1)+1,(y+1)*(bpl+1)),o=y*bpl;
    for(let x=0;x<bpl;x++){const a=x>=ch?px[o+x-ch]:0,b=y?px[o-bpl+x]:0,c=x>=ch&&y?px[o-bpl+x-ch]:0;let v=s[x];
      if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;else if(f===4){const pp=a+b-c,pa=Math.abs(pp-a),pb=Math.abs(pp-b),pc=Math.abs(pp-c);v+=pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
      px[o+x]=v&255;}}
  for(let i=0;i<w*h;i++){const q=i*4;
    if(type===6){px.copy(out,q,i*4,i*4+4);}
    else if(type===2){out[q]=px[i*3];out[q+1]=px[i*3+1];out[q+2]=px[i*3+2];out[q+3]=255;}
    else if(type===0){out[q]=out[q+1]=out[q+2]=px[i];out[q+3]=255;}
    else if(type===4){out[q]=out[q+1]=out[q+2]=px[i*2];out[q+3]=px[i*2+1];}
    else{const k=px[i];out[q]=plte[k*3];out[q+1]=plte[k*3+1];out[q+2]=plte[k*3+2];out[q+3]=trns&&k<trns.length?trns[k]:255;}}
  return {w,h,data:out};
}
function crc(b){let c=~0;for(let i=0;i<b.length;i++){c^=b[i];for(let k=0;k<8;k++)c=c&1?(c>>>1)^0xEDB88320:c>>>1;}return ~c>>>0;}
function writePNG(img){
  const {w,h,data}=img,raw=Buffer.alloc(h*(w*4+1));for(let y=0;y<h;y++){raw[y*(w*4+1)]=0;data.copy(raw,y*(w*4+1)+1,y*w*4,(y+1)*w*4);}
  const chunk=(t,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t,'latin1'),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([l,td,c]);};
  const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw,{level:6})),chunk('IEND',Buffer.alloc(0))]);
}
// the text: where the card with its words differs from the same card without them (grown by a pixel)
function textLayer(a,b){
  const {w,h}=a,m=new Float32Array(w*h),out=Buffer.from(a.data);
  for(let i=0;i<w*h;i++){const q=i*4,d=Math.max(Math.abs(a.data[q]-b.data[q]),Math.abs(a.data[q+1]-b.data[q+1]),Math.abs(a.data[q+2]-b.data[q+2]));m[i]=Math.min(1,Math.max(0,(d-25)/40));}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const yy=Math.min(h-1,Math.max(0,y+dy)),xx=Math.min(w-1,Math.max(0,x+dx));v=Math.max(v,m[yy*w+xx]);}out[(y*w+x)*4+3]=Math.round(v*255);}
  return {w,h,data:out};
}

const [cmd,a1,a2]=process.argv.slice(2);
if(cmd==='list'){
  const d=branchDir(REQ),ans=branchDir(ANS),r=path.join(d,'r');
  const open=fs.existsSync(r)?fs.readdirSync(r).filter(id=>ID.test(id)&&!fs.existsSync(path.join(ans,'r',id,'done.bin'))):[];
  for(const id of open){try{const req=JSON.parse(unlock(keyOf(d,id),fs.readFileSync(path.join(r,id,'req.bin'))));console.log(id+'\t'+req.name+'\t'+req.words);}catch(e){console.log(id+'\tcannot open: '+e.message);}}
  if(!open.length)console.log('no open requests');
}else if(cmd==='get'){
  if(!ID.test(a1||''))throw new Error('id');const d=branchDir(REQ),dir=path.join(d,'r',a1),raw=keyOf(d,a1);
  const req=JSON.parse(unlock(raw,fs.readFileSync(path.join(dir,'req.bin'))));fs.mkdirSync(a2,{recursive:true});
  const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[req.type]||'png';
  fs.writeFileSync(path.join(a2,'req.json'),JSON.stringify(req,null,1));fs.writeFileSync(path.join(a2,'picture.'+ext),unlock(raw,fs.readFileSync(path.join(dir,'pic.bin'))));
  console.log(JSON.stringify(req));console.log(path.join(a2,'picture.'+ext));
}else if(cmd==='assemble'){
  const P=JSON.parse(fs.readFileSync(a1,'utf8')),rd=(f)=>readPNG(fs.readFileSync(path.join(P.dir,f)));fs.mkdirSync(P.outDir,{recursive:true});
  const text=P.text?textLayer(rd(P.text.with),rd(P.text.without)):null;
  const layers=P.layers.map((L,i)=>{const img=L.file==='@text'?text:rd(L.file),f=path.join(P.outDir,'L'+i+'.png');fs.writeFileSync(f,writePNG(img));return {name:L.name,png:f};});
  const ans={layers,spread:P.spread||0.2,note:P.note||''};fs.writeFileSync(path.join(P.outDir,'answer.json'),JSON.stringify(ans,null,1));console.log(path.join(P.outDir,'answer.json'));
}else if(cmd==='send'){
  if(!ID.test(a1||''))throw new Error('id');const req=branchDir(REQ),raw=keyOf(req,a1),d=branchDir(ANS),dir=path.join(d,'r',a1),ans=JSON.parse(fs.readFileSync(a2,'utf8'));
  fs.mkdirSync(dir,{recursive:true});
  const layers=ans.layers.map((L,i)=>{const file='L'+i+'.bin';fs.writeFileSync(path.join(dir,file),lock(raw,fs.readFileSync(L.png)));return {name:L.name,file};});
  fs.writeFileSync(path.join(dir,'done.bin'),lock(raw,Buffer.from(JSON.stringify({layers,spread:ans.spread||0.2,note:ans.note||''}))));
  git(['add','r/'+a1],d);git(['-c','user.name=Claude','-c','user.email=noreply@anthropic.com','commit','-q','-m','layers for '+a1],d);git(['push','-q','origin',ANS+':refs/heads/'+ANS],d);
  console.log('sent',layers.length,'layers');
}else console.log('list | get <id> <outDir> | assemble <plan.json> | send <id> <answer.json>');
