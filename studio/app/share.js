"use strict";
/* Share: seeing the creation for real (camera), trying it without a camera, and taking it out as a file. */
window.Share = (() => {
  const { h, icon, toast } = UI;
  const fileName = (rec) => (rec.name || "יצירה").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 60) || "יצירה";

  async function leave(url) { await App.flush(); location.href = url; }
  function preview() { const rec = App.rec; if (rec) leave("preview.html#" + rec.id); }

  function open() {
    const rec = App.rec; if (!rec) return;
    if (!rec.target) return toast("קודם מעלים את תמונת היצירה", { kind: "warn" });
    let zip = null;
    const tile = (ic, title, text, run) => h("button.share-tile", { type: "button", onclick: run }, h("span.share-ic", icon(ic, 24)), h("span.share-text", h("b", title), h("span", text)));
    const state = h("span", "אורזת את היצירה…");
    const send = tile("share", "שליחת הקובץ", "בוואטסאפ, במייל או לכל מקום אחר", async () => {
      if (!zip) return;
      const f = new File([zip], fileName(rec) + ".zip", { type: "application/zip" });
      try {
        if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: rec.name });
        else { UI.download(zip, f.name); toast("במכשיר הזה אי אפשר לשלוח ישר, אז הקובץ ירד"); }
      } catch (e) { if (e && e.name !== "AbortError") { UI.download(zip, f.name); toast("הקובץ ירד למכשיר"); } }
    });
    const save = tile("download", "שמירת גיבוי", "קובץ אחד עם כל היצירה", () => { if (zip) { UI.download(zip, fileName(rec) + ".zip"); toast("קובץ הגיבוי ירד למכשיר"); } });
    send.disabled = save.disabled = true;
    UI.dialog({
      title: "לראות ולשתף", sheet: true,
      body: [
        h("div.share-list",
          tile("camera", "לפתוח במצלמה", "מכוונים את המצלמה אל היצירה והיא מתעוררת", () => leave("play.html#" + rec.id)),
          tile("eye", "לנסות בלי מצלמה", "איך זה ייראה, כאן על המסך", preview),
          send, save),
        h("p.note", icon("lock", 18), h("span", "היצירות שמורות רק במכשיר הזה. כדי לעבור למכשיר אחר שומרים גיבוי ופותחים אותו שם דרך ״פתיחת גיבוי״ במסך הראשי.")),
        h("p.share-state", state)
      ]
    });
    App.flush().then(() => Studio.exportZIP(rec)).then((b) => {
      zip = b; send.disabled = save.disabled = false;
      state.textContent = "גודל הקובץ: " + UI.fmtBytes(b.size);
    }, (e) => { console.warn(e); state.textContent = "לא הצלחתי לארוז את היצירה לקובץ."; });
  }
  return { open, preview };
})();
