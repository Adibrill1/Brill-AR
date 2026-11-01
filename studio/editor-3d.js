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
  // "3d": the full 3D workspace (gizmo, orbit). "2d": the same scene as a transparent layer over the flat 2D canvas,
  // framed by an orthographic camera to match it pixel for pixel, drawing in their final look only the layers the
  // canvas cannot (3D models, particles, green-screen video). The canvas keeps every touch and draws the rest.
  let mode = "3d", ortho = null, getView2d = null, rigRot3d = null;
  // a layer tilted on the other axes (rotX/rotY) is one too: the flat canvas can only turn it in its own plane
  function overlayType(el) { return !!el && (el.type === "model" || el.type === "particles" || (el.type === "video" && !!(el.chroma && el.chroma.enabled)) || (el.type !== "sound" && el.type !== "group" && !!(el.rotX || el.rotY))); }

  function init(opts) {
    wrapEl = opts.wrap; getRec = opts.getRec; getSelected = opts.getSelected;
    onSelect = opts.onSelect; onChange = opts.onChange;
    sampleEl = opts.sampleEl || null; clockFor = opts.clockFor || null;
    freezeAt = opts.freezeAt || null; beginFrame = opts.beginFrame || null; getFrozen = opts.getFrozen || null; restoreFrozen = opts.restoreFrozen || null;
    onGate = opts.onGate || null; getView2d = opts.getView2d || null;
  }

  function geomOf(rec) { return Studio.geom(rec); }

  // Media nodes for every element, created once per exact asset blob. Elements added or re-assetted
  // after the first mount used to get no node (the entity then rendered as a blank white plane).
  async function ensureMedia(rec) {
    const assets = host && host.querySelector("#editor-3d-media"); if (!assets) return;
    for (const el of rec.elements) {
      if (!el.assetId || !rec.assets[el.assetId]) continue;
      const blob = rec.assets[el.assetId], mid = "m3-" + el.id;
      const old = assets.querySelector('[id="' + mid + '"]');
      if (old && old.__blob === blob) continue; // already registered for this exact asset
      if (old) { try { if (old.src && old.src.startsWith("blob:")) URL.revokeObjectURL(old.src); } catch (e) {} old.remove(); }
      const url = URL.createObjectURL(blob), before = assets.lastElementChild;
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
      const made = assets.querySelector('[id="' + mid + '"]'); if (made) made.__blob = blob;
    }
  }

  async function mount() {
    if (mounted) return;
    const rec = getRec(); if (!rec || !rec.target) return;
    host = document.createElement("div");
    host.id = "editor-3d-host";
    host.style.cssText = "position:absolute;inset:0;z-index:4;background:#d9dde3;touch-action:none";
    const assets = document.createElement("div");
    assets.hidden = true; assets.id = "editor-3d-media";
    host.appendChild(assets);
    await ensureMedia(rec);
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
    l1.setAttribute("type", "directional"); l1.setAttribute("intensity", "0.5"); l1.setAttribute("position", "1 1 1"); // same lights as the experience (player.js, previewer.js)
    const l2 = document.createElement("a-light");
    l2.setAttribute("type", "ambient"); l2.setAttribute("intensity", "1");
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
    toolRow.style.cssText = "position:absolute;top:8px;left:8px;z-index:6;display:flex;flex-direction:column;gap:6px";
    const toggleRow = document.createElement("div"); toggleRow.style.cssText = "display:flex;gap:6px"; toolRow.appendChild(toggleRow);
    for (const [mode, label, tid] of [["move", "↔", "btn-3d-move"], ["rotate", "⟳", "btn-3d-rotate"]]) {
      const b = document.createElement("button");
      b.id = tid; b.type = "button"; b.textContent = label; b.title = mode;
      b.style.cssText = "width:34px;height:34px;border-radius:8px;border:1px solid #b9b4c7;background:rgba(255,255,255,.94);font:600 16px/1 sans-serif;color:#292535;cursor:pointer";
      b.onclick = () => { gizmoMode = mode; syncToolButtons(); refreshGizmo(); };
      toggleRow.appendChild(b);
    }
    // Screen-space rotation buttons (curved arrows): fixed size, always inside the view, docked beside the move/rotate toggle
    // in the screen corner farthest from the selected element, so they never sit on top of the 3D handles.
    const ROT_BTNS = [["rot", "⟳", "#1971c2", "btn-rot-z", "סיבוב"], ["rotX", "⤾", "#e03131", "btn-rot-x", "הטיה אנכית"], ["rotY", "⤿", "#2f9e44", "btn-rot-y", "הטיה אופקית"]];
    for (const [part, glyph, color, tid, title] of ROT_BTNS) {
      const b = document.createElement("button");
      b.id = tid; b.type = "button"; b.textContent = glyph; b.title = title; b.dataset.part = part;
      b.style.cssText = "width:44px;height:44px;border-radius:50%;border:2px solid " + color + ";background:rgba(255,255,255,.96);color:" + color + ";font:700 24px/1 sans-serif;cursor:grab;touch-action:none;padding:0";
      b.addEventListener("pointerdown", (e) => startScreenRotate(part, e, b));
      b.addEventListener("pointermove", (e) => { if (gizmoDrag && gizmoDrag.id === e.pointerId) move(e); });
      b.addEventListener("pointerup", (e) => { if (gizmoDrag && gizmoDrag.id === e.pointerId) up(e); });
      b.addEventListener("pointercancel", (e) => { if (gizmoDrag && gizmoDrag.id === e.pointerId) up(e); });
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

  // Preset motions (spin/float/pulse) come from the sampler every frame instead; a model's own animation keeps playing,
  // so the editor shows the model as it will move in the experience.
  function stripAnim(root) {
    [root, ...root.querySelectorAll("[animation__spin],[animation__float],[animation__pulse]")].forEach((n) => {
      n.removeAttribute("animation__spin"); n.removeAttribute("animation__float");
      n.removeAttribute("animation__pulse");
    });
    root.querySelectorAll("[data-el-id]").forEach((n) => { n.object3D.visible = true; });
    root.object3D.visible = true;
  }

  // The artwork plane is rebuilt only when the artwork itself (blob or target rect) changes. It used to be removed on
  // every edit and re-added after the image reloaded, so the artwork vanished for a moment each time; now a replacement
  // is built next to the old plane, which goes only once the new texture is on screen.
  let artNode = null, artSerial = 0;
  async function rebuildArtwork() {
    const rec = getRec(); if (!rec || !rec.target || !rec.assets.__artwork) return;
    const blob = rec.assets.__artwork, key = JSON.stringify(rec.target.artRect);
    if (artNode && artNode.__blob === blob && artNode.__key === key) return;
    const g = geomOf(rec), r = rec.target.artRect;
    const url = URL.createObjectURL(blob);
    const img = await Studio.loadImage(url);
    if (!host || !rig) return;
    img.id = "editor-3d-artwork-" + (++artSerial);
    host.querySelector("#editor-3d-media").appendChild(img);
    const node = document.createElement("a-plane");
    node.__blob = blob; node.__key = key;
    node.setAttribute("material", { src: "#" + img.id, shader: "flat" });
    node.setAttribute("width", g.artW); node.setAttribute("height", g.artH);
    const acx = ((r.x + r.w / 2) / Studio.TARGET_W - 0.5) * g.tw;
    const acy = 0.5 - (r.y + r.h / 2) / Studio.TARGET_H;
    node.setAttribute("position", `${acx} ${acy} 0`);
    const old = artNode; artNode = node;
    rig.appendChild(node); Studio.pushBack(node);
    if (old) {
      let gone = false;
      const drop = () => { if (gone) return; gone = true; const oi = old.__img; old.remove(); if (oi) { try { URL.revokeObjectURL(oi.src); } catch (e) {} oi.remove(); } };
      node.addEventListener("materialtextureloaded", drop, { once: true }); setTimeout(drop, 1500);
    }
    node.__img = img;
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

  // toTargetSpace already places the layer in target space (artwork offset included), exactly where applySampled puts
  // its node. Adding the artwork centre again put the handles beside the layer on any artwork that does not fill the
  // 3:4 target (a square picture, for one).
  function placementCenter(rec, ts) {
    return new THREE.Vector3(ts.x, ts.y, ts.z);
  }

  function applySampled(rec, el, node, idx) {
    if (!node || !node.object3D) return;
    const { ts, s } = sampledTs(rec, el);
    node.object3D.position.set(ts.x, ts.y, (ts.z || 0) + (el.flush ? 0 : idx * 0.001));
    node.object3D.rotation.set((el.rotX || 0) * Math.PI / 180, (el.rotY || 0) * Math.PI / 180, ((s ? s.rot : el.rot || 0)) * Math.PI / 180);
    const sc = s ? s.scale : 1;
    node.object3D.scale.set(sc, sc, sc);
    // 2D mode shows only what the flat canvas cannot draw in its final look; inside a group, each child is decided alone
    const vis = (s ? !!s.visible : true) && (mode === "3d" || el.type === "group" || overlayType(el));
    if (node.object3D.visible !== vis) node.object3D.visible = vis;
    if (el.type === "group") node.querySelectorAll("[data-el-id]").forEach((n) => {
      const on = mode === "3d" || overlayType(rec.elements.find((x) => x.id === n.dataset.elId));
      if (n.object3D && n.object3D.visible !== on) n.object3D.visible = on;
    });
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
    const s = Math.max(0.18, Math.min(1.6, Math.min((0.26 * visH) / base, (0.85 * Math.max(margin, 0.05 * visH)) / base)));
    gizmo.scale.setScalar(s);
    // keep the tool buttons out from under the handles: dock them in the screen corner farthest from the gizmo
    if (toolRow) {
      const right = ndc.x < 0, bottom = ndc.y > 0; // gizmo in left half -> buttons right; gizmo in upper half -> buttons bottom
      toolRow.style.top = bottom ? "auto" : right ? "54px" : "8px"; // top-right corner holds the editor's full-screen button toolRow.style.bottom = bottom ? "8px" : "auto";
      toolRow.style.left = right ? "auto" : "8px"; toolRow.style.right = right ? "8px" : "auto";
      toolRow.style.insetInlineStart = "auto"; toolRow.style.alignItems = right ? "flex-end" : "flex-start";
      toolRow.style.flexDirection = bottom ? "column-reverse" : "column";
    }
  }

  function refreshGizmo() {
    clearGizmo();
    const rec = getRec(); if (!rec || !active || mode !== "3d") return;
    const id = getSelected(); if (!id) return;
    const el = rec.elements.find((x) => x.id === id);
    const node = elNode(id);
    if (!el || !node) return;
    const ts = sampledTs(rec, el).ts;
    const center = placementCenter(rec, ts);
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

  // Picking follows what the user SEES: flush layers share a depth, so ties go to the layer drawn on top
  // (higher renderOrder), and transparent pixels of an image layer do not steal the tap.
  const alphaCache = new WeakMap();
  function alphaAt(hit) {
    const m = Array.isArray(hit.object.material) ? hit.object.material[0] : hit.object.material;
    const img = m && m.map && m.map.image, uv = hit.uv;
    if (!img || !uv || !(img.width || img.naturalWidth) || (img.tagName === "VIDEO")) return 255;
    try {
      let c = alphaCache.get(img);
      if (!c) {
        const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, k = Math.min(1, 128 / Math.max(w, h));
        const cv = document.createElement("canvas"); cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
        const cx = cv.getContext("2d", { willReadFrequently: true }); cx.drawImage(img, 0, 0, cv.width, cv.height);
        c = { cx, w: cv.width, h: cv.height }; alphaCache.set(img, c);
      }
      const fl = m.map.flipY !== false;
      const x = Math.min(c.w - 1, Math.max(0, Math.floor(uv.x * c.w))), y = Math.min(c.h - 1, Math.max(0, Math.floor((fl ? 1 - uv.y : uv.y) * c.h)));
      return c.cx.getImageData(x, y, 1, 1).data[3];
    } catch (e) { return 255; }
  }
  function pickOrder(hits) {
    if (hits.length < 2) return hits;
    const solid = hits.filter((h) => alphaAt(h) >= 24);
    const pool = solid.length ? solid : hits;
    const d0 = pool[0].distance, tied = pool.filter((h) => h.distance - d0 <= 0.0005);
    if (tied.length > 1) {
      tied.sort((a, b) => (b.object.renderOrder || 0) - (a.object.renderOrder || 0));
      return [tied[0], ...pool.filter((h) => h !== tied[0])];
    }
    return pool;
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

  let tapAlt = null;
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
      // Rotate tool on a phone: the rings cover the layer, and the tilt rings (rotX/rotY) are edge-on from the front. So
      // a press well inside the blue ring (its inner 70%), not on a ring's own line, tilts the layer freely, like turning a
      // ball (the free tilt below); the blue ring keeps the flat turn. Tilt rings still work when seen from the side.
      if (gizmoMode === "rotate" && !hits.some((h) => !h.object.userData.proxy)) { // a press on a ring's own line keeps that ring
        const ring = gizmo.children[2], cam0 = cam.getObject3D("camera") || sceneEl.camera, rect = sceneEl.canvas.getBoundingClientRect();
        const toPx = (v) => { v.project(cam0); return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height }; };
        sceneEl.object3D.updateMatrixWorld(true);
        const c = toPx(gizmo.getWorldPosition(new THREE.Vector3())), edge = toPx(ring.localToWorld(new THREE.Vector3(ring.geometry.parameters.radius, 0, 0)));
        if (Math.hypot(e.clientX - c.x, e.clientY - c.y) < Math.hypot(edge.x - c.x, edge.y - c.y) * 0.7) { // the inner 70%: the blue ring's wide grab zone keeps the rim
          const el = rec.elements.find((x) => x.id === getSelected());
          if (el && el.type !== "sound") {
            if (hasKeys(el) && onGate) onGate(TILT_NOTE);
            gizmoDrag = { id: e.pointerId, el, part: "tilt", screen: { x: e.clientX, y: e.clientY }, rotX0: el.rotX || 0, rotY0: el.rotY || 0, keyT: null, snap: JSON.stringify(rec.elements), snapT: getFrozen ? getFrozen() : null };
            if (sceneEl.canvas.setPointerCapture) sceneEl.canvas.setPointerCapture(e.pointerId);
            e.preventDefault(); e.stopPropagation(); return;
          }
        }
      }
      if (hits.length) {
        tapAlt = null;
        { // a plain tap on a handle that sits over ANOTHER layer's visible pixels selects that layer (a drag still moves the handle)
          const tg = []; rig.querySelectorAll("[data-el-root]").forEach((n) => tg.push(n.object3D));
          const eh = pickOrder(ray.intersectObjects(tg, true));
          if (eh.length) { let q = eh[0].object; while (q && !(q.el && q.el.getAttribute && q.el.getAttribute("data-el-root"))) q = q.parent; const id = q && q.el && q.el.getAttribute("data-el-root"); if (id && id !== getSelected() && alphaAt(eh[0]) >= 24) tapAlt = { pid: e.pointerId, id, x: e.clientX, y: e.clientY }; }
        }
        const exact = hits.filter((h) => !h.object.userData.proxy);
        if (exact.length) hits = exact;
        else { const straight = hits.filter((h) => !h.object.userData.arc); if (straight.length) hits = straight; } // overlap of fat zones: the straight move arrow wins
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
    const hits = pickOrder(ray.intersectObjects(targets, true));
    if (hits.length) {
      let o = hits[0].object;
      while (o && !(o.el && o.el.getAttribute && o.el.getAttribute("data-el-root"))) o = o.parent;
      if (o && o.el) {
        const hitId = o.el.getAttribute("data-el-root");
        // rotate tool: a drag on the selected layer itself tilts it freely (sideways drag -> rotY, up/down -> rotX, 0.5°/px)
        if (gizmoMode === "rotate" && hitId === getSelected()) {
          const el = rec.elements.find((x) => x.id === hitId);
          if (el && el.type !== "sound") {
            if (hasKeys(el) && onGate) onGate(TILT_NOTE);
            gizmoDrag = { id: e.pointerId, el, part: "tilt", screen: { x: e.clientX, y: e.clientY }, rotX0: el.rotX || 0, rotY0: el.rotY || 0, keyT: null, snap: JSON.stringify(rec.elements), snapT: getFrozen ? getFrozen() : null };
            if (sceneEl.canvas.setPointerCapture) sceneEl.canvas.setPointerCapture(e.pointerId);
            e.preventDefault(); e.stopPropagation(); return;
          }
        }
        onSelect(hitId); e.preventDefault(); return;
      }
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
    if (gizmoDrag && e.pointerId === gizmoDrag.id && gizmoDrag.part === "tilt") {
      const el = gizmoDrag.el, norm = (d) => ((d + 180) % 360 + 360) % 360 - 180;
      el.rotY = Studio.snapAngle(Math.round(norm(gizmoDrag.rotY0 + (e.clientX - gizmoDrag.screen.x) * 0.5) * 10) / 10);
      el.rotX = Studio.snapAngle(Math.round(norm(gizmoDrag.rotX0 + (e.clientY - gizmoDrag.screen.y) * 0.5) * 10) / 10);
      refreshGizmo(); e.preventDefault(); return;
    }
    if (gizmoDrag && e.pointerId === gizmoDrag.id && gizmoDrag.part) {
      const rec = getRec(); if (!rec) return;
      const lr = localRay(rayFromEvent(e));
      const hit = new THREE.Vector3();
      let deg;
      if (gizmoDrag.screen && gizmoDrag.part === "rot") { let da = Math.atan2(e.clientY - gizmoDrag.screen.cy, e.clientX - gizmoDrag.screen.cx) - gizmoDrag.screen.sa; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; deg = -da * 180 / Math.PI; }
      else if (gizmoDrag.screen) deg = (gizmoDrag.part === "rotX" ? (e.clientY - gizmoDrag.screen.y) : (e.clientX - gizmoDrag.screen.x)) * 0.5;
      else {
        if (!lr.intersectPlane(gizmoDrag.plane, hit)) return;
        deg = (gizmoDrag.angleOf(hit) - gizmoDrag.a0) * 180 / Math.PI;
      }
      const el = gizmoDrag.el, key = gizmoDrag.part;
      const val = Studio.snapAngle(Math.round(((key === "rot" ? gizmoDrag.rot0 : key === "rotX" ? gizmoDrag.rotX0 : gizmoDrag.rotY0) + deg) * 10) / 10); // snaps to 0/±90/±180… within 6°
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

  // Drag from a screen-space rotation button: spin follows the pointer's angle around the element's screen centre;
  // tilts follow vertical (X) / horizontal (Y) distance at 0.5 deg/px. Same data path (gizmoDrag) as the 3D rotation handles.
  function startScreenRotate(part, e, btn) {
    const rec = getRec(); if (!rec || !active) return;
    const el = rec.elements.find((x) => x.id === getSelected()); if (!el || !gizmo) return;
    const keyT = prepareKeyedDrag(el, part);
    e.preventDefault(); e.stopPropagation();
    if (keyT === "gate") { if (onGate) onGate(gateMsg(el)); return; }
    if ((part === "rotX" || part === "rotY") && hasKeys(el) && onGate) onGate(TILT_NOTE);
    const camObj = cam.getObject3D("camera") || sceneEl.camera;
    const gw = new THREE.Vector3(); gizmo.getWorldPosition(gw); gw.project(camObj);
    const rect = sceneEl.canvas.getBoundingClientRect();
    const c = { x: rect.left + (gw.x + 1) / 2 * rect.width, y: rect.top + (1 - gw.y) / 2 * rect.height };
    const rot0 = (keyT != null && part === "rot" && sampleEl) ? sampleEl(el).rot : el.rot || 0;
    gizmoDrag = { id: e.pointerId, el, axis: null, plane: null, angleOf: null, a0: 0, screen: { x: e.clientX, y: e.clientY, cx: c.x, cy: c.y, sa: Math.atan2(e.clientY - c.y, e.clientX - c.x) }, rot0, rotX0: el.rotX || 0, rotY0: el.rotY || 0, part, keyT, snap: JSON.stringify(rec.elements), snapT: getFrozen ? getFrozen() : null };
    try { btn.setPointerCapture(e.pointerId); } catch (err) {}
  }

  function up(e) {
    if (e && pinchPtrs.has(e.pointerId)) { pinchPtrs.delete(e.pointerId); if (pinch3d && pinchPtrs.size < 2) pinch3d = null; }
    if (gizmoDrag) {
      const gd = gizmoDrag; gizmoDrag = null;
      const ta = tapAlt; tapAlt = null;
      if (ta && e && ta.pid === e.pointerId && e.type === "pointerup" && Math.hypot(e.clientX - ta.x, e.clientY - ta.y) < 8) {
        const r = getRec();
        if (gd.snap && r) { r.elements = JSON.parse(gd.snap); rebuildElements(); refreshGizmo(); if (restoreFrozen) restoreFrozen(gd.snapT); }
        onSelect(ta.id);
      } else onChange();
    }
    orb = null;
  }

  function layout() {
    if (!host) return;
    const c = wrapEl.querySelector("#preview");
    const h = c && c.style.height ? parseFloat(c.style.height) : wrapEl.clientHeight;
    wrapEl.style.minHeight = (h || 320) + "px";
  }

  // The stage moves #canvas-wrap in the DOM when the viewport crosses the narrow breakpoint (rotation).
  // Re-parenting an <a-scene> makes A-Frame tear down and re-create its renderer: the animation loop
  // stops and the scene content is lost. Detect that and mount a fresh scene.
  let scCanvas = null, remounting = false;
  function sceneWasReset() {
    if (!sceneEl) return false;
    const cs = sceneEl.querySelectorAll(":scope > canvas");
    if (cs.length > 1) return true;
    if (sceneEl.canvas) { if (!scCanvas) scCanvas = sceneEl.canvas; else if (sceneEl.canvas !== scCanvas) return true; }
    return false;
  }
  async function remount() {
    if (remounting) return; remounting = true;
    try {
      const old = host;
      hide();
      if (old) { old.querySelectorAll("#editor-3d-media > *").forEach((n) => { try { if (n.src && n.src.startsWith("blob:")) URL.revokeObjectURL(n.src); } catch (e) {} }); old.remove(); }
      mounted = false; sceneEl = null; host = null; rig = null; cam = null; toolRow = null; scCanvas = null; lastFitKey = ""; lastSig = null; artNode = null;
      gizmo = null; helper = null; orb = null;
      const was = mode; rigRot3d = null;
      await (was === "2d" ? overlay(true) : show());
    } finally { remounting = false; }
  }

  // Host look per mode: the full workspace (own background, touches, tools, orbit) or the transparent 2D layer.
  function applyMode() {
    if (!host) return;
    const flat = mode === "2d";
    host.style.background = flat ? "transparent" : "#d9dde3";
    host.style.pointerEvents = flat ? "none" : "auto";
    if (toolRow) toolRow.style.display = flat ? "none" : "flex";
    if (!flat) { host.style.left = host.style.top = host.style.width = host.style.height = ""; host.style.inset = "0"; host.dataset.box = ""; }
    if (rig) {
      if (flat) { if (!rigRot3d) rigRot3d = Object.assign({}, rig.getAttribute("rotation")); rig.setAttribute("rotation", "0 0 0"); } // the flat view is always face-on
      else if (rigRot3d) { rig.setAttribute("rotation", rigRot3d); rigRot3d = null; }
    }
    if (artNode && artNode.object3D) artNode.object3D.visible = !flat;
    if (!flat) points3d();
    if (sceneEl) try { sceneEl.resize(); } catch (e) {}
  }

  async function show() {
    if (busy) return; busy = true;
    try {
      const rec = getRec(); if (!rec || !rec.target) return;
      wrapEl.style.position = "relative";
      const firstMount = !mounted;
      mode = "3d";
      await mount();
      applyMode();
      layout(); lastSig = firstMount ? compositionSig(rec) : null; // re-shown: may be stale, rebuild once on next sync
      wrapEl.querySelector("#preview").style.visibility = "hidden";
      host.style.display = "block"; try { sceneEl.resize(); } catch (e) {} // measured now that the host is shown
      active = true;
      refreshGizmo();
      cancelAnimationFrame(sampleRaf); sampleRaf = requestAnimationFrame(sampleLoop);
    } finally { busy = false; }
  }

  // The layer's own video copies (keyed clips) run while it is shown, as in the experience, and rest when it is hidden.
  let clipCheck = 0;
  function playClips(on) {
    if (on && ++clipCheck % 30) return;
    const assets = host && host.querySelector("#editor-3d-media"); if (!assets) return;
    assets.querySelectorAll("video").forEach((v) => { if (!on) v.pause(); else if (v.paused && !(v.ended && !v.loop)) v.play().catch(() => {}); });
  }
  function hide() {
    active = false;
    playClips(false);
    cancelAnimationFrame(sampleRaf);
    if (host) host.style.display = "none";
    const c = wrapEl && wrapEl.querySelector("#preview");
    if (c) c.style.visibility = "visible";
    clearGizmo();
  }

  // 2D mode layer on/off (the editor asks on every 2D frame; cheap when nothing changes). Off while the 3D view is up.
  async function overlay(on) {
    if (active && mode === "3d") return;
    if (!on) { if (active) hide(); return; }
    if (active || busy) return;
    busy = true;
    try {
      const rec = getRec(); if (!rec || !rec.target) return;
      wrapEl.style.position = "relative";
      const firstMount = !mounted;
      mode = "2d";
      await mount();
      applyMode(); clearGizmo();
      lastSig = firstMount ? compositionSig(rec) : null;
      host.style.display = "block"; host.dataset.box = ""; // frame2d sizes the shown host on the next frame
      active = true;
      cancelAnimationFrame(sampleRaf); sampleRaf = requestAnimationFrame(sampleLoop);
    } finally { busy = false; }
  }
  // True when the 2D layer is drawing this element (model loaded, particles or keyed video built): the canvas then
  // leaves its body to the layer and draws only the selection marks.
  function drawsIn2d(id) {
    if (!active || mode !== "2d" || !rig) return false;
    const rec = getRec(); if (!rec || !overlayType(rec.elements.find((x) => x.id === id))) return false;
    const n = rig.querySelector('[data-el-id="' + id + '"]');
    if (!n || !n.object3D) return false;
    const m = n.querySelector("[gltf-model]");
    if (m) return !!m.getObject3D("mesh");
    return n.object3D.children.length > 0;
  }

  // Frame the 2D layer: same box as the canvas, orthographic camera spanning exactly what the canvas shows (zoom included).
  function frame2d() {
    const rec = getRec(), v = getView2d && getView2d(), c = wrapEl.querySelector("#preview");
    if (!rec || !rec.target || !v || !v.view.W || !c || !sceneEl) return;
    const w = v.view.cw, h = v.view.ch, box = [c.offsetLeft, c.offsetTop, w, h].join(",");
    // also when the scene canvas has no size: a resize measured while the host was hidden (another creation, another
    // tab) leaves it at 0x0, and the layer then draws nothing although every layer reports ready
    if (host.dataset.box !== box || !(sceneEl.canvas && sceneEl.canvas.width)) {
      host.dataset.box = box;
      Object.assign(host.style, { inset: "auto", left: c.offsetLeft + "px", top: c.offsetTop + "px", width: w + "px", height: h + "px" });
      try { sceneEl.resize(); } catch (e) {}
    }
    if (!ortho) ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
    const g = geomOf(rec), r = rec.target.artRect, k = g.artW / v.view.W / (v.zoom || 1);
    const xc = (r.x / Studio.TARGET_W - 0.5) * g.tw + g.artW / 2, yc = 0.5 - r.y / Studio.TARGET_H - g.artH / 2;
    ortho.left = -w / 2 * k; ortho.right = w / 2 * k; ortho.top = h / 2 * k; ortho.bottom = -h / 2 * k;
    ortho.position.set(xc, yc, 10); ortho.updateProjectionMatrix();
    if (sceneEl.camera !== ortho) sceneEl.camera = ortho;
    // Particle points are sized in screen pixels under an orthographic camera (no distance scaling), so give them the
    // pixel size they have in the 3D view's perspective (fov 50) at this zoom; points3d() puts the original back.
    const ppu = (sceneEl.canvas ? sceneEl.canvas.height : h) / (ortho.top - ortho.bottom), px = ppu * Math.tan(25 * Math.PI / 180);
    rig.object3D.traverse((o) => { if (!o.isPoints || !o.material) return; const m = o.material; if (m.userData.size3d == null) m.userData.size3d = m.size; m.size = m.userData.size3d * px; });
  }
  function points3d() {
    if (rig && rig.object3D) rig.object3D.traverse((o) => { if (o.isPoints && o.material && o.material.userData.size3d != null) o.material.size = o.material.userData.size3d; });
  }

  // Timeline linkage: every frame, mirror the 2D canvas's sampled world into the 3D
  // scene (live playback, frozen playhead, sequence state) and keep the gizmo on it.
  let sampleRaf = 0, lastFitKey = "", wdTime = -1, wdAt = 0, wdRestarts = 0;
  function sampleLoop() {
    if (!active) return;
    if (!remounting && sceneWasReset()) { remount(); return; }
    // A viewport change (rotation) can leave A-Frame on its fallback camera at the origin, which
    // makes every projection (and the gizmo fit) NaN. Keep the editor's own camera the active one.
    if (artNode && artNode.object3D && artNode.object3D.visible !== (mode === "3d")) artNode.object3D.visible = mode === "3d"; // the 2D canvas draws the artwork itself
    playClips(true);
    if (mode === "2d") frame2d();
    else if (cam && sceneEl && cam.components && cam.components.camera) {
      let own = cam.getObject3D("camera");
      if (!own && cam.components.camera.camera) { own = cam.components.camera.camera; cam.setObject3D("camera", own); lastFitKey = ""; }
      if (own && sceneEl.camera !== own) { sceneEl.camera = own; lastFitKey = ""; }
    }
    // Watchdog: after a viewport rotation the renderer's animation loop has been seen to stop
    // (scene time frozen, no frames drawn, rAF itself still firing). Restart it. Cause not found.
    if (sceneEl && sceneEl.renderer && typeof sceneEl.time === "number") {
      const nowMs = performance.now();
      if (sceneEl.time !== wdTime) { wdTime = sceneEl.time; wdAt = nowMs; }
      else if (nowMs - wdAt > 600 && sceneEl.isPlaying) { try { sceneEl.renderer.setAnimationLoop(sceneEl.render); } catch (e) {} wdAt = nowMs; wdRestarts++; }
    }
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
          // The element moves under timeline playback/scrub and the view changes on resize/rotation:
          // refit the handles (edge-aware) whenever position, camera or canvas size changed.
          const cr = sceneEl && sceneEl.canvas ? sceneEl.canvas : null, cp = cam && cam.object3D ? cam.object3D.position : null;
          const fitKey = [gizmo.position.x, gizmo.position.y, gizmo.position.z, cp ? cp.x : 0, cp ? cp.y : 0, cp ? cp.z : 0, cr ? cr.clientWidth : 0, cr ? cr.clientHeight : 0, rig && rig.object3D ? rig.object3D.rotation.y : 0].map((v) => Math.round(v * 1000)).join(",");
          if (fitKey !== lastFitKey) { lastFitKey = fitKey; fitGizmoToView(); }
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

  let syncTimer = null, lastSync = 0, lastSig = null, rebuildCount = 0;
  // draw() calls sync() on every animation frame. A full rebuild replaces every material and
  // texture (program re-link, texture re-upload, white flashes until the new textures land), so it
  // only runs when the composition actually changed: element data, the target, or any asset blob.
  const blobIds = new WeakMap(); let blobSerial = 0;
  // Placement, turn, opacity, timeline and preset motion of a top-level layer are applied every frame (applySampled),
  // so changing them needs no rebuild: a rebuild reloads every model, which blinked them out after each drag.
  // Grouped children keep every field, since their placement is built into the group.
  const LIVE_KEYS = new Set(["x", "y", "z", "rot", "rotX", "rotY", "opacity", "timeline", "anim"]);
  function compositionSig(rec) {
    if (!rec) return "";
    const inGroup = new Set(); rec.elements.forEach((g) => { if (g.type === "group") (g.children || []).forEach((id) => inGroup.add(id)); });
    const els = rec.elements.map((el) => { if (inGroup.has(el.id)) return el; const o = {}; for (const k in el) if (!LIVE_KEYS.has(k)) o[k] = el[k]; return o; });
    const assets = Object.keys(rec.assets || {}).sort().map((k) => {
      const v = rec.assets[k]; if (!v || typeof v !== "object") return k + ":" + String(v);
      if (!blobIds.has(v)) blobIds.set(v, ++blobSerial);
      return k + ":" + blobIds.get(v) + ":" + (v.size || 0) + ":" + (v.type || "");
    }).join("|");
    return JSON.stringify([els, rec.target, rec.sequences, rec.tracks]) + "#" + assets;
  }
  function sync() {
    // composition changed underneath us; throttled because draw() fires on rAF too
    if (!mounted || !active || gizmoDrag) return;
    const now = Date.now();
    if (now - lastSync < 250) { clearTimeout(syncTimer); syncTimer = setTimeout(sync, 260); return; }
    lastSync = now;
    const sig = compositionSig(getRec());
    if (sig === lastSig) return;
    lastSig = sig; rebuildCount++;
    rebuildArtwork().then(() => ensureMedia(getRec())).then(rebuildElements);
  }

  return { init, show, hide, overlay, drawsIn2d, overlayType, needsOverlay: (rec) => !!rec && rec.elements.some(overlayType), sync, isActive: () => active && mode === "3d", refreshGizmo, _test: { mode: () => mode, alphaAt, pickOrder, rebuilds: () => rebuildCount, gizmo: () => gizmo, node: (id) => elNode(id), scene: () => sceneEl, helper: () => helper, drag: () => gizmoDrag } };
})();
