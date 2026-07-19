// Real extruded 3D text built from the bundled webfont glyph outlines (opentype.js).
// Returns a group whose userData.letters is an array of per-letter groups, enabling
// letter-level animations (wave, jump) on top of whole-element ones.
import { parse as parseFont } from '../../spike/vendor/opentype.module.js';

const FONT_DIR = new URL('../fonts/files/', import.meta.url).href;

// family -> file name stems; hebrew/latin subsets are separate files, picked per character
const FONT_FILES = {
  'Rubik': 'rubik',
  'Heebo': 'heebo',
  'Frank Ruhl Libre': 'frank-ruhl-libre',
  'Secular One': 'secular-one',
  'Amatic SC': 'amatic-sc',
};
export const TEXT3D_FONTS = Object.keys(FONT_FILES);
const NO_BOLD = new Set(['secular-one']);

const fontCache = new Map();
async function loadFont(stem, subset, weight) {
  if (NO_BOLD.has(stem)) weight = 400;
  const key = `${stem}-${subset}-${weight}`;
  if (!fontCache.has(key)) {
    fontCache.set(key, (async () => {
      const res = await fetch(`${FONT_DIR}${stem}-${subset}-${weight}-normal.woff`);
      if (!res.ok) throw new Error(`font fetch failed: ${key}`);
      return parseFont(await res.arrayBuffer());
    })());
  }
  return fontCache.get(key);
}

const isHebrew = (ch) => /[֐-׿]/.test(ch);

// minimal bidi for display: RTL base — reverse run order, reverse chars inside Hebrew runs
function toVisual(line) {
  if (!/[֐-׿]/.test(line)) return line.split('');
  const runs = [];
  for (const ch of line) {
    const heb = isHebrew(ch);
    const last = runs[runs.length - 1];
    // spaces/punctuation join the current run to keep phrases intact
    const neutral = !/[a-zA-Z0-9֐-׿]/.test(ch);
    if (last && (neutral || last.heb === heb)) last.chars.push(ch);
    else runs.push({ heb, chars: [ch] });
  }
  const visual = [];
  for (const run of runs.reverse()) {
    visual.push(...(run.heb ? run.chars.reverse() : run.chars));
  }
  return visual;
}

function glyphToShapes(THREE, glyph, size, unitsPerEm) {
  const scale = size / unitsPerEm;
  const path = new THREE.ShapePath();
  let first = true;
  for (const cmd of glyph.path.commands) {
    // opentype y grows upward in font units; keep as-is (three y up)
    switch (cmd.type) {
      case 'M': path.moveTo(cmd.x * scale, cmd.y * scale); first = false; break;
      case 'L': path.lineTo(cmd.x * scale, cmd.y * scale); break;
      case 'Q': path.quadraticCurveTo(cmd.x1 * scale, cmd.y1 * scale, cmd.x * scale, cmd.y * scale); break;
      case 'C': path.bezierCurveTo(cmd.x1 * scale, cmd.y1 * scale, cmd.x2 * scale, cmd.y2 * scale, cmd.x * scale, cmd.y * scale); break;
      case 'Z': if (path.currentPath) path.currentPath.closePath(); break;
    }
  }
  if (first) return null;
  return path.toShapes(false);
}

export async function build3DText(THREE, el) {
  const stem = FONT_FILES[el.font] || 'rubik';
  const weight = el.bold ? 700 : 400;
  const size = 1;                     // working units; whole block normalized at the end
  const depth = 0.18;
  const lineHeight = 1.35;

  const material = new THREE.MeshStandardMaterial({
    color: el.color || '#ffffff', metalness: 0.35, roughness: 0.4,
  });
  const sideMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(el.color || '#ffffff').multiplyScalar(0.65),
    metalness: 0.35, roughness: 0.5,
  });

  const root = new THREE.Group();
  const letters = [];
  const lines = String(el.text || '').split('\n');
  let maxWidth = 0;

  for (let li = 0; li < lines.length; li++) {
    const chars = toVisual(lines[li]);
    let x = 0;
    const lineGroup = new THREE.Group();
    for (const ch of chars) {
      const subset = isHebrew(ch) ? 'hebrew' : 'latin';
      const font = await loadFont(stem, subset, weight);
      const glyph = font.charToGlyph(ch);
      const adv = (glyph.advanceWidth || font.unitsPerEm * 0.5) * (size / font.unitsPerEm);
      if (ch.trim()) {
        const shapes = glyphToShapes(THREE, glyph, size, font.unitsPerEm);
        if (shapes && shapes.length) {
          const geo = new THREE.ExtrudeGeometry(shapes, {
            depth, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2,
          });
          if (el.italic) geo.applyMatrix4(new THREE.Matrix4().makeShear(0.22, 0, 0, 0, 0, 0));
          const mesh = new THREE.Mesh(geo, [material, sideMaterial]);
          const letter = new THREE.Group();
          letter.add(mesh);
          letter.position.set(x, -li * lineHeight, 0);
          letter.userData.baseY = letter.position.y;
          lineGroup.add(letter);
          letters.push(letter);
        }
      }
      x += adv;
    }
    maxWidth = Math.max(maxWidth, x);
    // center each line horizontally
    lineGroup.position.x = -x / 2;
    root.add(lineGroup);
  }

  // vertical centering around the block's middle
  root.position.y = ((lines.length - 1) * lineHeight) / 2 - 0.3;

  const wrap = new THREE.Group();
  wrap.add(root);

  if (el.bgOn) {
    const padX = 0.45, padY = 0.5;
    const w = maxWidth + padX * 2;
    const h = lines.length * lineHeight + padY;
    const r = Math.min(0.25, w / 4);
    const s = new THREE.Shape();
    s.moveTo(-w / 2 + r, -h / 2);
    s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    const panel = new THREE.Mesh(
      new THREE.ShapeGeometry(s),
      new THREE.MeshBasicMaterial({ color: el.bg || '#1f4e5f', side: THREE.DoubleSide,
                                    transparent: true, opacity: 0.92 }),
    );
    panel.position.set(0, ((lines.length - 1) * lineHeight) / -2 + root.position.y + 0.35, -0.06);
    wrap.add(panel);
  }

  // normalize the whole block to a friendly size in trigger units
  const box = new THREE.Box3().setFromObject(wrap);
  const bw = box.getSize(new THREE.Vector3());
  const target = 0.78;
  const k = target / Math.max(bw.x, 0.001);
  wrap.scale.setScalar(Math.min(k, target / Math.max(bw.y * 0.6, 0.001)));
  box.setFromObject(wrap);
  wrap.position.sub(box.getCenter(new THREE.Vector3()));

  const holder = new THREE.Group();
  holder.add(wrap);
  holder.userData.letters = letters;
  return holder;
}
