"use strict";
/* AR Studio editor: upload artwork, add video/image/sound elements,
   arrange on a 2D WYSIWYG canvas, save locally, export/import, open device preview. */
(() => {
  const $ = (id) => document.getElementById(id);
  const msg = (t) => { $("msg").textContent = t; if (t) setTimeout(() => { if ($("msg").textContent === t) $("msg").textContent = ""; }, 6000); };

  let rec = null;              // current experience record
  let selectedId = null;
  const media = {};            // assetId -> HTMLImageElement | HTMLVideoElement (for canvas drawing)
  let artworkImg = null;       // HTMLImageElement of artwork (padded draw source: original)
  let drag = null;             // {mode:'move'|'scale', startX,startY, origX,origY,origW}

  // ---------- boot ----------
  async function boot() {
    rec = await Studio.seedDemo(false);
    await hydrate();
    refreshExpSelect();
    bind();
    render();
  }

  async function hydrate() {
    // Build drawable media for current record.
    for (const k of Object.keys(media)) delete media[k];
    if (rec.assets.__artwork) {
      artworkImg = await Studio.loadImage(await Studio.blobToDataURL(rec.assets.__artwork));
    }
    for (const el of rec.elements) {
      if (!el.assetId || !rec.assets[el.assetId]) continue;
      const durl = await Studio.blobToDataURL(rec.assets[el.assetId]);
      if (el.type === "video") {
        const v = document.createElement("video");
        v.muted = true; v.loop = el.loop !== false; v.playsInline = true; v.src = durl;
        v.play().catch(() => {});
        media[el.assetId] = v;
      } else if (el.type === "image") {
        media[el.assetId] = await Studio.loadImage(durl);
      }
    }
  }

  function refreshExpSelect() {
    Studio.all().then((list) => {
      const sel = $("exp-select");
      sel.innerHTML = "";
      list.sort((a, b) => b.updatedAt - a.updatedAt).forEach((r) => {
        const o = document.createElement("option");
        o.value = r.id; o.textContent = r.name || r.id;
        if (r.id === rec.id) o.selected = true;
        sel.appendChild(o);
      });
    });
  }

  // ---------- upload flows ----------
  function bind() {
    $("btn-artwork").onclick = () => $("file-artwork").click();
    $("file-artwork").onchange = async (e) => {
      const f = e.target.files[0]; e.target.value = "";
      if (!f) return;
      if (f.size > 8 * 1024 * 1024) { msg("תמונה גדולה מדי (מעל 8MB). נסי תמונה קטנה יותר."); return; }
      const img = await Studio.loadImage(await Studio.blobToDataURL(f));
      const t = await Studio.makeTarget(img);
      rec.target = { artRect: t.artRect, natural: { w: img.naturalWidth, h: img.naturalHeight } };
      rec.assets.__artwork = f;
      artworkImg = img;
      await Studio.save(rec);
      msg("תמונת היצירה נשמרה.");
      render();
    };

    document.querySelectorAll("[data-add]").forEach((b) => {
      b.onclick = () => $("file-" + b.dataset.add).click();
    });
    const addFile = (kind) => async (e) => {
      const f = e.target.files[0]; e.target.value = "";
      if (!f) return;
      if (f.size > 20 * 1024 * 1024) { msg("קובץ גדול מדי (מעל 20MB) לגרסת הניסוי."); return; }
      const assetId = Studio.newId();
      rec.assets[assetId] = f;
      const artRatio = rec.target.artRect.w / rec.target.artRect.h;
      const el = { id: Studio.newId(), type: kind, name: { video: "סרטון", image: "תמונה", sound: "צליל" }[kind] + " " + (rec.elements.filter((x) => x.type === kind).length + 1),
                   assetId, x: 0, y: 0, w: kind === "video" ? 1.0 : 0.3, h: null, rot: 0, z: kind === "image" ? 0.1 : 0.01 };
      if (kind === "video" || kind === "sound") { el.volume = kind === "sound" ? 0.8 : 1; el.loop = true; }
      if (kind === "image") el.spin = false;
      // intrinsic aspect
      const durl = await Studio.blobToDataURL(f);
      if (kind === "image") {
        const im = await Studio.loadImage(durl);
        el.aspect = im.naturalWidth / im.naturalHeight;
        el.h = (el.w / el.aspect) * artRatio;
        media[assetId] = im;
      } else if (kind === "video") {
        const v = document.createElement("video");
        v.muted = true; v.playsInline = true; v.src = durl;
        el.aspect = await new Promise((res) => { v.onloadedmetadata = () => res(v.videoWidth / v.videoHeight || 9 / 16); v.onerror = () => res(9 / 16); });
        el.h = 1.0; // default: cover the artwork, matching the device-proven v4 composition
        v.loop = true; v.play().catch(() => {});
        media[assetId] = v;
      } else {
        el.aspect = 1;
        el.h = el.w * artRatio;
      }
      rec.elements.push(el);
      selectedId = el.id;
      await Studio.save(rec);
      msg("האלמנט נוסף. אפשר לגרור אותו על התצוגה.");
      render();
    };
    $("file-video").onchange = addFile("video");
    $("file-image").onchange = addFile("image");
    $("file-sound").onchange = addFile("sound");

    $("btn-new").onclick = async () => {
      rec = Studio.blankExperience();
      selectedId = null; artworkImg = null;
      await Studio.save(rec);
      refreshExpSelect(); render();
      msg("ניסוי חדש - התחילי בהעלאת תמונת יצירה.");
    };
    $("btn-del-exp").onclick = async () => {
      if (!confirm("למחוק את הניסוי הזה לגמרי?")) return;
      await Studio.del(rec.id);
      const all = await Studio.all();
      rec = all[0] || await Studio.seedDemo(true);
      selectedId = null;
      await hydrate(); refreshExpSelect(); render();
    };
    $("exp-select").onchange = async (e) => {
      rec = await Studio.load(e.target.value);
      selectedId = null;
      await hydrate(); render();
    };
    $("btn-export").onclick = async () => {
      const json = await Studio.exportJSON(rec);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      a.download = (rec.name || "ar-studio") + ".json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    };
    $("btn-import").onclick = () => $("file-import").click();
    $("file-import").onchange = async (e) => {
      const f = e.target.files[0]; e.target.value = "";
      if (!f) return;
      try {
        rec = await Studio.importJSON(await f.text());
        selectedId = null;
        await hydrate(); refreshExpSelect(); render();
        msg("הייבוא הצליח.");
      } catch (err) { msg("הקובץ לא תקין לייבוא."); }
    };
    $("btn-play").onclick = () => { location.href = "play.html#" + rec.id; };
    $("btn-del-el").onclick = async () => {
      const i = rec.elements.findIndex((x) => x.id === selectedId);
      if (i < 0) return;
      const [gone] = rec.elements.splice(i, 1);
      if (gone.assetId) { delete rec.assets[gone.assetId]; delete media[gone.assetId]; }
      selectedId = null;
      await Studio.save(rec);
      render();
    };

    // sliders
    const cur = () => rec.elements.find((x) => x.id === selectedId);
    const upd = async (fn) => { const el = cur(); if (!el) return; fn(el); await Studio.save(rec); renderPanel(); draw(); renderList(); };
    $("sl-scale").oninput = (e) => upd((el) => { const f = parseFloat(e.target.value) / el.w; el.w = parseFloat(e.target.value); if (el.h != null) el.h = Math.max(0.02, el.h * f); });
    $("sl-rot").oninput = (e) => upd((el) => { el.rot = parseFloat(e.target.value); });
    $("sl-z").oninput = (e) => upd((el) => { el.z = parseFloat(e.target.value); });
    $("sl-vol").oninput = (e) => upd((el) => { el.volume = parseFloat(e.target.value); });
    $("ck-loop").onchange = (e) => upd((el) => { el.loop = e.target.checked; });
    $("ck-spin").onchange = (e) => upd((el) => { el.spin = e.target.checked; });

    bindCanvas();
  }

  // ---------- rendering ----------
  function render() {
    const hasTarget = !!rec.target;
    $("sec-elements").hidden = !hasTarget;
    $("sec-arrange").hidden = !hasTarget;
    $("sec-preview").hidden = !hasTarget;
    const th = $("artwork-thumb");
    if (artworkImg) { th.src = artworkImg.src; th.hidden = false; } else th.hidden = true;
    renderList();
    renderPanel();
    draw();
  }

  function renderList() {
    const ul = $("element-list");
    ul.innerHTML = "";
    rec.elements.forEach((el) => {
      const li = document.createElement("li");
      li.textContent = { video: "🎬 ", image: "🖼️ ", sound: "🎵 " }[el.type] + el.name;
      li.className = el.id === selectedId ? "sel" : "";
      li.onclick = () => { selectedId = el.id; renderList(); renderPanel(); draw(); };
      ul.appendChild(li);
    });
  }

  function renderPanel() {
    const el = rec.elements.find((x) => x.id === selectedId);
    $("panel").hidden = !el;
    if (!el) return;
    $("panel-name").textContent = el.name;
    $("sl-scale").value = el.w;
    $("sl-rot").value = el.rot || 0;
    $("sl-z").value = el.z || 0;
    $("row-volume").hidden = el.type === "image";
    $("sl-vol").value = el.volume == null ? 1 : el.volume;
    $("row-loop").hidden = el.type === "image";
    $("ck-loop").checked = el.loop !== false;
    $("row-spin").hidden = el.type !== "image";
    $("ck-spin").checked = !!el.spin;
  }

  // ---------- canvas preview ----------
  const cv = () => $("preview");
  let boxes = {}; // el.id -> {cx,cy,w,h} in canvas px (unrotated frame for hit test)

  function draw() {
    if (!rec || !rec.target || !artworkImg) return;
    const c = cv();
    const wrap = $("canvas-wrap");
    const W = wrap.clientWidth || 320;
    const g = Studio.geom(rec);
    const artW = rec.target.artRect.w, artH = rec.target.artRect.h;
    const H = Math.round(W * (artH / artW));
    const dpr = window.devicePixelRatio || 1;
    c.width = W * dpr; c.height = H * dpr;
    c.style.width = W + "px"; c.style.height = H + "px";
    const ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(artworkImg, 0, 0, W, H);
    boxes = {};
    const t0 = performance.now();
    for (const el of rec.elements) {
      const wpx = el.w * W;
      const hpx = el.h != null ? el.h * H : wpx / (el.aspect || 1);
      const cx = (el.x + 0.5) * W;
      const cy = (0.5 - el.y) * H;
      boxes[el.id] = { cx, cy, w: wpx, h: hpx, rot: -(el.rot || 0) * Math.PI / 180 };
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-(el.rot || 0) * Math.PI / 180);
      ctx.globalAlpha = 0.92;
      const m = el.assetId && media[el.assetId];
      if (el.type === "video" && m && m.readyState >= 2) {
        ctx.drawImage(m, -wpx / 2, -hpx / 2, wpx, hpx);
      } else if (el.type === "image" && m) {
        let rr = 0;
        if (el.spin) rr = ((t0 / 14000) * 2 * Math.PI) % (2 * Math.PI);
        ctx.rotate(rr);
        ctx.drawImage(m, -wpx / 2, -hpx / 2, wpx, hpx);
      } else if (el.type === "sound") {
        ctx.beginPath(); ctx.arc(0, 0, Math.min(wpx, hpx) / 2, 0, 7);
        ctx.fillStyle = "rgba(30,60,120,0.85)"; ctx.fill();
        ctx.fillStyle = "#fff"; ctx.font = Math.round(Math.min(wpx, hpx) / 2.2) + "px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("♪", 0, 2);
      } else {
        ctx.fillStyle = "rgba(120,120,120,0.6)"; ctx.fillRect(-wpx / 2, -hpx / 2, wpx, hpx);
      }
      ctx.restore();
      if (el.id === selectedId) {
        ctx.save();
        ctx.translate(cx, cy); ctx.rotate(-(el.rot || 0) * Math.PI / 180);
        ctx.strokeStyle = "#2266ff"; ctx.setLineDash([6, 4]); ctx.lineWidth = 2;
        ctx.strokeRect(-wpx / 2, -hpx / 2, wpx, hpx);
        ctx.setLineDash([]);
        ctx.fillStyle = "#2266ff";
        ctx.fillRect(wpx / 2 - 8, hpx / 2 - 8, 16, 16); // scale handle
        ctx.restore();
      }
    }
    if (rec.elements.some((e) => e.type === "video" || (e.type === "image" && e.spin))) {
      requestAnimationFrame(draw);
    }
  }

  function bindCanvas() {
    const c = cv();
    const pos = (e) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const hit = (p) => {
      for (let i = rec.elements.length - 1; i >= 0; i--) {
        const el = rec.elements[i], b = boxes[el.id];
        if (!b) continue;
        const dx = p.x - b.cx, dy = p.y - b.cy;
        const cos = Math.cos(-b.rot), sin = Math.sin(-b.rot);
        const rx = dx * cos - dy * sin, ry = dx * sin + dy * cos;
        if (Math.abs(rx) <= b.w / 2 && Math.abs(ry) <= b.h / 2) return el;
      }
      return null;
    };
    c.addEventListener("pointerdown", (e) => {
      const p = pos(e);
      // scale handle of selected?
      const sel = rec.elements.find((x) => x.id === selectedId);
      if (sel && boxes[sel.id]) {
        const b = boxes[sel.id];
        const hx = b.cx + Math.cos(b.rot) * (b.w / 2) - Math.sin(b.rot) * (b.h / 2);
        const hy = b.cy + Math.sin(b.rot) * (b.w / 2) + Math.cos(b.rot) * (b.h / 2);
        if (Math.hypot(p.x - hx, p.y - hy) < 24) {
          drag = { mode: "scale", id: sel.id, start: p, origW: sel.w, cx: b.cx, cy: b.cy };
          c.setPointerCapture(e.pointerId); return;
        }
      }
      const el = hit(p);
      if (el) {
        selectedId = el.id; renderList(); renderPanel();
        drag = { mode: "move", id: el.id, start: p, origX: el.x, origY: el.y };
        c.setPointerCapture(e.pointerId);
        draw();
      } else if (selectedId) { selectedId = null; renderList(); renderPanel(); draw(); }
    });
    c.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const p = pos(e);
      const el = rec.elements.find((x) => x.id === drag.id);
      if (!el) return;
      const W = c.clientWidth, H = c.clientHeight;
      if (drag.mode === "move") {
        el.x = Math.max(-0.7, Math.min(0.7, drag.origX + (p.x - drag.start.x) / W));
        el.y = Math.max(-0.7, Math.min(0.7, drag.origY - (p.y - drag.start.y) / H));
      } else {
        const d0 = Math.hypot(drag.start.x - drag.cx, drag.start.y - drag.cy) || 1;
        const d1 = Math.hypot(p.x - drag.cx, p.y - drag.cy);
        const f = Math.max(0.05, Math.min(2, drag.origW * (d1 / d0))) / el.w;
        el.w = Math.max(0.05, Math.min(2, drag.origW * (d1 / d0)));
        if (el.h != null) el.h = Math.max(0.02, el.h * f);
      }
      draw();
      renderPanel();
    });
    const end = async () => { if (drag) { drag = null; await Studio.save(rec); } };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
  }

  window.addEventListener("resize", draw);
  boot().catch((e) => { console.error(e); msg("שגיאה בטעינה: " + e.message); });
})();
