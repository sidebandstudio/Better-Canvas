const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { root, load, domContext, settle } = require("./audit-helpers.cjs");

const plain = (v) => JSON.parse(JSON.stringify(v));
const DAY = 864e5;
// Wednesday Oct 28, 10:00 local.
const NOW = new Date(2026, 9, 28, 10, 0).getTime();
// Local time `days` from NOW, as the ISO string Canvas gets.
const at = (days, h, m) => new Date(new Date(NOW + days * DAY).setHours(h, m, 0, 0)).toISOString();
const ymd = (t) => { const d = new Date(t); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

// ---- Canvas data -----------------------------------------------------------

// Homework is 16/20 with HW 3 missing; Exam 1 was 60/100 and Exam 2 is in 5 days.
// Weighted 40/60, that's 0.8 * 40 + 0.6 * 60 = 68%.
function cs3500() {
  const due = (days) => new Date(NOW + days * DAY).toISOString();
  const sub = (score, extra) => Object.assign({ score, workflow_state: score == null ? "unsubmitted" : "graded" }, extra || {});
  return {
    course: { id: "1", name: "CS 3500 Object-Oriented Design", course_code: "CS 3500", enrollments: [{ type: "student", computed_current_score: 68 }] },
    groups: [
      { id: "g1", name: "Homework", group_weight: 40, rules: {}, assignments: [
        { id: "11", name: "HW 1", points_possible: 10, due_at: due(-20), html_url: "http://bc-test.instructure.com/courses/1/assignments/11", submission: sub(10) },
        { id: "12", name: "HW 2", points_possible: 10, due_at: due(-10), html_url: "http://bc-test.instructure.com/courses/1/assignments/12", submission: sub(6) },
        { id: "13", name: "HW 3", points_possible: 10, due_at: due(-2), html_url: "http://bc-test.instructure.com/courses/1/assignments/13", submission: sub(null, { missing: true }) },
      ] },
      { id: "g2", name: "Exams", group_weight: 60, rules: {}, assignments: [
        { id: "21", name: "Exam 1", points_possible: 100, due_at: due(-14), html_url: "http://bc-test.instructure.com/courses/1/assignments/21", submission: sub(60) },
        { id: "22", name: "Exam 2", points_possible: 100, due_at: due(5), description: "<p>Covers <b>modules 6-8</b>.</p><script>x()</script>",
          html_url: "http://bc-test.instructure.com/courses/1/assignments/22", submission: sub(null) },
      ] },
    ],
  };
}
function engw() {
  return {
    course: { id: "2", name: "ENGW 1111", course_code: "ENGW", enrollments: [{ type: "student", computed_current_score: 95 }] },
    groups: [{ id: "g3", name: "Essays", group_weight: 0, rules: {}, assignments: [
      { id: "31", name: "Essay 1", points_possible: 100, due_at: new Date(NOW - 5 * DAY).toISOString(), submission: { score: 95, workflow_state: "graded" } },
    ] }],
  };
}

// ---- the dashboard half ----------------------------------------------------

function page({ connected = false, courses = [cs3500(), engw()], plans = {}, respond } = {}) {
  const { dom, context } = domContext('<div id="dash"><div id="DashboardCard_Container"></div></div>');
  const sent = [], notes = [];
  const reply = (msg) => {
    sent.push(msg);
    if (msg.type === "bc:coach:status") return { ok: true, connected, usageUrl: "https://chatgpt.com/settings/usage" };
    if (msg.type === "bc:coach:plans") return { ok: true, plans: Object.fromEntries(msg.courseIds.map((id) => [id, { record: plans[id] || null, autoReadyAt: 0 }])) };
    if (msg.type === "bc:coach:plan") return respond ? respond(msg) : { ok: false, error: "no" };
    if (msg.type === "bc:coach:added") {
      const rec = plans[msg.courseId];
      rec.added[msg.index] = msg.noteId;
      return { ok: true, record: rec };
    }
    return { ok: true };
  };
  context.chrome = { runtime: { lastError: undefined, sendMessage: (msg, cb) => setTimeout(() => cb(plain(reply(plain(msg))))) } };
  context.Date.now = () => NOW;
  load(context, "src/shared/defaults.js", "src/content/core/util.js", "src/content/core/datetime.js", "src/content/core/color.js",
    "src/content/core/icons.js", "src/content/core/ui.js", "src/content/core/lifecycle.js", "src/content/features/grades.js");
  const BC = context.BC;
  const settings = BC.cloneDefaults();
  settings.grades.goals["1"] = { target: 75, notify: false };
  const local = {};
  BC.storage = { current: settings, local, update: async (fn) => { fn(settings); }, updateLocal: async (fn) => { fn(local); } };
  BC.injector = { setStyle() {}, removeNode(id) { for (const n of context.document.querySelectorAll('[data-bc-node="' + id + '"]')) n.remove(); } };
  BC.toast = { success() {}, error() {}, warn() {} };
  BC.requestApply = () => {};
  BC.api = {
    TTL: { course: 1 },
    coursesWithScores: async () => courses.map((c) => c.course),
    self: async () => ({ id: "77" }),
    assignmentGroups: async (id) => courses.find((c) => c.course.id === String(id)).groups,
    courseModules: async () => [{ id: "5", name: "Module 6: Patterns", items: [{ id: "51", title: "Command pattern", type: "Page", html_url: "http://bc-test.instructure.com/courses/1/pages/command" }] }],
    getJSON: async () => ({ syllabus_body: "<p>Exam 2 covers the command pattern.</p>" }),
    courseAnnouncements: async () => [{ id: "9", title: "Exam 2 room", message: "<p>Room 101</p>", posted_at: "2026-10-27T12:00:00Z", html_url: "http://evil.example/x" }],
    createPlannerNote: async (n) => { notes.push(n); return { id: String(900 + notes.length) }; },
  };
  load(context, "src/content/features/coach.js");
  const apply = () => BC.features.coach.apply(settings, { page: "dashboard" });
  const shadow = () => context.document.querySelector('[data-bc-node="bc-coach"]').shadowRoot;
  const flush = async () => { for (let i = 0; i < 12; i++) { await new Promise((r) => setTimeout(r, 0)); await settle(); } };
  const button = (label) => [...shadow().querySelectorAll("button")].find((b) => b.textContent.trim() === label);
  return { dom, context, BC, settings, local, sent, notes, apply, shadow, flush, button };
}

test("the needed score is the lowest one that reaches the target, by Grade Tools' own calculator", () => {
  const p = page();
  try {
    const { course, groups } = cs3500();
    const a = p.BC.coach.analyze({ course, groups, goal: 75, defaultGoal: 80, scale: "standard-4", now: NOW });
    assert.equal(a.status, "behind");
    assert.equal(a.focus.name, "Exam 2");
    // 50 + 0.3 * score >= 75, so 83.4% after rounding up.
    assert.equal(a.focus.needed, 83.4);
    assert.ok(Math.abs(a.focus.best - 80) < 1e-9 && Math.abs(a.focus.worst - 50) < 1e-9);
    const at = (pct) => p.BC.grades.computeTotalWith(groups, "22", pct);
    assert.ok(at(83.4) >= 75 && at(83.3) < 75);
    assert.equal(a.missing.length, 1);
    assert.equal(Math.round(a.missing[0].ifFull * 10) / 10, 70.7);
    assert.equal(a.targetLetter, "C");

    // Out of reach, and already safe.
    assert.equal(p.BC.coach.analyze({ course, groups, goal: 90, defaultGoal: 80, scale: "standard-4", now: NOW }).focus.needed, Infinity);
    assert.equal(p.BC.coach.analyze({ course, groups, goal: 40, defaultGoal: 80, scale: "standard-4", now: NOW }).focus.needed, 0);
  } finally { p.dom.window.close(); }
});

test("with drop rules the needed score still lands exactly on the target", () => {
  const p = page();
  try {
    const { course, groups } = cs3500();
    groups[0].rules = { drop_lowest: 1 };
    groups[0].assignments.push({ id: "14", name: "HW 4", points_possible: 10, due_at: new Date(NOW + 3 * DAY).toISOString(), submission: { score: null } });
    course.enrollments[0].computed_current_score = p.BC.grades.computeTotal(groups);
    for (const goal of [70, 75, 79]) {
      const a = p.BC.coach.analyze({ course, groups, goal, defaultGoal: 80, scale: "standard-4", now: NOW });
      const n = p.BC.coach.needOn(groups, groups[1].assignments[1], goal);
      assert.equal(a.focus.id, "22");
      const at = (pct) => p.BC.grades.computeTotalWith(groups, "22", pct);
      assert.ok(at(n.needed) >= goal - 1e-9, "reaches " + goal);
      assert.ok(at(n.needed - 0.1) < goal, "and 0.1 less doesn't");
    }
  } finally { p.dom.window.close(); }
});

test("when Canvas's grade and Better Canvas's disagree, the coach doesn't guess", () => {
  const p = page();
  try {
    const { course, groups } = cs3500();
    course.enrollments[0].computed_current_score = 74;   // Canvas counts something hidden
    const a = p.BC.coach.analyze({ course, groups, goal: 75, defaultGoal: 80, scale: "standard-4", now: NOW });
    assert.equal(a.comparable, false);
    assert.equal(a.focus, null);
    assert.equal(a.missing[0].ifFull, null);
    assert.equal(a.score, 74, "the grade shown is still Canvas's");
  } finally { p.dom.window.close(); }
});

test("the dashboard section ranks courses and shows the math without ChatGPT", async () => {
  const p = page();
  try {
    p.apply(); await p.flush(); p.apply();
    const host = p.context.document.querySelector('[data-bc-node="bc-coach"]');
    assert.equal(host.nextElementSibling.id, "DashboardCard_Container", "above the course cards");
    const txt = p.shadow().textContent;
    assert.match(txt, /You need 83\.4% on Exam 2, due .*, to reach 75\.0% \(C\)\./);
    assert.match(txt, /HW 3 is missing\. Full credit on it would bring you to 70\.7%\./);
    assert.match(txt, /ENGW 1111.*On track\./);
    assert.match(txt, /Connect your ChatGPT Plus or Pro plan/);
    assert.equal(p.button("Make a study plan"), undefined, "no ChatGPT buttons until it's connected");
    assert.deepEqual(p.sent.map((m) => m.type), ["bc:coach:status"], "nothing else asked of the background");
  } finally { p.dom.window.close(); }
});

test("clicks a page script makes are ignored", async () => {
  const p = page({ connected: true });
  try {
    p.apply(); await p.flush();
    const make = p.button("Make a study plan");
    make.click();
    make.dispatchEvent(new p.context.MouseEvent("click", { bubbles: true }));
    await p.flush();
    assert.equal(p.context.document.querySelector('[data-bc-node="bc-dialog"]'), null, "no consent dialog");
    assert.equal(p.settings.coach.courses["1"], undefined);
    assert.equal(p.sent.some((m) => m.type === "bc:coach:plan"), false);
    const gear = p.shadow().querySelector('[aria-label="Study coach settings"]');
    gear.click(); await p.flush();
    assert.equal(p.sent.some((m) => m.type === "bc:openOptions"), false);
  } finally { p.dom.window.close(); }
});

test("a first plan asks before sending, then sends only that course with Canvas links", async () => {
  let request = null;
  const p = page({ connected: true, respond: (msg) => {
    request = msg;
    return { ok: true, record: { plan: { summary: "Start with [[a12]].", sessions: [], caveat: "" }, links: { a12: msg.links.a12 }, fingerprint: msg.fingerprint, createdAt: NOW, added: {} } };
  } });
  try {
    p.BC.coach.trusted = () => true;
    p.apply(); await p.flush();
    p.button("Make a study plan").click(); await p.flush();
    const dlg = p.context.document.querySelector('[data-bc-node="bc-dialog"]').shadowRoot;
    assert.match(dlg.textContent, /Send CS 3500 Object-Oriented Design to ChatGPT\?/);
    assert.match(dlg.textContent, /never sends your name, quiz questions/);
    [...dlg.querySelectorAll("button")].find((b) => b.textContent.includes("Send and make a plan")).click();
    await p.flush();
    assert.equal(p.settings.coach.courses["1"], true);
    assert.equal(request.courseId, "1");
    assert.equal(request.user, "77");
    const ctx = request.context;
    assert.equal(ctx.focus.name, "Exam 2");
    assert.equal(ctx.focus.scoreNeeded, 83.4);
    assert.equal(ctx.focus.description, "Covers modules 6-8.", "scripts and tags stripped");
    assert.equal(ctx.plan.firstDay, ymd(NOW));
    assert.equal(ctx.plan.lastDay, ymd(NOW + 4 * DAY), "the day before the exam");
    assert.deepEqual(plain(ctx.missing), [{ id: "a13", name: "HW 3" }]);
    assert.equal(ctx.syllabus, "Exam 2 covers the command pattern.");
    assert.equal(request.links.n9, undefined, "a link off the Canvas site isn't offered");
    assert.equal(request.links.a22.url, "http://bc-test.instructure.com/courses/1/assignments/22");
    assert.ok(!JSON.stringify(ctx).includes("ENGW"), "other courses stay out");
    const a = [...p.shadow().querySelectorAll(".co-summary a")];
    assert.deepEqual(a.map((x) => [x.textContent, x.getAttribute("href")]), [["HW 2", "http://bc-test.instructure.com/courses/1/assignments/12"]]);
  } finally { p.dom.window.close(); }
});

test("Add to planner makes one Canvas planner note per upcoming session, once", async () => {
  const tomorrow = ymd(NOW + DAY);
  const plans = { 1: {
    plan: { summary: "Fix the weak spots.", caveat: "",
      sessions: [{ day: ymd(NOW - DAY), start: "19:00", minutes: 60, task: "Old" },
        { day: tomorrow, start: "19:00", minutes: 60, task: "Redo [[a12]]" }, { day: tomorrow, start: "20:30", minutes: 90, task: "Read [[x9]]" }] },
    links: { a12: { title: "HW 2", url: "http://bc-test.instructure.com/courses/1/assignments/12" } }, fingerprint: "old", createdAt: NOW - 3600e3, focusName: "Exam 2", added: {},
  } };
  const p = page({ connected: true, plans });
  try {
    p.settings.coach.courses["1"] = true;
    p.settings.coach.autoUpdate = false;
    p.BC.coach.trusted = () => true;
    p.apply(); await p.flush();
    const rows = [...p.shadow().querySelectorAll(".co-plan li")].map((li) => li.textContent);
    assert.equal(rows.length, 2, "past sessions are hidden");
    assert.match(rows[1], /1h 30mRead$/, "an id the plan didn't send is dropped, with its space");
    p.button("Add to planner").click(); await p.flush();
    assert.deepEqual(p.notes.map((n) => [n.title, n.courseId, n.todoDate]), [
      ["Redo HW 2", "1", at(1, 19, 0)],
      ["Read", "1", at(1, 20, 30)],
    ]);
    assert.deepEqual(plain(p.local.todo.scheduled), {
      "planner_note:901": { ymd: tomorrow, start: "19:00", dur: 60 }, "planner_note:902": { ymd: tomorrow, start: "20:30", dur: 90 } });
    assert.equal(p.button("Added to planner").disabled, true);
    p.button("Added to planner").click(); await p.flush();
    assert.equal(p.notes.length, 2);
  } finally { p.dom.window.close(); }
});

test("plans update on their own only for turned-on courses that need it", async () => {
  for (const [optIn, auto, expect] of [[true, true, 1], [false, true, 0], [true, false, 0]]) {
    const p = page({ connected: true, respond: (msg) => ({ ok: true, record: { plan: { summary: "s", sessions: [], caveat: "" }, links: {}, fingerprint: msg.fingerprint, createdAt: NOW, added: {} } }) });
    try {
      if (optIn) p.settings.coach.courses["1"] = true;
      p.settings.coach.courses["2"] = true;   // on track, so never automatic
      p.settings.coach.autoUpdate = auto;
      p.apply(); await p.flush(); p.apply(); await p.flush();
      const asked = p.sent.filter((m) => m.type === "bc:coach:plan");
      assert.equal(asked.length, expect, JSON.stringify({ optIn, auto }));
      if (expect) assert.equal(asked[0].auto, true);
    } finally { p.dom.window.close(); }
  }
});

// ---- the background half ---------------------------------------------------

function background({ settings = { coach: { courses: { 1: true } } }, answer, respond, status } = {}) {
  const context = vm.createContext({ console, URL, setTimeout, clearTimeout, setInterval, clearInterval, AbortSignal });
  vm.runInContext(fs.readFileSync(path.join(root, "src/background/coach.js"), "utf8"), context, { filename: "coach.js" });
  const M = context.BCCoach;
  const data = new Map(), calls = [];
  const store = { get: async (k) => (data.has(k) ? plain(data.get(k)) : undefined), set: async (k, v) => { data.set(k, plain(v)); } };
  let clock = NOW;
  const chatgpt = {
    status: async () => status || { connected: true, planEnabled: true, usageUrl: "u" },
    respond: respond || (async (o) => { calls.push(o); return { text: JSON.stringify(answer || plan()) }; }),
  };
  const chrome = { runtime: { id: "ext", getURL: () => "chrome-extension://ext/", lastError: undefined },
    storage: { local: { get: (k, cb) => cb({ bcSettings: settings }) } } };
  const service = M.create({ chatgpt, store, chrome, now: () => clock, keepAlive: () => 0, requestMs: 50 });
  const tab = { id: "ext", tab: { id: 3 }, url: "https://school.instructure.com/courses" };
  const ask = (msg, sender = tab) => new Promise((resolve) => { service.handleMessage(plain(msg), sender, resolve); });
  const planMsg = (extra) => Object.assign({ type: "bc:coach:plan", user: "77", courseId: "1", fingerprint: "f1",
    context: { plan: { firstDay: ymd(NOW), lastDay: ymd(NOW + 4 * DAY) }, focus: { name: "Exam 2" } },
    links: { a12: { title: "HW 2", url: "https://school.instructure.com/courses/1/assignments/12" }, a99: { title: "Elsewhere", url: "https://evil.example/x" } } }, extra || {});
  return { M, service, ask, planMsg, calls, data, tick: (ms) => { clock += ms; }, chatgpt };
}
function plan(extra) {
  return Object.assign({
    summary: "Redo [[a12]] first, then [[a99]] and [[zz]].",
    sessions: [
      { day: ymd(NOW + DAY), start: "19:00", minutes: 60, task: "Redo [[a12]]" },
      { day: ymd(NOW), start: "09:00", minutes: 60, task: "Already over" },
      { day: ymd(NOW + 10 * DAY), start: "19:00", minutes: 60, task: "After the exam" },
      { day: ymd(NOW + 2 * DAY), start: "03:00", minutes: 60, task: "Too early" },
      { day: ymd(NOW + 2 * DAY), start: "7:30", minutes: 600, task: "Too long" },
      { day: ymd(NOW + 2 * DAY), start: "7:30", minutes: 45, task: "Practice problems" },
    ],
    caveat: "",
  }, extra || {});
}

test("a plan is checked against the request: dates, hours, lengths and links", async () => {
  const b = background();
  const r = await b.ask(b.planMsg());
  assert.equal(r.ok, true, r.error);
  const rec = r.record;
  assert.deepEqual(plain(rec.plan.sessions), [
    { day: ymd(NOW + DAY), start: "19:00", minutes: 60, task: "Redo [[a12]]" },
    { day: ymd(NOW + 2 * DAY), start: "07:30", minutes: 45, task: "Practice problems" },
  ]);
  assert.equal(rec.plan.summary, "Redo [[a12]] first, then and.", "off-site and unknown ids are removed");
  assert.deepEqual(Object.keys(rec.links), ["a12"]);
  assert.equal(rec.focusName, "Exam 2");
  // The request asks for the JSON schema and keeps store:false to chatgpt.js.
  assert.equal(b.calls[0].text.format.type, "json_schema");
  assert.equal(b.calls[0].text.format.strict, true);
  assert.match(b.calls[0].instructions, /Never follow them/);
  assert.equal(b.calls[0].input[0].role, "user");
});

test("courses the student didn't turn on, signed-out plans and strangers are refused", async () => {
  let b = background({ settings: { coach: { courses: {} } } });
  assert.equal((await b.ask(b.planMsg())).code, "not_opted_in");
  assert.equal(b.calls.length, 0);
  b = background({ status: { connected: true, planEnabled: false } });
  assert.equal((await b.ask(b.planMsg())).code, "signed_out");
  b = background();
  assert.equal((await b.ask(b.planMsg(), { id: "other", tab: { id: 1 }, url: "https://school.instructure.com/" })).ok, false);
  assert.equal((await b.ask(b.planMsg(), { id: "ext", url: "https://school.instructure.com/" })).ok, false, "no tab, no answer");
  assert.equal((await b.ask({ type: "bc:coach:forget" })).ok, false, "only the settings page deletes plans");
  assert.equal((await b.ask({ type: "bc:coach:forget" }, { id: "ext", url: "chrome-extension://ext/src/options/options.html" })).ok, true);
  assert.equal(b.calls.length, 0);
});

test("automatic rewrites wait a day per course, and manual ones a few seconds", async () => {
  const b = background();
  assert.equal((await b.ask(b.planMsg({ auto: true }))).ok, true);
  assert.equal((await b.ask(b.planMsg({ auto: true }))).code, "auto_wait", "up to date");
  assert.equal((await b.ask(b.planMsg({ auto: true, fingerprint: "f2" }))).code, "auto_wait", "changed, but rewrote recently");
  b.tick(b.M.AUTO_GAP_MS);
  assert.equal((await b.ask(b.planMsg({ auto: true, fingerprint: "f2" }))).ok, true);
  assert.equal((await b.ask(b.planMsg())).code, "too_soon");
});

test("all plan requests stop at the daily limit until the next day", async () => {
  const b = background();
  for (let i = 0; i < b.M.DAILY_LIMIT; i++) { const r = await b.ask(b.planMsg({ fingerprint: "f" + i })); assert.equal(r.ok, true, r.error); b.tick(31e3); }
  assert.equal((await b.ask(b.planMsg())).code, "daily_limit");
  assert.equal(b.calls.length, b.M.DAILY_LIMIT);
  b.tick(DAY);
  assert.equal((await b.ask(b.planMsg())).ok, true);
});

test("two requests for one course share one ChatGPT call", async () => {
  let release;
  const b = background({ respond: (o) => new Promise((resolve) => { release = () => resolve({ text: JSON.stringify(plan()) }); }) });
  const one = b.ask(b.planMsg()), two = b.ask(b.planMsg());
  await new Promise((r) => setTimeout(r, 10));
  release();
  const [r1, r2] = await Promise.all([one, two]);
  assert.equal(r1.ok && r2.ok, true);
  assert.equal(r1.record.createdAt, r2.record.createdAt);
});

test("without structured output it asks again in plain JSON, and a hung answer times out", async () => {
  const seen = [];
  let b = background({ respond: async (o) => {
    seen.push(!!o.text);
    if (o.text) throw Object.assign(new Error("no"), { code: "subscription_sharing_unsupported_capability" });
    return { text: "Here you go:\n```json\n" + JSON.stringify(plan()) + "\n```" };
  } });
  const r = await b.ask(b.planMsg());
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(seen, [true, false]);
  b = background({ respond: (o) => new Promise((_, reject) => o.signal.addEventListener("abort", () => reject(o.signal.reason))) });
  assert.equal((await b.ask(b.planMsg())).code, "timeout");
  b = background({ answer: { summary: "", sessions: [], caveat: "" } });
  assert.equal((await b.ask(b.planMsg())).code, "bad_plan");
  b = background({ respond: async () => ({ text: "Sorry, I can't help." }) });
  assert.equal((await b.ask(b.planMsg())).code, "bad_plan");
});

test("planner additions are recorded once and only on the plan they came from", async () => {
  const b = background();
  const { record } = await b.ask(b.planMsg());
  const add = (extra) => b.ask(Object.assign({ type: "bc:coach:added", user: "77", courseId: "1", createdAt: record.createdAt, index: 0, noteId: "901" }, extra));
  assert.equal((await add({ createdAt: record.createdAt - 1 })).ok, false);
  assert.equal((await add({ index: 9 })).ok, false);
  const r = await add();
  assert.equal(r.ok, true);
  assert.deepEqual(plain(r.record.added), { 0: "901" });
  const listed = await b.ask({ type: "bc:coach:plans", user: "77", courseIds: ["1", "2"] });
  assert.deepEqual(plain(listed.plans["1"].record.added), { 0: "901" });
  assert.equal(listed.plans["2"].record, null);
  // A different Canvas site or student sees nothing.
  const other = await b.ask({ type: "bc:coach:plans", user: "77", courseIds: ["1"] }, { id: "ext", tab: { id: 1 }, url: "https://other.instructure.com/" });
  assert.equal(other.plans["1"].record, null);
});

test("manifests and the worker load the coach on every Canvas page and in the background", () => {
  const sw = fs.readFileSync(path.join(root, "src/background/service-worker.js"), "utf8");
  const workerList = vm.runInNewContext(/const CONTENT_JS = (\[[^\]]*\]);/.exec(sw)[1]);
  assert.ok(workerList.indexOf("src/content/features/coach.js") > workerList.indexOf("src/content/features/grades.js"));
  for (const file of ["manifest.json", "manifest.firefox.json"]) {
    const js = JSON.parse(fs.readFileSync(path.join(root, file), "utf8")).content_scripts[0].js;
    assert.ok(js.includes("src/content/features/coach.js"), file);
  }
});
