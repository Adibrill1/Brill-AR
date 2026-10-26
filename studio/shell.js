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
  const fit = () => { if (cv.width && cv.height) stage.style.setProperty("--ar", String(cv.width / cv.height)); };
  new MutationObserver(fit).observe(cv, { attributes: true, attributeFilter: ["width", "height"] }); fit();
  document.body.classList.add("shell");
})();
