"use strict";
/* The portal's recogniser off the main thread, so the camera picture never stutters while a frame is compared.
   {type:"index", items:[{id, f}]} once; then {type:"frame", w, h, px} -> {type:"result", res:[{id, inliers, votes, at}]}
   (at: where the artwork's centre is in the frame, [x, y] as fractions of its width and height, when it was placed). */
importScripts("recognize.js" + (self.location.search || ""));
let ix = null;
self.onmessage = (e) => {
  const m = e.data;
  try {
    if (m.type === "index") { ix = Recognize.buildIndex(m.items.map((it) => ({ id: it.id, f: Recognize.unpack(it.f) }))); self.postMessage({ type: "ready", n: m.items.length }); }
    else if (m.type === "frame" && ix) {
      const t = Date.now(), res = Recognize.match(ix, Recognize.frameFeatures(m.px, m.w, m.h));
      const byId = new Map(ix.items.map((it) => [it.id, it.f]));
      self.postMessage({ type: "result", res: res.slice(0, 4).map((r) => ({ id: r.id, inliers: r.inliers, votes: r.votes, at: Recognize.centre(r.m, byId.get(r.id), m.w, m.h) })), ms: Date.now() - t });
    }
  } catch (err) { self.postMessage({ type: "error", message: String(err && err.message || err) }); }
};
