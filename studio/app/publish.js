"use strict";
/* Publish: putting a creation on the viewer portal (view.html), updating it, taking it off, and its link + QR code.
   The work itself is in portal.js; this is the part of "לראות ולשתף" Adi sees, and the one-time setup of her token. */
window.Publish = (() => {
  const { h, icon, toast } = UI;

  // ---------- one-time setup: her own GitHub token, kept on this phone only ----------
  const STEPS = [
    ["פותחים בדפדפן את הכתובת", "github.com/settings/personal-access-tokens/new", "ונכנסים לחשבון Adibrill1 אם צריך."],
    ["ב־Token name כותבים", "פורטל סטודיו", ""],
    ["ב־Expiration בוחרים את התקופה הארוכה ביותר שמוצעת.", "", ""],
    ["ב־Repository access בוחרים", "Only select repositories", "ומסמנים את Brill-AR."],
    ["ב־Permissions לוחצים Add permissions (או פותחים Repository permissions), בוחרים", "Contents", "ומשנים ל־Read and write."],
    ["לוחצים למטה על Generate token, ואז על סמל ההעתקה שליד הטוקן (הוא מתחיל ב־github_pat_).", "", ""],
    ["חוזרים לכאן, מדביקים בשדה שלמטה ולוחצים ״שמירה״.", "", ""]
  ];
  function setup() {
    return new Promise((done) => {
      let ok = false;
      const has = !!Portal.getToken();
      const inp = h("input.field", { id: "portal-token", type: "text", autocomplete: "off", autocapitalize: "off", spellcheck: false, dir: "ltr", placeholder: "github_pat_…" });
      const msg = h("p.share-state", { id: "portal-token-msg" });
      const save = h("button.btn.primary", { id: "portal-token-save", type: "button" }, "שמירה");
      save.onclick = async () => {
        const t = inp.value.trim();
        if (!Portal.looksLikeToken(t)) { msg.textContent = "זה לא נראה כמו טוקן של GitHub. הוא מתחיל ב־github_pat_ ואין בו רווחים."; return; }
        save.disabled = true; msg.textContent = "בודקת את הטוקן…";
        try { await Portal.checkToken(t); Portal.setToken(t); ok = true; toast("הפורטל מחובר. אפשר לפרסם."); d.close(); }
        catch (e) { msg.textContent = e.portal ? e.message : "לא הצלחתי לבדוק את הטוקן. אפשר לנסות שוב."; save.disabled = false; }
      };
      const forget = has ? h("button.btn.danger", { id: "portal-token-forget", type: "button", onclick: async () => {
        if (!await UI.confirm({ title: "למחוק את הטוקן מהטלפון?", text: "היצירות שכבר פורסמו נשארות בפורטל. כדי לפרסם שוב יהיה צריך להדביק טוקן.", yes: "למחוק", danger: true })) return;
        Portal.setToken(""); toast("הטוקן נמחק מהטלפון הזה"); d.close();
      } }, icon("trash", 18), "מחיקת הטוקן") : null;
      const d = UI.dialog({
        title: "חיבור הפורטל (פעם אחת)", sheet: true,
        body: [
          h("p.dlg-text", "כדי לפרסם מהטלפון צריך ״טוקן״: מפתח אישי מ־GitHub שמאפשר לסטודיו לשמור את היצירות שלך בפורטל. עושים את זה פעם אחת:"),
          h("ol.portal-steps", STEPS.map(([a, b, c]) => h("li", a + " ", b ? (b.startsWith("github.com/") ? h("a", { href: "https://" + b, target: "_blank", rel: "noopener", dir: "ltr" }, b) : h("b", { dir: "ltr" }, b)) : null, c ? " " + c : ""))),
          inp, msg,
          h("p.note", icon("lock", 18), h("span", "הטוקן נשמר רק בטלפון הזה. הוא לא נכנס לגיבויים ולא נשלח לשום מקום חוץ מ־GitHub. כשהתוקף שלו נגמר יוצרים חדש באותה דרך."))
        ],
        foot: [forget, h("button.btn.ghost", { type: "button", onclick: () => d.close() }, "ביטול"), save].filter(Boolean),
        onClose: () => done(ok)
      });
      if (has) msg.textContent = "כבר יש טוקן בטלפון הזה. אפשר להדביק חדש במקומו או למחוק אותו.";
      inp.focus();
    });
  }

  // ---------- link + QR ----------
  function qrCanvas(text) {
    const q = qrcode(0, "M"); q.addData(text); q.make();
    const n = q.getModuleCount(), cell = Math.max(4, Math.floor(600 / (n + 8))), size = (n + 8) * cell, c = document.createElement("canvas");
    c.width = c.height = size; const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, size, size); g.fillStyle = "#000";
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect((k + 4) * cell, (r + 4) * cell, cell, cell);
    return c;
  }
  function linkDialog(item) {
    const url = Portal.viewURL(item.id), c = qrCanvas(url), img = h("img.portal-qr", { src: c.toDataURL("image/png"), alt: "קוד QR של הקישור" });
    const name = (item.name || "יצירה").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 50) || "יצירה";
    const copy = async () => { try { await navigator.clipboard.writeText(url); toast("הקישור הועתק"); } catch (e) { UI.prompt({ title: "הקישור", value: url, yes: "סגירה" }); } };
    const share = async () => { try { if (navigator.share) await navigator.share({ title: item.name, url }); else copy(); } catch (e) { if (e && e.name !== "AbortError") copy(); } };
    const saveQR = () => c.toBlob(async (b) => {
      const f = new File([b], "QR " + name + ".png", { type: "image/png" });
      try { if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: item.name }); else { UI.download(b, f.name); toast("התמונה של הקוד ירדה למכשיר"); } }
      catch (e) { if (e && e.name !== "AbortError") UI.download(b, f.name); }
    }, "image/png");
    UI.dialog({
      title: "הקישור של ״" + item.name + "״", sheet: true,
      body: [
        h("div.portal-link", img, h("code", { id: "portal-url", dir: "ltr" }, url)),
        h("div.share-list",
          h("button.share-tile", { type: "button", onclick: copy }, h("span.share-ic", icon("copy", 24)), h("span.share-text", h("b", "העתקת הקישור"), h("span", "להדביק בהודעה, בפוסט או בביו"))),
          h("button.share-tile", { type: "button", onclick: share }, h("span.share-ic", icon("share", 24)), h("span.share-text", h("b", "שיתוף הקישור"), h("span", "בוואטסאפ או בכל אפליקציה"))),
          h("button.share-tile", { type: "button", onclick: saveQR }, h("span.share-ic", icon("download", 24)), h("span.share-text", h("b", "שמירת הקוד כתמונה"), h("span", "להדפסה ולתלייה ליד היצירה")))),
        h("p.note", icon("eye", 18), h("span", "מי שסורק את הקוד מגיע ישר ליצירה הזו. גם בלי קוד, הכתובת " + Portal.viewURL() + " מזהה לבד כל יצירה שפורסמה."))
      ]
    });
  }

  // ---------- the portal part of the share sheet ----------
  // Fills `box` (an element in the share sheet) with what fits this creation's state on the portal.
  async function section(box, rec) {
    const tile = (id, ic, title, text, run, danger) => h("button.share-tile" + (danger ? ".danger" : ""), { id, type: "button", onclick: run }, h("span.share-ic", icon(ic, 24)), h("span.share-text", h("b", title), h("span", text)));
    const state = h("p.share-state", { id: "portal-state" }), head = h("h3.portal-head", icon("eye", 18), h("span", "פורטל הצפייה"));
    const show = (...kids) => box.replaceChildren(head, ...kids, state);
    const token = Portal.getToken();
    if (!token) {
      show(h("div.share-list", tile("portal-publish", "upload", "פרסום בפורטל", "כל מי שמכוון מצלמה אל היצירה יראה אותה, בלי להתקין כלום", async () => { if (await setup()) section(box, rec); })));
      return;
    }
    show(); state.textContent = "בודקת מה מפורסם…";
    let cat, trig;
    try { [cat, trig] = await Promise.all([Portal.myCatalogue(token), Portal.trigger(rec)]); Portal.remember(cat); }
    catch (e) {
      console.warn(e);
      show(h("div.share-list", tile("portal-retry", "refresh", "לנסות שוב", "", () => section(box, rec)), tile("portal-settings", "key", "הגדרות הפרסום", "החלפה או מחיקה של הטוקן", async () => { await setup(); section(box, rec); })));
      state.textContent = e.portal ? e.message : "לא הצלחתי לקרוא את הפורטל כרגע.";
      return;
    }
    const mine = cat.items.find((i) => i.src === rec.id), other = !mine && cat.items.find((i) => Portal.sameTrigger(i.trigger, trig));
    const run = async (work, doneText) => {
      box.querySelectorAll("button").forEach((b) => { b.disabled = true; });
      try {
        await work((s) => { state.textContent = s.step === "upload" ? "מעלה קובץ " + s.i + " מתוך " + s.n + "…" : s.step === "commit" ? "שומרת את הפרסום…" : s.step === "retry" ? "הפורטל השתנה באמצע, מנסה שוב…" : "מכינה את היצירה…"; });
        toast(doneText); App.emit && App.emit("portal");
      } catch (e) {
        console.warn(e);
        if (e.clash) { state.textContent = ""; return section(box, rec); }
        toast(e.portal ? e.message : "הפרסום לא הצליח. שום דבר לא השתנה בפורטל. אפשר לנסות שוב.", { kind: "error" });
      }
      section(box, rec);
    };
    const why = Portal.blocker(rec);
    const settings = tile("portal-settings", "key", "הגדרות הפרסום", "החלפה או מחיקה של הטוקן", async () => { await setup(); section(box, rec); });
    if (mine) {
      show(h("div.share-list",
        tile("portal-update", "refresh", "עדכון הפרסום", "פורסמה ב־" + UI.fmtDate(mine.at) + ". העדכון מחליף את מה שהצופים רואים", () => why ? toast(why, { kind: "error" }) : run((s) => Portal.publish(rec, {}, s), "הפרסום עודכן. צופים יראו את השינוי בתוך כמה דקות.")),
        tile("portal-link", "link", "הקישור והקוד (QR)", "לשיתוף ולהדפסה ליד היצירה", () => linkDialog(mine)),
        tile("portal-remove", "trash", "הסרה מהפורטל", "היצירה נשארת אצלך, רק הצופים לא יראו אותה", async () => {
          if (!await UI.confirm({ title: "להסיר את ״" + rec.name + "״ מהפורטל?", text: "היצירה נשארת שמורה אצלך. צופים יפסיקו לראות אותה בתוך כמה דקות, והקישור שלה יגיד שהיא כבר לא מוצגת.", yes: "להסיר", danger: true })) return;
          run((s) => Portal.unpublish(rec.id, s), "היצירה הוסרה מהפורטל.");
        }, true),
        settings));
      state.textContent = "✓ מפורסמת בפורטל";
      box.dataset.portal = "published";
    } else if (other) {
      show(h("p.note", icon("layers", 18), h("span", "יצירה אחרת עם אותה תמונה כבר מפורסמת: ״" + other.name + "״. בפורטל יכולה להיות רק אחת לכל תמונה.")),
        h("div.share-list",
          tile("portal-replace", "refresh", "להחליף את המפורסמת", "הצופים יראו את זו במקומה. הקישור והקוד יישארו אותו דבר", () => why ? toast(why, { kind: "error" }) : run((s) => Portal.publish(rec, { replace: true }, s), "היצירה הזו מוצגת עכשיו בפורטל במקום ״" + other.name + "״.")),
          tile("portal-link", "link", "הקישור והקוד (QR)", "של התמונה הזו בפורטל", () => linkDialog(other)),
          settings));
      box.dataset.portal = "other";
    } else {
      show(h("div.share-list",
        tile("portal-publish", "upload", "פרסום בפורטל", "כל מי שמכוון מצלמה אל היצירה יראה אותה, בלי להתקין כלום", () => why ? toast(why, { kind: "error" }) : run(async (s) => {
          try { await Portal.publish(rec, {}, s); }
          catch (e) { if (!e.clash) throw e; if (await UI.confirm({ title: "התמונה הזו כבר מפורסמת", text: "״" + e.clash.name + "״ מפורסמת עם אותה תמונה. להחליף אותה בזו? הקישור והקוד יישארו אותו דבר.", yes: "להחליף את המפורסמת" })) await Portal.publish(rec, { replace: true }, s); else throw Object.assign(new Error("לא פורסם."), { portal: true }); }
        }, "היצירה פורסמה. צופים יראו אותה בתוך כמה דקות.")),
        settings));
      if (why) state.textContent = why;
      box.dataset.portal = "none";
    }
  }
  return { setup, section, linkDialog, qrCanvas };
})();
