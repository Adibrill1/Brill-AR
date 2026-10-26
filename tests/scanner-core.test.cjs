// SIMULATION: drives ScannerCore with synthetic found/lost events. Not camera recognition.
const assert = require("assert"); const SC = require("../studio/scanner-core.js");
(async () => {
  const log = [], states = [];
  const mounted = new Set();
  const gate = {};
  const mk = (catalog, over = {}) => SC.create({
    catalog, onState: (s, x) => states.push(s + ":" + (x.name || "")),
    loadScene: over.loadScene || ((id) => new Promise((res, rej) => { log.push("load " + id); if (id === "scene-bad0000") return res({ broken: true }); if (id === "scene-boom000") return rej(new Error("404")); gate[id] ? gate[id].push(res) : res({ id }); })),
    validate: (r) => { if (!r || !r.id) throw new Error("malformed scene"); },
    mount: async (rec) => { mounted.add(rec.id); return { pause() { log.push("pause " + rec.id); }, resume() { log.push("resume " + rec.id); }, destroy() { mounted.delete(rec.id); log.push("destroy " + rec.id); } }; },
  });
  const cat = [{ name: "a", scene: "scene-aaaa000" }, { name: "b", scene: "scene-bbbb000" }, { name: "bad", scene: "scene-bad0000" }, { name: "boom", scene: "scene-boom000" },
    { name: "a", scene: "scene-dup0000" }, { name: "../x", scene: "scene-xxxx000" }, { name: "c", scene: "x" }, null];
  const s = mk(cat);
  assert.deepEqual(s.targetNames(), ["a", "b", "bad", "boom"]); assert.equal(s.dropped.length, 4, "dup name, bad name, short id, null dropped");
  await s.found("a"); assert.deepEqual([...mounted], ["scene-aaaa000"]);
  s.lost("a"); assert.equal(s.info().state, "lost"); assert.ok(mounted.has("scene-aaaa000"), "lost keeps scene mounted but paused");
  await s.found("a"); assert.ok(log.includes("resume scene-aaaa000")); assert.equal(log.filter((l) => l === "load scene-aaaa000").length, 1, "reacquire does not reload");
  await s.found("b"); assert.deepEqual([...mounted], ["scene-bbbb000"], "switch destroys old scene: one scene mounted");
  assert.ok(log.indexOf("destroy scene-aaaa000") >= 0);
  await s.found("zzz"); assert.equal(s.info().state, "unknown-target"); assert.deepEqual([...mounted], ["scene-bbbb000"], "unknown name leaves current alone");
  await s.found("bad"); assert.equal(s.info().state, "scene-error"); assert.equal(mounted.size, 0, "malformed scene fails safe, nothing mounted");
  await s.found("boom"); assert.equal(s.info().state, "scene-error"); assert.match(s.info().lastError, /404/);
  await s.found("a"); assert.equal(s.info().state, "tracking", "recovers after errors");
  // race: found a (slow), then found b before a resolves -> a's late result is discarded
  const s2 = mk(cat); gate["scene-aaaa000"] = []; gate["scene-bbbb000"] = [];
  mounted.clear(); const pa = s2.found("a"); const pb = s2.found("b");
  gate["scene-bbbb000"][0]({ id: "scene-bbbb000" }); await pb;
  gate["scene-aaaa000"][0]({ id: "scene-aaaa000" }); await pa;
  assert.deepEqual([...mounted], ["scene-bbbb000"], "late load of superseded target is discarded");
  assert.equal(s2.info().current, "b");
  // lost while loading cancels
  const s3 = mk(cat); mounted.clear(); gate["scene-aaaa000"] = []; const p3 = s3.found("a"); s3.lost("a"); gate["scene-aaaa000"][0]({ id: "scene-aaaa000" }); await p3;
  assert.equal(mounted.size, 0, "lost during load cancels mount"); s2.destroy(); assert.equal(mounted.size, 0);
  console.log("PASS scanner-core (SIMULATION, no camera): name->scene mapping, lazy load, reacquire w/o reload, switch cleanup, unknown/malformed/failing scene fail safe, race + cancel; catalog drops 4 bad entries");
})().catch((e) => { console.error(e); process.exit(1); });
