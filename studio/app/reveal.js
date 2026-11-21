"use strict";
/* Reveal: ready-made ways for the layers of a split picture to come into their depth. Each one writes an ordinary motion
   path (timeline keys) on every layer of the group, marked timeline.reveal, so it plays the same in the editor, the 3D
   view, the viewer and the camera, and she can still open a layer's motion tab and see it. A path she made herself on
   a layer is never touched. The group remembers the choice (split.reveal, split.revealSpeed, split.revealLoop) and the
   paths are written again whenever the layers move apart or together. */
window.Reveal = (() => {
  const STYLES = [
    { id: "none", name: "בלי" },
    { id: "expand", name: "נפתחת לעומק" },
    { id: "stack", name: "אחת אחרי השנייה" },
    { id: "drop", name: "נוחתות מלמעלה" },
    { id: "slide", name: "נכנסות מהצדדים" },
    { id: "popup", name: "ספר פופ־אפ" },
    { id: "bloom", name: "כמו פרח" },
    { id: "breathe", name: "נושמות" }
  ];
  const HINTS = {
    none: "השכבות פשוט עומדות בעומק שלהן.",
    expand: "התמונה מופיעה שטוחה, ואז השכבות נפרדות ונעצרות בעומק שלהן.",
    stack: "השכבות מופיעות אחת אחרי השנייה, מהרחוקה לקרובה.",
    drop: "כל שכבה נוחתת למקום שלה מלמעלה, מהרחוקה לקרובה.",
    slide: "השכבות נכנסות לסירוגין מימין ומשמאל.",
    popup: "כמו בספר פופ־אפ: הרקע נשאר במקום, ושאר השכבות מתרוממות על ציר, אחת אחרי השנייה, עד שהן עומדות בעומק שלהן.",
    bloom: "כמו קופסת קרטון שנפתחת: הרקע נשאר במקום, ושאר השכבות מתהפכות על ציר בצד, ישר החוצה לצדדים (פעם ימינה ופעם שמאלה), מהקרובה אל הרחוקה, עד שהן עומדות בעומק שלהן.",
    breathe: "השכבות מתקרבות ומתרחקות לאט, כל הזמן."
  };
  const r4 = (v) => Math.round(v * 10000) / 10000, r2 = (v) => Math.round(v * 100) / 100;
  const opts = (g) => g.split || {};

  // writes (or clears) the reveal paths of a split group's layers
  function build(rec, g) {
    if (!g || g.type !== "group" || !g.split) return;
    const o = opts(g), style = STYLES.some((s) => s.id === o.reveal) ? o.reveal : "none";
    const sp = o.revealSpeed >= 0.25 && o.revealSpeed <= 4 ? o.revealSpeed : 1;
    const kids = Studio.groupChildren(rec, g).slice().sort((a, b) => (a.z || 0) - (b.z || 0));
    for (const c of kids) if (c.timeline && c.timeline.reveal) delete c.timeline;
    if (style === "none" || !kids.length) return;
    const G = Studio.geom(rec), n = kids.length, zmin = kids[0].z || 0, zmax = kids[n - 1].z || 0;
    const span = Math.max(zmax - zmin, 0.05 * G.artH), T = (t) => r2(t / sp);
    const made = [];
    kids.forEach((c, i) => {
      if (c.timeline) return; // her own path stays as it is
      const x = c.x || 0, y = c.y || 0, z = c.z || 0, keys = [];
      let ease = "easeOut", loop = false;
      const k = (t, v) => keys.push(Object.assign({ t: T(t) }, v));
      if (style === "expand") { k(0, { z: r4(zmin) }); k(0.5, { z: r4(zmin) }); k(2.1, { z: r4(z) }); ease = "easeInOut"; }
      else if (style === "stack") { const d = 0.3 + i * 0.45, a = { z: r4(z - span * 0.6), opacity: 0, scale: 0.9 }; k(0, a); k(d, a); k(d + 0.9, { z: r4(z), opacity: 1, scale: 1 }); }
      else if (style === "drop") { const d = 0.3 + i * 0.4, a = { z: r4(z + span * 1.5 + 0.15 * G.artH), opacity: 0 }; k(0, a); k(d, a); k(d + 1, { z: r4(z), opacity: 1 }); }
      else if (style === "slide") {
        const d = 0.3 + i * 0.4, a = i ? { x: r4(x + (i % 2 ? 0.75 : -0.75)), opacity: 0 } : { opacity: 0 };
        k(0, a); k(d, a); k(d + 1, i ? { x: r4(x), opacity: 1 } : { opacity: 1 });
      }
      else if (style === "bloom") {
        // a cardboard box opening: the background (the bottom of the box) stays, and the other layers, nearest first,
        // swing open on a straight side hinge, out to the sides in turn. Each starts standing edge-on toward the viewer
        // at its hinge (its left or right edge, kept at its own depth) and folds down flat to face the viewer.
        if (i === 0) return;
        const j = n - 1 - i, d = 0.3 + j * 0.4, side = j % 2 ? -1 : 1; // 1: hinge on the left edge, opens to the right
        const ww = c.w || 1, xh = x - side * ww / 2;
        const at = (f) => { const e = 1 - (1 - f) * (1 - f) * (1 - f), th = 90 * (1 - e) * Math.PI / 180;
          return { x: r4(xh + side * (ww / 2) * Math.cos(th)), z: r4(z + (ww / 2) * G.artW * Math.sin(th)), rotY: Math.round(-side * 90 * (1 - e) * 10) / 10 }; };
        k(0, at(0)); for (let s = 0; s <= 8; s++) k(d + (s / 8) * 1.2, at(s / 8));
        ease = "linear";
      }
      else if (style === "breathe") { k(0, { z: r4(z) }); k(1.8, { z: r4(zmin + (z - zmin) * 0.35) }); k(3.6, { z: r4(z) }); ease = "easeInOut"; loop = true; }
      else if (style === "popup") {
        if (i === 0) return; // the background stays on the page
        const hh = c.h != null ? c.h : (c.w || 1) * G.artW / (c.aspect || 1) / G.artH; // height, in parts of the artwork
        const d = 0.4 + (i - 1) * 0.35, yb = y - hh / 2;
        // the layer lies toward the viewer and swings up around its bottom edge (which stays at its own depth) until it
        // faces the viewer, like a pop-up page; seen from the front it rises out of nothing
        const at = (f) => { const e = 1 - (1 - f) * (1 - f) * (1 - f), th = 90 * (1 - e) * Math.PI / 180;
          return { y: r4(yb + (hh / 2) * Math.cos(th)), z: r4(z + (hh / 2) * G.artH * Math.sin(th)), rotX: Math.round(90 * (1 - e) * 10) / 10 }; };
        k(0, at(0)); for (let s = 0; s <= 8; s++) k(d + (s / 8) * 1.2, at(s / 8));
        ease = "linear";
      }
      c.timeline = { keys, ease, loop, reveal: true };
      made.push(c);
    });
    // played again and again: all the layers start over together, after a short rest at the end
    if (o.revealLoop && style !== "breathe" && made.length) {
      const end = Math.max(...made.map((c) => Math.max(...c.timeline.keys.map((q) => q.t))));
      for (const c of made) { c.timeline.loop = true; c.timeline.dur = r2(end + 2 / sp); }
    }
  }

  // the controls in the group's design tab
  function controls(e, { C, S, T, upd, note }) {
    const o = () => opts(App.sel() || e);
    const set = (mk) => upd((g, v) => { g.split = Object.assign({}, g.split, mk(v)); build(App.rec, g); }, () => { App.emit("structure"); App.replay(); });
    return [
      C({ label: "הנפשת פתיחה", wrap: true, options: STYLES, get: () => o().reveal || "none", set: set((v) => ({ reveal: v })) }),
      S({ label: "מהירות", min: 0.25, max: 4, step: 0.25, unit: "×", get: () => o().revealSpeed || 1, set: set((v) => ({ revealSpeed: v })) }),
      T({ label: "לחזור שוב ושוב", hint: "אחרי עצירה קצרה, מההתחלה", get: () => !!o().revealLoop, set: set((v) => ({ revealLoop: !!v })) }),
      note(HINTS[o().reveal || "none"], "play")
    ];
  }

  return { STYLES, build, controls };
})();
