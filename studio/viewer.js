"use strict";
/* Viewer portal (view.html): for people who look at Adi's artworks, not for editing. One address for every published
   creation: the camera, the creation waking up on the artwork, and the 10-second record button.
   view.html#<id> (or ?c=<id>) opens one creation straight away (a QR or a link beside an artwork); with no id the portal
   finds the artwork by itself: camera frames go to the recogniser (recognize.js, in a worker), and only the artwork it
   names is handed to the AR engine, which then finds and holds it (the engine slows down sharply with a long list).
   A creation's media are downloaded only once its artwork is recognised. When the artwork has been out of sight for a
   few seconds the portal goes back to looking, so a viewer can walk on to the next artwork without reloading.
   Text for viewers is neutral plural Hebrew. */
(async () => {
  const $ = (id) => document.getElementById(id);
  const V = (document.currentScript && new URL(document.currentScript.src).search) || "";
  const el = (tag, props, ...kids) => { const n = Object.assign(document.createElement(tag), props || {}); for (const k of kids) if (k != null) n.append(k); return n; };
  const screen = (...kids) => { const s = $("screen"); s.replaceChildren(el("div", { className: "box" }, ...kids)); s.hidden = false; return s; };
  const params = new URLSearchParams(location.search);
  let want = ""; try { want = decodeURIComponent(location.hash.slice(1)) || params.get("c") || ""; } catch (e) { want = ""; }

  // ---------- browsers inside apps (Instagram, Facebook, WhatsApp...) do not give pages the camera ----------
  const ua = navigator.userAgent || "", android = /Android/i.test(ua), ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const inApp = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|WhatsApp|LinkedInApp|Snapchat|TikTok|musical_ly|Line\/|MicroMessenger|; wv\)/i.test(ua) || !(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  if (inApp && !params.has("inapp-ok")) {
    const url = location.href, copy = el("button", { className: "btn ghost", type: "button", textContent: "העתקת הקישור" });
    copy.onclick = async () => { try { await navigator.clipboard.writeText(url); copy.textContent = "הקישור הועתק ✓"; } catch (e) { prompt("העתיקו את הקישור:", url); } };
    const chrome = android ? el("a", { className: "btn", href: "intent://" + url.replace(/^https?:\/\//, "") + "#Intent;scheme=https;package=com.android.chrome;end", textContent: "פתיחה ב־Chrome" }) : null;
    screen(el("h1", { textContent: "צריך לפתוח את הקישור בדפדפן" }),
      el("p", { textContent: "האפליקציה הזו לא נותנת להשתמש במצלמה, ובלי מצלמה היצירות לא מתעוררות." }),
      el("p", { className: "how", textContent: ios ? "לוחצים על ⋯ או על סמל השיתוף, ובוחרים ״פתיחה ב־Safari״." : "לוחצים על ⋮ בפינה, ובוחרים ״פתיחה בדפדפן״ (או ב־Chrome)." }),
      chrome, copy).id = "screen";
    document.body.dataset.state = "inapp";
    return;
  }

  // ---------- the catalogue ----------
  let cat;
  const load = async () => { try { return await Portal.readCatalogue(); } catch (e) { console.warn(e); return null; } };
  cat = await load();
  if (!cat) {
    const again = el("button", { className: "btn", type: "button", textContent: "לנסות שוב", onclick: () => location.reload() });
    screen(el("h1", { textContent: "אין חיבור כרגע" }), el("p", { textContent: "היצירות לא נטענו. אפשר לנסות שוב כשיש קליטה." }), again);
    document.body.dataset.state = "offline"; return;
  }
  let item = null;
  if (want) {
    item = Portal.ID.test(want) && cat.items.find((i) => i.id === want);
    // a creation published a moment ago is not in the public copy yet (it lags up to ~5 minutes): ask GitHub directly
    if (!item && Portal.ID.test(want)) { try { const fresh = await Portal.readCatalogue({ fresh: true }); item = fresh.items.find((i) => i.id === want); if (fresh.items.length) cat = fresh; } catch (e) {} }
    if (!item) {
      screen(el("h1", { textContent: "היצירה הזו כבר לא מוצגת כאן" }),
        el("p", { textContent: "ייתכן שהיא הוסרה או הוחלפה בגרסה חדשה. אפשר לראות את היצירות האחרות: מכוונים את המצלמה אל יצירה והיא מתעוררת." }),
        el("a", { className: "btn", href: "view.html", textContent: "לכל היצירות" }));
      document.body.dataset.state = "gone"; return;
    }
  }
  if (!cat.items.length) { screen(el("h1", { textContent: "עוד אין כאן יצירות" }), el("p", { textContent: "כשיצירות יתפרסמו, הן יופיעו כאן." })); document.body.dataset.state = "empty"; return; }

  // ---------- start: a tap first (it lets the camera and the sound start on every phone) ----------
  await new Promise((go) => {
    const pic = item && item.thumb ? el("img", { className: "thumb", src: Portal.raw() + item.thumb, alt: "" }) : null;
    const start = el("button", { className: "btn big", type: "button", id: "start", textContent: "להפעיל מצלמה", onclick: go });
    screen(pic, el("h1", { textContent: item ? item.name : "יצירות שמתעוררות" }),
      el("p", { textContent: item ? "מכוונים את המצלמה אל היצירה, והיא מתעוררת." : "מכוונים את המצלמה אל אחת היצירות, והיא מתעוררת. אפשר גם לצלם סרטון קצר." }), start);
    document.body.dataset.state = "start";
  });
  $("screen").hidden = true;

  // ---------- the AR scene (one for the whole visit) ----------
  const scene = ARMount.makeScene({ filePrefix: "brill-ar-", xrweb: params.get("xrweb") || "" });
  document.body.appendChild(scene);
  const status = $("status"), pick = $("pick");
  const say = (t) => { status.textContent = t || ""; status.hidden = !t; };
  const byId = new Map(cat.items.map((i) => [i.id, i]));
  let state = "looking", current = null, forced = false, lostTimer = 0, wakeTimer = 0, loading = null;
  const mounted = new Map(); // id -> {handle, targetData, used}
  const setState = (s) => { state = s; document.body.dataset.state = s; };
  window.__portal = { state: () => state, current: () => current, mounted: () => [...mounted.keys()], choose: (id) => choose(byId.get(id), true), frame: (px, w, h) => sendFrame(px, w, h, true) }; // test/debug handle

  // which artwork the engine is told about: the one being shown, nothing else
  const tell = (ids) => { if (window.XR8 && XR8.XrController) XR8.XrController.configure({ imageTargetData: ids.map((id) => mounted.get(id) && mounted.get(id).targetData).filter(Boolean) }); };
  async function choose(it, byHand) {
    if (!it || loading) return;
    forced = !!byHand; current = it.id; clearTimeout(wakeTimer);
    if (!mounted.has(it.id)) {
      setState("loading"); say("היצירה נטענת…");
      loading = it.id;
      try {
        const rec = await Portal.loadCreation(it, (f) => say("היצירה נטענת… " + Math.round(f * 100) + "%"));
        const t = await Studio.makeTarget(await Studio.loadImageBlob(rec.assets.__artwork));
        const handle = await ARMount.mount(scene, rec, { name: it.id });
        mounted.set(it.id, { handle, targetData: Studio.targetDataJSON(t.luminance, t.padded, t.thumb, it.id), used: Date.now() });
        // two creations at most stay ready (the one before is quick to come back to); older ones are let go
        for (const [id, m] of [...mounted].sort((a, b) => a[1].used - b[1].used)) if (mounted.size > 2 && id !== it.id) { m.handle.destroy(); mounted.delete(id); }
      } catch (e) {
        console.warn(e); loading = null; current = null; forced = false;
        say("היצירה לא נטענה הפעם. מנסים שוב כשמכוונים אליה."); setTimeout(() => { if (state === "looking") say("מכוונים את המצלמה אל יצירה"); }, 3500);
        setState("looking"); return;
      }
      loading = null;
    }
    if (current !== it.id) return;
    mounted.get(it.id).used = Date.now();
    tell([it.id]);
    setState("waking"); say("עוד רגע… מחזיקים את המצלמה מול היצירה");
    // not found by the engine after a while: back to looking (the recogniser may have been wrong, or it is too far)
    wakeTimer = setTimeout(() => { if (state === "waking") { setState("looking"); say(forced ? "מקרבים את המצלמה אל היצירה" : "מכוונים את המצלמה אל יצירה"); forced = false; } }, 12000);
  }
  scene.addEventListener("xrimagefound", (e) => {
    const n = e.detail && e.detail.name; if (!mounted.has(n)) return;
    clearTimeout(lostTimer); clearTimeout(wakeTimer); current = n; setState("tracking"); say("");
  });
  scene.addEventListener("xrimagelost", (e) => {
    if (!e.detail || e.detail.name !== current) return;
    setState("lost");
    // out of sight for a few seconds: look for artworks again (this one stays ready and is still known to the engine)
    clearTimeout(lostTimer); lostTimer = setTimeout(() => { if (state === "lost") { setState("looking"); forced = false; say("מכוונים את המצלמה אל יצירה"); } }, 3000);
  });

  // ---------- recognition (frames from the engine's camera, compared in a worker) ----------
  let worker = null, busy = false, lastSent = 0;
  const votes = [];
  try {
    worker = new Worker("recognize-worker.js" + V);
    worker.postMessage({ type: "index", items: cat.items.filter((i) => i.trigger.f).map((i) => ({ id: i.id, f: i.trigger.f })) });
    worker.onmessage = (e) => {
      const m = e.data; if (m.type !== "result") return; busy = false;
      const id = Recognize.decide(m.res);
      votes.push(id); if (votes.length > 3) votes.shift();
      // the same artwork named in two of the last three frames
      if (id && votes.filter((v) => v === id).length >= 2 && (state === "looking" || (state === "waking" && id !== current))) { votes.length = 0; choose(byId.get(id)); }
    };
    worker.onerror = (e) => { console.warn("recogniser", e.message); worker = null; };
  } catch (e) { console.warn(e); worker = null; }
  function sendFrame(px, w, h, now) {
    if (!worker || busy || (!now && Date.now() - lastSent < 280)) return;
    if (!(state === "looking" || (state === "waking" && !forced))) return;
    busy = true; lastSent = Date.now();
    worker.postMessage({ type: "frame", w, h, px }, [px.buffer]);
  }
  const startRecognition = () => {
    XR8.addCameraPipelineModules([XR8.CameraPixelArray.pipelineModule({ luminance: true, maxDimension: 320 }), {
      name: "portal-recognise",
      onProcessCpu: ({ processGpuResult }) => {
        const a = processGpuResult && processGpuResult.camerapixelarray; if (!a || !a.pixels) return;
        if (busy || Date.now() - lastSent < 280) return;
        const w = a.cols, h = a.rows, px = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) px.set(a.pixels.subarray(y * a.rowBytes, y * a.rowBytes + w), y * w);
        sendFrame(px, w, h);
      },
    }]);
  };

  // ---------- "not recognised? choose from a list" ----------
  pick.onclick = () => {
    const list = el("div", { className: "grid" });
    for (const it of cat.items) {
      const b = el("button", { type: "button", className: "tile" }, it.thumb ? el("img", { src: Portal.raw() + it.thumb, alt: "", loading: "lazy" }) : null, el("span", { textContent: it.name }));
      b.onclick = () => { sheet.hidden = true; choose(it, true); };
      list.append(b);
    }
    const sheet = $("sheet"), close = el("button", { className: "btn ghost", type: "button", textContent: "סגירה", onclick: () => { sheet.hidden = true; } });
    sheet.replaceChildren(el("div", { className: "sheet-head" }, el("b", { textContent: "בוחרים את היצירה שמולכם" }), close), list);
    sheet.hidden = false;
  };

  const ready = () => {
    startRecognition();
    pick.hidden = false;
    if (item) choose(item, true); else { setState("looking"); say("מכוונים את המצלמה אל יצירה"); }
  };
  window.XR8 ? ready() : window.addEventListener("xrloaded", ready, { once: true });
})().catch((e) => {
  // never Studio.loadFailed here: its way back leads into the editor, and viewers have no editor
  console.error(e);
  const s = document.getElementById("screen"), box = document.createElement("div"), h = document.createElement("h1"), b = document.createElement("button");
  box.className = "box"; h.textContent = "הצפייה לא נפתחה הפעם"; b.className = "btn"; b.type = "button"; b.textContent = "לנסות שוב"; b.onclick = () => location.reload();
  box.append(h, b); s.replaceChildren(box); s.hidden = false; document.body.dataset.state = "error";
});
