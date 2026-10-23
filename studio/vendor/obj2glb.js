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
  window.objToGlb = objToGlb;
})();
