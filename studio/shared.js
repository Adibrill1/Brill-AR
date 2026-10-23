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


  // Embedded glTF clips: run the first authored clip. Freeze when hidden or the
  // image target is lost; wrapper timeline/group transforms remain independent.
  function ensureModelAnimationComponent() {
    if (!window.AFRAME || AFRAME.components["model-clips"]) return;
    AFRAME.registerComponent("model-clips", {
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
          this.action = this.mixer.clipAction(clips[0]); this.action.play();
          this.el.dataset.clipCount = String(clips.length);
        };
        this.el.addEventListener("model-loaded", this.loaded);
        this.el.sceneEl.addEventListener("xrimagefound", this.onFound);
        this.el.sceneEl.addEventListener("xrimagelost", this.onLost);
        if (this.el.getObject3D("mesh")) this.loaded();
      },
      tick(t, dt) {
        if (!this.mixer || !this.tracked) return;
        for (let o = this.el.object3D; o; o = o.parent) if (!o.visible) return;
        this.mixer.update(Math.min(0.25, (dt || 0) / 1000));
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
      schema: { preset: { default: "sparkle" }, count: { default: 120 }, color: { default: "#ffd94d" }, width: { default: 0.5 }, height: { default: 0.5 }, size: { default: 12 }, speed: { default: 1 }, sprite: { default: "" }, direction: { default: -1 } }, // direction: degrees (0=up,90=right,180=down,270=left); -1 = preset's fixed direction
      init() {
        const n = Math.min(500, Math.max(10, this.data.count | 0));
        const pos = new Float32Array(n * 3);
        this.vel = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          pos[i * 3] = (Math.random() - 0.5) * this.data.width;
          pos[i * 3 + 1] = (Math.random() - 0.5) * this.data.height;
          pos[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
          const sp = this.data.speed > 0 ? this.data.speed : 1;
          const m = (0.05 + Math.random() * 0.12) * sp;
          if (this.data.direction >= 0) { // arbitrary direction control (round I)
            const a = this.data.direction * Math.PI / 180;
            this.vel[i * 3] = Math.sin(a) * m;
            this.vel[i * 3 + 1] = Math.cos(a) * m;
          } else {
            this.vel[i * 3] = (Math.random() - 0.5) * 0.05 * sp;
            this.vel[i * 3 + 1] = (this.data.preset === "confetti" ? -0.1 - Math.random() * 0.15 : 0.05 + Math.random() * 0.12) * sp;
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        const matOpts = { color: new THREE.Color(this.data.color), size: Math.min(0.06, Math.max(0.002, this.data.size / 1000)), transparent: true, opacity: 0.9, depthWrite: false };
        if (this.data.sprite) { matOpts.map = new THREE.TextureLoader().load(this.data.sprite); matOpts.alphaTest = 0.05; } // custom sprite texture (PNG with alpha)
        this.points = new THREE.Points(geo, new THREE.PointsMaterial(matOpts));
        this.el.object3D.add(this.points);
      },
      tick(time, dt) {
        const dtS = Math.min(0.1, (dt || 16) / 1000);
        const arr = this.points.geometry.attributes.position.array;
        const half = this.data.height / 2;
        for (let i = 0; i < arr.length; i += 3) {
          arr[i] += this.vel[i] * dtS;
          arr[i + 1] += this.vel[i + 1] * dtS;
          const halfW = this.data.width / 2;
          if (this.vel[i] > 0 && arr[i] > halfW) arr[i] = -halfW;
          if (this.vel[i] < 0 && arr[i] < -halfW) arr[i] = halfW;
          if (this.vel[i + 1] > 0 && arr[i + 1] > half) arr[i + 1] = -half;
          if (this.vel[i + 1] < 0 && arr[i + 1] < -half) arr[i + 1] = half;
        }
        this.points.geometry.attributes.position.needsUpdate = true;
      }
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
  function ensureChromaComponent() {
    if (!window.AFRAME || AFRAME.components["chroma-video"]) return;
    AFRAME.registerComponent("chroma-video", {
      schema: { src: { type: "selector" }, color: { default: "#00ff00" }, threshold: { default: 0.35 }, width: { default: 1 }, height: { default: 1 } },
      init() {
        const tex = new THREE.VideoTexture(this.data.src);
        const mat = makeChromaMaterial(tex, this.data.color, this.data.threshold);
        this.el.object3D.add(new THREE.Mesh(new THREE.PlaneGeometry(this.data.width, this.data.height), mat));
      }
    });
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


  // ---------- round A: shared entity factory for player + preview ----------
  // mode 'ar': video uses the device-proven xrextras-target-video-fade; 'preview': plain a-video.
  function buildElementEntity(rec, el, idx, mode, opts) {
    opts = opts || {};
    normEl(el);
    const ts = toTargetSpace(rec, el, el.aspect || 1);
    const ox = opts.origin ? opts.origin.x : 0, oy = opts.origin ? opts.origin.y : 0, oz = opts.origin ? opts.origin.z : 0;
    const z = (ts.z || 0) + idx * 0.001; // array order breaks z ties, matching the editor's paint order
    const pos = `${ts.x - ox} ${ts.y - oy} ${z - oz}`;
    const rot = `0 0 ${el.rot || 0}`;
    let e = null;
    if (el.type === "group") {
      // wrapper entity: timeline/anim presets/opacity act on the whole group; children sit inside, relative to it
      e = document.createElement("a-entity");
      groupChildren(rec, el).forEach((ch, ci) => {
        if (ch.type === "group") return; // no nesting in v1
        const ce = buildElementEntity(rec, ch, ci, mode, { origin: { x: ts.x, y: ts.y, z: ts.z || 0 }, videoFallback: opts.videoFallback });
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
        e.setAttribute("chroma-video", `src: #m-${el.id}; color: ${el.chroma.color || "#00ff00"}; threshold: ${el.chroma.threshold == null ? 0.35 : el.chroma.threshold}; width: ${ts.w}; height: ${ts.h}`);
      } else if (mode === "ar") {
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
    } else if (el.type === "particles") {
      ensureParticlesComponent();
      const pc = el.particles || {};
      e = document.createElement("a-entity");
      let spriteAttr = "";
      if (pc.preset === "custom" && pc.spriteAssetId && rec.assets && rec.assets[pc.spriteAssetId]) spriteAttr = `; sprite: ${URL.createObjectURL(rec.assets[pc.spriteAssetId])}`;
      e.setAttribute("particles", `preset: ${pc.preset || "sparkle"}; count: ${pc.count || 120}; color: ${pc.color || "#ffd94d"}; size: ${pc.size || 12}; speed: ${pc.speed || 1}; width: ${ts.w}; height: ${ts.h}${spriteAttr}${pc.direction != null && pc.direction >= 0 ? "; direction: " + (pc.direction | 0) : ""}`);
    } else if (el.type === "model") {
      // glTF/GLB: wrapper carries placement (timeline/tap target); inner child carries the
      // normalized model scale so timeline scale keys don't fight the fit-to-size normalization.
      e = document.createElement("a-entity");
      const blob = rec.assets && rec.assets[el.assetId];
      if (blob) {
        const inner = document.createElement("a-entity");
        ensureModelAnimationComponent();
        inner.setAttribute("model-clips", "");
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
      e.setAttribute("material", { src: tb.canvas.toDataURL("image/png"), transparent: true, shader: "flat" });
      e.setAttribute("width", tts.w); e.setAttribute("height", tts.h);
    } else if (el.type === "sound" && el.spatial) {
      e = document.createElement("a-entity"); // invisible carrier for PositionalAudio
    } else {
      return null; // sound: no visual node
    }
    e.setAttribute("position", pos);
    e.setAttribute("rotation", rot);
    e.dataset.elId = el.id;
    const hasTl = el.timeline && Array.isArray(el.timeline.keys) && el.timeline.keys.length;
    if (el.anim === "spin" && !hasTl) e.setAttribute("animation__spin", `property: rotation; to: 0 0 ${(el.rot || 0) + 360}; loop: true; dur: 14000; easing: linear`);
    else if (el.anim === "float" && !hasTl) e.setAttribute("animation__float", `property: position; from: ${pos}; to: ${ts.x - ox} ${ts.y - oy + 0.03} ${z - oz}; dir: alternate; loop: true; dur: 2600; easing: easeInOutSine`);
    else if (el.anim === "pulse" && !hasTl) e.setAttribute("animation__pulse", `property: scale; to: 1.08 1.08 1; dir: alternate; loop: true; dur: 1600; easing: easeInOutSine`);
    if (el.onTap && el.onTap !== "none") e.classList.add("cantap");
    if (el.opacity != null && el.opacity < 1) e.dataset.opacity = String(el.opacity);
    return e;
  }

  // Opacity: set on the mesh material once it exists (components like the video fade create it async).
  function applyOpacity(entity, value) {
    let tries = 0;
    const paint = (root) => {
      let done = false;
      root.traverse((n) => { if (n.material) { n.material.transparent = true; n.material.opacity = value; done = true; } });
      return done;
    };
    const attempt = () => {
      const mesh = entity.getObject3D("mesh");
      if (mesh && paint(mesh)) return;
      if (++tries < 20) setTimeout(attempt, 300);
    };
    attempt();
  }

  // Tap behavior shared by AR player and preview. hooks.onMuteToggle handles 'mute'.
  function bindTap(entity, el, hooks) {
    const hasKeyedTap = el.timeline && Array.isArray(el.timeline.keys) && el.timeline.keys.some((k) => k.tap != null && k.tap !== "none");
    if ((!el.onTap || el.onTap === "none") && !hasKeyedTap) return;
    entity.addEventListener("click", () => {
      const tap = entity._tapOverride != null ? entity._tapOverride : el.onTap;
      if (tap === "link" && el.tapUrl) {
        if (/^https:/.test(el.tapUrl)) window.open(el.tapUrl, "_blank", "noopener");
        else window.location.href = el.tapUrl; // mailto: / tel:
      } else if (tap === "mute" && hooks && hooks.onMuteToggle) {
        hooks.onMuteToggle();
      } else if (tap === "sequence" && hooks && hooks.onNextSequence) {
        hooks.onNextSequence();
      } else if (tap && tap.indexOf("seq:") === 0 && hooks && hooks.onSequence) {
        hooks.onSequence(tap.slice(4));
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
      if (el) child.setAttribute("visible", vis(el));
    }
    if (mediaEls) for (const m of mediaEls) {
      if (!vis(m.el)) {
        if (!m.node.paused) { m.resumeOnVisible = true; m.node.pause(); }
      } else if (m.resumeOnVisible) {
        m.resumeOnVisible = false;
        m.node.play().catch(() => {});
      }
    }
  }
  // ---------- timeline (keyframed motion) ----------
  // Pure sampler: el.timeline.keys [{t, x?, y?, z?, rot?, opacity?, scale?}] at time tSec.
  // Missing props hold their last keyed value; before the first key they hold base props.
  function sampleTimeline(el, tSec) {
    const base = { x: el.x || 0, y: el.y || 0, z: el.z || 0, rot: el.rot || 0, opacity: el.opacity == null ? 1 : el.opacity, scale: 1, tap: el.onTap || "none" };
    const tl = el.timeline;
    if (!tl || !Array.isArray(tl.keys) || !tl.keys.length) return base;
    const keys = tl.keys.slice().sort((a, b) => a.t - b.t);
    const dur = (tl.dur > 0 ? tl.dur : keys[keys.length - 1].t);
    let t = Math.max(0, tSec);
    if (t > dur) { if (tl.loop && dur > 0) t = t % dur; else t = dur; }
    let a = null, b = null;
    for (const k of keys) { if (k.t <= t) a = k; if (k.t >= t) { b = k; break; } }
    const pick = (prop) => {
      const has = (k) => k && k[prop] != null;
      if (!has(a) && !has(b)) return base[prop];
      if (has(a) && !has(b)) return a[prop];
      if (!has(a) && has(b)) return base[prop];
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
    return { x: pick("x"), y: pick("y"), z: pick("z"), rot: pick("rot"), opacity: pick("opacity"), scale: pick("scale"), tap: pickDiscrete("tap") };
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
      if (!el || !timelineDur(el)) continue;
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
          tr.e.object3D.position.set(ts.x + tr.xOff, ts.y + tr.yOff, (ts.z || 0) + tr.zOff);
          tr.e.object3D.rotation.z = s.rot * D2R;
          tr.e.object3D.scale.set(s.scale, s.scale, 1);
          applyOpacity(tr.e, s.opacity);
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
    const out = { format: "ar-studio/1", id: rec.id, name: rec.name, createdAt: rec.createdAt, target: rec.target, elements: rec.elements.map((e) => ({ ...e })), sequences: (rec.sequences || []).map((q) => ({ ...q })), tracks: (rec.tracks || []).map((t) => ({ ...t })) };
    out.assets = {};
    for (const el of rec.elements) {
      for (const id of [el.assetId, el.particles && el.particles.spriteAssetId]) {
        if (id && rec.assets[id]) out.assets[id] = await blobToDataURL(rec.assets[id]);
      }
    }
    if (rec.assets.__artwork) out.assets.__artwork = await blobToDataURL(rec.assets.__artwork);
    return JSON.stringify(out);
  }
  async function importJSON(text) {
    const o = JSON.parse(text);
    if (!o || o.format !== "ar-studio/1") throw new Error("bad format");
    const rec = blankExperience(o.name || "מיובא");
    rec.target = o.target; rec.elements = o.elements || []; rec.createdAt = o.createdAt || Date.now();
    rec.sequences = Array.isArray(o.sequences) ? o.sequences : [];
    rec.tracks = Array.isArray(o.tracks) ? o.tracks : [];
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

  return { TARGET_W, TARGET_H, newId, loadImage, blobToDataURL, dataURLtoBlob, makeTarget, targetDataJSON,
           geom, toTargetSpace, blankExperience, save, exportJSON, importJSON, seedDemo, normEl, ANIMS, drawTextCanvas, buildElementEntity, applyOpacity, bindTap, ensurePlayback, ensureChromaComponent, makeChromaMaterial, ensureParticlesComponent, assessTargetQuality, seqList, elVisibleIn, makeImageMedia, nextSequence, applySequence, renderSeqDots, sampleTimeline, timelineDur, startTimelineDriver, seqAutoNext, makeSeqRunner, notifySeq, topLevelElements, groupChildren, trackList, makeTrackRunner,
           load: idbGet, all: idbAll, del: idbDel };
})();
