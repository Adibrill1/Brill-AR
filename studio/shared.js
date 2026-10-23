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
  const blobToDataURL = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
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

  // ---------- experience records ----------
  function blankExperience(name) {
    return { id: newId(), name: name || "ניסוי חדש", createdAt: Date.now(), updatedAt: Date.now(),
             target: null, elements: [], assets: {} };
  }
  async function save(rec) { rec.updatedAt = Date.now(); await idbPut(rec.id, rec); }
  async function exportJSON(rec) {
    const out = { format: "ar-studio/1", id: rec.id, name: rec.name, createdAt: rec.createdAt, target: rec.target, elements: rec.elements.map((e) => ({ ...e })) };
    out.assets = {};
    for (const el of rec.elements) {
      if (el.assetId && rec.assets[el.assetId]) out.assets[el.assetId] = await blobToDataURL(rec.assets[el.assetId]);
    }
    if (rec.assets.__artwork) out.assets.__artwork = await blobToDataURL(rec.assets.__artwork);
    return JSON.stringify(out);
  }
  async function importJSON(text) {
    const o = JSON.parse(text);
    if (!o || o.format !== "ar-studio/1") throw new Error("bad format");
    const rec = blankExperience(o.name || "מיובא");
    rec.target = o.target; rec.elements = o.elements || []; rec.createdAt = o.createdAt || Date.now();
    rec.assets = {};
    for (const [k, durl] of Object.entries(o.assets || {})) rec.assets[k] = await dataURLtoBlob(durl);
    await save(rec);
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

  return { TARGET_W, TARGET_H, newId, loadImage, blobToDataURL, dataURLtoBlob, makeTarget, targetDataJSON,
           geom, toTargetSpace, blankExperience, save, exportJSON, importJSON, seedDemo,
           load: idbGet, all: idbAll, del: idbDel };
})();
