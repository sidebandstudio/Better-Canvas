/*
 * Better Canvas — settings UI state store.
 * Wraps the adapter (in-page drawer OR options page) with a diffing layer,
 * change subscribers, and an undo/redo history.
 *
 * INVARIANT: `state` is mutated in place and never reassigned. Tab renderers
 * capture sub-objects (`const d = store.get().dashboard`) and close over them in
 * ~300 get()/set() pairs, so swapping the root object would leave every mounted
 * control reading a stale snapshot. overwrite() is the only way to replace the
 * contents wholesale, and it preserves identity all the way down.
 */
(function () {
  "use strict";
  const BC = (globalThis.BC = globalThis.BC || {});
  BC.SettingsState = BC.SettingsState || {};

  const clone = typeof structuredClone === "function"
    ? (x) => structuredClone(x)
    : (x) => JSON.parse(JSON.stringify(x));

  // Deep in-place replace, so `target` and every sub-object a mounted control
  // captured keep a stable identity.
  function overwrite(target, src) {
    for (const k of Object.keys(target)) if (!(k in src)) delete target[k];
    for (const k of Object.keys(src)) {
      const sv = src[k], tv = target[k];
      if (sv && typeof sv === "object" && !Array.isArray(sv) &&
          tv && typeof tv === "object" && !Array.isArray(tv)) overwrite(tv, sv);
      // Clone rather than alias: otherwise `state` would share a subtree with the
      // history entry or the incoming storage value we were handed.
      else target[k] = (sv && typeof sv === "object") ? clone(sv) : sv;
    }
  }

  const RESET_KEEPS = [
    ["todo", "recurring"], ["todo", "tags"], ["grades", "goals"], ["grades", "creditsByCourse"],
    ["customThemes"], ["navigation", "global", "customLinks"], ["navigation", "course", "customLinks"],
    ["dashboard", "courseOrder"], ["onboarding"], ["files", "starred"],
  ];

  BC.SettingsState.create = function (adapter) {
    // Clone up front: the drawer's adapter hands back BC.storage.current itself,
    // and we now mutate in place — writing through to the live settings object
    // would corrupt applyAll's view of it mid-edit.
    const state = clone(adapter.getState() || BC.cloneDefaults());
    const listeners = new Set();
    const past = [];
    const future = [];
    const HISTORY = 30;
    let dirty = false;
    let baseline = clone(state), replacement = 0;
    const replacePaths = new Map();
    let editRevision = 0;
    function markPaths(paths) { for (const path of paths || []) replacePaths.set(JSON.stringify(path), ++editRevision); }
    let retry = 0;
    let unsubAdapter = null;
    // Snapshots handed to adapter.save() whose storage echo hasn't come back yet.
    // An echo is always OLDER than `state` once the user has kept editing, and it
    // used to be adopted as a foreign change: mid-drag a slider snapped back to the
    // value from a moment ago, and the trailing save then persisted that stale value.
    const pendingEchoes = [];

    function notify(kind) {
      for (const cb of listeners) BC.util.guard(() => cb(state, kind || "value"), "state listener");
      // Optional zero-latency path: the drawer adopts the in-memory settings and
      // re-applies before the next paint, instead of waiting out the save
      // debounce plus a chrome.storage round-trip (~345ms).
      if (adapter.preview) BC.util.guard(() => adapter.preview(state), "state preview");
    }

    // throttle, not debounce. With a debounce, holding or spamming a control kept
    // restarting the timer so nothing reached storage until the user stopped;
    // throttle writes immediately and then at most ~4.5Hz, and its trailing call
    // guarantees the final value still lands. chrome.storage.local has no
    // write-rate quota (that's storage.sync).
    let lastSave = Promise.resolve(), saveError = null, destroyed = false, retryTimer;
    function saveNow() {
      if (destroyed) return lastSave;
      lastSave = lastSave.catch(() => {}).then(async () => {
        // Earlier saves may acknowledge a value the user has since reverted.
        // Compare the current edit with that acknowledgement when this turn runs.
        const snapshot = clone(state), base = clone(baseline), replacing = replacement;
        const paths = new Map(replacePaths);
        pendingEchoes.push(snapshot);
        if (pendingEchoes.length > 20) pendingEchoes.shift();
        const persisted = await adapter.save(snapshot, { base, replace: !!replacing, replacePaths: [...paths.keys()].map(JSON.parse) });
        const saved = persisted || snapshot;
        if (replacement === replacing) {
          const newerPaths = [...replacePaths].filter(([path, revision]) => paths.get(path) !== revision).map(([path]) => JSON.parse(path));
          overwrite(state, BC.replaceSettingsPaths(BC.mergeSettingsEdits(snapshot, state, saved), state, newerPaths));
        }
        baseline = clone(saved);
        if (replacement === replacing) replacement = 0;
        for (const [path, revision] of paths) if (replacePaths.get(path) === revision) replacePaths.delete(path);
        dirty = !BC.util.deepEqual(saved, state) || !!replacement || !!replacePaths.size;
        retry = 0; saveError = null; notify("saved");
      }).catch((error) => {
        saveError = error; notify("save-error");
        BC.util.warn("settings save failed", error);
        clearTimeout(retryTimer);
        if (++retry <= 5) retryTimer = setTimeout(() => { if (dirty && !destroyed) flushSave(); }, 500 * retry);
        throw error;
      });
      lastSave.catch(() => {});
      return lastSave;
    }
    const flushSave = BC.util.throttle(() => { saveNow().catch(() => {}); }, 220);

    function scheduleSave() { dirty = true; flushSave(); }

    // Typing in a field or dragging a slider calls set() per keystroke or tick.
    // Text and number edits to the same fields less than a second apart share one
    // undo step, so Undo reverts the whole word or drag and 30 steps hold more
    // than 30 letters. Switches and lists keep a step per click.
    let burst = null;
    function changedPaths(a, b, at, out) {
      if (a === b) return out;
      if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) changedPaths(a[k], b[k], at + "/" + k, out);
      } else if (!BC.util.deepEqual(a, b)) out.push(typeof a === typeof b && (typeof b === "string" || typeof b === "number") ? at : null);
      return out;
    }

    function set(mutator, opts) {
      const before = clone(state);      // ONE clone, was 3 clones + 4 stringifies
      mutator(state);                   // in place, so captured sub-objects stay live
      if (BC.util.deepEqual(before, state) && !opts?.replacePaths?.length) return;
      markPaths(opts?.replacePaths);
      if (opts && opts.replay) burst = null;
      else {
        const changed = changedPaths(before, state, "", []), now = Date.now();
        const paths = changed.includes(null) ? null : changed.join("|");
        if (paths && burst && burst.paths === paths && now - burst.at < 1000 && past[past.length - 1] === burst.entry) burst.at = now;
        else {
          const entry = { state: before, replacePaths: opts?.replacePaths };
          past.push(entry);
          if (past.length > HISTORY) past.shift();
          burst = { paths, at: now, entry };
        }
        future.length = 0;
      }
      notify("value");
      scheduleSave();
    }

    // Wholesale content replacement (reset / import). "structural" tells the UI
    // that a targeted sync isn't enough and the tab needs rebuilding.
    function swap(next) {
      burst = null;
      replacement++;
      past.push({ state: clone(state), replace: true });
      if (past.length > HISTORY) past.shift();
      future.length = 0;
      overwrite(state, next);
      notify("structural");
      scheduleSave();
    }

    function undo() {
      burst = null;   // a step that comes back from Undo or Redo starts a new burst
      if (!past.length) return false;
      const entry = past.pop();
      future.push({ ...entry, state: clone(state) });
      overwrite(state, entry.state);
      if (entry.replace) replacement++;
      markPaths(entry.replacePaths);
      notify("structural");
      scheduleSave();
      return true;
    }

    function redo() {
      burst = null;
      if (!future.length) return false;
      const entry = future.pop();
      past.push({ ...entry, state: clone(state) });
      overwrite(state, entry.state);
      if (entry.replace) replacement++;
      markPaths(entry.replacePaths);
      notify("structural");
      scheduleSave();
      return true;
    }

    // React to external changes (another tab, the options page).
    if (adapter.subscribe) {
      unsubAdapter = adapter.subscribe((incoming) => {
        // Our own write echoes back through here; suppressing it keeps the echo
        // out of the undo stack, where it used to masquerade as a foreign edit
        // and make Undo appear to do nothing.
        if (!incoming) return;
        const own = pendingEchoes.findIndex((p) => BC.util.deepEqual(p, incoming));
        // Echoes arrive in save order, so everything queued before this one is done.
        if (own !== -1) { pendingEchoes.splice(0, own + 1); return; }
        if (BC.util.deepEqual(incoming, state)) return;
        if (dirty) return;
        burst = null;   // Undo must not fold a change from another tab into the last edit
        overwrite(state, incoming);
        baseline = clone(incoming);
        notify("structural");
      });
    }

    return {
      get() { return state; },
      flush() { return saveNow(); },
      get saveError() { return saveError; },
      set,
      undo, redo,
      canUndo() { return past.length > 0; },
      canRedo() { return future.length > 0; },
      subscribe(cb) { listeners.add(cb); return () => listeners.delete(cb); },
      adapter,
      // Lets a re-mounted drawer dispose the previous store instead of leaving it
      // subscribed and rendering into a detached tree forever.
      destroy() {
        destroyed = true; clearTimeout(retryTimer);
        if (unsubAdapter) { BC.util.guard(unsubAdapter, "state unsub"); unsubAdapter = null; }
        listeners.clear();
      },
      exportJSON() { return JSON.stringify(state, null, 2); },
      // Returns the migration carry-over (always an object, so truthy) or false.
      // Old backups kept planner metadata and grade history INSIDE settings; the
      // migrations lift that out into `carry`, and the caller has to land it in
      // bcLocal — discarding it, as this used to, dropped that data on import.
      importJSON(text) {
        try {
          const parsed = JSON.parse(text);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
          const carry = {};
          swap(BC.mergeDefaults(parsed, carry));
          return carry;
        } catch (e) { return false; }
      },
      // Options go back to their defaults. Things the user made stay: recurring
      // tasks, tags, grade goals, GPA credits, saved themes, custom links, course
      // nicknames, hidden courses, card order and starred files.
      reset() {
        const next = BC.cloneDefaults();
        for (const path of RESET_KEEPS) {
          let from = state, to = next;
          for (const key of path.slice(0, -1)) { from = from && from[key]; to = to[key]; }
          const key = path[path.length - 1];
          if (from && from[key] !== undefined) to[key] = clone(from[key]);
        }
        for (const [id, c] of Object.entries(state.dashboard?.courses || {})) {
          const mine = {};
          if (c && c.nickname) mine.nickname = c.nickname;
          if (c && c.hidden) mine.hidden = true;
          if (Object.keys(mine).length) next.dashboard.courses[id] = mine;
        }
        swap(next);
      },
      applyPreset(preset) {
        const src = preset.settings || preset;
        const preserved = BC.THEME_KEEPS;
        const paths = Object.keys(BC.defaults.theming).filter((key) => key !== "rotation" &&
          (!preserved.includes(key) || Object.hasOwn(src.theming || {}, key))).map((key) => ["theming", key]);
        for (const key of Object.keys(BC.defaults.cosmetics)) {
          if (key !== "customCss" || Object.hasOwn(src.cosmetics || {}, key)) paths.push(["cosmetics", key]);
        }
        paths.push(["dashboard", "themeImages"], ["dashboard", "courses", "*", "bgImage"], ["dashboard", "courses", "*", "bgGradient"]);
        set((d) => {
          if (BC.applyTheme) { BC.applyTheme(d, preset); return; }
          const src = BC.cleanData(preset.settings || preset);
          const deep = (t, s) => {
            for (const k of Object.keys(s)) {
              const v = s[k];
              if (Array.isArray(v)) t[k] = v.slice();
              else if (v && typeof v === "object") { if (!t[k] || typeof t[k] !== "object") t[k] = {}; deep(t[k], v); }
              else t[k] = v;
            }
          };
          deep(d, src);
        }, { replacePaths: paths });
      },
    };
  };
})();
