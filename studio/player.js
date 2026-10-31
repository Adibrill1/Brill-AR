"use strict";
/* AR Studio player: loads a saved experience from local IndexedDB and runs it
   on the proven engine stack. Same behaviors as the device-verified v4:
   muted autoplay + first-tap sound, 10s capture, no mic, no end card.
   Round A: text layers, opacity, animation presets (spin/float/pulse),
   tap actions (open link / mute toggle), z-order via array order. */
(async () => {
  const errBox = document.getElementById("err");
  // Text only (textContent); an optional safe link is built as an element, never parsed from a string.
  const fail = (t, link) => { errBox.style.display = "grid"; errBox.textContent = t; if (link) { errBox.appendChild(document.createElement("br")); const a = document.createElement("a"); a.href = "index.html"; a.textContent = link; errBox.appendChild(a); } };
  const pubId = new URLSearchParams(location.search).get("pub") || "";
  const editMode = new URLSearchParams(location.search).get("edit") === "1" && !window.__REMOTE_EXPERIENCE__ && !pubId;
  let rec;
  if (pubId) {
    // Static published scene: play.html?pub=<id> loads /pub/<id>.json (surge-served; the
    // file rides every deploy from a store outside git - see studio/pub/ in .gitignore).
    // fetchPublished validates the id, caps the download and does NOT save to local storage.
    try { rec = await Studio.fetchPublished(pubId); } catch (e) { return fail(e.message); }
  } else if (window.__REMOTE_EXPERIENCE__) {
    try {
      const r = await fetch("/api/experiences/" + encodeURIComponent(window.__REMOTE_EXPERIENCE__));
      if (!r.ok) return fail("היצירה לא נמצאה בשרת.");
      rec = await Studio.importJSON(await r.text(), { save: false }); // viewer route: never persist into the viewer's editor storage
    } catch (e) { return fail("טעינת היצירה נכשלה. נסי לרענן."); }
  } else {
    const id = location.hash.slice(1);
    if (!id) return fail("חסר מזהה יצירה.", "חזרה לעורך");
    rec = await Studio.load(id);
  }
  if(!window.__REMOTE_EXPERIENCE__&&!pubId&&rec&&document.getElementById("backlink"))document.getElementById("backlink").href="index.html#"+encodeURIComponent(rec.id);
  if (!rec || !rec.target) return fail("היצירה לא נמצאה במכשיר הזה. אם ייצאת ממכשיר אחר - ייבאי קודם בעורך.", "פתיחת העורך");
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
      const mm = await Studio.makeImageMedia(rec.assets[el.assetId], "m-" + el.id,
        () => document.querySelector('[data-el-id="' + el.id + '"]'));
      assets.appendChild(mm.node);
    } else if (el.type === "sound") {
      const a = document.createElement("audio");
      a.id = "m-" + el.id; a.src = url; a.loop = el.loop !== false; a.preload = "auto";
      assets.appendChild(a); mediaEls.push({ kind: "audio", node: a, el });
    }
  }

  // Build the scene.
  const scene = document.createElement("a-scene");
  // gltf-model is BOTH a system and a component name; A-Frame's setAttribute override
  // parses against the component schema and mangles the system value. Write the raw
  // attribute so the system schema (decoder paths) sees it at scene init.
  window.HTMLElement.prototype.setAttribute.call(scene, "gltf-model", "dracoDecoderPath: " + Studio.DECODER_DRACO_PATH + "; meshoptDecoderPath: " + Studio.DECODER_MESHOPT_PATH);
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
  if (!editMode) { scene.appendChild(capBtn); scene.appendChild(capCfg); scene.appendChild(capPrev); }

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
  let tlDrv = null;
  const runner = Studio.makeSeqRunner(rec, (to) => onSequence(to));
  const onSequence = (id) => {
    if (!Studio.seqList(rec).some((x) => x.id === id)) return;
    curSeq = id;
    refreshVisibility();
    Studio.renderSeqDots(rec, curSeq);
    if (tlDrv) { tlDrv.stateLoop = !!(Studio.seqList(rec).find((x) => x.id === curSeq) || {}).loop; tlDrv.reset(); }
    if (!editMode) runner.enter(curSeq);
  };
  const onNextSequence = () => {
    curSeq = Studio.nextSequence(rec, curSeq);
    refreshVisibility();
    Studio.renderSeqDots(rec, curSeq);
    if (tlDrv) tlDrv.reset(); // a new state replays its motion from the start
  };

  const target = document.createElement("xrextras-named-image-target");
  target.setAttribute("name", "artwork");
  Studio.topLevelElements(rec).forEach((el, idx) => {
    const e = Studio.buildElementEntity(rec, el, idx, "ar");
    if (!e) return; // sound: no visual node
    target.appendChild(e);
    if (e.dataset.opacity) Studio.applyOpacity(e, parseFloat(e.dataset.opacity));
  });
  // parallel overlay tracks: independent clocks, tap start/stop, combined visibility
  const trackRunner = Studio.makeTrackRunner(rec, target);
  const refreshVisibility = () => {
    Studio.applySequence(target, rec, curSeq, mediaEls, (id) => trackRunner.isPlaying(id));
    target.setAttribute("data-tracks", JSON.stringify(Studio.trackList(rec).map((t) => [t.id, trackRunner.isPlaying(t.id)]))); // test/debug handle (DOM-readable)
  };
  const onTrackToggle = (id) => { trackRunner.toggle(id); refreshVisibility(); };
  // taps bind per entity, including children inside group wrappers
  target.querySelectorAll("[data-el-id]").forEach((n) => {
    const el = rec.elements.find((x) => x.id === n.dataset.elId);
    if (el && !editMode) Studio.bindTap(n, el, { onMuteToggle, onNextSequence, onSequence, onTrackToggle, onActionSequence: id=>actionRunner.start(id) });
  });
  if (!editMode) { trackRunner.autoStart(); trackRunner.pauseAll(); }
  refreshVisibility();
  if (curSeq) { refreshVisibility(); Studio.renderSeqDots(rec, curSeq); }
  scene.appendChild(target);
  // Timeline motion starts when the artwork is found (not during permission/scan screens)
  // and freezes while tracking is lost, resuming where it stopped.
  // the state driver drives only state-model elements; tracked elements run on their track's own driver
  tlDrv = Studio.startTimelineDriver(rec, [...target.querySelectorAll("[data-el-id]")].filter((n) => {
    const el = rec.elements.find((x) => x.id === n.dataset.elId);
    return el && !el.track;
  }), { autostart: false });
  if (tlDrv) tlDrv.stateLoop = !!(Studio.seqList(rec).find((x) => x.id === curSeq) || {}).loop;
  if (!editMode) runner.enter(curSeq);
  const actionRunner=Studio.startActionDriver(rec,target,mediaEls, {paused:true,disabled:editMode});
  window.__actionRunner=actionRunner;
  window.__tlDrv = tlDrv; // test/debug handle
  if (editMode && tlDrv) tlDrv.pause();
  if (!editMode) {
    scene.addEventListener("xrimagefound", () => { if (tlDrv) tlDrv.play(); trackRunner.resumeAll(); actionRunner.resume(); });
    scene.addEventListener("xrimagelost", () => { if (tlDrv) tlDrv.pause(); trackRunner.pauseAll(); actionRunner.pause(); });
  }
  document.body.appendChild(scene);

  if (editMode) {
    target.querySelectorAll("[animation__spin], [animation__float], [animation__pulse]").forEach(n => {
      n.removeAttribute("animation__spin"); n.removeAttribute("animation__float"); n.removeAttribute("animation__pulse");
    });
    target.querySelectorAll("[model-clips]").forEach(n => n.removeAttribute("model-clips"));
    CameraEditor.mount({ rec, container: target, scene, isAR: true });
  }

  Studio.monitorMedia(target, rec);
  Studio.ensurePlayback(mediaEls.filter((m) => m.kind === "video"));

  // Touch: unmute videos (also paused ones), start sound elements, resume audio context; a button says so until then.
  if (!editMode) Studio.soundOnTouch(mediaEls, { isMuted: () => muted, getContext: () => scene.audioListener && scene.audioListener.context });

  // Route every sound source through one Web Audio context so the 10s capture records the mix.
  const setup = () => {
    const route = () => {
      if (window.__routed) return; window.__routed = true;
      Studio.connectSpatialAudio(scene,target,mediaEls);
    };
    if (scene.hasLoaded) route(); else scene.addEventListener("loaded", route);
    XR8.XrController.configure({ imageTargetData: [targetData] });
  };
  window.XR8 ? setup() : window.addEventListener("xrloaded", setup);
})().catch((e) => {
  console.error(e);
  const errBox = document.getElementById("err");
  errBox.style.display = "grid";
  errBox.textContent = "שגיאה בטעינת היצירה: " + e.message;
});
