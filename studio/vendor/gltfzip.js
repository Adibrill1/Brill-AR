/* ZIP glTF import. In-memory only. No fetching, filesystem paths, or nested archives.
   Preserve the glTF document and embed its core buffer/image dependencies as data URIs.
   Produces a self-contained JSON-only GLB accepted by the existing model pipeline. */
(function(root) {
  const ENTRY = 20 * 1024 * 1024, TOTAL = 60 * 1024 * 1024;
  function path(name) {
    if (typeof name !== 'string' || /[\\\0?#:]/.test(name) || name.startsWith('/')) throw Error('נתיב קובץ לא בטוח בתוך ה־zip.');
    const out=[];
    for (const p of name.split('/')) {
      if (!p || p === '.') continue;
      if (p === '..') { if (!out.length) throw Error('הפניה אל מחוץ ל־zip.'); out.pop(); }
      else out.push(p);
    }
    return out.join('/');
  }
  function b64(bytes) {
    let s=''; for(let i=0;i<bytes.length;i+=16384) s+=String.fromCharCode.apply(null,bytes.subarray(i,i+16384));
    return btoa(s);
  }
  function glb(json) {
    let bytes=new TextEncoder().encode(JSON.stringify(json)); const n=(bytes.length+3)&~3;
    if(n+20>ENTRY) throw Error('המודל המלא גדול מדי (מעל 20MB אחרי צירוף הטקסטורות).');
    const out=new Uint8Array(20+n),v=new DataView(out.buffer);out.fill(32,20);
    v.setUint32(0,0x46546c67,true);v.setUint32(4,2,true);v.setUint32(8,out.length,true);v.setUint32(12,n,true);v.setUint32(16,0x4e4f534a,true);out.set(bytes,20);return out;
  }
  function convert(bytes,zip) {
    if(bytes.length<22)throw Error('קובץ zip חסר או פגום.');
    if(bytes.length>ENTRY) throw Error('קובץ zip גדול מדי (מעל 20MB).');
    const names=new Map();let count=0,total=0;
    // unzipSync filter reads the central directory before inflating any data. First pass
    // inflates nothing, verifies all metadata and rejects ambiguous canonical filenames.
    zip.unzipSync(bytes,{filter:f=>{
      count++;total+=f.originalSize;
      if(count>100||total>TOTAL||f.originalSize>ENTRY)throw Error('ה־zip חורג ממגבלת הקבצים או הגודל (100 קבצים, 20MB לקובץ, 60MB יחד).');
      const key=path(f.name);if(names.has(key))throw Error('שמות קבצים כפולים בתוך ה־zip.');
      names.set(key,f.name);return false;
    }});
    const glbs=[...names.keys()].filter(n=>/\.glb$/i.test(n));
    const gltfs=[...names.keys()].filter(n=>/\.gltf$/i.test(n));
    if(glbs.length+gltfs.length!==1) throw Error('ה־zip צריך להכיל מודל אחד בלבד: glb או gltf עם הקבצים הנלווים.');
    const model=glbs[0]||gltfs[0];
    const extract=(wanted)=>{
      const original=names.get(wanted);if(!original)throw Error('קובץ נלווה חסר ב־zip: '+wanted);
      const r=zip.unzipSync(bytes,{filter:f=>f.name===original});const data=r[original];
      if(!data||data.length>ENTRY)throw Error('קובץ נלווה גדול מדי או פגום.');return data;
    };
    const data=extract(model);
    if(glbs.length)return {name:model.split('/').pop(),bytes:data};
    const g=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));
    if(!g.asset||g.asset.version!=='2.0')throw Error('נדרש מודל glTF 2.0.');
    const base=model.includes('/')?model.slice(0,model.lastIndexOf('/')+1):'';
    const allowed=new Set([...(g.buffers||[]),...(g.images||[])]);
    const visit=o=>{if(!o||typeof o!=='object')return;for(const [k,v]of Object.entries(o)){
      if(k==='uri'&&typeof v==='string'&&!v.startsWith('data:')&&!allowed.has(o))throw Error('המודל כולל הפניה חיצונית בהרחבה שאינה נתמכת.');
      if(typeof v==='object')visit(v);
    }};visit(g);
    let embeddedBytes=data.length;
    for(const r of allowed){
      if(!r.uri)continue;
      if(r.uri.startsWith('data:'))continue;
      let uri;try{uri=decodeURIComponent(r.uri);}catch(e){throw Error('כתובת קובץ לא תקינה במודל.');}
      const key=path(base+uri);
      // Check URI independently too: a scheme or root reference must not hide behind base.
      if(/^[\/\\]|:|[?#]/.test(uri))throw Error('הפניות רשת אינן מותרות ב־zip.');
      const raw=extract(key);
      embeddedBytes+=Math.ceil(raw.length/3)*4;
      if(embeddedBytes>ENTRY-20)throw Error('המודל המלא גדול מדי (מעל 20MB אחרי צירוף הטקסטורות).');
      const ext=key.split('.').pop().toLowerCase();
      const mime={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',ktx2:'image/ktx2'}[ext]||'application/octet-stream';
      r.uri='data:'+mime+';base64,'+b64(raw);
    }
    for(const b of g.buffers||[])if(!b.uri)throw Error('קובץ buffer חסר במודל gltf.');
    return {name:model.split('/').pop().replace(/\.gltf$/i,'.glb'),bytes:glb(g)};
  }
  root.gltfZipToGlb=convert;
})(typeof window!=='undefined'?window:globalThis);
