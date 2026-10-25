#!/usr/bin/env node
/* Regenerate studio/pub/manifest.json from the local published-scene set: id + sha256 + bytes
 * per scene. The manifest is the deployed source of truth for pre-deploy recovery. */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const pubDir=process.env.PUB_DIR||path.join(__dirname,'../studio/pub');
const files=fs.existsSync(pubDir)?fs.readdirSync(pubDir).filter(f=>/^[a-zA-Z0-9_-]{1,64}\.json$/.test(f)):[];
const scenes=files.sort().map(f=>{const buf=fs.readFileSync(path.join(pubDir,f));return{id:f.slice(0,-5),sha256:crypto.createHash('sha256').update(buf).digest('hex'),bytes:buf.length};});
fs.mkdirSync(pubDir,{recursive:true});
fs.writeFileSync(path.join(pubDir,'manifest.json'),JSON.stringify({version:1,generatedAt:new Date().toISOString(),scenes},null,1));
console.log('manifest:',scenes.length,'scene(s)',scenes.map(s=>s.id).join(', ')||'(empty)');
