"use strict";
/* UI: the small building blocks every screen of the studio uses - element builder, icons, toasts, dialogs,
   menus and the form controls of the inspector. No state of its own. */
window.UI = (() => {
  const $ = (id) => document.getElementById(id);

  // h("button.btn.primary", {onclick, title}, child, "text", ...)
  function h(spec, props, ...kids) {
    const [tag, ...cls] = spec.split(".");
    const n = document.createElement(tag || "div");
    if (cls.length) n.className = cls.join(" ");
    if (props && (typeof props !== "object" || props instanceof Node || Array.isArray(props))) { kids.unshift(props); props = null; }
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === "style" && typeof v === "object") Object.assign(n.style, v);
      else if (k === "data") Object.assign(n.dataset, v);
      else if (k.startsWith("on") || k in n && k !== "list") n[k] = v;
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid);
    return n;
  }

  // Stroke icons, drawn (not typed): emoji look different on every device.
  const P = {
    plus: "M12 5v14M5 12h14", close: "M6 6l12 12M18 6 6 18", back: "M9 6l6 6-6 6", check: "M5 12.5l4.5 4.5L19 7.5",
    undo: "M9 7 4 12l5 5M4 12h10a6 6 0 0 1 0 12h-1", redo: "M15 7l5 5-5 5M20 12H10a6 6 0 0 0 0 12h1",
    play: "M7 5l12 7-12 7z", pause: "M8 5v14M16 5v14", eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    share: "M12 15V3M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7", more: "M5 12h.01M12 12h.01M19 12h.01",
    trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6", copy: "M9 9h11v11H9zM5 15H4V4h11v1",
    edit: "M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4", image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9.5a1.5 1.5 0 1 0 0-.01",
    video: "M4 6h12v12H4zM16 10l5-3v10l-5-3", text: "M5 6V4h14v2M12 4v16M9 20h6", sound: "M4 10v4h4l5 4V6l-5 4H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12",
    cube: "M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM12 12l8-4.5M12 12v9M12 12 4 7.5", sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16z",
    pattern: "M4 4h16v16H4zM4 12c3-4 5-4 8 0s5 4 8 0M4 17c3-4 5-4 8 0s5 4 8 0M4 7c3-4 5-4 8 0s5 4 8 0", hourglass: "M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9",
    library: "M4 5h4v15H4zM10 5h4v15h-4zM16 6l3.5-1 3 14-3.5 1z", layers: "M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5",
    crop: "M7 2v15h15M2 7h15v15", zoomIn: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M8 11h6M11 8v6", zoomOut: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M8 11h6",
    fit: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5", up: "M12 19V5M6 11l6-6 6 6", down: "M12 5v14M6 13l6 6 6-6",
    upload: "M12 16V4M7 9l5-5 5 5M4 17v3h16v-3", download: "M12 4v12M7 11l5 5 5-5M4 17v3h16v-3", home: "M4 11l8-7 8 7v9h-5v-6h-6v6H4z",
    camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z", move: "M12 3v18M3 12h18M12 3 9.5 5.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5",
    motion: "M3 17c4 0 4-10 9-10s5 10 9 10M3 17h.01M12 7h.01M21 17h.01", tap: "M9 11V5.5a1.5 1.5 0 0 1 3 0V11M12 10V8.5a1.5 1.5 0 0 1 3 0V11M15 10.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a5 5 0 0 1-4.2-2.3L4 14.5a1.4 1.4 0 0 1 2.3-1.6L9 15",
    palette: "M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2 0-1.5 1-2 2-2h2a3 3 0 0 0 3-3c0-5-4-9-9-9zM7.5 12h.01M9.5 8h.01M14.5 7.5h.01M17 11h.01",
    magnet: "M6 4v8a6 6 0 0 0 12 0V4h-4v8a2 2 0 0 1-4 0V4zM6 8h4M14 8h4", link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
    lock: "M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3", unlock: "M6 11h12v9H6zM8 11V8a4 4 0 0 1 7.5-2", grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01", warn: "M12 4l9 16H3l9-16zM12 10v5M12 17.5h.01",
    key: "M12 4l7 8-7 8-7-8 7-8z", flip: "M12 3v18M8 7 4 12l4 5V7zM16 7l4 5-4 5V7z", refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
    pipette: "M14.5 4.5l5 5M17 7l-9 9-3.5 1 1-3.5 9-9M15.5 3a2.1 2.1 0 0 1 3 0l2.5 2.5a2.1 2.1 0 0 1 0 3l-1.5 1.5-5.5-5.5z", path: "M4 19c3-1 4-5 7-7s6 0 9-6M4 19h.01M11 12h.01M20 6h.01"
  };
  function icon(name, size) {
    const s = size || 20, fill = name === "play" ? "currentColor" : "none";
    const n = h("span.ic" + (name === "trash" ? ".ic-trash" : ""), { "aria-hidden": "true" });
    n.innerHTML = '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="' + fill + '" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="' + (P[name] || "") + '"/></svg>';
    return n;
  }

  // ---------- toasts ----------
  // Toasts live in the topmost open dialog (a modal dialog covers everything outside it), else in the page.
  function toastBox() {
    const box = $("toasts") || h("div", { id: "toasts", "aria-live": "polite" });
    const open = [...document.querySelectorAll("dialog[open]")].pop() || document.body;
    if (box.parentNode !== open) open.append(box);
    return box;
  }
  function toast(text, opts) {
    const o = opts || {}, box = toastBox();
    const t = h("div.toast" + (o.kind ? "." + o.kind : ""), { role: o.kind === "error" ? "alert" : "status" }, h("span", text));
    if (o.action) t.append(h("button.toast-act", { onclick: () => { close(); o.action.run(); } }, o.action.label));
    const close = () => { t.classList.add("out"); setTimeout(() => t.remove(), 220); };
    [...box.children].slice(0, -2).forEach((x) => x.remove());
    box.append(t);
    setTimeout(close, o.ms || (o.kind === "error" ? 7000 : 3600));
    return close;
  }
  // A status that stays while something is being done (import, baking): returns a function that ends it.
  function busy(text) {
    const b = h("div.busy", { role: "status" }, h("span.spinner"), h("span", text));
    toastBox().append(b);
    return (t) => { if (t) b.lastChild.textContent = t; else b.remove(); };
  }

  // ---------- dialogs ----------
  function dialog(opts) {
    const d = h("dialog.dlg" + (opts.wide ? ".wide" : "") + (opts.sheet ? ".sheet" : ""), { dir: "rtl" });
    const closeBtn = h("button.icon-btn", { "aria-label": "סגירה", onclick: () => d.close() }, icon("close"));
    d.append(h("header.dlg-head", h("h2", opts.title || ""), closeBtn), h("div.dlg-body", opts.body || []));
    if (opts.foot) d.append(h("footer.dlg-foot", opts.foot));
    d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
    d.addEventListener("close", () => { const box = $("toasts"); if (box && d.contains(box)) document.body.append(box); d.remove(); if (opts.onClose) opts.onClose(); }, { once: true });
    document.body.append(d); d.showModal();
    return d;
  }
  function confirm(opts) {
    return new Promise((res) => {
      let ok = false;
      const yes = h("button.btn" + (opts.danger ? ".danger" : ".primary"), { onclick: () => { ok = true; d.close(); } }, opts.yes || "אישור");
      const no = h("button.btn.ghost", { onclick: () => d.close() }, opts.no || "ביטול");
      const d = dialog({ title: opts.title, body: [h("p.dlg-text", opts.text || "")], foot: [no, yes], onClose: () => res(ok) });
      yes.focus();
    });
  }
  function prompt(opts) {
    return new Promise((res) => {
      let out = null;
      const inp = h("input.field", { type: "text", value: opts.value || "", maxLength: 80, placeholder: opts.placeholder || "" });
      const done = () => { const v = inp.value.trim(); if (v) { out = v; d.close(); } };
      inp.onkeydown = (e) => { if (e.key === "Enter") done(); };
      const d = dialog({ title: opts.title, body: [inp], foot: [h("button.btn.ghost", { onclick: () => d.close() }, "ביטול"), h("button.btn.primary", { onclick: done }, opts.yes || "שמירה")], onClose: () => res(out) });
      inp.focus(); inp.select();
    });
  }

  // A small menu that opens beside its button. items: [{label, icon, run, danger}] (null = divider)
  let openMenu = null;
  function menu(anchor, items) {
    if (openMenu) { const was = openMenu.anchor; openMenu.close(); if (was === anchor) return; }
    const m = h("div.menu", { role: "menu", dir: "rtl" });
    const close = () => { m.remove(); removeEventListener("pointerdown", away, true); removeEventListener("keydown", esc, true); openMenu = null; anchor.setAttribute("aria-expanded", "false"); };
    const away = (e) => { if (!m.contains(e.target) && !anchor.contains(e.target)) close(); };
    const esc = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); anchor.focus(); } };
    for (const it of items) {
      if (!it) { m.append(h("div.menu-sep")); continue; }
      m.append(h("button.menu-item" + (it.danger ? ".danger" : ""), { role: "menuitem", onclick: () => { close(); it.run(); } }, it.icon ? icon(it.icon, 18) : null, h("span", it.label)));
    }
    document.body.append(m);
    const r = anchor.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
    let x = Math.min(Math.max(8, r.right - mw), innerWidth - mw - 8), y = r.bottom + 6;
    if (y + mh > innerHeight - 8) y = Math.max(8, r.top - mh - 6);
    m.style.left = x + "px"; m.style.top = y + "px";
    anchor.setAttribute("aria-expanded", "true");
    openMenu = { close, anchor };
    setTimeout(() => { addEventListener("pointerdown", away, true); addEventListener("keydown", esc, true); });
    const first = m.querySelector("button"); if (first) first.focus();
  }

  // ---------- inspector controls ----------
  // Every control is {node, sync}: sync() puts the layer's current value back on the control (after a canvas drag,
  // undo...). A control calls set(value, final): final=false while a slider is still moving (redraw only), true
  // when the change is complete (save).
  function field(label, control, hint) {
    return h("label.ctl", h("span.ctl-label", label), control, hint ? h("span.ctl-hint", hint) : null);
  }
  function slider(o) {
    const dec = o.step >= 1 ? 0 : o.step >= 0.1 ? 1 : 2, k = o.scale || 1;
    const range = h("input.range", { type: "range", min: o.min, max: o.max, step: o.step, "aria-label": o.label });
    const num = h("input.num", { type: "number", min: o.min * k, max: o.max * k, step: o.step * k, inputMode: "decimal", "aria-label": o.label + " (מספר)" });
    const paint = (v) => { range.style.setProperty("--fill", ((v - o.min) / (o.max - o.min) * 100) + "%"); };
    const show = (v) => { range.value = v; num.value = +(v * k).toFixed(Math.max(0, dec - (k >= 100 ? 2 : 0))); paint(Math.max(o.min, Math.min(o.max, v))); };
    range.oninput = () => { const v = +range.value; num.value = +(v * k).toFixed(Math.max(0, dec - (k >= 100 ? 2 : 0))); paint(v); o.set(v, false); };
    range.onchange = () => o.set(+range.value, true);
    num.onchange = () => { let v = parseFloat(num.value) / k; if (!Number.isFinite(v)) return show(o.get()); v = Math.max(o.min, Math.min(o.max, v)); show(v); o.set(v, true); };
    const node = h("div.ctl.ctl-slider", h("span.ctl-label", o.label), h("div.slider-row", range, h("span.num-wrap", num, o.unit ? h("span.unit", o.unit) : null)));
    const sync = () => { if (document.activeElement !== num) show(o.get()); };
    sync();
    return { node, sync };
  }
  function toggle(o) {
    const box = h("input", { type: "checkbox", role: "switch" });
    box.onchange = () => o.set(box.checked, true);
    const node = h("label.ctl.ctl-toggle", h("span.ctl-label", o.label, o.hint ? h("span.ctl-hint", o.hint) : null), h("span.switch", box, h("span.knob")));
    const sync = () => { box.checked = !!o.get(); };
    sync();
    return { node, sync };
  }
  function select(o) {
    const sel = h("select.field", { "aria-label": o.label }, o.options.map((x) => h("option", { value: x.id }, x.name)));
    sel.onchange = () => o.set(sel.value, true);
    const sync = () => { sel.value = o.get(); };
    sync();
    return { node: field(o.label, sel, o.hint), sync };
  }
  // A row of choices where one is on. options: [{id, name, icon?, swatch?}]
  function chips(o) {
    const row = h("div.chips" + (o.wrap ? ".wrap" : ""), { role: "radiogroup", "aria-label": o.label });
    const btns = o.options.map((x) => {
      const b = h("button.chip", { type: "button", role: "radio", title: x.title || null, onclick: () => { o.set(x.id, true); sync(); } }, x.icon ? icon(x.icon, 16) : null, x.swatch || null, x.name ? h("span", x.name) : null);
      b.dataset.id = x.id; row.append(b); return b;
    });
    const sync = () => { const v = String(o.get()); btns.forEach((b) => { const on = b.dataset.id === v; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on)); }); };
    sync();
    return { node: o.bare ? row : h("div.ctl", o.label ? h("span.ctl-label", o.label) : null, row), sync };
  }
  function color(o) {
    const inp = h("input.color", { type: "color", "aria-label": o.label });
    const hex = h("span.color-hex");
    inp.oninput = () => { hex.textContent = inp.value; o.set(inp.value, false); };
    inp.onchange = () => o.set(inp.value, true);
    const sync = () => { const v = o.get() || "#ffffff"; inp.value = v; hex.textContent = v; };
    sync();
    return { node: h("label.ctl.ctl-color", h("span.ctl-label", o.label), h("span.color-wrap", hex, inp)), sync };
  }
  function button(label, run, opts) {
    const o = opts || {};
    return h("button.btn" + (o.kind ? "." + o.kind : "") + (o.small ? ".small" : ""), { type: "button", onclick: run, title: o.title || null }, o.icon ? icon(o.icon, 18) : null, h("span", label));
  }
  function group(title, ...kids) {
    return h("section.group", title ? h("h3.group-title", title) : null, kids.flat().filter(Boolean).map((k) => k.node || k));
  }

  const fmtDate = (ts) => { try { return new Date(ts).toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return ""; } };
  const fmtBytes = (n) => n >= 1048576 ? (n / 1048576).toFixed(1) + "MB" : Math.max(1, Math.round(n / 1024)) + "KB";
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const round = (v, d) => { const k = Math.pow(10, d == null ? 4 : d); return Math.round(v * k) / k; };
  function download(blob, name) {
    const url = URL.createObjectURL(blob), a = h("a", { href: url, download: name });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  // Pick files with a hidden input; resolves with the chosen File(s) or null.
  function pickFile(accept, multiple) {
    return new Promise((res) => {
      const inp = h("input", { type: "file", accept, hidden: true, multiple: !!multiple });
      inp.onchange = () => { const fs = [...inp.files]; inp.remove(); res(fs.length ? (multiple ? fs : fs[0]) : null); };
      inp.addEventListener("cancel", () => { inp.remove(); res(null); });
      document.body.append(inp); inp.click();
    });
  }

  return { $, h, icon, toast, busy, dialog, confirm, prompt, menu, field, slider, toggle, select, chips, color, button, group, fmtDate, fmtBytes, clamp, round, download, pickFile };
})();
