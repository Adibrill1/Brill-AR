// Brill-AR publish server: per-artwork stable links.
// Plain Node.js (>=18), zero dependencies. Storage: JSON files under ./data.
// Production needs: any always-on Node host (small VPS / free worker tier) + HTTPS domain.
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(__dirname, "data");
const STUDIO = path.join(ROOT, "studio");
const PORT = process.env.PORT || 8787;
const MAX_BODY = 40 * 1024 * 1024; // export JSON embeds media as data URLs

fs.mkdirSync(DATA, { recursive: true });

function send(res, code, body, type) {
  res.writeHead(code, { "content-type": type || "application/json; charset=utf-8", "access-control-allow-origin": "*" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on("data", (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error("too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
function safeId(id) { return /^[a-z0-9-]{4,64}$/.test(id || "") ? id : null; }

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  try {
    if (req.method === "OPTIONS") return send(res, 204, "");
    // Publish or update an experience export. Body: the studio export JSON.
    if (req.method === "POST" && u.pathname === "/api/experiences") {
      const raw = await readBody(req);
      const o = JSON.parse(raw.toString("utf8"));
      if (!o || o.format !== "ar-studio/1") return send(res, 400, { error: "bad format" });
      const id = safeId(o.slug) || crypto.randomBytes(5).toString("hex");
      fs.writeFileSync(path.join(DATA, id + ".json"), JSON.stringify(o));
      return send(res, 200, { id, url: "/e/" + id });
    }
    if (req.method === "GET" && u.pathname.startsWith("/api/experiences/")) {
      const id = safeId(u.pathname.split("/")[3]);
      if (!id) return send(res, 400, { error: "bad id" });
      const f = path.join(DATA, id + ".json");
      if (!fs.existsSync(f)) return send(res, 404, { error: "not found" });
      return send(res, 200, fs.readFileSync(f));
    }
    // Stable per-artwork page: the hosted player, loading its experience by id.
    if (req.method === "GET" && u.pathname.startsWith("/e/")) {
      const id = safeId(u.pathname.split("/")[2]);
      if (!id || !fs.existsSync(path.join(DATA, id + ".json"))) return send(res, 404, "לא נמצא", "text/plain; charset=utf-8");
      const html = fs.readFileSync(path.join(STUDIO, "play.html"), "utf8")
        .replace("</body>", `<script>window.__REMOTE_EXPERIENCE__=${JSON.stringify(id)};</script></body>`);
      return send(res, 200, html, "text/html; charset=utf-8");
    }
    // Static studio files (player runtime).
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
    send(res, 500, { error: String(e && e.message || e) });
  }
});
if (require.main === module) server.listen(PORT, () => console.log("brill-ar publish server on :" + PORT));
module.exports = server;
