/*
 * Better Canvas — settings UI.
 * BC.SettingsUI.render(rootEl, adapter, opts) mounts the whole settings surface.
 * The adapter supplies getState / save / subscribe / preview / getCourses /
 * getGpaData / getLocal / saveLocal. Shared by the full-window workspace inside
 * a shadow root and the standalone options page. Theme previews are staged
 * independently until Apply; ordinary settings retain immediate preview/save.
 */
(function () {
  "use strict";
  const BC = (globalThis.BC = globalThis.BC || {});
  const el = (t, a, c) => BC.ui.el(t, a, c);
  const S = () => BC.SettingsComponents;
  const focused = (n) => n.getRootNode().activeElement === n;

  // Lists built at render time (recurring rules, saved themes, the rotation picker)
  // only rebuilt on a "structural" change, and an ordinary store.set() is not one —
  // so adding or deleting an entry changed the data but not the screen. `live`
  // re-runs a builder whenever its slice of state changes.
  function live(build, sig) {
    const holder = el("div", { class: "bc-live" }, [build()]);
    let last = sig();
    S().bindings.add(holder, () => {
      const next = sig();
      if (next === last) return;
      last = next;
      holder.replaceChildren(build());
    });
    return holder;
  }

  const ACCENTS = ["#4f46e5", "#2563eb", "#0891b2", "#059669", "#ca8a04", "#ea580c", "#dc2626", "#db2777", "#7c3aed", "#18181b"];

  // ============ TABS =====================================================

  const TABS = [
    { id: "theming",       group: "Look",    label: "Appearance",       icon: "contrast",     description: "Dark mode, colors, type and spacing for all of Canvas.", render: renderTheming },
    { id: "themes",        group: "Look",    label: "Themes",           icon: "layers",       description: "Image themes, an online gallery, and your saved looks.", render: renderThemes },
    { id: "cosmetics",     group: "Look",    label: "Background & CSS", icon: "image",        description: "A page background behind Canvas, and your own CSS.", render: renderCosmetics },
    { id: "dashboard",     group: "Home",    label: "Dashboard",        icon: "grid",         description: "How course cards look and what appears around them.", render: renderDashboard },
    { id: "widgets", group: "Home", label: "Widgets", icon: "grid", description: "Choose what lives beside your courses.", render: renderWidgets },
    { id: "todo",          group: "Home",    label: "To Do",            icon: "check-square", description: "Canvas's To Do list, restyled or replaced by the planner.", render: renderTodo },
    { id: "grades",        group: "Courses", label: "Grades & GPA",     icon: "award",        description: "Grade tools on course pages and the GPA calculator.", render: renderGrades },
    { id: "calendar",      group: "Courses", label: "Calendar",         icon: "calendar",     description: "Calendar export, the mini calendar and syllabus dates.", render: renderCalendar },
    { id: "files",         group: "Courses", label: "Files",            icon: "folder",       description: "One searchable list of files across all your courses.", render: renderFiles },
    { id: "announcements", group: "Courses", label: "Announcements",    icon: "message",      description: "Recent announcements from every course in one place.", render: renderAnnouncements },
    { id: "navigation",    group: "Courses", label: "Navigation",       icon: "compass",      description: "Reorder and hide Canvas navigation, and add your own links.", render: renderNavigation },
    { id: "productivity",  group: "Tools",   label: "Productivity",     icon: "zap",          description: "Focus, reading and writing tools on every page.", render: renderProductivity },
    { id: "notifications", group: "Tools",   label: "Notifications",    icon: "bell",         description: "Reminders for due work, new grades and announcements.", render: renderNotifications },
    { id: "accessibility", group: "Tools",   label: "Accessibility",    icon: "eye",          description: "Read-aloud, larger targets and a dyslexia-friendly font.", render: renderA11y },
    { id: "shortcuts",     group: "Tools",   label: "Shortcuts",        icon: "command",      description: "Keyboard shortcuts for everything. Click one to change it.", render: renderShortcuts },
    { id: "instructor",    group: "Tools",   label: "Instructor",       icon: "users",        description: "Helpers for teachers and TAs. Nothing is written to Canvas.", render: renderInstructor },
    { id: "chatgpt",       group: "Tools",   label: "ChatGPT",          icon: "link",         description: "Use your own ChatGPT Plus or Pro plan in Better Canvas. Nothing goes to ChatGPT until you connect.", render: renderChatGPT },
    { id: "coach",         group: "Tools",   label: "Study coach",      icon: "target",       description: "What each course needs to reach its goal, and ChatGPT study plans for the courses you pick.", render: renderCoach },
    { id: "insights",      group: "More",    label: "Insights",         icon: "activity",     description: "Your study time, focus sessions and grade trends, kept on this device.", render: renderInsights },
    { id: "about",         group: "More",    label: "About",            icon: "info",         description: "Version, privacy, diagnostics and reset.", render: renderAbout },
  ];
  const EDIT_TABS = ["themes", "theming", "cosmetics", "dashboard", "widgets", "todo", "navigation", "accessibility"];
  const GROUPS = ["Look", "Home", "Courses", "Tools", "More"];
  let lastTab = "themes";   // reopening the panel returns to where you were

  const SETTINGS_SECTIONS = ["theming", "dashboard", "todo", "navigation", "cosmetics", "grades"];
  BC.SettingsUI = {
    // What a chosen JSON file is: "backup" (settings + local data), "settings" (a
    // bare older export), "theme", or null. Any other object used to
    // import as defaults and silently reset everything.
    backupKind(j) {
      if (!j || typeof j !== "object" || Array.isArray(j)) return null;
      const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
      if ((j.kind === "better-canvas-backup" || "local" in j) && isObj(j.settings)) return "backup";
      if (j.kind === "better-canvas-backup") return null;   // a backup whose settings are missing
      if (isObj(j.settings) && typeof j.name === "string" && !("local" in j)) return "theme";
      // A version number alone isn't enough: other exports have one too.
      return SETTINGS_SECTIONS.some((k) => isObj(j[k])) || (typeof j.version === "number" && typeof j.enabled === "boolean") ? "settings" : null;
    },
    render(root, adapter, opts) {
      const o = opts || {};
      if (root.dispose) root.dispose();
      root.innerHTML = "";
      const store = BC.SettingsState.create(adapter);
      S().bindings.reset();

      const app = el("div", { class: "bc-root bc-app" + (o.variant === "page" ? " bc-app--page" : "") });
      root.appendChild(app);
      const saveStatus = el("p", { role: "alert", hidden: true });
      app.appendChild(saveStatus);
      app.appendChild(el("style", null, BC.ui.css() + CSS + BC.studioCSS));
      // When the token guard decides a custom "dark" background is too light to
      // keep these surfaces dark, tokens.css() emits the neutral override for
      // .bc-app at DOCUMENT level — which can't reach into the panel's shadow root.
      const safeStyle = el("style", null, "");
      app.appendChild(safeStyle);
      const syncSafeSurface = (state) => {
        const css = BC.tokens ? BC.tokens.fallbackCss(state.theming, BC.isDarkActive(state)) : "";
        if (safeStyle.textContent !== css) safeStyle.textContent = css;
      };
      syncSafeSurface(store.get());

      // -- header ---------------------------------------------------------
      const undoBtn = BC.ui.iconButton("undo", { label: "Undo", onClick: () => store.undo() });
      const redoBtn = BC.ui.iconButton("redo", { label: "Redo", onClick: () => store.redo() });
      const moreBtn = BC.ui.iconButton("more", { label: "More actions" });
      moreBtn.setAttribute("aria-haspopup", "menu");
      moreBtn.addEventListener("click", () => BC.ui.menu(moreBtn, [
        { label: "Import settings…", icon: "upload", onClick: () => importFlow(store) },
        { label: "Export settings", icon: "download", onClick: () => exportFlow(store) },
        adapter.openOptions ? { label: "Open in a browser tab", icon: "external", onClick: () => adapter.openOptions() } : null,
        { separator: true },
        { label: "Reset all settings…", icon: "refresh", danger: true, onClick: () => confirmReset(store) },
      ].filter(Boolean)));
      const search = BC.ui.input({ type: "search", placeholder: "Search settings", ariaLabel: "Search all settings", icon: "search", size: "sm" });
      search.classList.add("bcs-search");
      const header = el("header", { class: "bcs-header" }, [
        el("div", { class: "bcs-brand" }, [
          el("span", { class: "bcs-logo", "aria-hidden": "true", text: "BC" }),
          el("div", { class: "bcs-brand__text" }, [
            el("div", { class: "bcs-brand__name", text: "Better Canvas" }),
            el("div", { class: "bcs-brand__ver", text: "v" + (BC.VERSION || "") }),
          ]),
        ]),
        search,
        el("div", { class: "bcs-header__actions" }, [
          undoBtn, redoBtn, moreBtn,
          o.onClose ? BC.ui.iconButton("x", { label: "Close settings", onClick: o.onClose }) : null,
        ]),
      ]);
      app.appendChild(header);

      // -- nav ------------------------------------------------------------
      const masterSwitch = BC.ui.toggle({ checked: !!store.get().enabled, ariaLabel: "Enable Better Canvas",
        onChange: (v) => store.set((d) => { d.enabled = v; }) });
      const masterSub = el("div", { class: "bcs-master__sub" });
      const paintMaster = (st) => {
        masterSwitch.set(!!st.enabled);
        masterSub.textContent = st.enabled ? "On for this browser" : "Off — Canvas looks stock";
      };
      paintMaster(store.get());
      const nav = el("nav", { class: "bcs-nav", "aria-label": "Settings sections" }, [
        el("div", { class: "bcs-master" }, [
          el("div", { class: "bcs-master__text" }, [el("div", { class: "bcs-master__label", text: "Better Canvas" }), masterSub]),
          masterSwitch.root,
        ]),
      ]);
      const navBtns = new Map();
      function navButton(id, label, icon) {
        const b = el("button", { class: "bcs-nav__item", type: "button", "data-tab": id, title: label }, [BC.ui.icon(icon), el("span", { class: "bcs-nav__label", text: label })]);
        b.addEventListener("click", () => { search.input.value = ""; showTab(id === "edit" ? "themes" : id); });
        navBtns.set(id, b); nav.appendChild(b);
      }
      navButton("edit", "Edit Canvas", "layers");
      for (const g of ["Courses", "Tools", "More"]) {
        nav.appendChild(el("div", { class: "bcs-nav__group", text: g === "Courses" ? "Keep track" : g }));
        for (const t of TABS.filter((x) => x.group === g && !EDIT_TABS.includes(x.id))) navButton(t.id, t.label, t.icon);
      }
      const main = el("main", { class: "bcs-main" });
      root.dispose = store.destroy;
      const subnav = el("nav", { class: "bcs-subnav", "aria-label": "Edit Canvas sections" });
      for (const id of EDIT_TABS) {
        const t = TABS.find((x) => x.id === id);
        const b = el("button", { type: "button", "data-tab": id, text: { cosmetics: "Background", navigation: "Sidebar", accessibility: "Accessibility" }[id] || t.label });
        b.onclick = () => { search.input.value = ""; showTab(id); }; subnav.appendChild(b); navBtns.set(id, b);
      }
      const workspaceTitle = el("h1", { text: "Edit Canvas" });
      const workspaceDesc = el("p");
      const preview = BC.StudioPreview(adapter.preview), draftBar = el("div", { class: "bcs-draft-bar", hidden: true });
      const previewColumn = el("div", { class: "bcs-preview-column" }, [preview.root, draftBar]);
      const workspaceBody = el("div", { class: "bcs-workspace-body" }, [previewColumn, main]);
      const workspace = el("div", { class: "bcs-workspace" }, [el("div", { class: "bcs-workspace-head" }, [workspaceTitle, workspaceDesc, subnav]), workspaceBody]);
      app.appendChild(el("div", { class: "bcs-shell" }, [nav, workspace]));
      let draft = null;
      function paintPreview() {
        const state = JSON.parse(JSON.stringify(store.get()));
        if (draft) BC.applyTheme(state, draft.preset);
        preview.paint(state, draft && draft.preset.name);
      }
      function cancelDraft() { draft = null; draftBar.hidden = true; paintPreview(); }
      store.previewTheme = (preset, commit) => {
        draft = { preset, commit }; paintPreview(); draftBar.hidden = false;
        draftBar.replaceChildren(el("strong", { text: preset.name }), BC.ui.button("Cancel", { variant: "ghost", size: "sm", onClick: cancelDraft }), BC.ui.button("Apply theme", { size: "sm", onClick: async () => {
          const selected = draft; draft = null; draftBar.hidden = true;
          if (selected.commit) selected.commit(); else store.applyPreset(selected.preset);
          paintPreview();
          try { await store.flush(); BC.toast && BC.toast.success("Applied " + selected.preset.name); }
          catch (_) { BC.toast && BC.toast.error("Theme could not be saved. Try Apply again."); }
        } }));
      };
      store.cancelThemePreview = cancelDraft;

      let active = TABS.some((t) => t.id === o.initialTab) ? o.initialTab : lastTab;

      function pageHead(title, description) {
        return el("div", { class: "bcs-page__head" }, [
          el("h2", { class: "bcs-page__title", text: title }),
          description ? el("p", { class: "bcs-page__desc", text: description }) : null,
        ]);
      }

      // `still` skips the entrance animation, for rebuilds the user didn't ask for
      // (undo, reset, a change made in another tab).
      function showTab(id, still) {
        const tab = TABS.find((t) => t.id === id) || TABS[0];
        main.classList.toggle("bcs-main--still", !!still);
        active = lastTab = tab.id;
        cancelDraft();
        const editing = EDIT_TABS.includes(active);
        workspaceBody.classList.toggle("is-editing", editing);
        previewColumn.hidden = subnav.hidden = !editing;
        workspaceTitle.textContent = editing ? "Edit Canvas" : tab.label;
        workspaceDesc.textContent = tab.description;
        for (const [tid, b] of navBtns) {
          if (tid === active || (tid === "edit" && editing)) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
        }
        // Controls in the outgoing tab detach here; bindings prune themselves.
        main.replaceChildren(pageHead(tab.label, tab.description), ...[].concat(tab.render(store, adapter, {})));
        main.scrollTop = 0;
        // Rows with showWhen / enabledWhen settle their state on the first sync.
        S().bindings.sync(store.get());
      }

      // Search covers EVERY section, not just the open tab: each tab is rendered
      // (without its network-backed parts) and only matching rows are kept.
      function showSearch(q) {
        cancelDraft(); previewColumn.hidden = subnav.hidden = true; workspaceBody.classList.remove("is-editing");
        workspaceTitle.textContent = "Search settings"; workspaceDesc.textContent = "Find a control anywhere in Better Canvas.";
        const query = q.trim().toLowerCase();
        for (const b of navBtns.values()) b.removeAttribute("aria-current");
        const groups = [];
        for (const tab of TABS) {
          const frag = el("div", null, [].concat(tab.render(store, adapter, { searching: true })));
          const hits = [];
          const matches = (r) => (r.textContent || "").toLowerCase().includes(query);
          // A few rows sit outside any section, like Scene motion on Themes.
          const loose = [...frag.querySelectorAll(".bcs-row")].filter((r) => !r.closest(".bcs-section") && matches(r));
          if (loose.length) hits.push(sec(tab.label, loose));
          for (const section of frag.querySelectorAll(".bcs-section")) {
            const rows = [...section.querySelectorAll(".bcs-row")];
            const match = rows.filter(matches);
            if (!match.length) continue;
            for (const r of rows) if (!match.includes(r)) r.remove();
            hits.push(section);
          }
          if (!hits.length) continue;
          const go = BC.ui.button("Open " + tab.label, { variant: "ghost", size: "sm", iconRight: "chevron-right",
            onClick: () => { search.input.value = ""; showTab(tab.id); } });
          groups.push(el("div", { class: "bcs-results__group" }, [
            el("div", { class: "bcs-results__head" }, [BC.ui.icon(tab.icon), el("span", { text: tab.label }), el("span", { class: "bc-spacer" }), go]),
            ...hits,
          ]));
        }
        main.replaceChildren(pageHead("Search", null), ...groups);
        main.scrollTop = 0;
        S().bindings.sync(store.get());
        // Rows that don't apply right now are hidden by the sync above. A section
        // with only those left was an empty card.
        for (const section of main.querySelectorAll(".bcs-section")) if (![...section.querySelectorAll(".bcs-row")].some((r) => !r.hidden)) section.remove();
        for (const g of main.querySelectorAll(".bcs-results__group")) if (!g.querySelector(".bcs-section")) g.remove();
        // The page heading is hidden in this layout, so say it where it shows.
        if (!main.querySelector(".bcs-results__group")) workspaceDesc.textContent = 'No settings match "' + q.trim() + '".';
      }
      const runSearch = BC.util.debounce(() => {
        const q = search.input.value;
        if (q.trim()) showSearch(q); else showTab(active);
      }, 140);
      search.input.addEventListener("input", runSearch);
      search.input.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && search.input.value) { e.stopPropagation(); search.input.value = ""; showTab(active); }
      });

      store.subscribe((state, kind) => {
        saveStatus.hidden = !store.saveError;
        saveStatus.textContent = store.saveError ? "Settings could not be saved: " + store.saveError.message : "";
        S().bindings.sync(state);
        syncSafeSurface(state);
        paintMaster(state);
        paintPreview();
        undoBtn.disabled = !store.canUndo();
        redoBtn.disabled = !store.canRedo();
        // Wholesale replacement (reset / import / undo / redo / external change) can
        // alter anything including list lengths, so rebuild — preserving scroll.
        if (kind === "structural" && !search.input.value.trim()) {
          const top = main.scrollTop;
          showTab(active, true);
          main.scrollTop = top;
        }
      });

      undoBtn.disabled = !store.canUndo();
      redoBtn.disabled = !store.canRedo();
      showTab(active);
      S().bindings.sync(store.get());
      BC.SettingsUI.goto = (id) => { if (!TABS.some((t) => t.id === id)) return; search.input.value = ""; showTab(id); };
      return store;
    },
  };

  // ---- shared bits ----------------------------------------------------------

  const RESET_HINT = "Puts every option back to its default. Keeps your recurring tasks, tags, grade goals, GPA credits, saved themes, custom links, course nicknames and planner data.";
  function confirmReset(store) {
    if (confirm("Reset every Better Canvas option to its default?\n\n" + RESET_HINT.replace(/^.*?\. /, ""))) store.reset();
  }

  const sec = (title, children, extra) => S().section(Object.assign({ title, children: children.filter(Boolean) }, extra || {}));
  const row = (o) => S().row(o);
  const inline = (kids) => el("div", { class: "bcs-inline" }, kids);

  // ---- Appearance ---------------------------------------------------------

  // A sample button wearing each focus ring, drawn rather than focused.
  function ringPreview(style) {
    return el("span", { class: "bcs-ring-demo bcs-ring-demo--" + style }, [el("span", { text: "Submit" })]);
  }

  // Cards for each cursor shape, drawn in the chosen colour, so they follow the
  // colour picker. The system card is a plain white arrow.
  function cursorPicker(store) {
    const art = (shape) => {
      const img = el("img", { class: "bcs-cursor-demo", alt: "" });
      const paint = (s) => {
        const src = BC.tokens.cursor(shape === "default" ? { cursor: "arrow", cursorColor: "#ffffff" } : { ...s.theming, cursor: shape, cursorSize: 32 }).src;
        if (img.getAttribute("src") !== src) img.src = src;
      };
      paint(store.get());
      return S().bindings.add(img, paint);
    };
    return S().choice({ ariaLabel: "Cursor", get: () => BC.tokens.cursor(store.get().theming).shape,
      set: (v) => store.set((s) => { s.theming.cursor = v; }),
      options: [["default", "System", "Your computer's own pointer."], ["arrow", "Arrow"], ["dot", "Dot"], ["ring", "Ring"],
        ["precise", "Crosshair", "On everything, links too."]].map(([value, label, description]) => ({ value, label, description, preview: () => art(value) })) });
  }

  // Shows the chosen cursor even where Better Canvas doesn't set it, like the options page.
  function cursorPad(store) {
    const pad = el("div", { class: "bcs-cursor-pad", text: "Point here to try it" });
    const paint = (s) => { pad.style.cursor = BC.tokens.cursor(s.theming).css || "auto"; };
    paint(store.get());
    return S().bindings.add(pad, paint);
  }

  function renderTheming(store) {
    const C = S();
    const t = store.get().theming;
    const put = (fn) => (v) => store.set((x) => fn(x.theming, v));
    const drawn = (s) => BC.tokens.cursor(s.theming).shape !== "default";
    return [
      sec("Mode", [
        row({ label: "Dark mode", hint: "Auto follows your system. Schedule switches at the times below.",
          control: C.segmented({ ariaLabel: "Theme", get: () => t.darkMode, set: put((x, v) => { x.darkMode = v; }),
            options: [{ value: "off", label: "Light", icon: "sun" }, { value: "on", label: "Dark", icon: "moon" },
                      { value: "auto", label: "Auto", icon: "monitor" }, { value: "scheduled", label: "Schedule", icon: "clock" }] }) }),
        row({ label: "Dark between", showWhen: (s) => s.theming.darkMode === "scheduled",
          control: inline([
            C.time({ ariaLabel: "Dark mode starts", get: () => t.darkSchedule.start, set: put((x, v) => { x.darkSchedule.start = v; }) }),
            el("span", { class: "bcs-inline__sep", text: "and" }),
            C.time({ ariaLabel: "Dark mode ends", get: () => t.darkSchedule.end, set: put((x, v) => { x.darkSchedule.end = v; }) }),
          ]) }),
      ]),
      sec("Colors", [
        row({ label: "Accent", hint: "Buttons, links and highlights. Leave empty to keep your school's color.",
          control: C.color({ ariaLabel: "Accent color", allowEmpty: true, presets: ACCENTS, get: () => t.accentColor, set: put((x, v) => { x.accentColor = v; }) }) }),
        row({ label: "Dark palette", control: C.select({ ariaLabel: "Dark palette", get: () => t.darkTone, set: put((x, v) => { x.darkTone = v; }),
          options: Object.entries(BC.DARK_TONES).map(([k, v]) => ({ value: k, label: v.label })) }) }),
        row({ label: "Custom dark background", hint: "Replaces the palette's background color.",
          control: C.color({ ariaLabel: "Custom dark background", allowEmpty: true, get: () => t.darkBg, set: put((x, v) => { x.darkBg = v; }) }) }),
        fallbackNotice(store),
        row({ label: "Light palette", control: C.select({ ariaLabel: "Light palette", get: () => t.lightPreset, set: put((x, v) => { x.lightPreset = v; }),
          options: Object.entries(BC.LIGHT_PRESETS).map(([k, v]) => ({ value: k, label: v.label })) }) }),
      ]),
      sec("Typography", [
        row({ label: "Font", hint: "A CSS font stack. Empty keeps Canvas's font.",
          control: C.text({ ariaLabel: "Font family", placeholder: "Canvas default", get: () => t.font, set: put((x, v) => { x.font = v; }) }) }),
        row({ label: "Text size", control: C.segmented({ ariaLabel: "Text size", get: () => t.fontSizeScale, set: put((x, v) => { x.fontSizeScale = v; }),
          options: [{ value: "xs", label: "XS" }, { value: "s", label: "S" }, { value: "m", label: "M" }, { value: "l", label: "L" }, { value: "xl", label: "XL" }] }) }),
        row({ label: "Line height", control: C.slider({ ariaLabel: "Line height", min: 1.1, max: 2, step: 0.05, format: (v) => Number(v).toFixed(2),
          get: () => t.lineHeight, set: put((x, v) => { x.lineHeight = v; }) }) }),
        row({ label: "Letter spacing", control: C.slider({ ariaLabel: "Letter spacing", min: -1, max: 3, step: 0.1, format: (v) => Number(v).toFixed(1) + "px",
          get: () => t.letterSpacing, set: put((x, v) => { x.letterSpacing = v; }) }) }),
      ]),
      sec("Layout", [
        row({ label: "Density", hint: "Spacing inside Better Canvas panels and Canvas lists.",
          control: C.segmented({ ariaLabel: "Density", get: () => t.density, set: put((x, v) => { x.density = v; }),
            options: [{ value: "compact", label: "Compact" }, { value: "default", label: "Default" }, { value: "spacious", label: "Roomy" }, { value: "cozy", label: "Cozy" }] }) }),
        row({ label: "Corner radius", control: C.slider({ ariaLabel: "Corner radius", min: 0, max: 24, format: (v) => v + "px",
          get: () => t.radius, set: put((x, v) => { x.radius = v; }) }) }),
        row({ label: "Rounded corners", hint: "Off squares every corner, Canvas's and ours.",
          control: C.switch({ ariaLabel: "Rounded corners", get: () => t.roundedUI, set: put((x, v) => { x.roundedUI = v; }) }) }),
        row({ label: "Sidebar width", hint: "Width of Canvas's left navigation. 0 keeps the default.",
          control: C.number({ ariaLabel: "Sidebar width", min: 0, max: 400, suffix: "px", get: () => t.sidebarWidth, set: put((x, v) => { x.sidebarWidth = Math.max(0, v | 0); }) }) }),
      ]),
      sec("Visibility", [
        row({ label: "Focus ring", hint: "The outline on the link or button you reach with the Tab key.", stacked: true,
          control: C.choice({ ariaLabel: "Focus ring", get: () => t.focusRing, set: put((x, v) => { x.focusRing = v; }),
            options: [
              { value: "default", label: "Canvas", description: "Canvas's own outline.", preview: () => ringPreview("default") },
              { value: "bold", label: "Bold", description: "Thicker, in your accent color.", preview: () => ringPreview("bold") },
              { value: "high-contrast", label: "High contrast", description: "Yellow on a black edge.", preview: () => ringPreview("high-contrast") },
            ] }) }),
        row({ label: "Cursor", hint: "Links keep their hand and text boxes their I-beam, except under the crosshair.", stacked: true, control: cursorPicker(store) }),
        row({ label: "Cursor size", hint: "Your browser may switch to its own pointer near the edges of the page.", showWhen: drawn,
          control: C.slider({ ariaLabel: "Cursor size", min: 16, max: 48, step: 2, format: (v) => v + "px", get: () => t.cursorSize, set: put((x, v) => { x.cursorSize = v; }) }) }),
        row({ label: "Cursor color", showWhen: drawn,
          control: C.color({ ariaLabel: "Cursor color", presets: ["#000000", "#ffffff", ...ACCENTS], get: () => t.cursorColor, set: put((x, v) => { x.cursorColor = v; }) }) }),
        row({ label: "Try it", showWhen: drawn, stacked: true, control: cursorPad(store) }),
        row({ label: "Color-blind filter", hint: "Shifts colors you may confuse toward ones you can tell apart.", control: C.select({ ariaLabel: "Color-blind filter", get: () => t.colorBlind, set: put((x, v) => { x.colorBlind = v; }),
          options: [{ value: "off", label: "Off" }, { value: "protanopia", label: "Protanopia" }, { value: "deuteranopia", label: "Deuteranopia" }, { value: "tritanopia", label: "Tritanopia" }] }) }),
        row({ label: "High contrast", control: C.switch({ ariaLabel: "High contrast", get: () => t.highContrast, set: put((x, v) => { x.highContrast = v; }) }) }),
        row({ label: "Reduce motion", hint: "Turns off animations even if your system allows them.",
          control: C.switch({ ariaLabel: "Reduce motion", get: () => t.reducedMotion, set: put((x, v) => { x.reducedMotion = v; }) }) }),
        row({ label: "Animation speed", showWhen: (s) => !s.theming.reducedMotion,
          control: C.slider({ ariaLabel: "Animation speed", min: 0.25, max: 2, step: 0.05, format: (v) => Number(v).toFixed(2) + "×",
            get: () => t.animSpeed, set: put((x, v) => { x.animSpeed = v; }) }) }),
      ]),
    ];
  }

  // The notice tokens.js promises when the guard swaps these settings surfaces
  // to a neutral palette.
  function fallbackNotice(store) {
    const holder = el("div", { class: "bcs-row bcs-row--note" });
    const paint = (st) => {
      const on = !!(BC.tokens && BC.tokens.resolve(st.theming).guard.surfaceFallback);
      holder.hidden = !on;
      if (on && !holder.firstChild) {
        holder.appendChild(S().note({ tone: "warn", text: "This background is light enough that it needs dark text, so this settings panel switches to a neutral palette to stay readable. Canvas pages still use your color." }));
      }
    };
    paint(store.get());
    S().bindings.add(holder, paint);
    return holder;
  }

  // ---- Themes -------------------------------------------------------------

  // A shared theme file is someone else's JSON, and applyPreset deep-merges it —
  // so taking `settings` whole let a theme rewrite ANY setting. Only what a theme
  // is made of (exactly what themeSnapshot exports) is kept.
  function themeOnly(src) {
    return BC.themeOnly(src);
  }

  function themeSnapshot(store, name) {
    const cur = store.get();
    const theming = JSON.parse(JSON.stringify(cur.theming));
    delete theming.rotation; // rotation config isn't part of a theme's look
    const images = BC.themeImages(cur.dashboard.themeImages);
    for (const course of Object.values(cur.dashboard.courses || {})) {
      if (course && course.bgImage && !images.some((i) => i.url === course.bgImage)) images.push({ url: course.bgImage });
    }
    return { id: BC.util.uuid(), name, settings: { theming, cosmetics: JSON.parse(JSON.stringify(cur.cosmetics)),
      dashboard: { themeImages: BC.themeImages(images) } } };
  }

  function download(text, name, type) {
    const blob = new Blob([text], { type: type || "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function downloadTheme(bundle) {
    download(JSON.stringify(bundle, null, 2), (bundle.name || "theme").toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".bctheme.json");
  }

  // A small rendering of the theme: page, panel, text lines and the accent.
  function themePreview(settings) {
    const t = settings.theming || {};
    const pal = BC.color.themePalettes(t);
    const dark = t.darkMode === "on";
    const p = dark ? pal.dark : pal.light;
    const accent = BC.color.normalizeHex(t.accentColor) || p.accent;
    const box = el("div", { class: "bcs-theme__preview", "aria-hidden": "true" });
    box.style.background = p.bg;
    box.innerHTML = '<div class="bcs-theme__bar"></div><div class="bcs-theme__panel"><i></i><i></i><b></b></div>';
    box.querySelector(".bcs-theme__bar").style.background = dark ? p.bg2 : "#18181b";
    const panel = box.querySelector(".bcs-theme__panel");
    panel.style.background = p.bg2;
    panel.style.borderColor = p.border;
    for (const i of panel.querySelectorAll("i")) i.style.background = p.muted;
    panel.querySelector("b").style.background = accent;
    const artworks = BC.themeImages(settings.dashboard && settings.dashboard.themeImages);
    const bg = settings.cosmetics && settings.cosmetics.background;
    const artwork = artworks[0];
    if (artwork) {
      box.classList.add("bcs-theme__preview--image");
      const img = el("div", { class: "bcs-theme-art", style: BC.themeMedia.style(bg && bg.mode === "image" ? bg.image : artwork.url) });
      box.prepend(img);
      panel.replaceChildren(el("i", { class: "bcs-theme__heading" }), el("div", { class: "bcs-theme__mini-cards" },
        artworks.slice(1, 4).concat(artworks).slice(0, 3).map((art) => el("div", { style: "background:" + p.bg2 }, [
          el("div", { class: "bcs-theme-art", style: BC.themeMedia.style(art.url) }),
          el("i", { style: "background:" + p.muted }), el("b", { style: "background:" + accent }),
        ]))));
      panel.style.background = "transparent";
      panel.style.borderColor = "transparent";
      panel.querySelector(".bcs-theme__heading").style.background = p.text;
      const count = settings.dashboard.themeImages.length;
      if (count > 1) box.appendChild(el("span", { class: "bcs-theme__count", text: count + " images" }));
    }
    if (t.darkMode === "auto") box.classList.add("bcs-theme__preview--auto");
    return box;
  }

  function themeCard(store, p, custom, onApply) {
    const card = el("div", { class: "bcs-theme" });
    const apply = el("button", { class: "bcs-theme__apply", type: "button", "aria-label": "Preview theme " + p.name }, [
      themePreview(p.settings || {}),
      el("span", { class: "bcs-theme__name bc-truncate", text: p.name }),
      p.description ? el("span", { class: "bcs-theme__description", text: p.description }) : null,
    ]);
    apply.addEventListener("click", async () => {
      if (onApply) onApply();
      else if (store.previewTheme) store.previewTheme(p);
      else {
        store.applyPreset(p);
        try { await store.flush(); BC.toast && BC.toast.success("Applied " + p.name); }
        catch (error) { BC.toast && BC.toast.error("Theme could not be saved: " + error.message); }
      }
    });
    if (p.animated) apply.querySelector(".bcs-theme__preview").appendChild(el("span", { class: "bcs-motion-badge", text: "Live scenery" }));
    const syncSelected = () => {
      const current = store.get(), t = p.settings && p.settings.theming || {};
      const activeImages = current.dashboard.themeImages || [], presetImages = p.settings && p.settings.dashboard && p.settings.dashboard.themeImages || [];
      const selected = activeImages.length === presetImages.length && activeImages.every((img, i) => img.url === presetImages[i].url)
        && current.theming.darkMode === (t.darkMode || "off") && current.theming.accentColor === (t.accentColor || "");
      apply.setAttribute("aria-pressed", String(selected));
    };
    syncSelected(); S().bindings.add(apply, syncSelected);
    card.appendChild(apply);
    const art = BC.themeImages(p.settings && p.settings.dashboard && p.settings.dashboard.themeImages)[0];
    if (art && art.source) card.appendChild(el("div", { class: "bcs-theme__credit bc-truncate" }, [
      el("a", { href: art.source, target: "_blank", rel: "noopener noreferrer", title: art.title, text: art.creator || "Image source" }),
      art.license ? " · " : null,
      art.licenseUrl ? el("a", { href: art.licenseUrl, target: "_blank", rel: "noopener noreferrer", text: art.license }) : art.license,
    ]));
    const credits = BC.themeImages(p.settings && p.settings.dashboard && p.settings.dashboard.themeImages).filter((i) => i.source);
    if (credits.length > 1) card.appendChild(el("details", { class: "bcs-theme__credits" }, [
      el("summary", { text: credits.length + " image credits" }),
      ...credits.map((i) => el("div", null, [
        el("a", { href: i.source, target: "_blank", rel: "noopener noreferrer", text: [i.title, i.creator].filter(Boolean).join(" · ") }),
        i.licenseUrl ? el("a", { href: i.licenseUrl, target: "_blank", rel: "noopener noreferrer", text: i.license }) : null,
      ])),
    ]));
    if (custom) {
      const more = BC.ui.iconButton("more", { label: "Theme actions for " + p.name, size: "sm" });
      more.classList.add("bcs-theme__more");
      more.addEventListener("click", () => BC.ui.menu(more, [
        { label: "Export file", icon: "download", onClick: () => downloadTheme(p) },
        { label: "Delete", icon: "trash", danger: true, onClick: () => store.set((x) => { x.customThemes = (x.customThemes || []).filter((q) => q.id !== p.id); }) },
      ]));
      card.appendChild(more);
    }
    return card;
  }

  function themeBrowser(store) {
    const library = BC.themeLibrary;
    let source = "featured", category = "all", generation = 0, page = 0, pages = 0;
    let results = [], dark = true, background = true, activeQuery = "";
    const grid = el("div", { class: "bcs-themes" });
    const status = el("p", { class: "bc-caption", role: "status", "aria-live": "polite" });
    const search = BC.ui.input({ size: "sm", placeholder: "Search themes…", ariaLabel: "Search themes" });
    search.type = "search";
    const form = el("form", { class: "bcs-inline bcs-inline--grow" }, [search,
      BC.ui.button("Search", { size: "sm", onClick: () => runSearch() })]);
    form.addEventListener("submit", (e) => { e.preventDefault(); runSearch(); });
    const sources = el("div", { class: "bcs-inline" });
    const categories = el("div", { class: "bcs-theme-categories", role: "group", "aria-label": "Theme categories" });
    const onlineOptions = el("div", { class: "bcs-inline bcs-theme-options", hidden: true }, [
      S().segmented({ ariaLabel: "Image theme appearance", get: () => dark ? "dark" : "light", set: (v) => { dark = v === "dark"; generation++; grid.removeAttribute("aria-busy"); paintOnline(); },
        options: [{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }] }),
      BC.ui.checkbox({ label: "Include wallpaper", checked: true, onChange: (on) => { background = on; generation++; grid.removeAttribute("aria-busy"); paintOnline(); } }),
    ]);
    const more = BC.ui.button("Load more", { size: "sm", onClick: () => load(page + 1) });
    more.hidden = true;
    const set = BC.ui.button("Use these images as a set", { size: "sm", onClick: () => {
      if (results.length) completeOnline(results[0]);
    } });
    set.hidden = true;
    const refresh = BC.ui.button("Refresh", { size: "sm", variant: "ghost", onClick: () => load(1, true) });
    refresh.hidden = true;
    const root = sec("Browse themes", [sources, form, categories, onlineOptions, status, grid,
      el("div", { class: "bcs-inline" }, [more, set, refresh])], {
      description: "Wallpaper, distinct course artwork and coordinated surfaces. Preview a look, then make it yours.",
    });

    function controls() {
      for (const b of sources.children) b.setAttribute("aria-pressed", String(b.dataset.source === source));
      for (const b of categories.children) { b.setAttribute("aria-pressed", String(b.dataset.category === category)); b.hidden = source === "online" && b.dataset.category === "animated"; }
      onlineOptions.hidden = source !== "online";
      refresh.hidden = source !== "online";
      search.placeholder = source === "online" ? "Search images: mountains, galaxies, Tokyo…" : "Search featured themes…";
    }
    function featured() {
      const q = search.value.trim().toLowerCase();
      const matches = BC.PRESET_THEMES.filter((p) => !!p.classic === (source === "classic") && (category === "all" || p.category === category || category === "animated" && p.animated) &&
        (p.name + " " + p.category + " " + (p.description || "")).toLowerCase().includes(q))
        .sort((a, b) => Number(!!b.animated) - Number(!!a.animated) || Number(b.id.startsWith("photos-")) - Number(a.id.startsWith("photos-")));
      grid.replaceChildren(...matches.map((p) => themeCard(store, p, false)));
      status.textContent = matches.length ? matches.length + (source === "classic" ? " classic palettes · colors and simple card artwork" : " complete themes · wallpaper + distinct course images + styled surfaces") : "No themes match. Try Explore online.";
      more.hidden = set.hidden = true;
    }
    function applyOnline(theme, commit) {
      if (!commit && store.previewTheme) { store.previewTheme(theme, () => applyOnline(theme, true)); return; }
      store.set((x) => {
        const saved = x.customThemes || [];
        x.customThemes = saved.filter((p) => p.id !== theme.id).concat([theme]);
      });
      store.applyPreset(theme);

    }
    function paintOnline() {
      if (source !== "online") return;
      grid.replaceChildren(...results.map((image) => {
        const p = library.makeTheme([image, ...results.filter((r) => r.url !== image.url)], { category, dark, background });
        return themeCard(store, p, false, () => completeOnline(image));
      }));
      set.hidden = results.length < 2;
    }
    async function completeOnline(cover) {
      const seq = ++generation, query = activeQuery;
      const options = { name: query + " · " + cover.title, category, dark, background };
      const collection = [cover, ...results.filter((r) => r.url !== cover.url)];
      const seen = new Set(collection.map((r) => r.url));
      grid.setAttribute("aria-busy", "true");
      status.textContent = "Collecting different images for your courses…";
      try {
        for (let p = page + 1; collection.length < 48 && p <= Math.min(pages, page + 3); p++) {
          const data = await library.search(query, p);
          if (seq !== generation || !root.isConnected || source !== "online") return;
          for (const image of data.images) if (!seen.has(image.url)) { collection.push(image); seen.add(image.url); }
        }
        if (seq !== generation || !root.isConnected || source !== "online") return;
        const theme = library.makeTheme(collection.slice(0, 64), options);
        // Small searches still get distinct cards. Fill shortages with the
        // matching original illustration collection instead of repeating a photo.
        const style = theme.settings.theming.experience;
        for (let i = 0; theme.settings.dashboard.themeImages.length < 48; i++) theme.settings.dashboard.themeImages.push(BC.sceneArt(style, i));
        applyOnline(theme);
        status.textContent = "Previewing " + Math.min(64, collection.length) + " images" + (collection.length < 48 ? ", with matching illustrations for the remaining courses" : "") + ". Press Apply theme to keep it.";
      } catch (e) { if (seq === generation) status.textContent = e.message; }
      finally { if (seq === generation) grid.removeAttribute("aria-busy"); }
    }
    async function load(nextPage = 1, force = false) {
      const seq = ++generation;
      if (nextPage === 1) {
        activeQuery = search.value.trim() || (library.categories.find((c) => c.id === category) || library.categories[0]).query;
        results = []; page = pages = 0; grid.replaceChildren();
      }
      const query = activeQuery;
      more.hidden = set.hidden = true;
      status.textContent = "Finding image themes…";
      grid.setAttribute("aria-busy", "true");
      try {
        const data = await library.search(query, nextPage, force);
        if (seq !== generation || !root.isConnected || source !== "online") return;
        const seen = new Set(results.map((i) => i.url));
        for (const image of data.images) if (!seen.has(image.url)) { results.push(image); seen.add(image.url); }
        page = data.page; pages = data.pages;
        paintOnline();
        more.hidden = page >= pages;
        status.textContent = results.length ? results.length + " wallpapers · Openverse · Pick one; matching images fill your course cards." : "No images found. Try another search.";
      } catch (e) {
        if (seq !== generation || !root.isConnected || source !== "online") return;
        status.textContent = e.message;
        more.hidden = !(page > 0 && page < pages);
      } finally {
        if (seq === generation) grid.removeAttribute("aria-busy");
      }
    }
    function runSearch() { if (source === "online") load(); else featured(); }
    search.addEventListener("input", () => { if (source !== "online") featured(); });
    for (const [id, label] of [["featured", "Full themes"], ["online", "Explore online"], ["classic", "Classic palettes"]]) {
      const b = BC.ui.button(label, { size: "sm", onClick: () => {
        if (source === id) return;
        source = id; if (source === "online" && category === "animated") category = "all"; generation++; controls();
        if (source === "online") load(); else { grid.removeAttribute("aria-busy"); featured(); }
      } });
      b.dataset.source = id; sources.appendChild(b);
    }
    for (const c of [{ id: "all", label: "All" }, { id: "animated", label: "Animated", query: "landscape" }, ...library.categories]) {
      const b = BC.ui.button(c.label, { size: "sm", variant: "ghost", onClick: () => {
        category = c.id;
        search.value = source === "online" ? c.query || "landscape" : "";
        controls(); runSearch();
      } });
      b.dataset.category = c.id; categories.appendChild(b);
    }
    controls(); featured();
    return root;
  }

  function importTheme(store) {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "application/json,.json";
    inp.onchange = () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      f.text().then(async (txt) => {
        try {
          const j = JSON.parse(txt);
          const settings = j && typeof j === "object" ? themeOnly(j.settings) : null;
          if (!settings) throw new Error("this file has no theme in it");
          const saved = { id: BC.util.uuid(), name: String(j.name || "Imported theme").slice(0, 80), settings };
          store.set((x) => { x.customThemes = (x.customThemes || []).concat([saved]); });
          store.applyPreset(saved);
          await store.flush();
          BC.toast && BC.toast.success("Imported " + saved.name);
        } catch (error) { BC.toast && BC.toast.error("Theme could not be imported: " + error.message); }
      });
    };
    inp.click();
  }

  function renderThemes(store) {
    const C = S();
    const themesSig = () => JSON.stringify((store.get().customThemes || []).map((p) => [p.id, p.name]));
    return [
      row({ label: "Scene motion", hint: "Ambient motion on wallpaper and cards. Reduced motion always takes priority.", control: C.select({ ariaLabel: "Scene motion", get: () => store.get().cosmetics.motion || "none", set: (v) => store.set((x) => { x.cosmetics.motion = v; }), options: ["none", "fireflies", "rain", "stars", "petals"].map((v) => ({ value: v, label: v === "none" ? "Still" : v.charAt(0).toUpperCase() + v.slice(1) })) }) }),
      themeBrowser(store),
      row({ label: "Course images", hint: "Clear theme artwork and individual image overrides to restore Canvas's original course pictures.", stacked: true,
        control: BC.ui.button("Restore Canvas images", { size: "sm", onClick: () => store.set((x) => {
          x.dashboard.themeImages = [];
          for (const c of Object.values(x.dashboard.courses || {})) if (c && typeof c === "object") delete c.bgImage;
        }, { replacePaths: [["dashboard", "themeImages"], ["dashboard", "courses", "*", "bgImage"]] }) }) }),
      live(() => {
        const custom = store.get().customThemes || [];
        const name = BC.ui.input({ size: "sm", placeholder: "Name this look", ariaLabel: "Theme name" });
        const save = BC.ui.button("Save current look", { size: "sm", icon: "plus", onClick: async () => {
          const n = name.value.trim() || "My theme";
          store.set((x) => { x.customThemes = (x.customThemes || []).concat([themeSnapshot(store, n)]); });
          try { await store.flush(); BC.toast && BC.toast.success("Saved " + n); }
          catch (error) { BC.toast && BC.toast.error("Theme could not be saved: " + error.message); }
        } });
        return sec("My themes", [
          custom.length
            ? el("div", { class: "bcs-themes" }, custom.map((p) => themeCard(store, p, true)))
            : el("p", { class: "bcs-empty", text: "Set up a look in Appearance and Background, then save it here." }),
          el("div", { class: "bcs-inline bcs-inline--grow" }, [name, save]),
        ], { actions: [
          BC.ui.button("Import", { size: "sm", variant: "ghost", icon: "upload", onClick: () => importTheme(store) }),
          BC.ui.button("Export current", { size: "sm", variant: "ghost", icon: "download", onClick: () => downloadTheme(themeSnapshot(store, "My theme")) }),
        ] });
      }, themesSig),
      live(() => {
        const rot = store.get().theming.rotation;
        const pool = (store.get().customThemes || []).concat(BC.PRESET_THEMES || []);
        return sec("Rotation", [
          row({ label: "Rotate themes", hint: "Switch to the next selected theme automatically.",
            control: C.switch({ ariaLabel: "Rotate themes", get: () => rot.enabled, set: (v) => store.set((x) => { x.theming.rotation.enabled = v; }) }) }),
          row({ label: "Every", enabledWhen: (s) => s.theming.rotation.enabled,
            control: C.segmented({ ariaLabel: "Rotate every", get: () => rot.mode, set: (v) => store.set((x) => { x.theming.rotation.mode = v; }),
              options: [{ value: "daily", label: "Day" }, { value: "weekly", label: "Week" }] }) }),
          row({ label: "Themes in rotation", stacked: true, enabledWhen: (s) => s.theming.rotation.enabled,
            control: el("div", { class: "bcs-checks" }, pool.map((th) => BC.ui.checkbox({
              label: th.name, checked: (rot.themeIds || []).includes(th.id),
              onChange: (on) => store.set((x) => {
                const ids = new Set(x.theming.rotation.themeIds || []);
                if (on) ids.add(th.id); else ids.delete(th.id);
                x.theming.rotation.themeIds = Array.from(ids);
              }),
            }))) }),
        ]);
      }, themesSig),
    ];
  }

  // ---- Background & CSS ---------------------------------------------------

  // Canvas's text sits straight on the page background, so a dark background in
  // light mode (or a light one in dark mode) makes the sidebar and headings hard to
  // read. Say so where it's set, with the one-click fix.
  function bgContrastNotice(store) {
    const holder = el("div", { class: "bcs-row bcs-row--note" });
    const tone = (bg) => {
      const hexes = bg.mode === "gradient" ? [bg.gradient.from, bg.gradient.to] : bg.mode === "color" || bg.mode === "pattern" ? [bg.color] : [];
      const ok = hexes.filter((h) => BC.color.isHex(h));
      if (!ok.length) return null;
      const L = ok.reduce((n, h) => n + BC.color.relLuminance(h), 0) / ok.length;
      return L < 0.18 ? "dark" : L > 0.6 ? "light" : null;
    };
    const paint = (s) => {
      const bg = s.cosmetics.background;
      const t = tone(bg);
      const when = bg.when || "always";
      const clash = bg.mode !== "none" && t && ((t === "dark" && when !== "dark") || (t === "light" && when !== "light"));
      holder.hidden = !clash;
      if (!clash) return;
      const fixTo = t === "dark" ? "dark" : "light";
      holder.replaceChildren(S().note({ tone: "warn", text: t === "dark"
        ? "This background is dark, so Canvas's dark text is hard to read on it in light mode."
        : "This background is light, so Canvas's light text is hard to read on it in dark mode." }),
        el("div", { style: "margin-top:8px" }, [BC.ui.button(t === "dark" ? "Use it in dark mode only" : "Use it in light mode only", {
          size: "sm", onClick: () => store.set((x) => { x.cosmetics.background.when = fixTo; }) })]));
    };
    paint(store.get());
    S().bindings.add(holder, paint);
    return holder;
  }

  function renderCosmetics(store) {
    const C = S();
    const b = store.get().cosmetics.background;
    const put = (fn) => (v) => store.set((x) => fn(x.cosmetics.background, v));
    const mode = (...m) => (s) => m.includes(s.cosmetics.background.mode);
    return [
      sec("Page background", [
        row({ label: "Background", control: C.segmented({ ariaLabel: "Background", get: () => b.mode,
          // "pattern" with no pattern chosen is just a colour; start it on dots.
          set: put((x, v) => { x.mode = v; if (v === "pattern" && (!x.pattern || x.pattern === "none")) x.pattern = "dots"; }),
          options: [{ value: "none", label: "None" }, { value: "color", label: "Color" }, { value: "gradient", label: "Gradient" }, { value: "image", label: "Image" }, { value: "pattern", label: "Pattern" }] }) }),
        row({ label: "Color", showWhen: mode("color", "pattern"), control: C.color({ ariaLabel: "Background color", get: () => b.color, set: put((x, v) => { x.color = v; }) }) }),
        row({ label: "From", showWhen: mode("gradient"), control: C.color({ ariaLabel: "Gradient start", get: () => b.gradient.from, set: put((x, v) => { x.gradient.from = v; }) }) }),
        row({ label: "To", showWhen: mode("gradient"), control: C.color({ ariaLabel: "Gradient end", get: () => b.gradient.to, set: put((x, v) => { x.gradient.to = v; }) }) }),
        row({ label: "Angle", showWhen: mode("gradient"), control: C.slider({ ariaLabel: "Gradient angle", min: 0, max: 360, format: (v) => v + "°", get: () => b.gradient.angle, set: put((x, v) => { x.gradient.angle = v; }) }) }),
        row({ label: "Image URL", showWhen: mode("image"), control: C.text({ ariaLabel: "Background image URL", placeholder: "https://…", get: () => b.image, set: put((x, v) => { x.image = v; }) }) }),
        row({ label: "Pattern", showWhen: mode("pattern"), control: C.segmented({ ariaLabel: "Pattern", get: () => b.pattern, set: put((x, v) => { x.pattern = v; }),
          options: [{ value: "dots", label: "Dots" }, { value: "grid", label: "Grid" }, { value: "diagonal", label: "Lines" }, { value: "topography", label: "Waves" }] }) }),
        row({ label: "Blur", showWhen: (s) => s.cosmetics.background.mode !== "none", control: C.slider({ ariaLabel: "Blur", min: 0, max: 40, format: (v) => v + "px", get: () => b.blur, set: put((x, v) => { x.blur = v; }) }) }),
        row({ label: "Opacity", showWhen: (s) => s.cosmetics.background.mode !== "none", control: C.slider({ ariaLabel: "Opacity", min: 0, max: 100, format: (v) => v + "%", get: () => b.opacity, set: put((x, v) => { x.opacity = v; }) }) }),
        row({ label: "Show in", hint: "Limit it to one mode, e.g. a dark background for dark mode only.",
          showWhen: (s) => s.cosmetics.background.mode !== "none",
          control: C.segmented({ ariaLabel: "Show background in", get: () => b.when || "always", set: put((x, v) => { x.when = v; }),
            options: [{ value: "always", label: "Both modes" }, { value: "dark", label: "Dark only" }, { value: "light", label: "Light only" }] }) }),
        bgContrastNotice(store),
      ]),
      sec("Custom CSS", [
        row({ label: "Your CSS", hint: "Added to every Canvas page after everything else.", stacked: true,
          control: C.textarea({ ariaLabel: "Custom CSS", mono: true, rows: 10, placeholder: "/* e.g. .ic-DashboardCard { border-radius: 0 } */",
            get: () => store.get().cosmetics.customCss, set: (v) => store.set((x) => { x.cosmetics.customCss = v; }) }) }),
      ]),
    ];
  }

  // ---- Dashboard ----------------------------------------------------------

  function renderDashboard(store, adapter, ctx) {
    const C = S();
    const d = store.get().dashboard;
    const put = (fn) => (v) => store.set((x) => fn(x.dashboard, v));
    const on = (s) => s.dashboard.enabled;
    const sw = (label, key, hint) => row({ label, hint, enabledWhen: on,
      control: C.switch({ ariaLabel: label, get: () => d[key], set: put((x, v) => { x[key] = v; }) }) });
    const widget = (label, key) => row({ label, enabledWhen: on,
      control: C.switch({ ariaLabel: label, get: () => d.widgets[key], set: put((x, v) => { x.widgets[key] = v; }) }) });

    const coursesMount = el("div", { class: "bcs-courses" }, [BC.ui.skeleton(3)]);
    if (!ctx.searching && adapter.getCourses) {
      adapter.getCourses().then((courses) => {
        if (!coursesMount.isConnected) return;   // tab switched away mid-fetch
        renderCourseEditor(coursesMount, store, courses);
      }).catch(() => { coursesMount.replaceChildren(BC.ui.empty("Open Canvas in a tab to edit your courses.", null, { icon: "info" })); });
    }

    return [
      sec("General", [
        row({ label: "Customize the dashboard", hint: "Off leaves Canvas's dashboard exactly as it is.",
          control: C.switch({ ariaLabel: "Customize the dashboard", get: () => d.enabled, set: put((x, v) => { x.enabled = v; }) }) }),
        sw("Hide finished courses", "autoHideConcluded", "Courses Canvas marks as concluded."),
      ]),
      sec("Cards", [
        row({ label: "Layout", enabledWhen: on, control: C.segmented({ ariaLabel: "Card layout", get: () => d.layout, set: put((x, v) => { x.layout = v; }),
          options: [{ value: "grid", label: "Grid", icon: "grid" }, { value: "list", label: "List", icon: "list" }, { value: "masonry", label: "Masonry", icon: "columns" }, { value: "compact", label: "Compact", icon: "minus" }] }) }),
        row({ label: "Card size", enabledWhen: on, showWhen: (s) => s.dashboard.layout === "grid" || s.dashboard.layout === "masonry",
          control: C.segmented({ ariaLabel: "Card size", get: () => d.cardSize, set: put((x, v) => { x.cardSize = v; }),
            options: [{ value: "s", label: "Small" }, { value: "m", label: "Medium" }, { value: "l", label: "Large" }] }) }),
        row({ label: "Corner radius", enabledWhen: on, control: C.slider({ ariaLabel: "Card corner radius", min: 0, max: 24, format: (v) => v + "px", get: () => d.cardRadius, set: put((x, v) => { x.cardRadius = v; }) }) }),
        sw("Lift on hover", "hoverLift"),
      ]),
      sec("On each card", [
        sw("Current grade", "showInlineGrade", "A score pill in the corner."),
        sw("Progress bar", "showProgressBar", "Share of planner items done in the last month."),
        sw("Due soon badge", "showBadges", "Items due in the next 24 hours."),
        sw("Grade trend", "showSparkline", "Needs a few days of recorded grades."),
      ]),
      sec("Around the cards", [
        sw("Course search", "courseSearch", "A filter box above the cards."),
        sw("Semester progress", "semesterProgress", "Week X of Y and days left, from your term dates."),
      ]),
      sec("Right sidebar", [
        widget("To Do", "todo"),
        widget("Coming Up", "comingUp"),
        widget("Recent Feedback", "recentFeedback"),
        widget("View Grades", "viewGrades"),
        widget("GPA estimate", "gpa"),
        sw("Hide the whole sidebar", "hideSidebar"),
      ]),
      sec("Courses", [coursesMount], { description: "Drag to reorder. Rename, recolor or hide any card — changes show on the dashboard right away." }),
    ];
  }

  function renderCourseEditor(mount, store, courses) {
    const search = BC.ui.input({ size: "sm", type: "search", placeholder: "Filter courses", ariaLabel: "Filter courses", icon: "search" });
    const results = el("div");
    const bulk = BC.ui.iconButton("more", { label: "Bulk actions", size: "sm" });
    bulk.addEventListener("click", () => BC.ui.menu(bulk, [
      { label: "Show all courses", icon: "eye", onClick: () => store.set((x) => { for (const c of courses) x.dashboard.courses[c.id] = { ...(x.dashboard.courses[c.id] || {}), hidden: false }; }) },
      { label: "Reset all colors", icon: "droplet", onClick: () => store.set((x) => { for (const c of courses) if (x.dashboard.courses[c.id]) delete x.dashboard.courses[c.id].color; }) },
      { label: "Reset all names", icon: "type", onClick: () => store.set((x) => { for (const c of courses) if (x.dashboard.courses[c.id]) delete x.dashboard.courses[c.id].nickname; }) },
    ]));
    function draw() {
      const q = search.input.value.toLowerCase();
      const filtered = courses.filter((c) => (c.name + " " + c.code).toLowerCase().includes(q));
      const order = (store.get().dashboard.courseOrder || []).slice();
      for (const c of filtered) if (!order.includes(c.id)) order.push(c.id);
      const ordered = order.map((id) => filtered.find((c) => c.id === id)).filter(Boolean);
      results.replaceChildren(ordered.length ? S().sortable({
        items: ordered,
        render: (c) => renderCourseRow(store, c),
        onChange: (ids) => store.set((x) => {
          const rest = (x.dashboard.courseOrder || []).filter((id) => !ids.includes(id));
          x.dashboard.courseOrder = ids.concat(rest);
        }),
      }) : BC.ui.empty("No courses match."));
    }
    search.input.addEventListener("input", draw);
    mount.replaceChildren(el("div", { class: "bcs-inline bcs-inline--grow" }, [search, bulk]), results);
    draw();
  }

  function renderCourseRow(store, c) {
    const spec0 = (store.get().dashboard.courses || {})[c.id] || {};
    const update = (patch) => store.set((x) => { x.dashboard.courses[c.id] = { ...(x.dashboard.courses[c.id] || {}), ...patch }; });
    const colorOf = (spec) => {
      const v = String(spec.color || c.color || "#0374b5").toLowerCase();
      return BC.color.isHex(v) ? v : "#0374b5";
    };
    const picker = el("input", { type: "color", class: "bcs-color__native", tabindex: "-1", "aria-hidden": "true" });
    picker.value = colorOf(spec0);
    const swatch = el("button", { type: "button", class: "bcs-color__swatch bcs-course__swatch", "aria-label": "Card color for " + c.name });
    swatch.addEventListener("click", () => picker.click());
    picker.addEventListener("input", () => { swatch.style.background = picker.value; update({ color: picker.value }); });
    const name = BC.ui.input({ size: "sm", placeholder: c.name, ariaLabel: "Nickname for " + c.name, value: spec0.nickname || "" });
    name.addEventListener("input", () => update({ nickname: name.value }));
    const hide = BC.ui.iconButton("eye", { label: "Show " + c.name + " on the dashboard", size: "sm" });
    hide.addEventListener("click", () => update({ hidden: !((store.get().dashboard.courses || {})[c.id] || {}).hidden }));
    const bg = BC.ui.input({ size: "sm", placeholder: "Card image URL (optional)", ariaLabel: "Card image URL for " + c.name, value: spec0.bgImage || "" });
    bg.addEventListener("input", () => update({ bgImage: bg.value.trim() }));
    const imgBtn = BC.ui.iconButton("image", { label: "Card image for " + c.name, size: "sm" });
    const bgRow = el("div", { class: "bcs-course__bg" }, [bg]);
    bgRow.hidden = !spec0.bgImage;
    imgBtn.addEventListener("click", () => { bgRow.hidden = !bgRow.hidden; if (!bgRow.hidden) bg.focus(); });
    const wrap = el("div", { class: "bcs-course" }, [
      el("div", { class: "bcs-course__main" }, [picker, swatch, name, el("span", { class: "bcs-course__code bc-truncate", text: c.code || "" }), imgBtn, hide]),
      bgRow,
    ]);
    // "Show all" / "Reset colors" / "Reset names" change every course at once;
    // the binding keeps each row in step.
    S().bindings.add(wrap, () => {
      const spec = (store.get().dashboard.courses || {})[c.id] || {};
      if (!focused(name) && name.value !== (spec.nickname || "")) name.value = spec.nickname || "";
      if (picker.value !== colorOf(spec)) picker.value = colorOf(spec);
      swatch.style.background = colorOf(spec);
      const hidden = !!spec.hidden;
      hide.replaceChildren(BC.ui.icon(hidden ? "eye-off" : "eye"));
      hide.setAttribute("aria-pressed", hidden ? "false" : "true");
      hide.setAttribute("aria-label", (hidden ? "Show " : "Hide ") + c.name + " on the dashboard");
      hide.title = hidden ? "Hidden — click to show" : "Shown — click to hide";
      wrap.classList.toggle("bcs-course--hidden", hidden);
      if (!focused(bg) && bg.value !== (spec.bgImage || "")) bg.value = spec.bgImage || "";
    });
    return wrap;
  }

  // ---- To Do --------------------------------------------------------------

  // Small drawn previews for the To Do style cards.
  function todoPreview(kind) {
    const i = (cls) => el("i", { class: cls });
    const row = (extra, first) => el("span", { class: "pv-row" + (first ? " pv-row--hi" : "") }, [
      kind === "planner" ? i("pv-chk" + (extra ? " pv-chk--on" : "")) : i("pv-ic"),
      el("span", { class: "pv-lines" }, [i("pv-l pv-l--a"), i("pv-l pv-l--s")]),
      kind === "canvas" ? i("pv-x") : null,
    ]);
    if (kind === "planner") {
      return el("span", { class: "pv pv--planner" }, [
        el("span", { class: "pv-top" }, [i("pv-ring"), el("span", { class: "pv-lines" }, [i("pv-l pv-l--t"), i("pv-l pv-l--s")])]),
        row(true), row(false), row(false),
      ]);
    }
    return el("span", { class: "pv pv--" + kind }, [i("pv-h"), row(false, true), row(false), row(false)]);
  }

  function renderWidgets(store) {
    const state = store.get(), C = S();
    const dash = (s) => s.dashboard.enabled;
    const widget = (label, key) => row({ label, enabledWhen: dash, control: C.switch({ ariaLabel: label + " widget", get: () => state.dashboard.widgets[key], set: (v) => store.set((s) => { s.dashboard.widgets[key] = v; }) }) });
    return [sec("Dashboard widgets", [widget("To Do", "todo"), widget("Coming Up", "comingUp"), widget("Recent Feedback", "recentFeedback"), widget("View Grades", "viewGrades"), widget("GPA estimate", "gpa"),
      row({ label: "Mini calendar", control: C.switch({ ariaLabel: "Mini calendar widget", get: () => state.calendar.miniOnDashboard, set: (v) => store.set((s) => { s.calendar.miniOnDashboard = v; }) }) }),
      row({ label: "Hide sidebar", enabledWhen: dash, control: C.switch({ ariaLabel: "Hide sidebar", get: () => state.dashboard.hideSidebar, set: (v) => store.set((s) => { s.dashboard.hideSidebar = v; }) }) }),
    ], { description: "Most of these need dashboard customization, under Edit Canvas > Dashboard." }), sec("On the page", [row({ label: "Sticky notes", hint: "Attach a note to the page you are studying.", control: C.switch({ ariaLabel: "Sticky notes", get: () => state.productivity.stickyNotes, set: (v) => store.set((s) => { s.productivity.stickyNotes = v; }) }) }),
      row({ label: "Focus timer", hint: "Needs the Planner style under To Do.", enabledWhen: (s) => s.todo.mode === "custom", control: C.switch({ ariaLabel: "Focus timer widget", get: () => state.todo.pomodoro.enabled, set: (v) => store.set((s) => { s.todo.pomodoro.enabled = v; }) }) }),
    ])];
  }

  function progressPicker(store) {
    const node = S().choice({ ariaLabel: "Progress shape", get: () => store.get().todo.ring === false ? "off" : store.get().todo.progressStyle,
      set: (value) => store.set((s) => { s.todo.ring = value !== "off"; if (value !== "off") s.todo.progressStyle = value; }),
      options: [["ring", "Circle"], ["rainbow", "Rainbow"], ["bar", "Bar"], ["heart", "Heart"], ["cloud", "Cloud"], ["off", "None"]].map(([value, label]) => ({ value, label, preview: () => value === "off" ? el("span", { text: "-" }) : BC.progressArt(value, 3, 5) })) });
    node.classList.add("bcs-progress-picker"); return node;
  }

  function renderTodo(store) {
    const C = S();
    const t = store.get().todo;
    const put = (fn) => (v) => store.set((x) => fn(x.todo, v));
    const planner = (s) => s.todo.mode === "custom";
    return [
      sec("Style", [
        row({ label: "To Do list", stacked: true,
          control: C.choice({ ariaLabel: "To Do list style", get: () => t.mode, set: put((x, v) => { x.mode = v; }),
            options: [
              { value: "default", label: "Canvas", description: "Canvas's own list, untouched.", preview: () => todoPreview("canvas") },
              { value: "clean", label: "Clean", description: "Canvas's list, tidied up to match.", preview: () => todoPreview("clean") },
              { value: "custom", label: "Planner", description: "Views, overdue work, stars, steps and focus.", preview: () => todoPreview("planner") },
            ] }) }),
      ]),
      sec("Planner", [
        row({ label: "View", enabledWhen: planner, control: C.segmented({ ariaLabel: "Planner view", get: () => t.view, set: put((x, v) => { x.view = v; }),
          options: [{ value: "list", label: "List", icon: "list" }, { value: "kanban", label: "Board", icon: "columns" }, { value: "timeblock", label: "Day plan", icon: "clock" }] }) }),
        row({ label: "View switcher on the list", hint: "List / Board / Day buttons in the planner itself. The full-size view always has them.",
          enabledWhen: planner, control: C.switch({ ariaLabel: "View switcher on the list", get: () => !!t.showViewSwitch, set: put((x, v) => { x.showViewSwitch = v; }) }) }),
        row({ label: "Show", hint: "How far ahead the planner looks.", enabledWhen: planner,
          control: C.segmented({ ariaLabel: "How far ahead", get: () => String(t.rangeDays), set: put((x, v) => { x.rangeDays = parseInt(v, 10); }),
            options: [{ value: "3", label: "3 days" }, { value: "7", label: "1 week" }, { value: "14", label: "2 weeks" }, { value: "30", label: "1 month" }] }) }),
        row({ label: "Starts on", enabledWhen: planner, control: C.segmented({ ariaLabel: "Window starts on", get: () => t.startOn || "today", set: put((x, v) => { x.startOn = v; }),
          options: [{ value: "today", label: "Today" }, { value: "sunday", label: "Sunday" }, { value: "monday", label: "Monday" }] }) }),
        row({ label: "Group by", enabledWhen: planner, control: C.segmented({ ariaLabel: "Group by", get: () => t.groupBy, set: put((x, v) => { x.groupBy = v; }),
          options: [{ value: "day", label: "Day" }, { value: "course", label: "Course" }, { value: "priority", label: "Priority" }, { value: "tag", label: "Tag" }, { value: "none", label: "None" }] }) }),
        row({ label: "Progress", stacked: true, enabledWhen: planner, control: progressPicker(store) }),
      ], { description: "These apply when the To Do list is set to Planner." }),
      sec("Dates", [row({ label: "Due-date format", enabledWhen: planner, control: C.segmented({ ariaLabel: "Due-date format", get: () => t.dueFormat || "relative", set: put((x,v) => { x.dueFormat = v; }), options: [{ value: "relative", label: "Relative" }, { value: "absolute", label: "Date & time" }] }) })]),
      sec("What to show", [
        row({ label: "Kinds of work", stacked: true, enabledWhen: planner,
          control: C.chips({ ariaLabel: "Kinds of work", get: () => t.types, set: put((x, v) => { x.types = v; }),
            options: [{ key: "assignment", label: "Assignments", icon: "file" }, { key: "quiz", label: "Quizzes", icon: "check-square" },
                      { key: "discussion_topic", label: "Discussions", icon: "message" }, { key: "announcement", label: "Announcements", icon: "bell" },
                      { key: "wiki_page", label: "Pages", icon: "book" }, { key: "calendar_event", label: "Events", icon: "calendar" },
                      { key: "planner_note", label: "Your tasks", icon: "edit" }] }) }),
        row({ label: "On each row", stacked: true, enabledWhen: planner,
          control: C.chips({ ariaLabel: "Row details", get: () => t.rowDetails, set: put((x, v) => { x.rowDetails = v; }),
            options: [{ key: "icon", label: "Type icon" }, { key: "course", label: "Course" }, { key: "time", label: "Due time" }, { key: "points", label: "Points" }] }) }),
        row({ label: "Overdue work", hint: "Unfinished items from the last two weeks, above everything else.", enabledWhen: planner,
          control: C.switch({ ariaLabel: "Overdue work", get: () => t.showOverdue !== false, set: put((x, v) => { x.showOverdue = v; }) }) }),
        row({ label: "Completed items", hint: "Keep finished work in the list, crossed out.", enabledWhen: planner,
          control: C.switch({ ariaLabel: "Completed items", get: () => t.showCompleted, set: put((x, v) => { x.showCompleted = v; }) }) }),
        row({ label: "Starred first", enabledWhen: planner,
          control: C.switch({ ariaLabel: "Starred first", get: () => t.starredFirst !== false, set: put((x, v) => { x.starredFirst = v; }) }) }),
        row({ label: "Long days", hint: "Collapse a day after this many items.", enabledWhen: planner,
          control: C.segmented({ ariaLabel: "Collapse after", get: () => String(t.collapseAfter | 0), set: put((x, v) => { x.collapseAfter = parseInt(v, 10) || 0; }),
            options: [{ value: "0", label: "Show all" }, { value: "3", label: "3" }, { value: "5", label: "5" }, { value: "10", label: "10" }] }) }),
        row({ label: "Compact rows", hint: "One line per title.", enabledWhen: planner,
          control: C.switch({ ariaLabel: "Compact rows", get: () => t.compact, set: put((x, v) => { x.compact = v; }) }) }),
      ]),
      sec("Adding tasks", [
        row({ label: "Add-task box", enabledWhen: planner,
          control: C.switch({ ariaLabel: "Add-task box", get: () => t.allowNewTask, set: put((x, v) => { x.allowNewTask = v; }) }) }),
        row({ label: "New tasks are due", enabledWhen: (s) => planner(s) && s.todo.allowNewTask,
          control: C.segmented({ ariaLabel: "New tasks are due", get: () => t.newTaskDay || "today", set: put((x, v) => { x.newTaskDay = v; }),
            options: [{ value: "today", label: "Today" }, { value: "tomorrow", label: "Tomorrow" }] }) }),
      ], { description: "Tasks you add are saved to your Canvas planner, so they show up on your phone too." }),
      sec("Look", [
        row({ label: "Accent", hint: "Empty uses your Appearance accent.", enabledWhen: planner,
          control: C.color({ ariaLabel: "Planner accent", allowEmpty: true, presets: ACCENTS, get: () => t.accent, set: put((x, v) => { x.accent = v; }) }) }),
        row({ label: "Celebrate", hint: "A small burst when everything in view is done.", enabledWhen: planner,
          control: C.switch({ ariaLabel: "Celebrate", get: () => t.celebrate !== false, set: put((x, v) => { x.celebrate = v; }) }) }),
      ]),
      sec("Streaks", [
        row({ label: "Daily streak", hint: "Counts days you complete at least one task.", enabledWhen: planner,
          control: C.switch({ ariaLabel: "Daily streak", get: () => t.streaks.enabled, set: put((x, v) => { x.streaks.enabled = v; }) }) }),
        row({ label: "Grace days", hint: "Missed days that don't break the streak.", enabledWhen: (s) => planner(s) && s.todo.streaks.enabled,
          control: C.number({ ariaLabel: "Grace days", min: 0, max: 14, get: () => t.streaks.graceDays, set: put((x, v) => { x.streaks.graceDays = Math.max(0, v | 0); }) }) }),
        row({ label: "Repairs per month", enabledWhen: (s) => planner(s) && s.todo.streaks.enabled,
          control: C.number({ ariaLabel: "Repairs per month", min: 0, max: 31, get: () => t.streaks.repairsAvailable, set: put((x, v) => { x.streaks.repairsAvailable = Math.max(0, v | 0); }) }) }),
      ], { description: "Shown in the planner, so it needs the Planner style." }),
      sec("Focus timer", [
        row({ label: "Focus timer", hint: "A Pomodoro timer in the planner and on every page while it runs.", enabledWhen: planner, control: C.switch({ ariaLabel: "Focus timer", get: () => t.pomodoro.enabled, set: put((x, v) => { x.pomodoro.enabled = v; }) }) }),
        row({ label: "Focus", enabledWhen: (s) => planner(s) && s.todo.pomodoro.enabled, control: C.number({ ariaLabel: "Focus minutes", min: 1, max: 180, suffix: "min", get: () => t.pomodoro.workMin, set: put((x, v) => { x.pomodoro.workMin = Math.max(1, v | 0); }) }) }),
        row({ label: "Short break", enabledWhen: (s) => planner(s) && s.todo.pomodoro.enabled, control: C.number({ ariaLabel: "Short break minutes", min: 1, max: 60, suffix: "min", get: () => t.pomodoro.shortBreakMin, set: put((x, v) => { x.pomodoro.shortBreakMin = Math.max(1, v | 0); }) }) }),
        row({ label: "Long break", enabledWhen: (s) => planner(s) && s.todo.pomodoro.enabled, control: C.number({ ariaLabel: "Long break minutes", min: 1, max: 120, suffix: "min", get: () => t.pomodoro.longBreakMin, set: put((x, v) => { x.pomodoro.longBreakMin = Math.max(1, v | 0); }) }) }),
        row({ label: "Long break every", enabledWhen: (s) => planner(s) && s.todo.pomodoro.enabled, control: C.number({ ariaLabel: "Long break every", min: 1, max: 12, suffix: "sessions", get: () => t.pomodoro.longEvery, set: put((x, v) => { x.pomodoro.longEvery = Math.max(1, v | 0); }) }) }),
        row({ label: "Sound when a phase ends", enabledWhen: (s) => planner(s) && s.todo.pomodoro.enabled, control: C.switch({ ariaLabel: "Sound when a phase ends", get: () => t.pomodoro.sound, set: put((x, v) => { x.pomodoro.sound = v; }) }) }),
      ], { description: "Started from the planner, so it needs the Planner style." }),
      live(() => renderRecurringEditor(store), () => JSON.stringify(store.get().todo.recurring || [])),
      sec("Tags", [
        row({ label: "Your tags", hint: "Suggested when you tag a task in the planner.", stacked: true,
          control: C.tags({ get: () => t.tags, set: put((x, v) => { x.tags = v; }) }) }),
      ]),
    ];
  }

  function renderRecurringEditor(store) {
    const C = S();
    const rules = store.get().todo.recurring || [];
    const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const describe = (r) => {
      let s = r.rule === "weekly"
        ? "Weekly" + ((r.days || []).length ? " on " + r.days.map((d) => WD[d]).join(", ") : "")
        : r.rule === "monthly" ? "Monthly on day " + (r.day || 1) : "Every day";
      if (r.at) s += " · " + r.at;
      if (r.until) s += " · until " + r.until;
      return s;
    };
    const list = rules.length
      ? el("div", { class: "bcs-list" }, rules.map((r) => C.item({
          title: r.title, meta: describe(r),
          actions: [BC.ui.iconButton("trash", { label: "Delete " + r.title, size: "sm",
            onClick: () => store.set((x) => { x.todo.recurring = (x.todo.recurring || []).filter((q) => q.id !== r.id); }) })],
        })))
      : el("p", { class: "bcs-empty", text: "No recurring tasks yet. They appear in the planner next to your Canvas work." });

    const title = BC.ui.input({ size: "sm", placeholder: "Task title", ariaLabel: "Recurring task title" });
    let freq = "daily";
    const days = new Set();
    const freqSeg = BC.ui.segmented({ size: "sm", ariaLabel: "Repeats", value: freq,
      options: [{ value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }],
      onChange: (v) => { freq = v; syncForm(); } });
    const dayBtns = el("div", { class: "bcs-days" }, WD.map((n, i) => {
      const b = el("button", { type: "button", class: "bcs-day", "aria-pressed": "false", text: n.slice(0, 2), "aria-label": n });
      b.addEventListener("click", () => { if (days.has(i)) days.delete(i); else days.add(i); b.setAttribute("aria-pressed", days.has(i) ? "true" : "false"); });
      return b;
    }));
    const dom = BC.ui.input({ size: "sm", type: "number", ariaLabel: "Day of month", value: 1 });
    dom.min = 1; dom.max = 31; dom.classList.add("bcs-dom");
    const domWrap = el("label", { class: "bcs-inline" }, [el("span", { class: "bc-caption", text: "Day" }), dom]);
    const at = BC.ui.input({ size: "sm", type: "time", ariaLabel: "Due at", value: "17:00" });
    const until = BC.ui.input({ size: "sm", type: "date", ariaLabel: "Repeat until (optional)" });
    function syncForm() {
      dayBtns.hidden = freq !== "weekly";
      domWrap.hidden = freq !== "monthly";
    }
    syncForm();
    const add = BC.ui.button("Add", { size: "sm", variant: "primary", icon: "plus", onClick: () => {
      const t = title.value.trim();
      if (!t) { title.focus(); BC.toast && BC.toast.warn("Give the task a title first"); return; }
      if (freq === "weekly" && !days.size) { BC.toast && BC.toast.warn("Pick at least one day for a weekly task"); return; }
      // `from` keeps copies from appearing, unchecked, on days before the task existed.
      const rule = { id: BC.util.uuid(), title: t, rule: freq, at: at.value || "", until: until.value || "", from: BC.dt.ymd(new Date()) };
      if (freq === "weekly") rule.days = Array.from(days).sort();
      if (freq === "monthly") rule.day = Math.min(31, Math.max(1, parseInt(dom.value, 10) || 1));
      store.set((x) => { x.todo.recurring = (x.todo.recurring || []).concat([rule]); });
    } });
    const form = el("div", { class: "bcs-form" }, [
      el("div", { class: "bcs-form__row" }, [title]),
      el("div", { class: "bcs-form__row" }, [freqSeg.root, dayBtns, domWrap]),
      el("div", { class: "bcs-form__row" }, [
        el("label", { class: "bcs-inline" }, [el("span", { class: "bc-caption", text: "Due" }), at]),
        el("label", { class: "bcs-inline" }, [el("span", { class: "bc-caption", text: "Until" }), until]),
        el("span", { class: "bc-spacer" }), add,
      ]),
    ]);
    return sec("Recurring tasks", [list, form], { description: "Repeat a task daily, weekly or monthly. Each day checks off on its own." });
  }

  // ---- Grades -------------------------------------------------------------

  function renderGrades(store, adapter, ctx) {
    const C = S();
    const g = store.get().grades;
    const put = (fn) => (v) => store.set((x) => fn(x.grades, v));
    const sw = (label, key, hint, extra) => row(Object.assign({ label, hint,
      control: C.switch({ ariaLabel: label, get: () => g[key], set: put((x, v) => { x[key] = v; }) }) }, extra || {}));
    const gpaMount = el("div", { class: "bcs-gpa" }, [BC.ui.skeleton(4)]);
    if (!ctx.searching && adapter.getGpaData) {
      adapter.getGpaData().then((courses) => {
        if (!gpaMount.isConnected) return;
        renderGpaEditor(gpaMount, store, courses);
      }).catch(() => { gpaMount.replaceChildren(BC.ui.empty("Open Canvas in a tab to load your courses.", null, { icon: "info" })); });
    }
    return [
      sec("Grades page", [
        sw("Grade tools", "panelEnabled", "Goal tracker, final-exam calculator and weights above your grades."),
        sw("Weights chart", "showWeightDonut", null, { enabledWhen: (s) => s.grades.panelEnabled }),
        sw("Trend chart", "showTrendChart", null, { enabledWhen: (s) => s.grades.panelEnabled }),
        sw("Missing work warning", "showMissingWarning", null, { enabledWhen: (s) => s.grades.panelEnabled }),
        sw("Auto-refresh", "autoRefresh", "Reloads grade data while the page is open."),
        row({ label: "Refresh every", showWhen: (s) => s.grades.autoRefresh,
          control: C.number({ ariaLabel: "Refresh every", min: 1, max: 60, suffix: "min", get: () => g.autoRefreshMin, set: put((x, v) => { x.autoRefreshMin = Math.max(1, v | 0); }) }) }),
      ]),
      sec("Assignments", [
        sw("Rubric predictor", "rubricPredictor", "Slide each rubric row to see the score and its effect on your grade."),
      ]),
      sec("GPA", [
        row({ label: "Scale", control: C.select({ ariaLabel: "GPA scale", get: () => g.gpaScale, set: put((x, v) => { x.gpaScale = v; }),
          options: Object.entries(BC.GPA_SCALES).map(([k, v]) => ({ value: k, label: v.label })) }) }),
        row({ label: "Courses", hint: "Credits default to 3. Set 0 to leave a course out.", stacked: true, control: gpaMount }),
      ]),
    ];
  }

  function renderGpaEditor(mount, store, courses) {
    const credOf = (s, id) => (s.grades.creditsByCourse[id] != null ? s.grades.creditsByCourse[id] : 3);
    const thead = el("tr", null, [el("th", { text: "Course" }), el("th", { class: "bcs-num", text: "Score" }), el("th", { class: "bcs-num", text: "Grade" }), el("th", { class: "bcs-num", text: "Credits" })]);
    const tbody = el("tbody");
    const rows = courses.map((cr) => {
      const letterTd = el("td", { class: "bcs-num" });
      const credInput = BC.ui.input({ size: "sm", type: "number", ariaLabel: "Credits for " + cr.name, value: credOf(store.get(), cr.id) });
      credInput.min = 0; credInput.step = 0.5; credInput.classList.add("bcs-gpa__cred");
      credInput.addEventListener("input", () => store.set((x) => { x.grades.creditsByCourse[cr.id] = parseFloat(credInput.value) || 0; }));
      tbody.appendChild(el("tr", { class: cr.concluded ? "bcs-gpa__concluded" : null }, [
        el("td", { class: "bc-truncate", text: cr.name }),
        el("td", { class: "bcs-num", text: cr.score == null ? "—" : cr.score.toFixed(1) + "%" }),
        letterTd,
        el("td", { class: "bcs-num" }, [credInput]),
      ]));
      return { cr, letterTd, credInput };
    });
    const total = el("div", { class: "bcs-gpa__total" });
    mount.replaceChildren(el("table", { class: "bcs-table" }, [el("thead", null, [thead]), tbody]), total);
    // Recomputed on every change: the scale and the credits both feed it.
    const recalc = () => {
      const s = store.get();
      const bands = (BC.GPA_SCALES[s.grades.gpaScale] || BC.GPA_SCALES["standard-4"]).bands;
      let hours = 0, points = 0;
      for (const r of rows) {
        const cred = Number(credOf(s, r.cr.id)) || 0;
        if (!focused(r.credInput) && parseFloat(r.credInput.value) !== cred) r.credInput.value = cred;
        let text = "—";
        if (r.cr.score != null) {
          const band = bands.find((b) => r.cr.score >= b.min) || bands[bands.length - 1];
          text = band.letter + " · " + band.points.toFixed(1);
          if (cred > 0) { points += band.points * cred; hours += cred; }
        }
        if (r.letterTd.textContent !== text) r.letterTd.textContent = text;
      }
      total.replaceChildren(
        el("span", { class: "bc-caption", text: hours + " credit hours" }),
        el("span", { class: "bcs-gpa__value bc-num", text: hours > 0 ? (points / hours).toFixed(2) : "—" }),
      );
    };
    recalc();
    S().bindings.add(mount, recalc);
  }

  // ---- Calendar / Files / Announcements -----------------------------------

  function renderCalendar(store) {
    const C = S();
    const cal = store.get().calendar;
    const put = (fn) => (v) => store.set((x) => fn(x.calendar, v));
    return [
      sec("Calendar", [
        row({ label: "Mini calendar", hint: "This month at a glance, in the dashboard sidebar.",
          control: C.switch({ ariaLabel: "Mini calendar", get: () => cal.miniOnDashboard, set: put((x, v) => { x.miniOnDashboard = v; }) }) }),
        row({ label: "Syllabus dates", hint: "Finds dates in a syllabus and offers to add them to your To Do.",
          control: C.switch({ ariaLabel: "Syllabus dates", get: () => cal.syllabusExtract, set: put((x, v) => { x.syllabusExtract = v; }) }) }),
        row({ label: "Export to your calendar app", hint: "Your Canvas work for the next 90 days as an .ics file.",
          control: BC.ui.button("Export .ics", { size: "sm", icon: "download", onClick: () => {
            if (!BC.calendar || !BC.calendar.exportIcs) { BC.toast && BC.toast.warn("Open settings from a Canvas page to export"); return; }
            BC.calendar.exportIcs();
          } }) }),
      ]),
    ];
  }

  function renderFiles(store) {
    const C = S();
    return [sec("Files", [
      row({ label: "Files library", hint: "A searchable list of every course's files on the dashboard.",
        control: C.switch({ ariaLabel: "Files library", get: () => store.get().files.enabled, set: (v) => store.set((x) => { x.files.enabled = v; }) }) }),
    ])];
  }

  function renderAnnouncements(store) {
    const C = S();
    return [sec("Announcements", [
      row({ label: "All announcements", hint: "The latest posts from every course, on the dashboard.",
        control: C.switch({ ariaLabel: "All announcements", get: () => store.get().announcements.aggregator, set: (v) => store.set((x) => { x.announcements.aggregator = v; }) }) }),
    ])];
  }

  // ---- Navigation ---------------------------------------------------------

  function renderNavigation(store, adapter) {
    const C = S();
    const s = store.get();
    const n = s.navigation;
    const put = (fn) => (v) => store.set((x) => fn(x.navigation, v));
    const logo = s.theming.logo;
    const putLogo = (fn) => (v) => store.set((x) => fn(x.theming.logo, v));
    // The lists come from the menus this school really has: read live when the panel
    // is open on a Canvas page, otherwise from what Better Canvas last saw.
    const holder = (scope) => {
      const box = el("div", { class: "bcs-navlist" }, [BC.ui.skeleton(4)]);
      const fill = (local) => box.replaceChildren(scope === "global" ? renderNavList(store, local) : renderCourseNavList(store, local));
      const liveGlobal = BC.readGlobalNav ? BC.readGlobalNav() : [];
      const liveCourse = BC.readCourseNav ? BC.readCourseNav() : [];
      const quick = BC.storage && BC.storage.local;
      if (scope === "global" && liveGlobal.length) fill({ navItems: liveGlobal });
      else if (quick) fill(Object.assign({}, quick, liveCourse.length ? { courseNavItems: mergeLabels(quick.courseNavItems, liveCourse) } : null));
      else if (adapter && adapter.getLocal) adapter.getLocal().then((l) => fill(l || {})).catch(() => fill({}));
      else fill({});
      return box;
    };
    return [
      sec("Main menu", [
        row({ label: "School logo", hint: "The logo at the top of the menu. Scene themes draw it in the accent colour.",
          control: C.segmented({ ariaLabel: "School logo", get: () => logo.mode, set: putLogo((x, v) => { x.mode = v; }),
            options: [{ value: "default", label: "Show" }, { value: "hide", label: "Hide" }, { value: "replace", label: "Image" }, { value: "text", label: "Text" }] }) }),
        row({ label: "Image URL", showWhen: (st) => st.theming.logo.mode === "replace",
          control: C.text({ ariaLabel: "Logo image URL", placeholder: "https://…", get: () => logo.url, set: putLogo((x, v) => { x.url = v; }) }) }),
        row({ label: "Text", showWhen: (st) => st.theming.logo.mode === "text",
          control: C.text({ ariaLabel: "Logo text", placeholder: "Up to 24 characters", get: () => logo.text, set: putLogo((x, v) => { x.text = v; }) }) }),
        holder("global"),
        row({ label: "Your links", hint: "Extra links at the bottom of Canvas's main menu.", stacked: true,
          control: C.links({ get: () => n.global.customLinks, set: put((x, v) => { x.global.customLinks = v; }) }) }),
      ], { description: "Your school's menu, as it appears on the left. Drag to reorder; switch an item off to hide it." }),
      sec("Course menu", [
        holder("course"),
        row({ label: "Your links", hint: "Extra links in every course's menu.", stacked: true,
          control: C.links({ get: () => n.course.customLinks, set: put((x, v) => { x.course.customLinks = v; }) }) }),
      ], { description: "Tabs from the courses you've opened. Hiding or moving one applies in every course that has it." }),
      sec("Page layout", [
        row({ label: "Breadcrumbs", control: C.segmented({ ariaLabel: "Breadcrumbs", get: () => n.breadcrumbs, set: put((x, v) => { x.breadcrumbs = v; }),
          options: [{ value: "default", label: "Default" }, { value: "compact", label: "Compact" }, { value: "hidden", label: "Hidden" }] }) }),
        row({ label: "Course switcher", hint: "A row of course tabs at the top of every page.",
          control: C.switch({ ariaLabel: "Course switcher", get: () => n.courseTabs, set: put((x, v) => { x.courseTabs = v; }) }) }),
        row({ label: "Command palette", hint: "Jump anywhere with " + BC.util.modLabel() + "+K.",
          control: C.switch({ ariaLabel: "Command palette", get: () => n.quickSearch, set: put((x, v) => { x.quickSearch = v; }) }) }),
      ]),
    ];
  }

  function mergeLabels(a, b) {
    const out = (a || []).slice();
    for (const t of b || []) if (!out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
    return out;
  }

  // Shared by both menus: saved order first, then anything new in the menu's own order.
  function orderedItems(items, order) {
    const byId = new Map(items.map((it) => [it.id, it]));
    const out = [];
    for (const id of order || []) if (byId.has(id)) { out.push(byId.get(id)); byId.delete(id); }
    for (const it of items) if (byId.has(it.id)) out.push(it);
    return out;
  }

  function navSortable(store, scope, items) {
    const hiddenSet = new Set(store.get().navigation[scope].hidden || []);
    return S().sortable({
      items: orderedItems(items, store.get().navigation[scope].order),
      render: (it) => {
        const t = BC.ui.toggle({ checked: !hiddenSet.has(it.id), ariaLabel: "Show " + it.label,
          onChange: (on) => store.set((x) => {
            const h1 = new Set(x.navigation[scope].hidden || []);
            if (on) h1.delete(it.id); else h1.add(it.id);
            x.navigation[scope].hidden = Array.from(h1);
          }) });
        return el("div", { class: "bcs-sortable__row" }, [
          el("span", { class: "bc-truncate", text: it.label }),
          it.note ? el("span", { class: "bcs-navlist__note", text: it.note }) : null,
          el("span", { class: "bc-spacer" }),
          t.root,
        ]);
      },
      onChange: (ids) => store.set((x) => { x.navigation[scope].order = ids; }),
    });
  }

  function renderNavList(store, local) {
    const seen = (local && local.navItems) || [];
    // Before Better Canvas has seen the menu (a fresh install opened straight to the
    // options page), fall back to Canvas's standard items.
    const base = seen.length ? seen : BC.GLOBAL_NAV_ITEMS.filter((x) => !/commons|accounts/.test(x.key));
    const items = base.map((x) => ({ id: x.key, label: x.label, note: x.app ? "App" : "" }));
    const box = el("div", null, [navSortable(store, "global", items)]);
    if (!seen.length) box.prepend(S().note({ text: "Open Canvas once and this list will match your school's menu." }));
    return box;
  }

  function renderCourseNavList(store, local) {
    const labels = mergeLabels(local && local.courseNavItems, []);
    // Tabs hidden earlier (typed in by name) stay listed even if no course shown yet has them.
    for (const h of store.get().navigation.course.hidden || []) {
      if (!labels.some((x) => x.toLowerCase() === h)) labels.push(h.replace(/\b\w/g, (c) => c.toUpperCase()));
    }
    if (!labels.length) return S().note({ text: "Open any course and its menu will be listed here." });
    // Course tabs are matched by name, lower-cased, in every course.
    return navSortable(store, "course", labels.map((l) => ({ id: l.toLowerCase(), label: l })));
  }

  // ---- Productivity -------------------------------------------------------

  function renderProductivity(store) {
    const C = S();
    const s = store.get();
    const p = s.productivity;
    const sw = (label, key, hint) => row({ label, hint,
      control: C.switch({ ariaLabel: label, get: () => p[key], set: (v) => store.set((x) => { x.productivity[key] = v; }) }) });
    const swOf = (group, label, key, hint) => row({ label, hint,
      control: C.switch({ ariaLabel: label, get: () => s[group][key], set: (v) => store.set((x) => { x[group][key] = v; }) }) });
    return [
      sec("Reading", [
        sw("Focus mode", "focusMode", "Hides Canvas's menus and sidebars so only the page content is left."),
        sw("Reading ruler", "readingRuler", "A highlight band that follows your pointer."),
        sw("Reading progress", "readingProgress", "A thin bar along the top as you scroll."),
        swOf("previews", "Assignment previews", "hoverAssignmentCards", "Hover an assignment link to see its due date, points and score."),
      ]),
      sec("Writing", [
        sw("Save drafts", "autoSaveDrafts", "Text you type in Canvas boxes is kept if the page closes."),
        sw("Word count", "wordCount", "Words and characters under every text box."),
        sw("Quiz backup", "quizDraftSaver", "Keeps a local copy of quiz answers in case the tab crashes."),
        sw("Sticky notes", "stickyNotes", "Notes you can pin to any Canvas page."),
      ]),
      sec("Quick actions", [
        sw("Tools menu", "quickActions", "A Tools item in Canvas's left menu, or a round button in the corner when the menu is hidden."),
        row({ label: "Copy link", enabledWhen: (st) => st.productivity.quickActions !== false,
          control: C.switch({ ariaLabel: "Copy link", get: () => p.copyUrlButton, set: (v) => store.set((x) => { x.productivity.copyUrlButton = v; }) }) }),
        row({ label: "Print page", enabledWhen: (st) => st.productivity.quickActions !== false,
          control: C.switch({ ariaLabel: "Print page", get: () => p.printFriendly, set: (v) => store.set((x) => { x.productivity.printFriendly = v; }) }) }),
      ], { description: "The Tools menu also has focus mode, the command palette and, with sticky notes on, a new note." }),
      sec("Modules", [
        swOf("modules", "Progress bars", "progressBars", "Completion for each module and the whole course."),
      ]),
      sec("Discussions", [
        swOf("discussions", "Next unread", "jumpToUnread", "A button that scrolls to the next reply you haven't read."),
        swOf("discussions", "Reply and word counts", "wordCount", "Shown above topics that have replies."),
        swOf("discussions", "Collapse replies", "collapse", "Classic discussion pages only — Canvas's new design has its own Collapse Threads."),
        swOf("discussions", "Highlight instructors", "instructorHighlight", "Classic discussion pages only — the new design tags teachers itself."),
      ]),
    ];
  }

  // ---- Notifications ------------------------------------------------------

  function renderNotifications(store) {
    const C = S();
    const n = store.get().notifications;
    const put = (fn) => (v) => store.set((x) => fn(x.notifications, v));
    const anyOn = (s) => s.notifications.inPage || s.notifications.enabled;
    const type = (label, key) => row({ label, enabledWhen: anyOn,
      control: C.switch({ ariaLabel: label, get: () => n.types[key], set: put((x, v) => { x.types[key] = v; }) }) });
    return [
      sec("Delivery", [
        row({ label: "On the page", hint: "A small card in the corner of Canvas.",
          control: C.switch({ ariaLabel: "Notifications on the page", get: () => n.inPage, set: put((x, v) => { x.inPage = v; }) }) }),
        row({ label: "Desktop notifications", hint: "Your browser asks for permission the first time.",
          control: C.switch({ ariaLabel: "Desktop notifications", get: () => n.enabled, set: (v) => {
            // Ask from the click itself: Firefox ignores a permission request that
            // isn't. Only a Canvas page can ask for Canvas's permission, so this
            // page (the options tab) can't turn it on.
            if (v && !/^https?:$/.test(location.protocol)) {
              S().bindings.sync(store.get());
              BC.toast && BC.toast.info("Turn this on from the Better Canvas panel on a Canvas page, so your browser can ask for permission.");
              return;
            }
            store.set((x) => { x.notifications.enabled = v; });
            if (!v || !("Notification" in window) || Notification.permission === "granted") return;
            Promise.resolve(Notification.requestPermission()).then((p) => {
              if (p === "granted") return;
              store.set((x) => { x.notifications.enabled = false; });
              BC.toast && BC.toast.warn("Your browser blocked notifications for this site. Allow them in the site settings, then turn this on again.");
            }).catch(() => {});
          } }) }),
        row({ label: "Toolbar badge", hint: "How many items are due in the next 24 hours.",
          control: C.switch({ ariaLabel: "Toolbar badge", get: () => n.badgeCount, set: put((x, v) => { x.badgeCount = v; }) }) }),
      ]),
      sec("What to notify", [
        type("Work due soon", "dueSoon"),
        row({ label: "Remind me before", hint: "Minutes before the due time, comma-separated.", enabledWhen: (s) => anyOn(s) && s.notifications.types.dueSoon,
          control: C.text({ ariaLabel: "Reminder lead times", placeholder: "60, 240, 1440", get: () => (n.leadMinutes || []).join(", "),
            set: put((x, v) => { x.leadMinutes = v.split(",").map((q) => parseInt(q.trim(), 10)).filter((m) => m > 0); }) }) }),
        type("New grades", "newGrade"),
        type("New announcements", "newAnnouncement"),
        type("Grade drops below your goal", "goalBreach"),
        type("Streak about to break", "streakAtRisk"),
      ]),
      sec("Quiet hours", [
        row({ label: "Quiet hours", hint: "No notifications during these hours.",
          control: C.switch({ ariaLabel: "Quiet hours", get: () => n.quietHours.enabled, set: put((x, v) => { x.quietHours.enabled = v; }) }) }),
        row({ label: "From", showWhen: (s) => s.notifications.quietHours.enabled, control: inline([
          C.time({ ariaLabel: "Quiet hours start", get: () => n.quietHours.start, set: put((x, v) => { x.quietHours.start = v; }) }),
          el("span", { class: "bcs-inline__sep", text: "to" }),
          C.time({ ariaLabel: "Quiet hours end", get: () => n.quietHours.end, set: put((x, v) => { x.quietHours.end = v; }) }),
        ]) }),
      ]),
    ];
  }

  // ---- Accessibility / Shortcuts / Instructor -----------------------------

  function renderA11y(store) {
    const C = S();
    const a = store.get().accessibility;
    const sw = (label, key, hint) => row({ label, hint,
      control: C.switch({ ariaLabel: label, get: () => a[key], set: (v) => store.set((x) => { x.accessibility[key] = v; }) }) });
    return [
      sec("Accessibility", [
        sw("Read aloud", "tts", "A Speak button on assignments, announcements and discussions."),
        sw("Larger click targets", "largeTargets", "Buttons and checkboxes at least 40px."),
        sw("Dyslexia-friendly font", "dyslexiaFont"),
        el("div", { class: "bcs-row bcs-row--note" }, [S().note({ text: "Color-blind filters, high contrast, focus rings and reduced motion are under Appearance → Visibility." })]),
      ]),
    ];
  }

  function renderShortcuts(store) {
    const C = S();
    const sh = store.get().shortcuts;
    const labels = {
      commandPalette: "Command palette", settings: "Open settings", toggleDark: "Toggle dark mode",
      quickTask: "Quick task", quickNote: "Quick note", focusMode: "Toggle focus mode",
      gotoDashboard: "Go to dashboard", gotoGrades: "Go to grades", gotoInbox: "Go to inbox", gotoCalendar: "Go to calendar",
    };
    return [
      sec("Shortcuts", [
        row({ label: "Keyboard shortcuts", hint: "Off ignores every shortcut below.",
          control: C.switch({ ariaLabel: "Keyboard shortcuts", get: () => sh.enabled, set: (v) => store.set((x) => { x.shortcuts.enabled = v; }) }) }),
      ]),
      sec("Bindings", Object.keys(labels).map((id) => row({ label: labels[id], enabledWhen: (s) => s.shortcuts.enabled,
        control: C.keybind({ ariaLabel: labels[id], get: () => sh.bindings[id], set: (v) => store.set((x) => { x.shortcuts.bindings[id] = v; }) }) })),
        { description: "Click a shortcut, then press the new keys. Escape cancels and Backspace clears it. A single letter can start a two-key sequence, like G then D." }),
    ];
  }

  function renderInstructor(store) {
    const C = S();
    const i = store.get().instructor;
    const sw = (label, key, hint) => row({ label, hint,
      control: C.switch({ ariaLabel: label, get: () => i[key], set: (v) => store.set((x) => { x.instructor[key] = v; }) }) });
    return [
      sec("Instructor tools", [
        sw("Roster export", "rosterExport", "An export button on the People page."),
        sw("Attendance", "attendanceQuick", "Present/absent buttons on the People page, with CSV export. Kept on this device."),
        sw("Needs-grading counts", "bulkGradeHelpers", "Ungraded submission counts on the Assignments page."),
      ]),
    ];
  }

  // ---- ChatGPT --------------------------------------------------------------

  // Sign-in and tokens live in the background (src/background/chatgpt.js); this tab
  // shows status and sends requests there. The background only answers Better
  // Canvas's own pages: a Canvas page shares the DOM with the drawer and could
  // click its buttons. So the drawer links to this tab in the options page, which
  // can also show the permission prompt. Same list as chatgpt.js ORIGINS.
  const CHATGPT_ORIGINS = ["*://127.0.0.1/*", "https://auth.openai.com/*", "https://api.openai.com/*"];

  function renderChatGPT(store, adapter, ctx) {
    const C = S();
    const send = (type, extra) => new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(Object.assign({ type }, extra || {}), (r) => resolve(chrome.runtime.lastError || !r
          ? { ok: false, error: "Better Canvas's background didn't answer. Reload the extension and try again." } : r));
      } catch (e) { resolve({ ok: false, error: e.message }); }
    });
    const about = sec("What gets sent", [
      el("p", { class: "bcs-prose", text: "Signing in opens ChatGPT's own page in a new tab, and Better Canvas never sees your password. It asks your browser to allow auth.openai.com, api.openai.com and 127.0.0.1, where ChatGPT sends you back after sign-in." }),
      el("p", { class: "bcs-prose", text: "Requests go straight from your browser to OpenAI, not through a Better Canvas server. Tokens stay in this browser, out of reach of Canvas pages. This sign-in can't read your ChatGPT conversations, memories or files." }),
    ]);
    const desc = { description: "Complete eligible AI requests in Better Canvas with usage included in your ChatGPT plan or credits balance." };
    let ownPage = false;
    try { ownPage = location.origin === new URL(chrome.runtime.getURL("")).origin; } catch (_) {}
    if (ctx.searching || !ownPage) {
      return [sec("Use your ChatGPT plan", [row({ label: "ChatGPT settings open in their own tab",
        hint: "Needs ChatGPT Plus or Pro. No API key. Signing in, testing and disconnecting happen on Better Canvas's settings page, where Canvas pages can't press the buttons.",
        control: BC.ui.button("Open ChatGPT settings", { size: "sm", variant: "primary", iconRight: "external",
          onClick: () => send("bc:openOptions", { section: "chatgpt" }) }) })], desc), about];
    }

    const mount = el("div", { class: "bcs-chatgpt" }, [BC.ui.skeleton(3)]);
    const usageLink = (url, primary) => el("a", { class: "bc-btn bc-btn--sm" + (primary ? " bc-btn--primary" : " bc-btn--ghost"),
      href: url, target: "_blank", rel: "noopener noreferrer", text: "Manage usage" });
    const withId = (text, id) => text + (id ? " Request ID: " + id : "");
    let timer = null, welcomed = false;

    async function refresh() {
      if (!mount.isConnected && timer) { clearInterval(timer); timer = null; return; }
      const s = await send("bc:chatgpt:status");
      draw(s);
      if (s.pending && !timer) timer = setInterval(refresh, 1500);
      if (!s.pending && timer) { clearInterval(timer); timer = null; }
      if (s.welcome && !welcomed) { welcomed = true; showWelcome(s); }
    }

    // permissions.request has to run straight from the click: Firefox ignores a
    // prompt that comes after an await.
    function connect(extra) {
      chrome.permissions.request({ origins: CHATGPT_ORIGINS }, async (ok) => {
        if (chrome.runtime.lastError || !ok) { BC.toast && BC.toast.warn("Signing in with ChatGPT needs those sites allowed."); return; }
        const r = await send("bc:chatgpt:connect", extra);
        if (!r.ok) BC.toast && BC.toast.error(r.error);
        refresh();
      });
    }

    function showWelcome(s) {
      let dlg = null;
      const gotIt = BC.ui.button("Got it", { variant: "primary", size: "sm", onClick: () => dlg.close() });
      dlg = BC.ui.dialog({
        title: "You're using your ChatGPT plan",
        body: el("p", { class: "bcs-prose", text: "Eligible requests in Better Canvas now use the usage included in your ChatGPT plan. You can review it, and limit how much Better Canvas uses, in ChatGPT settings." }),
        actions: [usageLink(s.usageUrl), gotIt],
        onClose: () => send("bc:chatgpt:welcomed"),
      });
      dlg.open();
    }

    function draw(s) {
      if (!s.ok) { mount.replaceChildren(C.note({ text: s.error, tone: "warn" })); return; }
      const kids = [];
      if (s.lastError && !s.pending) {
        kids.push(C.note({ text: withId(s.lastError.message, s.lastError.requestId), tone: "warn" }));
        if (s.lastError.manageUsage) kids.push(el("div", { class: "bcs-chatgpt__actions" }, [usageLink(s.usageUrl, true)]));
      }
      if (s.finishing) {
        kids.push(row({ label: "Finishing sign-in…", hint: "Checking your ChatGPT account. This takes a few seconds." }));
      } else if (s.pending) {
        kids.push(row({ label: "Finish signing in on the ChatGPT tab", hint: "Better Canvas opened ChatGPT's sign-in page in a new tab. It closes by itself when you're done.",
          control: BC.ui.button("Cancel", { size: "sm", variant: "ghost", onClick: () => send("bc:chatgpt:cancel").then(refresh) }) }));
      } else if (s.connected && s.planEnabled) {
        kids.push(row({ label: "Using ChatGPT plan", hint: "Signed in as " + (s.email || "your ChatGPT account") + ".", control: usageLink(s.usageUrl) }));
        const models = s.models || [];
        kids.push(row({ label: "Model", hint: "Models your ChatGPT plan offers to apps.",
          control: models.length
            ? BC.ui.select({ value: s.model, size: "sm", ariaLabel: "ChatGPT model", options: models.map((m) => ({ value: m.slug, label: m.name })),
                onChange: (v) => send("bc:chatgpt:setModel", { slug: v }).then((r) => { if (!r.ok) BC.toast && BC.toast.error(r.error); }) })
            : BC.ui.button("Load models", { size: "sm", variant: "ghost", onClick: () => send("bc:chatgpt:models").then((r) => { if (!r.ok) BC.toast && BC.toast.error(r.error); refresh(); }) }) }));
        const testLine = el("span", { class: "bcs-chatgpt__test", role: "status" });
        const testBtn = BC.ui.button("Test", { size: "sm", variant: "ghost", onClick: async () => {
          testBtn.disabled = true;
          testLine.className = "bcs-chatgpt__test";
          testLine.textContent = "Asking ChatGPT…";
          const r = await send("bc:chatgpt:test");
          testBtn.disabled = false;
          testLine.className = "bcs-chatgpt__test " + (r.ok ? "bc-t-success" : "bc-t-danger");
          testLine.textContent = r.ok ? "ChatGPT answered: " + (r.text || "(empty)") : withId(r.error, r.requestId);
          if (!r.ok && r.manageUsage) testLine.append(" ", usageLink(r.usageUrl));
        } });
        kids.push(row({ label: "Check the connection", hint: "Sends one short message using your plan.", control: el("span", { class: "bcs-inline" }, [testBtn]) }), testLine);
        kids.push(row({ label: "Disconnect", hint: "Signs Better Canvas out of ChatGPT and deletes its tokens from this browser.",
          control: BC.ui.button("Disconnect", { size: "sm", variant: "danger", onClick: async () => {
            const r = await send("bc:chatgpt:disconnect");
            if (!r.ok) BC.toast && BC.toast.error(r.error);
            else if (!r.revoked) BC.toast && BC.toast.warn("Signed out here, but ChatGPT didn't confirm it. You can also disconnect Better Canvas in ChatGPT settings.");
            refresh();
          } }) }));
      } else if (s.connected) {
        kids.push(row({ label: "ChatGPT plan use is off", hint: "Signed in as " + (s.email || "your ChatGPT account") + ", but Better Canvas wasn't allowed to use your plan.",
          control: BC.ui.button("Turn on plan use", { size: "sm", variant: "primary", onClick: () => connect({ consent: true }) }) }));
        kids.push(row({ label: "Disconnect", hint: "Deletes this sign-in from this browser.",
          control: BC.ui.button("Disconnect", { size: "sm", variant: "ghost", onClick: () => send("bc:chatgpt:disconnect").then(refresh) }) }));
      } else {
        const go = (label, extra) => {
          const b = BC.ui.button(label, { size: "sm", onClick: () => connect(extra) });
          b.classList.add("bcs-chatgpt__go");
          return b;
        };
        const hint = "Needs ChatGPT Plus or Pro. No API key. If you log in to ChatGPT with Google, Apple or Microsoft, pick that on ChatGPT's sign-in page.";
        const accounts = s.accounts || [];
        if (!accounts.length) kids.push(row({ label: "Connect ChatGPT", hint, control: go("Continue with ChatGPT", {}) }));
        for (const a of accounts) kids.push(row({ label: "Sign in as " + a.label, hint: a.active ? hint : "A ChatGPT account you used here before.",
          control: go("Continue with ChatGPT", { clientId: a.clientId }) }));
        if (accounts.length) kids.push(row({ label: "Use a different account", hint: "Registers Better Canvas with another ChatGPT account or workspace.",
          control: BC.ui.button("Use a different account", { size: "sm", variant: "ghost", onClick: () => connect({ different: true }) }) }));
      }
      mount.replaceChildren(...kids.filter(Boolean));
    }

    refresh();
    return [sec("Use your ChatGPT plan", [mount], desc), about];
  }

  // ---- Study coach ----------------------------------------------------------

  // The section itself is src/content/features/coach.js. Choosing which courses
  // go to ChatGPT happens on Better Canvas's own page, like signing in, because a
  // Canvas page could flip a switch in the drawer.
  function renderCoach(store, adapter, ctx) {
    const C = S();
    const k = store.get().coach;
    const put = (fn) => (v) => store.set((x) => fn(x.coach, v));
    const send = (type, extra) => new Promise((resolve) => {
      try { chrome.runtime.sendMessage(Object.assign({ type }, extra || {}), (r) => resolve(chrome.runtime.lastError || !r ? { ok: false } : r)); }
      catch (_) { resolve({ ok: false }); }
    });
    let ownPage = false;
    try { ownPage = location.origin === new URL(chrome.runtime.getURL("")).origin; } catch (_) {}

    const list = el("div", { class: "bcs-coach" }, [BC.ui.skeleton(3)]);
    function drawCourses(courses) {
      if (!courses.length) { list.replaceChildren(BC.ui.empty("No current courses found.", null, { icon: "info" })); return; }
      list.replaceChildren(...courses.map((cr) => ownPage
        ? row({ label: cr.name, control: C.switch({ ariaLabel: "Send " + cr.name + " to ChatGPT",
            get: () => !!store.get().coach.courses[cr.id],
            set: (v) => {
              store.set((x) => { if (v) x.coach.courses[cr.id] = true; else delete x.coach.courses[cr.id]; });
              if (!v) send("bc:coach:forget", { courseId: cr.id });
            } }) })
        : row({ label: cr.name, hint: store.get().coach.courses[cr.id] ? "Sent to ChatGPT for study plans." : "Not sent to ChatGPT." })));
    }
    if (!ctx.searching && adapter.getCourses) {
      adapter.getCourses().then((courses) => { if (list.isConnected) drawCourses(courses || []); })
        .catch(() => { list.replaceChildren(BC.ui.empty("Open Canvas in a tab to load your courses.", null, { icon: "info" })); });
    }

    const courseRows = ownPage ? [
      row({ label: "Courses", hint: "Turn a course on to let ChatGPT write study plans for it. Turning one off deletes its saved plans.", stacked: true, control: list }),
      row({ label: "Saved plans", hint: "Study plans are kept in this browser, out of backups.",
        control: BC.ui.button("Delete all plans", { size: "sm", variant: "ghost", onClick: () => send("bc:coach:forget").then((r) => {
          if (BC.toast) r.ok ? BC.toast.success("Study plans deleted.") : BC.toast.error("Couldn't delete the plans. Try again.");
        }) }) }),
    ] : [
      row({ label: "Courses sent to ChatGPT", hint: "Change these on Better Canvas's settings page, where Canvas pages can't press the switches.",
        control: BC.ui.button("Open Study coach settings", { size: "sm", variant: "primary", iconRight: "external", onClick: () => send("bc:openOptions", { section: "coach" }) }) }),
      row({ label: "Courses", stacked: true, control: list }),
    ];

    return [
      sec("Dashboard", [
        row({ label: "Study coach", hint: "Ranks your courses by how far they are from their goal, and works out what you need on the next big assignment.",
          control: C.switch({ ariaLabel: "Study coach", get: () => k.enabled, set: put((x, v) => { x.enabled = v; }) }) }),
        row({ label: "Default goal", hint: "For courses without their own goal. Set a course's goal in Grade Tools on its Grades page.",
          control: C.number({ ariaLabel: "Default goal", min: 0, max: 100, suffix: "%", get: () => k.defaultGoal,
            set: put((x, v) => { x.defaultGoal = Math.max(0, Math.min(100, Number(v) || 0)); }) }) }),
      ]),
      sec("ChatGPT study plans", [
        row({ label: "Update plans on their own", hint: "When a grade posts or a due date moves, ChatGPT rewrites that course's plan, at most once a day. Each rewrite uses your ChatGPT plan.",
          control: C.switch({ ariaLabel: "Update plans on their own", get: () => k.autoUpdate, set: put((x, v) => { x.autoUpdate = v; }) }) }),
        ...courseRows,
      ], { description: "Needs ChatGPT connected in the ChatGPT tab. Only the courses you turn on are sent." }),
      sec("What gets sent", [
        el("p", { class: "bcs-prose", text: "For a course you turn on: your scores by assignment group and on each graded item, the names and due dates of upcoming and missing work, the instructions for the next big assignment, module and item titles, the syllabus and the last 5 announcements." }),
        el("p", { class: "bcs-prose", text: "Never sent: your name, quiz questions or your answers, and courses you haven't turned on. The grades and scores the coach shows are worked out by Better Canvas, not ChatGPT." }),
      ]),
    ];
  }

  // ---- Insights -------------------------------------------------------------

  function renderInsights(store, adapter, ctx) {
    const C = S();
    const mount = el("div", { class: "bcs-insights" }, [BC.ui.skeleton(4)]);
    if (!ctx.searching) {
      const namesP = adapter && adapter.getCourses ? adapter.getCourses().catch(() => []) : Promise.resolve([]);
      namesP.then((courses) => {
        const names = {};
        for (const cr of courses || []) names[cr.id] = cr.name;
        const getLocal = adapter && adapter.getLocal ? adapter.getLocal() : Promise.resolve({});
        return Promise.resolve(getLocal).then((local) => {
          if (!mount.isConnected) return;   // tab switched away mid-fetch
          renderInsightsData(mount, local || {}, names);
        });
      }).catch(() => { if (mount.isConnected) renderInsightsData(mount, {}, {}); });
    }
    return [
      sec("Tracking", [
        row({ label: "Track time on Canvas", hint: "Counts minutes per course while a Canvas tab is visible. Stays on this device.",
          control: C.switch({ ariaLabel: "Track time on Canvas", get: () => store.get().insights.enabled, set: (v) => store.set((x) => { x.insights.enabled = v; }) }) }),
      ]),
      mount,
    ];
  }

  function renderInsightsData(mount, local, names) {
    const courseName = (id) => names[id] || (id === "other" ? "Other pages" : "Course " + id);
    const fmtMin = (raw) => { const m = Math.round(raw); return m >= 60 ? Math.floor(m / 60) + "h " + (m % 60) + "m" : m + "m"; };

    const st = local.studyTime || {};
    const days = [];
    for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(BC.dt.ymd(d)); }
    const perDay = days.map((d) => Object.values(st[d] || {}).reduce((a, b) => a + b, 0));
    const total = perDay.reduce((a, b) => a + b, 0);
    const max = Math.max(1, ...perDay);
    const byCourse = {};
    for (const d of days) for (const [k, v] of Object.entries(st[d] || {})) byCourse[k] = (byCourse[k] || 0) + v;
    const top = Object.entries(byCourse).sort((a, b) => b[1] - a[1]).slice(0, 6);

    const sessions = (local.pomodoro && local.pomodoro.sessions) || [];
    const weekAgo = Date.now() - 7 * 864e5;
    const recent = sessions.filter((s) => (s.end || 0) >= weekAgo);
    const focusMin = recent.reduce((a, s) => a + (s.min || 0), 0);

    const gh = local.gradeHistory || {};
    const trends = Object.entries(gh).filter(([, arr]) => Array.isArray(arr) && arr.length >= 2).slice(0, 8);

    const statRow = el("div", { class: "bcs-stats" }, [
      BC.ui.stat({ label: "Last 14 days", value: fmtMin(total), sub: fmtMin(Math.round(total / 14)) + " a day" }),
      BC.ui.stat({ label: "Focus sessions", value: String(recent.length), sub: fmtMin(focusMin) + " this week" }),
      BC.ui.stat({ label: "Courses tracked", value: String(Object.keys(byCourse).filter((k) => k !== "other").length), sub: "with study time" }),
    ]);

    const chart = el("div", { class: "bcs-bars", role: "img", "aria-label": "Minutes on Canvas per day for the last 14 days" },
      days.map((d, i) => el("div", { class: "bcs-bars__col", title: d + " · " + fmtMin(perDay[i]) }, [
        el("div", { class: "bcs-bars__fill", style: "height:" + Math.round((perDay[i] / max) * 100) + "%" }),
      ])));

    mount.replaceChildren(
      statRow,
      sec("Time on Canvas", total ? [
        chart,
        el("div", { class: "bcs-list" }, top.map(([k, v]) => C_item(courseName(k), fmtMin(v)))),
      ] : [el("p", { class: "bcs-empty", text: "Nothing recorded yet. Keep a Canvas tab open while you work." })]),
      sec("Focus sessions", recent.length
        ? [el("div", { class: "bcs-list" }, recent.slice(-8).reverse().map((s) => C_item(s.task || "Focus session", fmtMin(s.min || 0), new Date(s.end).toLocaleDateString())))]
        : [el("p", { class: "bcs-empty", text: "No Pomodoro sessions yet. Start one from the planner." })]),
      sec("Grade trends", trends.length
        ? [el("div", { class: "bcs-list" }, trends.map(([cid, arr]) => {
            const scores = arr.map((p) => p.score).filter((v) => v != null);
            const delta = scores[scores.length - 1] - scores[0];
            const spark = BC.ui.sparkline(scores, { width: 96, height: 24, label: courseName(cid) + " grade trend" });
            const val = el("span", { class: "bcs-trend bc-num " + (delta >= 0 ? "bc-t-success" : "bc-t-danger"), text: (delta >= 0 ? "+" : "") + delta.toFixed(1) + "%" });
            return S().item({ title: courseName(cid), actions: [spark, val].filter(Boolean) });
          }))]
        : [el("p", { class: "bcs-empty", text: "Grade history builds up as Better Canvas sees your scores over a few days." })]),
    );

    function C_item(title, value, meta) {
      return S().item({ title, meta, actions: [el("span", { class: "bcs-item__value bc-num", text: value })] });
    }
  }

  // ---- About ----------------------------------------------------------------

  function renderAbout(store) {
    return [
      sec("Better Canvas " + (BC.VERSION || ""), [
        el("p", { class: "bcs-prose", text: "Better Canvas customizes Canvas with dark mode, a redesigned dashboard, a planner, grade tools, notifications, keyboard shortcuts and more — all set up from this panel." }),
        el("p", { class: "bcs-prose", text: "Settings, notes and drafts stay on this device. Canvas tools use your existing Canvas login. Image searches send your query to api.openverse.org. Photo themes and previews load images from third-party hosts. If you connect ChatGPT, requests that use your plan go to OpenAI. No telemetry." }),
      ]),
      renderDiagnostics(),
      sec("Reset", [
        row({ label: "Reset all settings", hint: RESET_HINT,
          control: BC.ui.button("Reset…", { size: "sm", variant: "danger", icon: "refresh", onClick: () => confirmReset(store) }) }),
      ]),
    ];
  }

  // A local ring buffer of internal errors, so a problem can be reported.
  function renderDiagnostics() {
    const entries = (BC.diag && BC.diag.entries) ? BC.diag.entries.slice().reverse().slice(0, 15) : null;
    const kids = [];
    if (!entries) {
      kids.push(el("p", { class: "bcs-empty", text: "Open settings from a Canvas page to see diagnostics." }));
    } else if (!entries.length) {
      kids.push(el("p", { class: "bcs-empty", text: "No errors recorded." }));
    } else {
      kids.push(el("div", { class: "bcs-list" }, entries.map((e) => S().item({ title: e.source, meta: new Date(e.ts).toLocaleTimeString() + " · " + e.error }))));
    }
    const actions = entries && entries.length ? [
      BC.ui.button("Copy", { size: "sm", variant: "ghost", icon: "copy", onClick: () => {
        const text = JSON.stringify(BC.diag.entries, null, 2);
        if (navigator.clipboard) navigator.clipboard.writeText(text)
          .then(() => BC.toast && BC.toast.success("Diagnostics copied"))
          .catch(() => BC.toast && BC.toast.error("Couldn't copy to the clipboard"));
      } }),
      BC.ui.button("Clear", { size: "sm", variant: "ghost", onClick: () => { BC.diag.clear(); BC.toast && BC.toast.info("Diagnostics cleared"); } }),
    ] : null;
    return sec("Diagnostics", kids, { description: "Recent internal errors, kept here so you can report a problem. Nothing is uploaded.", actions });
  }

  // ---- import / export ------------------------------------------------------

  // Planner metadata lives in bcLocal, so export carries both halves or every
  // backup silently loses it.
  function exportFlow(store) {
    const adapter = store.adapter || {};
    let localFailed = false;
    Promise.resolve(adapter.getLocal ? adapter.getLocal() : null)
      .catch(() => { localFailed = true; return null; })
      .then((local) => {
        const payload = {
          kind: "better-canvas-backup",
          version: BC.SETTINGS_VERSION,
          exportedAt: new Date().toISOString(),
          settings: JSON.parse(store.exportJSON()),
          local: local || null,
        };
        download(JSON.stringify(payload, null, 2), "better-canvas-settings.json");
        if (localFailed) BC.toast && BC.toast.warn("Exported settings only. Notes and planner data could not be read.");
        else BC.toast && BC.toast.success("Settings exported");
      });
  }

  function importFlow(store) {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "application/json,.json";
    inp.onchange = () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      f.text().then(async (txt) => {
        let parsed = null;
        try { parsed = JSON.parse(txt); } catch (_) { parsed = null; }
        if (!parsed || typeof parsed !== "object") { BC.toast && BC.toast.error("That isn't a settings file"); return; }

        const kind = BC.SettingsUI.backupKind(parsed);
        if (kind !== "backup" && kind !== "settings") {
          BC.toast && BC.toast.error(kind === "theme" ? "That's a theme file. Import it from Edit Canvas > Themes." : "That isn't a settings file");
          return;
        }
        const settingsPart = kind === "backup" ? parsed.settings : parsed;
        const rawLocal = kind === "backup" ? parsed.local : null;
        let localPart = rawLocal && typeof rawLocal === "object" && !Array.isArray(rawLocal) ? BC.cleanLocalData(rawLocal) : null;
        // Replacing local data drops this device's notes and drafts, and Undo can't
        // bring them back, so it needs its own yes.
        if (localPart && !confirm("This backup also has sticky notes, drafts, planner data and grade history. Replace the ones on this device?\n\nCancel imports the settings only.")) localPart = null;

        const carry = store.importJSON(JSON.stringify(settingsPart));
        if (!carry) { BC.toast && BC.toast.error("That isn't a settings file"); return; }
        const adapter = store.adapter || {};
        // Data an old backup kept inside settings, lifted out by the migrations.
        const lifted = Object.assign({}, carry.local || {});
        const hasLifted = Object.keys(lifted).length > 0 || !!carry.gradeHistory;
        try { await store.flush(); } catch (error) { BC.toast && BC.toast.error("Settings could not be imported: " + error.message); return; }
        if (!adapter.saveLocal || (!localPart && !hasLifted)) { BC.toast && BC.toast.success("Settings imported"); return; }
        const restore = (base) => {
          const out = Object.assign({}, base || {});
          for (const k of Object.keys(lifted)) if (out[k] === undefined) out[k] = lifted[k];
          if (carry.gradeHistory) out.gradeHistory = Object.assign({}, carry.gradeHistory, out.gradeHistory || {});
          return out;
        };
        // A backup with local data replaces it. Legacy settings-only carry-over
        // merges with fresh data inside the storage transaction.
        Promise.resolve(localPart ? adapter.saveLocal(restore(localPart)) : adapter.updateLocal(restore))
          .then(() => BC.toast && BC.toast.success("Settings and planner data imported"))
          .catch(() => BC.toast && BC.toast.error("Planner data could not be restored"));
      });
    };
    inp.click();
  }

  // ============ CSS ======================================================
  // Layout only — every control's look comes from the kit (BC.ui.css()).
  const CSS = `
.bc-app {
  container: bcs-app / inline-size;
  display: flex; flex-direction: column; height: 100%; min-height: 0;
  background: var(--bc-surface-1, #fafafa); color: var(--bc-text, #18181b);
}
.bc-live { display: contents; }

/* header */
.bcs-header {
  flex: none; display: flex; align-items: center; gap: var(--bc-space-3, 12px);
  height: 56px; padding: 0 var(--bc-space-3, 12px) 0 var(--bc-space-4, 16px);
  border-bottom: 1px solid var(--bc-border, #e4e4e7); background: var(--bc-surface-2, #fff);
}
.bcs-brand { display: flex; align-items: center; gap: 10px; min-width: 0; flex: none; }
.bcs-logo {
  display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px;
  border-radius: var(--bc-radius-md, 8px); background: var(--bc-accent, #4f46e5); color: var(--bc-accent-contrast, #fff);
  font-size: 11px; font-weight: var(--bc-weight-bold, 700); letter-spacing: .02em;
}
.bcs-brand__name { font-size: var(--bc-text-md, 14px); font-weight: var(--bc-weight-semibold, 600); line-height: 1.2; }
.bcs-brand__ver { font-size: var(--bc-text-2xs, 11px); color: var(--bc-muted, #6b6b74); line-height: 1.2; }
.bcs-search { flex: 1 1 auto; max-width: 280px; margin-left: auto; }
.bcs-header__actions { display: flex; align-items: center; gap: 2px; flex: none; }

/* shell */
.bcs-shell { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: 196px minmax(0, 1fr); }
.bcs-nav, .bcs-main { scrollbar-width: thin; scrollbar-color: var(--bc-border-strong, #c4c4ca) transparent; }
.bcs-nav {
  overflow-y: auto; padding: var(--bc-space-3, 12px) var(--bc-space-2, 8px) var(--bc-space-6, 24px);
  border-right: 1px solid var(--bc-border, #e4e4e7); background: var(--bc-surface-2, #fff);
}
.bcs-master {
  display: flex; align-items: center; gap: var(--bc-space-2, 8px); margin: 0 4px var(--bc-space-2, 8px);
  padding: 10px var(--bc-space-3, 12px); border: 1px solid var(--bc-border, #e4e4e7);
  border-radius: var(--bc-radius-lg, 12px); background: var(--bc-surface-1, #fafafa);
}
.bcs-master__text { flex: 1; min-width: 0; }
.bcs-master__label { font-size: var(--bc-text-sm, 13px); font-weight: var(--bc-weight-semibold, 600); }
.bcs-master__sub { font-size: var(--bc-text-2xs, 11px); color: var(--bc-muted, #6b6b74); }
.bcs-nav__group {
  padding: var(--bc-space-4, 16px) var(--bc-space-3, 12px) 6px;
  font-size: var(--bc-text-2xs, 11px); font-weight: var(--bc-weight-semibold, 600); text-transform: uppercase;
  letter-spacing: var(--bc-tracking-caps, .04em); color: var(--bc-text-subtle, #a1a1aa);
}
.bcs-nav__item {
  display: flex; align-items: center; gap: 10px; width: 100%; height: 32px; padding: 0 10px; margin: 1px 0;
  border: 0; border-radius: var(--bc-radius-md, 8px); background: transparent; color: var(--bc-muted, #6b6b74);
  font: var(--bc-weight-medium, 500) var(--bc-text-sm, 13px)/1 var(--bc-font-sans, system-ui, sans-serif);
  text-align: left; cursor: pointer;
}
.bcs-nav__item:hover { background: var(--bc-surface-hover, #f4f4f5); color: var(--bc-text, #18181b); }
.bcs-nav__item[aria-current="page"] { background: var(--bc-accent-weak, rgba(79,70,229,.12)); color: var(--bc-accent-text, #4338ca); }
.bcs-nav__item .bc-icon { width: 16px; height: 16px; }
.bcs-nav__label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.4; }

.bcs-main { overflow-y: auto; padding: var(--bc-space-6, 24px) var(--bc-space-6, 24px) var(--bc-space-9, 48px); }
.bcs-page__head { margin-bottom: var(--bc-space-5, 20px); }
.bcs-page__title { font-size: var(--bc-text-xl, 20px); font-weight: var(--bc-weight-semibold, 600); line-height: var(--bc-leading-tight, 1.25); }
.bcs-page__desc { margin-top: 4px; font-size: var(--bc-text-sm, 13px); color: var(--bc-muted, #6b6b74); }

/* sections + rows */
.bcs-section {
  container: bcs-section / inline-size;
  margin: 0 0 var(--bc-space-4, 16px); border: 1px solid var(--bc-border, #e4e4e7);
  border-radius: var(--bc-radius-lg, 12px); background: var(--bc-surface-2, #fff);
}
.bcs-section__head { display: flex; align-items: flex-start; gap: var(--bc-space-3, 12px); padding: var(--bc-space-4, 16px) var(--bc-space-4, 16px) 0; }
.bcs-section__titles { flex: 1; min-width: 0; }
.bcs-section__title { font-size: var(--bc-text-md, 14px); font-weight: var(--bc-weight-semibold, 600); line-height: var(--bc-leading-tight, 1.25); }
.bcs-section__desc { margin-top: 4px; font-size: var(--bc-text-xs, 12px); color: var(--bc-muted, #6b6b74); line-height: 1.45; }
.bcs-section__actions { display: flex; gap: 4px; flex: none; margin-top: -4px; }
.bcs-section__body { padding: var(--bc-space-1, 4px) var(--bc-space-4, 16px) var(--bc-space-2, 8px); }
.bcs-section__body > :not(.bcs-row):not(.bc-live) { margin: var(--bc-space-3, 12px) 0; }

.bcs-row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--bc-space-4, 16px);
  padding: var(--bc-space-3, 12px) 0;
}
/* A divider above every row that has a VISIBLE row somewhere before it — so the
   first visible row never gets one, even when the rows above it are hidden. */
.bcs-row:not([hidden]) ~ .bcs-row { border-top: 1px solid var(--bc-border-subtle, #f0f0f2); }
.bcs-row--stacked { grid-template-columns: minmax(0, 1fr); gap: var(--bc-space-2, 8px); }
.bcs-row--stacked > .bcs-row__control { justify-content: stretch; }
.bcs-row--stacked > .bcs-row__control > * { flex: 1 1 auto; width: 100%; }
.bcs-row--note { display: block; padding: var(--bc-space-2, 8px) 0; }
.bcs-row__label { font-size: var(--bc-text-sm, 13px); font-weight: var(--bc-weight-medium, 500); line-height: 1.35; }
.bcs-row__hint { margin-top: 2px; font-size: var(--bc-text-xs, 12px); color: var(--bc-muted, #6b6b74); line-height: 1.4; }
.bcs-row__warn { margin-top: 2px; font-size: var(--bc-text-xs, 12px); color: var(--bc-danger, #b91c1c); }
.bcs-row__control { display: flex; align-items: center; justify-content: flex-end; gap: var(--bc-space-2, 8px); min-width: 0; max-width: 100%; }
.bcs-row--off .bcs-row__label, .bcs-row--off .bcs-row__hint { opacity: .5; }
.bcs-row--off .bcs-row__control { opacity: .45; pointer-events: none; }

.bcs-note {
  display: flex; gap: var(--bc-space-2, 8px); align-items: flex-start; padding: 10px var(--bc-space-3, 12px);
  border-radius: var(--bc-radius-md, 8px); background: var(--bc-info-bg, #eff6ff); color: var(--bc-text, #18181b);
  font-size: var(--bc-text-xs, 12px); line-height: 1.45;
}
.bcs-note .bc-icon { width: 16px; height: 16px; margin-top: 1px; color: var(--bc-info, #0369a1); }
.bcs-note--warn { background: var(--bc-warn-bg, #fffbeb); }
.bcs-note--warn .bc-icon { color: var(--bc-warn, #a16207); }
.bcs-empty { font-size: var(--bc-text-sm, 13px); color: var(--bc-muted, #6b6b74); padding: var(--bc-space-2, 8px) 0; }
/* OpenAI's sign-in guidelines show Continue with ChatGPT as a black button. */
.bcs-chatgpt__go, .bcs-chatgpt__go:hover { background: #000; border-color: #000; color: #fff; }
.bcs-chatgpt__test { display: block; font-size: var(--bc-text-sm, 13px); padding: 0 0 var(--bc-space-2, 8px); }
.bcs-chatgpt__test:empty { display: none; }
.bcs-chatgpt__actions { display: flex; gap: var(--bc-space-2, 8px); margin-top: var(--bc-space-2, 8px); }
.bcs-prose { font-size: var(--bc-text-sm, 13px); line-height: 1.55; color: var(--bc-text, #18181b); margin: var(--bc-space-3, 12px) 0 0 !important; }

/* small layout helpers */
.bcs-inline { display: inline-flex; align-items: center; gap: var(--bc-space-2, 8px); min-width: 0; }
.bcs-inline--grow { display: flex; width: 100%; }
.bcs-inline--grow > :first-child { flex: 1 1 auto; min-width: 0; }
.bcs-inline__sep { font-size: var(--bc-text-xs, 12px); color: var(--bc-muted, #6b6b74); }

/* individual controls */
.bcs-select { width: auto; min-width: 160px; max-width: 220px; }
.bcs-text { width: 220px; max-width: 100%; }
.bcs-text--wide { width: 100%; }
.bcs-text .bcs-text__warn { font-size: var(--bc-text-xs, 12px); color: var(--bc-danger, #b91c1c); }
.bcs-text .bcs-text__warn:empty { display: none; }
.bcs-invalid .bc-input { border-color: var(--bc-danger, #b91c1c); }
.bcs-number { display: inline-flex; align-items: center; gap: 6px; }
.bcs-number__input { width: 76px; text-align: right; font-variant-numeric: tabular-nums; }
.bcs-number__suffix { font-size: var(--bc-text-xs, 12px); color: var(--bc-muted, #6b6b74); }
.bcs-time { width: 116px; }
.bcs-row--stacked .bcs-text { width: 100%; }

.bcs-slider { display: inline-flex; align-items: center; gap: var(--bc-space-3, 12px); width: 220px; max-width: 100%; }
.bcs-range {
  -webkit-appearance: none; appearance: none; flex: 1; min-width: 0; height: 4px; margin: 0; border-radius: 999px; cursor: pointer;
  background: linear-gradient(to right, var(--bc-accent, #4f46e5) var(--fill, 0%), var(--bc-surface-3, #e4e4e7) var(--fill, 0%));
}
.bcs-range::-webkit-slider-thumb {
  -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #fff;
  border: 1px solid var(--bc-border-strong, #d4d4d8); box-shadow: 0 1px 3px rgba(0,0,0,.2);
}
.bcs-range::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: #fff; border: 1px solid var(--bc-border-strong, #d4d4d8); box-shadow: 0 1px 3px rgba(0,0,0,.2); }
.bcs-range:focus-visible { outline: 2px solid var(--bc-focus-ring, #4f46e5); outline-offset: 4px; }
.bcs-slider__value { flex: none; min-width: 44px; text-align: right; font-size: var(--bc-text-xs, 12px); color: var(--bc-muted, #6b6b74); }

.bcs-color { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; max-width: 100%; }
.bcs-color__presets + .bc-iconbtn, .bcs-color > .bc-iconbtn { order: 3; }
.bcs-color__native { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.bcs-color__swatch {
  flex: none; width: 28px; height: 28px; padding: 0; border: 1px solid var(--bc-border-strong, #d4d4d8);
  border-radius: var(--bc-radius-sm, 6px); cursor: pointer; box-shadow: inset 0 0 0 2px var(--bc-surface-2, #fff);
}
.bcs-color__swatch--none {
  background: linear-gradient(135deg, transparent calc(50% - 1px), var(--bc-danger, #b91c1c) calc(50% - 1px), var(--bc-danger, #b91c1c) calc(50% + 1px), transparent calc(50% + 1px)),
              var(--bc-surface-2, #fff) !important;
}
.bcs-color__hex { width: 92px; font-family: var(--bc-font-mono, monospace); }
.bcs-color__presets { display: flex; gap: 6px; flex-wrap: wrap; order: 4; margin-left: 6px; }
.bcs-color__preset { width: 18px; height: 18px; padding: 0; border: 0; border-radius: 50%; cursor: pointer; box-shadow: inset 0 0 0 1px rgba(0,0,0,.12); }
.bcs-color__preset:hover { transform: scale(1.12); }
.bcs-color__preset:focus-visible { outline: 2px solid var(--bc-focus-ring, #4f46e5); outline-offset: 2px; }

.bcs-key {
  display: inline-flex; align-items: center; gap: 4px; min-height: var(--bc-control-h-sm, 28px); padding: 2px 8px;
  border: 1px solid var(--bc-border, #e4e4e7); border-radius: var(--bc-radius-md, 8px);
  background: var(--bc-surface-2, #fff); color: var(--bc-muted, #6b6b74); font-size: var(--bc-text-xs, 12px); cursor: pointer;
}
.bcs-key:hover { border-color: var(--bc-border-strong, #d4d4d8); }
.bcs-key--recording { border-color: var(--bc-accent-stroke, #4f46e5); color: var(--bc-accent-text, #4338ca); box-shadow: 0 0 0 3px var(--bc-accent-weak, rgba(79,70,229,.15)); }
.bcs-key__then { font-size: var(--bc-text-2xs, 11px); color: var(--bc-text-subtle, #a1a1aa); }

.bcs-tags { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.bcs-tags__chips { display: contents; }
.bcs-tags__input { flex: 1 1 140px; min-width: 120px; width: auto; }
.bcs-links { display: flex; flex-direction: column; gap: var(--bc-space-2, 8px); }
.bcs-links__row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr) auto auto; gap: var(--bc-space-2, 8px); align-items: center; }
.bcs-checks { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: var(--bc-space-2, 8px) var(--bc-space-4, 16px); }

/* sortable */
.bcs-sortable { display: flex; flex-direction: column; gap: 6px; margin: var(--bc-space-3, 12px) 0; }
.bcs-sortable__item {
  display: flex; align-items: center; gap: var(--bc-space-2, 8px); padding: 6px var(--bc-space-2, 8px) 6px 4px;
  border: 1px solid var(--bc-border, #e4e4e7); border-radius: var(--bc-radius-md, 8px); background: var(--bc-surface-2, #fff);
}
.bcs-sortable__item > :last-child { flex: 1 1 auto; min-width: 0; }
.bcs-sortable__grip { display: inline-flex; flex: none; color: var(--bc-text-subtle, #a1a1aa); cursor: grab; padding: 4px; margin: -2px; border: 0; border-radius: 4px; background: none; touch-action: none; }
.bcs-sortable__grip:focus-visible { outline: 2px solid var(--bc-focus-ring, #4f46e5); outline-offset: 1px; color: var(--bc-text, #18181b); }
.bcs-links input[aria-invalid] { border-color: var(--bc-danger, #b91c1c); }
.bcs-sortable__grip .bc-icon { width: 16px; height: 16px; }
.bcs-sortable__row { display: flex; align-items: center; justify-content: space-between; gap: var(--bc-space-3, 12px); font-size: var(--bc-text-sm, 13px); }
.bcs-navlist__note { flex: none; padding: 0 6px; border-radius: var(--bc-radius-pill, 999px); background: var(--bc-surface-3, #f4f4f5);
  font-size: var(--bc-text-2xs, 11px); color: var(--bc-muted, #6b6b74); }
.bcs-dragging { opacity: .5; }

/* course editor */
.bcs-courses > .bcs-inline--grow { margin-bottom: 4px; }
.bcs-course { display: flex; flex-direction: column; gap: 6px; }
.bcs-course__main { display: flex; align-items: center; gap: var(--bc-space-2, 8px); min-width: 0; }
.bcs-course__main > .bc-input { flex: 1 1 auto; min-width: 0; }
.bcs-course__swatch { width: 22px; height: 22px; border-radius: 50%; }
.bcs-course__code { flex: 0 1 96px; font-size: var(--bc-text-2xs, 11px); color: var(--bc-muted, #6b6b74); }
.bcs-course--hidden .bcs-course__main > .bc-input, .bcs-course--hidden .bcs-course__code, .bcs-course--hidden .bcs-course__swatch { opacity: .45; }

/* lists */
.bcs-list { display: flex; flex-direction: column; }
.bcs-item { display: flex; align-items: center; gap: var(--bc-space-3, 12px); padding: 10px 0; border-top: 1px solid var(--bc-border-subtle, #f0f0f2); min-width: 0; }
.bcs-item:first-child { border-top: 0; }
.bcs-item__text { flex: 1 1 auto; min-width: 0; }
.bcs-item__title { font-size: var(--bc-text-sm, 13px); font-weight: var(--bc-weight-medium, 500); }
.bcs-item__meta { margin-top: 2px; font-size: var(--bc-text-xs, 12px); color: var(--bc-muted, #6b6b74); }
.bcs-item__actions { display: flex; align-items: center; gap: var(--bc-space-2, 8px); flex: none; }
.bcs-item__value { font-size: var(--bc-text-sm, 13px); color: var(--bc-muted, #6b6b74); }

/* recurring form */
.bcs-form { display: flex; flex-direction: column; gap: var(--bc-space-2, 8px); padding: var(--bc-space-3, 12px); border-radius: var(--bc-radius-md, 8px); background: var(--bc-surface-1, #fafafa); border: 1px solid var(--bc-border-subtle, #f0f0f2); }
.bcs-form__row { display: flex; align-items: center; gap: var(--bc-space-2, 8px); flex-wrap: wrap; }
.bcs-form__row > .bc-input:only-child { flex: 1; }
.bcs-days { display: inline-flex; gap: 4px; }
.bcs-day {
  width: 30px; height: 28px; padding: 0; border: 1px solid var(--bc-border, #e4e4e7); border-radius: var(--bc-radius-sm, 6px);
  background: var(--bc-surface-2, #fff); color: var(--bc-muted, #6b6b74); font-size: var(--bc-text-2xs, 11px); font-weight: var(--bc-weight-semibold, 600); cursor: pointer;
}
.bcs-day[aria-pressed="true"] { background: var(--bc-accent, #4f46e5); border-color: var(--bc-accent, #4f46e5); color: var(--bc-accent-contrast, #fff); }
.bcs-dom { width: 64px; }

/* themes */
.bcs-themes { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(210px, 100%), 1fr)); gap: 16px; }
.bcs-theme { position: relative; }
.bcs-theme__apply {
  display: flex; flex-direction: column; gap: var(--bc-space-2, 8px); width: 100%; padding: 6px 6px 10px;
  border: 1px solid var(--bc-border, #e4e4e7); border-radius: var(--bc-radius-lg, 12px); background: var(--bc-surface-2, #fff);
  color: var(--bc-text, #18181b); cursor: pointer; text-align: left;
  transition: border-color var(--bc-dur-1, 90ms) ease, box-shadow var(--bc-dur-1, 90ms) ease;
}
.bcs-theme__apply:hover { border-color: var(--bc-border-strong, #d4d4d8); box-shadow: var(--bc-shadow-1, 0 1px 2px rgba(0,0,0,.08)); }
.bcs-theme__preview { position: relative; height: 160px; border-radius: var(--bc-radius-md, 8px); overflow: hidden; box-shadow: inset 0 0 0 1px rgba(0,0,0,.06); }
.bcs-theme__preview > img { display: block; width: 100%; height: 100%; object-fit: cover; }
.bcs-theme__preview--image .bcs-theme__bar { opacity: .85; }
.bcs-theme__preview--image .bcs-theme__panel { top: 35px; bottom: 10px; padding: 8px; }
.bcs-theme__mini-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; margin-top: 8px; }
.bcs-theme__mini-cards > div { overflow: hidden; border-radius: 4px; box-shadow: 0 2px 8px #0003; }
.bcs-theme__mini-cards img { display: block; width: 100%; height: 44px; object-fit: cover; }
.bcs-theme__mini-cards i { height: 3px; margin: 8px 5px 6px; }
.bcs-theme__mini-cards b { height: 3px; width: 16px; margin: 0 5px 8px; }
.bcs-theme__image-error { position: absolute; top: 12px; left: 20px; right: 5px; font-size: 11px; color: var(--bc-muted); }
.bcs-theme__count { position: absolute; right: 5px; top: 5px; padding: 2px 5px; white-space: nowrap; border-radius: 4px; font-size: 10px; color: #fff; background: rgba(0,0,0,.65); }
/* With a "Live scenery" badge in the top corner, the count moves to the bottom so the two never collide on narrow cards. */
.bcs-theme__preview:has(.bcs-motion-badge) .bcs-theme__count { top: auto; bottom: 5px; }
.bcs-theme__credit { display: block; padding: 4px 6px; max-width: 100%; font-size: 10px; }
.bcs-theme__credits { padding: 0 6px; font-size: 11px; }
.bcs-theme__credits a { display: block; margin-top: 4px; overflow-wrap: anywhere; }
.bcs-theme__apply[aria-pressed="true"] { border-color: var(--bc-accent, #6366f1); box-shadow: 0 0 0 1px var(--bc-accent, #6366f1); }
.bcs-theme-categories { display: flex; flex-wrap: wrap; gap: 4px; }
.bcs-theme-categories [aria-pressed="true"], .bcs-inline > [aria-pressed="true"] { background: var(--bc-accent-soft, #eef2ff); color: var(--bc-accent-text, #4338ca); border-color: var(--bc-accent, #6366f1); }
.bcs-theme-options { flex-wrap: wrap; }
.bcs-themes[aria-busy="true"] { opacity: .6; }
.bcs-theme__preview--auto::after { content: ""; position: absolute; inset: 0 0 0 50%; background: rgba(17,17,19,.86); }
.bcs-theme__bar { position: absolute; left: 0; top: 0; bottom: 0; width: 14px; }
.bcs-theme__panel { position: absolute; left: 22px; right: 8px; top: 10px; bottom: 10px; border: 1px solid; border-radius: 5px; padding: 7px; display: flex; flex-direction: column; gap: 5px; }
.bcs-theme__panel i { display: block; height: 4px; border-radius: 2px; width: 70%; opacity: .55; }
.bcs-theme__panel i + i { width: 45%; }
.bcs-theme__panel b { display: block; width: 26px; height: 8px; border-radius: 3px; margin-top: auto; }
.bcs-theme__name { padding: 2px 4px; font-size: var(--bc-text-sm, 13px); font-weight: 650; }
.bcs-theme__description { display: block; padding: 0 4px 4px; color: var(--bc-muted); font-size: 11px; line-height: 1.6; min-height: 35px; }
.bcs-theme__more { position: absolute; right: 6px; bottom: 4px; }

/* GPA */
.bcs-table { width: 100%; border-collapse: collapse; font-size: var(--bc-text-sm, 13px); }
.bcs-table th { padding: 6px 8px; text-align: left; font-size: var(--bc-text-2xs, 11px); font-weight: var(--bc-weight-semibold, 600);
  text-transform: uppercase; letter-spacing: var(--bc-tracking-caps, .04em); color: var(--bc-muted, #6b6b74); border-bottom: 1px solid var(--bc-border, #e4e4e7); }
.bcs-table td { padding: 6px 8px; border-bottom: 1px solid var(--bc-border-subtle, #f0f0f2); max-width: 0; }
.bcs-table td:first-child { width: 100%; }
.bcs-table .bcs-num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; max-width: none; }
.bcs-gpa__cred { width: 64px; text-align: right; display: inline-block; }
.bcs-gpa__concluded td { color: var(--bc-text-subtle, #a1a1aa); }
.bcs-gpa__total { display: flex; align-items: baseline; justify-content: flex-end; gap: var(--bc-space-3, 12px); padding: var(--bc-space-3, 12px) 8px 0; }
.bcs-gpa__value { font-size: var(--bc-text-xl, 20px); font-weight: var(--bc-weight-semibold, 600); }

/* insights */
.bcs-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--bc-space-3, 12px); margin-bottom: var(--bc-space-4, 16px); }
.bcs-stats > .bc-stat { padding: var(--bc-space-4, 16px); border: 1px solid var(--bc-border, #e4e4e7); border-radius: var(--bc-radius-lg, 12px); background: var(--bc-surface-2, #fff); }
.bcs-stats .bc-stat-value { font-size: var(--bc-text-xl, 20px); }
.bcs-bars { display: flex; align-items: flex-end; gap: 4px; height: 72px; margin: var(--bc-space-3, 12px) 0; }
.bcs-bars__col { flex: 1; height: 100%; display: flex; align-items: flex-end; border-radius: 4px; background: var(--bc-surface-3, #f4f4f5); overflow: hidden; }
.bcs-bars__fill { width: 100%; min-height: 2px; background: var(--bc-accent, #4f46e5); }
.bcs-trend { font-size: var(--bc-text-xs, 12px); font-weight: var(--bc-weight-semibold, 600); min-width: 48px; text-align: right; }

/* search results */
.bcs-results__group { margin-bottom: var(--bc-space-6, 24px); }
.bcs-results__head { display: flex; align-items: center; gap: var(--bc-space-2, 8px); margin-bottom: var(--bc-space-2, 8px);
  font-size: var(--bc-text-xs, 12px); font-weight: var(--bc-weight-semibold, 600); color: var(--bc-muted, #6b6b74); }
.bcs-results__head .bc-icon { width: 14px; height: 14px; }

/* choice cards (To Do style) */
.bcs-choice { display: grid; grid-template-columns: repeat(auto-fit, minmax(124px, 1fr)); gap: 10px; width: 100%; }
.bcs-ring-demo { display: flex; align-items: center; justify-content: center; height: 100%; }
.bcs-ring-demo span { padding: 6px 14px; border-radius: 6px; background: var(--bc-surface-2, #fff); border: 1px solid var(--bc-border, #e4e4e7); font-size: 12px; font-weight: 600; color: var(--bc-text, #18181b); }
.bcs-ring-demo--default span { outline: 2px solid var(--ic-brand-primary, #0374b5); outline-offset: 1px; }
.bcs-ring-demo--bold span { outline: 3px solid var(--bc-accent, #4f46e5); outline-offset: 2px; }
.bcs-ring-demo--high-contrast span { outline: 3px solid #ffeb3b; outline-offset: 2px; box-shadow: 0 0 0 4px #000; }
.bcs-cursor-demo { display: block; width: 32px; height: 32px; margin: 20px auto 0; }
.bcs-cursor-pad { display: grid; place-items: center; width: 100%; min-height: 80px; border: 1px dashed var(--bc-border-strong, #d4d4d8); border-radius: var(--bc-radius, 8px); color: var(--bc-muted, #6b6b74); font-size: var(--bc-text-xs, 12px); }
.bcs-choice__card {
  position: relative; display: flex; flex-direction: column; gap: 10px; margin: 0; padding: 6px 6px 12px;
  border: 1px solid var(--bc-border, #e4e4e7); border-radius: var(--bc-radius-lg, 12px); background: var(--bc-surface-2, #fff);
  color: var(--bc-text, #18181b); font: inherit; text-align: left; cursor: pointer;
  transition: border-color var(--bc-dur-2, 150ms) ease, box-shadow var(--bc-dur-2, 150ms) ease, transform var(--bc-dur-2, 150ms) var(--bc-ease-out, ease);
}
.bcs-choice__card:hover { border-color: var(--bc-border-strong, #d4d4d8); box-shadow: var(--bc-shadow-2, 0 4px 12px rgba(0,0,0,.08)); transform: translateY(-1px); }
.bcs-choice__card:active { transform: translateY(0) scale(.99); }
.bcs-choice__card[aria-checked="true"] { border-color: var(--bc-accent-stroke, #4f46e5); box-shadow: 0 0 0 3px var(--bc-accent-weak, rgba(79,70,229,.12)); }
.bcs-choice__card:focus-visible { outline: 2px solid var(--bc-focus-ring, #4f46e5); outline-offset: 2px; }
.bcs-choice__preview { display: block; height: 96px; padding: 12px; overflow: hidden; border-radius: calc(var(--bc-radius-lg, 12px) - 4px); background: var(--bc-surface-1, #fafafa); }
.bcs-choice__text { display: grid; gap: 2px; padding: 0 6px; }
.bcs-choice__label { font-size: var(--bc-text-sm, 13px); font-weight: var(--bc-weight-semibold, 600); }
.bcs-choice__desc { font-size: var(--bc-text-xs, 12px); line-height: 1.4; color: var(--bc-muted, #6b6b74); }
.bcs-choice__tick {
  position: absolute; top: 12px; right: 12px; display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%;
  background: var(--bc-accent, #4f46e5); color: var(--bc-accent-contrast, #fff); box-shadow: 0 0 0 2px var(--bc-surface-2, #fff);
  opacity: 0; transform: scale(.4); transition: opacity var(--bc-dur-2, 150ms) ease, transform var(--bc-dur-3, 220ms) var(--bc-ease-spring, ease);
}
.bcs-choice__card[aria-checked="true"] .bcs-choice__tick { opacity: 1; transform: none; }
.bcs-choice__tick .bc-icon { width: 12px; height: 12px; }
/* the drawn previews */
.pv { display: grid; align-content: start; gap: 7px; height: 100%; }
.pv i { display: block; border-radius: 3px; background: var(--bc-border-strong, #d4d4d8); }
.pv .pv-h { width: 42%; height: 6px; margin-bottom: 1px; background: var(--bc-text-subtle, #a1a1aa); }
.pv-row { display: flex; align-items: center; gap: 7px; min-width: 0; }
.pv .pv-ic { flex: none; width: 10px; height: 10px; }
.pv-lines { display: grid; flex: 1; gap: 3px; min-width: 0; }
.pv .pv-l { height: 4px; }
.pv .pv-l--a { width: 78%; background: var(--bc-accent, #4f46e5); opacity: .55; }
.pv .pv-l--s { width: 48%; }
.pv .pv-l--t { width: 56%; height: 5px; background: var(--bc-text-subtle, #a1a1aa); }
.pv .pv-x { flex: none; width: 6px; height: 6px; }
.pv--canvas .pv-row + .pv-row { padding-top: 7px; border-top: 1px solid var(--bc-border, #e4e4e7); }
.pv--clean { gap: 3px; padding: 6px; border: 1px solid var(--bc-border, #e4e4e7); border-radius: 8px; background: var(--bc-surface-2, #fff); }
.pv--clean .pv-h { margin: 0 0 3px 3px; }
.pv--clean .pv-row { padding: 3px; border-radius: 5px; }
.pv--clean .pv-row--hi { background: var(--bc-surface-hover, #f4f4f5); }
.pv--clean .pv-ic { width: 14px; height: 14px; border-radius: 4px; background: var(--bc-accent-weak, rgba(79,70,229,.15)); }
.pv--planner { gap: 6px; }
.pv-top { display: flex; align-items: center; gap: 7px; margin-bottom: 2px; }
.pv .pv-ring { flex: none; width: 20px; height: 20px; border-radius: 50%;
  background: conic-gradient(var(--bc-accent, #4f46e5) 0 62%, var(--bc-surface-3, #e4e4e7) 0);
  -webkit-mask: radial-gradient(circle, transparent 6px, #000 6.5px); mask: radial-gradient(circle, transparent 6px, #000 6.5px); }
.pv .pv-chk { flex: none; width: 10px; height: 10px; border-radius: 50%; background: transparent; box-shadow: inset 0 0 0 1.5px var(--bc-border-contrast, #a1a1aa); }
.pv .pv-chk--on { background: var(--bc-accent, #4f46e5); box-shadow: none; }

/* toggle chips */
.bcs-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.bcs-chipbtn {
  display: inline-flex; align-items: center; gap: 6px; height: 30px; margin: 0; padding: 0 12px;
  border: 1px solid var(--bc-border, #e4e4e7); border-radius: var(--bc-radius-pill, 999px);
  background: var(--bc-surface-2, #fff); color: var(--bc-muted, #6b6b74);
  font: var(--bc-weight-medium, 500) var(--bc-text-xs, 12px)/1 var(--bc-font-sans, system-ui, sans-serif); cursor: pointer;
  transition: background-color var(--bc-dur-2, 150ms) ease, border-color var(--bc-dur-2, 150ms) ease, color var(--bc-dur-2, 150ms) ease;
}
.bcs-chipbtn:hover { border-color: var(--bc-border-strong, #d4d4d8); color: var(--bc-text, #18181b); }
.bcs-chipbtn .bc-icon { width: 14px; height: 14px; }
.bcs-chipbtn__check { display: inline-flex; width: 0; overflow: hidden; margin-right: -6px; transition: width var(--bc-dur-2, 150ms) var(--bc-ease-out, ease), margin var(--bc-dur-2, 150ms) var(--bc-ease-out, ease); }
.bcs-chipbtn[aria-pressed="true"] { border-color: var(--bc-accent-border, rgba(79,70,229,.45)); background: var(--bc-accent-weak, rgba(79,70,229,.12)); color: var(--bc-accent-text, #4338ca); }
.bcs-chipbtn[aria-pressed="true"] .bcs-chipbtn__check { width: 14px; margin-right: 0; }
.bcs-chipbtn[aria-pressed="true"] .bcs-chipbtn__check ~ .bc-icon { display: none; }
.bcs-chipbtn:focus-visible { outline: 2px solid var(--bc-focus-ring, #4f46e5); outline-offset: 2px; }

/* motion: a section enters with a short rise, staggered down the page */
@keyframes bcs-in { from { opacity: 0; transform: translateY(6px); filter: blur(2px); } }
.bcs-main > * { animation: bcs-in 320ms cubic-bezier(.22, 1, .36, 1) both; }
.bcs-main > :nth-child(2) { animation-delay: 25ms; }
.bcs-main > :nth-child(3) { animation-delay: 50ms; }
.bcs-main > :nth-child(4) { animation-delay: 75ms; }
.bcs-main > :nth-child(5) { animation-delay: 100ms; }
.bcs-main > :nth-child(n+6) { animation-delay: 120ms; }
.bcs-main.bcs-main--still > * { animation: none; }
.bcs-nav__item { transition: background-color var(--bc-dur-1, 90ms) ease, color var(--bc-dur-1, 90ms) ease; }
.bcs-nav__item .bc-icon { transition: transform var(--bc-dur-2, 150ms) var(--bc-ease-out, ease); }
.bcs-nav__item:hover .bc-icon { transform: scale(1.08); }
.bcs-theme__apply { transition: border-color var(--bc-dur-2, 150ms) ease, box-shadow var(--bc-dur-2, 150ms) ease, transform var(--bc-dur-2, 150ms) var(--bc-ease-out, ease); }
.bcs-theme__apply:hover { transform: translateY(-1px); }
.bcs-row { transition: opacity var(--bc-dur-2, 150ms) ease; }
.bcs-row__label, .bcs-row__hint, .bcs-row__control { transition: opacity var(--bc-dur-2, 150ms) ease; }
.bcs-sortable__item { transition: box-shadow var(--bc-dur-2, 150ms) ease, opacity var(--bc-dur-2, 150ms) ease; }
.bcs-sortable__item:hover { box-shadow: var(--bc-shadow-1, 0 1px 2px rgba(0,0,0,.08)); }
.bcs-day { transition: background-color var(--bc-dur-1, 90ms) ease, border-color var(--bc-dur-1, 90ms) ease, color var(--bc-dur-1, 90ms) ease; }
@media (prefers-reduced-motion: reduce) { .bcs-main > * { animation: none; } }

/* the options page: same app, full height, centered */
.bc-app--page { height: 100%; }
.bc-app--page .bcs-shell { width: 100%; max-width: 1180px; margin: 0 auto; border-left: 1px solid var(--bc-border, #e4e4e7); border-right: 1px solid var(--bc-border, #e4e4e7); }
.bc-app--page .bcs-header { padding-left: max(var(--bc-space-4, 16px), calc((100% - 1180px) / 2 + 16px)); padding-right: max(var(--bc-space-3, 12px), calc((100% - 1180px) / 2 + 12px)); }

/* Rows whose control is wide (4+ choices, color presets) stack under their label
   when the section is too narrow for both on one line. */
@container bcs-section (max-width: 600px) {
  .bcs-row:has(> .bcs-row__control > .bcs-wide) { grid-template-columns: minmax(0, 1fr); gap: 10px; }
  .bcs-row:has(> .bcs-row__control > .bcs-wide) > .bcs-row__control { justify-content: flex-start; }
  .bcs-row__control > .bcs-color.bcs-wide { justify-content: flex-start; }
}

/* a narrow panel collapses the nav to icons */
@container bcs-app (max-width: 640px) {
  .bcs-shell { grid-template-columns: 56px minmax(0, 1fr); }
  .bcs-nav { padding: var(--bc-space-2, 8px) 6px; }
  .bcs-nav__group, .bcs-nav__label, .bcs-master__text { display: none; }
  .bcs-master { justify-content: center; padding: 8px 0; margin: 0 0 var(--bc-space-2, 8px); border: 0; background: transparent; }
  .bcs-nav__item { justify-content: center; padding: 0; }
  .bcs-main { padding: var(--bc-space-4, 16px); }
  .bcs-search { max-width: none; }
  .bcs-brand__text { display: none; }
}
@container bcs-app (max-width: 520px) {
  .bcs-row { grid-template-columns: minmax(0, 1fr); gap: var(--bc-space-2, 8px); }
  .bcs-row__control { justify-content: flex-start; }
  /* a lone switch is small enough to stay beside its label */
  .bcs-row:has(> .bcs-row__control > .bc-switch:only-child) { grid-template-columns: minmax(0, 1fr) auto; gap: var(--bc-space-3, 12px); }
  .bcs-stats { grid-template-columns: minmax(0, 1fr); }
}
`;
})();
