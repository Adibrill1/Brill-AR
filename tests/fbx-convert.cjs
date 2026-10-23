const fs=require('fs'),assert=require('node:assert/strict'),path=require('path');
(async()=>{
 const a=await require('../studio/vendor/assimp/assimpjs.js')();
 function convert(bytes){const f=new a.FileList();f.AddFile('fixture.fbx',new Uint8Array(bytes));return a.ConvertFileList(f,'glb2');}
 const r=convert(fs.readFileSync(path.join(__dirname,'fixtures/triangle.fbx')));assert(r.IsSuccess());assert.equal(r.FileCount(),1);const b=r.GetFile(0).GetContent(),v=new DataView(b.buffer,b.byteOffset);assert.equal(v.getUint32(0,true),0x46546c67);const j=JSON.parse(new TextDecoder().decode(b.subarray(20,20+v.getUint32(12,true))));
 assert.equal(j.accessors[0].count,3);assert.equal(j.accessors[1].count,3);assert(j.meshes[0].primitives[0].attributes.NORMAL!=null);const color=j.materials[0].pbrMetallicRoughness.baseColorFactor;assert(Math.abs(color[0]-.5)<1e-6&&Math.abs(color[1]-.2)<1e-6&&Math.abs(color[2]-.9)<1e-6);assert(!convert(Buffer.from('bad FBX')).IsSuccess());console.log('PASS original static FBX positions/normals/material color -> GLB, invalid rejected');
})().catch(e=>{console.error(e);process.exit(1)});
