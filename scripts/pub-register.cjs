#!/usr/bin/env node
// pub-register: durable private backup of the published-scene set.
// The register is a git repo holding manifest.json + scenes/<id>.json.
// Live usage: BRILL_AR_REGISTER_URL=https://x@github.com/adibrill-instinct/brill-ar-published.git
// with the PAT supplied via GIT_ASKPASS (vault write-file in the deploy runbook).
// Tests use a file:// bare repo - no credential needed.
const { execFile } = require("child_process");
const fs = require("fs"), path = require("path"), os = require("os"), crypto = require("crypto");
const ROOT = process.env.PUB_DIR || path.join(__dirname, "..", "studio", "pub");
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const git = (args, cwd) => new Promise((res, rej) => execFile("git", args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }, (e, so, se) => e ? rej(new Error((se || e.message).slice(0, 400))) : res(so)));

async function recoverFromRegister(url) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pub-reg-"));
  try {
    await git(["clone", "--quiet", "--depth", "1", url, tmp], process.cwd());
    const manifestPath = path.join(tmp, "manifest.json");
    if (!fs.existsSync(manifestPath)) throw new Error("register has no manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    fs.mkdirSync(ROOT, { recursive: true });
    const restored = [];
    for (const s of manifest.scenes || []) {
      const p = path.join(tmp, "scenes", s.id + ".json");
      if (!fs.existsSync(p)) throw new Error("register missing scene " + s.id);
      const bytes = fs.readFileSync(p);
      if (sha256(bytes) !== s.sha256) throw new Error("register scene tampered: " + s.id);
      fs.writeFileSync(path.join(ROOT, s.id + ".json"), bytes);
      restored.push(s.id);
    }
    return { ok: true, restored };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

async function syncToRegister(url) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pub-reg-"));
  try {
    await git(["clone", "--quiet", url, tmp], process.cwd());
    fs.mkdirSync(path.join(tmp, "scenes"), { recursive: true });
    const scenes = [];
    for (const f of fs.readdirSync(ROOT)) {
      if (!f.endsWith(".json") || f === "manifest.json") continue;
      const bytes = fs.readFileSync(path.join(ROOT, f));
      fs.writeFileSync(path.join(tmp, "scenes", f), bytes);
      scenes.push({ id: f.replace(/\.json$/, ""), sha256: sha256(bytes), bytes: bytes.length });
    }
    // drop register scenes no longer published
    for (const f of fs.readdirSync(path.join(tmp, "scenes"))) if (!scenes.some((s) => s.id + ".json" === f)) fs.rmSync(path.join(tmp, "scenes", f));
    fs.writeFileSync(path.join(tmp, "manifest.json"), JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), scenes }, null, 1) + "\n");
    await git(["add", "-A"], tmp);
    const dirty = await git(["status", "--porcelain"], tmp);
    if (!dirty.trim()) return { ok: true, changed: false, scenes: scenes.length };
    await git(["-c", "user.name=brill-ar-deploy", "-c", "user.email=deploy@local", "commit", "--quiet", "-m", "register sync: " + scenes.length + " scene(s)"], tmp);
    await git(["push", "--quiet", "origin", "HEAD"], tmp);
    return { ok: true, changed: true, scenes: scenes.length };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

module.exports = { recoverFromRegister, syncToRegister };
if (require.main === module) (async () => {
  const mode = process.argv[2];
  const url = process.env.BRILL_AR_REGISTER_URL || process.argv[3];
  if (!url) { console.error("register URL required (BRILL_AR_REGISTER_URL or argv)"); process.exit(2); }
  if (mode === "recover") { const r = await recoverFromRegister(url); console.log("register recover OK:", r.restored.join(", ") || "(none)"); }
  else if (mode === "sync") { const r = await syncToRegister(url); console.log("register sync OK:", r.scenes, "scene(s),", r.changed ? "pushed" : "no change"); }
  else { console.error("usage: pub-register.cjs recover|sync [url]"); process.exit(2); }
})().catch((e) => { console.error("register " + process.argv[2] + " FAILED: " + e.message); process.exit(1); });
