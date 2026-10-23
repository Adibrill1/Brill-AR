// Requires local ffmpeg/ffprobe. Generates its own original test bars + sine MOV.
const fs=require('fs/promises'),path=require('path'),os=require('os'),{execFileSync}=require('child_process'),assert=require('node:assert/strict');
const {movToMp4}=require('../server/media-convert');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mov-fixture-'));
 try{
 const input=path.join(dir,'source.mov'),output=path.join(dir,'result.mp4');
 execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','testsrc=size=160x120:rate=24:duration=1','-f','lavfi','-i','sine=frequency=660:duration=1','-c:v','prores_ks','-profile:v','0','-c:a','pcm_s16le','-shortest',input]);
 const bytes=await fs.readFile(input);const out=await movToMp4(bytes);await fs.writeFile(output,out);
 const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_name,width,height','-of','json',output],{encoding:'utf8'}));
 assert(info.streams.some(s=>s.codec_name==='h264'&&s.width===160&&s.height===120));assert(info.streams.some(s=>s.codec_name==='aac'));assert(Math.abs(+info.format.duration-1)<.1);console.log('PASS ProRes+PCM MOV -> H264+AAC MP4, dimensions/duration');
 await assert.rejects(()=>movToMp4(Buffer.from('bad mov')));await assert.rejects(()=>movToMp4(Buffer.alloc(20*1024*1024+1)));console.log('PASS invalid/oversized input rejected');
 execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=size=16x16:rate=1:duration=121','-c:v','libx264',input]);
 await assert.rejects(()=>fs.readFile(input).then(movToMp4),/120/);console.log('PASS duration cap');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1)});
