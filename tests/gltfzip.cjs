const assert=require('node:assert/strict'),fs=require('node:fs');
const zip=require('../studio/vendor/fflate.umd.js');require('../studio/vendor/gltfzip.js');
const cv=globalThis.gltfZipToGlb;const pack=o=>zip.zipSync(Object.fromEntries(Object.entries(o).map(([k,v])=>[k,typeof v==='string'?new TextEncoder().encode(v):v])));
const pos=new Uint8Array(new Float32Array([-.5,-.5,0,.5,-.5,0,0,.5,0]).buffer);
const png=new Uint8Array(fs.readFileSync(require('node:path').join(__dirname,'fixtures/red.png')));
const doc={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0},material:0}]}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[-.5,-.5,0],max:[.5,.5,0]}],bufferViews:[{buffer:0,byteOffset:0,byteLength:pos.length}],buffers:[{uri:'mesh.bin',byteLength:pos.length}],images:[{uri:'textures/red%20pixel.png'}],textures:[{source:0}],materials:[{pbrMetallicRoughness:{baseColorTexture:{index:0},metallicFactor:0,roughnessFactor:1}}]};
const uv=new Uint8Array(new Float32Array([0,0,1,0,.5,1]).buffer);const all=new Uint8Array(pos.length+uv.length);all.set(pos);all.set(uv,pos.length);doc.buffers[0].byteLength=all.length;doc.bufferViews.push({buffer:0,byteOffset:pos.length,byteLength:uv.length});doc.accessors.push({bufferView:1,componentType:5126,count:3,type:'VEC2'});doc.meshes[0].primitives[0].attributes.TEXCOORD_0=1;
const fixture=(g=doc,extra={})=>pack({'art/model.gltf':JSON.stringify(g),'art/mesh.bin':all,'art/textures/red pixel.png':png,...extra});
const z=fixture(),out=cv(z,zip);assert.equal(out.name,'model.glb');const v=new DataView(out.bytes.buffer);assert.equal(v.getUint32(0,true),0x46546c67);assert.equal(v.getUint32(8,true),out.bytes.length);
const g=JSON.parse(new TextDecoder().decode(out.bytes.subarray(20)));assert.deepEqual(g.materials,doc.materials);assert.deepEqual(g.meshes,doc.meshes);assert.equal(g.buffers[0].uri,'data:application/octet-stream;base64,'+Buffer.from(all).toString('base64'));assert.equal(g.images[0].uri,'data:image/png;base64,'+Buffer.from(png).toString('base64'));
function bad(label,z,re){assert.throws(()=>cv(z,zip),re);console.log('PASS',label);}
bad('missing buffer',pack({'model.gltf':JSON.stringify(doc)}),/חסר/);
bad('multiple models',fixture(doc,{'b.glb':new Uint8Array([1])}),/אחד/);
for(const uri of ['https://evil.invalid/mesh.bin','/mesh.bin','../../mesh.bin','%2Fmesh.bin']){const q=structuredClone(doc);q.buffers[0].uri=uri;bad('unsafe URI '+uri,fixture(q),/נתיב|רשת|מחוץ/);}
bad('canonical duplicate',fixture(doc,{'art/./mesh.bin':pos}),/כפולים/);
bad('extension network ref',fixture({...doc,extensions:{custom:{uri:'https://evil.invalid/a'}}}),/הרחבה/);
bad('oversized entry',fixture(doc,{'big.bin':new Uint8Array(21*1024*1024)}),/מגבלת/);
let many={};for(let i=0;i<101;i++)many['f'+i]=new Uint8Array();bad('entry count',fixture(doc,many),/מגבלת/);
bad('total expanded size',fixture(doc,{'a.bin':new Uint8Array(20*1024*1024),'b.bin':new Uint8Array(20*1024*1024),'c.bin':new Uint8Array(20*1024*1024)}),/מגבלת/);
bad('truncated ZIP',z.slice(0,z.length-25),/./);
fs.writeFileSync('/tmp/textured-gltf.zip',z);fs.writeFileSync('/tmp/zipmodel.glb',out.bytes);console.log('PASS buffers+PNG data URI embedding, material/mesh preservation, GLB length');
