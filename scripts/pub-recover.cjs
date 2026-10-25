#!/usr/bin/env node
/* Pre-deploy published-scene recovery. The LIVE site's /pub/manifest.json is the durable
 * record of what is published; restore every listed scene into the local checkout BEFORE
 * a deploy so a code deploy can never silently drop a published scene (surge 404s files
 * omitted from a deploy). ABORTS (exit 1) if any listed scene cannot be fetched
 * byte-perfect, or if local scenes exist but the remote manifest is gone.
 * Order per deploy: pub-recover -> add/remove scenes -> pub-manifest -> surge. */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const site=(process.env.PUB_SITE||'https://star-burst-ar-studio.surge.sh').replace(/\/+$/,'');
const pubDir=process.env.PUB_DIR||path.join(__dirname,'../studio/pub');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 const localScenes=fs.existsSync(pubDir)?fs.readdirSync(pubDir).filter(f=>/^[a-zA-Z0-9_-]{1,64}\.json$/.test(f)):[];
 const mr=await fetch(site+'/pub/manifest.json');
 if(mr.status===404){
   if(localScenes.length){console.error('ABORT: local published scenes exist ('+localScenes.join(', ')+') but the live site has no /pub/manifest.json - refusing to deploy over a lost manifest.');process.exit(1);}
   console.log('no remote manifest and no local scenes - nothing to recover');return;
 }
 if(!mr.ok){console.error('ABORT: manifest fetch failed: HTTP '+mr.status);process.exit(1);}
 const manifest=await mr.json();
 if(!manifest||!Array.isArray(manifest.scenes)){console.error('ABORT: manifest malformed');process.exit(1);}
 fs.mkdirSync(pubDir,{recursive:true});
 for(const s of manifest.scenes){
   if(!s||!/^[a-zA-Z0-9_-]{1,64}$/.test(s.id||'')){console.error('ABORT: manifest has bad id: '+JSON.stringify(s&&s.id));process.exit(1);}
   const r=await fetch(site+'/pub/'+s.id+'.json');
   if(!r.ok){console.error('ABORT: published scene "'+s.id+'" unavailable on the live site (HTTP '+r.status+') - refusing to deploy without it.');process.exit(1);}
   const buf=Buffer.from(await r.arrayBuffer());
   if(buf.length!==s.bytes||sha(buf)!==s.sha256){console.error('ABORT: published scene "'+s.id+'" failed integrity check (bytes '+buf.length+'!='+s.bytes+' or sha mismatch).');process.exit(1);}
   const dest=path.join(pubDir,s.id+'.json'),tmp=dest+'.tmp';
   fs.writeFileSync(tmp,buf,{mode:0o600});fs.renameSync(tmp,dest);
   console.log('recovered',s.id,'('+s.bytes+' bytes)');
 }
 console.log('recover OK:',manifest.scenes.length,'published scene(s) intact');
})().catch(e=>{console.error('ABORT:',e.message);process.exit(1)});
