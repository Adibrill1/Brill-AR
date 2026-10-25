"use strict";
/* Unified 3D workspace inside the editor: the 2D/3D pill swaps the flat canvas for
   an embedded scene of the same composition (Artivive Bridge pattern: one editor,
   bottom-center 2D/3D toggle). Static arrangement view like the camera edit mode:
   no animations, everything visible. Selection is linked to the element list and
   panel; a move gizmo (axis arrows) drags the selected element in x/y/z. */
window.Editor3D = (() => {
  let wrapEl, sceneEl, rig, cam, host;
  let getRec, getSelected, onSelect, onChange;
  let active = false, mounted = false, orb = null, gizmo = null, helper = null;
  let gizmoDrag = null, busy = false;

  function init(opts) {
    wrapEl = opts.wrap; getRec = opts.getRec; getSelected = opts.getSelected;
    onSelect = opts.onSelect; onChange = opts.onChange;
  }

  function geomOf(rec) { return Studio.geom(rec); }

  async function mount() {
    if (mounted) return;
    const rec = getRec(); if (!rec || !rec.target) return;
    host = document.createElement("div");
    host.id = "editor-3d-host";
    host.style.cssText = "position:absolute;inset:0;z-index:4;background:#d9dde3;touch-action:none";
    const assets = document.createElement("div");
    assets.hidden = true; assets.id = "editor-3d-media";
    host.appendChild(assets);
    for (const el of rec.elements) {
      if (!el.assetId || !rec.assets[el.assetId]) continue;
      const url = URL.createObjectURL(rec.assets[el.assetId]);
      if (el.type === "video") {
        const v = document.createElement("video");
        v.id = "m3-" + el.id; v.src = url; v.muted = true; v.loop = el.loop !== false;
        v.setAttribute("playsinline", ""); v.preload = "auto";
        assets.appendChild(v);
      } else if (el.type === "image") {
        const mm = await Studio.makeImageMedia(rec.assets[el.assetId], "m3-" + el.id, () => null);
        mm.node.id = "m3-" + el.id; assets.appendChild(mm.node);
      } else if (el.type === "sound") {
        const a = document.createElement("audio");
        a.id = "m3-" + el.id; a.src = url; a.preload = "auto";
        assets.appendChild(a);
      } else if (el.type === "model") {
        const s = document.createElement("a-asset-item");
        s.id = "m3-" + el.id; s.src = url; assets.appendChild(s);
      }
    }
    sceneEl = document.createElement("a-scene");
    sceneEl.setAttribute("embedded", "");
    sceneEl.setAttribute("renderer", "colorManagement:true");
    sceneEl.setAttribute("vr-mode-ui", "enabled: false");
    sceneEl.setAttribute("device-orientation-permission-ui", "enabled: false");
    sceneEl.style.position = "absolute"; sceneEl.style.inset = "0";
    const l1 = document.createElement("a-light");
    l1.setAttribute("type", "directional"); l1.setAttribute("intensity", "0.6"); l1.setAttribute("position", "1 1 1");
    const l2 = document.createElement("a-light");
    l2.setAttribute("type", "ambient"); l2.setAttribute("intensity", "1.1");
    sceneEl.appendChild(l1); sceneEl.appendChild(l2);
    rig = document.createElement("a-entity"); rig.setAttribute("id", "editor-3d-rig");
    sceneEl.appendChild(rig);
    cam = document.createElement("a-entity");
    cam.setAttribute("camera", "fov: 50");
    cam.setAttribute("position", "0 0 1.15");
    sceneEl.appendChild(cam);
    host.appendChild(sceneEl);
    wrapEl.appendChild(host);
    // headless Chrome can leave a dynamically created scene paused
    const kick = () => { try { sceneEl.play(); } catch (e) {} };
    kick(); setTimeout(kick, 600); setTimeout(kick, 2000);
    mounted = true;
    rebuildArtwork();
    rebuildElements();
    bindPointer();
  }

  function stripAnim(root) {
    [root, ...root.querySelectorAll("[animation__spin],[animation__float],[animation__pulse],[model-clips]")].forEach((n) => {
      n.removeAttribute("animation__spin"); n.removeAttribute("animation__float");
      n.removeAttribute("animation__pulse"); n.removeAttribute("model-clips");
    });
    root.querySelectorAll("[data-el-id]").forEach((n) => { n.object3D.visible = true; });
    root.object3D.visible = true;
  }

  let artNode = null;
  async function rebuildArtwork() {
    const rec = getRec(); if (!rec || !rec.target || !rec.assets.__artwork) return;
    if (artNode) { artNode.remove(); artNode = null; }
    const g = geomOf(rec), r = rec.target.artRect;
    const url = URL.createObjectURL(rec.assets.__artwork);
    const img = await Studio.loadImage(url);
    img.id = "editor-3d-artwork";
    host.querySelector("#editor-3d-media").appendChild(img);
    artNode = document.createElement("a-plane");
    artNode.setAttribute("material", { src: "#editor-3d-artwork", shader: "flat" });
    artNode.setAttribute("width", g.artW); artNode.setAttribute("height", g.artH);
    const acx = ((r.x + r.w / 2) / Studio.TARGET_W - 0.5) * g.tw;
    const acy = 0.5 - (r.y + r.h / 2) / Studio.TARGET_H;
    artNode.setAttribute("position", `${acx} ${acy} 0`);
    rig.appendChild(artNode);
  }

  function rebuildElements() {
    const rec = getRec(); if (!rec) return;
    rig.querySelectorAll("[data-el-root]").forEach((n) => n.remove());
    Studio.topLevelElements(rec).forEach((el, idx) => {
      const e = Studio.buildElementEntity(rec, el, idx, "preview", { videoFallback: (x) => !!(x.chroma && x.chroma.enabled) });
      if (!e) return;
      // buildElementEntity uses #m-<id> media ids; point them at our local copies
      e.querySelectorAll("[src]").forEach((n) => {
        const s = n.getAttribute("src");
        if (typeof s === "string" && s.startsWith("#m-")) n.setAttribute("src", "#m3-" + s.slice(3));
      });
      e.querySelectorAll("[gltf-model]").forEach((n) => {
        const s = n.getAttribute("gltf-model");
        if (typeof s === "string" && s.startsWith("#m-")) n.setAttribute("gltf-model", "#m3-" + s.slice(3));
      });
      e.setAttribute("data-el-root", el.id);
      stripAnim(e);
      rig.appendChild(e);
      if (e.dataset.opacity) Studio.applyOpacity(e, parseFloat(e.dataset.opacity));
    });
    refreshGizmo();
  }

  // ---------- selection highlight + move gizmo (rig-space axes) ----------
  function clearGizmo() {
    if (gizmo) { rig.object3D.remove(gizmo); gizmo.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); gizmo = null; }
    if (helper) { sceneEl.object3D.remove(helper); helper.geometry.dispose(); helper.material.dispose(); helper = null; }
  }

  function elNode(id) { return rig.querySelector('[data-el-root="' + id + '"]'); }

  function refreshGizmo() {
    clearGizmo();
    const rec = getRec(); if (!rec || !active) return;
    const id = getSelected(); if (!id) return;
    const el = rec.elements.find((x) => x.id === id);
    const node = elNode(id);
    if (!el || !node) return;
    const ts = Studio.toTargetSpace(rec, el, el.aspect || 1);
    const g = geomOf(rec);
    const r = rec.target.artRect;
    const acx = ((r.x + r.w / 2) / Studio.TARGET_W - 0.5) * g.tw;
    const acy = 0.5 - (r.y + r.h / 2) / Studio.TARGET_H;
    const center = new THREE.Vector3(acx + ts.x, acy + ts.y, ts.z);
    // Selection box from the known element geometry (rig-local -> world): the DOM
    // node's object3D lags attribute writes, so setFromObject would misplace or
    // empty the box right after edits/rebuilds.
    sceneEl.object3D.updateMatrixWorld(true);
    const centerWorld = center.clone().applyMatrix4(rig.object3D.matrixWorld);
    const q = new THREE.Quaternion(); rig.object3D.getWorldQuaternion(q);
    const geo = node.getAttribute("geometry") || {};
    const boxW = geo.width || ts.w, boxH = geo.height || ts.h;
    const half = new THREE.Vector3(Math.max(boxW, 0.03) / 2, Math.max(boxH, 0.03) / 2, 0.012);
    const box = new THREE.Box3();
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1])
      box.expandByPoint(new THREE.Vector3(half.x * sx, half.y * sy, half.z * sz).applyQuaternion(q).add(centerWorld));
    helper = new THREE.Box3Helper(box, 0xff8800);
    helper.material.depthTest = false; helper.renderOrder = 10000;
    sceneEl.object3D.add(helper);

    const L = Math.max(ts.w, ts.h, 0.12) * 0.9;
    gizmo = new THREE.Group();
    gizmo.name = "editor-3d-gizmo";
    const mk = (axis, color, name) => {
      const grp = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 });
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, L, 8), mat);
      cyl.position.y = L / 2;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 12), mat);
      tip.position.y = L + 0.03;
      grp.add(cyl); grp.add(tip);
      grp.renderOrder = 10001;
      // +Y built; rotate into the axis direction
      if (name === "x") grp.rotation.z = -Math.PI / 2;
      if (name === "z") grp.rotation.x = Math.PI / 2;
      grp.userData.axis = axis; grp.userData.gizmoPart = name;
      cyl.userData = { axis, gizmoPart: name }; tip.userData = { axis, gizmoPart: name };
      gizmo.add(grp);
    };
    mk(new THREE.Vector3(1, 0, 0), 0xe03131, "x");
    mk(new THREE.Vector3(0, 1, 0), 0x2f9e44, "y");
    mk(new THREE.Vector3(0, 0, 1), 0x1971c2, "z");
    gizmo.position.copy(center);
    rig.object3D.add(gizmo);
  }

  function rayFromEvent(e) {
    const rect = sceneEl.canvas.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), cam.getObject3D("camera") || sceneEl.camera);
    return ray;
  }

  function localRay(ray) {
    // express the ray in rig-local space
    const inv = new THREE.Matrix4().copy(rig.object3D.matrixWorld).invert();
    const o = ray.ray.origin.clone().applyMatrix4(inv);
    const d = ray.ray.direction.clone().transformDirection(inv);
    return new THREE.Ray(o, d);
  }

  function bindPointer() {
    const bind = () => {
      if (!sceneEl.canvas || sceneEl.canvas._editor3dBound) return;
      sceneEl.canvas._editor3dBound = true;
      sceneEl.canvas.style.touchAction = "none";
      sceneEl.canvas.addEventListener("pointerdown", down);
      sceneEl.canvas.addEventListener("pointermove", move);
      sceneEl.canvas.addEventListener("pointerup", up);
      sceneEl.canvas.addEventListener("pointercancel", up);
    };
    bind(); sceneEl.addEventListener("renderstart", bind); sceneEl.addEventListener("loaded", bind);
    sceneEl.addEventListener("wheel", (e) => {
      const p = cam.getAttribute("position");
      p.z = Math.max(0.5, Math.min(2.4, p.z + e.deltaY * 0.001));
      cam.setAttribute("position", p);
    }, { passive: true });
  }

  function down(e) {
    if (!active) return;
    const rec = getRec(); if (!rec) return;
    const ray = rayFromEvent(e);
    // gizmo handles first
    if (gizmo) {
      const hits = ray.intersectObjects(gizmo.children, true);
      if (hits.length) {
        let o = hits[0].object;
        while (o && !o.userData.gizmoPart) o = o.parent;
        if (o) {
          const el = rec.elements.find((x) => x.id === getSelected());
          const lr = localRay(ray);
          const axis = o.userData.axis.clone();
          const center = gizmo.position.clone();
          const camDir = new THREE.Vector3(); cam.getObject3D("camera") ? cam.getObject3D("camera").getWorldDirection(camDir) : camDir.set(0, 0, -1);
          const inv = new THREE.Matrix4().copy(rig.object3D.matrixWorld).invert();
          camDir.transformDirection(inv);
          // drag plane: contains the axis, faces the camera
          const normal = new THREE.Vector3().crossVectors(axis, new THREE.Vector3().crossVectors(camDir, axis)).normalize();
          const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, center);
          const hit = new THREE.Vector3();
          if (!lr.intersectPlane(plane, hit)) return;
          gizmoDrag = { id: e.pointerId, el, axis, plane, start: hit.clone(), x0: el.x || 0, y0: el.y || 0, z0: el.z || 0 };
          if (sceneEl.canvas.setPointerCapture) sceneEl.canvas.setPointerCapture(e.pointerId);
          e.preventDefault(); e.stopPropagation();
          return;
        }
      }
    }
    // element picking
    const targets = [];
    rig.querySelectorAll("[data-el-root]").forEach((n) => targets.push(n.object3D));
    const hits = ray.intersectObjects(targets, true);
    if (hits.length) {
      let o = hits[0].object;
      while (o && !(o.el && o.el.getAttribute && o.el.getAttribute("data-el-root"))) o = o.parent;
      if (o && o.el) { onSelect(o.el.getAttribute("data-el-root")); e.preventDefault(); return; }
    }
    // empty space: orbit
    orb = { x: e.clientX, y: e.clientY };
  }

  function move(e) {
    if (gizmoDrag && e.pointerId === gizmoDrag.id) {
      const rec = getRec(); if (!rec) return;
      const lr = localRay(rayFromEvent(e));
      const hit = new THREE.Vector3();
      if (!lr.intersectPlane(gizmoDrag.plane, hit)) return;
      const d = hit.sub(gizmoDrag.start).dot(gizmoDrag.axis);
      const g = geomOf(rec);
      const el = gizmoDrag.el;
      const ax = gizmoDrag.axis;
      const patch = {};
      if (Math.abs(ax.x) > 0.5) patch.x = Math.min(2, Math.max(-2, gizmoDrag.x0 + d / g.artW));
      if (Math.abs(ax.y) > 0.5) patch.y = Math.min(2, Math.max(-2, gizmoDrag.y0 + d / g.artH));
      if (Math.abs(ax.z) > 0.5) patch.z = Math.min(2, Math.max(-0.5, gizmoDrag.z0 + d));
      if (el.type === "group") Studio.transformGroup(rec, el, patch); else Object.assign(el, patch);
      // live-update the entity transform without a rebuild
      const node = elNode(el.id);
      if (node) {
        const ts = Studio.toTargetSpace(rec, el, el.aspect || 1);
        const idx = Studio.topLevelElements(rec).indexOf(el);
        node.setAttribute("position", `${ts.x} ${ts.y} ${(ts.z || 0) + idx * 0.001}`);
      }
      refreshGizmo();
      e.preventDefault();
      return;
    }
    if (orb) {
      const rot = rig.getAttribute("rotation");
      rot.y += (e.clientX - orb.x) * 0.25;
      rot.x = Math.max(-35, Math.min(35, rot.x + (e.clientY - orb.y) * 0.25));
      rig.setAttribute("rotation", rot);
      orb = { x: e.clientX, y: e.clientY };
    }
  }

  function up() {
    if (gizmoDrag) { gizmoDrag = null; onChange(); }
    orb = null;
  }

  function layout() {
    if (!host) return;
    const c = wrapEl.querySelector("#preview");
    const h = c && c.style.height ? parseFloat(c.style.height) : wrapEl.clientHeight;
    wrapEl.style.minHeight = (h || 320) + "px";
  }

  async function show() {
    if (busy) return; busy = true;
    try {
      const rec = getRec(); if (!rec || !rec.target) return;
      wrapEl.style.position = "relative";
      await mount();
      layout();
      wrapEl.querySelector("#preview").style.visibility = "hidden";
      host.style.display = "block";
      active = true;
      refreshGizmo();
    } finally { busy = false; }
  }

  function hide() {
    active = false;
    if (host) host.style.display = "none";
    const c = wrapEl && wrapEl.querySelector("#preview");
    if (c) c.style.visibility = "visible";
    clearGizmo();
  }

  let syncTimer = null, lastSync = 0;
  function sync() {
    // composition changed underneath us; throttled because draw() fires on rAF too
    if (!mounted || !active || gizmoDrag) return;
    const now = Date.now();
    if (now - lastSync < 250) { clearTimeout(syncTimer); syncTimer = setTimeout(sync, 260); return; }
    lastSync = now;
    rebuildArtwork().then(rebuildElements);
  }

  return { init, show, hide, sync, isActive: () => active, refreshGizmo, _test: { gizmo: () => gizmo, node: (id) => elNode(id), scene: () => sceneEl, helper: () => helper } };
})();
