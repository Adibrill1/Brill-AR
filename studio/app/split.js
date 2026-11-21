"use strict";
/* "פירוק לשכבות": a picture (the artwork itself, or one from the device) is cut into layers that stand one in front of
   the other in depth - automatically by how near each part looks, and element by element with a tap. The result is
   plain picture layers in one group, which she can then move, change and animate like any other. */
window.SplitSheet = (() => {
  const { h, icon, toast } = UI;
  const TINTS = ["#4f8cff", "#2fd1a5", "#ffc145", "#ff6f91", "#b58cff", "#5fe0ff"];
  const CUT_TINT = "#ffffff";

  const artRatio = () => { const g = Studio.geom(App.rec); return g.artW / g.artH; };
  const loadImg = (blob) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("image")); im.src = URL.createObjectURL(blob); });
  const toBlob = (c) => new Promise((res) => c.toBlob(res, "image/png"));
  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

  // which picture: the artwork, or one from the device
  function open() {
    if (!App.rec) return;
    const art = App.rec.assets && App.rec.assets.__artwork;
    const fromDevice = async () => { const f = await UI.pickFile("image/png,image/jpeg,image/webp"); if (f) start(f, false); };
    if (!art) return fromDevice();
    const tile = (id, name, hint, ic, run) => h("button.add-tile", { type: "button", data: { split: id }, onclick: () => { d.close(); run(); } },
      h("span.add-ic", icon(ic, 24)), h("span.add-name", name), h("span.add-hint", hint));
    const d = UI.dialog({ title: "איזו תמונה לפרק?", sheet: true, body: [h("div.add-grid",
      tile("art", "תמונת היצירה", "השכבות יעמדו מעל היצירה עצמה", "image", () => start(art, true)),
      tile("own", "תמונה מהמכשיר", "תמונה אחרת, שתעמוד על היצירה", "upload", fromDevice))] });
  }

  async function start(blob, isArt) {
    let img;
    try { img = await loadImg(blob); } catch (e) { return toast("התמונה לא נקראה", { kind: "error" }); }
    const st = { n: 4, spread: 0.15, depth: null, cuts: [], seg: null, segBusy: false, tapping: false, points: [], masks: null, pick: 0, show: true, closed: false };

    // the picture with its layers coloured over it
    const view = h("canvas.split-canvas", { "aria-label": "התמונה והשכבות שלה" });
    const shown = Splitter.canvasOf(img, 720); view.width = shown.width; view.height = shown.height;
    const status = h("p.split-status", { role: "status" }, "מכינה את הפירוק…");
    function paint() {
      const g = view.getContext("2d"), W = view.width, H = view.height;
      g.clearRect(0, 0, W, H); g.drawImage(shown, 0, 0);
      if (!st.depth) return;
      const id = g.getImageData(0, 0, W, H), lab = Splitter.labels(st.depth, st.n);
      const tint = TINTS.map(hex), cuts = st.cuts.map((c) => c.mask), cand = st.masks && st.masks[st.pick];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const at = (m) => m.data[Math.min(m.h - 1, Math.floor(y * m.h / H)) * m.w + Math.min(m.w - 1, Math.floor(x * m.w / W))];
        let c = null, a = 0;
        if (cand && at(cand) > 127) { c = [255, 255, 255]; a = 0.55; }
        else if (cuts.some((m) => at(m) > 127)) { c = hex(CUT_TINT); a = st.show ? 0.35 : 0; }
        else if (st.show) { c = tint[at(lab) % tint.length]; a = 0.32; }
        if (c && a) { id.data[i] += (c[0] - id.data[i]) * a; id.data[i + 1] += (c[1] - id.data[i + 1]) * a; id.data[i + 2] += (c[2] - id.data[i + 2]) * a; }
      }
      g.putImageData(id, 0, 0);
      if (cand) for (const p of st.points) { g.beginPath(); g.arc(p.x * W, p.y * H, 7, 0, Math.PI * 2); g.fillStyle = p.keep === false ? "#ff5a5a" : "#3dd68c"; g.fill(); g.lineWidth = 2; g.strokeStyle = "#fff"; g.stroke(); }
    }

    // controls
    const count = UI.slider({ label: "מספר שכבות", min: 2, max: 6, step: 1, get: () => st.n, set: (v) => { st.n = Math.round(v); if (st.depth && !st.tapping) status.textContent = ready(); paint(); } });
    const depthS = UI.slider({ label: "עומק", min: 0.05, max: 0.6, step: 0.01, scale: 100, get: () => st.spread, set: (v) => { st.spread = v; } });
    const showT = UI.toggle({ label: "לצבוע את השכבות", hint: "רק כאן, לא ביצירה", get: () => st.show, set: (v) => { st.show = v; paint(); } });
    const cutList = h("div.chips.wrap.split-cuts");
    const sizes = UI.chips({ label: "גודל הגזירה", wrap: true, options: [{ id: "0", name: "חלק" }, { id: "1", name: "אלמנט" }, { id: "2", name: "יותר" }], get: () => String(st.order ? st.order.indexOf(st.pick) : 0),
      set: (v) => { if (st.order) { st.pick = st.order[+v]; paint(); } } });
    const keepC = UI.chips({ label: "נגיעה נוספת", wrap: true, options: [{ id: "add", name: "מוסיפה" }, { id: "remove", name: "מורידה" }], get: () => (st.remove ? "remove" : "add"), set: (v) => { st.remove = v === "remove"; } });
    const cutBtn = UI.button("לגזור אלמנט בנגיעה", () => beginCut(), { icon: "crop" });
    const saveCut = UI.button("להוסיף כשכבה", () => keepCut(), { kind: "primary", icon: "check" });
    const dropCut = UI.button("ביטול", () => endCut(), { kind: "ghost" });
    const cutTools = h("div.split-cut-tools", { hidden: true }, h("p.note", "נוגעים באלמנט בתמונה. אפשר לבחור כמה גדולה הגזירה, ולגעת שוב כדי להוסיף או להוריד חלק."), sizes.node, keepC.node, h("div.btn-row", saveCut, dropCut));
    function syncCuts() {
      cutList.replaceChildren(...st.cuts.map((c, i) => h("button.chip.on", { type: "button", title: "להסיר את הגזירה", onclick: () => { st.cuts.splice(i, 1); syncCuts(); paint(); } }, h("span", "גזירה " + (i + 1)), icon("close", 14))));
      cutList.hidden = !st.cuts.length;
    }
    async function beginCut() {
      if (!st.depth) return;
      if (!st.seg) {
        if (st.segBusy) return; st.segBusy = true; status.textContent = "מכינה את הגזירה בנגיעה…";
        try { st.seg = await Splitter.segmenter(img, (p) => { status.textContent = "מורידה את כלי הגזירה… " + Math.round(p * 100) + "%"; }); }
        catch (e) { console.warn(e); st.segBusy = false; status.textContent = "כלי הגזירה לא נטען. כדאי לבדוק את החיבור לאינטרנט ולנסות שוב."; return; }
        st.segBusy = false;
      }
      st.tapping = true; st.points = []; st.masks = null; cutTools.hidden = false; cutBtn.hidden = true;
      status.textContent = "נוגעים באלמנט שרוצים לגזור.";
    }
    function endCut() { st.tapping = false; st.points = []; st.masks = null; st.order = null; cutTools.hidden = true; cutBtn.hidden = false; status.textContent = ready(); paint(); }
    function keepCut() {
      if (!st.masks) return toast("קודם נוגעים באלמנט בתמונה", { kind: "warn" });
      st.cuts.push({ mask: st.masks[st.pick] }); syncCuts(); endCut();
    }
    view.addEventListener("click", async (e) => {
      if (!st.tapping || !st.seg) return;
      const r = view.getBoundingClientRect(), p = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, keep: st.points.length ? !st.remove : true };
      st.points.push(p); status.textContent = "גוזרת…";
      try {
        const ms = await st.seg.masks(st.points);
        const area = (m) => { let s = 0; for (const v of m.data) if (v) s++; return s; };
        st.order = ms.map((m, i) => [area(m), i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
        let best = 0; ms.forEach((m, i) => { if (m.score > ms[best].score) best = i; });
        st.masks = ms; st.pick = st.points.length > 1 ? st.pick : best; sizes.sync();
        status.textContent = "כך תיגזר. אפשר לגעת שוב, או להוסיף כשכבה.";
      } catch (err) { console.warn(err); st.points.pop(); status.textContent = "הגזירה לא הצליחה. כדאי לנסות לגעת שוב."; }
      paint();
    });

    // the exact way: Claude splits it by her words and the layers come back into this creation by themselves
    const words = h("textarea.field", { rows: 2, dir: "auto", id: "split-claude-words", "aria-label": "אילו שכבות", placeholder: "למשל: רקע, אלמוגים אחוריים, לוויתן גדול, לוויתן קטן, אלמוגים קדמיים, טקסט" });
    const claudeMsg = h("p.split-status", { id: "split-claude-msg", role: "status" });
    const waiting = () => { const n = Desk.pending(App.rec.id).length; claudeMsg.textContent = n ? (n === 1 ? "בקשה אחת" : n + " בקשות") + " אצל Claude. השכבות יתווספו ליצירה הזו לבד כשהן מוכנות, גם אם הסטודיו נסגר בינתיים." : ""; };
    const sendBtn = UI.button("לשלוח ל־Claude", async () => {
      const text = words.value.trim();
      if (!text) return toast("כותבים אילו שכבות רוצים", { kind: "warn" });
      if (!Portal.getToken()) return toast("קודם מחברים את GitHub בהגדרות הפרסום (״לראות ולשתף״), כמו לפרסום יצירה", { kind: "warn", ms: 7000 });
      sendBtn.disabled = true; const end = UI.busy("שולחת ל־Claude…");
      try {
        await Desk.send({ blob, words: text, creationId: App.rec.id, name: App.rec.name, isArt, aspect: img.naturalWidth / img.naturalHeight });
        words.value = ""; waiting();
        toast("נשלח ל־Claude. כדאי לכתוב לו בצ׳אט שיש בקשה חדשה. השכבות יתווספו ליצירה הזו לבד.", { ms: 8000 });
      } catch (e) { console.warn(e); toast(e.message === "big" ? "התמונה גדולה מ־20MB" : "השליחה לא הצליחה. אפשר לנסות שוב.", { kind: "error" }); }
      finally { end(); sendBtn.disabled = false; }
    }, { kind: "primary", icon: "share" });
    sendBtn.id = "split-claude-send";
    waiting();

    const make = UI.button("יצירת השכבות", () => create(), { kind: "primary", icon: "check" });
    make.disabled = true;
    const d = UI.dialog({
      title: "פירוק לשכבות", sheet: true, wide: true, onClose: () => { st.closed = true; },
      body: [h("div.split-view", view), status,
        UI.group("שכבות לפי עומק", count, depthS, showT),
        UI.group("פירוק מדויק עם Claude", h("p.note", "Claude מפרק את התמונה בכלים מתקדמים, וממלא את הרקע מאחורי מה שהוא מוציא. כותבים אילו שכבות רוצים, מהרחוקה לקרובה."), UI.field("אילו שכבות", words), sendBtn, claudeMsg),
        UI.group("אלמנט משלו", h("p.note", "אלמנט שנגזר עומד לפני השכבה שלו, ואפשר להזיז ולהנפיש אותו לבד."), cutBtn, cutTools, cutList),
        h("p.note", icon("cube", 18), h("span", "הפירוק נעשה במכשיר עצמו. בפעם הראשונה מורידים את כלי הפירוק (בערך 30MB), ואחר כך זה מהיר יותר."))],
      foot: [make]
    });
    syncCuts(); paint();
    const ready = () => "מוכן: " + st.n + " שכבות לפי עומק" + (st.cuts.length ? " ועוד " + st.cuts.length + " גזירות" : "") + ". רואים את העומק במבט תלת־ממד ובמצלמה.";

    try {
      st.depth = await Splitter.depth(img, (p) => { status.textContent = "מורידה את כלי הפירוק… " + Math.round(p * 100) + "%"; if (p >= 1) status.textContent = "מנתחת את העומק בתמונה…"; });
    } catch (e) {
      console.warn(e); status.textContent = "כלי הפירוק לא נטען. כדאי לבדוק את החיבור לאינטרנט ולנסות שוב."; return;
    }
    if (st.closed) return;
    status.textContent = ready(); make.disabled = false; paint();

    async function create() {
      if (App.blocked({ layers: st.n + st.cuts.length + 1 })) return;
      make.disabled = true;
      const end = UI.busy("בונה את השכבות…");
      try {
        const layers = Splitter.build(img, st.depth, st.n, st.cuts);
        const g = Studio.geom(App.rec), aspect = img.naturalWidth / img.naturalHeight;
        const w = isArt ? 1 : Math.min(0.8, 0.8 * aspect / artRatio()), hh = (w / aspect) * artRatio();
        const ids = []; let band = 0, cut = 0;
        for (const L of layers) {
          const b = await toBlob(L.canvas); if (!b) continue;
          if (App.blocked({ bytes: b.size })) break;
          const assetId = Studio.newId(); App.rec.assets[assetId] = b;
          const name = L.kind === "back" ? "רקע הפירוק" : L.kind === "cut" ? "גזירה " + (++cut) : "שכבה " + (++band);
          const el = { id: Studio.newId(), type: "image", name, assetId, x: 0, y: 0, w, h: hh, aspect, rot: 0, z: +(L.z * st.spread * g.artH).toFixed(4), flush: true, seq: null };
          await App.addLayer(el); ids.push(el.id);
        }
        const grp = ids.length > 1 ? await App.groupLayers(ids) : null;
        if (grp) { grp.name = "פירוק לשכבות"; grp.split = { spread: st.spread }; App.changed(true); } // the spread stays adjustable on the group
        d.close();
        toast(ids.length + " שכבות בעומק. במבט תלת־ממד רואים איך הן עומדות זו לפני זו.", { ms: 6000 });
        if (!App.mode3d && App.setMode3d) App.setMode3d(true);
      } catch (e) { console.warn(e); toast("השכבות לא נבנו. כדאי לנסות שוב.", { kind: "error" }); make.disabled = false; }
      finally { end(); }
    }
  }

  return { open };
})();
