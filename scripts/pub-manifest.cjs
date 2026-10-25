#!/usr/bin/env node
/* Local published-scene manifest: id + sha256 + bytes per scene, written OUTSIDE the
 * deployed site dir (.pub-manifest.local.json, gitignored) as a deploy-time verification
 * artifact. The manifest is NOT deployed: the public site must not enumerate scene ids.
 * The private register repo holds the authoritative manifest. Also removes any stale
 * studio/pub/manifest.json so it can never be uploaded. */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const pubDir = process.env.PUB_DIR || path.join(__dirname, "../studio/pub");
const out = process.env.PUB_MANIFEST_OUT || path.join(__dirname, "../.pub-manifest.local.json");
const files = fs.existsSync(pubDir) ? fs.readdirSync(pubDir).filter((f) => f !== "manifest.json" && /^[a-zA-Z0-9_-]{1,64}\.json$/.test(f)) : [];
const scenes = files.sort().map((f) => { const buf = fs.readFileSync(path.join(pubDir, f)); return { id: f.slice(0, -5), sha256: crypto.createHash("sha256").update(buf).digest("hex"), bytes: buf.length }; });
const stale = path.join(pubDir, "manifest.json");
if (fs.existsSync(stale)) fs.rmSync(stale);
fs.writeFileSync(out, JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), scenes }, null, 1) + "\n");
console.log("local manifest (not deployed):", scenes.length, "scene(s)", scenes.map((s) => s.id).join(", ") || "(empty)");
