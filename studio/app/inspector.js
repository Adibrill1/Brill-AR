"use strict";
/* Inspector: everything that can be changed about the selected layer, in four tabs - style, place, motion, tap.
   With nothing selected it shows the creation itself. Controls are rebuilt when the selection or the tab changes,
   and only refreshed (sync) when values change, so a slider being dragged is never replaced under the finger. */
window.Inspector = (() => {
  const { $, h, icon, toast, clamp, round } = UI;
  const TABS = [["layers", "שכבות", "layers"], ["style", "עיצוב", "palette"], ["place", "מיקום", "move"], ["motion", "תנועה", "motion"], ["tap", "מגע", "tap"]];
  const CUBE_DIRS = { front: "מלפנים לאחור", back: "מאחור לפנים", left: "משמאל לימין", right: "מימין לשמאל", top: "מלמעלה למטה", bottom: "מלמטה למעלה" };
  let root, tabBar, ctls = [];

  const artRatio = () => { const g = Studio.geom(App.rec); return g.artW / g.artH; };
  // A control's "set": change the selected layer (looked up now - never a kept reference), redraw, save when final.
  const upd = (fn, then) => (v, final) => { const e = App.sel(); if (!e) return; fn(e, v); App.changed(final); if (final !== false && then) then(e); };
  const add = (c) => { ctls.push(c); return c; };
  const S = (o) => add(UI.slider(o)), T = (o) => add(UI.toggle(o)), C = (o) => add(UI.chips(o)), K = (o) => add(UI.color(o)), L = (o) => add(UI.select(o));
  const pct = { scale: 100, unit: "%" };
  const opacity = () => S(Object.assign({ label: "שקיפות", min: 0, max: 1, step: 0.01, get: () => place("opacity"), set: placeSet("opacity") }, pct));
  const note = (text, ic) => h("p.note", ic ? icon(ic, 16) : null, h("span", text));

  // ---------- place values: the layer's own, or (for a layer in motion) the key at the playhead ----------
  function place(prop) {
    const e = App.sel(); if (!e) return 0;
    if (App.keyed(e) && prop !== "rotX" && prop !== "rotY") return App.sample(e)[prop] || 0;
    return e[prop] == null ? (prop === "opacity" ? 1 : 0) : e[prop];
  }
  function placeSet(prop) {
    return (v, final) => {
      const e = App.sel(); if (!e) return;
      if (App.keyed(e) && prop !== "rotX" && prop !== "rotY") {
        if ((prop === "x" || prop === "y") && e.timeline.xyMap) return;
        App.editKey(e)[prop] = round(v);
      } else e[prop] = round(v);
      App.changed(final);
    };
  }

  // ---------- style, per kind of layer ----------
  function styleText(e) {
    const ta = h("textarea.field", { rows: 2, dir: "auto", "aria-label": "הטקסט", id: "in-text", placeholder: "מה כתוב כאן?" });
    ta.value = e.text || "";
    ta.oninput = () => { const x = App.sel(); if (!x) return; x.text = ta.value; Stage.fitText(x); App.emit("change"); App.saveSoon(); };
    ctls.push({ sync: () => { const x = App.sel(); if (x && document.activeElement !== ta && ta.value !== (x.text || "")) ta.value = x.text || ""; } });
    const cut = e.textStyle === "cut";
    const look = C({ label: "סגנון", options: [{ id: "plain", name: "רגיל" }, { id: "cut", name: "אותיות גזורות" }], get: () => (App.sel().textStyle === "cut" ? "cut" : "plain"),
      set: upd((x, v) => { if (v === "cut") { x.textStyle = "cut"; x.cutSeed = x.cutSeed || 0; } else delete x.textStyle; Stage.fitText(x); }, build) });
    const out = [UI.group("טקסט", UI.field("הטקסט", ta), look)];
    if (cut) {
      out.push(UI.group("אותיות גזורות", note("כל אות נגזרת מנייר אחר, כמו קולאז׳."),
        UI.button("ערבוב מחדש", () => upd((x) => { x.cutSeed = Math.floor(Math.random() * 100000); Stage.fitText(x); })(null, true), { icon: "refresh" })));
    } else {
      const fonts = C({ label: "גופן", wrap: true, options: Studio.FONTS.map((f) => ({ id: f.id, name: f.name })), get: () => App.sel().font || "heebo", set: upd((x, v) => { x.font = v; Stage.fitText(x); }) });
      fonts.node.querySelectorAll(".chip").forEach((b) => { b.style.fontFamily = '"BA ' + b.dataset.id + '", Heebo, sans-serif'; b.classList.add("font-chip"); });
      out.push(UI.group("אותיות", fonts,
        K({ label: "צבע", get: () => App.sel().color, set: upd((x, v) => { x.color = v; }) }),
        T({ label: "מודגש", get: () => App.sel().bold !== false, set: upd((x, v) => { x.bold = v; Stage.fitText(x); }) })));
    }
    out.push(UI.group("", opacity()));
    return out;
  }

  // Fill the whole artwork with a picture or a video: cropped to its shape, centred, flat.
  function fillArt(rot) {
    const e = App.sel(), rec = App.rec; if (!e) return;
    if (App.keyed(e)) return toast("לשכבה בתנועה אין מילוי אוטומטי");
    const g = Studio.geom(rec), A = g.artW / g.artH, turned = Math.abs(rot) === 90, target = turned ? 1 / A : A;
    const c = e.crop || { x: 0, y: 0, w: 1, h: 1 }, src = (e.aspect || 1) / (c.w / c.h);
    const crop = src > target ? { x: (1 - target / src) / 2, y: 0, w: target / src, h: 1 } : { x: 0, y: (1 - src / target) / 2, w: 1, h: src / target };
    Studio.setImageCrop(rec, e, crop);
    e.w = turned ? 1 / A : 1; e.h = (e.w / e.aspect) * A;
    e.x = e.y = e.z = 0; e.rot = rot; e.rotX = e.rotY = 0;
    App.setCropping(false);
    App.changed(true);
  }
  function styleMedia(e) {
    const out = [];
    const fx = C({ label: "", bare: true, wrap: true, options: [{ id: "none", name: "בלי" }].concat(Studio.FX.map((f) => ({ id: f.id, name: f.name }))), get: () => App.sel().fx || "none",
      set: upd((x, v) => { if (v === "none") { delete x.fx; delete x.fxAmount; } else { x.fx = v; if (x.fxAmount == null) x.fxAmount = 0.5; } }, build) });
    out.push(UI.group("אפקט", fx, e.fx ? S(Object.assign({ label: "עוצמה", min: 0, max: 1, step: 0.01, get: () => (App.sel().fxAmount == null ? 0.5 : App.sel().fxAmount), set: upd((x, v) => { x.fxAmount = v; }) }, pct)) : null));

    const A = artRatio(), shapes = [{ id: "free", name: "חופשי" }, { id: "art", name: "כמו היצירה" }, { id: "1", name: "ריבוע" }, { id: "1.7778", name: "16:9" }, { id: "0.5625", name: "9:16" }];
    const cropKids = [];
    if (App.mode3d) cropKids.push(note("חיתוך עושים בתצוגת 2D."));
    else if (App.cropping) {
      cropKids.push(C({ label: "צורת החיתוך", wrap: true, options: shapes, get: () => { const r = Stage.cropRatio; return !r ? "free" : Math.abs(r - A) < 1e-4 ? "art" : String(r); },
        set: (v) => Stage.setCropRatio(v === "free" ? null : v === "art" ? A : parseFloat(v)) }),
        note("גוררים את הפינות על התמונה עצמה."),
        h("div.btn-row", UI.button("סיום", () => App.setCropping(false), { kind: "primary", icon: "check" }), e.crop ? UI.button("ביטול החיתוך", () => Stage.resetCrop(), { kind: "ghost" }) : null));
    } else {
      cropKids.push(h("div.btn-row", UI.button("חיתוך", () => { Stage.setCropRatio(null); App.setCropping(true); }, { icon: "crop" }), e.crop ? UI.button("ביטול החיתוך", () => { Stage.resetCrop(); build(); }, { kind: "ghost" }) : null));
    }
    const next = { 0: 90, 90: 180, 180: -90, "-90": 0 }[String(Math.round(e.rot || 0))];
    cropKids.push(h("div.btn-row", UI.button("מילוי כל היצירה", () => fillArt(0), { icon: "fit" }), UI.button("מילוי בסיבוב", () => fillArt(next == null ? 90 : next), { icon: "refresh" })));
    out.push(UI.group("חיתוך ומילוי", cropKids));

    if (e.type === "video") {
      const on = !!(e.chroma && e.chroma.enabled);
      const chroma = (fn) => upd((x, v) => { x.chroma = Object.assign({ enabled: false, color: "#00ff00", threshold: 0.35 }, x.chroma); fn(x.chroma, v); });
      out.push(UI.group("הסרת רקע (מסך ירוק)",
        T({ label: "להעלים צבע רקע", hint: "לסרטונים שצולמו על רקע אחיד", get: () => !!(App.sel().chroma && App.sel().chroma.enabled), set: (v, f) => { chroma((c, val) => { c.enabled = val; })(v, f); build(); } }),
        on ? K({ label: "הצבע שנעלם", get: () => (App.sel().chroma || {}).color || "#00ff00", set: chroma((c, v) => { c.color = v; }) }) : null,
        on ? S(Object.assign({ label: "רגישות", min: 0.1, max: 0.8, step: 0.01, get: () => { const c = App.sel().chroma || {}; return c.threshold == null ? 0.35 : c.threshold; }, set: chroma((c, v) => { c.threshold = v; }) }, pct)) : null,
        on ? note("את התוצאה רואים בתצוגה המקדימה ובמצלמה.") : null));
      out.push(UI.group("קול", sound()));
    }
    out.push(UI.group("", opacity()));
    return out;
  }
  const sound = () => [
    S(Object.assign({ label: "עוצמת קול", min: 0, max: 1, step: 0.01, get: () => (App.sel().volume == null ? 1 : App.sel().volume), set: upd((x, v) => { x.volume = v; }) }, pct)),
    T({ label: "חוזר שוב ושוב", get: () => App.sel().loop !== false, set: upd((x, v) => { x.loop = v; }) })
  ];

  function stylePattern() {
    const swatch = (colors) => h("span.swatch", colors.map((c) => h("i", { style: { background: c } })));
    const P = (fn, then) => upd((x, v) => { x.pattern = Object.assign({}, x.pattern); fn(x.pattern, v, x); }, then);
    const looks = C({ label: "", bare: true, wrap: true, options: Studio.PATTERNS.map((p) => ({ id: p.id, name: p.name })), get: () => App.sel().pattern.look,
      set: P((p, v) => { const d = Studio.patternDefaults(v); p.look = v; p.colors = d.colors; p.speed = d.speed; }, sync) });
    const pals = C({ label: "ערכות צבע", wrap: true, options: Studio.PATTERN_PALETTES.map((p, i) => ({ id: String(i), swatch: swatch(p.colors), title: p.name })),
      get: () => String(Studio.PATTERN_PALETTES.findIndex((p) => p.colors.join() === App.sel().pattern.colors.join())), set: P((p, v) => { p.colors = Studio.PATTERN_PALETTES[+v].colors.slice(); }, sync) });
    pals.node.classList.add("swatches");
    const col = (i) => K({ label: "צבע " + (i + 1), get: () => App.sel().pattern.colors[i], set: P((p, v) => { p.colors = p.colors.slice(); p.colors[i] = v; }) });
    return [
      UI.group("מראה", looks),
      UI.group("צבעים", pals, h("div.color-trio", col(0).node, col(1).node, col(2).node)),
      UI.group("התאמה",
        S(Object.assign({ label: "גודל הדוגמה", min: 0, max: 1, step: 0.01, get: () => App.sel().pattern.size, set: P((p, v) => { p.size = v; }) }, pct)),
        S(Object.assign({ label: "מהירות", min: 0, max: 1, step: 0.01, get: () => App.sel().pattern.speed, set: P((p, v) => { p.speed = v; }) }, pct)),
        S({ label: "וריאציה", min: 0, max: 999, step: 1, get: () => App.sel().pattern.seed, set: P((p, v) => { p.seed = Math.round(v); }) }),
        L({ label: "צורה", options: Studio.PATTERN_SHAPES, get: () => App.sel().pattern.shape,
          set: P((p, v, x) => { p.shape = v; x.aspect = Studio.patternAspect(App.rec, v); x.h = (x.w / x.aspect) * artRatio(); }) }),
        opacity())
    ];
  }

  function styleParticles(e) {
    const P = (fn, then) => upd((x, v) => { x.particles = Object.assign({}, x.particles); fn(x.particles, v); }, then);
    const pc = () => App.sel().particles || {};
    async function ownSprite() {
      const f = await UI.pickFile("image/png,image/webp"); if (!f) return;
      const x = App.sel(); if (!x) return;
      if (f.size > 2 * 1048576) return toast("תמונת החלקיק גדולה מדי (עד 2MB)", { kind: "error" });
      if (App.blocked({ bytes: f.size })) return;
      const id = Studio.newId(); App.rec.assets[id] = await Studio.ownBlob(f);
      x.particles = Object.assign({}, x.particles, { preset: "custom", spriteAssetId: id });
      App.changed(true); build();
    }
    const preset = C({ label: "", bare: true, options: [{ id: "sparkle", name: "נצנוצים" }, { id: "confetti", name: "קונפטי" }, { id: "custom", name: "תמונה משלי" }], get: () => pc().preset || "sparkle",
      set: (v) => { if (v === "custom") return void ownSprite().then(sync); P((p) => { p.preset = v; })(v, true); build(); } });
    const dirs = [{ id: "preset", name: "רגיל" }, { id: "0", name: "למעלה" }, { id: "180", name: "למטה" }, { id: "90", name: "ימינה" }, { id: "270", name: "שמאלה" }, { id: "-2", name: "לכל הכיוונים" }, { id: "-3", name: "מהמרכז החוצה" }];
    const d0 = e.particles && e.particles.direction;
    if (d0 != null && !dirs.some((d) => d.id === String(d0))) dirs.push({ id: String(d0), name: "זווית " + d0 + "°" });
    const two = !!pc().color2;
    return [
      UI.group("סוג", preset, pc().preset === "custom" ? UI.button("החלפת התמונה", ownSprite, { kind: "ghost", small: true, icon: "image" }) : null),
      UI.group("כמות ותנועה",
        S({ label: "כמות", min: 10, max: 500, step: 10, get: () => pc().count || 120, set: P((p, v) => { p.count = Math.round(v); }) }),
        S({ label: "גודל", min: 2, max: 60, step: 1, get: () => pc().size || 12, set: P((p, v) => { p.size = v; }) }),
        S({ label: "מהירות", min: 0.2, max: 3, step: 0.1, get: () => pc().speed || 1, set: P((p, v) => { p.speed = v; }) }),
        S({ label: "פיזור", min: 0.1, max: 2, step: 0.1, get: () => (pc().spread > 0 ? pc().spread : 1), set: P((p, v) => { p.spread = v; }) }),
        L({ label: "כיוון", options: dirs, get: () => (pc().direction == null ? "preset" : String(pc().direction)), set: P((p, v) => { p.direction = v === "preset" ? null : parseInt(v, 10); }) }),
        L({ label: "צורת האזור", options: [{ id: "box", name: "מלבן" }, { id: "disc", name: "עיגול" }, { id: "sphere", name: "כדור" }], get: () => pc().emitter || "box", set: P((p, v) => { p.emitter = v; }) })),
      UI.group("צבע",
        K({ label: "צבע", get: () => pc().color || "#ffd94d", set: P((p, v) => { p.color = v; }) }),
        T({ label: "צבע שני", hint: "חלק מהחלקיקים בצבע אחר", get: () => !!pc().color2, set: (v, f) => { P((p, val) => { if (val) p.color2 = p.color2 || "#ffffff"; else delete p.color2; })(v, f); build(); } }),
        two ? K({ label: "הצבע השני", get: () => pc().color2 || "#ffffff", set: P((p, v) => { p.color2 = v; }) }) : null,
        T({ label: "דעיכה בסוף", hint: "החלקיק נעלם בעדינות", get: () => !!pc().fade, set: P((p, v) => { p.fade = v; }) }),
        opacity())
    ];
  }

  const clipNames = {};
  function styleModel(e) {
    const out = [], id = e.id;
    if (Editor3D.modelError(id)) out.push(note("המודל לא נטען. כדאי למחוק את השכבה ולהוסיף אותו שוב כקובץ GLB.", "warn"));
    const n = (e.clipDurations || []).length;
    if (n) {
      const names = clipNames[e.assetId];
      if (!names) Studio.modelClipInfo(App.rec.assets[e.assetId]).then((c) => { clipNames[e.assetId] = c.map((x) => x.name); if (App.selId === id && App.tab === "style") build(); }).catch(() => { clipNames[e.assetId] = []; });
      const opts = Array.from({ length: n }, (_, i) => ({ id: String(i), name: (names && names[i]) || "תנועה " + (i + 1) }));
      out.push(UI.group("תנועת המודל",
        n > 1 ? L({ label: "איזו תנועה", options: opts, get: () => String(App.sel().modelClip || 0), set: upd((x, v) => { x.modelClip = parseInt(v, 10) || 0; }) }) : null,
        T({ label: "התנועה פועלת", get: () => App.sel().modelPlaying !== false, set: upd((x, v) => { x.modelPlaying = v; }) }),
        T({ label: "חוזרת שוב ושוב", get: () => App.sel().modelLoop !== false, set: upd((x, v) => { x.modelLoop = v; }) }),
        S({ label: "מהירות", min: 0.1, max: 4, step: 0.1, unit: "×", get: () => App.sel().modelSpeed || 1, set: upd((x, v) => { x.modelSpeed = v; }) })));
    } else out.push(UI.group("תנועת המודל", note("במודל הזה אין תנועה מובנית. אפשר להזיז אותו בלשונית ״תנועה״.")));
    out.push(UI.group("", opacity(), note("כדי לסובב את המודל במרחב עוברים לתצוגת תלת־ממד, מעל הקנבס.", "cube")));
    return out;
  }
  function styleCube() {
    const Q = (fn) => upd((x, v) => { x.timecube = Object.assign({}, x.timecube); fn(x.timecube, v); });
    const tc = () => App.sel().timecube || {};
    return [UI.group("קוביית זמן",
      L({ label: "כיוון הזמן", options: Studio.TIMECUBE_DIRS.map((id) => ({ id, name: CUBE_DIRS[id] || id })), get: () => tc().dir || "front", set: Q((c, v) => { c.dir = v; }) }),
      S({ label: "עומק", min: 0.2, max: 2, step: 0.05, get: () => (tc().depth == null ? 0.75 : tc().depth), set: Q((c, v) => { c.depth = v; }) }),
      T({ label: "קווי מתאר", get: () => tc().edges !== false, set: Q((c, v) => { c.edges = v; }) }),
      T({ label: "גודל קבוע", hint: "הקובייה לא נחתכת, הסרטון זורם בתוכה", get: () => !!tc().fixed, set: Q((c, v) => { c.fixed = v; }) }),
      opacity()),
    h("section.group", note("את הקובייה עצמה רואים בתצוגת תלת־ממד, בתצוגה המקדימה ובמצלמה.", "cube"))];
  }
  function styleTab(e) {
    if (e.type === "text") return styleText(e);
    if (e.type === "image" || e.type === "video") return styleMedia(e);
    if (e.type === "pattern") return stylePattern(e);
    if (e.type === "particles") return styleParticles(e);
    if (e.type === "model") return styleModel(e);
    if (e.type === "timecube") return styleCube(e);
    if (e.type === "sound") return [UI.group("צליל", sound(), note("הצליל מתנגן כשהמצלמה מזהה את היצירה. בטלפון הוא מתחיל אחרי נגיעה ראשונה במסך."))];
    return [h("section.group", note("לשכבה הזו אין הגדרות עיצוב."))];
  }

  // ---------- place ----------
  function placeTab(e) {
    const keyed = App.keyed(e), out = [];
    if (keyed) out.push(h("section.group", note("השכבה בתנועה: מה שמשנים כאן נשמר לרגע שבו הסרגל עומד (לשונית ״תנועה״).", "motion")));
    if (e.type === "sound") return [UI.group("מיקום הסימון", note("לצליל אין מראה. העיגול על הקנבס רק מסמן אותו."))];
    const size = keyed
      ? S({ label: "גודל", min: 0.05, max: 4, step: 0.01, unit: "×", get: () => App.sample(App.sel()).scale || 1, set: (v, f) => { const x = App.sel(); if (!x) return; App.editKey(x).scale = round(v); App.changed(f); } })
      : S(Object.assign({ label: "גודל", min: 0.05, max: 2, step: 0.01, get: () => App.sel().w, set: upd((x, v) => { const k = v / x.w; x.w = round(v); if (x.type === "text") Stage.fitText(x); else if (x.h != null) x.h = round(x.h * k); }) }, pct));
    out.push(UI.group("מקום וגודל",
      S(Object.assign({ label: "ימינה / שמאלה", min: -0.7, max: 0.7, step: 0.005, get: () => place("x"), set: placeSet("x") }, pct)),
      S(Object.assign({ label: "למעלה / למטה", min: -0.7, max: 0.7, step: 0.005, get: () => place("y"), set: placeSet("y") }, pct)),
      size,
      S({ label: "סיבוב", min: -180, max: 180, step: 1, unit: "°", get: () => place("rot"), set: placeSet("rot") }),
      h("div.btn-row", UI.button("למרכז", () => { placeSet("x")(0, false); placeSet("y")(0, true); }, { small: true, kind: "ghost", icon: "fit" }),
        UI.button("איפוס סיבוב", () => { placeSet("rot")(0, false); placeSet("rotX")(0, false); placeSet("rotY")(0, true); }, { small: true, kind: "ghost", icon: "refresh" }))));
    out.push(UI.group("עומק והטיה",
      S(Object.assign({ label: "מרחק מהיצירה", min: 0, max: 0.5, step: 0.005, get: () => place("z"), set: placeSet("z") }, pct)),
      S({ label: "הטיה קדימה / אחורה", min: -180, max: 180, step: 1, unit: "°", get: () => place("rotX"), set: placeSet("rotX") }),
      S({ label: "הטיה לצדדים", min: -180, max: 180, step: 1, unit: "°", get: () => place("rotY"), set: placeSet("rotY") }),
      note("את העומק וההטיה רואים הכי טוב בתצוגת תלת־ממד.")));
    const els = App.rec.elements, i = els.indexOf(e), top = els.length - 1;
    const ord = (label, ic, to, off) => { const b = UI.button(label, () => App.moveLayer(e.id, to), { small: true, kind: "ghost", icon: ic }); b.disabled = off; return b; };
    out.push(UI.group("סדר השכבות", h("div.btn-grid", ord("לחזית", "up", top, i === top), ord("קדימה", "up", i + 1, i === top), ord("אחורה", "down", i - 1, i === 0), ord("לרקע", "down", 0, i === 0))));
    return out;
  }

  // ---------- tap ----------
  function tapTab(e) {
    if (e.type === "sound") return [h("section.group", note("לצליל אין מראה, אז אי אפשר לגעת בו. אפשר לתת לשכבה אחרת את הפעולה ״השתקה והפעלה של הקול״."))];
    const mode = C({ label: "", bare: true, wrap: true, options: [{ id: "none", name: "כלום" }, { id: "link", name: "פתיחת קישור", icon: "link" }, { id: "mute", name: "השתקה והפעלה של הקול", icon: "sound" }],
      get: () => (["link", "mute"].includes(App.sel().onTap) ? App.sel().onTap : "none"), set: upd((x, v) => { x.onTap = v; }, build) });
    const kids = [note("מה קורה כשנוגעים בשכבה הזו במצלמה."), mode];
    if (e.onTap === "link") {
      const inp = h("input.field", { type: "url", dir: "ltr", inputMode: "url", placeholder: "https://", "aria-label": "כתובת הקישור", value: e.tapUrl || "" });
      const warn = h("span.ctl-hint.bad", { hidden: true }, "צריך כתובת שמתחילה ב־https://");
      inp.onchange = () => {
        const x = App.sel(); if (!x) return;
        let v = inp.value.trim();
        if (v && !/^[a-z][a-z0-9+.-]*:/i.test(v)) v = "https://" + v;
        const ok = !v || /^(https:\/\/\S+\.\S+|mailto:\S+|tel:\S+)/i.test(v);
        warn.hidden = ok;
        if (!ok) return;
        inp.value = v; if (v) x.tapUrl = v; else delete x.tapUrl;
        App.changed(true);
      };
      kids.push(UI.field("לאן הקישור מוביל", inp), warn);
    } else if (!["none", "mute"].includes(e.onTap || "none")) kids.push(note("לשכבה הזו הוגדרה פעולה מגרסה קודמת. בחירה כאן תחליף אותה.", "warn"));
    return [UI.group("נגיעה בשכבה", kids)];
  }

  // ---------- nothing selected: the creation ----------
  function creationPanel() {
    const rec = App.rec, out = [];
    if (Layers.phone()) out.push(h("section.group", note("בוחרים שכבה (על הקנבס או ברשימה) כדי לערוך אותה.", "tap")));
    if (rec.target && rec.assets.__artwork) {
      const im = h("img.art-big", { alt: "תמונת היצירה", draggable: false }); im.src = Studio.blobURL(rec.assets.__artwork);
      out.push(UI.group("תמונת היצירה", im, note("זו התמונה שהמצלמה מזהה. כל השכבות מופיעות מעליה."), UI.button("החלפת התמונה", Layers.pickArtwork, { kind: "ghost", icon: "upload" })));
    } else out.push(UI.group("מתחילים כאן", note("מעלים את תמונת היצירה: הציור, הכרטיס או התמונה שהמצלמה תזהה."), UI.button("העלאת תמונת היצירה", Layers.pickArtwork, { kind: "primary", icon: "upload" })));
    const used = Studio.mediaBytes(rec), max = Studio.LIMITS.maxMediaBytes, n = rec.elements.length;
    out.push(UI.group("מה יש ביצירה",
      h("div.stat-row", h("span", "שכבות"), h("b", n + " מתוך " + Studio.LIMITS.maxLayers)),
      h("div.stat-row", h("span", "קבצים"), h("b", UI.fmtBytes(used) + " מתוך " + UI.fmtBytes(max))),
      h("div.meter", h("i", { style: { width: clamp(used / max * 100, used ? 2 : 0, 100) + "%" } }))));
    out.push(UI.group("טיפים קטנים",
      h("ul.tips", h("li", "נגיעה בשכבה בוחרת אותה. נגיעה נוספת בוחרת את השכבה שמתחתיה."), h("li", "שתי אצבעות על שכבה משנות את הגודל שלה; על הרקע הן מקרבות ומרחיקות את התצוגה."),
        h("li", "כפתור העין למעלה מראה איך זה ייראה, בלי מצלמה."), h("li", "טעית? החץ לאחור מבטל עד 20 צעדים."))));
    return out;
  }

  // ---------- frame ----------
  function head(e) {
    const t = Layers.TYPES[e.type] || Layers.TYPES.group;
    const name = h("input.field.name-field", { type: "text", maxLength: 60, value: e.name || "", "aria-label": "שם השכבה" });
    name.oninput = () => { const x = App.sel(); if (!x) return; x.name = name.value; App.emit("change"); App.saveSoon(); };
    name.onchange = () => { const x = App.sel(); if (x && !name.value.trim()) { x.name = t.name; name.value = t.name; App.changed(true); } };
    ctls.push({ sync: () => { const x = App.sel(); if (x && document.activeElement !== name && name.value !== (x.name || "")) name.value = x.name || ""; } });
    return h("div.insp-head", h("span.layer-thumb", { style: { "--tint": t.tint } }, icon(t.icon, 18)), name,
      h("button.icon-btn", { title: "ביטול הבחירה", "aria-label": "ביטול הבחירה", onclick: () => App.select(null) }, icon("close", 18)));
  }
  function build() {
    if (!root) return;
    const rec = App.rec, top = root.scrollTop;
    ctls = [];
    root.replaceChildren();
    renderTabs();
    if (!rec) return;
    const e = App.sel();
    if (!e) { root.append(...creationPanel()); return; }
    const tab = App.tab;
    const body = tab === "place" ? placeTab(e) : tab === "motion" ? [Timeline.panel(e, add)] : tab === "tap" ? tapTab(e) : styleTab(e);
    root.append(head(e), ...body.flat().filter(Boolean).map((x) => x.node || x));
    root.scrollTop = top;
  }
  function sync() { ctls.forEach((c) => { try { if (c.sync) c.sync(); } catch (err) { console.warn(err); } }); }
  function renderTabs() {
    const ph = Layers.phone(), has = !!App.sel();
    document.body.dataset.pane = App.pane;
    tabBar.querySelectorAll(".tab").forEach((b) => {
      const id = b.dataset.tab, on = id === "layers" ? ph && App.pane === "layers" : (!ph || App.pane === "inspector") && id === App.tab;
      b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on));
      b.classList.toggle("dim", id !== "layers" && !has);
    });
  }

  function init() {
    root = $("inspector"); tabBar = $("tabs");
    TABS.forEach(([id, name, ic]) => tabBar.append(h("button.tab", { type: "button", role: "tab", data: { tab: id }, onclick: () => (id === "layers" ? App.setPane("layers") : App.setTab(id)) }, icon(ic, 20), h("span", name))));
    Studio.loadTextFonts({ font: "heebo", text: "א" }).catch(() => {});
    let lastSel = null;
    App.on("open tab structure mode", build);
    App.on("select", () => {
      // a different layer starts at the top of its panel
      if (App.selId !== lastSel) { lastSel = App.selId; root.scrollTop = 0; }
      build();
    });
    App.on("change time", sync);
    App.on("close", () => { root.replaceChildren(); ctls = []; });
    // a double tap on the canvas: straight to what one usually wants to change
    App.on("edit", (el) => {
      App.setTab("style");
      if (el && el.type === "text") setTimeout(() => { const ta = $("in-text"); if (ta) { ta.focus(); ta.select(); } }, 60);
    });
    matchMedia("(max-width: 899px)").addEventListener("change", build);
  }

  return { init, build, sync };
})();
