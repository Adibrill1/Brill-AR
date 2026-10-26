const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),fs=require('fs'),cp=require('child_process'),crypto=require('crypto');
const server=require(process.env.SRV||'../../server/server');
// With a failed save and an unsaved edit, the existing local export (download, no upload) must contain the UNSAVED
// in-memory edit and every asset's exact bytes. When one asset is unreadable, export must fail with a message and
// produce NO file (never a partial backup). Set SRV to run it against another checkout (e.g. the build she has open).
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
const ctx=await b.newContext({viewport:{width:390,height:844},acceptDownloads:true});const p=await ctx.newPage();
let uploads=0;p.on('request',r=>{if(r.method()==='POST'||r.method()==='PUT')uploads++});
await p.addInitScript(()=>{const ab=Blob.prototype.arrayBuffer;Blob.prototype.arrayBuffer=function(){if(sessionStorage.getItem('bad')&&this.size===Number(sessionStorage.getItem('bad')))return Promise.reject(new DOMException('x','NotReadableError'));return ab.call(this)};
 const rd=FileReader.prototype.readAsDataURL;FileReader.prototype.readAsDataURL=function(bl){if(sessionStorage.getItem('bad')&&bl.size===Number(sessionStorage.getItem('bad'))){const r=this;setTimeout(()=>{Object.defineProperty(r,'error',{value:{name:'NotReadableError'}});r.onerror&&r.onerror(new Event('error'))},0);return}return rd.call(this,bl)}});
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(1500);
const stored0=await p.evaluate(async()=>{const r=(await Studio.all())[0];const a={};for(const [k,v] of Object.entries(r.assets)){const u=new Uint8Array(await v.arrayBuffer());a[k]={size:u.length,hex:Array.from(u).map(x=>x.toString(16).padStart(2,'0')).join('')}}return {els:r.elements,assets:a}});
const exp={};for(const [k,v] of Object.entries(stored0.assets))exp[k]={size:v.size,sha:sha(Buffer.from(v.hex,'hex'))};
assert.ok(Object.keys(exp).length>=4,'project has several stored assets');
await p.evaluate(()=>{Studio._testFailSave('disk full')});
await p.click('#element-list li');await p.waitForTimeout(300);
const changed=await p.evaluate(()=>{const r=document.querySelector('#panel input[type=range]');r.value=String(Number(r.min)+(Number(r.max)-Number(r.min))*0.9);r.dispatchEvent(new Event('input',{bubbles:true}));r.dispatchEvent(new Event('change',{bubbles:true}));return Number(r.value)});
await p.waitForTimeout(800);
assert.match(await p.evaluate(()=>document.querySelector('#save-state').textContent),/השמירה נכשלה/,'the save has failed');
const stillStored=await p.evaluate(async()=>JSON.stringify((await Studio.all())[0].elements));assert.equal(stillStored,JSON.stringify(stored0.els),'stored record unchanged');
await p.getByText('בדיקה ושמירה',{exact:true}).last().click().catch(()=>{});await p.waitForTimeout(500);
const dl=async(sel,ms=30000)=>{try{const [d]=await Promise.all([p.waitForEvent('download',{timeout:ms}),p.click(sel)]);const f='/tmp/exp-'+Date.now()+d.suggestedFilename().slice(-5);await d.saveAs(f);return f}catch(e){return null}};
const nums=(o,path='',out={})=>{if(o&&typeof o==='object')for(const k of Object.keys(o))nums(o[k],path+'/'+k,out);else if(typeof o==='number')out[path]=o;return out};
// ---- complete case
const jf=await dl('#btn-export');assert.ok(jf,'JSON export file produced');const j=JSON.parse(fs.readFileSync(jf,'utf8'));
const a=nums(stored0.els),e=nums(j.elements);const diffs=Object.keys(e).filter(k=>Math.abs(e[k]-(a[k]??NaN))>1e-9||!(k in a));
assert.ok(diffs.length>0&&diffs.some(k=>Math.abs(e[k]-changed)<1e-6),'JSON export holds the unsaved value '+changed+' (differs at '+diffs.join(',')+')');
for(const [k,v] of Object.entries(exp)){const d=j.assets[k];assert.ok(d,'asset '+k+' present in JSON');const buf=Buffer.from(d.split(',')[1],'base64');assert.equal(buf.length,v.size,'size '+k);assert.equal(sha(buf),v.sha,'bytes '+k)}
const zf=await dl('#btn-export-zip');assert.ok(zf,'ZIP export file produced');
const py=`import zipfile,json,hashlib,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;ex=json.loads(z.read('experience.json'));print(json.dumps({'els':ex['elements'],'files':{n:hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist() if n!='experience.json'},'assets':ex['assets']}))`;
const z=JSON.parse(cp.execFileSync('python3',['-c',py,zf]).toString());
const ze=nums(z.els);assert.ok(Object.keys(e).every(k=>Math.abs(ze[k]-e[k])<1e-9),'ZIP elements equal JSON export (unsaved edit included)');
for(const [k,v] of Object.entries(exp)){assert.ok(z.assets[k],'asset '+k+' in ZIP manifest');assert.equal(z.files[z.assets[k].file],v.sha,'ZIP bytes '+k)}
// ---- combo: one asset unreadable, others readable -> no file, a message
const big=Object.entries(exp).sort((x,y)=>y[1].size-x[1].size)[0][1].size;
assert.equal(Object.values(exp).filter(v=>v.size===big).length,1,'unreadable asset is identified by a unique size');
await p.evaluate(s=>{sessionStorage.setItem('bad',String(s));window.__msgs=[];new MutationObserver(()=>{const t=document.querySelector('#msg').textContent;if(t)window.__msgs.push(t)}).observe(document.querySelector('#msg'),{childList:true,characterData:true,subtree:true})},big);
const jf2=await dl('#btn-export',8000);const zf2=await dl('#btn-export-zip',8000);
const m=(await p.evaluate(()=>window.__msgs)).join(' | ');
console.log('combo: json file',jf2,'zip file',zf2,'msg:',m);
assert.equal(jf2,null,'JSON export with an unreadable asset produces no file');assert.equal(zf2,null,'ZIP export with an unreadable asset produces no file');
assert.match(m,/הייצוא לא הושלם/,'user is told in plain Hebrew that no backup file was made');assert.ok(!/NotReadable|blob read failed|application\//.test(m),'no raw internals in the message');
assert.equal(uploads,0,'export makes no upload requests');
console.log('PASS export-unsaved-state (headless; not a phone) base='+(process.env.SRV||'current'));
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
