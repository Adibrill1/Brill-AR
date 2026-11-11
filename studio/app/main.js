"use strict";
/* Main: which screen is showing (gallery or one creation), the top bar of the editor, and the keyboard. */
(() => {
  const { $, toast } = UI;
  let opening = 0;

  function show(view) {
    document.body.dataset.view = view;
    $("home").hidden = view !== "home"; $("editor").hidden = view !== "editor";
    Stage.show(view === "editor");
    window.scrollTo(0, 0);
  }
  async function route() {
    const my = ++opening, hash = location.hash;
    const m = hash.match(/^#\/e\/(.+)$/) || hash.match(/^#([^/].*)$/);
    if (!m) {
      if (App.rec) await App.close();
      if (my !== opening) return;
      document.title = "סטודיו AR";
      show("home"); Home.render();
      return;
    }
    const id = decodeURIComponent(m[1]);
    if (App.rec && App.rec.id === id) return show("editor");
    const ok = await App.open(id);
    if (my !== opening) return;
    if (!ok) { toast("היצירה הזו לא נמצאת במכשיר הזה", { kind: "error" }); history.replaceState(null, "", "#/"); return route(); }
    show("editor");
  }

  // ---------- top bar ----------
  function syncName() {
    const rec = App.rec, inp = $("rec-name"); if (!rec) return;
    if (document.activeElement !== inp) inp.value = rec.name || "";
    document.title = (rec.name || "יצירה") + " · סטודיו AR";
  }
  function syncHistory() {
    const s = App.rec ? Studio.historyState(App.rec.id) : { undo: false, redo: false };
    $("btn-undo").disabled = !s.undo; $("btn-redo").disabled = !s.redo;
  }
  function syncSave() {
    const pill = $("save-pill"), rec = App.rec; if (!rec) return;
    const s = Studio.saveState(rec.id);
    const st = s.lastError ? "error" : s.pending > 0 ? "saving" : "saved";
    pill.dataset.state = st;
    pill.textContent = st === "error" ? "לא נשמר" : st === "saving" ? "שומרת…" : "נשמר";
    pill.title = st === "error" ? "השמירה האחרונה לא הצליחה" : st === "saved" ? "כל השינויים שמורים במכשיר" : "";
  }

  function keys(e) {
    if (!App.rec || document.querySelector("dialog[open]")) return;
    const t = e.target, typing = t && (t.tagName === "INPUT" && !/^(range|checkbox|color)$/.test(t.type) || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
    const mod = e.ctrlKey || e.metaKey, k = e.key;
    if (mod && (k === "z" || k === "Z")) { if (typing) return; e.preventDefault(); return e.shiftKey ? App.redo() : App.undo(); }
    if (mod && (k === "y" || k === "Y")) { if (typing) return; e.preventDefault(); return App.redo(); }
    if (typing) return;
    const sel = App.sel();
    if (k === "Escape") { if (App.cropping) App.setCropping(false); else if (sel) App.select(null); return; }
    if (!sel) return;
    if (mod && (k === "d" || k === "D")) { e.preventDefault(); return App.duplicateLayer(sel.id); }
    if (k === "Delete" || k === "Backspace") { e.preventDefault(); return App.removeLayer(sel.id); }
    const step = e.shiftKey ? 0.05 : 0.01;
    const d = k === "ArrowLeft" ? [-step, 0] : k === "ArrowRight" ? [step, 0] : k === "ArrowUp" ? [0, step] : k === "ArrowDown" ? [0, -step] : null;
    if (d) { e.preventDefault(); Stage.nudge(d[0], d[1]); }
  }

  function boot() {
    document.querySelectorAll("[data-ic]").forEach((n) => n.prepend(UI.icon(n.dataset.ic, +n.dataset.size || 20)));
    Stage.init(); Layers.init(); Inspector.init(); Home.init();

    $("btn-back").onclick = () => { location.hash = "#/"; };
    $("btn-undo").onclick = () => App.undo(); $("btn-redo").onclick = () => App.redo();
    $("btn-preview").onclick = () => (App.rec && App.rec.target ? Share.preview() : toast("קודם מעלים את תמונת היצירה", { kind: "warn" }));
    $("btn-share").onclick = () => Share.open();
    const name = $("rec-name");
    name.oninput = () => { if (!App.rec) return; App.rec.name = name.value.trim() || "יצירה"; document.title = App.rec.name + " · סטודיו AR"; App.saveSoon(); };
    name.onkeydown = (e) => { if (e.key === "Enter") name.blur(); };
    name.onblur = () => { if (App.rec) name.value = App.rec.name || ""; };

    App.on("open", () => { syncName(); syncHistory(); syncSave(); });
    App.on("history", () => { syncHistory(); syncSave(); });
    Studio.onSaveState(syncSave);
    Studio.installSaveGuard(window);
    addEventListener("keydown", keys);
    addEventListener("hashchange", route);
    addEventListener("pagehide", () => { App.flush(); });
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    route();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
