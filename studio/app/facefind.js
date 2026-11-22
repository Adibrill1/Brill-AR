/* Brill AR studio: finds a face in a picture, for the code animation "פנים במגע" (el.codefx.face).
   Runs in the editor only, on the creator's tap, with Google's free MediaPipe face landmarker (Apache-2.0), loaded from
   the CDN the first time. The picture stays on the device. The result is a short list of numbers in the picture's own
   proportions (0-1, y from the top):
     [left eye x, y, right eye x, y, eye size, nose bridge x, y, nose tip x, y, mouth left x, y, mouth right x, y,
      face centre x, y, face size]   (sizes as a share of the picture's width) */
window.FaceFind = (() => {
  const LIB = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
  const MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
  let ready = null;
  const load = () => ready || (ready = (async () => {
    const m = await import(LIB + "/vision_bundle.mjs");
    const files = await m.FilesetResolver.forVisionTasks(LIB + "/wasm");
    return m.FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate: "CPU" }, runningMode: "IMAGE", numFaces: 1 });
  })().catch((e) => { ready = null; throw e; }));
  // the picture, no bigger than 1024 on its long side (enough to find a face, quick on a phone)
  async function canvasOf(blob) {
    const bmp = await createImageBitmap(blob), k = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height); if (bmp.close) bmp.close();
    return c;
  }
  async function find(blob) {
    const [lm, c] = await Promise.all([load(), canvasOf(blob)]);
    const r = lm.detect(c), L = r && r.faceLandmarks && r.faceLandmarks[0];
    if (!L) return null;
    const asp = c.height / c.width; // sizes in widths, distances measured in real proportions
    const P = (i) => L[i], mid = (a, b) => ({ x: (P(a).x + P(b).x) / 2, y: (P(a).y + P(b).y) / 2 });
    const dist = (a, b) => Math.hypot(a.x - b.x, (a.y - b.y) * asp);
    const le = mid(33, 133), re = mid(362, 263), eye = (dist(P(33), P(133)) + dist(P(362), P(263))) / 4;
    const bridge = P(168), tip = P(4), ml = P(61), mr = P(291);
    let cx = 0, cy = 0; for (const p of L) { cx += p.x; cy += p.y; } cx /= L.length; cy /= L.length;
    const size = dist(P(234), P(454)) / 2;
    const out = [le.x, le.y, re.x, re.y, eye, bridge.x, bridge.y, tip.x, tip.y, ml.x, ml.y, mr.x, mr.y, cx, cy, size];
    return out.map((v) => Math.round(Math.min(1.5, Math.max(-0.5, v)) * 10000) / 10000);
  }
  return { find, load };
})();
