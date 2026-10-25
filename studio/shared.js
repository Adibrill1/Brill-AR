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
  async function idbPut(id, rec) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction("experiences", "readwrite");
      tx.objectStore("experiences").put(rec, id);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
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
    });
  }

  // ---------- helpers ----------
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10));
  const loadImage = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
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

  const blobToDataURL = (blob) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    // Never reject with the raw ProgressEvent: it has no .message and surfaced to the
    // user as "undefined" on iOS when a large asset read failed. Always an Error.
    r.onerror = () => rej(new Error("blob read failed (" + Math.round(((blob && blob.size) || 0) / 1024) + "KB " + ((blob && blob.type) || "?") + "): " + ((r.error && r.error.name) || "unknown")));
    r.readAsDataURL(blob);
  });
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

  function targetDataJSON(lum, orig, thumb) {
    return {
      imagePath: lum, metadata: null, name: "artwork", type: "PLANAR",
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
  async function inspectVideo(blob,timeoutMs=8000){
    const url=URL.createObjectURL(blob),video=document.createElement('video');video.preload='auto';video.muted=true;video.playsInline=true;
    try{return await new Promise((resolve,reject)=>{let timer;const end=(error)=>{clearTimeout(timer);video.onloadeddata=null;video.onerror=null;error?reject(error):resolve({width:video.videoWidth,height:video.videoHeight,duration:video.duration});};video.onloadeddata=()=>video.videoWidth&&video.videoHeight?end():end(Error('לא ניתן לקרוא את ממדי הסרטון'));video.onerror=()=>end(Error('הדפדפן לא הצליח לקרוא את פורמט הסרטון'));timer=setTimeout(()=>end(Error('טעינת הסרטון לא הסתיימה. נסי קובץ שמור במכשיר או MP4 בפורמט H.264')),timeoutMs);video.src=url;video.load();});}
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
      schema: { clip: {default:0}, speed: {default:1}, playing: {default:true}, loop: {default:true} },
      update() { if(this.mixer)this.selectClip(); },
      selectClip() {
        const mesh=this.el.getObject3D("mesh"),clips=mesh&&mesh.animations;
        if(!this.mixer||!clips||!clips.length)return;
        this.mixer.stopAllAction();
        const index=Math.max(0,Math.min(clips.length-1,Math.floor(this.data.clip)));
        this.action=this.mixer.clipAction(clips[index]);this.action.reset();
        this.action.setLoop(this.data.loop?THREE.LoopRepeat:THREE.LoopOnce,this.data.loop?Infinity:1);this.action.clampWhenFinished=!this.data.loop;this.action.play();
        this.el.dataset.activeClip=String(index);
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

  // Chroma-key video: samples the video texture with a key-color discard shader.
  // Works in both preview and AR modes (replaces the plain/fade video path when enabled).
  // The keying shader, standalone so it can be driven by any texture (video or test canvas).
  function makeChromaMaterial(texture, color, threshold) {
    return new THREE.ShaderMaterial({
      uniforms: { map: { value: texture }, keyColor: { value: new THREE.Color(color || "#00ff00") }, thresh: { value: threshold == null ? 0.35 : threshold } },
      transparent: true,
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform sampler2D map; uniform vec3 keyColor; uniform float thresh; varying vec2 vUv;" +
        "void main(){ vec4 c = texture2D(map, vUv); float d = distance(c.rgb, keyColor); if (d < thresh) discard; gl_FragColor = c; }"
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
        const parent = this.el.parentNode;
        this.onFound = () => { if (this.video) this.video.play().catch(() => {}); this.target = 1; };
        this.onLost = () => {
          if (this.video) { this.video.pause(); this.video.currentTime = 0; }
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
        const parent = this.el.parentNode;
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
    return el;
  }
  const ANIMS = ["none", "spin", "float", "pulse"];

  // Draw a text element to an offscreen canvas (used by editor panel preview and player texture).
  // fontPx: reference font size in canvas pixels. Returns {canvas, aspect}.
  function drawTextCanvas(el, fontPx) {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    const weight = el.bold ? "700" : "400";
    const font = weight + " " + fontPx + 'px -apple-system, "Segoe UI", Arial, sans-serif';
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

  // ---------- round A: shared entity factory for player + preview ----------
  // mode 'ar': video uses the device-proven xrextras-target-video-fade; 'preview': plain a-video.
  function buildElementEntity(rec, el, idx, mode, opts) {
    opts = opts || {};
    const mediaRef = (e2) => "#" + (opts.mediaId ? opts.mediaId(e2) : "m-" + e2.id);
    normEl(el);
    const ts = toTargetSpace(rec, el, el.aspect || 1);
    const ox = opts.origin ? opts.origin.x : 0, oy = opts.origin ? opts.origin.y : 0, oz = opts.origin ? opts.origin.z : 0;
    const z = (ts.z || 0) + idx * 0.001; // array order breaks z ties, matching the editor's paint order
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
      } else if (el.chroma && el.chroma.enabled) {
        ensureChromaComponent();
        e = document.createElement("a-entity");
        e.setAttribute("chroma-video", `src: ${mediaRef(el)}; color: ${el.chroma.color || "#00ff00"}; threshold: ${el.chroma.threshold == null ? 0.35 : el.chroma.threshold}; width: ${ts.w}; height: ${ts.h}`);
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
      if (pc.preset === "custom" && pc.spriteAssetId && rec.assets && rec.assets[pc.spriteAssetId]) spriteAttr = `; sprite: ${URL.createObjectURL(rec.assets[pc.spriteAssetId])}`;
      e.setAttribute("particles", `preset: ${pc.preset || "sparkle"}; count: ${pc.count || 120}; color: ${pc.color || "#ffd94d"}; size: ${pc.size || 12}; speed: ${pc.speed || 1}; width: ${ts.w}; height: ${ts.h}; lifetime: ${pc.lifetime||0}; emitter: ${pc.emitter||"box"}; endColor: ${pc.endColor||pc.color||"#ffd94d"}; endSize: ${pc.endSize==null?1:pc.endSize}; fade: ${!!pc.fade}; spread: ${pc.spread>0?Math.min(2,pc.spread):1}${pc.life2>0?"; life2: "+pc.life2:""}${pc.color2?"; color2: "+pc.color2:""}${spriteAttr}${pc.direction != null ? "; direction: " + (pc.direction | 0) : ""}`);
    } else if (el.type === "model") {
      // glTF/GLB: wrapper carries placement (timeline/tap target); inner child carries the
      // normalized model scale so timeline scale keys don't fight the fit-to-size normalization.
      e = document.createElement("a-entity");
      const blob = rec.assets && rec.assets[el.assetId];
      if (blob) {
        const inner = document.createElement("a-entity");
        ensureModelAnimationComponent();
        inner.setAttribute("model-clips", {clip:el.modelClip||0,speed:el.modelSpeed||1,playing:!ActionCore.list(rec).some(q=>q.actions.some(a=>a.type==='model'&&a.layerId===el.id))&&el.modelPlaying!==false,loop:el.modelLoop!==false});
        inner.setAttribute("gltf-model", URL.createObjectURL(blob));
        inner.addEventListener("model-loaded", () => {
          const mesh = inner.getObject3D("mesh");
          if (!mesh) return;
          const box = new THREE.Box3().setFromObject(mesh);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          const k = ts.w / maxDim; // fit the model's largest side to the chosen width
          inner.object3D.scale.set(k, k, k);
          inner.object3D.position.set(-center.x * k, -center.y * k, -center.z * k);
        });
        e.appendChild(inner);
      }
    } else if (el.type === "text") {
      e = document.createElement("a-plane");
      const tb = drawTextCanvas(el, 128);
      const tts = toTargetSpace(rec, el, tb.aspect); // plane must match the canvas aspect or glyphs distort
      e.setAttribute("material", { src: tb.canvas.toDataURL("image/png"), transparent: true, alphaTest: 0.001, shader: "flat" });
      e.setAttribute("width", tts.w); e.setAttribute("height", tts.h);
    } else if (el.type === "sound" && el.spatial) {
      e = document.createElement("a-entity"); // invisible carrier for PositionalAudio
    } else {
      return null; // sound: no visual node
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
    e._studioFrame = { ox, oy, oz, angle, baseRotation: opts.baseRotation || 0, zTie: idx * 0.001 };
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
      window.GifAnim.startPump(canvas, gif, getEntity || (() => null));
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
  function syncMedia(container, rec) {
    for (const m of container._studioMedia || []) {
      let allowed = m._studioBaseAllowed !== false && !m._actionBlocked && m._actionPlaying!==false;
      const node = container.querySelector('[data-el-id="' + m.el.id + '"]');
      let parent = node && node.object3D;
      while (parent) { if (!parent.visible) allowed = false; parent = parent.parent; }
      // Nonspatial sound has no visual node: still inherit its group's state/track/timeline.
      if (!node) for (const group of rec.elements.filter(el => el.type === "group" && (el.children || []).includes(m.el.id))) {
        let g = container.querySelector('[data-el-id="'+group.id+'"]');
        if (g) { let o=g.object3D; while(o) { if(!o.visible)allowed=false; o=o.parent; } }
      }
      m.node._studioBlocked = !allowed;
      if (!allowed) { if (!m.node.paused) { m.resumeOnVisible = true; m.node.pause(); } }
      else if (m.resumeOnVisible) { m.resumeOnVisible = false; m.node.play().catch(() => {}); }
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
        else { const tie=rec.elements.indexOf(el)*.0001;e.object3D.position.set(ts.x,ts.y,(ts.z||0)+tie); }
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
    return { id: newId(), name: name || "ניסוי חדש", createdAt: Date.now(), updatedAt: Date.now(),
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
  const infoFor=id=>{let i=saveInfos.get(id);if(!i){i={pending:0,lastSavedAt:0,lastError:null};saveInfos.set(id,i);}return i;};
  function noteSave(){for(const cb of saveWatchers)try{cb();}catch{}}
  function onSaveState(cb){saveWatchers.add(cb);cb();return()=>saveWatchers.delete(cb);}
  function saveState(id){const i=saveInfos.get(id);return i?{...i}:{pending:0,lastSavedAt:0,lastError:null};}
  function installSaveGuard(win){const handler=e=>{for(const i of saveInfos.values())if(i.pending>0||i.lastError){e.preventDefault();e.returnValue='';return;}};win.addEventListener('beforeunload',handler);return handler;}
  function save(rec,options={}) {
    rec.updatedAt=Date.now();const snapshot=structuredClone(rec),tail=saveQueues.get(rec.id)||Promise.resolve(),info=infoFor(rec.id);
    info.pending++;noteSave();
    const work=tail.catch(()=>{}).then(()=>saveSnapshot(snapshot,options)).then(()=>saveHold)
      .then(()=>{info.lastSavedAt=Date.now();info.lastError=null;},err=>{info.lastError=(err&&err.message)||String(err);throw err;})
      .finally(()=>{info.pending--;noteSave();});
    saveQueues.set(rec.id,work);return work;
  }
  async function saveSnapshot(rec,options={}) {
    if(failSave)throw Error(failSave);
    const before=await idbGet(rec.id);
    if(before&&!options.noHistory){
      let h=history.get(rec.id);if(!h){h={undo:[],redo:[]};history.set(rec.id,h);}
      const content=r=>JSON.stringify({...r,updatedAt:0,assets:Object.keys(r.assets||{}).sort()});
      const beforeAssets=Object.keys(before.assets||{}).sort(),afterAssets=Object.keys(rec.assets||{}).sort();
      let assetChanged=beforeAssets.join('\0')!==afterAssets.join('\0');
      if(!assetChanged)for(const key of beforeAssets){const a=before.assets[key],b=rec.assets[key];if(a.size!==b.size||a.type!==b.type){assetChanged=true;break;}const aa=new Uint8Array(await a.arrayBuffer()),bb=new Uint8Array(await b.arrayBuffer());if(!aa.every((value,i)=>value===bb[i])){assetChanged=true;break;}}
      if(assetChanged||content(before)!==content(rec)){h.undo.push(before);if(h.undo.length>20)h.undo.shift();h.redo=[];}
    }
    rec.updatedAt = Date.now(); await idbPut(rec.id, rec);
  }
  async function settledRead(id){let pending;do{pending=id?saveQueues.get(id):Promise.all([...saveQueues.values()]);await (pending||Promise.resolve()).catch(()=>{});}while(id&&pending!==saveQueues.get(id));return id?idbGet(id):idbAll();}
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
  async function exportJSON(rec) {
    const out = { format: "ar-studio/1", id: rec.id, name: rec.name, createdAt: rec.createdAt, target: rec.target, elements: rec.elements.map((e) => ({ ...e })), sequences: (rec.sequences || []).map((q) => ({ ...q })), tracks: (rec.tracks || []).map((t) => ({ ...t })), actionSequences: JSON.parse(JSON.stringify(rec.actionSequences || [])) };
    out.assets = {};
    for (const el of rec.elements) {
      for (const id of [el.assetId, el.particles && el.particles.spriteAssetId]) {
        if (id && rec.assets[id]) out.assets[id] = await blobToDataURL(rec.assets[id]);
      }
    }
    if (rec.assets.__artwork) out.assets.__artwork = await blobToDataURL(rec.assets.__artwork);
    return JSON.stringify(out);
  }
  async function importJSON(text, opts) {
    const o = JSON.parse(text);
    const persist = !opts || opts.save !== false;
    if (!o || o.format !== "ar-studio/1") throw new Error("bad format");
    if (!Array.isArray(o.elements) || o.elements.length > 60) throw new Error("bad elements (maximum60)");
    const ids = new Set();
    for (const el of o.elements) {
      if (!el || !["video","image","sound","text","model","particles","group"].includes(el.type)) throw new Error("bad element type");
      if (typeof el.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(el.id) || ids.has(el.id)) throw new Error("bad or duplicate element id");
      ids.add(el.id);
      for (const key of ["x","y","z","w","h","rot","rotX","rotY","opacity","aspect","volume"]) if (el[key] != null && (typeof el[key] !== "number" || !Number.isFinite(el[key]))) throw new Error("bad numeric field");
      if(!validParticles(el))throw new Error('bad particles');
      // bindTap may navigate to el.tapUrl on tap - refuse script-executing schemes
      // (normalized: browsers ignore case and embedded whitespace/control chars in schemes).
      if (el.tapUrl != null) {
        const u = String(el.tapUrl).toLowerCase().replace(/[\s\u0000-\u0020]+/g, "");
        if (/^(javascript|data|vbscript|file):/.test(u)) throw new Error("bad tap url");
      }
      if(!validCrop(el))throw new Error('bad image crop');
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
    // JSON imports are self-contained. Never fetch an arbitrary URL from a file.
    const entries=Object.entries(o.assets || {});
    if(entries.length>121)throw new Error("too many assets");
    let total=0;
    for(const [key,value]of entries) {
      if(typeof value!=="string"||!/^data:(image\/(png|jpeg|webp|gif)|video\/(mp4|webm|quicktime)|audio\/(mpeg|wav|x-wav|mp4|x-m4a|ogg)|model\/gltf-binary|application\/octet-stream);base64,[A-Za-z0-9+/]*={0,2}$/.test(value))throw new Error("asset must be embedded supported media");
      const size=Math.floor(value.slice(value.indexOf(',')+1).length*.75);total+=size;
      if(size>20*1024*1024||total>60*1024*1024)throw new Error("import media too large");
    }
    const rec = blankExperience(o.name || "מיובא");
    rec.target = o.target; rec.elements = o.elements || []; rec.createdAt = o.createdAt || Date.now();
    rec.sequences = Array.isArray(o.sequences) ? o.sequences : [];
    rec.tracks = Array.isArray(o.tracks) ? o.tracks : [];
    rec.actionSequences = o.actionSequences || [];
    rec.assets = {};
    for (const [k, durl] of Object.entries(o.assets || {})) rec.assets[k] = await dataURLtoBlob(durl);
    // Whole-experience imports use the same model boundary as direct uploads.
    // Validate before save, so rejected input never leaves a broken local record.
    for(const el of rec.elements.filter(e=>e.type==='model')) {
      if(!el.assetId||!rec.assets[el.assetId])throw new Error('model asset missing');
      rec.assets[el.assetId]=await prepareModelBlob(rec.assets[el.assetId]);
    }
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
    if (!r.ok) throw new Error("הניסוי לא נמצא.");
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

  return { TARGET_W, TARGET_H, newId, inspectVideo, validateModelBlob, prepareModelBlob, modelCompressionKinds, DECODER_DRACO_PATH, DECODER_MESHOPT_PATH, modelClipNames, modelClipInfo, loadImage, blobToDataURL, dataURLtoBlob, makeTarget, targetDataJSON,
           audioDistances, connectSpatialAudio, validParticles, validCrop, setImageCrop, geom, toTargetSpace, blankExperience, save, historyState, restoreHistory, duplicateLayer, exportJSON, importJSON, fetchPublished, ownBlob, assetHealth, seedDemo, normEl, ANIMS, drawTextCanvas, buildElementEntity, applyOpacity, bindTap, ensurePlayback, ensureChromaComponent, ensureTargetVideoComponent, makeChromaMaterial, ensureParticlesComponent, assessTargetQuality, seqList, elVisibleIn, makeImageMedia, nextSequence, applySequence, monitorMedia, renderSeqDots, sampleTimeline, sampleVisual, sampleComposition, previewStateTime, addTimelineKey, timelineDur, startTimelineDriver, seqAutoNext, makeSeqRunner, notifySeq, startActionDriver, topLevelElements, groupChildren, transformGroup, trackList, makeTrackRunner,
           load: id=>settledRead(id), all: ()=>settledRead(), del: idbDel,
           onSaveState, installSaveGuard, saveState,
           _testHoldSave:p=>{saveHold=p;}, _testFailSave:m=>{failSave=m;} };
})();
