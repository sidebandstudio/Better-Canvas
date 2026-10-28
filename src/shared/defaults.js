/*
 * Better Canvas — default settings schema.
 * Single source of truth. Loaded as a classic script by every surface
 * (content scripts, options) and attaches to globalThis.BC.
 */
(function () {
  "use strict";
  const BC = (globalThis.BC = globalThis.BC || {});
  if (BC.cloneDefaults) return;

  BC.VERSION = "3.3.2";
  BC.SETTINGS_KEY = "bcSettings";
  BC.LOCAL_KEY = "bcLocal";
  BC.PROFILES_KEY = "bcProfiles";
  // Theming settings that are about how someone uses Canvas, not how it looks, so
  // applying a theme keeps them unless the theme sets them itself.
  BC.THEME_KEEPS = ["colorBlind", "reducedMotion", "fontSizeScale", "cursor", "cursorSize", "cursorColor", "focusRing"];

  BC.GLOBAL_NAV_ITEMS = [
    { key: "global_nav_dashboard_link", label: "Dashboard" },
    { key: "global_nav_courses_link", label: "Courses" },
    { key: "global_nav_groups_link", label: "Groups" },
    { key: "global_nav_calendar_link", label: "Calendar" },
    { key: "global_nav_conversations_link", label: "Inbox" },
    { key: "global_nav_history_link", label: "History" },
    { key: "global_nav_commons_link", label: "Commons" },
    { key: "global_nav_help_link", label: "Help" },
    { key: "global_nav_accounts_link", label: "Admin" },
    { key: "global_nav_profile_link", label: "Account" },
  ];

  BC.GPA_SCALES = {
    "standard-4": {
      label: "Standard 4.0",
      bands: [
        { min: 93, points: 4.0, letter: "A" },
        { min: 90, points: 3.7, letter: "A-" },
        { min: 87, points: 3.3, letter: "B+" },
        { min: 83, points: 3.0, letter: "B" },
        { min: 80, points: 2.7, letter: "B-" },
        { min: 77, points: 2.3, letter: "C+" },
        { min: 73, points: 2.0, letter: "C" },
        { min: 70, points: 1.7, letter: "C-" },
        { min: 67, points: 1.3, letter: "D+" },
        { min: 63, points: 1.0, letter: "D" },
        { min: 60, points: 0.7, letter: "D-" },
        { min: 0, points: 0.0, letter: "F" },
      ],
    },
    "plus-4-3": {
      label: "4.3 scale (A+ = 4.3)",
      bands: [
        { min: 97, points: 4.3, letter: "A+" },
        { min: 93, points: 4.0, letter: "A" },
        { min: 90, points: 3.7, letter: "A-" },
        { min: 87, points: 3.3, letter: "B+" },
        { min: 83, points: 3.0, letter: "B" },
        { min: 80, points: 2.7, letter: "B-" },
        { min: 77, points: 2.3, letter: "C+" },
        { min: 73, points: 2.0, letter: "C" },
        { min: 70, points: 1.7, letter: "C-" },
        { min: 67, points: 1.3, letter: "D+" },
        { min: 63, points: 1.0, letter: "D" },
        { min: 60, points: 0.7, letter: "D-" },
        { min: 0, points: 0.0, letter: "F" },
      ],
    },
    "hs-unweighted": {
      label: "High school (unweighted)",
      bands: [
        { min: 90, points: 4.0, letter: "A" },
        { min: 80, points: 3.0, letter: "B" },
        { min: 70, points: 2.0, letter: "C" },
        { min: 60, points: 1.0, letter: "D" },
        { min: 0, points: 0.0, letter: "F" },
      ],
    },
  };

  BC.defaults = {
    version: 5,
    enabled: true,
    activeProfile: "default",
    firstRun: true,

    dashboard: {
      enabled: true,
      autoHideConcluded: true,
      layout: "grid",              // grid | list | masonry | compact
      cardSize: "m",               // s | m | l
      cardRadius: 8,               // 0-24
      hoverLift: true,
      showInlineGrade: false,
      showProgressBar: false,
      showBadges: false,           // due-count badge on each card
      showSparkline: false,        // grade trend sparkline from local history
      courseSearch: true,          // filter box above the card grid
      semesterProgress: true,      // "Week 9 of 15" term progress bar
      pinned: [],                  // course ids — read by the course quick-switch bar
      courseOrder: [],
      widgets: {
        todo: true,
        comingUp: true,
        recentFeedback: true,
        viewGrades: true,
        gpa: false,
      },
      hideSidebar: false,
      courses: {},                 // per-course: {hidden, nickname, color, bgImage, bgGradient, note}
      themeImages: [],             // theme artwork, assigned consistently across courses
    },

    todo: {
      mode: "default",             // default | clean | custom
      view: "list",                // list | kanban | timeblock
      rangeDays: 7,                // 3 | 7 | 14 | 30
      startOn: "today",            // today | sunday | monday — where the window begins
      showCompleted: false,
      showOverdue: true,           // unfinished work from the last two weeks, on top
      starredFirst: true,
      collapseAfter: 0,            // 0 = show every item; else "Show N more" per group
      compact: false,              // one-line rows
      showViewSwitch: false,       // List / Board / Day buttons on the list itself
      // Which kinds of planner item to list. Unknown kinds always show.
      types: {
        assignment: true, quiz: true, discussion_topic: true, announcement: true,
        wiki_page: true, calendar_event: true, planner_note: true,
      },
      rowDetails: { course: true, time: true, points: true, icon: true },
      accent: "",
      allowNewTask: true,
      newTaskDay: "today",         // today | tomorrow
      celebrate: true,             // a small burst when the window is cleared
      groupBy: "day",              // day | course | priority | tag | none
      ring: true,                  // show progress at all
      dueFormat: "relative",
      progressStyle: "ring",       // ring | bar
      streaks: {
        enabled: true,
        graceDays: 2,
        repairsAvailable: 3,       // per month
      },
      pomodoro: {
        enabled: true,
        workMin: 25,
        shortBreakMin: 5,
        longBreakMin: 15,
        longEvery: 4,
        sound: true,
      },
      recurring: [],               // [{id, title, courseId, rule, days, day, at, until, from}]
      tags: [],                    // user-defined tag names
      // Per-task augmentation (stars, snoozes, subtasks, kanban status, …) lives in
      // bcLocal.todo, NOT here. Every one of those is written on a micro-interaction,
      // and a bcSettings write re-applies all ~24 features and blows away the open
      // settings drawer's DOM. See MIGRATIONS[4].
    },

    theming: {
      darkMode: "off",
      darkSchedule: { start: "20:00", end: "07:00" },
      darkTone: "neutral",         // neutral | slate | black | nord | dracula | solarized
      darkBg: "",
      lightBg: "",
      experience: "",             // coordinated wallpaper, navigation and surfaces
      lightPreset: "default",      // default | rose | forest | ocean | sand | solarized
      accentColor: "",
      font: "",
      fontSizeScale: "m",          // xs|s|m|l|xl
      lineHeight: 1.5,
      letterSpacing: 0,            // px
      density: "default",          // compact | default | spacious | cozy
      radius: 8,                   // global corner radius
      cursor: "default",           // default | arrow | dot | ring | precise ("large", before 3.3.2, is arrow)
      cursorSize: 32,              // px, 16-48, for the drawn cursors
      cursorColor: "#000000",
      focusRing: "default",        // default | bold | high-contrast
      colorBlind: "off",           // off | protanopia | deuteranopia | tritanopia
      highContrast: false,
      reducedMotion: false,        // force reduced motion even if OS doesn't
      animSpeed: 1.0,              // 0.5-2.0 multiplier
      roundedUI: true,
      sidebarWidth: 0,             // 0 = default; else px
      logo: { mode: "default", url: "", text: "" }, // default | hide | replace | text
      rotation: { enabled: false, mode: "daily", themeIds: [] }, // auto theme cycling
    },

    navigation: {
      global: { hidden: [], order: [], customLinks: [] },
      course: { hidden: [], order: [], customLinks: [] },
      breadcrumbs: "default",      // default | compact | hidden
      courseTabs: false,           // pinned quick-switch bar
      quickSearch: true,           // ⌘K palette shortcut
    },

    cosmetics: {
      motion: "none",
      background: {
        mode: "none",              // none | color | gradient | image | pattern
        color: "#0b1220",
        gradient: { from: "#1e3a8a", to: "#0b1220", angle: 135 },
        image: "",
        pattern: "none",           // none | dots | grid | diagonal | topography
        blur: 0,
        opacity: 100,
        when: "always",            // always | dark | light — which mode shows it
      },
      customCss: "",
    },

    grades: {
      gpaScale: "standard-4",
      creditsByCourse: {},
      panelEnabled: true,          // show the Grade Tools panel (was mislabelled whatIfEnabled)
      autoRefresh: false,
      autoRefreshMin: 5,
      rubricPredictor: true,
      goals: {},                   // {courseId: {target: number, notify: bool}}
      showTrendChart: true,
      showWeightDonut: true,
      showMissingWarning: true,
    },

    // Study coach on the dashboard. The grade math is local. Study plans use the
    // student's own ChatGPT plan, and only for courses listed in `courses`.
    coach: {
      enabled: true,
      defaultGoal: 80,             // target % for a course without its own goal
      autoUpdate: true,            // rewrite a plan when its course changes, at most once a day
      courses: {},                 // {courseId: true}: courses whose data may go to ChatGPT
    },

    notifications: {
      enabled: false,              // browser notifications (permission-gated)
      inPage: true,                // toasts for due-soon etc.
      leadMinutes: [60, 240, 1440], // 1h, 4h, 1d
      types: {
        dueSoon: true,
        newGrade: true,
        newAnnouncement: true,
        goalBreach: true,
        streakAtRisk: true,
      },
      quietHours: { enabled: false, start: "22:00", end: "07:00" },
      badgeCount: true,
      // Toast history lives in bcLocal.notifHistory — it's written from the notify
      // path, and a bcSettings write there re-applies every feature.
    },

    files: {
      enabled: false,
      starred: [],                 // file ids
    },

    announcements: {
      aggregator: false,
    },

    calendar: {
      icsExport: true,
      miniOnDashboard: false,
      syllabusExtract: true,       // offer to add syllabus dates to planner
    },

    previews: {
      hoverAssignmentCards: true,
    },

    modules: {
      progressBars: true,
    },

    discussions: {
      collapse: true,
      jumpToUnread: true,
      wordCount: true,
      instructorHighlight: true,
    },

    productivity: {
      focusMode: false,
      readingRuler: false,
      stickyNotes: true,           // enable feature; notes stored in bcLocal
      autoSaveDrafts: true,
      quizDraftSaver: true,
      wordCount: true,
      quickActions: true,          // "Tools" in Canvas's menu; a round button where the menu is hidden
      printFriendly: true,         // …its "Print this page" item
      copyUrlButton: true,         // …its "Copy link" item
      readingProgress: false,      // a bar over the top of every page; opt-in
    },

    accessibility: {
      tts: false,                  // "Speak" buttons on assignment, announcement and discussion text; opt-in
      largeTargets: false,
      dyslexiaFont: false,
    },

    instructor: {
      rosterExport: true,
      bulkGradeHelpers: true,
      attendanceQuick: true,
    },

    shortcuts: {
      enabled: true,
      bindings: {
        commandPalette: "Mod+K",
        settings: "Mod+Shift+S",
        toggleDark: "Mod+Shift+D",
        // Not Mod+Shift+T / Mod+Shift+N: Chrome and Firefox reserve those (reopen
        // tab, incognito/private window) and never deliver them to the page.
        quickTask: "Alt+Shift+T",
        quickNote: "Alt+Shift+N",
        gotoDashboard: "g d",
        gotoGrades: "g g",
        gotoInbox: "g i",
        gotoCalendar: "g c",
        focusMode: "Mod+Shift+F",
      },
    },

    customThemes: [],              // saved theme snapshots [{id, name, settings}]

    insights: {
      enabled: true,               // local study-time tracking
    },

    onboarding: {
      seen: false,
      lastWhatsNewVersion: "",
    },

    privacy: { telemetry: false },  // hard-wired
  };

  BC.cloneDefaults = function () {
    return JSON.parse(JSON.stringify(BC.defaults));
  };

  // Backups and shared themes are data, including objects nested inside arrays.
  // Never allow imported keys to change an object's prototype during a merge.
  BC.cleanData = function cleanData(value) {
    if (Array.isArray(value)) return value.map(cleanData);
    if (!value || typeof value !== "object") return value;
    const out = {};
    for (const k of Object.keys(value)) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
      out[k] = cleanData(value[k]);
    }
    return out;
  };

  BC.gradeNumber = function (value, max = 150) {
    if (typeof value !== "number" && typeof value !== "string") return null;
    if (typeof value === "string" && !value.trim()) return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 && number <= max ? number : null;
  };

  BC.cleanLocalData = function (value) {
    const data = BC.cleanData(value);
    if (data && data.rubricDrafts) {
      for (const draft of Object.values(data.rubricDrafts)) {
        if (!draft || typeof draft !== "object") continue;
        for (const key of Object.keys(draft)) {
          const number = BC.gradeNumber(draft[key], Number.MAX_SAFE_INTEGER);
          if (number === null) delete draft[key]; else draft[key] = number;
        }
      }
    }
    // Assign legacy steps the same ids in every reader before any operation.
    for (const steps of Object.values(data?.todo?.subtasks || {})) {
      if (!Array.isArray(steps)) continue;
      const used = new Set(steps.map((step) => step.id).filter(Boolean));
      steps.forEach((step, index) => {
        if (step.id) return;
        let id = "legacy-step-" + index;
        while (used.has(id)) id += "-";
        step.id = id; used.add(id);
      });
    }
    return data;
  };

  BC.mergeDefaults = function (stored, carry) {
    const base = BC.cloneDefaults();
    if (!stored || typeof stored !== "object") return base;
    stored = BC.cleanData(stored);
    const merge = (target, src) => {
      for (const k of Object.keys(src)) {
        const sv = src[k];
        if (Array.isArray(sv)) target[k] = sv;
        else if (sv && typeof sv === "object")
          target[k] = merge(target[k] && typeof target[k] === "object" ? target[k] : {}, sv);
        else if (sv !== undefined) target[k] = sv;
      }
      return target;
    };
    const merged = merge(base, stored);
    // The version must come from what was STORED. Merging onto the defaults first
    // meant an object without a version field (an old bare export, a hand-edited
    // file) inherited the current schema version and skipped every migration.
    merged.version = typeof stored.version === "number" ? stored.version : 2;
    const settings = BC.migrate(merged, carry);
    if (settings.grades && settings.grades.goals) {
      for (const [id, goal] of Object.entries(settings.grades.goals)) {
        const target = BC.gradeNumber(goal && goal.target);
        if (target === null) delete settings.grades.goals[id];
        else settings.grades.goals[id] = { target, notify: !!goal.notify };
      }
    }
    for (const scope of ["global", "course"]) {
      const links = settings.navigation[scope].customLinks || [];
      const used = new Set(links.map((link) => link.id).filter(Boolean));
      links.forEach((link, index) => {
        if (link.id) return;
        let id = "legacy-link-" + index;
        while (used.has(id)) id += "-";
        link.id = id; used.add(id);
      });
    }
    // Loaded only where the scene drawings are (not subframes).
    if (BC.compactSceneArt) BC.compactSceneArt(settings);
    return settings;
  };

  // Rebase only the editor's changes onto the latest committed settings.
  // Membership lists and id-keyed records retain independent additions/removals.
  // Ordering and artwork arrays are deliberate replacements.
  BC.mergeSettingsEdits = function merge(before, edited, fresh, key) {
    const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    if (equal(before, edited)) return BC.cleanData(fresh);
    if (Array.isArray(before) && Array.isArray(edited) && Array.isArray(fresh)) {
      if (!["order", "courseOrder"].includes(key) && [...before, ...edited].every((v) => typeof v === "string" || typeof v === "number")) {
        return fresh.filter((v) => !before.includes(v) || edited.includes(v))
          .concat(edited.filter((v) => !before.includes(v) && !fresh.includes(v)));
      }
      if ([...before, ...edited].every((v) => v && typeof v === "object" && v.id)) {
        const old = new Map(before.map((v) => [v.id, v])), next = new Map(edited.map((v) => [v.id, v]));
        const out = fresh.filter((v) => !old.has(v.id) || next.has(v.id)).map((v) =>
          old.has(v.id) && next.has(v.id) ? merge(old.get(v.id), next.get(v.id), v) : BC.cleanData(v));
        for (const v of edited) if (!old.has(v.id) && !out.some((x) => x.id === v.id)) out.push(BC.cleanData(v));
        return out;
      }
      return BC.cleanData(edited);
    }
    if ((before === undefined || before && typeof before === "object" && !Array.isArray(before)) && edited && typeof edited === "object" && !Array.isArray(edited)) {
      const out = fresh && typeof fresh === "object" && !Array.isArray(fresh) ? BC.cleanData(fresh) : {};
      for (const k of new Set([...Object.keys(before || {}), ...Object.keys(edited)])) {
        if (equal(before?.[k], edited[k])) continue;
        if (!Object.hasOwn(edited, k)) delete out[k];
        else out[k] = merge(before?.[k], edited[k], out[k], k);
      }
      return out;
    }
    return BC.cleanData(edited);
  };

  // Explicit actions can replace fields even when they equal the editor baseline.
  BC.replaceSettingsPaths = function (target, source, paths) {
    const replace = (to, from, path) => {
      const [key, ...rest] = path;
      if (key === "*") {
        for (const id of new Set([...Object.keys(to), ...Object.keys(from || {})])) {
          if (to[id]) replace(to[id], from?.[id], rest);
        }
      } else if (rest.length) {
        if (!to[key]) to[key] = {};
        replace(to[key], from?.[key], rest);
      } else if (from && Object.hasOwn(from, key)) to[key] = BC.cleanData(from[key]);
      else delete to[key];
    };
    for (const path of paths) replace(target, source, path);
    return target;
  };

  BC.SETTINGS_VERSION = 5;

  // Each entry upgrades settings from (v-1) to v. `carry` collects data that
  // must move to the bcLocal store — storage.load() persists it there.
  //
  // Removing a key from BC.defaults is NOT enough to remove it from an existing
  // user: mergeDefaults() iterates the STORED object, so an orphaned key survives
  // every load, gets re-saved, and keeps showing up in exported JSON. Only an
  // explicit delete here actually cleans it up.
  BC.MIGRATIONS = {
    3(s, carry) {
      const gh = s.grades && s.grades.gradeHistory;
      if (gh && typeof gh === "object" && Object.keys(gh).length) carry.gradeHistory = gh;
      if (s.grades) delete s.grades.gradeHistory;
    },

    4(s, carry) {
      carry.local = carry.local || {};

      // --- moves to bcLocal (render-path writes must not touch bcSettings) ---
      if (s.todo && s.todo.local && Object.keys(s.todo.local).length) carry.local.todo = s.todo.local;
      if (s.todo) delete s.todo.local;
      if (s.notifications && Array.isArray(s.notifications.history) && s.notifications.history.length) {
        carry.local.notifHistory = s.notifications.history;
      }
      if (s.notifications) delete s.notifications.history;

      // --- rename: the flag always gated the whole panel, it was just mislabelled ---
      // Assign unconditionally. Migrations run AFTER defaults are merged in, so
      // panelEnabled is already sitting at its default here — guarding on
      // "panelEnabled === undefined" would never fire and would silently re-enable
      // the panel for anyone who had turned it off. The version gate already
      // guarantees this runs at most once.
      if (s.grades) {
        if (s.grades.whatIfEnabled !== undefined) s.grades.panelEnabled = s.grades.whatIfEnabled;
        delete s.grades.whatIfEnabled;
        delete s.grades.customScale;
        delete s.grades.showImpactSim;
      }

      // --- removals: settings that were wired to UI but had no implementation ---
      if (s.dashboard) {
        delete s.dashboard.groupBy;
        delete s.dashboard.customGroups;
        delete s.dashboard.hoverPreview;
        if (s.dashboard.widgets) {
          delete s.dashboard.widgets.streak;       // duplicated the planner streak chip
          delete s.dashboard.widgets.weekly;       // duplicated todo.ring
          delete s.dashboard.widgets.announcements; // duplicated announcements.aggregator
          delete s.dashboard.widgets.calendar;     // duplicated calendar.miniOnDashboard
        }
      }
      if (s.theming) { delete s.theming.perCourseAccent; delete s.theming.perPage; }
      if (s.navigation) delete s.navigation.recentPages;
      if (s.cosmetics) delete s.cosmetics.cssTemplates;
      if (s.notifications) delete s.notifications.perCourse;
      if (s.files) { delete s.files.recent; delete s.files.library; }
      if (s.announcements) { delete s.announcements.unreadBadge; delete s.announcements.digestDay; }
      if (s.calendar) { delete s.calendar.events; delete s.calendar.timeBlock; }
      if (s.productivity) { delete s.productivity.highlights; delete s.productivity.studyLog; }
      if (s.shortcuts) delete s.shortcuts.vimMode;

      // Sanitize a stored value whose options no longer exist.
      if (s.todo && ["list", "kanban", "timeblock"].indexOf(s.todo.view) === -1) s.todo.view = "list";
    },

    5(s) {
      // The old quick-task / quick-note defaults were browser-reserved combos that
      // could never fire. Move only users still on them; a custom binding is theirs.
      const b = s.shortcuts && s.shortcuts.bindings;
      if (!b) return;
      if (b.quickTask === "Mod+Shift+T") b.quickTask = "Alt+Shift+T";
      if (b.quickNote === "Mod+Shift+N") b.quickNote = "Alt+Shift+N";
    },
  };

  BC.migrate = function (s, carry) {
    carry = carry || {};
    let v = s.version >= 2 ? s.version : 2;
    while (v < BC.SETTINGS_VERSION) {
      v += 1;
      const fn = BC.MIGRATIONS[v];
      if (fn) fn(s, carry);
    }
    s.version = BC.SETTINGS_VERSION;
    return s;
  };
})();
