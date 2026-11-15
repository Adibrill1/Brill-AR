"use strict";
/* Portal: the creations Adi publishes for viewers, and the one viewer address that shows them (view.html).
   Where they live: an orphan branch "published" of the site's own public GitHub repository, so publishing never
   touches the site's code branch and never starts a site deploy. The phone writes it with Adi's own token through
   GitHub's Git Data API (the same "Contents" permission): every publish, update or removal is ONE commit that changes
   the media, the creation's file and the catalogue together, and it lands only if nobody moved the branch meanwhile
   (otherwise it is read again and redone), so a cut-off upload can never leave a catalogue that points at missing files.
   Viewers read with plain GETs from raw.githubusercontent.com (public, CORS-open, cached about 5 minutes; a query
   string does not get past that cache), with jsDelivr as a second door.
   Layout of the branch:
     index.json              the catalogue: one entry per published creation (name, link id, files, trigger fingerprint,
                             and the small corner descriptions the viewer recognises the artwork by: recognize.js)
     c/<id>/<rev>.json       the creation (the editor's export, with media as references, not embedded)
     m/<git blob sha>.<ext>  media, named by their content: never rewritten, shared between versions, safe to cache
   Media and creation files never change under their names, so viewers keep them in the browser's Cache Storage: a second
   visit, or a return to an earlier room, needs no download. The catalogue is always read fresh.
   An entry may carry a room (free text, "חדר" / "קבוצה" in the editor): the viewer downloads the other creations of the
   room in the background while one of them is shown (an exhibition of 50 in rooms of 5).
   The link id of an entry stays when its creation is replaced by another version with the same artwork, so a printed
   QR keeps working. */
window.Portal = (() => {
  const CFG = { owner: "Adibrill1", repo: "Brill-AR", branch: "published", site: "https://adibrill1.github.io/Brill-AR/" };
  const raw = () => "https://raw.githubusercontent.com/" + CFG.owner + "/" + CFG.repo + "/" + CFG.branch + "/";
  const cdn = () => "https://cdn.jsdelivr.net/gh/" + CFG.owner + "/" + CFG.repo + "@" + CFG.branch + "/";
  const api = () => "https://api.github.com/repos/" + CFG.owner + "/" + CFG.repo;
  const MB = 1048576;
  // One media file at most 50MB and a creation at most 100MB: the editor's own limits (Studio.LIMITS), so whatever she can
  // make she can publish. GitHub takes a blob of up to 100MB (sent as base64, ~67MB for a 50MB file, streamed from a
  // Blob so the phone never holds it as one string); raw.githubusercontent serves it whole. jsDelivr, the second door,
  // serves files of up to 20MB only, so a bigger file has the one door. BIG: above this a publish says it will be slow
  // for viewers on mobile data. ROOM: GitHub asks repositories to stay under 1GB; the sheet says how much is left.
  const LIM = { file: 50 * MB, total: 100 * MB, big: 40 * MB, scene: 4 * MB, catalogue: 12 * MB, items: 2000, room: 1024 * MB };
  const ID = /^[A-Za-z0-9_-]{4,64}$/, MEDIA = /^m\/[0-9a-f]{40}\.[a-z0-9]{1,5}$/, SCENE = /^c\/[A-Za-z0-9_-]{4,64}\/[a-z0-9]{1,16}\.json$/;
  const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "audio/wav": "wav", "audio/x-wav": "wav", "audio/ogg": "ogg", "model/gltf-binary": "glb" };
  const TYPE = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav", ogg: "audio/ogg", glb: "model/gltf-binary", bin: "application/octet-stream" };

  // ---------- the viewer address ----------
  // From the live site the link points at the site itself; from anywhere else (a test, a local copy) at the live site.
  function viewURL(id) {
    const base = /\.github\.io$/.test(location.hostname) ? new URL("view.html", location.href).href : CFG.site + "view.html";
    return id ? base + "#" + encodeURIComponent(id) : base;
  }

  // ---------- catalogue ----------
  const emptyCatalogue = () => ({ format: "brill-portal/1", updated: 0, items: [] });
  // A room label as stored: one line, single spaces, at most 40 characters ("" = none)
  const cleanRoom = (r) => (typeof r === "string" ? r.replace(/\s+/g, " ").trim().slice(0, 40) : "");
  // Keeps only well-formed entries: the catalogue is read by every viewer, so nothing in it is trusted blindly.
  function cleanCatalogue(o) {
    const out = emptyCatalogue();
    if (!o || o.format !== "brill-portal/1" || !Array.isArray(o.items)) return out;
    out.updated = Number(o.updated) || 0;
    const seen = new Set();
    for (const it of o.items.slice(0, LIM.items)) {
      const t = it && it.trigger;
      if (!it || !ID.test(it.id) || seen.has(it.id) || typeof it.name !== "string" || !SCENE.test(it.scene) || !Array.isArray(it.files) || !it.files.every((f) => MEDIA.test(f))) continue;
      if (it.thumb != null && !MEDIA.test(it.thumb)) continue;
      if (!t || !/^[0-9a-f]{64}$/.test(t.sha) || typeof t.fp !== "string" || !/^[0-9a-f]{0,128}$/.test(t.fp) || (t.f != null && (typeof t.f !== "string" || t.f.length > 60000 || !/^[A-Za-z0-9+/=]*$/.test(t.f)))) continue;
      seen.add(it.id);
      out.items.push({ id: it.id, src: typeof it.src === "string" ? it.src.slice(0, 64) : "", name: it.name.slice(0, 120), rev: String(it.rev || "").slice(0, 16), scene: it.scene, files: it.files.slice(0, 200), thumb: it.thumb || null,
        bytes: Number(it.bytes) || 0, at: Number(it.at) || 0, trigger: { sha: t.sha, fp: t.fp, fpe: Number(t.fpe) || 0, ph: /^[0-9a-f]{16}$/.test(t.ph) ? t.ph : "", f: t.f || "" } });
      const room = cleanRoom(it.room); if (room) out.items[out.items.length - 1].room = room;
    }
    return out;
  }
  async function getCapped(url, cap, opts) {
    const r = await fetch(url, Object.assign({ cache: "no-cache" }, opts));
    if (!r.ok) { const e = new Error("http " + r.status); e.status = r.status; throw e; }
    if (Number(r.headers.get("content-length")) > cap) throw new Error("too large");
    if (!r.body || !r.body.getReader) { const b = await r.blob(); if (b.size > cap) throw new Error("too large"); return b; }
    const rd = r.body.getReader(), parts = []; let n = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; n += value.byteLength; if (n > cap) { try { rd.cancel(); } catch (e) {} throw new Error("too large"); } parts.push(value); if (opts && opts.onBytes) opts.onBytes(value.byteLength); }
    return new Blob(parts);
  }
  // Viewers: the public copy (up to ~5 minutes behind). A branch that does not exist yet is an empty portal.
  // fresh: ask GitHub's API instead (current, but limited to 60 reads an hour per network): used when a direct link
  // names an id the public copy does not know yet.
  async function readCatalogue(opts) {
    const o = opts || {};
    if (o.fresh) {
      try { return cleanCatalogue(JSON.parse(await (await getCapped(api() + "/contents/index.json?ref=" + CFG.branch, LIM.catalogue, { cache: "no-store", headers: { Accept: "application/vnd.github.raw" } })).text())); }
      catch (e) { if (e.status === 404) return emptyCatalogue(); throw e; }
    }
    let last;
    for (const base of [raw(), cdn()]) {
      try { return cleanCatalogue(JSON.parse(await (await getCapped(base + "index.json", LIM.catalogue)).text())); }
      catch (e) { if (e.status === 404 && base === raw()) return emptyCatalogue(); last = e; }
    }
    throw last;
  }
  // ---------- the viewer's own copy of files (Cache Storage) ----------
  // Kept under the raw address whichever door they came from. Nothing here is needed: without Cache Storage (an old
  // browser, a private window, a full phone) files are simply downloaded.
  const CACHE = "brill-portal-files-v1", lasting = (path) => MEDIA.test(path) || SCENE.test(path);
  const box = () => (typeof caches !== "undefined" ? caches.open(CACHE) : Promise.reject(new Error("no cache")));
  async function fromBox(path) { try { const r = await (await box()).match(raw() + path); return r ? await r.blob() : null; } catch (e) { return null; } }
  const toBox = (path, blob) => box().then((c) => c.put(raw() + path, new Response(blob, { headers: { "content-type": blob.type || TYPE[path.split(".").pop()] || "application/octet-stream" } }))).catch(() => {});
  async function inBox(path) { try { return !!(await (await box()).match(raw() + path)); } catch (e) { return false; } }
  // Files no entry of cat needs any more are let go (creations removed or replaced since an earlier visit)
  async function pruneBox(cat) {
    try {
      const keep = new Set(); for (const it of cat.items) { keep.add(it.scene); it.files.forEach((f) => keep.add(f)); }
      const c = await box(), base = raw();
      for (const req of await c.keys()) { const path = req.url.startsWith(base) ? req.url.slice(base.length) : ""; if (!keep.has(path)) await c.delete(req); }
    } catch (e) {}
  }
  // A media file or creation file by its path: immutable, so either door will do (and the copy kept from before first).
  const flying = new Map(); // path -> the download under way (fetching ahead and showing never download a file twice at once)
  function getFile(path, cap, onBytes) {
    if (flying.has(path)) return flying.get(path).then((b) => { if (b.size > cap) throw new Error("too large"); if (onBytes) onBytes(b.size); return b; });
    const p = getFile1(path, cap, onBytes); flying.set(path, p);
    p.then(() => flying.delete(path), () => flying.delete(path));
    return p;
  }
  async function getFile1(path, cap, onBytes) {
    if (lasting(path)) { const b = await fromBox(path); if (b && b.size <= cap) { if (onBytes) onBytes(b.size); return b; } }
    let last;
    for (const base of [raw(), cdn()]) {
      try { const b = await getCapped(base + path, cap, { cache: "default", onBytes }); if (lasting(path)) toBox(path, b); return b; }
      catch (e) { last = e; if (e.message === "too large") throw e; }
    }
    throw last;
  }
  // A creation's files fetched ahead into Cache Storage only (nothing kept in memory). Resolves to the bytes actually
  // downloaded (0 when everything was there already). opts.stop(): asked between files; true ends it early.
  async function warm(item, opts) {
    const o = opts || {}; let n = 0;
    const scene = await inBox(item.scene) ? await fromBox(item.scene) : await getFile(item.scene, LIM.scene, (k) => { n += k; });
    const refs = Object.values(JSON.parse(await scene.text()).assets || {});
    for (const r of refs) {
      if (o.stop && o.stop()) break;
      if (!r || !MEDIA.test(r.file) || !(r.size >= 0) || await inBox(r.file)) continue;
      await getFile(r.file, Math.min(LIM.file + MB, r.size + 1024), (k) => { n += k; });
    }
    return n;
  }
  // A published creation, ready for the AR scene. Nothing is saved on the viewer's phone.
  async function loadCreation(item, onProgress) {
    const o = JSON.parse(await (await getFile(item.scene, LIM.scene)).text());
    if (!o || typeof o.assets !== "object") throw new Error("bad scene");
    const refs = Object.entries(o.assets);
    let total = 0; for (const [, r] of refs) { if (!r || !MEDIA.test(r.file) || !(r.size >= 0)) throw new Error("bad asset reference"); total += r.size; }
    if (total > LIM.total + MB) throw new Error("too large");
    let got = 0; const tick = (n) => { got += n; if (onProgress) onProgress(Math.min(1, got / Math.max(1, total))); };
    const assets = {};
    for (const [id, r] of refs) { const b = await getFile(r.file, Math.min(LIM.file + MB, r.size + 1024), tick); assets[id] = new Blob([b], { type: TYPE[r.file.split(".").pop()] || r.type || "application/octet-stream" }); }
    o.assets = {};
    return Studio.importPublished(o, assets);
  }

  // ---------- trigger fingerprint ----------
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  // Perceptual hash (pHash): the picture at 32x32 in grey, its lowest 8x8 cosine frequencies (without the flat one),
  // each above or below their median: 64 bits that stay put when the picture is resized, recompressed or slightly
  // recoloured (the editor's dHash moves too much for that), and differ in about half the bits for another picture.
  function phash(img) {
    const N = 32, c = document.createElement("canvas"); c.width = c.height = N;
    const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0, N, N);
    const d = g.getImageData(0, 0, N, N).data, v = new Float64Array(N * N);
    for (let i = 0; i < N * N; i++) v[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    const cos = (k, x) => Math.cos(((2 * x + 1) * k * Math.PI) / (2 * N)), f = [];
    for (let u = 0; u < 8; u++) for (let w = 0; w < 8; w++) {
      if (!u && !w) continue;
      let s = 0; for (let y = 0; y < N; y++) { const cy = cos(u, y); for (let x = 0; x < N; x++) s += v[y * N + x] * cy * cos(w, x); }
      f.push(s);
    }
    const med = [...f].sort((a, b) => a - b)[f.length >> 1];
    let out = ""; for (let i = 0; i < 64; i += 4) { let n = 0; for (let k = 0; k < 4; k++) n = (n << 1) | ((f[i + k] || 0) > med ? 1 : 0); out += n.toString(16); }
    return out;
  }
  const bits = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) { let x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { n += x & 1; x >>= 1; } } return n; };
  // exact: SHA-256 of the artwork file; perceptual: pHash (and the editor's dHash as a second opinion), so the same
  // picture saved again, smaller or recompressed, is still the same trigger.
  async function trigger(rec) {
    const art = rec && rec.assets && rec.assets.__artwork; if (!art) return null;
    const sha = hex(await crypto.subtle.digest("SHA-256", await art.arrayBuffer()));
    let fp = rec.target && rec.target.fp, ph = rec.target && rec.target.ph, img = null;
    if (!fp || !fp.hex || !ph) { img = await Studio.loadImageBlob(art); if (!fp || !fp.hex) fp = Studio.artworkFingerprint(img); if (!ph) ph = phash(img); }
    return { sha, fp: fp.hex, fpe: fp.entropy, ph };
  }
  const SAME_D = 12, SAME_P = 10; // dHash: of 240 bits; pHash: of 64 bits (another picture differs in about 32)
  function sameArtwork(a, b) { // {fp(hex), fpe, ph}
    if (!a || !b) return false;
    if (a.ph && b.ph && /^[0-9a-f]{16}$/.test(a.ph) && /^[0-9a-f]{16}$/.test(b.ph) && bits(a.ph, b.ph) <= SAME_P) return true;
    return Studio.fingerprintDistance({ hex: a.fp, entropy: a.fpe }, { hex: b.fp, entropy: b.fpe }) <= SAME_D;
  }
  function sameTrigger(a, b) { return !!a && !!b && ((a.sha && a.sha === b.sha) || sameArtwork(a, b)); }

  // ---------- the token (this phone only) ----------
  const TOKEN_KEY = "brill-portal-token";
  const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; } };
  const setToken = (t) => { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (e) {} };
  const looksLikeToken = (t) => /^(github_pat_[A-Za-z0-9_]{20,255}|gh[ps]_[A-Za-z0-9]{30,255})$/.test(t);

  // ---------- GitHub API ----------
  function fail(text, status) { const e = new Error(text); e.status = status; e.portal = true; return e; }
  async function gh(token, method, path, body) {
    let r;
    try {
      r = await fetch(api() + path, { method, cache: "no-store", headers: Object.assign({ Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }, body ? { "Content-Type": "application/json" } : {}), body: body ? (body instanceof Blob ? body : JSON.stringify(body)) : undefined });
    } catch (e) { throw fail("אין חיבור לרשת כרגע. אפשר לנסות שוב כשיש קליטה.", 0); }
    if (r.ok) return r.status === 204 ? null : r.json();
    let msg = ""; try { msg = (await r.json()).message || ""; } catch (e) {}
    if (r.status === 401) throw fail("הטוקן לא מתאים או שפג תוקפו. צריך להדביק טוקן חדש בהגדרות הפרסום.", 401);
    if (r.status === 403 && /rate limit/i.test(msg)) throw fail("GitHub מבקש לחכות מעט. אפשר לנסות שוב בעוד כמה דקות.", 429);
    if (r.status === 403 || (r.status === 404 && method !== "GET")) throw fail("לטוקן אין הרשאה לכתוב במאגר " + CFG.repo + ". בהגדרות הטוקן צריך לבחור את המאגר הזה ו־Contents: Read and write.", 403);
    if (r.status === 413) throw fail("הקובץ גדול מדי בשביל GitHub.", 413);
    const e = fail("GitHub לא קיבל את הבקשה (" + r.status + "). אפשר לנסות שוב.", r.status); e.detail = msg; throw e;
  }
  // Checks a token before it is kept: it must see the repository.
  async function checkToken(token) {
    const repo = await gh(token, "GET", "");
    if (!repo || repo.full_name.toLowerCase() !== (CFG.owner + "/" + CFG.repo).toLowerCase()) throw fail("הטוקן לא רואה את המאגר " + CFG.repo + ".", 404);
    return true;
  }
  const b64text = (s) => { const u = new TextEncoder().encode(s); let b = ""; for (let i = 0; i < u.length; i += 0x8000) b += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(b); };
  const textB64 = (b) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s+/g, "")), (c) => c.charCodeAt(0)));
  const blobB64 = (blob) => Studio.blobToDataURL(blob).then((d) => d.slice(d.indexOf(",") + 1));
  // The request body for POST /git/blobs as a Blob: the file is turned into base64 3MB at a time (a whole number of
  // 3-byte groups, so the pieces join into one valid base64 text), and only one piece is a string at any moment.
  async function blobBody(blob) {
    const parts = ['{"encoding":"base64","content":"'], step = 3 * MB;
    for (let i = 0; i < blob.size; i += step) parts.push(await blobB64(blob.slice(i, i + step)));
    parts.push('"}');
    return new Blob(parts, { type: "application/json" });
  }
  // How full the repository is (GitHub's own count, in KB, refreshed by GitHub now and then)
  async function room(token) {
    const repo = await gh(token || getToken(), "GET", "");
    const used = (Number(repo && repo.size) || 0) * 1024;
    return { used, left: Math.max(0, LIM.room - used) };
  }
  // git's own name for a file: sha1("blob <size>\0" + bytes); media are stored under it, so the same file is never sent twice
  async function gitSha(blob) {
    const head = new TextEncoder().encode("blob " + blob.size + "\0");
    return hex(await crypto.subtle.digest("SHA-1", await new Blob([head, blob]).arrayBuffer()));
  }
  // The branch's current state: commit, tree (path -> sha) and catalogue, all of the same commit.
  async function readHead(token) {
    let ref;
    try { ref = await gh(token, "GET", "/git/ref/heads/" + CFG.branch); }
    catch (e) { if (e.status !== 404) throw e; return { head: null, tree: null, paths: new Map(), cat: emptyCatalogue() }; }
    const head = ref.object.sha, commit = await gh(token, "GET", "/git/commits/" + head), t = await gh(token, "GET", "/git/trees/" + commit.tree.sha + "?recursive=1");
    const paths = new Map(t.tree.filter((x) => x.type === "blob").map((x) => [x.path, x.sha]));
    let cat = emptyCatalogue();
    if (paths.has("index.json")) cat = cleanCatalogue(JSON.parse(textB64((await gh(token, "GET", "/git/blobs/" + paths.get("index.json"))).content)));
    return { head, tree: commit.tree.sha, paths, cat };
  }
  // The editor's own read: current, through the API (her token), so "published" is what the catalogue says right now.
  async function myCatalogue(token) { return (await readHead(token || getToken())).cat; }

  // One change to the branch as one commit. plan(cat, paths) returns {cat, put: [{path, blob}], drop: [path], message};
  // the media in put are uploaded first (unreferenced until the commit), the catalogue last, then the branch is moved
  // only if it still points where it was read (no force): if not, it is read again and planned again.
  async function commit(token, plan, onStep) {
    const sent = new Map(); // path -> blob sha, kept across retries so nothing is uploaded twice
    for (let attempt = 0; attempt < 4; attempt++) {
      const st = await readHead(token), p = await plan(st.cat, st.paths);
      const entries = [], put = p.put.filter((f) => !st.paths.has(f.path) || f.path === "index.json");
      let i = 0;
      for (const f of put) {
        i++; if (onStep) onStep({ step: "upload", i, n: put.length, path: f.path, size: f.blob.size });
        if (!sent.has(f.path)) sent.set(f.path, (await gh(token, "POST", "/git/blobs", await blobBody(f.blob))).sha);
        entries.push({ path: f.path, mode: "100644", type: "blob", sha: sent.get(f.path) });
      }
      const catText = JSON.stringify(Object.assign(p.cat, { updated: Date.now() }));
      if (catText.length > LIM.catalogue) throw fail("הקטלוג של הפורטל מלא. צריך להסיר כמה יצירות לפני שמפרסמים עוד.", 413);
      const catBlob = await gh(token, "POST", "/git/blobs", { content: b64text(catText), encoding: "base64" });
      entries.push({ path: "index.json", mode: "100644", type: "blob", sha: catBlob.sha });
      for (const d of p.drop) if (st.paths.has(d)) entries.push({ path: d, mode: "100644", type: "blob", sha: null });
      if (onStep) onStep({ step: "commit" });
      const tree = await gh(token, "POST", "/git/trees", st.tree ? { base_tree: st.tree, tree: entries } : { tree: entries });
      const c = await gh(token, "POST", "/git/commits", { message: p.message, tree: tree.sha, parents: st.head ? [st.head] : [] });
      try {
        if (st.head) await gh(token, "PATCH", "/git/refs/heads/" + CFG.branch, { sha: c.sha, force: false });
        else await gh(token, "POST", "/git/refs", { ref: "refs/heads/" + CFG.branch, sha: c.sha });
        return p.cat;
      } catch (e) {
        if (e.status !== 422 && e.status !== 409) throw e; // moved meanwhile (another tab, another phone): read again
        if (onStep) onStep({ step: "retry" });
      }
    }
    throw fail("הפורטל השתנה בזמן הפרסום כמה פעמים ברצף. אפשר לנסות שוב בעוד רגע.", 409);
  }
  // Files no remaining entry needs (after an entry is removed or replaced)
  function orphans(oldItems, keepItems) {
    const keep = new Set(); for (const it of keepItems) { keep.add(it.scene); it.files.forEach((f) => keep.add(f)); if (it.thumb) keep.add(it.thumb); }
    const out = new Set(); for (const it of oldItems) for (const f of [it.scene, ...it.files, it.thumb]) if (f && !keep.has(f)) out.add(f);
    return [...out];
  }

  // ---------- what a creation needs on the portal ----------
  async function thumbOf(img, side) {
    const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const g = c.getContext("2d", { willReadFrequently: true }); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  // The corner descriptions the viewer recognises the artwork by (from a 600px copy, as recognize.js expects)
  async function features(img) {
    const c = await thumbOf(img, 600), d = c.getContext("2d").getImageData(0, 0, c.width, c.height);
    return Recognize.pack(Recognize.artFeatures(Recognize.gray(d.data, c.width, c.height), c.width, c.height));
  }
  // Why this creation cannot go on the portal (null = it can)
  function blocker(rec) {
    if (!rec || !rec.target || !rec.assets || !rec.assets.__artwork) return "קודם מעלים את תמונת היצירה.";
    const missing = Studio.missingAssets(rec); if (missing.length) return "חסר קובץ ביצירה (" + missing[0].name + "). אפשר להעלות אותו שוב ואז לפרסם.";
    let total = 0;
    for (const id of Studio.exportedAssetIds(rec)) {
      const b = rec.assets[id]; total += b.size;
      if (b.size > LIM.file) return "קובץ אחד ביצירה גדול מ־" + mbs(LIM.file) + " (" + UI.fmtBytes(b.size) + "). בפורטל אפשר עד " + mbs(LIM.file) + " לקובץ: כדאי לקצר או להקטין את הסרטון.";
    }
    if (total > LIM.total) return "היצירה שוקלת " + UI.fmtBytes(total) + ", ובפורטל אפשר עד " + mbs(LIM.total) + " ליצירה. כדאי להקטין סרטון או להסיר קובץ.";
    return null;
  }
  const mbs = (n) => Math.round(n / MB) + "MB";
  // What publishing rec sends and leaves for viewers to download (its media, as the catalogue's `bytes` counts them)
  function weight(rec) { let n = 0; for (const id of Studio.exportedAssetIds(rec)) n += rec.assets[id].size || 0; return n; }
  // Publishes (or updates) rec. opts.replace: allowed to take the place of another published creation with the same
  // artwork. Throws {clash: entry} when there is one and replace was not allowed.
  async function publish(rec, opts, onStep) {
    const o = opts || {}, token = getToken();
    if (!token) throw fail("צריך קודם לחבר את הפורטל (הגדרה חד־פעמית).", 401);
    const why = blocker(rec); if (why) throw fail(why, 400);
    if (onStep) onStep({ step: "prepare" });
    const trig = await trigger(rec), img = await Studio.loadImageBlob(rec.assets.__artwork);
    trig.f = await features(img);
    const thumbBlob = await new Promise((r) => thumbOf(img, 360).then((c) => c.toBlob(r, "image/jpeg", 0.8)));
    const media = [];
    for (const id of Studio.exportedAssetIds(rec)) { const b = rec.assets[id]; media.push({ id, blob: b, path: "m/" + await gitSha(b) + "." + (EXT[b.type] || "bin") }); }
    const thumb = { blob: thumbBlob, path: "m/" + await gitSha(thumbBlob) + ".jpg" };
    return commit(token, async (cat) => {
      const mine = cat.items.find((i) => i.src === rec.id);
      const clash = cat.items.filter((i) => i !== mine && sameTrigger(i.trigger, trig));
      if (clash.length && !o.replace) { const e = fail("clash", 409); e.clash = clash[0]; throw e; }
      const id = mine ? mine.id : clash.length ? clash[0].id : rec.id, rev = Date.now().toString(36);
      const scene = Studio.exportObject(rec);
      for (const m of media) scene.assets[m.id] = { file: m.path, type: m.blob.type || "application/octet-stream", size: m.blob.size };
      const sceneBlob = new Blob([JSON.stringify(scene)], { type: "application/json" }), scenePath = "c/" + id + "/" + rev + ".json";
      const item = { id, src: rec.id, name: rec.name || "יצירה", rev, scene: scenePath, files: media.map((m) => m.path), thumb: thumb.path, bytes: media.reduce((s, m) => s + m.blob.size, 0), at: Date.now(), trigger: trig };
      const room = cleanRoom(o.room != null ? o.room : (mine || clash[0] || {}).room); if (room) item.room = room; // an update keeps the room
      const gone = [mine, ...clash].filter(Boolean), items = cat.items.filter((i) => !gone.includes(i)).concat(item);
      return { cat: Object.assign(cat, { items }), put: [...media, thumb, { path: scenePath, blob: sceneBlob }], drop: orphans(gone, items),
        message: (mine ? "עדכון: " : clash.length ? "החלפה: " : "פרסום: ") + item.name + " (" + id + ")" };
    }, onStep);
  }
  // The room of a published creation (by the editor's creation id or the link id): only the catalogue changes, nothing
  // is uploaded again. "" takes it out of its room.
  async function setRoom(srcOrId, room, onStep) {
    const token = getToken(); if (!token) throw fail("צריך קודם לחבר את הפורטל (הגדרה חד־פעמית).", 401);
    const r = cleanRoom(room);
    return commit(token, async (cat) => {
      const it = cat.items.find((i) => i.src === srcOrId) || cat.items.find((i) => i.id === srcOrId);
      if (!it) throw fail("היצירה כבר לא מפורסמת בפורטל.", 404);
      if (r) it.room = r; else delete it.room;
      return { cat, put: [], drop: [], message: "חדר: " + it.name + " (" + it.id + ") ← " + (r || "בלי חדר") };
    }, onStep);
  }
  // The rooms already used, most used first (the suggestions under the room field)
  const rooms = (cat) => { const n = new Map(); for (const it of (cat && cat.items) || []) if (it.room) n.set(it.room, (n.get(it.room) || 0) + 1); return [...n].sort((a, b) => b[1] - a[1]).map((x) => x[0]); };
  // Takes a creation off the portal (by the editor's creation id, or by the entry's link id)
  async function unpublish(srcOrId, onStep) {
    const token = getToken(); if (!token) throw fail("צריך קודם לחבר את הפורטל (הגדרה חד־פעמית).", 401);
    return commit(token, async (cat) => {
      const gone = cat.items.filter((i) => i.src === srcOrId || i.id === srcOrId), items = cat.items.filter((i) => !gone.includes(i));
      return { cat: Object.assign(cat, { items }), put: [], drop: orphans(gone, items), message: "הסרה: " + (gone[0] ? gone[0].name + " (" + gone[0].id + ")" : srcOrId) };
    }, onStep);
  }

  // ---------- the catalogue as last seen by this phone (for the gallery marks while offline / before the read ends) ----------
  const SEEN_KEY = "brill-portal-seen";
  function remember(cat) { try { localStorage.setItem(SEEN_KEY, JSON.stringify({ at: Date.now(), items: cat.items.map((i) => ({ id: i.id, src: i.src, name: i.name, at: i.at, room: i.room || "", trigger: { sha: i.trigger.sha, fp: i.trigger.fp, fpe: i.trigger.fpe, ph: i.trigger.ph } })) })); } catch (e) {} }
  function remembered() { try { const o = JSON.parse(localStorage.getItem(SEEN_KEY) || "null"); return o && Array.isArray(o.items) ? o : null; } catch (e) { return null; } }

  return { CFG, LIM, ID, viewURL, readCatalogue, cleanCatalogue, loadCreation, getFile, trigger, phash, sameTrigger, sameArtwork, getToken, setToken, looksLikeToken, checkToken,
    myCatalogue, publish, unpublish, setRoom, rooms, cleanRoom, warm, pruneBox, inBox, blocker, weight, room, gitSha, remember, remembered, emptyCatalogue, raw, api };
})();
