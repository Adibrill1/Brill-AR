// Shared AR-element builder — used by both the portal's live 3D preview editor and
// the AR views, so what the artist positions in the editor is exactly what visitors see.
//
// Element: { kind: 'video'|'image'|'model'|'lib'|'text', fit: 'cover'|'free',
//            transform: {...}, animation: {type, speed}, ...kind-specific fields }
// Anchor space (MindAR): trigger image is 1 unit wide, X right, Y up, Z toward viewer.
import { buildLibraryElement } from './library.js';

export const DEFAULT_TRANSFORM = { x: 0, y: 0, z: 0.25, scale: 1, upright: false, rotz: 0 };
export const DEFAULT_ANIMATION = { type: 'none', speed: 1 };

// cover planes match the trigger exactly (1.0); raise slightly (e.g. 1.14) to mask
// tracking jitter at the cost of the content extending past the print's edges
const COVER_OVERSIZE = 1.0;

export const ANIMATIONS = [
  { id: 'none', name: 'ללא אנימציה' },
  { id: 'spin', name: 'מסתובב סביב עצמו' },
  { id: 'bob', name: 'עולה ויורד' },
  { id: 'approach', name: 'מתקרב ומתרחק' },
  { id: 'pulse', name: 'פעימה (גדל וקטן)' },
  { id: 'orbit', name: 'מקיף במעגל' },
];

// Hebrew webfonts first (bundled in portal/fonts), then universal system fonts
export const TEXT_FONTS = ['Rubik', 'Heebo', 'Frank Ruhl Libre', 'Secular One', 'Amatic SC',
  'Arial', 'Verdana', 'Georgia', 'Times New Roman', 'Courier New', 'Impact', 'Trebuchet MS'];

export function elementLabel(kind) {
  return { video: 'וידאו', image: 'תמונה', model: 'מודל תלת-מימד', lib: 'אלמנט מהספרייה', text: 'טקסט' }[kind] || kind;
}

async function buildTextMesh(THREE, el) {
  const fontSize = 96, pad = 42, lineH = fontSize * 1.3;
  const fontSpec = `${el.italic ? 'italic ' : ''}${el.bold ? 'bold ' : ''}${fontSize}px "${el.font || 'Rubik'}"`;
  // webfonts must be loaded before canvas rendering, or the browser falls back silently
  try { await document.fonts.load(fontSpec, 'אב Ag'); } catch { /* system font fallback */ }
  const lines = String(el.text || '').split('\n');
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = fontSpec;
  const w = Math.max(60, ...lines.map((l) => probe.measureText(l).width)) + pad * 2;
  const h = lines.length * lineH + pad * 2;
  const c = document.createElement('canvas');
  c.width = Math.ceil(w); c.height = Math.ceil(h);
  const x = c.getContext('2d');
  if (el.bgOn) {
    x.fillStyle = el.bg || '#1f4e5f';
    x.beginPath();
    x.roundRect(0, 0, c.width, c.height, 28);
    x.fill();
  }
  x.font = fontSpec;
  x.fillStyle = el.color || '#ffffff';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.direction = 'rtl';
  lines.forEach((l, i) => x.fillText(l, c.width / 2, pad + lineH * (i + 0.5)));
  const tex = new THREE.CanvasTexture(c);
  const planeW = 0.75;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(planeW, planeW * c.height / c.width),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }),
  );
}

// triggerH = image height / image width (trigger plane is 1 x triggerH)
export async function buildElement(THREE, el, url, triggerH) {
  let inner, video = null, gltf = null;

  if (el.kind === 'model') {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    gltf = await new GLTFLoader().loadAsync(url);
    inner = gltf.scene;
    const box = new THREE.Box3().setFromObject(inner);
    const size = box.getSize(new THREE.Vector3()).length() || 1;
    inner.scale.setScalar(0.8 / size);
    box.setFromObject(inner);
    inner.position.sub(box.getCenter(new THREE.Vector3()));
  } else if (el.kind === 'lib') {
    inner = buildLibraryElement(THREE, el.libId, el.color);
  } else if (el.kind === 'text') {
    inner = await buildTextMesh(THREE, el);
  } else {
    let tex, aspect;
    if (el.kind === 'video') {
      video = document.createElement('video');
      video.src = url;
      video.crossOrigin = 'anonymous';
      video.loop = true; video.playsInline = true; video.muted = true;
      await new Promise((res, rej) => {
        video.onloadedmetadata = res;
        video.onerror = () => rej(new Error('video load failed'));
      });
      tex = new THREE.VideoTexture(video);
      aspect = video.videoWidth / video.videoHeight;
    } else {
      tex = await new THREE.TextureLoader().loadAsync(url);
      aspect = tex.image.width / tex.image.height;
    }
    let w, h;
    if (el.fit === 'cover') {
      // exactly overlay the trigger, slightly oversized so jitter never reveals it
      w = COVER_OVERSIZE; h = triggerH * COVER_OVERSIZE;
      const planeAspect = 1 / triggerH;
      if (aspect > planeAspect) {
        const r = planeAspect / aspect;
        tex.repeat.set(r, 1); tex.offset.set((1 - r) / 2, 0);
      } else {
        const r = aspect / planeAspect;
        tex.repeat.set(1, r); tex.offset.set(0, (1 - r) / 2);
      }
    } else {
      w = 0.8; h = 0.8 / aspect;
    }
    inner = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }),
    );
  }

  // wrap (artist transform) > animGroup (looping animation offsets) > inner
  const animGroup = new THREE.Group();
  animGroup.add(inner);
  const wrap = new THREE.Group();
  wrap.add(animGroup);

  const isCover = el.fit === 'cover' && (el.kind === 'video' || el.kind === 'image');
  if (isCover) {
    wrap.position.set(0, 0, 0.01);
  } else {
    const t = { ...DEFAULT_TRANSFORM, ...(el.transform || {}) };
    wrap.position.set(t.x, t.y, t.z);
    wrap.scale.setScalar(t.scale);
    // upright stands the element perpendicular to the trigger image;
    // rotz spins it (in-plane when flat, around itself when upright)
    wrap.rotation.set(t.upright ? -Math.PI / 2 : 0, 0, THREE.MathUtils.degToRad(t.rotz || 0));
  }

  const a = { ...DEFAULT_ANIMATION, ...(el.animation || {}) };
  const anim = (!isCover && a.type !== 'none') ? { group: animGroup, type: a.type, speed: a.speed || 1 } : null;

  return { obj: wrap, video, gltf, anim };
}

// advance all looping animations; elapsed is total seconds (e.g. clock.getElapsedTime())
export function updateAnimations(anims, elapsed) {
  for (const a of anims) {
    const t = elapsed * a.speed;
    const g = a.group;
    switch (a.type) {
      case 'spin':
        g.rotation.y = t * 1.2;
        break;
      case 'bob':
        g.position.y = 0.12 * Math.sin(t * 2);
        break;
      case 'approach':
        g.position.z = 0.14 * Math.sin(t * 1.6);
        break;
      case 'pulse': {
        const s = 1 + 0.16 * Math.sin(t * 2.6);
        g.scale.setScalar(s);
        break;
      }
      case 'orbit':
        g.position.x = 0.22 * Math.cos(t * 1.1);
        g.position.y = 0.22 * Math.sin(t * 1.1);
        break;
    }
  }
}

// builds all elements of an item; returns { group, videos, mixers, anims } — caller drives
// play/pause on target found/lost, mixer updates and updateAnimations in the render loop
export async function buildElements(THREE, elements, urlOf, triggerH) {
  const group = new THREE.Group();
  group.add(new THREE.AmbientLight(0xffffff, 0.9));
  const dir = new THREE.DirectionalLight(0xffffff, 1.1);
  dir.position.set(0.5, 1, 1);
  group.add(dir);

  const videos = [], mixers = [], anims = [];
  for (const el of elements) {
    const { obj, video, gltf, anim } = await buildElement(THREE, el, urlOf(el), triggerH);
    group.add(obj);
    if (video) videos.push(video);
    if (anim) anims.push(anim);
    if (gltf?.animations?.length) {
      const mixer = new THREE.AnimationMixer(gltf.scene);
      gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
      mixers.push(mixer);
    }
  }
  return { group, videos, mixers, anims };
}
