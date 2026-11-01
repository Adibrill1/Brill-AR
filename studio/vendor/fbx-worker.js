/* Conversion isolated from UI, terminated by caller on timeout. Bundled AssimpJS
   0.0.10 (MIT wrapper, BSD Assimp licenses in vendor/assimp). No external reads. */
importScripts('assimp/assimpjs.js');
self.onmessage=async(e)=>{
 try{
  const bytes=e.data;if(!(bytes instanceof ArrayBuffer)||!bytes.byteLength||bytes.byteLength>20*1024*1024)throw Error('קובץ FBX גדול מדי או ריק.');
  const a=await assimpjs({locateFile:n=>'assimp/'+n});
  const files=new a.FileList();files.AddFile('model.fbx',new Uint8Array(bytes));
  const result=a.ConvertFileList(files,'glb2');
  if(!result.IsSuccess()||result.FileCount()!==1)throw Error('ה־FBX לא הומר. נדרש FBX יחיד עם משאבים מוטמעים.');
  const out=new Uint8Array(result.GetFile(0).GetContent());
  if(out.length>20*1024*1024||out.length<20)throw Error('תוצאת ההמרה גדולה מדי או ריקה.');
  const view=new DataView(out.buffer,out.byteOffset,out.byteLength);
  if(view.getUint32(0,true)!==0x46546c67||view.getUint32(12,true)>out.length-20)throw Error('תוצאת GLB לא תקינה.');
  const json=JSON.parse(new TextDecoder().decode(out.subarray(20,20+view.getUint32(12,true))));
  let unsafe=false;const visit=o=>{if(!o||typeof o!=='object')return;for(const[k,v]of Object.entries(o)){if(k==='uri'&&typeof v==='string'&&!v.startsWith('data:'))unsafe=true;else if(typeof v==='object')visit(v);}};visit(json);
  if(unsafe)throw Error('המודל מפנה לטקסטורות חיצוניות שאינן כלולות. יצאו GLB מוטמע במקום.');
  // Skeletons and animation clips are kept: the editor and the experience play a model's own clips (model-clips).
  if(!json.meshes?.length)throw Error('לא נמצאה גיאומטריה במודל.');
  const copy=out.slice();self.postMessage({bytes:copy.buffer},[copy.buffer]);
 }catch(err){self.postMessage({error:err.message||String(err)});}
};
