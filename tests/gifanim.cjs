const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');global.window={};require('../studio/vendor/gifanim.js');
for(const disposal of [2,3]){
 const p=path.join(__dirname,'fixtures/disposal'+disposal+'.gif'),b=fs.readFileSync(p),gif=window.GifAnim.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.length));
 let cb,actual=[];global.setTimeout=f=>{cb=f;return 1};global.clearTimeout=()=>{};
 const canvas={getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:d=>actual.push(Array.from(d.data))})};
 window.GifAnim.startPump(canvas,gif);cb();cb();const expected=JSON.parse(fs.readFileSync(p+'.json'));
 for(let i=0;i<3;i++)for(let k=0;k<actual[i].length;k++){if(k%4!==3&&expected[i][k-k%4+3]===0)continue;assert.equal(actual[i][k],expected[i][k],`disposal${disposal} frame${i} byte${k}`);}
 console.log('PASS disposal',disposal,'3 composited RGBA frames match PIL');
}
const b=fs.readFileSync(path.join(__dirname,'fixtures/interlaced.gif'));assert.throws(()=>window.GifAnim.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.length)),/interlaced/);console.log('PASS interlaced explicit rejection');
