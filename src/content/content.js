/*
 * Better Canvas — content entry point.
 * Confirms Canvas, applies every feature (idempotent apply(settings, ctx)),
 * survives Canvas SPA re-renders via the observer, registers shortcuts
 * and command-palette entries, and responds to toolbar icon and options messages.
 */
(function () {
  "use strict";
  const BC = (globalThis.BC = globalThis.BC || {});

  let shortcutSig = null;

  BC.applyAll = function (settings) {
    if (!settings || retired) return;
    if (orphaned()) { retire(); return; }
    const ctx = BC.detect.context();

    // Settings panel always applies, even when the extension is "off",
    // so the user can reach the toggle. It registers last (load order),
    // so run it explicitly and skip it in the main loop.
    const sp = BC.features.settingsPanel;
    if (sp) BC.util.guard(() => sp.apply(settings, ctx), "settingsPanel");
    if (!settings.enabled) return teardown();
    if (tornDown) remount();

    for (const f of BC.registry.all()) {
      if (f === sp) continue;
      BC.util.guard(() => f.apply(settings, ctx), f.id);
    }

    // Shortcuts + palette registration. Signature-guarded: this re-registered all
    // ten handlers on every applyAll, i.e. several times a second forever.
    const sBindings = (settings.shortcuts && settings.shortcuts.bindings) || {};
    const quickSearch = !(settings.navigation && settings.navigation.quickSearch === false);
    const sSig = Object.keys(sBindings).sort().map((k) => k + "=" + sBindings[k]).join("|") + "|qs=" + quickSearch;
    if (BC.shortcuts && settings.shortcuts && settings.shortcuts.enabled && sSig !== shortcutSig) {
      shortcutSig = sSig;
      BC.shortcuts.reloadFromSettings(settings);
      const b = sBindings;
      // navigation.quickSearch was a live switch that nothing read — the palette
      // shortcut registered unconditionally.
      if (quickSearch) BC.shortcuts.register("bc-palette", b.commandPalette, () => BC.palette && BC.palette.open());
      else BC.shortcuts.unregister("bc-palette");
      BC.shortcuts.register("bc-settings", b.settings,          () => BC.features.settingsPanel && BC.features.settingsPanel.open());
      BC.shortcuts.register("bc-dark",     b.toggleDark,        () => BC.storage.update((d) => { d.theming.darkMode = BC.isDarkActive(d) ? "off" : "on"; }));
      BC.shortcuts.register("bc-task",     b.quickTask,         () => quickTaskFlow());
      BC.shortcuts.register("bc-note",     b.quickNote,         () => BC.quickNote && BC.quickNote());
      BC.shortcuts.register("bc-dash",     b.gotoDashboard,     () => location.assign("/"));
      BC.shortcuts.register("bc-grades",   b.gotoGrades,        () => { const cid = BC.util.courseIdFromHref(location.pathname); if (cid) location.assign("/courses/" + cid + "/grades"); else BC.toast.info("Open a course first"); });
      BC.shortcuts.register("bc-inbox",    b.gotoInbox,         () => location.assign("/conversations"));
      BC.shortcuts.register("bc-cal",      b.gotoCalendar,      () => location.assign("/calendar"));
      BC.shortcuts.register("bc-focus",    b.focusMode,         () => BC.storage.update((d) => { d.productivity.focusMode = !d.productivity.focusMode; }));
    }

    // Register once, not on every applyAll. This used to re-register ~10 static
    // commands plus up to 40 course entries per tick, and re-issued
    // BC.api.dashboardCards() every time.
    if (BC.palette) {
      const pbag = BC.lifecycle.bag("palette");
      pbag.once("commands", () => registerPaletteCommands(settings));
    }
  };

  function registerPaletteCommands(settings) {
    BC.palette.register({ id: "open-settings", title: "Open settings",     hint: "drawer", group: "Better Canvas", run: () => BC.features.settingsPanel.open() });
    BC.palette.register({ id: "toggle-dark",   title: "Toggle dark mode",  hint: "",       group: "Better Canvas", run: () => BC.storage.update((d) => { d.theming.darkMode = BC.isDarkActive(d) ? "off" : "on"; }) });
    BC.palette.register({ id: "toggle-focus",  title: "Toggle focus mode", hint: "",       group: "Better Canvas", run: () => BC.storage.update((d) => { d.productivity.focusMode = !d.productivity.focusMode; }) });
    BC.palette.register({ id: "quick-note",    title: "New sticky note",   hint: "",       group: "Better Canvas", run: () => BC.quickNote && BC.quickNote() });
    BC.palette.register({ id: "export-ics",    title: "Export calendar (.ics)", hint: "",  group: "Better Canvas", run: () => BC.calendar && BC.calendar.exportIcs() });
    BC.palette.register({ id: "goto-dash",     title: "Go to dashboard",   hint: "",       group: "Navigate",       run: () => location.assign("/") });
    BC.palette.register({ id: "goto-inbox",    title: "Go to inbox",       hint: "",       group: "Navigate",       run: () => location.assign("/conversations") });
    BC.palette.register({ id: "goto-cal",      title: "Go to calendar",    hint: "",       group: "Navigate",       run: () => location.assign("/calendar") });
    BC.palette.register({ id: "goto-grades",   title: "Grades (this course)", hint: "",    group: "Navigate",       run: () => { const cid = BC.util.courseIdFromHref(location.pathname); if (cid) location.assign("/courses/" + cid + "/grades"); else BC.toast.info("Open a course first"); } });
    // Course jump commands
    if (BC.api) {
      BC.api.dashboardCards().then((cards) => {
        for (const c of cards.slice(0, 40)) {
          BC.palette.register({ id: "goto-course-" + c.id, title: "Go to: " + (c.shortName || c.originalName || c.courseCode || c.id), group: "Courses", run: () => location.assign("/courses/" + c.id) });
        }
      }).catch(() => {});
    }
  }

  function quickTaskFlow(defaultTitle, details) {
    const title = prompt("New task title:", defaultTitle || "");
    if (!title) return;
    const ctx = BC.detect.context();
    BC.api.createPlannerNote({
      title, details,
      todoDate: new Date().toISOString(),
      courseId: ctx.courseId || undefined,
    })
      .then(() => BC.toast.success("Task added"))
      .catch((e) => BC.toast.error("Failed: " + e.message));
  }

  let tornDown = false;

  // ---- updates ----------------------------------------------------------------
  // When the extension is updated or reloaded, Chrome leaves this copy running in
  // tabs that were already open but cuts it off from the extension (no storage, no
  // messages), and the service worker injects a fresh copy alongside it. Left alone
  // the old copy kept painting the old UI over the page until a manual refresh.
  // The new copy asks it to step aside on start-up; a copy that notices it has been
  // cut off does the same by itself.
  let retired = false;
  function orphaned() {
    try { return !(chrome.runtime && chrome.runtime.id); } catch (_) { return true; }
  }
  function retire() {
    if (retired) return;
    retired = true;
    BC.util.guard(() => { tornDown = false; teardown(); }, "retire:teardown");
    BC.util.guard(() => BC.darkEngine && BC.darkEngine.stop(), "retire:dark");
    BC.util.guard(() => BC.observer && BC.observer.stop && BC.observer.stop(), "retire:observer");
    BC.util.guard(() => BC.shortcuts && BC.shortcuts.stop && BC.shortcuts.stop(), "retire:shortcuts");
    BC.util.guard(() => BC.lifecycle.clear("settingsPanel-persist"), "retire:panel");
    // Everything we ever put on the page, including the settings panel and its
    // nav item, which ordinary teardown deliberately keeps.
    for (const n of document.querySelectorAll("[data-bc-node], style[data-better-canvas]")) n.remove();
    document.documentElement.style.removeProperty("margin-right");
  }

  const ROOT_ATTRS = [
    "data-bc-accent", "data-bc-density", "data-bc-radius", "data-bc-focus",
    "data-bc-cursor", "data-bc-hc", "data-bc-motion", "data-bc-rounded",
  ];

  function teardown() {
    // applyAll keeps running ~5x/sec while disabled, so this has to be a no-op
    // after the first pass rather than re-tearing-down forever.
    if (tornDown) return;
    tornDown = true;

    for (const k of BC.registry.styleKeys()) BC.injector.removeStyle(k);
    for (const n of BC.registry.nodeKeys()) BC.injector.removeNode(n);
    for (const f of BC.registry.all()) {
      // The drawer deliberately survives teardown so the user can always reach the
      // toggle to switch the extension back on.
      if (f.id === "settingsPanel") continue;
      if (f.unmount) BC.util.guard(() => f.unmount(), f.id + ":unmount");
      BC.lifecycle.clear(f.id);
    }

    // Alarms outlived teardown, so notification scans kept hitting the Canvas API
    // while the extension was "off".
    BC.alarms.clearAll();
    if (BC.notifications) BC.util.guard(() => BC.notifications.sendBadge(0), "badge clear");

    for (const n of ["bc-toast-host", "bc-toast-host-alert", "bc-live-polite", "bc-live-assertive"]) {
      BC.injector.removeNode(n);
    }

    const doc = document.documentElement;
    doc.classList.remove("bc-dark");
    doc.classList.remove("bc-focus");
    // Inline state no stylesheet removal can undo: leaving the colour-blind filter
    // in place meant disabling the extension left the ENTIRE page tinted until a
    // reload.
    doc.style.filter = "";
    doc.style.removeProperty("--bc-anim-speed");
    doc.style.removeProperty("--bc-cursor");
    doc.style.removeProperty("--bc-sidebar-w");
    for (const a of ROOT_ATTRS) doc.removeAttribute(a);
  }

  function startAlarms() {
    BC.alarms.every("bc-dark-eval", 60 * 1000, () => {
      if (BC.storage.current && BC.storage.current.theming.darkMode === "scheduled") requestApply();
    });
  }

  // Re-enabling used to require a page reload: module-level install flags were
  // never reset and no feature implemented unmount(), so features that had latched
  // simply never came back.
  function remount() {
    tornDown = false;
    startAlarms();
  }

  // 120ms after the last change, but never more than a second behind it: a page
  // that kept mutating used to hold every feature back indefinitely.
  let applyTimer = null, firstAsk = 0;
  const requestApply = () => {
    const now = Date.now();
    if (!applyTimer) firstAsk = now;
    clearTimeout(applyTimer);
    applyTimer = setTimeout(() => { applyTimer = null; BC.applyAll(BC.storage.current); }, now - firstAsk >= 1000 ? 0 : 120);
  };
  BC.requestApply = requestApply;

  // Zero-latency path for the settings drawer. Coalesced by requestAnimationFrame
  // so it runs at most once per frame and lands before the next paint, instead of
  // waiting out the 220ms save debounce plus a chrome.storage round-trip (~345ms
  // from click to the page changing).
  let rafPending = false;
  BC.applyNow = function () {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => { rafPending = false; BC.applyAll(BC.storage.current); });
  };

  // Messages from the toolbar icon and the options page
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return;
    if (msg.type === "bc:ping") {
      sendResponse({ canvas: BC.detect.isCanvas(), context: BC.detect.context(), version: BC.VERSION });
      return;
    }
    if (msg.type === "bc:openSettings") {
      BC.util.guard(() => BC.features.settingsPanel && BC.features.settingsPanel.open(), "openSettings");
      sendResponse({ ok: true }); return;
    }
    if (msg.type === "bc:openPalette") {
      BC.util.guard(() => BC.palette && BC.palette.open(), "openPalette");
      sendResponse({ ok: true }); return;
    }
    // The service worker has always SENT this from its context menu, but there was
    // no listener — so "Better Canvas: add this as a task" was a silent no-op.
    if (msg.type === "bc:addTaskFromContext") {
      const i = msg.info || {};
      const title = String(i.selectionText || "").trim().slice(0, 120) || document.title;
      BC.util.guard(() => quickTaskFlow(title, i.linkUrl || i.pageUrl || location.href), "ctxTask");
      sendResponse({ ok: true }); return;
    }
    if (msg.type === "bc:getCourses") {
      BC.api.dashboardCards().then((cards) => sendResponse({ ok: true, courses: cards.map((c) => ({
        id: String(c.id), name: c.shortName || c.originalName || c.courseCode || ("Course " + c.id),
        code: c.courseCode || "", color: c.color || "",
      })) })).catch((e) => sendResponse({ ok: false, error: String(e) }));
      return true;
    }
    // The courses the study coach covers, with the student they belong to.
    if (msg.type === "bc:coachCourses") {
      Promise.all([BC.api.self(), BC.api.coursesWithScores()]).then(([self, courses]) => sendResponse({ ok: true, user: String(self.id),
        courses: courses.filter((c) => !c.concluded).map((c) => ({ id: String(c.id), name: c.name || c.course_code || ("Course " + c.id) })) }))
        .catch((e) => sendResponse({ ok: false, error: String(e) }));
      return true;
    }
    if (msg.type === "bc:gpaData") {
      BC.api.coursesWithScores().then((courses) => sendResponse({ ok: true, courses: courses.map((c) => {
        const enr = (c.enrollments || [])[0] || {};
        const score = enr.computed_current_score != null ? enr.computed_current_score : enr.computed_final_score;
        return { id: String(c.id), name: c.name || c.course_code || ("Course " + c.id), score: score == null ? null : Number(score), concluded: c.concluded === true || enr.enrollment_state === "completed" };
      }) })).catch((e) => sendResponse({ ok: false, error: String(e) }));
      return true;
    }
  });

  function start(settings) {
    BC.applyAll(settings);
    BC.observer.start(requestApply);
    BC.storage.subscribe(() => requestApply());
    BC.storage.prune();
    startAlarms();
  }

  function boot() {
    // Hand over from a copy left behind by an update, then listen for our own
    // successor. Events on window reach every content-script world.
    try { window.dispatchEvent(new CustomEvent("bc:retire")); } catch (_) {}
    // The dispatch is synchronous, so anything still on the page is a dead copy's:
    // Firefox stops old content scripts on update without letting them answer. Its
    // settings button stayed and did nothing, and blocked ours from being added.
    for (const n of document.querySelectorAll("[data-bc-node], style[data-better-canvas]")) n.remove();
    window.addEventListener("bc:retire", retire);
    // Tells the service worker this page's copy knows how to hand over.
    document.documentElement.setAttribute("data-bc-handover", "");
    const begin = (settings) => {
      let tries = 0;
      const tryStart = () => {
        if (BC.detect.isCanvas()) return start(settings);
        if (tries++ < 24) setTimeout(tryStart, 250);
      };
      BC.util.whenBody(tryStart);
    };
    // A failed load or migration used to leave the page with no features and no
    // word why. Run on defaults for this page and say so.
    Promise.all([BC.storage.load(), BC.storage.loadLocal()]).then(([settings]) => begin(settings), (error) => {
      BC.diag.push("boot", error);
      // Adopted, so observer ticks and shortcuts, which read BC.storage.current, run too.
      const defaults = BC.cloneDefaults();
      BC.storage.adopt(defaults);
      begin(defaults);
      BC.util.whenBody(() => BC.toast && BC.toast.error("Better Canvas couldn't read its settings, so this page uses the defaults. Refresh to try again."));
    });
  }

  boot();
})();
