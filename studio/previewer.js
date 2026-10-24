"use strict";
/* Camera-free 3D preview: renders the saved experience in the same target-space
   layout as the AR player, without xr.js and without a camera permission.
   Lets the creator check depth, order, animation and sound before the phone test. */
(async () => {
  const errBox = document.getElementById("err");
  const fail = (t) => { errBox.style.display = "grid"; errBox.innerHTML = t; };
  const id = location.hash.slice(1);
  if (!id) return fail("חסר מזהה ניסוי. <a href='index.html'>חזרה לעורך</a>");
  const rec = await Studio.load(id);
  if (!rec || !rec.target) return fail("הניסוי לא נמצא. <a href='index.html'>חזרה לעורך</a>");
  rec.elements.forEach(Studio.normEl);

  const mediaEls = [];
  const videoProbes = [];
  // Media lives in a hidden div, not a-assets: a-assets gates scene load on
  // canplaythrough of every media element, which stalls the preview entirely
  // on browsers without the right codecs.
  const assets = document.createElement("div");
  assets.id = "media-store";
  assets.hidden = true;
  for (const el of rec.elements) {
    if (!el.assetId || !rec.assets[el.assetId]) continue;
    const url = URL.createObjectURL(rec.assets[el.assetId]);
    if (el.type === "video") {
      const v = document.createElement("video");
      v.id = "m-" + el.id; v.src = url; v.muted = true; v.loop = el.loop !== false;
      v.setAttribute("playsinline", ""); v.preload = "auto";
      assets.appendChild(v); mediaEls.push({ kind: "video", node: v, el });
      videoProbes.push(new Promise((resolve) => {
        const done = (ok) => resolve({ id: el.id, ok });
        const timer = setTimeout(() => done(false), 6000); // claimed codec but no data = treat as undecodable
        v.addEventListener("loadedmetadata", () => { clearTimeout(timer); done(true); }, { once: true });
        v.addEventListener("error", () => { clearTimeout(timer); done(false); }, { once: true });
      }));
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

  const scene = document.createElement("a-scene");
  scene.setAttribute("embedded", "");
  scene.setAttribute("renderer", "colorManagement:true");
  scene.setAttribute("vr-mode-ui", "enabled: false");
  scene.setAttribute("device-orientation-permission-ui", "enabled: false");
  scene.style.position = "fixed"; scene.style.inset = "0";
  document.body.appendChild(assets);

  const l1 = document.createElement("a-light");
  l1.setAttribute("type", "directional"); l1.setAttribute("intensity", "0.5"); l1.setAttribute("position", "1 1 1");
  const l2 = document.createElement("a-light");
  l2.setAttribute("type", "ambient"); l2.setAttribute("intensity", "1");
  scene.appendChild(l1); scene.appendChild(l2);

  // Orbit rig: artwork + elements rotate together under drag.
  const rig = document.createElement("a-entity");
  rig.setAttribute("id", "rig");

  // Artwork plane at its true place inside target space.
  const g = Studio.geom(rec);
  const r = rec.target.artRect;
  const art = document.createElement("a-plane");
  const artURL = URL.createObjectURL(rec.assets.__artwork);
  const artImg = await Studio.loadImage(artURL);
  artImg.id = "preview-artwork"; assets.appendChild(artImg);
  art.setAttribute("material", { src: "#preview-artwork", shader: "flat" });
  art.setAttribute("width", g.artW); art.setAttribute("height", g.artH);
  const acx = ((r.x + r.w / 2) / Studio.TARGET_W - 0.5) * g.tw;
  const acy = 0.5 - (r.y + r.h / 2) / Studio.TARGET_H;
  art.setAttribute("position", `${acx} ${acy} 0`);
  rig.appendChild(art);

  // Multi-state artworks: tap an element wired to "sequence" to switch states.
  let curSeq = Studio.seqList(rec).length ? Studio.seqList(rec)[0].id : null;
  let tlDrv = null;
  const runner = Studio.makeSeqRunner(rec, (to) => onSequence(to));
  const onSequence = (id) => {
    if (!Studio.seqList(rec).some((x) => x.id === id)) return;
    curSeq = id;
    refreshVisibility();
    Studio.renderSeqDots(rec, curSeq);
    Studio.notifySeq(rec, curSeq);
    if (tlDrv) { tlDrv.stateLoop = !!(Studio.seqList(rec).find((x) => x.id === curSeq) || {}).loop; tlDrv.reset(); }
    runner.enter(curSeq);
  };
  const onNextSequence = () => {
    curSeq = Studio.nextSequence(rec, curSeq);
    refreshVisibility();
    Studio.renderSeqDots(rec, curSeq);
    if (tlDrv) tlDrv.reset();
  };

  let muted = false;
  const onMuteToggle = () => {
    muted = !muted;
    for (const m of mediaEls) {
      const base = m.el.volume == null ? 1 : m.el.volume;
      m.node.volume = muted ? 0 : base;
      if (m.kind === "video") m.node.muted = muted;
    }
  };

  // Codec check: browsers without the video codec (e.g. codec-free headless Chrome)
  // would keep a-video's texture pending forever and block the whole scene load.
  const probe = document.createElement("video");
  const canPlay = (file) => { const t = file && file.type ? file.type : "video/mp4"; return probe.canPlayType(t) !== ""; };
  const probeResults = await Promise.all(videoProbes);
  const undecodable = new Set(probeResults.filter((r) => !r.ok).map((r) => r.id));
  const videoFallback = (el) => el.type === "video" && (!canPlay(rec.assets[el.assetId]) || undecodable.has(el.id));
  const videoFallbacks = rec.elements.filter(videoFallback).length;
  Studio.topLevelElements(rec).forEach((el, idx) => {
    const e = Studio.buildElementEntity(rec, el, idx, "preview", { videoFallback });
    if (!e) return;
    rig.appendChild(e);
    if (e.dataset.opacity) Studio.applyOpacity(e, parseFloat(e.dataset.opacity));
  });
  // parallel overlay tracks: independent clocks, tap start/stop, combined visibility
  const trackRunner = Studio.makeTrackRunner(rec, rig);
  const refreshVisibility = () => {
    Studio.applySequence(rig, rec, curSeq, mediaEls, (id) => trackRunner.isPlaying(id));
    rig.setAttribute("data-tracks", JSON.stringify(Studio.trackList(rec).map((t) => [t.id, trackRunner.isPlaying(t.id)]))); // test/debug handle (DOM-readable)
  };
  const onTrackToggle = (id) => { trackRunner.toggle(id); refreshVisibility(); };
  // taps bind per entity, including children inside group wrappers
  rig.querySelectorAll("[data-el-id]").forEach((n) => {
    const el = rec.elements.find((x) => x.id === n.dataset.elId);
    if (el) Studio.bindTap(n, el, { onMuteToggle, onNextSequence, onSequence, onTrackToggle, onActionSequence: id=>actionRunner.start(id) });
  });
  trackRunner.autoStart();
  refreshVisibility();
  if (curSeq) { refreshVisibility(); Studio.renderSeqDots(rec, curSeq); }
  // the state driver drives only state-model elements; tracked elements run on their track's own driver
  tlDrv = Studio.startTimelineDriver(rec, [...rig.querySelectorAll("[data-el-id]")].filter((n) => {
    const el = rec.elements.find((x) => x.id === n.dataset.elId);
    return el && !el.track;
  }));
  if (tlDrv) tlDrv.stateLoop = !!(Studio.seqList(rec).find((x) => x.id === curSeq) || {}).loop;
  runner.enter(curSeq);
  const actionRunner=Studio.startActionDriver(rec,rig,mediaEls);
  window.__actionRunner=actionRunner;
  if(ActionCore.list(rec).length){
    const panel=document.createElement('div');panel.id='action-runtime-panel';panel.dir='rtl';
    const title=document.createElement('strong');title.textContent='רצפי פעולות';panel.append(title);
    for(const q of ActionCore.list(rec)){
      const play=document.createElement('button');play.textContent='▶ '+q.name;play.onclick=e=>{e.stopPropagation();actionRunner.start(q.id);};panel.append(play);
      const stop=document.createElement('button');stop.textContent='■ '+q.name;stop.onclick=e=>{e.stopPropagation();actionRunner.stop(q.id);};panel.append(stop);
    }
    const status=document.createElement('p');status.id='action-runtime-status';panel.append(status);document.body.append(panel);
  }

  window.__tlDrv = tlDrv; // test/debug handle
  if (videoFallbacks) {
    document.getElementById("hint").textContent = "שים לב: הדפדפן הזה לא מצליח להציג את הסרטון, והוא מוצג כמלבן אפור. נסו מכשיר אחר או קובץ וידאו בפורמט נתמך (mp4 / H.264).";
  }
  scene.appendChild(rig);

  const cam = document.createElement("a-entity");
  cam.setAttribute("camera", "");
  cam.setAttribute("position", "0 0 1.15");
  cam.setAttribute("look-controls", "enabled: false");
  cam.setAttribute("raycaster", "objects: .cantap");
  cam.setAttribute("cursor", "fuse: false; rayOrigin: mouse;");
  scene.appendChild(cam);

  document.body.appendChild(scene);

  // Dynamically created 8frame scenes can stay paused before load (observed in
  // headless Chrome); play() is a no-op on an already-playing scene.
  const kick = () => { try { scene.play(); } catch (e) {} };
  kick();
  setTimeout(kick, 800);
  setTimeout(kick, 2500);

  Studio.monitorMedia(rig, rec);
  Studio.ensurePlayback(mediaEls.filter((m) => m.kind === "video"));

  // First tap: unmute videos, start sound elements.
  window.addEventListener("pointerdown", () => {
    for (const m of mediaEls) {
      if (m.node._studioBlocked) { m.resumeOnVisible = true; continue; }
      if (m.kind === "video") { if (!muted) m.node.muted = false; if (m.node.paused) m.node.play().catch(() => {}); }
      else if (m.node.paused) m.node.play().catch(() => {});
    }
  }, { once: true });

  // Orbit by drag, zoom by wheel/pinch.
  let orb = null;
  window.addEventListener("pointerdown", (e) => { orb = { x: e.clientX, y: e.clientY }; });
  window.addEventListener("pointermove", (e) => {
    if (!orb) return;
    const rot = rig.getAttribute("rotation");
    rot.y += (e.clientX - orb.x) * 0.25;
    rot.x = Math.max(-35, Math.min(35, rot.x + (e.clientY - orb.y) * 0.25));
    rig.setAttribute("rotation", rot);
    orb = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener("pointerup", () => { orb = null; });
  window.addEventListener("wheel", (e) => {
    const p = cam.getAttribute("position");
    p.z = Math.max(0.5, Math.min(2.2, p.z + e.deltaY * 0.001));
    cam.setAttribute("position", p);
  }, { passive: true });
})().catch((e) => {
  console.error(e);
  const errBox = document.getElementById("err");
  errBox.style.display = "grid";
  errBox.textContent = "שגיאה בטעינת התצוגה: " + e.message;
});
