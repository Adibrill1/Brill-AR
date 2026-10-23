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


  // ---------- round A: element defaults + text textures ----------
  // Backward-compatible normalization: records saved before round A lack these fields.
  function normEl(el) {
    if (el.opacity == null) el.opacity = 1;
    if (el.seq === undefined) el.seq = null; // null = visible in every sequence state
    if (el.anim == null) el.anim = el.spin ? "spin" : "none";
    if (el.onTap == null) el.onTap = "none";
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


  // ---------- round A: shared entity factory for player + preview ----------
  // mode 'ar': video uses the device-proven xrextras-target-video-fade; 'preview': plain a-video.
  function buildElementEntity(rec, el, idx, mode) {
    normEl(el);
    const ts = toTargetSpace(rec, el, el.aspect || 1);
    const z = (ts.z || 0) + idx * 0.001; // array order breaks z ties, matching the editor's paint order
    const pos = `${ts.x} ${ts.y} ${z}`;
    const rot = `0 0 ${el.rot || 0}`;
    let e = null;
    if (el.type === "video") {
      if (mode === "ar") {
        e = document.createElement("a-entity");
        e.setAttribute("xrextras-target-video-fade", `video: #m-${el.id}; width: ${ts.w}; height: ${ts.h}`);
      } else {
        e = document.createElement("a-video");
        e.setAttribute("src", `#m-${el.id}`);
        e.setAttribute("width", ts.w); e.setAttribute("height", ts.h);
      }
    } else if (el.type === "image") {
      e = document.createElement("a-image");
      e.setAttribute("src", `#m-${el.id}`);
      e.setAttribute("width", ts.w); e.setAttribute("height", ts.h);
    } else if (el.type === "text") {
      e = document.createElement("a-plane");
      const tb = drawTextCanvas(el, 128);
      const tts = toTargetSpace(rec, el, tb.aspect); // plane must match the canvas aspect or glyphs distort
      e.setAttribute("material", { src: tb.canvas.toDataURL("image/png"), transparent: true, shader: "flat" });
      e.setAttribute("width", tts.w); e.setAttribute("height", tts.h);
    } else {
      return null; // sound: no visual node
    }
    e.setAttribute("position", pos);
    e.setAttribute("rotation", rot);
    e.dataset.elId = el.id;
    const hasTl = el.timeline && Array.isArray(el.timeline.keys) && el.timeline.keys.length;
    if (el.anim === "spin" && !hasTl) e.setAttribute("animation__spin", `property: rotation; to: 0 0 ${(el.rot || 0) + 360}; loop: true; dur: 14000; easing: linear`);
    else if (el.anim === "float" && !hasTl) e.setAttribute("animation__float", `property: position; from: ${pos}; to: ${ts.x} ${ts.y + 0.03} ${z}; dir: alternate; loop: true; dur: 2600; easing: easeInOutSine`);
    else if (el.anim === "pulse" && !hasTl) e.setAttribute("animation__pulse", `property: scale; to: 1.08 1.08 1; dir: alternate; loop: true; dur: 1600; easing: easeInOutSine`);
    if (el.onTap && el.onTap !== "none") e.classList.add("cantap");
    if (el.opacity != null && el.opacity < 1) e.dataset.opacity = String(el.opacity);
    return e;
  }

  // Opacity: set on the mesh material once it exists (components like the video fade create it async).
  function applyOpacity(entity, value) {
    let tries = 0;
    const attempt = () => {
      const mesh = entity.getObject3D("mesh");
      if (mesh && mesh.material) {
        mesh.material.transparent = true;
        mesh.material.opacity = value;
        mesh.material.needsUpdate = true;
        return;
      }
      if (++tries < 20) setTimeout(attempt, 300);
    };
    attempt();
  }

  // Tap behavior shared by AR player and preview. hooks.onMuteToggle handles 'mute'.
  function bindTap(entity, el, hooks) {
    if (!el.onTap || el.onTap === "none") return;
    entity.addEventListener("click", () => {
      if (el.onTap === "link" && el.tapUrl) {
        window.open(el.tapUrl, "_blank", "noopener");
      } else if (el.onTap === "mute" && hooks && hooks.onMuteToggle) {
        hooks.onMuteToggle();
      } else if (el.onTap === "sequence" && hooks && hooks.onNextSequence) {
        hooks.onNextSequence();
      }
    });
  }

  // ---------- sequences (multi-state artworks) ----------
  function seqList(rec) { return Array.isArray(rec.sequences) ? rec.sequences : []; }
  function elVisibleIn(el, seqId) { return !el.seq || !seqId || el.seq === seqId; }
  function nextSequence(rec, cur) {
    const s = seqList(rec);
    if (s.length < 2) return cur || null;
    const i = s.findIndex((x) => x.id === cur);
    return s[(i + 1) % s.length].id;
  }
  // Toggles built entity visibility for the active state; hidden sounds pause.
  function applySequence(container, rec, seqId, mediaEls) {
    for (const child of [...container.children]) {
      const id = child.dataset && child.dataset.elId;
      if (!id) continue;
      const el = rec.elements.find((x) => x.id === id);
      if (el) child.setAttribute("visible", elVisibleIn(el, seqId));
    }
    if (mediaEls) for (const m of mediaEls) {
      if (!elVisibleIn(m.el, seqId) && !m.node.paused) m.node.pause();
    }
  }
  // ---------- timeline (keyframed motion) ----------
  // Drives entities from el.timeline.keys [{t, x?, y?, z?, rot?, opacity?, scale?}].
  // Missing props hold their last keyed value; before the first key they hold base props.
  function startTimelineDriver(rec, entities) {
    const tracks = [];
    for (const e of entities) {
      const el = rec.elements.find((x) => x.id === (e.dataset && e.dataset.elId));
      if (!el || !el.timeline || !Array.isArray(el.timeline.keys) || !el.timeline.keys.length) continue;
      const keys = el.timeline.keys.slice().sort((a, b) => a.t - b.t);
      const p0 = e.getAttribute("position");
      tracks.push({ el, e, keys, loop: !!el.timeline.loop, t0: performance.now(),
        base: { x: el.x || 0, y: el.y || 0, z: el.z || 0, rot: el.rot || 0, opacity: el.opacity == null ? 1 : el.opacity, scale: 1 },
        zOff: (p0 ? p0.z : 0) - (el.z || 0) });
    }
    if (!tracks.length) return;
    const D2R = Math.PI / 180;
    const frame = (now) => {
      for (const tr of tracks) {
        let t = (now - tr.t0) / 1000;
        const dur = tr.keys[tr.keys.length - 1].t;
        if (t > dur) { if (tr.loop) { tr.t0 = now; t = 0; } else t = dur; }
        let a = null, b = null;
        for (const k of tr.keys) { if (k.t <= t) a = k; if (k.t >= t) { b = k; break; } }
        const pick = (prop) => {
          const has = (k) => k && k[prop] != null;
          if (!has(a) && !has(b)) return tr.base[prop];
          if (has(a) && !has(b)) return a[prop];
          if (!has(a) && has(b)) return tr.base[prop];
          if (a === b) return a[prop];
          const f = (t - a.t) / Math.max(1e-6, b.t - a.t);
          return a[prop] + (b[prop] - a[prop]) * f;
        };
        const x = pick("x"), y = pick("y"), z = pick("z"), rot = pick("rot"), op = pick("opacity"), sc = pick("scale");
        const ts = toTargetSpace(rec, Object.assign({}, tr.el, { x, y, z }), tr.el.aspect || 1);
        tr.e.object3D.position.set(ts.x, ts.y, (ts.z || 0) + tr.zOff);
        tr.e.object3D.rotation.z = rot * D2R;
        tr.e.object3D.scale.set(sc, sc, 1);
        applyOpacity(tr.e, op);
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
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

  // Try to start all given media; if autoplay is blocked (iOS low-power mode,
  // headless browsers), show a clear tap-to-play button instead of a silently frozen frame.
  function ensurePlayback(mediaEls, opts) {
    opts = opts || {};
    const pending = () => mediaEls.filter((m) => m.node.paused);
    const tryPlay = () => { for (const m of pending()) m.node.play().catch(() => {}); };
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

  return { TARGET_W, TARGET_H, newId, loadImage, blobToDataURL, dataURLtoBlob, makeTarget, targetDataJSON,
           geom, toTargetSpace, blankExperience, save, exportJSON, importJSON, seedDemo, normEl, ANIMS, drawTextCanvas, buildElementEntity, applyOpacity, bindTap, ensurePlayback, seqList, elVisibleIn, nextSequence, applySequence, renderSeqDots, startTimelineDriver,
           load: idbGet, all: idbAll, del: idbDel };
})();
