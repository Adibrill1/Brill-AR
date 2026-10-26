"use strict";
/* AR Studio editor: upload artwork, add video/image/sound/text elements,
   arrange on a 2D WYSIWYG canvas, save locally, export/import, device preview.
   Round A: text layers, opacity, numeric panel, z-order, animation presets,
   tap actions, camera-free 3D preview page link. */
(() => {
  const $ = (id) => document.getElementById(id);
  const msg = (t) => { $("msg").textContent = t; if (t) setTimeout(() => { if ($("msg").textContent === t) $("msg").textContent = ""; }, 6000); };
  // Editing-semantics guard, shared by the 2D canvas and the embedded 3D view: a drag the
  // timeline would silently override is refused with a message; supported channels write a
  // key at the frozen playhead instead of touching base props. Same strings as editor-3d.js.
  const elKeyed = (el) => !!(el && el.timeline && Array.isArray(el.timeline.keys) && el.timeline.keys.length);
  const keyAtT = (el, t) => { let k = el.timeline.keys.find((k) => Math.abs(k.t - t) < 1e-6); if (!k) k = Studio.addTimelineKey(el, { t }); return k; };
  const GATE_CURVE = "אלמנט עם מסלול תנועה נערך בציר הזמן, לא בגרירה ישירה";
  const GATE_GROUP = "קבוצה עם נקודות מפתח נערכת בציר הזמן, לא בגרירה ישירה";
  const freezePlayhead = (t) => { tlScrubT = t; $("tl-time").textContent = "t=" + t.toFixed(1) + "s"; $("btn-tl-live").hidden = false; const sel = rec && rec.elements.find((x) => x.id === selectedId); if (sel) renderRuler(sel); draw(); };
  // Restore the exact pre-drag playhead state (live, or a deliberate frozen scrub) after a
  // cancelled drag - a two-finger pinch must leave no freeze behind but keep the user's own.
  const restoreFrozen = (t) => {
    tlScrubT = (t != null) ? t : null;
    $("tl-time").textContent = tlScrubT != null ? "t=" + tlScrubT.toFixed(1) + "s" : "";
    $("btn-tl-live").hidden = tlScrubT == null;
    const sel = rec && rec.elements.find((x) => x.id === selectedId);
    if (sel) renderRuler(sel);
    draw();
  };
  // Same contract for the numeric panel / sliders: an edit the timeline would silently
  // override writes a key at the frozen playhead; unsupported cases are refused with a
  // message. Group rot/opacity stay writable (sampled channels); group geometry is gated.
  const preparePanelEdit = (el, channel) => {
    if (!elKeyed(el)) return null;
    if (el.type === "group" && channel !== "rot" && channel !== "opacity") return GATE_GROUP;
    if ((channel === "x" || channel === "y") && el.timeline.xyMap) return GATE_CURVE;
    const keyT = Math.round(editorClock3D(el) * 10) / 10;
    freezePlayhead(keyT); // freeze exactly ON the key time so the sampled frame equals the key
    return keyT;
  };
  // Base-prop write shared by the numeric panel and the drag path; kept at module scope so
  // panelWrite (module scope) can reach it - a ReferenceError here used to silently drop edits.
  const applyBaseProp = (el, key, value) => {
    if (el.type === "group") Studio.transformGroup(rec, el, { [key]: value });
    else { const f = key === "w" ? value / el.w : 1; el[key] = value; if (key === "w" && el.h != null) el.h = Math.max(.02, el.h * f); }
  };
  const panelWrite = (el, channel, v) => {
    const keyT = preparePanelEdit(el, channel);
    if (typeof keyT === "string") { msg(keyT); return; }
    if (keyT != null) {
      const k = keyAtT(el, keyT);
      if (channel === "w") k.scale = Math.max(.05, Math.min(4, v / el.w));
      else k[channel] = v;
      return;
    }
    if (channel === "opacity") el.opacity = v; else applyBaseProp(el, channel, v);
  };
  // Returns the frozen key time, null for a plain base edit, or a gate message string.
  const prepare2DKeyedDrag = (el, part) => {
    if (!elKeyed(el)) return null;
    if (el.type === "group") return GATE_GROUP;
    if (part === "move" && el.timeline.xyMap) return GATE_CURVE;
    const keyT = Math.round(editorClock3D(el) * 10) / 10;
    freezePlayhead(keyT); // freeze exactly ON the key time so the sampled frame equals the key
    return keyT;
  };

  let experienceReady = Promise.resolve();
  // Experience-changing and snapshot operations preserve the order of user actions.
  // Keep the tail usable after a failed operation instead of poisoning later selections.
  // Single chokepoint for experience writes: surfaces failures (the save-state pill
  // reflects them too) instead of silent unhandled rejections; the in-memory edit is
  // kept and persists on the next successful save.
  const SAVE_FAIL_MSG = "השמירה נכשלה. השינוי האחרון לא נשמר - נסי שוב.";
  // Ask the browser not to evict our IndexedDB under storage pressure (best effort; outcome varies, esp. iOS Safari).
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(ok => { window.__storagePersisted = ok; }).catch(() => {}); } catch {}
  function importErrorMessage(err) {
    const m = String((err && err.message) || err);
    if (/maximum ?60|too many entries|bad elements/i.test(m)) return "הקובץ לא יובא: יותר מ־60 שכבות. אם זה גיבוי ישן וגדול, נסי ״ייבוא שחזור״ (עדיף במחשב).";
    if (/too large|too many assets|archive too large|entry too large/i.test(m)) return "הקובץ לא יובא: גודל הקבצים חורג מהמגבלה (60MB בסך הכול, 20MB לקובץ). אם זה גיבוי ישן וגדול, נסי ״ייבוא שחזור״.";
    return "הקובץ לא תקין לייבוא.";
  }
  const saveGuarded = (r, o) => Studio.save(r, o).catch((err) => msg(err && err.deletedElsewhere ? "היצירה הזו נמחקה בחלון אחר, ולכן לא נשמרה. פתחי יצירה אחרת מהרשימה." : SAVE_FAIL_MSG));
  // In-app record switching drops unsaved in-memory edits after a failed save. Block it
  // explicitly instead of losing the work silently. (In-flight saves are safe: save()
  // snapshots at call time.)
  const confirmUnsavedSwitch = () => {
    if (!rec) return true;
    const st = Studio.saveState(rec.id);
    if (!st.lastError) return true;
    return confirm("יש שינויים בניסוי הזה שהשמירה שלהם נכשלה. מעבר ימחק אותם. לעבור בכל זאת?");
  };
  let prepared = null;
  function queueExperience(work) {
    prepared = null; // any edit/switch/delete invalidates a prepared share file
    if (window.__flushSlider) window.__flushSlider();
    const operation = experienceReady.then(work);
    experienceReady = operation.catch(err => { msg("הפעולה לא הושלמה: " + err.message); });
    return experienceReady;
  }
  let rec = null;              // current experience record
  let selectedId = null;
  const checkedIds = new Set(); // multi-select for grouping
  let canvasStart=performance.now(),canvasTracks={};
  let actionEngine=null;
  let actionUI=null;
  let actionTarget=null;
  let curSeq = null;           // active sequence-state id (null = single-state artwork)
  const media = {};            // assetId -> HTMLImageElement | HTMLVideoElement (for canvas drawing)
  const deadAssets = new Set();  // assetIds whose stored bytes are unreadable (iOS evicted picker backing); kept in the record, never silently dropped
  const textCache = {};        // el.id -> {key, canvas, aspect}
  let artworkImg = null;       // HTMLImageElement of artwork
  let drag = null;

  const ICONS = { video: "🎬 ", image: "🖼️ ", sound: "🎵 ", text: "🔤 ", model: "🧊 ", particles: "✨ ", group: "📦 " };

  // ---------- boot ----------
  async function boot() {
    const requested=location.hash.slice(1);rec = requested&&await Studio.load(requested)||await Studio.seedDemo(false);
    resetSeq();
    await hydrate();
    await refreshExpSelect();
    bind();
    render();
  }

  function resetSeq() { actionEngine=ActionCore.create(rec);actionEngine.autoStart();canvasStart=performance.now();canvasTracks={};curSeq = Studio.seqList(rec).length ? Studio.seqList(rec)[0].id : null; }

  // --- test mode + diagnostics (gap n:15): taps drive the experience, editing gestures are refused,
  // and a live strip shows what plays, what stopped, and what triggered each change. ---
  let testMode = false, diagTimer = null, diagDirect = false;
  const diagLog = [], diagLastPlaying = new Map();
  function logDiag(text) { diagLog.unshift(text); if (diagLog.length > 6) diagLog.pop(); renderDiag(); }
  function seqName(id) { const sq = Studio.seqList(rec).find((x) => x.id === id); return sq ? (sq.name || id) : id; }
  function actionSeqName(id) { const q = (ActionCore.list(rec)).find((x) => x.id === id); return q ? (q.name || id) : id; }
  function setTestMode(on) {
    testMode = on;
    const b = $("btn-test-mode"); if (b) { b.classList.toggle("on", on); b.textContent = on ? "חזרה לעריכה" : "מצב בדיקה"; }
    const strip = $("diag-strip"); if (strip) strip.hidden = !on;
    if (on) {
      diagLog.length = 0; diagLastPlaying.clear();
      for (const q of ActionCore.list(rec)) diagLastPlaying.set(q.id, !!(actionEngine && actionEngine.isPlaying(q.id))); // ongoing runs keep their original cause; only NEW starts get attribution
      logDiag("מצב בדיקה: הקשות על הקנבס מפעילות פעולות; גרירה ועריכה כבויים עד לחזרה לעריכה.");
      diagTimer = setInterval(renderDiag, 700);
    } else if (diagTimer) { clearInterval(diagTimer); diagTimer = null; }
    draw();
  }
  function renderDiag() {
    const strip = $("diag-strip"); if (!strip || strip.hidden || !rec) return;
    strip.innerHTML = "";
    const head = document.createElement("div"); head.className = "diag-head";
    const t = document.createElement("strong"); t.textContent = "אבחון בדיקה";
    const cs = document.createElement("span"); cs.className = "hint"; cs.textContent = "מצב מוצג: " + (curSeq ? seqName(curSeq) : "ברירת מחדל");
    head.appendChild(t); head.appendChild(cs); strip.appendChild(head);
    const seqs = ActionCore.list(rec), tracks = Studio.trackList(rec);
    if (!seqs.length && !tracks.length) { const h = document.createElement("div"); h.className = "hint"; h.textContent = "אין רצפי פעולות או מסלולים ביצירה עדיין."; strip.appendChild(h); }
    for (const q of seqs) {
      const playing = actionEngine && actionEngine.isPlaying(q.id);
      const was = diagLastPlaying.get(q.id) || false;
      if (playing && !was && !diagDirect) { const nm = actionSeqName(q.id); diagLog.unshift("רצף '" + nm + "' הופעל אוטומטית או מתוך רצף אחר"); if (diagLog.length > 6) diagLog.pop(); }
      diagLastPlaying.set(q.id, !!playing);
      const snap = actionEngine ? actionEngine.snapshot()[q.id] : null;
      const row = document.createElement("div"); row.className = "diag-row"; row.dataset.seq = q.id;
      const dot = document.createElement("span"); dot.className = "diag-dot" + (playing ? " on" : "");
      const nm = document.createElement("span"); nm.className = "diag-name"; nm.textContent = q.name || q.id;
      const st = document.createElement("span"); st.className = "diag-state";
      st.textContent = playing ? "מנגן " + (snap ? snap.time.toFixed(1) : "0") + " שנ׳" : "מושהה";
      const btn = document.createElement("button"); btn.className = "ghost small diag-toggle"; btn.textContent = playing ? "עצירה" : "ניגון";
      btn.onclick = () => { diagDirect = true; const w = actionEngine.isPlaying(q.id); actionEngine.toggle(q.id); logDiag((w ? "עצירה ידנית באבחון של '" : "ניגון ידני באבחון של '") + actionSeqName(q.id) + "'"); draw(); renderDiag(); };
      row.appendChild(dot); row.appendChild(nm); row.appendChild(st); row.appendChild(btn); strip.appendChild(row);
    }
    for (const tr of tracks) {
      const stT = canvasTracks[tr.id], playing = !!(stT && stT.playing);
      const row = document.createElement("div"); row.className = "diag-row"; row.dataset.track = tr.id;
      const dot = document.createElement("span"); dot.className = "diag-dot" + (playing ? " on" : "");
      const nm = document.createElement("span"); nm.className = "diag-name"; nm.textContent = "מסלול: " + (tr.name || tr.id);
      const st = document.createElement("span"); st.className = "diag-state";
      st.textContent = playing ? "מנגן " + ((performance.now() - stT.start) / 1000).toFixed(1) + " שנ׳" : "מושהה";
      const btn = document.createElement("button"); btn.className = "ghost small diag-toggle-track"; btn.textContent = playing ? "עצירה" : "ניגון";
      btn.onclick = () => { const c = canvasTracks[tr.id] || (canvasTracks[tr.id] = { playing: false, start: 0 }); c.playing = !c.playing; if (c.playing) c.start = performance.now(); logDiag((c.playing ? "ניגון ידני באבחון של מסלול '" : "עצירה ידנית באבחון של מסלול '") + (tr.name || tr.id) + "'"); draw(); renderDiag(); };
      row.appendChild(dot); row.appendChild(nm); row.appendChild(st); row.appendChild(btn); strip.appendChild(row);
    }
    diagDirect = false;
    if (diagLog.length) {
      const lg = document.createElement("div"); lg.className = "diag-log";
      for (const e of diagLog) { const d = document.createElement("div"); d.textContent = e; lg.appendChild(d); }
      strip.appendChild(lg);
    }
  }
  function handleTestTap(p, hitFn) {
    const el = hitFn(p);
    if (!el) return;
    const av = (rec._actionValues || {})[el.id] || {};
    const tap = av.tap != null ? av.tap : (el.onTap || "none");
    const nm = el.name || el.type;
    if (tap === "none" || !tap) { logDiag("הקשה על '" + nm + "' - אין פעולה משויכת"); return; }
    if (tap === "link") { if (/^https:/.test(el.tapUrl || "")) window.open(el.tapUrl, "_blank", "noopener"); logDiag("הקשה על '" + nm + "' - קישור"); return; }
    if (tap === "mute") { logDiag("הקשה על '" + nm + "' - השתקה (אין שמע על קנבס העריכה)"); return; }
    if (tap === "sequence") { const nx = Studio.nextSequence(rec, curSeq); if (nx && nx !== curSeq) { curSeq = nx; logDiag("הקשה על '" + nm + "' - מעבר למצב '" + seqName(nx) + "'"); renderSeqTabs(); } else logDiag("הקשה על '" + nm + "' - מעבר מצב (מצב יחיד)"); draw(); return; }
    if (tap.startsWith("seq:")) { const id2 = tap.slice(4); if (Studio.seqList(rec).some((x) => x.id === id2)) { curSeq = id2; logDiag("הקשה על '" + nm + "' - מעבר למצב '" + seqName(id2) + "'"); renderSeqTabs(); } else logDiag("הקשה על '" + nm + "' - מצב חסר"); draw(); return; }
    if (tap.startsWith("action:")) { const id2 = tap.slice(7); diagDirect = true; const w = actionEngine.isPlaying(id2); actionEngine.toggle(id2); logDiag("הקשה על '" + nm + "' - " + (w ? "עצירת" : "הפעלת") + " רצף '" + actionSeqName(id2) + "'"); draw(); return; }
    if (tap.startsWith("track:")) { const id2 = tap.slice(6); const c = canvasTracks[id2] || (canvasTracks[id2] = { playing: false, start: 0 }); c.playing = !c.playing; if (c.playing) c.start = performance.now(); logDiag("הקשה על '" + nm + "' - " + (c.playing ? "ניגון" : "עצירת") + " מסלול"); draw(); return; }
    logDiag("הקשה על '" + nm + "' - פעולה לא מוכרת: " + tap);
  }

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
        await saveGuarded(rec);
        selectedId = null; renderSeqTabs(); renderList(); renderPanel(); draw();
      };
      bar.appendChild(b);
      return;
    }
    seqs.forEach((sq) => {
      const b = document.createElement("button");
      b.className = "seq-tab" + (sq.id === curSeq ? " sel" : "");
      b.textContent = sq.name;
      b.onclick = () => { canvasStart=performance.now();curSeq = sq.id; selectedId = null; renderSeqTabs(); renderList(); renderPanel(); draw(); };
      bar.appendChild(b);
    });
    if (seqs.length < 6) {
      const add = document.createElement("button");
      add.className = "seq-add"; add.textContent = "+ מצב";
      add.onclick = async () => {
        rec.sequences.push({ id: Studio.newId(), name: "מצב " + (seqs.length + 1) });
        await saveGuarded(rec); renderSeqTabs(); renderPanel();
      };
      bar.appendChild(add);
    }
    { // parallel overlay tracks: independent mini-timelines that run at the same time as states
      let trow = document.createElement("div");
      trow.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px;font-size:12px;color:#3c374b;border-top:1px solid #d7d3e8;padding-top:6px";
      trow.appendChild(document.createTextNode("מסלולים במקביל:"));
      const tracks = Studio.trackList(rec);
      tracks.forEach((tr) => {
        const chip = document.createElement("span");
        chip.style.cssText = "display:inline-flex;align-items:center;gap:4px;background:#f0edf8;color:#292535;padding:2px 8px;border-radius:999px";
        chip.appendChild(document.createTextNode("🎞️ " + tr.name));
        const as = document.createElement("input");
        as.type = "checkbox"; as.checked = !!tr.autoStart; as.title = "מתחיל אוטומטית";
        as.onchange = async () => { tr.autoStart = as.checked; await saveGuarded(rec); };
        chip.appendChild(as);
        const lp = document.createElement("input");
        lp.type = "checkbox"; lp.checked = !!tr.loop; lp.title = "חזרה";
        lp.onchange = async () => { tr.loop = lp.checked; await saveGuarded(rec); };
        chip.appendChild(lp);
        if(!canvasTracks[tr.id])canvasTracks[tr.id]={playing:!!tr.autoStart,start:performance.now()};
        const preview=document.createElement('button');preview.dataset.previewTrack=tr.id;
        const state=canvasTracks[tr.id];preview.style.cssText='background:#fff;color:#292535;border:1px solid #787087';preview.textContent=state.playing?'עצירה בתצוגה':'ניגון בתצוגה';
        preview.onclick=()=>{state.playing=!state.playing;state.start=performance.now();renderSeqTabs();draw();};chip.append(preview);

        const del = document.createElement("button");
        del.textContent = "×"; del.title = "מחיקת המסלול";
        del.onclick = async () => {
          rec.tracks = tracks.filter((x) => x.id !== tr.id);
          for (const el of rec.elements) if (el.track === tr.id) el.track = null;
          await saveGuarded(rec); renderSeqTabs(); renderList(); renderPanel();
        };
        chip.appendChild(del);
        trow.appendChild(chip);
      });
      if (tracks.length < 4) {
        const add = document.createElement("button");
        add.className = "seq-add"; add.textContent = "+ מסלול";
        add.onclick = async () => {
          rec.tracks = tracks.concat([{ id: Studio.newId(), name: "מסלול " + (tracks.length + 1), loop: true, autoStart: true }]);
          await saveGuarded(rec); renderSeqTabs(); renderPanel();
        };
        trow.appendChild(add);
      }
      bar.appendChild(trow);
    }
    { // per-state settings: loop + auto-advance chaining
      const sq = seqs.find((x) => x.id === curSeq);
      if (sq) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px;font-size:12px;color:#3c374b";
        const loopL = document.createElement("label");
        loopL.style.cssText = "display:flex;align-items:center;gap:4px";
        const loopC = document.createElement("input");
        loopC.type = "checkbox"; loopC.checked = !!sq.loop;
        loopC.onchange = async () => { sq.loop = loopC.checked; await saveGuarded(rec); };
        loopL.appendChild(loopC);
        loopL.appendChild(document.createTextNode("חזרה על אנימציות המצב"));
        row.appendChild(loopL);
        row.appendChild(document.createTextNode(" · מעבר אוטומטי: "));
        const at = document.createElement("input");
        at.type = "number"; at.min = "0.5"; at.step = "0.5";
        at.value = sq.autoNext && sq.autoNext.at ? sq.autoNext.at : 3;
        at.style.width = "52px";
        row.appendChild(at);
        row.appendChild(document.createTextNode(" שניות אל "));
        const sel = document.createElement("select");
        const none = document.createElement("option");
        none.value = ""; none.textContent = "ללא"; sel.appendChild(none);
        for (const other of seqs) {
          if (other.id === curSeq) continue;
          const o = document.createElement("option");
          o.value = other.id; o.textContent = other.name;
          if (sq.autoNext && sq.autoNext.to === other.id) o.selected = true;
          sel.appendChild(o);
        }
        sel.onchange = async () => {
          sq.autoNext = sel.value ? { at: Math.max(0.5, Number(at.value) || 3), to: sel.value } : null;
          await saveGuarded(rec);
        };
        at.onchange = async () => { if (sq.autoNext) { sq.autoNext.at = Math.max(0.5, Number(at.value) || 3); await saveGuarded(rec); } };
        row.appendChild(sel);
        bar.appendChild(row);
      }
    }
    if (seqs.length > 1) {
      const del = document.createElement("button");
      del.className = "seq-del"; del.textContent = "מחיקת המצב";
      del.onclick = async () => {
        rec.sequences = seqs.filter((x) => x.id !== curSeq);
        for (const el of rec.elements) if (el.seq === curSeq) el.seq = null; // orphans become visible everywhere
        curSeq = rec.sequences[0].id;
        await saveGuarded(rec);
        selectedId = null; renderSeqTabs(); renderList(); renderPanel(); draw();
      };
      bar.appendChild(del);
    }
  }

  // A read can fail for a moment (iOS memory pressure, a picker-backed blob mid-eviction) and then work.
  // Retry before calling an asset lost; when FileReader keeps failing, try arrayBuffer() and keep a
  // page-owned copy of the same bytes. Only a read that still fails is reported (and the stored record is never changed for it).
  const healedAssets = new Set();
  async function readAsset(id) {
    let lastErr;
    for (let i = 0; i < 3; i++) {
      try { return await Studio.blobToDataURL(rec.assets[id]); } catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 120 * (i + 1))); }
    }
    try {
      const b = rec.assets[id], copy = new Blob([await b.arrayBuffer()], { type: b.type || "" });
      if (copy.size && copy.size === b.size) { rec.assets[id] = copy; healedAssets.add(id); return await Studio.blobToDataURL(copy); }
    } catch (e) { lastErr = e; }
    throw lastErr;
  }
  async function hydrate() {
    artworkImg = null;
    for (const k of Object.keys(media)) delete media[k];
    for (const k of Object.keys(textCache)) delete textCache[k];
    const badAssets = [];
    deadAssets.clear();
    if (rec.assets.__artwork) {
      // A stored blob can be unreadable ("dead" picker backing evicted by the OS). Keep the
      // editor usable and say exactly what is lost instead of failing the whole load.
      try { artworkImg = await Studio.loadImage(await readAsset("__artwork")); }
      catch (err) { badAssets.push("תמונת היצירה"); deadAssets.add("__artwork"); }
    }
    for (const el of rec.elements) {
      Studio.normEl(el);
      if (!el.assetId || !rec.assets[el.assetId]) continue;
      try {
        const durl = await readAsset(el.assetId);
        if (el.type === "video") {
          const v = document.createElement("video");
          v.muted = true; v.loop = el.loop !== false; v.playsInline = true; v.src = durl;
          v.play().catch(() => {});
          media[el.assetId] = v;
        } else if (el.type === "image") {
          const mm = await Studio.makeImageMedia(rec.assets[el.assetId], "m-" + el.id, null);
          media[el.assetId] = (mm.animated || mm.staticFallback) ? mm.node : await Studio.loadImage(durl);
        }
      } catch (err) { badAssets.push(el.name || el.type); if (el.assetId) deadAssets.add(el.assetId); }
    }
    if (healedAssets.size) { healedAssets.clear(); try { await Studio.save(rec, { noHistory: true }); } catch (e) {} }
    if (badAssets.length) msg("חלק מהקבצים לא נקראו מהמכשיר (" + [...new Set(badAssets)].join(", ") + ") - ייבאי אותם שוב כדי לשחזר.");
  }

  function refreshExpSelect() {
    $("in-exp-name").value = rec.name || "";
    return Studio.all().then((list) => {
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

  // Name of another creation whose recognition target is the same as / too similar to fp (distance <= 16 of 256 bits), else null.
  // Flat/featureless images are not comparable (Infinity) and never conflict; the record itself (exceptId) is skipped.
  // FAIL CLOSED: when the comparison itself cannot run (storage read, image decode, fingerprint), this THROWS a
  // DuplicateCheckUnavailable error. Callers must stop without changing anything and say the check was unavailable.
  async function findTargetConflict(_unused, fp, exceptId) {
    let cur = null;
    try {
      for (const other of (await Studio.all()).filter((r) => r.id !== exceptId)) {
        cur = other;
        const art = other.assets && other.assets.__artwork;
        if (!art) continue;
        let ofp = other.target && other.target.fp;
        if (!ofp) { const oimg = await Studio.loadImage(await Studio.blobToDataURL(art)); ofp = Studio.artworkFingerprint(oimg); }
        if (Studio.fingerprintDistance(fp, ofp) <= 16) return other.name || other.id;
      }
    } catch (e) { const err = new Error("duplicate check unavailable"); err.duplicateCheckUnavailable = true; err.cause = e; err.projectName = cur ? (cur.name || "ללא שם") : ""; throw err; }
    return null;
  }

  // ---------- upload flows ----------
  function bind() {
    $("btn-artwork").onclick = () => $("file-artwork").click();
    $("file-artwork").onchange = async (e) => {
      const f = e.target.files[0]; e.target.value = "";
      if (!f) return;
      if (f.size > 8 * 1024 * 1024) { msg("תמונה גדולה מדי (מעל 8MB). נסי תמונה קטנה יותר."); return; }
      return queueExperience(async () => {
      const img = await Studio.loadImage(await Studio.blobToDataURL(f));
      const fp = Studio.artworkFingerprint(img);
      // BLOCK (before any change) when this image is the same as, or too similar to, the target of
      // another of her creations. Same-record re-upload is never a conflict; flat/featureless images
      // are not comparable (distance Infinity) so they are not blocked here (quality warning handles them).
      let conflict = null;
      try { conflict = await findTargetConflict(null, fp, rec.id); }
      catch (e) { if (e && e.duplicateCheckUnavailable) { msg("לא הועלתה. לא הצלחנו לבדוק אם התמונה דומה ליצירה אחרת, ולכן לא שינינו כלום והיצירה שלך נשארה כמו שהיא." + (e.projectName ? " הבדיקה נתקעה ביצירה '" + e.projectName + "' - בדקי אותה או ייצאי ממנה גיבוי." : " הבדיקה לא הצליחה לקרוא את היצירות השמורות.") + " נסי שוב."); return; } throw e; }
      if (conflict) { msg("לא הועלתה. התמונה זהה או דומה מדי לתמונת היעד של היצירה '" + conflict + "'. שתי יצירות עם תמונה דומה מתבלבלות בזיהוי. בחרי תמונה אחרת. היצירה שלך נשארה ללא שינוי."); return; }
      const t = await Studio.makeTarget(img);
      rec.target = { artRect: t.artRect, natural: { w: img.naturalWidth, h: img.naturalHeight } };
      rec.assets.__artwork = await Studio.ownBlob(f);
      artworkImg = img;
      rec.target.fp = fp;
      await saveGuarded(rec);
      const q = Studio.assessTargetQuality(img);
      const note = "";
      if (q.warn && q.reason === "small") msg("נשמרה. שימי לב: התמונה קטנה (מתחת ל-480 פיקסלים בצד הקצר) - הזיהוי עלול להיות חלש. עדיפה תמונה גדולה וחדה." + note);
      else if (q.warn) msg("נשמרה. שימי לב: לתמונה מעט פרטים או ניגודיות - הזיהוי עלול להיות חלש. עדיפה תמונה עם הרבה פרטים." + note);
      else msg("תמונת היצירה נשמרה." + note);
      render();
      });
    };

    document.querySelectorAll("[data-add]").forEach((b) => {
      b.onclick = () => $("file-" + b.dataset.add).click();
    });
    const confirmDialog = (text, yesLabel) => new Promise((res) => {
      const wrap = document.createElement("div");
      wrap.id = "confirm-modal";
      wrap.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:200;display:flex;align-items:center;justify-content:center";
      const box = document.createElement("div");
      box.style.cssText = "background:#1e1e2a;color:#fff;max-width:420px;margin:16px;padding:20px;border-radius:14px;font:14px/1.6 sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.5)";
      const body = document.createElement("div");
      body.style.marginBottom = "16px"; body.textContent = text;
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:10px;justify-content:flex-end";
      const no = document.createElement("button");
      no.textContent = "ביטול"; no.dataset.answer = "no";
      no.style.cssText = "padding:8px 16px;border-radius:10px;border:1px solid #555;background:transparent;color:#fff;cursor:pointer";
      const yes = document.createElement("button");
      yes.textContent = yesLabel || "להמשיך"; yes.dataset.answer = "yes";
      yes.style.cssText = "padding:8px 16px;border-radius:10px;border:0;background:#7c5cff;color:#fff;cursor:pointer";
      const done = (v) => { wrap.remove(); res(v); };
      no.onclick = () => done(false); yes.onclick = () => done(true);
      wrap.onclick = (e) => { if (e.target === wrap) done(false); };
      row.appendChild(no); row.appendChild(yes);
      box.appendChild(body); box.appendChild(row); wrap.appendChild(box);
      document.body.appendChild(wrap);
    });
    const importAssetNow = async (kind, f, options = {}) => {
      if (!f) return;
      let importNote = "",videoInfo=null;
      if (f.size > 20 * 1024 * 1024) { msg(kind === 'video' ? 'קובץ גדול מדי (מעל 20MB). נסי סרטון קצר יותר או דחיסה ל־MP4' : 'קובץ גדול מדי (מעל 20MB) לגרסת הניסוי.'); return; }
      if(kind==='video'){
        msg('בודק את הסרטון…');
        try{videoInfo=await Studio.inspectVideo(f);}catch(error){if(!(/\.mov$/i.test(f.name)||f.type==='video/quicktime'))throw error;}
      }
      if (kind === "video" && !videoInfo && (/\.mov$/i.test(f.name) || f.type === "video/quicktime")) {
        const base = ($("in-server").value || "").trim().replace(/\/+$/, "");
        const token = ($("in-token").value || "").trim();
        if (!base || !token) { msg("המרת MOV דורשת שרת מוגדר עם כלי ffmpeg וסיסמה. אפשר גם לייצא MP4 מהתוכנה המקורית ולהעלות אותו."); return; }
        let parsed; try { parsed = new URL(base); } catch (_) { msg("כתובת שרת לא תקינה."); return; }
        if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname))) { msg("להמרה צריך שרת HTTPS מאובטח."); return; }
        if (!(await confirmDialog("הקובץ יישלח להמרה בשרת " + parsed.origin + ". ההמרה ל־MP4 אינה ללא אובדן: עד 1920 פיקסלים, 30 תמונות בשנייה, עד 120 שניות, בלי שקיפות או מטא־נתונים. צליל יומר ל־AAC. הסרטון המקורי אינו משתנה וההמרה אינה מפרסמת אותו.", "שליחה להמרה"))) return;
        msg("ממיר MOV ל־MP4…");
        try {
          const response = await fetch(base + "/api/convert/mov", { method: "POST", headers: { "content-type": "video/quicktime", authorization: "Bearer " + token }, body: f });
          if (!response.ok) { let out={};try{out=await response.json();}catch(_){}throw Error(out.error || "שרת ענה " + response.status); }
          const blob = await response.blob();
          if (blob.size > 20 * 1024 * 1024 || !blob.size || !blob.type.startsWith("video/mp4")) throw Error("תוצאת המרה לא תקינה");
          f = new File([blob], f.name.replace(/\.mov$/i, "") + ".mp4", { type: "video/mp4" });
          videoInfo=await Studio.inspectVideo(f);
          importNote = "MOV הומר ל־MP4 ונוסף. נשמר רק במכשיר; המקור אינו משתנה.";
        } catch (err) { msg("ההמרה לא הושלמה: " + err.message); return; }
      }
      if (kind === "model") {
        const magic = new Uint8Array(await f.slice(0, 4).arrayBuffer());
        if (magic[0] === 0x50 && magic[1] === 0x4B) {
          try {
            const packed = window.gltfZipToGlb(new Uint8Array(await f.arrayBuffer()), fflate);
            f = new File([packed.bytes], packed.name, { type: "model/gltf-binary" });
            if (packed.note) importNote = packed.note;
          } catch (ez) { msg("לא ניתן לייבא את ה־zip: " + ez.message); return; }
        }
        if (/\.fbx$/i.test(f.name)) {
          if (!(await confirmDialog("המרת FBX היא ניסיונית: מודלים סטטיים בלבד, עד 20MB. חומרים או מאפיינים מיוחדים עשויים להשתנות. אין תמיכה בשלד/הנפשה או טקסטורות חיצוניות. לתוצאה נאמנה למקור עדיף לייצא GLB מהתוכנה המקורית. הקובץ מומר במכשיר, בלי העלאה לשרת.", "המרה ובדיקה"))) return;
          try {
            const bytes = await window.fbxToGlb(f);
            f = new File([bytes], f.name.replace(/\.fbx$/i, ".glb"), { type: "model/gltf-binary" });
            importNote = "FBX הומר כמודל סטטי. בדקי צורה, כיוון וחומרים בתצוגה המקדימה לפני שימוש.";
          } catch (err) { msg("ה־FBX לא נוסף: " + err.message); return; }
        }
        if (/\.obj$/i.test(f.name)) { // Wavefront OBJ -> transcode to GLB (geometry only)
          const objText = await f.text();
          const lossy = /^(mtllib|usemtl|vt\s|vn\s)/m.test(objText);
          if (lossy && !(await confirmDialog("קובץ ה־obj הזה כולל חומרים/טקסטורות או נורמלים (mtllib/usemtl/vt/vn). ההמרה כאן שומרת רק את הצורה הגיאומטרית - החומרים והטקסטורות יאבדו. לתוצאה מלאה עדיף לייצא glb מהתוכנה המקורית.", "להמשיך עם גיאומטריה בלבד"))) return;
          const glb = window.objToGlb(objText);
          if (!glb) { msg("קובץ ה־obj ריק או לא קריא - צריך קובץ עם קודקודים ופאות (שורות v ו־f)."); return; }
          f = new File([glb], f.name.replace(/\.obj$/i, ".glb"), { type: "model/gltf-binary" });
        }
        if (/\.gltf$/i.test(f.name)) {
          try {
            // Reuse bounded dependency validator: a one-file archive can only
            // resolve already embedded data URIs; relative files fail clearly.
            const text=await f.text();
            const packed=window.gltfZipToGlb(fflate.zipSync({'model.gltf':new TextEncoder().encode(text)}),fflate);
            f=new File([packed.bytes],f.name.replace(/\.gltf$/i,'.glb'),{type:'model/gltf-binary'});
          } catch(err) { msg('קובץ glTF לא נוסף: '+err.message+' קבצים נלווים יש לארוז יחד ב־ZIP.');return; }
        }
        const head = new Uint8Array(await f.slice(0, 4).arrayBuffer());
        const isGlb = head[0] === 0x67 && head[1] === 0x6C && head[2] === 0x54 && head[3] === 0x46; // "glTF"
        if (!isGlb) {
          let bad = "הקובץ לא נראה כמו מודל glb תקין.";
          try {
            const g = JSON.parse(await f.text());
            const ext = [...(g.buffers || []), ...(g.images || [])].some((r) => r.uri && !r.uri.startsWith("data:"));
            bad = ext ? "קובץ gltf הזה מפנה לקבצים חיצוניים (bin/טקסטורות) שההעלאה לא כוללת. יצאו אותו מחדש כקובץ glb יחיד (למשל מבלנדר: Export glTF Binary) והעלו שוב."
                      : "הפורמט הזה לא נתמך עדיין - העלו קובץ glb (glTF Binary).";
          } catch (e2) {}
          msg(bad); return;
        }
      }
      if(kind==='model'){try{f=await Studio.prepareModelBlob(f);}catch(err){msg('המודל לא נוסף: '+err.message);return;}}
      { const blocked = Studio.addBlocker(rec, { layers: 1, bytes: f.size }); if (blocked) { msg(blocked); return; } }
      const assetId = Studio.newId();
      rec.assets[assetId] = await Studio.ownBlob(f);
      const artRatio = rec.target.artRect.w / rec.target.artRect.h;
      const el = Studio.normEl({ id: Studio.newId(), type: kind, name: { video: "סרטון", image: "תמונה", sound: "צליל", model: "מודל 3D" }[kind] + " " + (rec.elements.filter((x) => x.type === kind).length + 1),
                   assetId, x: 0, y: 0, w: kind === "video" ? 1.0 : 0.3, h: null, rot: 0, z: 0, flush: true, seq: curSeq }); // flush with the artwork plane (z=0): layers keep their order through the existing per-layer tie-break
      if (kind === "video" || kind === "sound") { el.volume = kind === "sound" ? 0.8 : 1; el.loop = true; }
      if (kind === "model") { el.w = 0.4; el.z = 0; el.seat = "plane"; el.aspect = 1; // seat="plane": the model's back face rests on the artwork (older models keep their centered placement)
        try { el.clipDurations = (await Studio.modelClipInfo(f)).map(c => c.duration); } catch {}
      }
      const durl = await Studio.blobToDataURL(f);
      if (kind === "image") {
        const mm = await Studio.makeImageMedia(f, "m-" + el.id, null);
        if (mm.animated || mm.staticFallback) {
          el.aspect = mm.width / mm.height;
          media[assetId] = mm.node;
        } else {
          const im = await Studio.loadImage(durl);
          el.aspect = im.naturalWidth / im.naturalHeight;
          media[assetId] = im;
          if (mm.gifError) msg(mm.gifError === "interlaced" ? "ה־GIF הזה שמור בשיטת שילוב (interlaced) שלא נתמכת - מוצג כתמונה סטטית." : "ה־GIF לא נטען כאנימציה - מוצג כתמונה סטטית.");
        }
        if (mm.staticFallback) importNote = (mm.gifError === "interlaced" ? "ה־GIF הזה שמור בשיטת שילוב (interlaced) שלא נתמכת - מוצג כתמונה סטטית." : "ה־GIF לא נטען כאנימציה - מוצג כתמונה סטטית.");
        el.h = (el.w / el.aspect) * artRatio;
      } else if (kind === "video") {
        const v = document.createElement("video");
        v.muted = true; v.playsInline = true; v.src = durl;
        el.aspect = videoInfo.width/videoInfo.height;
        el.h = (el.w / el.aspect) * artRatio;
        v.loop = true; v.play().catch(() => {});
        media[assetId] = v;
      } else {
        el.aspect = 1;
        el.h = el.w * artRatio;
      }
      if (options.name) el.name = options.name;
      if (options.loop != null) el.loop = options.loop;
      rec.elements.push(el);
      selectedId = el.id;
      await saveGuarded(rec);
      msg(importNote || "האלמנט נוסף. אפשר לגרור אותו על התצוגה.");
      render();
    };
    // Selection and imports share one queue, so a delayed conversion cannot
    // attach its result to a different experience selected midway through it.
    const importAsset = (kind, f, options = {}) => {
      return queueExperience(async()=>{
        const status=$('video-upload-status');if(kind==='video'){status.hidden=false;status.textContent='בודק ומוסיף את הסרטון…';}
        try{await importAssetNow(kind,f,options);if(kind==='video')status.textContent=$('msg').textContent;}
        catch(error){if(kind!=='video')throw error;const message='הסרטון לא נוסף: '+error.message;msg(message);status.textContent=message;}
      });
    };
    const addFile = (kind) => async (e) => {
      const f = e.target.files[0]; e.target.value = "";
      await importAsset(kind, f);
    };
    $("btn-library").onclick = () => StarterLibrary.open(importAsset);
    $("file-video").onchange = addFile("video");
    $("file-image").onchange = addFile("image");
    $("file-sound").onchange = addFile("sound");
    $("file-model").onchange = addFile("model");

    $("btn-particles").onclick = async () => {
      { const blocked = Studio.addBlocker(rec, { layers: 1 }); if (blocked) { msg(blocked); return; } }
      const el = Studio.normEl({ id: Studio.newId(), type: "particles", name: "חלקיקים " + (rec.elements.filter((x) => x.type === "particles").length + 1),
                   x: 0, y: 0, w: 0.6, h: 0.6, rot: 0, z: 0, flush: true, seq: curSeq, particles: { preset: "sparkle", count: 120, color: "#ffd94d" } });
      rec.elements.push(el);
      selectedId = el.id;
      await saveGuarded(rec);
      msg("נוספו חלקיקים. בחרי סגנון בלוח למטה.");
      render();
    };

    $("btn-text").onclick = async () => {
      { const blocked = Studio.addBlocker(rec, { layers: 1 }); if (blocked) { msg(blocked); return; } }
      const el = Studio.normEl({ id: Studio.newId(), type: "text", name: "טקסט " + (rec.elements.filter((x) => x.type === "text").length + 1),
                   text: "כותרת חדשה", color: "#ffffff", bold: true, x: 0, y: 0.35, w: 0.5, h: null, rot: 0, z: 0, flush: true, seq: curSeq });
      const tb = textBitmap(el);
      el.aspect = tb.aspect;
      el.h = (el.w / el.aspect) * (rec.target.artRect.w / rec.target.artRect.h);
      rec.elements.push(el);
      selectedId = el.id;
      await saveGuarded(rec);
      msg("נוסף טקסט. ערכי את התוכן בלוח למטה.");
      render();
    };

    $("in-exp-name").onchange = () => queueExperience(async () => {
      const v = $("in-exp-name").value.trim().slice(0, 60);
      if (!v) { $("in-exp-name").value = rec.name || ""; msg("השם לא יכול להיות ריק."); return; }
      if (v === rec.name) return;
      rec.name = v; // id, elements, assets untouched — rename changes display/export naming only
      await saveGuarded(rec); await refreshExpSelect(); msg("השם נשמר: " + v);
    });
    $("btn-new").onclick = () => { if (!confirmUnsavedSwitch()) return; queueExperience(async () => {
      rec = Studio.blankExperience();
      selectedId = null; artworkImg = null; checkedIds.clear(); tlScrubT = null; resetSeq();
      await saveGuarded(rec);
      await refreshExpSelect(); render();
      msg("ניסוי חדש - התחילי בהעלאת תמונת יצירה.");
    }); };
    $("btn-del-exp").onclick = async () => {
      if (!confirm("למחוק את הניסוי הזה לגמרי?")) return;
      return queueExperience(async () => {
      await Studio.del(rec.id);
      const all = await Studio.all();
      rec = all[0] || await Studio.seedDemo(true);
      selectedId = null; checkedIds.clear(); tlScrubT = null; resetSeq();
      await hydrate(); await refreshExpSelect(); render();
      });
    };
    $("exp-select").onchange = (e) => {
      const id = e.target.value;
      if (!confirmUnsavedSwitch()) { e.target.value = rec.id; return; }
      queueExperience(async () => {
        const r = await Studio.load(id);
        if (!r) return; // keep the current experience instead of wiping the editor
        rec = r;
        selectedId = null; checkedIds.clear(); tlScrubT = null;
        if (typeof setTestMode === "function") setTestMode(false); diagLog.length = 0; diagLastPlaying.clear();
        resetSeq();
        await hydrate(); await refreshExpSelect(); render(); renderSaveState();
      });
    };
    $("btn-export").onclick = () => queueExperience(async () => {
      const json = await Studio.exportJSON(rec);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      a.download = (rec.name || "ar-studio") + ".json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      { const w = Studio.exportWarning(rec); if (w) { refreshSafetyNote(); msg("אזהרה לגבי הגיבוי: ההסבר מופיע ליד כפתורי הייצוא."); } }
    });
    $("btn-export-zip").onclick = () => queueExperience(async () => {
      const blob = await Studio.exportZIP(rec);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = (rec.name || "ar-studio") + ".zip";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      { const w = Studio.exportWarning(rec); if (w) { refreshSafetyNote(); msg("אזהרה לגבי הגיבוי: ההסבר מופיע ליד כפתורי הייצוא."); } }
    });
    $("btn-import").onclick = () => $("file-import").click();

    $("in-server").value = localStorage.getItem("ar-studio-server") || "";
    $("in-server").onchange = (e) => localStorage.setItem("ar-studio-server", e.target.value.trim());
    $("in-token").value = localStorage.getItem("ar-studio-token") || "";
    $("in-token").onchange = (e) => localStorage.setItem("ar-studio-token", e.target.value.trim());
    // Prepared share file: if the first tap loses Safari's transient activation (big export took too long),
    // keep the built file and let the NEXT tap call navigator.share synchronously, with no await before it.
    const prepKey = (zip) => rec.id + ":" + rec.updatedAt + ":" + (zip ? "z" : "j");
    $("btn-send-publish").onclick = async () => {
      const btn = $("btn-send-publish"); if (btn.disabled) return;
      if (window.__flushSlider) window.__flushSlider(); // an unsaved slider edit bumps updatedAt, so a stale prepared file is dropped below
      if (prepared && prepared.key !== prepKey($("send-zip").checked)) { prepared = null; msg("היצירה השתנתה מאז שהקובץ הוכן. מכין מחדש..."); }
      if (prepared && navigator.share) {
        const p = prepared; prepared = null; btn.disabled = true;
        let ok = false;
        try { navigator.share({ files: [p.file], title: rec.name || "ar-studio" }).then(() => { msg("אם השליחה בוצעה, הקובץ בדרך אליי. אחזיר קישור אחרי שתאשרי פרסום."); }, (err) => { if (err && err.name === "AbortError") { prepared = p; msg("השיתוף בוטל - שום דבר לא נשלח. הקובץ עדיין מוכן."); } else { prepared = p; msg("חלון השיתוף לא נפתח. לחצי שוב, או השתמשי ב״ייצוא לקובץ״ ושלחי את הקובץ ידנית."); } }).finally(() => { btn.disabled = false; }); ok = true; }
        catch { prepared = p; }
        if (ok) return;
        btn.disabled = false;
      }
      btn.disabled = true;
      try {
        // Start the export synchronously inside the tap and share as early as possible:
        // Safari ties navigator.share to the tap's transient user activation.
        const health = await Studio.assetHealth(rec);
        const dead = health.filter((h) => !h.ok);
        if (dead.length) {
          const names = dead.map((h) => h.id === "__artwork" ? "תמונת היצירה" : ((rec.elements.find((x) => x.assetId === h.id || (x.particles && x.particles.spriteAssetId === h.id)) || {}).name || h.id));
          msg("חלק מהקבצים לא קריאים יותר בטלפון (" + names.join(", ") + ") - ייבאי אותם שוב ואז שלחי. שום דבר לא נשלח.");
          return;
        }
        const pb = Studio.publishBlocker(rec), warn = [pb && (pb + " אפשר לשלוח אליי כגיבוי, אבל לא אפשר יהיה לפרסם אותה כך."), Studio.exportWarning(rec)].filter(Boolean).join(" "), tail = warn ? " " + warn : "";
        const useZip = $("send-zip").checked, startKey = prepKey(useZip);
        const bodyP = useZip ? Studio.exportZIP(rec) : Studio.exportJSON(rec);
        let shared = false, file = null;
        if (navigator.canShare && navigator.share) {
          try {
            const body = await bodyP;
            file = new File([body], (rec.name || "ar-studio") + (useZip ? ".zip" : ".json"), { type: useZip ? "application/zip" : "application/json" });
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({ files: [file], title: rec.name || "ar-studio" });
              shared = true;
              msg("אם השליחה בוצעה, הקובץ בדרך אליי. אחזיר קישור אחרי שתאשרי פרסום." + tail);
            }
          } catch (err) {
            if (err && err.name === "AbortError") { msg("השיתוף בוטל - שום דבר לא נשלח."); return; }
            if (err && err.name === "NotAllowedError" && file) { prepared = { key: startKey, file }; msg("הקובץ מוכן. לחצי שוב על ״שליחה״ כדי לפתוח את חלון השיתוף." + tail); return; }
            // Any other share failure falls through to download.
          }
        }
        if (shared) return;
        const body = await bodyP;
        const name = (rec.name || "ar-studio") + (useZip ? ".zip" : ".json");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(body instanceof Blob ? body : new Blob([body], { type: "application/json" }));
        a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        msg("חלון השיתוף לא נפתח כאן, אז הקובץ ירד. שלחי אותו אליי בוואטסאפ." + tail);
      } catch (err) {
        const why = (err && err.message) || String(err) || "שגיאה לא ידועה";
        msg("ההכנה לשליחה נכשלה: " + why + ". היצירה נשמרה אצלך - נסי גם ״ייצוא לקובץ״ ושלחי את הקובץ כאן.");
      }
      finally { btn.disabled = false; }
    };
    $("btn-publish").onclick = async () => {
      const base = ($("in-server").value || "").trim().replace(/\/+$/, "");
      if (!base) { msg("כדי לפרסם צריך שרת קטן שמחזיק את הקישורים. כרגע אפשר לייצא לקובץ ולשתף ידנית."); return; }
      { const pb = Studio.publishBlocker(rec); if (pb) { msg(pb); return; } }
      msg("מפרסם...");
      try {
        const body = await Studio.exportJSON(rec);
        const tok = ($("in-token").value || "").trim();
        const r = await fetch(base + "/api/experiences", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + tok }, body });
        if (r.status === 401) throw new Error("סיסמת הפרסום שגויה");
        if (r.status === 413) throw new Error("הניסוי גדול מדי לשרת");
        if (!r.ok) throw new Error("שרת ענה " + r.status);
        const out = await r.json();
        const url = base + out.url;
        const link = $("publish-link"); link.href = url; link.textContent = url;
        const qr = qrcode(0, "M"); qr.addData(url); qr.make();
        $("publish-qr").innerHTML = qr.createImgTag(4, 8);
        $("publish-out").hidden = false;
        msg("פורסם! הקישור קבוע ואפשר לשתף אותו.");
      } catch (err) {
        msg("הפרסום נכשל: " + err.message);
      }
    };
    const doImport = (f, recovery) => queueExperience(async () => {
      try {
        const o = recovery ? { recovery: true, save: false } : { save: false };
        const imported = (/\.zip$/i.test(f.name) || f.type === "application/zip") ? await Studio.importZIP(f, o) : await Studio.importJSON(await f.text(), o);
        // Same rule as the artwork upload: an imported copy whose target is the same as / too similar to another creation is refused, nothing is written.
        if (imported.assets && imported.assets.__artwork) {
          let conflict = null;
          try { conflict = await findTargetConflict(null, await Studio.artworkFingerprint(await Studio.loadImage(await Studio.blobToDataURL(imported.assets.__artwork))), imported.id); }
          catch (e) { const m = "הייבוא נעצר: לא הצלחנו לבדוק אם תמונת היעד דומה ליצירה אחרת" + (e && e.projectName ? " (הבדיקה נתקעה ביצירה '" + e.projectName + "')" : "") + ". לא נשמר דבר, וכל היצירות שלך נשארו ללא שינוי. נסי שוב."; msg(m); const n = $("safety-note"); if (n) { n.textContent = m; n.hidden = false; } return; }
          if (conflict) { const m = "הייבוא נעצר: תמונת היעד זהה או דומה מדי לתמונת היעד של היצירה '" + conflict + "'. לא נשמר דבר, וכל היצירות שלך נשארו ללא שינוי."; msg(m); const n = $("safety-note"); if (n) { n.textContent = m; n.hidden = false; } return; }
        }
        await Studio.save(imported);
        rec = imported;
        rec.elements.forEach(Studio.normEl);
        selectedId = null; checkedIds.clear(); tlScrubT = null; resetSeq();
        await hydrate(); await refreshExpSelect(); render();
        msg(recovery ? "יובא כעותק חדש. המקור לא שונה. היצירה גדולה מהמגבלות, אז ייצוא נוסף יציג אזהרה." : "הייבוא הצליח.");
      } catch (err) { const m = importErrorMessage(err); msg(m); const n = $("safety-note"); if (n) { n.textContent = m; n.hidden = false; } }
    });
    $("file-import").onchange = (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) return doImport(f, false); };
    // Recovery import: only for an over-limit backup made before the guards existed. Always a NEW copy; larger caps
    // (300 layers / 60MB per file / 300MB total) can run out of memory on a phone, so the user must confirm.
    $("btn-import-recovery").onclick = () => { if (confirm("ייבוא שחזור מיועד לגיבוי גדול מהרגיל. הוא נשמר כעותק חדש ולא נוגע במקור, אבל בטלפון עלול להיגמר הזיכרון והדפדפן להיתקע. מומלץ מאוד לעשות את זה במחשב. להמשיך?")) $("file-import-recovery").click(); };
    $("file-import-recovery").onchange = (e) => { const f = e.target.files[0]; e.target.value = ""; if (!f) return; if (f.size > 100 * 1024 * 1024 && navigator.maxTouchPoints > 0 && !confirm("הקובץ גדול (" + Math.round(f.size / 1048576) + "MB) ואת בטלפון. קריאה שלו עלולה לתקוע את הדפדפן. מומלץ לפתוח את העורך במחשב. לקרוא בכל זאת?")) return; return doImport(f, true); };
    $("btn-edit-3d").onclick=()=>queueExperience(async()=>{await saveGuarded(rec);location.href="preview.html?edit=1#"+rec.id;});
    $("btn-edit-ar").onclick = () => { location.href = "play.html?edit=1#" + rec.id; };
    $("btn-play").onclick = () => { location.href = "play.html#" + rec.id; };
    $("btn-preview3d").onclick = () => { location.href = "preview.html#" + rec.id; };
    $("btn-2d").onclick=()=>setViewMode("2d");
    $("btn-3d").onclick=()=>setViewMode("3d");
    Editor3D.init({wrap:$("canvas-wrap"),getRec:()=>rec,getSelected:()=>selectedId,
      onSelect:(id)=>{selectedId=id;renderList();renderPanel();draw();Editor3D.refreshGizmo();},
      onChange:()=>{saveGuarded(rec).then(()=>{renderPanel();draw();renderList();});},
      beginFrame:()=>{if(rec)Object.defineProperty(rec,"_actionValues",{value:actionEngine?actionEngine.values():{},writable:true,configurable:true,enumerable:false});},
      sampleEl:(el)=>rec?Studio.sampleComposition(rec,el,(e2)=>editorClock3D(e2),curSeq):null,
      clockFor:(el)=>editorClock3D(el),
      freezeAt:(t)=>freezePlayhead(t),
      getFrozen:()=>tlScrubT,
      restoreFrozen:(t)=>restoreFrozen(t),
      onGate:(text)=>msg(text)});
    new IntersectionObserver(es=>{wrapOnScreen=es[0].isIntersecting;sync3d();}).observe($("canvas-wrap"));
    $('btn-duplicate-el').onclick=()=>queueExperience(async()=>{{const b=Studio.addBlocker(rec,{layers:1});if(b){msg(b);return;}}const id=Studio.duplicateLayer(rec,selectedId);if(!id)return;selectedId=id;await saveGuarded(rec);await hydrate();render();});
    const restore=direction=>queueExperience(async()=>{const restored=await Studio.restoreHistory(rec.id,direction);if(!restored)return;rec=restored;selectedId=null;checkedIds.clear();tlScrubT=null;resetSeq();await hydrate();render();});
    const saveStateEl=$("save-state");
    function renderSaveState(){const st=rec?Studio.saveState(rec.id):{pending:0,lastSavedAt:0,lastError:null};
      if(!st.pending&&!st.lastError&&!st.lastSavedAt){saveStateEl.hidden=true;return;}saveStateEl.hidden=false;
      if(st.pending>0){saveStateEl.textContent="שומר…";saveStateEl.className="save-state saving";}
      else if(st.lastError){saveStateEl.textContent="השמירה נכשלה - לחצי לניסיון חוזר.";saveStateEl.className="save-state error";}
      else{saveStateEl.textContent="נשמר";saveStateEl.className="save-state saved";if($("msg").textContent===SAVE_FAIL_MSG)$("msg").textContent="";}}
    Studio.onSaveState(renderSaveState);
    saveStateEl.onclick=()=>{if(rec&&saveStateEl.classList.contains("error"))saveGuarded(rec);};
    Studio.installSaveGuard(window);
    $('btn-undo').onclick=()=>restore('undo');$('btn-redo').onclick=()=>restore('redo');
    $('btn-test-mode').onclick=()=>setTestMode(!testMode);
    $("btn-del-el").onclick = async () => {
      const i = rec.elements.findIndex((x) => x.id === selectedId);
      if (i < 0) return;
      const [gone] = rec.elements.splice(i, 1);
      for(const q of ActionCore.list(rec))q.actions=q.actions.filter(a=>a.layerId!==gone.id);
      for (const g of rec.elements) if (g.type === "group" && Array.isArray(g.children)) g.children = g.children.filter((cid) => cid !== gone.id);
      checkedIds.delete(gone.id);
      if (gone.assetId && !rec.elements.some(el=>el.assetId===gone.assetId)) { delete rec.assets[gone.assetId]; delete media[gone.assetId]; }
      delete textCache[gone.id];
      selectedId = null;
      await saveGuarded(rec);
      render();
    };

    // z-order
    const moveEl = (dir) => async () => {
      const i = rec.elements.findIndex((x) => x.id === selectedId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= rec.elements.length) return;
      [rec.elements[i], rec.elements[j]] = [rec.elements[j], rec.elements[i]];
      await saveGuarded(rec);
      renderList(); draw();
    };
    $("btn-group").onclick = groupChecked;
    $("btn-ungroup").onclick = ungroupSelected;
    $("btn-layer-up").onclick = moveEl(1);
    $("btn-layer-down").onclick = moveEl(-1);

    // Non-destructive image region; original embedded bytes stay unchanged.
    for(const k of ['x','y','w','h'])$('crop-'+k).onchange=()=>upd(el=>{
      const c={...(el.crop||{x:0,y:0,w:1,h:1})};c[k]=Math.max(k==='w'||k==='h'?1:0,Math.min(100,Number($('crop-'+k).value)||0))/100;
      c.w=Math.min(c.w,1-c.x);c.h=Math.min(c.h,1-c.y);
      if(Studio.validCrop({...el,crop:c}))Studio.setImageCrop(rec,el,c);else msg('החיתוך חייב להישאר בתוך התמונה ולכלול שטח');
    });
    $('crop-reset').onclick=()=>upd(el=>Studio.setImageCrop(rec,el,{x:0,y:0,w:1,h:1}));
    $('video-aspect-reset').onclick=()=>queueExperience(async()=>{
      const el=rec.elements.find(x=>x.id===selectedId);if(!el||el.type!=='video')return;
      try{const info=await Studio.inspectVideo(rec.assets[el.assetId]),c=el.crop||{w:1,h:1};el.aspect=info.width/info.height*c.w/c.h;el.h=el.w/el.aspect*(rec.target.artRect.w/rec.target.artRect.h);await saveGuarded(rec);renderPanel();draw();msg('פרופורציות הסרטון שוחזרו בלי לשנות את המקור');}catch(error){msg('לא ניתן לשחזר פרופורציות: '+error.message);}
    });
    // panel bindings
    const cur = () => rec.elements.find((x) => x.id === selectedId);
    const transform = applyBaseProp;
    const upd = (fn) => { const el = cur(); if (!el) return; fn(el); saveGuarded(rec).finally(() => { renderPanel(); draw(); renderList(); }); };
    const num = (id, min, max, fn) => { $(id).onchange = (e) => { const v = parseFloat(e.target.value); if (isNaN(v)) { renderPanel(); return; } upd((el) => fn(el, Math.max(min, Math.min(max, v)))); }; };
    // Sliders: apply live, save once per gesture (debounced, flushed on release) so a drag is
    // one undo step and does not re-read all media on every tick.
    // One drag = one undo step: the first save of a gesture records history, later saves of the
    // same gesture (timer, or a long slow drag) are noHistory. Release/switch/hide flush and close it.
    let sliderTimer = null, gestureSaved = false, sliderRec = null;
    const flushSlider = (final = true) => {
      if (sliderTimer) { clearTimeout(sliderTimer); sliderTimer = null; const r = sliderRec || rec; saveGuarded(r, gestureSaved ? { noHistory: true } : undefined).finally(() => { if (r === rec) { renderPanel(); renderList(); } }); gestureSaved = true; }
      if (final) { gestureSaved = false; sliderRec = null; }
    };
    window.__flushSlider = () => flushSlider(true);
    const updS = (fn) => { const el = cur(); if (!el) return; fn(el); draw(); sliderRec = rec; if (sliderTimer) clearTimeout(sliderTimer); sliderTimer = setTimeout(() => flushSlider(false), 600); };
    document.querySelectorAll('input[type=range]').forEach(r => r.addEventListener("change", () => flushSlider(true)));
    window.addEventListener("pagehide", () => flushSlider(true));
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushSlider(true); });
    $("sl-scale").oninput = e => updS(el => panelWrite(el, "w", parseFloat(e.target.value)));
    $("sl-rot").oninput = e => updS(el => panelWrite(el, "rot", parseFloat(e.target.value)));
    $("sl-z").oninput = e => updS(el => panelWrite(el, "z", parseFloat(e.target.value)));
    $("sl-vol").oninput = (e) => updS((el) => { el.volume = parseFloat(e.target.value); });
    $("sl-opacity").oninput = (e) => updS((el) => panelWrite(el, "opacity", parseFloat(e.target.value)));
    $("ck-loop").onchange = (e) => upd((el) => { el.loop = e.target.checked; });
    $("sel-anim").onchange = (e) => upd((el) => { el.anim = e.target.value; el.spin = el.anim === "spin"; });
    $("sel-tap").onchange = (e) => upd((el) => { el.onTap = e.target.value; });
    $("sel-seq").onchange = (e) => upd((el) => { el.seq = e.target.value || null; });
    $("sel-track").onchange = (e) => upd((el) => { el.track = e.target.value || null; });
    $("btn-tl-add").onclick = () => upd((el) => {
      el.timeline = el.timeline && Array.isArray(el.timeline.keys) ? el.timeline : { loop: false, keys: [] };
      const t = Math.max(0, Math.min(60, parseFloat($("num-tl-t").value) || 0));
      const scale = Math.max(0.1, Math.min(5, parseFloat($("num-tl-scale").value) || 1));
      Studio.addTimelineKey(el, { t, x: el.x, y: el.y, z: el.z || 0, rot: el.rot || 0, opacity: el.opacity == null ? 1 : el.opacity, scale, tap: el.onTap || "none" });
    });
    const addVisibilityKey = (visible) => upd((el) => {
      el.timeline = el.timeline && Array.isArray(el.timeline.keys) ? el.timeline : { loop: false, keys: [] };
      const t = Math.max(0, Math.min(60, parseFloat($("num-tl-t").value) || 0));
      let key = el.timeline.keys.find(k => k.t === t);
      if (!key) { key = { t }; el.timeline.keys.push(key); }
      key.visible = visible;
    });
    $("btn-tl-show").onclick = () => addVisibilityKey(true);
    $("btn-tl-hide").onclick = () => addVisibilityKey(false);
    $("ck-spatial").onchange = (e) => upd((el) => { el.spatial = e.target.checked; renderPanel(); });
    $("sel-spatial-mode").onchange = (e) => upd((el) => { el.spatialMode = e.target.value; });
    $("num-spatial-in").onchange = (e) => upd((el) => { el.spatialInner = Math.max(0.05, parseFloat(e.target.value) || 0.35); });
    $("num-spatial-out").onchange = (e) => upd((el) => { el.spatialOuter = Math.max(0.1, parseFloat(e.target.value) || 1.4); });
    $("sel-preset").onchange = (e) => upd((el) => { el.particles = Object.assign({}, el.particles, { preset: e.target.value }); });
    $("btn-psprite").onclick = () => $("file-psprite").click();
    $("file-psprite").onchange = async (e) => {
      const f = e.target.files[0]; e.target.value = "";
      if (!f) return;
      const el = rec.elements.find((x) => x.id === selectedId);
      if (!el || el.type !== "particles") return;
      const assetId = Studio.newId();
      rec.assets[assetId] = await Studio.ownBlob(f);
      el.particles = Object.assign({}, el.particles, { spriteAssetId: assetId });
      await saveGuarded(rec); renderPanel();
    };
    for(const [id,key,min,max]of [['num-plife','lifetime',0,60],['num-plife2','life2',0,60],['num-pendsize','endSize',0,5]])$(id).onchange=e=>upd(el=>{el.particles={...el.particles,[key]:Math.max(min,Math.min(max,Number(e.target.value)||0))};});
    $('sel-pemitter').onchange=e=>upd(el=>{el.particles={...el.particles,emitter:e.target.value};});
    $('in-pendcolor').onchange=e=>upd(el=>{el.particles={...el.particles,endColor:e.target.value};});
    $('ck-pfade').onchange=e=>upd(el=>{el.particles={...el.particles,fade:e.target.checked};});
    $("num-pcount").onchange = (e) => upd((el) => { el.particles = Object.assign({}, el.particles, { count: Math.max(10, Math.min(500, parseInt(e.target.value) || 120)) }); });
    $("num-psize").onchange = (e) => upd((el) => { el.particles = Object.assign({}, el.particles, { size: Math.max(2, Math.min(60, parseInt(e.target.value) || 12)) }); });
    $("num-pspeed").onchange = (e) => upd((el) => { el.particles = Object.assign({}, el.particles, { speed: Math.max(0.2, Math.min(3, parseFloat(e.target.value) || 1)) }); });
    $("in-pcolor").onchange = (e) => upd((el) => { el.particles = Object.assign({}, el.particles, { color: e.target.value }); });
    $("ck-pcolor2").onchange = (e) => upd((el) => { el.particles = Object.assign({}, el.particles); if (e.target.checked) el.particles.color2 = $("in-pcolor2").value; else delete el.particles.color2; });
    $("in-pcolor2").onchange = (e) => upd((el) => { if (!$("ck-pcolor2").checked) return; el.particles = Object.assign({}, el.particles, { color2: e.target.value }); });
    $("num-pspread").onchange = (e) => upd((el) => { el.particles = Object.assign({}, el.particles, { spread: Math.max(0.1, Math.min(2, parseFloat(e.target.value) || 1)) }); });
    $("sel-pdir-mode").onchange = (e) => upd((el) => { const mode = e.target.value, cur = el.particles && el.particles.direction; el.particles = Object.assign({}, el.particles, { direction: mode === "preset" ? null : mode === "random" ? -2 : mode === "outward" ? -3 : (Number.isInteger(cur) && cur >= 0 ? cur : 0) }); });
    $("sl-pdir").oninput = (e) => updS((el) => { el.particles = Object.assign({}, el.particles, { direction: Math.max(0, Math.min(359, parseInt(e.target.value) || 0)) }); });
    $("num-pdir").onchange = (e) => upd((el) => { el.particles = Object.assign({}, el.particles, { direction: Math.max(0, Math.min(359, parseInt(e.target.value) || 0)) }); });
    $("ck-chroma").onchange = (e) => upd((el) => { el.chroma = Object.assign({}, el.chroma, { enabled: e.target.checked }); });
    $("in-chroma-color").onchange = (e) => upd((el) => { el.chroma = Object.assign({}, el.chroma, { color: e.target.value }); });
    $("sl-chroma").onchange = (e) => upd((el) => { el.chroma = Object.assign({}, el.chroma, { threshold: parseFloat(e.target.value) }); });
    $("sel-tl-ease").onchange = (e) => upd((el) => { el.timeline = el.timeline && Array.isArray(el.timeline.keys) ? el.timeline : { loop: false, keys: [] }; el.timeline.ease = e.target.value; });
    $("num-tl-dur").onchange = (e) => upd((el) => { el.timeline = el.timeline && Array.isArray(el.timeline.keys) ? el.timeline : { loop: false, keys: [] }; const v = parseFloat(e.target.value); el.timeline.dur = v > 0 ? v : null; });
    $("ck-tl-loop").onchange = (e) => upd((el) => {
      el.timeline = el.timeline && Array.isArray(el.timeline.keys) ? el.timeline : { loop: false, keys: [] };
      el.timeline.loop = e.target.checked;
    });
    $("in-tapurl").onchange = (e) => upd((el) => { el.tapUrl = e.target.value.trim(); });
    // numeric panel
    for (const [key, min, max] of [["x",-.7,.7],["y",-.7,.7],["w",.05,2],["rot",-180,180],["z",0,.5]])
      num("num-"+key, min, max, (el,v) => panelWrite(el, key, v));
    num("num-opacity", 0, 1, (el, v) => panelWrite(el, "opacity", v));
    $("sel-model-clip").onchange=e=>upd(el=>{el.modelClip=Number(e.target.value);});
    num("num-model-clip",0,99,(el,v)=>{el.modelClip=Math.floor(v);});
    num("num-model-speed",.1,4,(el,v)=>{el.modelSpeed=v;});
    $("ck-model-playing").onchange=e=>upd(el=>{el.modelPlaying=e.target.checked;});
    $("ck-model-loop").onchange=e=>upd(el=>{el.modelLoop=e.target.checked;});
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

  function renderActions(){
    const root=$('action-editor');if(!root)return;
    if(actionTarget&&!ActionCore.list(rec).some(q=>q.actions.includes(actionTarget)))actionTarget=null;
    root.hidden=!rec.target;
    actionUI=ActionEditor.mount(root,{
      rec, selectedId, engine:actionEngine,
      changed:()=>{const id=rec.id,saving=saveGuarded(rec);actionEngine=ActionCore.create(rec);renderActions();draw();saving.then(()=>{if(rec.id===id){const hs=Studio.historyState(id);$("btn-undo").disabled=!hs.undo;$("btn-redo").disabled=!hs.redo;}});},
      redraw:()=>draw(),
      select:id=>{selectedId=id;renderList();renderPanel();draw();},
      target3d:(q,a)=>queueExperience(async()=>{await saveGuarded(rec);location.href="preview.html?edit=1&sequence="+encodeURIComponent(q.id)+"&action="+encodeURIComponent(a.id)+"#"+rec.id;}),
      target:a=>{actionTarget=a;draw();cv().scrollIntoView({block:"center",behavior:"instant"});msg("לחצי על היצירה כדי לקבוע את יעד התנועה. Escape לביטול; מיקום הבסיס לא משתנה");},
      message:msg
    });
  }
  // ---------- rendering ----------
  // Persistent safety status next to export/import (not a transient toast): shown while the open creation is over the restore limits.
  function refreshSafetyNote() { const n = $("safety-note"); if (!n || !rec) return; const w = Studio.exportWarning(rec); n.textContent = w || ""; n.hidden = !w; }
  function render() {
    refreshSafetyNote();
    const hasTarget = !!rec.target;
    $("sec-elements").hidden = !hasTarget;
    $("sec-arrange").hidden = !hasTarget;
    $("sec-preview").hidden = !hasTarget;
    sync3d();
    const th = $("artwork-thumb");
    if (artworkImg) { th.src = artworkImg.src; th.hidden = false; } else th.hidden = true;
    renderSeqTabs();
    renderActions();
    renderList();
    renderPanel();
    draw();
  }

  function renderList() {
    renderActions();
    const hs=Studio.historyState(rec.id);$('btn-undo').disabled=!hs.undo;$('btn-redo').disabled=!hs.redo;
    const ul = $("element-list");
    ul.innerHTML = "";
    $("btn-group").disabled = checkedIds.size < 2;
    $("btn-group").textContent = checkedIds.size ? "📦 קבץ (" + checkedIds.size + ")" : "📦 קבץ";
    $("btn-ungroup").disabled = !rec.elements.some((x) => x.id === selectedId && x.type === "group");
    Studio.topLevelElements(rec).forEach((el) => {
      if (!Studio.elVisibleIn(el, curSeq)) return;
      const i = rec.elements.indexOf(el);
      const li = document.createElement("li");
      if (el.type === "group") {
        li.textContent = "📦 " + el.name + " (" + (el.children || []).length + ")";
        li.className = el.id === selectedId ? "sel" : "";
        li.onclick = () => { selectedId = el.id; renderList(); renderPanel(); draw(); };
        ul.appendChild(li);
        for (const k of Studio.groupChildren(rec, el)) {
          if (!Studio.elVisibleIn(k, curSeq)) continue;
          const kl = document.createElement("li");
          kl.style.paddingRight = "22px";
          kl.textContent = "↳ " + (k.assetId && deadAssets.has(k.assetId) ? "⚠ " : "") + (ICONS[k.type] || "") + k.name;
        if (k.assetId && deadAssets.has(k.assetId)) kl.title = "הקובץ לא נקרא מהמכשיר - ייבאי אותו שוב";
          kl.className = k.id === selectedId ? "sel" : "";
          kl.onclick = () => { selectedId = k.id; renderList(); renderPanel(); draw(); };
          ul.appendChild(kl);
        }
        return;
      }
      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = checkedIds.has(el.id); cb.title = "סמן לקיבוץ";
      cb.onclick = (ev) => { ev.stopPropagation(); if (cb.checked) checkedIds.add(el.id); else checkedIds.delete(el.id); renderList(); };
      li.appendChild(cb);
      li.appendChild(document.createTextNode((el.assetId && deadAssets.has(el.assetId) ? "⚠ " : "") + (el.track ? "🎞️ " : "") + (ICONS[el.type] || "") + el.name + (i === rec.elements.length - 1 ? "  (עליון)" : i === 0 ? "  (תחתון)" : "")));
      if (el.assetId && deadAssets.has(el.assetId)) li.title = "הקובץ לא נקרא מהמכשיר - ייבאי אותו שוב";
      li.className = el.id === selectedId ? "sel" : "";
      li.onclick = () => { selectedId = el.id; renderList(); renderPanel(); draw(); };
      ul.appendChild(li);
    });
  }

  function groupChecked() {
    const kids = rec.elements.filter((el) => checkedIds.has(el.id));
    if (kids.length < 2) return;
    const cx = kids.reduce((a, k) => a + (k.x || 0), 0) / kids.length;
    const cy = kids.reduce((a, k) => a + (k.y || 0), 0) / kids.length;
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (const k of kids) {
      const kh = k.h != null ? k.h : k.w / (k.aspect || 1);
      minx = Math.min(minx, (k.x || 0) - k.w / 2); maxx = Math.max(maxx, (k.x || 0) + k.w / 2);
      miny = Math.min(miny, (k.y || 0) - kh / 2); maxy = Math.max(maxy, (k.y || 0) + kh / 2);
    }
    const n = rec.elements.filter((el) => el.type === "group").length + 1;
    const g = { id: Studio.newId(), type: "group", name: "קבוצה " + n, x: cx, y: cy,
                w: Math.max(0.05, maxx - minx), h: Math.max(0.02, maxy - miny),
                rot: 0, opacity: 1, children: kids.map((k) => k.id), seq: null, anim: "none", onTap: "none" };
    const topIdx = Math.max.apply(null, kids.map((k) => rec.elements.indexOf(k)));
    rec.elements.splice(topIdx + 1, 0, g);
    checkedIds.clear();
    selectedId = g.id;
    saveGuarded(rec).then(() => { renderList(); renderPanel(); draw(); });
  }

  function ungroupSelected() {
    const i = rec.elements.findIndex((x) => x.id === selectedId && x.type === "group");
    if (i < 0) return;
    rec.elements.splice(i, 1); // children stay as independent elements
    selectedId = null;
    saveGuarded(rec).then(() => { renderList(); renderPanel(); draw(); });
  }

  function renderPanel() {
    const el = rec.elements.find((x) => x.id === selectedId);
    $("panel").hidden = !el;
    if (!el) return;
    const isGroup = el.type === "group";
    $("row-model").hidden=el.type!=="model";
    if(el.type==='model') {
      const select=$("sel-model-clip");select.replaceChildren();select.disabled=true;
      const pending=document.createElement('option');pending.textContent='טעינת שמות...';select.append(pending);
      Studio.modelClipInfo(rec.assets[el.assetId]).then(items=>{
        if(items.length) el.clipDurations = items.map(c=>c.duration);
        const names = items.map(c=>c.name);
        if(selectedId!==el.id)return;
        select.replaceChildren();
        if(!names.length){const option=document.createElement('option');option.textContent='אין אנימציות מובנות';select.append(option);return;}
        names.forEach((name,i)=>{const option=document.createElement('option');option.value=i;option.textContent=i+' · '+name;select.append(option);});
        select.disabled=false;select.value=Math.min(names.length-1,el.modelClip||0);
      });
    }
    $("num-model-clip").value=el.modelClip||0;$("num-model-speed").value=el.modelSpeed||1;
    $("ck-model-playing").checked=el.modelPlaying!==false;$("ck-model-loop").checked=el.modelLoop!==false;
    $("panel-name").textContent = (isGroup ? "📦 " : "") + el.name + (isGroup ? " (שינויים חלים על כל הפריטים בקבוצה)" : "");
    const sv = elKeyed(el) ? Studio.sampleTimeline(el, editorClock3D(el)) : null; // panel mirrors the canvas: sampled frame when keyed
    $("sl-scale").value = sv ? el.w * (sv.scale || 1) : el.w;
    $("sl-rot").value = sv ? sv.rot || 0 : el.rot || 0;
    $("sl-z").value = sv ? sv.z || 0 : el.z || 0;
    $("sl-opacity").value = sv ? (sv.opacity == null ? 1 : sv.opacity) : el.opacity == null ? 1 : el.opacity;
    $("row-volume").hidden = el.type !== "video" && el.type !== "sound";
    $("sl-vol").value = el.volume == null ? 1 : el.volume;
    $("row-loop").hidden = el.type !== "video" && el.type !== "sound";
    $("row-spatial").hidden = el.type !== "sound";
    if (el.type !== "sound") $("row-spatial-opts").hidden = true; // was only set inside the sound branch and leaked across selections
    if (el.type === "sound") {
      $("ck-spatial").checked = !!el.spatial;
      $("row-spatial-opts").hidden = !el.spatial;
      $("sel-spatial-mode").value = el.spatialMode || "log";
      $("num-spatial-in").value = el.spatialInner > 0 ? el.spatialInner : 0.35;
      $("num-spatial-out").value = el.spatialOuter > 0 ? el.spatialOuter : 1.4;
    }
    $("sl-z").closest("label").hidden = false;
    $("num-z").closest("label").hidden = false;
    $("sel-tap").closest("label").hidden = isGroup;
    $('row-video-aspect').hidden=el.type!=='video';
    $('row-crop').hidden=!['image','video'].includes(el.type);if(['image','video'].includes(el.type)){const c=el.crop||{x:0,y:0,w:1,h:1};for(const k of ['x','y','w','h'])$('crop-'+k).value=Math.round(c[k]*10000)/100;}
    $("row-chroma").hidden = el.type !== "video";
    $("row-particles").hidden = el.type !== "particles";
    if (el.type === "particles") {
      const pc = el.particles || {};
      $('num-plife').value=pc.lifetime||0;$('num-plife2').value=pc.life2||0;$('ck-pcolor2').checked=!!pc.color2;if(pc.color2)$('in-pcolor2').value=pc.color2;$('num-pendsize').value=pc.endSize==null?1:pc.endSize;$('sel-pemitter').value=pc.emitter||'box';$('in-pendcolor').value=pc.endColor||pc.color||'#ffd94d';$('ck-pfade').checked=!!pc.fade;
      $("sel-preset").value = pc.preset || "sparkle";
      $("num-pcount").value = pc.count || 120;
      $("num-psize").value = pc.size || 12;
      $("num-pspeed").value = pc.speed || 1;
      $("in-pcolor").value = pc.color || "#ffd94d";
      $("row-psprite").hidden = (pc.preset || "sparkle") !== "custom";
      const pdirMode = pc.direction == null ? "preset" : pc.direction === -2 ? "random" : pc.direction === -3 ? "outward" : "angle";
      $("sel-pdir-mode").value = pdirMode;
      $("row-pdir").hidden = pdirMode !== "angle";
      $("sl-pdir").value = pc.direction >= 0 ? pc.direction : 0;
      $("num-pdir").value = pc.direction >= 0 ? pc.direction : 0;
      $("num-pspread").value = pc.spread != null ? pc.spread : 1;
      $("psprite-name").textContent = pc.spriteAssetId && rec.assets[pc.spriteAssetId] ? "✓ נבחרה תמונה" : "(עדיין לא נבחרה)";
    }
    if (el.type === "video") {
      $("ck-chroma").checked = !!(el.chroma && el.chroma.enabled);
      $("in-chroma-color").value = (el.chroma && el.chroma.color) || "#00ff00";
      $("sl-chroma").value = el.chroma && el.chroma.threshold != null ? el.chroma.threshold : 0.35;
    }
    $("ck-loop").checked = el.loop !== false;
    $("sel-anim").value = Studio.normEl(el).anim;
    const tapSel = $("sel-tap");
    [...tapSel.querySelectorAll("option[data-seq]")].forEach((o) => o.remove());
    for (const sq of Studio.seqList(rec)) {
      const o = document.createElement("option");
      o.value = "seq:" + sq.id; o.dataset.seq = "1";
      o.textContent = "מעבר למצב: " + (sq.name || sq.id);
      tapSel.appendChild(o);
    }
    for (const tr of Studio.trackList(rec)) {
      const o = document.createElement("option");
      o.value = "track:" + tr.id; o.dataset.seq = "1";
      o.textContent = "הפעל/עצור מסלול: " + (tr.name || tr.id);
      tapSel.appendChild(o);
    }
    for(const q of ActionCore.list(rec)){const option=document.createElement('option');option.value='action:'+q.id;option.dataset.seq='1';option.textContent='הפעלת רצף פעולות: '+q.name;tapSel.appendChild(option);}
    tapSel.value = el.onTap || "none";
    if (tapSel.value !== (el.onTap || "none")) { el.onTap = "none"; tapSel.value = "none"; }
    const tracks = Studio.trackList(rec);
    $("row-track").hidden = !tracks.length;
    if (tracks.length) {
      const tsel = $("sel-track");
      tsel.innerHTML = "";
      const none = document.createElement("option"); none.value = ""; none.textContent = "ללא (שייך למצב)"; tsel.appendChild(none);
      tracks.forEach((tr) => { const o = document.createElement("option"); o.value = tr.id; o.textContent = "🎞️ " + tr.name; tsel.appendChild(o); });
      tsel.value = el.track || "";
    }
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
    $("num-x").value = (Math.round(((sv ? sv.x : el.x) || 0) * 100) / 100).toFixed(2);
    $("num-y").value = (Math.round(((sv ? sv.y : el.y) || 0) * 100) / 100).toFixed(2);
    $("num-w").value = (Math.round((sv ? el.w * (sv.scale || 1) : el.w) * 100) / 100).toFixed(2);
    $("num-rot").value = Math.round((sv ? sv.rot : el.rot) || 0);
    $("num-z").value = (Math.round(((sv ? sv.z : el.z) || 0) * 1000) / 1000);
    $("num-opacity").value = sv ? (sv.opacity == null ? 1 : sv.opacity) : el.opacity == null ? 1 : el.opacity;
    if (typeof Editor3D !== "undefined") Editor3D.refreshGizmo();
  }

  // ---------- timeline editor ----------
  let tlScrubT = null; // null = live playback; number = frozen playhead seconds

  // The exact same clock draw() samples with, exposed for the embedded 3D workspace.
  function editorClock3D(element){
    if(!rec)return 0;
    if(tlScrubT!=null)return tlScrubT;
    if(element&&element.track){const c=canvasTracks[element.track];return c&&c.playing?(performance.now()-c.start)/1000:0;}
    return Studio.previewStateTime(rec,curSeq,(performance.now()-canvasStart)/1000);
  }

  function renderRuler(el) {
    const c = $("tl-ruler");
    const tl = el.timeline && Array.isArray(el.timeline.keys) ? el.timeline : { keys: [] };
    const span = Math.max(Math.ceil(Studio.timelineDur(el)), 2) + 1;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth || 300;
    c.width = W * dpr; c.height = 34 * dpr;
    const g = c.getContext("2d"); g.scale(dpr, dpr);
    g.clearRect(0, 0, W, 34);
    g.strokeStyle = "#c7c7cc"; g.fillStyle = "#8e8e93"; g.font = "9px sans-serif"; g.textAlign = "center";
    for (let sec = 0; sec <= span; sec++) {
      const x = (sec / span) * W;
      g.beginPath(); g.moveTo(x, 18); g.lineTo(x, 28); g.stroke();
      g.fillText(sec + "s", Math.max(10, Math.min(W - 10, x)), 10); // keep edge labels readable
    }
    g.fillStyle = "#7c5cff";
    for (const k of tl.keys) {
      const x = (k.t / span) * W;
      g.beginPath(); g.moveTo(x, 19); g.lineTo(x - 5, 29); g.lineTo(x + 5, 29); g.closePath(); g.fill();
    }
    if (tlScrubT != null) {
      const x = (tlScrubT / span) * W;
      g.strokeStyle = "#ff3b30"; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 34); g.stroke(); g.lineWidth = 1;
    }
    c.dataset.span = span;
  }

  function renderTimeline(el) {
    const wrap = $("row-timeline");
    wrap.hidden = el.type === "sound";
    if (el.type === "sound") return;
    const tl = el.timeline || { loop: false, keys: [] };
    $("ck-tl-loop").checked = !!tl.loop;
    $("sel-tl-ease").value = tl.ease || "linear";
    $("num-tl-dur").value = tl.dur > 0 ? tl.dur : "";
    $("tl-note").hidden = !tl.keys.length;
    const ul = $("tl-keys");
    ul.innerHTML = "";
    tl.keys.slice().sort((a, b) => a.t - b.t).forEach((k) => {
      const li = document.createElement("li");
      const i = el.timeline.keys.indexOf(k);
      li.textContent = "t=" + k.t + "s " + (k.visible === false ? "מוסתר " : k.visible === true ? "מוצג " : "") + (k.tap && k.tap !== "none" ? "👆 " : "");
      const del = document.createElement("button");
      del.className = "ghost danger"; del.textContent = "✕";
      del.onclick = () => upd((e2) => { e2.timeline.keys.splice(i, 1); });
      li.appendChild(del);
      ul.appendChild(li);
    });
    renderRuler(el);
  }

  // Scrubbing: drag on the ruler freezes the playhead; the canvas samples that exact time.
  (() => {
    const ruler = $("tl-ruler");
    const scrubTo = (e) => {
      const r = ruler.getBoundingClientRect();
      const span = parseFloat(ruler.dataset.span || "3");
      tlScrubT = Math.max(0, Math.min(span, ((e.clientX - r.left) / r.width) * span));
      $("tl-time").textContent = "t=" + tlScrubT.toFixed(1) + "s";
      $("btn-tl-live").hidden = false;
      const el = rec && rec.elements.find((x) => x.id === selectedId);
      if (el) renderRuler(el);
      draw();
    };
    ruler.onpointerdown = (e) => { ruler.setPointerCapture(e.pointerId); scrubTo(e); ruler.onpointermove = scrubTo; };
    ruler.onpointerup = () => { ruler.onpointermove = null; };
    $("btn-tl-live").onclick = () => {
      tlScrubT = null; $("tl-time").textContent = ""; $("btn-tl-live").hidden = true;
      const el = rec && rec.elements.find((x) => x.id === selectedId);
      if (el) { renderRuler(el); }
      draw();
    };
  })();

  // ---------- canvas preview ----------
  const cv = () => $("preview");
  let boxes = {};
  // Editing-surface layout: the artwork is shown centered with a visible workspace
  // margin around it (user request: see the space surrounding the image while editing).
  // All canvas coordinates derive from view = {W,H,mx,my} - artwork size + margin offset.
  const MARGIN_FRAC = 0.25;
  let view = { W: 0, H: 0, mx: 0, my: 0, cw: 0, ch: 0 };
  // View zoom (two-finger pinch): scales the editing view around its center without touching
  // the artwork, elements or world coordinates - pos() maps pointer events back to world px.
  let viewZoom = 1;
  const VIEW_ZOOM_MIN = 0.5, VIEW_ZOOM_MAX = 4;
  let wrapOnScreen = false;
  function sync3d() { $("view-pill").hidden = !rec || !rec.target || !wrapOnScreen; place3d(); }
  let viewMode = "2d";
  async function setViewMode(m) {
    if (viewMode === m) return;
    viewMode = m;
    $("btn-2d").classList.toggle("on", m === "2d");
    $("btn-3d").classList.toggle("on", m === "3d");
    if (m === "3d") await Editor3D.show(); else Editor3D.hide();
  }
  function place3d() {
    const b = $("view-pill"); if (b.hidden) return;
    const wb = $("canvas-wrap").getBoundingClientRect();
    const y = Math.min(wb.bottom - 8 - b.offsetHeight, innerHeight - 10 - b.offsetHeight);
    b.style.top = Math.max(y, wb.top + 8, 8) + "px";
  }
  addEventListener("scroll", place3d, { passive: true });
  addEventListener("resize", place3d);

  function draw() {
    if (!rec || !rec.target || !artworkImg) return;
    const c = cv();
    const wrap = $("canvas-wrap");
    const artW = rec.target.artRect.w, artH = rec.target.artRect.h;
    const W = Math.round((wrap.clientWidth || 320) / (1 + 2 * MARGIN_FRAC));
    const H = Math.round(W * (artH / artW));
    const mx = Math.round(W * MARGIN_FRAC), my = Math.round(H * MARGIN_FRAC);
    const cw = W + 2 * mx, ch = H + 2 * my;
    view = { W, H, mx, my, cw, ch };
    const dpr = window.devicePixelRatio || 1;
    c.width = cw * dpr; c.height = ch * dpr;
    c.style.width = cw + "px"; c.style.height = ch + "px";
    c.dataset.zoom = viewZoom.toFixed(3); // observable view-zoom level (a11y/debug/tests)
    const ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);
    if (viewZoom !== 1) { ctx.translate(cw / 2, ch / 2); ctx.scale(viewZoom, viewZoom); ctx.translate(-cw / 2, -ch / 2); }
    // surrounding workspace: neutral stage, artwork on top, hairline artwork boundary
    ctx.fillStyle = "#e6e3ee"; ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = "#fff"; ctx.fillRect(mx, my, W, H);
    ctx.drawImage(artworkImg, mx, my, W, H);
    ctx.strokeStyle = "rgba(41,37,53,0.55)"; ctx.lineWidth = 1;
    ctx.strokeRect(mx + 0.5, my + 0.5, W - 1, H - 1);
    boxes = {};
    window.__audioEnvelopes = {}; // spatial-sound envelope rings, rebuilt every frame (also the test hook)
    window.__testBoxes = boxes; // canvas hit boxes per element, rebuilt every frame (test hook)
    const t0 = performance.now();
    // autoNext chain simulation in live preview (mirrors previewer makeSeqRunner):
    // at `at` seconds into the active state, advance to `to` and restart the state clock.
    // Track clocks (canvasTracks) are independent and keep running across the switch.
    if (tlScrubT == null && curSeq) {
      const an = Studio.seqAutoNext(rec, curSeq);
      if (an && (t0 - canvasStart) / 1000 >= an.at) {
        const to = an.to || (Studio.seqList(rec)[0] && Studio.seqList(rec)[0].id);
        if (to && to !== curSeq && Studio.seqList(rec).some((x) => x.id === to)) {
          curSeq = to; canvasStart = t0; selectedId = null;
          renderSeqTabs(); renderList(); renderPanel();
        }
      }
    }
    Object.defineProperty(rec,"_actionValues",{value:actionEngine?actionEngine.values():{},writable:true,configurable:true,enumerable:false});
    let needsAnim = ActionCore.list(rec).length>0;
    for (const el of rec.elements) {
      Studio.normEl(el);
      if (el.type === "group") continue; // children draw at their own positions; the group shows as a selection box
      if (!Studio.elVisibleIn(el, curSeq)) continue;
      // live timeline playback: sampled keyframe values override the element's base props
      const parent=rec.elements.find(g=>g.type==='group'&&(g.children||[]).includes(el.id));
      const clock=element=>{
        if(tlScrubT!=null)return tlScrubT;
        if(element.track){const clock=canvasTracks[element.track];return clock&&clock.playing?(t0-clock.start)/1000:0;}
        return Studio.previewStateTime(rec,curSeq,(t0-canvasStart)/1000);
      };
      const ts=Studio.sampleComposition(rec,el,clock,curSeq);
      const trackStopped=element=>element&&element.track&&canvasTracks[element.track]&&!canvasTracks[element.track].playing;
      if(tlScrubT==null&&(trackStopped(el)||trackStopped(parent)))continue;
      if(Studio.timelineDur(el)||(parent&&Studio.timelineDur(parent)))needsAnim=tlScrubT==null;
      if(tlScrubT==null&&curSeq&&Studio.seqAutoNext(rec,curSeq))needsAnim=true; // keep frames coming so the chain can advance
      if(!ts.visible)continue;
      const sc = ts ? ts.scale : 1;
      let wpx = el.w * W * sc;
      let hpx = (el.h != null ? el.h * H : (el.w * W) / (el.aspect || 1)) * sc;
      let cx = mx + ((ts ? ts.x : el.x) + 0.5) * W;
      let cy = my + (0.5 - (ts ? ts.y : el.y)) * H;
      if(el.anim&&el.anim!=='none'||parent&&parent.anim&&parent.anim!=='none')needsAnim=tlScrubT==null;
      if (el.type === "video") needsAnim = true;
      const effRot = ts ? ts.rot : (el.rot || 0);
      boxes[el.id] = { cx, cy, w: wpx, h: hpx, rot: -effRot * Math.PI / 180 };
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-effRot * Math.PI / 180);
      ctx.globalAlpha = 0.92 * (ts ? ts.opacity : (el.opacity == null ? 1 : el.opacity));
      const m = el.assetId && media[el.assetId];
      if (el.type === "video" && m && m.readyState >= 2) {
        const c=el.crop||{x:0,y:0,w:1,h:1},iw=m.videoWidth,ih=m.videoHeight;ctx.drawImage(m,c.x*iw,c.y*ih,c.w*iw,c.h*ih,-wpx/2,-hpx/2,wpx,hpx);
      } else if (el.type === "image" && m) {
        const c=el.crop||{x:0,y:0,w:1,h:1},iw=m.naturalWidth||m.width,ih=m.naturalHeight||m.height;
        ctx.drawImage(m,c.x*iw,c.y*ih,c.w*iw,c.h*ih,-wpx/2,-hpx/2,wpx,hpx);
        if (m.tagName === "CANVAS") needsAnim = true; // animated gif canvas updates itself; keep repainting
      } else if (el.type === "text") {
        const tb = textBitmap(el);
        ctx.drawImage(tb.canvas, -wpx / 2, -hpx / 2, wpx, hpx);
      } else if (el.type === "particles") {
        ctx.beginPath(); ctx.arc(0, 0, Math.min(wpx, hpx) / 2, 0, 7);
        ctx.fillStyle = "rgba(200,150,30,0.35)"; ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.setLineDash([3, 5]); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = "#fff"; ctx.font = Math.round(Math.min(wpx, hpx) / 3) + "px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("✨", 0, 2);
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
      if (el.type === "sound" && el.spatial) {
        // envelope rings (our authoring aid - official demos show envelopes around the artwork; exact look is ours)
        const d = Studio.audioDistances(el), k = W / Studio.geom(rec).artW; // scene distance units -> canvas px
        const isSel = el.id === selectedId;
        ctx.save();
        ctx.strokeStyle = isSel ? "rgba(30,90,200,0.95)" : "rgba(30,90,200,0.4)";
        ctx.lineWidth = isSel ? 2 : 1.5;
        ctx.beginPath(); ctx.arc(cx, cy, Math.max(2, d.inner * k), 0, 7); ctx.stroke();
        ctx.setLineDash([6, 5]);
        ctx.beginPath(); ctx.arc(cx, cy, Math.max(3, d.outer * k), 0, 7); ctx.stroke();
        ctx.setLineDash([]);
        if (isSel) { ctx.fillStyle = "rgba(30,90,200,0.95)"; ctx.font = "11px sans-serif"; ctx.textAlign = "center";
          ctx.fillText(el.spatialMode === "linear" ? "מעבר לטבעת החיצונית: שקט" : "נחלש עם המרחק", cx, cy - Math.max(3, d.outer * k) - 6); }
        ctx.restore();
        window.__audioEnvelopes[el.id] = { cx, cy, rInner: Math.max(2, d.inner * k), rOuter: Math.max(3, d.outer * k), inner: d.inner, outer: d.outer };
      }
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
    const selEl = rec.elements.find((x) => x.id === selectedId);
    if (selEl && selEl.type === "group") {
      const kids = Studio.groupChildren(rec, selEl).filter((k) => boxes[k.id]);
      if (kids.length) {
        let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
        for (const k of kids) {
          const b = boxes[k.id];
          const ex=(Math.abs(b.w*Math.cos(b.rot))+Math.abs(b.h*Math.sin(b.rot)))/2;
          const ey=(Math.abs(b.w*Math.sin(b.rot))+Math.abs(b.h*Math.cos(b.rot)))/2;
          minx = Math.min(minx, b.cx-ex); maxx = Math.max(maxx, b.cx+ex);
          miny = Math.min(miny, b.cy-ey); maxy = Math.max(maxy, b.cy+ey);
        }
        boxes[selEl.id] = { cx: (minx + maxx) / 2, cy: (miny + maxy) / 2, w: maxx - minx, h: maxy - miny, rot: 0 };
        ctx.save();
        ctx.strokeStyle = "#2266ff"; ctx.setLineDash([6, 4]); ctx.lineWidth = 2;
        ctx.strokeRect(minx, miny, maxx - minx, maxy - miny);
        ctx.setLineDash([]);
        ctx.fillStyle = "#2266ff";
        ctx.fillRect(maxx - 8, maxy - 8, 16, 16);
        ctx.restore();
      }
    }
    if(actionTarget&&actionTarget.type==='move'){
      const a=actionTarget;ctx.save();ctx.strokeStyle='#ff4f00';ctx.lineWidth=3;ctx.setLineDash([6,4]);
      const x=view.mx+(a.to.x+.5)*view.W,y=view.my+(.5-a.to.y)*view.H;ctx.beginPath();ctx.arc(x,y,14,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#ff4f00';ctx.font='14px sans-serif';ctx.fillText('יעד תנועה',x+18,y);ctx.restore();
    }
    if (drag && drag.guide) { ctx.save(); ctx.strokeStyle = "#ff5fd2"; ctx.lineWidth = 1.5; ctx.beginPath(); if (drag.guide.v) { ctx.moveTo(view.mx + view.W / 2, view.my); ctx.lineTo(view.mx + view.W / 2, view.my + view.H); } if (drag.guide.h) { ctx.moveTo(view.mx, view.my + view.H / 2); ctx.lineTo(view.mx + view.W, view.my + view.H / 2); } ctx.stroke(); ctx.restore(); }
    if (typeof Editor3D !== "undefined") Editor3D.sync();
    if (needsAnim) requestAnimationFrame(draw);
  }

  function bindCanvas() {
    const c = cv();
    window.addEventListener('keydown',e=>{if(e.key==='Escape'&&actionTarget){actionTarget=null;draw();msg('בחירת היעד בוטלה');}});
    const pos = (e) => {
      const r = c.getBoundingClientRect();
      let x = e.clientX - r.left, y = e.clientY - r.top;
      if (viewZoom !== 1) { x = r.width / 2 + (x - r.width / 2) / viewZoom; y = r.height / 2 + (y - r.height / 2) / viewZoom; }
      return { x, y };
    };
    // Two-finger pinch zooms the editing view: the second finger cancels any element drag
    // (persisting what landed so far) and takes over until a finger lifts.
    const pinchPtrs = new Map(); // pointerId -> client coords
    let pinch2d = null;          // {d0, zoom0}
    const pinchStart = (e) => {
      // A two-finger gesture must never edit the scene: roll back whatever the first finger's
      // drag moved (base props or a just-created key) before it can persist, then zoom.
      if (drag) {
        const d = drag; drag = null;
        if (d.snap) {
          rec.elements = JSON.parse(d.snap);
          restoreFrozen(d.snapT);
          renderPanel(); renderList();
        }
      }
      const [a, b] = [...pinchPtrs.values()];
      pinch2d = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom0: viewZoom };
      try { c.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    };
    const pinchMove = () => {
      const [a, b] = [...pinchPtrs.values()];
      const d1 = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const z = Math.max(VIEW_ZOOM_MIN, Math.min(VIEW_ZOOM_MAX, pinch2d.zoom0 * d1 / pinch2d.d0));
      if (z !== viewZoom) { viewZoom = z; draw(); }
    };
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
      pinchPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinchPtrs.size === 2) { pinchStart(e); return; }
      const p = pos(e);
      if (testMode) { handleTestTap(p, hit); return; } // test mode: taps drive the experience; no select/drag
      if(actionTarget){
        const a=actionTarget,layer=rec.elements.find(el=>el.id===a.layerId);
        if(layer&&a.type==='move'){
          a.to.x=Math.round(((p.x-view.mx)/view.W-.5)*1000)/1000;
          a.to.y=Math.round((.5-(p.y-view.my)/view.H)*1000)/1000;
          actionTarget=null;saveGuarded(rec).then(()=>{renderActions();draw();});msg('יעד התנועה עודכן; מיקום הבסיס לא שונה');
        }return;
      }
      const sel = rec.elements.find((x) => x.id === selectedId);
      if (sel && boxes[sel.id]) {
        const b = boxes[sel.id];
        const hx = b.cx + Math.cos(b.rot) * (b.w / 2) - Math.sin(b.rot) * (b.h / 2);
        const hy = b.cy + Math.sin(b.rot) * (b.w / 2) + Math.cos(b.rot) * (b.h / 2);
        if (Math.hypot(p.x - hx, p.y - hy) < 24) {
          const preT = tlScrubT, keyT = prepare2DKeyedDrag(sel, "scale");
          if (typeof keyT === "string") { msg(keyT); return; }
          drag = { mode: "scale", id: sel.id, start: p, origW: sel.w, cx: b.cx, cy: b.cy, snap: JSON.stringify(rec.elements), snapT: preT };
          if (sel.type === "group") drag.gorigs = Studio.groupChildren(rec, sel).map((k) => ({ id: k.id, w: k.w, h: k.h, x: k.x || 0, y: k.y || 0 }));
          if (keyT != null) { drag.keyT = keyT; drag.s0 = Studio.sampleTimeline(sel, editorClock3D(sel)).scale; }
          c.setPointerCapture(e.pointerId); return;
        }
      }
      if (sel && sel.type === "sound" && sel.spatial && window.__audioEnvelopes && window.__audioEnvelopes[sel.id]) {
        const env = window.__audioEnvelopes[sel.id], dp = Math.hypot(p.x - env.cx, p.y - env.cy);
        const nearIn = Math.abs(dp - env.rInner) < 9, nearOut = Math.abs(dp - env.rOuter) < 9;
        if (nearIn || nearOut) {
          const mode = nearIn && (!nearOut || Math.abs(dp - env.rInner) <= Math.abs(dp - env.rOuter)) ? "env-in" : "env-out";
          drag = { mode, id: sel.id, cx: env.cx, cy: env.cy, snap: JSON.stringify(rec.elements) };
          c.setPointerCapture(e.pointerId); return;
        }
      }
      if (sel && sel.type === "group" && boxes[sel.id]) {
        const b = boxes[sel.id];
        if (Math.abs(p.x - b.cx) <= b.w / 2 && Math.abs(p.y - b.cy) <= b.h / 2) {
          const preT = tlScrubT, keyT = prepare2DKeyedDrag(sel, "gmove");
          if (typeof keyT === "string") { msg(keyT); return; }
          drag = { mode: "gmove", id: sel.id, start: p, origGX: sel.x || 0, origGY: sel.y || 0,
                   origs: Studio.groupChildren(rec, sel).map((k) => ({ id: k.id, x: k.x || 0, y: k.y || 0 })), snap: JSON.stringify(rec.elements), snapT: preT };
          c.setPointerCapture(e.pointerId); return;
        }
      }
      const el = hit(p);
      if (el) {
        selectedId = el.id; renderList(); renderPanel();
        const preT = tlScrubT, keyT = prepare2DKeyedDrag(el, "move");
        if (typeof keyT === "string") { msg(keyT); draw(); return; }
        drag = { mode: "move", id: el.id, start: p, origX: el.x, origY: el.y, snap: JSON.stringify(rec.elements), snapT: preT };
        if (keyT != null) {
          drag.keyT = keyT;
          const s0 = Studio.sampleTimeline(el, editorClock3D(el));
          drag.origX = s0.x; drag.origY = s0.y; // start from the sampled frame, not base - no jump
        }
        c.setPointerCapture(e.pointerId);
        draw();
      } else if (selectedId) { selectedId = null; renderList(); renderPanel(); draw(); }
    });
    c.addEventListener("pointermove", (e) => {
      if (pinchPtrs.has(e.pointerId)) pinchPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch2d) { if (pinchPtrs.size >= 2) pinchMove(); e.preventDefault(); return; }
      if (!drag) return;
      const p = pos(e);
      const el = rec.elements.find((x) => x.id === drag.id);
      if (!el) return;
      const W = view.W, H = view.H;
      if (drag.mode === "gmove") {
        const dx = (p.x - drag.start.x) / W, dy = -(p.y - drag.start.y) / H;
        Studio.transformGroup(rec, el, {
          x: Math.max(-.7, Math.min(.7, drag.origGX + dx)),
          y: Math.max(-.7, Math.min(.7, drag.origGY + dy))
        });
      } else if (drag.mode === "move") {
        let nx = Math.max(-0.7, Math.min(0.7, drag.origX + (p.x - drag.start.x) / W));
        let ny = Math.max(-0.7, Math.min(0.7, drag.origY - (p.y - drag.start.y) / H));
        // centre-line snap (mock interaction): pulls to the artwork centre lines within ~1.8% / 1.4% of the artwork; off via the checkbox or Alt
        drag.guide = null;
        const snapOn = $("ck-snap") ? $("ck-snap").checked : true;
        if (snapOn && !e.altKey) { const g = {}; if (Math.abs(nx) < 0.018) { nx = 0; g.v = true; } if (Math.abs(ny) < 0.014) { ny = 0; g.h = true; } if (g.v || g.h) drag.guide = g; }
        if (drag.keyT != null) { const k = keyAtT(el, drag.keyT); k.x = nx; k.y = ny; }
        else { el.x = nx; el.y = ny; }
      } else if (drag.mode === "env-out" || drag.mode === "env-in") {
        const k = W / Studio.geom(rec).artW; // canvas px -> scene distance units
        const dScene = Math.hypot(p.x - drag.cx, p.y - drag.cy) / k;
        const dd = Studio.audioDistances(el);
        if (drag.mode === "env-out") el.spatialOuter = Math.max(dd.inner + .01, Math.min(20, dScene));
        else el.spatialInner = Math.max(.05, Math.min(Math.min(5, dd.outer - .01), dScene));
      } else {
        const d0 = Math.hypot(drag.start.x - drag.cx, drag.start.y - drag.cy) || 1;
        const d1 = Math.hypot(p.x - drag.cx, p.y - drag.cy);
        if (drag.keyT != null) { keyAtT(el, drag.keyT).scale = Math.max(.05, Math.min(4, (drag.s0 || 1) * (d1 / d0))); }
        else {
          const w = Math.max(.05, Math.min(2, drag.origW * (d1 / d0)));
          if (el.type === "group") Studio.transformGroup(rec, el, {w});
          else { const f = w / el.w; el.w = w; if (el.h != null) el.h = Math.max(.02,el.h*f); }
        }

      }
      draw();
      renderPanel();
    });
    const end = async (e) => { if (e && pinchPtrs.has(e.pointerId)) { pinchPtrs.delete(e.pointerId); if (pinch2d && pinchPtrs.size < 2) pinch2d = null; } if (drag) { const d = drag; drag = null; if (d.guide) draw(); await saveGuarded(rec); if (d.keyT != null) { const el = rec.elements.find((x) => x.id === d.id); if (el && el.id === selectedId) renderRuler(el); draw(); } } };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
  }

  window.addEventListener("resize", draw);
  boot().catch((e) => { console.error(e); msg("שגיאה בטעינה: " + e.message); });
})();
