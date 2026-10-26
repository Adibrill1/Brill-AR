"use strict";
/* Unified 3D workspace inside the editor: the 2D/3D pill swaps the flat canvas for
   an embedded scene of the same composition (Artivive Bridge pattern: one editor,
   bottom-center 2D/3D toggle). The scene is timeline-linked: it samples the same
   playhead as the 2D canvas (live playback, scrubbed frame, sequence state), and
   gizmo edits on a keyframed element write timeline keys at the frozen playhead
   instead of fighting the keys with base-prop edits. Selection is linked to the
   element list and panel; move arrows drag x/y/z, rotation rings drag rot/rotX/rotY. */
window.Editor3D = (() => {
  let wrapEl, sceneEl, rig, cam, host;
  let getRec, getSelected, onSelect, onChange;
  let sampleEl = null, clockFor = null, freezeAt = null, beginFrame = null, onGate = null, getFrozen = null, restoreFrozen = null;
  let active = false, mounted = false, orb = null, gizmo = null, helper = null;
  let gizmoDrag = null, busy = false, gizmoMode = "move";
  // Two-finger pinch zooms the embedded 3D view (camera dolly, same range as the wheel):
  // the second finger cancels any gizmo drag (persisting it) and takes over until a finger lifts.
  const pinchPtrs = new Map(); // pointerId -> client coords
  let pinch3d = null;          // {d0, z0}
  let toolRow = null;

  function init(opts) {
    wrapEl = opts.wrap; getRec = opts.getRec; getSelected = opts.getSelected;
    onSelect = opts.onSelect; onChange = opts.onChange;
    sampleEl = opts.sampleEl || null; clockFor = opts.clockFor || null;
    freezeAt = opts.freezeAt || null; beginFrame = opts.beginFrame || null; getFrozen = opts.getFrozen || null; restoreFrozen = opts.restoreFrozen || null;
    onGate = opts.onGate || null;
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
        v.setAttribute("playsinline", ""); v.preload = "auto"; v.load();
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
        s.id = "m3-" + el.id; s.setAttribute("src", url); assets.appendChild(s); // a-asset-item reads the src ATTRIBUTE; a .src property is an expando and crashes A-Frame on connect
      }
    }
    if (rec.elements.some((el) => el.type === "video" && el.chroma && el.chroma.enabled)) Studio.ensureChromaComponent();
    sceneEl = document.createElement("a-scene");
    // gltf-model is BOTH a system and a component name; A-Frame's setAttribute override
    // parses against the component schema and mangles the system value. Write the raw
    // attribute so the system schema (decoder paths) sees it at scene init.
    window.HTMLElement.prototype.setAttribute.call(sceneEl, "gltf-model", "dracoDecoderPath: " + Studio.DECODER_DRACO_PATH + "; meshoptDecoderPath: " + Studio.DECODER_MESHOPT_PATH);
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
    // move/rotate tool toggle (Artivive: tool buttons at the top-left of the 3D view)
    toolRow = document.createElement("div");
    toolRow.id = "editor-3d-tools";
    toolRow.style.cssText = "position:absolute;top:8px;inset-inline-start:8px;z-index:6;display:flex;gap:6px";
    for (const [mode, label, tid] of [["move", "↔", "btn-3d-move"], ["rotate", "⟳", "btn-3d-rotate"]]) {
      const b = document.createElement("button");
      b.id = tid; b.type = "button"; b.textContent = label; b.title = mode;
      b.style.cssText = "width:34px;height:34px;border-radius:8px;border:1px solid #b9b4c7;background:rgba(255,255,255,.94);font:600 16px/1 sans-serif;color:#292535;cursor:pointer";
      b.onclick = () => { gizmoMode = mode; syncToolButtons(); refreshGizmo(); };
      toolRow.appendChild(b);
    }
    host.appendChild(toolRow);
    host.appendChild(sceneEl);
    wrapEl.appendChild(host);
    syncToolButtons();
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
    rig.appendChild(artNode); Studio.pushBack(artNode);
  }

  function rebuildElements() {
    const rec = getRec(); if (!rec) return;
    rig.querySelectorAll("[data-el-root]").forEach((n) => n.remove());
    Studio.topLevelElements(rec).forEach((el, idx) => {
      const e = Studio.buildElementEntity(rec, el, idx, "preview", { videoFallback: (x) => {
        // undecodable clips would stall the scene; grey plane instead (same policy as the preview page)
        const f = rec.assets[x.assetId];
        const probe = document.createElement("video");
        return f ? probe.canPlayType(f.type || "video/mp4") === "" : true;
      }, mediaId: (x) => "m3-" + x.id });
      if (!e) return;
      e.setAttribute("data-el-root", el.id);
      stripAnim(e);
      rig.appendChild(e);
      if (e.dataset.opacity) Studio.applyOpacity(e, parseFloat(e.dataset.opacity));
      applySampled(rec, el, e, idx);
    });
    refreshGizmo();
  }

  // ---------- selection highlight + move gizmo (rig-space axes) ----------
  function clearGizmo() {
    if (gizmo) { rig.object3D.remove(gizmo); gizmo.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); gizmo = null; }
    if (helper) { sceneEl.object3D.remove(helper); helper.geometry.dispose(); helper.material.dispose(); helper = null; }
  }

  function elNode(id) { return rig.querySelector('[data-el-root="' + id + '"]'); }

  function hasKeys(el) { return !!(el.timeline && Array.isArray(el.timeline.keys) && el.timeline.keys.length); }

  // Effective on-screen transform: sampled timeline/playhead values when the editor
  // samples them, base props otherwise. Mirrors what the 2D canvas draws.
  function sampledTs(rec, el) {
    const s = sampleEl ? sampleEl(el) : null;
    const eff = s ? Object.assign({}, el, { x: s.x, y: s.y, z: s.z, rot: s.rot }) : el;
    return { ts: Studio.toTargetSpace(rec, eff, el.aspect || 1), s };
  }

  function placementCenter(rec, ts) {
    const g = geomOf(rec); const r = rec.target.artRect;
    const acx = ((r.x + r.w / 2) / Studio.TARGET_W - 0.5) * g.tw;
    const acy = 0.5 - (r.y + r.h / 2) / Studio.TARGET_H;
    return new THREE.Vector3(acx + ts.x, acy + ts.y, ts.z);
  }

  function applySampled(rec, el, node, idx) {
    if (!node || !node.object3D) return;
    const { ts, s } = sampledTs(rec, el);
    node.object3D.position.set(ts.x, ts.y, (ts.z || 0) + (el.flush ? 0 : idx * 0.001));
    node.object3D.rotation.set((el.rotX || 0) * Math.PI / 180, (el.rotY || 0) * Math.PI / 180, ((s ? s.rot : el.rot || 0)) * Math.PI / 180);
    const sc = s ? s.scale : 1;
    node.object3D.scale.set(sc, sc, sc);
    const vis = s ? !!s.visible : true;
    if (node.object3D.visible !== vis) node.object3D.visible = vis;
    const op = s ? s.opacity : (el.opacity == null ? 1 : el.opacity);
    if (node.__op3d !== op) { Studio.applyOpacity(node, op); node.__op3d = op; }
  }

  // Keyframed gizmo edits write keys at the frozen playhead, not base props.
  function keyAt(el, t) {
    let k = el.timeline.keys.find((k) => Math.abs(k.t - t) < 1e-6);
    if (!k) k = Studio.addTimelineKey(el, { t });
    return k;
  }

  // Editing semantics per gizmo part (decided BEFORE the drag starts, so an edit the
  // timeline would silently override is refused with a message instead of silently
  // landing on base props):
  //  - rotX/rotY have no timeline channels anywhere in the editor: base edit, no freeze.
  //  - keyed element: move (x/y/z) and in-plane rotate (rot) write a key at the frozen
  //    playhead - EXCEPT curve-mapped (xyMap) position channels and keyed groups, where
  //    we cannot write safely; those drags are gated with a message.
  //  - unkeyed element: base edit, no freeze.
  // Returns the keyT (rounded 0.1s), or null for base-edit; returns "gate" when the
  // manipulation must be refused.
  function prepareKeyedDrag(el, part) {
    if (part === "rotX" || part === "rotY") return null;
    if (!hasKeys(el) || !clockFor) return null;
    if ((part === "x" || part === "y") && (el.timeline.xyMap || el.type === "group")) return "gate";
    if (part === "z" && el.type === "group") return "gate";
    const keyT = Math.round(clockFor(el) * 10) / 10;
    if (freezeAt) freezeAt(keyT); // freeze exactly ON the key time so the sampled frame equals the key
    return keyT;
  }

  function gateMsg(el) {
    return el.type === "group"
      ? "קבוצה עם נקודות מפתח נערכת בציר הזמן, לא בגרירה ישירה"
      : "אלמנט עם מסלול תנועה נערך בציר הזמן, לא בגרירה ישירה";
  }

  // rotX/rotY have no timeline channels, so on a keyed element a tilt drag is a base
  // edit that applies across the whole timeline - say so BEFORE the drag mutates.
  const TILT_NOTE = "שינוי הטיה הוא ערך בסיס: חל על כל נקודות הזמן של האלמנט";

  // Keep the handles at a usable screen size whatever the element size or zoom:
  // arrows/rings stay inside the viewport even for full-frame media, and touch
  // targets stay grabbable for small stickers. View-only - element data never changes.
  function fitGizmoToView() {
    if (!gizmo || !cam || !sceneEl || !sceneEl.object3D) return;
    const camObj = cam.getObject3D("camera") || sceneEl.camera;
    if (!camObj) return;
    sceneEl.object3D.updateMatrixWorld(true);
    const cw = new THREE.Vector3(); camObj.getWorldPosition(cw);
    const gw = new THREE.Vector3(); gizmo.getWorldPosition(gw);
    const d = Math.max(0.25, cw.distanceTo(gw));
    const base = gizmo.userData.baseL || 0.2;
    const rect = sceneEl.canvas ? sceneEl.canvas.getBoundingClientRect() : null;
    const visH = 2 * d * Math.tan((25 * Math.PI) / 180); // camera fov is 50
    const visW = rect && rect.height ? visH * (rect.width / rect.height) : visH;
    // edge-aware cap: handles must not run off the viewport when the element sits near a side
    const ndc = gw.clone().project(camObj);
    const margin = Math.min((1 - Math.abs(ndc.x)) * visW, (1 - Math.abs(ndc.y)) * visH) / 2;
    const s = Math.max(0.3, Math.min(1.6, Math.min((0.26 * visH) / base, (0.85 * Math.max(margin, 0.05 * visH)) / base)));
    gizmo.scale.setScalar(s);
  }

  function refreshGizmo() {
    clearGizmo();
    const rec = getRec(); if (!rec || !active) return;
    const id = getSelected(); if (!id) return;
    const el = rec.elements.find((x) => x.id === id);
    const node = elNode(id);
    if (!el || !node) return;
    const ts = sampledTs(rec, el).ts;
    const g = geomOf(rec);
    const r = rec.target.artRect;
    const center = placementCenter(rec, ts);
    const acx = center.x - ts.x, acy = center.y - ts.y;
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
    if (gizmoMode === "rotate") {
      const ringProxies = [];
      const mkRing = (axis, color, name, rotEuler) => {
        const mat = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(L * 0.75, 0.02, 10, 48), mat);
        ring.renderOrder = 10001;
        ring.rotation.set(rotEuler[0], rotEuler[1], rotEuler[2]);
        ring.userData = { axis, gizmoPart: name };
        gizmo.add(ring);
        const hitRing = new THREE.Mesh(new THREE.TorusGeometry(L * 0.75, 0.07, 8, 48),
          new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
        hitRing.renderOrder = 10000;
        hitRing.rotation.set(rotEuler[0], rotEuler[1], rotEuler[2]);
        hitRing.userData = { axis, gizmoPart: name, proxy: true };
        ringProxies.push(hitRing); // appended after all rings: gizmo.children[0..2] stay the visible rings
      };
      // rotX: ring in the YZ plane (normal +X); rotY: XZ plane (normal +Y); rot: XY plane (normal +Z)
      mkRing(new THREE.Vector3(1, 0, 0), 0xe03131, "rotX", [0, Math.PI / 2, 0]);
      mkRing(new THREE.Vector3(0, 1, 0), 0x2f9e44, "rotY", [Math.PI / 2, 0, 0]);
      mkRing(new THREE.Vector3(0, 0, 1), 0x1971c2, "rot", [0, 0, 0]);
      ringProxies.forEach((h) => gizmo.add(h));
      gizmo.position.copy(center);
      gizmo.userData.baseL = L * 0.75 + 0.07; // ring radius + tube
      rig.object3D.add(gizmo);
      fitGizmoToView();
      return;
    }
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
      // fat invisible hit proxy: visuals may shrink to fit the view, the grab zone stays
      const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
      const hitCyl = new THREE.Mesh(new THREE.CylinderGeometry(L * 0.09, L * 0.09, L, 6), hitMat);
      hitCyl.position.y = L / 2; hitCyl.userData = { axis, gizmoPart: name, proxy: true };
      const hitTip = new THREE.Mesh(new THREE.SphereGeometry(L * 0.14, 8, 8), hitMat);
      hitTip.position.y = L + 0.03; hitTip.userData = { axis, gizmoPart: name, proxy: true };
      grp.add(hitCyl); grp.add(hitTip);
      gizmo.add(grp);
    };
    mk(new THREE.Vector3(1, 0, 0), 0xe03131, "x");
    mk(new THREE.Vector3(0, 1, 0), 0x2f9e44, "y");
    mk(new THREE.Vector3(0, 0, 1), 0x1971c2, "z");
    // Curved double-headed rotation arrows, always visible next to the straight move arrows (no mode switch needed).
    // Each arc sits between two move axes so it never overlaps a shaft; the fat invisible arc is the touch target.
    const mkArc = (axis, color, name, groupEuler, start, span, R, pos) => {
      const end = start + span; // arcs are offset from the move shafts so none projects onto a shaft in the front view
      const pivot = new THREE.Group();
      pivot.rotation.set(groupEuler[0], groupEuler[1], groupEuler[2]); pivot.position.set(pos[0], pos[1], pos[2]);
      pivot.userData = { axis, gizmoPart: name, arc: true, start, span };
      const mat = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95, side: THREE.DoubleSide });
      const arc = new THREE.Mesh(new THREE.TorusGeometry(R, 0.011, 8, 24, span), mat);
      arc.rotation.z = start; arc.renderOrder = 10001; arc.userData = { axis, gizmoPart: name, arc: true };
      const head = (ang, flip) => {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 12), mat);
        c.position.set(R * Math.cos(ang), R * Math.sin(ang), 0);
        c.rotation.z = flip ? ang + Math.PI : ang; c.renderOrder = 10001; c.userData = { axis, gizmoPart: name, arc: true };
        return c;
      };
      const hit = new THREE.Mesh(new THREE.TorusGeometry(R, L * 0.34, 6, 24, span),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      hit.rotation.z = start; hit.userData = { axis, gizmoPart: name, arc: true, proxy: true };
      pivot.add(arc, head(end, false), head(start, true), hit);
      gizmo.add(pivot);
    };
    // rot: XY plane (about Z) between +X and +Y; rotX: YZ plane between +Y and +Z; rotY: XZ plane between +Z and +X
    // rot (about Z): XY plane, in the +X/+Y quadrant. rotX: circle about X centred on the -X side. rotY: circle about Y centred on the -Y side.
    mkArc(new THREE.Vector3(0, 0, 1), 0x1971c2, "rot", [0, 0, 0], Math.PI * 2 / 18, Math.PI * 5 / 18, L * 0.85, [0, 0, 0]);
    mkArc(new THREE.Vector3(1, 0, 0), 0xe03131, "rotX", [0, Math.PI / 2, 0], Math.PI * 100 / 180, Math.PI * 80 / 180, L * 0.5, [-L * 0.6, 0, 0]);
    mkArc(new THREE.Vector3(0, 1, 0), 0x2f9e44, "rotY", [Math.PI / 2, 0, 0], Math.PI * 10 / 180, Math.PI * 70 / 180, L * 0.5, [0, -L * 0.6, 0]);
    gizmo.position.copy(center);
    gizmo.userData.baseL = L + 0.06; // shaft + cone tip
    rig.object3D.add(gizmo);
    fitGizmoToView();
  }

  function syncToolButtons() {
    if (!toolRow) return;
    toolRow.querySelector("#btn-3d-move").style.background = gizmoMode === "move" ? "#292535" : "rgba(255,255,255,.94)";
    toolRow.querySelector("#btn-3d-move").style.color = gizmoMode === "move" ? "#fff" : "#292535";
    toolRow.querySelector("#btn-3d-rotate").style.background = gizmoMode === "rotate" ? "#292535" : "rgba(255,255,255,.94)";
    toolRow.querySelector("#btn-3d-rotate").style.color = gizmoMode === "rotate" ? "#fff" : "#292535";
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
      e.preventDefault(); // zoom the 3D view, never scroll the page under the cursor
      const p = cam.getAttribute("position");
      p.z = Math.max(0.5, Math.min(2.4, p.z + e.deltaY * 0.001));
      cam.setAttribute("position", p);
      fitGizmoToView();
    }, { passive: false });
  }

  function down(e) {
    pinchPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinchPtrs.size === 2) {
      // A two-finger gesture must never edit the scene: roll back whatever the first finger's
      // gizmo drag moved (base props or a just-created key) before it can persist, then zoom.
      if (gizmoDrag) {
        const gd = gizmoDrag; gizmoDrag = null;
        const r = getRec();
        if (gd.snap && r) { r.elements = JSON.parse(gd.snap); rebuildElements(); refreshGizmo(); if (restoreFrozen) restoreFrozen(gd.snapT); }
      }
      orb = null;
      const [a, b] = [...pinchPtrs.values()];
      pinch3d = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: cam.getAttribute("position").z };
      if (sceneEl.canvas.setPointerCapture) try { sceneEl.canvas.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault(); e.stopPropagation();
      return;
    }
    if (!active) return;
    const rec = getRec(); if (!rec) return;
    const ray = rayFromEvent(e);
    // gizmo handles first
    if (gizmo) {
      let hits = ray.intersectObjects(gizmo.children, true);
      if (hits.length) {
        const exact = hits.filter((h) => !h.object.userData.proxy);
        if (exact.length) hits = exact;
        let o = hits[0].object;
        while (o && !o.userData.gizmoPart) o = o.parent;
        if (o && o.userData.gizmoPart.startsWith("rot")) {
          const el = rec.elements.find((x) => x.id === getSelected());
          const lr = localRay(ray);
          const axis = o.userData.axis.clone();
          const center = gizmo.position.clone();
          const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(axis, center);
          const hit = new THREE.Vector3();
          // Tilt (rotX/rotY) planes are nearly edge-on in the front view: a ray-plane angle is then wildly unstable
          // (or misses), so those drags use screen distance instead (0.5 deg/px; rotX vertical, rotY horizontal).
          const screenMode = o.userData.arc && (o.userData.gizmoPart === "rotX" || o.userData.gizmoPart === "rotY") && (Math.abs(axis.dot(lr.direction)) < 0.3 || !lr.intersectPlane(plane, hit));
          if (!screenMode && !lr.intersectPlane(plane, hit)) return;
          const angleOf = (p) => {
            const v = p.clone().sub(center);
            if (axis.z) return Math.atan2(v.y, v.x);
            if (axis.x) return Math.atan2(v.z, v.y);
            return Math.atan2(v.x, v.z);
          };
          const frozen0 = getFrozen ? getFrozen() : null;
          const keyT = prepareKeyedDrag(el, o.userData.gizmoPart);
          if (keyT === "gate") { if (onGate) onGate(gateMsg(el)); e.preventDefault(); e.stopPropagation(); return; }
          if ((o.userData.gizmoPart === "rotX" || o.userData.gizmoPart === "rotY") && hasKeys(el) && onGate) onGate(TILT_NOTE);
          const rot0 = (keyT != null && o.userData.gizmoPart === "rot" && sampleEl) ? sampleEl(el).rot : el.rot || 0;
          gizmoDrag = { id: e.pointerId, el, axis, plane, angleOf, a0: screenMode ? 0 : angleOf(hit), screen: screenMode ? { x: e.clientX, y: e.clientY } : null, rot0, rotX0: el.rotX || 0, rotY0: el.rotY || 0, part: o.userData.gizmoPart, keyT, snap: JSON.stringify(rec.elements), snapT: frozen0 };
          if (sceneEl.canvas.setPointerCapture) sceneEl.canvas.setPointerCapture(e.pointerId);
          e.preventDefault(); e.stopPropagation();
          return;
        }
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
          const frozen0 = getFrozen ? getFrozen() : null;
          const keyT = prepareKeyedDrag(el, o.userData.gizmoPart);
          if (keyT === "gate") { if (onGate) onGate(gateMsg(el)); e.preventDefault(); e.stopPropagation(); return; }
          const s0 = (keyT != null && sampleEl) ? sampleEl(el) : null;
          gizmoDrag = { id: e.pointerId, el, axis, plane, start: hit.clone(), x0: s0 ? s0.x : el.x || 0, y0: s0 ? s0.y : el.y || 0, z0: s0 ? s0.z : el.z || 0, keyT, snap: JSON.stringify(rec.elements), snapT: frozen0 };
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
    if (pinchPtrs.has(e.pointerId)) pinchPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch3d) {
      if (pinchPtrs.size >= 2) {
        const [a, b] = [...pinchPtrs.values()];
        const d1 = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const p = cam.getAttribute("position");
        p.z = Math.max(0.5, Math.min(2.4, pinch3d.z0 * pinch3d.d0 / d1)); // spread = closer, pinch = farther
        cam.setAttribute("position", p);
        fitGizmoToView();
      }
      e.preventDefault();
      return;
    }
    if (gizmoDrag && e.pointerId === gizmoDrag.id && gizmoDrag.part) {
      const rec = getRec(); if (!rec) return;
      const lr = localRay(rayFromEvent(e));
      const hit = new THREE.Vector3();
      let deg;
      if (gizmoDrag.screen) deg = (gizmoDrag.part === "rotX" ? (e.clientY - gizmoDrag.screen.y) : (e.clientX - gizmoDrag.screen.x)) * 0.5;
      else {
        if (!lr.intersectPlane(gizmoDrag.plane, hit)) return;
        deg = (gizmoDrag.angleOf(hit) - gizmoDrag.a0) * 180 / Math.PI;
      }
      const el = gizmoDrag.el, key = gizmoDrag.part;
      const val = Math.round(((key === "rot" ? gizmoDrag.rot0 : key === "rotX" ? gizmoDrag.rotX0 : gizmoDrag.rotY0) + deg) * 10) / 10;
      if (key === "rot" && gizmoDrag.keyT != null) {
        keyAt(el, gizmoDrag.keyT).rot = val; // timeline key at the frozen playhead; the sampler renders it
      } else {
        el[key] = val;
        const node = elNode(el.id);
        if (node) node.setAttribute("rotation", `${el.rotX || 0} ${el.rotY || 0} ${el.rot || 0}`);
      }
      refreshGizmo();
      e.preventDefault();
      return;
    }
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
      if (gizmoDrag.keyT != null && el.type !== "group") {
        Object.assign(keyAt(el, gizmoDrag.keyT), patch); // timeline key at the frozen playhead; the sampler renders it
      } else {
        if (el.type === "group") Studio.transformGroup(rec, el, patch); else Object.assign(el, patch);
        // live-update the entity transform without a rebuild
        const node = elNode(el.id);
        if (node) {
          const ts = Studio.toTargetSpace(rec, el, el.aspect || 1);
          const idx = Studio.topLevelElements(rec).indexOf(el);
          node.setAttribute("position", `${ts.x} ${ts.y} ${(ts.z || 0) + (el.flush ? 0 : idx * 0.001)}`);
        }
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
      fitGizmoToView();
      orb = { x: e.clientX, y: e.clientY };
    }
  }

  function up(e) {
    if (e && pinchPtrs.has(e.pointerId)) { pinchPtrs.delete(e.pointerId); if (pinch3d && pinchPtrs.size < 2) pinch3d = null; }
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
      cancelAnimationFrame(sampleRaf); sampleRaf = requestAnimationFrame(sampleLoop);
    } finally { busy = false; }
  }

  function hide() {
    active = false;
    cancelAnimationFrame(sampleRaf);
    if (host) host.style.display = "none";
    const c = wrapEl && wrapEl.querySelector("#preview");
    if (c) c.style.visibility = "visible";
    clearGizmo();
  }

  // Timeline linkage: every frame, mirror the 2D canvas's sampled world into the 3D
  // scene (live playback, frozen playhead, sequence state) and keep the gizmo on it.
  let sampleRaf = 0;
  function sampleLoop() {
    if (!active) return;
    const rec = getRec();
    if (rec && sampleEl) {
      if (beginFrame) beginFrame();
      Studio.topLevelElements(rec).forEach((el, idx) => applySampled(rec, el, elNode(el.id), idx));
      const selId = getSelected && getSelected();
      if (gizmo && selId && !gizmoDrag) {
        const el = rec.elements.find((x) => x.id === selId);
        const node = el && elNode(selId);
        if (el && node) {
          const { ts } = sampledTs(rec, el);
          gizmo.position.copy(placementCenter(rec, ts));
          if (helper) {
            const centerWorld = gizmo.position.clone().applyMatrix4(rig.object3D.matrixWorld);
            const q = new THREE.Quaternion(); rig.object3D.getWorldQuaternion(q);
            const geo = node.getAttribute("geometry") || {};
            const half = new THREE.Vector3(Math.max(geo.width || ts.w, 0.03) / 2, Math.max(geo.height || ts.h, 0.03) / 2, 0.012);
            const box = new THREE.Box3();
            for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1])
              box.expandByPoint(new THREE.Vector3(half.x * sx, half.y * sy, half.z * sz).applyQuaternion(q).add(centerWorld));
            helper.box.copy(box);
          }
        }
      }
    }
    sampleRaf = requestAnimationFrame(sampleLoop);
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

  return { init, show, hide, sync, isActive: () => active, refreshGizmo, _test: { gizmo: () => gizmo, node: (id) => elNode(id), scene: () => sceneEl, helper: () => helper, drag: () => gizmoDrag } };
})();
