#!/usr/bin/env node
/* Pre-deploy published-scene recovery. The PRIVATE register repo (adibrill-instinct/
 * brill-ar-published) is the authoritative record of what is published: its manifest.json
 * (id + sha256 + bytes) plus scenes/<id>.json. There is NO public index - the live site
 * serves the scene JSONs (public-by-link, per approved scene) and nothing else.
 *
 * ABORTS (exit 1) when:
 *  - the register cannot be read (missing credential, outage, lost manifest) - never a
 *    silent fallback to any public source;
 *  - any register scene fails integrity (tamper);
 *  - a local scene exists that the register does not list (divergence - refusing to guess).
 * Order per deploy: pub-recover -> add/remove scenes + pub-register sync -> pub-manifest -> surge. */
const fs = require("fs"), path = require("path");
const { recoverFromRegister } = require("./pub-register.cjs");
const pubDir = process.env.PUB_DIR || path.join(__dirname, "../studio/pub");
const REGISTER_URL = process.env.BRILL_AR_REGISTER_URL || "https://x@github.com/adibrill-instinct/brill-ar-published.git";
(async () => {
  const localScenes = fs.existsSync(pubDir) ? fs.readdirSync(pubDir).filter((f) => f !== "manifest.json" && /^[a-zA-Z0-9_-]{1,64}\.json$/.test(f)) : [];
  let r;
  try { r = await recoverFromRegister(REGISTER_URL); }
  catch (e) { console.error("ABORT: private register unreadable (" + e.message + "). Restore the credential (vault Allow) or fix the register; refusing to deploy without the authoritative publication state."); process.exit(1); }
  // recoverFromRegister restores + integrity-checks every register scene into pubDir.
  const registerIds = new Set(r.restored);
  const stray = localScenes.map((f) => f.replace(/\.json$/, "")).filter((id) => !registerIds.has(id));
  if (stray.length) { console.error("ABORT: local scene(s) not in the register: " + stray.join(", ") + " - publish them (pub-register sync) or remove them deliberately first."); process.exit(1); }
  console.log("recover OK:", r.restored.length, "published scene(s) intact from private register" + (r.restored.length ? ": " + r.restored.join(", ") : ""));
})().catch((e) => { console.error("ABORT: " + e.message); process.exit(1); });
