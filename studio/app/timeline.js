"use strict";
/* Timeline: the "motion" tab of a layer. A layer either has a ready-made movement (spin, float, pulse) or a motion
   path: steps in time, each remembering where the layer is, how big, how turned and how see-through. Between two
   steps the layer glides. Moving the layer on the canvas while the playhead is parked writes a step there. */
window.Timeline = (() => {
  const { h, icon, toast, clamp } = UI;
  const ANIMS = [{ id: "none", name: "בלי" }, { id: "spin", name: "סיבוב" }, { id: "float", name: "ריחוף" }, { id: "pulse", name: "פעימה" }];
  const EASES = [{ id: "linear", name: "קצב אחיד" }, { id: "easeInOut", name: "רך בהתחלה ובסוף" }, { id: "easeIn", name: "מתחיל לאט" }, { id: "easeOut", name: "נעצר לאט" }, { id: "elastic", name: "קפיצי" }];
  const r1 = (t) => Math.round(t * 10) / 10;
  const sortKeys = (e) => e.timeline.keys.sort((a, b) => a.t - b.t);
  const span = (e) => Math.max(Math.ceil(Studio.timelineDur(e)), 2) + 1;
  // Where the playhead shows: a looping path wraps around like the layer itself does.
  function shown(e) {
    const t = App.clock(), d = Studio.timelineDur(e);
    if (App.frozen != null || d <= 0) return Math.min(t, App.frozen != null ? t : d);
    return e.timeline.loop ? t % d : Math.min(t, d);
  }

  function startPath(e) {
    e.timeline = { keys: [{ t: 0, x: e.x || 0, y: e.y || 0, z: e.z || 0, rot: e.rot || 0, opacity: e.opacity == null ? 1 : e.opacity, scale: 1 }], loop: true, ease: "easeInOut" };
    e.anim = "none";
    App.freeze(1);
    App.emit("structure"); App.save();
    toast("עכשיו גוררים את השכבה למקום חדש, וזה השלב השני");
  }
  async function removePath(e) {
    if (!(await UI.confirm({ title: "למחוק את מסלול התנועה?", text: "השכבה תישאר במקום שבו היא נמצאת עכשיו.", yes: "למחוק", danger: true }))) return;
    const s = Studio.sampleTimeline(e, App.clock());
    if (!e.timeline.xyMap) { e.x = s.x; e.y = s.y; }
    e.z = s.z; e.rot = s.rot; e.opacity = s.opacity; e.w = clamp((e.w || 0.3) * (s.scale || 1), 0.02, 4);
    delete e.timeline;
    App.freeze(null);
    App.emit("structure"); App.emit("change"); App.save();
  }

  function simple(e, add) {
    const out = [];
    if (e.type !== "sound") {
      const c = add(UI.chips({ label: "תנועה מוכנה", options: ANIMS, get: () => e.anim || "none", set: (v) => { e.anim = v; App.changed(true); } }));
      out.push(UI.group("תנועה שחוזרת על עצמה", c));
    }
    out.push(UI.group("מסלול תנועה",
      h("p.note", icon("motion", 18), h("span", "מסלול בנוי משלבים: בכל שלב השכבה במקום, בגודל ובסיבוב אחרים, והיא גולשת מאחד לשני.")),
      UI.button("להתחיל מסלול תנועה", () => startPath(e), { kind: "primary", icon: "plus" })));
    return h("div.tl", ...out.map((x) => x.node || x));
  }

  function path(e, add) {
    let dragging = false, raf = 0, sig = "";
    const track = h("div.tl-track", { dir: "ltr" }), ticks = h("div.tl-ticks"), keysBox = h("div.tl-keys"), head = h("div.tl-head");
    track.append(ticks, keysBox, head);
    const time = h("span.tl-time"), playBtn = h("button.icon-btn.tl-play", { type: "button" });
    const stepInfo = h("span.tl-step"), hideBtn = UI.button("", () => toggleHide(), { small: true, icon: "eye" }), delBtn = UI.button("מחיקת השלב", () => delKey(), { small: true, icon: "trash" });
    const addBtn = UI.button("שלב חדש כאן", () => addKey(), { small: true, kind: "primary", icon: "plus" });

    const pct = (t) => clamp(t / span(e) * 100, 0, 100) + "%";
    const atHead = () => (App.frozen == null ? null : e.timeline.keys.find((k) => Math.abs(k.t - App.frozen) < 0.051) || null);
    const timeAt = (ev) => { const b = track.getBoundingClientRect(); return r1(clamp((ev.clientX - b.left) / b.width, 0, 1) * span(e)); };

    function addKey() {
      const t = r1(shown(e));
      App.freeze(t);
      if (!atHead()) { const s = Studio.sampleTimeline(e, t); Studio.addTimelineKey(e, { t, x: s.x, y: s.y, z: s.z, rot: s.rot, opacity: s.opacity, scale: s.scale }); sortKeys(e); }
      App.changed(true);
    }
    function delKey() {
      const k = atHead(); if (!k) return;
      if (e.timeline.keys.length === 1) return removePath(e);
      e.timeline.keys = e.timeline.keys.filter((x) => x !== k);
      App.changed(true);
    }
    function toggleHide() {
      const t = r1(shown(e)); App.freeze(t);
      const k = App.keyAt(e, t); sortKeys(e);
      const now = Studio.sampleTimeline(e, t).visible !== false;
      k.visible = !now;
      App.changed(true);
    }

    function drawKeys() {
      const s = e.timeline.keys.map((k) => k.t + (k.visible === false ? "h" : "")).join(",") + "|" + span(e);
      if (s === sig) return; sig = s;
      const n = span(e);
      ticks.replaceChildren(...Array.from({ length: n + 1 }, (_, i) => h("span.tl-tick", { style: { left: i / n * 100 + "%" } }, h("i", String(i)))));
      keysBox.replaceChildren(...e.timeline.keys.map((k) => {
        const b = h("button.tl-key" + (k.visible === false ? ".hide" : ""), { type: "button", style: { left: pct(k.t) }, title: "שלב בשנייה " + k.t, "aria-label": "שלב בשנייה " + k.t });
        b.__key = k;
        b.addEventListener("pointerdown", (ev) => {
          ev.stopPropagation(); ev.preventDefault();
          b.setPointerCapture(ev.pointerId);
          const x0 = ev.clientX; let moved = false;
          App.freeze(k.t);
          const move = (m) => {
            if (!moved && Math.abs(m.clientX - x0) < 5) return;
            moved = true; dragging = true;
            const t = timeAt(m);
            if (e.timeline.keys.some((o) => o !== k && Math.abs(o.t - t) < 0.051)) return;
            k.t = t; b.style.left = pct(t);
            App.freeze(t); App.emit("change");
          };
          const up = () => {
            b.removeEventListener("pointermove", move); b.removeEventListener("pointerup", up); b.removeEventListener("pointercancel", up);
            dragging = false;
            if (moved) { sortKeys(e); sig = ""; App.changed(true); }
          };
          b.addEventListener("pointermove", move); b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up);
        });
        return b;
      }));
    }

    // scrubbing: a finger anywhere on the ruler parks the playhead there
    track.addEventListener("pointerdown", (ev) => {
      track.setPointerCapture(ev.pointerId);
      App.freeze(timeAt(ev));
      const move = (m) => App.freeze(timeAt(m));
      const up = () => { track.removeEventListener("pointermove", move); track.removeEventListener("pointerup", up); track.removeEventListener("pointercancel", up); };
      track.addEventListener("pointermove", move); track.addEventListener("pointerup", up); track.addEventListener("pointercancel", up);
    });
    playBtn.onclick = () => (App.frozen == null ? App.freeze(r1(shown(e))) : App.replay());

    function tick() {
      raf = 0;
      if (!track.isConnected) return;
      const t = shown(e);
      head.style.left = pct(t);
      time.textContent = t.toFixed(1) + " שנ׳";
      if (App.frozen == null) raf = requestAnimationFrame(tick);
    }
    function sync() {
      if (!App.keyed(e)) return;
      if (!dragging) drawKeys();
      const playing = App.frozen == null, k = atHead();
      playBtn.replaceChildren(icon(playing ? "pause" : "play", 20));
      playBtn.title = playing ? "עצירה" : "ניגון"; playBtn.setAttribute("aria-label", playBtn.title);
      keysBox.querySelectorAll(".tl-key").forEach((b) => b.classList.toggle("on", b.__key === k));
      const idx = k ? e.timeline.keys.indexOf(k) + 1 : 0;
      stepInfo.textContent = k ? "שלב " + idx + " מתוך " + e.timeline.keys.length : playing ? "מתנגן" : "בין שלבים";
      delBtn.disabled = !k; addBtn.disabled = !!k;
      const vis = Studio.sampleTimeline(e, shown(e)).visible !== false;
      hideBtn.lastChild.textContent = vis ? "להסתיר מכאן" : "להראות מכאן";
      if (!raf) tick();
    }
    add({ sync });

    const ease = add(UI.select({ label: "איך היא גולשת", options: EASES, get: () => e.timeline.ease || "linear", set: (v) => { e.timeline.ease = v; App.changed(true); } }));
    const loop = add(UI.toggle({ label: "לחזור שוב ושוב", get: () => !!e.timeline.loop, set: (v) => { e.timeline.loop = v; App.changed(true); } }));
    const dur = add(UI.slider({ label: "אורך הסיבוב כולו", min: 0, max: 30, step: 0.5, unit: "שנ׳", get: () => (e.timeline.dur > 0 ? e.timeline.dur : 0),
      set: (v, final) => { e.timeline.dur = v > 0 ? v : null; sig = ""; App.changed(final); } }));

    const node = h("div.tl",
      UI.group("מסלול תנועה",
        h("div.tl-bar", playBtn, time, stepInfo),
        track,
        h("div.btn-row", addBtn, hideBtn, delBtn),
        h("p.note", icon("move", 18), h("span", "עוצרים על זמן, גוררים את השכבה על היצירה, והשלב נשמר שם. גוררים מעוין כדי לשנות מתי הוא קורה."))),
      UI.group("אופי התנועה", ease, loop, dur, h("p.ctl-hint", "אורך 0 = עד השלב האחרון.")),
      UI.group(null, UI.button("מחיקת כל המסלול", () => removePath(e), { kind: "danger", icon: "trash" })));
    hideBtn.append(h("span", ""));
    sync();
    return node;
  }

  const panel = (e, add) => (App.keyed(e) ? path(e, add) : simple(e, add));
  return { panel };
})();
