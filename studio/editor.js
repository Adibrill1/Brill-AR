"use strict";
/* AR Studio editor: upload artwork, add video/image/sound/text elements,
   arrange on a 2D WYSIWYG canvas, save locally, export/import, device preview.
   Round A: text layers, opacity, numeric panel, z-order, animation presets,
   tap actions, camera-free 3D preview page link. */
(() => {
  const $ = (id) => document.getElementById(id);
  const msg = (t) => { $("msg").textContent = t; if (t) setTimeout(() => { if ($("msg").textContent === t) $("msg").textContent = ""; }, 6000); };

  let rec = null;              // current experience record
  let selectedId = null;
  let curSeq = null;           // active sequence-state id (null = single-state artwork)
  const media = {};            // assetId -> HTMLImageElement | HTMLVideoElement (for canvas drawing)
  const textCache = {};        // el.id -> {key, canvas, aspect}
  let artworkImg = null;       // HTMLImageElement of artwork
  let drag = null;

  const ICONS = { video: "🎬 ", image: "🖼️ ", sound: "🎵 ", text: "🔤 ", model: "🧊 " };

  // ---------- boot ----------
  async function boot() {
    rec = await Studio.seedDemo(false);
    resetSeq();
    await hydrate();
    refreshExpSelect();
    bind();
    render();
  }

  function resetSeq() { curSeq = Studio.seqList(rec).length ? Studio.seqList(rec)[0].id : null; }

  // Sequence-state tabs above the canvas: switch the state being edited, add/remove states.
  function renderSeqTabs() {
    const bar = $("seq-tabs");
    if (!bar) return;
    bar.innerHTML = "";
    bar.hidden = false;
    const seqs = Studio.seqList(rec);
    if (!seqs.length) {
      const b = document.createElement("button");
      b.className = "seq-add";
      b.textContent = "+ הפעלת מצבי תצוגה (כמו סצנות)";
      b.onclick = async () => {
        rec.sequences = [{ id: Studio.newId(), name: "מצב 1" }, { id: Studio.newId(), name: "מצב 2" }];
        curSeq = rec.sequences[0].id;
        await Studio.save(rec);
        selectedId = null; renderSeqTabs(); renderList(); renderPanel(); draw();
      };
      bar.appendChild(b);
      return;
    }
    seqs.forEach((sq) => {
      const b = document.createElement("button");
      b.className = "seq-tab" + (sq.id === curSeq ? " sel" : "");
      b.textContent = sq.name;
      b.onclick = () => { curSeq = sq.id; selectedId = null; renderSeqTabs(); renderList(); renderPanel(); draw(); };
      bar.appendChild(b);
    });
    if (seqs.length < 6) {
      const add = document.createElement("button");
      add.className = "seq-add"; add.textContent = "+ מצב";
      add.onclick = async () => {
        rec.sequences.push({ id: Studio.newId(), name: "מצב " + (seqs.length + 1) });
        await Studio.save(rec); renderSeqTabs(); renderPanel();
      };
      bar.appendChild(add);
    }
    if (seqs.length > 1) {
      const del = document.createElement("button");
      del.className = "seq-del"; del.textContent = "מחיקת המצב";
      del.onclick = async () => {
        rec.sequences = seqs.filter((x) => x.id !== curSeq);
        for (const el of rec.elements) if (el.seq === curSeq) el.seq = null; // orphans become visible everywhere
        curSeq = rec.sequences[0].id;
        await Studio.save(rec);
        selectedId = null; renderSeqTabs(); renderList(); renderPanel(); draw();
      };
      bar.appendChild(del);
    }
  }

  async function hydrate() {
    for (const k of Object.keys(media)) delete media[k];
    for (const k of Object.keys(textCache)) delete textCache[k];
    if (rec.assets.__artwork) {
      artworkImg = await Studio.loadImage(await Studio.blobToDataURL(rec.assets.__artwork));
    }
    for (const el of rec.elements) {
      Studio.normEl(el);
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

  function textBitmap(el) {
    const key = JSON.stringify([el.text, el.color, el.bold]);
    const c = textCache[el.id];
    if (c && c.key === key) return c;
    const out = Studio.drawTextCanvas(el, 64);
    textCache[el.id] = { key, canvas: out.canvas, aspect: out.aspect };
    return textCache[el.id];
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
      const el = Studio.normEl({ id: Studio.newId(), type: kind, name: { video: "סרטון", image: "תמונה", sound: "צליל", model: "מודל 3D" }[kind] + " " + (rec.elements.filter((x) => x.type === kind).length + 1),
                   assetId, x: 0, y: 0, w: kind === "video" ? 1.0 : 0.3, h: null, rot: 0, z: kind === "image" ? 0.1 : 0.01, seq: curSeq });
      if (kind === "video" || kind === "sound") { el.volume = kind === "sound" ? 0.8 : 1; el.loop = true; }
      if (kind === "model") { el.w = 0.4; el.z = 0.2; el.aspect = 1; }
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
        el.h = 1.0;
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
    $("file-model").onchange = addFile("model");

    $("btn-text").onclick = async () => {
      const el = Studio.normEl({ id: Studio.newId(), type: "text", name: "טקסט " + (rec.elements.filter((x) => x.type === "text").length + 1),
                   text: "כותרת חדשה", color: "#ffffff", bold: true, x: 0, y: 0.35, w: 0.5, h: null, rot: 0, z: 0.15, seq: curSeq });
      const tb = textBitmap(el);
      el.aspect = tb.aspect;
      el.h = (el.w / el.aspect) * (rec.target.artRect.w / rec.target.artRect.h);
      rec.elements.push(el);
      selectedId = el.id;
      await Studio.save(rec);
      msg("נוסף טקסט. ערכי את התוכן בלוח למטה.");
      render();
    };

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
      resetSeq();
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
        rec.elements.forEach(Studio.normEl);
        selectedId = null;
        await hydrate(); refreshExpSelect(); render();
        msg("הייבוא הצליח.");
      } catch (err) { msg("הקובץ לא תקין לייבוא."); }
    };
    $("btn-play").onclick = () => { location.href = "play.html#" + rec.id; };
    $("btn-preview3d").onclick = () => { location.href = "preview.html#" + rec.id; };
    $("btn-del-el").onclick = async () => {
      const i = rec.elements.findIndex((x) => x.id === selectedId);
      if (i < 0) return;
      const [gone] = rec.elements.splice(i, 1);
      if (gone.assetId) { delete rec.assets[gone.assetId]; delete media[gone.assetId]; }
      delete textCache[gone.id];
      selectedId = null;
      await Studio.save(rec);
      render();
    };

    // z-order
    const moveEl = (dir) => async () => {
      const i = rec.elements.findIndex((x) => x.id === selectedId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= rec.elements.length) return;
      [rec.elements[i], rec.elements[j]] = [rec.elements[j], rec.elements[i]];
      await Studio.save(rec);
      renderList(); draw();
    };
    $("btn-layer-up").onclick = moveEl(1);
    $("btn-layer-down").onclick = moveEl(-1);

    // panel bindings
    const cur = () => rec.elements.find((x) => x.id === selectedId);
    const upd = async (fn) => { const el = cur(); if (!el) return; fn(el); await Studio.save(rec); renderPanel(); draw(); renderList(); };
    const num = (id, min, max, fn) => { $(id).onchange = (e) => { const v = parseFloat(e.target.value); if (isNaN(v)) { renderPanel(); return; } upd((el) => fn(el, Math.max(min, Math.min(max, v)))); }; };
    $("sl-scale").oninput = (e) => upd((el) => { const f = parseFloat(e.target.value) / el.w; el.w = parseFloat(e.target.value); if (el.h != null) el.h = Math.max(0.02, el.h * f); });
    $("sl-rot").oninput = (e) => upd((el) => { el.rot = parseFloat(e.target.value); });
    $("sl-z").oninput = (e) => upd((el) => { el.z = parseFloat(e.target.value); });
    $("sl-vol").oninput = (e) => upd((el) => { el.volume = parseFloat(e.target.value); });
    $("sl-opacity").oninput = (e) => upd((el) => { el.opacity = parseFloat(e.target.value); });
    $("ck-loop").onchange = (e) => upd((el) => { el.loop = e.target.checked; });
    $("sel-anim").onchange = (e) => upd((el) => { el.anim = e.target.value; el.spin = el.anim === "spin"; });
    $("sel-tap").onchange = (e) => upd((el) => { el.onTap = e.target.value; });
    $("sel-seq").onchange = (e) => upd((el) => { el.seq = e.target.value || null; });
    $("btn-tl-add").onclick = () => upd((el) => {
      el.timeline = el.timeline && Array.isArray(el.timeline.keys) ? el.timeline : { loop: false, keys: [] };
      const t = Math.max(0, Math.min(60, parseFloat($("num-tl-t").value) || 0));
      const scale = Math.max(0.1, Math.min(5, parseFloat($("num-tl-scale").value) || 1));
      el.timeline.keys.push({ t, x: el.x, y: el.y, z: el.z || 0, rot: el.rot || 0, opacity: el.opacity == null ? 1 : el.opacity, scale });
    });
    $("ck-chroma").onchange = (e) => upd((el) => { el.chroma = Object.assign({}, el.chroma, { enabled: e.target.checked }); });
    $("in-chroma-color").onchange = (e) => upd((el) => { el.chroma = Object.assign({}, el.chroma, { color: e.target.value }); });
    $("sl-chroma").onchange = (e) => upd((el) => { el.chroma = Object.assign({}, el.chroma, { threshold: parseFloat(e.target.value) }); });
    $("ck-tl-loop").onchange = (e) => upd((el) => {
      el.timeline = el.timeline && Array.isArray(el.timeline.keys) ? el.timeline : { loop: false, keys: [] };
      el.timeline.loop = e.target.checked;
    });
    $("in-tapurl").onchange = (e) => upd((el) => { el.tapUrl = e.target.value.trim(); });
    // numeric panel
    num("num-x", -0.7, 0.7, (el, v) => { el.x = v; });
    num("num-y", -0.7, 0.7, (el, v) => { el.y = v; });
    num("num-w", 0.05, 2, (el, v) => { const f = v / el.w; el.w = v; if (el.h != null) el.h = Math.max(0.02, el.h * f); });
    num("num-rot", -180, 180, (el, v) => { el.rot = v; });
    num("num-z", 0, 0.5, (el, v) => { el.z = v; });
    num("num-opacity", 0, 1, (el, v) => { el.opacity = v; });
    // text controls
    $("in-text").oninput = (e) => upd((el) => {
      el.text = e.target.value;
      const tb = textBitmap(el);
      el.aspect = tb.aspect;
      el.h = (el.w / el.aspect) * (rec.target.artRect.w / rec.target.artRect.h);
    });
    $("in-color").oninput = (e) => upd((el) => { el.color = e.target.value; });
    $("ck-bold").onchange = (e) => upd((el) => { el.bold = e.target.checked; });

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
    renderSeqTabs();
    renderList();
    renderPanel();
    draw();
  }

  function renderList() {
    const ul = $("element-list");
    ul.innerHTML = "";
    rec.elements.forEach((el, i) => {
      if (!Studio.elVisibleIn(el, curSeq)) return;
      const li = document.createElement("li");
      li.textContent = (ICONS[el.type] || "") + el.name + (i === rec.elements.length - 1 ? "  (עליון)" : i === 0 ? "  (תחתון)" : "");
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
    $("sl-opacity").value = el.opacity == null ? 1 : el.opacity;
    $("row-volume").hidden = el.type !== "video" && el.type !== "sound";
    $("sl-vol").value = el.volume == null ? 1 : el.volume;
    $("row-loop").hidden = el.type !== "video" && el.type !== "sound";
    $("row-chroma").hidden = el.type !== "video";
    if (el.type === "video") {
      $("ck-chroma").checked = !!(el.chroma && el.chroma.enabled);
      $("in-chroma-color").value = (el.chroma && el.chroma.color) || "#00ff00";
      $("sl-chroma").value = el.chroma && el.chroma.threshold != null ? el.chroma.threshold : 0.35;
    }
    $("ck-loop").checked = el.loop !== false;
    $("sel-anim").value = Studio.normEl(el).anim;
    $("sel-tap").value = el.onTap || "none";
    const seqs = Studio.seqList(rec);
    $("row-seq").hidden = !seqs.length;
    if (seqs.length) {
      const sel = $("sel-seq");
      sel.innerHTML = "";
      const all = document.createElement("option"); all.value = ""; all.textContent = "כל המצבים"; sel.appendChild(all);
      seqs.forEach((sq) => { const o = document.createElement("option"); o.value = sq.id; o.textContent = sq.name; sel.appendChild(o); });
      sel.value = el.seq || "";
    }
    $("row-tapurl").hidden = el.onTap !== "link";
    $("in-tapurl").value = el.tapUrl || "";
    $("row-text").hidden = el.type !== "text";
    renderTimeline(el);
    if (el.type === "text") {
      if (document.activeElement !== $("in-text")) $("in-text").value = el.text || "";
      $("in-color").value = el.color || "#ffffff";
      $("ck-bold").checked = el.bold !== false;
    }
    $("num-x").value = (Math.round((el.x || 0) * 100) / 100).toFixed(2);
    $("num-y").value = (Math.round((el.y || 0) * 100) / 100).toFixed(2);
    $("num-w").value = (Math.round(el.w * 100) / 100).toFixed(2);
    $("num-rot").value = Math.round(el.rot || 0);
    $("num-z").value = (Math.round((el.z || 0) * 1000) / 1000);
    $("num-opacity").value = el.opacity == null ? 1 : el.opacity;
  }

  // ---------- timeline editor ----------
  function renderTimeline(el) {
    const wrap = $("row-timeline");
    wrap.hidden = el.type === "sound";
    if (el.type === "sound") return;
    const tl = el.timeline || { loop: false, keys: [] };
    $("ck-tl-loop").checked = !!tl.loop;
    $("tl-note").hidden = !tl.keys.length;
    const ul = $("tl-keys");
    ul.innerHTML = "";
    tl.keys.slice().sort((a, b) => a.t - b.t).forEach((k) => {
      const li = document.createElement("li");
      const i = el.timeline.keys.indexOf(k);
      li.textContent = "t=" + k.t + "s ";
      const del = document.createElement("button");
      del.className = "ghost danger"; del.textContent = "✕";
      del.onclick = () => upd((e2) => { e2.timeline.keys.splice(i, 1); });
      li.appendChild(del);
      ul.appendChild(li);
    });
  }

  // ---------- canvas preview ----------
  const cv = () => $("preview");
  let boxes = {};

  function draw() {
    if (!rec || !rec.target || !artworkImg) return;
    const c = cv();
    const wrap = $("canvas-wrap");
    const W = wrap.clientWidth || 320;
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
    let needsAnim = false;
    for (const el of rec.elements) {
      Studio.normEl(el);
      if (!Studio.elVisibleIn(el, curSeq)) continue;
      // live timeline playback: sampled keyframe values override the element's base props
      let ts = null;
      if (Studio.timelineDur(el)) { ts = Studio.sampleTimeline(el, t0 / 1000); needsAnim = true; }
      const sc = ts ? ts.scale : 1;
      let wpx = el.w * W * sc;
      let hpx = (el.h != null ? el.h * H : (el.w * W) / (el.aspect || 1)) * sc;
      let cx = ((ts ? ts.x : el.x) + 0.5) * W;
      let cy = (0.5 - (ts ? ts.y : el.y)) * H;
      let extraRot = 0;
      // animation previews (approximation of the player presets)
      if (!ts && el.anim === "float") { cy += Math.sin(t0 / 1300) * H * 0.02; needsAnim = true; }
      else if (!ts && el.anim === "pulse") { const f = 1 + 0.08 * Math.sin(t0 / 800); wpx *= f; hpx *= f; needsAnim = true; }
      else if (!ts && el.anim === "spin") { extraRot = ((t0 / 14000) * 2 * Math.PI) % (2 * Math.PI); needsAnim = true; }
      if (el.type === "video") needsAnim = true;
      const effRot = ts ? ts.rot : (el.rot || 0);
      boxes[el.id] = { cx, cy, w: wpx, h: hpx, rot: -effRot * Math.PI / 180 };
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-effRot * Math.PI / 180);
      ctx.globalAlpha = 0.92 * (ts ? ts.opacity : (el.opacity == null ? 1 : el.opacity));
      const m = el.assetId && media[el.assetId];
      if (el.type === "video" && m && m.readyState >= 2) {
        ctx.drawImage(m, -wpx / 2, -hpx / 2, wpx, hpx);
      } else if (el.type === "image" && m) {
        ctx.rotate(extraRot);
        ctx.drawImage(m, -wpx / 2, -hpx / 2, wpx, hpx);
      } else if (el.type === "text") {
        const tb = textBitmap(el);
        ctx.drawImage(tb.canvas, -wpx / 2, -hpx / 2, wpx, hpx);
      } else if (el.type === "model") {
        ctx.beginPath(); ctx.rect(-wpx / 2, -hpx / 2, wpx, hpx);
        ctx.fillStyle = "rgba(70,40,140,0.55)"; ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = "#fff"; ctx.font = Math.round(Math.min(wpx, hpx) / 3.2) + "px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("3D", 0, 2);
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
        ctx.fillRect(wpx / 2 - 8, hpx / 2 - 8, 16, 16);
        ctx.restore();
      }
    }
    if (needsAnim) requestAnimationFrame(draw);
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
