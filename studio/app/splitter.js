// Splitting a picture into layers in depth, on the device itself: a small depth model guesses how near each part of
// the picture is, the picture is cut into bands from far to near, and a tap cuts one element out with a small
// "segment anything" model. Both models are free (Apache-2.0) and run in the browser through transformers.js
// (Apache-2.0), downloaded once from a public CDN and kept by the browser. Nothing of the picture leaves the device.
(function () {
  "use strict";
  const LIB = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2";
  const DEPTH_MODEL = "onnx-community/depth-anything-v2-small", SEG_MODEL = "Xenova/slimsam-77-uniform";
  const DEPTH_SIDE = 640, SEG_SIDE = 1024, OUT_SIDE = 1600;
  let libP = null, depthP = null, segP = null;

  // tests can stand in for the models: Splitter.fake = { depth(canvas) -> {w,h,data}, masks(canvas, points) -> [mask×3] }
  const api = { fake: null };

  const lib = () => libP || (libP = import(LIB).then((t) => { t.env.allowLocalModels = false; return t; }).catch((e) => { libP = null; throw e; }));
  // progress: one callback with 0..1 over every file a model needs
  function tracker(onProgress) {
    const files = {};
    return (p) => {
      if (!onProgress || !p || !p.file) return;
      if (p.status === "progress" && p.total) files[p.file] = [p.loaded, p.total];
      else if (p.status === "done" && files[p.file]) files[p.file][0] = files[p.file][1];
      const v = Object.values(files), tot = v.reduce((s, x) => s + x[1], 0);
      if (tot) onProgress(v.reduce((s, x) => s + x[0], 0) / tot);
    };
  }

  function canvasOf(src, side) {
    const w0 = src.naturalWidth || src.videoWidth || src.width, h0 = src.naturalHeight || src.videoHeight || src.height;
    const k = Math.min(1, side / Math.max(w0, h0)), c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
    const g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(src, 0, 0, c.width, c.height);
    return c;
  }

  // ---------- depth ----------
  // {w, h, data}: one byte a pixel, 255 = nearest
  async function depth(src, onProgress) {
    const c = canvasOf(src, DEPTH_SIDE);
    if (api.fake && api.fake.depth) return api.fake.depth(c);
    const t = await lib();
    if (!depthP) depthP = t.pipeline("depth-estimation", DEPTH_MODEL, { dtype: "q8", progress_callback: tracker(onProgress) }).catch((e) => { depthP = null; throw e; });
    const run = await depthP;
    const out = await run(t.RawImage.fromCanvas(c));
    const d = out.depth;
    return { w: d.width, h: d.height, data: Uint8Array.from(d.data) };
  }

  // n-1 cuts between n bands: start from equal shares of the picture, then move each cut to the nearest quiet
  // place in the depth histogram, so a cut falls between two paper layers and not through one
  function thresholds(dm, n) {
    const hist = new Float64Array(256);
    for (const v of dm.data) hist[v]++;
    const sm = new Float64Array(256);
    for (let i = 0; i < 256; i++) { let s = 0, wsum = 0; for (let k = -6; k <= 6; k++) { const j = i + k; if (j < 0 || j > 255) continue; const w = Math.exp(-(k * k) / 18); s += hist[j] * w; wsum += w; } sm[i] = s / wsum; }
    const total = dm.data.length, cum = new Float64Array(256); let run = 0;
    for (let i = 0; i < 256; i++) { run += hist[i]; cum[i] = run / total; }
    const out = [];
    for (let b = 1; b < n; b++) {
      const q = b / n; let at = 0; while (at < 255 && cum[at] < q) at++;
      // look for a quiet place only where each side still keeps a fair share of the picture
      const lo = Math.max(out.length ? out[out.length - 1] + 6 : 2, at - 18), hi = Math.min(253, at + 18), span = 0.4 / n;
      let best = Math.max(lo, Math.min(hi, at));
      for (let i = lo; i <= hi; i++) if (cum[i - 1] >= q - span && cum[i - 1] <= q + span && sm[i] < sm[best]) best = i;
      out.push(best);
    }
    return out;
  }

  // ---------- one element by a tap ----------
  // embed once per picture; then each set of points gives three masks, from a part to the whole thing
  async function segmenter(src, onProgress) {
    const c = canvasOf(src, SEG_SIDE);
    if (api.fake && api.fake.masks) return { w: c.width, h: c.height, masks: (pts) => api.fake.masks(c, pts) };
    const t = await lib();
    if (!segP) segP = Promise.all([t.SamModel.from_pretrained(SEG_MODEL, { dtype: "q8", progress_callback: tracker(onProgress) }), t.AutoProcessor.from_pretrained(SEG_MODEL)]).catch((e) => { segP = null; throw e; });
    const [model, proc] = await segP;
    const inputs = await proc(t.RawImage.fromCanvas(c));
    const emb = await model.get_image_embeddings(inputs);
    return {
      w: c.width, h: c.height,
      // points: [{x, y, keep}] in 0..1 of the picture; keep false = "not this part"
      async masks(points) {
        const pts = [[points.map((p) => [p.x * c.width, p.y * c.height])]];
        const input_points = proc.reshape_input_points(pts, inputs.original_sizes, inputs.reshaped_input_sizes);
        const input_labels = new t.Tensor("int64", points.map((p) => (p.keep === false ? 0n : 1n)), [1, 1, points.length]);
        const out = await model({ ...emb, input_points, input_labels });
        const m = (await proc.post_process_masks(out.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes))[0];
        const [, k, H, W] = m.dims, scores = Array.from(out.iou_scores.data), res = [];
        for (let j = 0; j < k; j++) { const data = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) data[i] = m.data[j * W * H + i] ? 255 : 0; res.push({ w: W, h: H, data, score: scores[j] }); }
        return res;
      }
    };
  }

  // ---------- masks to layers ----------
  function blur(a, w, h, r) { // a box blur, twice, on a Float32Array of 0..1
    const tmp = new Float32Array(a.length);
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < h; y++) { let s = 0; for (let x = -r; x <= r; x++) s += a[y * w + Math.min(w - 1, Math.max(0, x))];
        for (let x = 0; x < w; x++) { tmp[y * w + x] = s / (2 * r + 1); s += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)]; } }
      for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
        for (let y = 0; y < h; y++) { a[y * w + x] = s / (2 * r + 1); s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; } }
    }
    return a;
  }
  // a mask of the given size from another (nearest sample), as 0..1
  function resample(m, w, h) {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) { const sy = Math.min(m.h - 1, Math.floor((y + 0.5) * m.h / h)); for (let x = 0; x < w; x++) out[y * w + x] = m.data[sy * m.w + Math.min(m.w - 1, Math.floor((x + 0.5) * m.w / w))] / 255; }
    return out;
  }
  // the picture's pixels where the mask is on, soft at the edge, at full size
  function cutOut(full, mask, w, h) {
    const mc = document.createElement("canvas"); mc.width = w; mc.height = h;
    const mg = mc.getContext("2d"), id = mg.createImageData(w, h);
    for (let i = 0; i < w * h; i++) { id.data[i * 4 + 3] = Math.round(Math.max(0, Math.min(1, mask[i])) * 255); }
    mg.putImageData(id, 0, 0);
    const c = document.createElement("canvas"); c.width = full.width; c.height = full.height;
    const g = c.getContext("2d"); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    g.drawImage(mc, 0, 0, c.width, c.height); g.globalCompositeOperation = "source-in"; g.drawImage(full, 0, 0);
    return c;
  }
  // fill the holes (mask 1 = hole) from the colours around them: average down a pyramid using only known pixels,
  // then come back up putting those averages in the holes. Soft and plain, which is right for a background seen only
  // at the edges of what stands in front of it.
  function fillHoles(src, hole, w, h) {
    const sc = document.createElement("canvas"); sc.width = w; sc.height = h; const sg = sc.getContext("2d"); sg.drawImage(src, 0, 0, w, h);
    const id = sg.getImageData(0, 0, w, h), px = id.data;
    let lv = { w, h, c: new Float32Array(w * h * 4) };
    for (let i = 0; i < w * h; i++) { const k = 1 - Math.min(1, hole[i]); lv.c[i * 4] = px[i * 4] * k; lv.c[i * 4 + 1] = px[i * 4 + 1] * k; lv.c[i * 4 + 2] = px[i * 4 + 2] * k; lv.c[i * 4 + 3] = k; }
    const levels = [lv];
    while (lv.w > 1 || lv.h > 1) {
      const W2 = Math.max(1, Math.ceil(lv.w / 2)), H2 = Math.max(1, Math.ceil(lv.h / 2)), c = new Float32Array(W2 * H2 * 4);
      for (let y = 0; y < lv.h; y++) for (let x = 0; x < lv.w; x++) { const a = (y * lv.w + x) * 4, b = ((y >> 1) * W2 + (x >> 1)) * 4; for (let j = 0; j < 4; j++) c[b + j] += lv.c[a + j]; }
      lv = { w: W2, h: H2, c }; levels.push(lv);
    }
    for (let l = levels.length - 2; l >= 0; l--) { // up: where a pixel knows little, take the coarser average
      const a = levels[l], b = levels[l + 1];
      for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
        const i = (y * a.w + x) * 4, wgt = a.c[i + 3];
        const fx = Math.min(b.w - 1, (x - 0.5) / 2), fy = Math.min(b.h - 1, (y - 0.5) / 2), x0 = Math.max(0, Math.floor(fx)), y0 = Math.max(0, Math.floor(fy)), x1 = Math.min(b.w - 1, x0 + 1), y1 = Math.min(b.h - 1, y0 + 1), tx = Math.max(0, fx - x0), ty = Math.max(0, fy - y0);
        const s4 = (j) => { const g = (xx, yy) => { const k = (yy * b.w + xx) * 4; return b.c[k + 3] > 1e-6 ? b.c[k + j] / b.c[k + 3] : 0; }; return (g(x0, y0) * (1 - tx) + g(x1, y0) * tx) * (1 - ty) + (g(x0, y1) * (1 - tx) + g(x1, y1) * tx) * ty; };
        const k = Math.min(1, wgt);
        for (let j = 0; j < 3; j++) { const own = wgt > 1e-6 ? a.c[i + j] / wgt : 0; a.c[i + j] = own * k + s4(j) * (1 - k); }
        a.c[i + 3] = 1;
      }
    }
    for (let i = 0; i < w * h; i++) { px[i * 4] = levels[0].c[i * 4]; px[i * 4 + 1] = levels[0].c[i * 4 + 1]; px[i * 4 + 2] = levels[0].c[i * 4 + 2]; px[i * 4 + 3] = 255; }
    sg.putImageData(id, 0, 0); return sc;
  }
  const coverage = (m) => { let s = 0; for (let i = 0; i < m.length; i++) s += m[i]; return s / m.length; };

  // The layers, farthest first. Layer 0 is the whole picture (so nothing behind a lifted part is ever empty); then the
  // depth bands from far to near; then each cut element, in front of the band it came from. z: 0..1 of the depth.
  // largest value within r pixels (rows, then columns)
  function nearGrow(a, w, h, r) {
    const t = new Float32Array(a.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = 0; for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) m = Math.max(m, a[y * w + k]); t[y * w + x] = m; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = 0; for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) m = Math.max(m, t[k * w + x]); a[y * w + x] = m; }
    return a;
  }

  function build(src, dm0, n, cuts) {
    // a smoothed depth: small things (letters, thin lines) take the depth around them instead of breaking between layers
    const sd = new Float32Array(dm0.data.length); for (let i = 0; i < sd.length; i++) sd[i] = dm0.data[i];
    blur(sd, dm0.w, dm0.h, 3);
    // the near side wins along every edge: the soft rim around a near thing (in-between depths) goes with the thing, so
    // no outline of it is left in the layers behind
    nearGrow(sd, dm0.w, dm0.h, 4);
    const dm = { w: dm0.w, h: dm0.h, data: Uint8Array.from(sd, (v) => Math.round(v)) };
    const full = canvasOf(src, OUT_SIDE), w = dm.w, h = dm.h, ts = thresholds(dm, n), soft = 3;
    const cutM = cuts.map((c) => blur(resample(c.mask, w, h), w, h, 1));
    const cutWide = cuts.map((c) => { const m = blur(resample(c.mask, w, h), w, h, 2); for (let i = 0; i < m.length; i++) m[i] = Math.min(1, m[i] * 2.2); return m; });
    for (let j = 0; j < cutM.length; j++) for (let k = j + 1; k < cutM.length; k++) for (let i = 0; i < w * h; i++) cutM[j][i] *= 1 - cutM[k][i]; // overlapping cuts: the newer one keeps the shared part
    const sm = (x) => Math.max(0, Math.min(1, x / soft + 0.5));
    // the back: the farthest band as it is, and everything in front of it filled from around (so nothing shows twice)
    const hole = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) hole[i] = sm(dm.data[i] - ts[0] - 2 * soft); // stays whole under the soft edge of the band in front of it
    blur(hole, w, h, 2);
    const cutHole = new Float32Array(w * h); // a cut element's place is taken out sharply (no outline of it left behind)
    for (const c of cutM) for (let i = 0; i < w * h; i++) cutHole[i] = Math.max(cutHole[i], Math.min(1, c[i] * 1.6));
    for (let i = 0; i < w * h; i++) hole[i] = Math.max(hole[i], cutHole[i]);
    const back = document.createElement("canvas"); back.width = full.width; back.height = full.height;
    const bg = back.getContext("2d"); bg.imageSmoothingQuality = "high"; // fill only from real background: thin gaps and shadows between parts are too dark to spread behind them
    const known = new Float32Array(w * h); for (let i = 0; i < w * h; i++) known[i] = 1 - hole[i];
    blur(known, w, h, 5);
    const holeFill = new Float32Array(w * h); let seen = 0;
    for (let i = 0; i < w * h; i++) { holeFill[i] = known[i] > 0.97 ? 0 : 1; if (!holeFill[i]) seen++; }
    if (seen < w * h * 0.02) for (let i = 0; i < w * h; i++) holeFill[i] = hole[i] > 0.5 ? 1 : 0; // too little clean background: use all of it
    bg.drawImage(fillHoles(full, holeFill, w, h), 0, 0, back.width, back.height);
    // the farthest band itself, as it is, over the fill
    const keep = new Float32Array(w * h); for (let i = 0; i < w * h; i++) keep[i] = 1 - hole[i];
    bg.drawImage(cutOut(full, keep, w, h), 0, 0);
    const out = [{ canvas: back, z: 0, kind: "back" }];
    for (let b = 1; b < n; b++) {
      const lo = ts[b - 1], hi = b < n - 1 ? ts[b] : 1e9, m = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) { const d = dm.data[i]; m[i] = sm(d - lo) * (1 - sm(d - hi - 2 * soft)); } // runs on a little under the next band, so no gap shows between them
      blur(m, w, h, 1);
      for (const c of cutWide) for (let i = 0; i < m.length; i++) m[i] *= 1 - c[i]; // no rim of a cut element left in the band
      if (coverage(m) < 0.004) continue; // nothing left in this band
      out.push({ canvas: cutOut(full, m, w, h), z: b / (n - 1), kind: "band" });
    }
    cuts.forEach((c, j) => {
      const m = cutM[j]; let s = 0, k = 0;
      for (let i = 0; i < m.length; i++) if (m[i] > 0.5) { s += dm.data[i]; k++; }
      const d = k ? s / k : 128; let band = 0; while (band < ts.length && d >= ts[band]) band++;
      // an element she chose stands out: at least halfway forward, and in front of the band it came from
      out.push({ canvas: cutOut(full, m, w, h), z: Math.min(1.15, Math.max(0.55, (band + 0.6) / Math.max(1, n - 1))), kind: "cut" });
    });
    return out.sort((a, b) => a.z - b.z); // drawn far to near: a layer in front is drawn after what stands behind it
  }

  Object.assign(api, { depth, thresholds, segmenter, build, canvasOf, ready: () => !!libP });
  window.Splitter = api;
})();
