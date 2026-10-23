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
  const checkedIds = new Set(); // multi-select for grouping
  let curSeq = null;           // active sequence-state id (null = single-state artwork)
  const media = {};            // assetId -> HTMLImageElement | HTMLVideoElement (for canvas drawing)
  const textCache = {};        // el.id -> {key, canvas, aspect}
  let artworkImg = null;       // HTMLImageElement of artwork
  let drag = null;

  const ICONS = { video: "🎬 ", image: "🖼️ ", sound: "🎵 ", text: "🔤 ", model: "🧊 ", particles: "✨ ", group: "📦 " };

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
    { // parallel overlay tracks: independent mini-timelines that run at the same time as states
      let trow = document.createElement("div");
      trow.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px;font-size:12px;color:#aab;border-top:1px solid #333;padding-top:6px";
      trow.appendChild(document.createTextNode("מסלולים במקביל:"));
      const tracks = Studio.trackList(rec);
      tracks.forEach((tr) => {
        const chip = document.createElement("span");
        chip.style.cssText = "display:inline-flex;align-items:center;gap:4px;background:#223;padding:2px 8px;border-radius:999px";
        chip.appendChild(document.createTextNode("🎞️ " + tr.name));
        const as = document.createElement("input");
        as.type = "checkbox"; as.checked = !!tr.autoStart; as.title = "מתחיל אוטומטית";
        as.onchange = async () => { tr.autoStart = as.checked; await Studio.save(rec); };
        chip.appendChild(as);
        const lp = document.createElement("input");
        lp.type = "checkbox"; lp.checked = !!tr.loop; lp.title = "חזרה";
        lp.onchange = async () => { tr.loop = lp.checked; await Studio.save(rec); };
        chip.appendChild(lp);
        const del = document.createElement("button");
        del.textContent = "×"; del.title = "מחיקת המסלול";
        del.onclick = async () => {
          rec.tracks = tracks.filter((x) => x.id !== tr.id);
          for (const el of rec.elements) if (el.track === tr.id) el.track = null;
          await Studio.save(rec); renderSeqTabs(); renderList(); renderPanel();
        };
        chip.appendChild(del);
        trow.appendChild(chip);
      });
      if (tracks.length < 4) {
        const add = document.createElement("button");
        add.className = "seq-add"; add.textContent = "+ מסלול";
        add.onclick = async () => {
          rec.tracks = tracks.concat([{ id: Studio.newId(), name: "מסלול " + (tracks.length + 1), loop: true, autoStart: true }]);
          await Studio.save(rec); renderSeqTabs(); renderPanel();
        };
        trow.appendChild(add);
      }
      bar.appendChild(trow);
    }
    { // per-state settings: loop + auto-advance chaining
      const sq = seqs.find((x) => x.id === curSeq);
      if (sq) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px;font-size:12px;color:#aab";
        const loopL = document.createElement("label");
        loopL.style.cssText = "display:flex;align-items:center;gap:4px";
        const loopC = document.createElement("input");
        loopC.type = "checkbox"; loopC.checked = !!sq.loop;
        loopC.onchange = async () => { sq.loop = loopC.checked; await Studio.save(rec); };
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
          await Studio.save(rec);
        };
        at.onchange = async () => { if (sq.autoNext) { sq.autoNext.at = Math.max(0.5, Number(at.value) || 3); await Studio.save(rec); } };
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
        const mm = await Studio.makeImageMedia(rec.assets[el.assetId], "m-" + el.id, null);
        media[el.assetId] = (mm.animated || mm.staticFallback) ? mm.node : await Studio.loadImage(durl);
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
      const q = Studio.assessTargetQuality(img);
      if (q.warn && q.reason === "small") msg("נשמרה. שימי לב: התמונה קטנה (מתחת ל-480 פיקסלים בצד הקצר) - הזיהוי עלול להיות חלש. עדיפה תמונה גדולה וחדה.");
      else if (q.warn) msg("נשמרה. שימי לב: לתמונה מעט פרטים או ניגודיות - הזיהוי עלול להיות חלש. עדיפה תמונה עם הרבה פרטים.");
      else msg("תמונת היצירה נשמרה.");
      render();
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
    const importAsset = async (kind, f, options = {}) => {
      if (!f) return;
      let importNote = "";
      if (f.size > 20 * 1024 * 1024) { msg("קובץ גדול מדי (מעל 20MB) לגרסת הניסוי."); return; }
      if (kind === "video" && (/\.mov$/i.test(f.name) || f.type === "video/quicktime")) {
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
          importNote = "MOV הומר ל־MP4 ונוסף. נשמר רק במכשיר; המקור אינו משתנה.";
        } catch (err) { msg("ההמרה לא הושלמה: " + err.message); return; }
      }
      if (kind === "model") {
        const magic = new Uint8Array(await f.slice(0, 4).arrayBuffer());
        if (magic[0] === 0x50 && magic[1] === 0x4B) {
          try {
            const packed = window.gltfZipToGlb(new Uint8Array(await f.arrayBuffer()), fflate);
            f = new File([packed.bytes], packed.name, { type: "model/gltf-binary" });
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
      const assetId = Studio.newId();
      rec.assets[assetId] = f;
      const artRatio = rec.target.artRect.w / rec.target.artRect.h;
      const el = Studio.normEl({ id: Studio.newId(), type: kind, name: { video: "סרטון", image: "תמונה", sound: "צליל", model: "מודל 3D" }[kind] + " " + (rec.elements.filter((x) => x.type === kind).length + 1),
                   assetId, x: 0, y: 0, w: kind === "video" ? 1.0 : 0.3, h: null, rot: 0, z: kind === "image" ? 0.1 : 0.01, seq: curSeq });
      if (kind === "video" || kind === "sound") { el.volume = kind === "sound" ? 0.8 : 1; el.loop = true; }
      if (kind === "model") { el.w = 0.4; el.z = 0.2; el.aspect = 1; }
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
        el.aspect = await new Promise((res) => { v.onloadedmetadata = () => res(v.videoWidth / v.videoHeight || 9 / 16); v.onerror = () => res(9 / 16); });
        el.h = 1.0;
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
      await Studio.save(rec);
      msg(importNote || "האלמנט נוסף. אפשר לגרור אותו על התצוגה.");
      render();
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
      const el = Studio.normEl({ id: Studio.newId(), type: "particles", name: "חלקיקים " + (rec.elements.filter((x) => x.type === "particles").length + 1),
                   x: 0, y: 0, w: 0.6, h: 0.6, rot: 0, z: 0.12, seq: curSeq, particles: { preset: "sparkle", count: 120, color: "#ffd94d" } });
      rec.elements.push(el);
      selectedId = el.id;
      await Studio.save(rec);
      msg("נוספו חלקיקים. בחרי סגנון בלוח למטה.");
      render();
    };

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
      const r = await Studio.load(e.target.value);
      if (!r) return; // keep the current experience instead of wiping the editor
      rec = r;
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

    $("in-server").value = localStorage.getItem("ar-studio-server") || "";
    $("in-server").onchange = (e) => localStorage.setItem("ar-studio-server", e.target.value.trim());
    $("in-token").value = localStorage.getItem("ar-studio-token") || "";
    $("in-token").onchange = (e) => localStorage.setItem("ar-studio-token", e.target.value.trim());
    $("btn-publish").onclick = async () => {
      const base = ($("in-server").value || "").trim().replace(/\/+$/, "");
      if (!base) { msg("כדי לפרסם צריך שרת קטן שמחזיק את הקישורים. כרגע אפשר לייצא לקובץ ולשתף ידנית."); return; }
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
    $("btn-edit-ar").onclick = () => { location.href = "play.html?edit=1#" + rec.id; };
    $("btn-play").onclick = () => { location.href = "play.html#" + rec.id; };
    $("btn-preview3d").onclick = () => { location.href = "preview.html#" + rec.id; };
    $("btn-del-el").onclick = async () => {
      const i = rec.elements.findIndex((x) => x.id === selectedId);
      if (i < 0) return;
      const [gone] = rec.elements.splice(i, 1);
      for (const g of rec.elements) if (g.type === "group" && Array.isArray(g.children)) g.children = g.children.filter((cid) => cid !== gone.id);
      checkedIds.delete(gone.id);
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
    $("btn-group").onclick = groupChecked;
    $("btn-ungroup").onclick = ungroupSelected;
    $("btn-layer-up").onclick = moveEl(1);
    $("btn-layer-down").onclick = moveEl(-1);

    // panel bindings
    const cur = () => rec.elements.find((x) => x.id === selectedId);
    const upd = async (fn) => { const el = cur(); if (!el) return; fn(el); await Studio.save(rec); renderPanel(); draw(); renderList(); };
    const num = (id, min, max, fn) => { $(id).onchange = (e) => { const v = parseFloat(e.target.value); if (isNaN(v)) { renderPanel(); return; } upd((el) => fn(el, Math.max(min, Math.min(max, v)))); }; };
    $("sl-scale").oninput = (e) => upd((el) => { const f = parseFloat(e.target.value) / el.w; el.w = parseFloat(e.target.value); if (el.h != null) el.h = Math.max(0.02, el.h * f); if (el.type === "group") groupScale(el, f); });
    $("sl-rot").oninput = (e) => upd((el) => {
      const v = parseFloat(e.target.value);
      if (el.type === "group") { const d = v - (el.rot || 0); el.rot = v; for (const k of Studio.groupChildren(rec, el)) k.rot = (k.rot || 0) + d; }
      else el.rot = v;
    });
    $("sl-z").oninput = (e) => upd((el) => { el.z = parseFloat(e.target.value); });
    $("sl-vol").oninput = (e) => upd((el) => { el.volume = parseFloat(e.target.value); });
    $("sl-opacity").oninput = (e) => upd((el) => { el.opacity = parseFloat(e.target.value); });
    $("ck-loop").onchange = (e) => upd((el) => { el.loop = e.target.checked; });
    $("sel-anim").onchange = (e) => upd((el) => { el.anim = e.target.value; el.spin = el.anim === "spin"; });
    $("sel-tap").onchange = (e) => upd((el) => { el.onTap = e.target.value; });
    $("sel-seq").onchange = (e) => upd((el) => { el.seq = e.target.value || null; });
    $("sel-track").onchange = (e) => upd((el) => { el.track = e.target.value || null; });
    $("btn-tl-add").onclick = () => upd((el) => {
      el.timeline = el.timeline && Array.isArray(el.timeline.keys) ? el.timeline : { loop: false, keys: [] };
      const t = Math.max(0, Math.min(60, parseFloat($("num-tl-t").value) || 0));
      const scale = Math.max(0.1, Math.min(5, parseFloat($("num-tl-scale").value) || 1));
      el.timeline.keys.push({ t, x: el.x, y: el.y, z: el.z || 0, rot: el.rot || 0, opacity: el.opacity == null ? 1 : el.opacity, scale, tap: el.onTap || "none" });
    });
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
      rec.assets[assetId] = f;
      el.particles = Object.assign({}, el.particles, { spriteAssetId: assetId });
      await Studio.save(rec); renderPanel();
    };
    $("num-pcount").onchange = (e) => upd((el) => { el.particles = Object.assign({}, el.particles, { count: Math.max(10, Math.min(500, parseInt(e.target.value) || 120)) }); });
    $("num-psize").onchange = (e) => upd((el) => { el.particles = Object.assign({}, el.particles, { size: Math.max(2, Math.min(60, parseInt(e.target.value) || 12)) }); });
    $("num-pspeed").onchange = (e) => upd((el) => { el.particles = Object.assign({}, el.particles, { speed: Math.max(0.2, Math.min(3, parseFloat(e.target.value) || 1)) }); });
    $("in-pcolor").onchange = (e) => upd((el) => { el.particles = Object.assign({}, el.particles, { color: e.target.value }); });
    $("ck-pdir-auto").onchange = (e) => upd((el) => { el.particles = Object.assign({}, el.particles, { direction: e.target.checked ? null : (el.particles && el.particles.direction != null ? el.particles.direction : 0) }); });
    $("sl-pdir").oninput = (e) => upd((el) => { el.particles = Object.assign({}, el.particles, { direction: Math.max(0, Math.min(359, parseInt(e.target.value) || 0)) }); });
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
    num("num-x", -0.7, 0.7, (el, v) => { if (el.type === "group") { const d = v - (el.x || 0); el.x = v; for (const k of Studio.groupChildren(rec, el)) k.x = (k.x || 0) + d; } else el.x = v; });
    num("num-y", -0.7, 0.7, (el, v) => { if (el.type === "group") { const d = v - (el.y || 0); el.y = v; for (const k of Studio.groupChildren(rec, el)) k.y = (k.y || 0) + d; } else el.y = v; });
    num("num-w", 0.05, 2, (el, v) => { const f = v / el.w; el.w = v; if (el.h != null) el.h = Math.max(0.02, el.h * f); if (el.type === "group") groupScale(el, f); });
    num("num-rot", -180, 180, (el, v) => { if (el.type === "group") { const d = v - (el.rot || 0); el.rot = v; for (const k of Studio.groupChildren(rec, el)) k.rot = (k.rot || 0) + d; } else el.rot = v; });
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
          kl.textContent = "↳ " + (ICONS[k.type] || "") + k.name;
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
      li.appendChild(document.createTextNode((el.track ? "🎞️ " : "") + (ICONS[el.type] || "") + el.name + (i === rec.elements.length - 1 ? "  (עליון)" : i === 0 ? "  (תחתון)" : "")));
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
    Studio.save(rec).then(() => { renderList(); renderPanel(); draw(); });
  }

  function ungroupSelected() {
    const i = rec.elements.findIndex((x) => x.id === selectedId && x.type === "group");
    if (i < 0) return;
    rec.elements.splice(i, 1); // children stay as independent elements
    selectedId = null;
    Studio.save(rec).then(() => { renderList(); renderPanel(); draw(); });
  }

  function groupScale(g, f) {
    for (const k of Studio.groupChildren(rec, g)) {
      k.w = Math.max(0.05, k.w * f);
      if (k.h != null) k.h = Math.max(0.02, k.h * f);
      k.x = (g.x || 0) + ((k.x || 0) - (g.x || 0)) * f;
      k.y = (g.y || 0) + ((k.y || 0) - (g.y || 0)) * f;
    }
  }

  function renderPanel() {
    const el = rec.elements.find((x) => x.id === selectedId);
    $("panel").hidden = !el;
    if (!el) return;
    const isGroup = el.type === "group";
    $("panel-name").textContent = (isGroup ? "📦 " : "") + el.name + (isGroup ? " (שינויים חלים על כל הפריטים בקבוצה)" : "");
    $("sl-scale").value = el.w;
    $("sl-rot").value = el.rot || 0;
    $("sl-z").value = el.z || 0;
    $("sl-opacity").value = el.opacity == null ? 1 : el.opacity;
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
    $("sl-z").closest("label").hidden = isGroup;
    $("num-z").closest("label").hidden = isGroup;
    $("sel-tap").closest("label").hidden = isGroup;
    $("row-chroma").hidden = el.type !== "video";
    $("row-particles").hidden = el.type !== "particles";
    if (el.type === "particles") {
      const pc = el.particles || {};
      $("sel-preset").value = pc.preset || "sparkle";
      $("num-pcount").value = pc.count || 120;
      $("num-psize").value = pc.size || 12;
      $("num-pspeed").value = pc.speed || 1;
      $("in-pcolor").value = pc.color || "#ffd94d";
      $("row-psprite").hidden = (pc.preset || "sparkle") !== "custom";
      $("ck-pdir-auto").checked = pc.direction == null;
      $("row-pdir").hidden = pc.direction == null;
      $("sl-pdir").value = pc.direction != null ? pc.direction : 0;
      $("num-pdir").value = pc.direction != null ? pc.direction : 0;
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
    $("num-x").value = (Math.round((el.x || 0) * 100) / 100).toFixed(2);
    $("num-y").value = (Math.round((el.y || 0) * 100) / 100).toFixed(2);
    $("num-w").value = (Math.round(el.w * 100) / 100).toFixed(2);
    $("num-rot").value = Math.round(el.rot || 0);
    $("num-z").value = (Math.round((el.z || 0) * 1000) / 1000);
    $("num-opacity").value = el.opacity == null ? 1 : el.opacity;
  }

  // ---------- timeline editor ----------
  let tlScrubT = null; // null = live playback; number = frozen playhead seconds

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
      li.textContent = "t=" + k.t + "s " + (k.tap && k.tap !== "none" ? "👆 " : "");
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
    };
  })();

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
      if (el.type === "group") continue; // children draw at their own positions; the group shows as a selection box
      if (!Studio.elVisibleIn(el, curSeq)) continue;
      // live timeline playback: sampled keyframe values override the element's base props
      let ts = null;
      if (Studio.timelineDur(el)) { ts = Studio.sampleTimeline(el, tlScrubT != null ? tlScrubT : t0 / 1000); needsAnim = tlScrubT == null; }
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
          minx = Math.min(minx, b.cx - b.w / 2); maxx = Math.max(maxx, b.cx + b.w / 2);
          miny = Math.min(miny, b.cy - b.h / 2); maxy = Math.max(maxy, b.cy + b.h / 2);
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
          if (sel.type === "group") drag.gorigs = Studio.groupChildren(rec, sel).map((k) => ({ id: k.id, w: k.w, h: k.h, x: k.x || 0, y: k.y || 0 }));
          c.setPointerCapture(e.pointerId); return;
        }
      }
      if (sel && sel.type === "group" && boxes[sel.id]) {
        const b = boxes[sel.id];
        if (Math.abs(p.x - b.cx) <= b.w / 2 && Math.abs(p.y - b.cy) <= b.h / 2) {
          drag = { mode: "gmove", id: sel.id, start: p, origGX: sel.x || 0, origGY: sel.y || 0,
                   origs: Studio.groupChildren(rec, sel).map((k) => ({ id: k.id, x: k.x || 0, y: k.y || 0 })) };
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
      if (drag.mode === "gmove") {
        const dx = (p.x - drag.start.x) / W, dy = -(p.y - drag.start.y) / H;
        el.x = Math.max(-0.7, Math.min(0.7, drag.origGX + dx));
        el.y = Math.max(-0.7, Math.min(0.7, drag.origGY + dy));
        const adx = el.x - drag.origGX, ady = el.y - drag.origGY;
        for (const o of drag.origs) {
          const k = rec.elements.find((x) => x.id === o.id); if (!k) continue;
          k.x = o.x + adx; k.y = o.y + ady;
        }
      } else if (drag.mode === "move") {
        el.x = Math.max(-0.7, Math.min(0.7, drag.origX + (p.x - drag.start.x) / W));
        el.y = Math.max(-0.7, Math.min(0.7, drag.origY - (p.y - drag.start.y) / H));
      } else {
        const d0 = Math.hypot(drag.start.x - drag.cx, drag.start.y - drag.cy) || 1;
        const d1 = Math.hypot(p.x - drag.cx, p.y - drag.cy);
        const f = Math.max(0.05, Math.min(2, drag.origW * (d1 / d0))) / el.w;
        el.w = Math.max(0.05, Math.min(2, drag.origW * (d1 / d0)));
        if (el.h != null) el.h = Math.max(0.02, el.h * f);
        if (drag.gorigs) {
          const F = el.w / drag.origW;
          for (const o of drag.gorigs) {
            const k = rec.elements.find((x) => x.id === o.id); if (!k) continue;
            k.w = Math.max(0.05, o.w * F);
            if (o.h != null) k.h = Math.max(0.02, o.h * F);
            k.x = el.x + (o.x - el.x) * F; k.y = el.y + (o.y - el.y) * F;
          }
        }
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
