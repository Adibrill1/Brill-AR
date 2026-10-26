/* Shared-scanner controller (logic only, no DOM, no engine).
   Maps the engine's found-target NAME to a scene id, loads that scene lazily,
   keeps exactly one scene mounted, and fails safe on bad catalog entries or scenes.
   Real camera recognition is not part of this module; it is driven by events. */
(function (root) {
  const ID = /^[A-Za-z0-9_-]{8,64}$/;
  function cleanCatalog(raw) {
    const entries = [], dropped = [], seen = new Set();
    for (const e of Array.isArray(raw) ? raw : []) {
      const ok = e && typeof e.name === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(e.name) && typeof e.scene === "string" && ID.test(e.scene);
      if (!ok) { dropped.push({ reason: "malformed", entry: e && e.name }); continue; }
      if (seen.has(e.name)) { dropped.push({ reason: "duplicate-name", entry: e.name }); continue; }
      seen.add(e.name); entries.push({ name: e.name, scene: e.scene });
    }
    return { entries, dropped };
  }
  function create(opts) {
    const cat = cleanCatalog(opts.catalog);
    const byName = new Map(cat.entries.map((e) => [e.name, e.scene]));
    let current = null; // {name, handle}
    let token = 0, state = "scanning", lastError = null;
    const set = (s, extra) => { state = s; if (opts.onState) opts.onState(s, extra || {}); };
    const unmount = () => {
      const c = current; current = null;
      if (c && c.handle) { try { c.handle.pause && c.handle.pause(); c.handle.destroy && c.handle.destroy(); } catch (e) { lastError = e; } }
    };
    async function found(name) {
      if (!byName.has(name)) { set("unknown-target", { name }); return; }
      if (current && current.name === name) { current.handle.resume && current.handle.resume(); set("tracking", { name }); return; }
      unmount();
      const my = ++token;
      set("loading", { name });
      try {
        const rec = await opts.loadScene(byName.get(name));
        if (my !== token) return; // a newer found/lost superseded this load
        if (opts.validate) opts.validate(rec);
        const handle = await opts.mount(rec, name);
        if (my !== token) { try { handle && handle.destroy && handle.destroy(); } catch (e) {} return; }
        current = { name, handle };
        set("tracking", { name });
      } catch (e) {
        if (my !== token) return;
        lastError = e; unmount(); set("scene-error", { name, message: String(e && e.message || e) });
      }
    }
    function lost(name) {
      if (current && current.name === name) { current.handle.pause && current.handle.pause(); set("lost", { name }); }
      else if (!current) { token++; set("scanning", {}); } // cancel an in-flight load
    }
    return {
      found, lost, targetNames: () => [...byName.keys()], dropped: cat.dropped,
      info: () => ({ state, current: current && current.name, lastError: lastError && String(lastError.message || lastError) }),
      destroy: () => { token++; unmount(); },
    };
  }
  const api = { create, cleanCatalog };
  if (typeof module !== "undefined") module.exports = api; else root.ScannerCore = api;
})(typeof window !== "undefined" ? window : globalThis);
