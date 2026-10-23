// Optional authenticated MOV -> MP4 conversion. No shell, external URL, or remote
// fetch; temp data removed on success/failure. Requires ffmpeg+ffprobe on host.
const fs=require('fs/promises'),os=require('os'),path=require('path'),{execFile}=require('child_process');
const MAX=20*1024*1024;
function run(bin,args){return new Promise((resolve,reject)=>execFile(bin,args,{timeout:90000,maxBuffer:1024*1024,windowsHide:true},(e,stdout,stderr)=>e?reject(Object.assign(new Error(bin==='ffprobe'?'MOV לא קריא או כלי ההמרה אינו מותקן.':'ההמרה נכשלה או ארכה יותר מדי זמן.'),{code:e.code})):resolve(stdout)));}
async function movToMp4(bytes){
 if(!bytes.length||bytes.length>MAX)throw Error('הקובץ חייב להיות עד 20MB.');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'brill-mov-'));
 try{
  const input=path.join(dir,'input.mov'),output=path.join(dir,'output.mp4');await fs.writeFile(input,bytes);
  const info=JSON.parse(await run('ffprobe',['-v','error','-protocol_whitelist','file,pipe','-enable_drefs','0','-f','mov','-show_entries','format=duration:stream=codec_type,width,height','-of','json',input]));
  const video=(info.streams||[]).find(s=>s.codec_type==='video'),duration=Number(info.format?.duration);
  if(!video||!Number.isFinite(duration)||duration<=0||duration>120||video.width>4096||video.height>4096)throw Error('נדרש MOV עם וידאו עד 120 שניות ועד 4096 פיקסלים בכל צד.');
  await run('ffmpeg',['-nostdin','-v','error','-y','-protocol_whitelist','file,pipe','-enable_drefs','0','-f','mov','-i',input,'-map','0:v:0','-map','0:a:0?','-map_metadata','-1','-map_chapters','-1','-vf',"scale=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",'-c:v','libx264','-preset','fast','-crf','22','-pix_fmt','yuv420p','-r','30','-c:a','aac','-b:a','128k','-ac','2','-movflags','+faststart','-fs',String(MAX),output]);
  const size=(await fs.stat(output)).size;if(size>=MAX)throw Error('תוצאת ההמרה גדולה מדי.');
  const check=JSON.parse(await run('ffprobe',['-v','error','-show_entries','format=duration','-of','json',output]));
  if(!Number.isFinite(Number(check.format?.duration))||Math.abs(Number(check.format.duration)-duration)>.2)throw Error('ההמרה לא שמרה את כל משך הסרטון.');
  return await fs.readFile(output);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
}
module.exports={movToMp4};
