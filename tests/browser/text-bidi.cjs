const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Hebrew text drawn the right way round: a Hebrew line ending with a full stop has the stop at its LEFT end (where a
// Hebrew sentence ends), in plain text exactly as in the cut-letters style. Measured on the pixels of the text canvas
// the editor stage, preview.html, play.html and the viewer all draw from (Studio.drawTextCanvas): the ink is split into
// clusters of columns and the stop is the small last cluster. Also ?, ! and a closing bracket, a year inside a Hebrew
// line, a mixed Hebrew/English line, an English line (unchanged: stop on the right), and the first-letter rule.
const SHOTS='/Users/adibrill/Desktop/brill-ar-work/wt-portal-shots/anim/';
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
  require('fs').mkdirSync(SHOTS,{recursive:true});
  const p=await b.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined');
  const r=await p.evaluate(async()=>{
    // ink clusters (left to right) of a canvas: [{x0, x1, h}] (h: rows with ink, to tell a stop from a letter)
    const clusters=(c)=>{const g=c.getContext('2d'),d=g.getImageData(0,0,c.width,c.height).data,W=c.width,H=c.height,col=[],tall=[];
      for(let x=0;x<W;x++){let n=0,top=H,bot=-1;for(let y=0;y<H;y++)if(d[(y*W+x)*4+3]>200){n++;top=Math.min(top,y);bot=Math.max(bot,y);}col.push(n);tall.push(bot-top);}
      const out=[];let cur=null;for(let x=0;x<W;x++){if(col[x]>0){if(!cur)cur={x0:x,x1:x,h:0};cur.x1=x;cur.h=Math.max(cur.h,tall[x]);}else if(cur){out.push(cur);cur=null;}}if(cur)out.push(cur);return out;};
    const draw=async(text,style)=>{const el={id:'t',type:'text',text,font:'heebo',color:'#ffffff',textStyle:style||''};await Studio.loadTextFonts(el);return Studio.drawTextCanvas(el,96).canvas;};
    // where the last typed mark landed: the line is drawn with and without it, both cut to their ink; the shorter one
    // matches the longer at one end, and the mark is at the other
    const ink=(c)=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data,W=c.width,H=c.height,col=new Float64Array(W);for(let x=0;x<W;x++)for(let y=0;y<H;y++)if(d[(y*W+x)*4+3]>160)col[x]+=y*0.001+1;
      let a=0,z=W-1;while(a<W&&!col[a])a++;while(z>0&&!col[z])z--;return col.slice(a,z+1);};
    const markSide=async(text)=>{const A=ink(await draw(text)),B=ink(await draw(text.slice(0,-1))),n=B.length,off=A.length-n;let l=0,r=0;
      for(let x=0;x<n;x++){l+=Math.abs(A[x]-B[x]);r+=Math.abs(A[x+off]-B[x]);}return r<l?'left':'right';};
    const out={};
    for(const t of ['שלום.','מה שלומך?','איזה יופי!','ברוכים הבאים.','שנת 2026.','שלום AR.','Hello.'])out[t]=await markSide(t);
    // cut letters: every letter on its own scrap; the stop's scrap is the narrowest
    { const c=await draw('שלום.','cut'),cl=clusters(c).filter(k=>k.x1-k.x0>3);let m=0;cl.forEach((k,i)=>{if(k.x1-k.x0<cl[m].x1-cl[m].x0)m=i;});out.cutScraps=cl.length;out.cut=m===0?'left':m===cl.length-1?'right':'middle'; }
    // a closing bracket: in a Hebrew line "(שלום)" both ends are brackets; the opening one (on the right) must look like ")"? no:
    // the bracket on the RIGHT end opens the text, so it is drawn as "(" mirrored... measured by ink: the right end's
    // bracket bulges to the right (its middle is right of its ends)
    const bulge=async(text)=>{const c=await draw(text),cl=clusters(c),z=cl[cl.length-1],g=c.getContext('2d'),d=g.getImageData(z.x0,0,z.x1-z.x0+1,c.height).data,W=z.x1-z.x0+1,H=c.height;
      const rows=[];for(let y=0;y<H;y++){let sx=0,n=0;for(let x=0;x<W;x++)if(d[(y*W+x)*4+3]>160){sx+=x;n++;}if(n)rows.push(sx/n);}
      const mid=rows[rows.length>>1],ends=(rows[0]+rows[rows.length-1])/2;return mid>ends?'right':'left';};
    out.bracketRight=await bulge('(שלום)');
    // digits keep their order inside a Hebrew line: "שנת 2026." drawn equals the year drawn alone, at the line's left part
    out.dirs=['שלום.','2026','Hello שלום','שלום Hello','?!'].map(Studio.lineDir);
    const c=await draw('שלום עולם. מה שלומך?\nשנת 2026 (בערך).');const big=document.createElement('canvas');big.width=c.width;big.height=c.height;const g=big.getContext('2d');g.fillStyle='#246';g.fillRect(0,0,c.width,c.height);g.drawImage(c,0,0);
    return {out,png:big.toDataURL('image/png')};});
  require('fs').writeFileSync(SHOTS+'bidi-text.png',Buffer.from(r.png.split(',')[1],'base64'));
  console.log(JSON.stringify(r.out));
  for(const t of ['שלום.','מה שלומך?','איזה יופי!','ברוכים הבאים.','שנת 2026.'])assert.equal(r.out[t],'left','a Hebrew line ends on the left: '+t);
  assert.equal(r.out['שלום AR.'],'left','a Hebrew line with an English word still ends on the left');
  assert.equal(r.out['Hello.'],'right','an English line ends on the right, as before');
  assert.equal(r.out.cut,'left','the cut-letters style agrees');
  assert.equal(r.out.bracketRight,'right','the bracket at the right end of "(שלום)" opens the text: it curves outwards to the right');
  assert.deepEqual(r.out.dirs,['rtl','rtl','ltr','rtl','rtl'],'a line takes the direction of its first letter (digits and marks do not count)');
  assert.deepEqual(errs,[]);
  console.log('text-bidi ok');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e);process.exit(1);});
