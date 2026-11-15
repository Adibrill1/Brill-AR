"use strict";
/* ARMount: the AR scene and one creation inside it, under its own image target. play.html (the creator's camera,
   one creation) and view.html (the portal, where creations come and go as the camera meets their artworks) build
   with the same code, so a creation behaves the same in both: muted autoplay + first-tap sound, motion that starts
   when the artwork is found and freezes while it is lost, tap actions, states and tracks, the steady hold. */
window.ARMount = (() => {
  // The scene and what it holds once per page: camera, lights, and the 10-second capture (sound mixed in, no mic).
  function makeScene(opts) {
    const o = opts || {}, scene = document.createElement("a-scene");
    if (o.holdMs > 0) holdLost(scene, o.holdMs, o);
    // gltf-model is BOTH a system and a component name; A-Frame's setAttribute override
    // parses against the component schema and mangles the system value. Write the raw
    // attribute so the system schema (decoder paths) sees it at scene init.
    window.HTMLElement.prototype.setAttribute.call(scene, "gltf-model", "dracoDecoderPath: " + Studio.DECODER_DRACO_PATH + "; meshoptDecoderPath: " + Studio.DECODER_MESHOPT_PATH);
    scene.setAttribute("xrextras-gesture-detector", "");
    if (o.landing !== false) scene.setAttribute("landing-page", "");
    scene.setAttribute("xrextras-loading", "");
    scene.setAttribute("xrextras-runtime-error", "");
    scene.setAttribute("renderer", "colorManagement:true");
    scene.setAttribute("xrweb", "disableWorldTracking: true" + (o.xrweb ? "; " + o.xrweb : ""));
    scene.appendChild(document.createElement("a-assets"));
    const cam = document.createElement("a-camera");
    cam.setAttribute("position", "0 0 0");
    cam.setAttribute("raycaster", "objects: .cantap");
    cam.setAttribute("cursor", "fuse: false; rayOrigin: mouse;");
    scene.appendChild(cam);
    const l1 = document.createElement("a-light");
    l1.setAttribute("type", "directional"); l1.setAttribute("intensity", "0.5"); l1.setAttribute("position", "1 1 1");
    const l2 = document.createElement("a-light");
    l2.setAttribute("type", "ambient"); l2.setAttribute("intensity", "1");
    scene.appendChild(l1); scene.appendChild(l2);
    if (o.capture !== false) {
      const capBtn = document.createElement("xrextras-capture-button");
      capBtn.setAttribute("capture-mode", "fixed");
      const capCfg = document.createElement("xrextras-capture-config");
      capCfg.setAttribute("max-duration-ms", "10000");
      capCfg.setAttribute("file-name-prefix", o.filePrefix || "art-ar-");
      capCfg.setAttribute("request-mic", "manual");
      capCfg.setAttribute("enable-end-card", "false");
      scene.appendChild(capBtn); scene.appendChild(capCfg); scene.appendChild(document.createElement("xrextras-capture-preview"));
    }
    return scene;
  }

  // A moment of grace when the engine loses the artwork: a reflection crossing a glossy print, or a hand, often takes
  // the artwork away for a fraction of a second. The engine's "lost" is held back for holdMs, and dropped if the artwork
  // is found again meanwhile, so the content stays where it was instead of blinking out and starting over. Registered
  // before anything else listens on the scene, so it has the first word. Events without a name (tests) pass at once.
  // opts.holdKeep(name, heldMs) may keep it longer: it answers how many ms to wait before asking again (0: let go now);
  // the portal keeps it only while its own recogniser still sees that artwork where the content stands. opts.onHold(name)
  // hears the moment a hold begins. The content never waits on the screen without one of those reasons.
  function holdLost(scene, ms, o) {
    const held = new Map(); // name -> {timer, since}
    const pass = (name, detail) => { const h = held.get(name); if (h) clearTimeout(h.timer); held.delete(name); scene.__passLost = true; try { scene.emit("xrimagelost", detail, false); } finally { scene.__passLost = false; } };
    const ask = (name, detail) => { const h = held.get(name); if (!h) return; const more = o.holdKeep ? +o.holdKeep(name, performance.now() - h.since) || 0 : 0; if (more > 0) h.timer = setTimeout(() => ask(name, detail), more); else pass(name, detail); };
    scene.addEventListener("xrimagelost", (e) => {
      const d = e.detail, name = d && d.name;
      if (scene.__passLost || !name) return;
      e.stopImmediatePropagation();
      const h = held.get(name); if (h) clearTimeout(h.timer);
      held.set(name, { since: h ? h.since : performance.now(), timer: setTimeout(() => ask(name, d), ms) });
      if (!h && o.onHold) o.onHold(name);
    }, true);
    scene.addEventListener("xrimagefound", (e) => { const name = e.detail && e.detail.name, h = name && held.get(name); if (h) { clearTimeout(h.timer); held.delete(name); } }, true);
    scene.__releaseLost = (name) => { if (held.has(name)) { pass(name, { name }); return true; } return false; };
    scene.__holding = (name) => held.has(name);
  }
  // The creation under the image target `name` steps aside at once: its artwork counts as lost (content hidden, motion
  // and media paused), whether or not the engine has said so yet. The portal does this when it switches to another artwork.
  function release(scene, name) {
    if (scene.__releaseLost && scene.__releaseLost(name)) return;
    const t = [...scene.querySelectorAll("xrextras-named-image-target")].find((n) => n.getAttribute("name") === name);
    if (t && t.object3D && t.object3D.visible) { scene.__passLost = true; try { scene.emit("xrimagelost", { name }, false); } finally { scene.__passLost = false; } }
  }

  // One creation under an image target called opts.name. The scene may already be running (the portal mounts
  // creations later). Returns {target, mediaEls, tlDrv, actionRunner, destroy}.
  async function mount(scene, rec, opts) {
    const o = opts || {}, name = o.name || "artwork", editMode = !!o.editMode;
    rec.elements.forEach(Studio.normEl);
    // Build media assets with blob URLs.
    const mediaEls = [], urls = [], nodes = []; // mediaEls: {kind:'video'|'audio', node, el, three (routed gain)}
    const assets = scene.querySelector("a-assets") || scene.appendChild(document.createElement("a-assets"));
    for (const el of rec.elements) {
      if (!el.assetId || !rec.assets[el.assetId]) continue;
      const url = URL.createObjectURL(rec.assets[el.assetId]); urls.push(url);
      const kind = Studio.mediaType(el); // a scatter layer reads its file like the layer it was made from
      if (kind === "video") {
        const v = document.createElement("video");
        v.id = "m-" + el.id; v.src = url; v.muted = true; v.loop = el.loop !== false;
        v.setAttribute("playsinline", ""); v.setAttribute("webkit-playsinline", "");
        v.setAttribute("crossorigin", "anonymous"); v.preload = "auto";
        Studio.videoHasPicture(v); // starts watching for its first picture: its layer stays invisible until then
        assets.appendChild(v); nodes.push(v);
        // a frozen video stays on its chosen frame: it is left out of everything that starts media (found, touch, states)
        if (Studio.isStill(el)) Studio.setStill(v, true, Studio.stillAt(el)); else mediaEls.push({ kind: "video", node: v, el });
      } else if (kind === "image") {
        const mm = await Studio.makeImageMedia(rec.assets[el.assetId], "m-" + el.id,
          () => document.querySelector('[data-el-id="' + el.id + '"]'));
        if (Studio.isStill(el)) Studio.setStill(mm.node, true, Studio.stillAt(el)); // a frozen GIF: one frame
        assets.appendChild(mm.node); nodes.push(mm.node);
      } else if (el.type === "sound") {
        const a = document.createElement("audio");
        a.id = "m-" + el.id; a.src = url; a.loop = el.loop !== false; a.preload = "auto";
        assets.appendChild(a); nodes.push(a); mediaEls.push({ kind: "audio", node: a, el });
      }
    }

    // Mute toggle shared by tap actions: all sources are routed through THREE.Audio gains,
    // so flipping the gain is the one reliable mute across browsers.
    let muted = false;
    const onMuteToggle = () => {
      muted = !muted;
      for (const m of mediaEls) {
        if (m.three) m.three.gain.gain.value = muted ? 0 : (m.el.volume == null ? 1 : m.el.volume);
      }
    };

    // Multi-state artworks: tap an element wired to "sequence" to switch states.
    let curSeq = Studio.seqList(rec).length ? Studio.seqList(rec)[0].id : null;
    let tlDrv = null;
    const runner = Studio.makeSeqRunner(rec, (to) => onSequence(to));
    const onSequence = (id) => {
      if (!Studio.seqList(rec).some((x) => x.id === id)) return;
      curSeq = id;
      refreshVisibility();
      Studio.renderSeqDots(rec, curSeq);
      if (tlDrv) { tlDrv.stateLoop = !!(Studio.seqList(rec).find((x) => x.id === curSeq) || {}).loop; tlDrv.reset(); }
      if (!editMode) runner.enter(curSeq);
    };
    const onNextSequence = () => {
      curSeq = Studio.nextSequence(rec, curSeq);
      refreshVisibility();
      Studio.renderSeqDots(rec, curSeq);
      if (tlDrv) tlDrv.reset(); // a new state replays its motion from the start
    };

    const target = document.createElement("xrextras-named-image-target");
    target.setAttribute("name", name);
    Studio.topLevelElements(rec).forEach((el, idx) => {
      const e = Studio.buildElementEntity(rec, el, idx, "ar");
      if (!e) return; // sound: no visual node
      target.appendChild(e);
      if (e.dataset.opacity) Studio.applyOpacity(e, parseFloat(e.dataset.opacity));
    });
    // parallel overlay tracks: independent clocks, tap start/stop, combined visibility
    const trackRunner = Studio.makeTrackRunner(rec, target);
    const refreshVisibility = () => {
      Studio.applySequence(target, rec, curSeq, mediaEls, (id) => trackRunner.isPlaying(id));
      target.setAttribute("data-tracks", JSON.stringify(Studio.trackList(rec).map((t) => [t.id, trackRunner.isPlaying(t.id)]))); // test/debug handle (DOM-readable)
    };
    const onTrackToggle = (id) => { trackRunner.toggle(id); refreshVisibility(); };
    // taps bind per entity, including children inside group wrappers
    target.querySelectorAll("[data-el-id]").forEach((n) => {
      const el = rec.elements.find((x) => x.id === n.dataset.elId);
      if (el && !editMode) Studio.bindTap(n, el, { onMuteToggle, onNextSequence, onSequence, onTrackToggle, onActionSequence: id=>actionRunner.start(id) });
    });
    if (!editMode) { trackRunner.autoStart(); trackRunner.pauseAll(); }
    refreshVisibility();
    if (curSeq) { refreshVisibility(); Studio.renderSeqDots(rec, curSeq); }
    scene.appendChild(target);
    // hidden until its artwork is found. The stock target hides itself only when the engine starts ("realityready"); a
    // creation the portal adds later would otherwise stand at the camera's own position, in front of the picture (a
    // dark model or a big layer covered the whole screen until the artwork was found)
    const hide = () => { if (target.object3D) target.object3D.visible = false; };
    if (target.hasLoaded) hide(); else target.addEventListener("loaded", function on(e) { if (e.target !== target) return; target.removeEventListener("loaded", on); hide(); });
    Studio.steadyTarget(scene, target); // the content rests on the artwork instead of trembling with every camera frame
    // Timeline motion starts when the artwork is found (not during permission/scan screens)
    // and freezes while tracking is lost, resuming where it stopped.
    // the state driver drives only state-model elements; tracked elements run on their track's own driver
    tlDrv = Studio.startTimelineDriver(rec, [...target.querySelectorAll("[data-el-id]")].filter((n) => {
      const el = rec.elements.find((x) => x.id === n.dataset.elId);
      return el && !el.track;
    }), { autostart: false });
    if (tlDrv) tlDrv.stateLoop = !!(Studio.seqList(rec).find((x) => x.id === curSeq) || {}).loop;
    if (!editMode) runner.enter(curSeq);
    const actionRunner=Studio.startActionDriver(rec,target,mediaEls, {paused:true,disabled:editMode});
    if (editMode && tlDrv) tlDrv.pause();
    // the scene hears every artwork; only this one's found/lost move this creation (an event without a name is a test's)
    const mine = (e) => !e.detail || !e.detail.name || e.detail.name === name;
    const onFound = (e) => { if (mine(e)) { if (tlDrv) tlDrv.play(); trackRunner.resumeAll(); actionRunner.resume(); } };
    const onLost = (e) => { if (mine(e)) { if (tlDrv) tlDrv.pause(); trackRunner.pauseAll(); actionRunner.pause(); } };
    if (!editMode) { scene.addEventListener("xrimagefound", onFound); scene.addEventListener("xrimagelost", onLost); }

    if (o.lostGraceMs != null) target._studioGraceMs = o.lostGraceMs; // the portal holds flickers itself: media stop the moment the content goes
    const stopMonitor = Studio.monitorMedia(target, rec);
    const start = () => {
      Studio.ensurePlayback(mediaEls.filter((m) => m.kind === "video"));
      // Touch: unmute videos (also paused ones), start sound elements, resume audio context; a button says so until then.
      if (!editMode) Studio.soundOnTouch(mediaEls, { isMuted: () => muted, getContext: () => scene.audioListener && scene.audioListener.context, iconOnly: !!o.quietSound });
      // Route every sound source through one Web Audio context so the 10s capture records the mix.
      Studio.connectSpatialAudio(scene, target, mediaEls);
    };
    if (o.autoStart !== false) start(); // play.html starts it once the scene is in the page

    function destroy() {
      scene.removeEventListener("xrimagefound", onFound); scene.removeEventListener("xrimagelost", onLost);
      try { stopMonitor(); } catch (e) {}
      try { if (tlDrv) tlDrv.pause(); trackRunner.pauseAll(); actionRunner.pause(); } catch (e) {}
      for (const m of mediaEls) { try { if (m.three) m.three.disconnect(); } catch (e) {} }
      for (const n of nodes) { try { n.pause && n.pause(); n.removeAttribute("src"); n.load && n.load(); } catch (e) {} n.remove(); }
      target.remove();
      urls.forEach((u) => URL.revokeObjectURL(u));
    }
    return { name, target, mediaEls, tlDrv, actionRunner, start, destroy };
  }
  return { makeScene, mount, release };
})();
