const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const copy = (value) => JSON.parse(JSON.stringify(value));

function load(context, ...files) {
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}
function settingsStore() {
  const context = vm.createContext({ console, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, structuredClone, navigator: { platform: "Win32" } });
  load(context, "src/shared/defaults.js", "src/content/core/util.js");
  context.BC.util.throttle = (fn) => fn;
  load(context, "src/shared/settings/state.js");
  return { BC: context.BC, store: context.BC.SettingsState.create({ getState: context.BC.cloneDefaults, save: async () => {} }) };
}

test("reset restores options but keeps what the user made", () => {
  const { store } = settingsStore();
  store.set((s) => {
    s.theming.darkMode = "on";
    s.dashboard.layout = "list";
    s.todo.recurring.push({ id: "r1", title: "Gym", rule: { freq: "daily" } });
    s.todo.tags.push("lab");
    s.grades.goals[7] = { target: 90, notify: true };
    s.grades.creditsByCourse[7] = 4;
    s.customThemes.push({ id: "t1", name: "Mine", settings: {} });
    s.navigation.global.customLinks.push({ id: "l1", label: "Mail", url: "https://mail.example.edu" });
    s.dashboard.courses[7] = { nickname: "Bio", hidden: true, color: "#ff0000", bgImage: "https://example.com/a.jpg" };
    s.onboarding.seen = true;
    s.files.starred = ["101"];
  });
  store.reset();
  const s = copy(store.get());
  assert.equal(s.theming.darkMode, "off");
  assert.equal(s.dashboard.layout, "grid");
  assert.equal(s.todo.recurring[0].title, "Gym");
  assert.deepEqual(s.todo.tags, ["lab"]);
  assert.equal(s.grades.goals[7].target, 90);
  assert.equal(s.grades.creditsByCourse[7], 4);
  assert.equal(s.customThemes[0].name, "Mine");
  assert.equal(s.navigation.global.customLinks[0].label, "Mail");
  assert.deepEqual(s.dashboard.courses[7], { nickname: "Bio", hidden: true });
  assert.equal(s.onboarding.seen, true);
  assert.deepEqual(s.files.starred, ["101"]);
  assert.equal(store.undo(), true);
  assert.equal(store.get().dashboard.courses[7].color, "#ff0000");
});

test("settings import recognizes backups and turns away theme files and old locker exports", () => {
  const context = vm.createContext({ console, setTimeout, clearTimeout, structuredClone, navigator: { platform: "Win32" } });
  load(context, "src/shared/defaults.js", "src/content/core/util.js", "src/shared/settings/index.js");
  const kind = (j) => context.BC.SettingsUI.backupKind(j);
  assert.equal(kind({ kind: "better-canvas-backup", version: 5, settings: { theming: {} }, local: null }), "backup");
  assert.equal(kind({ settings: { theming: {} }, local: { notes: {} } }), "backup");
  assert.equal(kind({ version: 3, theming: { darkMode: "on" }, dashboard: {} }), "settings");
  assert.equal(kind({ format: "better-canvas-locker", version: 1, items: [] }), null);
  assert.equal(kind({ id: "x", name: "Mine", settings: { theming: {}, cosmetics: {} } }), "theme");
  assert.equal(kind({ hello: "world" }), null);
  assert.equal(kind([]), null);
});

test("shortcut recorder lets Tab move focus, clears on Backspace and ignores bare Enter", () => {
  const { domContext, load: loadDom } = require("./audit-helpers.cjs");
  const { dom, context } = domContext('<div id="root"></div>');
  try {
    loadDom(context, "src/shared/defaults.js", "src/content/core/util.js", "src/content/core/icons.js", "src/content/core/ui.js", "src/content/core/shortcuts.js", "src/shared/settings/components.js");
    let value = "Mod+K";
    const writes = [];
    const btn = context.BC.SettingsComponents.keybind({ get: () => value, set: (v) => { writes.push(v); value = v; } });
    dom.window.document.getElementById("root").append(btn);
    const press = (init) => {
      const e = new dom.window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
      btn.dispatchEvent(e); return e;
    };
    btn.click();
    const tab = press({ key: "Tab", code: "Tab" });
    assert.equal(tab.defaultPrevented, false);
    assert.deepEqual(writes, []);
    assert.equal(btn.classList.contains("bcs-key--recording"), false);
    btn.click();
    assert.equal(press({ key: "Enter", code: "Enter" }).defaultPrevented, true);
    assert.deepEqual(writes, []);
    press({ key: "Backspace", code: "Backspace" });
    assert.deepEqual(writes, [""]);
    btn.click();
    press({ key: "j", code: "KeyJ", ctrlKey: true });
    assert.deepEqual(writes, ["", "Mod+J"]);
  } finally { dom.window.close(); }
});

test("typing in a settings field is one undo step but each switch click is its own", () => {
  const { store } = settingsStore();
  for (const css of ["a", "a{", "a{c", "a{co", "a{color:red}"]) store.set((s) => { s.cosmetics.customCss = css; });
  store.set((s) => { s.dashboard.hoverLift = false; });
  store.set((s) => { s.dashboard.hoverLift = true; });
  assert.equal(store.undo(), true);
  assert.equal(store.get().dashboard.hoverLift, false);
  assert.equal(store.undo(), true);
  assert.equal(store.get().dashboard.hoverLift, true);
  assert.equal(store.get().cosmetics.customCss, "a{color:red}");
  assert.equal(store.undo(), true);
  assert.equal(store.get().cosmetics.customCss, "");
  assert.equal(store.canUndo(), false);
});

test("pruning keeps every page's sticky notes, drops empty lists and expires week-old drafts", async () => {
  const { database } = require("./storage-harness.cjs");
  const notes = {};
  for (let i = 0; i < 150; i++) notes["https://school.instructure.com/p" + i] = [{ id: "n" + i, text: "note " + i }];
  notes["https://school.instructure.com/empty"] = [];
  const old = Date.now() - 8 * 864e5;
  const db = database({ bcLocal: { notes, drafts: { fresh: "keep", old: "drop", legacy: "keep for now" }, draftSavedAt: { fresh: Date.now(), old } } });
  const t = db.tab();
  await t.storage.loadLocal();
  await t.storage.prune();
  const local = db.data.bcLocal;
  assert.equal(Object.keys(local.notes).length, 150);
  assert.equal(local.notes["https://school.instructure.com/p0"][0].text, "note 0");
  assert.equal("https://school.instructure.com/empty" in local.notes, false);
  assert.deepEqual(Object.keys(local.drafts).sort(), ["fresh", "legacy"]);
  assert.equal(typeof local.draftSavedAt.legacy, "number");
  assert.equal("old" in local.draftSavedAt, false);
  // Nothing left to prune, so the next page load skips storage entirely.
  const reads = db.requests.length, events = db.events.length;
  await t.storage.prune();
  assert.equal(db.requests.length, reads);
  assert.equal(db.events.length, events);
});

test("two tabs finishing the same focus phase start the break once", async () => {
  const { database } = require("./storage-harness.cjs");
  const { domContext, load: loadDom, settle } = require("./audit-helpers.cjs");
  const endsAt = Date.now() - 1000;
  const db = database({ bcLocal: { pomodoro: { phase: "work", cycle: 0, startedAt: endsAt - 25 * 60000, endsAt, sessions: [] } } });
  async function view() {
    const client = db.client(), page = domContext("", { chrome: client.chrome });
    loadDom(page.context, "src/shared/defaults.js", "src/content/core/util.js", "src/content/core/datetime.js", "src/content/core/color.js", "src/content/core/icons.js", "src/content/core/ui.js", "src/content/core/lifecycle.js", "src/content/core/storage.js");
    const BC = page.context.BC;
    await BC.storage.load(); await BC.storage.loadLocal();
    const toasts = [];
    BC.toast = { success: (m) => toasts.push(m), info: () => {}, error: () => {} };
    vm.runInContext(fs.readFileSync(path.join(root, "src/content/features/todo.js"), "utf8")
      .replace("  BC.registry.register({", "  BC.testAdvance = advancePomodoro;\n  BC.registry.register({"), page.context);
    return { BC, page, toasts };
  }
  const a = await view(), b = await view();
  try {
    const settings = a.BC.cloneDefaults();
    settings.todo.pomodoro = { ...(settings.todo.pomodoro || {}), sound: false };
    a.BC.testAdvance(settings, endsAt); b.BC.testAdvance(settings, endsAt);
    for (let i = 0; i < 6; i++) await settle();
    await a.BC.storage.updateLocal(() => {}); await b.BC.storage.updateLocal(() => {});
    for (let i = 0; i < 4; i++) await settle();
    const p = db.data.bcLocal.pomodoro;
    assert.equal(p.phase, "short");
    assert.equal(p.cycle, 1);
    assert.equal(p.sessions.length, 1);
    assert.equal(p.sessions[0].min, 25);
    assert.equal(a.toasts.length + b.toasts.length, 1);
  } finally { a.page.dom.window.close(); b.page.dom.window.close(); }
});

async function plannerContext(now) {
  const { database } = require("./storage-harness.cjs");
  const { domContext, load: loadDom } = require("./audit-helpers.cjs");
  const db = database({ bcLocal: {} }), client = db.client(), page = domContext("", { chrome: client.chrome });
  if (now) vm.runInContext(`(() => { const R = Date, fixed = ${new Date(now).getTime()};
    class D extends R { constructor(...a) { if (a.length) super(...a); else super(fixed); } static now() { return fixed; } }
    globalThis.Date = D; })()`, page.context);
  loadDom(page.context, "src/shared/defaults.js", "src/content/core/util.js", "src/content/core/datetime.js", "src/content/core/color.js", "src/content/core/icons.js", "src/content/core/ui.js", "src/content/core/lifecycle.js", "src/content/core/storage.js");
  const BC = page.context.BC;
  await BC.storage.load(); await BC.storage.loadLocal();
  vm.runInContext(fs.readFileSync(path.join(root, "src/content/features/todo.js"), "utf8")
    .replace("  BC.registry.register({", "  BC.test = { expandRecurring, focusTarget, restoreFocus, defaultStart, rangeDays, fetchWindow, buildModel };\n  BC.registry.register({"), page.context);
  return { BC, page };
}

test("a planner window shorter than a week still holds today", async () => {
  const { BC, page } = await plannerContext("2026-11-06T15:00:00"); // a Friday
  try {
    for (const startOn of ["monday", "sunday"]) {
      const t = { ...BC.storage.current.todo, startOn, rangeDays: 3, view: "list" };
      const start = BC.test.defaultStart(t), end = BC.dt.addDays(start, BC.test.rangeDays(t)), today = new Date(2026, 10, 6);
      assert.ok(start <= today && end > today, startOn + " " + BC.dt.ymd(start));
    }
    const week = { ...BC.storage.current.todo, startOn: "monday", rangeDays: 7, view: "list" };
    assert.equal(BC.dt.ymd(BC.test.defaultStart(week)), "2026-11-02");
  } finally { page.dom.window.close(); }
});

test("past lectures and announcements are not overdue work", async () => {
  const { BC, page } = await plannerContext("2026-11-06T10:00:00");
  try {
    BC.api = { TTL: { planner: 30000 }, dashboardCards: async () => [], plannerItemDone: (it) => !!(it.submissions && it.submissions.submitted),
      plannerItems: async () => [
        { plannable_type: "calendar_event", plannable_id: 5, plannable: { id: 5, title: "Lecture" }, plannable_date: new Date(2026, 10, 3, 9).toISOString(), course_id: "9" },
        { plannable_type: "announcement", plannable_id: 6, plannable: { id: 6, title: "Room change" }, plannable_date: new Date(2026, 10, 3, 13).toISOString(), course_id: "9" },
        { plannable_type: "assignment", plannable_id: 7, plannable: { id: 7, title: "HW 6" }, plannable_date: new Date(2026, 10, 3, 23, 59).toISOString(), course_id: "9" },
      ] };
    const s = BC.storage.current;
    await BC.test.fetchWindow(s, true);
    assert.deepEqual(copy(BC.test.buildModel(s).overdue.map((it) => it.plannable.title)), ["HW 6"]);
  } finally { page.dom.window.close(); }
});

test("recurring tasks clamp to short months and start on the day they were made", async () => {
  const { BC, page } = await plannerContext();
  try {
    const s = BC.cloneDefaults();
    s.todo.recurring = [{ id: "m", title: "Rent", rule: "monthly", day: 31 }, { id: "d", title: "Read", rule: "daily", from: "2027-02-03" }];
    const days = (id) => BC.test.expandRecurring(s, new Date(2027, 1, 1), new Date(2027, 2, 1)).filter((x) => x.bcRuleId === id).map((x) => x.bcYmd);
    assert.deepEqual(copy(days("m")), ["2027-02-28"]);
    assert.equal(days("d")[0], "2027-02-03");
    assert.equal(days("d").length, 26);
  } finally { page.dom.window.close(); }
});

test("a planner rebuild puts focus back on the same control or the next row", async () => {
  const { BC, page } = await plannerContext();
  try {
    const doc = page.dom.window.document;
    const build = (keys) => { const box = doc.createElement("div"); box.innerHTML = keys.map((k) => `<li data-key="${k}"><input type="checkbox" aria-label="Done ${k}"><button aria-label="Star ${k}">*</button></li>`).join(""); return box; };
    const container = doc.createElement("div"); doc.body.append(container);
    container.append(build(["a", "b", "c"]));
    container.querySelector('[aria-label="Star b"]').focus();
    let had = BC.test.focusTarget(container, doc.activeElement);
    container.replaceChildren(build(["a", "b", "c"]));
    BC.test.restoreFocus(container, had);
    assert.equal(doc.activeElement.getAttribute("aria-label"), "Star b");
    container.querySelector('[aria-label="Done b"]').focus();
    had = BC.test.focusTarget(container, doc.activeElement);
    container.replaceChildren(build(["a", "c"]));
    BC.test.restoreFocus(container, had);
    assert.equal(doc.activeElement.getAttribute("aria-label"), "Done c");
  } finally { page.dom.window.close(); }
});

test("calendar export keeps event spans, skips announcements and gives each type its own UID", async () => {
  const { domContext, load: loadDom } = require("./audit-helpers.cjs");
  const { dom, context } = domContext("");
  try {
    loadDom(context, "src/shared/defaults.js", "src/content/core/util.js", "src/content/core/datetime.js");
    const BC = context.BC;
    BC.registry = { register() {} }; BC.storage = { local: {} };
    BC.toast = { success() {}, error(m) { throw Error(m); } };
    BC.api = { plannerItems: async () => [
      { plannable_type: "assignment", plannable_id: 5, plannable_date: "2027-03-01T15:00:00Z", plannable: { title: "Essay" }, html_url: "/courses/1/assignments/5" },
      { plannable_type: "discussion_topic", plannable_id: 5, plannable_date: "2027-03-02T15:00:00Z", plannable: { title: "Forum" } },
      { plannable_type: "announcement", plannable_id: 9, plannable_date: "2027-03-01T12:00:00Z", plannable: { title: "News" } },
      { plannable_type: "calendar_event", plannable_id: 7, plannable_date: "2027-03-03T14:00:00Z", plannable: { title: "Lab", start_at: "2027-03-03T14:00:00Z", end_at: "2027-03-03T16:00:00Z" } },
    ] };
    let blob;
    dom.window.URL.createObjectURL = (b) => { blob = b; return "blob:test"; };
    dom.window.URL.revokeObjectURL = () => {};
    dom.window.HTMLAnchorElement.prototype.click = () => {};
    loadDom(context, "src/content/features/calendar.js");
    await BC.calendar.exportIcs();
    const ics = await blob.text();
    assert.equal(ics.includes("News"), false);
    assert.match(ics, /UID:bc-assignment-5@bc-test\.instructure\.com/);
    assert.match(ics, /UID:bc-discussion_topic-5@bc-test\.instructure\.com/);
    assert.match(ics, /DTSTART:20270303T140000Z\r\nDTEND:20270303T160000Z/);
    assert.match(ics, /URL:http:\/\/bc-test\.instructure\.com\/courses\/1\/assignments\/5/);
  } finally { dom.window.close(); }
});

test("syllabus scan ignores words that start like months, fractions, and keeps table rows whole", () => {
  const { domContext, load: loadDom } = require("./audit-helpers.cjs");
  const { dom, context } = domContext('<div id="course_syllabus">' +
    "<p>Decide 3 topics for the project</p><p>Marks 10 points</p><p>The final is worth 1/2 of the grade</p>" +
    "<p>Quiz 1 on Sept. 14<br>Quiz 2 on October 5</p>" +
    "<table><tr><td>Mar 3</td><td>Reading: chapter 4</td></tr></table></div>");
  try {
    loadDom(context, "src/shared/defaults.js", "src/content/core/util.js", "src/content/core/datetime.js");
    context.BC.registry = { register() {} };
    vm.runInContext(fs.readFileSync(path.join(root, "src/content/features/syllabus.js"), "utf8")
      .replace("  BC.registry.register(", "  BC.testCandidates = candidates;\n  BC.registry.register("), context);
    const found = context.BC.testCandidates().map((f) => [f.title, f.date.getMonth(), f.date.getDate()]);
    assert.deepEqual(copy(found), [
      ["Quiz 1 on Sept. 14", 8, 14], ["Quiz 2 on October 5", 9, 5], ["Mar 3 · Reading: chapter 4", 2, 3],
    ]);
  } finally { dom.window.close(); }
});

test("grade tools show Canvas's current score and keep the final-exam inputs through a rebuild", async () => {
  const { domContext, load: loadDom, settle } = require("./audit-helpers.cjs");
  const { dom, context } = domContext('<div id="main"><div id="grades_summary"></div></div>');
  try {
    loadDom(context, "src/shared/defaults.js", "src/content/core/util.js", "src/content/core/datetime.js", "src/content/core/ui.js", "src/content/core/lifecycle.js");
    const BC = context.BC, nodes = new Map();
    BC.injector = { setStyle() {}, removeNode() {}, ensureNode(id, host, factory) { if (!nodes.has(id)) nodes.set(id, factory()); return nodes.get(id); } };
    BC.registry = { register(feature) { BC.feature = feature; } };
    // Our own estimate would be 50%. Canvas says 88.
    BC.api = { assignmentGroups: async () => [{ assignments: [{ id: 1, points_possible: 10, submission: { score: 5 } }] }],
      coursesWithScores: async () => [{ id: 7, enrollments: [{ computed_current_score: 88 }] }] };
    BC.storage = { local: {}, updateLocal: async () => {}, update: async () => {} };
    loadDom(context, "src/content/features/grades.js");
    const settings = BC.cloneDefaults(); settings.grades.autoRefresh = false;
    const ctx = { page: "grades", courseId: "7", path: "/courses/7/grades" };
    BC.feature.apply(settings, ctx); await settle(); await settle();
    const doc = dom.window.document;
    assert.equal(doc.querySelector(".bc-gt-total").textContent, "88.00%");
    doc.querySelector("[data-target]").value = "99"; doc.querySelector("[data-weight]").value = "10";
    doc.querySelector("[data-target]").dispatchEvent(new dom.window.Event("input"));
    assert.match(doc.querySelector("[data-final-needed]").textContent, /more than a perfect score/);
    settings.grades.showTrendChart = !settings.grades.showTrendChart;   // forces a rebuild
    BC.feature.apply(settings, ctx); await settle(); await settle();
    assert.equal(doc.querySelector("[data-target]").value, "99");
    assert.equal(doc.querySelector("[data-weight]").value, "10");
  } finally { dom.window.close(); }
});

test("scene themes store short references, resolve when painted and compact old data URIs", () => {
  const ctx = vm.createContext({ URL, console, setTimeout, clearTimeout, structuredClone, navigator: { platform: "Win32" }, chrome: { runtime: { getURL: (s) => "chrome-extension://x/" + s } } });
  for (const file of ["src/shared/defaults.js", "src/content/core/util.js", "src/shared/themes.js", "src/shared/theme-library.js", "src/shared/theme-scenes.js", "src/shared/theme-artwork.js", "src/shared/theme-media.js"]) load(ctx, file);
  const { BC } = ctx;
  const s = BC.cloneDefaults();
  BC.applyTheme(s, BC.PRESET_THEMES.find((p) => p.id === "scene-woodland"));
  assert.ok(JSON.stringify(s).length < 20000, "settings stay small: " + JSON.stringify(s).length);
  assert.equal(s.dashboard.themeImages[3].url, "bc-scene:woodland#3");
  assert.equal(s.cosmetics.background.image, "bc-scene:woodland#731:wall");
  assert.ok(BC.util.isSafeUrl(s.dashboard.themeImages[3].url));
  assert.match(BC.util.cssUrl(s.dashboard.themeImages[3].url), /^data:image\/svg\+xml,/);
  assert.equal(BC.themeMedia.style("bc-scene:woodland#3").includes("background-size:cover"), true);
  // What 3.3.1 stored: the drawing itself.
  const old = BC.cloneDefaults();
  old.theming.experience = "woodland";
  old.dashboard.themeImages = [BC.sceneArtData("woodland", 3), { url: "https://example.com/a.jpg", title: "Photo · composition 2" }];
  old.cosmetics.background = { mode: "image", image: BC.sceneArtData("woodland", 731, true).url };
  const merged = BC.mergeDefaults(JSON.parse(JSON.stringify(old)));
  assert.equal(merged.dashboard.themeImages[0].url, "bc-scene:woodland#3");
  assert.equal(merged.dashboard.themeImages[1].url, "https://example.com/a.jpg");
  assert.equal(merged.cosmetics.background.image, "bc-scene:woodland#731:wall");
  assert.equal(BC.themeMedia.parse("bc-scene:nowhere#1"), null);
});

test("number fields ignore out-of-range typing and clamp on change; lists reorder with arrow keys", () => {
  const { domContext, load: loadDom } = require("./audit-helpers.cjs");
  const { dom, context } = domContext('<div id="root"></div>');
  try {
    loadDom(context, "src/shared/defaults.js", "src/content/core/util.js", "src/content/core/icons.js", "src/content/core/ui.js", "src/shared/settings/components.js");
    const C = context.BC.SettingsComponents, doc = dom.window.document, ev = (n, t) => n.dispatchEvent(new dom.window.Event(t, { bubbles: true }));
    let width = 200;
    const num = C.number({ get: () => width, set: (v) => { width = v; }, min: 150, max: 400 });
    doc.getElementById("root").append(num);
    const inp = num.querySelector("input");
    for (const v of ["2", "25", "250"]) { inp.value = v; ev(inp, "input"); }
    assert.equal(width, 250);
    inp.value = "4000"; ev(inp, "input");
    assert.equal(width, 250);
    ev(inp, "change");
    assert.equal(width, 400);
    let order = null;
    const list = C.sortable({ items: [{ id: "a" }, { id: "b" }, { id: "c" }], render: (it) => doc.createTextNode(it.id), onChange: (ids) => { order = [...ids]; } });
    doc.getElementById("root").append(list);
    const grip = list.querySelectorAll(".bcs-sortable__grip")[2];
    grip.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    assert.deepEqual(order, ["a", "c", "b"]);
    assert.equal(doc.activeElement, grip);
    // A finger on the grip drags the row; rows are 30px tall.
    for (const li of list.children) li.getBoundingClientRect = () => ({ top: [...list.children].indexOf(li) * 30, height: 30 });
    const point = (node, type, y, pointerType = "touch") => node.dispatchEvent(Object.assign(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientY: y }), { pointerType, pointerId: 1 }));
    const first = list.querySelector(".bcs-sortable__grip");
    point(first, "pointerdown", 10, "mouse"); point(first, "pointermove", 80, "mouse"); point(first, "pointerup", 80, "mouse");
    assert.deepEqual(order, ["a", "c", "b"], "a mouse still uses HTML drag and drop");
    point(first, "pointerdown", 10); point(first, "pointermove", 50);
    assert.deepEqual([...list.children].map((li) => li.dataset.id), ["c", "a", "b"]);
    assert.deepEqual(order, ["a", "c", "b"], "saved once, when the finger lifts");
    point(first, "pointermove", 80); point(first, "pointerup", 80);
    assert.deepEqual(order, ["c", "b", "a"]);
    point(first, "pointermove", 0);
    assert.deepEqual([...list.children].map((li) => li.dataset.id), ["c", "b", "a"], "moves stop after the finger lifts");
  } finally { dom.window.close(); }
});

test("study time counts active focused seconds and the background adds them", async () => {
  const { database } = require("./storage-harness.cjs");
  const { domContext, load: loadDom, settle } = require("./audit-helpers.cjs");
  const db = database({ bcLocal: { studyTime: {} } });
  const client = db.client();
  const sent = [];
  const send = client.chrome.runtime.sendMessage;
  client.chrome.runtime.sendMessage = (msg, cb) => { if (msg.type === "bc:studyTime") sent.push(msg); return send(msg, cb || (() => {})); };
  const { dom, context } = domContext("", { chrome: client.chrome });
  try {
    let now = 1_800_000_000_000;
    dom.window.Date.now = () => now;
    dom.window.document.hasFocus = () => true;
    loadDom(context, "src/shared/defaults.js", "src/content/core/util.js", "src/content/core/datetime.js", "src/content/core/lifecycle.js");
    const BC = context.BC;
    const s = BC.cloneDefaults();
    BC.storage = { current: s };
    BC.detect = { context: () => ({ courseId: "42" }) };
    BC.registry = { register(f) { BC.feature = f; } };
    loadDom(context, "src/content/features/insights.js");
    BC.feature.apply(s);
    // Fifteen seconds of use, then the window loses focus: those seconds count.
    now += 15000;
    dom.window.document.hasFocus = () => false;
    dom.window.dispatchEvent(new dom.window.Event("blur"));
    // Ten unfocused minutes later the page closes. Nothing more is counted.
    now += 10 * 60000;
    dom.window.dispatchEvent(new dom.window.Event("pagehide"));
    await settle(); await settle(); await settle();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].key, "42");
    assert.equal(sent[0].minutes, 0.25);
    const ymd = sent[0].ymd;
    assert.equal(db.data.bcLocal.studyTime[ymd]["42"], 0.25);
    // Switched off, focused use isn't counted at all.
    s.insights.enabled = false;
    BC.feature.apply(s);
    dom.window.document.hasFocus = () => true;
    dom.window.dispatchEvent(new dom.window.Event("focus"));
    now += 20000;
    dom.window.dispatchEvent(new dom.window.Event("pagehide"));
    await settle();
    assert.equal(sent.length, 1);
  } finally { dom.window.close(); }
});

test("quiz drafts belong to one attempt and submitting clears every page of the quiz", async () => {
  const { database } = require("./storage-harness.cjs");
  const { domContext, load: loadDom, settle } = require("./audit-helpers.cjs");
  const path = "/courses/1/quizzes/2/take";
  const old = { savedAt: Date.now(), answers: { answer: "attempt one" } };
  const db = database({ bcLocal: { quizDrafts: { [path + "#attempt-1"]: old, "/courses/1/quizzes/2/take/questions/5#attempt-1": old, "/courses/1/quizzes/9/take": old } } });
  const client = db.client();
  const page = domContext('<div id="content"><form id="submit_quiz_form"><input type="hidden" name="attempt" value="2"><div id="questions"><input name="answer" type="text"></div></form></div>', { chrome: client.chrome });
  try {
    page.dom.reconfigure({ url: "http://bc-test.instructure.com" + path });
    loadDom(page.context, "src/shared/defaults.js", "src/content/core/util.js", "src/content/core/lifecycle.js", "src/content/core/storage.js");
    const BC = page.context.BC, doc = page.dom.window.document;
    await BC.storage.load(); await BC.storage.loadLocal();
    BC.injector = { setStyle() {}, removeNode(id) { doc.querySelector('[data-bc-node="' + id + '"]')?.remove(); },
      ensureNode(id, _host, factory) { const node = doc.querySelector('[data-bc-node="' + id + '"]') || factory(); node.dataset.bcNode = id; return node; } };
    loadDom(page.context, "src/content/features/quizsaver.js");
    const settings = BC.cloneDefaults(); settings.productivity.quizDraftSaver = true;
    BC.features.quizsaver.apply(settings, { path });
    assert.equal(doc.querySelector(".bc-quiz-banner"), null, "attempt 1's answers aren't offered on attempt 2");
    const form = doc.getElementById("submit_quiz_form");
    const tick = () => new Promise((r) => page.dom.window.setTimeout(r, 0));
    // A cancelled "submit anyway?" prompt keeps every draft.
    const cancel = (e) => e.preventDefault();
    form.addEventListener("submit", cancel);
    form.dispatchEvent(new page.dom.window.Event("submit", { bubbles: true, cancelable: true }));
    await tick(); await BC.storage.updateLocal(() => {}); await settle();
    assert.equal(Object.keys(db.data.bcLocal.quizDrafts).length, 3);
    form.removeEventListener("submit", cancel);
    const sent = [], send = client.chrome.runtime.sendMessage;
    client.chrome.runtime.sendMessage = (msg, cb) => { sent.push(msg.type); return send(msg, cb); };
    form.dispatchEvent(new page.dom.window.Event("submit", { bubbles: true, cancelable: true }));
    await tick(); await settle();
    assert.deepEqual(sent, ["bc:quizSubmitted"], "one message, so a navigation can't split it");
    assert.deepEqual(Object.keys(db.data.bcLocal.quizDrafts), ["/courses/1/quizzes/9/take"]);
    // Typing between the submit and the navigation doesn't write a draft back.
    const input = doc.querySelector('[name="answer"]');
    input.value = "late"; input.dispatchEvent(new page.dom.window.Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 900)); await settle();
    assert.deepEqual(Object.keys(db.data.bcLocal.quizDrafts), ["/courses/1/quizzes/9/take"]);
    await assert.rejects(BC.storage.request({ type: "bc:quizSubmitted", root: "/courses/1/files" }), /Invalid quiz/);
    // Review round 4: a submit that didn't go through must not leave saving off.
    const typed = async (value) => { input.value = value; input.dispatchEvent(new page.dom.window.Event("input", { bubbles: true })); await new Promise((r) => setTimeout(r, 900)); await settle(); };
    page.dom.window.dispatchEvent(Object.assign(new page.dom.window.Event("pageshow"), { persisted: true }));
    await typed("after back");
    assert.equal(db.data.bcLocal.quizDrafts[path + "#attempt-2"].answers.answer, "after back", "a back/forward restore resumes saving");
    const request = BC.storage.request;
    BC.storage.request = () => Promise.reject(Error("Storage writer unavailable"));
    form.dispatchEvent(new page.dom.window.Event("submit", { bubbles: true, cancelable: true }));
    await tick(); await settle();
    BC.storage.request = request;
    await typed("after failure");
    assert.equal(db.data.bcLocal.quizDrafts[path + "#attempt-2"].answers.answer, "after failure", "a failed clear resumes saving");
  } finally { page.dom.window.close(); }
});

test("leaving a Canvas page always asks the worker to check the toolbar count", () => {
  const { domContext, load: loadDom } = require("./audit-helpers.cjs");
  const sent = [];
  const page = domContext("", { chrome: { runtime: { id: "t", sendMessage: (msg, cb) => { sent.push(msg.type); cb && cb(); } } } });
  try {
    loadDom(page.context, "src/shared/defaults.js", "src/content/core/util.js", "src/content/core/lifecycle.js");
    const BC = page.context.BC, never = () => new Promise(() => {});
    Object.assign(BC, { alarms: { every() {}, clear() {} }, storage: { current: BC.cloneDefaults(), local: {}, updateLocal: never },
      api: { plannerItems: never, coursesWithScores: never, courseAnnouncements: never } });
    loadDom(page.context, "src/content/features/notifications.js");
    BC.features.notifications.apply(BC.storage.current);
    sent.length = 0;
    page.dom.window.dispatchEvent(new page.dom.window.Event("pagehide"));
    assert.deepEqual(sent, ["bc:leftCanvas"], "even before this page has shown a count");
  } finally { page.dom.window.close(); }
});

test("the toolbar count clears once no Canvas tab is left", async () => {
  const listeners = {}, badge = [];
  let open = [{ id: 1 }];
  const event = (name) => ({ addListener: (fn) => { listeners[name] = fn; } });
  const context = vm.createContext({ console, structuredClone, queueMicrotask, crypto: require("node:crypto").webcrypto, TextEncoder,
    setTimeout: (fn) => fn(), clearTimeout() {}, chrome: {
      runtime: { id: "test", onInstalled: event("installed"), onStartup: event("startup"), onMessage: event("message") },
      permissions: { getAll: async () => ({ origins: ["https://canvas.school.edu/*"] }) },
      tabs: { onRemoved: event("removed"), query: async (q) => { badge.push(q.url); return open; } },
      action: { setBadgeText: async (v) => badge.push(v.text), setBadgeBackgroundColor() {} },
      contextMenus: { onClicked: event("menu") }, storage: { local: {} },
    } });
  load(context, "src/background/service-worker.js");
  const flush = () => new Promise((r) => setImmediate(r));
  listeners.removed(5); await flush();
  assert.deepEqual(copy(badge), [["*://*.instructure.com/*", "https://canvas.school.edu/*"]], "another Canvas tab keeps the count");
  open = []; badge.length = 0;
  listeners.message({ type: "bc:leftCanvas" }, { id: "test" }, () => {}); await flush();
  assert.equal(badge.at(-1), "");
});

test("the toolbar icon opens settings in a Canvas tab, the options page elsewhere, and offers a school's own address", async () => {
  const listeners = {}, calls = [];
  let answer, granted = [];
  const event = (name) => ({ addListener: (fn) => { listeners[name] = fn; } });
  const context = vm.createContext({ console, structuredClone, queueMicrotask, crypto: require("node:crypto").webcrypto, TextEncoder,
    URL, URLSearchParams, setTimeout, clearTimeout, chrome: {
      runtime: { id: "test", onInstalled: event("installed"), onStartup: event("startup"), onMessage: event("message"),
        getURL: (file) => "chrome-extension://test/" + file, openOptionsPage: () => calls.push("options") },
      permissions: { getAll: async () => ({ origins: granted }), contains: async (q) => granted.includes(q.origins[0]) },
      tabs: { onRemoved: event("removed"), query: async () => [], create: (o) => calls.push(o.url),
        sendMessage: (id, msg, cb) => { calls.push(msg.type + " " + id); cb(answer); } },
      action: { onClicked: event("action"), setBadgeText: async () => {}, setBadgeBackgroundColor() {} },
      contextMenus: { onClicked: event("menu") }, storage: { local: {} },
    } });
  load(context, "src/background/service-worker.js");
  const click = async (tab) => { calls.length = 0; await listeners.action(tab); return [...calls]; };
  answer = { ok: true };
  assert.deepEqual(await click({ id: 1, url: "https://school.instructure.com/" }), ["bc:openSettings 1"]);
  answer = undefined;
  assert.deepEqual(await click({ id: 2, url: "https://www.instructure.com/" }), ["bc:openSettings 2", "options"]);
  assert.deepEqual(await click({ id: 3, url: "chrome://newtab/" }), ["bc:openSettings 3", "options"]);
  assert.deepEqual(await click({ id: 4, url: "https://canvas.school.edu/courses/1" }),
    ["bc:openSettings 4", "chrome-extension://test/src/options/options.html?enable=https%3A%2F%2Fcanvas.school.edu&tab=4"]);
  granted = ["https://canvas.school.edu/*"];
  assert.deepEqual(await click({ id: 5, url: "https://canvas.school.edu/" }), ["bc:openSettings 5", "options"]);
  assert.deepEqual(await click({ id: 6, url: "https://canvas.school.edu:8443/" }), ["bc:openSettings 6", "options"], "a pattern without a port covers every port");
});

test("review round 1: loose version files are refused and undo bursts stop at history boundaries", () => {
  const context = vm.createContext({ console, setTimeout, clearTimeout, structuredClone, navigator: { platform: "Win32" } });
  load(context, "src/shared/defaults.js", "src/content/core/util.js", "src/shared/settings/index.js");
  const kind = (j) => context.BC.SettingsUI.backupKind(j);
  assert.equal(kind({ version: 1, items: [] }), null);
  assert.equal(kind({ kind: "better-canvas-backup", version: 5, settings: "broken" }), null);
  assert.equal(kind({ version: 5, enabled: false }), "settings");
  const { store } = settingsStore();
  store.set((s) => { s.cosmetics.customCss = "a"; });
  store.reset();
  store.undo();
  store.set((s) => { s.cosmetics.customCss = "ab"; });
  store.undo();
  assert.equal(store.get().cosmetics.customCss, "a");
});

test("review round 2B: syllabus dates after 'is', paragraphs in cells, and focus that skips hidden rows", async () => {
  const { domContext, load: loadDom } = require("./audit-helpers.cjs");
  const { dom, context } = domContext('<div id="course_syllabus"><p>The exam is 10/25</p>' +
    "<table><tr><td><p>Oct 25</p></td><td>Lab 1</td></tr><tr><td><p>Oct 25</p></td><td>Lab 2</td></tr></table></div>");
  try {
    loadDom(context, "src/shared/defaults.js", "src/content/core/util.js", "src/content/core/datetime.js");
    context.BC.registry = { register() {} };
    vm.runInContext(fs.readFileSync(path.join(root, "src/content/features/syllabus.js"), "utf8")
      .replace("  BC.registry.register(", "  BC.testCandidates = candidates;\n  BC.registry.register("), context);
    assert.deepEqual(copy(context.BC.testCandidates().map((f) => f.title)), ["The exam is 10/25", "Oct 25 · Lab 1", "Oct 25 · Lab 2"]);
  } finally { dom.window.close(); }

  const { BC, page } = await plannerContext();
  try {
    const doc = page.dom.window.document;
    const row = (k, star) => `<li data-key="${k}"><input type="checkbox" aria-label="Done ${k}"><button aria-label="${star ? "Unstar" : "Star"} ${k}">*</button></li>`;
    const container = doc.createElement("div"); doc.body.append(container);
    container.innerHTML = row("a") + row("b") + row("c");
    container.querySelector('[aria-label="Star b"]').focus();
    let had = BC.test.focusTarget(container, doc.activeElement);
    container.innerHTML = row("a") + row("b", true) + row("c");
    BC.test.restoreFocus(container, had);
    assert.equal(doc.activeElement.getAttribute("aria-label"), "Unstar b");
    container.querySelector('[aria-label="Done b"]').focus();
    had = BC.test.focusTarget(container, doc.activeElement);
    container.innerHTML = row("a") + row("c") + '<details><summary>Done</summary><ul>' + row("b") + "</ul></details>";
    BC.test.restoreFocus(container, had);
    assert.equal(doc.activeElement.getAttribute("aria-label"), "Done c");
  } finally { page.dom.window.close(); }
});

test("dark mode pins dark text on mid-tone backgrounds it leaves light", () => {
  const { domContext, load: loadDom } = require("./audit-helpers.cjs");
  const { dom, context } = domContext('<style>body { color: rgb(230, 230, 235); } a { color: rgb(150, 190, 255); }</style>' +
    '<div id="content"><table><tr><td id="cell" style="background-color: rgb(255, 217, 102)">Due <span id="inner">Friday</span> <a id="link" href="/x">rubric</a></td>' +
    '<td id="photo" style="background-image: url(x.png)"><span id="over">caption</span></td><td id="plain"><span id="plainText">normal</span></td></tr></table></div>');
  try {
    loadDom(context, "src/content/core/darkengine.js");
    dom.window.document.documentElement.classList.add("bc-dark");
    context.BC.darkEngine.start();
    const tag = (id) => dom.window.document.getElementById(id).getAttribute("data-bc-dfg");
    assert.equal(tag("cell"), "k");
    assert.equal(tag("inner"), "k");
    assert.equal(tag("link"), "k");
    assert.equal(tag("over"), null, "text over an image is left alone");
    assert.equal(tag("plainText"), null, "light text on the dark page is fine");
    context.BC.darkEngine.stop();
  } finally { dom.window.close(); }
});

test("review round 3: section headings keep focus, see-through chips stay unpinned, darkening hovers unpin", async () => {
  const { BC, page } = await plannerContext();
  try {
    const doc = page.dom.window.document;
    const container = doc.createElement("div"); doc.body.append(container);
    container.innerHTML = '<details class="pl-snoozed pl-done"><summary>Done · 2</summary></details>';
    container.querySelector("summary").focus();
    const had = BC.test.focusTarget(container, doc.activeElement);
    container.innerHTML = '<details class="pl-snoozed pl-done"><summary>Done · 3</summary></details>';
    BC.test.restoreFocus(container, had);
    assert.equal(doc.activeElement.tagName, "SUMMARY");
  } finally { page.dom.window.close(); }

  const { domContext, load: loadDom } = require("./audit-helpers.cjs");
  const { dom, context } = domContext('<style>body { color: rgb(230, 230, 235); }</style>' +
    '<div id="content"><span id="glass" style="background-color: rgba(159, 197, 232, 0.35)">see-through</span></div>');
  try {
    loadDom(context, "src/content/core/darkengine.js");
    dom.window.document.documentElement.classList.add("bc-dark");
    context.BC.darkEngine.start();
    assert.equal(dom.window.document.getElementById("glass").getAttribute("data-bc-dfg"), null);
    assert.match(context.BC.darkEngine.tagCss(), /\[data-bc-dhovdark\]:hover/);
    context.BC.darkEngine.stop();
  } finally { dom.window.close(); }
});

test("the settings workspace loads on first open, and a failed load says so", async () => {
  const { domContext, load: loadDom, settingsUIFiles, settle } = require("./audit-helpers.cjs");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json")));
  const sw = fs.readFileSync(path.join(root, "src/background/service-worker.js"), "utf8");
  const workerList = [...vm.runInNewContext(/const CONTENT_JS = (\[[^\]]*\]);/.exec(sw)[1])];
  for (const file of ["manifest.json", "manifest.firefox.json"]) assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, file))).content_scripts[0].js, workerList, file);
  const lazy = settingsUIFiles(), options = fs.readFileSync(path.join(root, "src/options/options.html"), "utf8");
  for (const file of lazy) {
    assert.ok(fs.existsSync(path.join(root, file)) && !workerList.includes(file), file);
    assert.ok(options.includes(file.replace("src/", "../")), file + " is on the options page");
  }
  let reply = { ok: false, error: "Cannot access contents of the page" }, sent = 0;
  const page = domContext('<ul id="menu"></ul>', { matchMedia: () => ({ matches: true, addEventListener() {} }), chrome: {
    runtime: { id: "t", getURL: (s) => s, sendMessage(msg, cb) {
      sent++; assert.equal(msg.type, "bc:loadSettingsUI");
      setTimeout(() => { if (reply.ok) loadDom(page.context, ...lazy); cb(reply); });
    } }, storage: { local: { get() {} }, onChanged: { addListener() {} } } } });
  try {
    loadDom(page.context, ...manifest.content_scripts[0].js.filter((f) => f !== "src/content/content.js"));
    const BC = page.context.BC, errors = [], doc = page.dom.window.document;
    BC.toast.error = (m) => errors.push(m);
    assert.equal(BC.SettingsUI, undefined);
    BC.features.settingsPanel.open();
    await new Promise((r) => setTimeout(r, 20)); await settle();
    assert.equal(errors.length, 1); assert.match(errors[0], /couldn't load/);
    assert.equal(BC.features.settingsPanel.isOpen(), false);
    reply = { ok: true };
    BC.features.settingsPanel.open(); BC.features.settingsPanel.open(); BC.features.settingsPanel.toggle();
    await new Promise((r) => setTimeout(r, 20)); await settle();
    assert.equal(sent, 2, "two quick clicks share one load");
    assert.equal(BC.features.settingsPanel.isOpen(), false, "a toggle while loading cancels the open");
    assert.notEqual(doc.body.inert, true, "the page stays usable");
    BC.features.settingsPanel.open();
    assert.equal(BC.features.settingsPanel.isOpen(), true);
    assert.ok(doc.getElementById("bc-drawer").shadowRoot.querySelector(".bcs-app, .bc-app"));
    assert.equal(BC.PRESET_THEMES.length, 34);
    BC.features.settingsPanel.close(); BC.features.settingsPanel.open();
    assert.equal(BC.features.settingsPanel.isOpen(), true, "once loaded, open is immediate");
    assert.equal(sent, 2);
  } finally { page.dom.window.close(); }
});

test("theme rotation loads the photo presets before rotating to one", async () => {
  let feature, applies = 0, loads = 0;
  const local = {};
  const BC = { features: {}, registry: { register: (f) => { feature = f; } }, PRESET_THEMES: [], toast: { info() {} }, diag: { push() {} },
    requestApply: () => { applies++; },
    loadSettingsUI: async () => { loads++; BC.PRESET_THEMES.push({ id: "photos-art", name: "Art", settings: {} }); BC.SettingsUI = {}; },
    applyTheme: (d, theme) => { d.applied = theme.id; },
    storage: { local, update: async (fn) => fn(draft), updateLocal: async (fn) => fn(local) } };
  const settings = { theming: { rotation: { enabled: true, mode: "daily", themeIds: ["photos-art"] } }, customThemes: [] };
  const draft = JSON.parse(JSON.stringify(settings));
  const context = vm.createContext({ console, globalThis: null });
  context.globalThis = context; context.BC = BC;
  load(context, "src/content/features/rotation.js");
  feature.apply(settings);
  await new Promise((r) => setImmediate(r));
  assert.equal(loads, 1); assert.equal(applies, 1); assert.equal(draft.applied, undefined);
  feature.apply(settings);
  await new Promise((r) => setImmediate(r));
  assert.equal(draft.applied, "photos-art"); assert.equal(loads, 1);
  assert.equal(local.lastRotation.themeId, "photos-art");
});

test("found on real Canvas: a failed module fetch waits instead of repeating on every page update", async () => {
  let feature, calls = 0;
  const BC = { features: {}, registry: { register: (f) => { feature = f; } }, diag: { push() {} },
    injector: { setStyle() {}, removeNode() {} }, api: { courseModules: () => { calls++; return Promise.reject(Error("Canvas API 401")); } } };
  const context = vm.createContext({ console, document: { querySelectorAll: () => [], getElementById: () => null } });
  context.globalThis = context; context.BC = BC;
  load(context, "src/content/features/modules.js");
  const settings = { modules: { progressBars: true } }, ctx = { page: "modules", courseId: "142" };
  for (let i = 0; i < 5; i++) { feature.apply(settings, ctx); await new Promise((r) => setImmediate(r)); }
  assert.equal(calls, 1, "page updates after a failure don't refetch");
});

test("found on real Canvas: text on accent fills uses the accent's contrast colour", () => {
  const theming = fs.readFileSync(path.join(root, "src/content/features/theming.js"), "utf8");
  assert.match(theming, /\.Button--primary \{[^}]*color: var\(--bc-accent-contrast/);
  assert.match(theming, /--ic-brand-button--primary-text: var\(--bc-accent-contrast/);
  const dom = require("./audit-helpers.cjs").domContext("");
  try {
    require("./audit-helpers.cjs").load(dom.context, "src/shared/defaults.js", "src/shared/themes.js", "src/content/core/datetime.js", "src/content/core/color.js", "src/shared/tokens.js", "src/content/core/darkengine.js");
    assert.match(dom.context.BC.darkEngine.baseCss(), /#skip_navigation_link \{ background-color: var\(--bc-accent\) !important; color: var\(--bc-accent-contrast/);
  } finally { dom.dom.window.close(); }
});

test("scene compositions differ from card to card and old saved drawings still compact", () => {
  const ctx = vm.createContext({ URL, console, setTimeout, clearTimeout, structuredClone, navigator: { platform: "Win32" }, chrome: { runtime: { getURL: (s) => "chrome-extension://x/" + s } } });
  for (const file of ["src/shared/defaults.js", "src/content/core/util.js", "src/shared/themes.js", "src/shared/theme-library.js", "src/shared/theme-scenes.js", "src/shared/theme-artwork.js", "src/shared/theme-media.js"]) load(ctx, file);
  const { BC } = ctx;
  const layouts = Array.from({ length: 48 }, (_, i) => BC.sceneLayout(i));
  assert.equal(new Set(layouts.map((l) => [l.hue, l.subject, l.horizon, l.mirror].join())).size, 48);
  // Courses pick seeds by a hash, so any two cards may sit side by side.
  assert.equal(new Set(layouts.map((l) => l.subject + "/" + l.hue)).size, 48, "no two seeds share subject and hue");
  // Cards shift the theme's hue; the wallpaper keeps its exact colours.
  assert.equal(decodeURIComponent(BC.sceneArtData("nebula", 1).url).includes("#653b96"), false);
  assert.equal(decodeURIComponent(BC.sceneArtData("nebula", 731, true).url).includes("#653b96"), true);

  // 3.3.1 saved drawings from the older generator, so they're matched by markup and title.
  const old = (h, body) => "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="' + h + '" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice">' + body + "</svg>");
  const s = BC.cloneDefaults();
  s.theming.experience = "nebula";
  s.dashboard.themeImages = [
    { url: old(850, "<circle/>"), title: "Cosmic Bloom · composition 5", creator: "Better Canvas", license: "Original artwork" },
    { url: old(850, "<rect/>"), title: "Forest Retreat · composition 2", creator: "Better Canvas", license: "Original artwork" },
    { url: old(850, "<rect/>"), title: "Cosmic Bloom · composition 3", creator: "Someone else" },
    { url: "data:image/svg+xml,%3Csvg%3E%3C%2Fsvg%3E", title: "Cosmic Bloom · composition 4", creator: "Better Canvas" },
  ];
  s.cosmetics.background = { mode: "image", image: old(1000, "<path/>") };
  const merged = BC.mergeDefaults(JSON.parse(JSON.stringify(s)));
  assert.equal(merged.dashboard.themeImages[0].url, "bc-scene:nebula#4");
  assert.equal(merged.dashboard.themeImages[1].url, "bc-scene:woodland#1");
  assert.equal(merged.dashboard.themeImages[2].url, s.dashboard.themeImages[2].url);
  assert.equal(merged.dashboard.themeImages[3].url, s.dashboard.themeImages[3].url);
  assert.equal(merged.cosmetics.background.image, "bc-scene:nebula#731:wall");
});

test("scene themes tint only a transparent school logo, on a layer that keeps the link's focus ring", async () => {
  const { domContext, load: loadDom, settle } = require("./audit-helpers.cjs");
  const { dom, context } = domContext("<body></body>");
  try {
    loadDom(context, "src/shared/defaults.js", "src/content/core/util.js", "src/shared/themes.js", "src/shared/theme-library.js", "src/shared/theme-scenes.js", "src/shared/theme-media.js");
    const BC = context.BC, styles = {}, sampled = [];
    BC.injector = { setStyle(id, css) { styles[id] = css; }, removeNode() {}, ensureNode(id, host, factory) { return factory(); } };
    BC.registry = { register(f) { BC.feature = f; } };
    BC.testLogo = (url) => { sampled.push(url); return Promise.resolve(!url.endsWith(".jpg")); };
    vm.runInContext(fs.readFileSync(path.join(root, "src/content/features/cosmetics.js"), "utf8")
      .replace("function hasTransparency(url) {", "function hasTransparency(url) { return BC.testLogo(url); }\n  function realHasTransparency(url) {"), context);
    const doc = dom.window.document, html = doc.documentElement, s = BC.cloneDefaults();
    BC.applyTheme(s, BC.PRESET_THEMES.find((p) => p.id === "scene-nebula"));
    BC.requestApply = () => BC.feature.apply(s);
    const css = () => styles["bc-experience"];

    BC.feature.apply(s);
    assert.match(css(), /--ic-brand-global-nav-logo-bgd: transparent/);
    assert.match(css(), /\[data-bc-logo-tint\] \.ic-app-header__logomark::before \{[^}]*\bmask: var\(--ic-brand-header-image\) center \/ contain no-repeat;/);
    assert.doesNotMatch(css(), /\.ic-app-header__logomark \{[^}]*mask/, "the focusable link itself is never masked");
    assert.match(css(), /@media \(forced-colors: active\) \{[^{]*\.ic-app-header__logomark::before \{ forced-color-adjust: none; background: CanvasText; \}/);
    assert.equal(html.hasAttribute("data-bc-logo-tint"), false, "no image variable, no tint");

    html.style.setProperty("--ic-brand-header-image", "url('https://uploads.test/logo.png')");
    BC.feature.apply(s); await settle(); await settle();
    assert.equal(html.hasAttribute("data-bc-logo-tint"), true);
    BC.feature.apply(s);
    assert.deepEqual(copy(sampled), ["https://uploads.test/logo.png"], "each image is sampled once");

    for (const mode of ["hide", "replace", "text"]) {
      s.theming.logo.mode = mode;
      BC.feature.apply(s);
      assert.equal(html.hasAttribute("data-bc-logo-tint"), false, mode);
    }
    s.theming.logo.mode = "default";
    html.style.setProperty("--ic-brand-header-image", "url(https://uploads.test/logo.jpg)");
    BC.feature.apply(s); await settle(); await settle();
    assert.equal(html.hasAttribute("data-bc-logo-tint"), false, "an opaque logo keeps its own colours");
  } finally { dom.window.close(); }
});
