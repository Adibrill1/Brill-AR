// The publish server takes pattern layers (drawn in code, no asset) and refuses unknown looks, colours, values or a
// pattern on another kind of layer, without touching the published revision.
const assert=require('node:assert/strict'),fs=require('fs/promises'),os=require('os'),path=require('path');
(async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pattern-publish-'));process.env.STORAGE_DIR=dir;process.env.PUBLISH_TOKEN='test-only';const server=require('../server/server');await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const pattern={look:'scales',colors:['#f1faee','#457b9d','#1d3557'],size:.5,speed:0,seed:0,shape:'arch'};
const body={format:'ar-studio/1',id:'pattern-test',name:'רקע',elements:[{id:'bg',type:'pattern',pattern,x:0,y:0,w:1,h:1,aspect:.75}],assets:{},target:null};
const post=()=>fetch(base+'/api/experiences',{method:'POST',headers:{authorization:'Bearer test-only','content-type':'application/json'},body:JSON.stringify(body)});
const stored=()=>fetch(base+'/api/experiences/pattern-test').then(r=>r.json());
try{let r=await post();assert.equal(r.status,200);assert.deepEqual((await stored()).elements[0].pattern,pattern);console.log('PASS server publish/readback keeps a pattern layer');
for(const bad of [{look:'plaid'},{colors:['red','#ffffff','#000000']},{colors:['#ffffff','#000000']},{size:1.5},{speed:-1},{seed:2.5},{seed:1000},{shape:'star'}]){
  body.elements[0].pattern={...pattern,...bad};r=await post();assert.equal(r.status,400,JSON.stringify(bad));}
body.elements[0]={id:'bg',type:'image',pattern};r=await post();assert.equal(r.status,400,'a pattern on an image layer');
assert.deepEqual((await stored()).elements[0].pattern,pattern,'the published revision is untouched');
console.log('PASS bad patterns rejected without corrupting the published revision');
}finally{server.close();await fs.rm(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exit(1)});
