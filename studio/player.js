"use strict";
/* AR Studio player: loads a saved experience from local IndexedDB and runs it
   on the proven engine stack. Same behaviors as the device-verified v4:
   muted autoplay + first-tap sound, 10s capture, no mic, no end card.
   Round A: text layers, opacity, animation presets (spin/float/pulse),
   tap actions (open link / mute toggle), z-order via array order. */
(async () => {
  const errBox = document.getElementById("err");
  const fail = (t) => { errBox.style.display = "grid"; errBox.innerHTML = t; };
  const id = location.hash.slice(1);
  if (!id) return fail("חסר מזהה ניסוי. <a href='index.html'>חזרה לעורך</a>");
  const rec = await Studio.load(id);
  if (!rec || !rec.target) return fail("הניסוי לא נמצא במכשיר הזה.<br>אם ייצאת ממכשיר אחר - ייבאי קודם ב<a href='index.html'>עורך</a>.");
  rec.elements.forEach(Studio.normEl);

  // Regenerate the engine target from the stored artwork (deterministic pipeline).
  const artURL = URL.createObjectURL(rec.assets.__artwork);
  const artImg = await Studio.loadImage(artURL);
  const t = await Studio.makeTarget(artImg);
  const targetData = Studio.targetDataJSON(t.luminance, t.padded, t.thumb);

  // Build media assets with blob URLs.
  const mediaEls = []; // {kind:'video'|'audio', node, el, three (routed gain)}
  const assets = document.createElement("a-assets");
  for (const el of rec.elements) {
    if (!el.assetId || !rec.assets[el.assetId]) continue;
    const url = URL.createObjectURL(rec.assets[el.assetId]);
    if (el.type === "video") {
      const v = document.createElement("video");
      v.id = "m-" + el.id; v.src = url; v.muted = true; v.loop = el.loop !== false;
      v.setAttribute("playsinline", ""); v.setAttribute("webkit-playsinline", "");
      v.setAttribute("crossorigin", "anonymous"); v.preload = "auto";
      assets.appendChild(v); mediaEls.push({ kind: "video", node: v, el });
    } else if (el.type === "image") {
      const im = document.createElement("img");
      im.id = "m-" + el.id; im.src = url;
      assets.appendChild(im);
    } else if (el.type === "sound") {
      const a = document.createElement("audio");
      a.id = "m-" + el.id; a.src = url; a.loop = el.loop !== false; a.preload = "auto";
      assets.appendChild(a); mediaEls.push({ kind: "audio", node: a, el });
    }
  }

  // Build the scene.
  const scene = document.createElement("a-scene");
  scene.setAttribute("xrextras-gesture-detector", "");
  scene.setAttribute("landing-page", "");
  scene.setAttribute("xrextras-loading", "");
  scene.setAttribute("xrextras-runtime-error", "");
  scene.setAttribute("renderer", "colorManagement:true");
  scene.setAttribute("xrweb", "disableWorldTracking: true");
  scene.appendChild(assets);

  const cam = document.createElement("a-camera");
  cam.setAttribute("position", "0 0 0");
  cam.setAttribute("raycaster", "objects: .cantap");
  cam.setAttribute("cursor", "fuse: false; rayOrigin: mouse;");
  scene.appendChild(cam);
  const l1 = document.createElement("a-light");
  l1.setAttribute("type", "directional"); l1.setAttribute("intensity", "0.5"); l1.setAttribute("position", "1 1 1");
  const l2 = document.createElement("a-light");
  l2.setAttribute("type", "ambient"); l2.setAttribute("intensity", "1");
  scene.appendChild(l1); scene.appendChild(l2);

  const capBtn = document.createElement("xrextras-capture-button");
  capBtn.setAttribute("capture-mode", "fixed");
  const capCfg = document.createElement("xrextras-capture-config");
  capCfg.setAttribute("max-duration-ms", "10000");
  capCfg.setAttribute("file-name-prefix", "art-ar-");
  capCfg.setAttribute("request-mic", "manual");
  capCfg.setAttribute("enable-end-card", "false");
  const capPrev = document.createElement("xrextras-capture-preview");
  scene.appendChild(capBtn); scene.appendChild(capCfg); scene.appendChild(capPrev);

  // Mute toggle shared by tap actions: all sources are routed through THREE.Audio gains,
  // so flipping the gain is the one reliable mute across browsers.
  let muted = false;
  const onMuteToggle = () => {
    muted = !muted;
    for (const m of mediaEls) {
      if (m.three) m.three.gain.gain.value = muted ? 0 : (m.el.volume == null ? 1 : m.el.volume);
    }
  };

  // Multi-state artworks: tap an element wired to "sequence" to switch states.
  let curSeq = Studio.seqList(rec).length ? Studio.seqList(rec)[0].id : null;
  const onNextSequence = () => {
    curSeq = Studio.nextSequence(rec, curSeq);
    Studio.applySequence(target, rec, curSeq, mediaEls);
    Studio.renderSeqDots(rec, curSeq);
  };

  const target = document.createElement("xrextras-named-image-target");
  target.setAttribute("name", "artwork");
  rec.elements.forEach((el, idx) => {
    const e = Studio.buildElementEntity(rec, el, idx, "ar");
    if (!e) return; // sound: no visual node
    Studio.bindTap(e, el, { onMuteToggle, onNextSequence });
    target.appendChild(e);
    if (e.dataset.opacity) Studio.applyOpacity(e, parseFloat(e.dataset.opacity));
  });
  if (curSeq) { Studio.applySequence(target, rec, curSeq, mediaEls); Studio.renderSeqDots(rec, curSeq); }
  scene.appendChild(target);
  document.body.appendChild(scene);

  Studio.ensurePlayback(mediaEls.filter((m) => m.kind === "video"));

  // First tap: unmute videos, start sound elements, resume audio context (proven pattern).
  window.addEventListener("pointerdown", () => {
    for (const m of mediaEls) {
      if (m.kind === "video") { if (!muted) m.node.muted = false; if (m.node.paused) m.node.play().catch(() => {}); }
      else { if (m.node.paused) m.node.play().catch(() => {}); }
    }
    const ctx = scene.audioListener && scene.audioListener.context;
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  });

  // Route every sound source through one Web Audio context so the 10s capture records the mix.
  const setup = () => {
    const route = () => {
      if (window.__routed) return; window.__routed = true;
      const listener = scene.audioListener || (scene.audioListener = new THREE.AudioListener());
      for (const m of mediaEls) {
        const a = new THREE.Audio(listener);
        a.setMediaElementSource(m.node);
        a.gain.gain.value = m.el.volume == null ? 1 : m.el.volume;
        m.three = a;
      }
    };
    if (scene.hasLoaded) route(); else scene.addEventListener("loaded", route);
    XR8.XrController.configure({ imageTargetData: [targetData] });
  };
  window.XR8 ? setup() : window.addEventListener("xrloaded", setup);
})().catch((e) => {
  console.error(e);
  const errBox = document.getElementById("err");
  errBox.style.display = "grid";
  errBox.textContent = "שגיאה בטעינת הניסוי: " + e.message;
});
