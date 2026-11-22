"use strict";
/* Live code animations ("אנימציות קוד"): twenty-five looks drawn in three.js, written here, with no files to download.
   el.codefx = { look, colors[3], speed, amount, size (0-1 each), kind, text, touch, cover, seed }:
     dissolve  a picture (el.assetId, the artwork by default) falls apart into coloured dust and gathers back
     dust      a greeting written in gold dust that swirls in, sparkles and blows away
     portal    the layer becomes a window into a deep world behind it (interior mapping: the view ray is followed
               into a box behind the window, so it is flat geometry in front of the artwork and nothing hides it)
     swarm     a school of fish, a flock of birds or butterflies with painted, hinged wings; a touch scatters them
     ivy       vines grow around the frame, leaves unfold and small flowers open
     burn      a picture burns away from glowing edges, sparks flying, and heals back (picture as in dissolve)
     fireflies little lights that blink and slowly fall into one rhythm; they come to a finger
     jelly     see-through jellyfish whose bells beat as they rise
     tree      a tree grows from its foot branch after branch, sways, drops leaves or petals
     spiral    seeds placed by the golden angle open from the middle, like a sunflower, a galaxy or a flower
     bubbles   soap bubbles whose film turns colour with the angle; a finger pops them
     liquid    drops of liquid metal (or lava-lamp wax) melt into each other and part
     lanterns  round paper lanterns lit from inside that rise, float or are let go one by one
     ripple    the picture under water: rain drops, a finger, a still lake or a stream bend it in rings (picture)
     shatter   the picture cracks from a blow, falls apart in glass shards (with real gravity) and flies back (picture)
     rain      rain on a window in front of the picture: fogged glass, drops that bend the view, drops running down;
               a finger wipes the fog away and it fogs up again (picture)
     aurora    curtains of northern lights folding and drifting, alone or in a starry night sky
     mist      only fogged glass in front of the picture (amount = how thick); a finger wipes it
     drip      the picture's paint runs down the real down and hangs off its edge, then flows back
     sketch    the picture draws itself in pencil, ink or chalk, the colour washes in, then back to paper
     sand      the picture blows away grain by grain in the wind (or a storm, or runs down like an hourglass) and back
     eyes      one, two or many eyes that follow whoever is looking (the camera), look round and blink
     tunnel    the picture inside itself again and again, flying in (square, spiral or round)
     lens      the picture hides in the dark, in grey or in fog and shows where the phone comes close
     daysky    the sky at the viewer's own hour: sun, moon, stars and clouds (or a day in a loop)
   With cfg.gravity (el.gravity, Studio.gravityFollower) the looks in Studio.GRAVITY_CODEFX keep their motion upright in
   the real world: turn the artwork and sparks, jellyfish, bubbles and lanterns still rise, leaves fall, metal runs low.
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
  // real gravity (cfg.gravity): the follower's angle turns motion drawn upright; without it, nothing turns
  const UPRIGHT = { cos: 1, sin: 0, ang: 0, gx: 0, gy: -1, flat: 1 };
  const turn = (G, x, y, out) => { out.x = x * G.cos - y * G.sin; out.y = x * G.sin + y * G.cos; return out; };
  // a point back in at the side the flow comes from: a random spot in the box, carried back along the flow until it is
  // just outside (m) - with no gravity and the flow going up, that is anywhere along the bottom edge, as before
  function enterAt(p, dx, dy, w, h, m, R, k = 0.85) {
    const qx = (R() - 0.5) * w * k, qy = (R() - 0.5) * h * k;
    const tx = Math.abs(dx) < 1e-6 ? 1e9 : dx > 0 ? (qx + w / 2 + m) / dx : (w / 2 + m - qx) / -dx;
    const ty = Math.abs(dy) < 1e-6 ? 1e9 : dy > 0 ? (qy + h / 2 + m) / dy : (h / 2 + m - qy) / -dy;
    const t = Math.min(tx, ty); p.x = qx - dx * t; p.y = qy - dy * t; return p;
  }
  const outside = (p, w, h, m) => Math.abs(p.x) > w / 2 + m || Math.abs(p.y) > h / 2 + m;

  // the drawing height in pixels and whether the camera has perspective, for point sizes in world units
  function viewInfo(sc) {
    const r = sc && sc.renderer, c = r && r.domElement;
    return c ? c.height || 1 : 1;
  }

  // ---------- dust: a picture or words made of points ----------
  const DUST_VS = `
attribute vec3 home; attribute vec3 rnd; attribute vec3 tint;
uniform float uT, uTime, uSize, uVh, uMode, uKind; uniform vec2 uBox, uRot; uniform vec4 uTouch; uniform vec3 uC1, uC2, uC3;
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
  vec3 od = (off + drift) * e; p += vec3(od.x * uRot.x - od.y * uRot.y, od.x * uRot.y + od.y * uRot.x, od.z); // real gravity turns the flight
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

  // butterflies: two wings on hinges along the body, painted in the shader (front and back wing, veins, a dark border
  // with pale dots, an eye on the back wing); they beat in bursts and glide between them
  const BFLY_VS = `
attribute float wing; attribute float side; attribute vec2 wuv; attribute float phase;
uniform float uTime;
varying vec2 vUv; varying float vWing; varying vec3 vCol; varying float vLit;
void main() {
  vec3 p = position;
  float t = uTime + phase * 40.0;
  float gate = smoothstep(0.15, 0.55, 0.5 + 0.5 * sin(t * 0.8 + phase * 17.0) * sin(t * 0.37 + phase * 5.0)); // beating, or gliding with the wings held up
  float beat = sin(t * 24.0 + phase * 6.2832), th = mix(0.55, 0.45 + 1.0 * beat, gate); // the wings' angle above flat
  if (wing > 0.5) { float d = abs(p.z); p.y = d * sin(th); p.z = side * d * cos(th); }
  else p.y -= 0.025 * gate * beat; // the body dips against the beat
  vec4 w = vec4(p, 1.0);
  #ifdef USE_INSTANCING
  w = instanceMatrix * w;
  #endif
  vCol = vec3(1.0);
  #ifdef USE_INSTANCING_COLOR
  vCol = instanceColor;
  #endif
  vUv = wuv; vWing = wing; vLit = 0.7 + 0.3 * cos(th);
  gl_Position = projectionMatrix * modelViewMatrix * w;
}`;
  const BFLY_FS = `
uniform vec3 uC3; uniform float uOpacity;
varying vec2 vUv; varying float vWing; varying vec3 vCol; varying float vLit;
void main() {
  vec3 col; float a;
  if (vWing < 0.5) { // the body: a dark, slim, rounded body with rings
    float lim = sqrt(max(0.0, 1.0 - vUv.x * vUv.x)) * (vUv.x > 0.55 ? 0.8 : 1.0); if (abs(vUv.y) > lim) discard;
    col = vec3(0.13, 0.1, 0.08) * (1.15 - 0.6 * abs(vUv.y) / max(lim, 0.01)) * (0.85 + 0.15 * step(0.5, fract(vUv.x * 6.0)));
    a = 1.0;
  } else {
    vec2 q = vUv; float r = length(q), ph = atan(q.y, q.x); // ph: 0 forward, half pi straight out, pi back
    float fore = 1.0 * exp(-pow(abs(ph - 1.05) / 0.62, 4.0)) * (1.0 - 0.12 * smoothstep(0.6, 1.3, ph)), hind = 0.8 * exp(-pow(abs(ph - 2.3) / 0.6, 4.0)), R = max(fore, hind);
    if (r > R) discard;
    float edge = R - r;
    vec3 base = vCol;
    col = mix(base * 0.5, base * 1.08, smoothstep(0.0, 0.5, r)); // darker by the body
    col = mix(col, base * 0.28, smoothstep(0.03, 0.0, abs(fract(ph * 3.1 + 0.2) - 0.5) * r * 1.6) * step(0.1, r) * 0.6); // veins
    float band = smoothstep(0.17 * R, 0.12 * R, edge);
    col = mix(col, vec3(0.07, 0.055, 0.06), band * 0.9); // a dark border
    float dots = smoothstep(0.3, 0.18, abs(fract(ph * 8.5) - 0.5)) * smoothstep(0.03, 0.012, abs(edge - 0.065 * R));
    col = mix(col, mix(vec3(1.0), uC3, 0.3), dots * band); // with a row of pale dots
    col *= 1.0 - 0.55 * smoothstep(0.03, 0.0, abs(fore - hind)) * step(0.12, r); // where the front wing overlaps the back one
    vec2 ec = vec2(cos(2.25), sin(2.25)) * 0.47; float er = length(q - ec);
    col = mix(col, vec3(0.06), smoothstep(0.1, 0.085, er)); col = mix(col, uC3, smoothstep(0.075, 0.06, er)); col = mix(col, vec3(1.0), smoothstep(0.022, 0.01, er)); // an eye
    col *= vLit;
    a = smoothstep(0.0, 0.02, edge);
  }
  gl_FragColor = vec4(col, a * uOpacity);
}`;
  function butterflyGeometry() {
    const pos = [], wing = [], side = [], wuv = [], idx = [];
    const quad = (pts, uvs, wg, sd) => { const o = pos.length / 3; pts.forEach((v, k) => { pos.push(...v); wing.push(wg); side.push(sd); wuv.push(...uvs[k]); }); idx.push(o, o + 1, o + 2, o, o + 2, o + 3); };
    for (const sd of [1, -1]) quad([[-0.42, 0, 0.005 * sd], [0.42, 0, 0.005 * sd], [0.42, 0, 0.74 * sd], [-0.42, 0, 0.74 * sd]], [[-1, 0], [1, 0], [1, 1], [-1, 1]], 1, sd);
    quad([[-0.24, 0, -0.03], [0.2, 0, -0.03], [0.2, 0, 0.03], [-0.24, 0, 0.03]], [[-1, -1], [1, -1], [1, 1], [-1, 1]], 0, 0); // the body, seen from above
    quad([[-0.24, -0.03, 0], [0.2, -0.03, 0], [0.2, 0.03, 0], [-0.24, 0.03, 0]], [[-1, -1], [1, -1], [1, 1], [-1, 1]], 0, 0); // and from the side
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("wing", new THREE.Float32BufferAttribute(wing, 1));
    g.setAttribute("side", new THREE.Float32BufferAttribute(side, 1)); g.setAttribute("wuv", new THREE.Float32BufferAttribute(wuv, 2)); g.setIndex(idx);
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
  else if (uKind < 1.5) { vec2 up = vec2(-uRot.y, uRot.x); b = (dot(uv - 0.5, up) / (abs(up.x) + abs(up.y)) + 0.5) * 0.78 + (n - 0.5) * 0.8 + 0.1; } // from the bottom up (the world's bottom, with gravity)
  else b = (fbm(uv * asp * uGrain * 0.5 + 3.1 + uSeed) - 0.3) / 0.4; // spots that open and spread
  return clamp(b, 0.0, 1.0);
}`;
  const BURN_FS = `
uniform sampler2D map; uniform float uP, uTime, uKind, uSeed, uCover, uEdge, uGrain, uOpacity; uniform vec2 uBox, uRot; uniform vec4 uTouch; uniform vec3 uC1, uC2, uC3;
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
attribute vec3 rnd; uniform sampler2D map; uniform float uP, uKind, uSeed, uGrain, uTime, uSize, uVh; uniform vec2 uBox, uRot;
varying float vA; varying float vHot;
${NOISE}
${BURN_AT}
void main() {
  float b = burnAt(rnd.xy), age = (uP - b) / 0.22; // a spark leaves as the fire passes its spot
  vec3 p = vec3((rnd.xy - 0.5) * uBox, 0.002);
  float live = step(0.0, age) * step(age, 1.0) * step(0.3, texture2D(map, rnd.xy).a);
  vec2 dd = vec2(sin(age * 6.0 + rnd.z * 30.0) * uBox.y * 0.015, age * uBox.y * (0.08 + rnd.z * 0.12));
  p.xy += vec2(dd.x * uRot.x - dd.y * uRot.y, dd.x * uRot.y + dd.y * uRot.x); p.z += age * uBox.y * 0.05; // up, in the world
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
uniform float uTime, uHalfH, uHalfW;
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
  float y = im[3].y, x = im[3].x; vFade = smoothstep(-uHalfH * 1.3, -uHalfH, y) * (1.0 - smoothstep(uHalfH, uHalfH * 1.3, y)) * smoothstep(-uHalfW * 1.15, -uHalfW * 0.98, x) * (1.0 - smoothstep(uHalfW * 0.98, uHalfW * 1.15, x));
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
uniform float uGrow, uTime, uBase, uH, uFall, uShare; uniform vec2 uRot;
varying vec2 vUv; varying float vKind; varying float vOpen; varying float vR; varying float vA;
${SWAY}
void main() {
  float g = smoothstep(more.x, more.x + 0.1, uGrow);
  vec2 at = sway(leaf.xy);
  float a = leaf.z + sin(uTime * 2.3 + more.z * 40.0) * 0.25 + (more.y > 0.5 ? (1.0 - g) * 1.5 : 0.0);
  // some let go and float down, each at its own moment
  float f = clamp((uFall - more.z * 0.6) / 0.4, 0.0, 1.0) * step(fract(more.z * 7.13), uShare);
  vec2 fd = vec2(sin(f * 7.0 + more.z * 20.0) * uH * 0.05 * f, -f * f * (leaf.y - uBase + uH * 0.05));
  at += vec2(fd.x * uRot.x - fd.y * uRot.y, fd.x * uRot.y + fd.y * uRot.x); a += f * 9.0 * (more.z - 0.5); // down, in the world
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

  // ---------- lanterns: round paper lanterns lit from inside, that rise and flicker ----------
  // a body turned on a lathe (open at the bottom, a bamboo hoop there, rounded shoulders on top), lit by the flame
  // inside: brightest low down and where the paper faces the viewer, deeper and redder toward the top and the sides
  const LANTERN_H = 1.2; // a sky lantern's height (lanternGeometry)
  const LANTERN_VS = `
attribute float phase; attribute float fade; attribute float tone; attribute float part; uniform float uTime;
varying vec3 vL; varying vec3 vN; varying vec3 vV; varying float vFl; varying float vFade; varying float vTone; varying float vPart;
void main() {
  ${INST}
  vPart = part;
  vec4 mv = MV * vec4(position, 1.0);
  vL = position; vN = normalize(mat3(MV) * normal); vV = projectionMatrix[2][3] != 0.0 ? normalize(-mv.xyz) : vec3(0.0, 0.0, 1.0);
  vFl = 0.86 + 0.14 * sin(uTime * 7.0 + phase * 40.0) * sin(uTime * 11.3 + phase * 17.0); vFade = fade; vTone = tone;
  gl_Position = projectionMatrix * mv;
}`;
  const LANTERN_FS = `
uniform vec3 uC1, uC2, uC3; uniform float uOpacity;
varying vec3 vL; varying vec3 vN; varying vec3 vV; varying float vFl; varying float vFade; varying float vTone; varying float vPart;
${NOISE}
void main() {
  if (vFade < 0.01) discard;
  if (vPart > 1.5) { gl_FragColor = vec4(mix(uC2 * 1.3, vec3(1.0, 0.97, 0.85), 0.55) * vFl, vFade * uOpacity); return; } // the burning fuel cake
  if (vPart > 0.5) { gl_FragColor = vec4(mix(vec3(0.2, 0.12, 0.06), uC3 * 0.75, 0.45 * vFl), vFade * uOpacity); return; } // bamboo and wire, lit from below
  float y = vL.y / ${LANTERN_H.toFixed(2)} + 0.5, th = atan(vL.z, vL.x); // y: 0 at the open mouth, 1 at the top
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  float facing = abs(dot(n, vV));
  vec3 paper = mix(uC1, mix(uC1, uC3, 0.55), vTone);
  vec3 col;
  if (gl_FrontFacing) {
    float near = exp(-pow((y - 0.24) / 0.55, 2.0));
    float lit = (0.25 + 0.75 * near) * (0.35 + 0.65 * pow(facing, 1.3)) * vFl;
    col = mix(uC3 * 0.62, paper * 1.02, smoothstep(0.12, 0.6, lit)); // deep red-orange away from the light, the paper's own colour nearer
    col = mix(col, uC2 * 1.12, smoothstep(0.55, 1.0, lit)); // the hot glow just above the flame
    float sp = abs(fract(th / 6.2832 * 8.0) - 0.5); // eight paper panels: soft folds and thin seams
    col *= (0.88 + 0.12 * smoothstep(0.0, 0.5, sp)) * (1.0 - 0.3 * smoothstep(0.025, 0.0, sp));
    col *= 1.0 - 0.05 * smoothstep(0.02, 0.0, abs(fract(y * 4.0 + 0.5) - 0.5)); // faint creases across the paper
    col *= 0.93 + 0.07 * noise(vec2(th * 7.0, y * 45.0)); // fibres
    col *= 0.9 + 0.1 * smoothstep(0.0, 0.06, y); // the paper gathered at the mouth
  } else col = mix(uC2 * 1.15, paper, smoothstep(0.1, 0.9, y)) * vFl; // seen from below, through the mouth: the inside, all lit
  gl_FragColor = vec4(col, vFade * uOpacity);
}`;
  // the soft light around each lantern, added on top (its shape in the alpha, for the editor's see-through canvas)
  const HALO_VS = `
attribute float phase; attribute float fade; uniform float uTime; varying vec2 vUv; varying float vA;
void main() {
  ${INST}
  vec4 c = MV * vec4(0.0, -0.2, 0.0, 1.0);
  c.xy += position.xy * 3.2 * length(MV[0].xyz);
  vUv = position.xy * 2.0; vA = fade * (0.85 + 0.15 * sin(uTime * 7.0 + phase * 40.0) * sin(uTime * 11.3 + phase * 17.0));
  gl_Position = projectionMatrix * c;
}`;
  const HALO_FS = `uniform vec3 uC2, uC3; uniform float uOpacity; varying vec2 vUv; varying float vA;
void main() { float r2 = dot(vUv, vUv); if (r2 > 1.0) discard; float g = exp(-r2 * 5.0) * (1.0 - r2) * 0.42 + exp(-r2 * 26.0) * 0.25;
  gl_FragColor = vec4(mix(uC3, uC2, exp(-r2 * 18.0)), g * vA * uOpacity); }`;
  // A Chinese sky lantern (kongming): a tall paper bag, narrow at its open mouth and widest under rounded shoulders, its
  // eight panels bulging a little between the seams; a bamboo hoop round the mouth, two crossed wires and the burning
  // fuel cake hanging in the middle of the opening. 1.2 tall, 0.62 wide; "part" tells the shader paper (0), bamboo and
  // wire (1) and the flame (2).
  function lanternGeometry() {
    const pr = [[0.2, 0], [0.204, 0.02], [0.222, 0.14], [0.246, 0.3], [0.27, 0.47], [0.29, 0.63], [0.302, 0.74], [0.306, 0.82], [0.296, 0.89], [0.265, 0.94], [0.2, 0.975], [0.11, 0.994], [0, 1]];
    const paper = new THREE.LatheGeometry(pr.map(([r, y]) => new THREE.Vector2(r, y * LANTERN_H)), 48);
    paper.translate(0, -LANTERN_H / 2, 0);
    const pp = paper.attributes.position;
    for (let i = 0; i < pp.count; i++) { // the panels bulge out between the seams
      const x = pp.getX(i), z = pp.getZ(i), th = Math.atan2(z, x), f = (th / TAU * 8 % 1 + 1) % 1, k = 1 + 0.035 * Math.sin(Math.PI * f);
      pp.setXYZ(i, x * k, pp.getY(i), z * k);
    }
    paper.computeVertexNormals();
    const y0 = -LANTERN_H / 2, mouth = 0.2;
    const hoop = new THREE.TorusGeometry(mouth, 0.012, 6, 32); hoop.rotateX(Math.PI / 2); hoop.translate(0, y0 + 0.006, 0);
    const w1 = new THREE.BoxGeometry(mouth * 2, 0.007, 0.007); w1.translate(0, y0 + 0.07, 0);
    const w2 = w1.clone(); w2.rotateY(Math.PI / 2);
    const fuel = new THREE.CylinderGeometry(0.065, 0.06, 0.045, 14); fuel.translate(0, y0 + 0.07, 0);
    const parts = [[paper, 0], [hoop, 1], [w1, 1], [w2, 1], [fuel, 2]], pos = [], nor = [], tag = [];
    for (const [g, k] of parts) {
      const q = g.index ? g.toNonIndexed() : g, a = q.attributes.position, b = q.attributes.normal;
      for (let i = 0; i < a.count; i++) { pos.push(a.getX(i), a.getY(i), a.getZ(i)); nor.push(b.getX(i), b.getY(i), b.getZ(i)); tag.push(k); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute("part", new THREE.Float32BufferAttribute(tag, 1));
    return g;
  }

  // the proportions of a greeting's words, for the layer's shape
  window.StudioCodeFx = { wordsAspect: (text, font) => { const c = wordsCanvas(text, font); return c.width / c.height; } };

  // ---------- ripple: the picture under water; drops, a finger or a stream make rings that bend it ----------
  const RIPPLE_FS = `
uniform sampler2D map; uniform float uTime, uKind, uAmp, uWave, uOpacity; uniform vec2 uBox; uniform vec4 uDrops[12]; uniform vec3 uC1, uC2, uC3;
varying vec2 vUv; varying vec2 vP;
${NOISE}
float water(vec2 p) {
  float s = 0.0, L = uBox.y * uWave;
  for (int i = 0; i < 12; i++) {
    vec4 d = uDrops[i];
    float a = uTime - d.z;
    if (d.w <= 0.0 || a < 0.0 || a > 7.0) continue;
    float r = length(p - d.xy), x = r - a * L * 2.2; // the ring runs outward
    s += sin(x / L * 6.2832) * exp(-x * x / (L * L * 3.0)) * exp(-a * 1.0) * d.w / (1.0 + r / (L * 4.0));
  }
  vec2 q = p / uBox.y;
  if (uKind > 0.5 && uKind < 1.5) s += (noise(q * 5.0 + uTime * 0.12) - 0.5) * 0.35 + sin(q.x * 8.0 - q.y * 3.0 + uTime * 0.7) * 0.05; // a still lake breathing
  else if (uKind > 1.5) s += (fbm(q * vec2(3.5, 8.0) + vec2(0.0, uTime * 0.8)) - 0.5) * 1.1; // a stream running past
  return s;
}
void main() {
  float e = uBox.y * 0.004, h0 = water(vP);
  vec2 g = vec2(water(vP + vec2(e, 0.0)) - h0, water(vP + vec2(0.0, e)) - h0) / e * uBox.y * uAmp;
  vec4 tex = texture2D(map, clamp(vUv - g * 0.006 * vec2(uBox.y / uBox.x, 1.0), 0.001, 0.999));
  vec3 n = normalize(vec3(-g * 0.35, 1.0));
  float spec = pow(max(0.0, dot(n, normalize(vec3(-0.35, 0.5, 0.8)))), 90.0), shade = clamp(dot(n.xy, vec2(0.6, -0.8)) * 2.5, -1.0, 1.0);
  vec3 col = mix(tex.rgb, tex.rgb * uC1, 0.22);
  col = mix(col, uC3, max(0.0, -shade) * 0.35) + uC2 * max(0.0, shade) * 0.08 + uC2 * spec * 0.8;
  gl_FragColor = vec4(col, tex.a * uOpacity);
}`;

  // ---------- shatter: the picture cracks from a point, breaks into glass shards that fall, and flies back together ----------
  const SHARD_VS = `
attribute vec2 centre; attribute vec3 rnd; attribute float edge;
uniform float uS, uCrack, uKind; uniform vec2 uBox, uRot, uHit;
varying vec2 vUv; varying float vEdge, vLit, vCrack, vA;
mat3 spin(vec3 a, float t) { float c = cos(t), s = sin(t), k = 1.0 - c;
  return mat3(c + a.x * a.x * k, a.y * a.x * k + a.z * s, a.z * a.x * k - a.y * s, a.x * a.y * k - a.z * s, c + a.y * a.y * k, a.z * a.y * k + a.x * s, a.x * a.z * k + a.y * s, a.y * a.z * k - a.x * s, c + a.z * a.z * k); }
void main() {
  vUv = uv; vEdge = edge;
  float H = uBox.y, dist = length(centre - uHit) / length(uBox);
  vCrack = clamp((uCrack * 1.25 - dist) * 8.0, 0.0, 1.0); // the cracks run out from the blow
  float delay = uKind < 0.5 ? dist * 0.5 : (uKind < 1.5 ? (0.5 - (dot(centre, vec2(-uRot.y, uRot.x)) / H)) * 0.9 : dist * 0.12);
  float s = max(0.0, uS - delay - rnd.x * 0.12);
  vec2 out2 = normalize(centre - uHit + (rnd.yz - 0.5) * H * 0.05), down = vec2(uRot.y, -uRot.x);
  float push = uKind < 0.5 ? 0.18 + rnd.y * 0.3 : (uKind < 1.5 ? 0.03 + rnd.y * 0.06 : 0.5 + rnd.y * 0.7);
  vec3 off = vec3(out2 * push * H * s + down * 0.5 * 0.55 * H * s * s, (uKind > 1.5 ? 0.6 : 0.15 + rnd.z * 0.25) * H * s);
  vec3 axis = normalize(rnd * 2.0 - 1.0 + vec3(0.0, 0.0, 0.2));
  mat3 R = spin(axis, s * (1.5 + rnd.z * 5.0) * (uKind > 1.5 ? 1.6 : 1.0));
  vec3 p = vec3(centre, 0.0) + R * (position - vec3(centre, 0.0)) + off;
  vec3 nrm = R * vec3(0.0, 0.0, 1.0);
  vLit = pow(max(0.0, dot(normalize(nrm), normalize(vec3(-0.3, 0.5, 0.8)))), 24.0) * step(0.001, s);
  vA = 1.0 - smoothstep(2.4, 3.2, s); // far gone: faded out, back in on the way home
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
  const SHARD_FS = `
uniform sampler2D map; uniform float uOpacity; uniform vec3 uC2, uC3;
varying vec2 vUv; varying float vEdge, vLit, vCrack, vA;
void main() {
  vec4 t = texture2D(map, vUv);
  float rim = smoothstep(0.9, 1.0, vEdge);
  vec3 c = mix(t.rgb, uC2, rim * vCrack * 0.85) + uC3 * vLit * 0.7 + uC2 * rim * vLit;
  gl_FragColor = vec4(c, t.a * vA * uOpacity);
}`;
  // glass shards: the cells of points scattered over the picture (more of them, smaller, near the middle), each cut as a
  // fan of triangles around its middle; edge is 1 on the cell's border, so the shader can draw the cracks
  function shardGeometry(w, h, n, R) {
    const seeds = [];
    for (let i = 0; i < n; i++) {
      if (R() < 0.55) { const r = Math.pow(R(), 1.7) * Math.max(w, h) * 0.6, a = R() * TAU; seeds.push([Math.max(-w / 2, Math.min(w / 2, Math.cos(a) * r)), Math.max(-h / 2, Math.min(h / 2, Math.sin(a) * r))]); }
      else seeds.push([(R() - 0.5) * w, (R() - 0.5) * h]);
    }
    const pos = [], uvs = [], cen = [], rnd = [], edg = [];
    for (let i = 0; i < n; i++) {
      let poly = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
      const [sx, sy] = seeds[i];
      for (let j = 0; j < n && poly.length; j++) {
        if (j === i) continue;
        const [tx, ty] = seeds[j], nx = tx - sx, ny = ty - sy, mx = (sx + tx) / 2, my = (sy + ty) / 2;
        if (nx * nx + ny * ny < 1e-12) continue;
        const inside = (p) => (p[0] - mx) * nx + (p[1] - my) * ny <= 0, out = [];
        for (let k = 0; k < poly.length; k++) {
          const a = poly[k], b = poly[(k + 1) % poly.length], ia = inside(a), ib = inside(b);
          if (ia) out.push(a);
          if (ia !== ib) { const da = (a[0] - mx) * nx + (a[1] - my) * ny, db = (b[0] - mx) * nx + (b[1] - my) * ny, t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
        }
        poly = out;
      }
      if (poly.length < 3) continue;
      let cx = 0, cy = 0; for (const p of poly) { cx += p[0]; cy += p[1]; } cx /= poly.length; cy /= poly.length;
      const r = [R(), R(), R()];
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k], b = poly[(k + 1) % poly.length];
        for (const [p, e] of [[[cx, cy], 0], [a, 1], [b, 1]]) { pos.push(p[0], p[1], 0); uvs.push(p[0] / w + 0.5, p[1] / h + 0.5); cen.push(cx, cy); rnd.push(r[0], r[1], r[2]); edg.push(e); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute("centre", new THREE.Float32BufferAttribute(cen, 2)); g.setAttribute("rnd", new THREE.Float32BufferAttribute(rnd, 3)); g.setAttribute("edge", new THREE.Float32BufferAttribute(edg, 1));
    return g;
  }

  // ---------- rain: rain on a window in front of the picture - fogged glass, drops that bend the view, drops that run down ----------
  const RAIN_FS = `
uniform sampler2D map; uniform sampler2D uWipe; uniform float uTime, uKind, uAmount, uSize, uFog, uMist, uOpacity; uniform vec2 uBox, uRot; uniform vec3 uC1, uC2, uC3;
varying vec2 vUv; varying vec2 vP;
${NOISE}
float h1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
vec2 h2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
// drops resting on the glass, one or none in each cell: (offset of the view through it, how much drop, where in it 0-1)
vec4 beads(vec2 q, float cell, float t, float seed, float many) {
  vec2 id = floor(q / cell), f = q / cell - id; vec4 o = vec4(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 c = id + vec2(float(i), float(j)), r = h2(c + seed);
    if (h1(dot(c, vec2(3.7, 9.1)) + seed) > many) continue;
    float life = fract(t * (0.04 + r.x * 0.07) + r.y);
    float rad = (0.12 + 0.3 * h1(dot(c, vec2(7.1, 3.3)) + seed)) * smoothstep(0.0, 0.06, life) * (1.0 - smoothstep(0.8, 1.0, life));
    vec2 d = vec2(float(i), float(j)) + (0.2 + r * 0.6) - f;
    float l = length(d) / max(rad, 1e-4);
    if (l < 1.0 && rad > 0.0) o = vec4(d * cell, smoothstep(1.0, 0.82, l), l);
  }
  return o;
}
// drops that run down, each in its own lane, stopping and going; they leave a clear streak with small beads in it
vec4 runners(vec2 q, float t, float lane, float H, float many, out float trail) {
  float k0 = floor(q.x / lane); vec4 o = vec4(0.0); trail = 0.0;
  for (int i = -1; i <= 1; i++) {
    float c = k0 + float(i), r = h1(c * 13.7 + 2.0), r2 = h1(c * 7.3 + 1.0);
    if (r2 > many) continue;
    float cyc = fract(t * (0.08 + r * 0.12) + r2 * 7.0), go = cyc + 0.025 * sin(cyc * 55.0 + r * 9.0);
    float y = H * 0.6 - go * H * 1.3, x = (c + 0.5 + (r - 0.5) * 0.4) * lane + sin(y * 9.0 / H + r * 6.0) * lane * 0.12;
    float R = lane * (0.3 + r * 0.12);
    vec2 d = q - vec2(x, y); d.y *= d.y < 0.0 ? 0.75 : 1.15;
    float l = length(d) / R;
    if (l < 1.0) o = vec4(d, smoothstep(1.0, 0.8, l), l);
    float up = q.y - y, len = H * (0.25 + r * 0.35);
    if (up > 0.0 && up < len && abs(q.x - x - sin(q.y * 9.0 / H + r * 6.0) * lane * 0.12 + sin(y * 9.0 / H + r * 6.0) * lane * 0.12) < R * 0.75) trail = max(trail, 1.0 - up / len);
  }
  return o;
}
vec3 fogged(vec2 uv) {
  vec2 k = vec2(uBox.y / uBox.x, 1.0) * 0.012; vec3 s = texture2D(map, uv).rgb;
  for (int i = 0; i < 12; i++) { float a = float(i) * 0.5236, r = i < 6 ? 1.0 : 2.2; s += texture2D(map, clamp(uv + vec2(cos(a + r), sin(a + r)) * r * k, 0.001, 0.999)).rgb; }
  return s / 13.0;
}
void main() {
  vec2 q = vec2(vP.x * uRot.x + vP.y * uRot.y, -vP.x * uRot.y + vP.y * uRot.x) / uBox.y; // upright: the drops run down the real down
  float t = uTime, cell = 0.025 + uSize * 0.045, wipe = texture2D(uWipe, vUv).r, dry = 1.0 - smoothstep(0.15, 0.7, wipe); // a wiped spot has no drops either
  vec4 d = vec4(0.0); float trail = 0.0, fog = uFog;
  if (uMist < 0.5) {
    float manyB = uKind > 1.5 ? 0.25 + uAmount * 0.3 : 0.35 + uAmount * 0.55, manyR = uKind > 0.5 ? 0.08 + uAmount * 0.15 : 0.2 + uAmount * 0.55;
    vec4 run = runners(q, t, cell * 2.4, 1.0, manyR, trail);
    vec4 big = beads(q, cell, t, 0.0, manyB), small = beads(q, cell * 0.4, t * 1.4, 5.3, manyB * 0.8 + trail * 0.6);
    d = run.z > 0.0 ? run : (big.z > 0.0 ? big : small);
    d.z *= dry; trail *= dry;
  } else { // only mist: even, in patches, or thicker toward the edges, slowly breathing
    vec2 r = q * 2.5;
    if (uKind > 0.5 && uKind < 1.5) fog *= 0.45 + 0.75 * smoothstep(0.25, 0.75, fbm(r + vec2(t * 0.03, 0.0)));
    else if (uKind > 1.5) { vec2 e = abs(vUv - 0.5) * 2.0; fog *= mix(0.25, 1.15, smoothstep(0.2, 1.0, max(e.x, e.y) * 0.6 + length(e) * 0.4)); }
    fog *= 0.92 + 0.08 * noise(r * 3.0 + t * 0.1);
  }
  vec2 off = -d.xy * 1.6 * step(0.001, d.z); off = vec2(off.x * uRot.x - off.y * uRot.y, off.x * uRot.y + off.y * uRot.x) * uBox.y / uBox; // back onto the layer
  vec3 sharp = texture2D(map, clamp(vUv + off, 0.001, 0.999)).rgb;
  float clear = max(max(d.z, trail * 0.9), wipe); fog = clamp(fog, 0.0, 1.0) * (1.0 - clear);
  vec3 col = mix(sharp, mix(fogged(vUv), uC1, 0.3), fog);
  col += uC2 * fog * 0.07 * step(0.82, noise(q * 380.0)); // the tiny beads a mist is made of
  vec2 n = d.xy / max(length(d.xy), 1e-5);
  col *= 1.0 - 0.4 * d.z * smoothstep(0.55, 1.0, d.w); // a dark rim
  col += uC2 * d.z * pow(max(0.0, dot(n, vec2(-0.55, 0.8))), 4.0) * smoothstep(0.3, 0.9, d.w) * 0.9; // the light caught at the top of each drop
  col = mix(col, col * uC3 * 2.0, 0.12 * fog);
  gl_FragColor = vec4(col, texture2D(map, vUv).a * uOpacity);
}`;

  // ---------- drip: the paint runs down the real down, hangs off the bottom, then heals ----------
  const DRIP_FS = `
uniform sampler2D map; uniform float uP, uKind, uAmount, uSize, uSeed, uOpacity, uTime; uniform vec2 uBox, uRot; uniform vec3 uHeat, uC1, uC2, uC3;
varying vec2 vUv; varying vec2 vP;
${NOISE}
float freq() { return mix(26.0, 7.0, uSize); }
float reach(float x) { // how much longer each strip of paint has grown, as a share of the height
  float f = freq(), n = noise(vec2(x * f, uSeed)), m = noise(vec2(x * f * 2.7, uSeed + 9.0)), r;
  if (uKind < 0.5) r = 0.12 + 0.88 * pow(n, 3.0) * (0.7 + 0.3 * m);
  else if (uKind < 1.5) r = 0.45 + 0.55 * fbm(vec2(x * f * 0.35, uSeed + 3.0));
  else r = 0.03 + 2.0 * pow(n * (0.6 + 0.4 * m), 6.0);
  return r * (0.25 + uAmount * 0.75) * uP + uHeat.z * 0.45 * exp(-pow((x - uHeat.x) / 0.06, 2.0));
}
vec2 toUv(vec2 o) { return vec2(o.x * uRot.x - o.y * uRot.y, o.x * uRot.y + o.y * uRot.x) * uBox.y / uBox + 0.5; } // upright -> picture
void main() {
  vec2 q = vec2(vP.x * uRot.x + vP.y * uRot.y, -vP.x * uRot.y + vP.y * uRot.x) / uBox.y; // upright: y is the real up
  float hy = (abs(uRot.y) * uBox.x + abs(uRot.x) * uBox.y) * 0.5 / uBox.y, H = 2.0 * hy, e = 0.004;
  float L = reach(q.x), Ll = reach(q.x - e), Lr = reach(q.x + e);
  float slide = uKind > 0.5 && uKind < 1.5 ? 0.3 * L * H : 0.0; // melting: the whole picture sags and leaves the top empty
  float sy = hy - (hy - q.y + slide) / (1.0 + L); // stretched from the top, so each strip hangs longer
  vec2 uv = toUv(vec2(q.x, sy));
  float m = min(min(uv.x, 1.0 - uv.x) * uBox.x, min(uv.y, 1.0 - uv.y) * uBox.y) / uBox.y; // how far inside the picture
  vec4 c = texture2D(map, clamp(uv, 0.001, 0.999));
  float wet = clamp((sy - q.y) / (0.12 * H), 0.0, 1.0), shade = clamp(-(Lr - Ll) / (2.0 * e) * 0.03, -0.35, 0.35);
  vec3 col = mix(c.rgb, c.rgb * uC1 * 1.6, 0.1 * wet);
  col *= 1.0 + shade * wet; // the round side of each run catches the light
  col += uC2 * wet * 0.2 * smoothstep(0.08, 0.3, shade);
  col = mix(col, col * uC3 * 1.5, wet * 0.25 * (1.0 - smoothstep(0.0, 0.012, m))); // a darker rim at the tip
  float a = c.a * smoothstep(0.0, 0.002, m);
  if (uKind > 1.5) { // drips: drops let go of the longest strips and fall
    float f = freq() * 1.5, ci = floor(q.x * f), cx = (ci + 0.5) / f, hh = fract(sin(ci * 12.9898 + uSeed * 7.1) * 43758.5453);
    if (hh > 0.4) {
      float Lc = reach(cx), tip = hy - H * (1.0 + Lc), k = fract(uTime * (0.22 + hh * 0.3) + hh * 5.0);
      float r = 0.007 + 0.006 * hh, cy = tip - k * k * 0.8 * H - r;
      float drop = (1.0 - smoothstep(r * 0.75, r, length((q - vec2(cx, cy)) / vec2(1.0, 1.35)))) * smoothstep(0.08, 0.2, Lc) * smoothstep(0.5, 0.9, uP);
      vec4 dc = texture2D(map, clamp(toUv(vec2(cx, -hy + 0.01)), 0.001, 0.999));
      vec3 dcol = dc.rgb * (1.0 + 0.5 * smoothstep(0.3, 0.0, length(q - vec2(cx - r * 0.3, cy + r * 0.4)) / r)) ;
      col = mix(col, dcol, drop * (1.0 - a)); a = max(a, drop * dc.a);
    }
  }
  gl_FragColor = vec4(col, a * uOpacity);
}`;

  // ---------- sketch: the picture draws itself in lines, the colour washes in, then it fades back to paper ----------
  const SKETCH_FS = `
uniform sampler2D map; uniform sampler2D uWipe; uniform float uLine, uWash, uKind, uAmount, uSize, uSeed, uOpacity; uniform vec2 uBox, uTexel; uniform vec3 uC1, uC2, uC3;
varying vec2 vUv; varying vec2 vP;
${NOISE}
float lum(vec2 uv) { return dot(texture2D(map, clamp(uv, 0.001, 0.999)).rgb, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec2 q = vP / uBox.y, px = uTexel * mix(1.0, 3.0, uSize);
  float tl = lum(vUv + px * vec2(-1.0, 1.0)), tc = lum(vUv + px * vec2(0.0, 1.0)), tr = lum(vUv + px * vec2(1.0, 1.0));
  float ml = lum(vUv - vec2(px.x, 0.0)), mr = lum(vUv + vec2(px.x, 0.0));
  float bl = lum(vUv + px * vec2(-1.0, -1.0)), bc = lum(vUv - vec2(0.0, px.y)), br = lum(vUv + px * vec2(1.0, -1.0));
  float edge = length(vec2(tr + 2.0 * mr + br - tl - 2.0 * ml - bl, tl + 2.0 * tc + tr - bl - 2.0 * bc - br)) * (1.0 + uAmount * 3.0);
  vec4 pic = texture2D(map, vUv);
  float L = dot(pic.rgb, vec3(0.299, 0.587, 0.114)), grain = noise(q * 420.0 + uSeed), line;
  vec3 paper, ink;
  if (uKind < 0.5) { // pencil: soft grey lines, hatching in the shadows
    float h1 = smoothstep(0.55, 0.85, fract((q.x + q.y) * 95.0 + noise(q * 30.0) * 0.4)), h2 = smoothstep(0.55, 0.85, fract((q.x - q.y) * 95.0));
    line = max(smoothstep(0.12, 0.6, edge), (smoothstep(0.6, 0.2, L) * h1 + smoothstep(0.32, 0.05, L) * h2) * 0.6) * (0.5 + 0.5 * grain);
    paper = uC1 * (0.95 + 0.05 * noise(q * 160.0)); ink = uC2;
  } else if (uKind < 1.5) { // ink: crisp lines and a little grey wash in the dark parts
    line = max(smoothstep(0.22, 0.38, edge), smoothstep(0.3, 0.08, L) * 0.35);
    paper = uC1 * (0.96 + 0.04 * noise(q * 160.0)); ink = uC2;
  } else { // chalk on a blackboard
    line = max(smoothstep(0.12, 0.5, edge), smoothstep(0.55, 0.85, L) * 0.35 * smoothstep(0.5, 0.8, fract((q.x + q.y) * 70.0))) * step(0.35, noise(q * 300.0 + 3.0));
    paper = vec3(0.12, 0.19, 0.16) * (0.88 + 0.12 * noise(q * 40.0)); ink = uC1;
  }
  float order = 0.55 * fbm(q * 2.6 + uSeed) + 0.45 * (0.5 - q.y); // where the pen goes first: from the top, wandering
  float drawn = smoothstep(order, order + 0.04, uLine * 1.15);
  vec3 sk = mix(paper, ink, clamp(line, 0.0, 1.0) * drawn);
  float wo = 0.5 * fbm(q * 3.5 + uSeed + 7.0) + 0.5 * order, wd = uWash * 1.15 - wo;
  float wash = max(smoothstep(0.0, 0.06, wd), texture2D(uWipe, vUv).r), rim = smoothstep(0.0, 0.03, wd) * (1.0 - smoothstep(0.03, 0.1, wd)) * step(0.01, uWash);
  float done = smoothstep(1.0, 1.3, uWash); // at the end the plain picture shows
  vec3 tint = uKind > 1.5 ? mix(paper, pic.rgb, 0.85) : pic.rgb * mix(vec3(1.0), paper, 0.1);
  vec3 painted = mix(mix(tint * (1.0 - 0.25 * rim), ink, clamp(line, 0.0, 1.0) * drawn * 0.45), pic.rgb, done);
  gl_FragColor = vec4(mix(sk, painted, wash), pic.a * uOpacity);
}`;

  // ---------- sand: the picture is blown away grain by grain, or runs down into a heap, and comes back ----------
  // when each grain lets go (seconds of wind): the picture and its grains work it out the same way, cell by cell
  const SAND_REL = `
float sandRel(vec2 hp, vec2 box, vec2 rot, float kind, vec2 grid) {
  vec2 u = vec2(hp.x * rot.x + hp.y * rot.y, -hp.x * rot.y + hp.y * rot.x); // upright
  float j = h21(floor((hp / box + 0.5) * grid) + 0.5), n = noise(hp / box.y * 4.0), L = length(box);
  float s = kind > 1.5 ? 0.5 - u.y / L * 1.2 : 0.5 - u.x / L * 1.2; // the side the wind blows toward goes first; in the hourglass the top
  return (clamp(s, 0.0, 1.0) * 0.72 + n * 0.2 + j * 0.08) * (kind > 0.5 && kind < 1.5 ? 3.2 : 4.2);
}`;
  const SAND_VS = `
attribute vec3 home; attribute vec3 tint; attribute vec3 rnd;
uniform float uS, uKind, uSize, uVh; uniform vec2 uBox, uRot, uGrid; uniform vec3 uC1;
varying vec3 vCol; varying float vA;
${NOISE}
${SAND_REL}
void main() {
  float W = uBox.x, H = uBox.y, r0 = sandRel(home.xy, uBox, uRot, uKind, uGrid), a = max(0.0, uS - r0), z = 0.0, fade = 1.0;
  vec2 u = vec2(home.x * uRot.x + home.y * uRot.y, -home.x * uRot.y + home.y * uRot.x), o;
  if (uKind < 1.5) { // carried off by the wind: skipping low, then lifted and gone
    float storm = uKind > 0.5 ? 1.0 : 0.0;
    float x = W * (0.2 + rnd.x * 0.15 + storm * 0.12) * a + W * (0.22 + rnd.y * 0.15 + storm * 0.15) * a * a;
    float hop = H * (0.02 + rnd.z * 0.05 + storm * 0.07) * abs(sin(a * (3.0 + rnd.x * 3.0) + rnd.y * 6.0)) * (1.0 - exp(-a * 3.0));
    vec2 turb = vec2(sin(a * 2.1 + rnd.z * 30.0), cos(a * 1.7 + rnd.x * 30.0)) * H * (0.01 + storm * 0.05) * min(a, 1.0);
    o = vec2(x, hop - H * 0.03 * a * a * (1.0 - storm)) + turb;
    z = rnd.z * H * 0.15 * min(a, 1.0);
    fade = 1.0 - smoothstep(W * 0.45, W * 1.1, x);
  } else { // the hourglass: they fall and heap up at the bottom, the first ones lowest
    float hb = (abs(uRot.y) * W + abs(uRot.x) * H) * 0.5, wb = (abs(uRot.x) * W + abs(uRot.y) * H) * 0.5;
    float fx = u.x * 0.6 + (rnd.x - 0.5) * wb * 0.3, shape = max(0.0, 1.0 - abs(fx) / wb);
    float floorY = -hb + hb * 0.62 * shape * clamp(r0 / 4.2, 0.0, 1.0) + rnd.y * H * 0.012;
    float y = max(u.y - H * a * a, floorY), k = clamp((u.y - y) / max(u.y - floorY, 1e-4), 0.0, 1.0);
    o = vec2(mix(u.x, fx, k * k), y) - u;
  }
  vec3 p = home + vec3(o.x * uRot.x - o.y * uRot.y, o.x * uRot.y + o.y * uRot.x, z); // back onto the layer
  vCol = mix(tint, uC1 * (0.75 + 0.5 * rnd.y), smoothstep(0.0, 1.2, a) * (uKind > 1.5 ? 0.55 : 0.6));
  vA = fade;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float persp = projectionMatrix[2][3] != 0.0 ? -mv.z : 1.0;
  gl_PointSize = a > 0.0 ? clamp(uSize * (0.75 + 0.5 * rnd.z) * uVh * 0.5 * projectionMatrix[1][1] / max(persp, 1e-4), 1.0, 24.0) : 0.0; // still part of the picture: drawn there
}`;
  const SAND_FS = `uniform float uOpacity; varying vec3 vCol; varying float vA;
void main() { vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; gl_FragColor = vec4(vCol * (1.05 - r * 0.5 - d.y * 0.3), vA * smoothstep(0.5, 0.32, r) * uOpacity); }`;
  const SANDPIC_FS = `
uniform sampler2D map; uniform float uS, uKind, uTime, uOpacity; uniform vec2 uBox, uRot, uGrid; uniform vec3 uC1, uC2;
varying vec2 vUv; varying vec2 vP;
${NOISE}
${SAND_REL}
void main() {
  vec4 c = texture2D(map, vUv);
  vec2 ij = floor(vec2(vUv.x, 1.0 - vUv.y) * uGrid), hp = vec2((ij.x + 0.5) / uGrid.x - 0.5, 0.5 - (ij.y + 0.5) / uGrid.y) * uBox; // its grain's home
  float left = sandRel(hp, uBox, uRot, uKind, uGrid) - uS, a = c.a * step(0.0, left);
  vec3 col = mix(c.rgb, uC1, (1.0 - smoothstep(0.0, 0.5, left)) * 0.45 * step(0.01, uS)); // the edge turns to sand just before it goes
  if (uKind > 0.5 && uKind < 1.5) { // the storm: a haze of sand streaming across
    vec2 q = vP / uBox.y, qu = vec2(q.x * uRot.x + q.y * uRot.y, -q.x * uRot.y + q.y * uRot.x);
    float hz = smoothstep(0.2, 1.6, uS) * (0.08 + 0.5 * smoothstep(0.45, 0.8, fbm(vec2(qu.x * 1.5 - uTime * 1.6, qu.y * 7.0)))) * smoothstep(0.0, 0.18, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y))); // soft at the edges
    col = mix(col, uC2, hz * (0.4 + 0.6 * (1.0 - a)) / max(a + hz * (1.0 - a), 1e-4) * (a > 0.0 ? 0.6 : 1.0));
    a = max(a, hz * 0.7);
  }
  gl_FragColor = vec4(col, a * uOpacity);
}`;

  // ---------- eyes: they follow whoever is looking (the phone's camera), look round, and blink ----------
  const EYES_FS = `
uniform float uN, uOpacity, uTime, uAmount; uniform vec4 uEye[12]; uniform vec3 uGaze[12]; uniform vec3 uC1, uC2, uC3;
varying vec2 vUv; varying vec2 vP;
${NOISE}
vec4 eye(vec2 p, vec3 g, float seed) { // p in the eye's own units (x from -1 to 1); g: where it looks, and how open
  float lidShape = pow(clamp(1.0 - p.x * p.x, 0.0, 1.0), 0.75), aa = 0.025;
  float topFull = 0.56 * lidShape + 0.04 * p.x, botFull = -0.42 * lidShape + 0.03 * p.x, yc = mix(botFull, topFull, 0.2);
  float top = mix(yc, topFull, g.z), bot = mix(yc, botFull, g.z);
  float side = 1.0 - smoothstep(0.97, 1.0, abs(p.x));
  float inOpen = smoothstep(-aa, aa, top - p.y) * smoothstep(-aa, aa, p.y - bot) * side;
  float inFull = smoothstep(-aa, aa, topFull - p.y) * smoothstep(-aa, aa, p.y - botFull) * side;
  vec2 c = vec2(g.x * 0.46, g.y * 0.3), d = p - c;
  float gl = length(g.xy); vec2 gd = gl > 1e-3 ? g.xy / gl : vec2(1.0, 0.0);
  float al = dot(d, gd); d = d - al * gd + gd * al / max(0.6, sqrt(max(0.0, 1.0 - 0.5 * gl * gl))); // turned away, the iris looks narrower
  float r = length(d), ri = 0.36, rp = 0.11 + uAmount * 0.0 + 0.025 * (0.5 + 0.5 * sin(uTime * 0.4 + seed)), ang = atan(d.y, d.x);
  vec3 sclera = uC2 * (0.8 + 0.2 * smoothstep(1.0, 0.15, length(p * vec2(1.0, 1.7))));
  sclera = mix(sclera, sclera * vec3(1.0, 0.72, 0.72), 0.3 * smoothstep(0.55, 1.0, abs(p.x)) * noise(p * 22.0 + seed)); // pink at the corners
  float fib = noise(vec2(ang * 9.549 + seed, r * 6.0)) * 0.6 + noise(vec2(ang * 19.1, r * 14.0 + seed)) * 0.4;
  vec3 iris = uC1 * (0.55 + 0.8 * fib) * mix(1.25, 0.75, smoothstep(0.1, ri, r));
  iris = mix(iris, min(uC1 * 1.7 + 0.12, vec3(1.0)), smoothstep(0.24, 0.15, r) * smoothstep(rp, rp + 0.05, r) * 0.4); // a lighter ring round the pupil
  iris *= 1.0 - 0.65 * smoothstep(ri - 0.08, ri, r); // the dark rim
  vec3 col = mix(sclera, iris, smoothstep(ri + 0.012, ri - 0.012, r));
  col = mix(col, vec3(0.02), smoothstep(rp + 0.012, rp - 0.012, r));
  vec2 hp = p - c;
  col += vec3(1.0) * (smoothstep(0.065, 0.045, length(hp - vec2(-0.11, 0.12))) * 0.9 + smoothstep(0.03, 0.018, length(hp - vec2(0.1, -0.08))) * 0.5); // light on the cornea
  col *= 0.55 + 0.45 * smoothstep(0.0, 0.22, top - p.y); // the upper lid's shadow
  col *= 0.8 + 0.2 * smoothstep(0.0, 0.1, p.y - bot);
  vec3 lid = uC3 * (0.7 + 0.4 * smoothstep(botFull, topFull, p.y) - 0.25 * smoothstep(0.06, 0.0, abs(p.y - mix(yc, topFull, 0.8))) * lidShape); // the lid, with its crease
  col = mix(lid, col, inOpen);
  vec3 lashC = uC3 * 0.15;
  float lashT = smoothstep(0.05, 0.0, abs(p.y - top)) * side * (0.6 + 0.4 * lidShape), lashB = smoothstep(0.025, 0.0, abs(p.y - bot)) * side * 0.5;
  float up = p.y - top, lash = step(0.0, up) * smoothstep(0.13 * lidShape, 0.0, up) * step(fract(p.x * 13.0 + up * 6.0 * p.x), 0.3) * smoothstep(0.15, 0.4, lidShape); // lashes over the top lid
  float lk = max(max(lashT, lashB), lash);
  col = mix(col, lashC, lk);
  float a = max(inFull, lk);
  float sh = smoothstep(0.22, 0.0, max(p.y - topFull, botFull - p.y)) * smoothstep(1.2, 0.9, abs(p.x)) * 0.28 * (1.0 - a); // a soft shadow round it
  float at = a + sh;
  return vec4(col * a / max(at, 1e-4), at);
}
void main() {
  vec4 o = vec4(0.0);
  for (int i = 0; i < 12; i++) {
    if (float(i) >= uN) break;
    vec4 e = uEye[i]; vec2 p = (vP - e.xy) / e.z;
    if (abs(p.x) > 1.25 || abs(p.y) > 0.9) continue;
    vec4 c = eye(p, uGaze[i], e.w);
    if (c.a > o.a) o = c;
  }
  gl_FragColor = vec4(o.rgb, o.a * uOpacity);
}`;

  // ---------- tunnel: the picture inside itself, again and again, flying in ----------
  const TUNNEL_FS = `
uniform sampler2D map; uniform float uPhase, uKind, uAmount, uSize, uOpacity, uTime; uniform vec2 uBox; uniform vec3 uC1, uC2, uC3;
varying vec2 vUv; varying vec2 vP;
vec2 turn(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
void main() {
  vec2 q = vP / (uBox * 0.5); // -1..1 both ways
  float circ = step(1.5, uKind), r0 = length(q);
  if (uKind > 0.5 && uKind < 1.5) q = turn(q, log(max(r0, 1e-4)) * 0.9 + uTime * 0.15); // a spiral
  float S = 1.6 + uSize * 1.6, lS = log(S);
  float m = max(mix(max(abs(q.x), abs(q.y)), length(q), circ), 1e-4);
  float L = log(m) / lS - uPhase, n = ceil(L), mo = pow(S, n + uPhase); // the frame this point is in; its outer edge at mo
  vec2 p = q / mo;
  vec4 c = texture2D(map, clamp(p * 0.5 + 0.5, 0.001, 0.999));
  float inner = m / mo, depth = max(0.0, -(n + uPhase)), fw = 0.015 + uAmount * 0.05;
  vec3 col = c.rgb * (1.0 - 0.3 * smoothstep(1.0 - fw * 3.0, 1.0 - fw, inner)); // a shadow under each frame
  col = mix(col, uC1 * (0.75 + 0.25 * smoothstep(1.0, 1.0 - fw, inner)), smoothstep(1.0 - fw, 1.0 - fw * 0.75, inner) * step(0.02, uAmount)); // the frame
  col = mix(col, uC2, clamp(depth * 0.16, 0.0, 0.88)); // deeper is darker
  col += uC3 * 0.6 * exp(-m * 12.0); // the light at the end
  float a = c.a * (circ > 0.5 ? smoothstep(1.0, 0.985, r0) : 1.0);
  gl_FragColor = vec4(col, a * uOpacity);
}`;

  // ---------- lens: the picture hides in the dark (or grey, or fog) and shows where the phone comes close ----------
  const LENS_FS = `
uniform sampler2D map; uniform float uKind, uOpacity, uTime; uniform vec2 uBox; uniform vec3 uSpot, uC1, uC2, uC3;
varying vec2 vUv; varying vec2 vP;
${NOISE}
vec3 soft(vec2 uv) {
  vec3 s = texture2D(map, uv).rgb;
  for (int i = 0; i < 12; i++) { float a = float(i) * 0.5236; vec2 o = vec2(cos(a), sin(a)) * (i < 6 ? 0.018 : 0.04); s += texture2D(map, clamp(uv + o * vec2(1.0, uBox.x / uBox.y), 0.001, 0.999)).rgb; }
  return s / 13.0;
}
void main() {
  vec4 c = texture2D(map, vUv);
  float d = length(vP - uSpot.xy), R = max(uSpot.z, 1e-4);
  float k = 1.0 - smoothstep(R * 0.5, R, d * (1.0 + 0.12 * (noise(vP / uBox.y * 5.0 + uTime * 0.4) - 0.5)));
  vec3 col;
  if (uKind < 0.5) col = mix(c.rgb * 0.05 + uC2 * 0.05, c.rgb * mix(vec3(1.0), uC1 * 1.2, 0.25) * (1.15 - 0.3 * d / R), k); // a torch in the dark
  else if (uKind < 1.5) { float g = dot(c.rgb, vec3(0.299, 0.587, 0.114)); col = mix(mix(vec3(g), uC2 * g * 1.8, 0.2), c.rgb, k); } // grey, colour where it is close
  else col = mix(mix(soft(vUv), uC1, 0.55), c.rgb, k); // fog that clears
  gl_FragColor = vec4(col, c.a * uOpacity);
}`;

  // ---------- day sky: the sky at the viewer's own time of day, with the sun, the moon, stars and clouds ----------
  const DAYSKY_FS = `
uniform float uHour, uAmount, uSize, uOpacity, uTime; uniform vec2 uBox; uniform vec3 uC1, uC2, uC3;
varying vec2 vUv; varying vec2 vP;
${NOISE}
void main() {
  vec2 q = vP / uBox.y; float ar = uBox.x / uBox.y, hz = -0.3, PI = 3.14159;
  float dayF = (uHour - 6.0) / 12.0, elev = sin(dayF * PI), nightF = (uHour < 6.0 ? uHour + 24.0 : uHour) - 18.0;
  float day = smoothstep(-0.12, 0.3, elev), dusk = 1.0 - smoothstep(0.0, 0.32, abs(elev + 0.03)), night = 1.0 - smoothstep(-0.25, 0.05, elev);
  float y = clamp((q.y - hz) / (0.5 - hz), 0.0, 1.0);
  vec3 top = mix(uC3, uC1, day), hor = mix(mix(uC3, vec3(0.22, 0.27, 0.5), 0.5), mix(uC1, vec3(1.0), 0.65), day);
  top = mix(top, mix(uC3, uC1, 0.35), dusk * 0.6); hor = mix(hor, uC2, dusk);
  vec3 col = mix(hor, top, pow(y, 0.6));
  float sr = 0.03 + uSize * 0.05;
  vec2 sp = vec2(mix(-0.42, 0.42, clamp(dayF, 0.0, 1.0)) * ar, hz + elev * (0.5 - hz) * 0.85);
  float sd = length(q - sp);
  vec3 sunC = mix(vec3(1.0, 0.55, 0.25), vec3(1.0, 0.97, 0.88), smoothstep(0.0, 0.4, elev));
  col += sunC * (smoothstep(sr, sr * 0.92, sd) + 0.35 * exp(-sd / (sr * 3.0)) + 0.3 * dusk * exp(-sd / (sr * 10.0))) * step(hz, q.y) * smoothstep(-0.15, 0.0, elev);
  float mf = clamp(nightF / 12.0, 0.0, 1.0), mr = sr * 0.8;
  vec2 mp = vec2(mix(-0.4, 0.4, mf) * ar, hz + sin(mf * PI) * (0.5 - hz) * 0.75);
  float md = length(q - mp), moon = smoothstep(mr, mr * 0.9, md) * (1.0 - smoothstep(mr, mr * 0.9, length(q - mp - vec2(mr * 0.45, mr * 0.15))));
  col = mix(col, vec3(0.95, 0.94, 0.85), moon * night);
  col += vec3(0.6, 0.65, 0.8) * 0.18 * exp(-md / (mr * 3.0)) * night;
  vec2 g = q * 60.0, cell = floor(g), o = vec2(h21(cell + 7.1), h21(cell + 3.3)) - 0.5; float hs = h21(cell);
  col += vec3(step(0.9, hs) * smoothstep(0.12, 0.0, length(fract(g) - 0.5 - o * 0.6)) * (0.5 + 0.5 * sin(uTime * (1.0 + hs * 3.0) + hs * 40.0))) * night * smoothstep(hz, hz + 0.15, q.y);
  float cl = clamp(smoothstep(0.62 - uAmount * 0.3, 0.9, fbm(vec2(q.x * 1.6 + uTime * 0.02, q.y * 4.0))) * uAmount * 1.4, 0.0, 1.0) * smoothstep(hz, hz + 0.1, q.y);
  col = mix(col, mix(mix(vec3(0.1, 0.11, 0.18), vec3(1.0), day), uC2 * 1.1, dusk * 0.7), cl * 0.85); // clouds take the light of the hour
  if (q.y < hz) col = hor * (0.75 + 0.25 * smoothstep(hz - 0.3, hz, q.y)); // under the horizon (usually hidden by the picture)
  gl_FragColor = vec4(col, uOpacity);
}`;

  // ---------- aurora: curtains of northern lights that fold and drift ----------
  const AURORA_FS = `
uniform float uTime, uKind, uAmount, uSize, uOpacity; uniform vec2 uBox; uniform vec3 uC1, uC2, uC3;
varying vec2 vUv; varying vec2 vP;
${NOISE}
float curtain(vec2 uv, float t, float seed, float tall, out float hue) {
  float x = uv.x * uBox.x / uBox.y;
  float base = 0.5 - uSize * 0.22 + (fbm(vec2(x * 0.9 + seed, t * 0.04)) - 0.5) * 0.55 + sin(x * 2.4 + t * 0.15 + seed) * 0.07;
  float fold = fbm(vec2(x * 4.5 + seed * 3.0, t * 0.2));
  float rays = 0.35 + 0.9 * pow(noise(vec2(x * 46.0 + fold * 9.0 + seed, t * 0.5)), 2.0);
  float y = uv.y - base;
  hue = clamp(y / tall, 0.0, 1.0);
  return smoothstep(-0.02, 0.005, y) * exp(-max(y, 0.0) / (tall * 0.55)) * rays * (0.55 + 0.6 * fold);
}
void main() {
  float t = uTime * (uKind > 1.5 ? 3.0 : 1.0), tall = 0.22 + uSize * 0.3, ha, hb;
  float a = curtain(vUv, t, 0.0, tall, ha), b = curtain(vUv * vec2(0.85, 1.0) + vec2(0.31, 0.07), t * 1.25, 7.0, tall * 0.8, hb) * 0.65;
  vec3 ca = mix(mix(uC1, uC2, smoothstep(0.1, 0.6, ha)), uC3, smoothstep(0.55, 1.0, ha)), cb = mix(mix(uC1, uC2, smoothstep(0.1, 0.6, hb)), uC3, smoothstep(0.55, 1.0, hb));
  float I = (a + b) * (0.55 + uAmount * 1.1);
  vec3 col = (ca * a + cb * b) / max(a + b, 1e-4);
  float sky = 0.0;
  if (uKind > 0.5 && uKind < 1.5) { // a night sky behind it, with stars
    sky = 0.55 * smoothstep(0.0, 0.7, vUv.y);
    vec2 g = vUv * uBox / uBox.y * 60.0, id = floor(g), f = fract(g) - 0.5;
    float r = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453), tw = 0.6 + 0.4 * sin(uTime * (2.0 + r * 4.0) + r * 40.0);
    float star = step(0.93, r) * smoothstep(0.12, 0.0, length(f + (vec2(r, fract(r * 7.0)) - 0.5) * 0.5)) * tw;
    col = mix(vec3(0.015, 0.025, 0.07), col, clamp(I, 0.0, 1.0)) + vec3(star) * (1.0 - clamp(I, 0.0, 1.0));
    I = max(I, sky + star);
  }
  float edge = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x) * smoothstep(1.0, 0.9, vUv.y);
  gl_FragColor = vec4(col, clamp(I, 0.0, 1.0) * edge * uOpacity);
}`;

  const BUILDERS = { burn: "buildBurn", fireflies: "buildFireflies", jelly: "buildJelly", tree: "buildTree", spiral: "buildSpiral", bubbles: "buildBubbles", liquid: "buildLiquid", lanterns: "buildLanterns", ripple: "buildRipple", shatter: "buildShatter", rain: "buildRain", mist: "buildMist", drip: "buildDrip", sketch: "buildSketch", sand: "buildSand", eyes: "buildEyes", tunnel: "buildTunnel", lens: "buildLens", daysky: "buildDaysky", aurora: "buildAurora" };
  // the looks a finger plays with
  const TOUCHY = new Set(["dissolve", "dust", "swarm", "burn", "fireflies", "jelly", "spiral", "bubbles", "liquid", "lanterns", "ripple", "shatter", "rain", "mist", "drip", "sketch", "sand", "eyes", "tunnel", "lens"]);
  AFRAME.registerComponent("studio-codefx", {
    schema: { cfg: { default: "{}" }, width: { default: 1 }, height: { default: 1 }, src: { default: "" } },
    init() { this.t = 0; this.mats = []; this.tmp = {}; this.finger = Studio.fingerTools; },
    update() { this.teardown(); this.build(); },
    remove() { this.teardown(); },
    teardown() {
      if (this.finger) this.finger.state.users.delete(this);
      if (this.group) { this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.uniforms && o.material.uniforms.map && o.material.uniforms.map.value) o.material.uniforms.map.value.dispose(); o.material.dispose(); } }); this.el.removeObject3D("codefx"); }
      if (this.parts && this.parts.wipe) this.parts.wipe.dispose();
      this.group = null; this.mats = []; this.parts = null; this.step = null; this.depthMats = null;
    },
    mat(opts) { const m = new THREE.ShaderMaterial(Object.assign({ transparent: true, depthWrite: false }, opts)); m.uniforms.uOpacity = { value: 1 }; this.mats.push(m); return m; },
    build() {
      let cfg; try { cfg = JSON.parse(this.data.cfg); } catch (e) { cfg = {}; }
      this.cfg = cfg; this.look = cfg.look; this.speed = pace(cfg);
      this.rot = new THREE.Vector2(1, 0); // gravity's turn, (cos, sin), shared by the shaders that need it
      this.G = cfg.gravity && Studio.GRAVITY_CODEFX && Studio.GRAVITY_CODEFX.includes(this.look) ? Studio.gravityFollower(3, cfg.gravityTune || "") : null;
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
          uniforms: { uT: { value: 0 }, uTime: { value: 0 }, uSize: { value: size }, uVh: { value: 800 }, uMode: { value: words ? 1 : 0 }, uKind: { value: cfg.kind | 0 }, uBox: { value: new THREE.Vector2(w, h) }, uRot: { value: this.rot },
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
      const geo = kind === 2 ? butterflyGeometry() : bodyGeometry(kind), ph = new Float32Array(n); for (let i = 0; i < n; i++) ph[i] = R();
      geo.setAttribute("phase", new THREE.InstancedBufferAttribute(ph, 1));
      const m = kind === 2 ? this.mat({ vertexShader: BFLY_VS, fragmentShader: BFLY_FS, side: THREE.DoubleSide, uniforms: { uTime: { value: 0 }, uC3: { value: C[2] } } })
        : this.mat({ vertexShader: SWARM_VS, fragmentShader: SWARM_FS, side: THREE.DoubleSide, uniforms: { uTime: { value: 0 }, uKind: { value: kind }, uC3: { value: C[2] } } });
      const mesh = new THREE.InstancedMesh(geo, m, n); mesh.frustumCulled = false;
      const len = Math.min(w, h) * (0.05 + val(cfg.size, 0.5) * 0.09) * (kind === 2 ? 1.25 : 1), depth = Math.min(w, h) * 0.45;
      const b = [], col = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const a = R() * TAU;
        b.push({ p: new THREE.Vector3((R() - 0.5) * w * 0.8, (R() - 0.5) * h * 0.8, 0.05 * depth + R() * depth), v: new THREE.Vector3(Math.cos(a), Math.sin(a) * 0.5, (R() - 0.5) * 0.3), s: 0.75 + R() * 0.5, f: 0 });
        col.copy(C[0]).lerp(C[1], R()); mesh.setColorAt(i, col);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.group.add(mesh);
      this.parts = { swarm: mesh, boids: b, len, depth, kind, w, h, M: new THREE.Matrix4(), Q: new THREE.Quaternion(), S: new THREE.Vector3(), X: new THREE.Vector3(), Y: new THREE.Vector3(), Z: new THREE.Vector3(), A: new THREE.Vector3(),
        up: kind === 2 ? new THREE.Vector3(0, 0.5, 0.87) : new THREE.Vector3(0, 1, 0) }; // butterflies lean their backs toward the viewer, so their wings show
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
        const box = new THREE.Vector2(w, h), common = { map: { value: tex }, uP: { value: 0 }, uKind: { value: kind }, uSeed: { value: (cfg.seed | 0) * 0.37 }, uGrain: { value: grain }, uBox: { value: box }, uRot: { value: this.rot } };
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
    buildRipple(cfg, w, h, C) {
      const kind = Math.min(2, Math.max(0, cfg.kind | 0)), amt = val(cfg.amount, 0.5), R = rand(11000 + (cfg.seed | 0));
      const drops = []; for (let i = 0; i < 12; i++) drops.push(new THREE.Vector4(0, 0, -99, 0));
      this.parts = { drops };
      this.loadPicture((tex) => {
        const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat({ vertexShader: FLAT_VS, fragmentShader: RIPPLE_FS,
          uniforms: { map: { value: tex }, uTime: { value: 0 }, uKind: { value: kind }, uAmp: { value: 0.5 + amt * 1.3 }, uWave: { value: 0.025 + val(cfg.size, 0.5) * 0.06 }, uBox: { value: new THREE.Vector2(w, h) },
            uDrops: { value: drops }, uC1: { value: C[0] }, uC2: { value: C[1] }, uC3: { value: C[2] } } }));
        pic.position.z = 0.0008; this.group.add(pic);
      });
      let next = 0.3, slot = 0, lastTouch = -9;
      const drop = (x, y, s) => { drops[slot].set(x, y, this.t, s); slot = (slot + 1) % drops.length; };
      this.step = () => {
        const t = this.t, f = this.touchPoint();
        if (f && t - lastTouch > 0.14) { drop(f.x, f.y, 1.3); lastTouch = t; } // a finger in the water
        if (t >= next) { // rain drops (or now and then, on the lake and the stream)
          drop((R() - 0.5) * w * 0.9, (R() - 0.5) * h * 0.9, 0.6 + R() * 0.6);
          next = t + (kind === 0 ? 0.25 + (1 - amt) * 1.1 : 2 + R() * 3) * (0.6 + R() * 0.8);
        }
      };
    },
    buildShatter(cfg, w, h, C) {
      const kind = Math.min(2, Math.max(0, cfg.kind | 0)), R = rand(12000 + (cfg.seed | 0)), n = Math.round(16 + val(cfg.amount, 0.5) * 74);
      const hit = new THREE.Vector2(0, 0), u = { uS: { value: 0 }, uCrack: { value: 0 } };
      this.parts = { hit };
      if (cfg.cover !== false) { // the print does not show through the hole
        const fill = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat({ vertexShader: FLAT_VS, fragmentShader: FILL_FS, uniforms: { uC: { value: C[0] } } }));
        fill.position.z = -0.0006; this.group.add(fill);
      }
      this.loadPicture((tex) => {
        const m = this.mat({ vertexShader: SHARD_VS, fragmentShader: SHARD_FS, side: THREE.DoubleSide,
          uniforms: { map: { value: tex }, uS: u.uS, uCrack: u.uCrack, uKind: { value: kind }, uBox: { value: new THREE.Vector2(w, h) }, uRot: { value: this.rot }, uHit: { value: hit }, uC2: { value: C[1] }, uC3: { value: C[2] } } });
        const mesh = new THREE.Mesh(shardGeometry(w, h, n, R), m); mesh.position.z = 0.0008; mesh.frustumCulled = false; this.group.add(mesh);
      });
      // whole, cracks, falls, stays gone a moment, flies back; a touch while it is whole breaks it right there
      const WHOLE = 2.4, CRACK = 0.6, FALL = 3.2, REST = 0.4, BACK = 1.6, ALL = WHOLE + CRACK + FALL + REST + BACK;
      let clock = 0, wasTouched = false;
      const newHit = () => { if (kind === 1) hit.set(0, h * 0.3); else hit.set((R() - 0.5) * w * 0.5, (R() - 0.5) * h * 0.5); };
      newHit();
      this.step = (dt) => {
        const f = this.touchPoint();
        if (f && !wasTouched && clock < WHOLE) { hit.set(f.x, f.y); clock = WHOLE; } // break where the finger hits
        wasTouched = !!f;
        clock += dt; if (clock >= ALL) { clock = 0; newHit(); }
        let s = 0, c = 0;
        if (clock < WHOLE) c = 0;
        else if (clock < WHOLE + CRACK) c = (clock - WHOLE) / CRACK;
        else if (clock < WHOLE + CRACK + FALL) { c = 1; s = clock - WHOLE - CRACK; }
        else if (clock < WHOLE + CRACK + FALL + REST) { c = 1; s = FALL; }
        else { const k = (clock - WHOLE - CRACK - FALL - REST) / BACK; s = FALL * (1 - smooth(0, 1, k)); c = 1 - smooth(0.7, 1, k); } // the fall played backwards
        u.uS.value = s; u.uCrack.value = c;
      };
    },
    buildMist(cfg, w, h, C) { this.buildRain(cfg, w, h, C, true); },
    buildRain(cfg, w, h, C, mist) {
      const kind = Math.min(2, Math.max(0, cfg.kind | 0)), fog = mist ? 0.15 + val(cfg.amount, 0.6) * 0.85 : Number.isFinite(cfg.fog) ? val(cfg.fog, 0.7) : [0.72, 0.45, 0.94][kind];
      const cv = document.createElement("canvas"); cv.width = cv.height = 128;
      const ctx = cv.getContext("2d"); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 128, 128);
      const wipe = new THREE.CanvasTexture(cv);
      this.parts = { wipe };
      this.loadPicture((tex) => {
        const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat({ vertexShader: FLAT_VS, fragmentShader: RAIN_FS,
          uniforms: { map: { value: tex }, uWipe: { value: wipe }, uTime: { value: 0 }, uKind: { value: kind }, uAmount: { value: val(cfg.amount, 0.5) }, uSize: { value: val(cfg.size, 0.5) },
            uFog: { value: fog }, uMist: { value: mist ? 1 : 0 }, uBox: { value: new THREE.Vector2(w, h) }, uRot: { value: this.rot }, uC1: { value: C[0] }, uC2: { value: C[1] }, uC3: { value: C[2] } } }));
        pic.position.z = 0.0008; this.group.add(pic);
      });
      let last = null, dirty = false;
      this.step = (dt, d) => {
        const f = this.touchPoint();
        if (dirty) { ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = "rgba(0,0,0," + Math.min(1, d * (mist ? 0.07 : 0.12)).toFixed(4) + ")"; ctx.fillRect(0, 0, 128, 128); } // the glass fogs up again
        if (f) { // a finger wipes the glass clear
          const x = (f.x / w + 0.5) * 128, y = (0.5 - f.y / h) * 128;
          ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineCap = "round"; ctx.lineWidth = 16;
          ctx.beginPath(); ctx.moveTo(last ? last.x : x, last ? last.y : y); ctx.lineTo(x, y + 0.01); ctx.stroke();
          last = { x, y }; dirty = true;
        } else last = null;
        if (dirty) wipe.needsUpdate = true;
      };
    },
    buildDrip(cfg, w, h, C) {
      const kind = Math.min(2, Math.max(0, cfg.kind | 0)), ext = Math.max(w, h) * (0.35 + val(cfg.amount, 0.5) * 0.9);
      const heat = new THREE.Vector3(0, 0, 0), uP = { value: 0 };
      this.parts = {};
      this.loadPicture((tex) => { // the plane is bigger than the picture, so the runs can hang off it in any direction
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w + ext * 2, h + ext * 2), this.mat({ vertexShader: FLAT_VS, fragmentShader: DRIP_FS,
          uniforms: { map: { value: tex }, uP, uTime: { value: 0 }, uKind: { value: kind }, uAmount: { value: val(cfg.amount, 0.5) }, uSize: { value: val(cfg.size, 0.5) }, uSeed: { value: (cfg.seed | 0) * 1.37 + 0.5 },
            uBox: { value: new THREE.Vector2(w, h) }, uRot: { value: this.rot }, uHeat: { value: heat }, uC1: { value: C[0] }, uC2: { value: C[1] }, uC3: { value: C[2] } } }));
        mesh.position.z = 0.0008; mesh.frustumCulled = false; this.group.add(mesh);
      });
      // still, runs (faster and faster), hangs a moment, flows back up; a finger melts the paint under it
      const STILL = 1.6, MELT = 5.5, HOLD = 1.4, HEAL = 2.2, ALL = STILL + MELT + HOLD + HEAL;
      let clock = 0;
      this.step = (dt) => {
        clock = (clock + dt) % ALL;
        let p = 0;
        if (clock < STILL) p = 0;
        else if (clock < STILL + MELT) p = Math.pow((clock - STILL) / MELT, 1.5);
        else if (clock < STILL + MELT + HOLD) p = 1;
        else p = 1 - smooth(0, 1, (clock - STILL - MELT - HOLD) / HEAL);
        uP.value = p;
        const f = this.touchPoint();
        if (f) { heat.x = (f.x * this.rot.x + f.y * this.rot.y) / h; heat.z = Math.min(1, heat.z + dt * 1.2); }
        else heat.z = Math.max(0, heat.z - dt * 0.35);
      };
    },
    buildSketch(cfg, w, h, C) {
      const kind = Math.min(2, Math.max(0, cfg.kind | 0));
      const cv = document.createElement("canvas"); cv.width = cv.height = 128;
      const ctx = cv.getContext("2d"); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 128, 128);
      const wipe = new THREE.CanvasTexture(cv), uLine = { value: 0 }, uWash = { value: 0 };
      this.parts = { wipe };
      this.loadPicture((tex) => {
        const iw = (tex.image && tex.image.width) || 512, ih = (tex.image && tex.image.height) || 512;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat({ vertexShader: FLAT_VS, fragmentShader: SKETCH_FS,
          uniforms: { map: { value: tex }, uWipe: { value: wipe }, uLine, uWash, uKind: { value: kind }, uAmount: { value: val(cfg.amount, 0.5) }, uSize: { value: val(cfg.size, 0.5) },
            uSeed: { value: (cfg.seed | 0) * 1.7 + 0.3 }, uBox: { value: new THREE.Vector2(w, h) }, uTexel: { value: new THREE.Vector2(1 / iw, 1 / ih) }, uC1: { value: C[0] }, uC2: { value: C[1] }, uC3: { value: C[2] } } }));
        mesh.position.z = 0.0008; this.group.add(mesh);
      });
      // paper, the lines draw themselves, the colour washes in, the plain picture, everything fades back to paper; a finger paints colour in early
      const T = [0.6, 4.5, 0.5, 3.0, 0.6, 2.0, 1.8]; const ALL = T.reduce((a, b) => a + b, 0);
      let clock = 0, last = null, painted = false;
      this.step = (dt) => {
        const was = clock; clock = (clock + dt) % ALL;
        if (clock < was && painted) { ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 128, 128); wipe.needsUpdate = true; painted = false; }
        let c = clock, line = 0, wash = 0;
        const at = (i) => { const k = Math.min(1, c / T[i]); c -= T[i]; return k; };
        const k0 = at(0); if (c < 0) { line = 0; wash = 0; }
        else { const k1 = at(1); line = smooth(0, 1, k1);
          if (c >= 0) { at(2); if (c >= 0) { const k3 = at(3); wash = k3;
            if (c >= 0) { const k4 = at(4); wash = 1 + 0.3 * k4;
              if (c >= 0) { at(5); if (c >= 0) { const k6 = at(6); line = 1 - smooth(0, 1, k6); wash = 1.3 * (1 - smooth(0, 1, k6)); } } } } } }
        void k0;
        uLine.value = line; uWash.value = wash;
        const f = this.touchPoint();
        if (f) {
          const x = (f.x / w + 0.5) * 128, y = (0.5 - f.y / h) * 128;
          ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = "rgba(255,255,255,0.45)"; ctx.lineCap = "round"; ctx.lineWidth = 14;
          ctx.beginPath(); ctx.moveTo(last ? last.x : x, last ? last.y : y); ctx.lineTo(x, y + 0.01); ctx.stroke();
          last = { x, y }; painted = true; wipe.needsUpdate = true;
        } else last = null;
      };
    },
    buildSand(cfg, w, h, C) {
      const kind = Math.min(2, Math.max(0, cfg.kind | 0)), R = rand(9000 + (cfg.seed | 0)), uS = { value: 0 }, grid = new THREE.Vector2(1, 1);
      this.parts = {};
      this.loadPicture((tex) => {
        const n = Math.round(8000 + val(cfg.amount, 0.5) * 22000), asp = w / h, gw = Math.max(8, Math.round(Math.sqrt(n * asp))), gh = Math.max(8, Math.round(gw / asp));
        grid.set(gw, gh); // the same grid pointsFromImage makes
        const pts = pointsFromImage(tex.image, w, h, n), count = pts.home.length / 3;
        const common = { uS, uKind: { value: kind }, uBox: { value: new THREE.Vector2(w, h) }, uRot: { value: this.rot }, uGrid: { value: grid }, uC1: { value: C[0] }, uC2: { value: C[1] } };
        const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat({ vertexShader: FLAT_VS, fragmentShader: SANDPIC_FS, uniforms: Object.assign({ map: { value: tex }, uTime: { value: 0 } }, common) }));
        pic.position.z = 0.0008; this.group.add(pic);
        if (!count) return;
        const rnd = new Float32Array(count * 3); for (let i = 0; i < rnd.length; i++) rnd[i] = R();
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(pts.home, 3)); g.setAttribute("home", new THREE.Float32BufferAttribute(pts.home, 3));
        g.setAttribute("tint", new THREE.Float32BufferAttribute(pts.tint, 3)); g.setAttribute("rnd", new THREE.BufferAttribute(rnd, 3));
        const grains = new THREE.Points(g, this.mat({ vertexShader: SAND_VS, fragmentShader: SAND_FS, uniforms: Object.assign({ uSize: { value: pts.cell * (0.75 + val(cfg.size, 0.5) * 1.0) }, uVh: { value: 800 } }, common) }));
        grains.position.z = 0.001; grains.frustumCulled = false; this.group.add(grains);
      });
      // whole, blown away (a finger makes the wind stronger), gone a moment, blown back
      const WHOLE = 1.2, BLOW = kind === 1 ? 5.5 : kind === 2 ? 5.6 : 6.5, GONE = kind === 2 ? 1.6 : 0.9, BACK = 3, ALL = WHOLE + BLOW + GONE + BACK;
      let clock = 0;
      this.step = (dt) => {
        const f = this.touchPoint();
        if (f && clock < WHOLE) clock = WHOLE;
        clock = (clock + dt * (f && clock < WHOLE + BLOW ? 2.2 : 1)) % ALL;
        uS.value = clock < WHOLE ? 0 : clock < WHOLE + BLOW ? clock - WHOLE : clock < WHOLE + BLOW + GONE ? BLOW : BLOW * (1 - smooth(0, 1, (clock - WHOLE - BLOW - GONE) / BACK));
      };
    },
    buildEyes(cfg, w, h, C) {
      const kind = Math.min(2, Math.max(0, cfg.kind | 0)), R = rand(7000 + (cfg.seed | 0)), size = val(cfg.size, 0.5), unit = Math.max(w, h), eyes = [];
      if (kind === 0) eyes.push({ x: 0, y: 0, r: Math.min(w * 0.46, h * 0.85) * (0.6 + 0.4 * size) });
      else if (kind === 1) { const r = Math.min(w * 0.22, h * 0.8) * (0.6 + 0.4 * size), x = Math.min(w * 0.5 - r * 1.05, r * 1.3); eyes.push({ x: -x, y: 0, r }, { x, y: 0, r }); }
      else {
        const n = 3 + Math.round(val(cfg.amount, 0.5) * 9), base = Math.min(w, h) * (0.07 + 0.1 * size);
        for (let t = 0; t < 400 && eyes.length < n; t++) {
          const r = base * (0.6 + 0.6 * R()), x = (R() - 0.5) * Math.max(0, w - r * 2.5), y = (R() - 0.5) * Math.max(0, h - r * 1.8);
          if (eyes.every((e) => Math.abs(e.x - x) > (e.r + r) * 1.2 || Math.abs(e.y - y) > (e.r + r) * 0.75)) eyes.push({ x, y, r });
        }
      }
      const E = [], G = [];
      for (let i = 0; i < 12; i++) { const e = eyes[i]; E.push(new THREE.Vector4(e ? e.x : 0, e ? e.y : 0, e ? e.r : 1, R() * 50)); G.push(new THREE.Vector3(0, 0, 1)); }
      eyes.forEach((e) => { e.gx = 0; e.gy = 0; e.blinkIn = 0.8 + R() * 4; e.b = -1; e.hit = false; });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat({ vertexShader: FLAT_VS, fragmentShader: EYES_FS,
        uniforms: { uN: { value: eyes.length }, uEye: { value: E }, uGaze: { value: G }, uTime: { value: 0 }, uAmount: { value: val(cfg.amount, 0.5) }, uC1: { value: C[0] }, uC2: { value: C[1] }, uC3: { value: C[2] } } }));
      mesh.position.z = 0.0009; this.group.add(mesh);
      this.parts = {};
      const cam = new THREE.Vector3(), last = new THREE.Vector3(); let still = 99, wander = { x: 0, y: 0 }, wanderIn = 0, seen = false;
      const BLINK = 0.22;
      const startBlink = (e) => { if (e.b < 0) e.b = 0; };
      this.step = (dt, d) => {
        const sc = this.el.sceneEl, camera = sc && sc.camera, f = this.touchPoint();
        let haveCam = false;
        if (camera && this.group) { camera.getWorldPosition(cam); this.group.worldToLocal(cam); haveCam = cam.z > 1e-4; }
        if (haveCam) { if (seen && cam.distanceTo(last) / unit > 0.0015) still = 0; last.copy(cam); seen = true; }
        still += d;
        wanderIn -= dt; if (wanderIn <= 0) { wander = { x: (R() - 0.5) * 1.3, y: (R() - 0.5) * 0.9 }; wanderIn = 0.9 + R() * 2.4; }
        const follow = f ? 1 : haveCam ? Math.max(0, 1 - Math.max(0, still - 2.5)) : 0; // follows whoever looks; still for a while, it looks round
        const together = kind === 1;
        if (together) { const a = eyes[0]; a.blinkIn -= dt; if (a.blinkIn <= 0) { eyes.forEach(startBlink); a.blinkIn = 2 + R() * 4.5; } }
        eyes.forEach((e, i) => {
          let tx = wander.x, ty = wander.y;
          if (follow > 0) {
            const px = f ? f.x : cam.x, py = f ? f.y : cam.y, pz = f ? unit * 0.5 : Math.max(cam.z, unit * 0.2);
            let gx = (px - e.x) / pz * 1.8, gy = (py - e.y) / pz * 1.8; const L = Math.hypot(gx, gy); if (L > 1) { gx /= L; gy /= L; }
            tx = tx + (gx - tx) * follow; ty = ty + (gy - ty) * follow;
          }
          const k = 1 - Math.exp(-dt * 14); e.gx += (tx - e.gx) * k; e.gy += (ty - e.gy) * k;
          if (!together) { e.blinkIn -= dt; if (e.blinkIn <= 0) { startBlink(e); e.blinkIn = 2 + R() * 5; } }
          const hit = !!f && Math.abs(f.x - e.x) < e.r && Math.abs(f.y - e.y) < e.r * 0.6; // touched right on the eye: it blinks
          if (hit && !e.hit) (together ? eyes : [e]).forEach(startBlink);
          e.hit = hit;
          let open = 1;
          if (e.b >= 0) { e.b += dt; open = e.b < BLINK ? 1 - Math.sin(Math.PI * e.b / BLINK) : 1; if (e.b >= BLINK) e.b = -1; }
          G[i].set(e.gx, e.gy, open);
        });
      };
      this.step(0.016, 0.016);
    },
    // where the phone is: its position and the point on the layer it looks at, in the layer's own units (null when unknown)
    viewer(pos, dir, tmp) {
      const sc = this.el.sceneEl, camera = sc && sc.camera; if (!camera || !this.group) return null;
      camera.getWorldPosition(pos); camera.getWorldDirection(dir); tmp.copy(pos).add(dir);
      this.group.worldToLocal(pos); this.group.worldToLocal(tmp); dir.copy(tmp).sub(pos);
      if (pos.z < 1e-4 || dir.z > -1e-4) return null;
      const t = -pos.z / dir.z; return { x: pos.x + dir.x * t, y: pos.y + dir.y * t, dist: t * dir.length() };
    },
    buildTunnel(cfg, w, h, C) {
      const kind = Math.min(2, Math.max(0, cfg.kind | 0)), uPhase = { value: 0 };
      this.parts = {};
      this.loadPicture((tex) => {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat({ vertexShader: FLAT_VS, fragmentShader: TUNNEL_FS,
          uniforms: { map: { value: tex }, uPhase, uTime: { value: 0 }, uKind: { value: kind }, uAmount: { value: val(cfg.amount, 0.5) }, uSize: { value: val(cfg.size, 0.5) }, uBox: { value: new THREE.Vector2(w, h) },
            uC1: { value: C[0] }, uC2: { value: C[1] }, uC3: { value: C[2] } } }));
        mesh.position.z = 0.0008; this.group.add(mesh);
      });
      let boost = 0;
      this.step = (dt) => { // flying in; a finger flies faster
        boost += ((this.touchPoint() ? 1 : 0) - boost) * (1 - Math.exp(-dt * 4));
        uPhase.value = (uPhase.value + dt * (0.22 + boost * 0.9)) % 1;
      };
    },
    buildLens(cfg, w, h, C) {
      const kind = Math.min(2, Math.max(0, cfg.kind | 0)), unit = Math.max(w, h), base = unit * (0.12 + val(cfg.amount, 0.5) * 0.28);
      const spot = new THREE.Vector3(0, 0, base);
      this.parts = {};
      this.loadPicture((tex) => {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat({ vertexShader: FLAT_VS, fragmentShader: LENS_FS,
          uniforms: { map: { value: tex }, uKind: { value: kind }, uTime: { value: 0 }, uBox: { value: new THREE.Vector2(w, h) }, uSpot: { value: spot }, uC1: { value: C[0] }, uC2: { value: C[1] }, uC3: { value: C[2] } } }));
        mesh.position.z = 0.0008; this.group.add(mesh);
      });
      const pos = new THREE.Vector3(), dir = new THREE.Vector3(), tmp = new THREE.Vector3(), last = new THREE.Vector3();
      let still = 99, seen = false, clock = 0;
      this.step = (dt, d) => {
        clock += dt;
        const f = this.touchPoint(), v = this.viewer(pos, dir, tmp);
        if (v) { if (seen && pos.distanceTo(last) / unit > 0.0015) still = 0; last.copy(pos); seen = true; }
        still += d;
        let tx, ty, tr;
        if (f) { tx = f.x; ty = f.y; tr = base * 1.15; }
        else if (v && still < 2.5) { // where the phone points; closer is a bigger circle
          tx = Math.max(-w * 0.6, Math.min(w * 0.6, v.x)); ty = Math.max(-h * 0.6, Math.min(h * 0.6, v.y));
          tr = base * Math.pow(Math.max(0.3, Math.min(5, (unit * 1.5) / Math.max(v.dist, 1e-4))), 1.6);
        } else { tx = Math.sin(clock * 0.37) * w * 0.3; ty = Math.sin(clock * 0.53 + 1) * h * 0.26; tr = base; } // nobody moving: it wanders
        const k = 1 - Math.exp(-dt * 6);
        spot.x += (tx - spot.x) * k; spot.y += (ty - spot.y) * k; spot.z += (Math.min(tr, unit * 1.6) - spot.z) * k;
      };
    },
    buildDaysky(cfg, w, h, C) {
      const kind = Math.min(2, Math.max(0, cfg.kind | 0)), uHour = { value: 12 };
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat({ vertexShader: FLAT_VS, fragmentShader: DAYSKY_FS,
        uniforms: { uHour, uTime: { value: 0 }, uAmount: { value: val(cfg.amount, 0.5) }, uSize: { value: val(cfg.size, 0.5) }, uBox: { value: new THREE.Vector2(w, h) }, uC1: { value: C[0] }, uC2: { value: C[1] }, uC3: { value: C[2] } } }));
      mesh.position.z = 0.0007; this.group.add(mesh);
      this.parts = {};
      let clock = 0;
      const hour = () => {
        if (kind === 0) { const n = new Date(); return n.getHours() + n.getMinutes() / 60 + n.getSeconds() / 3600; } // the viewer's own clock
        if (kind === 1) return (6 + clock * 24 / 40) % 24; // a whole day in 40 seconds
        return 16.8 + 4 * (0.5 - 0.5 * Math.cos(clock * Math.PI * 2 / 40)); // late afternoon, sunset, night and back
      };
      this.step = (dt) => { clock += dt; uHour.value = hour(); };
      this.step(0);
    },
    buildAurora(cfg, w, h, C) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat({ vertexShader: FLAT_VS, fragmentShader: AURORA_FS,
        uniforms: { uTime: { value: 0 }, uKind: { value: Math.min(2, Math.max(0, cfg.kind | 0)) }, uAmount: { value: val(cfg.amount, 0.5) }, uSize: { value: val(cfg.size, 0.5) }, uBox: { value: new THREE.Vector2(w, h) },
          uC1: { value: C[0] }, uC2: { value: C[1] }, uC3: { value: C[2] } } }));
      mesh.position.z = 0.0009; this.group.add(mesh);
      this.parts = {};
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
        uniforms: { uTime: { value: 0 }, uHalfH: { value: h / 2 }, uHalfW: { value: w / 2 }, uKind: { value: kind }, uC1: { value: C[0] }, uC2: { value: C[1] }, uC3: { value: C[2] } } });
      const mesh = new THREE.InstancedMesh(geo, m, n); mesh.frustumCulled = false; this.group.add(mesh);
      const S = unit * (0.05 + val(cfg.size, 0.5) * 0.07), tall = 0.75 + len, M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3();
      const jl = [];
      for (let i = 0; i < n; i++) { const s = S * (0.7 + R() * 0.6); jl.push({ p: new THREE.Vector3((R() - 0.5) * w * 0.8, -h / 2 + R() * h, unit * (0.05 + R() * 0.35)), s, ph: ph[i], dr: R() * TAU, push: new THREE.Vector2() }); }
      const mv = { x: 0, y: 0 }, up = { x: 0, y: 0 };
      this.step = (dt) => {
        const touch = this.touchPoint(), G = this.G || UPRIGHT;
        turn(G, 0, 1, up);
        jl.forEach((j, i) => {
          const pulse = Math.pow(0.5 + 0.5 * Math.sin(this.t * 1.7 + j.ph * TAU), 2), drift = Math.sin(this.t * 0.3 + j.dr) * j.s * 0.35;
          if (touch) { const dx = j.p.x - touch.x, dy = j.p.y - touch.y, r = Math.hypot(dx, dy); if (r < unit * 0.3) j.push.set(dx, dy).multiplyScalar(unit * 0.6 / Math.max(r, 1e-4)); }
          turn(G, drift, j.s * (0.15 + 0.9 * pulse), mv); // they rise up in the world
          j.p.x += (mv.x + j.push.x) * dt; j.p.y += (mv.y + j.push.y) * dt; j.push.multiplyScalar(Math.exp(-dt * 2));
          if (outside(j.p, w, h, j.s * 1.3)) { enterAt(j.p, up.x, up.y, w, h, j.s * 0.8, R, 0.8); } // gone out the top: back in from below
          if (!this.G) j.p.x = Math.max(-w * 0.48, Math.min(w * 0.48, j.p.x));
          E.set(0, 0, G.ang - (drift + j.push.x) / (j.s * 2)); Q.setFromEuler(E);
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
        uniforms: Object.assign({}, shared, { uFall: { value: 0 }, uShare: { value: [0, 0.3, 0.85][kind] }, uRot: { value: this.rot }, uC2: { value: C[1] }, uC3: { value: C[2] } }) });
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
      const up = { x: 0, y: 1 }, mv = { x: 0, y: 0 }, at = new THREE.Vector3();
      const spawn = (b, first) => {
        b.r = base * (0.5 + R() * 0.9); b.pop = -1; b.age = 0; b.life = 5 + R() * 9;
        if (kind === 0) { // rising: in from below (the world's below, with gravity)
          if (first) b.p.set((R() - 0.5) * w * 0.85, (R() - 0.5) * h, R() * depth); else { enterAt(b.p, up.x, up.y, w, h, b.r, R); b.p.z = R() * depth; }
          b.v.set(0, unit * (0.05 + R() * 0.07), 0);
        }
        else if (kind === 1) { b.p.set((R() - 0.5) * w * 0.8, (R() - 0.5) * h * 0.8, R() * depth); b.v.set((R() - 0.5) * unit * 0.04, (R() - 0.5) * unit * 0.04, 0); }
        else { b.p.copy(wand); if (first) b.p.x += R() * w * 0.6; b.v.set(unit * (0.2 + R() * 0.25), unit * (0.03 + R() * 0.15), unit * (R() - 0.3) * 0.08); b.life = 3 + R() * 4; }
      };
      const bs = []; for (let i = 0; i < n; i++) { const b = { p: new THREE.Vector3(), v: new THREE.Vector3(), ph: ph[i] }; spawn(b, true); if (kind === 2) b.age = R() * 3; bs.push(b); }
      this.step = (dt) => {
        const touch = this.touchPoint(), G = this.G || UPRIGHT;
        turn(G, 0, 1, up);
        const ext = Math.abs(up.x) * w / 2 + Math.abs(up.y) * h / 2; // how far the box reaches up the flow
        bs.forEach((b, i) => {
          let s = b.r;
          if (b.pop >= 0) { b.pop += dt; s = b.r * (1 + b.pop * 3) * Math.max(0, 1 - b.pop / 0.15); if (b.pop > 0.15) spawn(b, false); } // pop: it swells for a blink and is gone
          else {
            b.age += dt;
            if (kind === 1) { b.v.x += Math.sin(this.t * 0.5 + b.ph * 30) * unit * 0.01 * dt; b.v.y += Math.cos(this.t * 0.4 + b.ph * 20) * unit * 0.01 * dt; }
            if (kind === 2) { b.v.multiplyScalar(Math.exp(-dt * 0.6)); b.v.y += unit * 0.02 * dt; }
            if (kind === 0) { turn(G, b.v.x + Math.sin(this.t * 1.3 + b.ph * 10) * unit * 0.02, b.v.y, mv); b.p.x += mv.x * dt; b.p.y += mv.y * dt; } // they rise up in the world
            else { b.p.addScaledVector(b.v, dt); b.p.x += Math.sin(this.t * 1.3 + b.ph * 10) * unit * 0.02 * dt; }
            const out = Math.abs(b.p.x) > w * 0.55 || b.p.y > h * 0.46 || b.p.y < -h * 0.6;
            if ((kind === 0 && (b.p.x * up.x + b.p.y * up.y > ext * 0.88 || outside(b.p, w, h, b.r * 2))) || (kind !== 0 && (b.age > b.life || out))) b.pop = 0;
          }
          at.copy(b.p); if (kind === 2) { turn(G, b.p.x, b.p.y, mv); at.x = mv.x; at.y = mv.y; } // the wand's stream turns as a whole
          if (b.pop < 0 && touch && Math.hypot(at.x - touch.x, at.y - touch.y) < b.r * 1.4 + unit * 0.03) b.pop = 0; // a finger pops it
          M.compose(at, Q, V.setScalar(Math.max(s, 1e-6))); mesh.setMatrixAt(i, M);
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
      const held = { k: 0, x: 0, y: 0 }, tmpEye = new THREE.Vector3(), q = { x: 0, y: 0 };
      this.step = (dt, d) => {
        const t = this.t, G = this.G;
        drops.forEach((o, i) => {
          let x, y;
          if (o.pool) { x = Math.sin(t * 0.1 + o.px) * w * 0.05; y = o.pool * h * 0.5; }
          else if (kind === 2) { x = o.x0 + Math.sin(t * 0.1 * o.fx * 6 + o.px) * w * 0.12; y = Math.sin(t * 0.18 * o.fy * 6 + o.py) * h * 0.36; } // wax rises and sinks slowly
          else { x = Math.sin(t * o.fx * 2 + o.px) * o.ax; y = Math.sin(t * o.fy * 2 + o.py) * o.ay; }
          if (G) { // real gravity: the lamp turns with the world (its pools stay at the bottom and top), metal runs to the low side
            if (kind === 2) { turn(G, x, y, q); x = q.x; y = q.y; }
            else { x += G.gx * w * 0.28; y += G.gy * h * 0.28; }
            const m = o.r * 0.8; x = Math.max(-w / 2 + m, Math.min(w / 2 - m, x)); y = Math.max(-h / 2 + m, Math.min(h / 2 - m, y));
          }
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
      const geo = lanternGeometry(), hgeo = new THREE.PlaneGeometry(1, 1), phase = new Float32Array(n), fade = new Float32Array(n), tone = new Float32Array(n);
      const attrs = { phase: new THREE.InstancedBufferAttribute(phase, 1), fade: new THREE.InstancedBufferAttribute(fade, 1), tone: new THREE.InstancedBufferAttribute(tone, 1) };
      for (const [k, at] of Object.entries(attrs)) { geo.setAttribute(k, at); hgeo.setAttribute(k, at); }
      const m = this.mat({ vertexShader: LANTERN_VS, fragmentShader: LANTERN_FS, side: THREE.DoubleSide, depthWrite: true, uniforms: { uTime: { value: 0 }, uC1: { value: C[0] }, uC2: { value: C[1] }, uC3: { value: C[2] } } });
      const hm = this.mat({ vertexShader: HALO_VS, fragmentShader: HALO_FS, blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 }, uC2: { value: C[1] }, uC3: { value: C[2] } } });
      this.depthMats = [m]; // paper is not see-through: each lantern hides what is behind it, its own inside too
      const mesh = new THREE.InstancedMesh(geo, m, n), halo = new THREE.InstancedMesh(hgeo, hm, n);
      mesh.frustumCulled = halo.frustumCulled = false; halo.renderOrder = 1; this.group.add(mesh, halo);
      const S = unit * (0.06 + val(cfg.size, 0.5) * 0.08), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(0, 0, 0, "ZYX"), V = new THREE.Vector3(), SC = new THREE.Vector3(), cycle = 16;
      const ls = [];
      for (let i = 0; i < n; i++) ls.push({ p: new THREE.Vector3((R() - 0.5) * w * 0.85, (R() - 0.5) * h, R() * depth), home: new THREE.Vector3((R() - 0.5) * w * 0.8, (R() - 0.5) * h * 0.7, R() * depth),
        s: S * (0.6 + R() * 0.7), ph: R(), tone: R(), vy: unit * (0.035 + R() * 0.035), dir: R() - 0.5, spin: R() * TAU, push: new THREE.Vector2(), off: new THREE.Vector2(), f: 1 });
      const order = ls.slice(), up = { x: 0, y: 1 }, mv = { x: 0, y: 0 };
      this.step = (dt) => {
        const t = this.t, touch = this.touchPoint(), G = this.G || UPRIGHT;
        turn(G, 0, 1, up);
        const ext = Math.abs(up.x) * w / 2 + Math.abs(up.y) * h / 2;
        ls.forEach((l, i) => {
          if (kind === 0) { // rising to the sky (up in the world, with gravity), back in from below
            turn(G, Math.sin(t * 0.2 + l.ph * 9) * unit * 0.02, l.vy * (l.s / S), mv);
            l.p.x += mv.x * dt; l.p.y += mv.y * dt;
            const u = l.p.x * up.x + l.p.y * up.y;
            if (u > ext || outside(l.p, w, h, l.s * 2)) { enterAt(l.p, up.x, up.y, w, h, 0, R); }
            const u2 = l.p.x * up.x + l.p.y * up.y;
            l.f = smooth(-ext, -ext * 0.76, u2) * (1 - smooth(ext * 0.64, ext, u2));
          } else if (kind === 1) { // floating in place
            l.p.set(l.home.x + Math.sin(t * 0.4 + l.ph * 9) * unit * 0.03, l.home.y + Math.sin(t * 0.6 + l.ph * 13) * unit * 0.04, l.home.z); l.f = 1;
          } else { // let go one after another from below the middle, spreading as they rise (the whole flight turns with gravity)
            const age = ((t - (i / n) * cycle) % cycle + cycle) % cycle, y = -h * 0.45 + age * unit * 0.07;
            turn(G, l.dir * age * unit * 0.05 + Math.sin(t * 0.3 + l.ph * 9) * unit * 0.015, y, mv);
            l.p.set(mv.x, mv.y, depth * (0.2 + l.ph * 0.6));
            l.f = smooth(0, 0.8, age) * (1 - smooth(h * 0.3, h * 0.48, y));
          }
          if (touch) { const dx = l.p.x + l.off.x - touch.x, dy = l.p.y + l.off.y - touch.y, r = Math.hypot(dx, dy); if (r < unit * 0.25) l.push.set(dx, dy).multiplyScalar(unit * 0.5 / Math.max(r, 1e-4)); } // a finger nudges them aside
          l.off.addScaledVector(l.push, dt); l.push.multiplyScalar(Math.exp(-dt * 3)); l.off.multiplyScalar(Math.exp(-dt * 0.5));
        });
        order.sort((a, b) => a.p.z - b.p.z); // the far ones are drawn first
        order.forEach((l, i) => {
          // upright in the world, a gentle sway, and a slow turn around its own middle (seen in 3D and in the camera)
          E.set(Math.sin(t * 0.7 + l.ph * 11) * 0.05, l.spin + t * 0.15 * (l.ph - 0.5), G.ang + Math.sin(t * 0.9 + l.ph * TAU) * 0.07 + l.off.x / unit * 0.6); Q.setFromEuler(E);
          V.set(l.p.x + l.off.x, l.p.y + l.off.y, l.p.z); M.compose(V, Q, SC.setScalar(l.s)); mesh.setMatrixAt(i, M); halo.setMatrixAt(i, M);
          phase[i] = l.ph; fade[i] = l.f; tone[i] = l.tone;
        });
        mesh.instanceMatrix.needsUpdate = true; halo.instanceMatrix.needsUpdate = true; for (const at of Object.values(attrs)) at.needsUpdate = true;
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
      if (this.depthMats) for (const m of this.depthMats) m.depthWrite = true; // the layer's arrival turns it off for every mesh
      if (this.G) { this.G.step(this.group, sc, d); this.rot.set(this.G.cos, this.G.sin); }
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
        const fl = kind === 2 ? 0.25 : 1; // butterflies hardly flock: each flutters its own way
        if (k) { acc.x += (cx / k * 1.6 + (ax / k - me.v.x) * 1.8) * fl + sx * sep * sep * 2.2; acc.y += (cy / k * 1.6 + (ay / k - me.v.y) * 1.8) * fl + sy * sep * sep * 2.2; acc.z += (cz / k * 1.6 + (az / k - me.v.z) * 1.8) * fl + sz * sep * sep * 2.2; }
        // stay around the artwork: a soft pull back near the edges, and in front of it in depth
        const ex = w * 0.4, ey = h * 0.38;
        if (me.p.x > ex) acc.x -= (me.p.x - ex) * 6; if (me.p.x < -ex) acc.x -= (me.p.x + ex) * 6;
        if (me.p.y > ey) acc.y -= (me.p.y - ey) * 6; if (me.p.y < -ey) acc.y -= (me.p.y + ey) * 6;
        if (me.p.z < depth * 0.05) acc.z += (depth * 0.05 - me.p.z) * 8; if (me.p.z > depth) acc.z -= (me.p.z - depth) * 8;
        acc.x += Math.sin(this.t * 0.7 + i) * maxV * 0.6; acc.y += Math.cos(this.t * 0.5 + i * 1.7) * maxV * 0.4; // wandering
        if (kind === 2) { acc.x += Math.sin(this.t * 1.7 + i * 3.1) * Math.sin(this.t * 0.6 + i) * maxV * 3; acc.y += Math.sin(this.t * 3 + i * 2.1) * maxV * 1.5 + Math.cos(this.t * 2.2 + i * 1.3) * maxV * 1.5; } // butterflies bob and flutter
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
