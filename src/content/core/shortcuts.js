/* Better Canvas — global keyboard shortcut manager. */
(function () {
  "use strict";
  const BC = (globalThis.BC = globalThis.BC || {});

  const bindings = new Map(); // id -> { combo, handler }
  let chord = null;
  let chordTimer = null;

  function isTypingTarget(t) {
    if (!t) return false;
    if (t.isContentEditable) return true;
    const tag = (t.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    // ARIA text widgets report neither a form tag nor contentEditable on the event
    // target — Canvas's InstUI comboboxes and its rich-text editors both land here.
    return !!(t.closest && t.closest(
      '[contenteditable=""],[contenteditable="true"],[role="textbox"],' +
      '[role="combobox"],[role="searchbox"],.ProseMirror,.tox-edit-area'
    ));
  }

  // Events from inside a shadow root are retargeted to the HOST by the time they
  // reach this document-level listener, so ev.target is the settings drawer's host
  // <div> — never the input being typed in. Typing "margin" into the drawer's Custom
  // CSS box fired the "g i" chord and navigated to the inbox.
  function realTarget(ev) {
    const path = ev.composedPath ? ev.composedPath() : null;
    return (path && path[0]) || ev.target;
  }

  // The drawer owns its keyboard: the keybind recorder there has to receive the
  // combo being recorded instead of having it fire the existing binding.
  function fromDrawer(ev) {
    const path = ev.composedPath ? ev.composedPath() : [];
    for (const n of path) {
      if (n && n.nodeType === 1 && n.getAttribute("data-bc-node") === "bc-drawer") return true;
    }
    return false;
  }

  function normalizeCombo(str) {
    return String(str || "").trim();
  }

  function eventMatchesToken(ev, token) {
    // Token: "Mod+K", "Mod+Shift+D", "g", "ArrowDown"
    const parts = token.split("+").map((s) => s.trim());
    const key = parts.pop().toLowerCase();
    const need = { mod: false, shift: false, alt: false };
    for (const p of parts) {
      const q = p.toLowerCase();
      if (q === "mod" || q === "cmd" || q === "ctrl") need.mod = true;
      else if (q === "shift") need.shift = true;
      else if (q === "alt" || q === "option") need.alt = true;
    }
    const modOK = need.mod ? (ev.metaKey || ev.ctrlKey) : (!ev.metaKey && !ev.ctrlKey);
    const shiftOK = need.shift ? ev.shiftKey : !ev.shiftKey;
    const altOK   = need.alt ? ev.altKey : !ev.altKey;
    if (!modOK || !shiftOK || !altOK) return false;
    const evKey = (ev.key || "").toLowerCase();
    if (evKey === key) return true;
    // macOS turns Option+letter into a different character (⌥⇧T reports "ˇ"), so
    // with Alt held fall back to the physical key.
    if (ev.altKey && /^[a-z0-9]$/.test(key)) {
      return ev.code === (/[a-z]/.test(key) ? "Key" + key.toUpperCase() : "Digit" + key);
    }
    return false;
  }

  function keyOnly(ev) {
    // Simple non-modifier key press (for chord second-part)
    return !ev.metaKey && !ev.ctrlKey && !ev.altKey && !ev.shiftKey && (ev.key || "").length === 1;
  }

  function onKey(ev) {
    // A held key repeats keydown. Toggles flipped on and off for as long as it was held.
    if (ev.repeat || fromDrawer(ev) || isTypingTarget(realTarget(ev))) return;
    const s = BC.storage && BC.storage.current;
    // The bindings stay registered after Better Canvas is switched off.
    if (!s || s.enabled === false || !s.shortcuts || !s.shortcuts.enabled) return;

    // Chord second key (e.g. "g d").
    if (chord) {
      const pending = chord;
      chord = null;
      clearTimeout(chordTimer);
      if (keyOnly(ev)) {
        const combo = pending + " " + (ev.key || "").toLowerCase();
        for (const { combo: c, handler } of bindings.values()) {
          if (c && c.toLowerCase() === combo) {
            ev.preventDefault(); ev.stopPropagation();
            BC.util.guard(() => handler(ev), "shortcut " + combo);
            return;
          }
        }
      }
      // Nothing matched — fall through so the key can still trigger a single-key
      // binding instead of being silently eaten.
    }

    for (const { combo, handler } of bindings.values()) {
      if (!combo) continue;
      if (combo.indexOf(" ") > -1) {
        const firstToken = combo.split(" ")[0];
        if (keyOnly(ev) && (ev.key || "").toLowerCase() === firstToken.toLowerCase()) {
          chord = firstToken.toLowerCase();
          clearTimeout(chordTimer);
          chordTimer = setTimeout(() => { chord = null; }, 800);
          // Deliberately NOT preventDefault. Starting a chord used to swallow the
          // keystroke for 1.2s, so a bare "g" anywhere outside a recognised input —
          // including widgets isTypingTarget missed — lost the letter entirely.
          return;
        }
      } else if (eventMatchesToken(ev, combo)) {
        ev.preventDefault(); ev.stopPropagation();
        BC.util.guard(() => handler(ev), "shortcut " + combo);
        return;
      }
    }
  }

  BC.shortcuts = {
    register(id, combo, handler) {
      bindings.set(id, { combo: normalizeCombo(combo), handler });
    },
    unregister(id) { bindings.delete(id); },
    reloadFromSettings(settings) {
      const b = settings && settings.shortcuts && settings.shortcuts.bindings;
      if (!b) return;
      for (const [id, entry] of bindings.entries()) {
        if (b[id] != null) entry.combo = normalizeCombo(b[id]);
      }
    },
    prettify(combo) {
      if (!combo) return "";
      return combo.replace(/Mod/g, BC.util.isMac ? "⌘" : "Ctrl").replace(/Shift/g, "⇧").replace(/Alt/g, BC.util.isMac ? "⌥" : "Alt");
    },
    _install() {
      document.addEventListener("keydown", onKey, true);
    },
    stop() {
      document.removeEventListener("keydown", onKey, true);
      bindings.clear();
    },
  };

  BC.util.whenBody(() => BC.shortcuts._install());
})();
