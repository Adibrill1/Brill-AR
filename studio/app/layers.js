"use strict";
/* Layers: the list of layers (top first), the "add" sheet, and bringing files into a creation - the artwork itself,
   pictures, videos, sounds, 3D models, time cubes and everything from the starter library. */
window.Layers = (() => {
  const { $, h, icon, toast, clamp } = UI;

  const TYPES = {
    image: { name: "תמונה", icon: "image", tint: "#5fb4ff" }, video: { name: "סרטון", icon: "video", tint: "#ff8f6b" },
    text: { name: "טקסט", icon: "text", tint: "#ffd166" }, sound: { name: "צליל", icon: "sound", tint: "#4cd4a0" },
    model: { name: "מודל 3D", icon: "cube", tint: "#b497ff" }, particles: { name: "חלקיקים", icon: "sparkle", tint: "#ff9ecb" },
    pattern: { name: "רקע מונפש", icon: "pattern", tint: "#7fe0e0" }, split: { name: "פירוק לשכבות", icon: "layers", tint: "#9ad0ff" }, timecube: { name: "קוביית זמן", icon: "hourglass", tint: "#c4d86a" },
    group: { name: "קבוצה", icon: "layers", tint: "#9a97a6" }, scatter: { name: "פיזור על נתיב", icon: "path", tint: "#f2a65a" },
    fan: { name: "מניפה", icon: "fan", tint: "#f2a65a" }, weather: { name: "מזג אוויר", icon: "sun", tint: "#ffc061" },
    codefx: { name: "אנימציית קוד", icon: "sparkle", tint: "#c58bff" }
  };
  // A scatter laid out as a fan shows as a fan.
  // A sun or smoke drawn by the pattern shader shows as weather.
  const typeOf = (e) => (e && e.type === "scatter" && e.scatter && e.scatter.layout === "fan" ? TYPES.fan : Studio.isWeather(e) ? TYPES.weather : TYPES[e && e.type] || TYPES.group);
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
      rec.target = { artRect: t.artRect, natural: { w: img.naturalWidth, h: img.naturalHeight }, fp, ph: Portal.phash(img) }; // ph: the portal's "same artwork" check (portal.js)
      rec.assets.__artwork = await Studio.ownBlob(f);
      delete rec.assets.__artworkOrig; // a new picture starts upright
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
  async function pickArtwork() { const f = await UI.pickFile(ACCEPT.artwork); if (f) await chooseArtwork(f); }
  // A picture was chosen: she may cut it down to the artwork itself before it becomes the target (closing the sheet cancels).
  async function chooseArtwork(f) {
    if (!/^image\/(jpeg|png)$/.test(f.type) || f.size > 8 * 1048576) return setArtwork(f); // setArtwork says what is wrong
    const cut = await cropStep(f).catch((e) => { console.warn(e); return f; });
    if (cut) await setArtwork(cut);
  }
  // The crop sheet: the picture with a frame over it; the corners resize the frame, its middle moves it. Resolves with
  // the same file when the frame holds the whole picture, a new file cut to the frame, or null when she closed the sheet.
  function cropStep(f) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(f), r = { x: 0, y: 0, w: 1, h: 1 }, MIN = 0.08;
      const img = h("img", { alt: "", draggable: false }), frame = h("div.crop-frame", ["nw", "ne", "sw", "se"].map((c) => h("i.crop-h", { data: { c } })));
      const box = h("div.crop-box", img, frame), size = h("span.crop-size");
      const show = () => { Object.assign(frame.style, { left: r.x * 100 + "%", top: r.y * 100 + "%", width: r.w * 100 + "%", height: r.h * 100 + "%" });
        size.textContent = img.naturalWidth ? Math.round(r.w * img.naturalWidth) + " × " + Math.round(r.h * img.naturalHeight) : ""; };
      let drag = null;
      frame.onpointerdown = (e) => { e.preventDefault(); frame.setPointerCapture(e.pointerId); drag = { c: e.target.dataset.c || "", x: e.clientX, y: e.clientY, r: Object.assign({}, r) }; };
      frame.onpointermove = (e) => {
        if (!drag) return;
        const b = box.getBoundingClientRect(), dx = (e.clientX - drag.x) / b.width, dy = (e.clientY - drag.y) / b.height, o = drag.r, c = drag.c;
        if (!c) { r.x = UI.clamp(o.x + dx, 0, 1 - o.w); r.y = UI.clamp(o.y + dy, 0, 1 - o.h); }
        else {
          let x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.h;
          if (c.includes("w")) x0 = UI.clamp(o.x + dx, 0, x1 - MIN); else x1 = UI.clamp(x1 + dx, x0 + MIN, 1);
          if (c.includes("n")) y0 = UI.clamp(o.y + dy, 0, y1 - MIN); else y1 = UI.clamp(y1 + dy, y0 + MIN, 1);
          r.x = x0; r.y = y0; r.w = x1 - x0; r.h = y1 - y0;
        }
        show();
      };
      frame.onpointerup = frame.onpointercancel = () => { drag = null; };
      let out = null;
      const ok = h("button.btn.primary", { id: "crop-ok", type: "button", onclick: async () => {
        try {
          if (r.w > 0.995 && r.h > 0.995) out = f;
          else {
            const c = document.createElement("canvas"), W = img.naturalWidth, H = img.naturalHeight;
            c.width = Math.max(1, Math.round(r.w * W)); c.height = Math.max(1, Math.round(r.h * H));
            c.getContext("2d").drawImage(img, Math.round(r.x * W), Math.round(r.y * H), c.width, c.height, 0, 0, c.width, c.height);
            const blob = await new Promise((done) => c.toBlob(done, f.type, 0.95));
            out = blob ? new File([blob], f.name, { type: f.type }) : f;
          }
        } catch (e) { console.warn(e); out = f; }
        d.close();
      } }, "המשך");
      const all = h("button.btn.ghost", { type: "button", onclick: () => { Object.assign(r, { x: 0, y: 0, w: 1, h: 1 }); show(); } }, "כל התמונה");
      const d = UI.dialog({ title: "חיתוך התמונה", body: [h("p.dlg-text", "אפשר לגרור את הפינות כדי להשאיר רק את היצירה עצמה. אם התמונה כבר מדויקת, פשוט ממשיכים."), box, size], foot: [all, ok],
        onClose: () => { URL.revokeObjectURL(url); res(out); } });
      d.classList.add("crop-dlg");
      img.onload = show; img.onerror = () => { out = f; d.close(); };
      img.src = url; show();
    });
  }
  // A quarter turn clockwise, as many times as she likes. The picture is drawn again from the file she uploaded (kept
  // aside as __artworkOrig while it is turned), never from the last turned copy, so turning four times gives back the
  // very same file and no turn loses anything. The layers turn with it: the creation looks on the artwork as before.
  // One undo step per turn. upright: the layers keep their own direction on the screen and only move with the picture.
  let turning = false;
  async function rotateArtwork(upright) {
    const rec = App.rec; if (!rec || !rec.target || !rec.assets.__artwork || turning) return;
    turning = true; const end = UI.busy("מסובבת את התמונה…");
    try {
      await App.flush();
      // a copy without the original (a published or JSON-exported one) starts counting from what it has
      const orig = rec.assets.__artworkOrig || rec.assets.__artwork, turn = ((rec.assets.__artworkOrig ? rec.target.turn || 0 : 0) + 1) % 4;
      const blob = turn ? await Studio.turnImageBlob(orig, turn) : orig;
      const img = await Studio.loadImageBlob(blob), t = await Studio.makeTarget(img), before = Studio.geom(rec);
      rec.target = Object.assign({}, rec.target, { artRect: t.artRect, natural: { w: img.naturalWidth, h: img.naturalHeight }, fp: Studio.artworkFingerprint(img), ph: Portal.phash(img), turn });
      if (!turn) delete rec.target.turn;
      rec.assets.__artwork = blob;
      if (turn) rec.assets.__artworkOrig = orig; else delete rec.assets.__artworkOrig;
      Studio.turnLayers(rec, before, Studio.geom(rec), !!upright);
      App.changed(false);
      await App.hydrate();
      App.emit("open");
      await App.save();
      if (rec.elements.length && !upright) toast("התמונה הסתובבה, והשכבות איתה", { ms: 7000, action: { label: "שכבות ישרות", run: async () => { await App.undo(); rotateArtwork(true); } } });
      else toast("התמונה הסתובבה");
    } catch (e) { console.error(e); toast("לא הצלחתי לסובב את התמונה. אפשר לנסות שוב.", { kind: "error" }); }
    finally { end(); turning = false; }
  }

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
    if (!TYPES[kind] || ["text", "pattern", "group"].includes(kind)) throw fail("סוג הקובץ הזה לא נתמך");
    if (f.size > Studio.LIMITS.maxEntryBytes) throw fail("הקובץ גדול מדי (עד " + UI.fmtBytes(Studio.LIMITS.maxEntryBytes) + ")");
    guard({ layers: 1, bytes: f.size });
    const el = { id: Studio.newId(), type: kind, name: o.name || nextName(kind), x: 0, y: 0, w: 0.3, h: null, rot: 0, z: 0, flush: true, seq: null, aspect: 1 };
    const width = (d) => (o.w > 0 ? Math.min(2, o.w) : d);
    let note = "";

    if (kind === "particles") {
      Object.assign(el, { w: o.w > 0 ? Math.min(2, o.w) : 0.6, h: o.h > 0 ? Math.min(2, o.h) : 0.6, particles: Object.assign({ count: 120, color: "#ffffff" }, o.particles || {}, { preset: "custom" }) });
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
    // a backdrop: behind everything, cut to the artwork's shape and covering it
    await App.addLayer(el, o.fill && kind === "video" ? { behind: true } : null);
    if (o.fill && kind === "video") Inspector.fillArt(0);
    if (note) toast(note, { ms: 6000 });
    return el;
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
  function addSolid() {
    if (App.blocked({ layers: 1 })) return;
    const el = { id: Studio.newId(), type: "pattern", name: "צבע אחיד", pattern: Studio.patternDefaults("solid"), x: 0, y: 0, w: 1, rot: 0, z: 0, flush: true, seq: null };
    el.aspect = Studio.patternAspect(App.rec, "art"); el.h = (el.w / el.aspect) * artRatio();
    return App.addLayer(el, { behind: true }).then(() => App.setTab("style"));
  }
  // "רקעים": a flat colour, a moving pattern, or a filmed loop of nature from the library - each lands behind the layers.
  function openBackgrounds() {
    const nature = (window.StarterLibrary && window.StarterLibrary.backdrops) || [];
    let busy = false;
    const tile = (id, name, pic, run) => h("button.part-tile", { type: "button", data: { bg: id }, onclick: async () => {
      if (busy) return; busy = true;
      try { await run(); } catch (e) { if (e.say == null) console.warn(e); toast(e.say || "הרקע לא נוסף. אפשר לנסות שוב.", { kind: "error" }); } finally { busy = false; }
    } }, h("span.part-pic", pic), h("span.part-name", name));
    const swatch = (css) => h("span.bg-swatch", { style: { background: css } });
    const tiles = [
      tile("solid", "צבע אחיד", swatch("#7b5cff"), async () => { d.close(); await addSolid(); }),
      tile("pattern", "רקע מונפש", swatch("linear-gradient(135deg,#ff6b9a,#7b5cff 55%,#ffd36e)"), async () => { d.close(); await addPattern(); })
    ].concat(nature.map((n) => tile(n.id, n.name, h("img", { src: "library/" + n.thumb, alt: "", loading: "lazy", draggable: false }), async () => {
      const end = UI.busy("מוסיפה רקע…");
      try {
        const r = await fetch("library/" + n.file); if (!r.ok) throw new Error("download");
        const f = new File([await r.blob()], n.file.split("/").pop(), { type: "video/mp4" });
        d.close(); await importAsset("video", f, { name: n.name, w: 1, fill: true, loop: true }); App.setTab("style");
      } finally { end(); }
    })));
    const d = UI.dialog({ title: "איזה רקע?", sheet: true, body: [h("div.part-grid", tiles), h("p.note", icon("image", 18), h("span", "הרקע מכסה את כל היצירה ונכנס מאחורי שאר השכבות. אחר כך אפשר לשנות צבעים, גודל ושקיפות."))] });
  }
  function addParticles() {
    if (App.blocked({ layers: 1 })) return;
    const el = { id: Studio.newId(), type: "particles", name: nextName("particles"), x: 0, y: 0, w: 0.6, h: 0.6, rot: 0, z: 0, flush: true, seq: null, particles: { preset: "sparkle", count: 120, color: "#ffd94d" } };
    return App.addLayer(el).then(() => App.setTab("style"));
  }

  // A sun or smoke: drawn by the pattern shader on a transparent layer above the others (not behind, like a background).
  function addWeather(look) {
    if (App.blocked({ layers: 1 })) return;
    const w = Studio.WEATHER.find((x) => x.id === look), pattern = Studio.patternDefaults(look), sun = look === "sun";
    const el = { id: Studio.newId(), type: "pattern", name: w.name, pattern, x: sun ? 0.18 : 0, y: sun ? 0.22 : look === "fire" ? -0.15 : -0.05, w: sun ? 0.6 : look === "fire" ? 0.5 : 0.7, rot: 0, z: 0, flush: true, seq: null };
    el.aspect = Studio.patternAspect(App.rec, pattern.shape); el.h = (el.w / el.aspect) * artRatio();
    return App.addLayer(el).then(() => App.setTab("style"));
  }
  // "מזג אוויר": the sun and smoke (with their own controls), the filmed weather loops and the weather particles.
  function openWeather() {
    const L = window.StarterLibrary || {}, vids = L.weather || [], parts = L.weatherParticles || [];
    let busy = false;
    const run = (fn) => async () => {
      if (busy) return; busy = true;
      try { await fn(); } catch (e) { if (e.say == null) console.warn(e); toast(e.say || "לא נוסף. אפשר לנסות שוב.", { kind: "error" }); } finally { busy = false; }
    };
    const fetchFile = async (file, type) => { const r = await fetch("library/" + file); if (!r.ok) throw new Error("download"); return new File([await r.blob()], file.split("/").pop(), { type }); };
    const pic = (src) => h("img", { src, alt: "", loading: "lazy", draggable: false });
    const drawn = (look) => { try { return pic(Studio.patternFrame({ type: "pattern", pattern: Studio.patternDefaults(look) }, 96, 96, 4).toDataURL()); } catch (e) { return icon("sun", 28); } };
    const tile = (id, name, p, fn) => h("button.part-tile", { type: "button", data: { weather: id }, onclick: run(fn) }, h("span.part-pic.wx-pic", p), h("span.part-name", name));
    const coded = (id, name) => tile(id, name, pic("library/codefx/" + id + ".jpg"), async () => { d.close(); await addCodeFx(id); }); // looks drawn in code that are weather too
    const tiles = Studio.WEATHER.map((w) => tile(w.id, w.name, drawn(w.id), async () => { d.close(); await addWeather(w.id); }))
      .concat([coded("aurora", "זוהר צפוני"), coded("mist", "אדים על זכוכית"), coded("daysky", "שמיים לפי השעה"), coded("storm", "ברקים וסערה")])
      .concat(vids.map((v) => tile(v.id, v.name, pic("library/" + v.thumb), async () => {
        const end = UI.busy("מוסיפה " + v.name + "…");
        try { const f = await fetchFile(v.file, "video/mp4"); d.close(); await importAsset("video", f, { name: v.name, w: v.w, loop: true, chroma: v.chroma }); App.setTab("style"); } finally { end(); }
      })))
      .concat(parts.map((st) => tile(st.id, st.name, pic("library/" + st.thumb), async () => {
        const end = UI.busy("מוסיפה " + st.name + "…");
        try { const f = await fetchFile(st.file, "image/png"); d.close(); await importAsset("particles", f, { name: st.name, particles: st.particles, w: st.w, h: st.h }); App.setTab("style"); } finally { end(); }
      })));
    const d = UI.dialog({ title: "איזה מזג אוויר?", sheet: true, body: [h("div.part-grid", tiles), h("p.note", icon("sun", 18), h("span", "בשמש, בעשן ובאש אפשר לבחור סוג, גודל, עוצמה וגוון. בזוהר הצפוני, באדים, בשמיים לפי השעה ובברקים אפשר לשנות צבעים, מהירות וכמות. בשאר אפשר לשנות גודל, שקיפות וכמות."))] });
  }
  // "אנימציות קוד": live animations drawn in code (codefx.js), and the holographic foil for a picture or a text.
  async function addCodeFx(look) {
    if (App.blocked({ layers: 1 })) return;
    const fx = Studio.codeFxDefaults(look), d = Studio.CODEFX.find((c) => c.id === look), A = artRatio(), rec = App.rec;
    const el = { id: Studio.newId(), type: "codefx", name: d.name, codefx: fx, x: 0, y: 0, w: 1, rot: 0, z: 0, flush: true, seq: null };
    let replace = null;
    if (Studio.CODEFX_PICTURE.includes(look)) {
      // the selected picture falls apart (or burns) in its own place (it is replaced; the artwork itself is the default)
      const s = App.sel();
      if (s && s.type === "image" && s.assetId && rec.assets[s.assetId] && !Studio.groupOf(rec, s.id) && !App.keyed(s)) {
        replace = s; fx.picture = s.assetId; fx.cover = false;
        Object.assign(el, { name: ({ burn: "שריפה ", ripple: "מים ", shatter: "ניפוץ ", rain: "גשם ", mist: "אדים ", drip: "נזילה ", sketch: "ציור ", sand: "חול ", tunnel: "מנהרה ", lens: "גילוי ", scratch: "גירוד ", puzzle: "פאזל ", dissolve: "פירוק " }[look] || "") + (s.name || "תמונה"), x: s.x, y: s.y, w: s.w, rot: s.rot || 0, z: s.z || 0, aspect: s.crop ? (s.aspect || 1) * s.crop.h / s.crop.w : s.aspect || 1 });
      } else el.aspect = A;
    } else if (look === "dust") Object.assign(el, { aspect: window.StudioCodeFx ? StudioCodeFx.wordsAspect(fx.text, "heebo") : 2.6, w: 0.8, y: 0.05 });
    else if (look === "portal") Object.assign(el, { aspect: A, w: 0.7 });
    else if (look === "spiral") Object.assign(el, { aspect: 1, w: Math.min(0.7, 0.7 * A) });
    else if (look === "eyes") Object.assign(el, { aspect: 2, w: 0.6 }); // one eye, the size of a face
    else if (look === "countdown") Object.assign(el, { aspect: 2.2, w: 0.85 });
    else el.aspect = A; // a school or vines: around the whole artwork
    el.h = (el.w / el.aspect) * A;
    await App.addLayer(el, replace ? { after: replace.id } : undefined);
    if (replace) { await App.removeLayer(replace.id); App.select(el.id); toast("התמונה הפכה ל״" + d.name + "״. אפשר לבטל בחץ אחורה."); }
    App.setTab("style");
  }
  function addFoil() {
    const s = App.sel();
    if (!s || !["image", "text"].includes(s.type)) return toast("בוחרים קודם תמונה, מדבקה או טקסט, ואז מוסיפים לה ברק הולוגרפי.", { kind: "warn" });
    s.fx = "holo"; if (s.fxAmount == null) s.fxAmount = 0.5;
    App.changed(true); App.setTab("style");
    toast("נוסף ברק הולוגרפי. במצלמה הקשת זזה כשמזיזים את הטלפון.");
  }
  function openCodeFx() {
    let busy = false;
    const tile = (id, name, css, run) => h("button.part-tile", { type: "button", data: { codefx: id }, onclick: async () => {
      if (busy) return; busy = true;
      try { d.close(); await run(); } catch (e) { if (e.say == null) console.warn(e); toast(e.say || "לא נוסף. אפשר לנסות שוב.", { kind: "error" }); } finally { busy = false; }
    } }, h("span.part-pic", { style: { background: css } }, h("img", { src: "library/codefx/" + id + ".jpg", alt: "", loading: "lazy", draggable: false, onerror: (e) => e.target.remove() })), h("span.part-name", name));
    const grad = (c) => "radial-gradient(circle at 35% 35%," + c[2] + "," + c[1] + " 45%," + c[0] + ")"; // behind the cover picture, while it loads
    const tiles = Studio.CODEFX.map((c) => tile(c.id, c.name, grad(c.colors), () => addCodeFx(c.id)))
      .concat(tile("holo", "ברק הולוגרפי", "linear-gradient(120deg,#ff9ad5,#9ad0ff,#b8ffcf,#fff3a8,#ff9ad5)", async () => addFoil()));
    const d = UI.dialog({ title: "איזו אנימציה?", sheet: true, body: [h("div.part-grid", tiles),
      h("p.note", icon("sparkle", 18), h("span", "אנימציות שנכתבו בקוד ורצות חי. אפשר לשנות צבעים, מהירות וכמות. ״תמונה שמתפרקת״, ״התפוגגות בוערת״, ״אדוות מים״, ״זכוכית מתנפצת״, ״גשם על חלון״, ״אדים על זכוכית״, ״צבע שנוזל״, ״ציור שמצטייר״, ״חול נושב ברוח״, ״מנהרת זמן״, ״גילוי מקרוב״, ״כרטיס גירוד״ ו״פאזל״ פועלות על התמונה שבחרת, ובלי בחירה על תמונת היצירה. ״ברק הולוגרפי״ מתווסף לתמונה או לטקסט שבחרת."))] });
  }
  // "תמונה": a picture from the device, or one of the ready stickers.
  function openImages() {
    const stickers = (window.StarterLibrary && window.StarterLibrary.stickers) || [];
    if (!stickers.length) return UI.pickFile(ACCEPT.image).then((f) => f && addFile("image", f));
    let busy = false;
    const own = h("button.part-tile", { type: "button", data: { image: "own" }, onclick: async () => { d.close(); const f = await UI.pickFile(ACCEPT.image); if (f) addFile("image", f); } },
      h("span.part-pic", icon("upload", 28)), h("span.part-name", "מהמכשיר"));
    const tiles = stickers.map((st) => h("button.part-tile", { type: "button", data: { image: st.id }, onclick: async () => {
      if (busy) return; busy = true;
      try { const r = await fetch("library/" + st.file); if (!r.ok) throw new Error("download"); const f = new File([await r.blob()], st.file.split("/").pop(), { type: "image/png" }); d.close(); await addFile("image", f); }
      catch (e) { toast("המדבקה לא נוספה. אפשר לנסות שוב.", { kind: "error" }); } finally { busy = false; }
    } }, h("span.part-pic", h("img", { src: "library/" + st.thumb, alt: "", loading: "lazy", draggable: false })), h("span.part-name", st.name)));
    const d = UI.dialog({ title: "איזו תמונה?", sheet: true, body: [h("div.part-grid", own, tiles)] });
  }

  // The ready particle styles: every tile shows the particles as they will look on the artwork.
  function openParticles() {
    const styles = (window.StarterLibrary && window.StarterLibrary.particleStyles) || [];
    if (!styles.length) return addParticles();
    let busy = false;
    const put = async (get, options) => {
      if (busy) return; busy = true;
      const end = UI.busy("מוסיפה חלקיקים…");
      try { const f = await get(); d.close(); await importAsset("particles", f, options); App.setTab("style"); }
      catch (e) { if (e.say == null) console.warn(e); toast(e.say || "החלקיקים לא נוספו. אפשר לנסות שוב.", { kind: "error" }); }
      finally { end(); busy = false; }
    };
    const tiles = styles.map((st) => h("button.part-tile", { type: "button", data: { style: st.id }, onclick: () => put(async () => {
      const r = await fetch("library/" + st.file); if (!r.ok) throw new Error("download");
      return new File([await r.blob()], st.file.split("/").pop(), { type: "image/png" });
    }, { name: st.name, particles: st.particles, w: st.w, h: st.h }) }, h("span.part-pic", h("img", { src: "library/" + st.thumb, alt: "", loading: "lazy", draggable: false })), h("span.part-name", st.name)));
    const own = h("button.part-tile", { type: "button", onclick: async () => {
      const f = await UI.pickFile("image/png,image/webp"); if (!f) return;
      if (f.size > 2 * 1048576) return toast("תמונת החלקיק גדולה מדי (עד 2MB)", { kind: "error" });
      put(async () => f, {});
    } }, h("span.part-pic", icon("image", 28)), h("span.part-name", "תמונה משלי"));
    const d = UI.dialog({ title: "אילו חלקיקים?", sheet: true, body: [h("div.part-grid", tiles, own), h("p.note", icon("sparkle", 18), h("span", "אחרי ההוספה אפשר לשנות צבע, כמות, גודל, מהירות וכיוון."))] });
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
    if (!App.rec.target) { const img = files.find((f) => /^image\/(jpeg|png)$/.test(f.type)); return img ? chooseArtwork(img) : toast("קודם מעלים את תמונת היצירה (JPG או PNG)", { kind: "error" }); }
    for (const f of files) { const k = kindOf(f); if (!k) { toast("״" + f.name + "״: סוג קובץ לא נתמך", { kind: "error" }); continue; } await addFile(k, f); }
  }

  function openLibrary(opts) {
    if (!App.rec.target) return needArt();
    window.StarterLibrary.open(async (kind, file, options) => {
      try { await importAsset(kind, file, options); }
      catch (e) { if (e.say) toast(e.say, { kind: "error" }); throw e; }
    }, opts);
  }
  // The 3D shelf of the library, with a small button there for a model file of one's own.
  const open3d = () => openLibrary({ only3d: true, onImport: async () => { const f = await UI.pickFile(ACCEPT.model); if (f) addFile("model", f); } });
  function needArt() { toast("קודם מעלים את תמונת היצירה", { action: { label: "העלאה", run: pickArtwork } }); }

  // ---------- the "add" sheet ----------
  const ADD = [
    ["image", "תמונה", "מהמכשיר, או מדבקה מוכנה"], ["video", "סרטון", "MP4 או MOV"], ["text", "טקסט", "כותרת או ברכה"],
    ["pattern", "רקעים", "צבע אחיד, תנועה או טבע"], ["weather", "מזג אוויר", "שמש, עשן, גשם, ערפל ועוד"], ["particles", "חלקיקים", "גשם, שלג, לבבות ועוד"], ["codefx", "אנימציות קוד", "פורטל, להקה, קיסוס ועוד"],
    ["model", "תלת־ממד", "מודלים מוכנים, או ייבוא משלך"], ["sound", "צליל", "MP3, M4A, WAV"],
    ["split", "פירוק לשכבות", "תמונה שמתפרקת לשכבות בעומק"]
  ];
  function openAdd() {
    if (!App.rec) return;
    if (!App.rec.target) return needArt();
    const pick = (kind) => async () => {
      d.close();
      if (kind === "text") return addText();
      if (kind === "pattern") return openBackgrounds();
      if (kind === "particles") return openParticles();
      if (kind === "weather") return openWeather();
      if (kind === "codefx") return openCodeFx();
      if (kind === "image") return openImages();
      if (kind === "model") return open3d();
      if (kind === "split") return SplitSheet.open();
      const f = await UI.pickFile(ACCEPT[kind]);
      if (f) addFile(kind, f);
    };
    const tiles = ADD.map(([kind, name, hint]) => h("button.add-tile", { type: "button", data: { add: kind }, onclick: pick(kind), style: { "--tint": TYPES[kind].tint } },
      h("span.add-ic", icon(TYPES[kind].icon, 24)), h("span.add-name", name), h("span.add-hint", hint)));
    const d = UI.dialog({ title: "מה מוסיפים?", sheet: true, body: [h("div.add-grid", tiles)] });
  }

  // ---------- the list ----------
  let list, artCard, drag = null;
  function thumb(e) {
    const t = typeOf(e), rec = App.rec;
    const box = h("span.layer-thumb", { style: { "--tint": t.tint } });
    const blob = Studio.mediaType(e) === "image" && e.assetId && rec.assets[e.assetId];
    if (blob) { const im = h("img", { alt: "", draggable: false }); im.src = Studio.blobURL(blob); im.onerror = () => im.replaceWith(icon(t.icon, 18)); box.append(im); }
    else if (e.type === "text") box.append(h("span.layer-thumb-text", { style: { color: e.textStyle === "cut" ? null : e.color } }, (e.text || "א").trim().slice(0, 1) || "א"));
    else box.append(icon(t.icon, 18));
    return box;
  }
  const sub = (e) => {
    const t = typeOf(e).name, bits = [t];
    if (e.type === "scatter") bits.push(Studio.scatterCopies(App.rec, e).length + " עותקים");
    if (e.type === "group") bits.push((e.children || []).length + " שכבות");
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
    const els = App.rec.elements, i = els.indexOf(e), top = els.length - 1, inGroup = Studio.groupOf(App.rec, e.id);
    UI.menu(btn, [
      !e.locked && e.type === "group" ? { label: "לפרק קבוצה", icon: "ungroup", run: () => App.ungroup(e.id) } : false,
      !e.locked && inGroup ? { label: "להוציא מהקבוצה", icon: "ungroup", run: () => App.leaveGroup(e.id) } : false,
      !e.locked && !inGroup && e.type !== "group" ? { label: "לקבץ עם שכבות אחרות", icon: "group", run: () => { App.startMulti(); App.toggleMulti(e.id); } } : false,
      e.locked ? { label: "שחרור הנעילה", icon: "unlock", run: () => App.setLocked(e.id, false) } : { label: "נעילה במקום", icon: "lock", run: () => App.setLocked(e.id, true) },
      e.locked ? false : { label: "שינוי שם", icon: "edit", run: () => rename(e.id) },
      e.locked ? false : { label: "שכפול", icon: "copy", run: () => App.duplicateLayer(e.id) },
      !e.locked && Studio.SCATTER_TYPES.includes(e.type) ? { label: "פיזור על נתיב", icon: "path", run: () => { App.select(e.id); App.scatterFrom(e.id); } } : false,
      !e.locked && Studio.SCATTER_TYPES.includes(e.type) ? { label: "מניפה", icon: "fan", run: () => App.fanFrom(e.id) } : false,
      !e.locked && e.type === "scatter" ? { label: "להפריד לשכבות", icon: "layers", run: () => App.breakScatter(e.id) } : false,
      null,
      i < top ? { label: "לחזית", icon: "up", run: () => App.moveLayer(e.id, top) } : false,
      i < top ? { label: "שלב אחד קדימה", icon: "up", run: () => App.moveLayer(e.id, i + 1) } : false,
      i > 0 ? { label: "שלב אחד אחורה", icon: "down", run: () => App.moveLayer(e.id, i - 1) } : false,
      i > 0 ? { label: "לרקע", icon: "down", run: () => App.moveLayer(e.id, 0) } : false,
      els.length > 1 ? null : false,
      e.locked ? false : { label: "מחיקה", icon: "trash", danger: true, run: () => App.removeLayer(e.id) }
    ].filter((x) => x !== false));
  }
  function render() {
    const rec = App.rec; if (!rec || !list) return;
    const els = rec.elements.slice().reverse();
    list.replaceChildren();
    $("layer-count").textContent = els.length ? String(els.length) : "";
    if (!els.length) {
      list.append(h("div.layers-empty", icon("layers", 28), h("p", rec.target ? "עדיין אין שכבות. מוסיפים תמונה, סרטון, טקסט או משהו מהספרייה, והם יופיעו מעל היצירה." : "מתחילים בתמונת היצירה: התמונה שהמצלמה תזהה."),
        rec.target ? null : UI.button("העלאת תמונת היצירה", pickArtwork, { kind: "primary", icon: "upload" })));
    }
    $("btn-add").hidden = !rec.target || !!App.multi;
    const multi = App.multi;
    for (const e of els) {
      const member = !!Studio.groupOf(rec, e.id);
      if (multi) { list.append(multiRow(e, member)); continue; }
      const more = h("button.icon-btn.row-more", { "aria-label": "עוד פעולות: " + (e.name || ""), "aria-haspopup": "menu", onclick: (ev) => { ev.stopPropagation(); rowMenu(more, e); } }, icon("more", 18));
      const grip = h("span.row-grip", { title: "גרירה לשינוי הסדר" }, icon("grip", 18));
      // a locked layer shows a padlock: touching it releases the layer
      const lock = e.locked ? h("button.icon-btn.row-lock", { title: "שחרור הנעילה", "aria-label": "שחרור הנעילה: " + (e.name || ""), onclick: (ev) => { ev.stopPropagation(); App.setLocked(e.id, false); toast("השכבה שוחררה"); } }, icon("lock", 18)) : null;
      const row = h("div.layer-row" + (e.id === App.selId ? ".on" : "") + (e.locked ? ".locked" : "") + (member ? ".member" : ""), { role: "option", tabIndex: 0, "aria-selected": String(e.id === App.selId), data: { id: e.id } },
        member ? h("span.row-grip.member-mark", icon("back", 14)) : grip, thumb(e), h("span.layer-text", h("span.layer-name", e.name || ""), h("span.layer-sub", sub(e))), lock, more);
      row.onclick = () => { if (e.locked) return toast("השכבה נעולה. נגיעה במנעול משחררת אותה."); App.select(e.id); if (phone()) App.setTab(null, "inspector"); };
      row.ondblclick = () => { if (!e.locked) rename(e.id); };
      row.onkeydown = (ev) => { if (ev.target === row && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); row.click(); } };
      if (!member) grip.onpointerdown = (ev) => startDrag(ev, row, e.id); // a member keeps its place under its group
      grip.onclick = (ev) => ev.stopPropagation();
      list.append(row);
    }
    renderArt(); renderHead();
  }
  // While choosing several layers: a box to tick on every top-level layer. Members of a group and groups cannot be chosen.
  function multiRow(e, member) {
    const on = App.multi.has(e.id), can = !member && e.type !== "group" && !e.locked;
    const box = h("span.row-check" + (on ? ".on" : ""), { "aria-hidden": "true" }, on ? icon("check", 16) : null);
    const row = h("div.layer-row.choosing" + (on ? ".on" : "") + (member ? ".member" : "") + (can ? "" : ".cannot"), { role: "checkbox", tabIndex: 0, "aria-checked": String(on), "aria-label": e.name || "", data: { id: e.id } },
      box, thumb(e), h("span.layer-text", h("span.layer-name", e.name || ""), h("span.layer-sub", sub(e))));
    row.onclick = () => App.toggleMulti(e.id);
    row.onkeydown = (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); row.click(); } };
    return row;
  }
  // The head of the list: "הוספת שכבה", or while choosing, the way to group them and the way out.
  function renderHead() {
    const head = $("layers-pane").querySelector(".pane-head"), multi = App.multi;
    let box = $("multi-head");
    $("btn-add").hidden = !!multi || !(App.rec && App.rec.target);
    if (!multi) { if (box) box.remove(); return; }
    if (!box) { box = h("div.multi-head", { id: "multi-head" }); head.append(box); }
    const n = multi.size, go = UI.button("לקבץ (" + n + ")", () => App.groupLayers(), { kind: "primary", small: true, icon: "group" });
    go.id = "btn-group-go"; go.disabled = n < 2;
    box.replaceChildren(go, UI.button("ביטול", () => App.endMulti(), { kind: "ghost", small: true }));
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
      h("button.icon-btn.art-turn", { type: "button", id: "art-rotate", title: "סיבוב התמונה", "aria-label": "סיבוב התמונה ברבע סיבוב", onclick: () => rotateArtwork() }, icon("rotate", 20)),
      h("button.icon-btn.art-cover", { type: "button", id: "art-cover", title: "תמונת שער ממה שרואים עכשיו", "aria-label": "לקבוע את תמונת השער ממה שרואים עכשיו בתצוגה השטוחה", onclick: () => coverFromView() }, icon("image", 20)),
      h("button.btn.ghost.small", { type: "button", onclick: pickArtwork }, "החלפה"));
  }
  // The gallery card's picture ("תמונת שער") becomes what the flat view shows now: the artwork with its layers.
  // Kept as __cover (home.js); the camera goes on recognising the artwork itself.
  async function coverFromView() {
    const rec = App.rec; if (!rec || !rec.target) return needArt();
    if (App.mode3d) return toast("תמונת השער מצולמת מהתצוגה השטוחה. עוברים ל״שטוח״ ולוחצים שוב.", { kind: "warn" });
    let pic = null; try { pic = await Stage.coverShot(); } catch (e) { console.warn(e); }
    if (!pic) return toast("לא הצלחתי לצלם את התצוגה הפעם. אפשר לנסות שוב.", { kind: "error" });
    rec.assets.__cover = pic; await App.save({ noHistory: true });
    toast("תמונת השער עודכנה למה שרואים עכשיו");
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
    App.on("multi", render);
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

  return { init, render, openAdd, openLibrary, importAsset, coverFromView, pickArtwork, setArtwork, rotateArtwork, addFiles, rename, TYPES, typeOf, phone };
})();
