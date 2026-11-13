"use strict";
/* App: the creation that is open, what is selected in it, and every change to it. The screens (stage, layers,
   inspector, timeline) never talk to each other: they change things here and listen to what happened.
   Events: "open" (another creation, or the whole record was replaced by undo/redo), "select", "change" (values of
   layers changed), "structure" (layers added, removed or reordered), "history", "tab", "mode", "time", "art" (the artwork picture
   loaded, or did not). */
window.App = (() => {
  const { toast } = UI;
  const subs = {};
  const on = (ev, fn) => { ev.split(" ").forEach((e) => (subs[e] || (subs[e] = [])).push(fn)); };
  const emit = (ev, arg) => { (subs[ev] || []).forEach((fn) => { try { fn(arg); } catch (e) { console.error(e); } }); };

  const S = {
    rec: null, selId: null,
    art: null,            // the artwork as an <img>, or a lighter <canvas> copy of a large one
    artState: "none",     // "none" | "loading" | "ok" | "error"
    media: {},            // assetId -> <video> | <img> | <canvas> (animated GIF) for the 2D canvas
    frozen: null,         // seconds the playhead is parked at; null = playing
    t0: performance.now(),
    tab: "style",         // inspector tab
    pane: "layers",       // phone: which pane is under the stage ("layers" | "inspector")
    mode3d: false, cropping: false, snap: true
  };

  const el = (id) => (S.rec && S.rec.elements.find((e) => e.id === id)) || null;
  const sel = () => el(S.selId);
  const keyed = (e) => !!(e && e.timeline && Array.isArray(e.timeline.keys) && e.timeline.keys.length);
  const clock = () => (S.frozen != null ? S.frozen : (performance.now() - S.t0) / 1000);
  const sample = (e) => Studio.sampleComposition(S.rec, e, clock, null);

  // ---------- media for the canvas ----------
  let artBlob = null;
  const mediaBlob = {};
  function dropMedia(id) {
    const m = S.media[id]; if (!m) return;
    try { if (m.tagName === "VIDEO") { m.pause(); m.removeAttribute("src"); m.load(); } if (m.__url) URL.revokeObjectURL(m.__url); } catch (e) {}
    delete S.media[id]; delete mediaBlob[id];
  }
  // A phone sometimes fails the first read of a stored file; another try, or a fresh copy of its bytes, usually works.
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function retry(fn) { let last; for (let i = 0; i < 3; i++) { try { return await fn(); } catch (e) { last = e; await wait(150 * (i + 1)); } } throw last; }
  async function readAsset(blob) {
    try { return await retry(() => Studio.blobToDataURL(blob)); }
    catch (err) {
      const copy = new Blob([await blob.arrayBuffer()], { type: blob.type || "" });
      if (!copy.size || copy.size !== blob.size) throw err;
      return Studio.blobToDataURL(copy);
    }
  }
  // The same stored file, also when undo or a save handed back another object for it: nothing to read again.
  const sameFile = (a, b) => a === b || !!(a && b && a.size === b.size && a.type === b.type);
  // The stage draws the artwork on every frame; a phone photo is far larger than the stage needs.
  function lightCopy(img) {
    const w = img.naturalWidth, hh = img.naturalHeight, k = Math.min(1, 1600 / Math.max(w, hh));
    if (k === 1) return img;
    try {
      const c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(hh * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      return c;
    } catch (e) { return img; }
  }
  let artJob = 0;
  async function loadArt() {
    const rec = S.rec, art = rec && rec.assets.__artwork || null, job = ++artJob;
    if (!art) { artBlob = null; S.art = null; S.artState = "none"; return; }
    if (S.art && sameFile(art, artBlob)) { artBlob = art; S.artState = "ok"; return; }
    // what is on screen stays until the new picture is ready
    if (!S.art) { S.artState = "loading"; emit("art"); }
    try {
      const pic = lightCopy(await Studio.loadImage(await readAsset(art)));
      if (job !== artJob || S.rec !== rec) return;
      S.art = pic; artBlob = art; S.artState = "ok";
    } catch (e) {
      console.warn("artwork", e);
      if (job !== artJob || S.rec !== rec) return;
      S.art = null; artBlob = null; S.artState = "error";
    }
    emit("art");
  }
  async function hydrate() {
    const rec = S.rec; if (!rec) return;
    await loadArt();
    const keep = new Set();
    for (const e of rec.elements) {
      const kind = Studio.mediaType(e); // a scatter layer shows the file of the layer it was made from
      if ((kind !== "video" && kind !== "image") || !e.assetId) continue;
      const blob = rec.assets[e.assetId]; if (!blob) continue;
      keep.add(e.assetId);
      if (S.media[e.assetId] && sameFile(mediaBlob[e.assetId], blob)) { mediaBlob[e.assetId] = blob; continue; }
      dropMedia(e.assetId); mediaBlob[e.assetId] = blob;
      try {
        if (kind === "video") {
          await retry(() => blob.slice(0, 1).arrayBuffer());
          const v = document.createElement("video");
          v.muted = true; v.loop = true; v.playsInline = true; v.setAttribute("playsinline", ""); v.preload = "auto";
          v.__url = URL.createObjectURL(blob); v.src = v.__url; v.play().catch(() => {});
          S.media[e.assetId] = v;
        } else {
          S.media[e.assetId] = (await retry(() => Studio.makeImageMedia(blob, "m-" + e.assetId, null))).node;
        }
      } catch (err) { console.warn("media", err); delete mediaBlob[e.assetId]; }
    }
    Object.keys(S.media).forEach((id) => { if (!keep.has(id)) dropMedia(id); });
  }
  // iOS pauses muted videos when the page comes back from the background.
  // Back on the page is also the moment to try again whatever did not load.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    Object.values(S.media).forEach((m) => { if (m.tagName === "VIDEO" && m.paused) m.play().catch(() => {}); });
    if (S.rec && S.artState === "error") loadArt();
  });

  // ---------- saving ----------
  let saveTimer = 0;
  function save(opts) {
    clearTimeout(saveTimer); saveTimer = 0;
    const rec = S.rec; if (!rec) return Promise.resolve();
    return Studio.save(rec, opts).then(() => emit("history"), (e) => {
      if (e && e.deletedElsewhere) { toast("היצירה נמחקה בחלון אחר", { kind: "error" }); location.hash = "#/"; return; }
      toast("השמירה לא הצליחה. השינוי עדיין כאן, אפשר לנסות שוב.", { kind: "error", action: { label: "לנסות שוב", run: () => save() } });
    });
  }
  // Typing: one save (one undo step) when the hand rests.
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 600); }
  const flush = () => (saveTimer ? save() : Promise.resolve());

  // A layer's values changed. final=false while a slider or a drag is still moving.
  function changed(final) { emit("change"); if (final !== false) save(); }

  // ---------- open / close ----------
  async function open(id) {
    await flush();
    const rec = await Studio.load(id);
    if (!rec) return false;
    rec.elements = (rec.elements || []).filter(Boolean); rec.elements.forEach(Studio.normEl); rec.assets = rec.assets || {};
    S.rec = rec; S.selId = null; S.frozen = null; S.t0 = performance.now(); S.cropping = false; S.mode3d = false; S.pane = "layers";
    await hydrate();
    emit("open"); emit("history");
    return true;
  }
  async function close() {
    await flush();
    S.rec = null; S.selId = null; S.art = null; artBlob = null; S.artState = "none"; artJob++;
    Object.keys(S.media).forEach(dropMedia);
    emit("close");
  }

  function select(id) {
    id = id && el(id) ? id : null;
    if (id && el(id).locked) return; // a locked layer stays put: it is released from its row in the list
    if (S.selId === id) return;
    S.selId = id; S.cropping = false;
    emit("select");
  }

  // ---------- layers ----------
  function blocked(extra) { const b = Studio.addBlocker(S.rec, extra); if (b) toast(b, { kind: "error" }); return !!b; }
  async function addLayer(e, opts) {
    Studio.normEl(e);
    const after = opts && opts.after ? S.rec.elements.findIndex((x) => x.id === opts.after) : -1;
    if (opts && opts.behind) S.rec.elements.unshift(e); else if (after >= 0) S.rec.elements.splice(after + 1, 0, e); else S.rec.elements.push(e);
    await hydrate();
    S.selId = e.id; S.cropping = false;
    emit("structure"); emit("select");
    await save();
    return e;
  }
  const assetUsed = (id) => S.rec.elements.some((e) => e.assetId === id || (e.particles && e.particles.spriteAssetId === id));
  function sweepAssets() { Object.keys(S.rec.assets).forEach((id) => { if (id !== "__artwork" && !assetUsed(id)) delete S.rec.assets[id]; }); }
  async function removeLayer(id) {
    const e = el(id); if (!e) return;
    const kids = e.type === "group" ? e.children || [] : [];
    S.rec.elements = S.rec.elements.filter((x) => x.id !== id && !kids.includes(x.id));
    S.rec.elements.forEach((g) => { if (g.type === "group") g.children = (g.children || []).filter((c) => c !== id); });
    sweepAssets();
    if (S.selId === id) { S.selId = null; S.cropping = false; }
    await hydrate();
    emit("structure"); emit("select");
    await save();
    toast("השכבה נמחקה", { action: { label: "ביטול", run: undo } });
  }
  async function duplicateLayer(id) {
    if (blocked({ layers: 1 })) return;
    const nid = Studio.duplicateLayer(S.rec, id); if (!nid) return;
    const c = el(nid);
    if (!keyed(c) && c.type !== "group") { c.x = UI.clamp((c.x || 0) + 0.05, -0.7, 0.7); c.y = UI.clamp((c.y || 0) - 0.05, -0.7, 0.7); }
    S.selId = nid; S.cropping = false;
    emit("structure"); emit("select");
    await save();
  }
  // ---------- scatter along a path ----------
  // From a selected layer: the stage asks for the line, then addScatter makes the layer right above the source.
  function scatterFrom(id) {
    const src = el(id); if (!src) return;
    if (!Studio.SCATTER_TYPES.includes(src.type)) return toast("אפשר לפזר תמונה, GIF, סרטון, טקסט או מודל תלת־ממד", { kind: "warn" });
    if (src.type !== "text" && !(src.assetId && S.rec.assets[src.assetId])) return toast("הקובץ של השכבה הזו חסר, אז אי אפשר לפזר אותה", { kind: "error" });
    if (blocked({ layers: 1 })) return;
    Stage.startScatter(id);
  }
  async function addScatter(srcId, pts, curved) {
    const src = el(srcId); if (!src || blocked({ layers: 1 })) return null;
    const e = Studio.makeScatter(S.rec, src, pts, { curved });
    await addLayer(e, { after: srcId });
    setTab("style");
    toast("הפיזור מוכן. ״עומק בסוף״ מקרב את סוף הקו אלייך.", { ms: 6000 });
    return e;
  }
  // A new line for an existing scatter: its copies and settings stay, and so does the depth of its two ends.
  function redrawScatter(id, pts, curved) {
    const e = el(id); if (!e || e.type !== "scatter") return;
    const old = e.scatter.points, z0 = old[0].z || 0, z1 = old[old.length - 1].z || 0, x = pts.reduce((n, p) => n + p.x, 0) / pts.length, y = pts.reduce((n, p) => n + p.y, 0) / pts.length;
    if (keyed(e)) { const s0 = sample(e); e.timeline.keys.forEach((k) => { if (k.x != null) k.x += x - s0.x; if (k.y != null) k.y += y - s0.y; }); }
    e.x = x; e.y = y; e.rot = 0;
    e.scatter = Object.assign({}, e.scatter, { curved, points: pts.map((p, i) => ({ x: p.x - x, y: p.y - y, z: z0 + (z1 - z0) * i / Math.max(1, pts.length - 1) })) });
    Studio.refreshScatter(S.rec, e, true);
    changed(true);
  }
  // How far each end stands out of the picture. The points between follow the change in proportion to where they lie
  // along the line, so a height she gave a middle point in the 3D view is kept.
  function scatterDepth(e, end, z) {
    const P = e.scatter.points, n = P.length, dz = z - ((end ? P[n - 1].z : P[0].z) || 0);
    const len = [0]; for (let i = 1; i < n; i++) len.push(len[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y));
    const L = len[n - 1] || 1;
    P.forEach((p, i) => { const f = len[i] / L; p.z = Math.round(((p.z || 0) + dz * (end ? f : 1 - f)) * 10000) / 10000; });
    if (end) P[n - 1].z = z; else P[0].z = z;
  }
  async function breakScatter(id) {
    const e = el(id); if (!e || e.type !== "scatter") return;
    const n = Studio.scatterCopies(S.rec, e).length;
    if (blocked({ layers: n })) return;
    const g = Studio.breakScatter(S.rec, e);
    S.selId = g.id; S.cropping = false;
    await hydrate();
    emit("structure"); emit("select");
    await save();
    toast("העותקים הם עכשיו " + n + " שכבות רגילות, בתוך קבוצה", { action: { label: "ביטול", run: undo } });
  }

  // Order in the list is top first; in the record the last element is on top.
  function moveLayer(id, to) {
    const list = S.rec.elements, from = list.findIndex((e) => e.id === id);
    to = UI.clamp(to, 0, list.length - 1);
    if (from < 0 || from === to) return;
    list.splice(to, 0, list.splice(from, 1)[0]);
    emit("structure"); save();
  }

  // A locked layer cannot be picked, moved or changed until it is released.
  function setLocked(id, on) {
    const e = el(id); if (!e || !!e.locked === !!on) return;
    if (on) e.locked = true; else delete e.locked;
    if (on && S.selId === id) { S.selId = null; S.cropping = false; emit("select"); }
    emit("structure"); save();
  }

  // ---------- undo / redo ----------
  async function restore(dir) {
    if (!S.rec) return;
    await flush();
    const r = await Studio.restoreHistory(S.rec.id, dir);
    if (!r) return;
    r.elements.forEach(Studio.normEl);
    S.rec = r; if (!el(S.selId)) S.selId = null; S.cropping = false;
    await hydrate();
    emit("open"); emit("history");
  }
  const undo = () => restore("undo"), redo = () => restore("redo");

  // ---------- playhead ----------
  function freeze(t) { S.frozen = t == null ? null : Math.max(0, t); if (t == null) S.t0 = performance.now(); emit("time"); }
  function replay() { S.frozen = null; S.t0 = performance.now(); emit("time"); }
  // The key of a layer at time t (made when missing): where a drag on a moving layer writes.
  function keyAt(e, t) { return e.timeline.keys.find((k) => Math.abs(k.t - t) < 1e-6) || Studio.addTimelineKey(e, { t }); }
  // Before changing place/turn/size of a layer on the canvas: a moving layer is parked on a round time and gets a key there.
  function editKey(e) {
    if (!keyed(e)) return null;
    const t = Math.round(clock() * 10) / 10;
    freeze(t);
    return keyAt(e, t);
  }

  function setTab(tab, pane) { S.tab = tab || S.tab; S.pane = pane || "inspector"; emit("tab"); }
  function setPane(pane) { S.pane = pane; emit("tab"); }
  function setMode3d(on) { if (S.mode3d === !!on) return; S.mode3d = !!on; S.cropping = false; emit("mode"); }
  function setCropping(on) { S.cropping = !!on; emit("mode"); }

  return {
    on, emit, el, sel, keyed, clock, sample, hydrate, loadArt, save, saveSoon, flush, changed, open, close, select, blocked,
    addLayer, removeLayer, duplicateLayer, moveLayer, scatterFrom, addScatter, redrawScatter, scatterDepth, breakScatter, setLocked, undo, redo, freeze, replay, keyAt, editKey, setTab, setPane, setMode3d, setCropping,
    get rec() { return S.rec; }, get selId() { return S.selId; }, get art() { return S.art; }, get artBlob() { return artBlob; }, get artState() { return S.artState; }, get media() { return S.media; },
    get frozen() { return S.frozen; }, get tab() { return S.tab; }, get pane() { return S.pane; }, get mode3d() { return S.mode3d; },
    get cropping() { return S.cropping; }, get snap() { return S.snap; }, set snap(v) { S.snap = !!v; },
    set rec(r) { S.rec = r; }
  };
})();
