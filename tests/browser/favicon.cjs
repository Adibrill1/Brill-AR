const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Acceptance (browser icon, Adi's ask 2026-10-25 09:06): every page of the studio carries
// the Brill-AR tab icon, and the icon files are actually served.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
 for(const page of ['index.html','play.html','preview.html']){
  const ctx=await b.newContext();const p=await ctx.newPage();
  const bad=[];p.on('response',r=>{if(r.url().includes('favicon')||r.url().includes('apple-touch')){if(r.status()!==200)bad.push(r.url()+' -> '+r.status());}});
  await p.goto(base+'/'+page);await p.waitForTimeout(400);
  const links=await p.evaluate(()=>[...document.querySelectorAll('link[rel~="icon"],link[rel="apple-touch-icon"]')].map(l=>l.getAttribute('href')));
  assert.ok(links.includes('favicon-32.png')&&links.includes('apple-touch-icon.png'),page+' declares the icon set: '+JSON.stringify(links));
  for(const href of links){const r=await p.request.get(base+'/'+href);assert.strictEqual(r.status(),200,page+' serves '+href);assert.ok((r.headers()['content-type']||'').includes('png'),href+' is a png');}
  assert.deepStrictEqual(bad,[],page+': no failed icon requests: '+bad.join(','));
  await ctx.close();
 }
 // the icon itself: yellow star on the dark header color, readable at tab size
 const pg=await b.newPage();await pg.goto(base+'/index.html');
 const px=await pg.evaluate(async(base)=>{const i=new Image();await new Promise((res,rej)=>{i.onload=res;i.onerror=rej;i.src=base+'/favicon-32.png';});const c=document.createElement('canvas');c.width=c.height=32;const g=c.getContext('2d');g.drawImage(i,0,0);const d=g.getImageData(0,0,32,32).data;let dark=0,yellow=0;for(let k=0;k<d.length;k+=4){if(d[k+3]<128)continue;const r=d[k],gg=d[k+1],b2=d[k+2];if(r<60&&gg<60&&b2<60)dark++;if(r>200&&gg>160&&b2<120)yellow++;}return {dark,yellow};},base);
 assert.ok(px.dark>400&&px.yellow>80,'32px icon keeps the star-on-dark identity: '+JSON.stringify(px));
 console.log('PASS favicon: icon declared on all 3 pages, files served as PNG, star-on-dark identity holds at 32px');
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
