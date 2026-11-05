/*
 * Better Canvas — settings UI components.
 * Every control is constructed with get()/set() bound to the state store, and
 * registers a sync() that re-reads the store and writes only what differs.
 * Visuals come from the shared kit (BC.ui, src/content/core/ui.js); the settings
 * layout classes (bcs-*) live in settings/index.js.
 */
(function () {
  "use strict";
  const BC = (globalThis.BC = globalThis.BC || {});
  const el = (t, a, c) => BC.ui.el(t, a, c);

  const C = (BC.SettingsComponents = {});

  // ---- live bindings ------------------------------------------------------
  // Controls own their DOM for their whole lifetime. Tearing the tab down on every
  // state change destroyed the very control the user was touching (no CSS
  // transitions, lost caret, dead slider drags). Instead each control registers a
  // sync(state) that writes only what differs: a no-op for the control just
  // touched, and the cross-row reactivity channel for everything else.
  let binds = [];

  // Shadow-DOM safe: the drawer lives in a shadow root, where
  // document.activeElement reports the HOST, not the focused input.
  const focused = (n) => n.getRootNode().activeElement === n;
  C.focused = focused;

  C.bindings = {
    reset() { binds = []; },
    add(node, fn) { binds.push({ node, fn }); return node; },
    sync(state) {
      for (let i = binds.length - 1; i >= 0; i--) {
        const b = binds[i];
        // isConnected is shadow-inclusive, so controls detached by a tab switch or
        // a sub-panel redraw prune themselves — no bookkeeping at the call sites.
        if (!b.node.isConnected) { binds.splice(i, 1); continue; }
        BC.util.guard(() => b.fn(state), "bc-sync");
      }
    },
  };
  const bind = (node, fn) => C.bindings.add(node, fn);

  // ---- layout -------------------------------------------------------------

  // A group of rows on one card. `actions` sit at the right of the heading.
  C.section = function ({ title, description, children, actions, id }) {
    const head = (title || description || actions)
      ? el("header", { class: "bcs-section__head" }, [
          el("div", { class: "bcs-section__titles" }, [
            title ? el("h3", { class: "bcs-section__title", text: title }) : null,
            description ? el("p", { class: "bcs-section__desc", text: description }) : null,
          ]),
          actions ? el("div", { class: "bcs-section__actions" }, [].concat(actions)) : null,
        ])
      : null;
    return el("section", { class: "bcs-section", id: id || null }, [head, el("div", { class: "bcs-section__body" }, children)]);
  };

  // Label + hint on the left, control on the right. `stacked` puts a wide control
  // (textarea, list) underneath instead.
  //   showWhen(state)    -> hide the row entirely when it doesn't apply
  //   enabledWhen(state) -> dim it and make it inert when its parent is off
  C.row = function ({ label, hint, control, warn, enabledWhen, showWhen, stacked }) {
    const ctl = el("div", { class: "bcs-row__control" }, [].concat(control || []));
    const row = el("div", { class: "bcs-row" + (stacked ? " bcs-row--stacked" : "") }, [
      el("div", { class: "bcs-row__text" }, [
        el("div", { class: "bcs-row__label", text: label }),
        hint ? el("div", { class: "bcs-row__hint", text: hint }) : null,
        warn ? el("div", { class: "bcs-row__warn", text: warn }) : null,
      ]),
      ctl,
    ]);
    if (enabledWhen || showWhen) bind(row, (s) => {
      if (showWhen) {
        const show = !!showWhen(s);
        if (row.hidden === show) row.hidden = !show;
      }
      if (enabledWhen) {
        const on = !!enabledWhen(s);
        if (row.classList.contains("bcs-row--off") === on) row.classList.toggle("bcs-row--off", !on);
        ctl.toggleAttribute("inert", !on);
      }
    });
    return row;
  };

  // An inline callout. tone: info | warn
  C.note = function ({ text, tone, icon }) {
    return el("div", { class: "bcs-note" + (tone ? " bcs-note--" + tone : "") }, [
      BC.ui.icon(icon || (tone === "warn" ? "alert" : "info")),
      el("div", { text }),
    ]);
  };

  // ---- controls -----------------------------------------------------------

  C.switch = function ({ get, set, ariaLabel }) {
    const t = BC.ui.toggle({ checked: !!get(), ariaLabel: ariaLabel || "", onChange: (v) => set(v) });
    bind(t.root, () => t.set(!!get()));
    return t.root;
  };

  C.segmented = function ({ get, set, options, ariaLabel, size }) {
    const seg = BC.ui.segmented({ value: get(), options, ariaLabel, size, onChange: (v) => set(v) });
    // Four or more choices (or icon+label pairs) are too wide to share a line with a
    // label in the side panel; `bcs-wide` lets the row stack there.
    if ((options || []).length >= 4 || (options || []).some((o) => o.icon && o.label)) seg.root.classList.add("bcs-wide");
    bind(seg.root, () => seg.set(get()));
    return seg.root;
  };

  C.select = function ({ get, set, options, ariaLabel }) {
    const sel = BC.ui.select({ value: get(), options, ariaLabel, onChange: (v) => set(v) });
    sel.classList.add("bcs-select");
    bind(sel, () => { const v = String(get()); if (sel.value !== v) sel.value = v; });
    return sel;
  };

  C.text = function ({ get, set, placeholder, ariaLabel, validate, type, wide }) {
    const wrap = el("div", { class: "bcs-text" + (wide ? " bcs-text--wide" : "") });
    const inp = BC.ui.input({ type: type || "text", placeholder, ariaLabel: ariaLabel || placeholder, value: get() || "" });
    const warn = el("div", { class: "bcs-text__warn" });
    inp.addEventListener("input", () => {
      const v = inp.value;
      if (validate) {
        const r = validate(v);
        if (r === true || r == null || r === "") { warn.textContent = ""; wrap.classList.remove("bcs-invalid"); set(v); }
        else { warn.textContent = String(r); wrap.classList.add("bcs-invalid"); }
      } else { set(v); }
    });
    wrap.append(inp, warn);
    // Never write into a field the user is typing in — that's what cost the caret.
    // Putting the saved value back also takes away the warning about the old text.
    bind(inp, () => {
      const v = get() ?? "";
      if (!focused(inp) && inp.value !== String(v)) { inp.value = String(v); warn.textContent = ""; wrap.classList.remove("bcs-invalid"); }
    });
    return wrap;
  };

  C.textarea = function ({ get, set, placeholder, rows, mono, ariaLabel }) {
    const ta = el("textarea", {
      class: "bc-textarea" + (mono ? " bc-textarea--mono" : ""), placeholder: placeholder || "",
      rows: rows || 4, "aria-label": ariaLabel || placeholder || "", spellcheck: mono ? "false" : null,
    });
    ta.value = get() || "";
    ta.addEventListener("input", () => set(ta.value));
    bind(ta, () => { const v = get() ?? ""; if (!focused(ta) && ta.value !== String(v)) ta.value = String(v); });
    return ta;
  };

  C.number = function ({ get, set, min, max, step, suffix, ariaLabel }) {
    const inp = BC.ui.input({ type: "number", ariaLabel, value: get() ?? "" });
    inp.classList.add("bcs-number__input");
    if (min != null) inp.min = min;
    if (max != null) inp.max = max;
    if (step != null) inp.step = step;
    // Live while the value is in range. Typing 250 used to apply 2, then 25, and
    // nothing stopped 4000. Leaving the field clamps it.
    const inRange = (v) => isFinite(v) && (min == null || v >= min) && (max == null || v <= max);
    inp.addEventListener("input", () => {
      const v = parseFloat(inp.value);
      if (inRange(v)) set(v);
    });
    inp.addEventListener("change", () => {
      let v = parseFloat(inp.value);
      if (!isFinite(v)) { inp.value = get() ?? ""; return; }
      if (min != null) v = Math.max(min, v);
      if (max != null) v = Math.min(max, v);
      set(v); inp.value = get() ?? v;
    });
    bind(inp, () => { const v = get(); if (!focused(inp) && inp.value !== String(v ?? "")) inp.value = v ?? ""; });
    return el("div", { class: "bcs-number" }, [inp, suffix ? el("span", { class: "bcs-number__suffix", text: suffix }) : null]);
  };

  C.time = function ({ get, set, ariaLabel }) {
    const inp = BC.ui.input({ type: "time", ariaLabel, value: get() || "" });
    inp.classList.add("bcs-time");
    inp.addEventListener("change", () => set(inp.value));
    bind(inp, () => { const v = get() || ""; if (!focused(inp) && inp.value !== v) inp.value = v; });
    return inp;
  };

  C.slider = function ({ get, set, min, max, step, format, ariaLabel }) {
    const rng = el("input", { type: "range", class: "bcs-range", min: min ?? 0, max: max ?? 100, step: step ?? 1, "aria-label": ariaLabel || null });
    rng.value = get() ?? 0;
    const val = el("span", { class: "bcs-slider__value bc-num" });
    const paint = (v) => {
      const t = format ? format(v) : String(v);
      if (val.textContent !== t) val.textContent = t;
      const lo = Number(rng.min), hi = Number(rng.max);
      rng.style.setProperty("--fill", (hi > lo ? ((Number(v) - lo) / (hi - lo)) * 100 : 0) + "%");
    };
    paint(get() ?? 0);
    // The readout updates on every input event (free, local); the store write is
    // throttled. A drag used to fire 30-60 writes a second.
    const commit = BC.util.throttle((v) => set(v), 100);
    rng.addEventListener("input", () => { const v = parseFloat(rng.value); paint(v); commit(v); });
    rng.addEventListener("change", () => set(parseFloat(rng.value)));
    bind(rng, () => {
      if (focused(rng)) return;             // never fight an in-progress drag
      const v = get();
      if (rng.value !== String(v)) rng.value = v;
      paint(v);
    });
    return el("div", { class: "bcs-slider" }, [rng, val]);
  };

  // Swatch + hex field. An empty value shows a "none" swatch rather than the
  // native picker's default black, which read as "black is selected".
  C.color = function ({ get, set, allowEmpty, presets, ariaLabel }) {
    const wrap = el("div", { class: "bcs-color" + (presets && presets.length ? " bcs-wide" : "") });
    const picker = el("input", { type: "color", class: "bcs-color__native", tabindex: "-1", "aria-hidden": "true" });
    const swatch = el("button", { type: "button", class: "bcs-color__swatch", "aria-label": (ariaLabel || "Color") + ": open picker" });
    const text = BC.ui.input({ size: "sm", placeholder: allowEmpty ? "None" : "#rrggbb", ariaLabel: (ariaLabel || "Color") + " hex value" });
    text.classList.add("bcs-color__hex");
    const paint = (v) => {
      const hex = BC.color.normalizeHex(v);
      swatch.classList.toggle("bcs-color__swatch--none", !hex);
      swatch.style.background = hex || "";
      if (hex && picker.value !== hex) picker.value = hex;
    };
    // Dragging in the native picker fires input continuously — throttle the store
    // write and take the definitive value on change.
    const commit = BC.util.throttle((v) => set(v), 100);
    // Anything that replaces the typed text with a real colour clears its warning.
    const valid = () => wrap.classList.remove("bcs-invalid");
    swatch.addEventListener("click", () => picker.click());
    picker.addEventListener("input", () => { text.value = picker.value; valid(); paint(picker.value); commit(picker.value); });
    picker.addEventListener("change", () => set(picker.value));
    text.addEventListener("input", () => {
      const v = text.value.trim();
      if (v === "" && allowEmpty) { wrap.classList.remove("bcs-invalid"); paint(""); set(""); return; }
      const hex = BC.color.normalizeHex(v);
      if (hex) { wrap.classList.remove("bcs-invalid"); paint(hex); set(hex); }
      else wrap.classList.add("bcs-invalid");
    });
    const kids = [picker, swatch, text];
    if (presets && presets.length) {
      const row = el("div", { class: "bcs-color__presets" }, presets.map((p) => {
        const b = el("button", { type: "button", class: "bcs-color__preset", title: p, "aria-label": "Use " + p });
        b.style.background = p;
        b.addEventListener("click", () => { text.value = p; valid(); paint(p); set(p); });
        return b;
      }));
      kids.push(row);
    }
    if (allowEmpty) {
      kids.push(BC.ui.iconButton("x", { label: "Clear color", size: "sm", onClick: () => { text.value = ""; valid(); paint(""); set(""); } }));
    }
    wrap.append(...kids);
    const sync = () => {
      const v = get() || "";
      if (!focused(text) && text.value !== v) { text.value = v; valid(); }
      paint(v);
    };
    sync();
    bind(wrap, sync);
    return wrap;
  };

  // Large radio cards with a small drawn preview, for choices that change how a
  // whole area looks — where a single word ("Clean") says too little.
  // options: [{ value, label, description, preview: () => Node }]
  C.choice = function ({ get, set, options, ariaLabel }) {
    const root = el("div", { class: "bcs-choice bcs-wide", role: "radiogroup", "aria-label": ariaLabel || "" });
    const cards = (options || []).map((o) => {
      const b = el("button", { type: "button", class: "bcs-choice__card", role: "radio", "data-value": String(o.value) }, [
        el("span", { class: "bcs-choice__preview", "aria-hidden": "true" }, [o.preview ? o.preview() : null]),
        el("span", { class: "bcs-choice__text" }, [
          el("span", { class: "bcs-choice__label", text: o.label }),
          o.description ? el("span", { class: "bcs-choice__desc", text: o.description }) : null,
        ]),
        el("span", { class: "bcs-choice__tick", "aria-hidden": "true" }, [BC.ui.icon("check")]),
      ]);
      b.addEventListener("click", () => { paint(o.value); set(o.value); });
      return b;
    });
    root.append(...cards);
    root.addEventListener("keydown", (e) => {
      if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
      const i = cards.findIndex((b) => b.getAttribute("aria-checked") === "true");
      const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : cards.length - 1;
      const n = cards[(i + step) % cards.length];
      e.preventDefault(); n.focus(); n.click();
    });
    function paint(v) {
      for (const b of cards) {
        const on = b.dataset.value === String(v);
        b.setAttribute("aria-checked", on ? "true" : "false");
        b.tabIndex = on ? 0 : -1;
      }
    }
    paint(get());
    bind(root, () => paint(get()));
    return root;
  };

  // Toggle chips over an object of on/off flags. A missing key counts as on, so a
  // kind added later shows up by default.
  // options: [{ key, label, icon }]; get() -> { key: bool }; set(nextObject)
  C.chips = function ({ get, set, options, ariaLabel }) {
    const root = el("div", { class: "bcs-chips bcs-wide", role: "group", "aria-label": ariaLabel || "" });
    const btns = (options || []).map((o) => {
      const b = el("button", { type: "button", class: "bcs-chipbtn", "aria-pressed": "true", "data-key": o.key }, [
        el("span", { class: "bcs-chipbtn__check", "aria-hidden": "true" }, [BC.ui.icon("check")]),
        o.icon ? BC.ui.icon(o.icon) : null,
        el("span", { text: o.label }),
      ]);
      b.addEventListener("click", () => {
        const cur = Object.assign({}, get() || {});
        cur[o.key] = cur[o.key] === false;
        set(cur);
        paint();
      });
      return b;
    });
    root.append(...btns);
    function paint() {
      const cur = get() || {};
      for (const b of btns) {
        const on = cur[b.dataset.key] !== false ? "true" : "false";
        if (b.getAttribute("aria-pressed") !== on) b.setAttribute("aria-pressed", on);
      }
    }
    paint();
    bind(root, paint);
    return root;
  };

  C.button = function ({ label, onClick, variant, icon, size }) {
    return BC.ui.button(label, { variant, icon, size, onClick });
  };

  // Drag-sortable list. items: [{id, ...}]. onChange(orderedIds).
  C.sortable = function ({ items, render, onChange }) {
    const list = el("ul", { class: "bcs-sortable" });
    items.forEach((it) => {
      const li = el("li", { class: "bcs-sortable__item", draggable: "true", "data-id": String(it.id) }, [
        // A span, not a button: Firefox won't start a drag on a button.
        el("span", { class: "bcs-sortable__grip", tabindex: "0", role: "button", title: "Drag, or focus and press the arrow keys, to reorder",
          "aria-label": "Reorder. Press up or down arrow to move." }, [BC.ui.icon("grip")]),
        render(it),
      ]);
      list.appendChild(li);
    });
    // Keyboard users had no way to reorder at all.
    list.addEventListener("keydown", (e) => {
      const grip = e.target.closest && e.target.closest(".bcs-sortable__grip");
      if (!grip || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      e.preventDefault(); e.stopPropagation();
      const li = grip.closest(".bcs-sortable__item");
      const to = e.key === "ArrowUp" ? li.previousElementSibling : li.nextElementSibling;
      if (!to) return;
      list.insertBefore(li, e.key === "ArrowUp" ? to : to.nextSibling);
      grip.focus();
      onChange(order());
    });
    // Most touch browsers never start an HTML drag, so a finger on the grip moves
    // the row directly. The neighbours move rather than the dragged row, which
    // keeps the grip in place and its pointer capture intact.
    list.addEventListener("pointerdown", (e) => {
      const grip = e.target.closest && e.target.closest(".bcs-sortable__grip");
      if (!grip || e.pointerType === "mouse") return;
      e.preventDefault();
      const li = grip.closest(".bcs-sortable__item"), before = order().join(",");
      try { grip.setPointerCapture(e.pointerId); } catch (_) {}
      li.classList.add("bcs-dragging");
      const mid = (n) => { const r = n.getBoundingClientRect(); return r.top + r.height / 2; };
      const move = (ev) => {
        for (let n; (n = li.nextElementSibling) && ev.clientY > mid(n);) list.insertBefore(n, li);
        for (let p; (p = li.previousElementSibling) && ev.clientY < mid(p);) list.insertBefore(p, li.nextSibling);
      };
      const end = () => {
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", end);
        grip.removeEventListener("pointercancel", end);
        li.classList.remove("bcs-dragging");
        if (order().join(",") !== before) onChange(order());
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", end);
      grip.addEventListener("pointercancel", end);
    });
    // Events are stopped here: on the dashboard, Canvas's own drag-and-drop library
    // listens on window and marks every drag it doesn't own as undroppable, so
    // "drop" never fired and a new order was shown but never saved. The order is
    // also saved on dragend, which fires even if a drop is refused.
    let dragEl = null, startOrder = "";
    const order = () => Array.from(list.children).map((li) => li.getAttribute("data-id"));
    list.addEventListener("dragstart", (e) => {
      const li = e.target.closest && e.target.closest(".bcs-sortable__item");
      if (!li) return;
      e.stopPropagation();
      dragEl = li; li.classList.add("bcs-dragging");
      startOrder = order().join(",");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", li.getAttribute("data-id") || "");
    });
    list.addEventListener("dragend", (e) => {
      e.stopPropagation();
      if (dragEl) dragEl.classList.remove("bcs-dragging");
      dragEl = null;
      if (order().join(",") !== startOrder) onChange(order());
      startOrder = order().join(",");
    });
    list.addEventListener("dragover", (e) => {
      if (!dragEl) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      const over = e.target.closest && e.target.closest(".bcs-sortable__item");
      if (!over || over === dragEl) return;
      const rect = over.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      list.insertBefore(dragEl, before ? over : over.nextSibling);
    });
    list.addEventListener("drop", (e) => {
      if (!dragEl) return;
      e.preventDefault();
      e.stopPropagation();
    });
    return list;
  };

  // Chip-style tag input.
  C.tags = function ({ get, set, placeholder }) {
    const wrap = el("div", { class: "bcs-tags" });
    const chips = el("div", { class: "bcs-tags__chips" });
    const inp = BC.ui.input({ size: "sm", placeholder: placeholder || "Add a tag…", ariaLabel: placeholder || "Add a tag" });
    inp.classList.add("bcs-tags__input");
    function refresh() {
      wrap.dataset.bcSig = (get() || []).join("\n");
      chips.replaceChildren(...(get() || []).map((t) => BC.ui.chip(t, {
        onRemove: () => { set((get() || []).filter((x) => x !== t)); refresh(); },
      })));
    }
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        const v = inp.value.trim();
        if (v && !(get() || []).includes(v)) { set([...(get() || []), v]); refresh(); }
        inp.value = "";
      } else if (e.key === "Backspace" && !inp.value) {
        const arr = (get() || []).slice(); arr.pop(); set(arr); refresh();
      }
    });
    refresh();
    wrap.append(chips, inp);
    bind(wrap, () => { if (wrap.dataset.bcSig !== (get() || []).join("\n")) refresh(); });
    return wrap;
  };

  // Custom-link editor.
  C.links = function ({ get, set }) {
    const wrap = el("div", { class: "bcs-links" });
    function render() {
      wrap.dataset.bcSig = String((get() || []).length);
      const rows = (get() || []).map((lnk) => {
        const patch = (values) => set((get() || []).map((link) => link.id === lnk.id ? { ...link, ...values } : link));
        const label = BC.ui.input({ size: "sm", placeholder: "Label", ariaLabel: "Link label", value: lnk.label || "" });
        label.addEventListener("input", () => { patch({ label: label.value }); });
        const url = BC.ui.input({ size: "sm", type: "text", placeholder: "https://… or /courses/…", ariaLabel: "Link URL", value: lnk.url || "" });
        // The menu skips anything else, so say so here instead of dropping it.
        const valid = () => {
          const v = url.value.trim();
          const ok = !v || BC.util.isSafeHttpUrl(v) || /^\/(?!\/)\S*$/.test(v);
          url.toggleAttribute("aria-invalid", !ok);
          url.title = ok ? "" : "Use a full address starting with https://, or a Canvas path starting with /";
        };
        url.addEventListener("input", () => { patch({ url: url.value.trim() }); valid(); });
        valid();
        const tab = BC.ui.checkbox({ checked: !!lnk.newTab, label: "New tab", onChange: (v) => { patch({ newTab: v }); } });
        const del = BC.ui.iconButton("trash", { label: "Remove link", size: "sm", onClick: () => { set((get() || []).filter((link) => link.id !== lnk.id)); render(); } });
        return el("div", { class: "bcs-links__row" }, [label, url, tab, del]);
      });
      const add = BC.ui.button("Add link", { icon: "plus", size: "sm", onClick: () => { set([...(get() || []), { id: BC.util.uuid(), label: "", url: "", newTab: true }]); render(); } });
      wrap.replaceChildren(...rows, el("div", null, [add]));
    }
    render();
    // Key on LENGTH only: keying on content would rebuild the row mid-typing.
    bind(wrap, () => { if (wrap.dataset.bcSig !== String((get() || []).length)) render(); });
    return wrap;
  };

  // Keybinding recorder.
  const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "OS", "AltGraph", "Hyper", "Super"]);
  C.keybind = function ({ get, set, ariaLabel }) {
    const btn = el("button", { class: "bcs-key", type: "button", "aria-label": (ariaLabel || "Shortcut") + ": click to record" });
    let recording = false;
    let chordBuf = "";
    let chordTO = null;
    function refresh() {
      btn.classList.toggle("bcs-key--recording", recording);
      if (recording) { btn.textContent = "Press keys…"; return; }
      const combo = get() || "";
      if (!combo) { btn.textContent = "Not set"; return; }
      // "Mod+Shift+K" -> ⌘ ⇧ K as separate keycaps; chords ("g d") keep their space.
      btn.replaceChildren(...combo.split(" ").flatMap((part, i) => {
        const caps = BC.shortcuts.prettify(part).split("+").map((k) => el("kbd", { class: "bc-kbd", text: k }));
        return i ? [el("span", { class: "bcs-key__then", text: "then" }), ...caps] : caps;
      }));
    }
    refresh();
    btn.addEventListener("click", () => { recording = true; refresh(); btn.focus(); });
    // Cancel a pending chord too: its timer used to fire after the blur had already
    // emptied chordBuf, saving "" and silently unbinding the shortcut.
    btn.addEventListener("blur", () => { recording = false; chordBuf = ""; clearTimeout(chordTO); refresh(); });
    btn.addEventListener("keydown", (e) => {
      if (!recording) return;
      // Escape cancels recording only — it must not also close the settings panel.
      if (e.key === "Escape") { e.stopPropagation(); recording = false; refresh(); btn.blur(); return; }
      // Tab and Shift+Tab still move focus. Recording them bound Tab itself and
      // broke keyboard navigation on every Canvas page.
      if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey) { recording = false; chordBuf = ""; clearTimeout(chordTO); refresh(); return; }
      e.preventDefault();
      const bare = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
      if (bare && (e.key === "Backspace" || e.key === "Delete")) { chordBuf = ""; clearTimeout(chordTO); set(""); recording = false; refresh(); btn.blur(); return; }
      if (bare && (e.key === "Enter" || e.key === " ")) return;
      // A modifier on its own is the START of a combo, not a combo.
      if (MODIFIER_KEYS.has(e.key)) return;
      const parts = [];
      if (e.metaKey || e.ctrlKey) parts.push("Mod");
      if (e.shiftKey) parts.push("Shift");
      if (e.altKey) parts.push("Alt");
      // With Alt held, macOS reports the Option-character (⌥T is "†"); record the
      // physical letter so the binding reads as Alt+T and matches on every OS.
      const physical = e.altKey && /^(Key[A-Z]|Digit[0-9])$/.test(e.code || "") ? e.code.slice(-1) : null;
      // Space and "+" get names: a literal space split the combo into a chord and a
      // literal "+" split it at the wrong place, so neither binding could ever fire.
      if (physical) parts.push(physical);
      else if (e.key === " ") parts.push("Space");
      else if (e.key === "+") parts.push("Plus");
      else if (e.key.length === 1) parts.push(e.key.toUpperCase());
      else parts.push(e.key);
      const combo = parts.join("+");
      if (chordBuf) {
        set(chordBuf + " " + (e.key || "").toLowerCase());
        chordBuf = ""; clearTimeout(chordTO); recording = false; refresh(); btn.blur();
      } else if (parts.length === 1 && e.key && e.key.length === 1) {
        // A plain letter may be the first key of a chord ("g" then "d").
        chordBuf = (e.key || "").toLowerCase();
        chordTO = setTimeout(() => { set(chordBuf); chordBuf = ""; recording = false; refresh(); btn.blur(); }, 800);
      } else {
        set(combo); recording = false; refresh(); btn.blur();
      }
    });
    bind(btn, () => { if (!recording) refresh(); });
    return btn;
  };

  // A list entry with a title, a meta line and trailing actions.
  C.item = function ({ title, meta, leading, actions }) {
    return el("div", { class: "bcs-item" }, [
      leading || null,
      el("div", { class: "bcs-item__text" }, [
        el("div", { class: "bcs-item__title bc-truncate", text: title }),
        meta ? el("div", { class: "bcs-item__meta bc-truncate", text: meta }) : null,
      ]),
      actions ? el("div", { class: "bcs-item__actions" }, [].concat(actions)) : null,
    ]);
  };
})();
