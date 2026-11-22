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
    { id: "breathe", name: "נושמות" },
    { id: "dolly", name: "התקרבות קולנועית" },
    { id: "assemble", name: "הרכבה מחלקים" },
    { id: "float", name: "ריחוף" },
    { id: "wave", name: "גל" },
    { id: "tunnel", name: "מנהרה" },
    { id: "pages", name: "דפדוף" }
  ];
  const HINTS = {
    none: "השכבות פשוט עומדות בעומק שלהן.",
    expand: "התמונה מופיעה שטוחה, ואז השכבות נפרדות ונעצרות בעומק שלהן.",
    stack: "השכבות מופיעות אחת אחרי השנייה, מהרחוקה לקרובה.",
    drop: "כל שכבה נוחתת למקום שלה מלמעלה, מהרחוקה לקרובה.",
    slide: "השכבות נכנסות לסירוגין מימין ומשמאל.",
    popup: "כמו בספר פופ־אפ: הרקע נשאר במקום, ושאר השכבות מתרוממות על ציר, אחת אחרי השנייה, עד שהן עומדות בעומק שלהן. עם \"נפתחת כשמקרבים את הטלפון\" הספר נפתח כשמתקרבים אליו ונסגר כשמתרחקים.",
    breathe: "השכבות מתקרבות ומתרחקות לאט, כל הזמן.",
    dolly: "כמו מצלמה שנכנסת לתוך התמונה: השכבות מתקרבות לאט, הקרובה הכי מהר והרקע כמעט לא זז, וחוזרות.",
    assemble: "השכבות מתחילות מפוזרות באוויר, בזוויות ובמרחקים שונים, ועפות כל אחת למקום שלה עד שהתמונה מורכבת.",
    float: "כל שכבה צפה בעדינות למעלה ולמטה בקצב משלה, כל הזמן, כמו במים.",
    wave: "גל עובר בין השכבות: כל שכבה בתורה זזה קדימה וחוזרת, מהרחוקה לקרובה, שוב ושוב.",
    tunnel: "כמו טיסה לתוך מנהרה: השכבות מגיעות מאחורייך, טסות פנימה ונעצרות בעומק שלהן, הרקע ראשון והקרובה אחרונה.",
    pages: "כמו דפים בספר: הרקע נשאר, ושאר השכבות מתהפכות אחת אחרי השנייה על הצד השמאלי שלהן אל המקום שלהן."
  };
  const LOOPS = new Set(["breathe", "dolly", "float", "wave"]); // these go on by themselves
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
    const made = [], near = !!o.revealNear && !LOOPS.has(style); // played by how near the phone is, not by time
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
      else if (style === "dolly") {
        const rel = span ? (z - zmin) / span : 0, dz = r4(span * (0.08 + 1.1 * rel) + 0.04 * G.artH * rel), sc = r2(1 + 0.08 * rel);
        k(0, { z: r4(z), scale: 1 }); k(4, { z: r4(z + dz), scale: sc }); k(8, { z: r4(z), scale: 1 }); ease = "easeInOut"; loop = true;
      }
      else if (style === "assemble") {
        if (i === 0) { k(0, { opacity: 0 }); k(0.6, { opacity: 1 }); }
        else {
          const h = (m) => { const v = Math.sin((i + 1) * 12.9898 * m) * 43758.5453; return v - Math.floor(v); }, sg = (m) => (h(m) < 0.5 ? -1 : 1);
          const a = { x: r4(x + sg(1) * (0.3 + 0.3 * h(2))), y: r4(y + sg(3) * (0.2 + 0.3 * h(4))), z: r4(z + span * (0.6 + h(5)) + 0.1 * G.artH),
            rot: Math.round((c.rot || 0) + sg(6) * (20 + 25 * h(7))), rotX: Math.round(sg(8) * (20 + 25 * h(9))), rotY: Math.round(sg(10) * (20 + 30 * h(11))), opacity: 0 };
          const d = 0.3 + (i - 1) * 0.25;
          k(0, a); k(d, a); k(d + 0.35, { opacity: 1 }); k(d + 1.5, { x: r4(x), y: r4(y), z: r4(z), rot: c.rot || 0, rotX: 0, rotY: 0, opacity: 1 });
        }
      }
      else if (style === "float") {
        if (i === 0) return; // the background stays still
        const P = 3 + (i % 3) * 0.7, amp = 0.012 + 0.006 * i, tw = i % 2 ? 1.5 : -1.5, r = c.rot || 0;
        k(0, { y: r4(y), rot: r }); k(P / 2, { y: r4(y + amp), rot: r + tw }); k(P, { y: r4(y), rot: r }); ease = "easeInOut"; loop = true;
      }
      else if (style === "wave") {
        const P = 0.45 * n + 1.6, t0 = 0.45 * i, dz = r4(Math.max(span * 0.35, 0.06 * G.artH));
        k(0, { z: r4(z), scale: 1 }); if (t0 > 0) k(t0, { z: r4(z), scale: 1 }); k(t0 + 0.45, { z: r4(z + dz), scale: 1.04 }); k(t0 + 1, { z: r4(z), scale: 1 }); k(P, { z: r4(z), scale: 1 });
        ease = "easeInOut"; loop = true;
      }
      else if (style === "tunnel") {
        // flying into a tunnel: every layer starts equally far in front (behind the viewer) and flies in to its depth;
        // the background goes first and the nearest last, so a layer never passes behind one that is farther
        const D = span * 3 + 0.8 * G.artH, d = 0.3 + i * 0.3, a = { z: r4(z + D), opacity: 0 };
        k(0, a); k(d, a); k(d + 0.3, { opacity: 1 }); k(d + 1.4, { z: r4(z), opacity: 1 });
      }
      else if (style === "pages") {
        // a page turning: the layer lies turned over to the left of its left edge (its back to the viewer, unseen) and
        // turns over on that edge, at its own depth, onto its place; the far pages first, the near ones on top
        if (i === 0) return;
        const ww = c.w || 1, xh = x - ww / 2, d = 0.3 + (i - 1) * 0.5;
        const at = (f) => { const e = f < 0.5 ? 2 * f * f : 1 - 2 * (1 - f) * (1 - f), th = 180 * (1 - e) * Math.PI / 180;
          return { x: r4(xh + (ww / 2) * Math.cos(th)), z: r4(z + (ww / 2) * G.artW * Math.sin(th)), rotY: Math.round(-180 * (1 - e) * 10) / 10, opacity: e >= 0.45 ? 1 : 0 }; };
        k(0, at(0)); for (let s = 0; s <= 10; s++) k(d + (s / 10) * 1.1, at(s / 10));
        ease = "linear";
      }
      c.timeline = { keys, ease, loop, reveal: true };
      if (near) { c.timeline.loop = false; c.timeline.near = true; }
      made.push(c);
    });
    // played again and again: all the layers start over together, after a short rest at the end
    if (o.revealLoop && !near && !LOOPS.has(style) && made.length) {
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
      LOOPS.has(o().reveal) ? null : T({ label: "נפתחת כשמקרבים את הטלפון", hint: "רחוק: שטוחה. מקרבים: נפתחת. מרחיקים: נסגרת חזרה", get: () => !!o().revealNear, set: set((v) => ({ revealNear: !!v })) }),
      LOOPS.has(o().reveal) || o().revealNear ? null : T({ label: "לחזור שוב ושוב", hint: "אחרי עצירה קצרה, מההתחלה", get: () => !!o().revealLoop, set: set((v) => ({ revealLoop: !!v })) }),
      note(HINTS[o().reveal || "none"], "play")
    ];
  }

  return { STYLES, build, controls };
})();
