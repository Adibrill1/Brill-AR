// Brill-AR publish server: per-artwork stable links.
// Plain Node.js (>=18), zero dependencies. Storage: JSON files under ./data.
//
// Security model:
// - Publishing requires a shared secret (PUBLISH_TOKEN env). No token configured = publishing disabled (fail closed).
// - Viewing (/e/<id>, GET /api/experiences/<id>) is public: links are meant to be shared.
// - Uploads are size-limited, schema-validated, and restricted to known media data-URL types.
// - Stored JSON is served with nosniff; the player page embeds only the server-generated id, never user content.
// Production needs: any always-on Node host + HTTPS domain. Set PUBLISH_TOKEN to a long random string.
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(__dirname, "data");
const STUDIO = path.join(ROOT, "studio");
const PORT = process.env.PORT || 8787;
const MAX_BODY = 40 * 1024 * 1024;        // export JSON embeds media as data URLs
const MAX_ASSET_BYTES = 15 * 1024 * 1024; // per decoded asset
const MAX_EXPERIENCES = 500;
const MAX_ELEMENTS = 60;
const PUBLISH_TOKEN = process.env.PUBLISH_TOKEN || "";
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 30; // publishes per IP per hour
const rateLog = new Map();

fs.mkdirSync(DATA, { recursive: true });

const EL_TYPES = new Set(["video", "image", "sound", "text", "model", "particles", "group"]);
const ASSET_MIME = /^data:(image\/png|image\/jpeg|image\/webp|image\/gif|video\/mp4|video\/webm|audio\/mpeg|audio\/wav|audio\/x-wav|audio\/mp4|audio\/x-m4a|audio\/ogg|model\/gltf-binary|application\/octet-stream);base64,/;
const NUM_FIELDS = ["x", "y", "w", "h", "rot", "z", "volume", "opacity", "aspect", "size"];

function send(res, code, body, type) {
  res.writeHead(code, {
    "content-type": type || "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "x-content-type-options": "nosniff",
  });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on("data", (c) => { size += c.length; if (size > MAX_BODY) { const e = new Error("too large"); e.code = 413; reject(e); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
function safeId(id) { return /^[a-z0-9-]{4,64}$/.test(id || "") ? id : null; }
function tokenOk(req) {
  if (!PUBLISH_TOKEN) return false; // fail closed
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
  if (!m) return false;
  const a = Buffer.from(m[1]), b = Buffer.from(PUBLISH_TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function rateOk(ip) {
  const now = Date.now();
  const log = (rateLog.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (log.length >= RATE_MAX) { rateLog.set(ip, log); return false; }
  log.push(now); rateLog.set(ip, log); return true;
}
function validateExport(o) {
  if (!o || typeof o !== "object") return "not an object";
  if (o.format !== "ar-studio/1") return "bad format";
  if (!Array.isArray(o.elements)) return "elements missing";
  if (o.elements.length > MAX_ELEMENTS) return "too many elements";
  for (const [i, el] of o.elements.entries()) {
    if (!el || typeof el !== "object") return "element " + i + " not an object";
    if (!EL_TYPES.has(el.type)) return "element " + i + ": unsupported type " + JSON.stringify(el.type);
    for (const f of NUM_FIELDS) if (el[f] != null && typeof el[f] !== "number") return "element " + i + ": bad " + f;
    if (el.track != null && typeof el.track !== "string") return "element " + i + ": bad track";
    if (el.text != null && String(el.text).length > 2000) return "element " + i + ": text too long";
    if ((el.onTap === "url" || el.onTap === "link") && el.tapUrl && !/^(https:\/\/|mailto:|tel:)/.test(el.tapUrl)) return "element " + i + ": tap link must be https/mailto/tel";
    if (el.name != null) el.name = String(el.name).slice(0, 120);
  }
  { // group integrity: children exist, no nesting, single membership
    const ids = new Set(o.elements.map((e) => e && e.id).filter((x) => typeof x === "string"));
    const member = new Set();
    for (const [i, el] of o.elements.entries()) {
      if (el.type !== "group") continue;
      if (!Array.isArray(el.children) || !el.children.length || el.children.length > 60) return "element " + i + ": bad group children";
      for (const cid of el.children) {
        if (typeof cid !== "string" || !ids.has(cid)) return "element " + i + ": unknown group child";
        const ch = o.elements.find((e) => e && e.id === cid);
        if (ch && ch.type === "group") return "element " + i + ": nested groups not supported";
        if (member.has(cid)) return "element " + i + ": child in two groups";
        member.add(cid);
      }
    }
  }
  if (o.tracks != null) {
    if (!Array.isArray(o.tracks) || o.tracks.length > 12) return "bad tracks";
    for (const t of o.tracks) {
      if (!t || typeof t !== "object" || typeof t.id !== "string" || t.id.length > 64) return "bad track entry";
      if (t.name != null) t.name = String(t.name).slice(0, 120);
      if (t.loop != null && typeof t.loop !== "boolean") return "bad track loop";
      if (t.autoStart != null && typeof t.autoStart !== "boolean") return "bad track autoStart";
    }
  }
  if (o.sequences != null) {
    if (!Array.isArray(o.sequences) || o.sequences.length > 24) return "bad sequences";
    for (const q of o.sequences) {
      if (!q || typeof q !== "object" || typeof q.id !== "string" || q.id.length > 64) return "bad sequence entry";
      if (q.name != null) q.name = String(q.name).slice(0, 120);
      if (q.loop != null && typeof q.loop !== "boolean") return "bad sequence loop";
      if (q.autoNext != null && (typeof q.autoNext !== "object" || typeof q.autoNext.at !== "number" || q.autoNext.at < 0 || q.autoNext.at > 3600 || (q.autoNext.to != null && typeof q.autoNext.to !== "string"))) return "bad sequence autoNext";
    }
  }
  const assets = o.assets || {};
  for (const [k, v] of Object.entries(assets)) {
    if (typeof v !== "string") return "asset " + k + " not a data URL";
    if (!ASSET_MIME.test(v)) return "asset " + k + ": unsupported media type";
    const b64 = v.slice(v.indexOf(",") + 1);
    if (Math.floor(b64.length * 0.75) > MAX_ASSET_BYTES) return "asset " + k + " too large";
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  try {
    if (req.method === "OPTIONS") return send(res, 204, "");
    if ((req.method === "POST" || req.method === "DELETE") && u.pathname.startsWith("/api/")) {
      if (!PUBLISH_TOKEN) return send(res, 503, { error: "publishing disabled on this server" });
      if (!tokenOk(req)) return send(res, 401, { error: "unauthorized" });
      if (!rateOk(req.socket.remoteAddress || "?")) return send(res, 429, { error: "rate limited" });
    }
    if (req.method === "POST" && u.pathname === "/api/experiences") {
      const raw = await readBody(req);
      let o;
      try { o = JSON.parse(raw.toString("utf8")); } catch { return send(res, 400, { error: "bad json" }); }
      const err = validateExport(o);
      if (err) return send(res, 400, { error: err });
      if (fs.readdirSync(DATA).length >= MAX_EXPERIENCES) return send(res, 507, { error: "store full" });
      const id = safeId(o.slug) || crypto.randomBytes(5).toString("hex");
      fs.writeFileSync(path.join(DATA, id + ".json"), JSON.stringify(o));
      return send(res, 200, { id, url: "/e/" + id });
    }
    if (req.method === "DELETE" && u.pathname.startsWith("/api/experiences/")) {
      const id = safeId(u.pathname.split("/")[3]);
      const f = id && path.join(DATA, id + ".json");
      if (!f || !fs.existsSync(f)) return send(res, 404, { error: "not found" });
      fs.unlinkSync(f);
      return send(res, 200, { ok: true });
    }
    if (req.method === "GET" && u.pathname.startsWith("/api/experiences/")) {
      const id = safeId(u.pathname.split("/")[3]);
      if (!id) return send(res, 400, { error: "bad id" });
      const f = path.join(DATA, id + ".json");
      if (!fs.existsSync(f)) return send(res, 404, { error: "not found" });
      return send(res, 200, fs.readFileSync(f));
    }
    if (req.method === "POST" && u.pathname === "/api/convert/mov") {
      if (server.convertingMov) return send(res, 429, { error: "conversion busy" });
      server.convertingMov = true;
      try {
        const body = await readBody(req);
        if (body.length > 20 * 1024 * 1024) return send(res, 413, { error: "MOV too large" });
        const converted = await require("./media-convert").movToMp4(body);
        return send(res, 200, converted, "video/mp4");
      } catch (err) { return send(res, 422, { error: err.message }); }
      finally { server.convertingMov = false; }
    }
    if (req.method === "GET" && u.pathname.startsWith("/e/")) {
      const id = safeId(u.pathname.split("/")[2]);
      if (!id || !fs.existsSync(path.join(DATA, id + ".json"))) return send(res, 404, "לא נמצא", "text/plain; charset=utf-8");
      const html = fs.readFileSync(path.join(STUDIO, "play.html"), "utf8")
        .replace("</body>", `<script>window.__REMOTE_EXPERIENCE__=${JSON.stringify(id)};</script></body>`);
      return send(res, 200, html, "text/html; charset=utf-8");
    }
    if (req.method === "GET") {
      const rel = path.normalize(u.pathname).replace(/^([/\\])+/, "");
      const f = path.join(STUDIO, rel);
      if (!f.startsWith(STUDIO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return send(res, 404, "not found", "text/plain");
      const ext = path.extname(f);
      const type = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json" }[ext] || "application/octet-stream";
      return send(res, 200, fs.readFileSync(f), type);
    }
    send(res, 405, { error: "method" });
  } catch (e) {
    if (e && e.code === 413) return send(res, 413, { error: "upload too large" });
    send(res, 500, { error: String(e && e.message || e) });
  }
});
if (require.main === module) server.listen(PORT, () => console.log("brill-ar publish server on :" + PORT + (PUBLISH_TOKEN ? " (auth on)" : " (publishing DISABLED - set PUBLISH_TOKEN)")));
module.exports = server;
