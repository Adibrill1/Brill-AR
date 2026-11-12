"use strict";
/* Stage: the canvas where the creation is arranged. Draws the artwork with its layers as the experience shows them,
   and lets a finger or a mouse select, move, resize, turn and crop a layer. The real 3D scene (Editor3D) draws
   models, particles, time cubes, green-screen video and tilted layers on a transparent sheet above this canvas, and
   takes the whole stage over in the 3D view. */
window.Stage = (() => {
  const { $, h, icon, clamp, round, toast } = UI;
  const COARSE = !!(window.matchMedia && matchMedia("(pointer: coarse)").matches);
  const MARGIN = 0.14, KNOB = 30, GRAB = COARSE ? 28 : 20, ACCENT = "#8b6cff", CROP_TYPES = ["image", "video"]; // a finger needs a wider grip than a mouse
  let stage, wrap, canvas, ctx, dpr = 1, zoom = 1, shown = false, raf = 0;
  const view = { W: 0, H: 0, mx: 0, my: 0, cw: 0, ch: 0 };
  const boxes = {};
  let guide = null, cropRatio = null;
  const pan = { x: 0, y: 0 }; // how far the zoomed-in flat view was dragged, in screen pixels

  // ---------- geometry ----------
  function layout() {
    const rec = App.rec, cw = stage.clientWidth, ch = stage.clientHeight;
    if (!cw || !ch) return;
    dpr = Math.min(window.devicePixelRatio || 1, COARSE ? 2 : 2.5); // a phone redraws every frame; 3x there is slow and looks the same
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
      canvas.style.width = cw + "px"; canvas.style.height = ch + "px";
    }
    let a = 0.75;
    if (rec && rec.target) { const g = Studio.geom(rec); a = g.artW / g.artH; }
    const W = Math.min(cw / (1 + 2 * MARGIN), ch / (1 + 2 * MARGIN) * a);
    Object.assign(view, { cw, ch, W, H: W / a, mx: (cw - W) / 2, my: (ch - W / a) / 2 });
  }
  const ptAt = (x, y) => { const r = canvas.getBoundingClientRect(); return { x: (x - r.left - pan.x - view.cw / 2) / zoom + view.cw / 2, y: (y - r.top - pan.y - view.ch / 2) / zoom + view.ch / 2 }; };
  const pt = (e) => ptAt(e.clientX, e.clientY);
  const local = (b, p) => { const dx = p.x - b.cx, dy = p.y - b.cy, co = Math.cos(-b.rot), si = Math.sin(-b.rot); return { x: dx * co - dy * si, y: dx * si + dy * co }; };
  const world = (b, x, y) => { const co = Math.cos(b.rot), si = Math.sin(b.rot); return { x: b.cx + x * co - y * si, y: b.cy + x * si + y * co }; };
  function boxOf(el, s) {
    const cx = view.mx + (s.x + 0.5) * view.W, cy = view.my + (0.5 - s.y) * view.H;
    if (el.type === "sound") return { cx, cy, w: 46 / zoom, h: 46 / zoom, rot: 0 };
    return { cx, cy, w: el.w * view.W * s.scale, h: (el.h != null ? el.h * view.H : el.w * view.W / (el.aspect || 1)) * s.scale, rot: -s.rot * Math.PI / 180 };
  }
  const inside = (b, p, pad) => { const q = local(b, p), m = pad || 0; return Math.abs(q.x) <= Math.max(b.w / 2, 14 / zoom) + m && Math.abs(q.y) <= Math.max(b.h / 2, 14 / zoom) + m; };
  // Layers under a point, top first.
  function hits(p) {
    const out = [], els = App.rec.elements;
    for (let i = els.length - 1; i >= 0; i--) { const b = boxes[els[i].id]; if (b && !b.hidden && !els[i].locked && inside(b, p)) out.push(els[i]); }
    return out;
  }
  function handleAt(el, p) {
    const b = boxes[el.id]; if (!b) return null;
    const q = local(b, p), r = GRAB / zoom;
    if (Math.hypot(q.x, q.y + b.h / 2 + KNOB / zoom) <= r) return "rotate";
    if (el.type === "sound") return null;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) if (Math.hypot(q.x - sx * b.w / 2, q.y - sy * b.h / 2) <= r) return "scale";
    return null;
  }

  // ---------- what a layer looks like ----------
  const textCache = {}, fxCache = {}, patternCache = {};
  function textBitmap(el) {
    const key = JSON.stringify([el.text, el.color, el.bold, el.font, el.textStyle, el.cutSeed]), c = textCache[el.id];
    if (c && c.key === key) return c;
    const out = Studio.drawTextCanvas(el, 64);
    textCache[el.id] = { key, canvas: out.canvas, aspect: out.aspect };
    // drawn with the device font until its own font arrives; then measured again, without a new undo step
    Studio.loadTextFonts(el).then((fresh) => {
      if (!fresh) return;
      delete textCache[el.id];
      if (App.rec && App.rec.elements.includes(el)) { const before = el.aspect; fitText(el); if (Math.abs(el.aspect - before) > before * 0.005) App.save({ noHistory: true }); }
    });
    return textCache[el.id];
  }
  // A text layer is as tall as its words.
  function fitText(el) {
    const tb = textBitmap(el), g = Studio.geom(App.rec);
    el.aspect = tb.aspect; el.h = (el.w / el.aspect) * (g.artW / g.artH);
  }
  function fxDrawable(el, m, w, hh) {
    const look = el.fx && Studio.FX.find((f) => f.id === el.fx);
    if (!look) return null;
    const still = !look.moving && el.type === "image" && m.tagName !== "CANVAS";
    const key = still && JSON.stringify([el.fx, el.fxAmount, el.crop, Math.round(w), Math.round(hh)]), hit = fxCache[el.id];
    if (still && hit && hit.key === key && hit.media === m) return hit.canvas;
    const out = Studio.fxFrame(m, el, w, hh, performance.now() / 1000);
    if (!out || !still) return out;
    const copy = document.createElement("canvas");
    copy.width = out.width; copy.height = out.height; copy.getContext("2d").drawImage(out, 0, 0);
    fxCache[el.id] = { key, media: m, canvas: copy };
    return copy;
  }
  function patternDrawable(el, w, hh) {
    const still = !(el.pattern && el.pattern.speed > 0);
    const key = still && JSON.stringify([el.pattern, Math.round(w), Math.round(hh)]), hit = patternCache[el.id];
    if (still && hit && hit.key === key) return hit.canvas;
    const out = Studio.patternFrame(el, w, hh, performance.now() / 1000);
    if (!out || !still) return out;
    const copy = document.createElement("canvas");
    copy.width = out.width; copy.height = out.height; copy.getContext("2d").drawImage(out, 0, 0);
    patternCache[el.id] = { key, canvas: copy };
    return copy;
  }
  const mediaSize = (m) => m ? { w: m.videoWidth || m.naturalWidth || m.width || 0, h: m.videoHeight || m.naturalHeight || m.height || 0 } : { w: 0, h: 0 };
  const mediaReady = (m) => !!m && (m.tagName === "VIDEO" ? m.readyState >= 2 : m.tagName === "IMG" ? m.complete && m.naturalWidth > 0 : true);

  const STAND_INS = { model: ["תלת־ממד", "#6d4bd8"], particles: ["חלקיקים", "#c8961e"], timecube: ["קוביית זמן", "#1f7f9c"], video: ["סרטון", "#3a3846"], image: ["תמונה", "#3a3846"] };
  function standIn(el, w, hh) {
    const [label, col] = STAND_INS[el.type] || ["", "#3a3846"], r = Math.min(14, Math.min(w, hh) / 5);
    ctx.beginPath(); ctx.roundRect(-w / 2, -hh / 2, w, hh, r);
    ctx.globalAlpha *= 0.5; ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha *= 2;
    ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 1.5 / zoom; ctx.setLineDash([6 / zoom, 5 / zoom]); ctx.stroke(); ctx.setLineDash([]);
    const fs = clamp(Math.min(w / 6, hh / 3), 9 / zoom, 20);
    ctx.fillStyle = "#fff"; ctx.font = "600 " + fs + "px Heebo, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(el.type === "model" && Editor3D.modelError(el.id) ? "המודל לא נטען" : label, 0, 0);
  }
  function drawLayer(el, b) {
    const w = b.w, hh = b.h, m = el.assetId && App.media[el.assetId];
    if (!App.mode3d && Editor3D.drawsIn2d(el.id)) return; // the real scene above the canvas draws it
    if ((el.type === "video" || el.type === "image") && mediaReady(m)) {
      const fx = fxDrawable(el, m, w, hh);
      if (fx) ctx.drawImage(fx, -w / 2, -hh / 2, w, hh);
      else { const c = el.crop || { x: 0, y: 0, w: 1, h: 1 }, s = mediaSize(m); ctx.drawImage(m, c.x * s.w, c.y * s.h, c.w * s.w, c.h * s.h, -w / 2, -hh / 2, w, hh); }
    } else if (el.type === "text") {
      ctx.drawImage(textBitmap(el).canvas, -w / 2, -hh / 2, w, hh);
    } else if (el.type === "pattern") {
      const pic = patternDrawable(el, w, hh);
      if (pic) ctx.drawImage(pic, -w / 2, -hh / 2, w, hh); else { ctx.fillStyle = el.pattern.colors[0]; ctx.fillRect(-w / 2, -hh / 2, w, hh); }
    } else if (el.type === "sound") {
      ctx.beginPath(); ctx.arc(0, 0, w / 2, 0, 7); ctx.fillStyle = "rgba(23,22,29,.86)"; ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 1.5 / zoom; ctx.stroke();
      ctx.save(); ctx.scale(w / 46, w / 46); ctx.translate(-12, -12);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.8; ctx.lineJoin = ctx.lineCap = "round";
      ctx.stroke(new Path2D("M4 10v4h4l5 4V6l-5 4H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12")); ctx.restore();
    } else standIn(el, w, hh);
  }

  // ---------- crop ----------
  function cropGeom(el) {
    const b = boxes[el.id]; if (!b) return null;
    const c = el.crop || { x: 0, y: 0, w: 1, h: 1 }, FW = b.w / c.w, FH = b.h / c.h;
    return { b: { ...b }, c: { ...c }, FW, FH, L: -b.w / 2 - c.x * FW, T: -b.h / 2 - c.y * FH, sc: b.w / ((el.w || 1) * view.W) || 1 };
  }
  // Keep only region cc of the source, while the source itself stays where it is on the canvas.
  function setCropInPlace(el, g, cc) {
    const p = world(g.b, g.L + (cc.x + cc.w / 2) * g.FW, g.T + (cc.y + cc.h / 2) * g.FH), ar = Studio.geom(App.rec);
    Studio.setImageCrop(App.rec, el, { x: round(cc.x), y: round(cc.y), w: round(cc.w), h: round(cc.h) });
    el.w = round(cc.w * g.FW / (view.W * g.sc)); el.h = el.w / el.aspect * ar.artW / ar.artH;
    if (!App.keyed(el)) { el.x = round((p.x - view.mx) / view.W - 0.5); el.y = round(0.5 - (p.y - view.my) / view.H); }
  }
  function cropHandleAt(el, p) {
    const b = boxes[el.id]; if (!b) return null;
    const q = local(b, p), r = (GRAB + 2) / zoom;
    for (const [sx, sy, name] of [[-1, -1, "nw"], [1, -1, "ne"], [-1, 1, "sw"], [1, 1, "se"]]) if (Math.hypot(q.x - sx * b.w / 2, q.y - sy * b.h / 2) <= r) return name;
    return Math.abs(q.x) <= b.w / 2 && Math.abs(q.y) <= b.h / 2 ? "move" : null;
  }
  function cropMove(el, d, p) {
    const g = d.g, o = g.c, q = local(g.b, p), MIN = 0.03;
    let x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.h;
    if (d.handle === "move") {
      x0 = clamp(o.x + (q.x - d.q0.x) / g.FW, 0, 1 - o.w); y0 = clamp(o.y + (q.y - d.q0.y) / g.FH, 0, 1 - o.h); x1 = x0 + o.w; y1 = y0 + o.h;
    } else {
      const left = d.handle.includes("w"), top = d.handle.includes("n"), fx = (q.x - g.L) / g.FW, fy = (q.y - g.T) / g.FH;
      if (left) x0 = clamp(fx, 0, x1 - MIN); else x1 = clamp(fx, x0 + MIN, 1);
      if (top) y0 = clamp(fy, 0, y1 - MIN); else y1 = clamp(fy, y0 + MIN, 1);
      if (cropRatio) { // the opposite corner stays put
        const k = cropRatio / (g.FW / g.FH), ax = left ? o.x + o.w : o.x, ay = top ? o.y + o.h : o.y;
        let w = x1 - x0, hh = w / k; const hMax = top ? ay : 1 - ay; if (hh > hMax) { hh = hMax; w = hh * k; }
        const wMax = left ? ax : 1 - ax; if (w > wMax) { w = wMax; hh = w / k; }
        x0 = left ? ax - w : ax; x1 = x0 + w; y0 = top ? ay - hh : ay; y1 = y0 + hh;
      }
    }
    setCropInPlace(el, g, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  // A shape chip: the kept region takes that shape (the largest one that fits, centred). null = free.
  function setCropRatio(r) {
    cropRatio = r || null;
    const el = App.sel(); if (!el || !CROP_TYPES.includes(el.type) || App.mode3d) return;
    if (!App.cropping) App.setCropping(true);
    if (!cropRatio) return;
    draw();
    const g = cropGeom(el); if (!g) return;
    const k = cropRatio / (g.FW / g.FH), w = k >= 1 ? 1 : k, hh = k >= 1 ? 1 / k : 1;
    setCropInPlace(el, g, { x: (1 - w) / 2, y: (1 - hh) / 2, w, h: hh });
    App.changed(true);
  }
  function resetCrop() {
    const el = App.sel(); if (!el || !el.crop) return;
    draw();
    const g = cropGeom(el); if (!g) return;
    setCropInPlace(el, g, { x: 0, y: 0, w: 1, h: 1 }); delete el.crop;
    App.changed(true);
  }
  function drawCrop(el) {
    const g = cropGeom(el); if (!g) return;
    const m = App.media[el.assetId], s = mediaSize(m), px = 1 / zoom;
    ctx.save(); ctx.translate(g.b.cx, g.b.cy); ctx.rotate(g.b.rot);
    ctx.fillStyle = "rgba(14,13,18,.55)"; ctx.fillRect(g.L, g.T, g.FW, g.FH);
    if (s.w && mediaReady(m)) {
      ctx.globalAlpha = 0.4; ctx.drawImage(m, g.L, g.T, g.FW, g.FH); ctx.globalAlpha = 1;
      ctx.drawImage(m, g.c.x * s.w, g.c.y * s.h, g.c.w * s.w, g.c.h * s.h, -g.b.w / 2, -g.b.h / 2, g.b.w, g.b.h);
    }
    ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.setLineDash([4 * px, 4 * px]); ctx.lineWidth = px; ctx.strokeRect(g.L, g.T, g.FW, g.FH); ctx.setLineDash([]);
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2 * px; ctx.strokeRect(-g.b.w / 2, -g.b.h / 2, g.b.w, g.b.h);
    ctx.lineWidth = px; ctx.strokeStyle = "rgba(255,255,255,.35)"; // thirds
    for (const f of [-1 / 6, 1 / 6]) { ctx.beginPath(); ctx.moveTo(f * g.b.w, -g.b.h / 2); ctx.lineTo(f * g.b.w, g.b.h / 2); ctx.moveTo(-g.b.w / 2, f * g.b.h); ctx.lineTo(g.b.w / 2, f * g.b.h); ctx.stroke(); }
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.beginPath(); ctx.arc(sx * g.b.w / 2, sy * g.b.h / 2, 8 * px, 0, 7); ctx.fillStyle = "#fff"; ctx.fill(); ctx.strokeStyle = ACCENT; ctx.lineWidth = 2.5 * px; ctx.stroke(); }
    ctx.restore();
  }

  // ---------- drawing ----------
  function drawMarks(el, b) {
    const px = 1 / zoom;
    ctx.save(); ctx.translate(b.cx, b.cy); ctx.rotate(b.rot);
    ctx.strokeStyle = ACCENT; ctx.lineWidth = 1.5 * px;
    if (b.hidden) ctx.setLineDash([5 * px, 5 * px]);
    ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(0, -b.h / 2); ctx.lineTo(0, -b.h / 2 - KNOB * px); ctx.stroke();
    const dot = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r * px, 0, 7); ctx.fillStyle = "#fff"; ctx.fill(); ctx.strokeStyle = ACCENT; ctx.lineWidth = 2 * px; ctx.stroke(); };
    if (el.type !== "sound") for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) dot(sx * b.w / 2, sy * b.h / 2, 6.5);
    dot(0, -b.h / 2 - KNOB * px, 8);
    ctx.save(); ctx.translate(0, -b.h / 2 - KNOB * px); ctx.scale(px * 0.5, px * 0.5); ctx.translate(-12, -12);
    ctx.strokeStyle = ACCENT; ctx.lineWidth = 2.6; ctx.lineCap = ctx.lineJoin = "round"; ctx.stroke(new Path2D("M19 12a7 7 0 1 1-2.2-5.1M19 4v4h-4")); ctx.restore();
    ctx.restore();
  }
  function draw() {
    const rec = App.rec; if (!rec || !ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, view.cw, view.ch);
    const ready = !!(rec.target && App.art);
    Editor3D.overlay(shown && ready && !App.mode3d && Editor3D.needsOverlay(rec));
    if (!ready) return;
    Editor3D.sync();
    if (App.mode3d) return;
    ctx.translate(view.cw / 2 + pan.x, view.ch / 2 + pan.y); ctx.scale(zoom, zoom); ctx.translate(-view.cw / 2, -view.ch / 2);
    // the soft shadow under the artwork is the costliest part of a frame; a phone goes without it
    if (!COARSE) { ctx.save(); ctx.shadowColor = "rgba(0,0,0,.55)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 12; ctx.fillStyle = "#000"; ctx.fillRect(view.mx, view.my, view.W, view.H); ctx.restore(); }
    ctx.drawImage(App.art, view.mx, view.my, view.W, view.H);
    const selId = App.selId; let selEl = null;
    for (const k in boxes) delete boxes[k];
    for (const el of rec.elements) {
      if (el.type === "group") continue;
      const s = App.sample(el), b = boxOf(el, s);
      boxes[el.id] = b; if (el.id === selId) selEl = el;
      if (!s.visible) { b.hidden = true; continue; }
      if (el.id === selId && App.cropping) continue; // drawn by the crop overlay
      ctx.save(); ctx.translate(b.cx, b.cy); ctx.rotate(b.rot); ctx.globalAlpha = clamp(s.opacity, 0, 1);
      drawLayer(el, b);
      ctx.restore();
    }
    if (guide) {
      ctx.save(); ctx.strokeStyle = "#ff8f6b"; ctx.lineWidth = 1 / zoom; ctx.setLineDash([5 / zoom, 4 / zoom]); ctx.beginPath();
      if (guide.v) { ctx.moveTo(view.mx + view.W / 2, view.my - 20); ctx.lineTo(view.mx + view.W / 2, view.my + view.H + 20); }
      if (guide.h) { ctx.moveTo(view.mx - 20, view.my + view.H / 2); ctx.lineTo(view.mx + view.W + 20, view.my + view.H / 2); }
      ctx.stroke(); ctx.restore();
    }
    if (selEl && boxes[selEl.id]) { if (App.cropping) drawCrop(selEl); else drawMarks(selEl, boxes[selEl.id]); }
  }
  function frame() { raf = requestAnimationFrame(frame); if (shown && !document.hidden) draw(); }

  // ---------- gestures ----------
  const pointers = new Map();
  let drag = null, pinch = null, lastTap = { id: null, at: 0 }, wheel = null;
  const GATE = "לשכבה הזו יש מסלול תנועה: משנים אותה בלשונית ״תנועה״";
  const gated = (el) => !!(App.keyed(el) && el.timeline.xyMap);
  // Size at the start of a resize: the key's scale for a moving layer, the layer's own width otherwise.
  function sizeStart(el) {
    const k = App.editKey(el);
    return k ? { k, s0: App.sample(el).scale || 1 } : { k: null, w0: el.w, h0: el.h };
  }
  function sizeApply(el, st, ratio) {
    if (st.k) { App.keyAt(el, st.k.t).scale = round(clamp(st.s0 * ratio, 0.05, 4)); return; }
    const w = clamp(st.w0 * ratio, 0.05, 2);
    el.w = round(w); if (st.h0 != null) el.h = round(st.h0 * w / st.w0);
  }
  function onDown(e) {
    if (App.mode3d || !App.rec || !App.rec.target) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) return startPinch();
    if (pointers.size > 2) return;
    const p = pt(e), sel = App.sel();
    if (App.cropping && sel) {
      const handle = cropHandleAt(sel, p);
      if (handle) drag = { mode: "crop", id: sel.id, handle, g: cropGeom(sel), q0: local(boxes[sel.id], p), moved: false };
      else { App.setCropping(false); drag = { mode: "none" }; } // a tap outside ends cropping, the layer stays selected
      return;
    }
    const handle = sel && handleAt(sel, p);
    if (handle === "rotate") {
      const b = boxes[sel.id], k = App.editKey(sel);
      drag = { mode: "rotate", id: sel.id, k, a0: Math.atan2(p.y - b.cy, p.x - b.cx), rot0: k ? App.sample(sel).rot : sel.rot || 0, moved: false };
      return;
    }
    if (handle === "scale") {
      const b = boxes[sel.id];
      drag = { mode: "scale", id: sel.id, st: sizeStart(sel), d0: Math.max(4, Math.hypot(p.x - b.cx, p.y - b.cy)), moved: false };
      return;
    }
    const under = hits(p), keep = sel && boxes[sel.id] && !boxes[sel.id].hidden && inside(boxes[sel.id], p);
    const el = keep ? sel : under[0];
    if (!el) { drag = { mode: "empty", sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y }; return; }
    drag = { mode: "move", id: el.id, start: p, sx: e.clientX, sy: e.clientY, moved: false, wasSel: keep, under };
    if (!keep) App.select(el.id);
  }
  function onMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch) return movePinch();
    if (!drag || pointers.size !== 1) return;
    // a drag on empty space carries the zoomed-in view
    if (drag.mode === "empty") { if (zoom > 1) setPan(drag.px + e.clientX - drag.sx, drag.py + e.clientY - drag.sy); return; }
    const el = App.el(drag.id), p = pt(e);
    if (drag.mode === "none" || !el) return;
    if (drag.mode === "crop") { cropMove(el, drag, p); drag.moved = true; App.changed(false); return; }
    if (drag.mode === "move") {
      if (!drag.moved) {
        if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < (e.pointerType === "mouse" ? 3 : 6)) return;
        if (gated(el)) { toast(GATE); drag = { mode: "none" }; return; }
        drag.k = App.editKey(el);
        const s = drag.k ? App.sample(el) : el;
        drag.x0 = s.x || 0; drag.y0 = s.y || 0; drag.moved = true;
      }
      let nx = clamp(drag.x0 + (p.x - drag.start.x) / view.W, -0.7, 0.7), ny = clamp(drag.y0 - (p.y - drag.start.y) / view.H, -0.7, 0.7);
      guide = null;
      if (App.snap && !e.altKey) { const g = {}; if (Math.abs(nx) < 0.018) { nx = 0; g.v = true; } if (Math.abs(ny) < 0.014) { ny = 0; g.h = true; } if (g.v || g.h) guide = g; }
      const t = drag.k ? App.keyAt(el, drag.k.t) : el;
      t.x = round(nx); t.y = round(ny);
    } else if (drag.mode === "rotate") {
      const b = boxes[el.id]; if (!b) return;
      let v = drag.rot0 - (Math.atan2(p.y - b.cy, p.x - b.cx) - drag.a0) * 180 / Math.PI;
      v = ((v + 180) % 360 + 360) % 360 - 180;
      if (!e.altKey) v = Studio.snapAngle(v);
      (drag.k ? App.keyAt(el, drag.k.t) : el).rot = round(v, 1);
      drag.moved = true;
    } else if (drag.mode === "scale") {
      const b = boxes[el.id]; if (!b) return;
      sizeApply(el, drag.st, Math.hypot(p.x - b.cx, p.y - b.cy) / drag.d0);
      drag.moved = true;
    }
    App.changed(false);
  }
  function onUp(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pinch) { if (pointers.size < 2) { const item = pinch.item; pinch = null; drag = { mode: "none" }; if (item) App.changed(true); } return; }
    const d = drag; if (pointers.size === 0) drag = null;
    guide = null;
    if (!d || e.type === "pointercancel") { if (d && d.moved) App.changed(true); return; }
    if (d.moved) { App.changed(true); return; }
    if (d.mode === "empty") { if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 8) App.select(null); return; }
    if (d.mode !== "move") return;
    // a tap: twice on a text opens its words; on the selected layer it reaches the one beneath
    const now = performance.now(), el = App.el(d.id);
    if (el && lastTap.id === d.id && now - lastTap.at < 380) { lastTap = { id: null, at: 0 }; App.emit("edit", el); return; }
    lastTap = { id: d.id, at: now };
    if (d.wasSel && d.under.length > 1) { const i = d.under.findIndex((x) => x.id === d.id); App.select(d.under[(i + 1) % d.under.length].id); lastTap.id = null; }
  }
  function startPinch() {
    const [a, b] = [...pointers.values()], sel = App.sel();
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, mid = ptAt(mx, my);
    const onItem = sel && sel.type !== "sound" && !App.cropping && boxes[sel.id] && inside(boxes[sel.id], mid, 24 / zoom);
    if (drag && drag.moved) App.changed(true);
    drag = null; guide = null;
    pinch = { d0: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), z0: zoom, mx, my, px: pan.x, py: pan.y, item: onItem ? { id: sel.id, st: sizeStart(sel) } : null };
  }
  function movePinch() {
    const [a, b] = [...pointers.values()]; if (!a || !b) return;
    const ratio = Math.hypot(a.x - b.x, a.y - b.y) / pinch.d0;
    if (pinch.item) { const el = App.el(pinch.item.id); if (el) { sizeApply(el, pinch.item.st, ratio); App.changed(false); } }
    else { setZoom(pinch.z0 * ratio); setPan(pinch.px + (a.x + b.x) / 2 - pinch.mx, pinch.py + (a.y + b.y) / 2 - pinch.my); } // two fingers zoom and carry the view along
  }
  function onWheel(e) {
    if (App.mode3d || !App.rec || !App.rec.target) return;
    e.preventDefault();
    const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), sel = App.sel(), p = pt(e);
    if (sel && sel.type !== "sound" && !App.cropping && boxes[sel.id] && inside(boxes[sel.id], p)) {
      if (!wheel || wheel.id !== sel.id) wheel = { id: sel.id, st: sizeStart(sel), f: 1 };
      wheel.f *= f; sizeApply(sel, wheel.st, wheel.f); App.changed(false);
      clearTimeout(wheel.timer); wheel.timer = setTimeout(() => { wheel = null; App.changed(true); }, 350);
    } else setZoom(zoom * f);
  }
  // Arrow keys: a small step (a larger one with Shift).
  let nudgeTimer = 0;
  function nudge(dx, dy) {
    const el = App.sel(); if (!el || App.mode3d || App.cropping) return;
    if (gated(el)) return toast(GATE);
    const k = App.editKey(el), s = k ? App.sample(el) : el, t = k || el;
    t.x = round(clamp((s.x || 0) + dx, -0.7, 0.7)); t.y = round(clamp((s.y || 0) + dy, -0.7, 0.7));
    App.changed(false); clearTimeout(nudgeTimer); nudgeTimer = setTimeout(() => App.changed(true), 500);
  }

  // ---------- zoom, views ----------
  // The view can be dragged only as far as the zoom pushed things off the stage; at 100% and below it sits in the middle.
  function setPan(x, y) {
    const mx = Math.max(0, view.cw * (zoom - 1) / 2), my = Math.max(0, view.ch * (zoom - 1) / 2);
    pan.x = clamp(x, -mx, mx); pan.y = clamp(y, -my, my);
  }
  function setZoom(z) { zoom = clamp(z, 0.5, 4); setPan(pan.x, pan.y); const l = $("zoom-label"); if (l) l.textContent = Math.round(zoom * 100) + "%"; }
  async function applyMode() {
    const rec = App.rec, on = App.mode3d && shown && rec && rec.target && App.art;
    stage.classList.toggle("is-3d", !!on); stage.classList.toggle("is-crop", App.cropping);
    $("btn-2d").classList.toggle("on", !App.mode3d); $("btn-3d").classList.toggle("on", App.mode3d);
    $("btn-2d").setAttribute("aria-pressed", String(!App.mode3d)); $("btn-3d").setAttribute("aria-pressed", String(App.mode3d));
    if (on) await Editor3D.show(); else if (Editor3D.isActive()) Editor3D.hide();
    renderBar();
  }
  // The small bar above the stage: what is selected, and the things done to it most.
  function renderBar() {
    const bar = $("sel-bar"), el = App.sel();
    bar.replaceChildren();
    bar.hidden = !el;
    if (!el) return;
    const btn = (name, label, run, on) => h("button.icon-btn" + (on ? ".on" : ""), { title: label, "aria-label": label, onclick: run }, icon(name, 18));
    bar.append(h("span.sel-name", el.name || ""));
    if (CROP_TYPES.includes(el.type) && !App.mode3d) bar.append(btn("crop", "חיתוך", () => App.setCropping(!App.cropping), App.cropping));
    bar.append(btn("lock", "נעילה במקום", () => { App.setLocked(el.id, true); toast("השכבה ננעלה. משחררים אותה מרשימת השכבות."); }),
      btn("copy", "שכפול", () => App.duplicateLayer(el.id)), btn("trash", "מחיקה", () => App.removeLayer(el.id)));
  }
  function renderTime() {
    const chip = $("time-chip"), t = App.frozen;
    chip.hidden = t == null;
    if (t != null) $("time-chip-text").textContent = "עצור ב־" + t.toFixed(1) + " שנ׳";
  }
  function renderEmpty() {
    const rec = App.rec, st = App.artState, miss = !!rec && !!rec.target && (st === "loading" || st === "error");
    $("stage-empty").hidden = !rec || !!rec.target;
    $("stage-tools").hidden = !rec || !rec.target || miss;
    const box = $("stage-art");
    box.hidden = !miss; box.dataset.state = st;
    if (miss) $("stage-art-text").textContent = st === "loading" ? "טוענת את תמונת היצירה…" : "תמונת היצירה לא נקראה מהמכשיר. השכבות שלך שמורות.";
  }

  function init() {
    stage = $("stage"); wrap = $("canvas-wrap"); canvas = $("preview"); ctx = canvas.getContext("2d");
    Editor3D.init({
      wrap, getRec: () => App.rec, getSelected: () => App.selId,
      onSelect: (id) => { App.select(id); Editor3D.refreshGizmo(); },
      onChange: () => App.changed(true),
      sampleEl: (el) => (App.rec ? App.sample(el) : null), clockFor: () => App.clock(),
      freezeAt: (t) => App.freeze(t), getFrozen: () => App.frozen, restoreFrozen: (t) => App.freeze(t),
      onGate: (text) => toast(text), getView2d: () => ({ view, zoom, pan }),
      getArt: () => ({ pic: App.art, blob: App.artBlob }), getCropId: () => (App.cropping ? App.selId : null)
    });
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    // Safari on a trackpad sends its own pinch events
    let gz = 1;
    canvas.addEventListener("gesturestart", (e) => { e.preventDefault(); gz = zoom; });
    canvas.addEventListener("gesturechange", (e) => { e.preventDefault(); if (!pointers.size) setZoom(gz * e.scale); });
    new ResizeObserver(() => { layout(); if (App.mode3d) window.dispatchEvent(new Event("resize")); }).observe(stage);
    $("btn-zoom-in").onclick = () => setZoom(zoom * 1.25);
    $("btn-zoom-out").onclick = () => setZoom(zoom / 1.25);
    $("zoom-label").onclick = () => setZoom(1);
    $("btn-2d").onclick = () => App.setMode3d(false);
    $("btn-3d").onclick = () => App.setMode3d(true);
    $("btn-snap").onclick = () => { App.snap = !App.snap; $("btn-snap").classList.toggle("on", App.snap); $("btn-snap").setAttribute("aria-pressed", String(App.snap)); toast(App.snap ? "הצמדה למרכז פועלת" : "הצמדה למרכז כבויה"); };
    $("btn-time-live").onclick = () => App.freeze(null);
    App.on("open", () => { setZoom(1); for (const k in textCache) delete textCache[k]; layout(); renderEmpty(); applyMode(); renderTime(); });
    App.on("select", () => { if (App.mode3d) Editor3D.refreshGizmo(); stage.classList.toggle("is-crop", App.cropping); renderBar(); });
    App.on("structure", () => { layout(); renderEmpty(); renderBar(); });
    App.on("change", () => { const el = App.sel(); if (el && $("sel-bar").firstChild && $("sel-bar").firstChild.textContent !== (el.name || "")) renderBar(); });
    App.on("mode", applyMode);
    App.on("art", () => { layout(); renderEmpty(); applyMode(); });
    $("btn-art-retry").onclick = () => App.loadArt();
    $("btn-art-replace").onclick = () => Layers.pickArtwork();
    App.on("time", renderTime);
    App.on("close", () => { if (Editor3D.isActive()) Editor3D.hide(); Editor3D.overlay(false); });
    raf = requestAnimationFrame(frame);
  }
  function show(on) {
    shown = !!on;
    if (shown) { layout(); applyMode(); } else { if (Editor3D.isActive()) Editor3D.hide(); Editor3D.overlay(false); }
  }

  return { init, show, layout, draw, nudge, fitText, setCropRatio, resetCrop, get cropRatio() { return cropRatio; }, get view() { return view; }, get zoom() { return zoom; }, get pan() { return pan; }, boxes, CROP_TYPES };
})();
