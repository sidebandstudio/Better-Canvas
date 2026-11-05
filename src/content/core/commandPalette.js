/* Better Canvas — command palette (⌘K). */
(function () {
  "use strict";
  const BC = (globalThis.BC = globalThis.BC || {});

  const CSS = `
    .bc-cp-back {
      position: fixed; inset: 0; background: var(--bc-overlay, rgba(0,0,0,.35));
      z-index: var(--bc-z-palette, 2147483000);
      display: flex; align-items: flex-start; justify-content: center;
      padding-top: 12vh;
      font-family: var(--bc-font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
      font-size: var(--bc-text-lg, 15px); line-height: 1.4;
      animation: bc-cp-fade var(--bc-dur-3, 220ms) var(--bc-ease-out, ease);
    }
    @keyframes bc-cp-fade { from { opacity: 0; } to { opacity: 1; } }
    :root[data-bc-motion="0"] .bc-cp-back { animation: none; }
    @media (prefers-reduced-motion: reduce) { .bc-cp-back { animation: none; } }
    .bc-cp {
      width: min(640px, 92vw);
      background: var(--bc-surface-2, #fff); color: var(--bc-text, #1f2937);
      border: 1px solid var(--bc-border, #e5e7eb);
      border-radius: var(--bc-radius-xl, 12px);
      box-shadow: var(--bc-shadow-4, 0 30px 80px rgba(0,0,0,.35));
      overflow: hidden;
    }
    .bc-cp input {
      width: 100%; padding: var(--bc-space-6, 14px) var(--bc-space-7, 16px);
      border: 0; outline: none; font-family: inherit; font-size: var(--bc-text-lg, 15px);
      border-bottom: 1px solid var(--bc-border, #eef1f4);
      background: transparent; color: inherit;
    }
    .bc-cp-list { max-height: 60vh; overflow: auto; }
    .bc-cp-item {
      display: flex; align-items: center; gap: var(--bc-space-4, 10px);
      padding: var(--bc-space-4, 10px) var(--bc-space-6, 14px); cursor: pointer;
    }
    .bc-cp-item.active { background: var(--bc-accent-weak, rgba(79,70,229,.12)); }
    .bc-cp-item .bc-cp-title { flex: 1; }
    .bc-cp-item .bc-cp-hint  { font-size: var(--bc-text-xs, 12px); color: var(--bc-text-subtle, var(--bc-muted, #6b7280)); }
    .bc-cp-empty { padding: var(--bc-space-8, 20px); color: var(--bc-muted, #6b7280); text-align: center; }
    .bc-cp-group {
      padding: var(--bc-space-2, 6px) var(--bc-space-6, 14px);
      font-size: var(--bc-text-2xs, 11px); text-transform: uppercase;
      letter-spacing: var(--bc-tracking-caps, .04em); color: var(--bc-muted, #6b7280);
    }
  `;

  let open = false;
  // A Map, not an array. register() used to do commands.filter().concat() — O(n) per
  // call, and content.js re-registered ~50 commands on every applyAll.
  const commands = new Map();
  let selected = 0;
  let visible = [];          // computed once per render, reused by pick/keydown
  let backEl = null;
  let inputEl = null;
  let listEl = null;
  let trap = null;

  function register(cmd) { if (cmd && cmd.id) commands.set(cmd.id, cmd); }
  function unregister(id) { commands.delete(id); }

  function score(cmd, q) {
    if (!q) return 1;
    const t = (cmd.title + " " + (cmd.group || "")).toLowerCase();
    q = q.toLowerCase();
    if (t === q) return 100;
    if (t.startsWith(q)) return 80;
    let idx = 0, hits = 0;
    for (const ch of q) { const p = t.indexOf(ch, idx); if (p < 0) return 0; hits += 1 / (p - idx + 1); idx = p + 1; }
    return hits;
  }

  function compute(filter) {
    const s = BC.storage && BC.storage.current;
    return Array.from(commands.values())
      .filter((c) => !c.when || c.when(s))
      .map((c) => ({ c, s: score(c, filter) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);
  }

  // Toggling two classes, NOT re-rendering. The old code re-rendered on mouseenter,
  // which destroyed the row under the cursor; its replacement then fired mouseenter
  // again, so the list flickered and keyboard selection could jump.
  function setSelected(i) {
    selected = Math.max(0, Math.min(visible.length - 1, i));
    const rows = listEl.querySelectorAll(".bc-cp-item");
    rows.forEach((n, j) => {
      const on = j === selected;
      if (n.classList.contains("active") !== on) n.classList.toggle("active", on);
      n.setAttribute("aria-selected", on ? "true" : "false");
      if (on) {
        inputEl.setAttribute("aria-activedescendant", n.id);
        n.scrollIntoView({ block: "nearest" });
      }
    });
  }

  function render(filter) {
    visible = compute(filter);
    listEl.innerHTML = "";
    if (!visible.length) {
      const e = document.createElement("div");
      e.className = "bc-cp-empty";
      e.textContent = "No results";
      listEl.appendChild(e);
      inputEl.removeAttribute("aria-activedescendant");
      return;
    }
    let lastGroup = "";
    visible.forEach(({ c }, i) => {
      if ((c.group || "") !== lastGroup) {
        lastGroup = c.group || "";
        if (lastGroup) {
          const g = document.createElement("div");
          g.className = "bc-cp-group";
          g.setAttribute("role", "presentation");
          g.textContent = lastGroup;
          listEl.appendChild(g);
        }
      }
      const el = document.createElement("div");
      el.className = "bc-cp-item";
      el.id = "bc-cp-opt-" + i;
      el.setAttribute("role", "option");
      el.setAttribute("aria-selected", "false");
      el.addEventListener("mouseenter", () => setSelected(i));
      el.addEventListener("click", () => pick(i));
      const t = document.createElement("div"); t.className = "bc-cp-title"; t.textContent = c.title;
      const h = document.createElement("div"); h.className = "bc-cp-hint"; h.textContent = c.hint || "";
      el.appendChild(t); el.appendChild(h);
      listEl.appendChild(el);
    });
    setSelected(selected);
  }

  function pick(i) {
    const target = visible[i];
    close();
    if (target) BC.util.guard(() => target.c.run(), "palette:" + target.c.id);
  }

  function openPalette() {
    if (open) return;
    open = true;
    BC.injector && BC.injector.setStyle("bc-cp-css", CSS);
    backEl = document.createElement("div");
    backEl.className = "bc-cp-back";
    backEl.setAttribute("data-bc-node", "bc-cp");
    backEl.addEventListener("mousedown", (e) => { if (e.target === backEl) close(); });

    const cp = document.createElement("div");
    cp.className = "bc-cp";
    cp.setAttribute("role", "dialog");
    cp.setAttribute("aria-modal", "true");
    cp.setAttribute("aria-label", "Command palette");

    inputEl = document.createElement("input");
    inputEl.type = "text";                 // not "search": the UA clear button steals a tab stop
    inputEl.placeholder = "Type a command or search…";
    inputEl.setAttribute("aria-label", "Search commands");
    inputEl.setAttribute("role", "combobox");
    inputEl.setAttribute("aria-expanded", "true");
    inputEl.setAttribute("aria-controls", "bc-cp-listbox");
    inputEl.setAttribute("aria-autocomplete", "list");
    inputEl.setAttribute("autocomplete", "off");

    listEl = document.createElement("div");
    listEl.className = "bc-cp-list";
    listEl.id = "bc-cp-listbox";
    listEl.setAttribute("role", "listbox");
    listEl.setAttribute("aria-label", "Commands");

    cp.appendChild(inputEl); cp.appendChild(listEl);
    backEl.appendChild(cp);
    document.documentElement.appendChild(backEl);

    selected = 0;
    inputEl.addEventListener("input", () => { selected = 0; render(inputEl.value); });
    // A click on the list or a group heading would move focus to the page, and
    // the keys below only work from the input.
    cp.addEventListener("mousedown", (e) => { if (e.target !== inputEl) e.preventDefault(); });
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelected(selected + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSelected(selected - 1); }
      else if (e.key === "Home") { e.preventDefault(); setSelected(0); }
      else if (e.key === "End") { e.preventDefault(); setSelected(visible.length - 1); }
      else if (e.key === "Enter") { e.preventDefault(); pick(selected); }
      else if (e.key === "Escape") { e.preventDefault(); close(); }
    });

    render("");
    // Focus trap also restores focus on close — previously closing dropped focus to
    // <body>, losing the user's place on the page entirely.
    if (BC.ui && BC.ui.focusTrap) trap = BC.ui.focusTrap(backEl, { initial: inputEl });
    else setTimeout(() => inputEl.focus(), 0);
  }

  function close() {
    open = false;
    if (trap) { BC.util.guard(() => trap.release(), "palette focus"); trap = null; }
    if (backEl && backEl.parentNode) backEl.parentNode.removeChild(backEl);
    backEl = null; inputEl = null; listEl = null; visible = [];
  }

  BC.palette = {
    register, unregister, open: openPalette, close,
    isOpen() { return open; },
  };
})();
