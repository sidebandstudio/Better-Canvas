const assert = require("node:assert/strict");
const test = require("node:test");
const { load, domContext, settle } = require("./audit-helpers.cjs");
const payload = '"><img src=x onerror=alert(1)>';

test("grade imports reject HTML, nonfinite values and out-of-range goals and rubric points", () => {
  const { dom, context } = domContext();
  try {
    load(context, "src/shared/defaults.js");
    const settings = context.BC.mergeDefaults({ grades: { goals: { bad: { target: payload }, tooHigh: { target: 151 }, good: { target: "0" } } } });
    assert.equal(settings.grades.goals.bad, undefined);
    assert.equal(settings.grades.goals.tooHigh, undefined);
    assert.equal(settings.grades.goals.good.target, 0);
    const data = context.BC.cleanLocalData({ rubricDrafts: { 1: { bad: payload, negative: -1, infinite: "Infinity", good: "5" } } });
    assert.equal(Object.keys(data.rubricDrafts[1]).join(), "good");
    assert.equal(data.rubricDrafts[1].good, 5);
  } finally { dom.window.close(); }
});

test("grade and rubric renderers validate stored values, avoid injected elements and name inputs", async () => {
  const { dom, context } = domContext('<div id="main"><div id="grades_summary"></div></div><div id="right-side"></div>');
  try {
    load(context, "src/shared/defaults.js", "src/content/core/util.js", "src/content/core/datetime.js", "src/content/core/ui.js", "src/content/core/lifecycle.js");
    const BC = context.BC, nodes = new Map();
    BC.injector = { setStyle() {}, removeNode() {}, ensureNode(id, host, factory) { if (!nodes.has(id)) nodes.set(id, factory()); return nodes.get(id); } };
    BC.registry = { register(feature) { BC.feature = feature; } };
    BC.api = { assignmentGroups: async () => [{ rules: { drop_lowest: 1 }, assignments: [{ id: 1, points_possible: 10, submission: { score: 0 } }, { id: 2, points_possible: 10, submission: { score: 10 } }] }], assignment: async () => ({ id: 2, points_possible: 10, rubric: [{ id: "c", points: 10, description: "Criterion" }] }) };
    BC.storage = { local: { rubricDrafts: { 2: { c: payload } } }, updateLocal: async () => {}, update: async () => {} };
    load(context, "src/content/features/grades.js");
    const settings = BC.cloneDefaults(); settings.grades.autoRefresh = false; settings.grades.goals = { 7: { target: payload } };
    BC.feature.apply(settings, { page: "grades", courseId: "7", path: "/courses/7/grades" });
    await settle();
    const goal = dom.window.document.querySelector("[data-goal]");
    assert.ok(goal);
    assert.equal(goal.value, "");
    for (const field of ["data-goal", "data-target", "data-weight"]) assert.ok(dom.window.document.querySelector("[" + field + "]").getAttribute("aria-label"));
    assert.equal(dom.window.document.querySelector(".bc-gt-total").textContent, "100.00%");
    const target = dom.window.document.querySelector("[data-target]"), weight = dom.window.document.querySelector("[data-weight]");
    target.value = "90"; weight.value = "20"; target.dispatchEvent(new dom.window.Event("input"));
    assert.equal(dom.window.document.querySelector("[data-final-needed]").textContent, " = 50.0%");
    BC.feature.apply(settings, { page: "assignment", courseId: "7", path: "/courses/7/assignments/2" });
    await settle();
    assert.equal(dom.window.document.querySelector('input[type="range"]').value, "10");
    const slider = dom.window.document.querySelector('input[type="range"]');
    let computations = 0; const compute = BC.grades.computeTotal;
    BC.grades.computeTotal = (...args) => { computations++; return compute(...args); };
    for (let i = 0; i < 25; i++) {
      slider.value = String(i % 10); slider.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    }
    slider.value = "5";
    assert.equal(computations, 0, "slider bursts wait for one animation frame");
    await new Promise((resolve) => dom.window.requestAnimationFrame(resolve));
    assert.equal(computations, 1, "only the projected total recomputes once per frame");
    assert.match(dom.window.document.querySelector("[data-impact]").textContent, /50.00%.*100.00%/);
    assert.equal(dom.window.document.querySelector("img"), null);
    assert.equal(dom.window.document.querySelector("[onerror]"), null);
  } finally { dom.window.close(); }
});


test("independent rubric editors save only changed criteria against fresh drafts", async () => {
  const { database } = require("./storage-harness.cjs");
  const { root } = require("./audit-helpers.cjs");
  const db = database();
  async function view() {
    const page = domContext('<div id="panel"></div>', { chrome: db.client().chrome });
    load(page.context, "src/shared/defaults.js", "src/content/core/util.js", "src/content/core/storage.js");
    const BC = page.context.BC;
    await BC.storage.load(); BC.registry = { register() {} };
    let flush;
    BC.util.debounce = (fn) => { flush = fn; return () => {}; };
    require("node:vm").runInContext(require("node:fs").readFileSync(require("node:path").join(root, "src/content/features/grades.js"), "utf8")
      .replace("  BC.registry.register({", "  BC.testBuildRubric = buildRubricUI;\n  BC.registry.register({"), page.context);
    const panel = page.dom.window.document.getElementById("panel");
    const rubric = [{ id: "a", points: 10, description: "First" }, { id: "b", points: 10, description: "Second" }];
    BC.testBuildRubric(panel, { id: 1 }, rubric, null, 7);
    return { ...page, BC, panel, async edit(index, value) {
      const input = panel.querySelectorAll("input")[index]; input.value = value;
      input.dispatchEvent(new page.dom.window.Event("input", { bubbles: true }));
      await new Promise((resolve) => page.dom.window.requestAnimationFrame(resolve));
      flush(); await BC.storage.updateLocal(() => {});
    } };
  }
  const a = await view(), b = await view();
  try {
    assert.equal(db.events.length, 0, "mounting a rubric does not write untouched default values");
    await a.edit(0, "4"); await b.edit(1, "7");
    assert.deepEqual(db.data.bcLocal.rubricDrafts[1], { a: 4, b: 7 });
    await a.edit(0, "5");
    assert.deepEqual(db.data.bcLocal.rubricDrafts[1], { a: 5, b: 7 });
    a.BC.util.warn = () => {}; db.fail("quota");
    await a.edit(0, "2");
    assert.deepEqual(db.data.bcLocal.rubricDrafts[1], { a: 5, b: 7 });
    db.fail(null);
    await a.edit(1, "8");
    assert.deepEqual(db.data.bcLocal.rubricDrafts[1], { a: 2, b: 8 }, "a failed criterion remains dirty when another criterion is edited");
  } finally { a.dom.window.close(); b.dom.window.close(); }
});

test("failed grade history writes can retry on the next score observation", async () => {
  const db = require("./storage-harness.cjs").database(), tab = db.tab();
  await tab.storage.load();
  load(tab.context, "src/content/core/datetime.js");
  const BC = tab.context.BC; BC.registry = { register() {} }; BC.util.warn = () => {};
  load(tab.context, "src/content/features/grades.js");
  db.fail("quota"); await BC.grades.recordScore("7", 90);
  assert.equal(db.data.bcLocal.gradeHistory, undefined);
  db.fail(null); await BC.grades.recordScore("7", 90);
  assert.equal(db.data.bcLocal.gradeHistory[7][0].score, 90);
  await BC.grades.recordScore("7", 91);
  assert.equal(db.data.bcLocal.gradeHistory[7].length, 1);
});

test("the rubric predictor starts from the graded rubric on the assignment's submission", async () => {
  const { database } = require("./storage-harness.cjs");
  const { root } = require("./audit-helpers.cjs");
  const page = domContext('<div id="panel"></div>', { chrome: database().client().chrome });
  try {
    load(page.context, "src/shared/defaults.js", "src/content/core/util.js", "src/content/core/storage.js");
    const BC = page.context.BC;
    await BC.storage.load(); BC.registry = { register() {} };
    require("node:vm").runInContext(require("node:fs").readFileSync(require("node:path").join(root, "src/content/features/grades.js"), "utf8")
      .replace("  BC.registry.register({", "  BC.testBuildRubric = buildRubricUI;\n  BC.registry.register({"), page.context);
    const panel = page.dom.window.document.getElementById("panel");
    const rubric = [{ id: "a", points: 10, description: "Thesis" }, { id: "b", points: 10, description: "Evidence" }];
    BC.testBuildRubric(panel, { id: 2, submission: { rubric_assessment: { a: { points: 6 }, b: { points: 5 } } } }, rubric, null, 7);
    assert.deepEqual([...panel.querySelectorAll("input")].map((i) => i.value), ["6", "5"]);
  } finally { page.dom.window.close(); }
});
