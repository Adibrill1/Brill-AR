"use strict";
/* Layers by Claude: she sends a picture and a few words ("טקסט, לוויתן, אלמוגים קדמיים") from the "פירוק לשכבות" sheet,
   Claude splits it with better tools than the phone has (and paints the background behind what it lifts out), and the
   layers come back into the same creation by themselves.
   The mailbox is a branch of the site's own repository ("layer-requests"), written with her own GitHub token, the one
   she set up for publishing. Everything in it is encrypted: each request has its own random key (AES-GCM, 256-bit),
   and that key is locked with Claude's public key (RSA-OAEP), so only Claude's side (which keeps the private key on
   Adi's computer, never in the repository) can open the request; the layers come back locked with the request's key,
   which only this phone keeps. Layout:
     r/<id>/key.bin   the request's key, locked for Claude
     r/<id>/req.bin   what she asked: {id, name, words, type, at}
     r/<id>/pic.bin   the picture
     r/<id>/done.bin  (on branch "claude/layer-answers", so an answer never wakes Claude again) Claude's answer: {layers: [{name, file}], spread, note}, far to near
     r/<id>/<file>    each layer, a picture the size of the whole picture */
window.Desk = (() => {
  let PUB = {"kty":"RSA","n":"92nOX4Qnump89mjtcFdYpUYJB_vfk3h4pv2ghYPaA16RoUTisV7nwGX-i14zlzy-qH0Y529VfJEbHKI3X2XGV8uU54ezezWDMVGXu-edX6C8KyqvEd_2fV56IYwpR4q8pQXW8XzjKc17F2Jpd3yHtm2cf67-4KTi5-tP182ACgFkm6tSrQ8FHY8M_Yv7qROTjZIZoS0670l6tGzn1JVG4ph1L8ADeYehZNRyHxN635urrvWIurddXWbDhmgXMDvyhvWgN3q9QoOZpRpPLRsAdkHkFkHLY4SVLEtT1XcnCMGLx3y0-JQTv-VbenNd7EbyOGVhL8cprkybtNMw2vocljjSSkM4NRr7vDGAtHawZNQIW_HKfrLXzMJ0d5yoyuKU60S_CbuERD2L62p0BW6nWeq-lX84SHZUcmCCXQFnHZFLNGetR_g5195w124EoleXZKzfalshgBDz7lVVzIx3Qnz_qXj9kRmYwSJOjyGS94LDjHE2v0d9EIFveSdZBjLN","e":"AQAB"};
  const BRANCH = "layer-requests", ANSWERS = "claude/layer-answers", LS = "brill-desk-requests", EVERY = 60000;
  const list = () => { try { const a = JSON.parse(localStorage.getItem(LS) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  const keep = (a) => { try { localStorage.setItem(LS, JSON.stringify(a)); } catch (e) {} };
  const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const aes = (raw) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  async function lock(raw, blob) { const iv = crypto.getRandomValues(new Uint8Array(12)); return new Blob([iv, await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aes(raw), await blob.arrayBuffer())]); }
  async function unlock(raw, blob) { const u = new Uint8Array(await blob.arrayBuffer()); return new Blob([await crypto.subtle.decrypt({ name: "AES-GCM", iv: u.subarray(0, 12) }, await aes(raw), u.subarray(12))]); }
  const token = () => (window.Portal ? Portal.getToken() : "");
  const pending = (creationId) => list().filter((r) => !creationId || r.creationId === creationId);

  // send: {blob (the picture), words, auto (Claude finds the parts himself), creationId, name, isArt, aspect}
  async function send(o) {
    const t = token(); if (!t) throw Object.assign(new Error("no token"), { noToken: true });
    if (o.blob.size > 20 * 1048576) throw new Error("big");
    const id = Date.now().toString(36) + "-" + b64(crypto.getRandomValues(new Uint8Array(6))).replace(/[+/=]/g, "x");
    const raw = crypto.getRandomValues(new Uint8Array(32));
    const pub = await crypto.subtle.importKey("jwk", PUB, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
    const key = new Blob([await crypto.subtle.encrypt({ name: "RSA-OAEP" }, pub, raw)]);
    const req = new Blob([JSON.stringify({ id, name: o.name || "", words: o.words || "", auto: !!o.auto, type: o.blob.type || "image/png", at: Date.now() })], { type: "application/json" });
    await Portal.putFiles(t, BRANCH, [{ path: "r/" + id + "/key.bin", blob: key }, { path: "r/" + id + "/req.bin", blob: await lock(raw, req) }, { path: "r/" + id + "/pic.bin", blob: await lock(raw, o.blob) }], "request " + id);
    keep(list().concat([{ id, k: b64(raw), creationId: o.creationId, name: o.name || "", words: o.words || "", isArt: !!o.isArt, aspect: o.aspect || 1, at: Date.now() }]));
    soon();
    return id;
  }

  // the answer of one request, put into its creation
  async function fetchDone(r) {
    const t = token(); if (!t) return null;
    const done = await Portal.readRaw(t, ANSWERS, "r/" + r.id + "/done.bin"); if (!done) return null;
    const raw = unb64(r.k), ans = JSON.parse(await (await unlock(raw, done)).text());
    const layers = [];
    for (const L of ans.layers || []) {
      if (!/^[A-Za-z0-9_.-]{1,64}$/.test(L.file || "")) continue;
      const b = await Portal.readRaw(t, ANSWERS, "r/" + r.id + "/" + L.file); if (!b) continue;
      layers.push({ name: String(L.name || "שכבה").slice(0, 60), blob: new Blob([await unlock(raw, b)], { type: "image/png" }) });
    }
    return { layers, spread: Math.min(0.6, Math.max(0.02, +ans.spread || 0.2)), note: String(ans.note || "").slice(0, 300) };
  }
  function elementsFor(rec, r, layers, spread) {
    const g = Studio.geom(rec), ratio = g.artW / g.artH, aspect = r.aspect || ratio;
    const w = r.isArt ? 1 : Math.min(0.8, 0.8 * aspect / ratio), h = (w / aspect) * ratio, n = layers.length;
    return layers.map((L, i) => ({ id: Studio.newId(), type: "image", name: L.name, assetId: Studio.newId(), blob: L.blob, x: 0, y: 0, w, h, aspect, rot: 0, z: +((n > 1 ? i / (n - 1) : 0) * spread * g.artH).toFixed(4), flush: true, seq: null }));
  }
  async function apply(r, ans) {
    if (!ans.layers.length) return false;
    if (window.App && App.rec && App.rec.id === r.creationId) { // the creation is open: add the layers as she would
      const ids = [];
      for (const e of elementsFor(App.rec, r, ans.layers, ans.spread)) { App.rec.assets[e.assetId] = e.blob; delete e.blob; await App.addLayer(e); ids.push(e.id); }
      const grp = ids.length > 1 ? await App.groupLayers(ids) : null;
      if (grp) { grp.name = "שכבות מ־Claude"; grp.split = { spread: ans.spread }; App.changed(true); }
      return true;
    }
    const rec = await Studio.load(r.creationId).catch(() => null); if (!rec) return false;
    const els = elementsFor(rec, r, ans.layers, ans.spread);
    for (const e of els) { rec.assets[e.assetId] = e.blob; delete e.blob; rec.elements.push(e); }
    if (els.length > 1) { const grp = Studio.makeGroup(rec, els.map((e) => e.id)); grp.name = "שכבות מ־Claude"; grp.split = { spread: ans.spread }; }
    await Studio.save(rec);
    return true;
  }
  // what happened on the last look, per request: {state: "ready" (Claude is done, the layers are coming in) | "error", say}
  const status = new Map(), shown = new Set();
  const tell = () => { try { window.dispatchEvent(new Event("brill-desk")); } catch (e) {} };
  // her words when the error has them; otherwise the technical reason in brackets, so a screenshot tells what went wrong
  const say = (e) => {
    if (e && e.message && /[\u0590-\u05ff]/.test(e.message)) return e.message;
    const why = e ? String((e.name || "") + (e.message ? ": " + e.message : "")).slice(0, 120) : "";
    if (e && e.name === "OperationError") return "התשובה לא נפתחת עם המפתח של הבקשה (" + why + ").";
    return "משהו השתבש בהורדה" + (why ? " (" + why + ")" : "") + ".";
  };
  // a look that is still running blocks the next one, but only for a while: on a phone a look started just before the
  // screen locked can stay frozen, and it must never stop the looks for good
  let busy = 0;
  async function check() {
    if ((busy && Date.now() - busy < 150000) || !token() || !list().length) return 0;
    const my = busy = Date.now(); let got = 0;
    try {
      for (const r of list()) {
        let ans = null;
        try { ans = await fetchDone(r); }
        catch (e) { console.warn("desk", e); status.set(r.id, { state: "error", say: "השכבות מ־Claude מוכנות, אבל ההורדה נכשלה: " + say(e) }); tell(); continue; }
        if (!ans) { status.delete(r.id); continue; }
        status.set(r.id, { state: "ready" }); tell();
        let ok = false;
        try { ok = await apply(r, ans); } catch (e) { console.warn("desk", e); }
        if (ok) {
          got++; keep(list().filter((x) => x.id !== r.id)); status.delete(r.id);
          UI.toast("השכבות מ־Claude הגיעו" + (r.name ? " ליצירה ״" + r.name + "״" : "") + (ans.note ? ". " + ans.note : ""), { ms: 8000 });
          if (window.App && App.emit) App.emit("structure");
        } else status.set(r.id, { state: "error", say: ans.layers.length ? "השכבות מ־Claude מוכנות, אבל היצירה שלהן לא נמצאה במכשיר הזה." : "Claude לא הצליח להפריד את התמונה הזו לשכבות." });
        tell();
      }
      // a failure is said once, wherever she is in the studio (the split sheet keeps showing it, with a button to look again)
      for (const [id, x] of status) if (x.state === "error" && !shown.has(id)) { shown.add(id); UI.toast(x.say, { kind: "error", ms: 9000 }); }
    } finally { if (busy === my) busy = 0; }
    return got;
  }
  let timer = null;
  function soon() { if (!timer && list().length) timer = setInterval(() => { if (!list().length) { clearInterval(timer); timer = null; return; } check(); }, EVERY); }
  window.addEventListener("load", () => { setTimeout(check, 3000); soon(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
  // back to the page from another app, or the network is back
  window.addEventListener("pageshow", () => check());
  window.addEventListener("focus", () => check());
  window.addEventListener("online", () => check());

  return { send, check, pending, list, status: (id) => status.get(id) || null, BRANCH, ANSWERS, testKey: (jwk) => { PUB = jwk; } };
})();
