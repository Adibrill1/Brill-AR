"use strict";
/* AR Studio player: loads a saved experience from local IndexedDB and runs it
   on the proven engine stack (the scene itself is built by ar-mount.js, shared with the portal). Same behaviors as the device-verified v4:
   muted autoplay + first-tap sound, 10s capture, no mic, no end card.
   Round A: text layers, opacity, animation presets (spin/float/pulse),
   tap actions (open link / mute toggle), z-order via array order. */
(async () => {
  const errBox = document.getElementById("err");
  // Text only (textContent); an optional safe link is built as an element, never parsed from a string.
  const fail = (t, link) => { errBox.style.display = "grid"; errBox.textContent = t; if (link) { errBox.appendChild(document.createElement("br")); const a = document.createElement("a"); a.href = "index.html"; a.textContent = link; errBox.appendChild(a); } };
  const pubId = new URLSearchParams(location.search).get("pub") || "";
  const editMode = new URLSearchParams(location.search).get("edit") === "1" && !window.__REMOTE_EXPERIENCE__ && !pubId;
  let rec;
  // play.html?pub=<id> was the old published link: play.html sends it on to the portal (view.html#<id>) before this runs.
  if (pubId) return;
  if (window.__REMOTE_EXPERIENCE__) {
    try {
      const r = await fetch("/api/experiences/" + encodeURIComponent(window.__REMOTE_EXPERIENCE__));
      if (!r.ok) return fail("היצירה לא נמצאה בשרת.");
      rec = await Studio.importJSON(await r.text(), { save: false }); // viewer route: never persist into the viewer's editor storage
    } catch (e) { return fail("טעינת היצירה נכשלה. נסי לרענן."); }
  } else {
    const id = location.hash.slice(1);
    if (!id) return fail("חסר מזהה יצירה.", "חזרה לעורך");
    rec = await Studio.load(id);
  }
  if(!window.__REMOTE_EXPERIENCE__&&!pubId&&rec&&document.getElementById("backlink"))document.getElementById("backlink").href="index.html#"+encodeURIComponent(rec.id);
  if (!rec || !rec.target) return fail("היצירה לא נמצאה במכשיר הזה. אם ייצאת ממכשיר אחר - ייבאי קודם בעורך.", "פתיחת העורך");
  rec.elements.forEach(Studio.normEl);

  // Regenerate the engine target from the stored artwork (deterministic pipeline).
  const artImg = await Studio.loadImageBlob(rec.assets.__artwork);
  const t = await Studio.makeTarget(artImg);
  const targetData = Studio.targetDataJSON(t.luminance, t.padded, t.thumb);

  // The scene and the creation inside it: the same build as the portal's (ar-mount.js).
  const scene = ARMount.makeScene({ capture: !editMode });
  const h = await ARMount.mount(scene, rec, { name: "artwork", editMode, autoStart: false });
  const target = h.target;
  window.__actionRunner = h.actionRunner;
  window.__tlDrv = h.tlDrv; // test/debug handle
  document.body.appendChild(scene);

  if (editMode) {
    target.querySelectorAll("[animation__spin], [animation__float], [animation__pulse]").forEach(n => {
      n.removeAttribute("animation__spin"); n.removeAttribute("animation__float"); n.removeAttribute("animation__pulse");
    });
    target.querySelectorAll("[model-clips]").forEach(n => n.removeAttribute("model-clips"));
    CameraEditor.mount({ rec, container: target, scene, isAR: true });
  }

  h.start();

  // The engine is told about this one artwork.
  const setup = () => { XR8.XrController.configure({ imageTargetData: [targetData] }); };
  window.XR8 ? setup() : window.addEventListener("xrloaded", setup);
})().catch((e) => { Studio.loadFailed(e, "היצירה לא נטענה הפעם."); });
