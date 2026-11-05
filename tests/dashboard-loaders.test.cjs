const assert = require("node:assert/strict");
const test = require("node:test");
const { load, domContext, settle } = require("./audit-helpers.cjs");

test("dashboard loaders dedupe, expire at cache TTL, back off failures and invalidate planner data", async () => {
  const { dom, context } = domContext('<div class="ic-DashboardCard"></div>');
  try {
    load(context, "src/shared/defaults.js", "src/shared/themes.js", "src/shared/theme-library.js", "src/shared/theme-scenes.js", "src/content/core/util.js", "src/content/core/datetime.js", "src/content/core/lifecycle.js");
    const BC = context.BC;
    let now = 100000, scores = 0, planner = 0, fail = true;
    context.Date.now = () => now;
    BC.injector = { setStyle() {}, removeNode() {} };
    BC.api = { TTL: { courses: 60000, planner: 30000 }, coursesWithScores: async () => { scores++; if (fail) throw Error("Offline"); return []; }, plannerItems: async () => { planner++; return []; } };
    load(context, "src/content/features/dashboard.js");
    const settings = BC.cloneDefaults();
    Object.assign(settings.dashboard, { autoHideConcluded: false, courseSearch: false, widgets: {}, showInlineGrade: true, showProgressBar: true });
    const apply = () => BC.features.dashboard.apply(settings, { page: "dashboard" });
    apply(); apply(); await settle();
    assert.equal(scores, 1); assert.equal(planner, 1);
    now += 999; apply(); await settle(); assert.equal(scores, 1);
    now++; apply(); await settle(); assert.equal(scores, 2);
    now += 1999; apply(); await settle(); assert.equal(scores, 2);
    fail = false; now++; apply(); await settle(); assert.equal(scores, 3);
    now = 129999; apply(); await settle(); assert.equal(planner, 1);
    now++; apply(); await settle(); assert.equal(planner, 2);
    BC.dashboard.invalidatePlanner(); apply(); await settle(); assert.equal(planner, 3);
    now = 162999; apply(); await settle(); assert.equal(scores, 3);
    now++; apply(); await settle(); assert.equal(scores, 4);
  } finally { dom.window.close(); }
});

test("all successful planner writes invalidate dashboard and cache after mutation completes", async () => {
  const { dom, context } = domContext();
  try {
    load(context, "src/content/core/api.js");
    const BC = context.BC, calls = [];
    BC.api.mutate = async () => { calls.push("write"); return "ok"; };
    BC.cache = { invalidate: () => calls.push("cache") };
    BC.dashboard = { invalidatePlanner: () => calls.push("dashboard") };
    for (const write of [() => BC.api.setPlannerComplete("assignment", 1, true), () => BC.api.createPlannerNote({ title: "Test" }), () => BC.api.updatePlannerNote(1, { title: "Changed" }), () => BC.api.deletePlannerNote(1)]) {
      calls.length = 0; assert.equal(await write(), "ok"); assert.deepEqual(calls, ["write", "cache", "dashboard"]);
    }
    BC.api.mutate = async () => { throw Error("Rejected"); }; calls.length = 0;
    await assert.rejects(BC.api.deletePlannerNote(1), /Rejected/); assert.deepEqual(calls, []);
  } finally { dom.window.close(); }
});

test("invalidating an in-flight planner read prevents it from repopulating stale cache", async () => {
  const { dom, context } = domContext();
  try {
    load(context, "src/content/core/cache.js");
    const cache = context.BC.cache;
    let finish;
    const old = cache.wrap("planner", 30000, () => new Promise((resolve) => { finish = resolve; }));
    await settle(); cache.invalidate("planner");
    assert.equal(await cache.wrap("planner", 30000, async () => "new"), "new");
    finish("old"); await old;
    assert.equal(cache.peek("planner"), "new");
  } finally { dom.window.close(); }
});

test("card due counts and progress leave out lectures and announcements", async () => {
  const card = '<div class="ic-DashboardCard"><a class="ic-DashboardCard__link" href="/courses/5"></a><div class="ic-DashboardCard__header"></div></div>';
  const { dom, context } = domContext('<div id="DashboardCard_Container">' + card + "</div>");
  try {
    load(context, "src/shared/defaults.js", "src/shared/themes.js", "src/shared/theme-library.js", "src/shared/theme-scenes.js",
      "src/content/core/util.js", "src/content/core/datetime.js", "src/content/core/lifecycle.js", "src/content/core/injector.js");
    const BC = context.BC, H = 3600000, now = Date.now(), at = (ms) => new Date(now + ms).toISOString();
    BC.diag = { push() {} };
    BC.requestApply = () => {};
    const items = [
      { course_id: "5", plannable_type: "assignment", plannable_date: at(-48 * H), submissions: { submitted: true } },
      { course_id: "5", plannable_type: "announcement", plannable_date: at(-24 * H) },
      { course_id: "5", plannable_type: "calendar_event", plannable_date: at(-30 * H) },
      { course_id: "5", plannable_type: "calendar_event", plannable_date: at(3 * H) },
    ];
    BC.api = { TTL: { courses: 60000, planner: 30000 }, coursesWithScores: async () => [], plannerItems: async () => items,
      plannerItemDone: (it) => !!(it.submissions && it.submissions.submitted) };
    load(context, "src/content/features/dashboard.js");
    const settings = BC.cloneDefaults();
    Object.assign(settings.dashboard, { autoHideConcluded: false, courseSearch: false, widgets: {}, showProgressBar: true, showBadges: true });
    const apply = () => BC.features.dashboard.apply(settings, { page: "dashboard" });
    apply(); await settle(); await settle(); apply();
    const doc = dom.window.document;
    assert.equal(doc.querySelector(".bc-badge"), null);
    assert.equal(doc.querySelector(".bc-progress").getAttribute("aria-valuenow"), "100");
  } finally { dom.window.close(); }
});

test("modules too big for Canvas to inline fetch their items separately", async () => {
  const { dom, context } = domContext();
  try {
    load(context, "src/content/core/api.js");
    const BC = context.BC, paths = [];
    BC.api.getList = async (path) => {
      paths.push(path);
      if (path.includes("/items")) return [{ id: 9, completion_requirement: { completed: true } }];
      return [{ id: 1, items: [] }, { id: 2, items_count: 150 }];
    };
    const mods = await BC.api.courseModules(7);
    assert.equal(mods[1].items.length, 1);
    assert.deepEqual(paths.slice(1), ["/api/v1/courses/7/modules/2/items?per_page=100"]);
  } finally { dom.window.close(); }
});



test("changing a planner override keeps Canvas's dismissed flag", async () => {
  const { dom, context } = domContext();
  try {
    load(context, "src/content/core/api.js");
    const BC = context.BC, bodies = [];
    BC.api.mutate = async (method, path, body) => { bodies.push([method, path, body]); return { id: 5 }; };
    await BC.api.setPlannerComplete("assignment", 1, true, 5, true);
    await BC.api.setPlannerComplete("assignment", 1, false, 5, false);
    assert.deepEqual(JSON.parse(JSON.stringify(bodies)), [
      ["PUT", "/api/v1/planner/overrides/5", { marked_complete: true, dismissed: true }],
      ["PUT", "/api/v1/planner/overrides/5", { marked_complete: false, dismissed: false }],
    ]);
  } finally { dom.window.close(); }
});


test("course files come newest first, so the page limit keeps recent uploads", async () => {
  const { dom, context } = domContext();
  try {
    load(context, "src/content/core/api.js");
    const urls = [];
    context.BC.api.getList = async (url) => { urls.push(url); return []; };
    await context.BC.api.courseFiles(9, 3);
    assert.match(urls[0], /^\/api\/v1\/courses\/9\/files\?sort=updated_at&order=desc&/);
  } finally { dom.window.close(); }
});


test("dashboard cards take the student's course colours, which Canvas leaves off the cards", async () => {
  const { dom, context } = domContext();
  try {
    load(context, "src/content/core/api.js");
    const api = context.BC.api;
    let colors = async () => ({ custom_colors: { course_9: "#3b7ea1", user_1: "#000000" } });
    api.getJSON = (url) => url.endsWith("/colors") ? colors() : Promise.resolve([{ id: "9", color: null }, { id: "10", color: null }, { id: "11", color: "#ff8800" }]);
    assert.deepEqual(JSON.parse(JSON.stringify(await api.dashboardCards())), [{ id: "9", color: "#3b7ea1" }, { id: "10", color: null }, { id: "11", color: "#ff8800" }]);
    colors = async () => { throw Error("Canvas API 500"); };
    assert.equal((await api.dashboardCards()).length, 3);
  } finally { dom.window.close(); }
});
