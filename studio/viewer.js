"use strict";
/* Viewer portal (view.html): for people who look at Adi's artworks, not for editing. One address for every published
   creation: the camera, the creation waking up on the artwork, and the 10-second record button. Nothing else on the
   screen: no words, no buttons, unless something needs the viewer (a browser inside an app, a removed creation, a
   blocked camera).
   view.html#<id> (or ?c=<id>) opens one creation straight away (a QR or a link beside an artwork); with no id the portal
   finds the artwork by itself: camera frames go to the recogniser (recognize.js, in a worker), and only the artwork it
   names is handed to the AR engine, which then finds and holds it (the engine slows down sharply with a long list).
   The recogniser keeps looking while a creation is shown, so turning to another artwork switches to it in place: the
   engine and the camera keep running, only the engine's one artwork and the scene's content change. Creations stay
   ready in memory once loaded, and with a small catalogue the others are fetched in the background meanwhile.
   On an iPhone the engine needs the motion sensors, which Safari only lets a page ask for from a tap: then (and only
   when the permission is not already there) the whole screen is one tap target with one wordless mark.
   Text for viewers is neutral plural Hebrew. */
(async () => {
  const $ = (id) => document.getElementById(id);
  const V = (document.currentScript && new URL(document.currentScript.src).search) || "";
  const el = (tag, props, ...kids) => { const n = Object.assign(document.createElement(tag), props || {}); for (const k of kids) if (k != null) n.append(k); return n; };
  const screen = (...kids) => { const s = $("screen"); s.className = ""; s.replaceChildren(el("div", { className: "box" }, ...kids)); s.hidden = false; return s; };
  const params = new URLSearchParams(location.search);
  let want = ""; try { want = decodeURIComponent(location.hash.slice(1)) || params.get("c") || ""; } catch (e) { want = ""; }
  const setState = (s) => { document.body.dataset.state = s; };

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
      chrome, copy);
    setState("inapp");
    return;
  }

  // ---------- iPhone: the motion sensors (asked from a tap, only when not allowed already) ----------
  // Safari answers at once, without asking, when the page already has the permission (or was refused); without a tap
  // and without an answer it rejects. So: ask quietly first, and only if that fails, wait for a tap.
  const motionAPI = ios && typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function";
  const askMotion = () => Promise.all([DeviceMotionEvent.requestPermission(), typeof DeviceOrientationEvent !== "undefined" && DeviceOrientationEvent.requestPermission ? DeviceOrientationEvent.requestPermission() : "granted"]);
  const motionReady = motionAPI ? Promise.race([askMotion().then(() => true, () => false), new Promise((r) => setTimeout(() => r(false), 800))]) : Promise.resolve(true);

  // ---------- the catalogue ----------
  let cat;
  const load = async () => { try { return await Portal.readCatalogue(); } catch (e) { console.warn(e); return null; } };
  cat = await load();
  if (!cat) {
    const again = el("button", { className: "btn", type: "button", textContent: "לנסות שוב", onclick: () => location.reload() });
    screen(el("h1", { textContent: "אין חיבור כרגע" }), el("p", { textContent: "היצירות לא נטענו. אפשר לנסות שוב כשיש קליטה." }), again);
    setState("offline"); return;
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
      setState("gone"); return;
    }
  }
  if (!cat.items.length) { screen(el("h1", { textContent: "עוד אין כאן יצירות" }), el("p", { textContent: "כשיצירות יתפרסמו, הן יופיעו כאן." })); setState("empty"); return; }

  // ---------- the one tap, where it is needed (iPhone without the motion permission yet) ----------
  // The tap also lets sound start: the scene's audio context is resumed inside it.
  const unlockAudio = () => { try { const ctx = AFRAME.THREE.AudioContext.getContext(); if (ctx.state === "suspended") ctx.resume(); const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); } catch (e) {} };
  if (!await motionReady) {
    await new Promise((go) => {
      const s = $("screen"); s.className = "tap"; s.hidden = false;
      const b = el("button", { type: "button", id: "start", className: "tap-target" });
      b.setAttribute("aria-label", "להפעיל מצלמה");
      b.innerHTML = '<svg viewBox="0 0 48 48" width="72" height="72" aria-hidden="true"><circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" stroke-width="2.5" opacity=".5"/><path d="M15 19.5a2.5 2.5 0 0 1 2.5-2.5h2.6l1.6-2.4h4.6l1.6 2.4h2.6a2.5 2.5 0 0 1 2.5 2.5v10a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 15 29.5z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="24" cy="24.5" r="4" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>';
      b.onclick = () => { if (motionAPI) askMotion().catch(() => {}); unlockAudio(); go(); };
      s.replaceChildren(b);
      setState("start");
    });
  }
  $("screen").hidden = true;

  // ---------- the AR scene (one for the whole visit) ----------
  const scene = ARMount.makeScene({ filePrefix: "brill-ar-", holdMs: 2000 }); // holdMs: a lost artwork keeps its creation 2 s (a reflection or a hand passing makes the engine let go for a moment)
  document.body.appendChild(scene);
  const status = $("status"), pick = $("pick"), bar = $("bar");
  let sayTimer = 0;
  const say = (t, ms) => { clearTimeout(sayTimer); status.textContent = t || ""; status.hidden = !t; if (t && ms) sayTimer = setTimeout(() => { status.hidden = true; }, ms); };
  const progress = (f) => { if (f == null) { bar.hidden = true; return; } bar.hidden = false; bar.firstChild.style.transform = "scaleX(" + Math.max(0.04, Math.min(1, f)) + ")"; };
  const byId = new Map(cat.items.map((i) => [i.id, i]));
  const small = cat.items.length <= 8 && cat.items.reduce((s, i) => s + (i.bytes || 0), 0) <= 80 * 1048576;
  const KEEP = small ? Math.min(6, cat.items.length) : 2; // creations kept mounted (ready to show at once)
  let state = "looking", current = null, forced = false, lostTimer = 0, wakeTimer = 0, lookSince = Date.now();
  const loaded = new Map(); // id -> Promise<{rec, targetData}> (the files, in memory)
  const mounted = new Map(); // id -> {handle, targetData, used, started}
  const times = []; // test/debug: [{id, chose, found}]
  const go = (s) => { if (s === "looking" && state !== "looking") lookSince = Date.now(); state = s; setState(s); };
  window.__portal = { state: () => state, current: () => current, mounted: () => [...mounted.keys()], loaded: () => [...loaded.keys()], times: () => times.slice(), heard: () => heard.slice(), choose: (id) => choose(byId.get(id), true), frame: (px, w, h) => sendFrame(px, w, h, true) }; // test/debug handle

  // the files of a creation and its engine target: fetched once, then kept
  function fetchCreation(it, onProgress) {
    if (!loaded.has(it.id)) {
      const p = (async () => {
        const rec = await Portal.loadCreation(it, onProgress);
        const t = await Studio.makeTarget(await Studio.loadImageBlob(rec.assets.__artwork));
        return { rec, targetData: Studio.targetDataJSON(t.luminance, t.padded, t.thumb, it.id) };
      })();
      loaded.set(it.id, p);
      p.catch(() => { if (loaded.get(it.id) === p) loaded.delete(it.id); });
    }
    return loaded.get(it.id);
  }
  // ready in the scene (hidden until its artwork is found); the least recently shown beyond KEEP are let go
  async function mountCreation(it) {
    if (mounted.has(it.id)) return mounted.get(it.id);
    const { rec, targetData } = await fetchCreation(it);
    if (mounted.has(it.id)) return mounted.get(it.id);
    const handle = await ARMount.mount(scene, rec, { name: it.id, autoStart: false, quietSound: true });
    const m = { handle, targetData, used: 0, started: false };
    mounted.set(it.id, m);
    // and the files they hold stay under about 150MB, so a few big creations never use up a phone's memory
    const heavy = () => [...mounted.keys()].reduce((n, id) => n + ((byId.get(id) || {}).bytes || 0), 0) > 150 * 1048576;
    for (const [id, x] of [...mounted].sort((a, b) => a[1].used - b[1].used)) if ((mounted.size > KEEP || heavy()) && id !== it.id && id !== current) { x.handle.destroy(); mounted.delete(id); loaded.delete(id); }
    return m;
  }
  // with a small catalogue, everything else is fetched (and made ready) in the background, one at a time
  let prefetching = false;
  async function prefetchAll() {
    if (prefetching || !small) return; prefetching = true;
    for (const it of cat.items) { if (mounted.has(it.id)) continue; try { await mountCreation(it); } catch (e) { console.warn("prefetch", e); } await new Promise((r) => setTimeout(r, 150)); }
  }

  // which artwork the engine is told about: the one being shown, nothing else
  const tell = (ids) => { if (window.XR8 && XR8.XrController) XR8.XrController.configure({ imageTargetData: ids.map((id) => mounted.get(id) && mounted.get(id).targetData).filter(Boolean) }); };
  let choosing = null;
  async function choose(it, byHand) {
    if (!it || choosing === it.id) return;
    const prev = current;
    forced = !!byHand; current = it.id; choosing = it.id; clearTimeout(wakeTimer); clearTimeout(lostTimer);
    const rec = { id: it.id, chose: performance.now(), found: 0 }; times.push(rec);
    let m = mounted.get(it.id);
    if (!m) {
      go("loading"); progress(0);
      try { m = await (loaded.has(it.id) ? mountCreation(it) : fetchCreation(it, progress).then(() => mountCreation(it))); }
      catch (e) {
        console.warn(e); progress(null);
        if (choosing === it.id) { choosing = null; current = null; forced = false; go("looking"); say("היצירה לא נטענה הפעם. מנסים שוב כשמכוונים אליה.", 3500); }
        return;
      }
      progress(null);
    }
    if (choosing !== it.id) return; // another artwork was named meanwhile
    choosing = null;
    // the creation shown before steps aside at once (not after the engine notices it is gone)
    if (prev && prev !== it.id && mounted.has(prev)) ARMount.release(scene, prev);
    m.used = Date.now();
    if (!m.started) { m.started = true; m.handle.start(); } // its videos start now (muted), so they have a picture when the artwork is found
    tell([it.id]);
    go("waking");
    // not found by the engine after a while: back to looking (the recogniser may have been wrong, or it is too far)
    wakeTimer = setTimeout(() => { if (state === "waking") { go("looking"); forced = false; } }, 12000);
    prefetchAll();
  }
  scene.addEventListener("xrimagefound", (e) => {
    const n = e.detail && e.detail.name; if (!mounted.has(n)) return;
    clearTimeout(lostTimer); clearTimeout(wakeTimer); current = n; go("tracking"); say("");
    const t = times.filter((x) => x.id === n && !x.found).pop(); if (t) t.found = performance.now();
  });
  scene.addEventListener("xrimagelost", (e) => {
    if (!e.detail || e.detail.name !== current || state !== "tracking") return;
    go("lost");
    clearTimeout(lostTimer); lostTimer = setTimeout(() => { if (state === "lost") { go("looking"); forced = false; } }, 3000);
  });

  // ---------- recognition (frames from the engine's camera, compared in a worker), all the time ----------
  // While a creation is shown it goes on, a little slower: pointing at another artwork switches to it.
  let worker = null, busy = false, lastSent = 0;
  const votes = [], heard = []; // heard: the recogniser's last answers (test/debug)
  const cadence = () => (state === "tracking" ? 650 : 280);
  try {
    worker = new Worker("recognize-worker.js" + V);
    worker.postMessage({ type: "index", items: cat.items.filter((i) => i.trigger.f).map((i) => ({ id: i.id, f: i.trigger.f })) });
    worker.onmessage = (e) => {
      const m = e.data; if (m.type !== "result") return; busy = false;
      const id = Recognize.decide(m.res);
      heard.push([Math.round(performance.now()), id, m.res[0] && m.res[0].inliers, m.ms]); if (heard.length > 60) heard.shift();
      votes.push(id); if (votes.length > 3) votes.shift();
      // a close runner-up: its files are fetched now, in case the camera is on its way there
      const a = m.res[0], b = m.res[1];
      if (!small && a && b && b.inliers >= 6 && b.inliers >= a.inliers * 0.6 && byId.has(b.id)) fetchCreation(byId.get(b.id)).catch(() => {});
      // the same artwork named in two of the last three frames, and it is not the one shown (or being made ready)
      if (id && id !== current && votes.filter((v) => v === id).length >= 2 && !(forced && state === "waking")) { votes.length = 0; choose(byId.get(id)); }
    };
    worker.onerror = (e) => { console.warn("recogniser", e.message); worker = null; };
  } catch (e) { console.warn(e); worker = null; }
  function sendFrame(px, w, h, now) {
    if (!worker || busy || (!now && Date.now() - lastSent < cadence())) return;
    busy = true; lastSent = Date.now();
    worker.postMessage({ type: "frame", w, h, px }, [px.buffer]);
  }
  const startRecognition = () => {
    XR8.addCameraPipelineModules([XR8.CameraPixelArray.pipelineModule({ luminance: true, maxDimension: 320 }), {
      name: "portal-recognise",
      onProcessCpu: ({ processGpuResult }) => {
        const a = processGpuResult && processGpuResult.camerapixelarray; if (!a || !a.pixels) return;
        if (busy || Date.now() - lastSent < cadence()) return;
        const w = a.cols, h = a.rows, px = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) px.set(a.pixels.subarray(y * a.rowBytes, y * a.rowBytes + w), y * w);
        sendFrame(px, w, h);
      },
    }]);
  };

  // ---------- "not recognised? choose from a list": a small icon, only after a while without an artwork ----------
  setInterval(() => { pick.hidden = !(state === "looking" && Date.now() - lookSince > 7000); }, 500);
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

  // ---------- a blocked camera: our own screen, in Hebrew, with the way to allow it ----------
  scene.addEventListener("camerastatuschange", (e) => {
    if (!e.detail || e.detail.status !== "failed") return;
    const s = screen(el("h1", { textContent: "המצלמה חסומה" }),
      el("p", { textContent: "בלי מצלמה היצירות לא מתעוררות. אפשר לאפשר אותה בהגדרות הדפדפן ולנסות שוב." }),
      el("a", { className: "btn", href: "camera-help.html", textContent: "איך מאפשרים מצלמה" }),
      el("button", { className: "btn ghost", type: "button", textContent: "לנסות שוב", onclick: () => location.reload() }));
    s.classList.add("over"); setState("camera-blocked");
  });

  // ---------- the 10-second recording ----------
  // The engine's preview offers "Share" (the share sheet: on iPhone that is where "Save Video" is). On Android the share
  // sheet does not always offer saving to the gallery, so a plain download sits beside it there.
  if (android) {
    let video = null, waiting = null;
    const got = (e) => { const v = e.detail && e.detail.videoBlob; if (v) { video = v; if (waiting) { const w = waiting; waiting = null; w(); } } };
    window.addEventListener("mediarecorder-previewready", got); // the clip may still be finishing here
    window.addEventListener("mediarecorder-recordcomplete", got); // the finished clip
    window.addEventListener("mediarecorder-recordstart", () => { video = null; });
    window.addEventListener("mediarecorder-previewopened", () => {
      const box = document.getElementById("previewContainer"); if (!box || document.getElementById("portal-save")) return;
      const save = el("button", { id: "portal-save", type: "button", className: "btn", textContent: "שמירה בטלפון" });
      save.style.cssText = "position:absolute;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom) + 96px);z-index:10;";
      save.onclick = async () => { if (!video) { save.textContent = "רגע…"; await new Promise((r) => { waiting = r; }); } const u = URL.createObjectURL(video), a = el("a", { href: u, download: "brill-ar-" + Date.now() + ".mp4" }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 30000); save.textContent = "נשמר ✓"; };
      box.appendChild(save);
    });
    window.addEventListener("mediarecorder-previewclosed", () => { const b = document.getElementById("portal-save"); if (b) b.remove(); });
  }

  const ready = () => {
    startRecognition();
    if (item) choose(item, true); else go("looking");
  };
  window.XR8 ? ready() : window.addEventListener("xrloaded", ready, { once: true });
})().catch((e) => {
  // never Studio.loadFailed here: its way back leads into the editor, and viewers have no editor
  console.error(e);
  const s = document.getElementById("screen"), box = document.createElement("div"), h = document.createElement("h1"), b = document.createElement("button");
  box.className = "box"; h.textContent = "הצפייה לא נפתחה הפעם"; b.className = "btn"; b.type = "button"; b.textContent = "לנסות שוב"; b.onclick = () => location.reload();
  box.append(h, b); s.className = ""; s.replaceChildren(box); s.hidden = false; document.body.dataset.state = "error";
});
