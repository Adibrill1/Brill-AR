/* Minimal GIF89a decoder + animated-canvas pump for the AR studio.
   Own implementation (no deps): parses header/LSD/GCT, GCE (delay/disposal/transparent),
   image descriptors (global/local color tables), LZW sub-block data. Interlaced GIFs are
   rejected (rare; honest error beats wrong pixels). Compositing follows disposal 0/1/2/3.
   Exposes window.GifAnim.parse(arrayBuffer) -> {width,height,frames:[{delayMs, disposal,
   transparent, left,top,w,h, pixels:Uint8ClampedArray RGBA}]} and
   window.GifAnim.startPump(canvas, gif) -> {stop()}; the pump composites frames onto the
   canvas on their own delays and marks an optional entity's texture dirty each frame. */
(function () {
  function parseGif(buf) {
    const d = new Uint8Array(buf);
    let p = 0;
    const u16 = () => { const v = d[p] | (d[p + 1] << 8); p += 2; return v; };
    const str = (n) => { let s = ""; for (let i = 0; i < n; i++) s += String.fromCharCode(d[p++]); return s; };
    if (str(6).slice(0, 3) !== "GIF") throw new Error("not a gif");
    const width = u16(), height = u16();
    const packed = d[p++]; p++; p++; // bg, aspect
    const gctFlag = packed & 0x80, gctSize = 3 * (1 << ((packed & 7) + 1));
    let gct = null;
    if (gctFlag) { gct = d.slice(p, p + gctSize); p += gctSize; }
    let gce = { disposal: 0, delayMs: 100, transparent: -1 };
    const frames = [];
    while (p < d.length) {
      const tag = d[p++];
      if (tag === 0x3B) break; // trailer
      if (tag === 0x21) { // extension
        const label = d[p++];
        if (label === 0xF9) {
          p++; // block size (4)
          const pk = d[p++];
          const delay = u16();
          const tIdx = d[p++]; p++; // terminator
          gce = { disposal: (pk >> 2) & 7, delayMs: Math.max(20, delay * 10), transparent: (pk & 1) ? tIdx : -1 };
        } else {
          let n; while ((n = d[p++]) !== 0) p += n; // skip sub-blocks
        }
      } else if (tag === 0x2C) { // image descriptor
        const left = u16(), top = u16(), w = u16(), h = u16();
        const ip = d[p++];
        const lctFlag = ip & 0x80, interlaced = ip & 0x40;
        let ct = gct;
        if (lctFlag) { const sz = 3 * (1 << ((ip & 7) + 1)); ct = d.slice(p, p + sz); p += sz; }
        if (!ct) throw new Error("no color table");
        if (interlaced) throw new Error("interlaced");
        const minCode = d[p++];
        let dataLen = 0; const start = p;
        { let n; while ((n = d[p++]) !== 0) { dataLen += n; p += n; } }
        const packed2 = new Uint8Array(dataLen);
        { let q = start, o = 0, n; while ((n = d[q++]) !== 0) { packed2.set(d.subarray(q, q + n), o); o += n; q += n; } }
        const idx = lzwDecode(packed2, minCode, w * h);
        const px = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < w * h; i++) {
          const c = idx[i] * 3;
          px[i * 4] = ct[c]; px[i * 4 + 1] = ct[c + 1]; px[i * 4 + 2] = ct[c + 2];
          px[i * 4 + 3] = idx[i] === gce.transparent ? 0 : 255;
        }
        frames.push({ left, top, w, h, pixels: px, delayMs: gce.delayMs, disposal: gce.disposal, transparent: gce.transparent >= 0 });
        gce = { disposal: 0, delayMs: 100, transparent: -1 };
      } else throw new Error("bad block 0x" + tag.toString(16));
    }
    if (!frames.length) throw new Error("no frames");
    return { width, height, frames };
  }
  function lzwDecode(data, minCode, expected) {
    const clear = 1 << minCode, eoi = clear + 1;
    let codeSize = minCode + 1, dict = [], next = eoi + 1;
    const out = new Uint8Array(expected); let o = 0;
    const reset = () => { dict = []; for (let i = 0; i < clear; i++) dict[i] = [i]; dict[clear] = []; dict[eoi] = null; next = eoi + 1; codeSize = minCode + 1; };
    reset();
    let bit = 0, prev = null;
    const readCode = () => {
      let v = 0;
      for (let i = 0; i < codeSize; i++) {
        const bytePos = bit >> 3;
        if (bytePos >= data.length) return -1;
        v |= ((data[bytePos] >> (bit & 7)) & 1) << i; bit++;
      }
      return v;
    };
    while (o < expected) {
      const code = readCode();
      if (code < 0 || code === eoi) break;
      if (code === clear) { reset(); prev = null; continue; }
      let entry;
      if (dict[code]) entry = dict[code];
      else if (code === next && prev) entry = prev.concat(prev[0]);
      else break;
      for (let i = 0; i < entry.length && o < expected; i++) out[o++] = entry[i];
      if (prev) { dict[next++] = prev.concat(entry[0]); if (next === (1 << codeSize) && codeSize < 12) codeSize++; }
      prev = entry;
    }
    return out;
  }
  function startPump(canvas, gif, getEntity) {
    const ctx = canvas.getContext("2d");
    canvas.width = gif.width; canvas.height = gif.height;
    let full = ctx.createImageData(gif.width, gif.height);
    let i = 0, timer = null, stopped = false, prevDispose = null;
    const markDirty = () => {
      const ent = getEntity && getEntity();
      const mesh = ent && ent.getObject3D && ent.getObject3D("mesh");
      const t = mesh && mesh.material && mesh.material.map;
      if (!t) return;
      // NPOT safety: most GIFs are non-power-of-two; mipmapped/repeat sampling makes the
      // texture incomplete (invisible) on WebGL1. Force linear+clamp; idempotent per frame.
      t.generateMipmaps = false;
      if (t.minFilter !== 1006) t.minFilter = 1006; // LinearFilter
      if (t.wrapS !== 1000) t.wrapS = 1000; // ClampToEdgeWrapping
      if (t.wrapT !== 1000) t.wrapT = 1000;
      t.needsUpdate = true;
    };
    const draw = () => {
      if (stopped) return;
      if (prevDispose) { // undo the PREVIOUS frame per its disposal mode
        const pv = prevDispose;
        if (pv.disposal === 2) {
          for (let y = pv.top; y < pv.top + pv.h; y++) for (let x = pv.left; x < pv.left + pv.w; x++) {
            const k = (y * gif.width + x) * 4; full.data[k + 3] = 0;
          }
        } else if (pv.disposal === 3 && pv.saved) full.data.set(pv.saved);
        prevDispose = null;
      }
      const f = gif.frames[i];
      const saved = f.disposal === 3 ? full.data.slice() : null;
      for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
        const si = (y * f.w + x) * 4;
        if (f.pixels[si + 3] === 0) continue; // transparent keeps backdrop
        const di = ((f.top + y) * gif.width + (f.left + x)) * 4;
        full.data[di] = f.pixels[si]; full.data[di + 1] = f.pixels[si + 1];
        full.data[di + 2] = f.pixels[si + 2]; full.data[di + 3] = 255;
      }
      ctx.putImageData(full, 0, 0);
      markDirty();
      prevDispose = f.disposal >= 2 ? { disposal: f.disposal, top: f.top, left: f.left, w: f.w, h: f.h, saved } : null;
      i = (i + 1) % gif.frames.length;
      timer = setTimeout(draw, f.delayMs);
    };
    draw();
    return { stop: () => { stopped = true; if (timer) clearTimeout(timer); } };
  }
  window.GifAnim = { parse: parseGif, startPump };
})();
