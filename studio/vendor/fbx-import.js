// Lazy worker: Assimp's 4MB binary loads only when an FBX import is confirmed.
window.fbxToGlb = (file) => new Promise(async(resolve,reject)=>{
 let worker,timer;const fail=e=>{if(worker)worker.terminate();clearTimeout(timer);reject(e);};
 try{
  if(file.size>20*1024*1024)throw Error('קובץ FBX גדול מדי.');
  const bytes=await file.arrayBuffer();worker=new Worker('vendor/fbx-worker.js');
  timer=setTimeout(()=>fail(Error('המרת FBX ארכה יותר מדי זמן (30 שניות).')),30000);
  worker.onerror=()=>fail(Error('כלי המרת FBX לא נטען. נסו GLB מהתוכנה המקורית.'));
  worker.onmessage=e=>{if(e.data.error)return fail(Error(e.data.error));clearTimeout(timer);worker.terminate();resolve(new Uint8Array(e.data.bytes));};
  worker.postMessage(bytes,[bytes]);
 }catch(err){fail(err);}
});
