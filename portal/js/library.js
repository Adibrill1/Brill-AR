// Built-in 3D element library — procedural three.js shapes, no external files.
// Each builder returns an Object3D normalized to ~0.45 units, colored by the artist.

export const LIBRARY = [
  { id: 'heart', name: 'לב' },
  { id: 'star', name: 'כוכב' },
  { id: 'knot', name: 'קשר אינסוף' },
  { id: 'crystal', name: 'גביש' },
  { id: 'ring', name: 'טבעת' },
  { id: 'spiral', name: 'ספירלה' },
  { id: 'flower', name: 'פרח' },
  { id: 'globe', name: 'גלובוס' },
];

function material(THREE, color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, metalness: 0.45, roughness: 0.35, ...opts });
}

const BUILDERS = {
  heart(THREE, color) {
    const s = new THREE.Shape();
    s.moveTo(0, -0.6);
    s.bezierCurveTo(-1.1, 0.2, -0.55, 1.0, 0, 0.45);
    s.bezierCurveTo(0.55, 1.0, 1.1, 0.2, 0, -0.6);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 3 });
    return new THREE.Mesh(geo, material(THREE, color));
  },
  star(THREE, color) {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 1 : 0.42;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      i === 0 ? s.moveTo(x, y) : s.lineTo(x, y);
    }
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.25, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 });
    return new THREE.Mesh(geo, material(THREE, color));
  },
  knot(THREE, color) {
    return new THREE.Mesh(new THREE.TorusKnotGeometry(0.7, 0.22, 120, 16), material(THREE, color));
  },
  crystal(THREE, color) {
    return new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), material(THREE, color, { flatShading: true }));
  },
  ring(THREE, color) {
    return new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.22, 24, 48), material(THREE, color));
  },
  spiral(THREE, color) {
    const pts = [];
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      const a = t * Math.PI * 6;
      pts.push(new THREE.Vector3(Math.cos(a) * (1 - t * 0.6), Math.sin(a) * (1 - t * 0.6), t * 1.6 - 0.8));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    return new THREE.Mesh(new THREE.TubeGeometry(curve, 140, 0.11, 10), material(THREE, color));
  },
  flower(THREE, color) {
    const g = new THREE.Group();
    const petalGeo = new THREE.SphereGeometry(0.34, 16, 12);
    petalGeo.scale(1, 0.45, 0.25);
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Mesh(petalGeo, material(THREE, color));
      const a = (i / 6) * Math.PI * 2;
      p.position.set(Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0);
      p.rotation.z = a;
      g.add(p);
    }
    const center = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), material(THREE, 0xd4ac0d));
    g.add(center);
    return g;
  },
  globe(THREE, color) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.85, 24, 18),
      material(THREE, color, { transparent: true, opacity: 0.85 })));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.87, 18, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.25 })));
    return g;
  },
};

export function buildLibraryElement(THREE, libId, color) {
  const builder = BUILDERS[libId] || BUILDERS.heart;
  const obj = builder(THREE, new THREE.Color(color || '#d4ac0d'));
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3()).length() || 1;
  obj.scale.multiplyScalar(0.62 / size);
  box.setFromObject(obj);
  obj.position.sub(box.getCenter(new THREE.Vector3()));
  const wrap = new THREE.Group();
  wrap.add(obj);
  return wrap;
}
