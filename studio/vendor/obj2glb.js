/* Minimal OBJ -> GLB transcoder (editor import-time only).
   Supports v + f (triangulated as a fan, 1-based and negative indices); normals/uvs/materials
   are dropped - glTF clients compute flat normals when NORMAL is omitted (per spec).
   Output: valid glTF 2.0 binary with a single non-indexed triangle-soup mesh. */
(function () {
  function objPositions(text) {
    const verts = [[0, 0, 0]]; // OBJ indices are 1-based
    const out = [];
    for (const raw of text.split("\n")) {
      const p = raw.trim().split(/\s+/);
      if (p[0] === "v" && p.length >= 4) verts.push([+p[1] || 0, +p[2] || 0, +p[3] || 0]);
      else if (p[0] === "f" && p.length >= 4) {
        const idx = p.slice(1).map((tok) => {
          const i = parseInt(tok.split("/")[0], 10);
          return i < 0 ? verts.length + i : i; // negative = relative to end
        });
        for (let i = 1; i + 1 < idx.length; i++) out.push(idx[0], idx[i], idx[i + 1]);
      }
    }
    const arr = new Float32Array(out.length * 3);
    out.forEach((vi, k) => { const v = verts[vi] || [0, 0, 0]; arr[k * 3] = v[0]; arr[k * 3 + 1] = v[1]; arr[k * 3 + 2] = v[2]; });
    return arr;
  }
  function pad4(n) { return (4 - (n % 4)) % 4; }
  function objToGlb(text) {
    const positions = objPositions(text);
    if (!positions.length) return null;
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) for (let a = 0; a < 3; a++) {
      mn[a] = Math.min(mn[a], positions[i + a]); mx[a] = Math.max(mx[a], positions[i + a]);
    }
    const json = { asset: { version: "2.0", generator: "ar-studio obj2glb" }, scene: 0,
      scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      accessors: [{ bufferView: 0, componentType: 5126, count: positions.length / 3, type: "VEC3", min: mn, max: mx }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }],
      buffers: [{ byteLength: positions.byteLength }] };
    let jsStr = JSON.stringify(json);
    while (jsStr.length % 4) jsStr += " ";
    const js = new TextEncoder().encode(jsStr);
    const bin = new Uint8Array(positions.buffer.slice(0));
    const total = 12 + 8 + js.length + 8 + bin.length + pad4(bin.length);
    const out = new ArrayBuffer(total);
    const dv = new DataView(out);
    const u8 = new Uint8Array(out);
    dv.setUint32(0, 0x46546C67, true); // "glTF"
    dv.setUint32(4, 2, true);
    dv.setUint32(8, total, true);
    dv.setUint32(12, js.length, true);
    dv.setUint32(16, 0x4E4F534A, true); // "JSON"
    u8.set(js, 20);
    let off = 20 + js.length;
    dv.setUint32(off, bin.length + pad4(bin.length), true);
    dv.setUint32(off + 4, 0x004E4942, true); // "BIN\0"
    u8.set(bin, off + 8);
    return new Uint8Array(out);
  }
  /* OBJ+MTL -> GLB with basic materials. MTL subset: newmtl / Kd (base color) /
     map_Kd (base texture; caller supplies bytes). Lighting maps, specular fields and
     normals are intentionally not imported (the caller surfaces that limitation).
     OBJ vt origin is bottom-left; glTF UV origin is top-left, so v is flipped. */
  function parseMtl(text) {
    const mats = new Map(); let cur = null;
    for (const raw of (text || "").split("\n")) {
      const p = raw.trim().split(/\s+/);
      if (p[0] === "newmtl") { cur = { kd: null, map: null }; mats.set(p.slice(1).join(" "), cur); }
      else if (cur && p[0] === "Kd" && p.length >= 4) cur.kd = [+p[1], +p[2], +p[3]].map((v) => Math.max(0, Math.min(1, v || 0)));
      else if (cur && p[0] === "map_Kd" && p.length >= 2) cur.map = p[p.length - 1];
    }
    return mats;
  }
  function objMtlZipToGlb(objText, mtlText, getTexture) {
    const mats = parseMtl(mtlText);
    const verts = [[0, 0, 0]], uvs = [[0, 0]], groups = [];
    let curMat = null, group = null;
    for (const raw of objText.split("\n")) {
      const p = raw.trim().split(/\s+/);
      if (p[0] === "v" && p.length >= 4) verts.push([+p[1] || 0, +p[2] || 0, +p[3] || 0]);
      else if (p[0] === "vt" && p.length >= 3) uvs.push([+p[1] || 0, 1 - (+p[2] || 0)]);
      else if (p[0] === "usemtl") { curMat = p.slice(1).join(" "); group = null; }
      else if (p[0] === "f" && p.length >= 4) {
        const idx = p.slice(1).map((tok) => {
          const parts = tok.split("/");
          let v = parseInt(parts[0], 10); v = v < 0 ? verts.length + v : v;
          let t = parts[1] ? parseInt(parts[1], 10) : 0; if (t) t = t < 0 ? uvs.length + t : t;
          return [v, t];
        });
        if (!group) { group = { mat: curMat, pos: [], uv: [] }; groups.push(group); }
        for (let i = 1; i + 1 < idx.length; i++) for (const k of [0, i, i + 1]) {
          group.pos.push(verts[idx[k][0]] || [0, 0, 0]);
          group.uv.push(uvs[idx[k][1]] || [0, 0]);
        }
      }
    }
    const used = groups.filter((g) => g.pos.length);
    if (!used.length) return null;
    const binParts = []; let binLen = 0;
    const addBin = (bytes) => {
      const off = binLen, pad = (4 - (bytes.length % 4)) % 4;
      binParts.push(bytes); if (pad) binParts.push(new Uint8Array(pad));
      binLen += bytes.length + pad; return { byteOffset: off, byteLength: bytes.length };
    };
    const bufferViews = [], accessors = [], materials = [], primitives = [], images = [], textures = [];
    const matIndex = new Map();
    for (const g of used) {
      const pos = new Float32Array(g.pos.length * 3), uv = new Float32Array(g.uv.length * 2);
      g.pos.forEach((v, k) => { pos[k * 3] = v[0]; pos[k * 3 + 1] = v[1]; pos[k * 3 + 2] = v[2]; });
      g.uv.forEach((t, k) => { uv[k * 2] = t[0]; uv[k * 2 + 1] = t[1]; });
      const pbv = addBin(new Uint8Array(pos.buffer)), uvb = addBin(new Uint8Array(uv.buffer));
      let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < pos.length; i += 3) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], pos[i + a]); mx[a] = Math.max(mx[a], pos[i + a]); }
      bufferViews.push({ buffer: 0, byteOffset: pbv.byteOffset, byteLength: pbv.byteLength });
      bufferViews.push({ buffer: 0, byteOffset: uvb.byteOffset, byteLength: uvb.byteLength });
      accessors.push({ bufferView: bufferViews.length - 2, componentType: 5126, count: pos.length / 3, type: "VEC3", min: mn, max: mx });
      accessors.push({ bufferView: bufferViews.length - 1, componentType: 5126, count: uv.length / 2, type: "VEC2" });
      if (!matIndex.has(g.mat)) {
        const def = g.mat != null ? mats.get(g.mat) : null;
        const m = { name: g.mat || "default", pbrMetallicRoughness: { baseColorFactor: def && def.kd ? [...def.kd, 1] : [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 } };
        if (def && def.map) {
          const tex = getTexture(def.map);
          if (!tex) throw Error("טקסטורה חסרה ב־zip: " + def.map);
          const tb = addBin(tex.bytes);
          bufferViews.push({ buffer: 0, byteOffset: tb.byteOffset, byteLength: tb.byteLength });
          images.push({ mimeType: tex.mime, bufferView: bufferViews.length - 1 });
          textures.push({ source: images.length - 1, sampler: 0 });
          m.pbrMetallicRoughness.baseColorTexture = { index: textures.length - 1 };
        }
        matIndex.set(g.mat, materials.length); materials.push(m);
      }
      primitives.push({ attributes: { POSITION: accessors.length - 2, TEXCOORD_0: accessors.length - 1 }, material: matIndex.get(g.mat) });
    }
    const json = { asset: { version: "2.0", generator: "ar-studio obj2glb+mtl" }, scene: 0,
      scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
      meshes: [{ primitives }], materials, accessors, bufferViews,
      buffers: [{ byteLength: binLen }] };
    if (images.length) { json.images = images; json.textures = textures; json.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }]; }
    let jsStr = JSON.stringify(json);
    while (jsStr.length % 4) jsStr += " ";
    const js = new TextEncoder().encode(jsStr);
    const total = 12 + 8 + js.length + 8 + binLen;
    const out = new ArrayBuffer(total), dv = new DataView(out), u8 = new Uint8Array(out);
    dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
    dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4E4F534A, true);
    u8.set(js, 20);
    let off = 20 + js.length;
    dv.setUint32(off, binLen, true); dv.setUint32(off + 4, 0x004E4942, true);
    let w = off + 8;
    for (const part of binParts) { u8.set(part, w); w += part.length; }
    return new Uint8Array(out);
  }
  window.objToGlb = objToGlb;
  window.objMtlZipToGlb = objMtlZipToGlb;
})();
