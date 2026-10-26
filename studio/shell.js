/* Phone shell (stage 1): bottom tab bar over the EXISTING cards. No data paths, ids or handlers change:
   it only toggles which card is visible (CSS, body[data-tab]) and pins the artwork canvas while editing. */
(function () {
  const tabs = [["create", "יצירה"], ["layers", "שכבות וסידור"], ["check", "בדיקה ושמירה"]];
  const nav = document.createElement("nav"); nav.id = "shell-tabs"; nav.setAttribute("aria-label", "שלבי העבודה");
  tabs.forEach(([k, t]) => { const b = document.createElement("button"); b.type = "button"; b.dataset.tab = k; b.textContent = t; b.addEventListener("click", () => setTab(k)); nav.appendChild(b); });
  document.body.appendChild(nav);
  // the artwork canvas moves (same node, same id) out of the long card into a pinned stage at the top
  const stage = document.createElement("div"); stage.id = "stage";
  document.querySelector("main").before(stage);
  stage.appendChild(document.getElementById("canvas-wrap"));
  function setTab(k) {
    document.body.dataset.tab = k;
    nav.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tab === k)));
    window.scrollTo(0, 0);
  }
  const has = () => !document.getElementById("sec-arrange").hidden;
  setTab(has() ? "layers" : "create");
  // artwork appears (sec-arrange un-hides) -> go to layers once; hides (switch to a project without artwork) -> create
  let was = has();
  new MutationObserver(() => { const n = has(); if (n !== was) { was = n; setTab(n ? "layers" : "create"); } }).observe(document.getElementById("sec-arrange"), { attributes: true, attributeFilter: ["hidden"] });
  // keep the canvas aspect when its height is capped: width follows height via --ar (never stretch)
  const cv = document.getElementById("preview");
  const fit = () => { if (cv.width && cv.height) { const v = (cv.width / cv.height).toFixed(4); const old = parseFloat(stage.style.getPropertyValue("--ar")); if (!(Math.abs(old - v) < 0.02)) { stage.style.setProperty("--ar", v); setTimeout(() => dispatchEvent(new Event("resize")), 0); } } sp(); };
  const sp = () => { const narrow = matchMedia("(max-width: 820px)").matches; const vis = stage.offsetHeight; document.documentElement.style.scrollPaddingTop = narrow && vis ? vis + 4 + "px" : ""; const hd = document.querySelector("header"); const avail = innerHeight - (stage.offsetHeight + (hd ? hd.offsetHeight : 0)) - 48 - 6; document.documentElement.style.setProperty("--sheet-max", narrow ? Math.max(150, Math.min(Math.round(innerHeight * 0.42), avail)) + "px" : ""); const pn = document.getElementById("panel"); const ph = pn && !pn.hidden ? pn.offsetHeight : 0; document.documentElement.style.setProperty("--toast-bottom", narrow ? (ph ? ph + 48 + 8 : 70) + "px" : ""); document.documentElement.style.scrollPaddingBottom = narrow ? (ph ? ph + 52 + 6 : 70) + "px" : ""; };
  new ResizeObserver(sp).observe(stage); { const pn0 = document.getElementById("panel"); new ResizeObserver(sp).observe(pn0); new MutationObserver(sp).observe(pn0, { attributes: true, attributeFilter: ["hidden"] }); } addEventListener("resize", sp);
  new MutationObserver(fit).observe(cv, { attributes: true, attributeFilter: ["width", "height"] }); fit();
  // 3D view needs room for the gizmo and the docked rotation buttons: taller stage while 3D is on
  const b3 = document.getElementById("btn-3d");
  const view = () => { const v = b3.classList.contains("on") ? "3d" : "2d"; if (stage.dataset.view !== v) { stage.dataset.view = v; setTimeout(() => dispatchEvent(new Event("resize")), 0); } };
  new MutationObserver(view).observe(b3, { attributes: true, attributeFilter: ["class"] }); view();
  // Selected-element sheet: the existing #panel (same inputs/handlers) shown as a bottom sheet with sub-tabs.
  const panel = document.getElementById("panel"), kids = [...panel.children];
  const groups = { pos: [1, 6, 7, 8, 10], look: [2, 3, 4, 5, 9, 17, 18], motion: [11, 13, 14, 15, 16], tap: [12] };
  for (const [g, idx] of Object.entries(groups)) idx.forEach((i) => { if (kids[i]) kids[i].dataset.sub = g; });
  const sub = document.createElement("div"); sub.id = "panel-subtabs"; sub.setAttribute("role", "tablist");
  [["pos", "מיקום"], ["look", "מראה"], ["motion", "תנועה וצליל"], ["tap", "נגיעה וזמן"]].forEach(([k, t]) => {
    const b = document.createElement("button"); b.type = "button"; b.dataset.sub = k; b.textContent = t; b.setAttribute("role", "tab");
    b.addEventListener("click", () => {
      panel.dataset.collapsed = "0"; subSync();
      // jump (nothing is hidden: every control stays reachable by scrolling and Tab order is complete)
      const t = [...panel.children].find((c) => c.dataset.sub === k && c.getBoundingClientRect().height > 0);
      if (t) panel.scrollTo({ top: Math.max(0, t.offsetTop - sub.offsetHeight - 6), behavior: "auto" });
      panel.dataset.sub = k; subSync();
    }); sub.appendChild(b);
  });
  const fold = document.createElement("button"); fold.type = "button"; fold.id = "panel-fold"; fold.textContent = "▾"; fold.setAttribute("aria-label", "כיווץ או הרחבה של לוח העריכה");
  fold.addEventListener("click", () => { panel.dataset.collapsed = panel.dataset.collapsed === "1" ? "0" : "1"; subSync(); });
  sub.appendChild(fold); kids[0].after(sub);
  // group the controls (same nodes, same ids/handlers) so each sub-tab is one contiguous run of the sheet
  { let anchor = sub; for (const g of ["pos", "look", "motion", "tap"]) for (const i of groups[g]) { if (kids[i]) { anchor.after(kids[i]); anchor = kids[i]; } } }
  // "back to live playback" appears when a canvas drag freezes the playhead: it must be reachable from every sub-tab
  const live = document.getElementById("btn-tl-live"); if (live) { const w = document.createElement("div"); w.id = "panel-live"; w.className = "row"; w.dataset.sub = "all"; w.appendChild(live); sub.after(w); }
  panel.dataset.sub = "pos"; panel.dataset.collapsed = "0";
  panel.addEventListener("scroll", () => { const top = panel.getBoundingClientRect().top + sub.offsetHeight + 12; let cur = "pos"; for (const c of panel.children) { if (c.dataset.sub && c.dataset.sub !== "all" && c.getBoundingClientRect().height > 0 && c.getBoundingClientRect().bottom > top + 4) { cur = c.dataset.sub; break; } } if (cur !== panel.dataset.sub) { panel.dataset.sub = cur; subSync(); } }, { passive: true });
  function subSync() { sub.querySelectorAll("button[data-sub]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.sub === panel.dataset.sub))); fold.textContent = panel.dataset.collapsed === "1" ? "▴" : "▾"; }
  subSync();
  document.body.classList.add("shell");
})();
