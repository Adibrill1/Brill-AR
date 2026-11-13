"use strict";
/* Home: the gallery of creations saved on this device. */
window.Home = (() => {
  const { $, h, icon, toast } = UI;
  let grid, empty, count, urls = [];

  const go = (id) => { location.hash = "#/e/" + id; };
  const fileName = (rec) => (rec.name || "יצירה").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 60) || "יצירה";

  async function create() {
    const all = await Studio.all();
    const rec = Studio.blankExperience("יצירה " + (all.length + 1));
    await Studio.save(rec);
    go(rec.id);
  }
  async function importFile() {
    const f = await UI.pickFile(".zip,.json,application/zip,application/json");
    if (!f) return;
    const end = UI.busy("פותחת את הקובץ…");
    try {
      const zip = /\.zip$/i.test(f.name) || /zip/.test(f.type);
      const rec = zip ? await Studio.importZIP(f, { save: false }) : await Studio.importJSON(await f.text(), { save: false });
      await Studio.save(rec);
      end(); toast("היצירה ״" + rec.name + "״ נוספה");
      render();
    } catch (e) {
      console.warn(e); end();
      toast("הקובץ הזה לא נפתח. צריך קובץ גיבוי שנשמר מהסטודיו.", { kind: "error" });
    }
  }
  async function sample() {
    const end = UI.busy("מכינה יצירה לדוגמה…");
    try { const rec = await Studio.seedDemo(true); end(); go(rec.id); }
    catch (e) { console.warn(e); end(); toast("הדוגמה לא נטענה", { kind: "error" }); }
  }
  async function rename(rec) {
    const v = await UI.prompt({ title: "שם היצירה", value: rec.name });
    if (!v) return;
    const cur = await Studio.load(rec.id); if (!cur) return render();
    cur.name = v; await Studio.save(cur, { noHistory: true }); render();
  }
  async function duplicate(rec) {
    const cur = await Studio.load(rec.id); if (!cur) return render();
    const now = Date.now();
    const copy = Object.assign(JSON.parse(JSON.stringify(Object.assign({}, cur, { assets: undefined }))),
      { id: Studio.newId(), name: (cur.name || "יצירה") + " (עותק)", createdAt: now, updatedAt: now, assets: Object.assign({}, cur.assets) });
    try { await Studio.save(copy); toast("נוצר עותק"); } catch (e) { toast("אין מספיק מקום לעותק", { kind: "error" }); }
    render();
  }
  async function exportRec(rec) {
    const cur = await Studio.load(rec.id); if (!cur) return render();
    const end = UI.busy("אורזת את היצירה…");
    try { UI.download(await Studio.exportZIP(cur), fileName(cur) + ".zip"); end(); toast("קובץ הגיבוי ירד למכשיר"); }
    catch (e) { console.warn(e); end(); toast("הגיבוי לא הצליח", { kind: "error" }); }
  }
  // The gallery picture ("תמונת שער"): her own picture instead of the artwork, on this card only. Stored in the creation
  // as __cover, made small (800px on the long side) so the gallery stays light; the camera, the editor and the preview
  // never read it.
  async function smallPicture(f) {
    const img = await Studio.loadImage(await Studio.blobToDataURL(f)), k = Math.min(1, 800 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const g = c.getContext("2d"); g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); // a see-through picture gets a white back
    const out = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
    if (!out) throw new Error("encode");
    return out;
  }
  async function chooseCover(rec) {
    const f = await UI.pickFile("image/*"); if (!f) return;
    const end = UI.busy("מכינה את תמונת השער…");
    try {
      const pic = await smallPicture(f), cur = await Studio.load(rec.id); if (!cur) { end(); return render(); }
      cur.assets.__cover = pic; await Studio.save(cur, { noHistory: true });
      end(); toast("תמונת השער הוחלפה. במצלמה עדיין מזהים את תמונת היצירה.");
    } catch (e) { console.warn(e); end(); toast("התמונה הזו לא נפתחה. אפשר לנסות תמונה אחרת.", { kind: "error" }); }
    render();
  }
  async function resetCover(rec) {
    const cur = await Studio.load(rec.id); if (!cur) return render();
    delete cur.assets.__cover; await Studio.save(cur, { noHistory: true });
    toast("הכרטיס מראה שוב את תמונת היצירה"); render();
  }
  async function remove(rec) {
    const ok = await UI.confirm({ title: "למחוק את ״" + rec.name + "״?", text: "היצירה תימחק מהמכשיר הזה ואי אפשר יהיה להחזיר אותה. כדאי לשמור גיבוי קודם.", yes: "למחוק", danger: true });
    if (!ok) return;
    await Studio.del(rec.id);
    toast("היצירה נמחקה"); render();
  }

  function card(rec) {
    const n = (rec.elements || []).length, cover = rec.assets && rec.assets.__cover, art = cover || (rec.assets && rec.assets.__artwork);
    let pic;
    if (art) { const u = URL.createObjectURL(art); urls.push(u); pic = h("img", { src: u, alt: "", loading: "lazy", draggable: false, data: { cover: cover ? "1" : "" } }); }
    else pic = h("span.card-noart", icon("image", 30), h("span", "עוד בלי תמונה"));
    const more = h("button.icon-btn.card-more", { type: "button", "aria-label": "עוד פעולות: " + rec.name, "aria-haspopup": "menu" }, icon("more", 20));
    more.onclick = () => UI.menu(more, [
      { label: "שינוי שם", icon: "edit", run: () => rename(rec) },
      { label: "שכפול", icon: "copy", run: () => duplicate(rec) },
      { label: "לבחור תמונת שער", icon: "image", run: () => chooseCover(rec) },
      cover ? { label: "לחזור לתמונת היצירה", icon: "refresh", run: () => resetCover(rec) } : false,
      { label: "שמירת גיבוי", icon: "download", run: () => exportRec(rec) },
      null,
      { label: "מחיקה", icon: "trash", danger: true, run: () => remove(rec) }
    ].filter((x) => x !== false));
    return h("article.card",
      h("button.card-open", { type: "button", onclick: () => go(rec.id), "aria-label": "פתיחת " + rec.name }, h("span.card-pic", pic)),
      h("div.card-foot", h("div.card-text", h("b.card-name", rec.name || "יצירה"), h("span.card-meta", (n ? n + (n === 1 ? " שכבה" : " שכבות") : "ריקה") + " · " + UI.fmtDate(rec.updatedAt || rec.createdAt))), more));
  }

  async function render() {
    if (!grid) return;
    let all = [];
    try { all = await Studio.all(); } catch (e) { toast("היצירות לא נטענו", { kind: "error" }); }
    all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    urls.forEach((u) => URL.revokeObjectURL(u)); urls = [];
    grid.replaceChildren(...all.map(card));
    if (all.length) grid.prepend(h("button.card.card-new", { type: "button", onclick: create }, h("span.card-plus", icon("plus", 30)), h("b", "יצירה חדשה")));
    grid.hidden = !all.length; empty.hidden = !!all.length;
    count.textContent = all.length ? all.length + (all.length === 1 ? " יצירה" : " יצירות") : "";
  }

  function init() {
    grid = $("home-grid"); empty = $("home-empty"); count = $("home-count");
    $("btn-new").onclick = create; $("btn-new-empty").onclick = create;
    $("btn-import").onclick = importFile; $("btn-sample").onclick = sample;
  }
  return { init, render };
})();
