// pub-recover against the private-register model: restore, tamper abort, unreachable abort,
// divergence abort, empty no-op. Mock register = file:// bare repo seeded via pub-register sync.
const { execFileSync, execFile } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path"), crypto = require("crypto");
const assert = require("node:assert/strict");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const run = (script, env, ...args) => new Promise((res) => execFile("node", [script, ...args], { env: { ...process.env, ...env } }, (e, so, se) => res({ code: e ? e.code : 0, out: so + se })));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pubrec-"));
const register = path.join(tmp, "register.git"), pub = path.join(tmp, "pub");
execFileSync("git", ["init", "--bare", "--quiet", register]);
fs.mkdirSync(pub, { recursive: true });
const A = Buffer.from(JSON.stringify({ format: "ar-studio/1", id: "a", name: "A", elements: [], assets: {} }));
const B = Buffer.from(JSON.stringify({ format: "ar-studio/1", id: "b", name: "B", elements: [], assets: {} }));
fs.writeFileSync(path.join(pub, "scene-a.json"), A); fs.writeFileSync(path.join(pub, "scene-b.json"), B);
const env = { BRILL_AR_REGISTER_URL: register, PUB_DIR: pub };
(async () => {
  // sync local -> register, then wipe local and recover
  let r = await run("scripts/pub-register.cjs", {}); // no URL -> usage error
  assert.notEqual(r.code, 0, "sync without URL is a usage error");
  r = await run("scripts/pub-register.cjs", env, "sync");
  assert.equal(r.code, 0, "sync to register: " + r.out);
  fs.rmSync(pub, { recursive: true, force: true });
  r = await run("scripts/pub-recover.cjs", env);
  assert.equal(r.code, 0, "recover from register: " + r.out);
  assert.ok(fs.readFileSync(path.join(pub, "scene-a.json")).equals(A) && fs.readFileSync(path.join(pub, "scene-b.json")).equals(B), "byte-exact restore");
  console.log("PASS register sync + clean-checkout recover restores byte-exact");
  // tamper: change a scene in the register without updating its manifest
  const wc = path.join(tmp, "wc"); execFileSync("git", ["clone", "--quiet", register, wc]);
  fs.writeFileSync(path.join(wc, "scenes", "scene-a.json"), Buffer.from('{"format":"ar-studio/1","tampered":true}'));
  execFileSync("git", ["-C", wc, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-aqm", "tamper"]);
  execFileSync("git", ["-C", wc, "push", "--quiet"]);
  fs.rmSync(pub, { recursive: true, force: true });
  r = await run("scripts/pub-recover.cjs", env);
  assert.notEqual(r.code, 0, "tampered register aborts");
  assert.match(r.out, /tampered|integrity|FAILED/, "abort names integrity");
  console.log("PASS tampered register scene aborts the deploy");
  // repair, then divergence: local scene the register does not list
  execFileSync("git", ["-C", wc, "checkout", "--quiet", "HEAD~1", "--", "scenes/scene-a.json"]);
  execFileSync("git", ["-C", wc, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-aqm", "repair"]); execFileSync("git", ["-C", wc, "push", "--quiet"]);
  fs.mkdirSync(pub, { recursive: true }); fs.writeFileSync(path.join(pub, "stray.json"), A);
  r = await run("scripts/pub-recover.cjs", env);
  assert.notEqual(r.code, 0, "diverging local scene aborts");
  assert.match(r.out, /not in the register/, "abort names the divergence");
  console.log("PASS local scene unknown to the register aborts (no silent unpublish)");
  // unreachable register (no credential / outage) aborts even with empty local
  fs.rmSync(pub, { recursive: true, force: true });
  r = await run("scripts/pub-recover.cjs", { BRILL_AR_REGISTER_URL: path.join(tmp, "gone.git"), PUB_DIR: pub });
  assert.notEqual(r.code, 0, "unreachable register aborts");
  assert.match(r.out, /register unreadable/, "abort names the register");
  console.log("PASS unreachable register aborts with a named cause (no silent fallback)");
  // empty register + empty local is a clean no-op
  const reg2 = path.join(tmp, "empty.git"); execFileSync("git", ["init", "--bare", "--quiet", reg2]);
  const pub2 = path.join(tmp, "pub2"); fs.mkdirSync(pub2, { recursive: true });
  r = await run("scripts/pub-register.cjs", { BRILL_AR_REGISTER_URL: reg2, PUB_DIR: pub2 }, "sync");
  assert.equal(r.code, 0, "sync empty set: " + r.out);
  r = await run("scripts/pub-recover.cjs", { BRILL_AR_REGISTER_URL: reg2, PUB_DIR: pub2 });
  assert.equal(r.code, 0, "empty register recovers clean: " + r.out);
  console.log("PASS empty register + empty local is a clean no-op");
  fs.rmSync(tmp, { recursive: true, force: true });
})().catch((e) => { console.error(e); process.exit(1); });
