"use strict";
/* Live code animations ("אנימציות קוד"): five looks drawn in three.js, written here, with no files to download.
   el.codefx = { look, colors[3], speed, amount, size (0-1 each), kind, text, touch, cover, seed }:
     dissolve  a picture (el.assetId, the artwork by default) falls apart into coloured dust and gathers back
     dust      a greeting written in gold dust that swirls in, sparkles and blows away
     portal    the layer becomes a window into a deep world behind it (interior mapping: the view ray is followed
               into a box behind the window, so it is flat geometry in front of the artwork and nothing hides it)
     swarm     a school of fish, a flock of birds or butterflies (boids) around the artwork; a touch scatters them
     ivy       vines grow around the frame, leaves unfold and small flowers open
   Each look is one A-Frame component, "studio-codefx", built in Studio.buildElementEntity. It is an overlay layer,
   so the editor's flat view draws it with the same scene. Time runs from tick's dt times the speed, so a paused
   editor (dt of almost nothing) holds it still. Its materials copy material.opacity into their own uniform each
   frame, so fades, the opacity control and entrances keep working. */
(() => {
  if (!window.AFRAME || !window.THREE || AFRAME.components["studio-codefx"]) return;
  const TAU = Math.PI * 2;
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const rand = (seed) => { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; };
  // colours go to the shaders as they are written (the shaders write them out unconverted), so they look as picked
  const vec3 = (hex) => { const n = /^#[0-9a-f]{6}$/i.test(hex || "") ? parseInt(hex.slice(1), 16) : 0xffffff; return new THREE.Color().setRGB((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255); };
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const pace = (cfg) => 0.25 + 1.75 * (Number.isFinite(cfg.speed) ? cfg.speed : 0.5);
  const val = (x, d) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : d);

  // the drawing height in pixels and whether the camera has perspective, for point sizes in world units
  function viewInfo(sc) {
    const r = sc && sc.renderer, c = r && r.domElement;
    return c ? c.height || 1 : 1;
  }

  // ---------- dust: a picture or words made of points ----------
  const DUST_VS = `
attribute vec3 home; attribute vec3 rnd; attribute vec3 tint;
uniform float uT, uTime, uSize, uVh, uMode, uKind; uniform vec2 uBox; uniform vec4 uTouch; uniform vec3 uC1, uC2, uC3;
varying vec3 vCol; varying float vA;
vec3 pal(float x) { x = fract(x); return x < 0.5 ? mix(uC2, uC3, x * 2.0) : mix(uC3, uC2, x * 2.0 - 1.0); }
vec3 gold(float x) { x = fract(x); return x < 0.33 ? mix(uC1, uC2, x * 3.0) : (x < 0.66 ? mix(uC2, uC3, x * 3.0 - 1.0) : mix(uC3, uC1, x * 3.0 - 2.0)); }
void main() {
  float W = uBox.x, H = uBox.y, e;
  vec3 p = home, off;
  if (uMode < 0.5) {
    // a picture: whole, then it goes (each grain in its own moment, in a sweep), drifts, and comes back
    float sweep = uKind < 0.5 ? 0.5 - home.x / W : (uKind < 1.5 ? length(home.xy) / length(uBox) * 2.0 : 1.0 - length(home.xy) / length(uBox) * 2.0);
    float s = clamp(sweep, 0.0, 1.0) * 0.16 + rnd.x * 0.05;
    e = smoothstep(0.28 + s, 0.42 + s, uT) * (1.0 - smoothstep(0.62 + s * 0.8, 0.78 + s * 0.8, uT));
    if (uKind < 0.5) off = vec3((0.3 + rnd.x * 0.8) * W * 0.65, (0.1 + rnd.y * 0.6) * H * 0.55, rnd.z * H * 0.4);
    else if (uKind < 1.5) { vec2 d = normalize(home.xy + (rnd.xy - 0.5) * W * 0.3 + 1e-4); off = vec3(d * (0.2 + rnd.z * 0.6) * W * 0.6, (0.2 + rnd.z) * H * 0.5); }
    else { float a = atan(home.y, home.x) + (2.5 + rnd.x * 3.0), r = length(home.xy) * (1.15 + rnd.y * 0.5); off = vec3(cos(a) * r, sin(a) * r, rnd.z * H * 0.5) - home; }
    vCol = mix(tint, pal(rnd.y + uTime * 0.05), e * 0.55);
    vA = 1.0 - e * 0.2;
  } else {
    // words: the dust gathers into the letters, glitters, and is blown away (or falls in like glitter rain)
    float s = rnd.x * 0.12 + (0.5 - home.x / W) * 0.1;
    float inn = 1.0 - smoothstep(0.04 + s, 0.30 + s, uT), gone = smoothstep(0.72 + s, 0.96 + s, uT);
    e = max(inn, gone);
    if (inn > gone) {
      if (uKind < 0.5) { float a = rnd.y * 6.2832 + inn * 4.0, r = (0.6 + rnd.z) * W * 0.55; off = vec3(cos(a) * r, sin(a) * r * 0.6, rnd.x * H * 1.5) - home * 0.4; }
      else off = vec3((rnd.x - 0.5) * W * 0.3, H * (1.2 + rnd.y * 1.6), rnd.z * H * 0.5);
    } else off = vec3(-(0.4 + rnd.x) * W * 0.8, H * (0.3 + rnd.y * 1.2), rnd.z * H);
    float tw = 0.55 + 0.45 * sin(uTime * (3.0 + rnd.z * 5.0) + rnd.y * 40.0);
    vCol = gold(rnd.y + home.x / W * 0.6) * (0.55 + 0.7 * pow(tw, 8.0)); // added light: kept low so overlapping grains stay gold, not white
    vA = (1.0 - e * 0.5) * (0.6 + 0.4 * tw);
  }
  vec3 drift = vec3(sin(uTime * 1.3 + rnd.x * 20.0), cos(uTime * 1.1 + rnd.y * 20.0), sin(uTime * 0.9 + rnd.z * 20.0)) * W * 0.03;
  p += (off + drift) * e;
  // a finger pushes the grains aside
  if (uTouch.z > 0.001) { vec2 d = p.xy - uTouch.xy; float r = length(d), R = uTouch.w; if (r < R) p.xy += (r > 1e-5 ? d / r : vec2(0.0, 1.0)) * (R - r) * 0.9 * uTouch.z; }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float persp = projectionMatrix[2][3] != 0.0 ? -mv.z : 1.0;
  gl_PointSize = clamp(uSize * (1.0 - e * 0.35) * uVh * 0.5 * projectionMatrix[1][1] / max(persp, 1e-4), 1.0, 48.0);
}`;
  const DUST_FS = `
uniform float uMode, uOpacity; varying vec3 vCol; varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5; float r = length(c), a;
  if (uMode < 0.5) { if (r > 0.5) discard; a = 1.0 - smoothstep(0.38, 0.5, r); }
  else { a = exp(-r * r * 22.0) + 0.35 * exp(-r * r * 4.0) * step(r, 0.5); }
  gl_FragColor = vec4(vCol, a * vA * uOpacity);
}`;
  // the whole picture shown as itself while it is whole, so it stays sharp; the dust takes over when it starts to go
  const PIC_FS = `uniform sampler2D map; uniform float uA, uOpacity; varying vec2 vUv; void main() { vec4 c = texture2D(map, vUv); gl_FragColor = vec4(c.rgb, c.a * uA * uOpacity); }`;
  const FLAT_VS = `varying vec2 vUv; varying vec2 vP; void main() { vUv = uv; vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const FILL_FS = `uniform vec3 uC; uniform float uOpacity; void main() { gl_FragColor = vec4(uC, uOpacity); }`;

  // points from a picture: one per grid cell that is not see-through, with its colour
  function pointsFromImage(img, w, h, n) {
    const asp = w / h, gw = Math.max(8, Math.round(Math.sqrt(n * asp))), gh = Math.max(8, Math.round(gw / asp));
    const c = document.createElement("canvas"); c.width = gw; c.height = gh;
    const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0, gw, gh);
    const d = g.getImageData(0, 0, gw, gh).data, home = [], tint = [];
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const k = (j * gw + i) * 4; if (d[k + 3] < 90) continue;
      home.push(((i + 0.5) / gw - 0.5) * w, (0.5 - (j + 0.5) / gh) * h, 0);
      tint.push(d[k] / 255, d[k + 1] / 255, d[k + 2] / 255);
    }
    return { home, tint, cell: w / gw };
  }
  // points from words: the letters drawn big, and a random pick of their inked pixels
  function wordsCanvas(text, font) {
    const c = document.createElement("canvas"), g = c.getContext("2d");
    const lines = String(text || " ").split("\n").slice(0, 3), px = 120, fam = '"BA ' + (font || "heebo") + '", Heebo, Arial, sans-serif';
    g.font = "700 " + px + "px " + fam;
    const wide = Math.max(1, ...lines.map((l) => g.measureText(l).width));
    c.width = Math.ceil(wide + px * 0.4); c.height = Math.ceil(lines.length * px * 1.15 + px * 0.3);
    g.font = "700 " + px + "px " + fam; g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle"; g.direction = "rtl";
    lines.forEach((l, i) => g.fillText(l, c.width / 2, px * 0.15 + (i + 0.5) * px * 1.15));
    return c;
  }
  function pointsFromWords(text, font, w, h, n, rnd) {
    const c = wordsCanvas(text, font), g = c.getContext("2d", { willReadFrequently: true });
    const d = g.getImageData(0, 0, c.width, c.height).data, ink = [];
    for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) if (d[(y * c.width + x) * 4 + 3] > 128) ink.push(x, y);
    const home = [], tint = [], count = Math.min(n, ink.length / 2);
    for (let i = 0; i < count; i++) {
      const k = Math.floor(rnd() * ink.length / 2) * 2;
      home.push(((ink[k] + rnd() * 2) / c.width - 0.5) * w, (0.5 - (ink[k + 1] + rnd() * 2) / c.height) * h, (rnd() - 0.5) * w * 0.004);
      tint.push(1, 1, 1);
    }
    return { home, tint, cell: w / c.width * 2.2 };
  }

  // ---------- portal: a window into a deep box ----------
  const PORTAL_FS = `
uniform vec3 uEye, uC1, uC2, uC3; uniform vec2 uSize; uniform float uDepth, uTime, uKind, uAmount, uShape, uOpacity;
varying vec2 vP;
float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + 1.0), f.x), f.y); }
float stars(vec2 p, float k) { vec2 i = floor(p), f = fract(p) - 0.5; float h = h21(i); vec2 o = vec2(h21(i + 7.1), h21(i + 3.7)) - 0.5; float r = length(f - o * 0.7); return step(1.0 - k, h) * smoothstep(0.16, 0.0, r) * (0.7 + 0.3 * sin(uTime * 3.0 + h * 50.0)) * 1.6; }
void main() {
  vec2 hs = uSize * 0.5;
  // the window's shape: a rectangle, a circle or an arch
  vec2 q = vP / hs;
  if (uShape > 0.5 && uShape < 1.5 && length(q) > 1.0) discard;
  if (uShape > 1.5 && vP.y > hs.y - hs.x && length(vP - vec2(0.0, hs.y - hs.x)) > hs.x) discard; // an arch: a half circle on top
  vec3 P = vec3(vP, 0.0), d = normalize(P - uEye);
  d.z = min(d.z, -0.0005);
  float tx = abs(d.x) < 1e-5 ? 1e9 : (sign(d.x) * hs.x - P.x) / d.x;
  float ty = abs(d.y) < 1e-5 ? 1e9 : (sign(d.y) * hs.y - P.y) / d.y;
  float tz = -uDepth / d.z, t = min(min(tx, ty), tz);
  vec3 H = P + d * t;
  float z = -H.z / uDepth; // 0 at the window, 1 at the far wall
  bool back = t >= tz - 1e-5;
  vec2 wall = back ? H.xy / hs : vec2((tx < ty ? (H.y / hs.y) : (H.x / hs.x)), z);
  vec3 col;
  float run = uTime * 0.35;
  if (uKind < 0.5) { // a tunnel of light: rings rush toward the viewer, streaks run along the walls
    float rings = pow(abs(sin((z * 7.0 * (0.6 + uAmount) - run * 3.0) * 3.14159)), 18.0);
    float streak = pow(noise(vec2((tx < ty ? H.y / hs.y : H.x / hs.x) * 9.0, z * 2.0 - run * 2.0)), 6.0) * 2.0;
    col = mix(uC1, uC2, z) + uC3 * rings * (1.0 - z * 0.6) + uC2 * streak * 0.6;
    if (back) { float r = length(H.xy / hs); col = mix(uC3 * 1.6, uC2, smoothstep(0.0, 0.9, r)) + uC3 * 0.4 * (1.0 - r); }
  } else if (uKind < 1.5) { // deep space: stars on every wall, a glowing nebula far away
    vec2 sp = back ? H.xy / hs * 6.0 : vec2(wall.x * 4.0, z * 10.0 - run * 2.0);
    float s = stars(sp * 2.0, 0.12 + uAmount * 0.12) + stars(sp * 4.5 + 4.0, 0.08 + uAmount * 0.1) * 0.7;
    float neb = noise(sp * 0.7 + run * 0.3);
    col = uC1 * (1.0 - z * 0.3) + mix(uC2, uC3, neb) * neb * neb * 0.35 + vec3(s);
    if (back) { vec2 b = H.xy / hs; float n = noise(b * 2.5 + run * 0.2) * noise(b * 5.0 - run * 0.1); col = uC1 + mix(uC2, uC3, noise(b * 1.5 + 3.0)) * n * 2.2 + vec3(s); }
  } else { // a room of glowing tiles, like an old video game, a big striped sun on the far wall
    vec2 g = back ? H.xy / hs * 4.0 : vec2(wall.x * 4.0, z * 8.0 * (0.6 + uAmount) + run * 2.0);
    vec2 f = abs(fract(g) - 0.5);
    float line = smoothstep(0.46, 0.5, max(f.x, f.y));
    col = mix(uC1, uC1 * 0.4, z) + uC2 * line * (1.0 - z * 0.7);
    if (back) {
      vec2 b = H.xy / hs; float r = length(b - vec2(0.0, 0.1));
      float sun = step(r, 0.55) * step(0.18, fract(b.y * 7.0 - run * 0.5) + smoothstep(0.1, -0.5, b.y));
      col = mix(uC1 * 1.4, uC3, smoothstep(-1.0, 1.0, b.y) * 0.25) + mix(uC3, uC2, smoothstep(0.55, -0.4, b.y)) * sun;
    }
  }
  col = mix(col, uC1 * 0.5, smoothstep(0.35, 1.0, z) * 0.5); // the far part fades into the world's own colour
  // the window's rim glows
  vec2 m = hs - abs(vP); float edge = uShape > 0.5 && uShape < 1.5 ? (1.0 - length(q)) * min(hs.x, hs.y) : min(m.x, m.y);
  col += uC2 * exp(-max(edge, 0.0) / (min(hs.x, hs.y) * 0.035)) * 0.9;
  gl_FragColor = vec4(col, uOpacity);
}`;

  // ---------- swarm: fish, birds, butterflies ----------
  const SWARM_VS = `
attribute float bend; attribute float shade; attribute float phase;
uniform float uTime, uKind;
varying vec3 vCol; varying float vShade;
void main() {
  vec3 p = position;
  float t = uTime * (uKind < 0.5 ? 9.0 : uKind < 1.5 ? 11.0 : 16.0) + phase * 6.2832;
  if (uKind < 0.5) p.z += sin(t - p.x * 6.0) * 0.16 * bend; // a fish: the tail sweeps side to side
  else p.y += sin(t) * abs(p.z) * (uKind < 1.5 ? 0.9 : 1.6) * bend; // wings beat
  vec4 w = vec4(p, 1.0);
  #ifdef USE_INSTANCING
  w = instanceMatrix * w;
  #endif
  vCol = vec3(1.0);
  #ifdef USE_INSTANCING_COLOR
  vCol = instanceColor;
  #endif
  vShade = shade;
  gl_Position = projectionMatrix * modelViewMatrix * w;
}`;
  const SWARM_FS = `uniform float uOpacity; uniform vec3 uC3; varying vec3 vCol; varying float vShade; void main() { gl_FragColor = vec4(mix(vCol * 0.55, mix(vCol, uC3, 0.35) * 1.15, vShade), uOpacity); }`;
  // one body in its own units (length about 1, nose to +x), with how much each corner bends and how light it is
  function bodyGeometry(kind) {
    const pos = [], bend = [], shade = [];
    const tri = (a, b, c) => { for (const v of [a, b, c]) { pos.push(v[0], v[1], v[2]); bend.push(v[3]); shade.push(v[4]); } };
    if (kind === 0) { // fish: a body and a forked tail, darker back, light belly
      const nose = [0.5, 0, 0, 0, 0.6], top = [0.05, 0.2, 0, 0.15, 0.1], bot = [0.05, -0.17, 0, 0.15, 1], tail = [-0.28, 0, 0, 0.6, 0.5];
      const tt = [-0.52, 0.17, 0, 1, 0.2], tb = [-0.52, -0.17, 0, 1, 0.8], fin = [0.12, 0.3, 0, 0.2, 0.0];
      tri(nose, top, tail); tri(nose, tail, bot); tri(tail, tt, tb); tri(top, fin, [-0.08, 0.17, 0, 0.3, 0.1]);
    } else if (kind === 1) { // bird: a slim body and two swept wings
      const n = [0.32, 0, 0, 0, 0.9], b = [-0.3, 0, 0, 0, 0.6];
      tri(n, [0, 0.04, 0, 0, 1], b); tri(n, b, [0, -0.03, 0, 0, 0.4]);
      for (const s of [1, -1]) tri([0.12, 0, 0, 0, 0.8], [-0.12, 0, 0, 0, 0.5], [-0.18, 0, 0.55 * s, 1, 0.9]);
    } else { // butterfly: four rounded wings on a thin body
      for (const s of [1, -1]) {
        tri([0.05, 0, 0, 0, 0.6], [0.32, 0, 0.42 * s, 1, 1], [-0.04, 0, 0.5 * s, 1, 0.8]);
        tri([0.05, 0, 0, 0, 0.6], [-0.04, 0, 0.5 * s, 1, 0.8], [-0.02, 0, 0.05 * s, 0.2, 0.5]);
        tri([-0.02, 0, 0, 0, 0.5], [-0.05, 0, 0.36 * s, 1, 0.7], [-0.3, 0, 0.28 * s, 1, 0.3]);
      }
      tri([0.2, 0.01, 0, 0, 0.2], [-0.25, 0.01, 0, 0, 0.2], [0, -0.02, 0, 0, 0.1]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("bend", new THREE.Float32BufferAttribute(bend, 1));
    g.setAttribute("shade", new THREE.Float32BufferAttribute(shade, 1));
    return g;
  }

  // ---------- ivy ----------
  const STEM_VS = `attribute float along; uniform float uGrow; varying float vGone; varying float vSide; attribute float side;
void main() { vGone = along - uGrow; vSide = side; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const STEM_FS = `uniform vec3 uC; uniform float uOpacity, uFade; varying float vGone; varying float vSide;
void main() { if (vGone > 0.0) discard; float r = 1.0 - vSide * vSide; gl_FragColor = vec4(uC * (0.55 + 0.45 * r), uOpacity * uFade); }`;
  const LEAF_VS = `
attribute vec2 corner; attribute vec4 leaf; attribute vec3 more; // leaf: x, y, angle, size; more: birth, kind (0 leaf, 1 flower, 2 bud), random
uniform float uGrow, uTime, uSway;
varying vec2 vUv; varying float vKind; varying float vOpen; varying float vR;
void main() {
  float born = more.x + (more.y > 0.5 ? 0.12 : 0.0);
  float g = smoothstep(born, born + (more.y > 0.5 ? 0.14 : 0.06), uGrow);
  float a = leaf.z + sin(uTime * 1.6 + more.z * 30.0) * 0.12 * uSway + (more.y > 0.5 ? (1.0 - g) * 1.5 : 0.0);
  vec2 c = corner * leaf.w * (more.y > 0.5 ? mix(0.3, 1.0, g) : g);
  vec2 r = vec2(c.x * cos(a) - c.y * sin(a), c.x * sin(a) + c.y * cos(a));
  vUv = corner; vKind = more.y; vOpen = g; vR = more.z;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(leaf.xy + r, 0.0015 + more.y * 0.001, 1.0);
}`;
  const LEAF_FS = `
uniform vec3 uC1, uC2, uC3; uniform float uOpacity, uFade;
varying vec2 vUv; varying float vKind; varying float vOpen; varying float vR;
void main() {
  if (vOpen < 0.01) discard;
  vec3 col; float a;
  if (vKind < 0.5) { // a leaf: base at x = -1, tip at x = 1, a heart-like outline, a pale middle vein
    float x = (vUv.x + 1.0) * 0.5, wdt = pow(sin(x * 3.14159), 0.75) * (0.62 - 0.22 * x);
    float d = abs(vUv.y) - wdt; if (d > 0.0) discard;
    float vein = smoothstep(0.08, 0.0, abs(vUv.y)) * step(0.1, x);
    col = mix(uC1 * 0.7, uC1 * 1.3, x * 0.6 + vUv.y * 0.4 + vR * 0.2) + vein * 0.14;
    a = smoothstep(0.0, -0.04, d);
  } else { // a flower opening: five petals around a round middle, a bud while it is closed
    float r = length(vUv), th = atan(vUv.y, vUv.x);
    float petals = vKind < 1.5 ? 5.0 : 0.0;
    float edge = vKind < 1.5 ? 0.55 + 0.42 * pow(abs(cos(th * petals * 0.5)), 0.6) : 0.55;
    edge *= mix(0.45, 1.0, vOpen);
    if (r > edge) discard;
    col = mix(uC2 * 1.15, uC2 * 0.75, r / edge);
    col = mix(col, uC3, smoothstep(0.24, 0.16, r));
    a = smoothstep(edge, edge - 0.05, r);
  }
  gl_FragColor = vec4(col, a * uOpacity * uFade);
}`;
  // the vines' paths, in the layer's own units (w by h, centred): lists of points
  function vinePaths(kind, w, h, R) {
    const m = Math.min(w, h) * 0.035, L = -w / 2 + m, Rr = w / 2 - m, B = -h / 2 + m, T = h / 2 - m, paths = [];
    if (kind === 1) { // from the four corners, partway along both sides
      const k = 0.42;
      for (const [cx, cy, sx, sy] of [[L, B, 1, 1], [Rr, B, -1, 1], [L, T, 1, -1], [Rr, T, -1, -1]]) {
        paths.push([[cx, cy], [cx, cy + sy * (h - 2 * m) * k]]);
        paths.push([[cx, cy], [cx + sx * (w - 2 * m) * k, cy]]);
      }
    } else if (kind === 2) { // up from the bottom edge, wandering
      const n = 5;
      for (let i = 0; i < n; i++) {
        const x0 = L + (Rr - L) * ((i + 0.5) / n + (R() - 0.5) * 0.08), top = B + (T - B) * (0.35 + R() * 0.35);
        paths.push([[x0, B], [x0 + (R() - 0.5) * w * 0.12, (B + top) / 2], [x0 + (R() - 0.5) * w * 0.15, top]]);
      }
    } else { // all around the frame: up both sides and along the top to the middle, and along the bottom
      paths.push([[L, B], [L, T], [0, T]], [[Rr, B], [Rr, T], [0, T]], [[L, B], [-w * 0.05, B]], [[Rr, B], [w * 0.05, B]]);
    }
    return paths;
  }
  // a polyline sampled finely, waving to the sides of its way, with its length along it
  function samplePath(pts, amp, R) {
    const out = []; let len = 0;
    const seg = []; for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); len += l; }
    const n = Math.max(24, Math.round(len / (amp * 0.6))), f1 = 2 + R() * 2, f2 = 5 + R() * 3, ph = R() * 6;
    for (let k = 0; k <= n; k++) {
      let d = (k / n) * len, i = 0; while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
      const a = pts[i], b = pts[i + 1], t = seg[i] ? d / seg[i] : 0, tx = (b[0] - a[0]) / (seg[i] || 1), ty = (b[1] - a[1]) / (seg[i] || 1);
      const s = k / n, wob = (Math.sin(s * len / amp * 0.5 * f1 / 3 + ph) * 0.7 + Math.sin(s * len / amp * f2 / 6 + ph * 2) * 0.3) * amp;
      out.push({ x: a[0] + (b[0] - a[0]) * t - ty * wob, y: a[1] + (b[1] - a[1]) * t + tx * wob, s, tx, ty });
    }
    return out;
  }

  // the proportions of a greeting's words, for the layer's shape
  window.StudioCodeFx = { wordsAspect: (text, font) => { const c = wordsCanvas(text, font); return c.width / c.height; } };

  AFRAME.registerComponent("studio-codefx", {
    schema: { cfg: { default: "{}" }, width: { default: 1 }, height: { default: 1 }, src: { default: "" } },
    init() { this.t = 0; this.mats = []; this.tmp = {}; this.finger = Studio.fingerTools; },
    update() { this.teardown(); this.build(); },
    remove() { this.teardown(); },
    teardown() {
      if (this.finger) this.finger.state.users.delete(this);
      if (this.group) { this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.uniforms && o.material.uniforms.map && o.material.uniforms.map.value) o.material.uniforms.map.value.dispose(); o.material.dispose(); } }); this.el.removeObject3D("codefx"); }
      this.group = null; this.mats = []; this.parts = null;
    },
    mat(opts) { const m = new THREE.ShaderMaterial(Object.assign({ transparent: true, depthWrite: false }, opts)); m.uniforms.uOpacity = { value: 1 }; this.mats.push(m); return m; },
    build() {
      let cfg; try { cfg = JSON.parse(this.data.cfg); } catch (e) { cfg = {}; }
      this.cfg = cfg; this.look = cfg.look; this.speed = pace(cfg);
      this.group = new THREE.Group();
      const w = this.data.width, h = this.data.height;
      const C = (cfg.colors || []).map(vec3); while (C.length < 3) C.push(new THREE.Color("#ffffff"));
      this.C = C;
      if (this.look === "dissolve" || this.look === "dust") this.buildDust(cfg, w, h, C);
      else if (this.look === "portal") this.buildPortal(cfg, w, h, C);
      else if (this.look === "swarm") this.buildSwarm(cfg, w, h, C);
      else if (this.look === "ivy") this.buildIvy(cfg, w, h, C);
      this.el.setObject3D("codefx", this.group); // the layer's order and opacity are put on its meshes when this arrives
      if (cfg.touch !== false && (this.look === "dissolve" || this.look === "dust" || this.look === "swarm") && this.finger) { this.finger.watch(); this.finger.state.users.add(this); }
    },

    buildDust(cfg, w, h, C) {
      const words = this.look === "dust", R = rand(1000 + (cfg.seed | 0));
      const add = (src) => {
        if (!this.group) return;
        const n = Math.round((words ? 2500 : 2500) + val(cfg.amount, 0.5) * 9500);
        const pts = words ? pointsFromWords(cfg.text || "מזל טוב", cfg.font, w, h, n, R) : pointsFromImage(src, w, h, n);
        const count = pts.home.length / 3; if (!count) return;
        const rnd = new Float32Array(count * 3); for (let i = 0; i < rnd.length; i++) rnd[i] = R();
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(pts.home, 3));
        g.setAttribute("home", new THREE.Float32BufferAttribute(pts.home, 3));
        g.setAttribute("tint", new THREE.Float32BufferAttribute(pts.tint, 3));
        g.setAttribute("rnd", new THREE.BufferAttribute(rnd, 3));
        g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Math.hypot(w, h) * 2); // the grains fly far from home
        const size = pts.cell * (words ? 1.3 + val(cfg.size, 0.5) * 2.4 : 1.25 + val(cfg.size, 0.5) * 0.9);
        const m = this.mat({ vertexShader: DUST_VS, fragmentShader: DUST_FS, blending: words ? THREE.AdditiveBlending : THREE.NormalBlending,
          uniforms: { uT: { value: 0 }, uTime: { value: 0 }, uSize: { value: size }, uVh: { value: 800 }, uMode: { value: words ? 1 : 0 }, uKind: { value: cfg.kind | 0 }, uBox: { value: new THREE.Vector2(w, h) },
            uTouch: { value: new THREE.Vector4(0, 0, 0, Math.max(w, h) * 0.18) }, uC1: { value: C[0] }, uC2: { value: C[1] }, uC3: { value: C[2] } } });
        const p = new THREE.Points(g, m); p.frustumCulled = false; this.group.add(p);
        this.parts.points = p;
      };
      this.parts = {};
      if (words) {
        const go = () => add(null);
        Studio.loadTextFonts({ font: cfg.font || "heebo", text: cfg.text || "א", bold: true }).then(go, go); // the letters in their own font
        return;
      }
      // the picture: a sharp copy while it is whole, a cover behind it so the real print does not show through the gaps
      if (cfg.cover !== false) {
        const fill = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat({ vertexShader: FLAT_VS, fragmentShader: FILL_FS, uniforms: { uC: { value: C[0] } } }));
        fill.position.z = -0.0006; this.group.add(fill); this.parts.fill = fill;
      }
      if (!this.data.src) return;
      const img = new Image(); img.crossOrigin = "anonymous";
      img.onload = () => {
        if (!this.group || this.data.src !== img.src) return;
        add(img);
        const tex = new THREE.Texture(img); tex.needsUpdate = true; // left undecoded: the shader writes its texels out as they are
        const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat({ vertexShader: FLAT_VS, fragmentShader: PIC_FS, uniforms: { map: { value: tex }, uA: { value: 1 } } }));
        pic.position.z = 0.0008; this.group.add(pic); this.parts.pic = pic;
        this.el.emit("object3dset", { object: this.group, type: "codefx" }, false); // the new meshes get the layer's order and opacity
      };
      img.src = this.data.src;
    },
    buildPortal(cfg, w, h, C) {
      const shape = { rect: 0, circle: 1, arch: 2 }[cfg.shape] || 0;
      const m = this.mat({ vertexShader: FLAT_VS, fragmentShader: PORTAL_FS, uniforms: { uEye: { value: new THREE.Vector3(0, 0, h * 2) }, uSize: { value: new THREE.Vector2(w, h) },
        uDepth: { value: h * (0.8 + val(cfg.amount, 0.5) * 3) }, uTime: { value: 0 }, uKind: { value: cfg.kind | 0 }, uAmount: { value: val(cfg.amount, 0.5) }, uShape: { value: shape },
        uC1: { value: C[0] }, uC2: { value: C[1] }, uC3: { value: C[2] } } });
      m.transparent = true; m.side = THREE.FrontSide;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); mesh.position.z = 0.001;
      this.group.add(mesh); this.parts = { portal: mesh, eye: new THREE.Vector3() };
    },
    buildSwarm(cfg, w, h, C) {
      const kind = Math.min(2, Math.max(0, cfg.kind | 0)), n = Math.round(12 + val(cfg.amount, 0.5) * 108), R = rand(2000 + (cfg.seed | 0));
      const geo = bodyGeometry(kind), ph = new Float32Array(n); for (let i = 0; i < n; i++) ph[i] = R();
      geo.setAttribute("phase", new THREE.InstancedBufferAttribute(ph, 1));
      const m = this.mat({ vertexShader: SWARM_VS, fragmentShader: SWARM_FS, side: THREE.DoubleSide, uniforms: { uTime: { value: 0 }, uKind: { value: kind }, uC3: { value: C[2] } } });
      const mesh = new THREE.InstancedMesh(geo, m, n); mesh.frustumCulled = false;
      const len = Math.min(w, h) * (0.05 + val(cfg.size, 0.5) * 0.09), depth = Math.min(w, h) * 0.45;
      const b = [], col = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const a = R() * TAU;
        b.push({ p: new THREE.Vector3((R() - 0.5) * w * 0.8, (R() - 0.5) * h * 0.8, 0.05 * depth + R() * depth), v: new THREE.Vector3(Math.cos(a), Math.sin(a) * 0.5, (R() - 0.5) * 0.3), s: 0.75 + R() * 0.5, f: 0 });
        col.copy(C[0]).lerp(C[1], R()); mesh.setColorAt(i, col);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.group.add(mesh);
      this.parts = { swarm: mesh, boids: b, len, depth, kind, w, h, M: new THREE.Matrix4(), Q: new THREE.Quaternion(), S: new THREE.Vector3(), X: new THREE.Vector3(), Y: new THREE.Vector3(), Z: new THREE.Vector3(), A: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) };
      this.stepSwarm(0.016, true);
    },
    buildIvy(cfg, w, h, C) {
      const R = rand(3000 + (cfg.seed | 0)), kind = Math.min(2, Math.max(0, cfg.kind | 0)), unit = Math.min(w, h);
      const amp = unit * 0.022, stemW = unit * (0.006 + val(cfg.size, 0.5) * 0.006), leafS = unit * (0.028 + val(cfg.size, 0.5) * 0.04), dens = 0.4 + val(cfg.amount, 0.5) * 1.2;
      const sp = [], sa = [], ss = [], idx = [], lc = [], ll = [], lm = [], li = [];
      let v0 = 0, q0 = 0;
      for (const path of vinePaths(kind, w, h, R)) {
        const pts = samplePath(path, amp, R), delay = R() * 0.08;
        pts.forEach((p, k) => {
          const wdt = stemW * (1 - 0.65 * p.s), nx = -p.ty, ny = p.tx, along = delay + p.s * (0.82 - delay);
          sp.push(p.x + nx * wdt, p.y + ny * wdt, 0.0012, p.x - nx * wdt, p.y - ny * wdt, 0.0012); sa.push(along, along); ss.push(1, -1);
          if (k) { const a = v0 + (k - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        });
        v0 += pts.length * 2;
        // leaves on alternate sides, some flowers and buds among them
        const total = pts.length, step = Math.max(2, Math.round(5 / dens));
        for (let k = 2, side = 1; k < total - 1; k += step + Math.floor(R() * 2), side = -side) {
          const p = pts[k], along = delay + p.s * (0.82 - delay), base = Math.atan2(p.ty, p.tx);
          const isFlower = R() < 0.22 + 0.1 * dens, type = isFlower ? (R() < 0.7 ? 1 : 2) : 0;
          const ang = type ? R() * TAU : base + side * (0.9 + R() * 0.6), size = type ? leafS * (type === 1 ? 0.9 : 0.5) * (0.8 + R() * 0.4) : leafS * (0.7 + R() * 0.6);
          const off = type ? 0 : size * 0.15, cx = p.x + Math.cos(ang) * off, cy = p.y + Math.sin(ang) * off;
          for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { lc.push(u, v); ll.push(cx, cy, ang, size); lm.push(along, type, R()); }
          li.push(q0, q0 + 1, q0 + 2, q0, q0 + 2, q0 + 3); q0 += 4;
        }
      }
      const stemGeo = new THREE.BufferGeometry();
      stemGeo.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3)); stemGeo.setAttribute("along", new THREE.Float32BufferAttribute(sa, 1)); stemGeo.setAttribute("side", new THREE.Float32BufferAttribute(ss, 1)); stemGeo.setIndex(idx);
      const stemMat = this.mat({ vertexShader: STEM_VS, fragmentShader: STEM_FS, side: THREE.DoubleSide, uniforms: { uGrow: { value: 0 }, uFade: { value: 1 }, uC: { value: C[0].clone().multiplyScalar(0.7) } } });
      const leafGeo = new THREE.BufferGeometry();
      leafGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(lc.length / 2 * 3), 3));
      leafGeo.setAttribute("corner", new THREE.Float32BufferAttribute(lc, 2)); leafGeo.setAttribute("leaf", new THREE.Float32BufferAttribute(ll, 4)); leafGeo.setAttribute("more", new THREE.Float32BufferAttribute(lm, 3)); leafGeo.setIndex(li);
      const leafMat = this.mat({ vertexShader: LEAF_VS, fragmentShader: LEAF_FS, side: THREE.DoubleSide, uniforms: { uGrow: { value: 0 }, uFade: { value: 1 }, uTime: { value: 0 }, uSway: { value: 1 }, uC1: { value: C[0] }, uC2: { value: C[1] }, uC3: { value: C[2] } } });
      const stem = new THREE.Mesh(stemGeo, stemMat), leaves = new THREE.Mesh(leafGeo, leafMat);
      stem.frustumCulled = leaves.frustumCulled = false;
      this.group.add(stem, leaves);
      this.parts = { stem, leaves };
    },

    // ---------- every frame ----------
    // a press on the layer keeps the preview from turning the view during that drag
    grab() {
      if (!this.group || !this.shown()) return false;
      const p = this.finger.onPlane(this.group, this.el.sceneEl, this.tmp), w = this.data.width, h = this.data.height;
      return !!p && Math.abs(p.x) < w * 0.6 && Math.abs(p.y) < h * 0.6;
    },
    shown() { for (let o = this.group; o; o = o.parent) if (!o.visible) return false; return !this.el.closest("[data-studio-editing]"); },
    touchPoint() {
      const f = this.finger && this.finger.state; if (!f || !this.finger.state.users.has(this)) return null;
      if (!(f.held || (f.mouse && f.seen)) || !this.shown()) return null;
      return this.finger.onPlane(this.group, this.el.sceneEl, this.tmp);
    },
    tick(time, dt) {
      if (!this.group) return;
      const d = Math.min(0.1, (dt || 0) / 1000), sc = this.el.sceneEl;
      this.t += d * this.speed;
      const t = this.t;
      for (const m of this.mats) { m.uniforms.uOpacity.value = m.opacity; if (m.uniforms.uTime) m.uniforms.uTime.value = t; }
      const P = this.parts || {};
      if (P.points) {
        const u = P.points.material.uniforms, words = this.look === "dust", period = words ? 9 : 10;
        u.uT.value = (t / period) % 1; u.uVh.value = viewInfo(sc);
        const f = this.touchPoint(), tc = u.uTouch.value, k = 1 - Math.exp(-(f ? 10 : 3) * d);
        if (f) { tc.x += (f.x - tc.x) * (tc.z < 0.05 ? 1 : 0.5); tc.y += (f.y - tc.y) * (tc.z < 0.05 ? 1 : 0.5); }
        tc.z += ((f ? 1 : 0) - tc.z) * k;
        if (P.pic) { const T = u.uT.value; P.pic.material.uniforms.uA.value = (1 - smooth(0.27, 0.31, T) + smooth(0.94, 0.99, T)) * (1 - tc.z); } // a touch shows the grains it pushes
      } else if (P.pic) P.pic.material.uniforms.uA.value = 1;
      if (P.portal) {
        const u = P.portal.material.uniforms, cam = sc && sc.camera, h = this.data.height;
        if (cam && !cam.isOrthographicCamera) { P.eye.setFromMatrixPosition(cam.matrixWorld); P.portal.worldToLocal(P.eye); if (P.eye.z < h * 0.05) P.eye.z = h * 0.05; u.uEye.value.copy(P.eye); }
        else u.uEye.value.set(Math.sin(t * 0.5) * h * 0.35, Math.cos(t * 0.37) * h * 0.2, h * 1.8); // the flat view: a gently moving eye, so the depth shows
      }
      if (P.swarm) this.stepSwarm(d * this.speed, false);
      if (P.stem) {
        const T = (t / 16) % 1, grow = smooth(0, 0.55, T), fade = 1 - smooth(0.9, 1, T);
        for (const m of [P.stem.material, P.leaves.material]) { m.uniforms.uGrow.value = grow; m.uniforms.uFade.value = fade; }
      }
    },
    stepSwarm(dt, first) {
      const P = this.parts, b = P.boids, n = b.length, w = P.w, h = P.h, depth = P.depth, kind = P.kind;
      const maxV = Math.min(w, h) * (kind === 2 ? 0.16 : 0.3), view = Math.min(w, h) * 0.24, sep = P.len * 1.3;
      const f = first ? null : this.touchPoint();
      for (let i = 0; i < n; i++) {
        const me = b[i], acc = P.A.set(0, 0, 0);
        let cx = 0, cy = 0, cz = 0, ax = 0, ay = 0, az = 0, sx = 0, sy = 0, sz = 0, k = 0;
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          const o = b[j], dx = o.p.x - me.p.x, dy = o.p.y - me.p.y, dz = o.p.z - me.p.z, r2 = dx * dx + dy * dy + dz * dz;
          if (r2 > view * view) continue;
          k++; cx += dx; cy += dy; cz += dz; ax += o.v.x; ay += o.v.y; az += o.v.z;
          if (r2 < sep * sep && r2 > 1e-12) { const s = 1 / r2; sx -= dx * s; sy -= dy * s; sz -= dz * s; }
        }
        if (k) { acc.x += cx / k * 1.6 + (ax / k - me.v.x) * 1.8 + sx * sep * sep * 2.2; acc.y += cy / k * 1.6 + (ay / k - me.v.y) * 1.8 + sy * sep * sep * 2.2; acc.z += cz / k * 1.6 + (az / k - me.v.z) * 1.8 + sz * sep * sep * 2.2; }
        // stay around the artwork: a soft pull back near the edges, and in front of it in depth
        const ex = w * 0.4, ey = h * 0.38;
        if (me.p.x > ex) acc.x -= (me.p.x - ex) * 6; if (me.p.x < -ex) acc.x -= (me.p.x + ex) * 6;
        if (me.p.y > ey) acc.y -= (me.p.y - ey) * 6; if (me.p.y < -ey) acc.y -= (me.p.y + ey) * 6;
        if (me.p.z < depth * 0.05) acc.z += (depth * 0.05 - me.p.z) * 8; if (me.p.z > depth) acc.z -= (me.p.z - depth) * 8;
        acc.x += Math.sin(this.t * 0.7 + i) * maxV * 0.6; acc.y += Math.cos(this.t * 0.5 + i * 1.7) * maxV * 0.4; // wandering
        if (kind === 2) acc.y += Math.sin(this.t * 3 + i * 2.1) * maxV * 1.5; // butterflies bob as they fly
        // a finger: everyone near it darts away, and keeps the fright for a moment
        if (f) { const dx = me.p.x - f.x, dy = me.p.y - f.y, r = Math.hypot(dx, dy), R = Math.min(w, h) * 0.3; if (r < R) { me.f = 1; const s = (R - r) / R * maxV * 30 / Math.max(r, R * 0.1); acc.x += dx * s; acc.y += dy * s; acc.z += maxV * 4; } }
        me.f = Math.max(0, me.f - dt * 1.2);
        me.v.addScaledVector(acc, dt); me.v.z *= Math.exp(-dt * 2.5); // swimming mostly across the view shows their sides
        const lim = maxV * me.s * (1 + me.f * 1.8), sp = me.v.length();
        if (sp > lim) me.v.multiplyScalar(lim / sp); else if (sp < lim * 0.35) me.v.multiplyScalar((lim * 0.35) / Math.max(sp, 1e-6));
        me.p.addScaledVector(me.v, dt);
      }
      // each body faces the way it moves, its back up
      const M = P.M, X = P.X, Y = P.Y, Z = P.Z, S = P.S;
      for (let i = 0; i < n; i++) {
        const me = b[i];
        X.copy(me.v).normalize(); Z.crossVectors(X, P.up); if (Z.lengthSq() < 1e-6) Z.set(0, 0, 1); Z.normalize(); Y.crossVectors(Z, X);
        M.makeBasis(X, Y, Z); P.Q.setFromRotationMatrix(M);
        S.setScalar(P.len * me.s); M.compose(me.p, P.Q, S);
        P.swarm.setMatrixAt(i, M);
      }
      P.swarm.instanceMatrix.needsUpdate = true;
    }
  });
})();
