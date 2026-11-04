/*
 * Better Canvas — productivity toolkit.
 * Focus mode, reading ruler, sticky notes per page, auto-save drafts, word/char
 * count on textareas, reading-progress bar, and one quick-actions button (copy
 * link, print, focus mode, new note) in place of a stack of floating pills.
 */
(function () {
  "use strict";
  const BC = (globalThis.BC = globalThis.BC || {});
  BC.features = BC.features || {};

  const CSS = `
    /* Canvas's own chrome only. A bare header selector also hid banners inside
       course pages. */
    .bc-focus #left-side, .bc-focus #right-side, .bc-focus .ic-app-header,
    .bc-focus .ic-app-crumbs { display: none !important; }
    .bc-focus #main, .bc-focus #wrapper { margin: 0 !important; padding: 20px !important; max-width: 900px !important; }

    .bc-ruler {
      position: fixed; left: 0; right: 0; height: 30px;
      background: var(--bc-ruler-tint, rgba(255,235,59,.15));
      pointer-events: none; z-index: var(--bc-z-hud, 2147481000);
      border-top: 1px solid rgba(255,235,59,.4); border-bottom: 1px solid rgba(255,235,59,.4);
      transition: top .05s linear;
    }

    .bc-progress-bar {
      position: fixed; top: 0; left: 0; height: 3px;
      background: var(--bc-accent-stroke, var(--bc-accent, #0374b5));
      width: 0%; z-index: var(--bc-z-hud, 2147481000);
      transition: width var(--bc-dur-2, 150ms) var(--bc-ease-out, ease);
    }

    /* Deliberately NOT theme surfaces — the paper metaphor is the point — but it
       needs a dark variant, which it never had: it was a glaring white rectangle
       in dark mode. */
    .bc-note {
      position: absolute; z-index: var(--bc-z-underlay, 2147480500);
      background: var(--bc-note-bg, #fffbe6);
      color: var(--bc-note-text, #1f1a05);
      border: 1px solid var(--bc-note-border, #f6d67a);
      padding: 6px 8px; border-radius: var(--bc-radius-md, 6px);
      font-family: var(--bc-font-sans); font-size: var(--bc-text-sm, 13px); min-width: 140px;
      box-shadow: var(--bc-shadow-2, 0 4px 12px rgba(0,0,0,.14));
      resize: both; overflow: auto;
    }
    .bc-note-head { display: flex; justify-content: space-between; align-items: center; font-size: var(--bc-text-2xs, 11px); margin-bottom: 4px; cursor: move; }
    .bc-note textarea { width: 100%; min-height: 60px; border: 0; background: transparent; resize: none; outline: none; font-family: inherit; }
    .bc-note-x { background: none; border: 0; cursor: pointer; }

    .bc-wc {
      display: block; margin: 2px 0 0; text-align: right;
      font-size: var(--bc-text-2xs, 11px); color: var(--bc-muted, #6b7280);
      pointer-events: none; font-variant-numeric: tabular-nums;
    }

    /* Print the page content in black on white: no Canvas menus, none of our
       overlays, and no dark-mode colours on paper. */
    @media print {
      [data-bc-node], .ic-app-header, #left-side, #right-side, .ic-app-crumbs { display: none !important; }
      html.bc-dark, html.bc-dark body, html.bc-dark #main, html.bc-dark #content { background: #fff !important; }
      html.bc-dark * { color: #000 !important; background-color: transparent !important; border-color: #ccc !important; }
      #main, #wrapper, #not_right_side { margin: 0 !important; padding: 0 !important; max-width: none !important; }
    }
  `;

  // ---- Focus mode ------
  function applyFocus(on) { document.documentElement.classList.toggle("bc-focus", !!on); }

  // ---- Reading ruler ----
  let rulerEl = null;
  function onRulerMove(e) {
    if (!rulerEl) return;
    rulerEl.style.top = Math.max(0, e.clientY - 15) + "px";
  }
  function installRuler() {
    if (rulerEl) return;
    rulerEl = document.createElement("div");
    rulerEl.className = "bc-ruler";
    rulerEl.setAttribute("data-bc-node", "bc-ruler");
    document.body.appendChild(rulerEl);
    document.addEventListener("mousemove", onRulerMove);
  }
  function uninstallRuler() {
    document.removeEventListener("mousemove", onRulerMove);
    if (rulerEl && rulerEl.parentNode) rulerEl.remove();
    rulerEl = null;
  }

  // ---- Reading progress ----
  let progressEl = null;
  function onProgressScroll() {
    if (!progressEl) return;
    const h = document.documentElement.scrollHeight - window.innerHeight;
    const pct = h > 0 ? (window.scrollY / h) * 100 : 0;
    progressEl.style.width = Math.max(0, Math.min(100, pct)) + "%";
  }
  function installProgress() {
    if (progressEl) return;
    progressEl = document.createElement("div");
    progressEl.className = "bc-progress-bar";
    progressEl.setAttribute("data-bc-node", "bc-progress-bar");
    document.body.appendChild(progressEl);
    window.addEventListener("scroll", onProgressScroll, { passive: true });
    onProgressScroll();
  }
  function uninstallProgress() {
    window.removeEventListener("scroll", onProgressScroll);
    if (progressEl && progressEl.parentNode) progressEl.remove();
    progressEl = null;
  }

  // ---- Quick actions ----
  // One quiet round button bottom-right. It replaces the Print and Copy URL pills,
  // which were loud accent-coloured blocks stacked over Canvas content.
  const QUICK_CSS = `
:host { position: fixed; right: 16px; bottom: 16px; z-index: var(--bc-z-dock, 2147480000); }
.qa {
  display: grid; place-items: center; width: 40px; height: 40px; margin: 0; padding: 0;
  border: 1px solid var(--bc-border, #e4e4e7); border-radius: 50%;
  background: var(--bc-surface-2, #fff); color: var(--bc-muted, #6b6b74); box-shadow: var(--bc-shadow-2, 0 4px 12px rgba(0,0,0,.08));
  cursor: pointer; animation: qa-in var(--bc-dur-4, 300ms) var(--bc-ease-out, ease) both;
  transition: color var(--bc-dur-2, 150ms) ease, box-shadow var(--bc-dur-2, 150ms) ease, transform var(--bc-dur-2, 150ms) var(--bc-ease-out, ease);
}
.qa:hover { color: var(--bc-text, #18181b); box-shadow: var(--bc-shadow-3, 0 12px 32px rgba(0,0,0,.12)); transform: translateY(-2px); }
.qa:active { transform: scale(.94); }
.qa[aria-expanded="true"] { color: var(--bc-accent-text, #4338ca); }
.qa:focus-visible { outline: 2px solid var(--bc-focus-ring, #4f46e5); outline-offset: 2px; }
.qa .bc-icon { width: 18px; height: 18px; transition: transform var(--bc-dur-3, 220ms) var(--bc-ease-spring, ease); }
.qa[aria-expanded="true"] .bc-icon { transform: rotate(-12deg) scale(1.08); }
@keyframes qa-in { from { opacity: 0; transform: scale(.7); filter: blur(4px); } }
@media (prefers-reduced-motion: reduce) { .qa { animation: none; } }
`;

  function copyUrl() {
    // writeText rejects when the page lacks focus or clipboard permission; that
    // used to surface as an unhandled rejection and no feedback at all.
    navigator.clipboard.writeText(location.href)
      .then(() => BC.toast.success("Link copied"))
      .catch(() => BC.toast.error("Couldn't copy the link"));
  }

  function openQuickMenu(anchor, opts) {
    const p = (BC.storage.current && BC.storage.current.productivity) || {};
    BC.ui.menu(anchor, [
      p.copyUrlButton !== false ? { label: "Copy link to this page", icon: "link", onClick: copyUrl } : null,
      p.printFriendly !== false ? { label: "Print this page", icon: "printer", onClick: () => window.print() } : null,
      { label: p.focusMode ? "Leave focus mode" : "Focus mode", icon: "target",
        onClick: () => BC.storage.update((d) => { d.productivity.focusMode = !d.productivity.focusMode; }) },
      p.stickyNotes ? { label: "New sticky note", icon: "edit", onClick: () => BC.quickNote() } : null,
      { separator: true },
      BC.palette ? { label: "Command palette", icon: "command", onClick: () => BC.palette.open() } : null,
      BC.features.settingsPanel ? { label: "Better Canvas settings", icon: "settings", onClick: () => BC.features.settingsPanel.open() } : null,
    ].filter(Boolean), opts);
  }

  // A "Tools" item in Canvas's left nav, under Better Canvas: a floating button
  // bottom-right sat on top of whatever was there, including the planner's last
  // rows. The floating button stays as the fallback where the nav is hidden (focus
  // mode hides it — and the menu is how you leave focus mode).
  function installQuick(p) {
    const menu = !p.focusMode && document.querySelector("#menu");
    if (menu) {
      BC.injector.removeNode("bc-quick");
      if (document.getElementById("bc-open-tools")) return;
      const li = document.createElement("li");
      li.className = "ic-app-header__menu-list-item";
      li.setAttribute("data-bc-node", "bc-nav-tools");
      const a = document.createElement("a");
      a.id = "bc-open-tools";
      a.href = "#";
      a.className = "ic-app-header__menu-list-link";
      a.setAttribute("role", "button");
      a.setAttribute("aria-haspopup", "menu");
      a.setAttribute("aria-expanded", "false");
      a.innerHTML = '<div class="menu-item-icon-container" aria-hidden="true">' + BC.icons.svg("zap", { size: 26, stroke: 1.75 }) +
        '</div><div class="menu-item__text">Tools</div>';
      // A second click closes the menu instead of reopening it.
      const openIt = (e) => {
        e.preventDefault();
        if (a.getAttribute("aria-expanded") === "true") { BC.ui.closePopovers(); return; }
        openQuickMenu(a, { align: "side" });
      };
      a.addEventListener("click", openIt);
      a.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Spacebar") openIt(e); });
      li.appendChild(a);
      const ours = menu.querySelector('[data-bc-node="bc-nav-open"]');
      menu.insertBefore(li, ours ? ours.nextSibling : null);
      return;
    }
    BC.injector.removeNode("bc-nav-tools");
    const m = BC.ui.mount("bc-quick", { css: QUICK_CSS });
    if (!m.fresh) return;
    const btn = BC.ui.el("button", { class: "qa", type: "button", "aria-label": "Quick actions", "aria-haspopup": "menu", title: "Quick actions" },
      [BC.ui.icon("zap")]);
    btn.addEventListener("click", () => { if (btn.getAttribute("aria-expanded") === "true") BC.ui.closePopovers(); else openQuickMenu(btn); });
    m.body.append(btn);
  }

  // ---- Sticky notes ----
  function pageKey() { return location.origin + location.pathname; }
  function loadNotes() {
    return (BC.storage.local && BC.storage.local.notes && BC.storage.local.notes[pageKey()]) || [];
  }
  function editNotes(mutator) {
    const key = pageKey();
    return BC.storage.updateLocal((d) => {
      d.notes = d.notes || {};
      const list = mutator(d.notes[key] || []);
      if (list.length) d.notes[key] = list; else delete d.notes[key];
    });
  }

  // ONE delegated drag, installed once — not a pair of document-level listeners
  // per note per apply(). buildNote used to attach mousemove+mouseup to document
  // and never remove them, while renderNotes rebuilt every note on every tick:
  // ~10 new permanent mousemove handlers per second, which froze the tab within
  // a minute of browsing.
  let dragEl = null, dragOx = 0, dragOy = 0;
  function installNoteDrag() {
    const bag = BC.lifecycle.pageBag("productivity");
    bag.once("note-drag", () => {
      bag.listen(document, "mousedown", (e) => {
        const head = e.target.closest && e.target.closest(".bc-note-head");
        if (!head) return;
        dragEl = head.closest(".bc-note");
        if (!dragEl) return;
        // page*, not client*: notes are absolutely positioned in DOCUMENT
        // coordinates, so on a scrolled page the viewport-relative offset made the
        // note jump by the scroll distance the moment a drag started.
        dragOx = e.pageX - dragEl.offsetLeft;
        dragOy = e.pageY - dragEl.offsetTop;
        e.preventDefault();
      });
      bag.listen(document, "mousemove", (e) => {
        if (!dragEl) return;
        dragEl.style.left = (e.pageX - dragOx) + "px";
        dragEl.style.top = (e.pageY - dragOy) + "px";
      });
      bag.listen(document, "mouseup", () => {
        if (!dragEl) return;
        const el = dragEl, id = el.dataset.noteId;
        dragEl = null;
        const x = el.offsetLeft, y = el.offsetTop;
        editNotes((notes) => notes.map((n) => n.id === id ? { ...n, x, y } : n));
      });
    });
  }

  // Reconcile by id rather than remove-and-rebuild, so a note being typed into
  // or dragged is never destroyed underneath the user.
  function syncNotes() {
    installNoteDrag();
    const arr = loadNotes();
    const want = new Set(arr.map((n) => n.id));
    const existing = new Map();
    for (const el of document.querySelectorAll('[data-bc-node="bc-note"]')) {
      if (want.has(el.dataset.noteId)) existing.set(el.dataset.noteId, el);
      else el.remove();
    }
    for (const note of arr) {
      const el = existing.get(note.id);
      if (!el) { buildNote(note); continue; }
      const ta = el.querySelector("textarea");
      if (ta && !ta.dataset.bcDirty && ta.getRootNode().activeElement !== ta && ta.value !== (note.text || "")) ta.value = note.text || "";
      if (el !== dragEl) {
        const x = (note.x || 100) + "px", y = (note.y || 100) + "px";
        if (el.style.left !== x) el.style.left = x;
        if (el.style.top !== y) el.style.top = y;
      }
    }
  }

  function buildNote(note) {
    const el = document.createElement("div");
    el.className = "bc-note";
    el.setAttribute("data-bc-node", "bc-note");
    el.dataset.noteId = note.id;
    el.style.left = (note.x || 100) + "px";
    el.style.top = (note.y || 100) + "px";
    el.innerHTML = `
      <div class="bc-note-head"><span>note</span><button class="bc-note-x" title="Delete note" aria-label="Delete note">×</button></div>
      <textarea aria-label="Sticky note"></textarea>
    `;
    const ta = el.querySelector("textarea");
    ta.value = note.text || "";
    document.body.appendChild(el);
    el.querySelector(".bc-note-x").addEventListener("click", () => {
      editNotes((notes) => notes.filter((n) => n.id !== note.id)).then(() => el.remove()).catch(() => {});
    });
    const saveText = BC.util.debounce(() => {
      const text = ta.value;
      editNotes((notes) => notes.map((n) => n.id === note.id ? { ...n, text } : n))
        .then(() => { if (ta.value === text) delete ta.dataset.bcDirty; }).catch(() => {});
    }, 400);
    ta.addEventListener("input", () => { ta.dataset.bcDirty = "1"; saveText(); });
  }

  BC.quickNote = function () {
    // The next apply would take a new note straight back off the page.
    if (!((BC.storage.current && BC.storage.current.productivity) || {}).stickyNotes) { BC.toast.info("Sticky notes are off. Turn them on under Productivity."); return; }
    const id = BC.util.uuid();
    const note = { id, text: "", x: 120 + Math.random() * 80, y: 120 + Math.random() * 80 };
    editNotes((notes) => notes.concat(note)).then(() => buildNote(note)).catch(() => {});
  };

  // ---- Auto-save drafts ----
  // The old fallback keyed on a GLOBAL textarea index:
  //   Array.from(document.querySelectorAll("textarea")).indexOf(el)
  // Canvas mounts and unmounts textareas constantly (discussion reply boxes, inline
  // editors), so index 2 today is a different box tomorrow — and the saved text was
  // written straight into it. That silently cross-contaminated the user's prose.
  // This keys on structure instead, and refuses to persist at all when there is no
  // stable anchor: losing a draft is strictly better than restoring it into the
  // wrong field.
  function draftKey(el) {
    const base = location.origin + location.pathname;
    if (el.id) return base + "#id=" + el.id;
    // A name only identifies a field when it's unique on the page: Canvas renders
    // several reply boxes all named "message", which shared one draft between them.
    if (el.name && document.getElementsByName(el.name).length === 1) return base + "#name=" + el.name;
    let anchor = el.parentElement;
    const path = [];
    while (anchor && !anchor.id && anchor !== document.body) { path.push(anchor.tagName); anchor = anchor.parentElement; }
    if (!anchor || !anchor.id) return null;
    const peers = Array.from(anchor.querySelectorAll('textarea,[contenteditable="true"]'));
    return base + "#p=" + anchor.id + "/" + path.reverse().join(">") + "/" + peers.indexOf(el);
  }

  // Our own fields (sticky notes, the planner's task-note box, the grade tools) are
  // not Canvas drafts. The planner popover's textarea is rebuilt per task with the
  // same structural key, so text typed into one task's note was "restored" into
  // the next task's note.
  function isOurs(el) { return !!(el.closest && el.closest("[data-bc-node]")); }

  const draftHandlers = new Map();
  function draftsEnabled() {
    const s = BC.storage.current;
    return !!(s && s.enabled && s.productivity && s.productivity.autoSaveDrafts);
  }

  function detachDraft(ta, h) {
    clearTimeout(h.timer);
    ta.removeEventListener("input", h.input);
    if (h.form) h.form.removeEventListener("submit", h.submit);
    delete ta._bcDraft;
    draftHandlers.delete(ta);
  }

  function uninstallDrafts() {
    for (const [ta, h] of draftHandlers) detachDraft(ta, h);
  }

  function installDrafts() {
    // A queued loadLocal() may finish after the user switches saving off.
    if (!draftsEnabled()) return;
    for (const [ta, h] of draftHandlers) if (!ta.isConnected) {
      // Keep the last keystrokes when Canvas replaces an editor, then release it.
      if (h.timer) { clearTimeout(h.timer); h.save(); }
      detachDraft(ta, h);
    }
    for (const ta of document.querySelectorAll("textarea, [contenteditable=true]")) {
      if (draftHandlers.has(ta)) continue;
      if (isOurs(ta)) continue;
      // Quiz answers belong to the quiz saver, which keeps each attempt apart.
      // Here they'd restore attempt 1's essay into attempt 2.
      if (ta.closest("#questions") && /^\/courses\/\d+\/quizzes\/\d+\/take/.test(location.pathname)) continue;
      const key = draftKey(ta);
      if (!key) continue;
      const local = BC.storage.local || {};
      const savedAt = (local.draftSavedAt || {})[key];
      // Pruning runs after features first apply. Don't restore what it's about to drop.
      const saved = local.drafts && local.drafts[key] && !(savedAt && Date.now() - savedAt > 7 * 864e5) ? local.drafts[key] : null;
      if (saved && !ta.value && !ta.textContent) {
        if (ta.tagName === "TEXTAREA") {
          ta.value = saved;
          // Framework-controlled fields (React, Canvas's InstUI) only learn about a
          // value through an input event; without one the restored text was shown
          // but never submitted.
          ta.dispatchEvent(new Event("input", { bubbles: true }));
        } else ta.textContent = saved;
      }
      const h = { timer: null, form: ta.form || null };
      const save = () => {
        h.timer = null;
        if (!draftsEnabled()) return;
        const val = ta.tagName === "TEXTAREA" ? ta.value : ta.textContent;
        BC.storage.updateLocal((d) => {
          d.drafts = d.drafts || {};
          d.draftSavedAt = d.draftSavedAt || {};
          // Emptying the field discards the draft instead of storing "".
          if (val && val.trim()) { d.drafts[key] = val; d.draftSavedAt[key] = Date.now(); }
          else { delete d.drafts[key]; delete d.draftSavedAt[key]; }
        });
      };
      h.save = save;
      h.input = () => {
        clearTimeout(h.timer);
        if (draftsEnabled()) h.timer = setTimeout(save, 400);
      };
      ta.addEventListener("input", h.input);
      // A draft that was actually submitted is no longer a draft. Without this the
      // posted text was "restored" into the empty box on the next visit.
      h.submit = () => {
        // A pending debounce must not restore a draft just cleared on submit.
        clearTimeout(h.timer);
        h.timer = null;
        if (!draftsEnabled()) return;
        BC.storage.updateLocal((d) => { if (d.drafts) delete d.drafts[key]; if (d.draftSavedAt) delete d.draftSavedAt[key]; });
      };
      if (h.form) h.form.addEventListener("submit", h.submit);
      ta._bcDraft = true;
      draftHandlers.set(ta, h);
    }
  }

  // ---- Word count ----
  function installWordCount() {
    for (const ta of document.querySelectorAll("textarea")) {
      if (ta._bcWc) continue;
      if (isOurs(ta) || !ta.parentNode) continue;
      // The rich editor keeps a hidden textarea behind its iframe, and typing there
      // never reaches it. Skip hidden fields; a later tick picks them up if shown.
      if (!ta.offsetParent && getComputedStyle(ta).position !== "fixed") continue;
      ta._bcWc = true;
      // Under the field, not over its last line.
      const wc = document.createElement("div");
      wc.className = "bc-wc";
      wc.setAttribute("data-bc-node", "bc-wc");   // so teardown can actually remove it
      ta.insertAdjacentElement("afterend", wc);
      const update = () => {
        const t = (ta.value || "").trim();
        const words = t ? t.split(/\s+/).length : 0;
        wc.textContent = words + " words · " + (ta.value || "").length + " chars";
      };
      ta.addEventListener("input", update);
      update();
    }
  }

  function apply(settings) {
    const p = settings.productivity || {};
    applyFocus(p.focusMode);
    p.readingRuler ? installRuler() : uninstallRuler();
    p.readingProgress ? installProgress() : uninstallProgress();
    if (p.quickActions !== false) installQuick(p);
    else { BC.injector.removeNode("bc-quick"); BC.injector.removeNode("bc-nav-tools"); }
    BC.injector.setStyle("bc-productivity-css", CSS);

    // Each toggle removes what it added when switched off; before, notes and word
    // counters stayed on the page until a reload.
    if (p.stickyNotes && BC.storage.loadLocal) BC.storage.loadLocal().then(syncNotes);
    else BC.injector.removeNode("bc-note");
    if (p.autoSaveDrafts && BC.storage.loadLocal) BC.storage.loadLocal().then(() => installDrafts());
    else uninstallDrafts();
    if (p.wordCount) {
      installWordCount();
      // A field shown later by a style or hidden change makes no DOM mutation the
      // observer sees. Catch it when someone starts typing there.
      const bag = BC.lifecycle.bag("productivity");
      bag.once("wc-focus", () => bag.listen(document, "focusin", (e) => {
        const s = BC.storage.current;
        if (e.target && e.target.tagName === "TEXTAREA" && !e.target._bcWc && s && s.productivity && s.productivity.wordCount) installWordCount();
      }, true));
    }
    else if (document.querySelector('[data-bc-node="bc-wc"]')) {
      BC.injector.removeNode("bc-wc");
      for (const ta of document.querySelectorAll("textarea")) delete ta._bcWc;
    }
  }

  BC.registry.register({
    id: "productivity",
    styles: ["bc-productivity-css"],
    nodes: ["bc-ruler", "bc-progress-bar", "bc-quick", "bc-nav-tools", "bc-note", "bc-wc"],
    apply,
    // Without this, teardown removed the ruler and progress-bar NODES but left
    // rulerEl/progressEl pointing at them, so install*() early-returned forever and
    // neither ever came back after a disable/enable cycle.
    unmount() {
      uninstallRuler();
      uninstallProgress();
      uninstallDrafts();
      dragEl = null;
      for (const ta of document.querySelectorAll("textarea, [contenteditable=true]")) {
        delete ta._bcDraft;
        delete ta._bcWc;
      }
    },
  });
})();
