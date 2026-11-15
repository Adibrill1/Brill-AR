"use strict";
/* Recognise: which published artwork is the camera looking at, among many, before the AR engine is told about it.
   The engine finds and holds ONE artwork quickly, but with a list of artworks it slows down sharply or stops finding
   (measured on this engine build with a camera feed: 1 artwork found in about 3 seconds; 5, 10, 20, 40 artworks not
   found in 45 seconds). So the portal asks this small matcher first and hands the engine only the artwork it names.
   How: corners (FAST) carry a 256-bit description of their surroundings (rotated BRIEF, as in ORB), at several sizes
   per artwork so the distance from the wall does not matter. A camera frame's corners are looked up through a hash
   index on 12-bit pieces of the description (no comparing against every artwork), each artwork collects the corners
   that agree with it, and the leading few are checked for a single placement that most of those corners fit (RANSAC,
   affine): look-alikes share some corners but not one consistent placement. Plain arrays in, no DOM, no engine: the
   same code describes an artwork at publish time and a camera frame in the viewer (and runs in tests). */
(function (root) {
  // ---------- pixels ----------
  function gray(rgba, w, h) { const g = new Uint8Array(w * h); for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8; return g; }
  // area-average resize (down) / bilinear (up)
  function resize(src, w, h, nw, nh) {
    const out = new Uint8Array(nw * nh), sx = w / nw, sy = h / nh;
    if (sx <= 1 && sy <= 1) {
      for (let y = 0; y < nh; y++) { const fy = Math.min(h - 1, (y + 0.5) * sy - 0.5), y0 = Math.max(0, Math.floor(fy)), y1 = Math.min(h - 1, y0 + 1), ty = Math.max(0, fy - y0);
        for (let x = 0; x < nw; x++) { const fx = Math.min(w - 1, (x + 0.5) * sx - 0.5), x0 = Math.max(0, Math.floor(fx)), x1 = Math.min(w - 1, x0 + 1), tx = Math.max(0, fx - x0);
          out[y * nw + x] = (src[y0 * w + x0] * (1 - tx) + src[y0 * w + x1] * tx) * (1 - ty) + (src[y1 * w + x0] * (1 - tx) + src[y1 * w + x1] * tx) * ty; } }
      return out;
    }
    for (let y = 0; y < nh; y++) { const ya = Math.floor(y * sy), yb = Math.max(ya + 1, Math.floor((y + 1) * sy));
      for (let x = 0; x < nw; x++) { const xa = Math.floor(x * sx), xb = Math.max(xa + 1, Math.floor((x + 1) * sx)); let s = 0;
        for (let yy = ya; yy < yb; yy++) for (let xx = xa; xx < xb; xx++) s += src[yy * w + xx];
        out[y * nw + x] = s / ((yb - ya) * (xb - xa)); } }
    return out;
  }
  // 5-tap gaussian (1 4 6 4 1), both directions: the description reads smoothed pixels so a soft focus changes little
  function smooth(src, w, h) {
    const t = new Uint8Array(w * h), out = new Uint8Array(w * h), c = (v, n) => v < 0 ? 0 : v >= n ? n - 1 : v;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const r = y * w; t[r + x] = (src[r + c(x - 2, w)] + 4 * src[r + c(x - 1, w)] + 6 * src[r + x] + 4 * src[r + c(x + 1, w)] + src[r + c(x + 2, w)]) >> 4; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = (t[c(y - 2, h) * w + x] + 4 * t[c(y - 1, h) * w + x] + 6 * t[y * w + x] + 4 * t[c(y + 1, h) * w + x] + t[c(y + 2, h) * w + x]) >> 4;
    return out;
  }

  // ---------- corners (FAST-9 on a 16-pixel circle) ----------
  const CIRCLE = [[0, -3], [1, -3], [2, -2], [3, -1], [3, 0], [3, 1], [2, 2], [1, 3], [0, 3], [-1, 3], [-2, 2], [-3, 1], [-3, 0], [-3, -1], [-2, -2], [-1, -3]];
  function fast(img, w, h, thr, border) {
    const off = CIRCLE.map(([dx, dy]) => dy * w + dx), score = new Float32Array(w * h), pts = [], st = new Int8Array(32);
    for (let y = border; y < h - border; y++) for (let x = border; x < w - border; x++) {
      const p = y * w + x, v = img[p], hi = v + thr, lo = v - thr;
      let b = 0, d = 0;
      for (const k of [0, 4, 8, 12]) { const q = img[p + off[k]]; if (q > hi) b++; else if (q < lo) d++; }
      if (b < 2 && d < 2) continue;
      let s = 0;
      for (let k = 0; k < 16; k++) { const q = img[p + off[k]]; st[k] = st[k + 16] = q > hi ? 1 : q < lo ? -1 : 0; const e = Math.abs(q - v) - thr; if (e > 0) s += e; }
      let run = 0, best = 0, sign = 0;
      for (let k = 0; k < 32; k++) { if (st[k] && st[k] === sign) run++; else { sign = st[k]; run = st[k] ? 1 : 0; } if (run > best) best = run; }
      if (best >= 9) score[p] = s;
    }
    for (let y = border; y < h - border; y++) for (let x = border; x < w - border; x++) {
      const p = y * w + x, s = score[p]; if (!s) continue;
      if (s < score[p - 1] || s <= score[p + 1] || s < score[p - w - 1] || s < score[p - w] || s < score[p - w + 1] || s <= score[p + w - 1] || s <= score[p + w] || s <= score[p + w + 1]) continue;
      pts.push({ x, y, s });
    }
    return pts;
  }
  // spread the corners over the picture: the best few of each cell first, so a partly covered artwork still has some
  function spread(pts, w, h, max) {
    const G = 6, cells = Array.from({ length: G * G }, () => []);
    for (const p of pts) cells[Math.min(G - 1, (p.y * G / h) | 0) * G + Math.min(G - 1, (p.x * G / w) | 0)].push(p);
    const per = Math.ceil(max * 1.6 / (G * G)), keep = [];
    for (const c of cells) { c.sort((a, b) => b.s - a.s); keep.push(...c.slice(0, per)); }
    keep.sort((a, b) => b.s - a.s);
    return keep.slice(0, max);
  }

  // A camera frame of a glossy print: a reflection washes part of the artwork out (white, flat) and draws a hard rim of its
  // own. Corners on or beside blown-out pixels belong to the reflection, not to the artwork: they are dropped. Where the
  // reflection's halo only fades the picture, the shapes are still there with less contrast, so cells of the frame that
  // found few corners look again with a lower threshold scaled to their own contrast; cells that are white and flat are
  // left out, so the corner budget goes to the part of the artwork that can be seen.
  function glareSafe(img, w, h, pts, max) {
    const G = 6, n = G * G, sum = new Float64Array(n), sq = new Float64Array(n), cnt = new Int32Array(n), hot = new Int32Array(n);
    const cell = (x, y) => Math.min(G - 1, (y * G / h) | 0) * G + Math.min(G - 1, (x * G / w) | 0);
    const sat = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = img[y * w + x], c = cell(x, y); sum[c] += v; sq[c] += v * v; cnt[c]++; if (v >= 246) { sat[y * w + x] = 1; hot[c]++; } }
    // blown-out pixels grown by 4 so a corner on the rim of a reflection is caught too
    const near = new Uint8Array(w * h), R4 = 4;
    for (let y = 0; y < h; y++) { let run = -99; for (let x = 0; x < w; x++) { if (sat[y * w + x]) run = x; if (x - run <= R4) near[y * w + x] = 1; } run = 1e9; for (let x = w - 1; x >= 0; x--) { if (sat[y * w + x]) run = x; if (run - x <= R4) near[y * w + x] = 1; } }
    const nv = near.slice(); for (let x = 0; x < w; x++) { let run = -99; for (let y = 0; y < h; y++) { if (near[y * w + x]) run = y; if (y - run <= R4) nv[y * w + x] = 1; } run = 1e9; for (let y = h - 1; y >= 0; y--) { if (near[y * w + x]) run = y; if (run - y <= R4) nv[y * w + x] = 1; } }
    const keep = pts.filter((p) => !nv[p.y * w + p.x]), per = new Int32Array(n);
    for (const p of keep) per[cell(p.x, p.y)]++;
    const want = Math.ceil(max * 1.6 / n), low = [];
    for (let c = 0; c < n; c++) { const m = sum[c] / cnt[c], sd = Math.sqrt(Math.max(0, sq[c] / cnt[c] - m * m)); low[c] = (hot[c] > cnt[c] * 0.6 || (m > 225 && sd < 8)) ? 0 : per[c] < want ? Math.max(7, Math.min(16, sd * 0.45)) : 0; }
    const thr = Math.min(...low.filter((t) => t > 0), 99);
    if (thr < 99) for (const p of fast(img, w, h, thr, BORDER)) { const c = cell(p.x, p.y); if (low[c] && p.s > 0 && !nv[p.y * w + p.x] && !keep.some((q) => q.x === p.x && q.y === p.y)) { const t = low[c]; if (p.s >= (t - thr) * 4) keep.push(Object.assign(p, { s: p.s * 0.5 })); } }
    return keep;
  }

  // ---------- description (rotated BRIEF) ----------
  const R = 12, BORDER = 19, BINS = 30;
  const PAIRS = (() => { // 256 point pairs, gaussian around the corner, the same everywhere (fixed seed)
    let s = 0x2545F491; const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e6) / 1e6; };
    const g = () => { let v; do { v = Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd()) * (R * 2 / 5); } while (Math.abs(v) > R); return v; };
    const out = []; for (let i = 0; i < 256; i++) out.push([g(), g(), g(), g()]); return out;
  })();
  const ROT = []; // the pairs turned to each of 30 directions, as pixel offsets (set per image width)
  function rotTables(w) {
    if (ROT.w === w) return ROT; ROT.length = 0; ROT.w = w;
    for (let b = 0; b < BINS; b++) { const a = b * 2 * Math.PI / BINS, c = Math.cos(a), s = Math.sin(a), t = new Int32Array(512);
      PAIRS.forEach(([x1, y1, x2, y2], i) => { t[2 * i] = Math.round(x1 * s + y1 * c) * w + Math.round(x1 * c - y1 * s); t[2 * i + 1] = Math.round(x2 * s + y2 * c) * w + Math.round(x2 * c - y2 * s); });
      ROT.push(t); }
    return ROT;
  }
  const UMAX = (() => { const u = []; for (let v = 0; v <= R; v++) u.push(Math.floor(Math.sqrt(R * R - v * v))); return u; })();
  function angle(img, w, x, y) { // direction from the corner to the centre of brightness around it
    let m01 = 0, m10 = 0;
    for (let v = -R; v <= R; v++) { const u = UMAX[Math.abs(v)], r = (y + v) * w; for (let k = -u; k <= u; k++) { const q = img[r + x + k]; m10 += k * q; m01 += v * q; } }
    return Math.atan2(m01, m10);
  }
  function describe(img, w, x, y, a, out, o) {
    const t = rotTables(w)[((Math.round(a / (2 * Math.PI) * BINS) % BINS) + BINS) % BINS], p = y * w + x;
    for (let k = 0; k < 8; k++) { let word = 0; for (let b = 0; b < 32; b++) { const i = (k * 32 + b) * 2; if (img[p + t[i]] < img[p + t[i + 1]]) word |= 1 << b; } out[o + k] = word; }
  }

  // Corners and descriptions over a few sizes of one picture. x, y are in units of the picture's long side (0..1).
  // levels: the sizes, as fractions of a long side of `side` pixels; max: corners per size.
  function extract(g, w, h, opts) {
    const side = opts.side, levels = opts.levels, maxs = opts.max, L = Math.max(w, h), xs = [], ys = [], ds = [];
    for (let li = 0; li < levels.length; li++) {
      const k = side * levels[li] / L, lw = Math.round(w * k), lh = Math.round(h * k);
      if (lw < BORDER * 2 + 8 || lh < BORDER * 2 + 8) continue;
      const img = resize(g, w, h, lw, lh), sm = smooth(img, lw, lh), max = maxs[li] || maxs[maxs.length - 1];
      let pts = fast(img, lw, lh, 20, BORDER);
      if (opts.glare) pts = glareSafe(img, lw, lh, pts, max);
      else if (pts.length < max * 1.5) pts = fast(img, lw, lh, 11, BORDER);
      for (const p of spread(pts, lw, lh, max)) {
        const d = new Int32Array(8); describe(sm, lw, p.x, p.y, angle(sm, lw, p.x, p.y), d, 0);
        xs.push(p.x / (lw - 1) * (w / L)); ys.push(p.y / (lh - 1) * (h / L)); ds.push(d);
      }
    }
    const n = xs.length, f = { n, x: new Float32Array(xs), y: new Float32Array(ys), d: new Int32Array(n * 8), aspect: w / h };
    ds.forEach((d, i) => f.d.set(d, i * 8));
    return f;
  }
  // An artwork (publish time): six sizes, from close up to across the street.
  const ART = { side: 420, levels: [1, 0.74, 0.55, 0.41, 0.3, 0.22], max: [50, 40, 35, 30, 25, 20] };
  // A camera frame: as it comes (about 320 on the long side) and a little smaller.
  const CAM = { side: 320, levels: [1, 0.72], max: [380, 160], glare: true };
  const artFeatures = (g, w, h) => extract(g, w, h, ART);
  const frameFeatures = (g, w, h) => extract(g, w, h, CAM);

  // ---------- storage (catalogue): 36 bytes per corner, base64 ----------
  function pack(f) {
    const b = new Uint8Array(4 + f.n * 36), v = new DataView(b.buffer);
    v.setUint16(0, f.n, true); v.setUint16(2, Math.round(Math.min(4, f.aspect) * 16000), true);
    for (let i = 0; i < f.n; i++) { const o = 4 + i * 36; v.setUint16(o, Math.round(f.x[i] * 65535), true); v.setUint16(o + 2, Math.round(f.y[i] * 65535), true); for (let k = 0; k < 8; k++) v.setInt32(o + 4 + k * 4, f.d[i * 8 + k], true); }
    let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unpack(str) {
    const bin = atob(str), b = new Uint8Array(bin.length); for (let i = 0; i < b.length; i++) b[i] = bin.charCodeAt(i);
    const v = new DataView(b.buffer), n = v.getUint16(0, true);
    if (b.length !== 4 + n * 36) throw new Error("bad features");
    const f = { n, x: new Float32Array(n), y: new Float32Array(n), d: new Int32Array(n * 8), aspect: v.getUint16(2, true) / 16000 };
    for (let i = 0; i < n; i++) { const o = 4 + i * 36; f.x[i] = v.getUint16(o, true) / 65535; f.y[i] = v.getUint16(o + 2, true) / 65535; for (let k = 0; k < 8; k++) f.d[i * 8 + k] = v.getInt32(o + 4 + k * 4, true); }
    return f;
  }

  // ---------- index and matching ----------
  const CH = 25, CB = 10, CM = (1 << CB) - 1; // 25 pieces of 10 bits: a near copy shares at least one piece exactly
  const piece = (d, o, c) => { const bit = c * CB, wd = bit >> 5, sh = bit & 31; let v = d[o + wd] >>> sh; if (sh + CB > 32) v |= d[o + wd + 1] << (32 - sh); return v & CM; };
  const pc = (x) => { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24; };
  // items: [{id, f}] -> an index all frames are matched against
  function buildIndex(items) {
    let N = 0; for (const it of items) N += it.f.n;
    const owner = new Int32Array(N), local = new Int32Array(N), d = new Int32Array(N * 8);
    let g = 0; items.forEach((it, i) => { for (let k = 0; k < it.f.n; k++, g++) { owner[g] = i; local[g] = k; } d.set(it.f.d, (g - it.f.n) * 8); });
    const heads = [], lists = [];
    for (let c = 0; c < CH; c++) {
      const cnt = new Int32Array(CM + 2); for (let i = 0; i < N; i++) cnt[piece(d, i * 8, c) + 1]++;
      for (let k = 1; k < cnt.length; k++) cnt[k] += cnt[k - 1];
      const pos = cnt.slice(0, CM + 1), list = new Int32Array(N); for (let i = 0; i < N; i++) list[pos[piece(d, i * 8, c)]++] = i;
      heads.push(cnt); lists.push(list);
    }
    return { items, N, owner, local, d, heads, lists, stamp: new Int32Array(N), q: 0 };
  }
  // affine from 3 point pairs (a -> b): [p0 p1 p2; p3 p4 p5]
  function affine3(ax, ay, bx, by) {
    const det = (ax[0] - ax[2]) * (ay[1] - ay[2]) - (ax[1] - ax[2]) * (ay[0] - ay[2]); if (Math.abs(det) < 1e-9) return null;
    const solve = (v) => { const a = ((v[0] - v[2]) * (ay[1] - ay[2]) - (v[1] - v[2]) * (ay[0] - ay[2])) / det, b = ((ax[0] - ax[2]) * (v[1] - v[2]) - (ax[1] - ax[2]) * (v[0] - v[2])) / det; return [a, b, v[2] - a * ax[2] - b * ay[2]]; };
    return solve(bx).concat(solve(by));
  }
  // how many of the matches fit one placement of the artwork in the frame; returns {inliers, m}
  function verify(mx, my, tx, ty, seed, tol) {
    const n = mx.length; if (n < 4) return { inliers: 0 };
    let s = seed | 1; const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) % n; };
    let best = 0, bm = null; const TOL2 = (tol || 0.035) ** 2;
    for (let it = 0; it < 220; it++) {
      const i = rnd(), j = rnd(), k = rnd(); if (i === j || j === k || i === k) continue;
      const m = affine3([mx[i], mx[j], mx[k]], [my[i], my[j], my[k]], [tx[i], tx[j], tx[k]], [ty[i], ty[j], ty[k]]); if (!m) continue;
      const det = m[0] * m[4] - m[1] * m[3]; if (det <= 0) continue; // a mirror image is not a camera view
      const sx = Math.hypot(m[0], m[3]), sy = Math.hypot(m[1], m[4]); if (sx / sy > 2.5 || sy / sx > 2.5) continue; // nor a squash
      let c = 0; for (let q = 0; q < n; q++) { const ex = m[0] * mx[q] + m[1] * my[q] + m[2] - tx[q], ey = m[3] * mx[q] + m[4] * my[q] + m[5] - ty[q]; if (ex * ex + ey * ey < TOL2) c++; }
      if (c > best) { best = c; bm = m; }
    }
    return { inliers: best, m: bm };
  }
  // A frame's corners against the index: [{id, votes, inliers}] best first (only artworks with some agreement)
  function match(ix, f, opts) {
    const o = opts || {}, maxD = o.maxDist || 72, top = o.top || 6, n = ix.items.length;
    const per = ix.items.map(() => ({ mx: [], my: [], tx: [], ty: [], used: new Set() }));
    for (let i = 0; i < f.n; i++) {
      const qo = i * 8, q = ++ix.q; let b1 = 1e9, g1 = -1, b2 = 1e9; // best, and best of any other artwork
      for (let c = 0; c < CH; c++) {
        const key = piece(f.d, qo, c), list = ix.lists[c];
        for (let p = ix.heads[c][key], e = ix.heads[c][key + 1]; p < e; p++) {
          const gI = list[p]; if (ix.stamp[gI] === q) continue; ix.stamp[gI] = q;
          const go = gI * 8; let dist = 0; for (let k = 0; k < 8 && dist < b2; k++) dist += pc(f.d[qo + k] ^ ix.d[go + k]);
          if (dist < b1) { if (g1 >= 0 && ix.owner[g1] !== ix.owner[gI]) b2 = b1; b1 = dist; g1 = gI; } else if (dist < b2 && ix.owner[gI] !== ix.owner[g1]) b2 = dist;
        }
      }
      if (g1 < 0 || b1 > maxD || b2 - b1 < 4) continue; // too far, or two artworks claim it equally
      const it = ix.owner[g1], P = per[it], l = ix.local[g1]; if (P.used.has(l)) continue; P.used.add(l);
      const F = ix.items[it].f; P.mx.push(f.x[i]); P.my.push(f.y[i]); P.tx.push(F.x[l]); P.ty.push(F.y[l]);
    }
    const order = per.map((P, i) => [i, P.mx.length]).filter((v) => v[1] >= 4).sort((a, b) => b[1] - a[1]).slice(0, top);
    return order.map(([i, votes]) => { const P = per[i], v = verify(P.mx, P.my, P.tx, P.ty, 0x9E3779B9 ^ i);
      const g = o.guided === false || !plausible(v) ? v.inliers : Math.max(v.inliers, guided(ix.items[i].f, f, v.m));
      return { id: ix.items[i].id, votes, inliers: g, first: v.inliers, m: v.m }; })
      .sort((a, b) => b.inliers - a.inliers || b.votes - a.votes);
  }
  // A placement worth a guided look: at least 4 corners already agree, and the artwork's size in the frame is believable
  // (from a close-up showing half of it to a far view where it fills a fifth of the frame). Three corners always fit some
  // placement, often a squashed one that would gather chance agreement.
  function plausible(v) { if (!v.m || v.inliers < 4) return false; const s = Math.sqrt(Math.abs(v.m[0] * v.m[4] - v.m[1] * v.m[3])); return s >= 0.45 && s <= 5; }
  // Guided matching: with a placement in hand, every corner of the frame is compared with the artwork's corners at the
  // spot the placement puts it (no index, a looser description distance). A partly hidden or reflecting artwork is then
  // counted by all of its visible part instead of by the few corners the first look happened to pair up; a wrong
  // placement finds next to nothing, because a corner must agree in place AND in description.
  function guided(F, f, m) {
    if (!m) return 0;
    const C = 0.03, grid = new Map(), key = (x, y) => Math.floor(x / C) * 4096 + Math.floor(y / C);
    for (let l = 0; l < F.n; l++) { const k = key(F.x[l], F.y[l]); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(l); }
    const used = new Set(); let count = 0;
    for (let i = 0; i < f.n; i++) {
      const ax = m[0] * f.x[i] + m[1] * f.y[i] + m[2], ay = m[3] * f.x[i] + m[4] * f.y[i] + m[5];
      if (ax < -C || ay < -C || ax > 1 + C || ay > 1 + C) continue;
      const cx = Math.floor(ax / C), cy = Math.floor(ay / C); let best = 56, bl = -1;
      for (let u = cx - 1; u <= cx + 1; u++) for (let w = cy - 1; w <= cy + 1; w++) { const a = grid.get(u * 4096 + w); if (!a) continue;
        for (const l of a) { const ex = F.x[l] - ax, ey = F.y[l] - ay; if (ex * ex + ey * ey > C * C) continue;
          let d = 0; for (let k = 0; k < 8 && d < best; k++) d += pc(f.d[i * 8 + k] ^ F.d[l * 8 + k]); if (d < best) { best = d; bl = l; } } }
      if (bl >= 0 && !used.has(bl)) { used.add(bl); count++; }
    }
    return count;
  }
  // The answer for one frame: the leading artwork when it is clearly ahead, else null. 8 agreeing corners (counted by the
  // guided look) were never reached by a wrong artwork or an unknown picture in the tests (portal-recognize: 140 artworks,
  // glare and hands, 60 strangers); a right one usually has 15-60, a text-heavy real print 8-11. The viewer also wants 2
  // frames of 3 to agree.
  function decide(res, opts) {
    const o = opts || {}, min = o.min || 8, a = res[0], b = res[1];
    if (!a || a.inliers < min) return null;
    if (b && b.inliers * 1.5 > a.inliers) return null;
    return a.id;
  }

  // One frame is enough when the leader is far ahead: many agreeing corners and the runner-up nowhere near (a wrong
  // artwork never reached 8 in the tests, so 16 with three times the runner-up leaves a wide margin).
  function confident(res) { const a = res[0], b = res[1]; return !!a && a.inliers >= 16 && a.inliers >= 3 * (b ? b.inliers : 0) ? a.id : null; }
  // Where the artwork's centre lies in a w x h frame, from a placement m (frame -> artwork, see verify): [x, y] as
  // fractions of the frame's width and height, or null.
  function centre(m, F, w, h) {
    if (!m || !F) return null;
    const det = m[0] * m[4] - m[1] * m[3]; if (!det) return null;
    const ax = (F.aspect >= 1 ? 1 : F.aspect) / 2 - m[2], ay = (F.aspect >= 1 ? 1 / F.aspect : 1) / 2 - m[5], L = Math.max(w, h);
    const fx = (m[4] * ax - m[1] * ay) / det, fy = (-m[3] * ax + m[0] * ay) / det;
    return [fx * L / w, fy * L / h];
  }

  const api = { confident, centre, gray, resize, smooth, fast, extract, artFeatures, frameFeatures, pack, unpack, buildIndex, match, decide, ART, CAM };
  if (typeof module !== "undefined") module.exports = api; else root.Recognize = api;
})(typeof window !== "undefined" ? window : globalThis);
