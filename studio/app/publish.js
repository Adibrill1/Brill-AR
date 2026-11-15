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
      const msg = h("p.portal-msg", { id: "portal-token-msg" });
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
  // Fills `box` (an element in the share sheet) with what fits this creation's state on the portal. The layout is drawn
  // at once from what the portal said last time (Portal.remembered), so nothing moves while it checks: every tile has the
  // same fixed height, the check and the upload progress are one quiet line at the very bottom of the sheet (`status`),
  // and when the answer comes the same tiles are only switched on and relabelled. The layout changes only when the
  // portal changed meanwhile (from another phone), and then once.
  async function section(box, rec, status) {
    if (!status) status = box.parentNode ? box.parentNode.appendChild(h("p.portal-status")) : h("p");
    status.id = "portal-state";
    const tile = (id, ic, title, text, run, danger) => h("button.share-tile" + (danger ? ".danger" : ""), { id, type: "button", onclick: run }, h("span.share-ic", icon(ic, 24)), h("span.share-text", h("b", title), h("span", text)));
    const head = h("h3.portal-head", icon("eye", 18), h("span", "פורטל הצפייה"));
    const say = (t) => { status.textContent = t || ""; };
    const token = Portal.getToken();
    if (!token) {
      box.replaceChildren(head, h("div.share-list", tile("portal-publish", "upload", "פרסום בפורטל", "כל מי שמכוון מצלמה אל היצירה יראה אותה, בלי להתקין כלום", async () => { if (await setup()) section(box, rec, status); })));
      say(""); delete box.dataset.portal;
      return;
    }
    const why = Portal.blocker(rec), local = rec.target ? { fp: rec.target.fp && rec.target.fp.hex, fpe: rec.target.fp && rec.target.fp.entropy, ph: rec.target.ph } : null;
    // state: {kind: "none"|"mine"|"other", item, stale (mine, but the artwork changed since it was published)}
    const read = (items, trig) => {
      const mine = items.find((i) => i.src === rec.id), same = (i) => (trig ? Portal.sameTrigger(i.trigger, trig) : Portal.sameArtwork(i.trigger, local));
      if (mine) return { kind: "mine", item: mine, stale: !same(mine) };
      const other = items.find(same);
      return other ? { kind: "other", item: other } : { kind: "none" };
    };
    let st = null, live = false, busy = false, known = [], room = ""; // known: rooms already used; room: the one typed before a first publish
    // "חדר / קבוצה": free text, with the rooms already used offered. A published creation saves it on its own (only the
    // catalogue changes, nothing is uploaded again); before the first publish it goes with the publish.
    const roomRow = (s) => {
      const was = s.kind === "mine" ? s.item.room || "" : room;
      const inp = h("input.field", { id: "portal-room", type: "text", maxLength: 40, dir: "auto", autocomplete: "off", enterKeyHint: "done", placeholder: "למשל: חדר 1", value: was, list: "portal-rooms" });
      const save = s.kind === "mine" ? h("button.btn.small", { id: "portal-room-save", type: "button", hidden: true }, "שמירה") : null;
      inp.oninput = () => { if (save) save.hidden = Portal.cleanRoom(inp.value) === was; else room = inp.value; };
      if (save) save.onclick = () => run((x) => Portal.setRoom(rec.id, inp.value, x), Portal.cleanRoom(inp.value) ? "החדר נשמר. אצל הצופים זה מתעדכן בתוך כמה דקות." : "היצירה כבר לא שייכת לחדר.");
      return h("div.portal-room",
        h("label", { htmlFor: "portal-room" }, h("b", "חדר / קבוצה"), h("span", "יצירות באותו חדר יורדות מראש אצל הצופים בזמן שהם מסתכלים על אחת מהן")),
        h("div.portal-room-row", inp, save), h("datalist", { id: "portal-rooms" }, known.map((r) => h("option", { value: r }))));
    };
    const run = async (work, doneText) => {
      busy = true; draw(st);
      try {
        await work((s) => say(s.step === "upload" ? "מעלה קובץ " + s.i + " מתוך " + s.n + (s.size ? " (" + UI.fmtBytes(s.size) + ")" : "") + "…" : s.step === "commit" ? "שומרת את הפרסום…" : s.step === "retry" ? "הפורטל השתנה באמצע, מנסה שוב…" : "מכינה את היצירה…"));
        toast(doneText); App.emit && App.emit("portal");
      } catch (e) {
        console.warn(e);
        if (!e.clash) toast(e.portal ? e.message : "הפרסום לא הצליח. שום דבר לא השתנה בפורטל. אפשר לנסות שוב.", { kind: "error" });
      }
      busy = false; check();
    };
    // big: an honest word before a heavy publish (slow to send, and viewers on mobile data wait for it)
    const blocked = (go) => async () => {
      if (why) return toast(why, { kind: "error" });
      const n = Portal.weight(rec);
      if (n > Portal.LIM.big && !await UI.confirm({ title: "יצירה גדולה (" + UI.fmtBytes(n) + ")", text: "ההעלאה תיקח כמה דקות, וצופים בגלישה סלולרית יחכו לה בערך " + Math.max(10, Math.round(n / 1048576 / 2.5 / 5) * 5) + " שניות לפני שהיא מופיעה. אפשר לפרסם כך, או קודם לקצר סרטון.", yes: "לפרסם בכל זאת" })) return;
      go();
    };
    const settings = () => tile("portal-settings", "key", "הגדרות הפרסום", "החלפה או מחיקה של הטוקן", async () => { await setup(); section(box, rec, status); });
    const publishNew = blocked(() => run(async (s) => {
      try { await Portal.publish(rec, { room }, s); }
      catch (e) { if (!e.clash) throw e; if (await UI.confirm({ title: "התמונה הזו כבר מפורסמת", text: "״" + e.clash.name + "״ מפורסמת עם אותה תמונה. להחליף אותה בזו? הקישור והקוד יישארו אותו דבר.", yes: "להחליף את המפורסמת" })) await Portal.publish(rec, { replace: true, room: room || null }, s); else throw Object.assign(new Error("לא פורסם."), { portal: true }); }
    }, "היצירה פורסמה. צופים יראו אותה בתוך כמה דקות."));
    const tiles = (s) => {
      const it = s.item;
      if (s.kind === "mine") return [h("div.share-list",
        tile("portal-update", "refresh", "עדכון הפרסום", s.stale ? "התמונה השתנתה מאז הפרסום. בלי עדכון הצופים לא יזהו אותה" : "פורסמה ב־" + UI.fmtDate(it.at) + ". העדכון מחליף את מה שהצופים רואים", blocked(() => run((x) => Portal.publish(rec, {}, x), "הפרסום עודכן. צופים יראו את השינוי בתוך כמה דקות."))),
        tile("portal-link", "link", "הקישור והקוד (QR)", "לשיתוף ולהדפסה ליד היצירה", () => linkDialog(it)),
        tile("portal-remove", "trash", "הסרה מהפורטל", "היצירה נשארת אצלך, רק הצופים לא יראו אותה", async () => {
          if (!await UI.confirm({ title: "להסיר את ״" + rec.name + "״ מהפורטל?", text: "היצירה נשארת שמורה אצלך. צופים יפסיקו לראות אותה בתוך כמה דקות, והקישור שלה יגיד שהיא כבר לא מוצגת.", yes: "להסיר", danger: true })) return;
          run((x) => Portal.unpublish(rec.id, x), "היצירה הוסרה מהפורטל.");
        }, true),
        settings()), roomRow(s)];
      if (s.kind === "other") return [h("p.note.portal-other", icon("layers", 18), h("span", "יצירה אחרת עם אותה תמונה כבר מפורסמת: ״" + it.name + "״. בפורטל יכולה להיות רק אחת לכל תמונה.")),
        h("div.share-list",
          tile("portal-replace", "refresh", "להחליף את המפורסמת", "הצופים יראו את זו במקומה. הקישור והקוד יישארו אותו דבר", blocked(() => run((x) => Portal.publish(rec, { replace: true }, x), "היצירה הזו מוצגת עכשיו בפורטל במקום ״" + it.name + "״."))),
          tile("portal-link", "link", "הקישור והקוד (QR)", "של התמונה הזו בפורטל", () => linkDialog(it)),
          settings())];
      return [h("div.share-list", tile("portal-publish", "upload", "פרסום בפורטל", "כל מי שמכוון מצלמה אל היצירה יראה אותה, בלי להתקין כלום", publishNew), settings()), roomRow(s)];
    };
    // draw the tiles for s; the same kind and item again only switches buttons and relabels, in place
    const draw = (s) => {
      const key = s.kind + ":" + (s.item ? s.item.id + ":" + s.item.at + ":" + !!s.stale + ":" + (s.item.room || "") : "") + ":" + known.join("|");
      if (box.dataset.key !== key) { box.replaceChildren(head, ...tiles(s)); box.dataset.key = key; }
      box.querySelectorAll("button, input").forEach((b) => { b.disabled = busy || (!live && b.id !== "portal-link" && b.id !== "portal-settings"); });
    };
    const seen = Portal.remembered();
    known = Portal.rooms(seen); st = read(seen ? seen.items : [], null);
    draw(st);
    const check = async () => {
      live = false; draw(st); say("בודקת מול הפורטל…"); delete box.dataset.portal;
      let cat, trig;
      const space = Portal.room(token).catch(() => null);
      try { [cat, trig] = await Promise.all([Portal.myCatalogue(token), Portal.trigger(rec)]); Portal.remember(cat); }
      catch (e) {
        console.warn(e);
        live = true; draw(st); // what it showed stays; she can try again
        status.replaceChildren(h("span", (e.portal ? e.message : "לא הצלחתי לבדוק את הפורטל כרגע.") + " "), h("button.linkish", { id: "portal-retry", type: "button", onclick: check }, "לבדוק שוב"));
        box.dataset.portal = "error";
        return;
      }
      known = Portal.rooms(cat); st = read(cat.items, trig); live = true; draw(st);
      box.dataset.portal = st.kind === "mine" ? "published" : st.kind;
      const r = await space, mb = r ? Math.round(r.left / 1048576 / 10) * 10 : 0;
      const left = !r ? "" : mb >= 50 ? " · במאגר נשאר מקום לעוד כ־" + mb + "MB" : " · המאגר כמעט מלא (מומלץ פחות מ־1GB)";
      say(st.kind === "mine" ? (st.stale ? "צריך לעדכן את הפרסום: התמונה השתנתה" : "✓ מפורסמת בפורטל") + left : st.kind === "none" && why ? why : left.slice(3));
    };
    check();
  }
  return { setup, section, linkDialog, qrCanvas };
})();
