// Shared AR-element builder — used by both the portal's live 3D preview editor and
// the AR view, so what the artist positions in the editor is exactly what visitors see.
//
// Element: { kind: 'video'|'image'|'model', fit: 'cover'|'free', transform: {...} }
// Anchor space (MindAR): trigger image is 1 unit wide, X right, Y up, Z toward viewer.

export const DEFAULT_TRANSFORM = { x: 0, y: 0, z: 0.25, scale: 1, upright: false, rotz: 0 };

export function elementLabel(kind) {
  return { video: 'וידאו', image: 'תמונה', model: 'מודל תלת-מימד' }[kind] || kind;
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
      // exactly overlay (and hide) the trigger image; crop overflow like CSS cover
      w = 1; h = triggerH;
      const planeAspect = w / h;
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

  const wrap = new THREE.Group();
  wrap.add(inner);
  if (el.fit === 'cover' && el.kind !== 'model') {
    wrap.position.set(0, 0, 0.01);  // just above the trigger so it fully hides it
  } else {
    const t = { ...DEFAULT_TRANSFORM, ...(el.transform || {}) };
    wrap.position.set(t.x, t.y, t.z);
    wrap.scale.setScalar(t.scale);
    // upright stands the element perpendicular to the trigger image;
    // rotz spins it (in-plane when flat, around itself when upright)
    wrap.rotation.set(t.upright ? -Math.PI / 2 : 0, 0, THREE.MathUtils.degToRad(t.rotz || 0));
  }
  return { obj: wrap, video, gltf };
}

// builds all elements of an item; returns { group, videos, mixers } — caller drives
// play/pause on target found/lost and mixer updates in the render loop
export async function buildElements(THREE, elements, urlOf, triggerH) {
  const group = new THREE.Group();
  group.add(new THREE.AmbientLight(0xffffff, 0.9));
  const dir = new THREE.DirectionalLight(0xffffff, 1.1);
  dir.position.set(0.5, 1, 1);
  group.add(dir);

  const videos = [], mixers = [];
  for (const el of elements) {
    const { obj, video, gltf } = await buildElement(THREE, el, urlOf(el), triggerH);
    group.add(obj);
    if (video) videos.push(video);
    if (gltf?.animations?.length) {
      const mixer = new THREE.AnimationMixer(gltf.scene);
      gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
      mixers.push(mixer);
    }
  }
  return { group, videos, mixers };
}
