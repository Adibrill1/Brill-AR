"use strict";
/* Layers: the list of layers (top first), the "add" sheet, and bringing files into a creation - the artwork itself,
   pictures, videos, sounds, 3D models, time cubes and everything from the starter library. */
window.Layers = (() => {
  const { $, h, icon, toast, clamp } = UI;

  const TYPES = {
    image: { name: "תמונה", icon: "image", tint: "#5fb4ff" }, video: { name: "סרטון", icon: "video", tint: "#ff8f6b" },
    text: { name: "טקסט", icon: "text", tint: "#ffd166" }, sound: { name: "צליל", icon: "sound", tint: "#4cd4a0" },
    model: { name: "מודל 3D", icon: "cube", tint: "#b497ff" }, particles: { name: "חלקיקים", icon: "sparkle", tint: "#ff9ecb" },
    pattern: { name: "רקע מונפש", icon: "pattern", tint: "#7fe0e0" }, timecube: { name: "קוביית זמן", icon: "hourglass", tint: "#c4d86a" },
    group: { name: "קבוצה", icon: "layers", tint: "#9a97a6" }
  };
  const ACCEPT = {
    video: "video/mp4,video/webm,video/quicktime,.mov", image: "image/png,image/jpeg,image/gif",
    sound: "audio/mpeg,audio/mp4,audio/wav,audio/x-m4a,audio/ogg", model: ".glb,.gltf,.zip,.obj,.fbx",
    timecube: "video/mp4,video/webm,video/quicktime,.mov", artwork: "image/jpeg,image/png"
  };
  const phone = () => matchMedia("(max-width: 899px)").matches;
  const nextName = (type) => TYPES[type].name + " " + (App.rec.elements.filter((e) => e.type === type).length + 1);
  const artRatio = () => { const g = Studio.geom(App.rec); return g.artW / g.artH; };
  // An error whose text is meant for Adi (anything else gets a general message).
  const fail = (text) => { const e = new Error(text || "blocked"); e.say = text || ""; e.told = !text; return e; };
  const guard = (extra) => { if (App.blocked(extra)) throw fail(); };

  // ---------- the artwork ----------
  async function setArtwork(f) {
    const rec = App.rec; if (!rec || !f) return;
    if (!/^image\/(jpeg|png)$/.test(f.type)) return toast("צריך תמונה מסוג JPG או PNG", { kind: "error" });
    if (f.size > 8 * 1048576) return toast("התמונה גדולה מדי (עד 8MB)", { kind: "error" });
    const end = UI.busy("מכינה את תמונת היצירה…");
    try {
      const img = await Studio.loadImage(await Studio.blobToDataURL(f));
      const fp = Studio.artworkFingerprint(img), t = await Studio.makeTarget(img), first = !rec.target;
      rec.target = { artRect: t.artRect, natural: { w: img.naturalWidth, h: img.naturalHeight }, fp };
      rec.assets.__artwork = await Studio.ownBlob(f);
      // layers keep their place and width; their height follows the new proportions
      const r = artRatio();
      rec.elements.forEach((e) => { if (e.aspect && e.h != null && e.type !== "particles") e.h = (e.w / e.aspect) * r; });
      await App.hydrate();
      App.emit("open");
      await App.save();
      const q = Studio.assessTargetQuality(img);
      if (q && q.warn) toast(q.reason === "small" ? "התמונה קטנה, והמצלמה עלולה להתקשות לזהות אותה. עדיף תמונה חדה וגדולה יותר." : "בתמונה יש מעט פרטים, והמצלמה עלולה להתקשות לזהות אותה.", { kind: "warn", ms: 8000 });
      else toast(first ? "תמונת היצירה מוכנה. עכשיו מוסיפים שכבות." : "תמונת היצירה הוחלפה");
    } catch (e) { console.error(e); toast("התמונה לא נטענה. כדאי לנסות קובץ אחר.", { kind: "error" }); }
    finally { end(); }
  }
  async function pickArtwork() { const f = await UI.pickFile(ACCEPT.artwork); if (f) await setArtwork(f); }

  // ---------- files into layers ----------
  // A 3D model in any of the formats we take becomes one GLB file.
  async function toGlb(f) {
    const head = async (x) => new Uint8Array(await x.slice(0, 4).arrayBuffer());
    const glb = (bytes, name) => new File([bytes], name.replace(/\.[a-z0-9]+$/i, "") + ".glb", { type: "model/gltf-binary" });
    let m = await head(f);
    try {
      if (m[0] === 0x50 && m[1] === 0x4b) { const p = window.gltfZipToGlb(new Uint8Array(await f.arrayBuffer()), fflate); f = glb(p.bytes, p.name || f.name); }
      else if (/\.fbx$/i.test(f.name)) f = glb(await window.fbxToGlb(f), f.name);
      else if (/\.obj$/i.test(f.name)) {
        const bytes = window.objToGlb(await f.text());
        if (!bytes) throw fail("קובץ ה־OBJ ריק או לא קריא");
        f = glb(bytes, f.name);
      } else if (/\.gltf$/i.test(f.name)) {
        f = glb(window.gltfZipToGlb(fflate.zipSync({ "model.gltf": new TextEncoder().encode(await f.text()) }), fflate).bytes, f.name);
      }
    } catch (e) { if (e.say != null) throw e; console.warn(e); throw fail("המודל לא הומר: " + (e.message || "קובץ לא קריא") + ". הכי בטוח לייצא אותו כקובץ GLB אחד."); }
    m = await head(f);
    if (!(m[0] === 0x67 && m[1] === 0x6c && m[2] === 0x54 && m[3] === 0x46)) throw fail("זה לא נראה כמו מודל תלת־ממד. צריך קובץ GLB (או ZIP, FBX, OBJ).");
    try { return await Studio.prepareModelBlob(f); } catch (e) { throw fail("המודל לא נוסף: " + e.message); }
  }

  // The one way in for a file: from the "add" sheet, from a drop on the page and from the starter library.
  // Throws when nothing was added (an error with .say has words for a toast).
  async function importAsset(kind, f, options) {
    const o = options || {}, rec = App.rec;
    if (!rec || !rec.target) throw fail("קודם מעלים את תמונת היצירה");
    if (kind === "scene") return importScene(f.parts || []);
    if (!TYPES[kind] || ["text", "pattern", "group"].includes(kind)) throw fail("סוג הקובץ הזה לא נתמך");
    if (f.size > Studio.LIMITS.maxEntryBytes) throw fail("הקובץ גדול מדי (עד " + UI.fmtBytes(Studio.LIMITS.maxEntryBytes) + ")");
    guard({ layers: 1, bytes: f.size });
    const el = { id: Studio.newId(), type: kind, name: o.name || nextName(kind), x: 0, y: 0, w: 0.3, h: null, rot: 0, z: 0, flush: true, seq: null, aspect: 1 };
    const width = (d) => (o.w > 0 ? Math.min(2, o.w) : d);
    let note = "";

    if (kind === "particles") {
      Object.assign(el, { w: 0.6, h: 0.6, particles: Object.assign({ count: 120, color: "#ffffff" }, o.particles || {}, { preset: "custom" }) });
    } else if (kind === "video") {
      let info;
      try { info = await Studio.inspectVideo(f); if (!(info.width > 0 && info.height > 0)) throw 0; }
      catch (e) { throw fail(/\.mov$/i.test(f.name) || f.type === "video/quicktime" ? "הדפדפן לא מצליח לקרוא את ה־MOV הזה. כדאי לייצא אותו כ־MP4 ולנסות שוב." : "הסרטון לא נקרא. כדאי לנסות קובץ MP4."); }
      Object.assign(el, { aspect: info.width / info.height, w: width(1), volume: 1, loop: true });
      if (o.chroma) el.chroma = Object.assign({}, o.chroma);
    } else if (kind === "timecube") {
      const end = UI.busy("בונה קוביית זמן…");
      let cube;
      try { cube = await Studio.bakeTimeCube(f, { onProgress: (k) => end("בונה קוביית זמן… " + Math.round(k * 100) + "%") }); }
      catch (e) { console.warn(e); throw fail("קוביית הזמן לא נבנתה מהסרטון הזה. כדאי לנסות MP4 קצר."); }
      finally { end(); }
      f = new File([cube.blob], (f.name || "video").replace(/\.[a-z0-9]+$/i, "") + "-timecube.jpg", { type: "image/jpeg" });
      guard({ layers: 1, bytes: f.size });
      Object.assign(el, { aspect: cube.aspect, w: width(0.5), timecube: Object.assign({}, cube.meta, { dir: "front", edges: true, depth: 0.75 }, o.timecube || {}) });
      if (cube.trimmed) note = "קוביית הזמן נבנתה מ־" + Math.round(cube.meta.dur) + " השניות הראשונות של הסרטון";
    } else if (kind === "model") {
      f = await toGlb(f);
      guard({ layers: 1, bytes: f.size });
      Object.assign(el, { w: width(0.4), seat: "plane" });
      try {
        const clips = await Studio.modelClipInfo(f);
        el.clipDurations = clips.map((c) => c.duration);
        if (o.clip) { const i = clips.findIndex((c) => c.name === o.clip); if (i >= 0) el.modelClip = i; }
      } catch (e) {}
    } else if (kind === "image") {
      const mm = await Studio.makeImageMedia(f, "m-" + el.id, null);
      if (mm.animated || mm.staticFallback) el.aspect = mm.width / mm.height;
      else { const im = await Studio.loadImage(await Studio.blobToDataURL(f)); el.aspect = im.naturalWidth / im.naturalHeight; }
      if (mm.gifError) note = "ה־GIF לא נטען כאנימציה, והוא מוצג כתמונה רגילה";
      el.w = width(0.3);
    } else if (kind === "sound") { el.volume = 0.8; el.loop = true; }

    if (o.loop != null && (kind === "video" || kind === "sound")) el.loop = !!o.loop;
    if (kind !== "particles") el.h = kind === "model" ? null : (el.w / el.aspect) * artRatio();
    const assetId = Studio.newId();
    rec.assets[assetId] = await Studio.ownBlob(f);
    if (kind === "particles") el.particles.spriteAssetId = assetId; else el.assetId = assetId;
    await App.addLayer(el);
    if (note) toast(note, { ms: 6000 });
    return el;
  }

  // A ready scene from the library: several layers that arrive together (and leave together with one undo).
  async function importScene(parts) {
    const rec = App.rec;
    if (!parts.length) throw fail("הסצנה ריקה");
    guard({ layers: parts.length, bytes: parts.reduce((n, p) => n + (p.blob ? p.blob.size : 0), 0) });
    const r = artRatio(), made = [];
    for (const pt of parts) {
      const assetId = Studio.newId(), blob = await Studio.ownBlob(pt.blob);
      const el = { id: Studio.newId(), name: pt.name, x: pt.x || 0, y: pt.y || 0, z: pt.z || 0, w: pt.w || 0.3, rot: pt.rot || 0, flush: true, seq: null };
      if (pt.rotX) el.rotX = pt.rotX;
      if (pt.rotY) el.rotY = pt.rotY;
      if (pt.timeline) el.timeline = JSON.parse(JSON.stringify(pt.timeline));
      if (pt.type === "model") {
        Object.assign(el, { type: "model", assetId, aspect: 1, h: null, seat: "plane" });
        try {
          const clips = await Studio.modelClipInfo(blob);
          el.clipDurations = clips.map((c) => c.duration);
          if (pt.clip) { const i = clips.findIndex((c) => c.name === pt.clip); if (i >= 0) el.modelClip = i; }
        } catch (e) {}
      } else if (pt.type === "particles") {
        Object.assign(el, { type: "particles", h: pt.h || el.w, particles: Object.assign({}, pt.particles, { preset: "custom", spriteAssetId: assetId }) });
      } else Object.assign(el, { type: "image", assetId, aspect: 1, h: el.w * r });
      made.push([el, assetId, blob]);
    }
    made.forEach(([el, id, blob]) => { rec.assets[id] = blob; rec.elements.push(Studio.normEl(el)); });
    await App.hydrate();
    App.select(null);
    App.emit("structure");
    await App.save();
  }

  // Layers that need no file.
  function addText() {
    if (App.blocked({ layers: 1 })) return;
    const el = { id: Studio.newId(), type: "text", name: nextName("text"), text: "כותרת חדשה", color: "#ffffff", bold: true, x: 0, y: 0.35, w: 0.5, h: null, rot: 0, z: 0, flush: true, seq: null };
    Stage.fitText(el);
    return App.addLayer(el).then(() => { App.setTab("style"); App.emit("edit", el); });
  }
  function addPattern() {
    if (App.blocked({ layers: 1 })) return;
    const el = { id: Studio.newId(), type: "pattern", name: nextName("pattern"), pattern: Studio.patternDefaults("liquid"), x: 0, y: 0, w: 1, rot: 0, z: 0, flush: true, seq: null };
    el.aspect = Studio.patternAspect(App.rec, "art"); el.h = (el.w / el.aspect) * artRatio();
    return App.addLayer(el, { behind: true }).then(() => App.setTab("style"));
  }
  function addParticles() {
    if (App.blocked({ layers: 1 })) return;
    const el = { id: Studio.newId(), type: "particles", name: nextName("particles"), x: 0, y: 0, w: 0.6, h: 0.6, rot: 0, z: 0, flush: true, seq: null, particles: { preset: "sparkle", count: 120, color: "#ffd94d" } };
    return App.addLayer(el).then(() => App.setTab("style"));
  }

  // A file the user chose (or dropped): add it, and say in words when it did not work.
  async function addFile(kind, f) {
    const end = kind === "timecube" ? null : UI.busy("מוסיפה " + TYPES[kind].name + "…");
    try { await importAsset(kind, f); if (phone()) App.setTab("style"); return true; }
    catch (e) { if (!e.told) { if (e.say == null) console.error(e); toast(e.say || "הקובץ לא נוסף. כדאי לנסות קובץ אחר.", { kind: "error" }); } return false; }
    finally { if (end) end(); }
  }
  const kindOf = (f) => {
    const n = (f.name || "").toLowerCase(), t = f.type || "";
    if (/\.(glb|gltf|fbx|obj|zip)$/.test(n)) return "model";
    if (t.startsWith("video/") || /\.(mov|mp4|webm)$/.test(n)) return "video";
    if (t.startsWith("audio/") || /\.(mp3|m4a|wav|ogg)$/.test(n)) return "sound";
    if (/^image\/(png|jpeg|gif)$/.test(t)) return "image";
    return null;
  };
  async function addFiles(files) {
    if (!App.rec) return;
    if (!App.rec.target) { const img = files.find((f) => /^image\/(jpeg|png)$/.test(f.type)); return img ? setArtwork(img) : toast("קודם מעלים את תמונת היצירה (JPG או PNG)", { kind: "error" }); }
    for (const f of files) { const k = kindOf(f); if (!k) { toast("״" + f.name + "״: סוג קובץ לא נתמך", { kind: "error" }); continue; } await addFile(k, f); }
  }

  function openLibrary() {
    if (!App.rec.target) return needArt();
    window.StarterLibrary.open(async (kind, file, options) => {
      try { await importAsset(kind, file, options); }
      catch (e) { if (e.say) toast(e.say, { kind: "error" }); throw e; }
    });
  }
  function needArt() { toast("קודם מעלים את תמונת היצירה", { action: { label: "העלאה", run: pickArtwork } }); }

  // ---------- the "add" sheet ----------
  const ADD = [
    ["image", "תמונה", "PNG, JPG או GIF"], ["video", "סרטון", "MP4 או MOV"], ["text", "טקסט", "כותרת או ברכה"],
    ["pattern", "רקע מונפש", "צבעים שזזים"], ["particles", "חלקיקים", "נצנוצים וקונפטי"], ["model", "מודל תלת־ממד", "GLB, ZIP, FBX, OBJ"],
    ["sound", "צליל", "MP3, M4A, WAV"], ["timecube", "קוביית זמן", "סרטון שהופך לגוף"]
  ];
  function openAdd() {
    if (!App.rec) return;
    if (!App.rec.target) return needArt();
    const pick = (kind) => async () => {
      d.close();
      if (kind === "text") return addText();
      if (kind === "pattern") return addPattern();
      if (kind === "particles") return addParticles();
      const f = await UI.pickFile(ACCEPT[kind]);
      if (f) addFile(kind, f);
    };
    const tiles = ADD.map(([kind, name, hint]) => h("button.add-tile", { type: "button", onclick: pick(kind), style: { "--tint": TYPES[kind].tint } },
      h("span.add-ic", icon(TYPES[kind].icon, 24)), h("span.add-name", name), h("span.add-hint", hint)));
    const lib = h("button.add-library", { type: "button", onclick: () => { d.close(); openLibrary(); } },
      h("span.add-ic", icon("library", 24)), h("span", h("span.add-name", "מהספרייה"), h("span.add-hint", "דמויות, אפקטים, צלילים וסצנות מוכנות")), icon("back", 18));
    const d = UI.dialog({ title: "מה מוסיפים?", sheet: true, body: [lib, h("div.add-grid", tiles)] });
  }

  // ---------- the list ----------
  let list, artCard, drag = null;
  function thumb(e) {
    const t = TYPES[e.type] || TYPES.group, rec = App.rec;
    const box = h("span.layer-thumb", { style: { "--tint": t.tint } });
    const blob = e.type === "image" && e.assetId && rec.assets[e.assetId];
    if (blob) { const im = h("img", { alt: "", draggable: false }); im.src = Studio.blobURL(blob); im.onerror = () => im.replaceWith(icon(t.icon, 18)); box.append(im); }
    else if (e.type === "text") box.append(h("span.layer-thumb-text", { style: { color: e.textStyle === "cut" ? null : e.color } }, (e.text || "א").trim().slice(0, 1) || "א"));
    else box.append(icon(t.icon, 18));
    return box;
  }
  const sub = (e) => {
    const t = (TYPES[e.type] || TYPES.group).name, bits = [t];
    if (App.keyed(e)) bits.push("בתנועה"); else if (e.anim && e.anim !== "none") bits.push({ spin: "מסתובב", float: "מרחף", pulse: "פועם" }[e.anim] || "");
    if (e.onTap && e.onTap !== "none") bits.push("מגיב למגע");
    return bits.filter(Boolean).join(" · ");
  };
  async function rename(id) {
    const e = App.el(id); if (!e) return;
    const v = await UI.prompt({ title: "שם השכבה", value: e.name || "" });
    if (v && App.el(id)) { App.el(id).name = v; App.emit("structure"); App.save(); }
  }
  function rowMenu(btn, e) {
    const els = App.rec.elements, i = els.indexOf(e), top = els.length - 1;
    UI.menu(btn, [
      { label: "שינוי שם", icon: "edit", run: () => rename(e.id) },
      { label: "שכפול", icon: "copy", run: () => App.duplicateLayer(e.id) },
      null,
      i < top ? { label: "לחזית", icon: "up", run: () => App.moveLayer(e.id, top) } : false,
      i < top ? { label: "שלב אחד קדימה", icon: "up", run: () => App.moveLayer(e.id, i + 1) } : false,
      i > 0 ? { label: "שלב אחד אחורה", icon: "down", run: () => App.moveLayer(e.id, i - 1) } : false,
      i > 0 ? { label: "לרקע", icon: "down", run: () => App.moveLayer(e.id, 0) } : false,
      els.length > 1 ? null : false,
      { label: "מחיקה", icon: "trash", danger: true, run: () => App.removeLayer(e.id) }
    ].filter((x) => x !== false));
  }
  function render() {
    const rec = App.rec; if (!rec || !list) return;
    const els = rec.elements.slice().reverse();
    list.replaceChildren();
    $("layer-count").textContent = els.length ? String(els.length) : "";
    if (!els.length) {
      list.append(h("div.layers-empty", icon("layers", 28), h("p", rec.target ? "עדיין אין שכבות. מוסיפים תמונה, סרטון, טקסט או משהו מהספרייה, והם יופיעו מעל היצירה." : "מתחילים בתמונת היצירה: התמונה שהמצלמה תזהה."),
        rec.target ? UI.button("הוספת שכבה", openAdd, { kind: "primary", icon: "plus" }) : UI.button("העלאת תמונת היצירה", pickArtwork, { kind: "primary", icon: "upload" })));
    }
    for (const e of els) {
      const more = h("button.icon-btn.row-more", { "aria-label": "עוד פעולות: " + (e.name || ""), "aria-haspopup": "menu", onclick: (ev) => { ev.stopPropagation(); rowMenu(more, e); } }, icon("more", 18));
      const grip = h("span.row-grip", { title: "גרירה לשינוי הסדר" }, icon("grip", 18));
      const row = h("div.layer-row" + (e.id === App.selId ? ".on" : ""), { role: "option", tabIndex: 0, "aria-selected": String(e.id === App.selId), data: { id: e.id } },
        grip, thumb(e), h("span.layer-text", h("span.layer-name", e.name || ""), h("span.layer-sub", sub(e))), more);
      row.onclick = () => { App.select(e.id); if (phone()) App.setTab(null, "inspector"); };
      row.ondblclick = () => rename(e.id);
      row.onkeydown = (ev) => { if (ev.target === row && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); row.click(); } };
      grip.onpointerdown = (ev) => startDrag(ev, row, e.id);
      grip.onclick = (ev) => ev.stopPropagation();
      list.append(row);
    }
    renderArt();
  }
  function markSelected() {
    if (!list) return;
    list.querySelectorAll(".layer-row").forEach((r) => { const on = r.dataset.id === App.selId; r.classList.toggle("on", on); r.setAttribute("aria-selected", String(on)); if (on) r.scrollIntoView({ block: "nearest" }); });
  }
  function renderArt() {
    const rec = App.rec;
    artCard.replaceChildren();
    if (!rec || !rec.target || !rec.assets.__artwork) { artCard.hidden = true; return; }
    artCard.hidden = false;
    const im = h("img", { alt: "", draggable: false }); im.src = Studio.blobURL(rec.assets.__artwork);
    artCard.append(h("span.layer-thumb.art", im), h("span.layer-text", h("span.layer-name", "תמונת היצירה"), h("span.layer-sub", "מה שהמצלמה מזהה")),
      h("button.btn.ghost.small", { type: "button", onclick: pickArtwork }, "החלפה"));
  }

  // Reorder by dragging the grip: the row follows the finger, the others make room.
  function startDrag(ev, row, id) {
    if (ev.button > 0) return;
    ev.preventDefault(); ev.stopPropagation();
    const rows = [...list.querySelectorAll(".layer-row")], from = rows.indexOf(row), rh = row.getBoundingClientRect().height + 6;
    drag = { id, from, to: from, y0: ev.clientY, rows, rh, row };
    row.classList.add("dragging"); list.classList.add("sorting");
    row.setPointerCapture(ev.pointerId);
    row.onpointermove = (e) => {
      const dy = e.clientY - drag.y0;
      drag.to = clamp(Math.round(from + dy / rh), 0, rows.length - 1);
      row.style.transform = "translateY(" + clamp(dy, -from * rh, (rows.length - 1 - from) * rh) + "px)";
      rows.forEach((r, i) => { if (r === row) return; const shift = i > from && i <= drag.to ? -rh : i < from && i >= drag.to ? rh : 0; r.style.transform = shift ? "translateY(" + shift + "px)" : ""; });
    };
    const done = (e) => {
      row.onpointermove = row.onpointerup = row.onpointercancel = null;
      const d = drag; drag = null;
      list.classList.remove("sorting");
      rows.forEach((r) => { r.style.transform = ""; r.classList.remove("dragging"); });
      if (e.type === "pointerup" && d.to !== d.from) App.moveLayer(id, rows.length - 1 - d.to);
    };
    row.onpointerup = done; row.onpointercancel = done;
  }

  function init() {
    list = $("layer-list"); artCard = $("art-card");
    $("btn-add").onclick = openAdd;
    $("btn-empty-art").onclick = pickArtwork;
    App.on("open structure", render);
    App.on("select", markSelected);
    App.on("change", () => {
      // names and the small description under them follow the inspector
      if (drag) return;
      list.querySelectorAll(".layer-row").forEach((r) => { const e = App.el(r.dataset.id); if (!e) return; const n = r.querySelector(".layer-name"), s = r.querySelector(".layer-sub"); if (n.textContent !== (e.name || "")) n.textContent = e.name || ""; const t = sub(e); if (s.textContent !== t) s.textContent = t; });
    });
    // files dropped anywhere on the editor
    const ed = $("editor");
    ed.addEventListener("dragover", (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) { e.preventDefault(); ed.classList.add("dropping"); } });
    ed.addEventListener("dragleave", (e) => { if (!ed.contains(e.relatedTarget)) ed.classList.remove("dropping"); });
    ed.addEventListener("drop", (e) => { ed.classList.remove("dropping"); if (!e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); addFiles([...e.dataTransfer.files]); });
  }

  return { init, render, openAdd, openLibrary, importAsset, pickArtwork, setArtwork, addFiles, rename, TYPES, phone };
})();
