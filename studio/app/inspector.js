"use strict";
/* Inspector: everything that can be changed about the selected layer, in four tabs - style, place, motion, tap.
   With nothing selected it shows the creation itself. Controls are rebuilt when the selection or the tab changes,
   and only refreshed (sync) when values change, so a slider being dragged is never replaced under the finger. */
window.Inspector = (() => {
  const { $, h, icon, toast, clamp, round } = UI;
  const TABS = [["layers", "שכבות", "layers"], ["style", "עיצוב", "palette"], ["add", "הוספה", "plus"], ["motion", "תנועה", "motion"], ["tap", "מגע", "tap"]];
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
      } else if (e.type === "group" && ["x", "y", "z", "rot"].includes(prop)) Studio.transformGroup(App.rec, e, { [prop]: round(v) }); // its members move with it
      else e[prop] = round(v);
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
    // how the text comes in and goes out lives with the other motion; a way there from the text itself
    const ee = e.enter || e.exit ? Studio.ENTER_EXIT.filter((x) => (e.enter && e.enter.fx === x.id) || (e.exit && e.exit.fx === x.id)).map((x) => x.enter).join(" · ") : "";
    const toMotion = UI.button(ee ? "כניסה ויציאה: " + ee : "כניסה ויציאה (מכונת כתיבה, חותמת, גל…)", () => App.setTab("motion"), { small: true, icon: "motion" });
    toMotion.id = "to-enter-exit";
    const out = [UI.group("טקסט", UI.field("הטקסט", ta), look, toMotion)];
    if (cut) {
      out.push(UI.group("אותיות גזורות", note("כל אות נגזרת מנייר אחר, כמו קולאז׳."),
        UI.button("ערבוב מחדש", () => upd((x) => { x.cutSeed = Math.floor(Math.random() * 100000); Stage.fitText(x); })(null, true), { icon: "refresh" })));
    } else {
      const fonts = C({ label: "גופן", wrap: true, options: Studio.FONTS.map((f) => ({ id: f.id, name: f.name })), get: () => App.sel().font || "heebo", set: upd((x, v) => { x.font = v; Stage.fitText(x); }) });
      fonts.node.querySelectorAll(".chip").forEach((b) => { b.style.fontFamily = '"BA ' + b.dataset.id + '", Heebo, sans-serif'; b.classList.add("font-chip"); });
      out.push(UI.group("אותיות", fonts,
        K({ label: "צבע", get: () => App.sel().color, set: upd((x, v) => { x.color = v; }) }),
        T({ label: "מודגש", get: () => App.sel().bold !== false, set: upd((x, v) => { x.bold = v; Stage.fitText(x); }) })));
      // the look of the letters; the layer is resized with the picture's margin, so the letters keep their size
      const fxNow = () => { const f = App.sel().textFx; return f && Studio.TEXT_FX.find((t) => t.id === f.id); };
      const F = (fn, then) => upd((x, v) => { const w0 = Stage.textBitmap(x).canvas.width; x.textFx = Object.assign({}, x.textFx); fn(x, v); const w1 = Stage.textBitmap(x).canvas.width; if (w0 > 0 && w1 > 0) x.w *= w1 / w0; Stage.fitText(x); }, then);
      const def = fxNow();
      out.push(UI.group("אפקט",
        C({ label: "", bare: true, wrap: true, options: [{ id: "none", name: "בלי" }].concat(Studio.TEXT_FX.map((t) => ({ id: t.id, name: t.name }))), get: () => (fxNow() ? fxNow().id : "none"),
          set: F((x, v) => { if (v === "none") delete x.textFx; else x.textFx = { id: v }; }, build) }),
        def && def.color ? K({ label: def.id === "neon" ? "צבע הזוהר" : def.id === "gradient" ? "הצבע השני" : def.id === "deep" ? "צבע העומק" : def.id === "shadow" ? "צבע הצל" : "צבע הקו",
          get: () => (App.sel().textFx && App.sel().textFx.color) || (def.id === "sticker" ? Stage.textFxColor(App.sel()) : (fxNow() || def).color), set: F((x, v) => { x.textFx.color = v; }) }) : null,
        def && def.amount ? S(Object.assign({ label: "עוצמה", min: 0, max: 1, step: 0.05, get: () => { const f = App.sel().textFx; return f && Number.isFinite(f.amount) ? f.amount : 0.5; }, set: F((x, v) => { x.textFx.amount = v; }) }, pct)) : null,
        def && def.id === "neon" ? note("לניאון הכי יפה: אותיות בהירות (לבן) וצבע זוהר חזק.") : null));
    }
    out.push(foilGroup());
    out.push(UI.group("שקיפות", opacity()));
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
  // "על כל היצירה": the selected layer spreads over the whole artwork, whatever it is. Pictures and videos fill it
  // cropped to its shape (fillArt); particles, weather, code animations and the time cube take its exact rectangle;
  // a scatter spreads its copies over it; a group, a text and a 3D model grow as big as fits, keeping their shape.
  const SPREAD_TYPES = ["image", "video", "particles", "pattern", "codefx", "timecube", "scatter", "group", "text", "model"];
  const canSpread = (e) => !!e && SPREAD_TYPES.includes(e.type) && !e.locked;
  function spreadArt() {
    const e = App.sel(), rec = App.rec; if (!canSpread(e)) return;
    if (App.keyed(e)) return toast("לשכבה בתנועה אין פריסה אוטומטית");
    if (e.type === "image" || e.type === "video") { fillArt(0); return toast("השכבה ממלאת את כל היצירה"); }
    const A = artRatio(), r4 = (v) => Math.round(v * 10000) / 10000;
    if (e.type === "group") {
      Studio.fitGroup(rec, e); Studio.transformGroup(rec, e, { x: 0, y: 0, rot: 0 }); Studio.fitGroup(rec, e); Studio.transformGroup(rec, e, { x: 0, y: 0 });
      const k = Math.min(1 / (e.w || 1), e.h ? 1 / e.h : Infinity);
      if (Number.isFinite(k) && k > 0) Studio.transformGroup(rec, e, { w: r4((e.w || 1) * k) });
    } else {
      e.x = 0; e.y = 0; e.rot = 0; e.rotX = 0; e.rotY = 0;
      if (e.type === "scatter") {
        for (let n = 0; n < 4; n++) { // the copies keep their size, so the spread is found in a few steps
          Studio.refreshScatter(rec, e, true);
          const kx = 1 / Math.max(1e-3, e.w), ky = 1 / Math.max(1e-3, e.h), sc = e.scatter;
          if (Math.abs(kx - 1) < 0.01 && Math.abs(ky - 1) < 0.01) break;
          if (sc.layout === "fan") Studio.scaleScatter(rec, e, Math.min(kx, ky));
          else { e.scatter = Object.assign({}, sc, { points: sc.points.map((q) => ({ x: r4((q.x || 0) * kx), y: r4((q.y || 0) * ky), z: q.z || 0 })) }); }
        }
        Studio.refreshScatter(rec, e, true); e.x = 0; e.y = 0;
      } else if (e.type === "text") {
        e.w = 1; Stage.fitText(e);
        if (e.h > 1) { e.w = r4(1 / e.h); Stage.fitText(e); }
      } else if (e.type === "model") e.w = 1;
      else { e.w = 1; e.h = 1; e.aspect = A; }
    }
    App.changed(true); build();
    toast("השכבה פרוסה על כל היצירה");
  }
  function styleMedia(e) {
    const out = [];
    if (e.fx && e.fx !== "holo") out.push(h("div.btn-row", Object.assign(UI.button("הסרת האפקט מהשכבה", () => { upd((x) => { delete x.fx; delete x.fxAmount; })(null, true); build(); }, { kind: "ghost", small: true, icon: "close" }), { id: "btn-fx-off" })));

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

    if (e.type === "video" && e.chroma) out.unshift(viewGroup(() => App.sel().depth3d === true, upd((x, v) => { if (v === "3d") x.depth3d = true; else delete x.depth3d; }),
      "בתלת־ממד הסרטון ממלא גם את המרחב שלפני היצירה, בכמה שכבות שיוצאות אל הצופה. רואים את זה במבט תלת־ממד ובמצלמה."));
    out.push(chromaGroup(e));
    if (e.type === "image") out.push(foilGroup());
    if (e.type === "video") out.push(UI.group("קול", sound()));
    out.push(UI.group("שקיפות", opacity()));
    return out;
  }
  // ---------- colour removal: a picture, a GIF, a video, or the copies of a scatter ----------
  // The colour is best taken from the picture itself (the eyedropper): on a phone a colour wheel rarely hits the exact
  // shade of a background.
  function chromaGroup(e) {
    const own = (x) => (x.type === "scatter" ? x.scatter.item : x), cur = () => own(App.sel()).chroma || {};
    const ch = (fn, then) => upd((x, v) => { const t = own(x); t.chroma = Object.assign({}, Studio.CHROMA_DEFAULT, t.chroma); fn(t.chroma, v); }, then);
    const on = !!(own(e).chroma && own(e).chroma.enabled), id = e.id;
    const pick = UI.button("לבחור צבע מהתמונה", () => Stage.pickColor(id, (c) => { if (App.selId !== id) return; ch((k) => { k.enabled = true; k.color = c; })(null, true); build(); toast("הצבע " + c + " נעלם. אפשר לכוונן ב״רגישות״."); }), { icon: "pipette", kind: on ? "ghost" : "" });
    pick.id = "btn-pick-color";
    return UI.group("הסרת צבע",
      T({ label: "להעלים צבע", hint: "צבע אחד נעשה שקוף, למשל רקע ירוק", get: () => !!cur().enabled, set: (v, f) => { ch((c, val) => { c.enabled = val; })(v, f); build(); } }),
      h("div.btn-row", pick),
      on ? K({ label: "הצבע שנעלם", get: () => cur().color || "#00ff00", set: ch((c, v) => { c.color = v; }) }) : null,
      on ? S(Object.assign({ label: "רגישות", min: 0.02, max: 0.8, step: 0.01, get: () => (cur().threshold == null ? 0.35 : cur().threshold), set: ch((c, v) => { c.threshold = v; }) }, pct)) : null,
      on ? S(Object.assign({ label: "ריכוך קצוות", min: 0, max: 0.3, step: 0.01, get: () => cur().soft || 0, set: ch((c, v) => { c.soft = v; }) }, pct)) : null,
      on ? S(Object.assign({ label: "ניקוי שוליים", min: 0, max: 1, step: 0.05, get: () => (cur().edge == null ? 0.5 : cur().edge), set: ch((c, v) => { c.edge = v; }) }, pct)) : null);
  }

  // ---------- scatter along a path ----------
  function styleScatter(e) {
    const sc = () => App.sel().scatter;
    const P = (fn, then) => upd((x, v) => { fn(x.scatter, v, x); Studio.refreshScatter(App.rec, x, true); }, then);
    const ends = (end) => S(Object.assign({ label: end ? "עומק בסוף" : "עומק בהתחלה", min: -0.3, max: 1, step: 0.01, get: () => { const p = sc().points; return (end ? p[p.length - 1] : p[0]).z || 0; },
      set: P((s, v, x) => App.scatterDepth(x, end, round(v, 3))) }, pct));
    const it = e.scatter.item, max = Studio.scatterLimit(e), grows = e.scatter.size !== "constant";
    const pointBtn = (label, ic, run) => UI.button(label, run, { small: true, kind: "ghost", icon: ic });
    const addPoint = () => upd((x) => {
      const p = x.scatter.points, sel = Stage.pointSel && Stage.pointSel.id === x.id ? Stage.pointSel.i : -1;
      let i = sel >= 0 ? Math.min(sel, p.length - 2) : 0;
      if (sel < 0) { let far = -1; for (let j = 0; j < p.length - 1; j++) { const d = Math.hypot(p[j + 1].x - p[j].x, p[j + 1].y - p[j].y, (p[j + 1].z || 0) - (p[j].z || 0)); if (d > far) { far = d; i = j; } } }
      if (p.length >= 64) return;
      p.splice(i + 1, 0, { x: round((p[i].x + p[i + 1].x) / 2), y: round((p[i].y + p[i + 1].y) / 2), z: round(((p[i].z || 0) + (p[i + 1].z || 0)) / 2) });
      Stage.pointSel = { id: x.id, i: i + 1 };
      Studio.refreshScatter(App.rec, x, true);
    })(null, true);
    const delPoint = () => {
      const x = App.sel(); if (!x) return;
      if (x.scatter.points.length <= 2) return toast("לקו צריך לפחות שתי נקודות", { kind: "warn" });
      upd((y) => { const p = y.scatter.points, sel = Stage.pointSel && Stage.pointSel.id === y.id ? Stage.pointSel.i : Math.floor(p.length / 2); p.splice(Math.max(0, Math.min(p.length - 1, sel)), 1); Stage.pointSel = null; Studio.refreshScatter(App.rec, y, true); })(null, true);
    };
    const out = [
      UI.group("עומק", ends(false), ends(true), note("הקו מתחיל על היצירה. ״עומק בסוף״ מקרב את סוף הקו אלייך, כמו עין שיוצאת מהתמונה.", "cube")),
      UI.group("העותקים",
        S({ label: "מספר עותקים", min: 1, max, step: 1, get: () => Math.min(max, sc().count), set: P((s, v) => { s.count = Math.round(v); }) }),
        C({ label: "מרווחים", wrap: true, options: [{ id: "even", name: "שווים" }, { id: "grow", name: "הולכים וגדלים" }, { id: "shrink", name: "הולכים וקטנים" }], get: () => sc().spacing, set: P((s, v) => { s.spacing = v; }) }),
        C({ label: "גודל", wrap: true, options: [{ id: "constant", name: "קבוע" }, { id: "grow", name: "הולך וגדל" }, { id: "shrink", name: "הולך וקטן" }], get: () => sc().size, set: P((s, v) => { s.size = v; }, build) }),
        grows ? S({ label: "כמה", min: 1, max: 6, step: 0.1, unit: "×", get: () => sc().amount, set: P((s, v) => { s.amount = round(v, 2); }) }) : null,
        C({ label: "כיוון", wrap: true, options: [{ id: "keep", name: "כמו המקור" }, { id: "follow", name: "לאורך הקו" }], get: () => sc().facing, set: P((s, v) => { s.facing = v; }) }),
        it.type === "video" || it.type === "model" ? note("עד " + max + " עותקים, כדי שהטלפון יצייר אותם בנוחות.") : null),
      UI.group("הקו",
        C({ label: "", bare: true, options: [{ id: "straight", name: "ישר" }, { id: "curved", name: "מעוקל" }], get: () => (sc().curved ? "curved" : "straight"), set: P((s, v) => { s.curved = v === "curved"; }) }),
        h("div.btn-grid", pointBtn("הוספת נקודה", "plus", addPoint), pointBtn("מחיקת נקודה", "trash", delPoint),
          pointBtn("לצייר את הקו מחדש", "edit", () => App.scatterFrom(App.selId)), pointBtn("להפריד לשכבות", "layers", () => App.breakScatter(App.selId))),
        note("גוררים את הנקודות הלבנות על הקו. בתצוגת תלת־ממד נוגעים בנקודה ומזיזים אותה בחיצים, גם לעומק.", "move"))
    ];
    if (it.type === "image" || it.type === "video") out.push(chromaGroup(e));
    out.push(UI.group("שקיפות", opacity()));
    return out;
  }
  // ---------- fan / rosette ----------
  function styleFan(e) {
    const sc = () => App.sel().scatter, fan = () => sc().fan;
    const P = (fn, then) => upd((x, v) => { x.scatter = Object.assign({}, x.scatter, { fan: Object.assign({}, x.scatter.fan) }); fn(x.scatter, v, x.scatter.fan); Studio.refreshScatter(App.rec, x, true); }, then);
    const it = e.scatter.item, max = Studio.scatterLimit(e), grows = e.scatter.size !== "constant";
    const deg = { unit: "°" };
    return [
      UI.group("המניפה",
        C({ label: "", bare: true, options: [{ id: "fan", name: "מניפה" }, { id: "round", name: "רוזטה" }], get: () => (fan().angle >= 359.5 ? "round" : "fan"), set: P((s, v, f) => { f.angle = v === "round" ? 360 : 120; }) }),
        S({ label: "מספר עותקים", min: 1, max, step: 1, get: () => Math.min(max, sc().count), set: P((s, v) => { s.count = Math.round(v); }) }),
        S(Object.assign({ label: "זווית פתיחה", min: 10, max: 360, step: 1, get: () => fan().angle, set: P((s, v, f) => { f.angle = Math.round(v); }) }, deg)),
        S(Object.assign({ label: "רדיוס", min: 0, max: 1, step: 0.005, get: () => fan().radius || 0, set: P((s, v, f) => { f.radius = round(v, 3); }) }, pct)),
        S(Object.assign({ label: "כיוון", min: -180, max: 180, step: 1, get: () => fan().dir || 0, set: P((s, v, f) => { f.dir = Math.round(v); }) }, deg)),
        note("רדיוס 0: כל העותקים מסתובבים סביב נקודה אחת, כמו מניפת יד. 360° = רוזטה, עיגול שלם.", "fan")),
      UI.group("העותקים",
        C({ label: "סיבוב העותקים", wrap: true, options: [{ id: "follow", name: "כמו קרני שמש" }, { id: "keep", name: "כמו המקור" }], get: () => sc().facing, set: P((s, v) => { s.facing = v; }) }),
        C({ label: "נקודת האחיזה", wrap: true, options: [{ id: "base", name: "בתחתית" }, { id: "center", name: "באמצע" }], get: () => fan().pivot, set: P((s, v, f) => { f.pivot = v; }) }),
        C({ label: "גודל", wrap: true, options: [{ id: "constant", name: "קבוע" }, { id: "grow", name: "הולך וגדל" }, { id: "shrink", name: "הולך וקטן" }], get: () => sc().size, set: P((s, v) => { s.size = v; }, build) }),
        grows ? S({ label: "כמה", min: 1, max: 6, step: 0.1, unit: "×", get: () => sc().amount, set: P((s, v) => { s.amount = round(v, 2); }) }) : null,
        T({ label: "הראשון מעל", hint: "בדרך כלל האחרון מונח מעל כולם", get: () => !!fan().flip, set: P((s, v, f) => { f.flip = !!v; }) }),
        it.type === "video" || it.type === "model" ? note("עד " + max + " עותקים, כדי שהטלפון יצייר אותם בנוחות.") : null),
      UI.group("עומק",
        S(Object.assign({ label: "עומק בהתחלה", min: -0.3, max: 1, step: 0.01, get: () => fan().z0 || 0, set: P((s, v, f) => { f.z0 = round(v, 3); }) }, pct)),
        S(Object.assign({ label: "עומק בסוף", min: -0.3, max: 1, step: 0.01, get: () => fan().z1 || 0, set: P((s, v, f) => { f.z1 = round(v, 3); }) }, pct)),
        note("עומק שונה להתחלה ולסוף מעמיד את המניפה כמו מדרגות אלייך. הטיה של כל המניפה: בהמשך העמוד, ב״עומק והטיה״.", "cube")),
      h("div.btn-row", UI.button("להפריד לשכבות", () => App.breakScatter(App.selId), { kind: "ghost", icon: "layers" })),
      it.type === "image" || it.type === "video" ? chromaGroup(e) : null,
      UI.group("שקיפות", opacity())
    ];
  }
  const sound = () => [
    S(Object.assign({ label: "עוצמת קול", min: 0, max: 1, step: 0.01, get: () => (App.sel().volume == null ? 1 : App.sel().volume), set: upd((x, v) => { x.volume = v; }) }, pct)),
    T({ label: "חוזר שוב ושוב", get: () => App.sel().loop !== false, set: upd((x, v) => { x.loop = v; }) })
  ];

  // the holographic foil on a picture, a sticker or a text: a rainbow that moves with the viewing angle
  function foilGroup() {
    const on = () => App.sel().fx === "holo";
    return UI.group("ברק הולוגרפי",
      T({ label: "ברק הולוגרפי", hint: "קשת צבעים שזזה כשמזיזים את הטלפון", get: on,
        set: (v, f) => { upd((x, val) => { if (val) { x.fx = "holo"; if (x.fxAmount == null) x.fxAmount = 0.5; } else { delete x.fx; delete x.fxAmount; } })(v, f); build(); } }),
      on() ? S(Object.assign({ label: "עוצמה", min: 0, max: 1, step: 0.01, get: () => (Number.isFinite(App.sel().fxAmount) ? App.sel().fxAmount : 0.5), set: upd((x, v) => { x.fxAmount = v; }) }, pct)) : null);
  }
  // ---------- live code animations ----------
  const CODEFX_TEXT = {
    colors: { dissolve: ["הרקע שמאחור", "ניצוץ", "ניצוץ שני"], dust: ["זהב בהיר", "זהב", "זהב כהה"], portal: ["העולם", "הזוהר", "האור"], swarm: ["צבע", "צבע שני", "ברק"], ivy: ["עלים", "פרחים", "לב הפרח"],
      burn: ["הרקע שמאחור", "להבה", "ניצוצות"], fireflies: ["אור", "אור שני", "הילה"], jelly: ["גוף", "זוהר", "זרועות"], tree: ["גזע", "עלים או פרחים", "גוון שני"],
      spiral: ["מרכז", "אמצע", "שוליים"], bubbles: ["גוון", "גוון שני", "גוון שלישי"], liquid: ["כהה", "אמצע", "ברק"], lanterns: ["נייר", "להבה", "זוהר"] },
    amount: { dissolve: "צפיפות החלקיקים", dust: "כמות האבק", portal: "עומק", swarm: "כמה", ivy: "כמות עלים ופרחים",
      burn: "רוחב הלהבה", fireflies: "כמה", jelly: "כמה", tree: "כמות עלים", spiral: "כמה זרעים", bubbles: "כמה", liquid: "כמה טיפות", lanterns: "כמה" },
    size: { dissolve: "גודל החלקיקים", dust: "גודל הנצנוצים", swarm: "גודל", ivy: "גודל העלים",
      burn: "גודל הכתמים", fireflies: "גודל", jelly: "גודל", tree: "גודל העלים", spiral: "גודל הזרעים", bubbles: "גודל", liquid: "גודל", lanterns: "גודל" },
    touch: { swarm: "נגיעה מבריחה אותם", burn: "נגיעה מציתה את התמונה", fireflies: "הן מתקרבות לאצבע", jelly: "נגיעה דוחפת אותן", bubbles: "נגיעה מפוצצת בועה",
      liquid: "טיפה אחת נמשכת אחרי האצבע", lanterns: "נגיעה מזיזה אותם הצידה" },
    note: { portal: "העומק נראה הכי טוב במצלמה: כשזזים מול היצירה, רואים את העולם שמאחורי החלון מזוויות אחרות.", swarm: "בתלת־ממד ובמצלמה הם שוחים גם במרחב שלפני היצירה.",
      liquid: "במצלמה ההשתקפויות במתכת זזות כשמזיזים את הטלפון.", bubbles: "הצבעים בבועה משתנים לפי הזווית, כמו בבועת סבון אמיתית.", burn: "התמונה נשרפת, נעלמת לרגע וחוזרת. בלי ״רקע מאחור״ רואים דרכה את מה שמתחת.",
      fireflies: "במצב ״מסתנכרנות״ הן מהבהבות כל אחת בקצב שלה, ולאט לאט מתחילות להבהב יחד.", tree: "העץ צומח, עומד ברוח ונעלם, ושוב מההתחלה. ״וריאציה״ נותנת עץ בצורה אחרת." }
  };
  function styleCodeFx() {
    const cur = () => App.sel().codefx, look = cur().look, d = Studio.CODEFX.find((c) => c.id === look);
    const X = (fn, then) => upd((x, v) => { x.codefx = Object.assign({}, x.codefx); fn(x.codefx, v, x); }, then);
    const swatch = (colors) => h("span.swatch", colors.map((c) => h("i", { style: { background: c } })));
    // a school's (tree's, spiral's, metal's) colours follow its kind while they are still that kind's own (orange fish, dark birds, bright butterflies)
    const KIND_COLORS = { swarm: [d.colors, ["#2b2d42", "#5c6378", "#d9dde8"], ["#ff9ecb", "#ffd166", "#9ad0ff"]],
      tree: [d.colors, ["#4a3426", "#ffc0d9", "#ff7eb3"], ["#4a3020", "#e8772e", "#f5c542"]],
      spiral: [d.colors, ["#fff6d5", "#9b7bff", "#2de2e6"], ["#ffd166", "#ff6fa5", "#7b2cbf"]],
      liquid: [d.colors, ["#3a2205", "#d4a017", "#fff4c2"], ["#2b0a3d", "#ff4d6d", "#ffb703"]] };
    const sets = (KIND_COLORS[look] || [d.colors]).map((colors, i) => ({ name: i ? d.kinds[i] : "המקורי", colors })).concat(look === "dissolve" ? [] : Studio.PATTERN_PALETTES); // each kind's own colours first
    const pals = C({ label: "ערכות צבע", wrap: true, options: sets.map((p, i) => ({ id: String(i), swatch: swatch(p.colors), title: p.name })),
      get: () => String(sets.findIndex((p) => p.colors.join() === cur().colors.join())), set: X((c, v) => { c.colors = sets[+v].colors.slice(); }, sync) });
    pals.node.classList.add("swatches");
    const col = (i) => K({ label: CODEFX_TEXT.colors[look][i], get: () => cur().colors[i], set: X((c, v) => { c.colors = c.colors.slice(); c.colors[i] = v; }) });
    const fitWords = (c, x) => { if (!window.StudioCodeFx) return; x.aspect = StudioCodeFx.wordsAspect(c.text, c.font || "heebo"); x.h = (x.w / x.aspect) * artRatio(); };
    const kindSet = X((c, v) => { const k = KIND_COLORS[look]; if (k && k[c.kind || 0] && k[c.kind || 0].join() === c.colors.join()) c.colors = k[+v].slice(); c.kind = +v; }, sync);
    const out = [UI.group("סוג", C({ label: "", bare: true, wrap: true, options: d.kinds.map((name, i) => ({ id: String(i), name })), get: () => String(cur().kind || 0), set: kindSet }))];
    if (look === "dust") {
      const ta = h("textarea.field", { rows: 2, dir: "auto", maxlength: 60, "aria-label": "הברכה", id: "in-dust-text", placeholder: "מה כתוב באבק?" });
      ta.value = cur().text || "";
      ta.onchange = () => { const x = App.sel(); if (!x || x.type !== "codefx") return; x.codefx = Object.assign({}, x.codefx, { text: ta.value.slice(0, 60) || " " }); fitWords(x.codefx, x); App.changed(true); };
      ctls.push({ sync: () => { const x = App.sel(); if (x && x.codefx && document.activeElement !== ta && ta.value !== (x.codefx.text || "")) ta.value = x.codefx.text || ""; } });
      const fonts = C({ label: "גופן", wrap: true, options: Studio.FONTS.map((f) => ({ id: f.id, name: f.name })), get: () => cur().font || "heebo", set: X((c, v, x) => { c.font = v; fitWords(c, x); }) });
      fonts.node.querySelectorAll(".chip").forEach((b) => { b.style.fontFamily = '"BA ' + b.dataset.id + '", Heebo, sans-serif'; b.classList.add("font-chip"); });
      out.push(UI.group("הברכה", UI.field("מה כתוב", ta), fonts, note("עד שלוש שורות. השינוי נראה כשיוצאים מהתיבה.")));
    }
    out.push(UI.group("צבעים", pals, h("div.color-trio", col(0).node, col(1).node, col(2).node)));
    out.push(UI.group("התאמה",
      S(Object.assign({ label: "מהירות", min: 0, max: 1, step: 0.01, get: () => (Number.isFinite(cur().speed) ? cur().speed : 0.5), set: X((c, v) => { c.speed = v; }) }, pct)),
      S(Object.assign({ label: CODEFX_TEXT.amount[look], min: 0, max: 1, step: 0.01, get: () => (Number.isFinite(cur().amount) ? cur().amount : 0.5), set: X((c, v) => { c.amount = v; }) }, pct)),
      CODEFX_TEXT.size[look] ? S(Object.assign({ label: CODEFX_TEXT.size[look], min: 0, max: 1, step: 0.01, get: () => (Number.isFinite(cur().size) ? cur().size : 0.5), set: X((c, v) => { c.size = v; }) }, pct)) : null,
      look === "portal" ? L({ label: "צורת החלון", options: [{ id: "rect", name: "מלבן" }, { id: "circle", name: "עיגול" }, { id: "arch", name: "קשת" }], get: () => cur().shape || "rect",
        set: X((c, v, x) => { c.shape = v; x.aspect = v === "circle" ? 1 : v === "arch" ? 0.75 : artRatio(); x.h = (x.w / x.aspect) * artRatio(); }) }) : null,
      look !== "portal" ? S({ label: "וריאציה", min: 0, max: 999, step: 1, get: () => cur().seed || 0, set: X((c, v) => { c.seed = Math.round(v); }) }) : null,
      Studio.CODEFX_PICTURE.includes(look) ? T({ label: "רקע מאחור", hint: look === "burn" ? "מסתיר את התמונה המודפסת כשהיא נשרפת" : "מסתיר את התמונה המודפסת כשהחלקיקים עפים", get: () => cur().cover !== false, set: X((c, v) => { c.cover = v; }) }) : null,
      !["portal", "ivy", "tree"].includes(look) ? T({ label: "מגיב למגע", hint: CODEFX_TEXT.touch[look] || "נגיעה מפזרת את החלקיקים", get: () => cur().touch !== false, set: X((c, v) => { c.touch = v; }) }) : null,
      opacity()));
    out.push(h("section.group", note(CODEFX_TEXT.note[look] || "האנימציה רצה כאן, בתצוגה המקדימה ובמצלמה.", "cube")));
    return out;
  }
  // a small still of each pattern look, drawn once
  const lookPics = {};
  function lookPic(id) {
    if (!(id in lookPics)) { try { lookPics[id] = Studio.patternFrame({ type: "pattern", pattern: Studio.patternDefaults(id) }, 64, 64, 1).toDataURL(); } catch (e) { lookPics[id] = ""; } }
    return lookPics[id] ? h("span.look-pic", { style: { backgroundImage: "url(" + lookPics[id] + ")" } }) : null;
  }
  function stylePattern() {
    const swatch = (colors) => h("span.swatch", colors.map((c) => h("i", { style: { background: c } })));
    const P = (fn, then) => upd((x, v) => { x.pattern = Object.assign({}, x.pattern); fn(x.pattern, v, x); }, then);
    const looks = C({ label: "", bare: true, wrap: true, options: Studio.PATTERNS.map((p) => ({ id: p.id, name: p.name, swatch: lookPic(p.id) })), get: () => App.sel().pattern.look,
      set: P((p, v) => { const d = Studio.patternDefaults(v); p.look = v; p.colors = d.colors; p.speed = d.speed; }, sync) });
    const pals = C({ label: "ערכות צבע", wrap: true, options: Studio.PATTERN_PALETTES.map((p, i) => ({ id: String(i), swatch: swatch(p.colors), title: p.name })),
      get: () => String(Studio.PATTERN_PALETTES.findIndex((p) => p.colors.join() === App.sel().pattern.colors.join())), set: P((p, v) => { p.colors = Studio.PATTERN_PALETTES[+v].colors.slice(); }, sync) });
    pals.node.classList.add("swatches"); looks.node.classList.add("looks");
    // the one-tap way back to a pattern that covers the whole artwork
    const fill = h("button.btn.ghost.small", { type: "button", onclick: () => {
      const e = App.sel(); if (!e) return;
      if (App.keyed(e)) return toast("לשכבה הזו יש מסלול תנועה, אז המיקום שלה נקבע שם", { kind: "warn" });
      e.pattern = Object.assign({}, e.pattern, { shape: "art" }); e.aspect = Studio.patternAspect(App.rec, "art");
      e.w = e.h = 1; e.x = e.y = e.z = e.rot = 0;
      App.changed(true); sync();
    } }, icon("image", 16), h("span", "מילוי תמונת המקור"));
    const col = (i) => K({ label: "צבע " + (i + 1), get: () => App.sel().pattern.colors[i], set: P((p, v) => { p.colors = p.colors.slice(); p.colors[i] = v; }) });
    if (Studio.isWeather(App.sel())) return styleWeather(P);
    if (App.sel().pattern.look === "solid") return [
      UI.group("צבע", K({ label: "צבע הרקע", get: () => App.sel().pattern.colors[0], set: P((p, v) => { p.colors = [v, v, v]; }) })),
      UI.group("צורה", L({ label: "צורה", options: Studio.PATTERN_SHAPES, get: () => App.sel().pattern.shape,
        set: P((p, v, x) => { p.shape = v; x.aspect = Studio.patternAspect(App.rec, v); x.h = (x.w / x.aspect) * artRatio(); }) }), fill),
      UI.group("שקיפות", opacity()),
      UI.group("מראה אחר", note("אפשר להפוך את הצבע האחיד לרקע מונפש."), looks)
    ];
    const pt = () => (Studio.PATTERN_TOUCH.includes(App.sel().pattern.touch) ? App.sel().pattern.touch : "none");
    const touchGroup = UI.group("מגע",
      L({ label: "כשנוגעים ברקע", options: [{ id: "none", name: "לא מגיב" }, { id: "ripple", name: "אדוות, כמו אבן במים" }, { id: "lens", name: "נמשך אל האצבע" }, { id: "swirl", name: "מסתחרר סביב האצבע" }], get: pt,
        set: (v, f) => { P((p, val) => { if (val === "none") { delete p.touch; delete p.touchPower; } else p.touch = val; })(v, f); build(); } }),
      pt() !== "none" ? S(Object.assign({ label: "עוצמה", min: 0.1, max: 1, step: 0.05, get: () => (App.sel().pattern.touchPower > 0 ? App.sel().pattern.touchPower : 0.6), set: P((p, v) => { p.touchPower = v; }) }, pct)) : null,
      pt() !== "none" ? note("בתצוגה ובמצלמה: נוגעים ברקע או גוררים עליו אצבע.") : null);
    return [
      UI.group("מראה", looks),
      UI.group("צבעים", pals, h("div.color-trio", col(0).node, col(1).node, col(2).node)),
      UI.group("התאמה",
        S(Object.assign({ label: "גודל הדוגמה", min: 0, max: 1, step: 0.01, get: () => App.sel().pattern.size, set: P((p, v) => { p.size = v; }) }, pct)),
        S(Object.assign({ label: "מהירות", min: 0, max: 1, step: 0.01, get: () => App.sel().pattern.speed, set: P((p, v) => { p.speed = v; }) }, pct)),
        S({ label: "וריאציה", min: 0, max: 999, step: 1, get: () => App.sel().pattern.seed, set: P((p, v) => { p.seed = Math.round(v); }) }),
        L({ label: "צורה", options: Studio.PATTERN_SHAPES, get: () => App.sel().pattern.shape,
          set: P((p, v, x) => { p.shape = v; x.aspect = Studio.patternAspect(App.rec, v); x.h = (x.w / x.aspect) * artRatio(); }) }),
        fill, opacity()),
      touchGroup
    ];
  }

  // "תצוגה": flat on the artwork, or out into the space in front of it
  function viewGroup(get, set, text) {
    return UI.group("תצוגה", C({ label: "", bare: true, options: [{ id: "flat", name: "שטוח" }, { id: "3d", name: "תלת־ממד" }], get: () => (get() ? "3d" : "flat"), set }), note(text, "cube"));
  }
  // The sun and smoke: kind, size (the layer's own width, keeping its proportions), intensity, tint, speed, variation.
  const WX_TINTS = { sun: ["#ffd27a", "#fff3d6", "#ffb347", "#ff7b3a", "#ffe9a8"], smoke: ["#d9d4cc", "#f4f2ee", "#8f8a84", "#c9b79a", "#a7b4c2"], fire: ["#ff8a2a", "#ffb340", "#ff5a1f", "#4da3ff", "#7dff6a"] };
  function styleWeather(P) {
    const look = App.sel().pattern.look, w = Studio.WEATHER.find((x) => x.id === look);
    const kinds = C({ label: "", bare: true, wrap: true, options: w.kinds.map((name, i) => ({ id: String(i), name })), get: () => String(App.sel().pattern.kind || 0), set: (v, f) => { P((p, val) => { p.kind = +val; })(v, f); if (look === "sun") build(); } });
    const rayKind = look === "sun" && [0, 2].includes(App.sel().pattern.kind || 0);
    const swatch = (c) => h("span.swatch", h("i", { style: { background: c } }));
    const tints = C({ label: "גוונים מוכנים", wrap: true, options: WX_TINTS[look].map((c) => ({ id: c, swatch: swatch(c), title: c })), get: () => App.sel().pattern.colors[0], set: P((p, v) => { p.colors = [v, v, v]; }, sync) });
    tints.node.classList.add("swatches");
    const size = S(Object.assign({ label: "גודל", min: 0.1, max: 2, step: 0.01, get: () => App.sel().w, set: upd((x, v) => { x.w = round(v, 3); x.h = (x.w / x.aspect) * artRatio(); }) }, pct));
    return [
      viewGroup(() => App.sel().pattern.depth3d === true, P((p, v) => { if (v === "3d") p.depth3d = true; else delete p.depth3d; }),
        look === "sun" ? "בתלת־ממד השמש מתרוממת מהיצירה ופונה תמיד אל הצופה. רואים את זה במבט תלת־ממד ובמצלמה." : (look === "fire" ? "בתלת־ממד האש עולה מנקודה אחת על היצירה ונפתחת אל הצופה. רואים את זה במבט תלת־ממד ובמצלמה." : "בתלת־ממד העשן עולה מנקודה אחת על היצירה ונפתח אל הצופה. רואים את זה במבט תלת־ממד ובמצלמה.")),
      UI.group("סוג", kinds),
      UI.group("התאמה",
        size,
        S(Object.assign({ label: "עוצמה", min: 0, max: 1, step: 0.01, get: () => (App.sel().pattern.power == null ? 0.6 : App.sel().pattern.power), set: P((p, v) => { p.power = v; }) }, pct)),
        S(Object.assign({ label: look === "sun" ? "גודל השמש" : look === "fire" ? "גובה הלהבה" : "גודל הענן", min: 0, max: 1, step: 0.01, get: () => App.sel().pattern.size, set: P((p, v) => { p.size = v; }) }, pct)),
        S(Object.assign({ label: "מהירות", min: 0, max: 1, step: 0.01, get: () => App.sel().pattern.speed, set: P((p, v) => { p.speed = v; }) }, pct)),
        S({ label: "וריאציה", min: 0, max: 999, step: 1, get: () => App.sel().pattern.seed, set: P((p, v) => { p.seed = Math.round(v); }) })),
      rayKind ? UI.group("קרניים",
        S(Object.assign({ label: "אורך הקרניים", min: 0, max: 1, step: 0.01, get: () => (App.sel().pattern.rayLen == null ? 0.5 : App.sel().pattern.rayLen), set: P((p, v) => { p.rayLen = v; }) }, pct)),
        S(Object.assign({ label: "צפיפות הקרניים", min: 0, max: 1, step: 0.01, get: () => (App.sel().pattern.rayDen == null ? 0.5 : App.sel().pattern.rayDen), set: P((p, v) => { p.rayDen = v; }) }, pct))) : null,
      UI.group("גוון צבע", tints, K({ label: "גוון", get: () => App.sel().pattern.colors[0], set: P((p, v) => { p.colors = [v, v, v]; }) })),
      UI.group("שקיפות", opacity())
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
    const two = !!pc().color2, touch = Studio.TOUCH_MODES.includes(pc().touch) ? pc().touch : "none";
    const touchGroup = UI.group("מגע",
      L({ label: "כשנוגעים במסך", options: [{ id: "none", name: "לא מגיבים" }, { id: "follow", name: "עוקבים אחרי האצבע" }, { id: "attract", name: "נמשכים לאצבע" }, { id: "repel", name: "בורחים מהאצבע" }, { id: "swirl", name: "מסתחררים סביב האצבע" }],
        get: () => (Studio.TOUCH_MODES.includes(pc().touch) ? pc().touch : "none"), set: (v, f) => { P((p, val) => { if (val === "none") delete p.touch; else p.touch = val; })(v, f); build(); } }),
      touch !== "none" ? S(Object.assign({ label: touch === "follow" ? "זריזות" : "עוצמה", min: 0.1, max: 1, step: 0.05, get: () => (pc().touchPower > 0 ? pc().touchPower : 0.6), set: P((p, v) => { p.touchPower = v; }) }, pct)) : null,
      touch !== "none" && touch !== "follow" ? S(Object.assign({ label: "עד כמה רחוק מהאצבע", min: 0.1, max: 1.5, step: 0.05, get: () => (pc().touchRange > 0 ? pc().touchRange : 0.6), set: P((p, v) => { p.touchRange = v; }) }, pct)) : null,
      touch !== "none" ? T({ label: "חוזרים למקום", hint: "כשמרימים את האצבע", get: () => pc().touchBack !== false, set: P((p, v) => { p.touchBack = v; }) }) : null,
      touch !== "none" ? note(touch === "follow" ? "בתצוגה ובמצלמה: מניחים אצבע על החלקיקים וגוררים, והם באים אחריה." : "בתצוגה ובמצלמה: נוגעים במסך או גוררים אצבע ליד החלקיקים.") : null);
    return [
      viewGroup(() => pc().depth3d === true, P((p, v) => { if (v === "3d") p.depth3d = true; else delete p.depth3d; }),
        "בתלת־ממד החלקיקים מתפזרים גם במרחב שלפני היצירה, קרוב ורחוק. רואים את זה במבט תלת־ממד ובמצלמה."),
      UI.group("סוג", preset, pc().preset === "custom" ? UI.button("החלפת התמונה", ownSprite, { kind: "ghost", small: true, icon: "image" }) : null),
      UI.group("כמות ותנועה",
        S({ label: "כמות", min: 10, max: 500, step: 10, get: () => pc().count || 120, set: P((p, v) => { p.count = Math.round(v); }) }),
        S({ label: "גודל", min: 2, max: 200, step: 1, get: () => pc().size || 12, set: P((p, v) => { p.size = v; }) }),
        S({ label: "מהירות", min: 0.2, max: 10, step: 0.1, get: () => pc().speed || 1, set: P((p, v) => { p.speed = v; }) }),
        S({ label: "פיזור", min: 0.1, max: 2, step: 0.1, get: () => (pc().spread > 0 ? pc().spread : 1), set: P((p, v) => { p.spread = v; }) }),
        pc().turn && pc().direction >= 0 ? S({ label: "נטייה ברוח", min: -60, max: 60, step: 1, unit: "°", get: () => (pc().direction | 0) - 180, set: (v, f) => { P((p, val) => { p.direction = 180 + Math.round(val); })(v, f); } }) : null,
        pc().flap > 0 ? S({ label: "נפנוף כנפיים", min: 0.5, max: 8, step: 0.1, get: () => pc().flap, set: P((p, v) => { p.flap = v; }) }) : null,
        L({ label: "כיוון", options: dirs, get: () => (pc().direction == null ? "preset" : String(pc().direction)), set: P((p, v) => { p.direction = v === "preset" ? null : parseInt(v, 10); }) }),
        L({ label: "צורת האזור", options: [{ id: "box", name: "מלבן" }, { id: "disc", name: "עיגול" }, { id: "sphere", name: "כדור" }], get: () => pc().emitter || "box", set: P((p, v) => { p.emitter = v; }) })),
      UI.group("צבע",
        K({ label: "צבע", get: () => pc().color || "#ffd94d", set: P((p, v) => { p.color = v; }) }),
        T({ label: "צבע שני", hint: "חלק מהחלקיקים בצבע אחר", get: () => !!pc().color2, set: (v, f) => { P((p, val) => { if (val) p.color2 = p.color2 || "#ffffff"; else delete p.color2; })(v, f); build(); } }),
        two ? K({ label: "הצבע השני", get: () => pc().color2 || "#ffffff", set: P((p, v) => { p.color2 = v; }) }) : null,
        T({ label: "דעיכה בסוף", hint: "החלקיק נעלם בעדינות", get: () => !!pc().fade, set: P((p, v) => { p.fade = v; }) }),
        opacity()),
      touchGroup
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
      if (n > 1 || !Studio.isStill(e)) out.push(UI.group("תנועת המודל",
        n > 1 ? L({ label: "איזו תנועה", options: opts, get: () => String(App.sel().modelClip || 0), set: upd((x, v) => { x.modelClip = parseInt(v, 10) || 0; }) }) : null,
        Studio.isStill(e) ? null : T({ label: "חוזרת שוב ושוב", get: () => App.sel().modelLoop !== false, set: upd((x, v) => { x.modelLoop = v; }) }),
        Studio.isStill(e) ? null : S({ label: "מהירות", min: 0.1, max: 4, step: 0.1, unit: "×", get: () => App.sel().modelSpeed || 1, set: upd((x, v) => { x.modelSpeed = v; }) })));
    } else out.push(UI.group("תנועת המודל", note("במודל הזה אין תנועה מובנית. אפשר להזיז אותו בלשונית ״תנועה״.")));
    out.push(UI.group("שקיפות", opacity(), note("כדי לסובב את המודל במרחב עוברים לתצוגת תלת־ממד, מעל הקנבס.", "cube")));
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
  // ---------- frozen motion: on top of the style tab of any layer that moves by itself ----------
  function stillGroup(e) {
    if (!App.movesItself(e)) return null;
    const still = Studio.isStill(e);
    return UI.group("",
      T({ label: "להקפיא תנועה", hint: "נעצר על רגע אחד, גם בתצוגה המקדימה ובמצלמה", get: () => Studio.isStill(App.sel()), set: (v) => { App.setStill(App.selId, v); } }),
      still ? S(Object.assign({ label: "הרגע שמוצג", min: 0, max: 1, step: 0.01, get: () => Studio.stillAt(App.sel()), set: (v, f) => App.setStillAt(App.selId, v, f) }, pct)) : null);
  }
  function styleTab(e) { const g = stillGroup(e), out = styleOf(e).concat(gravityGroup(e) || []); return g ? [g, ...out] : out; }
  // real gravity: what the switch does for each kind of layer
  const GRAVITY_HINT = { image: "תלויה מהקצה העליון ומתנדנדת לפי הכיוון האמיתי של למטה", video: "תלוי מהקצה העליון ומתנדנד לפי הכיוון האמיתי של למטה",
    text: "תלוי מהקצה העליון ומתנדנד לפי הכיוון האמיתי של למטה", particles: "החלקיקים זורמים לכיוון האמיתי של למטה", pattern: "העשן והאש עולים תמיד כלפי מעלה",
    dissolve: "החלקיקים עפים לפי הכיוון האמיתי", dust: "האבק עף לפי הכיוון האמיתי", burn: "הניצוצות עולים כלפי מעלה, ו״מלמטה למעלה״ נשרף מהצד התחתון האמיתי",
    jelly: "המדוזות עולות תמיד כלפי מעלה", tree: "העלים נושרים כלפי מטה", bubbles: "הבועות עולות כלפי מעלה", liquid: "הטיפות זורמות לצד הנמוך", lanterns: "הפנסים עולים תמיד לשמיים" };
  function gravityGroup(e) {
    if (!Studio.gravityFits || !Studio.gravityFits(e)) return null;
    const hint = GRAVITY_HINT[e.type === "codefx" ? e.codefx.look : e.type];
    const on = e.gravity === true, tune = () => Studio.gravityTuneOf(App.sel());
    // one value of el.gravityTune; values back at their default are left out
    const GT = (fn) => upd((x, v) => {
      const t = Object.assign({}, x.gravityTune || {}); fn(t, v);
      for (const k of Object.keys(t)) if (t[k] === Studio.GRAVITY_TUNE[k]) delete t[k];
      if (Object.keys(t).length) x.gravityTune = t; else delete x.gravityTune;
    });
    const tS = (key, label, hint) => S(Object.assign({ label, hint, min: 0, max: 1, step: 0.01, get: () => tune()[key], set: GT((t, v) => { t[key] = round(v, 2); }) }, pct));
    const hangs = ["image", "video", "text"].includes(e.type), pile = e.type === "particles" && tune().pile;
    return UI.group("גרביטציה",
      T({ label: "לפי כוח המשיכה האמיתי", hint, get: () => App.sel().gravity === true,
        set: (v, f) => { upd((x, val) => { if (val) { x.gravity = true; Studio.askTilt(); } else delete x.gravity; })(v, f); build(); } }),
      on ? tS("power", "עוצמה", "כמה מהסיבוב האמיתי השכבה מקבלת. 100%: בדיוק כמו בעולם, פחות: רק נוטה קצת") : null,
      on ? tS("speed", "מהירות תגובה", "כמה מהר היא מגיבה כשמסובבים") : null,
      on ? tS("calm", "התעלמות מרעידות", "הטיות קטנות לא מזיזות כלום, כך שיד רועדת לא מפריעה") : null,
      on && hangs ? tS("swing", "נדנוד", "0%: נתלית בלי להתנדנד, 100%: מתנדנדת הרבה זמן") : null,
      on ? T({ label: "הפוך כיוון", hint: "נגד כוח המשיכה, כמו בלונים שעולים למעלה", get: () => tune().flip, set: GT((t, v) => { t.flip = !!v; }) }) : null,
      on && e.type === "particles" ? T({ label: "הצטברות", hint: "החלקיקים נערמים בקצה: חלקיקים שנופלים למטה, חלקיקים שעולים למעלה. כשמסובבים את היצירה הערימה נשפכת",
        get: () => tune().pile, set: (v, f) => { GT((t, val) => { t.pile = !!val; })(v, f); build(); } }) : null,
      on && pile ? tS("pileMax", "גובה הערימה", "עד כמה מהשכבה הערימה יכולה להתמלא") : null,
      on && pile ? tS("pileRate", "כמה נשארים", "כמה מהחלקיקים שנוחתים נשארים בערימה") : null,
      on && pile ? tS("melt", "נמס", "0%: הערימה נשארת, יותר: נמסה לאט ומתחילה מחדש") : null,
      note("במצלמה: כשמסובבים את היצירה ימינה, התנועה זורמת ימינה, כמו בעולם האמיתי. כאן בעורך אפשר לראות את זה כשמסובבים את השכבה, ובטלפון גם כשמטים את הטלפון.", "refresh"));
  }
  function styleOf(e) {
    if (e.type === "text") return styleText(e);
    if (e.type === "image" || e.type === "video") return styleMedia(e);
    if (e.type === "pattern") return stylePattern(e);
    if (e.type === "codefx") return styleCodeFx(e);
    if (e.type === "particles") return styleParticles(e);
    if (e.type === "model") return styleModel(e);
    if (e.type === "timecube") return styleCube(e);
    if (e.type === "scatter") return e.scatter.layout === "fan" ? styleFan(e) : styleScatter(e);
    if (e.type === "sound") return [UI.group("צליל", sound(), note("הצליל מתנגן כשהמצלמה מזהה את היצירה. בטלפון הוא מתחיל אחרי נגיעה ראשונה במסך."))];
    if (e.type === "group") return [
      // a split picture's own controls come first, so on a phone they are in sight without scrolling
      e.split ? UI.group("הנפשה אוטומטית", ...Reveal.controls(e, { C, S, T, upd, note })) : null,
      UI.group("קבוצה",
      note((e.children || []).length + " שכבות שזזות, גדלות ומסתובבות יחד. נגיעה נוספת על הקנבס בוחרת שכבה אחת בתוכה, וגם ברשימת השכבות אפשר לבחור אחת.", "layers"),
      h("div.btn-row", UI.button("לפרק קבוצה", () => App.ungroup(App.selId), { kind: "ghost", icon: "ungroup" }))),
      e.split ? UI.group("פירוק לשכבות", S(Object.assign({ label: "מרחק בין השכבות", min: 0.02, max: 0.6, step: 0.01, get: () => (App.sel().split || {}).spread || 0.15, set: upd((x, v) => splitSpread(x, v)) }, pct)),
        note("כמה רחוקות השכבות זו מזו בעומק. רואים את זה במבט תלת־ממד ובמצלמה.", "cube")) : null,
      UI.group("שקיפות", opacity())].filter(Boolean);
    return [h("section.group", note("לשכבה הזו אין הגדרות עיצוב."))];
  }

  // the layers of a split picture move apart or together in depth, each keeping its share of the depth (a layer she
  // moved by hand keeps its own place in that share); the farthest one stays where it is
  function splitSpread(g, v) {
    const old = (g.split && g.split.spread) || 0.15, k = v / old, kids = Studio.groupChildren(App.rec, g);
    if (!kids.length || !isFinite(k)) return;
    const base = Math.min(...kids.map((c) => c.z || 0)), r4 = (z) => Math.round(z * 10000) / 10000;
    for (const c of kids) {
      c.z = r4(base + ((c.z || 0) - base) * k);
      if (c.timeline && c.timeline.keys) c.timeline.keys.forEach((q) => { if (q.z != null) q.z = r4(base + (q.z - base) * k); });
    }
    g.split = Object.assign({}, g.split, { spread: v });
    if (g.split.reveal && g.split.reveal !== "none") Reveal.build(App.rec, g); // the reveal paths follow the new depths
  }

  // ---------- place ----------
  function placeTab(e) {
    const keyed = App.keyed(e), out = [];
    if (keyed) out.push(h("section.group", note("השכבה בתנועה: מה שמשנים כאן נשמר לרגע שבו הסרגל עומד (לשונית ״תנועה״).", "motion")));
    if (e.type === "sound") return [UI.group("מיקום הסימון", note("לצליל אין מראה. העיגול על הקנבס רק מסמן אותו."))];
    const size = keyed
      ? S({ label: "גודל", min: 0.05, max: 20, step: 0.01, unit: "×", get: () => App.sample(App.sel()).scale || 1, set: (v, f) => { const x = App.sel(); if (!x) return; App.editKey(x).scale = round(v); App.changed(f); } })
      : S(Object.assign({ label: "גודל", min: 0.05, max: 10, step: 0.01, get: () => App.sel().w, set: upd((x, v) => { const k = v / x.w; if (x.type === "scatter") return void Studio.scaleScatter(App.rec, x, k); if (x.type === "group") return void Studio.transformGroup(App.rec, x, { w: round(v) }); x.w = round(v); if (x.type === "text") Stage.fitText(x); else if (x.h != null) x.h = round(x.h * k); }) }, pct));
    out.push(UI.group("מקום וגודל",
      S(Object.assign({ label: "ימינה / שמאלה", min: -0.7, max: 0.7, step: 0.005, get: () => place("x"), set: placeSet("x") }, pct)),
      S(Object.assign({ label: "למעלה / למטה", min: -0.7, max: 0.7, step: 0.005, get: () => place("y"), set: placeSet("y") }, pct)),
      size,
      S({ label: "סיבוב", min: -180, max: 180, step: 1, unit: "°", get: () => place("rot"), set: placeSet("rot") }),
      !keyed && canSpread(e) ? h("div.btn-row", Object.assign(UI.button("על כל היצירה", spreadArt, { small: true, icon: "spread" }), { id: "btn-spread" })) : null,
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
      out.push(UI.group("תמונת היצירה", im, note("זו התמונה שהמצלמה מזהה. כל השכבות מופיעות מעליה."),
        h("div.btn-row", Object.assign(UI.button("סיבוב", () => Layers.rotateArtwork(), { kind: "ghost", icon: "rotate", title: "סיבוב התמונה ברבע סיבוב" }), { id: "art-rotate-big" }), UI.button("החלפת התמונה", Layers.pickArtwork, { kind: "ghost", icon: "upload" }),
          Object.assign(UI.button("תמונת שער", () => Layers.coverFromView(), { kind: "ghost", icon: "image", title: "תמונת השער של היצירה תהיה מה שרואים עכשיו בתצוגה השטוחה" }), { id: "art-cover-big" }))));
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
    const t = Layers.typeOf(e);
    const name = h("input.field.name-field", { type: "text", maxLength: 60, value: e.name || "", "aria-label": "שם השכבה" });
    name.oninput = () => { const x = App.sel(); if (!x) return; x.name = name.value; App.emit("change"); App.saveSoon(); };
    name.onchange = () => { const x = App.sel(); if (x && !name.value.trim()) { x.name = t.name; name.value = t.name; App.changed(true); } };
    ctls.push({ sync: () => { const x = App.sel(); if (x && document.activeElement !== name && name.value !== (x.name || "")) name.value = x.name || ""; } });
    const top = h("div.insp-head", h("span.layer-thumb", { style: { "--tint": t.tint } }, icon(t.icon, 18)), name,
      h("button.icon-btn", { title: "ביטול הבחירה", "aria-label": "ביטול הבחירה", onclick: () => App.select(null) }, icon("close", 18)));
    // a member of a group: which group, the way back to the whole group and the way out of it
    const g = Studio.groupOf(App.rec, e.id);
    if (!g) return top;
    return h("div", top, h("div.in-group", icon("layers", 16), h("span", "בתוך ״" + (g.name || "קבוצה") + "״"),
      UI.button("כל הקבוצה", () => App.select(g.id), { small: true, kind: "ghost" }), UI.button("להוציא", () => App.leaveGroup(e.id), { small: true, kind: "ghost", icon: "ungroup" })));
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
    // design and place are one page: what the layer looks like, then where it sits
    const body = tab === "motion" ? [Timeline.panel(e, add)] : tab === "tap" ? tapTab(e) : [...styleTab(e), ...placeTab(e)];
    root.append(head(e), ...body.flat().filter(Boolean).map((x) => x.node || x));
    if (tab !== "motion" && tab !== "tap") foldable();
    root.scrollTop = top;
  }
  // The design page's groups fold at a tap on their title. Which are folded is remembered; these start folded.
  const FOLDED = ["שקיפות", "מקום וגודל", "עומק והטיה", "סדר השכבות"];
  const folds = (() => { try { const v = JSON.parse(localStorage.getItem("brill-folds") || "{}"); return v && typeof v === "object" ? v : {}; } catch (e) { return {}; } })();
  const isFolded = (t) => (t in folds ? !!folds[t] : FOLDED.includes(t));
  function foldable() {
    root.querySelectorAll(":scope > section.group > h3.group-title").forEach((t) => {
      const name = t.textContent, sec = t.parentNode, btn = h("button.group-fold", { type: "button", "aria-expanded": String(!isFolded(name)) }, h("span", name), icon("down", 16));
      t.replaceChildren(btn); sec.classList.toggle("folded", isFolded(name)); sec.dataset.group = name;
      btn.onclick = () => { const f = !sec.classList.contains("folded"); sec.classList.toggle("folded", f); btn.setAttribute("aria-expanded", String(!f)); folds[name] = f; try { localStorage.setItem("brill-folds", JSON.stringify(folds)); } catch (e) {} };
    });
  }
  function sync() { ctls.forEach((c) => { try { if (c.sync) c.sync(); } catch (err) { console.warn(err); } }); }
  function renderTabs() {
    const ph = Layers.phone(), has = !!App.sel();
    document.body.dataset.pane = App.pane;
    tabBar.querySelectorAll(".tab").forEach((b) => {
      const id = b.dataset.tab, cur = App.tab === "place" ? "style" : App.tab, on = id === "layers" ? ph && App.pane === "layers" : (!ph || App.pane === "inspector") && id === cur;
      b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on));
      b.classList.toggle("dim", id !== "layers" && id !== "add" && !has);
    });
  }

  function init() {
    root = $("inspector"); tabBar = $("tabs");
    TABS.forEach(([id, name, ic]) => tabBar.append(h("button.tab", { type: "button", role: "tab", data: { tab: id }, onclick: () => (id === "layers" ? App.setPane("layers") : id === "add" ? Layers.openAdd() : App.setTab(id)) }, icon(ic, 20), h("span", name))));
    Studio.loadTextFonts({ font: "heebo", text: "א" }).catch(() => {});
    let lastSel = null;
    App.on("open tab structure mode still", build);
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

  return { init, build, sync, fillArt, spreadArt, canSpread };
})();
