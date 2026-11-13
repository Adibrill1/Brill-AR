"use strict";
/* AR Studio - shared core: storage (IndexedDB), config schema, runtime image-target
   generation (same padded-luminance pipeline proven in the v4 device test), and
   artwork-normalized <-> target-space coordinate mapping. Plain JS, no deps. */
const Studio = (() => {
  const TARGET_W = 768, TARGET_H = 1024; // 3:4, proven on iPhone in v4

  // ---------- IndexedDB ----------
  function openDB() {
    return new Promise((res, rej) => {
      const r = indexedDB.open("ar-studio", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("experiences");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  let failPut = null; // test-only seam: fail the next n writes with a given DOMException name
  // requireExists: check and put happen inside ONE readwrite transaction, so a delete from another tab cannot land between them.
  async function idbPut(id, rec, requireExists) {
    const db = await openDB();
    if (failPut && failPut.n > 0) { failPut.n--; throw new DOMException(failPut.message || "test write failure", failPut.name || "UnknownError"); }
    return new Promise((res, rej) => {
      const tx = db.transaction("experiences", "readwrite");
      if (requireExists) { const g = tx.objectStore("experiences").get(id); g.onsuccess = () => { if (g.result === undefined) { const e = new Error('deleted in another tab'); e.deletedElsewhere = true; rej(e); try { tx.abort(); } catch {} } else tx.objectStore("experiences").put(rec, id); }; }
      else tx.objectStore("experiences").put(rec, id);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error || new Error("storage write aborted (storage may be full)"));
    });
  }
  async function idbGet(id) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const rq = db.transaction("experiences").objectStore("experiences").get(id);
      rq.onsuccess = () => res(rq.result || null);
      rq.onerror = () => rej(rq.error);
    });
  }
  async function idbAll() {
    const db = await openDB();
    return new Promise((res, rej) => {
      const rq = db.transaction("experiences").objectStore("experiences").getAll();
      rq.onsuccess = () => res(rq.result || []);
      rq.onerror = () => rej(rq.error);
    });
  }
  async function idbDel(id) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction("experiences", "readwrite");
      tx.objectStore("experiences").delete(id);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error || new Error("storage write aborted (storage may be full)"));
    });
  }

  // ---------- helpers ----------
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10));
  const loadImage = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("image load failed")); i.src = src; });
  // Copy a picked File into page-owned bytes. iOS hands picker files backed by temporary
  // assets that WebKit can evict after the picker closes or the page reloads; storing the raw
  // File leaves an unreadable "dead" blob behind (export then fails with a bare error event).
  const ownBlob = async (blob) => {
    try { return new Blob([await blob.arrayBuffer()], { type: blob.type || "" }); }
    catch (e) { throw new Error("הקובץ לא נקרא מהמכשיר (" + Math.round((blob.size || 0) / 1024) + "KB) - בחרי אותו שוב"); }
  };
  // Which stored assets are still readable? Distinguishes dead/missing backing from healthy data.
  async function assetHealth(rec) {
    const out = [];
    for (const [id, b] of Object.entries((rec && rec.assets) || {})) {
      if (!b || typeof b.slice !== "function") { out.push({ id, ok: false, reason: "missing" }); continue; }
      try { await b.slice(0, 1).arrayBuffer(); out.push({ id, ok: true, size: b.size, type: b.type }); }
      catch (e) { out.push({ id, ok: false, size: b.size, type: b.type, reason: (e && e.name) || "unreadable" }); }
    }
    return out;
  }

  // Read-only diagnostic: for every stored asset, which step works? Nothing is written, uploaded or replaced.
  // stages: head (first byte), full (arrayBuffer, up to 3 tries), reader (FileReader data URL, up to 3 tries), decode (browser can open it).
  async function fileHealth(rec) {
    const names = { __artwork: "תמונת היצירה", __cover: "תמונת השער" };
    for (const el of (rec && rec.elements) || []) { if (el.assetId && !names[el.assetId]) names[el.assetId] = el.name || el.type; if (el.particles && el.particles.spriteAssetId && !names[el.particles.spriteAssetId]) names[el.particles.spriteAssetId] = (el.name || "חלקיקים") + " (ספרייט)"; }
    const tryN = async (fn) => { let tries = 0, err = ""; for (let i = 0; i < 3; i++) { tries++; try { await fn(); return { ok: true, tries }; } catch (e) { err = (e && e.name) || String(e).slice(0, 40); await new Promise((r) => setTimeout(r, 100)); } } return { ok: false, tries, err }; };
    const out = [];
    for (const [id, b] of Object.entries((rec && rec.assets) || {})) {
      const row = { id, name: names[id] || id, type: (b && b.type) || "?", size: (b && b.size) || 0 };
      if (!b || typeof b.slice !== "function") { row.missing = true; out.push(row); continue; }
      row.head = (await tryN(() => b.slice(0, 1).arrayBuffer())).ok;
      row.full = await tryN(async () => { const ab = await b.arrayBuffer(); if (ab.byteLength !== b.size) throw new Error("short"); });
      row.reader = await tryN(() => blobToDataURL(b));
      row.decode = "skip";
      if (row.full.ok || row.reader.ok) {
        const kind = (b.type || "").split("/")[0];
        let url = null;
        try {
          url = URL.createObjectURL(b);
          if (kind === "image") { await new Promise((res, rej) => { const i = new Image(); i.onload = res; i.onerror = () => rej(new Error("decode")); i.src = url; }); row.decode = "ok"; }
          else if (kind === "video" || kind === "audio") { await new Promise((res, rej) => { const m = document.createElement(kind); m.preload = "metadata"; m.muted = true; const t = setTimeout(() => rej(new Error("timeout")), 8000); m.onloadedmetadata = () => { clearTimeout(t); res(); }; m.onerror = () => { clearTimeout(t); rej(new Error("decode")); }; m.src = url; }); row.decode = "ok"; }
        } catch (e) { row.decode = "fail"; } finally { if (url) URL.revokeObjectURL(url); }
      }
      out.push(row);
    }
    return out;
  }

  const blobToDataURL = (blob) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    // Never reject with the raw ProgressEvent: it has no .message and surfaced to the
    // user as "undefined" on iOS when a large asset read failed. Always an Error.
    r.onerror = () => rej(new Error("blob read failed (" + Math.round(((blob && blob.size) || 0) / 1024) + "KB " + ((blob && blob.type) || "?") + "): " + ((r.error && r.error.name) || "unknown")));
    r.readAsDataURL(blob);
  });
  // A stored picture as an <img>. A blob that just came out of IndexedDB can fail its first read on iOS (seen right
  // after editing, on the way to the camera), so every way of reading it is tried, a few times, before giving up.
  async function loadImageBlob(blob) {
    if (!blob) throw new Error("missing image");
    let last;
    for (let i = 0; i < 3; i++) {
      const url = URL.createObjectURL(blob);
      try { return await loadImage(url); } catch (e) { last = e; URL.revokeObjectURL(url); }
      try { return await loadImage(await blobToDataURL(blob)); } catch (e) { last = e; }
      try {
        const copy = new Blob([await blob.arrayBuffer()], { type: blob.type || "image/jpeg" });
        if (copy.size) return await loadImage(await blobToDataURL(copy));
      } catch (e) { last = e; }
      await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
    throw last || new Error("image load failed");
  }
  // The camera / preview page could not start. The usual cause is a read that fails once and works on the next try,
  // so the page first reloads itself (twice at most); only then it says so, with a button to try again.
  function loadFailed(e, title) {
    console.error(e);
    const key = "ar-retry:" + location.pathname + location.search + location.hash;
    let n = 2;
    try {
      const was = JSON.parse(sessionStorage.getItem(key) || "null");
      n = was && Date.now() - was.t < 30000 ? was.n : 0;
      sessionStorage.setItem(key, JSON.stringify({ n: n + 1, t: Date.now() }));
    } catch (x) { n = 2; }
    if (n < 2) { setTimeout(() => location.reload(), 350); return; }
    const box = document.getElementById("err"); if (!box) return;
    box.style.display = "grid"; box.textContent = "";
    const wrap = document.createElement("div"), p = document.createElement("p"), b = document.createElement("button"), back = document.createElement("a");
    wrap.style.cssText = "display:grid;gap:14px;justify-items:center;padding:24px;text-align:center;font:16px/1.5 sans-serif;color:#222";
    p.textContent = title || "\u05D4\u05D9\u05E6\u05D9\u05E8\u05D4 \u05DC\u05D0 \u05E0\u05D8\u05E2\u05E0\u05D4."; p.style.margin = "0";
    b.type = "button"; b.id = "err-retry"; b.textContent = "\u05DC\u05E0\u05E1\u05D5\u05EA \u05E9\u05D5\u05D1";
    b.style.cssText = "min-height:48px;padding:12px 28px;border:0;border-radius:999px;background:#7c5cff;color:#fff;font:700 16px/1 sans-serif;cursor:pointer";
    b.onclick = () => { try { sessionStorage.removeItem(key); } catch (x) {} location.reload(); };
    back.href = "index.html" + (location.hash && !location.search ? location.hash : ""); back.textContent = "\u05D7\u05D6\u05E8\u05D4 \u05DC\u05E2\u05D5\u05E8\u05DA"; back.style.color = "#5b46c9";
    wrap.append(p, b, back); box.appendChild(wrap);
  }
  async function dataURLtoBlob(durl) { return (await fetch(durl)).blob(); }

  // ---------- image-target generation (runtime equivalent of the proven v4 offline pipeline) ----------
  async function makeTarget(img) {
    const c = document.createElement("canvas");
    c.width = TARGET_W; c.height = TARGET_H;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, TARGET_W, TARGET_H);
    const s = Math.min(TARGET_W / img.naturalWidth, TARGET_H / img.naturalHeight);
    const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
    const x = Math.round((TARGET_W - w) / 2), y = Math.round((TARGET_H - h) / 2);
    ctx.drawImage(img, x, y, w, h);
    const padded = c.toDataURL("image/jpeg", 0.85);
    const d = ctx.getImageData(0, 0, TARGET_W, TARGET_H);
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      px[i] = px[i + 1] = px[i + 2] = l;
    }
    ctx.putImageData(d, 0, 0);
    const luminance = c.toDataURL("image/jpeg", 0.8);
    const t = document.createElement("canvas");
    t.width = 96; t.height = 128;
    t.getContext("2d").drawImage(c, 0, 0, 96, 128);
    const thumb = t.toDataURL("image/jpeg", 0.7);
    return { padded, luminance, thumb, artRect: { x, y, w, h } };
  }

  function targetDataJSON(lum, orig, thumb, name) {
    return {
      imagePath: lum, metadata: null, name: name || "artwork", type: "PLANAR",
      properties: { left: 0, top: 0, width: TARGET_W, height: TARGET_H, isRotated: false, originalWidth: TARGET_W, originalHeight: TARGET_H },
      resources: { originalImage: orig, croppedImage: orig, thumbnailImage: thumb, luminanceImage: lum },
      created: Date.now(), updated: Date.now(),
    };
  }

  // ---------- coordinate mapping ----------
  // Element placement is stored artwork-normalized:
  //   x, y  = center offset as fraction of artwork width/height (0=center, +right/+up)
  //   w     = element width as fraction of artwork width
  //   rot   = degrees clockwise on screen, z = depth units in front of artwork
  // Target space (engine): height = 1, width = TARGET_W/TARGET_H, y up, origin center.
  // Preview/editor-3D backdrop: push the artwork plane back in the depth buffer so layers at z=0 (flush) never z-fight with it.
  function pushBack(node) {
    const apply = () => { const m = node.getObject3D && node.getObject3D("mesh"); if (!m || !m.material) return false; m.material.polygonOffset = true; m.material.polygonOffsetFactor = 2; m.material.polygonOffsetUnits = 2; m.material.needsUpdate = true; return true; };
    if (!apply()) node.addEventListener("loaded", apply, { once: true });
  }
  function geom(rec) {
    const r = rec.target.artRect;
    const tw = TARGET_W / TARGET_H;
    return { tw, artW: (r.w / TARGET_W) * tw, artH: r.h / TARGET_H, offX: r.x, offY: r.y };
  }
  function toTargetSpace(rec, el, elAspect) {
    const g = geom(rec);
    const r = rec.target.artRect;
    const cxPx = r.x + (el.x + 0.5) * r.w;
    const cyPx = r.y + (0.5 - el.y) * r.h;
    const X = (cxPx / TARGET_W - 0.5) * g.tw;
    const Y = 0.5 - cyPx / TARGET_H;
    const W = el.w * g.artW;
    const H = el.h != null ? el.h * g.artH : W / (elAspect || 1);
    return { x: X, y: Y, z: el.z || 0, w: W, h: H };
  }


  // Compressed-geometry support: Draco (KHR_draco_mesh_compression) and Meshopt
  // (EXT_meshopt_compression, plus the ratified KHR_meshopt_compression spelling, which
  // carries the identical bufferView schema per the official extension README - the
  // bundled three r158 loader only registers the EXT name, so KHR files are normalized
  // to it at ingest). Decoders are vendored locally under external/decoders/ (see its
  // NOTICES.md); runtime never fetches a decoder from a CDN.
  const MODEL_COMPRESSION={'KHR_draco_mesh_compression':'Draco','EXT_meshopt_compression':'Meshopt','KHR_meshopt_compression':'Meshopt'};
  const DECODER_DRACO_PATH='external/decoders/draco/';
  const DECODER_MESHOPT_PATH='external/decoders/meshopt_decoder.js';
  function modelCompressionKinds(doc){const set=new Set();for(const e of (doc&&doc.extensionsRequired)||[]){if(MODEL_COMPRESSION[e])set.add(MODEL_COMPRESSION[e]);}return [...set];}
  // Rewrite a GLB's JSON chunk, renaming KHR_meshopt_compression -> EXT_meshopt_compression
  // in extensionsRequired/extensionsUsed and bufferView extensions (same schema).
  function normalizeMeshoptKhr(bytes){
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const jsonLen=view.getUint32(12,true);
    const doc=JSON.parse(new TextDecoder('utf-8').decode(new Uint8Array(bytes.buffer,bytes.byteOffset+20,jsonLen)));
    if(!(doc.extensionsRequired||[]).includes('KHR_meshopt_compression'))return null;
    const rename=(o)=>{if(o&&typeof o==='object'&&o.KHR_meshopt_compression){o.EXT_meshopt_compression=o.KHR_meshopt_compression;delete o.KHR_meshopt_compression;}};
    for(const bv of doc.bufferViews||[])rename(bv.extensions);
    const fix=a=>a&&a.map(e=>e==='KHR_meshopt_compression'?'EXT_meshopt_compression':e);
    doc.extensionsRequired=fix(doc.extensionsRequired);doc.extensionsUsed=fix(doc.extensionsUsed);
    let jsonBuf=new TextEncoder().encode(JSON.stringify(doc));
    const pad=(4-(jsonBuf.length%4))%4;
    const rest=bytes.subarray(20+jsonLen); // remaining chunks (BIN) verbatim
    const total=12+8+jsonBuf.length+pad+rest.byteLength;
    const out=new Uint8Array(total),v=new DataView(out.buffer);
    v.setUint32(0,0x46546c67,true);v.setUint32(4,2,true);v.setUint32(8,total,true);
    v.setUint32(12,jsonBuf.length+pad,true);v.setUint32(16,0x4e4f534a,true);
    out.set(jsonBuf,20);for(let i=0;i<pad;i++)out[20+jsonBuf.length+i]=0x20;
    out.set(rest,20+jsonBuf.length+pad);
    return out;
  }
  let _meshoptReady=null;
  function meshoptReady(){
    if(window.MeshoptDecoder&&window.MeshoptDecoder.ready)return window.MeshoptDecoder.ready.then(()=>window.MeshoptDecoder);
    if(!_meshoptReady)_meshoptReady=new Promise((res,rej)=>{
      const s=document.createElement('script');s.src=DECODER_MESHOPT_PATH;s.async=true;
      s.onload=()=>{if(!window.MeshoptDecoder){rej(Error('מפענח Meshopt לא נטען כראוי.'));return;}window.MeshoptDecoder.ready.then(()=>res(window.MeshoptDecoder),rej);};
      s.onerror=()=>rej(Error('לא ניתן לטעון את מפענח המודל הדחוס (קובץ מקומי חסר).'));
      document.head.appendChild(s);
    });
    return _meshoptReady;
  }
  // Prove a compressed model actually decodes before accepting it (parse-only, no render).
  async function decodeCheckModelBlob(blob,doc){
    const kinds=modelCompressionKinds(doc||{});
    if(!kinds.length)return;
    if(typeof THREE==='undefined'||!THREE.GLTFLoader)throw Error('סביבת התצוגה לא נטענה - נסי שוב.');
    const loader=new THREE.GLTFLoader();
    if(kinds.includes('Draco')){
      if(!THREE.DRACOLoader)throw Error('מפענח Draco לא זמין בסביבה זו.');
      const draco=new THREE.DRACOLoader();draco.setDecoderPath(DECODER_DRACO_PATH);
      loader.setDRACOLoader(draco);
    }
    if(kinds.includes('Meshopt')){
      try{loader.setMeshoptDecoder(await meshoptReady());}
      catch(e){throw Error(e&&e.message?e.message:'מפענח Meshopt לא זמין.');}
    }
    const buf=await blob.arrayBuffer();
    // three r158 can surface decoder failures as an unhandled rejection from the worker
    // instead of routing them to parse's onError, leaving parse unsettled - trap both,
    // with a hard timeout so a stuck decode can never hang the upload silently.
    await new Promise((res,rej)=>{
      let done=false;
      const cleanup=()=>{window.removeEventListener('unhandledrejection',onRej);clearTimeout(timer);};
      const finish=(fn,v)=>{if(done)return;done=true;cleanup();fn(v);};
      const onRej=ev=>{const m=String(ev.reason&&ev.reason.message||ev.reason||'');
        if(/draco|meshopt|decod|gltf/i.test(m))finish(rej,Error(m||'שגיאת פענוח'));};
      window.addEventListener('unhandledrejection',onRej);
      const timer=setTimeout(()=>finish(rej,Error('הפענוח לא הסתיים בזמן')),20000);
      try{loader.parse(buf,'',()=>finish(res),(err)=>finish(rej,err instanceof Error?err:Error(String(err&&err.message||err))));}
      catch(err){finish(rej,err instanceof Error?err:Error(String(err&&err.message||err)));}
    }).catch(err=>{
      throw Error('קובץ המודל הדחוס פגום או לא ניתן לפענוח ('+(err.message||'שגיאת פענוח')+'). יצאו מחדש מהתוכנה המקורית.');
    });
  }
  async function prepareModelBlob(blob){
    const bytes=new Uint8Array(await blob.arrayBuffer());
    const normalized=normalizeMeshoptKhr(bytes);
    const out=normalized?new Blob([normalized],{type:blob.type||'model/gltf-binary'}):blob;
    const doc=await validateModelBlob(out);
    await decodeCheckModelBlob(out,doc);
    return out;
  }

  async function validateModelBlob(blob) {
    if(!blob||blob.size<20||blob.size>20*1024*1024)throw Error('מודל GLB חסר או גדול מדי (עד20MB).');
    const bytes=await blob.arrayBuffer(),view=new DataView(bytes);
    if(view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==bytes.byteLength)throw Error('מבנה GLB לא תקין.');
    let offset=12,doc=null;
    while(offset<bytes.byteLength){
      if(offset+8>bytes.byteLength)throw Error('מקטע GLB חסר.');
      const length=view.getUint32(offset,true),type=view.getUint32(offset+4,true);
      if(length%4||offset+8+length>bytes.byteLength)throw Error('אורך מקטע GLB לא תקין.');
      if(!doc){if(type!==0x4e4f534a||length>4*1024*1024)throw Error('מקטע JSON חסר או גדול מדי.');doc=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(bytes,offset+8,length)));}
      offset+=8+length;
    }
    if(!doc||!doc.asset||doc.asset.version!=='2.0')throw Error('נדרש glTF2.0.');
    const comp=(doc.extensionsRequired||[]).find(e=>MODEL_COMPRESSION[e]);
    const visit=(node,depth)=>{if(depth>100)throw Error('מודל מורכב מדי.');if(!node||typeof node!=='object')return;for(const [key,value]of Object.entries(node)){if(key==='uri'&&typeof value==='string'&&!value.startsWith('data:'))throw Error('המודל מפנה לקובץ חיצוני. ארזו glTF וכל הקבצים יחד ב־ZIP או יצאו GLB עצמאי.');if(typeof value==='object')visit(value,depth+1);}};visit(doc,0);
    return doc;
  }
  async function modelClipNames(blob) {
    if (!blob || blob.size > 20*1024*1024 || blob.size < 20) return [];
    const head=new DataView(await blob.slice(0,20).arrayBuffer());
    if(head.getUint32(0,true)!==0x46546c67||head.getUint32(4,true)!==2||head.getUint32(16,true)!==0x4e4f534a)return [];
    const length=head.getUint32(12,true);if(length>4*1024*1024||length+20>blob.size)return [];
    try { const doc=JSON.parse(await blob.slice(20,20+length).text());return (doc.animations||[]).slice(0,100).map((a,i)=>typeof a.name==='string'?a.name.slice(0,120):'Animation '+i); }catch{return [];}
  }
  // Size and length are known at loadedmetadata; waiting for a decoded frame (loadeddata) made long clips on iPhone hit
  // the timeout, so the same file failed and then worked on a later try.
  async function inspectVideo(blob,timeoutMs=20000){
    const url=URL.createObjectURL(blob),video=document.createElement('video');video.preload='metadata';video.muted=true;video.playsInline=true;video.setAttribute('playsinline','');
    try{return await new Promise((resolve,reject)=>{let timer;const end=(error)=>{clearTimeout(timer);video.onloadedmetadata=null;video.onloadeddata=null;video.onerror=null;error?reject(error):resolve({width:video.videoWidth,height:video.videoHeight,duration:video.duration});};video.onloadedmetadata=()=>{if(video.videoWidth&&video.videoHeight)end();};video.onloadeddata=()=>video.videoWidth&&video.videoHeight?end():end(Error('לא ניתן לקרוא את ממדי הסרטון'));video.onerror=()=>end(Error('הדפדפן לא הצליח לקרוא את פורמט הסרטון'));timer=setTimeout(()=>end(Error('טעינת הסרטון לא הסתיימה. נסי קובץ שמור במכשיר או MP4 בפורמט H.264')),timeoutMs);video.src=url;video.load();});}
    finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
  }
  async function modelClipInfo(blob){
    const doc=await validateModelBlob(blob);return (doc.animations||[]).slice(0,100).map((clip,i)=>{const ends=(clip.samplers||[]).map(s=>doc.accessors?.[s.input]?.max?.[0]);return {name:typeof clip.name==='string'?clip.name.slice(0,120):'Animation '+i,duration:ends.length&&ends.every(t=>Number.isFinite(t)&&t>=0)?Math.max(...ends):null};});
  }
  // Embedded glTF clips: run the first authored clip. Freeze when hidden or the
  // image target is lost; wrapper timeline/group transforms remain independent.
  function ensureModelAnimationComponent() {
    if (!window.AFRAME || AFRAME.components["model-clips"]) return;
    AFRAME.registerComponent("model-clips", {
      schema: { clip: {default:0}, speed: {default:1}, playing: {default:true}, loop: {default:true}, at: {default:0} },
      update() { if(this.mixer)this.selectClip(); },
      // A still model shows the moment `at` (0..1) of its clip. The mixer was never stepped before, so a model whose motion
      // was off stood in its bare rest pose (often arms out), not in a pose of its own motion.
      pose() { if(!this.mixer||!this.action)return; const d=this.action.getClip().duration||0; this.mixer.setTime(Math.max(0,Math.min(0.999,this.data.at))*d); },
      selectClip() {
        const mesh=this.el.getObject3D("mesh"),clips=mesh&&mesh.animations;
        if(!this.mixer||!clips||!clips.length)return;
        this.mixer.stopAllAction();
        const index=Math.max(0,Math.min(clips.length-1,Math.floor(this.data.clip)));
        this.action=this.mixer.clipAction(clips[index]);this.action.reset();
        this.action.setLoop(this.data.loop?THREE.LoopRepeat:THREE.LoopOnce,this.data.loop?Infinity:1);this.action.clampWhenFinished=!this.data.loop;this.action.play();
        this.el.dataset.activeClip=String(index);
        if(!this.data.playing)this.pose();
      },
      init() {
        this.tracked = !this.el.sceneEl.hasAttribute("xrweb");
        this.onFound = () => { this.tracked = true; };
        this.onLost = () => { this.tracked = false; };
        this.loaded = () => {
          if (this.mixer) this.mixer.stopAllAction();
          const mesh = this.el.getObject3D("mesh");
          const clips = mesh && mesh.animations;
          if (!clips || !clips.length) return;
          this.mixer = new THREE.AnimationMixer(mesh);
          this.selectClip();
          this.el.dataset.clipCount = String(clips.length);
        };
        this.el.addEventListener("model-loaded", this.loaded);
        this.el.sceneEl.addEventListener("xrimagefound", this.onFound);
        this.el.sceneEl.addEventListener("xrimagelost", this.onLost);
        if (this.el.getObject3D("mesh")) this.loaded();
      },
      tick(t, dt) {
        if (!this.mixer || !this.tracked || !this.data.playing) return;
        for (let o = this.el.object3D; o; o = o.parent) if (!o.visible) return;
        if(this.el._actionClock!=null){this.mixer.setTime(this.el._actionClock);return;}
        this.mixer.update(Math.min(0.25, (dt || 0) / 1000) * Math.max(.1,Math.min(4,this.data.speed)));
      },
      remove() {
        this.el.removeEventListener("model-loaded", this.loaded);
        this.el.sceneEl.removeEventListener("xrimagefound", this.onFound);
        this.el.sceneEl.removeEventListener("xrimagelost", this.onLost);
        if (this.mixer) { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.el.getObject3D("mesh")); }
      }
    });
  }

  // The look of the two built-in particle kinds: a glowing four-point sparkle, and a slip of paper for confetti.
  const builtinSprites = {};
  function builtinSprite(preset) {
    const kind = preset === "confetti" ? "confetti" : "sparkle";
    if (builtinSprites[kind]) return builtinSprites[kind];
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const x = c.getContext("2d"); x.translate(32, 32);
    if (kind === "confetti") { x.rotate(-0.5); x.fillStyle = "#fff"; x.beginPath(); if (x.roundRect) x.roundRect(-24, -13, 48, 26, 6); else x.rect(-24, -13, 48, 26); x.fill(); }
    else {
      const g = x.createRadialGradient(0, 0, 0, 0, 0, 30); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.22, "rgba(255,255,255,.85)"); g.addColorStop(0.5, "rgba(255,255,255,.22)"); g.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = g; x.beginPath(); x.arc(0, 0, 30, 0, 7); x.fill();
      x.fillStyle = "#fff"; x.beginPath();
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? 5 : 31; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      x.closePath(); x.fill();
    }
    return (builtinSprites[kind] = new THREE.CanvasTexture(c));
  }
  // Particles: lightweight THREE.Points emitter (sparkle rises, confetti falls).
  function ensureParticlesComponent() {
    if (!window.AFRAME || AFRAME.components["particles"]) return;
    AFRAME.registerComponent("particles", {
      schema: { preset: { default: "sparkle" }, count: { default: 120 }, color: { default: "#ffd94d" }, width: { default: 0.5 }, height: { default: 0.5 }, size: { default: 12 }, speed: { default: 1 }, sprite: { default: "" }, direction: { default: -1 },lifetime:{default:0},life2:{default:0},emitter:{default:"box"},endColor:{default:"#ffffff"},endSize:{default:1},fade:{default:false},spread:{default:1},color2:{default:""} }, // direction: degrees (0=up,90=right,180=down,270=left); -1 = preset's fixed direction; -2 = random per particle; -3 = outward from center. spread: emission-area scale (documented Artivive control)
      init() {
        const n = Math.min(500, Math.max(10, this.data.count | 0));
        const pos = new Float32Array(n * 3);
        this.vel = new Float32Array(n * 3);
        this.ages=new Float32Array(n);this.sizes=new Float32Array(n);this.alphas=new Float32Array(n);const colors=new Float32Array(n*3);
        this.spawn=(i)=>{const d=this.data,sp=d.spread>0?Math.min(2,d.spread):1;if(d.emitter==='disc'||d.emitter==='sphere'){const angle=Math.random()*Math.PI*2,r=Math.sqrt(Math.random());pos[i*3]=Math.cos(angle)*r*d.width*sp/2;pos[i*3+1]=Math.sin(angle)*r*d.height*sp/2;pos[i*3+2]=d.emitter==='sphere'?(Math.random()-.5)*Math.sqrt(Math.max(0,1-r*r))*Math.min(d.width,d.height)*sp:0;}else{pos[i*3]=(Math.random()-.5)*d.width*sp;pos[i*3+1]=(Math.random()-.5)*d.height*sp;pos[i*3+2]=(Math.random()-.5)*.05;}};
        this.setVelocity=(i)=>{const d=this.data,sp=d.speed>0?d.speed:1,m=(0.05+Math.random()*0.12)*sp;
          if(d.direction===-2){const a=Math.random()*Math.PI*2;this.vel[i*3]=Math.sin(a)*m;this.vel[i*3+1]=Math.cos(a)*m;}
          else if(d.direction===-3){const a=Math.atan2(pos[i*3],pos[i*3+1]);this.vel[i*3]=Math.sin(a)*m;this.vel[i*3+1]=Math.cos(a)*m;}
          else if(d.direction>=0){const a=d.direction*Math.PI/180;this.vel[i*3]=Math.sin(a)*m;this.vel[i*3+1]=Math.cos(a)*m;}
          else{this.vel[i*3]=(Math.random()-0.5)*0.05*sp;this.vel[i*3+1]=(d.preset==="confetti"?-0.1-Math.random()*0.15:0.05+Math.random()*0.12)*sp;}};
        this.startColor=new THREE.Color(this.data.color);this.endColor=new THREE.Color(this.data.endColor);
        const d0=this.data,lifeLo=d0.lifetime>0&&d0.life2>0?Math.min(d0.lifetime,d0.life2):0,lifeHi=d0.lifetime>0&&d0.life2>0?Math.max(d0.lifetime,d0.life2):0;
        this.lives=new Float32Array(n);this.startColors=new Float32Array(n*3);
        this.color2=(d0.color2&&/^#[0-9a-f]{6}$/i.test(d0.color2))?new THREE.Color(d0.color2):null;
        for (let i = 0; i < n; i++) {
          pos[i * 3] = (Math.random() - 0.5) * this.data.width;
          pos[i * 3 + 1] = (Math.random() - 0.5) * this.data.height;
          pos[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
          this.spawn(i);this.lives[i]=lifeHi>0?lifeLo+Math.random()*(lifeHi-lifeLo):(d0.lifetime>0?d0.lifetime:0);this.ages[i]=this.lives[i]>0?Math.random()*this.lives[i]:0;this.sizes[i]=1;this.alphas[i]=1;
          if(this.color2){this.ageColor=this.ageColor||new THREE.Color();this.ageColor.copy(this.startColor).lerp(this.color2,Math.random()).toArray(this.startColors,i*3);}else this.startColor.toArray(this.startColors,i*3);
          colors.set(this.startColors.subarray(i*3,i*3+3),i*3);
          this.setVelocity(i);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color',new THREE.BufferAttribute(colors,3));geo.setAttribute('particleSize',new THREE.BufferAttribute(this.sizes,1));geo.setAttribute('particleAlpha',new THREE.BufferAttribute(this.alphas,1));
        const matOpts = { color: new THREE.Color("#ffffff"),vertexColors:true, size: Math.min(0.06, Math.max(0.002, this.data.size / 1000)), transparent: true, opacity: 0.9, depthWrite: false };
        if (this.data.sprite) { matOpts.map = new THREE.TextureLoader().load(this.data.sprite); matOpts.alphaTest = 0.05; } // custom sprite texture (PNG with alpha)
        else { matOpts.map = builtinSprite(this.data.preset); matOpts.alphaTest = 0.02; } // without a map every particle is a plain square
        const material=new THREE.PointsMaterial(matOpts);
        material.onBeforeCompile=shader=>{shader.vertexShader='attribute float particleSize; attribute float particleAlpha; varying float vParticleAlpha;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('gl_PointSize = size;', 'gl_PointSize = size * particleSize; vParticleAlpha = particleAlpha;');shader.fragmentShader='varying float vParticleAlpha;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a *= vParticleAlpha;');};
        this.points = new THREE.Points(geo,material);
        this.el.object3D.add(this.points);
      },
      tick(time, dt) {
        if(!this.points||this.el.closest("[data-studio-editing]"))return;
        const dtS = Math.min(0.1, (dt || 16) / 1000);
        const arr = this.points.geometry.attributes.position.array;
        const half = this.data.height / 2;
        for (let i = 0; i < arr.length; i += 3) {
          const index=i/3,d=this.data,life=this.lives?this.lives[index]:d.lifetime;if(d.lifetime>0&&life>0){this.ages[index]+=dtS;if(this.ages[index]>=life){this.ages[index]%=life;this.spawn(index);this.setVelocity(index);}const f=this.ages[index]/life;this.sizes[index]=1+(d.endSize-1)*f;this.alphas[index]=d.fade?Math.sin(Math.PI*f):1;this.ageColor=this.ageColor||new THREE.Color();if(this.color2)this.ageColor.setRGB(this.startColors[i],this.startColors[i+1],this.startColors[i+2]);else this.ageColor.copy(this.startColor);this.ageColor.lerp(this.endColor,f).toArray(this.points.geometry.attributes.color.array,i);}
          arr[i] += this.vel[i] * dtS;
          arr[i + 1] += this.vel[i + 1] * dtS;
          const halfW = this.data.width / 2 * (this.data.spread>0?Math.min(2,this.data.spread):1);
          if (this.data.lifetime<=0&&this.vel[i] > 0 && arr[i] > halfW) arr[i] = -halfW;
          if (this.data.lifetime<=0&&this.vel[i] < 0 && arr[i] < -halfW) arr[i] = halfW;
          if (this.data.lifetime<=0&&this.vel[i + 1] > 0 && arr[i + 1] > half) arr[i + 1] = -half;
          if (this.data.lifetime<=0&&this.vel[i + 1] < 0 && arr[i + 1] < -half) arr[i + 1] = half;
        }
        this.points.geometry.attributes.position.needsUpdate = true;
        for(const name of ['color','particleSize','particleAlpha'])this.points.geometry.attributes[name].needsUpdate=true;
      },
      remove(){if(this.points){this.el.object3D.remove(this.points);this.points.geometry.dispose();if(this.points.material.map)this.points.material.map.dispose();this.points.material.dispose();}}
    });
  }

  // ---------- filters for image and video layers ----------
  // el.fx names a look and el.fxAmount (0-1, default 0.5) its strength or size. One GLSL function, baFilter(uv),
  // replaces the layer's texture lookup: in the 3D/AR material (studio-fx patches the material the layer already has,
  // so crop, opacity, fades and chroma keying keep working) and in the 2D editor (fxFrame draws through the same code
  // with plain WebGL). baScale turns texture coordinates into square units where the visible height is 1, so dots,
  // letters and ribs stay round and even whatever the layer's shape or crop. Our own versions of the classic looks.
  const FX = [["halftone", "נקודות דפוס"], ["letters", "אותיות"], ["vhs", "VHS"], ["kaleido", "קליידוסקופ"], ["papercut", "נייר גזור"], ["glass", "זכוכית מחורצת"]];
  const FX_IDS = FX.map((f) => f[0]), FX_MOVING = new Set(["vhs", "kaleido", "glass"]);
  const FX_GLSL = `
#if defined(USE_MAP) || defined(BA_FX_SHADER)
uniform float baMode; uniform float baAmount; uniform float baTime; uniform vec2 baScale; uniform vec2 baTexel; uniform sampler2D baGlyphs;
uniform float baKey; uniform vec3 baKeyColor; uniform float baKeyThresh; uniform float baKeySoft; uniform float baLinear;
float baLum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float baHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 baUv(vec2 p) { return p / baScale; }
vec3 baToSrgb(vec3 c) { return mix(c * 12.92, pow(max(c, 0.0), vec3(1.0 / 2.4)) * 1.055 - 0.055, step(0.0031308, c)); }
vec3 baToLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
// One texel with the colour removal applied (baKey 1: the picked colour, in the sRGB values she picked it from; 2: a black
// "glow" key, alpha follows brightness). Every filter reads through it, so the removed colour stays gone under any look.
vec4 baTex(vec2 uv) {
  vec4 c = texture2D(map, uv);
  if (baKey < 0.5) return c;
  vec3 s = baLinear > 0.5 ? baToSrgb(c.rgb) : c.rgb;
  if (baKey > 1.5) { float m = max(s.r, max(s.g, s.b)); if (m < baKeyThresh * 0.15) return vec4(0.0); vec3 o = s / m; return vec4(baLinear > 0.5 ? baToLin(o) : o, c.a * m); }
  float d = distance(s, baKeyColor);
  return vec4(c.rgb, c.a * (baKeySoft > 0.0001 ? smoothstep(baKeyThresh, baKeyThresh + baKeySoft, d) : step(baKeyThresh, d)));
}
vec4 baFilter(vec2 uv) {
  vec4 src = baTex(uv);
  vec2 p = uv * baScale;
  float a = clamp(baAmount, 0.0, 1.0);
  if (baMode < 0.5) return src;
  if (baMode < 1.5) { // halftone: dots on a turned grid, bigger where the picture is darker, on newsprint
    float cell = mix(0.012, 0.06, a);
    mat2 turn = mat2(0.7071, 0.7071, -0.7071, 0.7071), back = mat2(0.7071, -0.7071, 0.7071, 0.7071);
    vec2 q = turn * p / cell, mid = floor(q) + 0.5;
    vec4 c = baTex(baUv(back * mid * cell));
    float r = sqrt(1.0 - baLum(c.rgb)) * 0.64, ink = 1.0 - smoothstep(r - 0.07, r + 0.07, length(q - mid));
    return vec4(mix(vec3(0.95, 0.92, 0.85), c.rgb * 0.85, ink), src.a);
  }
  if (baMode < 2.5) { // letters: the picture rebuilt from Hebrew letters and signs, fuller ones where it is brighter, on black
    float cell = mix(0.018, 0.07, a);
    vec2 q = p / cell, mid = floor(q) + 0.5, g = fract(q);
    vec4 c = baTex(baUv(mid * cell));
    float idx = floor(clamp(baLum(c.rgb), 0.0, 0.999) * 12.0);
    float m = texture2D(baGlyphs, vec2((idx + g.x) / 12.0, g.y)).r;
    return vec4(min(c.rgb * 1.3 + 0.05, 1.0) * m, src.a);
  }
  if (baMode < 3.5) { // VHS: colour channels pulled apart, lines that jump, a slow wobble, scanlines and grain
    float line = floor(uv.y * 240.0), tick = floor(baTime * 12.0);
    float jump = step(0.985 - a * 0.06, baHash(vec2(line * 0.07, tick))) * (baHash(vec2(line, tick)) - 0.5) * 0.08 * a;
    vec2 u = vec2(uv.x + jump + sin(uv.y * 30.0 + baTime * 3.0) * 0.002 * a + sin(uv.y * 3.0 - baTime * 1.3) * 0.004 * a, uv.y);
    float sh = 0.002 + 0.012 * a;
    vec4 r = baTex(u + vec2(sh, 0.0)), gr = baTex(u), b = baTex(u - vec2(sh, 0.0));
    vec3 col = vec3(r.r, gr.g, b.b) * (0.88 + 0.12 * sin(p.y * 900.0)) + (baHash(uv * 500.0 + baTime) - 0.5) * 0.14 * a;
    return vec4(col * vec3(1.04, 0.96, 1.08), max(src.a, max(r.a, b.a)));
  }
  if (baMode < 4.5) { // kaleidoscope: mirrored wedges around the middle, turning slowly
    float n = floor(mix(4.0, 12.0, a) + 0.5), w = 6.28318 / n;
    vec2 mid = 0.5 * baScale, d = p - mid;
    float ang = mod(atan(d.y, d.x) + baTime * 0.15, w);
    vec2 u = baUv(mid + length(d) * vec2(cos(abs(ang - w * 0.5)), sin(abs(ang - w * 0.5))));
    return baTex(1.0 - abs(1.0 - mod(u, 2.0)));
  }
  if (baMode < 5.5) { // paper cut: a few flat layers of coloured paper, each casting a soft shadow on the one below
    float n = floor(mix(3.0, 8.0, a) + 0.5);
    vec2 o = baTexel * 2.0;
    vec4 c = (baTex(uv) * 2.0 + baTex(uv + vec2(o.x, 0.0)) + baTex(uv - vec2(o.x, 0.0)) + baTex(uv + vec2(0.0, o.y)) + baTex(uv - vec2(0.0, o.y))) / 6.0;
    float l = floor(baLum(c.rgb) * n) / n;
    float above = floor(baLum(baTex(uv + vec2(-0.008, 0.01) / baScale).rgb) * n) / n;
    vec3 col = min(c.rgb * (l + 0.5 / n) / max(baLum(c.rgb), 0.04), 1.0) * (0.94 + 0.06 * baHash(floor(p * 400.0)));
    return vec4(col * (above > l + 0.001 ? 0.72 : 1.0), src.a);
  }
  // fluted glass: each rib flips and magnifies what is behind it, softly, with a sheen at its edges
  float w = 1.0 / floor(mix(8.0, 40.0, a) + 0.5), k = p.x / w, local = fract(k) - 0.5;
  vec2 u = baUv(vec2((floor(k) + 0.5 - local * 0.8) * w, p.y + sin(p.y * 6.0 + baTime * 0.4) * 0.004));
  vec4 c = (baTex(u) + baTex(u + vec2(baTexel.x * 1.5, 0.0)) + baTex(u - vec2(baTexel.x * 1.5, 0.0))) / 3.0;
  return vec4(c.rgb * (0.92 + 0.08 * cos(local * 6.28318)) + smoothstep(0.4, 0.5, abs(local)) * 0.18, src.a);
}
#endif
`;
  function fxMode(el) { const i = FX_IDS.indexOf(el.fx); return ["image", "video"].includes(el.type) && i >= 0 ? i + 1 : 0; }
  function fxAmount(el) { return Number.isFinite(el.fxAmount) ? Math.max(0, Math.min(1, el.fxAmount)) : 0.5; }
  function fxScale(el, w, h) { const c = el.crop || { w: 1, h: 1 }; return [(w / h) / c.w, 1 / c.h]; }
  function validFx(el) { return (el.fx == null || ["image", "video"].includes(el.type) && FX_IDS.includes(el.fx)) && (el.fxAmount == null || Number.isFinite(el.fxAmount) && el.fxAmount >= 0 && el.fxAmount <= 1); }
  // ---------- colour removal ("הסרת צבע") ----------
  // el.chroma = {enabled, color, threshold, soft} on a picture (also an animated GIF) or a video: texels within threshold
  // of the colour vanish, and soft (0 = the hard cut every older creation had) feathers the edge. A near-black colour is
  // the soft glow key for light effects drawn on black. It runs inside baTex, so the 3D/AR material, the filters and
  // the 2D editor (fxFrame) all remove the same pixels.
  const CHROMA_DEFAULT = { enabled: false, color: "#00ff00", threshold: 0.35, soft: 0 };
  const srgbToLin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  function keyValues(el) {
    const k = el && ["image", "video"].includes(el.type) && el.chroma;
    if (!k || !k.enabled) return null;
    const rgb = /^#[0-9a-f]{6}$/i.test(k.color || "") ? hexRgb(k.color) : [0, 1, 0];
    return { mode: rgb.reduce((n, v) => n + srgbToLin(v), 0) < 0.15 ? 2 : 1, rgb, thresh: Number.isFinite(k.threshold) ? k.threshold : 0.35, soft: Number.isFinite(k.soft) ? Math.max(0, k.soft) : 0 };
  }
  function validChroma(el) {
    const k = el.chroma; if (k == null) return true;
    if (typeof k !== "object" || Array.isArray(k) || !["image", "video"].includes(el.type)) return false;
    if (k.enabled != null && typeof k.enabled !== "boolean") return false;
    if (k.color != null && (typeof k.color !== "string" || k.color.length > 32)) return false;
    return [["threshold", 0, 2], ["soft", 0, 1]].every(([f, lo, hi]) => k[f] == null || Number.isFinite(k[f]) && k[f] >= lo && k[f] <= hi);
  }
  // The colour of one pixel of a layer's own picture (not of the screen): u, v from its top left, inside its crop.
  let pickCanvas = null;
  function pixelAt(media, el, u, v) {
    const iw = media.videoWidth || media.naturalWidth || media.width, ih = media.videoHeight || media.naturalHeight || media.height;
    if (!iw || !ih) return null;
    const c = el.crop || { x: 0, y: 0, w: 1, h: 1 }, sx = Math.min(iw - 1, Math.max(0, Math.floor((c.x + u * c.w) * iw))), sy = Math.min(ih - 1, Math.max(0, Math.floor((c.y + v * c.h) * ih)));
    try {
      if (!pickCanvas) pickCanvas = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      pickCanvas.canvas.width = pickCanvas.canvas.height = 3;
      pickCanvas.clearRect(0, 0, 3, 3); pickCanvas.drawImage(media, sx - 1, sy - 1, 3, 3, 0, 0, 3, 3); // the pixel and its neighbours, averaged
      const d = pickCanvas.getImageData(0, 0, 3, 3).data; let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 8) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      if (!n) return null;
      return "#" + [r, g, b].map((x) => Math.round(x / n).toString(16).padStart(2, "0")).join("");
    } catch (e) { return null; }
  }
  let fxGlyphCanvas = null, fxGlyphTexture = null;
  function fxGlyphs() { // 12 letters and signs from emptiest to fullest, white on black, one 64px cell each in a row
    if (fxGlyphCanvas) return fxGlyphCanvas;
    const font = "700 50px " + DEVICE_FONT, probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    probe.canvas.width = probe.canvas.height = 64;
    const ink = (ch) => { probe.fillStyle = "#000"; probe.fillRect(0, 0, 64, 64); probe.fillStyle = "#fff"; probe.font = font; probe.textAlign = "center"; probe.textBaseline = "middle"; probe.fillText(ch, 32, 34);
      let s = 0; const d = probe.getImageData(0, 0, 64, 64).data; for (let i = 0; i < d.length; i += 4) s += d[i]; return s; };
    const sorted = Array.from(" ·.:-=+*יורזדנגכבהקפחטצמשםסאת#@").map((ch) => [ch, ink(ch)]).sort((x, y) => x[1] - y[1]);
    const c = document.createElement("canvas"), g = c.getContext("2d");
    c.width = 64 * 12; c.height = 64; g.fillStyle = "#000"; g.fillRect(0, 0, c.width, 64); g.fillStyle = "#fff"; g.font = font; g.textAlign = "center"; g.textBaseline = "middle";
    for (let i = 0; i < 12; i++) g.fillText(sorted[Math.round(i * (sorted.length - 1) / 11)][0], 64 * i + 32, 34);
    return (fxGlyphCanvas = c);
  }
  // Swap the texture lookup in a layer's own material for baFilter: three's built-in materials through their map
  // chunk (a texel the colour removal emptied is discarded there, so it cannot punch a hole in the depth buffer), our
  // ShaderMaterials through their texture2D(map, vUv).
  function patchFxMaterial(mat, uniforms) {
    if (!mat || mat._studioFx === uniforms || !(mat.isShaderMaterial ? mat.uniforms && mat.uniforms.map : "map" in mat)) return;
    mat._studioFx = uniforms;
    if (mat.isShaderMaterial) mat.defines = Object.assign({}, mat.defines, { BA_FX_SHADER: "" });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      const fs = shader.fragmentShader.replace(/void main\(\)\s*\{/, FX_GLSL + "\nvoid main() {");
      shader.fragmentShader = mat.isShaderMaterial ? fs.replace("texture2D(map, vUv)", "baFilter(vUv)")
        : fs.replace("#include <map_fragment>", THREE.ShaderChunk.map_fragment.replace(/texture2D\(\s*map,\s*(vMapUv|vUv)\s*\)/, "baFilter( $1 )") + "\nif (baKey > 0.5 && diffuseColor.a < 0.002) discard;");
    };
    mat.customProgramCacheKey = () => "studio-fx";
    mat.needsUpdate = true;
  }
  function ensureFxComponent() {
    if (!window.AFRAME || AFRAME.components["studio-fx"]) return;
    AFRAME.registerComponent("studio-fx", {
      schema: { mode: { default: 0 }, amount: { default: 0.5 }, sx: { default: 1 }, sy: { default: 1 }, key: { default: 0 }, kc: { default: "#00ff00" }, thresh: { default: 0.35 }, soft: { default: 0 } },
      init() {
        if (!fxGlyphTexture) { fxGlyphTexture = new THREE.CanvasTexture(fxGlyphs()); fxGlyphTexture.generateMipmaps = false; fxGlyphTexture.minFilter = THREE.LinearFilter; }
        this.uniforms = { baMode: { value: 0 }, baAmount: { value: 0.5 }, baTime: { value: 0 }, baScale: { value: new THREE.Vector2(1, 1) }, baTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) }, baGlyphs: { value: fxGlyphTexture },
          baKey: { value: 0 }, baKeyColor: { value: new THREE.Vector3(0, 1, 0) }, baKeyThresh: { value: 0.35 }, baKeySoft: { value: 0 }, baLinear: { value: 0 } };
      },
      update() {
        const u = this.uniforms, d = this.data; u.baMode.value = d.mode; u.baAmount.value = d.amount; u.baScale.value.set(d.sx, d.sy);
        u.baKey.value = d.key; u.baKeyColor.value.fromArray(/^#[0-9a-f]{6}$/i.test(d.kc) ? hexRgb(d.kc) : [0, 1, 0]); u.baKeyThresh.value = d.thresh; u.baKeySoft.value = d.soft;
      },
      tick(time) { // the material can arrive late or be rebuilt (texture load, chroma mount), so it is checked every frame
        this.uniforms.baTime.value = time / 1000;
        this.el.object3D.traverse((n) => {
          if (!n.isMesh) return;
          patchFxMaterial(n.material, this.uniforms);
          if (this.data.key && n.material && !n.material.transparent) { n.material.transparent = true; n.material.needsUpdate = true; } // a soft edge needs blending
          const tex = n.material && (n.material.map || n.material.uniforms && n.material.uniforms.map && n.material.uniforms.map.value), img = tex && tex.image;
          // the removal compares sRGB values: an sRGB picture is decoded to linear before the shader sees it, a video is decoded after
          if (tex) this.uniforms.baLinear.value = tex.colorSpace === "srgb" && !tex.isVideoTexture && !n.material.isShaderMaterial ? 1 : 0;
          const w = img && (img.videoWidth || img.naturalWidth || img.width), h = img && (img.videoHeight || img.naturalHeight || img.height);
          if (w && h) this.uniforms.baTexel.value.set(1 / w, 1 / h);
        });
      }
    });
  }
  // The 2D editor's copy: draws media (cropped to el.crop) through baFilter into a canvas of the given size, or
  // returns null when the layer has no filter, no colour removal, or WebGL is missing (the caller then draws it plainly).
  let fxGL;
  function fxFrame(media, el, wpx, hpx, timeSec, noKey) {
    const mode = fxMode(el), key = noKey ? null : keyValues(el);
    if (!mode && !key) return null;
    if (fxGL === undefined) {
      fxGL = null;
      try {
        const c = document.createElement("canvas"), gl = c.getContext("webgl", { premultipliedAlpha: false, preserveDrawingBuffer: true });
        const shader = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
        const prog = gl.createProgram();
        gl.attachShader(prog, shader(gl.VERTEX_SHADER, "attribute vec2 pos; uniform vec4 crop; varying vec2 vUv; void main() { vUv = crop.xy + (pos * 0.5 + 0.5) * crop.zw; gl_Position = vec4(pos, 0.0, 1.0); }"));
        gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, "precision highp float;\n#define BA_FX_SHADER\nuniform sampler2D map; varying vec2 vUv;\n" + FX_GLSL + "\nvoid main() { gl_FragColor = baFilter(vUv); }"));
        gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
        gl.useProgram(prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const at = gl.getAttribLocation(prog, "pos"); gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
        const texture = (unit, source) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
          for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); if (source) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source); return t; };
        texture(1, fxGlyphs()); texture(0, null);
        const u = (n) => gl.getUniformLocation(prog, n);
        gl.uniform1i(u("map"), 0); gl.uniform1i(u("baGlyphs"), 1);
        fxGL = { c, gl, u: { crop: u("crop"), mode: u("baMode"), amount: u("baAmount"), time: u("baTime"), scale: u("baScale"), texel: u("baTexel"), key: u("baKey"), kc: u("baKeyColor"), thresh: u("baKeyThresh"), soft: u("baKeySoft"), lin: u("baLinear") } };
      } catch (e) { console.warn("filter preview unavailable", e); }
    }
    if (!fxGL) return null;
    const { c, gl, u } = fxGL, cr = el.crop || { x: 0, y: 0, w: 1, h: 1 };
    const iw = media.videoWidth || media.naturalWidth || media.width, ih = media.videoHeight || media.naturalHeight || media.height;
    if (!iw || !ih) return null;
    const k = Math.min(1, 1024 / Math.max(wpx, hpx)) * (window.devicePixelRatio || 1);
    c.width = Math.max(1, Math.round(wpx * Math.min(k, 2))); c.height = Math.max(1, Math.round(hpx * Math.min(k, 2)));
    gl.viewport(0, 0, c.width, c.height);
    gl.activeTexture(gl.TEXTURE0); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, media); } catch (e) { return null; }
    const s = fxScale(el, wpx, hpx);
    gl.uniform4f(u.crop, cr.x, 1 - cr.y - cr.h, cr.w, cr.h); gl.uniform1f(u.mode, mode); gl.uniform1f(u.amount, fxAmount(el)); gl.uniform1f(u.time, timeSec || 0);
    gl.uniform2f(u.scale, s[0], s[1]); gl.uniform2f(u.texel, 1 / iw, 1 / ih);
    gl.uniform1f(u.key, key ? key.mode : 0); gl.uniform3fv(u.kc, key ? key.rgb : [0, 1, 0]); gl.uniform1f(u.thresh, key ? key.thresh : 0.35); gl.uniform1f(u.soft, key ? key.soft : 0); gl.uniform1f(u.lin, 0);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return c;
  }

  // ---------- pattern layers ----------
  // A pattern layer is a background or a repeating pattern drawn in code, with no file: el.pattern holds the look,
  // three colours, size (0-1, bigger motifs), speed (0 = still), a seed for the random looks and a shape. One GLSL
  // function, bpPattern(uv), paints it: in the 3D/AR plane (studio-pattern patches the plane's own flat material, so
  // opacity, fades and timelines keep working) and in the 2D editor (patternFrame, plain WebGL). p is in square units
  // where the height is 1. Our own takes on the classic looks, written here: [id, Hebrew name, colours, start speed].
  const PATTERNS = [
    ["liquid", "גרדיאנט נוזלי", ["#ff6b9a", "#7b5cff", "#ffd36e"], 0.35], ["soft", "גרדיאנט רך", ["#ffe3d3", "#ff7a59", "#6d5dfc"], 0.35],
    ["lights", "אורות רכים", ["#1a1033", "#ffcf6b", "#ff6fb1"], 0.35], ["waves", "גלים", ["#0b3d91", "#2fa4d8", "#bfeaf5"], 0.35],
    ["rays", "קרני שמש", ["#ffcc33", "#ff9e3d", "#fff3c4"], 0.35], ["topo", "קווי גובה", ["#f4efe6", "#5b5560", "#e4572e"], 0.2],
    ["marble", "שיש", ["#f5f2ec", "#8c8a93", "#c9a86a"], 0], ["dots", "נקודות", ["#fff4e0", "#ff5a5f", "#2ec4b6"], 0],
    ["stripes", "פסים", ["#fdf0d5", "#c1121f", "#003049"], 0], ["gingham", "משבצות פיקניק", ["#ffffff", "#f7b2bd", "#e05a70"], 0],
    ["zigzag", "זיגזג", ["#264653", "#e9c46a", "#f4a261"], 0], ["scales", "גלים יפניים", ["#f1faee", "#457b9d", "#1d3557"], 0],
    ["hex", "חלת דבש", ["#5a3a0c", "#f6b93b", "#fad390"], 0], ["arcs", "קשתות", ["#fdfcdc", "#0081a7", "#f07167"], 0],
    ["hearts", "לבבות", ["#ffe5ec", "#ff4d6d", "#c9184a"], 0], ["terrazzo", "טרצו", ["#f2ece4", "#e07a5f", "#3d405b"], 0]
  ];
  const PATTERN_IDS = PATTERNS.map((p) => p[0]);
  // Ready colour sets for any look: [Hebrew name, colours]
  const PATTERN_PALETTES = [
    ["שקיעה", ["#ff6b6b", "#ffd166", "#6a4c93"]], ["ים", ["#0b3d91", "#2fa4d8", "#bfeaf5"]], ["פסטל", ["#ffd6e0", "#c1e7e3", "#fff1b6"]],
    ["יער", ["#1b4332", "#52b788", "#d8f3dc"]], ["לילה וניאון", ["#120458", "#ff00a0", "#00f0ff"]], ["שחור וזהב", ["#111111", "#d4af37", "#f5e6c4"]],
    ["אדמה", ["#8d5524", "#e0ac69", "#f6e7d7"]], ["שחור ולבן", ["#111111", "#f5f5f5", "#9e9e9e"]]
  ];
  // Shapes: the plane's proportions (art: the artwork's own) and the mask the shader cuts
  const PATTERN_SHAPES = [["art", "כמו תמונת המקור", 0, 0], ["square", "ריבוע", 1, 0], ["circle", "עיגול", 1, 1], ["arch", "קשת", 0.75, 2], ["pill", "פס מעוגל", 3.5, 3]];
  const PATTERN_GLSL = `
uniform float bpMode; uniform vec3 bpC1; uniform vec3 bpC2; uniform vec3 bpC3; uniform float bpSize; uniform float bpTime;
uniform float bpSeed; uniform float bpAspect; uniform float bpShape; uniform float bpPx;
float bpHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031 + bpSeed * 0.0137); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec2 bpHash2(vec2 p) { return vec2(bpHash(p), bpHash(p + 17.31)); }
float bpNoise(vec2 p) { // gradient noise, about 0..1
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  float a = dot(bpHash2(i) * 2.0 - 1.0, f), b = dot(bpHash2(i + vec2(1.0, 0.0)) * 2.0 - 1.0, f - vec2(1.0, 0.0));
  float c = dot(bpHash2(i + vec2(0.0, 1.0)) * 2.0 - 1.0, f - vec2(0.0, 1.0)), d = dot(bpHash2(i + 1.0) * 2.0 - 1.0, f - 1.0);
  return 0.5 + mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float bpFbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * bpNoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 3.7; a *= 0.5; } return s / 0.9375; }
vec3 bpPick(float i) { i = mod(i, 3.0); return i < 0.5 ? bpC1 : (i < 1.5 ? bpC2 : bpC3); }
vec3 bpRamp(float x) { x = clamp(x, 0.0, 1.0); return x < 0.5 ? mix(bpC1, bpC2, x * 2.0) : mix(bpC2, bpC3, x * 2.0 - 1.0); }
vec3 bpBands(float y, float aa) { float i = floor(y); return mix(bpPick(i - 1.0), bpPick(i), smoothstep(0.0, aa, fract(y))); }
float bpIn(float d, float aa) { return 1.0 - smoothstep(-aa, aa, d); } // 1 inside a shape whose distance d is below 0
float bpHeart(vec2 p) { // a square turned on its corner with a circle on each upper side
  p.x = abs(p.x); p.y += 0.06;
  vec2 q = mat2(0.7071, 0.7071, -0.7071, 0.7071) * (p - vec2(0.0, -0.1));
  return min(max(abs(q.x), abs(q.y)) - 0.25, length(p - vec2(0.177, 0.077)) - 0.25);
}
vec4 bpLinear(vec4 c) { return vec4(mix(c.rgb / 12.92, pow((c.rgb + 0.055) / 1.055, vec3(2.4)), step(0.04045, c.rgb)), c.a); }
vec4 bpPattern(vec2 uv) {
  vec2 p = (uv - 0.5) * vec2(bpAspect, 1.0);
  float t = bpTime, z = clamp(bpSize, 0.0, 1.0);
  vec3 col = bpC1;
  if (bpMode < 1.5) { // liquid gradient: the three colours folded into each other by slow, warped noise
    vec2 q = p * mix(1.5, 0.5, z) + bpSeed * 1.7;
    vec2 w = vec2(bpNoise(q + vec2(0.0, t * 0.12)), bpNoise(q * 1.3 + vec2(5.2, 1.3) - t * 0.1));
    col = bpRamp(smoothstep(0.2, 0.8, bpNoise(q * 0.8 + 2.2 * w + vec2(t * 0.05, 0.0))));
  } else if (bpMode < 2.5) { // soft gradient: two pools of colour drifting over the first, with a fine grain
    float k = mix(7.0, 1.4, z);
    vec2 a = vec2(0.3 * bpAspect * cos(t * 0.5 + bpSeed), 0.28 * sin(t * 0.4 + 1.0 + bpSeed));
    vec2 b = vec2(0.3 * bpAspect * cos(t * 0.37 + 2.6 + bpSeed), 0.28 * sin(t * 0.45 + 4.0));
    col = mix(col, bpC2, exp(-dot(p - a, p - a) * k));
    col = mix(col, bpC3, exp(-dot(p - b, p - b) * k));
    col += (bpHash(floor(uv * vec2(bpAspect, 1.0) * 500.0)) - 0.5) * 0.08;
  } else if (bpMode < 3.5) { // soft lights rising slowly over a dark ground, three layers deep
    col = bpC1 * (0.7 + 0.4 * uv.y);
    for (int i = 0; i < 3; i++) {
      float l = float(i), n = mix(6.0, 2.0, z) * (1.0 + l * 0.6);
      vec2 q = p * n + vec2(l * 7.1, -t * (0.3 + 0.15 * l)), id = floor(q), h = bpHash2(id + l * 13.0);
      float r = 0.16 + 0.12 * bpHash(id + 3.7 + l), d = length(fract(q) - 0.5 - (h - 0.5) * 0.4);
      float light = step(0.45, bpHash(id + 9.1 + l)) * (smoothstep(r, r * 0.6, d) * 0.75 + smoothstep(r, r * 0.92, d) * 0.25);
      col += mix(bpC2, bpC3, step(0.5, h.y)) * light * (0.6 - l * 0.15);
    }
  } else if (bpMode < 4.5) { // waves: bands of the three colours rolling sideways
    float n = mix(9.0, 2.2, z);
    float y = p.y * n + 0.45 * sin(p.x * 2.4 + t * 0.9 + bpSeed) + 0.2 * sin(p.x * 5.3 - t * 1.3);
    col = bpBands(y, bpPx * n * 2.0) * (0.9 + 0.1 * smoothstep(0.0, 0.35, fract(y)));
  } else if (bpMode < 5.5) { // sun rays turning slowly around a warm middle
    float n = floor(mix(16.0, 5.0, z) + 0.5) * 2.0, r = length(p), k = (atan(p.y, p.x) / 6.28318 + t * 0.02) * n;
    float aa = 3.14159 * bpPx * n / (6.28318 * max(r, 0.02));
    col = mix(bpC1, bpC2, smoothstep(-aa, aa, sin(k * 3.14159)));
    col = mix(col, bpC3, smoothstep(0.3, 0.0, r));
  } else if (bpMode < 6.5) { // contour lines, like a map of hills; every fifth one in the third colour
    vec2 q = p * mix(2.6, 0.8, z) + vec2(t * 0.05, bpSeed * 1.3);
    float h = (bpNoise(q) * 0.7 + bpNoise(q * 2.3 + 4.1) * 0.3) * 16.0;
    float d = abs(fract(h + 0.5) - 0.5), major = 1.0 - step(0.5, mod(floor(h + 0.5), 5.0));
    col = mix(bpC1, mix(bpC2, bpC3, major), 1.0 - smoothstep(0.05 + major * 0.04, 0.11 + major * 0.04, d));
  } else if (bpMode < 7.5) { // marble: soft clouds, veins of the second colour and a thin vein of the third
    vec2 q = p * mix(2.0, 0.7, z) + bpSeed * 2.3;
    float v = abs(sin((q.x * 0.9 + q.y * 0.4) * 4.5 + bpFbm(q * 1.5 + vec2(t * 0.03, 0.0)) * 14.0));
    float v2 = abs(sin((q.x * 0.3 - q.y * 0.8) * 2.5 + bpFbm(q * 1.1 + 7.0 - t * 0.02) * 10.0));
    col = bpC1 * (0.93 + 0.1 * bpFbm(q * 3.0 + 2.0));
    col = mix(col, bpC2, (1.0 - smoothstep(0.0, 0.18, v)) * 0.55 + (1.0 - smoothstep(0.0, 0.03, v)) * 0.35);
    col = mix(col, bpC3, (1.0 - smoothstep(0.0, 0.06, v2)) * 0.9);
  } else { // the repeating patterns, drifting slowly on a slant when there is movement
    float n = mix(14.0, 2.6, z), aa = bpPx * n * 1.5;
    vec2 q = p * n + t * vec2(0.5, 0.3);
    if (bpMode < 8.5) { // dots on offset rows, the rows taking turns between two colours
      float row = floor(q.y); vec2 g = fract(vec2(q.x + mod(row, 2.0) * 0.5, q.y)) - 0.5;
      col = mix(bpC1, mod(row, 2.0) < 0.5 ? bpC2 : bpC3, bpIn(length(g) - 0.28, aa));
    } else if (bpMode < 9.5) { // stripes on a slant
      col = bpBands((q.x + q.y) * 0.7071, aa);
    } else if (bpMode < 10.5) { // gingham: crossing bands, the third colour where they cross
      vec2 f = fract(q), s = smoothstep(0.0, aa, f) - smoothstep(0.5, 0.5 + aa, f);
      col = mix(mix(bpC1, bpC2, max(s.x, s.y)), bpC3, s.x * s.y);
    } else if (bpMode < 11.5) { // zigzag
      col = bpBands(q.y + abs(fract(q.x) - 0.5) * 1.2, aa * 1.6);
    } else if (bpMode < 12.5) { // fish scales of rings, each row lying over the one above it (tried from the lowest)
      vec2 s = q * 0.5; // scales twice the size of the other motifs
      float j = floor(s.y * 4.0), found = 0.0, ring = 0.0;
      for (int k = 0; k < 4; k++) {
        float row = j + float(k) - 1.0, off = mod(row, 2.0) * 0.5;
        float d = length(s - vec2(floor(s.x - off + 0.5) + off, row * 0.25));
        if (d < 0.5 && found < 0.5) { found = 1.0; ring = d * 8.0; }
      }
      col = mix(mod(floor(ring), 2.0) < 0.5 ? bpC2 : bpC3, bpC1, 1.0 - smoothstep(0.1, 0.1 + aa * 4.0, fract(ring)));
    } else if (bpMode < 13.5) { // honeycomb, a few cells in the third colour
      vec2 r = vec2(1.0, 1.7320508), a = mod(q, r) - r * 0.5, b = mod(q - r * 0.5, r) - r * 0.5;
      vec2 g = dot(a, a) < dot(b, b) ? a : b, ag = abs(g);
      float d = 0.5 - max(dot(ag, vec2(0.5, 0.8660254)), ag.x);
      vec3 fill = (bpHash(floor((q - g) * 2.0 + 0.5)) < 0.75 ? bpC2 : bpC3) * (0.9 + 0.15 * smoothstep(0.0, 0.45, d));
      col = mix(bpC1, fill, smoothstep(0.04, 0.04 + aa, d));
    } else if (bpMode < 14.5) { // arcs: quarter circles turned at random, a thick band with a thin line inside
      vec2 id = floor(q), g = fract(q) - 0.5;
      if (bpHash(id) < 0.5) g.x = -g.x;
      float d = min(abs(length(g - 0.5) - 0.5), abs(length(g + 0.5) - 0.5));
      col = mix(bpC1, bpC2, bpIn(d - 0.15, aa));
      col = mix(col, bpC3, bpIn(d - 0.035, aa));
    } else if (bpMode < 15.5) { // hearts on offset rows, beating gently when there is movement
      float row = floor(q.y); vec2 g = fract(vec2(q.x + mod(row, 2.0) * 0.5, q.y)) - 0.5;
      float beat = 1.0 + 0.08 * sin(t * 6.0 + row);
      col = mix(bpC1, mod(row, 2.0) < 0.5 ? bpC2 : bpC3, bpIn(bpHeart(g * 1.35 / beat), aa * 1.35));
    } else { // terrazzo: chips of two colours scattered over the first, and small specks
      vec2 id = floor(q), g = fract(q);
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec2 o = vec2(float(x), float(y)), c = id + o, h = bpHash2(c), d = g - o - h;
        float m = -1.0; // an uneven pentagon: the farthest of five turned edges
        for (int e = 0; e < 5; e++) { float a = h.x * 6.28 + float(e) * 1.2566 + (bpHash(c + float(e) * 3.1) - 0.5) * 0.9; m = max(m, dot(d, vec2(cos(a), sin(a)))); }
        float chip = step(0.3, bpHash(c + 5.3)) * bpIn(m - (0.11 + 0.2 * bpHash(c + 2.1)), aa);
        col = mix(col, (bpHash(c + 8.8) < 0.5 ? bpC2 : bpC3) * (0.9 + 0.15 * h.y), chip);
      }
      vec2 sq = q * 5.0, sid = floor(sq);
      float speck = step(0.8, bpHash(sid + 1.7)) * bpIn(length(fract(sq) - 0.5 - (bpHash2(sid + 4.4) - 0.5) * 0.5) - 0.09, aa * 5.0);
      col = mix(col, bpHash(sid + 6.6) < 0.5 ? bpC2 : bpC3, speck);
    }
  }
  float alpha = 1.0;
  if (bpShape > 0.5) {
    float d;
    if (bpShape < 1.5) d = length(p) - 0.5; // circle
    else if (bpShape < 2.5) { float r = bpAspect * 0.5; d = p.y < 0.5 - r ? max(abs(p.x) - r, -0.5 - p.y) : length(p - vec2(0.0, 0.5 - r)) - r; } // arch
    else d = length(vec2(max(abs(p.x) - (bpAspect * 0.5 - 0.5), 0.0), p.y)) - 0.5; // pill
    alpha = 1.0 - smoothstep(-bpPx * 1.5, 0.0, d);
  }
  return vec4(clamp(col, 0.0, 1.0), alpha);
}
`;
  const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  function patternDefaults(look) { const d = PATTERNS.find((p) => p[0] === look) || PATTERNS[0]; return { look: d[0], colors: d[2].slice(), size: 0.5, speed: d[3], seed: 0, shape: "art" }; }
  function patternAspect(rec, shape) { const s = PATTERN_SHAPES.find((x) => x[0] === shape); if (s && s[2]) return s[2]; const g = geom(rec); return g.artW / g.artH; }
  function validPattern(el) {
    const p = el.pattern;
    if (el.type !== "pattern") return p == null;
    return !!p && PATTERN_IDS.includes(p.look) && Array.isArray(p.colors) && p.colors.length === 3 && p.colors.every((c) => /^#[0-9a-f]{6}$/i.test(c))
      && [p.size, p.speed].every((v) => Number.isFinite(v) && v >= 0 && v <= 1) && Number.isInteger(p.seed) && p.seed >= 0 && p.seed < 1000 && PATTERN_SHAPES.some((s) => s[0] === p.shape);
  }
  // Uniform values for a layer of the given proportions (width / height); px: one pixel in square units
  function patternValues(el, aspect, px) {
    const p = el.pattern || patternDefaults(), s = PATTERN_SHAPES.find((x) => x[0] === p.shape);
    return { bpMode: PATTERN_IDS.indexOf(p.look) + 1 || 1, bpC1: hexRgb(p.colors[0]), bpC2: hexRgb(p.colors[1]), bpC3: hexRgb(p.colors[2]),
      bpSize: p.size, bpSeed: p.seed, bpAspect: aspect, bpShape: s ? s[3] : 0, bpPx: px };
  }
  function patchPatternMaterial(mat, uniforms) {
    if (!mat || mat._studioPattern === uniforms || mat.isShaderMaterial) return;
    mat._studioPattern = uniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = "#define USE_UV\n" + shader.vertexShader;
      shader.fragmentShader = "#define USE_UV\n" + shader.fragmentShader.replace(/void main\(\)\s*\{/, PATTERN_GLSL + "\nvoid main() {")
        .replace("#include <map_fragment>", "diffuseColor *= bpLinear(bpPattern(vUv));"); // the scene works in linear colour
    };
    mat.customProgramCacheKey = () => "studio-pattern";
    mat.needsUpdate = true;
  }
  function ensurePatternComponent() {
    if (!window.AFRAME || AFRAME.components["studio-pattern"]) return;
    AFRAME.registerComponent("studio-pattern", {
      schema: { values: { default: "{}" }, speed: { default: 0 } },
      init() {
        this.t = 0;
        this.uniforms = {};
        for (const k of ["bpMode", "bpSize", "bpTime", "bpSeed", "bpAspect", "bpShape", "bpPx"]) this.uniforms[k] = { value: 0 };
        for (const k of ["bpC1", "bpC2", "bpC3"]) this.uniforms[k] = { value: new THREE.Vector3() };
      },
      update() {
        const v = JSON.parse(this.data.values);
        for (const [k, x] of Object.entries(v)) { if (!this.uniforms[k]) continue; if (Array.isArray(x)) this.uniforms[k].value.fromArray(x); else this.uniforms[k].value = x; }
      },
      tick(time, dt) { // the material can arrive late or be rebuilt, so it is checked every frame
        this.t += Math.min(dt || 0, 100) / 1000 * this.data.speed;
        this.uniforms.bpTime.value = this.t;
        this.el.object3D.traverse((n) => { if (n.isMesh) patchPatternMaterial(n.material, this.uniforms); });
      }
    });
  }
  // The 2D editor's copy: the layer drawn into a canvas of the given size (null when WebGL is missing)
  let patGL;
  function patternFrame(el, wpx, hpx, timeSec) {
    if (el.type !== "pattern") return null;
    if (patGL === undefined) {
      patGL = null;
      try {
        const c = document.createElement("canvas"), gl = c.getContext("webgl", { premultipliedAlpha: false, preserveDrawingBuffer: true });
        const shader = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
        const prog = gl.createProgram();
        gl.attachShader(prog, shader(gl.VERTEX_SHADER, "attribute vec2 pos; varying vec2 vUv; void main() { vUv = pos * 0.5 + 0.5; gl_Position = vec4(pos, 0.0, 1.0); }"));
        gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, "precision highp float;\nvarying vec2 vUv;\n" + PATTERN_GLSL + "\nvoid main() { gl_FragColor = bpPattern(vUv); }"));
        gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
        gl.useProgram(prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const at = gl.getAttribLocation(prog, "pos"); gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
        patGL = { c, gl, u: (n) => gl.getUniformLocation(prog, n) };
      } catch (e) { console.warn("pattern preview unavailable", e); }
    }
    if (!patGL) return null;
    const { c, gl, u } = patGL, k = Math.min(2, Math.min(1, 1024 / Math.max(wpx, hpx)) * (window.devicePixelRatio || 1));
    c.width = Math.max(1, Math.round(wpx * k)); c.height = Math.max(1, Math.round(hpx * k));
    gl.viewport(0, 0, c.width, c.height);
    const v = patternValues(el, wpx / hpx, 1 / c.height);
    for (const [n, x] of Object.entries(v)) { if (Array.isArray(x)) gl.uniform3fv(u(n), x); else gl.uniform1f(u(n), x); }
    gl.uniform1f(u("bpTime"), (timeSec || 0) * ((el.pattern && el.pattern.speed) || 0));
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return c;
  }

  // Chroma-key video: samples the video texture with a key-color discard shader.
  // Works in both preview and AR modes (replaces the plain/fade video path when enabled).
  // The keying shader, standalone so it can be driven by any texture (video or test canvas).
  // A black key is a soft "glow" key for light effects drawn on black: alpha follows brightness and the colour is
  // un-premultiplied, so the result is c + behind*(1-max(c)) - glows stay soft instead of being cut at an edge.
  function makeChromaMaterial(texture, color, threshold) {
    const key = new THREE.Color(color || "#00ff00");
    return new THREE.ShaderMaterial({
      uniforms: { map: { value: texture }, keyColor: { value: key }, thresh: { value: threshold == null ? 0.35 : threshold }, glow: { value: key.r + key.g + key.b < 0.15 ? 1 : 0 } },
      transparent: true,
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform sampler2D map; uniform vec3 keyColor; uniform float thresh; uniform float glow; varying vec2 vUv;" +
        "void main(){ vec4 c = texture2D(map, vUv);" +
        " if (glow > 0.5) { float m = max(c.r, max(c.g, c.b)); if (m < thresh * 0.15) discard; gl_FragColor = vec4(c.rgb / m, m); return; }" +
        " float d = distance(c.rgb, keyColor); if (d < thresh) discard; gl_FragColor = c; }"
    });
  }
  // AR video lifecycle, mirroring xrextras-target-video-fade but on our own exact
  // geometry: hidden until the target is found, then fade in and play; on lost,
  // pause, rewind and hide. Honors creator opacity via _studioOpacity.
  function ensureTargetVideoComponent() {
    if (!window.AFRAME || AFRAME.components["studio-target-video"]) return;
    AFRAME.registerComponent("studio-target-video", {
      schema: { video: { type: "string" }, fadeMs: { type: "int", default: 800 } },
      init() {
        this.video = document.querySelector(this.data.video);
        this.target = 0;
        // the artwork target itself, not the direct parent: inside a group or a scatter the parent is a wrapper that never hears it
        const parent = this.anchor = this.el.closest("xrextras-named-image-target") || this.el.parentNode;
        this.onFound = () => { if (this.video) this.video.play().catch(() => {}); this.target = 1; };
        this.onLost = () => {
          if (this.video && !this.video.__play) { this.video.pause(); this.video.currentTime = 0; } // a still video keeps its chosen frame
          this.target = 0;
          const m = this.el.getObject3D("mesh");
          if (m && m.material) m.material.opacity = 0;
        };
        if (parent) {
          parent.addEventListener("xrextrasfound", this.onFound);
          parent.addEventListener("xrextraslost", this.onLost);
        }
      },
      tick(time, dt) {
        const m = this.el.getObject3D("mesh");
        if (!m || !m.material) return;
        const base = this.el._studioOpacity == null ? 1 : this.el._studioOpacity;
        const goal = this.target * base, o = m.material.opacity;
        if (o === goal) return;
        const step = Math.max(1, dt || 16) / this.data.fadeMs;
        m.material.opacity = Math.abs(goal - o) <= step ? goal : o + Math.sign(goal - o) * step;
      },
      remove() {
        const parent = this.anchor;
        if (parent) {
          parent.removeEventListener("xrextrasfound", this.onFound);
          parent.removeEventListener("xrextraslost", this.onLost);
        }
      }
    });
  }

  function ensureChromaComponent() {
    if (!window.AFRAME || AFRAME.components["chroma-video"]) return;
    AFRAME.registerComponent("chroma-video", {
      // src as a plain string resolved lazily: dynamically built scenes (embedded 3D editor)
      // attach entities before/while media nodes land, and a-frame's `selector` type resolves
      // once at parse time, which produced a permanently null texture there.
      schema: { src: { type: "string" }, color: { default: "#00ff00" }, threshold: { default: 0.35 }, width: { default: 1 }, height: { default: 1 } },
      init() {
        const mount = () => {
          const video = this.data.src && document.querySelector(this.data.src);
          if (!video) return false;
          const tex = new THREE.VideoTexture(video);
          const mat = makeChromaMaterial(tex, this.data.color, this.data.threshold);
          this.el.object3D.add(new THREE.Mesh(new THREE.PlaneGeometry(this.data.width, this.data.height), mat));
          return true;
        };
        if (!mount()) { let tries = 0; const retry = () => { if (mount() || ++tries > 300) return; requestAnimationFrame(retry); }; requestAnimationFrame(retry); }
      }
    });
  }

  function audioDistances(el){const inner=Math.max(.05,Math.min(5,Number(el.spatialInner)||.35)),outer=Math.max(inner+.01,Math.min(20,Number(el.spatialOuter)||1.4));return {inner,outer};}
  function connectSpatialAudio(scene,container,mediaEls){
    const listener=scene.audioListener||(scene.audioListener=new THREE.AudioListener());
    const route=()=>{if(scene.camera&&!listener.parent)scene.camera.add(listener);for(const m of mediaEls){if(m.three)continue;const ent=m.el.spatial?container.querySelector('[data-el-id="'+m.el.id+'"]'):null;let audio;
      if(ent){audio=new THREE.PositionalAudio(listener);const d=audioDistances(m.el);audio.setDistanceModel(m.el.spatialMode==='linear'?'linear':'exponential');audio.setRefDistance(d.inner);audio.setMaxDistance(d.outer);audio.setRolloffFactor(m.el.spatialMode==='linear'?1:1.5);ent.object3D.add(audio);}else audio=new THREE.Audio(listener);
      audio.setMediaElementSource(m.node);audio.gain.gain.value=1;m.three=audio;
    }};if(scene.hasLoaded)route();else scene.addEventListener('loaded',route,{once:true});return listener;
  }
  // ---------- time cube ----------
  // A short video becomes a box whose depth is time: the front face is the frame at the current slice, and the top and
  // side faces are slit-scans (each frame's edge row/column stacked along the depth). Our own take on the technique.
  // The clip is baked once, on import, into an atlas of small frames (one JPEG, left to right then down); the box's
  // shader reads that atlas as a volume - (u, v) inside a frame, t across frames - so every face shows the right slice.
  const TIMECUBE_DIRS = ["front", "back", "left", "right", "top", "bottom"];
  function validTimeCube(el) {
    if (el.type !== "timecube") return true;
    const c = el.timecube; if (!c || typeof c !== "object" || Array.isArray(c)) return false;
    const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi, num = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
    if (!int(c.cols, 1, 256) || !int(c.rows, 1, 256) || !int(c.frames, 2, 512) || c.cols * c.rows < c.frames) return false;
    if (!int(c.fw, 8, 1024) || !int(c.fh, 8, 1024) || !num(c.dur, 0.1, 60)) return false;
    if (c.dir != null && !TIMECUBE_DIRS.includes(c.dir)) return false;
    if (c.edges != null && typeof c.edges !== "boolean") return false;
    if (c.depth != null && !num(c.depth, 0.1, 3)) return false;
    if (c.fixed != null && typeof c.fixed !== "boolean") return false;
    return true;
  }
  // Bake a clip (its first maxDur seconds) into the frame atlas. Frames are long-side px on their long side, about
  // 24 per second, at most maxFrames, and the atlas stays within 4096 px (the phone texture limit).
  async function bakeTimeCube(blob, o = {}) {
    const maxDur = o.maxDur || 8, long = o.long || 256, maxFrames = o.maxFrames || 120;
    const url = URL.createObjectURL(blob), v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.setAttribute("playsinline", ""); v.preload = "auto";
    try {
      await new Promise((res, rej) => { const t = setTimeout(() => rej(Error("טעינת הסרטון לא הסתיימה")), 20000); v.onloadeddata = () => { clearTimeout(t); res(); }; v.onerror = () => { clearTimeout(t); rej(Error("הדפדפן לא הצליח לקרוא את הסרטון")); }; v.src = url; v.load(); });
      try { await v.play(); } catch (e) {} v.pause(); // iPhone: a clip that never played can hand back black frames on seek
      const dur = Math.min(maxDur, v.duration || 0);
      if (!(dur >= 0.3) || !v.videoWidth || !v.videoHeight) throw Error("הסרטון קצר מדי או לא קריא");
      const aspect = v.videoWidth / v.videoHeight;
      const fw = aspect >= 1 ? long : Math.max(16, Math.round(long * aspect)), fh = aspect >= 1 ? Math.max(16, Math.round(long / aspect)) : long;
      const cols = Math.max(1, Math.floor(4096 / fw));
      const frames = Math.max(2, Math.min(maxFrames, Math.round(dur * 24), cols * Math.floor(4096 / fh)));
      const rows = Math.ceil(frames / cols);
      const cv = document.createElement("canvas"); cv.width = cols * fw; cv.height = rows * fh;
      const g = cv.getContext("2d");
      const seek = (t) => new Promise((res) => { let done = false; const fin = () => { if (done) return; done = true; v.removeEventListener("seeked", fin); requestAnimationFrame(() => res()); }; v.addEventListener("seeked", fin); setTimeout(fin, 3000); v.currentTime = t; });
      for (let i = 0; i < frames; i++) {
        await seek((i + 0.5) * dur / frames);
        g.drawImage(v, (i % cols) * fw, Math.floor(i / cols) * fh, fw, fh);
        if (o.onProgress) o.onProgress((i + 1) / frames);
      }
      const out = await new Promise((res) => cv.toBlob(res, "image/jpeg", 0.85));
      if (!out) throw Error("שמירת הקובייה נכשלה");
      return { blob: out, aspect: fw / fh, meta: { cols, rows, frames, fw, fh, dur: Math.round(dur * 1000) / 1000 }, trimmed: (v.duration || 0) > maxDur + 0.05 };
    } finally { v.removeAttribute("src"); v.load(); URL.revokeObjectURL(url); }
  }
  // The box: one mesh, cut down to the part of the volume that is still there. The cut moves through the volume once
  // per `period` seconds (the clip's own length, so the front face plays at real speed) along `dir`; `edges` draws
  // light box edges. The back face rests on the layer plane, like a seated 3D model.
  function ensureTimeCubeComponent() {
    if (!window.AFRAME || AFRAME.components["time-cube"]) return;
    const VS = "uniform vec3 vMin; uniform vec3 vMax; varying vec3 vL; varying vec3 vQ; varying vec3 vN;\n" +
      "void main(){ vL = position + 0.5; vQ = vec3(mix(vMin.xy, vMax.xy, vL.xy), mix(vMax.z, vMin.z, vL.z)); vN = normal;\n" +
      "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
    const FS = "uniform sampler2D atlas; uniform vec2 grid; uniform float frames; uniform vec2 tileTexel; uniform vec3 ew; uniform float edges; uniform float flow; uniform vec3 shift;\n" +
      "varying vec3 vL; varying vec3 vQ; varying vec3 vN;\n" +
      "vec3 tile(float i, vec2 uv){ float c = mod(i, grid.x), r = floor(i / grid.x); uv = clamp(uv, tileTexel * 0.5, 1.0 - tileTexel * 0.5);\n" +
      "  return texture2D(atlas, vec2((c + uv.x) / grid.x, 1.0 - (r + 1.0 - uv.y) / grid.y)).rgb; }\n" +
      "void main(){ vec3 q = flow > 0.5 ? fract(vQ + shift) : vQ;\n" + // fixed size: the volume flows through a whole box
      "  float f = clamp(q.z, 0.0, 1.0) * (frames - 1.0), i0 = floor(f);\n" +
      "  vec3 col = mix(tile(i0, q.xy), tile(min(i0 + 1.0, frames - 1.0), q.xy), f - i0);\n" +
      "  col *= 0.86 + 0.14 * abs(vN.z);\n" + // the cut face full bright, the slit-scan sides a touch darker: reads as a box
      "  vec3 d = min(vL, 1.0 - vL); float n = step(d.x, ew.x) + step(d.y, ew.y) + step(d.z, ew.z);\n" +
      "  if (edges > 0.5 && n >= 2.0) col = mix(col, vec3(1.0), 0.8);\n" +
      "  gl_FragColor = vec4(col, 1.0); }";
    AFRAME.registerComponent("time-cube", {
      schema: { src: { type: "string" }, cols: { type: "int", default: 1 }, rows: { type: "int", default: 1 }, frames: { type: "int", default: 2 },
        fw: { type: "int", default: 256 }, fh: { type: "int", default: 144 }, width: { default: 0.4 }, height: { default: 0.3 }, depth: { default: 0.3 },
        dir: { default: "front" }, edges: { default: true }, fixed: { default: false }, period: { default: 5 } },
      init() {
        this.mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: {
          atlas: { value: null }, grid: { value: new THREE.Vector2(1, 1) }, frames: { value: 2 }, tileTexel: { value: new THREE.Vector2(1 / 256, 1 / 144) },
          vMin: { value: new THREE.Vector3(0, 0, 0) }, vMax: { value: new THREE.Vector3(1, 1, 1) }, ew: { value: new THREE.Vector3(0.01, 0.01, 0.01) }, edges: { value: 1 },
          flow: { value: 0 }, shift: { value: new THREE.Vector3(0, 0, 0) } } });
        this.mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.mat);
        this.mesh.visible = false; // until the frames are in
        this.el.setObject3D("mesh", this.mesh);
        this.t0 = null;
      },
      update(old) {
        const d = this.data, u = this.mat.uniforms;
        u.grid.value.set(d.cols, d.rows); u.frames.value = d.frames; u.tileTexel.value.set(1 / d.fw, 1 / d.fh); u.edges.value = d.edges ? 1 : 0; u.flow.value = d.fixed ? 1 : 0;
        if (d.src && d.src !== old.src) {
          new THREE.TextureLoader().load(d.src, (tex) => {
            if (this.data.src !== d.src) { tex.dispose(); return; }
            tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false; // no mipmaps: they would bleed one frame into the next
            tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
            if (u.atlas.value) u.atlas.value.dispose();
            u.atlas.value = tex; this.mesh.visible = true;
            this.el.emit("timecube-loaded", {}, false);
          }, undefined, () => this.el.emit("timecube-error", {}, false));
        }
        this.place(0);
      },
      // s: how much of the volume is cut away along the slice direction (0..0.97)
      place(s) {
        const d = this.data, mn = [0, 0, 0], mx = [1, 1, 1];
        ({ front: () => { mn[2] = s; }, back: () => { mx[2] = 1 - s; }, left: () => { mn[0] = s; }, right: () => { mx[0] = 1 - s; }, top: () => { mx[1] = 1 - s; }, bottom: () => { mn[1] = s; } }[d.dir] || (() => {}))();
        const u = this.mat.uniforms; u.vMin.value.set(mn[0], mn[1], mn[2]); u.vMax.value.set(mx[0], mx[1], mx[2]);
        const sx = d.width * (mx[0] - mn[0]), sy = d.height * (mx[1] - mn[1]), sz = d.depth * (mx[2] - mn[2]);
        this.mesh.scale.set(sx, sy, sz);
        // volume (u, v, t) -> box space: x, y centred on the layer; t = 0 at the front (z = depth), t = 1 on the plane (z = 0)
        this.mesh.position.set(((mn[0] + mx[0]) / 2 - 0.5) * d.width, ((mn[1] + mx[1]) / 2 - 0.5) * d.height, (1 - (mn[2] + mx[2]) / 2) * d.depth);
        const e = 0.012 * Math.min(d.width, d.height); // edge line width: the same on every face
        u.ew.value.set(e / Math.max(sx, 1e-4), e / Math.max(sy, 1e-4), e / Math.max(sz, 1e-4));
        this.cut = s;
      },
      tick(t) {
        if (this.t0 == null) this.t0 = t;
        const p = Math.max(0.5, this.data.period), ph = (((t - this.t0) / 1000) % p) / p;
        if (!this.data.fixed) { this.place(ph * 0.97); return; }
        // fixed size: the box stays whole and the clip flows through it, the way the cut would move (one pass per period)
        if (this.cut !== 0) this.place(0);
        const v = { front: [0, 0, ph], back: [0, 0, -ph], left: [ph, 0, 0], right: [-ph, 0, 0], bottom: [0, ph, 0], top: [0, -ph, 0] }[this.data.dir] || [0, 0, ph];
        this.mat.uniforms.shift.value.set(v[0], v[1], v[2]);
      },
      remove() { this.el.removeObject3D("mesh"); this.mesh.geometry.dispose(); if (this.mat.uniforms.atlas.value) this.mat.uniforms.atlas.value.dispose(); this.mat.dispose(); }
    });
  }
  function validParticles(el){const p=el.particles;if(!p)return true;if(typeof p!=='object'||Array.isArray(p))return false;for(const [k,min,max]of [['lifetime',0,60],['endSize',0,5],['count',10,500],['size',2,60],['speed',.2,3]])if(p[k]!=null&&(!Number.isFinite(p[k])||p[k]<min||p[k]>max))return false;if(p.emitter!=null&&!['box','disc','sphere'].includes(p.emitter))return false;if(p.direction!=null&&(!Number.isInteger(p.direction)||p.direction<-3||p.direction>359))return false;if(p.spread!=null&&(!Number.isFinite(p.spread)||p.spread<.1||p.spread>2))return false;if(p.endColor!=null&&!/^#[0-9a-f]{6}$/i.test(p.endColor))return false;if(p.life2!=null&&(!Number.isFinite(p.life2)||p.life2<0||p.life2>60))return false;if(p.color2!=null&&p.color2!==''&&!/^#[0-9a-f]{6}$/i.test(p.color2))return false;if(p.fade!=null&&typeof p.fade!=='boolean')return false;return true;}
  function validCrop(el){const c=el.crop;return !c||['image','video'].includes(el.type)&&['x','y','w','h'].every(k=>Number.isFinite(c[k]))&&c.x>=0&&c.y>=0&&c.w>=.01&&c.h>=.01&&c.x+c.w<=1.000001&&c.y+c.h<=1.000001;}
  function setImageCrop(rec,el,crop){
    const old=el.crop||{x:0,y:0,w:1,h:1};const sourceAspect=(el.aspect||1)/(old.w/old.h);
    el.crop={...crop};el.aspect=sourceAspect*crop.w/crop.h;el.h=el.w/el.aspect*geom(rec).artW/geom(rec).artH;
  }
  // ---------- round A: element defaults + text textures ----------
  // Backward-compatible normalization: records saved before round A lack these fields.
  function normEl(el) {
    if (el.opacity == null) el.opacity = 1;
    if (el.seq === undefined) el.seq = null; // null = visible in every sequence state
    if (el.anim == null) el.anim = el.spin ? "spin" : "none";
    if (el.onTap == null) el.onTap = "none";
    if (el.track === undefined) el.track = null; // null = shared state model; id = a parallel overlay track
    if (el.type === "group") {
      if (!Array.isArray(el.children)) el.children = [];
    }
    if (el.type === "text") {
      if (el.text == null) el.text = "כותרת";
      if (!el.color) el.color = "#ffffff";
      if (el.bold == null) el.bold = true;
    }
    if (el.type === "pattern" && !el.pattern) el.pattern = patternDefaults();
    return el;
  }
  const ANIMS = ["none", "spin", "float", "pulse"];

  // ---------- text fonts ----------
  // Hebrew fonts a text layer can use (SIL Open Font License 1.1, from Google Fonts; files and licences in fonts/,
  // see fonts/README.md): [id, Hebrew name, [[file stem, weight or weight range]...]]. Each stem is two files, the
  // Hebrew letters and the Latin ones (digits, English, punctuation). They are registered under their own family names
  // ("BA <id>"), so a font installed on the device never stands in, and a file is fetched only when a layer's text
  // needs it. Single-weight fonts claim 400-700 so bold text uses the drawn face instead of a smeared fake bold.
  const FONTS = [
    ["heebo", "היבו", [["heebo", "400 800"]]], ["rubik", "רוביק", [["rubik", "400 800"]]],
    ["frank", "פרנק רוהל", [["frank", "400 900"]]], ["david", "דוד", [["david-400", "400"], ["david-700", "700"]]],
    ["secular", "סקולר", [["secular", "400 700"]]], ["suez", "סואץ", [["suez", "400 700"]]],
    ["karantina", "קרנטינה", [["karantina-400", "400"], ["karantina-700", "700"]]],
    ["amatic", "אמטיק", [["amatic-400", "400"], ["amatic-700", "700"]]], ["playpen", "פלייפן", [["playpen", "400 800"]]],
    ["solitreo", "סוליטריאו", [["solitreo", "400 700"]]], ["bellefair", "בלפייר", [["bellefair", "400 700"]]]
  ];
  const FONT_IDS = new Set(FONTS.map((f) => f[0]));
  const FONT_RANGES = { hebrew: "U+0307-0308, U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F",
    latin: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" };
  const FONT_BASE = new URL("fonts/", (document.currentScript && document.currentScript.src) || location.href).href;
  const DEVICE_FONT = '-apple-system, "Segoe UI", Arial, sans-serif';
  const CUT_FONTS = ["heebo", "rubik", "frank", "david", "secular", "suez", "karantina", "amatic", "bellefair"]; // mixed by the cut-letters style (not the big Playpen files)
  let fontsAdded = false;
  function addFonts() {
    if (fontsAdded || typeof FontFace === "undefined" || !document.fonts) return;
    fontsAdded = true;
    for (const [id, , faces] of FONTS) for (const [stem, weight] of faces) for (const sub of ["hebrew", "latin"])
      document.fonts.add(new FontFace("BA " + id, "url(" + FONT_BASE + stem + "-" + sub + ".woff2) format('woff2')", { weight, unicodeRange: FONT_RANGES[sub] }));
  }
  function fontStack(id) { return (FONT_IDS.has(id) ? '"BA ' + id + '", ' : "") + DEVICE_FONT; }
  // Resolves once the fonts a text layer's text needs have loaded (or failed to): true when one arrived just now, so
  // whatever was drawn before with the device font should be drawn (and measured) again.
  function loadTextFonts(el) {
    addFonts();
    const cut = el.textStyle === "cut", ids = cut ? CUT_FONTS : FONT_IDS.has(el.font) ? [el.font] : [];
    const text = String(el.text || "") || "א"; // spaces too: they come from the Latin file, and the canvas fetches it for them
    if (!ids.length || !document.fonts) return Promise.resolve(false);
    const need = ids.flatMap((id) => (cut ? ["400", "700"] : [el.bold ? "700" : "400"]).map((w) => w + " 32px " + fontStack(id)))
      .filter((f) => { try { return !document.fonts.check(f, text); } catch (e) { return false; } });
    if (!need.length) return Promise.resolve(false);
    return Promise.all(need.map((f) => document.fonts.load(f, text).catch(() => []))).then((got) => got.some((faces) => faces.length > 0));
  }

  // "Cut letters": every letter on its own scrap of paper, as if cut from a different newspaper or magazine, with its
  // own font, size, paper and ink, a slight tilt and uneven edges. The look comes from the layer id and el.cutSeed (the
  // panel's shuffle button changes the seed), so it is the same on every device and every redraw.
  const CUT_PAPERS = [["#f4f1e8", "#111111"], ["#f4f1e8", "#c8102e"], ["#efe3c2", "#1a1a1a"], ["#c9a66b", "#1a1a1a"], ["#161616", "#ffffff"],
    ["#161616", "#f5c518"], ["#d7262e", "#ffffff"], ["#f5c518", "#111111"], ["#1f5fbf", "#ffffff"], ["#f08bb1", "#161616"],
    ["#3d9a5b", "#ffffff"], ["#ffffff", "#1f5fbf"], ["#2bb3b1", "#111111"], ["#e8e8e8", "#7a1fa2"]];
  function seededRandom(str) { // FNV-1a of the string, then mulberry32
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return () => { h = (h + 0x6D2B79F5) | 0; let t = Math.imul(h ^ (h >>> 15), h | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // The letters of one line in the order they stand from left to right: Hebrew right to left, with Latin words and
  // numbers left to right inside it (enough of the Unicode bidi rules for a title); brackets in Hebrew are mirrored.
  const MIRRORED = { "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{", "<": ">", ">": "<" };
  function visualLetters(line) {
    const chars = typeof Intl !== "undefined" && Intl.Segmenter ? Array.from(new Intl.Segmenter("he", { granularity: "grapheme" }).segment(line), (s) => s.segment) : Array.from(line);
    const kind = chars.map((ch) => /[\u0590-\u05FF\uFB1D-\uFB4F]/.test(ch) ? "R" : /[\p{L}\p{N}]/u.test(ch) ? "L" : "N");
    const base = kind.find((k) => k !== "N") || "R";
    const near = (i, step) => { for (let j = i + step; j >= 0 && j < kind.length; j += step) if (kind[j] !== "N") return kind[j]; return null; };
    // a bracket pair goes with what it holds: the line's direction if that is inside, else the other one when the
    // text before it runs that way too ("AR (2026)" in a Hebrew line keeps its brackets with the English)
    const open = [];
    chars.forEach((ch, i) => {
      if ("([{".includes(ch)) open.push(i);
      else if (")]}".includes(ch) && open.length && "([{".indexOf(chars[open[open.length - 1]]) === ")]}".indexOf(ch)) {
        const o = open.pop(), inside = kind.slice(o + 1, i), other = base === "R" ? "L" : "R";
        const d = inside.includes(base) ? base : inside.includes(other) ? ((near(o, -1) || base) === other ? other : base) : null;
        if (d) kind[o] = kind[i] = d;
      }
    });
    const runs = [];
    kind.forEach((k, i) => {
      const d = k !== "N" ? k : near(i, -1) && near(i, -1) === near(i, 1) ? near(i, 1) : base; // a space or mark between two letters of one direction joins them
      const last = runs[runs.length - 1];
      if (last && last.d === d) last.c.push(chars[i]); else runs.push({ d, c: [chars[i]] });
    });
    if (base === "R") runs.reverse();
    return runs.flatMap((r) => r.d === "R" ? r.c.slice().reverse().map((ch) => MIRRORED[ch] || ch) : r.c);
  }
  function drawCutLetters(el, fontPx) {
    const rnd = seededRandom(String(el.id || "") + ":" + (Math.floor(el.cutSeed) || 0));
    const m = document.createElement("canvas").getContext("2d");
    const lines = String(el.text || "").split("\n").map((line) => visualLetters(line).map((ch) => {
      if (!ch.trim()) return { space: true, w: fontPx * 0.32 };
      const size = Math.round(fontPx * (0.82 + rnd() * 0.36)), id = CUT_FONTS[Math.floor(rnd() * CUT_FONTS.length)];
      const font = (rnd() < 0.6 ? "700" : "400") + " " + size + "px " + fontStack(id);
      m.font = font;
      const mt = m.measureText(ch), asc = mt.actualBoundingBoxAscent || size * 0.72, desc = mt.actualBoundingBoxDescent || 0;
      const left = mt.actualBoundingBoxLeft || 0, right = mt.actualBoundingBoxRight || mt.width;
      const gw = Math.max(left + right, size * 0.3), gh = Math.max(asc + desc, size * 0.5);
      const padX = size * (0.1 + rnd() * 0.1), padY = size * (0.08 + rnd() * 0.1), [paper, ink] = CUT_PAPERS[Math.floor(rnd() * CUT_PAPERS.length)];
      return { ch, font, left, right, asc, desc, paper, ink, w: gw + padX * 2, h: gh + padY * 2, rot: (rnd() - 0.5) * 0.24, dy: (rnd() - 0.5) * size * 0.14,
        corners: Array.from({ length: 8 }, () => (rnd() - 0.5) * size * 0.12) };
    }));
    const gap = fontPx * 0.05, lineH = fontPx * 1.5, pad = Math.round(fontPx * 0.4);
    const widths = lines.map((l) => l.reduce((s, p, i) => s + p.w + (i ? gap : 0), 0));
    const c = document.createElement("canvas"), ctx = c.getContext("2d");
    c.width = Math.ceil(Math.max(1, ...widths) + pad * 2);
    c.height = Math.ceil(lines.length * lineH + pad * 2);
    lines.forEach((l, li) => {
      let x = (c.width - widths[li]) / 2;
      const cy = pad + lineH * (li + 0.5);
      for (const p of l) {
        if (!p.space) {
          const hw = p.w / 2, hh = p.h / 2, k = p.corners;
          ctx.save(); ctx.translate(x + hw, cy + p.dy); ctx.rotate(p.rot);
          ctx.beginPath(); ctx.moveTo(-hw + k[0], -hh + k[1]); ctx.lineTo(hw + k[2], -hh + k[3]); ctx.lineTo(hw + k[4], hh + k[5]); ctx.lineTo(-hw + k[6], hh + k[7]); ctx.closePath();
          ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = fontPx * 0.06; ctx.shadowOffsetY = fontPx * 0.03;
          ctx.fillStyle = p.paper; ctx.fill();
          ctx.shadowColor = "transparent"; ctx.font = p.font; ctx.fillStyle = p.ink; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
          ctx.fillText(p.ch, (p.left - p.right) / 2, (p.asc - p.desc) / 2); // the letter's inked box centred on its scrap
          ctx.restore();
        }
        x += p.w + gap;
      }
    });
    return { canvas: c, aspect: c.width / c.height };
  }

  // Draw a text element to an offscreen canvas (used by editor panel preview and player texture).
  // fontPx: reference font size in canvas pixels. Returns {canvas, aspect}.
  function drawTextCanvas(el, fontPx) {
    if (el.textStyle === "cut") return drawCutLetters(el, fontPx);
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    const weight = el.bold ? "700" : "400";
    const font = weight + " " + fontPx + "px " + fontStack(el.font);
    ctx.font = font;
    const lines = String(el.text || "").split("\n");
    const wMax = Math.max(1, ...lines.map((l) => ctx.measureText(l).width));
    const pad = Math.round(fontPx * 0.25);
    // resizing the canvas resets its context state, so re-apply the font explicitly
    c.width = Math.ceil(wMax + pad * 2);
    c.height = Math.ceil(lines.length * fontPx * 1.25 + pad * 2);
    ctx.font = font; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = Math.round(fontPx * 0.12);
    ctx.fillStyle = el.color || "#ffffff";
    lines.forEach((l, i) => ctx.fillText(l, c.width / 2, pad + fontPx * 1.25 * (i + 0.5)));
    return { canvas: c, aspect: c.width / c.height };
  }


  // Group children are stored in artwork/world coordinates. Bake creator edits into
  // children, then inverse the group's base rotation when constructing local wrappers.
  function transformGroup(rec, group, changes) {
    const before = { x: group.x || 0, y: group.y || 0, z: group.z || 0, w: group.w || 1, rot: group.rot || 0 };
    const after = Object.assign({}, before, changes);
    const factor = after.w / before.w;
    const angle = (after.rot - before.rot) * Math.PI / 180;
    const ratio = geom(rec).artW / geom(rec).artH;
    const point = (x, y) => {
      const dx = (x - before.x) * ratio * factor, dy = (y - before.y) * factor;
      return { x: after.x + (dx * Math.cos(angle) - dy * Math.sin(angle)) / ratio,
        y: after.y + dx * Math.sin(angle) + dy * Math.cos(angle) };
    };
    const mapTimeline = el => {
      const tl = el.timeline;
      if (!tl || !tl.keys || !tl.keys.length) return;
      const a = factor * Math.cos(angle), b = -factor * Math.sin(angle) / ratio;
      const c = factor * Math.sin(angle) * ratio, d = factor * Math.cos(angle);
      const tx = after.x - a * before.x - b * before.y, ty = after.y - c * before.x - d * before.y;
      const old = tl.xyMap || { baseX: el.x || 0, baseY: el.y || 0, matrix: [1,0,0,1,0,0] };
      const [A,B,C,D,X,Y] = old.matrix;
      // Preserve the original per-axis curves and compose an affine output map.
      // No resampling: sparse nonlinear easing stays exact at every time.
      tl.xyMap = { baseX: old.baseX, baseY: old.baseY, matrix: [a*A+b*C,a*B+b*D,c*A+d*C,c*B+d*D,a*X+b*Y+tx,c*X+d*Y+ty] };
      tl.keys.forEach(k => { if(k.z != null) k.z += after.z-before.z; if(k.rot != null) k.rot += after.rot-before.rot; });
    };
    for (const child of groupChildren(rec, group)) {
      normEl(child);
      mapTimeline(child);
      Object.assign(child, point(child.x || 0, child.y || 0));
      child.z = (child.z || 0) + after.z - before.z;
      if (child.w != null) child.w *= factor; if (child.h != null) child.h *= factor;
      child.rot = (child.rot || 0) + after.rot - before.rot;
    }
    mapTimeline(group);
    if (group.h != null && changes.w != null) group.h *= factor;
    Object.assign(group, changes);
  }

  // ---------- scatter along a path ("פיזור על נתיב") ----------
  // A scatter layer spreads copies of one look along a line in 3D. el.scatter = {item, points, curved, count, spacing,
  // size, amount, facing}: item is a snapshot of the source layer's look (its file is the scatter's own el.assetId,
  // the same stored file, not a copy); points are 2 or more {x, y, z} relative to the layer's own x, y, z (x, y in
  // artwork units, z in depth units, like any layer), so moving, turning, sizing and animating the layer act on the whole
  // line the way they do on a group. The copies are computed here, at draw time, by scatterCopies - the one answer the
  // flat editor, the 3D editor, the preview and the camera all use.
  const SCATTER_TYPES = ["image", "video", "text", "model"];
  const SCATTER_MAX = { image: 60, text: 60, video: 16, model: 12 }; // fewer for videos and models: a phone draws each one
  const SCATTER_SPACING = ["even", "grow", "shrink"], SCATTER_SIZE = ["constant", "grow", "shrink"], SCATTER_FACING = ["keep", "follow"];
  const SCATTER_DROP = ["id", "name", "x", "y", "z", "timeline", "seq", "track", "onTap", "tapUrl", "anim", "spin", "locked", "assetId", "children", "flush", "scatter", "spatial", "spatialMode", "spatialInner", "spatialOuter", "_ownerId"];
  const mediaType = (el) => (el && el.type === "scatter" ? (el.scatter && el.scatter.item && el.scatter.item.type) || "" : el && el.type);
  function scatterItem(src) { const it = structuredClone(src); for (const k of SCATTER_DROP) delete it[k]; return it; }
  function scatterLimit(el) { return SCATTER_MAX[mediaType(el)] || 60; }
  // The line in world units relative to the layer: the points themselves (straight), or a smooth curve through them
  // (centripetal Catmull-Rom, which never loops or overshoots at sharp turns).
  function scatterPath(rec, sc) {
    const g = geom(rec), P = (sc.points || []).map((p) => [(p.x || 0) * g.artW, (p.y || 0) * g.artH, p.z || 0]);
    if (!sc.curved || P.length < 3) return P;
    const out = [], d = (a, b) => Math.pow(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) || 1e-6, 0.5);
    const ext = [P[0].map((v, i) => 2 * v - P[1][i]), ...P, P[P.length - 1].map((v, i) => 2 * v - P[P.length - 2][i])];
    for (let s = 1; s < ext.length - 2; s++) {
      const [p0, p1, p2, p3] = [ext[s - 1], ext[s], ext[s + 1], ext[s + 2]];
      const t1 = d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
      for (let j = 0; j < 16; j++) {
        const t = t1 + (t2 - t1) * j / 16, L = (a, b, ta, tb) => a.map((v, i) => (tb - t) / (tb - ta) * v + (t - ta) / (tb - ta) * b[i]);
        const a1 = L(p0, p1, 0, t1), a2 = L(p1, p2, t1, t2), a3 = L(p2, p3, t2, t3);
        out.push(L(L(a1, a2, 0, t2), L(a2, a3, t1, t3), t1, t2));
      }
    }
    out.push(P[P.length - 1]);
    return out;
  }
  // The copies: [{i, x, y, z, k, rot, rank}] - x, y in artwork units and z in depth units relative to the layer, k the
  // size against the item, rot its turn in the picture's plane, rank the drawing order (farthest from the viewer first).
  function scatterCopies(rec, el) {
    const sc = el.scatter, it = sc && sc.item;
    if (!it || !Array.isArray(sc.points) || sc.points.length < 2) return [];
    const g = geom(rec), n = Math.max(1, Math.min(scatterLimit(el), Math.round(sc.count) || 1)), path = scatterPath(rec, sc);
    const cum = [0]; for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], path[i][2] - path[i - 1][2]));
    const total = cum[cum.length - 1], amount = Math.max(1, Math.min(6, sc.amount || 2)), out = [];
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0 : i / (n - 1), t = sc.spacing === "grow" ? Math.pow(u, 1.8) : sc.spacing === "shrink" ? 1 - Math.pow(1 - u, 1.8) : u;
      const want = t * total; let j = 1; while (j < path.length - 1 && cum[j] < want) j++;
      const a = path[j - 1] || path[0], b = path[j] || a, f = cum[j] - cum[j - 1] > 1e-9 ? (want - cum[j - 1]) / (cum[j] - cum[j - 1]) : 0;
      const pos = a.map((v, q) => v + (b[q] - v) * Math.max(0, Math.min(1, f)));
      const k = sc.size === "grow" ? 1 + (amount - 1) * u : sc.size === "shrink" ? 1 + (1 / amount - 1) * u : 1;
      const turn = sc.facing === "follow" && Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-9 ? Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI : 0;
      out.push({ i, x: pos[0] / g.artW, y: pos[1] / g.artH, z: pos[2], k, rot: (it.rot || 0) + turn });
    }
    out.slice().sort((p, q) => p.z - q.z || p.i - q.i).forEach((c, r) => { c.rank = r; });
    return out;
  }
  // One copy as an ordinary layer, placed in the scatter's own (unturned) frame: everything that draws a layer draws it.
  function scatterCopyEl(el, c) {
    const it = el.scatter.item;
    return Object.assign({}, it, { id: el.id + "~" + c.i, assetId: el.assetId, x: (el.x || 0) + c.x, y: (el.y || 0) + c.y, z: (el.z || 0) + c.z,
      w: (it.w || 0.3) * c.k, h: it.h != null ? it.h * c.k : null, rot: c.rot, flush: el.flush !== false, seq: null, _ownerId: el.id });
  }
  // The box around the copies (artwork units, in the layer's frame) - what the flat editor selects and shows.
  function scatterBounds(rec, el) {
    const it = el.scatter.item, r = geom(rec).artW / geom(rec).artH, ih = it.h != null ? it.h : (it.w || 0.3) / (it.aspect || 1) * r;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const add = (x, y, hw, hh) => { x0 = Math.min(x0, x - hw); x1 = Math.max(x1, x + hw); y0 = Math.min(y0, y - hh); y1 = Math.max(y1, y + hh); };
    for (const c of scatterCopies(rec, el)) add(c.x, c.y, (it.w || 0.3) * c.k / 2, ih * c.k / 2);
    for (const p of el.scatter.points) add(p.x || 0, p.y || 0, 0, 0);
    if (!(x1 >= x0)) return { cx: 0, cy: 0, w: 0.1, h: 0.1 };
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: Math.max(0.02, x1 - x0), h: Math.max(0.02, y1 - y0) };
  }
  // After any change to the line or the copies: the layer's w/h follow the copies, and (when nothing keyed depends on
  // the layer's place) its own x, y move to the middle of them, so its box, handles and turning point sit on the copies.
  function refreshScatter(rec, el, recenter) {
    const b = scatterBounds(rec, el), g = geom(rec), r = g.artW / g.artH;
    const keyed = el.timeline && Array.isArray(el.timeline.keys) && el.timeline.keys.length;
    if (recenter && !keyed && (Math.abs(b.cx) > 1e-4 || Math.abs(b.cy) > 1e-4)) {
      const a = (el.rot || 0) * Math.PI / 180, dx = b.cx * r, dy = b.cy;
      el.x = (el.x || 0) + (dx * Math.cos(a) - dy * Math.sin(a)) / r; el.y = (el.y || 0) + dx * Math.sin(a) + dy * Math.cos(a);
      for (const p of el.scatter.points) { p.x = (p.x || 0) - b.cx; p.y = (p.y || 0) - b.cy; }
      b.cx = b.cy = 0;
    }
    el.w = Math.round(b.w * 10000) / 10000; el.h = Math.round(b.h * 10000) / 10000; el.aspect = (el.w * g.artW) / (el.h * g.artH);
    return el;
  }
  // A new scatter from a layer and a drawn line (absolute artwork points; z 0 = on the picture).
  function makeScatter(rec, src, pts, opts) {
    const o = opts || {};
    const it = scatterItem(src), x = pts.reduce((n, p) => n + p.x, 0) / pts.length, y = pts.reduce((n, p) => n + p.y, 0) / pts.length;
    const el = { id: newId(), type: "scatter", name: "פיזור: " + (src.name || ""), x, y, z: 0, rot: 0, opacity: 1, flush: true, seq: null, assetId: src.assetId,
      scatter: { item: it, points: pts.map((p) => ({ x: p.x - x, y: p.y - y, z: p.z || 0 })), curved: o.curved !== false, count: Math.min(o.count || 12, SCATTER_MAX[it.type] || 60), spacing: "even", size: "constant", amount: 2, facing: "keep" } };
    if (!el.assetId) delete el.assetId;
    return refreshScatter(rec, el, true);
  }
  // Size the whole scatter by k around its own place: the line and the copies together.
  function scaleScatter(rec, el, k, from) {
    const sc = from || el.scatter;
    el.scatter = Object.assign({}, sc, { points: sc.points.map((p) => ({ x: p.x * k, y: p.y * k, z: (p.z || 0) * k })), item: Object.assign({}, sc.item, { w: (sc.item.w || 0.3) * k }, sc.item.h != null ? { h: sc.item.h * k } : {}) });
    return refreshScatter(rec, el, false);
  }
  // "להפריד לשכבות": the copies become ordinary layers in a group that takes over the scatter's place, motion and taps.
  function breakScatter(rec, el) {
    const g = geom(rec), r = g.artW / g.artH, a = (el.rot || 0) * Math.PI / 180, it = el.scatter.item;
    const copies = scatterCopies(rec, el).sort((p, q) => p.rank - q.rank);
    const kids = copies.map((c, n) => {
      const k = scatterCopyEl(el, c), dx = c.x * r, dy = c.y;
      delete k._ownerId;
      return Object.assign(k, { id: newId(), name: (el.name || "פיזור").replace(/^פיזור: /, "") + " " + (n + 1), x: (el.x || 0) + (dx * Math.cos(a) - dy * Math.sin(a)) / r, y: (el.y || 0) + dx * Math.sin(a) + dy * Math.cos(a), rot: c.rot + (el.rot || 0), opacity: it.opacity == null ? 1 : it.opacity });
    });
    const group = { id: newId(), type: "group", name: el.name || "פיזור", children: kids.map((k) => k.id), x: el.x || 0, y: el.y || 0, z: el.z || 0, w: el.w, h: el.h, rot: el.rot || 0, opacity: el.opacity == null ? 1 : el.opacity, flush: true };
    for (const f of ["timeline", "anim", "seq", "track", "onTap", "tapUrl", "rotX", "rotY"]) if (el[f] != null) group[f] = structuredClone(el[f]);
    const at = rec.elements.indexOf(el);
    rec.elements.splice(at, 1, ...kids, group);
    for (const q of ActionCore.list(rec)) for (const act of q.actions) if (act.layerId === el.id) act.layerId = group.id;
    return group;
  }
  function validScatter(el) {
    if (el.type !== "scatter") return el.scatter == null;
    const sc = el.scatter; if (!sc || typeof sc !== "object" || Array.isArray(sc)) return false;
    const it = sc.item; if (!it || typeof it !== "object" || Array.isArray(it) || !SCATTER_TYPES.includes(it.type) || it.scatter != null) return false;
    for (const key of ["w", "h", "rot", "rotX", "rotY", "opacity", "aspect", "stillAt"]) if (it[key] != null && !Number.isFinite(it[key])) return false;
    if (!validCrop(it) || !validFx(it) || !validChroma(it) || !validParticles(it)) return false;
    if (["image", "video", "model"].includes(it.type) && !el.assetId) return false;
    if (!Array.isArray(sc.points) || sc.points.length < 2 || sc.points.length > 64 || !sc.points.every((p) => p && ["x", "y", "z"].every((k) => p[k] == null || Number.isFinite(p[k]) && Math.abs(p[k]) <= 10))) return false;
    if (!Number.isFinite(sc.count) || sc.count < 1 || sc.count > 60 || !Number.isFinite(sc.amount) || sc.amount < 1 || sc.amount > 6) return false;
    return typeof sc.curved === "boolean" && SCATTER_SPACING.includes(sc.spacing) && SCATTER_SIZE.includes(sc.size) && SCATTER_FACING.includes(sc.facing);
  }
  // The 3D side: models are built one entity per copy. Pictures, GIFs, videos and text are drawn from ONE hidden layer
  // (the "template", built by buildElementEntity like any layer, so crop, filters, colour removal and fades all apply):
  // every copy is a mesh that shares its geometry and material, so a video or GIF is decoded and uploaded once however
  // many copies show it. studio-scatter keeps the copies on the template's current geometry/material every frame.
  function ensureScatterComponent() {
    if (!window.AFRAME || AFRAME.components["studio-scatter"]) return;
    AFRAME.registerComponent("studio-scatter", {
      init() { this.copies = []; this.made = false; this.gifAt = 0; },
      tick(time) {
        const t = this.el._scatterTemplate; if (!t || !t.object3D) return;
        if (t.object3D.parent) t.object3D.parent.remove(t.object3D); // drawn only through its copies
        const m = t.getObject3D("mesh"); if (!m || !m.material) return;
        if (!this.made) {
          this.made = true;
          for (const c of this.el._scatterCopies || []) {
            const holder = new THREE.Group(), mesh = new THREE.Mesh(m.geometry, m.material);
            holder.position.set(c.px, c.py, c.pz); holder.rotation.order = "YXZ"; holder.rotation.set(c.rx, c.ry, c.rz); holder.scale.setScalar(c.k);
            holder.el = { _studioOpacity: c.op }; // the item's own opacity, picked up by applyOpacity on the way up
            mesh.renderOrder = c.ro; mesh.userData.scatterCopy = c.i;
            holder.add(mesh); this.el.object3D.add(holder); this.copies.push(mesh);
          }
          if (this.el._studioOpacity != null) applyOpacity(this.el, this.el._studioOpacity);
          this.el.emit("scatter-ready", { count: this.copies.length }, false);
        }
        for (const c of this.copies) { if (c.geometry !== m.geometry) c.geometry = m.geometry; if (c.material !== m.material) c.material = m.material; }
        const map = m.material.map; // an animated GIF is a canvas the pump repaints: send it again a few times a second
        if (map && map.image && map.image.tagName === "CANVAS" && time - this.gifAt > 40) { map.needsUpdate = true; this.gifAt = time; }
      },
      remove() { for (const c of this.copies) if (c.parent) c.parent.parent && c.parent.parent.remove(c.parent); this.copies = []; }
    });
  }
  function buildScatter(rec, el, wrap, idx, mode, opts) {
    const sc = el.scatter, it = sc && sc.item;
    if (!it || !SCATTER_TYPES.includes(it.type) || (it.type !== "text" && !(rec.assets && rec.assets[el.assetId]))) return;
    const g = geom(rec), ts = toTargetSpace(rec, el, el.aspect || 1), copies = scatterCopies(rec, el), D = Math.PI / 180;
    const sub = { origin: { x: ts.x, y: ts.y, z: ts.z || 0 }, baseRotation: 0, videoFallback: opts.videoFallback, mediaId: opts.mediaId };
    if (it.type === "model") {
      for (const c of copies) {
        const ce = buildElementEntity(rec, scatterCopyEl(el, c), idx + c.rank / 1000, mode, sub);
        if (!ce) continue;
        delete ce.dataset.elId; ce.dataset.scatterCopy = String(c.i);
        wrap.appendChild(ce); if (ce.dataset.opacity) applyOpacity(ce, parseFloat(ce.dataset.opacity));
      }
      return;
    }
    if (opts.videoFallback && it.type === "video" && opts.videoFallback(Object.assign({}, it, { assetId: el.assetId }))) return;
    ensureScatterComponent();
    // the template keeps the scatter's id, so it reads the scatter's own media node (#m-<id>), in the camera too
    const tpl = buildElementEntity(rec, Object.assign({}, it, { id: el.id, assetId: el.assetId, x: el.x || 0, y: el.y || 0, z: el.z || 0, rot: 0, rotX: 0, rotY: 0, flush: el.flush !== false, opacity: 1, seq: null }), idx, mode, sub);
    if (!tpl) return;
    delete tpl.dataset.elId; delete tpl.dataset.opacity; tpl.classList.remove("cantap"); tpl.dataset.scatterTemplate = "";
    wrap._scatterTemplate = tpl;
    wrap._scatterCopies = copies.map((c) => ({ i: c.i, px: c.x * g.artW, py: c.y * g.artH, pz: c.z, rx: (it.rotX || 0) * D, ry: (it.rotY || 0) * D, rz: c.rot * D, k: c.k,
      op: it.opacity == null ? 1 : it.opacity, ro: el.flush !== false ? 1 + idx + c.rank / 1000 : 0 }));
    wrap.appendChild(tpl);
    wrap.setAttribute("studio-scatter", "");
  }

  // ---------- round A: shared entity factory for player + preview ----------
  // mode 'ar': video uses the device-proven xrextras-target-video-fade; 'preview': plain a-video.
  // One object URL per blob: model files load through three.js's file cache, which keeps a copy per URL, so a fresh
  // URL on every rebuild kept another copy of every model each time the editor rebuilt its layers (an iPhone ran out
  // of memory: models stayed placeholders or the 3D layer was wiped). releaseBlobURL drops the URL and its cached copy.
  const blobUrls = new Map();
  function blobURL(b) { let u = blobUrls.get(b); if (!u) { u = URL.createObjectURL(b); blobUrls.set(b, u); } return u; }
  function releaseBlobURL(b) { const u = blobUrls.get(b); if (!u) return; blobUrls.delete(b); try { if (window.THREE && THREE.Cache) THREE.Cache.remove(u); URL.revokeObjectURL(u); } catch (e) {} }
  function blobURLs() { return new Map(blobUrls); }
  function buildElementEntity(rec, el, idx, mode, opts) {
    opts = opts || {};
    const mediaRef = (e2) => "#" + (opts.mediaId ? opts.mediaId(e2) : "m-" + e2.id);
    normEl(el);
    const ts = toTargetSpace(rec, el, el.aspect || 1);
    const ox = opts.origin ? opts.origin.x : 0, oy = opts.origin ? opts.origin.y : 0, oz = opts.origin ? opts.origin.z : 0;
    const tie = el.flush ? 0 : idx * 0.001; // legacy layers: array order breaks z ties by a tiny depth offset. Flush layers (new elements) use NO depth offset: they sit exactly at their z and are ordered by renderOrder instead.
    const z = (ts.z || 0) + tie;
    const angle = -(opts.baseRotation || 0) * Math.PI / 180;
    const dx = ts.x - ox, dy = ts.y - oy;
    const pos = `${dx * Math.cos(angle) - dy * Math.sin(angle)} ${dx * Math.sin(angle) + dy * Math.cos(angle)} ${z - oz}`;
    const rot = `${el.rotX||0} ${el.rotY||0} ${(el.rot || 0) - (opts.baseRotation || 0)}`;
    let e = null;
    if (el.type === "group") {
      // wrapper entity: timeline/anim presets/opacity act on the whole group; children sit inside, relative to it
      e = document.createElement("a-entity");
      groupChildren(rec, el).forEach((ch, ci) => {
        if (ch.type === "group") return; // no nesting in v1
        const ce = buildElementEntity(rec, ch, ci, mode, { origin: { x: ts.x, y: ts.y, z: ts.z || 0 }, baseRotation: el.rot || 0, videoFallback: opts.videoFallback, mediaId: opts.mediaId });
        if (ce) { e.appendChild(ce); if (ce.dataset.opacity) applyOpacity(ce, parseFloat(ce.dataset.opacity)); }
      });
    } else if (el.type === "video") {
      if (opts.videoFallback && opts.videoFallback(el)) {
        e = document.createElement("a-plane");
        e.setAttribute("material", { color: "#333333", opacity: 0.85, transparent: true, shader: "flat" });
        e.setAttribute("width", ts.w); e.setAttribute("height", ts.h);
      } else if (mode === "ar") {
        // Same exact world-size plane as preview. xrextras-target-video-fade built its
        // plane from the image-target geometry multiplied by our w/h, which stretched
        // the video whenever the artwork is not square; a-video keeps ts.w/ts.h exact.
        ensureTargetVideoComponent();
        e = document.createElement("a-video");
        e.setAttribute("src", mediaRef(el));
        e.setAttribute("width", ts.w); e.setAttribute("height", ts.h);
        e.setAttribute("material", "transparent: true; opacity: 0");
        e.setAttribute("studio-target-video", `video: #m-${el.id}`);
      } else {
        e = document.createElement("a-video");
        e.setAttribute("src", mediaRef(el));
        e.setAttribute("width", ts.w); e.setAttribute("height", ts.h);
      }
    } else if (el.type === "image") {
      e = document.createElement("a-image");
      e.setAttribute("src", mediaRef(el));
      // Discard fully transparent texels before depth testing so they cannot
      // punch rectangular holes through video/camera layers rendered later.
      e.setAttribute("material", { transparent: true, alphaTest: 0.001 });
      e.setAttribute("width", ts.w); e.setAttribute("height", ts.h);
    } else if (el.type === "particles") {
      ensureParticlesComponent();
      const pc = el.particles || {};
      e = document.createElement("a-entity");
      let spriteAttr = "";
      if (pc.preset === "custom" && pc.spriteAssetId && rec.assets && rec.assets[pc.spriteAssetId]) spriteAttr = `; sprite: ${blobURL(rec.assets[pc.spriteAssetId])}`;
      e.setAttribute("particles", `preset: ${pc.preset || "sparkle"}; count: ${pc.count || 120}; color: ${pc.color || "#ffd94d"}; size: ${pc.size || 12}; speed: ${pc.speed || 1}; width: ${ts.w}; height: ${ts.h}; lifetime: ${pc.lifetime||0}; emitter: ${pc.emitter||"box"}; endColor: ${pc.endColor||pc.color||"#ffd94d"}; endSize: ${pc.endSize==null?1:pc.endSize}; fade: ${!!pc.fade}; spread: ${pc.spread>0?Math.min(2,pc.spread):1}${pc.life2>0?"; life2: "+pc.life2:""}${pc.color2?"; color2: "+pc.color2:""}${spriteAttr}${pc.direction != null ? "; direction: " + (pc.direction | 0) : ""}`);
    } else if (el.type === "model") {
      // glTF/GLB: wrapper carries placement (timeline/tap target); inner child carries the
      // normalized model scale so timeline scale keys don't fight the fit-to-size normalization.
      e = document.createElement("a-entity");
      const blob = rec.assets && rec.assets[el.assetId];
      if (blob) {
        const inner = document.createElement("a-entity");
        ensureModelAnimationComponent();
        inner.setAttribute("model-clips", {clip:el.modelClip||0,speed:el.modelSpeed||1,playing:!ActionCore.list(rec).some(q=>q.actions.some(a=>a.type==='model'&&a.layerId===el.id))&&el.modelPlaying!==false,loop:el.modelLoop!==false,at:stillAt(el)});
        inner.setAttribute("gltf-model", blobURL(blob));
        inner.addEventListener("model-loaded", () => {
          const mesh = inner.getObject3D("mesh");
          if (!mesh) return;
          // The fit box is measured in the inner entity's own space. A world-space box (setFromObject) also held the
          // layer's position, so the centering offset pulled every off-center model back toward the artwork's middle.
          const own = inner.object3D; own.updateMatrixWorld(true);
          const inv = new THREE.Matrix4().copy(own.matrixWorld).invert(), box = new THREE.Box3(), rel = new THREE.Matrix4();
          mesh.traverse((o) => { if (!o.geometry) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld))); });
          if (box.isEmpty()) box.setFromObject(mesh);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          const k = ts.w / maxDim; // fit the model's largest side to the chosen width
          inner.object3D.scale.set(k, k, k);
          // seat==='plane' (new models only): the back face rests on the element plane instead of straddling it.
          inner.object3D.position.set(-center.x * k, -center.y * k, el.seat === "plane" ? -box.min.z * k : -center.z * k);
        });
        e.appendChild(inner);
      }
    } else if (el.type === "timecube") {
      ensureTimeCubeComponent();
      e = document.createElement("a-entity");
      const blob = rec.assets && rec.assets[el.assetId], tc = el.timecube || {};
      if (blob && validTimeCube(el)) e.setAttribute("time-cube", { src: blobURL(blob), cols: tc.cols, rows: tc.rows, frames: tc.frames, fw: tc.fw, fh: tc.fh,
        width: ts.w, height: ts.h, depth: ts.w * (tc.depth || 0.75), dir: tc.dir || "front", edges: tc.edges !== false, fixed: tc.fixed === true, period: tc.dur });
    } else if (el.type === "text") {
      e = document.createElement("a-plane");
      const paint = () => {
        const tb = drawTextCanvas(el, 128);
        const tts = toTargetSpace(rec, el, tb.aspect); // plane must match the canvas aspect or glyphs distort
        e.setAttribute("material", { src: tb.canvas.toDataURL("image/png"), transparent: true, alphaTest: 0.001, shader: "flat" });
        e.setAttribute("width", tts.w); e.setAttribute("height", tts.h);
      };
      paint();
      loadTextFonts(el).then((fresh) => { if (fresh) paint(); }); // the first look may use the device font until the layer's fonts arrive
    } else if (el.type === "pattern") {
      ensurePatternComponent();
      e = document.createElement("a-plane");
      e.setAttribute("material", { shader: "flat", color: "#ffffff", transparent: true });
      e.setAttribute("width", ts.w); e.setAttribute("height", ts.h);
      e.setAttribute("studio-pattern", { values: JSON.stringify(patternValues(el, ts.w / ts.h, 1 / 600)), speed: (el.pattern && el.pattern.speed) || 0 });
    } else if (el.type === "scatter") {
      e = document.createElement("a-entity"); // like a group: motion, opacity and turns act on the whole line of copies
      buildScatter(rec, el, e, idx, mode, opts);
    } else if (el.type === "sound" && el.spatial) {
      e = document.createElement("a-entity"); // invisible carrier for PositionalAudio
    } else {
      return null; // sound: no visual node
    }
    const key = keyValues(el);
    if ((fxMode(el) || key) && e.tagName !== "A-PLANE") { // a filter or colour removal on the layer's own material (not on the grey stand-in for a video that cannot play)
      ensureFxComponent();
      const s = fxScale(el, ts.w, ts.h);
      e.setAttribute("studio-fx", { mode: fxMode(el), amount: fxAmount(el), sx: s[0], sy: s[1], key: key ? key.mode : 0, kc: key ? el.chroma.color : "#00ff00", thresh: key ? key.thresh : 0.35, soft: key ? key.soft : 0 });
    }
    if(['image','video'].includes(el.type)&&el.crop){
      const applyCrop=()=>{let ready=false;e.object3D.traverse(mesh=>{if(!mesh.geometry?.attributes.uv)return;if(!mesh.geometry._studioCropOwned){mesh.geometry=mesh.geometry.clone();mesh.geometry._studioCropOwned=true;}const uv=mesh.geometry.attributes.uv,c=el.crop;
        const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material],image=materials[0]?.map?.image||materials[0]?.uniforms?.map?.value?.image,iw=image&&(image.videoWidth||image.naturalWidth||image.width),ih=image&&(image.videoHeight||image.naturalHeight||image.height),ix=iw?.5/iw:0,iy=ih?.5/ih:0;const x1=c.x+ix,x2=c.x+c.w-ix,y1=1-c.y-iy,y2=1-c.y-c.h+iy;const values=[x1,y1,x2,y1,x1,y2,x2,y2];
        for(let i=0;i<Math.min(4,uv.count);i++)uv.setXY(i,values[i*2],values[i*2+1]);uv.needsUpdate=true;if(iw&&ih)ready=true;
      });return ready;};
      for(const event of ['object3dset','loaded','materialtextureloaded'])e.addEventListener(event,applyCrop);const started=performance.now();const awaitCrop=()=>{if(!applyCrop()&&performance.now()-started<5000)requestAnimationFrame(awaitCrop);};requestAnimationFrame(awaitCrop);
    }

    e.setAttribute("position", pos);
    e.setAttribute("rotation", rot);
    e.dataset.elId = el.id;
    // a scatter's copies carry their own order (farthest first)
    if (el.flush && el.type !== "scatter") { const ro = 1 + idx; const apply = () => { const o = e.object3D; if (!o) return; o.traverse((m) => { if (m.isMesh || m.isPoints) { m.renderOrder = ro; if (el.type !== 'model' && el.type !== 'timecube' && m.material) { const ms = Array.isArray(m.material) ? m.material : [m.material]; ms.forEach((mm) => { mm.depthWrite = false; }); } } }); }; e.addEventListener('object3dset', apply); e.addEventListener('model-loaded', apply); e.addEventListener('materialtextureloaded', apply); e.addEventListener('componentchanged', (ev) => { if (ev.detail && ev.detail.name === 'material') apply(); }); apply(); setTimeout(apply, 600); setTimeout(apply, 2500); }
    e._studioFrame = { ox, oy, oz, angle, baseRotation: opts.baseRotation || 0, zTie: tie };
    const hasTl = ActionCore.list(rec).some(q=>q.actions.some(a=>a.type!=="sequence"&&a.layerId===el.id)) || el.timeline && Array.isArray(el.timeline.keys) && el.timeline.keys.length;
    if (el.anim === "spin" && !hasTl) e.setAttribute("animation__spin", `property: rotation; to: 0 0 ${(el.rot || 0) - (opts.baseRotation || 0) + 360}; loop: true; dur: 14000; easing: linear`);
    else if (el.anim === "float" && !hasTl) e.setAttribute("animation__float", `property: position; from: ${pos}; to: ${dx * Math.cos(angle) - dy * Math.sin(angle)} ${dx * Math.sin(angle) + dy * Math.cos(angle) + 0.03} ${z - oz}; dir: alternate; loop: true; dur: 2600; easing: easeInOutSine`);
    else if (el.anim === "pulse" && !hasTl) e.setAttribute("animation__pulse", `property: scale; to: 1.08 1.08 1; dir: alternate; loop: true; dur: 1600; easing: easeInOutSine`);
    if (el.onTap && el.onTap !== "none") e.classList.add("cantap");
    if (el.opacity != null && el.opacity < 1) e.dataset.opacity = String(el.opacity);
    return e;
  }

  // Opacity: set on the mesh material once it exists (components like the video fade create it async).
  function applyOpacity(entity, value) {
    entity._studioOpacity = value;
    const paint = () => {
      if (!entity.object3D) return;
      entity.object3D.traverse(n => {
        if (!n.material) return;
        let opacity = 1, owner = n; const seen = new Set();
        while (owner) {
          const el = owner.el;
          if (el && !seen.has(el) && el._studioOpacity != null) { opacity *= el._studioOpacity; seen.add(el); }
          owner = owner.parent;
        }
        for (const m of (Array.isArray(n.material) ? n.material : [n.material])) {
          if (m._studioBaseOpacity == null) m._studioBaseOpacity = m.opacity;
          m.transparent = true; m.opacity = m._studioBaseOpacity * opacity;
        }
      });
    };
    if (!entity._studioOpacityBound) {
      entity._studioOpacityBound = true;
      entity.addEventListener("object3dset", paint);
      entity.addEventListener("model-loaded", paint);
      setTimeout(paint, 300); setTimeout(paint, 1000);
    }
    paint();
  }

  // Tap behavior shared by AR player and preview. hooks.onMuteToggle handles 'mute'.
  function bindTap(entity, el, hooks) {
    const hasKeyedTap = el.timeline && Array.isArray(el.timeline.keys) && el.timeline.keys.some((k) => k.tap != null && k.tap !== "none");
    // Action sequences may enable an interaction after loading. Always bind once.
    entity.addEventListener("click", () => {
      const tap = entity._tapOverride != null ? entity._tapOverride : el.onTap;
      if (tap === "link" && el.tapUrl) {
        if (/^https:/.test(el.tapUrl)) window.open(el.tapUrl, "_blank", "noopener");
        else if (/^(mailto:|tel:)/.test(el.tapUrl)) window.location.href = el.tapUrl;
        // any other scheme (or a schemeless string) is intentionally inert
      } else if (tap === "mute" && hooks && hooks.onMuteToggle) {
        hooks.onMuteToggle();
      } else if (tap === "sequence" && hooks && hooks.onNextSequence) {
        hooks.onNextSequence();
      } else if (tap && tap.indexOf("seq:") === 0 && hooks && hooks.onSequence) {
        hooks.onSequence(tap.slice(4));
      } else if (tap && tap.indexOf("action:")===0 && hooks && hooks.onActionSequence) {
        hooks.onActionSequence(tap.slice(7));
      } else if (tap && tap.indexOf("track:") === 0 && hooks && hooks.onTrackToggle) {
        hooks.onTrackToggle(tap.slice(6));
      }
    });
  }

  // ---------- sequences (multi-state artworks) ----------
  // ---------- frozen motion ("הקפאה") ----------
  // A layer that moves by itself (a 3D model's clip, an animated GIF, a video) can be frozen on one moment of its own
  // motion: a model keeps its old field modelPlaying (false = frozen), a picture or a video has still: true; stillAt is
  // the moment shown (0..1 of the clip, the GIF or the video). A scatter keeps them on its copies' look. Motion she made
  // herself (timeline keys, the ready moves in the motion tab) is not touched.
  const stillOwn = (el) => (el && el.type === "scatter" && el.scatter && el.scatter.item) || el;
  function isStill(el) { const o = stillOwn(el); return !!o && (o.type === "model" ? o.modelPlaying === false : o.still === true); }
  function stillAt(el) { const v = stillOwn(el) && stillOwn(el).stillAt; return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0; }
  // A video held on one frame: whatever asks it to play (the artwork found, a touch for sound, a state) gets nothing.
  // A phone shows no picture of a video that never played, so it plays once, silently, and stops on the frame.
  function holdVideo(v, at) {
    if (!v.__play) { v.__play = v.play; v.__loop = v.loop; v.play = () => Promise.resolve(); }
    v.loop = false; v.__stillAt = at;
    const seek = () => { const d = v.duration; if (!(d > 0) || !Number.isFinite(d)) return; try { v.currentTime = Math.max(0, Math.min(d - 0.05, at * d)); } catch (e) {} };
    if (!v.__primed) { v.__primed = true; v.muted = true; const p = v.__play.call(v); if (p && p.then) p.then(() => { if (v.__play) { v.pause(); seek(); } }, seek); else v.pause(); }
    else v.pause();
    if (v.readyState >= 1) seek(); else v.addEventListener("loadedmetadata", seek, { once: true });
  }
  function releaseVideo(v) {
    if (!v.__play) return;
    v.play = v.__play; v.loop = v.__loop !== false; delete v.__play; delete v.__stillAt;
    v.play().catch(() => {});
  }
  function setStill(node, still, at) {
    if (!node) return;
    if (node.tagName === "VIDEO") { if (still) { if (node.__stillAt !== at || !node.__play) holdVideo(node, at); } else releaseVideo(node); return; }
    const g = node.__gif; if (!g || !window.GifAnim) return;
    const key = still ? at : -1; if (node.__held === key) return;
    if (node.__held == null && !still) return; // running already
    node.__held = still ? at : null;
    if (node.__pump) node.__pump.stop();
    node.__pump = window.GifAnim.startPump(node, g.gif, g.getEntity, still ? Math.round(at * (g.gif.frames.length - 1)) : null);
  }

  // ---------- layer groups ----------
  // A group is an element (type "group") whose children are ids of other elements.
  // Children stay normal elements in rec.elements; topLevelElements hides them from
  // top-level iteration. v1: no nested groups.
  function topLevelElements(rec) {
    const inGroup = new Set();
    for (const el of rec.elements) if (el.type === "group" && Array.isArray(el.children)) for (const id of el.children) inGroup.add(id);
    return rec.elements.filter((el) => !inGroup.has(el.id));
  }
  function groupChildren(rec, groupEl) {
    const ids = Array.isArray(groupEl.children) ? groupEl.children : [];
    const byId = new Map(rec.elements.map((el) => [el.id, el]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
  }

  function seqList(rec) { return Array.isArray(rec.sequences) ? rec.sequences : []; }
  // Animated GIF layer: parse + pump onto a canvas (the A-Frame src="#id" canvas texture path);
  // falls back to a static <img> for non-GIF, single-frame, or unparseable (e.g. interlaced) files.
  async function makeImageMedia(blob, id, getEntity) {
    const url = URL.createObjectURL(blob);
    const img = () => { const im = document.createElement("img"); im.id = id; im.src = url; im.crossOrigin = "anonymous"; return im; };
    const head = new Uint8Array(await blob.slice(0, 6).arrayBuffer());
    const isGif = head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46; // "GIF"
    if (!isGif || !window.GifAnim) return { node: img(), animated: false };
    try {
      const gif = window.GifAnim.parse(await blob.arrayBuffer());
      if (gif.frames.length < 2) return { node: img(), animated: false };
      const canvas = document.createElement("canvas");
      canvas.id = id;
      canvas.__gif = { gif, getEntity: getEntity || (() => null) };
      canvas.__pump = window.GifAnim.startPump(canvas, gif, canvas.__gif.getEntity);
      return { node: canvas, animated: true, width: gif.width, height: gif.height };
    } catch (e) {
      // <img src=GIF> would still animate in the browser. Freeze the first decoded
      // frame into a canvas so the stated static fallback is actually static.
      const im = img();
      await new Promise((resolve, reject) => {
        im.onload = resolve; im.onerror = () => reject(new Error("GIF image decode failed"));
        if (im.complete && im.naturalWidth) resolve();
      });
      const canvas = document.createElement("canvas"); canvas.id = id;
      canvas.width = im.naturalWidth; canvas.height = im.naturalHeight;
      canvas.getContext("2d").drawImage(im, 0, 0);
      URL.revokeObjectURL(url);
      return { node: canvas, animated: false, staticFallback: true,
        width: canvas.width, height: canvas.height, gifError: String((e && e.message) || e) };
    }
  }
  function elVisibleIn(el, seqId) { return !el.seq || !seqId || el.seq === seqId; }
  function nextSequence(rec, cur) {
    const s = seqList(rec);
    if (s.length < 2) return cur || null;
    const i = s.findIndex((x) => x.id === cur);
    return s[(i + 1) % s.length].id;
  }
  // Toggles built entity visibility for the active state; hidden sounds pause.
  function applySequence(container, rec, seqId, mediaEls, isTrackPlaying) {
    const vis = (el) => elVisibleIn(el, seqId) && (!el.track || (isTrackPlaying ? !!isTrackPlaying(el.track) : true));
    for (const child of container.querySelectorAll("[data-el-id]")) {
      const el = rec.elements.find((x) => x.id === child.dataset.elId);
      if (el) { child._sequenceVisible = vis(el); child.setAttribute("visible", child._sequenceVisible && child._timelineVisible !== false); }
    }
    if (mediaEls) {
      container._studioMedia = mediaEls;
      for (const m of mediaEls) m._studioBaseAllowed = vis(m.el);
      syncMedia(container, rec);
    }
  }
  // A hidden ancestor INSIDE the container (state, track, action, timeline, group) stops the media at once. The container
  // itself (or above) being hidden means the AR image target is lost; tracking flickers for a few frames while the art
  // is still in view, and pausing on every flicker made video sound stutter and repeat (worse while recording). So a
  // target loss pauses only after TRACKING_GRACE_MS of continuous loss, and playback resumes as soon as it is back.
  const TRACKING_GRACE_MS = 1000;
  const LOOP_LEAD_S = 0.08; // syncMedia restarts a looping clip this many seconds before its end (about two frames)
  function syncMedia(container, rec, now) {
    now = now == null ? performance.now() : now;
    const root = container.object3D;
    const hidden = (o) => { let content = false, tracking = false, inside = !!root; while (o) { if (o === root) inside = false; if (!o.visible) { if (inside) content = true; else tracking = true; } o = o.parent; } return { content, tracking }; };
    for (const m of container._studioMedia || []) {
      let allowed = m._studioBaseAllowed !== false && !m._actionBlocked && m._actionPlaying!==false, lost = false;
      const node = container.querySelector('[data-el-id="' + m.el.id + '"]');
      if (node && node.object3D) { const h = hidden(node.object3D); if (h.content) allowed = false; if (h.tracking) lost = true; }
      // Nonspatial sound has no visual node: still inherit its group's state/track/timeline.
      if (!node) for (const group of rec.elements.filter(el => el.type === "group" && (el.children || []).includes(m.el.id))) {
        let g = container.querySelector('[data-el-id="'+group.id+'"]');
        if (g && g.object3D) { const h = hidden(g.object3D); if (h.content) allowed = false; if (h.tracking) lost = true; }
      }
      if (lost) { if (m._lostSince == null) m._lostSince = now; if (now - m._lostSince >= TRACKING_GRACE_MS) allowed = false; }
      else m._lostSince = null;
      m.node._studioBlocked = !allowed;
      if (!allowed) { if (!m.node.paused) { m.resumeOnVisible = true; m.node.pause(); } }
      else if (m.resumeOnVisible) { m.resumeOnVisible = false; m.node.play().catch(() => {}); }
      // Seamless loop: jump back to the start a moment before the end. The browser's own loop stops at the end and
      // reloads (a visible pause on iPhone, longer for long clips).
      const n = m.node, d = n.duration;
      if (n.loop && !n.paused && d > 0.5 && Number.isFinite(d) && n.currentTime >= d - LOOP_LEAD_S) { try { n.currentTime = 0; } catch (e) {} }
    }
  }
  function monitorMedia(container, rec) {
    let active = true;
    const frame = () => { if(!active)return; syncMedia(container,rec); requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
    return () => { active = false; };
  }

  // ---------- timeline (keyframed motion) ----------
  // Pure sampler: el.timeline.keys [{t, x?, y?, z?, rot?, opacity?, scale?}] at time tSec.
  // Missing props hold their last keyed value; before the first key they hold base props.
  function sampleTimeline(el, tSec) {
    const base = { x: el.x || 0, y: el.y || 0, z: el.z || 0, rot: el.rot || 0, opacity: el.opacity == null ? 1 : el.opacity, scale: 1, tap: el.onTap || "none", visible: true };
    const tl = el.timeline;
    if (!tl || !Array.isArray(tl.keys) || !tl.keys.length) return base;
    const map = tl.xyMap;
    if (map) { base.x = map.baseX; base.y = map.baseY; }
    const keys = tl.keys.slice().sort((a, b) => a.t - b.t);
    const dur = (tl.dur > 0 ? tl.dur : keys[keys.length - 1].t);
    let t = Math.max(0, tSec);
    if (t > dur) { if (tl.loop && dur > 0) t = t % dur; else t = dur; }
    const pick = (prop) => {
      let a = null, b = null;
      for (const k of keys) {
        if (k[prop] == null) continue;
        if (k.t <= t) a = k;
        if (k.t >= t) { b = k; break; }
      }
      if (!a) return base[prop];
      if (!b) return a[prop];
      if (a === b) return a[prop];
      let f = (t - a.t) / Math.max(1e-6, b.t - a.t);
      const ease = tl.ease || "linear";
      if (ease === "easeIn") f = f * f;
      else if (ease === "easeOut") f = 1 - (1 - f) * (1 - f);
      else if (ease === "easeInOut") f = f < 0.5 ? 2 * f * f : 1 - 2 * (1 - f) * (1 - f);
      else if (ease === "elastic") f = f <= 0 ? 0 : f >= 1 ? 1 : Math.pow(2, -10 * f) * Math.sin((f * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
      return a[prop] + (b[prop] - a[prop]) * f;
    };
    // discrete channel: the element's tap behavior at time t (Change Interaction over time) -
    // the most recent keyed tap holds; before the first keyed tap the element's base onTap applies
    const pickDiscrete = (prop) => {
      let v = base[prop];
      for (const k of keys) { if (k.t <= t && k[prop] != null) v = k[prop]; }
      return v;
    };
    let x = pick("x"), y = pick("y");
    if (map) { const [a,b,c,d,tx,ty] = map.matrix; const ox=x; x=a*x+b*y+tx; y=c*ox+d*y+ty; }
    return { x, y, z: pick("z"), rot: pick("rot"), opacity: pick("opacity"), scale: pick("scale"), tap: pickDiscrete("tap"), visible: pickDiscrete("visible") };
  }
  // Editor records visible-world coordinates; convert XY back to the curve frame.
  function addTimelineKey(el, key) {
    const tl = el.timeline || (el.timeline = { keys: [] });
    const k = Object.assign({}, key), map = tl.xyMap;
    if (map && (k.x != null || k.y != null)) {
      const current = sampleTimeline(el, k.t), x = k.x == null ? current.x : k.x, y = k.y == null ? current.y : k.y;
      const [a,b,c,d,tx,ty] = map.matrix, det = a*d-b*c;
      k.x = (d*(x-tx)-b*(y-ty))/det; k.y = (-c*(x-tx)+a*(y-ty))/det;
    }
    tl.keys.push(k); return k;
  }
  function sampleVisual(rec,el,t) {
    const out=sampleTimeline(el,t);
    if(el.timeline&&Array.isArray(el.timeline.keys)&&el.timeline.keys.length)return out;
    const phase=(duration)=>{const p=Math.max(0,t)%(duration*2)/duration;return (1-Math.cos(Math.PI*(p<=1?p:2-p)))/2;};
    if(el.anim==='spin')out.rot+=Math.max(0,t)%14/14*360;
    else if(el.anim==='float')out.y+=.03/geom(rec).artH*phase(2.6);
    else if(el.anim==='pulse')out.scale=1+.08*phase(1.6);
    return out;
  }
  // Canvas uses the same artwork-space samples and parent-base frame as runtime.
  function sampleComposition(rec, el, t, seqId) {
    const timeFor=typeof t==='function'?t:()=>t;
    const owned=e=>ActionCore.list(rec).some(q=>q.actions.some(a=>a.type!=="sequence"&&a.layerId===e.id));
    const out = Object.assign(owned(el)?ActionCore.base(el):sampleVisual(rec,el,timeFor(el)),rec._actionValues&&rec._actionValues[el.id]);
    out.visible = out.visible && elVisibleIn(el,seqId);
    const group=rec.elements.find(g=>g.type==='group'&&(g.children||[]).includes(el.id));
    if(group) {
      const parent=Object.assign(owned(group)?ActionCore.base(group):sampleVisual(rec,group,timeFor(group)),rec._actionValues&&rec._actionValues[group.id]),ratio=geom(rec).artW/geom(rec).artH;
      const angle=(parent.rot-(group.rot||0))*Math.PI/180;
      const dx=(out.x-(group.x||0))*ratio*parent.scale,dy=(out.y-(group.y||0))*parent.scale;
      out.x=parent.x+(dx*Math.cos(angle)-dy*Math.sin(angle))/ratio;
      out.y=parent.y+dx*Math.sin(angle)+dy*Math.cos(angle);
      out.z+=parent.z-(group.z||0);out.rot+=parent.rot-(group.rot||0);
      out.scale*=parent.scale;out.opacity*=parent.opacity;
      out.visible=out.visible&&parent.visible&&elVisibleIn(group,seqId);
    }
    return out;
  }
  function previewStateTime(rec,seqId,elapsed) {
    const state=seqList(rec).find(s=>s.id===seqId);
    if(!state||!state.loop)return elapsed;
    const endings=rec.elements.filter(el=>!el.track&&el.timeline&&!(el.timeline.loop)).map(timelineDur).filter(t=>t>0);
    const duration=endings.length?Math.max(...endings):0;
    return duration&&elapsed>duration?elapsed%duration:elapsed;
  }
  function timelineDur(el) {
    const tl = el.timeline;
    if (!tl || !Array.isArray(tl.keys) || !tl.keys.length) return 0;
    return (tl.dur > 0 ? tl.dur : Math.max(...tl.keys.map((k) => k.t)));
  }

  // Controllable driver: play/pause/reset so the AR player can start motion at target-found
  // and freeze it when tracking is lost. Returns null when no element has keyframes.
  function startTimelineDriver(rec, entities, opts) {
    opts = opts || {};
    const tracks = [];
    for (const e of entities) {
      const el = rec.elements.find((x) => x.id === (e.dataset && e.dataset.elId));
      if (!el || ActionCore.list(rec).some(q=>q.actions.some(a=>a.type!=="sequence"&&a.layerId===el.id)) || !el.timeline || !Array.isArray(el.timeline.keys) || !el.timeline.keys.length) continue;
      const p0 = e.getAttribute("position");
      const ts0 = toTargetSpace(rec, el, el.aspect || 1);
      tracks.push({ el, e, elapsed: 0, startedAt: 0,
        xOff: (p0 ? p0.x : 0) - ts0.x, yOff: (p0 ? p0.y : 0) - ts0.y,
        zOff: (p0 ? p0.z : 0) - (el.z || 0) });
    }
    if (!tracks.length) return null;
    const D2R = Math.PI / 180;
    const drv = { running: false };
    drv.play = () => { if (drv.running) return; drv.running = true; const now = performance.now(); for (const tr of tracks) tr.startedAt = now - tr.elapsed * 1000; };
    drv.pause = () => { if (!drv.running) return; drv.running = false; const now = performance.now(); for (const tr of tracks) tr.elapsed = (now - tr.startedAt) / 1000; };
    drv.reset = () => { const now = performance.now(); for (const tr of tracks) { tr.elapsed = 0; tr.startedAt = now; } };
    if (opts.autostart !== false) drv.play();
    const frame = (now) => {
      if (drv.running) {
        // per-state loop: when every non-looping track reached its end, replay them together
        if (drv.stateLoop) {
          const ended = tracks.filter((tr) => !(tr.el.timeline && tr.el.timeline.loop));
          if (ended.length && ended.every((tr) => (now - tr.startedAt) / 1000 >= timelineDur(tr.el))) {
            for (const tr of ended) tr.startedAt = now;
          }
        }
        for (const tr of tracks) {
          const s = sampleTimeline(tr.el, (now - tr.startedAt) / 1000);
          const ts = toTargetSpace(rec, Object.assign({}, tr.el, { x: s.x, y: s.y, z: s.z }), tr.el.aspect || 1);
          const f = tr.e._studioFrame;
          if (f) {
            const dx = ts.x - f.ox, dy = ts.y - f.oy;
            tr.e.object3D.position.set(dx * Math.cos(f.angle) - dy * Math.sin(f.angle), dx * Math.sin(f.angle) + dy * Math.cos(f.angle), (ts.z || 0) + f.zTie - f.oz);
          } else tr.e.object3D.position.set(ts.x + tr.xOff, ts.y + tr.yOff, (ts.z || 0) + tr.zOff);
          tr.e.object3D.rotation.z = (s.rot - (f ? f.baseRotation : 0)) * D2R;
          tr.e.object3D.scale.set(s.scale, s.scale, 1);
          applyOpacity(tr.e, s.opacity);
          tr.e._timelineVisible = s.visible !== false;
          tr.e.object3D.visible = tr.e._sequenceVisible !== false && tr.e._timelineVisible;
          if (s.tap !== tr.appliedTap) { // Change Interaction over time
            tr.appliedTap = s.tap;
            tr.e._tapOverride = s.tap;
            tr.e.classList.toggle("cantap", !!s.tap && s.tap !== "none");
          }
        }
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    return drv;
  }

  // One action engine drives shared layers in preview and AR. Releasing a sequence
  // restores base authoring values; legacy-only layers keep their existing drivers.
  function startActionDriver(rec,container,mediaEls,opts={}) {
    const engine=ActionCore.create(rec),ids=new Set(ActionCore.list(rec).flatMap(q=>q.actions.filter(a=>a.type!=="sequence").map(a=>a.layerId)));
    const entries=[...container.querySelectorAll('[data-el-id]')].filter(e=>ids.has(e.dataset.elId)).map(e=>{
      const el=rec.elements.find(el=>el.id===e.dataset.elId);return {e,el};
    });
    if(opts.disabled)return engine;
    engine.autoStart();if(opts.paused)engine.pause();
    let active=true;
    function frame(){if(!active)return;const values=engine.values();
      for(const {e,el}of entries){
        const s=Object.assign(ActionCore.base(el),values[el.id]),ts=toTargetSpace(rec,{...el,x:s.x,y:s.y,z:s.z},el.aspect||1),f=e._studioFrame;
        if(f){const dx=ts.x-f.ox,dy=ts.y-f.oy;e.object3D.position.set(dx*Math.cos(f.angle)-dy*Math.sin(f.angle),dx*Math.sin(f.angle)+dy*Math.cos(f.angle),(ts.z||0)+f.zTie-f.oz);}
        else { const tie=el.flush?0:rec.elements.indexOf(el)*.0001;e.object3D.position.set(ts.x,ts.y,(ts.z||0)+tie); }
        e.object3D.rotation.z=(s.rot-(f?f.baseRotation:0))*Math.PI/180;
        e.object3D.scale.set(s.scale,s.scale,1);applyOpacity(e,s.opacity);
        e._timelineVisible=s.visible!==false;e.object3D.visible=e._sequenceVisible!==false&&e._timelineVisible;
        e._tapOverride=s.tap;e.classList.toggle('cantap',!!s.tap&&s.tap!=='none');
      }
      for(const {e,el}of entries){
        const value=values[el.id],inner=e.querySelector('[model-clips]');
        if(inner){const clip=value&&value.model;if(clip){
          const signature=clip.clip+':'+clip.loop;
          if(inner._actionSignature!==signature){inner._actionSignature=signature;inner.setAttribute('model-clips',{clip:clip.clip,speed:1,playing:true,loop:clip.loop});}
          inner._actionClock=clip.time;
          const component=inner.components&&inner.components['model-clips'];if(component&&component.mixer)component.mixer.setTime(clip.time);
        }else if(ActionCore.list(rec).some(q=>q.actions.some(a=>a.type==='model'&&a.layerId===el.id))){inner._actionClock=0;const c=inner.components&&inner.components['model-clips'];if(c&&c.mixer)c.mixer.setTime(0);}}
      }
      for(const m of mediaEls||[]){
        const value=values[m.el.id];m._actionBlocked=value&&value.visible===false;
        if(ActionCore.list(rec).some(q=>q.actions.some(a=>a.type==='media'&&a.layerId===m.el.id))){
          const clip=value&&value.media;m._actionPlaying=!!(clip&&clip.playing&&!engine.isPaused());
          if(clip){let time=clip.time;if(Number.isFinite(m.node.duration)&&m.node.duration>0)time=Math.min(time,m.node.duration);if(Number.isFinite(time)&&Math.abs(m.node.currentTime-time)>.12)try{m.node.currentTime=time;}catch{}}
          if(m._actionPlaying&&m.node.paused&&!m.node._studioBlocked){m.node.play().catch(()=>{});}
        }
      }
      syncMedia(container,rec);
      container.dataset.actionSequences=JSON.stringify(engine.snapshot());
      const status=document.getElementById('action-runtime-status');if(status){const states=engine.snapshot();status.textContent=ActionCore.list(rec).map(q=>q.name+': '+(states[q.id]?(states[q.id].playing?'מנגן ':'סיום ')+Math.min(q.duration,states[q.id].time% (q.loop?q.duration:Infinity)).toFixed(1)+'s':'עצור')).join(' · ');}
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);engine.dispose=()=>{active=false;};return engine;
  }

  // Small state-position dots shown when an artwork has more than one state.
  function renderSeqDots(rec, curSeq) {
    let bar = document.getElementById("seq-dots");
    const s = seqList(rec);
    if (s.length < 2) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "seq-dots";
      bar.style.cssText = "position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:40;display:flex;gap:8px";
      document.body.appendChild(bar);
    }
    bar.innerHTML = "";
    s.forEach((sq) => {
      const d = document.createElement("div");
      d.style.cssText = "width:10px;height:10px;border-radius:50%;background:" + (sq.id === curSeq ? "#7c5cff" : "rgba(255,255,255,.55)") + ";box-shadow:0 1px 4px rgba(0,0,0,.4)";
      bar.appendChild(d);
    });
  }

  // ---------- experience records ----------
  function blankExperience(name) {
    return { id: newId(), name: name || "יצירה חדשה", createdAt: Date.now(), updatedAt: Date.now(),
             target: null, elements: [], assets: {} };
  }
  const history=new Map(),saveQueues=new Map();
  // Save-state tracking: every queued save is counted until it settles, so the UI can
  // show "saving/saved/failed" truthfully and warn before a navigation that would drop
  // an in-flight write. lastError stays sticky until a save succeeds (the failed edit
  // is still in memory and rides the next successful save of the same record).
  // Per-record save state: one record's success never clears another record's sticky
  // failure; the navigation guard engages while ANY record has an in-flight write or
  // an unresolved failure.
  const saveWatchers=new Set(),saveInfos=new Map();
  let saveHold=null,failSave=null; // test-only seams: hold a settled save open / force a failure
  // lastErrorName/lastErrorAsset keep the browser's own error code and the unreadable asset (if any) so the UI can say why;
  // lastAttempts is how many writes the last successful save needed (more than 1 = an automatic retry succeeded).
  const blankInfo=()=>({pending:0,lastSavedAt:0,lastError:null,lastErrorName:null,lastErrorAsset:null,lastErrorAt:0,lastAttempts:0});
  const infoFor=id=>{let i=saveInfos.get(id);if(!i){i=blankInfo();saveInfos.set(id,i);}return i;};
  function noteSave(){for(const cb of saveWatchers)try{cb();}catch{}}
  function onSaveState(cb){saveWatchers.add(cb);cb();return()=>saveWatchers.delete(cb);}
  function saveState(id){const i=saveInfos.get(id);return i?{...i}:blankInfo();}
  function installSaveGuard(win){const handler=e=>{for(const i of saveInfos.values())if(i.pending>0||i.lastError){e.preventDefault();e.returnValue='';return;}};win.addEventListener('beforeunload',handler);return handler;}
  // Deleted ids stay tombstoned for the whole page session so no in-flight, queued or late save can resurrect them.
  const tombstones=new Map(), knownPersisted=new Set(); // knownPersisted: ids this tab has loaded or saved; if one is later missing, another tab deleted it
  const isTombstoned=id=>tombstones.has(id); // for the page lifetime: imports always mint a new id, and after a reload no timer/queue from this page can exist
  async function delExperience(id){
    tombstones.set(id,Date.now());
    await (saveQueues.get(id)||Promise.resolve()).catch(()=>{});
    await idbDel(id);
    saveQueues.delete(id);history.delete(id);saveInfos.delete(id);knownPersisted.delete(id);
  }
  // Limits shared by editor, export and import so a backup is always restorable.
  // 50MB per file / 100MB per creation (was 20/60): room for longer phone videos while a ZIP backup still fits in an
  // iPhone tab's memory. Publishing a link keeps its own 40MB cap (server and player), checked by publishBlocker.
  const MB=1024*1024,mb=n=>Math.round(n/MB)+'MB';
  const LIMITS={maxLayers:60,maxEntryBytes:50*MB,maxMediaBytes:100*MB,maxPublishBytes:40*MB,maxAssets:121};
  // Same set exportJSON/exportZIP write: assets referenced by a layer/particle sprite, plus the artwork.
  function exportedAssetIds(rec){const ids=new Set();for(const el of rec.elements||[])for(const id of [el.assetId,el.particles&&el.particles.spriteAssetId])if(id&&rec.assets&&rec.assets[id])ids.add(id);if(rec.assets&&rec.assets.__artwork)ids.add('__artwork');return [...ids];}
  function mediaBytes(rec){let n=0;for(const id of exportedAssetIds(rec))n+=rec.assets[id].size||0;return n;}
  // Why this record's backup could not be restored by this version (null = restorable).
  function restoreBlocker(rec){
    if((rec.elements||[]).length>LIMITS.maxLayers)return 'ליצירה יש יותר מ־'+LIMITS.maxLayers+' שכבות';
    const ids=exportedAssetIds(rec);
    if(ids.length>LIMITS.maxAssets)return 'ליצירה יותר מ־'+LIMITS.maxAssets+' קבצי מדיה';
    for(const id of ids)if((rec.assets[id].size||0)>LIMITS.maxEntryBytes)return 'קובץ אחד גדול מ־'+mb(LIMITS.maxEntryBytes);
    if(mediaBytes(rec)>LIMITS.maxMediaBytes)return 'סך המדיה מעל '+mb(LIMITS.maxMediaBytes);
    return null;
  }
  const exportWarning=rec=>{const r=restoreBlocker(rec);return r?'שימי לב: '+r+', ולכן הגרסה הנוכחית לא תוכל לשחזר את הקובץ הזה בייבוא. הקובץ נשמר במלואו ולא נחתך. הקובץ ניתן לשחזור דרך ״ייבוא שחזור״ (עדיף במחשב). הקטיני את היצירה לפני שתסתמכי עליו כגיבוי.':null;};
  function exportObject(rec){
    const out = { format: "ar-studio/1", id: rec.id, name: rec.name, createdAt: rec.createdAt, target: rec.target, elements: (rec.elements || []).map((e) => ({ ...e })), sequences: (rec.sequences || []).map((q) => ({ ...q })), tracks: (rec.tracks || []).map((t) => ({ ...t })), actionSequences: JSON.parse(JSON.stringify(rec.actionSequences || [])) };
    out.assets = {};
    return out;
  }
  // Exact byte size exportJSON would produce (UTF-8), computed without building the string.
  function exportJSONSize(rec){
    const skel=JSON.stringify(exportObject(rec)),enc=new TextEncoder();
    let n=enc.encode(skel).length,first=true;
    for(const id of exportedAssetIds(rec)){const b=rec.assets[id];n+=(first?0:1)+enc.encode(JSON.stringify(id)).length+1+2+('data:'+(b.type||'application/octet-stream')+';base64,').length+4*Math.ceil(b.size/3);first=false;}
    return n;
  }
  // Published scenes are base64 JSON (~4/3 of media) and the player/server cap them at 40MB.
  function publishBlocker(rec){const n=exportJSONSize(rec);return n>LIMITS.maxPublishBytes?'הקובץ המלא של היצירה הוא '+(n/1048576).toFixed(1)+'MB, ומעל מגבלת 40MB של קישור פרסום. הקטיני סרטון או הסירו קובץ.':null;}
  function addBlocker(rec,{layers=0,bytes=0}={}){
    if((rec.elements||[]).length+layers>LIMITS.maxLayers)return 'אפשר עד '+LIMITS.maxLayers+' שכבות ביצירה. כך הגיבוי תמיד ניתן לשחזור.';
    if(bytes>0&&exportedAssetIds(rec).length+1>LIMITS.maxAssets)return 'אפשר עד '+LIMITS.maxAssets+' קבצי מדיה ביצירה.';
    if(bytes>LIMITS.maxEntryBytes)return 'הקובץ גדול מ־'+mb(LIMITS.maxEntryBytes)+'.';
    if(mediaBytes(rec)+bytes>LIMITS.maxMediaBytes)return 'סך הקבצים ביצירה חורג מ־'+mb(LIMITS.maxMediaBytes)+'. כך הגיבוי תמיד ניתן לשחזור. הסירי קובץ או דחסי אותו.';
    return null;
  }
  function save(rec,options={}) {
    if(isTombstoned(rec.id))return Promise.resolve();
    rec.updatedAt=Date.now();const snapshot=structuredClone(rec),tail=saveQueues.get(rec.id)||Promise.resolve(),info=infoFor(rec.id);
    info.pending++;noteSave();
    const work=tail.catch(()=>{}).then(()=>saveSnapshot(snapshot,options)).then(attempts=>{info.lastAttempts=attempts||1;return saveHold;})
      .then(()=>{info.lastSavedAt=Date.now();info.lastError=null;info.lastErrorName=null;info.lastErrorAsset=null;},err=>{if(err&&err.deletedElsewhere){saveInfos.delete(rec.id);history.delete(rec.id);}else{info.lastError=(err&&err.message)||String(err);info.lastErrorName=(err&&err.name)||null;info.lastErrorAsset=(err&&err.assetId)||null;info.lastErrorAt=Date.now();}throw err;})
      .finally(()=>{info.pending--;noteSave();});
    saveQueues.set(rec.id,work);return work;
  }
  // iOS Safari can fail a write transiently: the storage connection closes after the app was in the background, or
  // WebKit reports UnknownError while preparing a file-backed Blob. Retry once as is, then once with every asset copied
  // into memory. A full disk or a record deleted elsewhere is final. An asset that cannot be read is named by id.
  // Returns how many writes it took.
  const isFinalWriteError=e=>!!(e&&(e.deletedElsewhere||e.name==="QuotaExceededError"));
  async function writeRecord(rec,requireExists){
    try{await idbPut(rec.id,rec,requireExists);return 1;}catch(e){if(isFinalWriteError(e))throw e;}
    await new Promise(r=>setTimeout(r,250));
    try{await idbPut(rec.id,rec,requireExists);return 2;}catch(e){if(isFinalWriteError(e))throw e;}
    const assets={};
    for(const [id,b] of Object.entries(rec.assets||{})){
      if(!b||typeof b.arrayBuffer!=="function"){assets[id]=b;continue;}
      let copy=null;
      for(let i=0;i<3&&!copy;i++){try{const ab=await b.arrayBuffer();if(ab.byteLength===b.size)copy=new Blob([ab],{type:b.type||""});}catch{}if(!copy)await new Promise(r=>setTimeout(r,120*(i+1)));}
      if(!copy){const e=new Error("asset could not be read: "+id);e.name="NotReadableError";e.assetId=id;throw e;}
      assets[id]=copy;
    }
    await idbPut(rec.id,{...rec,assets},requireExists);return 3;
  }
  // Reading the stored copy only feeds the undo step and the deleted-elsewhere check; the write re-checks existence
  // atomically, so an unreadable stored copy (after one retry) must not block the save itself.
  async function readBefore(id){
    try{return {rec:await idbGet(id),ok:true};}catch{}
    await new Promise(r=>setTimeout(r,250));
    try{return {rec:await idbGet(id),ok:true};}catch{return {rec:undefined,ok:false};}
  }
  async function saveSnapshot(rec,options={}) {
    if(failSave)throw Error(failSave);
    const read=await readBefore(rec.id),before=read.rec;
    if(before&&!options.noHistory){
      let h=history.get(rec.id);if(!h){h={undo:[],redo:[]};history.set(rec.id,h);}
      const content=r=>JSON.stringify({...r,updatedAt:0,assets:Object.keys(r.assets||{}).sort()});
      const beforeAssets=Object.keys(before.assets||{}).sort(),afterAssets=Object.keys(rec.assets||{}).sort();
      let assetChanged=beforeAssets.join('\0')!==afterAssets.join('\0');
      // The byte comparison only decides whether to keep an undo step. A read failure here (iOS file-backed blobs can fail
      // transiently) must not fail the save of an unrelated edit: keep the undo step and carry on. The write itself stays atomic.
      if(!assetChanged)try{for(const key of beforeAssets){const a=before.assets[key],b=rec.assets[key];if(a.size!==b.size||a.type!==b.type){assetChanged=true;break;}const aa=new Uint8Array(await a.arrayBuffer()),bb=new Uint8Array(await b.arrayBuffer());if(!aa.every((value,i)=>value===bb[i])){assetChanged=true;break;}}}catch(e){assetChanged=true;}
      if(assetChanged||content(before)!==content(rec)){h.undo.push(before);if(h.undo.length>20)h.undo.shift();h.redo=[];}
    }
    if(read.ok&&!before&&knownPersisted.has(rec.id)){tombstones.set(rec.id,Date.now());const e=new Error('deleted in another tab');e.deletedElsewhere=true;throw e;}
    rec.updatedAt = Date.now();
    let attempts;
    try{attempts=await writeRecord(rec, knownPersisted.has(rec.id));}catch(e){if(e&&e.deletedElsewhere)tombstones.set(rec.id,Date.now());throw e;}
    knownPersisted.add(rec.id);
    return attempts;
  }
  async function settledRead(id){const r=await settledRead0(id);if(id){if(r)knownPersisted.add(id);}else for(const x of r||[])knownPersisted.add(x.id);return r;}
  async function settledRead0(id){let pending;do{pending=id?saveQueues.get(id):Promise.all([...saveQueues.values()]);await (pending||Promise.resolve()).catch(()=>{});}while(id&&pending!==saveQueues.get(id));return id?idbGet(id):idbAll();}
  function historyState(id){const h=history.get(id);return {undo:!!h?.undo.length,redo:!!h?.redo.length};}
  async function restoreHistory(id,direction){
    await (saveQueues.get(id)||Promise.resolve()).catch(()=>{});
    const h=history.get(id);if(!h||!h[direction].length)return null;
    const current=await idbGet(id),next=h[direction].pop();h[direction==='undo'?'redo':'undo'].push(current);await save(next,{noHistory:true});return next;
  }
  function duplicateLayer(rec,id){
    const original=rec.elements.find(e=>e.id===id);if(!original)return null;
    const originals=original.type==='group'?[original,...groupChildren(rec,original)]:[original],mapping=new Map(originals.map(e=>[e.id,newId()]));
    const copies=originals.map(e=>{const copy=structuredClone(e);copy.id=mapping.get(e.id);copy.name=(e.name||e.type)+' עותק';if(copy.children)copy.children=copy.children.map(id=>mapping.get(id));return copy;});
    rec.elements.push(...copies);
    for(const q of ActionCore.list(rec))q.actions.push(...q.actions.filter(a=>mapping.has(a.layerId)).map(a=>({...structuredClone(a),id:newId(),layerId:mapping.get(a.layerId)})));
    return copies[0].id;
  }
  // Layers that point at an asset the record does not hold (or holds as something that is not a file). An export of such a record
  // is incomplete: callers must say so instead of presenting it as a full backup.
  function missingAssets(rec) {
    const out = [];
    for (const el of (rec && rec.elements) || []) {
      for (const id of [el.assetId, el.particles && el.particles.spriteAssetId]) {
        if (id && !(rec.assets && rec.assets[id] && typeof rec.assets[id].slice === "function")) out.push({ id, name: el.name || el.type || id });
      }
    }
    // The artwork image is referenced whenever the record has an image target (a blank record has none).
    if (rec && rec.target && !(rec.assets && rec.assets.__artwork && typeof rec.assets.__artwork.slice === "function")) out.push({ id: "__artwork", name: "תמונת היצירה" });
    return out;
  }
  async function exportJSON(rec) {
    const out = exportObject(rec);
    for (const el of rec.elements) {
      for (const id of [el.assetId, el.particles && el.particles.spriteAssetId]) {
        if (id && rec.assets[id]) out.assets[id] = await blobToDataURL(rec.assets[id]);
      }
    }
    if (rec.assets.__artwork) out.assets.__artwork = await blobToDataURL(rec.assets.__artwork);
    return JSON.stringify(out);
  }
  // ---------- ZIP transport (memory-light export/retrieval) ----------
  // JSON export holds every asset as a base64 dataURL inside one giant string:
  // peak JS-heap ~= raw bytes + base64 strings (~1.33x) + the JSON string itself (~1.33x).
  // ZIP transport stores each asset once as raw bytes (STORE, no compression), emitted as
  // many small chunks into a Blob (OS may page Blob parts out of JS heap), so no single
  // giant string is ever allocated. experience.json inside carries asset REFERENCES.
  const ZIP_MIME_EXT = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif", "video/mp4": ".mp4", "video/quicktime": ".mov", "video/webm": ".webm", "audio/mpeg": ".mp3", "audio/mp4": ".m4a", "audio/aac": ".aac", "audio/wav": ".wav", "model/gltf-binary": ".glb", "model/gltf+json": ".gltf" };
  function zipAssetName(id, type) { return "assets/" + id + (ZIP_MIME_EXT[type] || ".bin"); }
  async function exportZIP(rec) {
    if (typeof fflate === "undefined") throw new Error("zip support not loaded");
    const slim = { format: "ar-studio/1", id: rec.id, name: rec.name, createdAt: rec.createdAt, target: rec.target, elements: (rec.elements || []).map((e) => ({ ...e })), sequences: (rec.sequences || []).map((q) => ({ ...q })), tracks: (rec.tracks || []).map((t) => ({ ...t })), actionSequences: JSON.parse(JSON.stringify(rec.actionSequences || [])) };
    slim.assets = {};
    const wanted = new Set();
    for (const el of rec.elements) for (const id of [el.assetId, el.particles && el.particles.spriteAssetId]) if (id && rec.assets[id]) wanted.add(id);
    if (rec.assets.__artwork) wanted.add("__artwork");
    if (rec.assets.__cover && typeof rec.assets.__cover.arrayBuffer === "function") wanted.add("__cover"); // the gallery picture rides the backup (not the published JSON)
    const chunks = [];
    let zipErr = null;
    const zip = new fflate.Zip((err, chunk, final) => { if (err) { zipErr = err; return; } chunks.push(chunk); });
    for (const id of wanted) {
      const b = rec.assets[id];
      const file = zipAssetName(id, b.type);
      // one asset in JS memory at a time; STORE (no deflate) keeps CPU and copies minimal
      const bytes = new Uint8Array(await b.arrayBuffer());
      const part = new fflate.ZipPassThrough(file);
      zip.add(part); part.push(bytes, true);
      slim.assets[id] = { file: file, type: b.type || "application/octet-stream", size: b.size };
    }
    const jf = new fflate.ZipPassThrough("experience.json");
    zip.add(jf); jf.push(fflate.strToU8(JSON.stringify(slim)), true);
    zip.end();
    if (zipErr) throw zipErr;
    return new Blob(chunks, { type: "application/zip" });
  }
  // Retrieval: assets become page-owned Blobs directly from zip parts - zero base64 anywhere.
  // Intake hardening: entries are filtered BEFORE inflation (zip-bomb guard), names are
  // allowlisted (no traversal), sizes are capped like JSON imports, and the record passes
  // the same validateExportObject as JSON imports. No entry is ever executed.
  const ZIP_MAX_META = 4 * 1024 * 1024;
  // Normal import limits = editor limits (backup always restorable). RECOVERY limits apply only when the user
  // explicitly picks "recovery import" for an over-limit backup made before the editor guards; import is always a COPY.
  const NORMAL_LIM = { layers: LIMITS.maxLayers, file: LIMITS.maxEntryBytes, total: LIMITS.maxMediaBytes, assets: LIMITS.maxAssets, entries: 130 };
  const RECOVERY_LIM = { layers: 300, file: 100 * 1024 * 1024, total: 300 * 1024 * 1024, assets: 400, entries: 410 };
  const limsFor = (opts) => (opts && opts.recovery ? RECOVERY_LIM : NORMAL_LIM); // per call, never global: concurrent imports cannot see each other's limits
  function unzipCapped(u8, LIM) {
    return new Promise((res, rej) => {
      let total = 0, count = 0, rejected = null;
      fflate.unzip(u8, {
        filter(file) {
          count++;
          const name = file.name || "";
          const okName = name === "experience.json" || /^assets\/[A-Za-z0-9_.-]{1,128}$/.test(name);
          if (!okName || name.includes("..") || name.includes("\\")) { rejected = rejected || "bad entry name"; return false; }
          if (count > LIM.entries) { rejected = rejected || "too many entries"; return false; }
          if (file.originalSize > LIM.file) { rejected = rejected || "entry too large"; return false; }
          if (name === "experience.json") { if (file.originalSize > ZIP_MAX_META) { rejected = rejected || "metadata too large"; return false; } return true; } // media total below counts assets only, same as JSON import and the editor guard
          total += file.originalSize;
          if (total > LIM.total) { rejected = rejected || "archive too large"; return false; }
          return true;
        }
      }, (err, data) => err ? rej(err) : rejected ? rej(new Error("zip entry rejected: " + rejected)) : res(data));
    });
  }
  async function importZIP(blob, opts) {
    const LIM = limsFor(opts);
    if (typeof fflate === "undefined") throw new Error("zip support not loaded");
    const persist = !opts || opts.save !== false;
    const files = await unzipCapped(new Uint8Array(await blob.arrayBuffer()), LIM);
    const metaBytes = files["experience.json"];
    if (!metaBytes) throw new Error("bad format");
    const o = JSON.parse(fflate.strFromU8(metaBytes));
    validateExportObject(o, LIM);
    if (!o.assets || typeof o.assets !== "object") throw new Error("bad format");
    const entries = Object.entries(o.assets);
    if (entries.length > LIM.assets) throw new Error("too many assets");
    const assets = {};
    for (const [id, ref] of entries) {
      if (!ref || typeof ref.file !== "string" || !/^assets\/[A-Za-z0-9_.-]{1,128}$/.test(ref.file) || ref.file.includes("..")) throw new Error("bad asset reference");
      const part = files[ref.file];
      if (!part) throw new Error("missing asset: " + ref.file);
      if (part.length > LIM.file) throw new Error("asset too large");
      assets[id] = new Blob([part], { type: ref.type || "application/octet-stream" });
    }
    const rec = await recordFromExport(o, assets);
    if (persist) await save(rec);
    return rec;
  }
  // Compat: rebuild the canonical JSON string (with dataURLs) from a zip - used by tooling only.
  async function zipToJSON(blob) {
    const rec = await importZIP(blob, { save: false });
    const out = { ...rec, assets: {} };
    for (const [id, b] of Object.entries(rec.assets)) out.assets[id] = await blobToDataURL(b);
    return JSON.stringify(out);
  }
  function validateExportObject(o, LIM = NORMAL_LIM) {
    if (!o || o.format !== "ar-studio/1") throw new Error("bad format");
    if (!Array.isArray(o.elements) || o.elements.length > LIM.layers) throw new Error("bad elements (maximum" + LIM.layers + ")");
    const ids = new Set();
    for (const el of o.elements) {
      if (!el || !["video","image","sound","text","model","particles","group","timecube","pattern","scatter"].includes(el.type)) throw new Error("bad element type");
      if (typeof el.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(el.id) || ids.has(el.id)) throw new Error("bad or duplicate element id");
      ids.add(el.id);
      for (const key of ["x","y","z","w","h","rot","rotX","rotY","opacity","aspect","volume","stillAt"]) if (el[key] != null && (typeof el[key] !== "number" || !Number.isFinite(el[key]))) throw new Error("bad numeric field");
      if(!validParticles(el))throw new Error('bad particles');
      if(!validTimeCube(el))throw new Error('bad time cube');
      // bindTap may navigate to el.tapUrl on tap - refuse script-executing schemes
      // (normalized: browsers ignore case and embedded whitespace/control chars in schemes).
      if (el.tapUrl != null) {
        const u = String(el.tapUrl).toLowerCase().replace(/[\s\u0000-\u0020]+/g, "");
        if (/^(javascript|data|vbscript|file):/.test(u)) throw new Error("bad tap url");
      }
      if(!validCrop(el))throw new Error('bad image crop');
      if(!validFx(el))throw new Error('bad filter');
      if(!validChroma(el))throw new Error('bad colour removal');
      if(!validScatter(el))throw new Error('bad scatter');
      if(!validPattern(el))throw new Error('bad pattern');
      if (el.timeline != null) {
        const tl = el.timeline;
        if (!Array.isArray(tl.keys) || tl.keys.length > 1000) throw new Error("bad timeline keys");
        for (const k of tl.keys) {
          if (!k || !Number.isFinite(k.t) || k.t < 0 || k.t > 3600) throw new Error("bad key time");
          for (const key of ["x","y","z","rot","scale","opacity"]) if (k[key] != null && !Number.isFinite(k[key])) throw new Error("bad key value");
        }
        if (tl.xyMap) {
          const m=tl.xyMap;
          if (!Number.isFinite(m.baseX)||!Number.isFinite(m.baseY)||!Array.isArray(m.matrix)||m.matrix.length!==6||!m.matrix.every(Number.isFinite)||Math.abs(m.matrix[0]*m.matrix[3]-m.matrix[1]*m.matrix[2])<1e-12) throw new Error("bad timeline curve map");
        }
      }
    }
    const actionError=ActionCore.validate(o);if(actionError)throw new Error(actionError);
    const member = new Set();
    for (const el of o.elements.filter(e=>e.type === "group")) {
      if (!Array.isArray(el.children)||!el.children.length) throw new Error("bad group children");
      for(const id of el.children) { const child=o.elements.find(e=>e.id===id);if(!child||child.type==='group'||member.has(id))throw new Error("bad group membership");member.add(id); }
    }
  }
  async function recordFromExport(o, assets) {
    const rec = blankExperience(o.name || "מיובא");
    rec.target = o.target; rec.elements = o.elements || []; rec.createdAt = o.createdAt || Date.now();
    rec.sequences = Array.isArray(o.sequences) ? o.sequences : [];
    rec.tracks = Array.isArray(o.tracks) ? o.tracks : [];
    rec.actionSequences = o.actionSequences || [];
    rec.assets = assets || {};
    // Whole-experience imports use the same model boundary as direct uploads.
    // Validate before save, so rejected input never leaves a broken local record.
    for(const el of rec.elements.filter(e=>e.type==='model'||e.type==='scatter'&&e.scatter&&e.scatter.item&&e.scatter.item.type==='model')) {
      if(!el.assetId||!rec.assets[el.assetId])throw new Error('model asset missing');
      rec.assets[el.assetId]=await prepareModelBlob(rec.assets[el.assetId]);
    }
    return rec;
  }
  async function importJSON(text, opts) {
    const LIM = limsFor(opts);
    const o = JSON.parse(text);
    const persist = !opts || opts.save !== false;
    validateExportObject(o, LIM);
    // JSON imports are self-contained. Never fetch an arbitrary URL from a file.
    const entries=Object.entries(o.assets || {});
    if(entries.length>LIM.assets)throw new Error("too many assets");
    let total=0;
    for(const [key,value]of entries) {
      if(typeof value!=="string"||!/^data:(image\/(png|jpeg|webp|gif)|video\/(mp4|webm|quicktime)|audio\/(mpeg|wav|x-wav|mp4|x-m4a|ogg)|model\/gltf-binary|application\/octet-stream);base64,[A-Za-z0-9+/]*={0,2}$/.test(value))throw new Error("asset must be embedded supported media");
      const b64=value.slice(value.indexOf(',')+1),size=b64.length/4*3-(b64.endsWith('==')?2:b64.endsWith('=')?1:0);total+=size;
      if(size>LIM.file||total>LIM.total)throw new Error("import media too large");
    }
    const assets={};
    for (const [k, durl] of entries) assets[k] = await dataURLtoBlob(durl);
    const rec = await recordFromExport(o, assets);
    if (persist) await save(rec);
    return rec;
  }

  // ---------- demo seed (the proven v4 composition, generated assets only) ----------
  async function seedDemo(force) {
    if (!force && localStorage.getItem("ar-studio-demo-seeded")) {
      const all = await idbAll();
      if (all.length) return all[0];
    }
    const B = "assets/demo/";
    const get = async (p) => (await fetch(B + p)).blob();
    const rec = blankExperience("דמו - Star Burst");
    const artBlob = await get("artwork.jpg");
    const artImg = await loadImage(await blobToDataURL(artBlob));
    const t = await makeTarget(artImg);
    rec.target = { artRect: t.artRect, natural: { w: artImg.naturalWidth, h: artImg.naturalHeight } };
    rec.assets.__artwork = artBlob;
    const vidId = newId(), imgId = newId(), sndId = newId();
    rec.assets[vidId] = await get("art-video.mp4");
    rec.assets[imgId] = await get("badge.png");
    rec.assets[sndId] = await get("art-audio.mp3");
    rec.elements = [
      { id: newId(), type: "video", name: "סרטון", assetId: vidId, x: 0, y: 0, w: 1.0, h: 1.0, rot: 0, z: 0.001, volume: 1, loop: true, aspect: 9 / 16 },
      { id: newId(), type: "image", name: "כוכב", assetId: imgId, x: 0.347, y: 0.36, w: 0.24, h: 0.18, rot: -10, z: 0.12, spin: true, aspect: 1 },
      { id: newId(), type: "sound", name: "צליל", assetId: sndId, x: -0.3, y: -0.42, w: 0.15, h: 0.1125, rot: 0, z: 0, volume: 0.8, loop: true, aspect: 1 },
    ];
    await save(rec);
    localStorage.setItem("ar-studio-demo-seeded", "1");
    return rec;
  }

  // Try to start all given media; if autoplay is blocked (iOS low-power mode,
  // headless browsers), show a clear tap-to-play button instead of a silently frozen frame.
  // Rotation dragged by hand (3D gizmo, rotation slider) snaps to the nearest multiple of 90° within tol degrees.
  // Typed numbers stay exact.
  function snapAngle(deg, tol = 6) { const t = Math.round(deg / 90) * 90; return Math.abs(deg - t) <= tol ? (t || 0) : deg; }
  // Phones only allow sound after a touch, so videos start muted. Every touch (until sound is on) unmutes every video,
  // starts sound elements and resumes the audio context. A video that is paused at that moment (its state is hidden or
  // the artwork is out of view) is unlocked with a silent play()/pause() inside the touch, so it can start later with
  // sound. While audible media waits for that first touch, a button at the top says so (the old flow had no hint, so
  // sound only appeared when the record button happened to be touched).
  function soundOnTouch(mediaEls, { isMuted = () => false, getContext = () => null } = {}) {
    let btn = null, unlocked = false;
    const unlock = () => {
      const ctx = getContext(); if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
      for (const m of mediaEls) {
        const n = m.node;
        if (m.kind === "video" && !isMuted()) n.muted = false;
        if (n._studioBlocked) {
          m.resumeOnVisible = true;
          if (n.paused) { const g = m.three && m.three.gain && m.three.gain.gain, prev = g ? g.value : null; if (g) g.value = 0;
            n.play().then(() => { if (n._studioBlocked) n.pause(); }).catch(() => {}).finally(() => { if (g) g.value = prev; }); }
          continue;
        }
        if (n.paused) n.play().catch(() => {});
      }
      unlocked = true; if (btn) { btn.remove(); btn = null; }
    };
    window.addEventListener("pointerdown", unlock, true);
    const audible = mediaEls.filter((m) => m.el.volume == null || m.el.volume > 0);
    if (!audible.length) return { unlock, isUnlocked: () => unlocked };
    // Some browsers let a page start sound by itself (Safari with the site's Auto-Play set to "Allow All Auto-Play",
    // Chrome on a site used often). Try that first, silently, so the sound starts with the experience; the touch button
    // shows only when the browser refuses.
    (async () => {
      const n = audible[0].node, wasMuted = n.muted, wasPaused = n.paused, vol = n.volume;
      try { n.volume = 0; n.muted = false; await n.play(); if (wasPaused && n._studioBlocked) n.pause(); n.volume = vol; if (!unlocked) unlock(); }
      catch (e) { n.volume = vol; n.muted = wasMuted; if (!wasPaused) n.play().catch(() => {}); if (!unlocked) showButton(); }
    })();
    // The browser may refuse at first and allow a moment later: iOS lets a page play sound by itself once the camera
    // is running. So a silent test sound is tried again for a while (and when the artwork is found); when it plays,
    // the sound starts with no touch at all.
    let probeURL = null;
    const probe = async () => {
      if (unlocked) return;
      try {
        if (!probeURL) {
          const n = 2205, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), w = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
          w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
          v.setUint32(24, 22050, true); v.setUint32(28, 44100, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
          probeURL = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
        }
        const a = new Audio(probeURL); a.volume = 0.001;
        await a.play(); a.pause();
        if (!unlocked) unlock();
      } catch (e) {}
    };
    [900, 2000, 3500, 6000, 10000, 16000].forEach((ms) => setTimeout(probe, ms));
    const sc = document.querySelector("a-scene");
    if (sc) ["xrimagefound", "realityready", "camerastatuschange"].forEach((ev) => sc.addEventListener(ev, () => { probe(); setTimeout(probe, 600); }));
    function showButton() {
      if (unlocked) return;
      btn = document.createElement("button");
      btn.id = "sound-overlay"; btn.type = "button";
      btn.textContent = "🔊 נגיעה במסך מפעילה את הצליל";
      // below the page's own fixed top bar (preview #topbar, player #backlink), never under it
      const bar = document.getElementById("topbar") || document.getElementById("backlink"), below = bar ? Math.ceil(bar.getBoundingClientRect().bottom) + 8 : 0;
      btn.style.cssText = "position:fixed;top:max(" + Math.max(12, below) + "px,calc(env(safe-area-inset-top) + 8px));left:50%;transform:translateX(-50%);z-index:10000;max-width:calc(100vw - 24px);min-height:44px;padding:10px 20px;border:0;border-radius:999px;background:rgba(20,18,30,.86);color:#fff;font:600 15px/1.2 sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.35);cursor:pointer;white-space:nowrap";
      document.body.appendChild(btn);
    }
    return { unlock, isUnlocked: () => unlocked };
  }
  function ensurePlayback(mediaEls, opts) {
    opts = opts || {};
    const pending = () => mediaEls.filter((m) => m.node.paused && !m.node._studioBlocked);
    const tryPlay = () => { for (const m of mediaEls) { if (m.node._studioBlocked) { m.resumeOnVisible = true; continue; } if (m.node.paused) m.node.play().catch(() => {}); } };
    tryPlay(); setTimeout(tryPlay, 800); setTimeout(tryPlay, 2500);
    let btn = null;
    const refresh = () => {
      const left = pending().length;
      if (left && !btn && opts.button !== false) {
        btn = document.createElement("button");
        btn.id = "play-overlay";
        btn.textContent = opts.label || "\u25B6 \u05D4\u05E4\u05E2\u05DC\u05D4";
        btn.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:40;padding:12px 26px;border:0;border-radius:999px;background:#7c5cff;color:#fff;font-size:16px;font-weight:700;box-shadow:0 4px 18px rgba(0,0,0,.35);cursor:pointer";
        btn.addEventListener("click", () => { tryPlay(); setTimeout(refresh, 400); });
        document.body.appendChild(btn);
      } else if (!left && btn) { btn.remove(); btn = null; }
    };
    for (const m of mediaEls) m.node.addEventListener("playing", () => setTimeout(refresh, 50));
    setTimeout(refresh, 3000); // grace period for autoplay before showing the button
  }

  // Recognition-quality heuristic for the target image: resolution + gradient energy.
  // Artivive shows a star rating; we give a plain-language hint on the two failure modes we can measure.
  function assessTargetQuality(img) {
    const w = img.naturalWidth || 0, h = img.naturalHeight || 0;
    const minDim = Math.min(w, h);
    const S = 96;
    const scale = S / Math.max(w, h, 1);
    const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
    const cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
    const g = cv.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, cw, ch);
    const d = g.getImageData(0, 0, cw, ch).data;
    const gray = new Float32Array(cw * ch);
    for (let i = 0; i < cw * ch; i++) gray[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    let sum = 0, n = 0;
    for (let y = 0; y < ch - 1; y++) for (let x = 0; x < cw - 1; x++) {
      const i = y * cw + x;
      sum += Math.abs(gray[i] - gray[i + 1]) + Math.abs(gray[i] - gray[i + cw]); n += 2;
    }
    const energy = n ? sum / n : 0;
    if (minDim < 480) return { warn: true, reason: "small", energy, minDim };
    if (energy < 6) return { warn: true, reason: "flat", energy, minDim };
    return { warn: false, energy, minDim };
  }

  // Compact perceptual fingerprint of an artwork target (dHash, 16x16 cells ->
  // 64 hex chars). Duplicate detection is separate from assessTargetQuality:
  // quality judges one image's recognizability; the fingerprint compares two
  // targets across experiences. Near-identical hashes catch resizes/recompress.
  function artworkFingerprint(img) {
    const W = 17, H = 16, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data, bits = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W - 1; x++) {
      const i = (y * W + x) * 4, j = i + 4;
      const a = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2], b = .299 * d[j] + .587 * d[j + 1] + .114 * d[j + 2];
      bits.push(a > b ? 1 : 0);
    }
    let hex = "", ones = 0;
    for (let i = 0; i < bits.length; i += 4) { const n = parseInt(bits.slice(i, i + 4).join(""), 2); hex += n.toString(16); for (let k = n; k; k >>= 1) if (k & 1) ones++; }
    return { hex, entropy: Math.min(ones, bits.length - ones) / bits.length };
  }
  // Hamming distance between two fingerprint hex strings; Infinity when either
  // side is too featureless to compare (flat art matches everything).
  function fingerprintDistance(a, b) {
    if (!a || !b || a.hex.length !== b.hex.length) return Infinity;
    if (a.entropy < .1 || b.entropy < .1) return Infinity;
    let n = 0;
    for (let i = 0; i < a.hex.length; i++) { let x = parseInt(a.hex[i], 16) ^ parseInt(b.hex[i], 16); while (x) { n += x & 1; x >>= 1; } }
    return n;
  }

  // ---------- parallel overlay tracks (simultaneous sequences) ----------
  // A track is an independent mini-timeline with its own clock. Elements with el.track
  // belong to it: they are visible while the track plays (el.seq still applies on top).
  function trackList(rec) { return Array.isArray(rec.tracks) ? rec.tracks : []; }

  // Owns per-track drivers and play state for a built container (previewer rig / AR target).
  function makeTrackRunner(rec, container) {
    const run = {}; // id -> { playing, drv }
    const trackEntities = (id) => {
      const ids = new Set(rec.elements.filter((el) => el.track === id).map((el) => el.id));
      return [...container.querySelectorAll("[data-el-id]")].filter((n) => ids.has(n.dataset.elId));
    };
    return {
      isPlaying: (id) => !!(run[id] && run[id].playing),
      start(id) {
        const tr = trackList(rec).find((t) => t.id === id);
        if (!tr) return;
        if (!run[id]) run[id] = { playing: false, drv: null };
        if (!run[id].drv) {
          const d = startTimelineDriver(rec, trackEntities(id), { autostart: true });
          if (d) { d.stateLoop = !!tr.loop; run[id].drv = d; }
        } else { run[id].drv.reset(); run[id].drv.play(); }
        run[id].playing = true;
      },
      stop(id) {
        if (!run[id]) return;
        if (run[id].drv) { run[id].drv.pause(); run[id].drv.reset(); }
        run[id].playing = false;
      },
      toggle(id) { if (this.isPlaying(id)) this.stop(id); else this.start(id); },
      pauseAll() { for (const id of Object.keys(run)) if (run[id].playing && run[id].drv) run[id].drv.pause(); },
      resumeAll() { for (const id of Object.keys(run)) if (run[id].playing && run[id].drv) run[id].drv.play(); },
      autoStart() { for (const tr of trackList(rec)) if (tr.autoStart) this.start(tr.id); }
    };
  }

  // ---------- sequence chaining (auto-advance) + preview notifications ----------
  function seqAutoNext(rec, seqId) {
    const sq = seqList(rec).find((x) => x.id === seqId);
    return sq && sq.autoNext && sq.autoNext.at > 0 ? sq.autoNext : null;
  }
  // Runs the active state's autoNext chain; switchFn performs the actual state switch.
  function makeSeqRunner(rec, switchFn) {
    let timer = null;
    return {
      enter(seqId) {
        if (timer) { clearTimeout(timer); timer = null; }
        const an = seqAutoNext(rec, seqId);
        if (an) timer = setTimeout(() => { timer = null; switchFn(an.to || (seqList(rec)[0] && seqList(rec)[0].id)); }, an.at * 1000);
      },
      cancel() { if (timer) { clearTimeout(timer); timer = null; } }
    };
  }
  function notifySeq(rec, seqId) {
    let toast = document.getElementById("seq-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "seq-toast";
      toast.style.cssText = "position:fixed;bottom:110px;left:50%;transform:translateX(-50%);z-index:60;background:rgba(18,18,26,.85);color:#fff;padding:6px 14px;border-radius:999px;font:13px/1.4 sans-serif;transition:opacity .4s;pointer-events:none";
      document.body.appendChild(toast);
    }
    const sq = seqList(rec).find((x) => x.id === seqId);
    toast.textContent = "מצב: " + (sq ? sq.name : "");
    toast.style.opacity = "1";
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toast.style.opacity = "0"; }, 1200);
  }

  // Static published scene (surge /pub route): fetch + validate + parse WITHOUT saving to
  // the viewer's local editor storage. Capped download; honest Hebrew errors.
  const MAX_PUB_BYTES = 40 * 1024 * 1024;
  async function fetchPublished(pubId) {
    if (typeof pubId !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(pubId)) throw new Error("קישור לא תקין.");
    const r = await fetch("pub/" + pubId + ".json");
    if (!r.ok) throw new Error("היצירה לא נמצאה.");
    const len = Number(r.headers.get("content-length")) || 0;
    if (len > MAX_PUB_BYTES) throw new Error("הקובץ גדול מדי.");
    let text;
    if (r.body && r.body.getReader) {
      const reader = r.body.getReader(), chunks = []; let n = 0;
      for (;;) { const { done, value } = await reader.read(); if (done) break; n += value.byteLength; if (n > MAX_PUB_BYTES) throw new Error("הקובץ גדול מדי."); chunks.push(value); }
      text = new TextDecoder().decode(await new Blob(chunks).arrayBuffer());
    } else {
      text = await r.text();
      if (text.length > MAX_PUB_BYTES * 2) throw new Error("הקובץ גדול מדי.");
    }
    return importJSON(text, { save: false });
  }

  return { TARGET_W, TARGET_H, newId, inspectVideo, validateModelBlob, prepareModelBlob, modelCompressionKinds, DECODER_DRACO_PATH, DECODER_MESHOPT_PATH, modelClipNames, modelClipInfo, loadImage, loadImageBlob, loadFailed, blobToDataURL, dataURLtoBlob, makeTarget, targetDataJSON,
           audioDistances, connectSpatialAudio, validParticles, validCrop, setImageCrop, geom, toTargetSpace, blankExperience, save, blobURL, releaseBlobURL, blobURLs, historyState, restoreHistory, duplicateLayer, exportJSON, missingAssets, importJSON, exportZIP, importZIP, zipToJSON, fetchPublished, ownBlob, assetHealth, fileHealth, seedDemo, normEl, ANIMS, drawTextCanvas, loadTextFonts, FX: FX.map(([id, name]) => ({ id, name, moving: FX_MOVING.has(id) })), fxFrame,
           PATTERNS: PATTERNS.map(([id, name, colors, speed]) => ({ id, name, colors: colors.slice(), speed })), PATTERN_PALETTES: PATTERN_PALETTES.map(([name, colors]) => ({ name, colors: colors.slice() })),
           PATTERN_SHAPES: PATTERN_SHAPES.map(([id, name]) => ({ id, name })), patternDefaults, patternAspect, patternFrame, validPattern, validFx, validChroma, keyValues, pixelAt, CHROMA_DEFAULT, SCATTER_TYPES, SCATTER_MAX, mediaType, isStill, stillAt, setStill, scatterItem, scatterLimit, scatterPath, scatterCopies, scatterCopyEl, scatterBounds, refreshScatter, makeScatter, scaleScatter, breakScatter, validScatter, FONTS: FONTS.map(([id, name]) => ({ id, name })), buildElementEntity, applyOpacity, bindTap, ensurePlayback, ensureChromaComponent, ensureTargetVideoComponent, ensureTimeCubeComponent, bakeTimeCube, validTimeCube, TIMECUBE_DIRS, makeChromaMaterial, ensureParticlesComponent, assessTargetQuality, artworkFingerprint, fingerprintDistance, seqList, elVisibleIn, makeImageMedia, nextSequence, applySequence, monitorMedia, renderSeqDots, sampleTimeline, sampleVisual, sampleComposition, previewStateTime, addTimelineKey, timelineDur, startTimelineDriver, seqAutoNext, makeSeqRunner, notifySeq, startActionDriver, topLevelElements, groupChildren, transformGroup, trackList, makeTrackRunner,
           load: id=>settledRead(id), all: ()=>settledRead(), del: delExperience, LIMITS, mediaBytes, pushBack, addBlocker, publishBlocker, restoreBlocker, exportWarning, exportJSONSize,
           onSaveState, installSaveGuard, saveState, soundOnTouch, snapAngle, syncMedia,
           _testHoldSave:p=>{saveHold=p;}, _testFailSave:m=>{failSave=m;}, _testFailPut:o=>{failPut=o?{...o}:null;} };
})();
