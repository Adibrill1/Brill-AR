"use strict";
/* Live code animations ("אנימציות קוד"): thirteen looks drawn in three.js, written here, with no files to download.
   el.codefx = { look, colors[3], speed, amount, size (0-1 each), kind, text, touch, cover, seed }:
     dissolve  a picture (el.assetId, the artwork by default) falls apart into coloured dust and gathers back
     dust      a greeting written in gold dust that swirls in, sparkles and blows away
     portal    the layer becomes a window into a deep world behind it (interior mapping: the view ray is followed
               into a box behind the window, so it is flat geometry in front of the artwork and nothing hides it)
     swarm     a school of fish, a flock of birds or butterflies (boids) around the artwork; a touch scatters them
     ivy       vines grow around the frame, leaves unfold and small flowers open
     burn      a picture burns away from glowing edges, sparks flying, and heals back (picture as in dissolve)
     fireflies little lights that blink and slowly fall into one rhythm; they come to a finger
     jelly     see-through jellyfish whose bells beat as they rise
     tree      a tree grows from its foot branch after branch, sways, drops leaves or petals
     spiral    seeds placed by the golden angle open from the middle, like a sunflower, a galaxy or a flower
     bubbles   soap bubbles whose film turns colour with the angle; a finger pops them
     liquid    drops of liquid metal (or lava-lamp wax) melt into each other and part
     lanterns  lit paper lanterns that rise, float or are let go one by one
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

  const NOISE = `
float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + 1.0), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }`;
  // a finger pushes points aside (dust, spiral)
  const PUSH = `if (uTouch.z > 0.001) { vec2 d = p.xy - uTouch.xy; float r = length(d), R = uTouch.w; if (r < R) p.xy += (r > 1e-5 ? d / r : vec2(0.0, 1.0)) * (R - r) * 0.9 * uTouch.z; }`;
  const POINT_SIZE = (expr, max) => `vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
  float persp = projectionMatrix[2][3] != 0.0 ? -mv.z : 1.0;
  gl_PointSize = clamp((${expr}) * uVh * 0.5 * projectionMatrix[1][1] / max(persp, 1e-4), 0.0, ${max});`;
  const INST = `mat4 im = mat4(1.0);
  #ifdef USE_INSTANCING
  im = instanceMatrix;
  #endif
  mat4 MV = modelViewMatrix * im;`;

  // ---------- burn: the picture burns away from glowing edges, and heals back ----------
  // the moment each spot catches fire, 0 to 1 (the same in the picture and in its sparks)
  const BURN_AT = `
float burnAt(vec2 uv) {
  vec2 asp = vec2(uBox.x / uBox.y, 1.0);
  float n = fbm(uv * asp * uGrain + uSeed), b;
  if (uKind < 0.5) { vec2 e = min(uv, 1.0 - uv) * asp; b = 0.12 + min(e.x, e.y) / (0.5 * min(asp.x, 1.0)) * 0.72 + (n - 0.5) * 0.9; } // from the edges in
  else if (uKind < 1.5) b = uv.y * 0.78 + (n - 0.5) * 0.8 + 0.1; // from the bottom up
  else b = (fbm(uv * asp * uGrain * 0.5 + 3.1 + uSeed) - 0.3) / 0.4; // spots that open and spread
  return clamp(b, 0.0, 1.0);
}`;
  const BURN_FS = `
uniform sampler2D map; uniform float uP, uTime, uKind, uSeed, uCover, uEdge, uGrain, uOpacity; uniform vec2 uBox; uniform vec4 uTouch; uniform vec3 uC1, uC2, uC3;
varying vec2 vUv; varying vec2 vP;
${NOISE}
${BURN_AT}
void main() {
  vec4 tex = texture2D(map, vUv);
  float n = noise(vUv * 37.0), B = uP - burnAt(vUv);
  // a finger sets it alight where it presses
  if (uTouch.z > 0.001) B = max(B, (uTouch.w - length(vP - uTouch.xy)) / max(uBox.y * 0.2, 1e-5) * 0.5 * uTouch.z + (n - 0.5) * 0.06);
  vec3 col = mix(tex.rgb, tex.rgb * vec3(0.32, 0.2, 0.11), smoothstep(-0.07, 0.0, B)); // scorched just before the fire reaches
  float a = tex.a;
  if (B > 0.0) {
    float g = B / uEdge, flick = 0.7 + 0.3 * noise(vP / uBox.y * 40.0 + vec2(0.0, -uTime * 5.0));
    vec3 fire = mix(uC3 * 1.6, uC2, smoothstep(0.0, 0.45, g));
    fire = mix(fire, uC2 * 0.22, smoothstep(0.45, 1.0, g)); // glowing, then charred
    float burning = 1.0 - smoothstep(0.85, 1.0, g);
    vec3 under = uCover > 0.5 ? uC1 : col;
    col = mix(under, fire * flick, burning);
    a = mix(uCover > 0.5 ? tex.a : 0.0, tex.a, burning);
  }
  gl_FragColor = vec4(col, a * uOpacity);
}`;
  const SPARK_VS = `
attribute vec3 rnd; uniform sampler2D map; uniform float uP, uKind, uSeed, uGrain, uTime, uSize, uVh; uniform vec2 uBox;
varying float vA; varying float vHot;
${NOISE}
${BURN_AT}
void main() {
  float b = burnAt(rnd.xy), age = (uP - b) / 0.22; // a spark leaves as the fire passes its spot
  vec3 p = vec3((rnd.xy - 0.5) * uBox, 0.002);
  float live = step(0.0, age) * step(age, 1.0) * step(0.3, texture2D(map, rnd.xy).a);
  p.y += age * uBox.y * (0.08 + rnd.z * 0.12); p.x += sin(age * 6.0 + rnd.z * 30.0) * uBox.y * 0.015; p.z += age * uBox.y * 0.05;
  vA = live * (1.0 - age); vHot = 1.0 - age;
  ${POINT_SIZE("uSize * (0.5 + rnd.z) * live", "24.0")}
}`;
  const SPARK_FS = `uniform vec3 uC2, uC3; uniform float uOpacity; varying float vA; varying float vHot;
void main() { vec2 c = gl_PointCoord - 0.5; float r2 = dot(c, c) * 4.0; if (r2 > 1.0 || vA < 0.01) discard; gl_FragColor = vec4(mix(uC2, uC3, vHot) * 1.3, exp(-r2 * 3.0) * vA * uOpacity); }`;

  // ---------- fireflies: little lights that blink, and slowly fall into step ----------
  const FLY_VS = `
attribute float glow; attribute float tone; uniform float uSize, uVh; uniform vec3 uC1, uC2;
varying vec3 vCol; varying float vG;
void main() { vec3 p = position; vCol = mix(uC1, uC2, tone); vG = glow;
  ${POINT_SIZE("uSize * (0.55 + 0.45 * glow)", "64.0")} }`;
  const FLY_FS = `uniform vec3 uC3; uniform float uOpacity; varying vec3 vCol; varying float vG;
void main() { vec2 c = gl_PointCoord - 0.5; float r2 = dot(c, c) * 4.0; if (r2 > 1.0) discard;
  float core = exp(-r2 * 40.0) * 1.4, halo = exp(-r2 * 5.0) * (1.0 - r2) * 0.6;
  // the light's shape goes in the alpha, so over a see-through canvas (the editor) only the light is added
  gl_FragColor = vec4(mix(uC3, vCol, core / (core + halo + 1e-4)) * 1.2, min(1.0, core + halo) * vG * uOpacity); }`;

  // ---------- jellyfish: a see-through bell that beats, trailing tentacles ----------
  const JELLY_VS = `
attribute float part; attribute float along; attribute float side; attribute float ring; attribute float wid; attribute float phase;
uniform float uTime, uHalfH;
varying float vPart; varying float vAlong; varying float vFres; varying vec3 vL; varying float vFade; varying float vPulse;
void main() {
  float t = uTime * 1.7 + phase * 6.2832, pulse = pow(0.5 + 0.5 * sin(t), 2.0);
  vec3 p = position, n = normalize(vec3(position.x, position.y * 1.33, position.z) + 1e-5);
  if (part < 0.5) { p.xz *= 1.0 - 0.24 * pulse * ring * ring; p.y *= 1.0 + 0.12 * pulse; } // the rim squeezes most
  else {
    float s = along, lag = t - s * 4.0;
    p.xz *= 1.0 - 0.2 * pulse * (1.0 - s);
    p.x += sin(lag * 0.6 + phase * 20.0 + position.z * 2.0) * 0.22 * s;
    p.z += cos(lag * 0.5 + phase * 13.0 + position.x * 2.0) * 0.22 * s;
    p.y += s * 0.25 * (0.5 + 0.5 * sin(lag)); // the tentacles gather and trail with the beat
  }
  ${INST}
  vec4 mv = MV * vec4(p, 1.0);
  if (part > 0.5) mv.x += side * wid * length(MV[0].xyz) * (1.0 - along * 0.6); // a ribbon that faces the viewer
  vec3 vd = projectionMatrix[2][3] != 0.0 ? normalize(-mv.xyz) : vec3(0.0, 0.0, 1.0);
  vFres = 1.0 - abs(dot(normalize(mat3(MV) * n), vd));
  vL = position; vPart = part; vAlong = along; vPulse = pulse;
  float y = im[3].y; vFade = smoothstep(-uHalfH * 1.3, -uHalfH, y) * (1.0 - smoothstep(uHalfH, uHalfH * 1.3, y));
  gl_Position = projectionMatrix * mv;
}`;
  const JELLY_FS = `
uniform vec3 uC1, uC2, uC3; uniform float uOpacity, uKind;
varying float vPart; varying float vAlong; varying float vFres; varying vec3 vL; varying float vFade; varying float vPulse;
void main() {
  vec3 col; float a;
  if (vPart < 0.5) {
    float f = pow(vFres, 1.6);
    col = uC1 * (0.35 + 0.25 * vPulse) + uC2 * f * 1.1; a = 0.16 + 0.7 * f;
    if (uKind > 0.5 && uKind < 1.5) { // a moon jelly: four rings seen through the bell
      float best = 1.0;
      for (int k = 0; k < 4; k++) { float an = 0.785 + float(k) * 1.5708; best = min(best, abs(length(vL.xz - vec2(cos(an), sin(an)) * 0.38) - 0.17)); }
      float r = smoothstep(0.05, 0.012, best) * smoothstep(0.1, 0.5, vL.y);
      col += uC3 * r; a = max(a, r * 0.8);
    }
  } else { col = uC3 * (1.0 + 0.3 * vPulse); a = 0.55 - vAlong * 0.45; }
  gl_FragColor = vec4(col, a * vFade * uOpacity);
}`;
  function jellyGeometry(kind) {
    const pos = [], part = [], along = [], side = [], ring = [], wid = [], idx = [];
    const put = (x, y, z, pa, al, sd, rg, wd) => { pos.push(x, y, z); part.push(pa); along.push(al); side.push(sd); ring.push(rg); wid.push(wd); return pos.length / 3 - 1; };
    const RINGS = 10, SEG = 24, rim = (Math.PI / 2) * 1.08;
    for (let r = 0; r <= RINGS; r++) {
      const phi = (r / RINGS) * rim;
      for (let s = 0; s <= SEG; s++) { const th = (s / SEG) * TAU; put(Math.sin(phi) * Math.cos(th), Math.cos(phi) * 0.75, Math.sin(phi) * Math.sin(th), 0, 0, 0, r / RINGS, 0); }
    }
    for (let r = 0; r < RINGS; r++) for (let s = 0; s < SEG; s++) { const a = r * (SEG + 1) + s, b = a + SEG + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const strip = (bx, by, bz, len, wd, M, taper) => {
      const first = pos.length / 3;
      for (let m = 0; m <= M; m++) { const s = m / M; for (const sd of [-1, 1]) put(bx * (1 - s * taper), by - s * len, bz * (1 - s * taper), 1, s, sd, 1, wd); }
      for (let m = 0; m < M; m++) { const a = first + m * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    };
    const T = kind === 2 ? 8 : 12, L = kind === 2 ? 3.4 : 1.6, rr = Math.sin(rim) * 0.92, ry = Math.cos(rim) * 0.75;
    for (let k = 0; k < T; k++) { const th = (k / T) * TAU + 0.2; strip(Math.cos(th) * rr, ry, Math.sin(th) * rr, L, 0.03, 18, 0.25); }
    if (kind === 2) for (let k = 0; k < 4; k++) { const th = (k / 4) * TAU + 0.6; strip(Math.cos(th) * 0.15, 0.1, Math.sin(th) * 0.15, L * 0.55, 0.09, 14, -0.5); } // frilly mouth arms
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    for (const [k, v] of Object.entries({ part, along, side, ring, wid })) g.setAttribute(k, new THREE.Float32BufferAttribute(v, 1));
    g.setIndex(idx);
    return { geo: g, len: L };
  }

  // ---------- tree: grows from a seed, branch after branch, and moves in the wind ----------
  const SWAY = `vec2 sway(vec2 p) { float k = max(p.y - uBase, 0.0) / uH; return p + vec2((sin(uTime * 1.1 + p.y / uH * 2.0) * 0.6 + sin(uTime * 1.9 + p.x / uH * 4.0) * 0.25) * k * k * uH * 0.025, 0.0); }`;
  const BRANCH_VS = `attribute vec2 center; attribute vec2 off; attribute float along; attribute float side;
uniform float uGrow, uTime, uBase, uH; varying float vGone; varying float vSide;
${SWAY}
void main() { float th = smoothstep(along, along + 0.2, uGrow); vec2 p = sway(center) + off * side * mix(0.35, 1.0, th);
  vGone = along - uGrow; vSide = side; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0012, 1.0); }`;
  const TREE_LEAF_VS = `
attribute vec2 corner; attribute vec4 leaf; attribute vec3 more; // leaf: x, y, angle, size; more: birth, kind (0 leaf, 1 flower, 2 bud), random
uniform float uGrow, uTime, uBase, uH, uFall, uShare;
varying vec2 vUv; varying float vKind; varying float vOpen; varying float vR; varying float vA;
${SWAY}
void main() {
  float g = smoothstep(more.x, more.x + 0.1, uGrow);
  vec2 at = sway(leaf.xy);
  float a = leaf.z + sin(uTime * 2.3 + more.z * 40.0) * 0.25 + (more.y > 0.5 ? (1.0 - g) * 1.5 : 0.0);
  // some let go and float down, each at its own moment
  float f = clamp((uFall - more.z * 0.6) / 0.4, 0.0, 1.0) * step(fract(more.z * 7.13), uShare);
  at.y -= f * f * (leaf.y - uBase + uH * 0.05); at.x += sin(f * 7.0 + more.z * 20.0) * uH * 0.05 * f; a += f * 9.0 * (more.z - 0.5);
  vec2 c = corner * leaf.w * (more.y > 0.5 ? mix(0.3, 1.0, g) : g);
  vec2 r = vec2(c.x * cos(a) - c.y * sin(a), c.x * sin(a) + c.y * cos(a));
  vUv = corner; vKind = more.y; vOpen = g; vR = more.z; vA = 1.0 - smoothstep(0.8, 1.0, f);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(at + r, 0.0016 + more.y * 0.0005, 1.0);
}`;
  const TREE_LEAF_FS = `
uniform vec3 uC2, uC3; uniform float uOpacity, uFade;
varying vec2 vUv; varying float vKind; varying float vOpen; varying float vR; varying float vA;
void main() {
  if (vOpen < 0.01 || vA < 0.01) discard;
  vec3 col; float a;
  if (vKind < 0.5) { // a leaf, base at x = -1
    float x = (vUv.x + 1.0) * 0.5, wdt = pow(sin(x * 3.14159), 0.75) * (0.6 - 0.2 * x), d = abs(vUv.y) - wdt;
    if (d > 0.0) discard;
    col = mix(uC2, uC3, fract(vR * 3.7)) * (0.75 + 0.45 * x + vUv.y * 0.3) + smoothstep(0.07, 0.0, abs(vUv.y)) * step(0.1, x) * 0.1;
    a = smoothstep(0.0, -0.04, d);
  } else { // a blossom: five round petals and a middle; a bud while it is small
    float r = length(vUv), th = atan(vUv.y, vUv.x);
    float edge = (vKind < 1.5 ? 0.6 + 0.38 * pow(abs(cos(th * 2.5)), 0.5) : 0.5) * mix(0.45, 1.0, vOpen);
    if (r > edge) discard;
    col = mix(uC2 * 1.08, uC2 * 0.82, r / edge); col = mix(col, uC3, smoothstep(0.22, 0.12, r));
    a = smoothstep(edge, edge - 0.05, r);
  }
  gl_FragColor = vec4(col, a * vA * uOpacity * uFade);
}`;

  // ---------- spiral: seeds placed by the golden angle, like a sunflower's middle ----------
  const SPIRAL_VS = `
attribute float idx; attribute float rnd;
uniform float uN, uR, uGrow, uTime, uKind, uSize, uVh, uAngle; uniform vec4 uTouch; uniform vec3 uC1, uC2, uC3;
varying vec3 vCol; varying float vA; varying float vAng;
void main() {
  float f = (idx + 0.5) / uN, s = sqrt(f), gal = step(0.5, uKind) * step(uKind, 1.5);
  float ang = idx * uAngle + (gal > 0.5 ? uTime * 0.25 / (0.25 + s) : uTime * 0.05); // a galaxy turns faster inside
  float r = s * uR * (1.0 + 0.035 * sin(uTime * 1.4 - s * 9.0)), show = smoothstep(f - 0.03, f, uGrow);
  vec3 p = vec3(cos(ang) * r, sin(ang) * r, uKind < 0.5 ? (1.0 - f) * uR * 0.12 : (rnd - 0.5) * uR * 0.06 * (1.0 - s) * gal);
  ${PUSH}
  vCol = f < 0.5 ? mix(uC1, uC2, f * 2.0) : mix(uC2, uC3, f * 2.0 - 1.0);
  if (gal > 0.5) vCol *= 0.6 + 0.4 * sin(uTime * 3.0 + rnd * 60.0);
  vA = show; vAng = ang;
  ${POINT_SIZE("uSize * (uKind > 1.5 ? 0.5 + 1.4 * s : 0.55 + 0.75 * s) * (gal > 0.5 ? 0.5 + rnd : 1.0) * show", "64.0")}
}`;
  const SPIRAL_FS = `
uniform float uOpacity, uKind; varying vec3 vCol; varying float vA; varying float vAng;
void main() {
  if (vA < 0.01) discard;
  vec2 c = gl_PointCoord - 0.5; c.y = -c.y;
  vec3 col = vCol; float a;
  if (uKind < 0.5) { float r = length(c); if (r > 0.5) discard; a = smoothstep(0.5, 0.36, r); col *= 1.15 - r * 0.9; } // round seeds, lit in the middle
  else if (uKind < 1.5) { float r2 = dot(c, c) * 4.0; if (r2 > 1.0) discard; a = exp(-r2 * 6.0) + 0.25 * exp(-r2 * 1.5) * (1.0 - r2); } // stars
  else { vec2 q = vec2(c.x * cos(vAng) + c.y * sin(vAng), -c.x * sin(vAng) + c.y * cos(vAng)); // petals along the radius
    float e = q.x * q.x / 0.25 + q.y * q.y / 0.04; if (e > 1.0) discard; a = smoothstep(1.0, 0.7, e); col *= 0.8 + 0.4 * (q.x + 0.5); }
  gl_FragColor = vec4(col, a * vA * uOpacity);
}`;

  // ---------- bubbles: soap film whose colours turn with the angle ----------
  const BUBBLE_VS = `
attribute float phase; uniform float uTime;
varying vec3 vN; varying vec3 vV; varying vec3 vL; varying float vPh;
void main() {
  vec3 p = position * (1.0 + 0.035 * sin(uTime * 3.0 + position.y * 3.0 + phase * 20.0) + 0.025 * sin(uTime * 2.3 + position.x * 4.0 + phase * 9.0));
  ${INST}
  vec4 mv = MV * vec4(p, 1.0);
  vN = normalize(mat3(MV) * position); vV = projectionMatrix[2][3] != 0.0 ? normalize(-mv.xyz) : vec3(0.0, 0.0, 1.0);
  vL = position; vPh = phase; gl_Position = projectionMatrix * mv;
}`;
  const BUBBLE_FS = `
uniform float uTime, uOpacity; uniform vec3 uC1, uC2, uC3;
varying vec3 vN; varying vec3 vV; varying vec3 vL; varying float vPh;
vec3 pal(float x) { x = fract(x); return x < 0.333 ? mix(uC1, uC2, smoothstep(0.0, 0.333, x)) : x < 0.666 ? mix(uC2, uC3, smoothstep(0.333, 0.666, x)) : mix(uC3, uC1, smoothstep(0.666, 1.0, x)); }
void main() {
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  float c = abs(dot(n, vV)), fres = pow(1.0 - c, 2.2);
  // the film is thinner on top, swirls slowly, and its colour shifts with the angle it is seen from
  float thick = 0.55 + 0.22 * sin(vL.x * 3.1 + uTime * 0.9 + vPh * 7.0) * sin(vL.z * 2.7 - uTime * 0.6) + 0.15 * sin(vL.y * 5.0 + uTime * 1.3 + vPh * 3.0) - 0.25 * vL.y;
  float k = thick * 2.2 + (1.0 - c) * 0.9;
  vec3 film = mix(pal(k), 0.5 + 0.5 * cos(6.2832 * (k * 1.3 + vec3(0.0, 0.33, 0.67))), 0.3);
  vec3 rv = reflect(-vV, n);
  float spec = pow(max(dot(rv, normalize(vec3(-0.45, 0.75, 0.5))), 0.0), 80.0), spec2 = pow(max(dot(rv, normalize(vec3(0.6, -0.3, 0.7))), 0.0), 30.0) * 0.35;
  gl_FragColor = vec4(film * (0.35 + 0.9 * fres) + vec3(spec * 1.6 + spec2), min(0.04 + fres * 0.7 + spec + spec2, 1.0) * uOpacity * (gl_FrontFacing ? 1.0 : 0.55));
}`;

  // ---------- liquid metal: drops that melt into each other and part again ----------
  const LIQUID_FS = `
uniform vec4 uB[12]; uniform float uN, uKind, uTime, uOpacity, uPx, uDome; uniform vec3 uEye, uC1, uC2, uC3;
varying vec2 vP;
void main() {
  float F = 0.0; vec2 G = vec2(0.0);
  for (int i = 0; i < 12; i++) {
    if (float(i) >= uN) break;
    vec2 d = vP - uB[i].xy; float R2 = uB[i].z * uB[i].z * 4.0, q = dot(d, d);
    if (q < R2) { float u = 1.0 - q / R2; F += u * u * u; G -= 6.0 * u * u * d / R2; }
  }
  if (F < 0.2) discard;
  float gl = length(G), dist = (F - 0.42) / max(gl, 1e-4), a = smoothstep(-uPx, uPx, dist); // about how far inside the surface
  if (a < 0.003) discard;
  float hp = exp(-max(dist, 0.0) / uDome);
  vec3 n = normalize(vec3((gl > 1e-5 ? -G / gl : vec2(0.0)) * hp * 1.6, 1.0)); // a dome: tilted out at the edge, flat inside
  vec3 v = normalize(uEye - vec3(vP, 0.0)), r = reflect(-v, n), col;
  if (uKind < 1.5) { // metal: it mirrors a studio around it, dark floor, bright sky, a sharp horizon and a window light
    float y = r.y + 0.12 * sin(r.x * 2.0 + uTime * 0.2);
    vec3 env = mix(uC1, uC2, smoothstep(-0.35, 0.05, y));
    env = mix(env, uC3, smoothstep(0.15, 0.85, y));
    env += uC3 * smoothstep(0.035, 0.0, abs(y - 0.08)) * 0.9;
    env += uC3 * pow(max(dot(r, normalize(vec3(-0.5, 0.6, 0.62))), 0.0), 40.0) * 1.5;
    col = mix(env, uC3, pow(1.0 - max(dot(n, v), 0.0), 3.0) * 0.25) * (0.85 + 0.15 * n.z);
  } else { // a lava lamp: warm wax glowing from inside, a darker rim
    float inner = 1.0 - exp(-max(dist, 0.0) / uDome * 0.7);
    col = mix(uC2 * 0.85, uC3 * 1.1, inner) + uC3 * pow(max(dot(r, normalize(vec3(-0.4, 0.6, 0.7))), 0.0), 24.0) * 0.6;
    col = mix(uC1, col, 0.2 + 0.8 * smoothstep(0.0, uPx * 6.0, dist));
  }
  gl_FragColor = vec4(col, a * uOpacity);
}`;

  // ---------- lanterns: lit paper lanterns that rise and flicker ----------
  const LANTERN_VS = `
attribute float phase; attribute float fade; attribute float tone; uniform float uTime;
varying vec2 vUv; varying float vFl; varying float vFade; varying float vTone;
void main() {
  ${INST}
  vec4 c = MV * vec4(0.0, 0.0, 0.0, 1.0);
  float sw = sin(uTime * 0.9 + phase * 6.2832) * 0.07;
  vec2 q = position.xy * 2.0; // the quad is twice the lantern, for its glow
  c.xy += vec2(q.x * cos(sw) - q.y * sin(sw), q.x * sin(sw) + q.y * cos(sw)) * length(MV[0].xyz); // always facing the viewer
  vUv = q; vFl = 0.82 + 0.18 * sin(uTime * 7.0 + phase * 40.0) * sin(uTime * 11.3 + phase * 17.0); vFade = fade; vTone = tone;
  gl_Position = projectionMatrix * c;
}`;
  const LANTERN_FS = `
uniform vec3 uC1, uC2, uC3; uniform float uOpacity;
varying vec2 vUv; varying float vFl; varying float vFade; varying float vTone;
void main() {
  vec2 p = vUv; float yb = -0.55, yt = 0.5, k = clamp((p.y - yb) / (yt - yb), 0.0, 1.0);
  float hw = mix(0.27, 0.36, k) * (1.0 - 0.12 * pow(abs(k * 2.0 - 1.0), 4.0)), d = max(abs(p.x) - hw, max(yb - p.y, p.y - yt));
  vec3 paper = mix(uC1, uC1 * 0.7 + uC3 * 0.3, vTone);
  vec3 body = mix(paper * 0.75, uC2, (1.0 - k) * 0.75) * (0.75 + 0.35 * vFl); // brightest just above the flame
  body *= 0.88 + 0.12 * cos(p.x / hw * 7.85); // the paper's folds
  body = mix(body, paper * 0.45, smoothstep(0.05, 0.0, yt - p.y)); // a darker rim on top
  body += uC2 * exp(-(pow(p.x / 0.09, 2.0) + pow((p.y - yb - 0.04) / 0.12, 2.0))) * 0.9; // the flame
  float inside = smoothstep(0.012, -0.012, d), glow = exp(-max(d, 0.0) * 7.0) * (1.0 - inside) * 0.55 * vFl;
  float a = max(inside, glow) * smoothstep(1.0, 0.85, max(abs(p.x), abs(p.y)));
  gl_FragColor = vec4(mix(uC3 * 1.2, body, inside), a * vFade * uOpacity);
}`;

  // the proportions of a greeting's words, for the layer's shape
  window.StudioCodeFx = { wordsAspect: (text, font) => { const c = wordsCanvas(text, font); return c.width / c.height; } };

  const BUILDERS = { burn: "buildBurn", fireflies: "buildFireflies", jelly: "buildJelly", tree: "buildTree", spiral: "buildSpiral", bubbles: "buildBubbles", liquid: "buildLiquid", lanterns: "buildLanterns" };
  // the looks a finger plays with
  const TOUCHY = new Set(["dissolve", "dust", "swarm", "burn", "fireflies", "jelly", "spiral", "bubbles", "liquid", "lanterns"]);
  AFRAME.registerComponent("studio-codefx", {
    schema: { cfg: { default: "{}" }, width: { default: 1 }, height: { default: 1 }, src: { default: "" } },
    init() { this.t = 0; this.mats = []; this.tmp = {}; this.finger = Studio.fingerTools; },
    update() { this.teardown(); this.build(); },
    remove() { this.teardown(); },
    teardown() {
      if (this.finger) this.finger.state.users.delete(this);
      if (this.group) { this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.uniforms && o.material.uniforms.map && o.material.uniforms.map.value) o.material.uniforms.map.value.dispose(); o.material.dispose(); } }); this.el.removeObject3D("codefx"); }
      this.group = null; this.mats = []; this.parts = null; this.step = null;
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
      else if (BUILDERS[this.look]) this[BUILDERS[this.look]](cfg, w, h, C);
      this.el.setObject3D("codefx", this.group); // the layer's order and opacity are put on its meshes when this arrives
      if (cfg.touch !== false && TOUCHY.has(this.look) && this.finger) { this.finger.watch(); this.finger.state.users.add(this); }
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

    // a picture for the burn (the artwork or a chosen picture), then the meshes that use it
    loadPicture(then) {
      if (!this.data.src) return;
      const img = new Image(); img.crossOrigin = "anonymous";
      img.onload = () => {
        if (!this.group || this.data.src !== img.src) return;
        const tex = new THREE.Texture(img); tex.needsUpdate = true; // left undecoded: the shader writes its texels out as they are
        then(tex);
        this.el.emit("object3dset", { object: this.group, type: "codefx" }, false); // the new meshes get the layer's order and opacity
      };
      img.src = this.data.src;
    },
    buildBurn(cfg, w, h, C) {
      const kind = Math.min(2, Math.max(0, cfg.kind | 0)), edge = 0.035 + val(cfg.amount, 0.5) * 0.09, grain = 7 - val(cfg.size, 0.5) * 5, R = rand(8000 + (cfg.seed | 0));
      const touch = new THREE.Vector4(0, 0, 0, 0);
      this.parts = { touch, edge };
      this.loadPicture((tex) => {
        const box = new THREE.Vector2(w, h), common = { map: { value: tex }, uP: { value: 0 }, uKind: { value: kind }, uSeed: { value: (cfg.seed | 0) * 0.37 }, uGrain: { value: grain }, uBox: { value: box } };
        const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat({ vertexShader: FLAT_VS, fragmentShader: BURN_FS,
          uniforms: Object.assign({}, common, { uTime: { value: 0 }, uCover: { value: cfg.cover !== false ? 1 : 0 }, uEdge: { value: edge }, uTouch: { value: touch }, uC1: { value: C[0] }, uC2: { value: C[1] }, uC3: { value: C[2] } }) }));
        pic.position.z = 0.0008;
        const n = Math.round(150 + val(cfg.amount, 0.5) * 250), rnd = new Float32Array(n * 3);
        for (let i = 0; i < rnd.length; i++) rnd[i] = R();
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute("rnd", new THREE.BufferAttribute(rnd, 3));
        const sparks = new THREE.Points(g, this.mat({ vertexShader: SPARK_VS, fragmentShader: SPARK_FS, blending: THREE.AdditiveBlending,
          uniforms: Object.assign({}, common, { uTime: { value: 0 }, uSize: { value: Math.min(w, h) * 0.012 }, uVh: { value: 800 }, uC2: { value: C[1] }, uC3: { value: C[2] } }) }));
        sparks.frustumCulled = false;
        this.group.add(pic, sparks);
        this.parts.pics = [pic, sparks];
      });
      // whole, burns away, stays gone a moment, heals back
      const top = 1 + edge + 0.25;
      this.step = (dt, d) => {
        const T = (this.t / 12) % 1;
        const p = T < 0.1 ? -0.25 : T < 0.48 ? -0.25 + (top + 0.25) * (T - 0.1) / 0.38 : T < 0.6 ? top : T < 0.93 ? top - (top + 0.25) * smooth(0.6, 0.93, T) : -0.25;
        if (this.parts.pics) for (const m of this.parts.pics) m.material.uniforms.uP.value = p;
        const f = this.touchPoint();
        if (f) { if (touch.z < 0.05) touch.w = 0; touch.x = f.x; touch.y = f.y; touch.w = Math.min(Math.min(w, h) * 0.3, touch.w + d * Math.min(w, h) * 0.25); }
        touch.z += ((f ? 1 : 0) - touch.z) * (1 - Math.exp(-(f ? 12 : 1.2) * d));
      };
    },
    buildFireflies(cfg, w, h, C) {
      const kind = Math.min(2, Math.max(0, cfg.kind | 0)), n = Math.round(25 + val(cfg.amount, 0.5) * 175), R = rand(4000 + (cfg.seed | 0)), unit = Math.min(w, h), depth = unit * 0.5;
      const pos = new Float32Array(n * 3), glow = new Float32Array(n), tone = new Float32Array(n), flies = [];
      for (let i = 0; i < n; i++) {
        flies.push({ p: new THREE.Vector3((R() - 0.5) * w * 0.9, (R() - 0.5) * h * 0.9, R() * depth), v: new THREE.Vector3(), th: R() * TAU, om: TAU / (1.1 + R() * 0.6), wob: R() * 100 });
        tone[i] = R();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("glow", new THREE.BufferAttribute(glow, 1)); g.setAttribute("tone", new THREE.BufferAttribute(tone, 1));
      const pts = new THREE.Points(g, this.mat({ vertexShader: FLY_VS, fragmentShader: FLY_FS, blending: THREE.AdditiveBlending,
        uniforms: { uSize: { value: unit * (0.035 + val(cfg.size, 0.5) * 0.06) }, uVh: { value: 800 }, uC1: { value: C[0] }, uC2: { value: C[1] }, uC3: { value: C[2] } } }));
      pts.frustumCulled = false; this.group.add(pts);
      let lastT = 0;
      this.step = (dt) => {
        const T = (this.t / 40) % 1, maxV = unit * 0.07;
        if (kind === 0 && T < lastT) for (const f of flies) f.th = R() * TAU; // a new night: out of step again
        lastT = T;
        const K = kind === 0 ? 3 * smooth(0.05, 0.6, T) : 0;
        let sx = 0, cx = 0; for (const f of flies) { sx += Math.sin(f.th); cx += Math.cos(f.th); }
        const Rm = Math.hypot(sx, cx) / n, psi = Math.atan2(sx, cx), touch = this.touchPoint();
        flies.forEach((f, i) => {
          if (kind === 2) f.th = this.t * TAU / 1.6 - (f.p.x / w) * TAU * 0.9; // a wave of light across
          else f.th += (f.om + K * Rm * Math.sin(psi - f.th)) * dt; // each one is nudged toward the others' rhythm
          let gl = 0.1 + 0.9 * Math.pow(Math.max(0, Math.cos(f.th)), 16);
          const a = this.t * 0.6 + f.wob, acc = { x: Math.sin(a * 1.3) * maxV * 1.5, y: Math.cos(a * 0.9 + 1) * maxV * 1.2, z: Math.sin(a * 0.7 + 2) * maxV };
          const ex = w * 0.45, ey = h * 0.45;
          if (f.p.x > ex) acc.x -= (f.p.x - ex) * 8; if (f.p.x < -ex) acc.x -= (f.p.x + ex) * 8;
          if (f.p.y > ey) acc.y -= (f.p.y - ey) * 8; if (f.p.y < -ey) acc.y -= (f.p.y + ey) * 8;
          if (f.p.z < 0.02 * depth) acc.z += (0.02 * depth - f.p.z) * 8; if (f.p.z > depth) acc.z -= (f.p.z - depth) * 8;
          if (touch) { const dx = touch.x - f.p.x, dy = touch.y - f.p.y, r = Math.hypot(dx, dy); if (r < unit * 0.6) { acc.x += dx * 6; acc.y += dy * 6; acc.z -= f.p.z * 2; gl = Math.max(gl, 0.7); } } // they come to the finger
          f.v.x += acc.x * dt; f.v.y += acc.y * dt; f.v.z += acc.z * dt; f.v.multiplyScalar(Math.exp(-dt * 1.5));
          const sp = f.v.length(); if (sp > maxV * (touch ? 3 : 1)) f.v.multiplyScalar(maxV * (touch ? 3 : 1) / sp);
          f.p.addScaledVector(f.v, dt);
          pos[i * 3] = f.p.x; pos[i * 3 + 1] = f.p.y; pos[i * 3 + 2] = f.p.z; glow[i] = gl;
        });
        g.attributes.position.needsUpdate = true; g.attributes.glow.needsUpdate = true;
      };
      this.step(0.016);
    },
    buildJelly(cfg, w, h, C) {
      const kind = Math.min(2, Math.max(0, cfg.kind | 0)), n = Math.round(2 + val(cfg.amount, 0.5) * 10), R = rand(9000 + (cfg.seed | 0)), unit = Math.min(w, h);
      const { geo, len } = jellyGeometry(kind), ph = new Float32Array(n);
      for (let i = 0; i < n; i++) ph[i] = R();
      geo.setAttribute("phase", new THREE.InstancedBufferAttribute(ph, 1));
      const m = this.mat({ vertexShader: JELLY_VS, fragmentShader: JELLY_FS, side: THREE.DoubleSide, blending: kind === 0 ? THREE.AdditiveBlending : THREE.NormalBlending,
        uniforms: { uTime: { value: 0 }, uHalfH: { value: h / 2 }, uKind: { value: kind }, uC1: { value: C[0] }, uC2: { value: C[1] }, uC3: { value: C[2] } } });
      const mesh = new THREE.InstancedMesh(geo, m, n); mesh.frustumCulled = false; this.group.add(mesh);
      const S = unit * (0.05 + val(cfg.size, 0.5) * 0.07), tall = 0.75 + len, M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3();
      const jl = [];
      for (let i = 0; i < n; i++) { const s = S * (0.7 + R() * 0.6); jl.push({ p: new THREE.Vector3((R() - 0.5) * w * 0.8, -h / 2 + R() * h, unit * (0.05 + R() * 0.35)), s, ph: ph[i], dr: R() * TAU, push: new THREE.Vector2() }); }
      this.step = (dt) => {
        const touch = this.touchPoint();
        jl.forEach((j, i) => {
          const pulse = Math.pow(0.5 + 0.5 * Math.sin(this.t * 1.7 + j.ph * TAU), 2), drift = Math.sin(this.t * 0.3 + j.dr) * j.s * 0.35;
          if (touch) { const dx = j.p.x - touch.x, dy = j.p.y - touch.y, r = Math.hypot(dx, dy); if (r < unit * 0.3) j.push.set(dx, dy).multiplyScalar(unit * 0.6 / Math.max(r, 1e-4)); }
          j.p.x += (drift + j.push.x) * dt; j.p.y += (j.s * (0.15 + 0.9 * pulse) + j.push.y) * dt; j.push.multiplyScalar(Math.exp(-dt * 2));
          if (j.p.y > h / 2 + j.s * 1.3) { j.p.y = -h / 2 - j.s * 0.8; j.p.x = (R() - 0.5) * w * 0.8; } // gone out the top: back in from below
          j.p.x = Math.max(-w * 0.48, Math.min(w * 0.48, j.p.x));
          E.set(0, 0, -(drift + j.push.x) / (j.s * 2)); Q.setFromEuler(E);
          M.compose(j.p, Q, V.setScalar(j.s)); mesh.setMatrixAt(i, M);
        });
        mesh.instanceMatrix.needsUpdate = true;
      };
      this.parts = { tall };
      this.step(0.016);
    },
    buildTree(cfg, w, h, C) {
      const kind = Math.min(2, Math.max(0, cfg.kind | 0)), R = rand(5000 + (cfg.seed | 0)), maxD = kind === 1 ? 6 : 7, dens = 0.4 + val(cfg.amount, 0.5) * 1.2, leafS = 0.06 + val(cfg.size, 0.5) * 0.08;
      const segs = [], leaves = []; let maxDist = 0;
      const branch = (x, y, a, len, wid, depth, dist) => {
        let px = x, py = y, aa = a; const steps = depth < 2 ? 4 : 3;
        for (let k = 0; k < steps; k++) {
          aa += (R() - 0.5) * 0.22 + (Math.PI / 2 - aa) * (kind === 1 ? 0.01 : 0.05); // a slight pull upward
          const nx = px + Math.cos(aa) * len / steps, ny = py + Math.sin(aa) * len / steps;
          segs.push([px, py, nx, ny, wid * (1 - 0.28 * k / steps), wid * (1 - 0.28 * (k + 1) / steps), dist + len * k / steps, dist + len * (k + 1) / steps]);
          px = nx; py = ny;
        }
        const end = dist + len; maxDist = Math.max(maxDist, end);
        if (depth >= maxD - 2) { // leaves or blossoms on the outer twigs
          const nl = Math.round((depth >= maxD ? 3 : 1) * dens * (0.6 + R() * 0.8));
          for (let i = 0; i < nl; i++) {
            const t = 0.3 + R() * 0.7, type = kind === 1 ? (R() < 0.8 ? 1 : 2) : 0;
            leaves.push([x + (px - x) * t, y + (py - y) * t, type ? R() * TAU : aa + (R() < 0.5 ? 1 : -1) * (0.6 + R() * 0.9), leafS * (type === 2 ? 0.5 : 1) * (0.7 + R() * 0.6), dist + len * t, type, R()]);
          }
        }
        if (depth >= maxD) return;
        const kids = depth === 0 ? 3 : R() < 0.3 ? 3 : 2, spread = kind === 1 ? 0.78 : 0.55;
        for (let i = 0; i < kids; i++) branch(px, py, aa + (i - (kids - 1) / 2) * spread + (R() - 0.5) * 0.35, len * (0.7 + R() * 0.12), wid * 0.66, depth + 1, end);
      };
      branch(0, 0, Math.PI / 2 + (R() - 0.5) * 0.1, 1, 0.09, 0, 0);
      // fit it in the layer, the trunk's foot at the bottom middle
      let mx = 1e-6, my = 1e-6;
      for (const s of segs) { mx = Math.max(mx, Math.abs(s[0]), Math.abs(s[2])); my = Math.max(my, s[1], s[3]); }
      for (const l of leaves) { mx = Math.max(mx, Math.abs(l[0]) + l[3]); my = Math.max(my, l[1] + l[3]); }
      const k = Math.min((w * 0.48) / mx, (h * 0.97) / my), base = -h / 2 + h * 0.015;
      const cen = [], off = [], al = [], sd = [], idx = [];
      segs.forEach((s, i) => {
        let [x0, y0, x1, y1, w0, w1, d0, d1] = s; const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
        x0 -= ux * w0 * 0.5; y0 -= uy * w0 * 0.5; // reach back a little, so the bends have no gaps
        for (const [x, y, wd, dd] of [[x0, y0, w0, d0], [x1, y1, w1, d1]]) for (const sg of [1, -1]) { cen.push(x * k, base + y * k); off.push(-uy * wd * k, ux * wd * k); al.push((dd / maxDist) * 0.8); sd.push(sg); }
        const a = i * 4; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      });
      const bg = new THREE.BufferGeometry();
      bg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(cen.length / 2 * 3), 3));
      bg.setAttribute("center", new THREE.Float32BufferAttribute(cen, 2)); bg.setAttribute("off", new THREE.Float32BufferAttribute(off, 2)); bg.setAttribute("along", new THREE.Float32BufferAttribute(al, 1)); bg.setAttribute("side", new THREE.Float32BufferAttribute(sd, 1)); bg.setIndex(idx);
      const shared = { uGrow: { value: 0 }, uTime: { value: 0 }, uBase: { value: base }, uH: { value: h }, uFade: { value: 1 } };
      const bm = this.mat({ vertexShader: BRANCH_VS, fragmentShader: STEM_FS, side: THREE.DoubleSide, uniforms: Object.assign({}, shared, { uC: { value: C[0] } }) });
      const lc = [], ll = [], lm = [], li = [];
      leaves.forEach((l, i) => {
        for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { lc.push(u, v); ll.push(l[0] * k, base + l[1] * k, l[2], l[3] * k); lm.push((l[4] / maxDist) * 0.8 + 0.08 + l[6] * 0.1, l[5], l[6]); }
        const q = i * 4; li.push(q, q + 1, q + 2, q, q + 2, q + 3);
      });
      const lg = new THREE.BufferGeometry();
      lg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(lc.length / 2 * 3), 3));
      lg.setAttribute("corner", new THREE.Float32BufferAttribute(lc, 2)); lg.setAttribute("leaf", new THREE.Float32BufferAttribute(ll, 4)); lg.setAttribute("more", new THREE.Float32BufferAttribute(lm, 3)); lg.setIndex(li);
      const lmat = this.mat({ vertexShader: TREE_LEAF_VS, fragmentShader: TREE_LEAF_FS, side: THREE.DoubleSide,
        uniforms: Object.assign({}, shared, { uFall: { value: 0 }, uShare: { value: [0, 0.3, 0.85][kind] }, uC2: { value: C[1] }, uC3: { value: C[2] } }) });
      const bmesh = new THREE.Mesh(bg, bm), lmesh = new THREE.Mesh(lg, lmat);
      bmesh.frustumCulled = lmesh.frustumCulled = false;
      this.group.add(bmesh, lmesh);
      // grows, stands in the wind (leaves fall in autumn, a few petals fly off the blossoms), fades, grows again
      this.step = () => {
        const T = (this.t / 20) % 1, grow = smooth(0, 0.5, T) * 1.02, fade = 1 - smooth(0.9, 1, T), fall = Math.min(1, Math.max(0, (T - 0.6) / 0.28));
        for (const m of [bm, lmat]) { m.uniforms.uGrow.value = grow; m.uniforms.uFade.value = fade; }
        lmat.uniforms.uFall.value = fall;
      };
    },
    buildSpiral(cfg, w, h, C) {
      const kind = Math.min(2, Math.max(0, cfg.kind | 0)), n = Math.round(400 + val(cfg.amount, 0.5) * 3600), R = rand(6000 + (cfg.seed | 0)), rad = Math.min(w, h) * 0.48;
      const ia = new Float32Array(n), rn = new Float32Array(n); for (let i = 0; i < n; i++) { ia[i] = i; rn[i] = R(); }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute("idx", new THREE.BufferAttribute(ia, 1)); g.setAttribute("rnd", new THREE.BufferAttribute(rn, 1));
      const touch = new THREE.Vector4(0, 0, 0, rad * 0.35), golden = Math.PI * (3 - Math.sqrt(5));
      const m = this.mat({ vertexShader: SPIRAL_VS, fragmentShader: SPIRAL_FS, blending: kind === 1 ? THREE.AdditiveBlending : THREE.NormalBlending,
        uniforms: { uN: { value: n }, uR: { value: rad }, uGrow: { value: 0 }, uTime: { value: 0 }, uKind: { value: kind }, uSize: { value: (rad * 1.75 / Math.sqrt(n)) * (0.7 + val(cfg.size, 0.5) * 1.3) },
          uVh: { value: 800 }, uAngle: { value: golden + (cfg.seed | 0) * 0.00002 }, uTouch: { value: touch }, uC1: { value: C[0] }, uC2: { value: C[1] }, uC3: { value: C[2] } } });
      const pts = new THREE.Points(g, m); pts.frustumCulled = false; this.group.add(pts);
      // the seeds come out from the middle, breathe, and fold back in
      this.step = (dt, d) => {
        const T = (this.t / 16) % 1, u = m.uniforms;
        u.uGrow.value = T < 0.35 ? smooth(0, 0.35, T) : T < 0.88 ? 1 : 1 - smooth(0.88, 1, T);
        if (kind === 1) u.uAngle.value = golden + Math.sin(this.t * 0.07) * 0.004; // the galaxy's arms slowly change shape
        const f = this.touchPoint();
        if (f) { touch.x += (f.x - touch.x) * (touch.z < 0.05 ? 1 : 0.5); touch.y += (f.y - touch.y) * (touch.z < 0.05 ? 1 : 0.5); }
        touch.z += ((f ? 1 : 0) - touch.z) * (1 - Math.exp(-(f ? 10 : 3) * d));
      };
    },
    buildBubbles(cfg, w, h, C) {
      const kind = Math.min(2, Math.max(0, cfg.kind | 0)), n = Math.round(5 + val(cfg.amount, 0.5) * 35), R = rand(7000 + (cfg.seed | 0)), unit = Math.min(w, h), depth = unit * 0.4;
      const geo = new THREE.SphereGeometry(1, 28, 18), ph = new Float32Array(n); for (let i = 0; i < n; i++) ph[i] = R();
      geo.setAttribute("phase", new THREE.InstancedBufferAttribute(ph, 1));
      const m = this.mat({ vertexShader: BUBBLE_VS, fragmentShader: BUBBLE_FS, side: THREE.DoubleSide, uniforms: { uTime: { value: 0 }, uC1: { value: C[0] }, uC2: { value: C[1] }, uC3: { value: C[2] } } });
      const mesh = new THREE.InstancedMesh(geo, m, n); mesh.frustumCulled = false; this.group.add(mesh);
      const base = unit * (0.025 + val(cfg.size, 0.5) * 0.055), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), wand = new THREE.Vector3(-w * 0.38, -h * 0.15, depth * 0.3);
      const spawn = (b, first) => {
        b.r = base * (0.5 + R() * 0.9); b.pop = -1; b.age = 0; b.life = 5 + R() * 9;
        if (kind === 0) { b.p.set((R() - 0.5) * w * 0.85, first ? (R() - 0.5) * h : -h * 0.5 - b.r, R() * depth); b.v.set(0, unit * (0.05 + R() * 0.07), 0); }
        else if (kind === 1) { b.p.set((R() - 0.5) * w * 0.8, (R() - 0.5) * h * 0.8, R() * depth); b.v.set((R() - 0.5) * unit * 0.04, (R() - 0.5) * unit * 0.04, 0); }
        else { b.p.copy(wand); if (first) b.p.x += R() * w * 0.6; b.v.set(unit * (0.2 + R() * 0.25), unit * (0.03 + R() * 0.15), unit * (R() - 0.3) * 0.08); b.life = 3 + R() * 4; }
      };
      const bs = []; for (let i = 0; i < n; i++) { const b = { p: new THREE.Vector3(), v: new THREE.Vector3(), ph: ph[i] }; spawn(b, true); if (kind === 2) b.age = R() * 3; bs.push(b); }
      this.step = (dt) => {
        const touch = this.touchPoint();
        bs.forEach((b, i) => {
          let s = b.r;
          if (b.pop >= 0) { b.pop += dt; s = b.r * (1 + b.pop * 3) * Math.max(0, 1 - b.pop / 0.15); if (b.pop > 0.15) spawn(b, false); } // pop: it swells for a blink and is gone
          else {
            b.age += dt;
            if (kind === 1) { b.v.x += Math.sin(this.t * 0.5 + b.ph * 30) * unit * 0.01 * dt; b.v.y += Math.cos(this.t * 0.4 + b.ph * 20) * unit * 0.01 * dt; }
            if (kind === 2) { b.v.multiplyScalar(Math.exp(-dt * 0.6)); b.v.y += unit * 0.02 * dt; }
            b.p.addScaledVector(b.v, dt); b.p.x += Math.sin(this.t * 1.3 + b.ph * 10) * unit * 0.02 * dt;
            const out = Math.abs(b.p.x) > w * 0.55 || b.p.y > h * 0.46 || b.p.y < -h * 0.6;
            if ((kind === 0 && b.p.y > h * 0.44) || (kind !== 0 && (b.age > b.life || out))) b.pop = 0;
            if (touch && Math.hypot(b.p.x - touch.x, b.p.y - touch.y) < b.r * 1.4 + unit * 0.03) b.pop = 0; // a finger pops it
          }
          M.compose(b.p, Q, V.setScalar(Math.max(s, 1e-6))); mesh.setMatrixAt(i, M);
        });
        mesh.instanceMatrix.needsUpdate = true;
      };
      this.step(0.016);
    },
    buildLiquid(cfg, w, h, C) {
      const kind = Math.min(2, Math.max(0, cfg.kind | 0)), R = rand(1100 + (cfg.seed | 0)), unit = Math.min(w, h);
      const n = Math.min(12, Math.round(4 + val(cfg.amount, 0.5) * 8) + (kind === 2 ? 2 : 0)), base = unit * (0.05 + val(cfg.size, 0.5) * 0.07);
      const B = Array.from({ length: 12 }, () => new THREE.Vector4()), drops = [];
      for (let i = 0; i < n; i++) drops.push({ r: base * (0.65 + R() * 0.7) * (kind === 2 ? 1.2 : 1), fx: 0.13 + R() * 0.2, fy: 0.11 + R() * 0.2, px: R() * TAU, py: R() * TAU, ax: w * (0.16 + R() * 0.18), ay: h * (0.14 + R() * 0.18), x0: (R() - 0.5) * w * 0.4 });
      if (kind === 2) { drops[0].pool = -1; drops[0].r = unit * 0.2; drops[1].pool = 1; drops[1].r = unit * 0.12; } // the lamp's wax pools at the bottom and top
      const eye = new THREE.Vector3(0, 0, h * 2);
      const m = this.mat({ vertexShader: FLAT_VS, fragmentShader: LIQUID_FS, uniforms: { uB: { value: B }, uN: { value: n }, uKind: { value: kind }, uTime: { value: 0 }, uPx: { value: unit * 0.004 },
        uDome: { value: base * 0.5 }, uEye: { value: eye }, uC1: { value: C[0] }, uC2: { value: C[1] }, uC3: { value: C[2] } } });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); mesh.position.z = 0.001; this.group.add(mesh);
      const held = { k: 0, x: 0, y: 0 }, tmpEye = new THREE.Vector3();
      this.step = (dt, d) => {
        const t = this.t;
        drops.forEach((o, i) => {
          let x, y;
          if (o.pool) { x = Math.sin(t * 0.1 + o.px) * w * 0.05; y = o.pool * h * 0.5; }
          else if (kind === 2) { x = o.x0 + Math.sin(t * 0.1 * o.fx * 6 + o.px) * w * 0.12; y = Math.sin(t * 0.18 * o.fy * 6 + o.py) * h * 0.36; } // wax rises and sinks slowly
          else { x = Math.sin(t * o.fx * 2 + o.px) * o.ax; y = Math.sin(t * o.fy * 2 + o.py) * o.ay; }
          if (i === n - 1 && !o.pool) { x += (held.x - x) * held.k; y += (held.y - y) * held.k; } // one drop follows the finger
          B[i].set(x, y, o.r, 0);
        });
        const f = this.touchPoint();
        if (f) { held.x = f.x; held.y = f.y; }
        held.k += ((f ? 1 : 0) - held.k) * (1 - Math.exp(-(f ? 8 : 1.5) * d));
        const cam = this.el.sceneEl && this.el.sceneEl.camera;
        if (cam && !cam.isOrthographicCamera) { tmpEye.setFromMatrixPosition(cam.matrixWorld); mesh.worldToLocal(tmpEye); if (tmpEye.z < h * 0.05) tmpEye.z = h * 0.05; eye.copy(tmpEye); } // the reflections move as the phone moves
        else eye.set(Math.sin(t * 0.4) * h * 0.6, Math.cos(t * 0.3) * h * 0.4, h * 1.8);
      };
      this.step(0.016, 0.016);
    },
    buildLanterns(cfg, w, h, C) {
      const kind = Math.min(2, Math.max(0, cfg.kind | 0)), n = Math.round(5 + val(cfg.amount, 0.5) * 40), R = rand(1200 + (cfg.seed | 0)), unit = Math.min(w, h), depth = unit * 0.5;
      const geo = new THREE.PlaneGeometry(1, 1), phase = new Float32Array(n), fade = new Float32Array(n), tone = new Float32Array(n);
      for (const [k, a] of [["phase", phase], ["fade", fade], ["tone", tone]]) geo.setAttribute(k, new THREE.InstancedBufferAttribute(a, 1));
      const m = this.mat({ vertexShader: LANTERN_VS, fragmentShader: LANTERN_FS, uniforms: { uTime: { value: 0 }, uC1: { value: C[0] }, uC2: { value: C[1] }, uC3: { value: C[2] } } });
      const mesh = new THREE.InstancedMesh(geo, m, n); mesh.frustumCulled = false; this.group.add(mesh);
      const S = unit * (0.05 + val(cfg.size, 0.5) * 0.07), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), SC = new THREE.Vector3(), cycle = 16;
      const ls = [];
      for (let i = 0; i < n; i++) ls.push({ p: new THREE.Vector3((R() - 0.5) * w * 0.85, (R() - 0.5) * h, R() * depth), home: new THREE.Vector3((R() - 0.5) * w * 0.8, (R() - 0.5) * h * 0.7, R() * depth),
        s: S * (0.6 + R() * 0.7), ph: R(), tone: R(), vy: unit * (0.035 + R() * 0.035), dir: R() - 0.5, push: new THREE.Vector2(), off: new THREE.Vector2(), f: 1 });
      const order = ls.slice();
      this.step = (dt) => {
        const t = this.t, touch = this.touchPoint();
        ls.forEach((l, i) => {
          if (kind === 0) { // rising to the sky, back in from below
            l.p.y += l.vy * (l.s / S) * dt; l.p.x += Math.sin(t * 0.2 + l.ph * 9) * unit * 0.02 * dt;
            if (l.p.y > h * 0.5) { l.p.y = -h * 0.5; l.p.x = (R() - 0.5) * w * 0.85; }
            l.f = smooth(-h * 0.5, -h * 0.38, l.p.y) * (1 - smooth(h * 0.32, h * 0.5, l.p.y));
          } else if (kind === 1) { // floating in place
            l.p.set(l.home.x + Math.sin(t * 0.4 + l.ph * 9) * unit * 0.03, l.home.y + Math.sin(t * 0.6 + l.ph * 13) * unit * 0.04, l.home.z); l.f = 1;
          } else { // let go one after another from below the middle, spreading as they rise
            const age = ((t - (i / n) * cycle) % cycle + cycle) % cycle, y = -h * 0.45 + age * unit * 0.07;
            l.p.set(l.dir * age * unit * 0.05 + Math.sin(t * 0.3 + l.ph * 9) * unit * 0.015, y, depth * (0.2 + l.ph * 0.6));
            l.f = smooth(0, 0.8, age) * (1 - smooth(h * 0.3, h * 0.48, y));
          }
          if (touch) { const dx = l.p.x + l.off.x - touch.x, dy = l.p.y + l.off.y - touch.y, r = Math.hypot(dx, dy); if (r < unit * 0.25) l.push.set(dx, dy).multiplyScalar(unit * 0.5 / Math.max(r, 1e-4)); } // a finger nudges them aside
          l.off.addScaledVector(l.push, dt); l.push.multiplyScalar(Math.exp(-dt * 3)); l.off.multiplyScalar(Math.exp(-dt * 0.5));
        });
        order.sort((a, b) => a.p.z - b.p.z); // the far ones are drawn first
        order.forEach((l, i) => {
          V.set(l.p.x + l.off.x, l.p.y + l.off.y, l.p.z); M.compose(V, Q, SC.setScalar(l.s)); mesh.setMatrixAt(i, M);
          phase[i] = l.ph; fade[i] = l.f; tone[i] = l.tone;
        });
        mesh.instanceMatrix.needsUpdate = true; for (const k of ["phase", "fade", "tone"]) geo.attributes[k].needsUpdate = true;
      };
      this.step(0.016);
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
      const vh = viewInfo(sc);
      for (const m of this.mats) { m.uniforms.uOpacity.value = m.opacity; if (m.uniforms.uTime) m.uniforms.uTime.value = t; if (m.uniforms.uVh) m.uniforms.uVh.value = vh; }
      if (this.step) this.step(d * this.speed, d);
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
