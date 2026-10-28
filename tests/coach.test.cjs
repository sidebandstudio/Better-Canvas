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
const SCHOOL = "https://school.instructure.com";

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
function ungraded() {
  return { course: { id: "3", name: "PHYS 1151", course_code: "PHYS", enrollments: [{ type: "student" }] }, groups: [{ id: "g9", name: "Labs", rules: {}, assignments: [] }] };
}
const record = (extra) => Object.assign({ plan: { summary: "s", sessions: [], caveat: "" }, links: {}, fingerprint: "f", createdAt: NOW, focusName: "Exam 2", added: {} }, extra || {});

// ---- the dashboard half ----------------------------------------------------

// A fake background that keeps plans, consent and claims the way coach.js does.
function page({ connected = false, courses = [cs3500(), engw()], plans = {}, consent = {}, respond, takenByOtherTab, failNote, modules,
  reclaimed, existing = [], takenOver, lookupFails } = {}) {
  const { dom, context } = domContext('<div id="dash"><div id="DashboardCard_Container"></div></div>');
  const sent = [], notes = [], deleted = [];
  let clock = NOW, seq = 0;
  const bg = { plans: plain(plans), consent: Object.assign({}, consent), ready: {} };
  const reply = async (msg) => {
    sent.push(msg);
    const rec = bg.plans[msg.courseId];
    if (msg.type === "bc:coach:status") return { ok: true, connected, usageUrl: "https://chatgpt.com/settings/usage" };
    if (msg.type === "bc:coach:plans") return { ok: true, plans: Object.fromEntries(msg.courseIds.map((id) => [id, { consented: !!bg.consent[id], record: bg.plans[id] || null, autoReadyAt: bg.ready[id] || 0 }])) };
    if (msg.type === "bc:coach:plan") {
      const r = respond ? await respond(msg) : { ok: false, error: "no" };
      if (!r.ok) return r;
      bg.ready[msg.courseId] = clock + 20 * 3600e3;
      bg.plans[msg.courseId] = r.record;
      return Object.assign({ autoReadyAt: bg.ready[msg.courseId] }, r);
    }
    const mine = () => String(rec.added[msg.index] || "").split(":")[2] === String(msg.token);
    if (msg.type === "bc:coach:claim") {
      if (takenByOtherTab === msg.index) rec.added[msg.index] = "claim:" + clock + ":other";
      if (rec.added[msg.index]) return { ok: false, code: "taken", record: rec };
      rec.added[msg.index] = "claim:" + clock + ":" + ++seq;
      return { ok: true, token: String(seq), reclaimed: reclaimed === msg.index, record: rec };
    }
    if (msg.type === "bc:coach:added") {
      if (takenOver && takenOver[msg.index]) rec.added[msg.index] = takenOver[msg.index];
      const v = rec.added[msg.index];
      if (String(v).startsWith("claim:")) { rec.added[msg.index] = msg.noteId; return { ok: true, record: rec }; }
      return v === msg.noteId ? { ok: true, record: rec } : { ok: false, code: "taken", record: rec };
    }
    if (msg.type === "bc:coach:release") { if (mine()) rec.added[msg.index] = "claim:0:" + msg.token; return { ok: true, record: rec }; }
    return { ok: true };
  };
  context.chrome = { runtime: { lastError: undefined, sendMessage: (msg, cb) => setTimeout(() => reply(plain(msg)).then((r) => cb(plain(r)))) } };
  context.Date.now = () => clock;
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
    courseModules: modules || (async () => [{ id: "5", name: "Module 6: Patterns", items: [{ id: "51", title: "Command pattern", type: "Page", html_url: "http://bc-test.instructure.com/courses/1/pages/command" }] }]),
    getJSON: async () => ({ syllabus_body: "<p>Exam 2 covers the command pattern.</p>" }),
    courseAnnouncements: async () => [{ id: "9", title: "Exam 2 room", message: "<p>Room 101</p>", posted_at: "2026-10-27T12:00:00Z", html_url: "http://evil.example/x" }],
    createPlannerNote: async (n) => {
      if (failNote && failNote(notes.length)) throw new Error("Canvas 500");
      notes.push(n); return { id: String(900 + notes.length) };
    },
    deletePlannerNote: async (id) => { deleted.push(id); },
    getList: async (url) => { sent.push({ type: "GET " + url.split("?")[0] }); if (lookupFails) throw new Error("Canvas 503"); return existing; },
  };
  load(context, "src/content/features/coach.js");
  const apply = () => BC.features.coach.apply(settings, { page: "dashboard" });
  const shadow = () => context.document.querySelector('[data-bc-node="bc-coach"]').shadowRoot;
  const flush = async () => { for (let i = 0; i < 12; i++) { await new Promise((r) => setTimeout(r, 0)); await settle(); } };
  const button = (label) => [...shadow().querySelectorAll("button")].find((b) => b.textContent.trim() === label);
  const text = () => shadow().querySelector(".bc-root").textContent;
  return { dom, context, BC, settings, local, sent, notes, deleted, bg, apply, shadow, flush, button, text, courses, setNow: (t) => { clock = t; } };
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

test("a course with weighting turned off is figured by points, whatever weights Canvas kept", () => {
  const p = page();
  try {
    // Homework 60/100 and a 100-point exam, with 40/60 weights left over from before.
    const course = { id: "4", name: "Unweighted", apply_assignment_group_weights: false, enrollments: [{ computed_current_score: 60 }] };
    const groups = [
      { id: "h", name: "Homework", group_weight: 40, rules: {}, assignments: [{ id: "1", points_possible: 100, submission: { score: 60, workflow_state: "graded" } }] },
      { id: "e", name: "Exams", group_weight: 60, rules: {}, assignments: [{ id: "2", name: "Final", points_possible: 100, due_at: new Date(NOW + 2 * DAY).toISOString(), submission: { score: null } }] },
    ];
    const a = p.BC.coach.analyze({ course, groups, goal: 70, defaultGoal: 80, scale: "standard-4", now: NOW });
    // (60 + score) / 200 >= 70%, so 80%. Weighted it would have said 76.7%.
    assert.equal(a.focus.needed, 80);
    assert.equal(a.comparable, true);
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
    const txt = p.text();
    assert.match(txt, /You need 83\.4% on Exam 2, due .*, to reach 75\.0% \(C\)\./);
    assert.match(txt, /HW 3 is missing\. Full credit on it would bring you to 70\.7%\./);
    assert.match(txt, /ENGW 1111.*On track\./);
    assert.match(txt, /Connect your ChatGPT Plus or Pro plan/);
    assert.equal(p.button("Make a study plan"), undefined, "no ChatGPT buttons until it's connected");
    assert.deepEqual(p.sent.map((m) => m.type), ["bc:coach:status"], "nothing else asked of the background");
  } finally { p.dom.window.close(); }
});

test("a course with no grades says so, and isn't counted as on track", async () => {
  let p = page({ courses: [engw(), ungraded()] });
  try {
    p.apply(); await p.flush();
    assert.match(p.text(), /PHYS 1151No grades yet\./);
    assert.match(p.text(), /Every graded course is at or above its target\./);
  } finally { p.dom.window.close(); }
  p = page({ courses: [ungraded()] });
  try {
    p.apply(); await p.flush();
    assert.doesNotMatch(p.text(), /at or above its target/);
  } finally { p.dom.window.close(); }
});

test("a course that isn't turned on only links to settings, and nothing here turns it on", async () => {
  const p = page({ connected: true });
  try {
    p.apply(); await p.flush();
    assert.equal(p.button("Make a study plan"), undefined);
    assert.match(p.text(), /Study plans are off for this course\. Turn them on in Study coach settings/);
    const on = p.button("Turn on study plans");
    on.click(); await p.flush();
    assert.equal(p.sent.some((m) => m.type === "bc:openOptions"), false, "a script's click does nothing");
    p.BC.coach.trusted = () => true;
    on.click(); await p.flush();
    assert.deepEqual(plain(p.sent.filter((m) => m.type === "bc:openOptions")), [{ type: "bc:openOptions", section: "coach" }]);
    assert.equal(p.sent.some((m) => m.type === "bc:coach:plan"), false);
    assert.equal(p.settings.coach.courses, undefined, "consent isn't a setting a page could change");
  } finally { p.dom.window.close(); }
});

test("coming back from settings picks up a course that was just turned on", async () => {
  const p = page({ connected: true });
  try {
    p.settings.coach.autoUpdate = false;
    p.apply(); await p.flush();
    assert.ok(p.button("Turn on study plans"));
    p.bg.consent[1] = true;   // the settings page turned it on
    p.setNow(NOW + 5000);
    p.context.document.dispatchEvent(new p.context.Event("visibilitychange"));
    await p.flush();
    assert.ok(p.button("Make a study plan"));
  } finally { p.dom.window.close(); }
});

test("clicks a page script makes are ignored", async () => {
  const p = page({ connected: true, consent: { 1: true }, respond: () => ({ ok: true, record: record() }) });
  try {
    p.settings.coach.autoUpdate = false;
    p.apply(); await p.flush();
    const make = p.button("Make a study plan");
    make.click();
    make.dispatchEvent(new p.context.MouseEvent("click", { bubbles: true }));
    await p.flush();
    assert.equal(p.sent.some((m) => m.type === "bc:coach:plan"), false);
    p.shadow().querySelector('[aria-label="Study coach settings"]').click(); await p.flush();
    assert.equal(p.sent.some((m) => m.type === "bc:openOptions"), false);
  } finally { p.dom.window.close(); }
});

test("a turned-on course sends only that course, with links back to Canvas", async () => {
  let request = null;
  const p = page({ connected: true, consent: { 1: true }, respond: (msg) => {
    request = msg;
    return { ok: true, record: record({ plan: { summary: "Start with [[a12]].", sessions: [], caveat: "" }, links: { a12: msg.links.a12 }, fingerprint: msg.fingerprint }) };
  } });
  try {
    p.settings.coach.autoUpdate = false;
    p.BC.coach.trusted = () => true;
    p.apply(); await p.flush();
    p.button("Make a study plan").click(); await p.flush();
    assert.equal(request.courseId, "1");
    assert.equal(request.user, "77");
    assert.equal(request.auto, false);
    const ctx = request.context;
    assert.equal(ctx.focus.name, "Exam 2");
    assert.equal(ctx.focus.scoreNeeded, 83.4);
    assert.equal(ctx.focus.description, "Covers modules 6-8.", "scripts and tags stripped");
    assert.equal(ctx.plan.firstDay, ymd(NOW));
    assert.equal(ctx.plan.lastDay, ymd(NOW + 4 * DAY), "the day before the exam");
    assert.equal(ctx.plan.endBy, new Date(NOW + 5 * DAY).toISOString(), "and every session ends before it");
    assert.deepEqual(plain(ctx.missing), [{ id: "a13", name: "HW 3" }]);
    assert.equal(ctx.syllabus, "Exam 2 covers the command pattern.");
    assert.equal(request.links.n9, undefined, "a link off the Canvas site isn't offered");
    assert.equal(request.links.a22.url, "http://bc-test.instructure.com/courses/1/assignments/22");
    assert.ok(!JSON.stringify(ctx).includes("ENGW"), "other courses stay out");
    const a = [...p.shadow().querySelectorAll(".co-summary a")];
    assert.deepEqual(a.map((x) => [x.textContent, x.getAttribute("href")]), [["HW 2", "http://bc-test.instructure.com/courses/1/assignments/12"]]);
    assert.match(p.text(), /No study sessions fit before the deadline\./);
  } finally { p.dom.window.close(); }
});

test("turning the coach off while a course is being gathered sends nothing", async () => {
  let release;
  const p = page({ connected: true, consent: { 1: true }, respond: () => ({ ok: true, record: record() }),
    modules: () => new Promise((r) => { release = () => r([]); }) });
  try {
    p.settings.coach.autoUpdate = false;
    p.BC.coach.trusted = () => true;
    p.apply(); await p.flush();
    p.button("Make a study plan").click(); await p.flush();
    p.settings.coach.enabled = false;
    p.apply();
    release(); await p.flush();
    assert.equal(p.sent.some((m) => m.type === "bc:coach:plan"), false);
  } finally { p.dom.window.close(); }
});

const twoSessions = () => {
  const tomorrow = ymd(NOW + DAY);
  return { 1: record({
    plan: { summary: "Fix the weak spots.", caveat: "",
      sessions: [{ day: ymd(NOW - DAY), start: "19:00", minutes: 60, task: "Old" },
        { day: tomorrow, start: "19:00", minutes: 60, task: "Redo [[a12]]" }, { day: tomorrow, start: "20:30", minutes: 90, task: "Read [[x9]]" }] },
    links: { a12: { title: "HW 2", url: "http://bc-test.instructure.com/courses/1/assignments/12" } }, fingerprint: "old", createdAt: NOW - 3600e3,
  }) };
};

test("Add to planner claims each upcoming session, then makes one Canvas planner note for it", async () => {
  const tomorrow = ymd(NOW + DAY);
  const p = page({ connected: true, consent: { 1: true }, plans: twoSessions() });
  try {
    p.settings.coach.autoUpdate = false;
    p.BC.coach.trusted = () => true;
    p.apply(); await p.flush();
    const rows = [...p.shadow().querySelectorAll(".co-plan li")].map((li) => li.textContent);
    assert.equal(rows.length, 2, "past sessions are hidden");
    assert.match(rows[1], /1h 30mRead$/, "an id the plan didn't send is dropped, with its space");
    p.button("Add to planner").click(); await p.flush();
    assert.deepEqual(p.notes.map((n) => [n.title, n.courseId, n.todoDate]), [["Redo HW 2", "1", at(1, 19, 0)], ["Read", "1", at(1, 20, 30)]]);
    assert.deepEqual(p.sent.filter((m) => /claim|added/.test(m.type)).map((m) => m.type + ":" + m.index),
      ["bc:coach:claim:1", "bc:coach:added:1", "bc:coach:claim:2", "bc:coach:added:2"]);
    assert.deepEqual(plain(p.local.todo.scheduled), {
      "planner_note:901": { ymd: tomorrow, start: "19:00", dur: 60 }, "planner_note:902": { ymd: tomorrow, start: "20:30", dur: 90 } });
    assert.equal(p.button("Added to planner").disabled, true);
    p.button("Added to planner").click(); await p.flush();
    assert.equal(p.notes.length, 2);
  } finally { p.dom.window.close(); }
});

test("a session another tab claimed isn't added twice, and a failed note releases its claim", async () => {
  let p = page({ connected: true, consent: { 1: true }, plans: twoSessions(), takenByOtherTab: 2 });
  try {
    p.settings.coach.autoUpdate = false;
    p.BC.coach.trusted = () => true;
    p.apply(); await p.flush();
    p.button("Add to planner").click(); await p.flush();
    assert.deepEqual(p.notes.map((n) => n.title), ["Redo HW 2"]);
  } finally { p.dom.window.close(); }
  p = page({ connected: true, consent: { 1: true }, plans: twoSessions(), failNote: (n) => n === 1 });
  try {
    p.settings.coach.autoUpdate = false;
    p.BC.coach.trusted = () => true;
    p.apply(); await p.flush();
    p.button("Add to planner").click(); await p.flush();
    assert.equal(p.notes.length, 1);
    assert.deepEqual(p.sent.filter((m) => m.type === "bc:coach:release").map((m) => m.index), [2]);
    assert.equal(p.bg.plans[1].added[1], "901");
    assert.match(String(p.bg.plans[1].added[2]), /^claim:0:/, "released, and checked for a note next time");
    assert.match(p.text(), /Added 1 of 2 sessions\. Canvas didn't save the rest\./);
    assert.ok(p.button("Add the rest to planner"));
  } finally { p.dom.window.close(); }
});

test("taking over an abandoned claim reuses its note, and a note made after losing the claim is removed", async () => {
  // The tab that held session 1 made its note, then went away.
  let p = page({ connected: true, consent: { 1: true }, plans: twoSessions(), reclaimed: 1,
    existing: [{ id: "800", title: "Redo HW 2", course_id: "1", todo_date: at(1, 19, 0) }] });
  try {
    p.settings.coach.autoUpdate = false;
    p.BC.coach.trusted = () => true;
    p.apply(); await p.flush();
    p.button("Add to planner").click(); await p.flush();
    assert.deepEqual(p.notes.map((n) => n.title), ["Read"], "session 1 wasn't made again");
    assert.deepEqual(plain(p.bg.plans[1].added), { 1: "800", 2: "901" });
  } finally { p.dom.window.close(); }
  // Canvas was slow, this tab's claim lapsed, and another tab recorded its own note.
  p = page({ connected: true, consent: { 1: true }, plans: twoSessions(), takenOver: { 1: "799" } });
  try {
    p.settings.coach.autoUpdate = false;
    p.BC.coach.trusted = () => true;
    p.apply(); await p.flush();
    p.button("Add to planner").click(); await p.flush();
    assert.deepEqual(plain(p.deleted), ["901"], "its second copy is deleted");
    assert.equal(p.bg.plans[1].added[1], "799");
    assert.equal(p.bg.plans[1].added[2], "902");
  } finally { p.dom.window.close(); }
  // The other tab found this tab's note and recorded it, so it stays.
  p = page({ connected: true, consent: { 1: true }, plans: twoSessions(), takenOver: { 1: "901" } });
  try {
    p.settings.coach.autoUpdate = false;
    p.BC.coach.trusted = () => true;
    p.apply(); await p.flush();
    p.button("Add to planner").click(); await p.flush();
    assert.deepEqual(plain(p.deleted), []);
    assert.equal(p.bg.plans[1].added[1], "901");
  } finally { p.dom.window.close(); }
});

test("when Canvas can't say whether an abandoned session's note exists, nothing new is made", async () => {
  const p = page({ connected: true, consent: { 1: true }, plans: twoSessions(), reclaimed: 1, lookupFails: true });
  try {
    p.settings.coach.autoUpdate = false;
    p.BC.coach.trusted = () => true;
    p.apply(); await p.flush();
    p.button("Add to planner").click(); await p.flush();
    assert.equal(p.notes.length, 0);
    assert.match(String(p.bg.plans[1].added[1]), /^claim:0:/, "still marked for a check next time");
    assert.match(p.text(), /Canvas didn't save the rest\. Try again\./);
  } finally { p.dom.window.close(); }
});

test("a failure before the background's limits keeps its own wait through a resync", async () => {
  const p = page({ connected: true, consent: { 1: true }, respond: () => ({ ok: false, code: "too_large", error: "This course has too much text to send." }) });
  try {
    p.apply(); await p.flush();
    const asked = () => p.sent.filter((m) => m.type === "bc:coach:plan").length;
    assert.equal(asked(), 1);
    p.setNow(NOW + 5000);
    p.context.document.dispatchEvent(new p.context.Event("visibilitychange"));
    await p.flush();
    assert.equal(asked(), 1, "no second try five seconds later");
    p.setNow(NOW + 31 * 60000);
    p.context.document.dispatchEvent(new p.context.Event("visibilitychange"));
    await p.flush();
    assert.equal(asked(), 2);
  } finally { p.dom.window.close(); }
});

test("plans update on their own only for turned-on courses that need it", async () => {
  for (const [on, auto, expect] of [[true, true, 1], [false, true, 0], [true, false, 0]]) {
    const p = page({ connected: true, consent: Object.assign({ 2: true }, on ? { 1: true } : {}),
      respond: (msg) => ({ ok: true, record: record({ fingerprint: msg.fingerprint }) }) });
    try {
      p.settings.coach.autoUpdate = auto;   // course 2 is on track, so never automatic
      p.apply(); await p.flush(); p.apply(); await p.flush();
      const asked = p.sent.filter((m) => m.type === "bc:coach:plan");
      assert.equal(asked.length, expect, JSON.stringify({ on, auto }));
      if (expect) assert.equal(asked[0].auto, true);
    } finally { p.dom.window.close(); }
  }
});

test("a dashboard left open keeps rewriting plans as grades change, once a day", async () => {
  const p = page({ connected: true, consent: { 1: true }, respond: (msg) => ({ ok: true, record: record({ fingerprint: msg.fingerprint }) }) });
  try {
    p.apply(); await p.flush();
    const asked = () => p.sent.filter((m) => m.type === "bc:coach:plan").length;
    assert.equal(asked(), 1);
    p.courses[0].groups[0].assignments[1].submission.score = 7;   // a regrade
    p.setNow(NOW + 3 * 3600e3); p.apply(); await p.flush();
    assert.equal(asked(), 1, "not again the same day");
    p.setNow(NOW + 21 * 3600e3); p.apply(); await p.flush();
    assert.equal(asked(), 2);
  } finally { p.dom.window.close(); }
});

// ---- the background half ---------------------------------------------------

const PAGE = { id: "ext", url: "chrome-extension://ext/src/options/options.html?section=coach" };
async function background({ consent = [[SCHOOL, "77", "1"]], answer, respond, status } = {}) {
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
  const chrome = { runtime: { id: "ext", getURL: () => "chrome-extension://ext/", lastError: undefined } };
  const service = M.create({ chatgpt, store, chrome, now: () => clock, keepAlive: () => 0, requestMs: 50 });
  const tab = { id: "ext", tab: { id: 3 }, url: SCHOOL + "/courses" };
  const ask = (msg, sender = tab) => new Promise((resolve) => { service.handleMessage(plain(msg), sender, resolve); });
  for (const [origin, user, courseId] of consent) await ask({ type: "bc:coach:consent", origin, user, courseId, name: "CS 3500", on: true }, PAGE);
  const planMsg = (extra) => Object.assign({ type: "bc:coach:plan", user: "77", courseId: "1", fingerprint: "f1",
    context: { plan: { firstDay: ymd(NOW), lastDay: ymd(NOW + 4 * DAY) }, focus: { name: "Exam 2" } },
    links: { a12: { title: "HW 2", url: SCHOOL + "/courses/1/assignments/12" }, a99: { title: "Elsewhere", url: "https://evil.example/x" } } }, extra || {});
  return { M, service, ask, planMsg, calls, data, tick: (ms) => { clock += ms; }, chatgpt };
}
function plan(extra) {
  return Object.assign({
    summary: "Redo [[a12]] first, then [[a99]] and [[zz]].",
    sessions: [
      { day: ymd(NOW + DAY), start: "19:00", minutes: 60, task: "Redo [[a12]]" },
      { day: ymd(NOW), start: "09:00", minutes: 60, task: "Already over" },
      { day: ymd(NOW + 10 * DAY), start: "19:00", minutes: 60, task: "After the window" },
      { day: ymd(NOW + 2 * DAY), start: "03:00", minutes: 60, task: "Too early" },
      { day: ymd(NOW + 2 * DAY), start: "7:30", minutes: 600, task: "Too long" },
      { day: ymd(NOW + 2 * DAY), start: "7:30", minutes: 45, task: "Practice problems" },
    ],
    caveat: "",
  }, extra || {});
}

test("a plan is checked against the request: dates, hours, lengths and links", async () => {
  const b = await background();
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
  assert.match(b.calls[0].instructions, /plan\.endBy/);
  assert.equal(b.calls[0].input[0].role, "user");
});

test("no session ends after the exam it's for, even on the exam's own day", async () => {
  const b = await background({ answer: { summary: "Cram.", caveat: "", sessions: [
    { day: ymd(NOW), start: "10:30", minutes: 60, task: "Ends 11:30" },
    { day: ymd(NOW), start: "11:30", minutes: 60, task: "Ends 12:30" },
    { day: ymd(NOW), start: "19:00", minutes: 60, task: "After the exam" },
  ] } });
  const r = await b.ask(b.planMsg({ context: { plan: { firstDay: ymd(NOW), lastDay: ymd(NOW), endBy: at(0, 12, 0) }, focus: { name: "Exam 2" } } }));
  assert.deepEqual(plain(r.record.plan.sessions.map((x) => x.task)), ["Ends 11:30"]);
});

test("consent covers one course of one student on one Canvas site, and only the settings page gives it", async () => {
  const b = await background();
  assert.equal((await b.ask(b.planMsg())).ok, true);
  b.tick(31e3);
  assert.equal((await b.ask(b.planMsg(), { id: "ext", tab: { id: 4 }, url: "https://other.instructure.com/" })).code, "not_opted_in", "same course number, other site");
  assert.equal((await b.ask(b.planMsg({ user: "78" }))).code, "not_opted_in", "same course, other student");
  assert.equal((await b.ask(b.planMsg({ courseId: "2" }))).code, "not_opted_in");
  const fromTab = await b.ask({ type: "bc:coach:consent", origin: "https://other.instructure.com", user: "77", courseId: "1", on: true });
  assert.equal(fromTab.ok, false, "a Canvas tab can't give consent");
  assert.equal((await b.ask({ type: "bc:coach:consents" })).ok, false, "or read it");
  const list = await b.ask({ type: "bc:coach:consents" }, PAGE);
  assert.deepEqual(plain(list.consents.map((c) => [c.origin, c.user, c.courseId, c.name])), [[SCHOOL, "77", "1", "CS 3500"]]);
  assert.equal((await b.ask({ type: "bc:coach:consent", origin: "javascript:alert(1)", user: "77", courseId: "1", on: true }, PAGE)).ok, false);
  // Turning it off deletes the plan.
  await b.ask({ type: "bc:coach:consent", origin: SCHOOL, user: "77", courseId: "1", on: false }, PAGE);
  const listed = await b.ask({ type: "bc:coach:plans", user: "77", courseIds: ["1"] });
  assert.deepEqual(plain(listed.plans["1"]).record, null);
  assert.equal(listed.plans["1"].consented, false);
  assert.equal(b.calls.length, 1);
});

test("signed-out plans and strangers are refused", async () => {
  let b = await background({ status: { connected: true, planEnabled: false } });
  assert.equal((await b.ask(b.planMsg())).code, "signed_out");
  b = await background();
  assert.equal((await b.ask(b.planMsg(), { id: "other", tab: { id: 1 }, url: SCHOOL + "/" })).ok, false);
  assert.equal((await b.ask(b.planMsg(), { id: "ext", url: SCHOOL + "/" })).ok, false, "no tab, no answer");
  assert.equal((await b.ask({ type: "bc:coach:forget" })).ok, false, "only the settings page deletes plans");
  assert.equal((await b.ask({ type: "bc:coach:forget" }, PAGE)).ok, true);
  assert.equal(b.calls.length, 0);
});

test("a plan that finishes after its course was turned off, or plans were deleted, isn't kept", async () => {
  for (const stop of [
    (b) => b.ask({ type: "bc:coach:consent", origin: SCHOOL, user: "77", courseId: "1", on: false }, PAGE),
    (b) => b.ask({ type: "bc:coach:forget" }, PAGE),
  ]) {
    let release;
    const b = await background({ respond: () => new Promise((resolve) => { release = () => resolve({ text: JSON.stringify(plan()) }); }) });
    const pending = b.ask(b.planMsg());
    await new Promise((r) => setTimeout(r, 10));
    await stop(b);
    release();
    const r = await pending;
    assert.equal(r.ok, false);
    assert.equal(r.code, "not_opted_in");
    const listed = await b.ask({ type: "bc:coach:plans", user: "77", courseIds: ["1"] });
    assert.equal(listed.plans["1"].record, null);
  }
});

test("a delete during the sign-in check, or turning a course off and on, still drops the answer", async () => {
  // Plans deleted while the request waited on ChatGPT's status.
  let open;
  let b = await background({ status: undefined });
  const status = b.chatgpt.status;
  b.chatgpt.status = () => new Promise((resolve) => { open = () => resolve(status()); });
  let pending = b.ask(b.planMsg());
  await new Promise((r) => setTimeout(r, 10));
  await b.ask({ type: "bc:coach:forget" }, PAGE);
  open();
  assert.equal((await pending).code, "not_opted_in");
  assert.equal((await b.ask({ type: "bc:coach:plans", user: "77", courseIds: ["1"] })).plans["1"].record, null);
  // Off and back on while ChatGPT was writing.
  let release;
  b = await background({ respond: () => new Promise((resolve) => { release = () => resolve({ text: JSON.stringify(plan()) }); }) });
  pending = b.ask(b.planMsg());
  await new Promise((r) => setTimeout(r, 10));
  await b.ask({ type: "bc:coach:consent", origin: SCHOOL, user: "77", courseId: "1", on: false }, PAGE);
  await b.ask({ type: "bc:coach:consent", origin: SCHOOL, user: "77", courseId: "1", name: "CS 3500", on: true }, PAGE);
  release();
  assert.equal((await pending).code, "not_opted_in");
  assert.equal((await b.ask({ type: "bc:coach:plans", user: "77", courseIds: ["1"] })).plans["1"].record, null);
});

test("automatic rewrites wait a day per course, and manual ones a few seconds", async () => {
  const b = await background();
  const first = await b.ask(b.planMsg({ auto: true }));
  assert.equal(first.ok, true);
  assert.equal(first.autoReadyAt, NOW + b.M.AUTO_GAP_MS);
  const wait = await b.ask(b.planMsg({ auto: true }));
  assert.equal(wait.code, "auto_wait", "up to date");
  assert.equal(wait.autoReadyAt, NOW + b.M.AUTO_GAP_MS, "and says when it may go");
  assert.equal((await b.ask(b.planMsg({ auto: true, fingerprint: "f2" }))).code, "auto_wait", "changed, but rewrote recently");
  b.tick(b.M.AUTO_GAP_MS);
  assert.equal((await b.ask(b.planMsg({ auto: true, fingerprint: "f2" }))).ok, true);
  assert.equal((await b.ask(b.planMsg())).code, "too_soon");
});

test("all plan requests stop at the daily limit until the next day", async () => {
  const b = await background();
  for (let i = 0; i < b.M.DAILY_LIMIT; i++) { const r = await b.ask(b.planMsg({ fingerprint: "f" + i })); assert.equal(r.ok, true, r.error); b.tick(31e3); }
  assert.equal((await b.ask(b.planMsg())).code, "daily_limit");
  assert.equal(b.calls.length, b.M.DAILY_LIMIT);
  b.tick(DAY);
  assert.equal((await b.ask(b.planMsg())).ok, true);
});

test("two requests for one course share one ChatGPT call", async () => {
  let release;
  const b = await background({ respond: () => new Promise((resolve) => { release = () => resolve({ text: JSON.stringify(plan()) }); }) });
  const one = b.ask(b.planMsg()), two = b.ask(b.planMsg());
  await new Promise((r) => setTimeout(r, 10));
  release();
  const [r1, r2] = await Promise.all([one, two]);
  assert.equal(r1.ok && r2.ok, true);
  assert.equal(r1.record.createdAt, r2.record.createdAt);
});

test("without structured output it asks again in plain JSON, and a hung answer times out", async () => {
  const seen = [];
  let b = await background({ respond: async (o) => {
    seen.push(!!o.text);
    if (o.text) throw Object.assign(new Error("no"), { code: "subscription_sharing_unsupported_capability" });
    return { text: "Here you go:\n```json\n" + JSON.stringify(plan()) + "\n```" };
  } });
  const r = await b.ask(b.planMsg());
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(seen, [true, false]);
  b = await background({ respond: (o) => new Promise((_, reject) => o.signal.addEventListener("abort", () => reject(o.signal.reason))) });
  const late = await b.ask(b.planMsg({ auto: true }));
  assert.equal(late.code, "timeout");
  assert.equal(late.autoReadyAt, NOW + b.M.AUTO_GAP_MS, "a failed automatic try still waits its day");
  b = await background({ answer: { summary: "", sessions: [], caveat: "" } });
  assert.equal((await b.ask(b.planMsg())).code, "bad_plan");
  b = await background({ respond: async () => ({ text: "Sorry, I can't help." }) });
  assert.equal((await b.ask(b.planMsg())).code, "bad_plan");
});

test("each session goes to the planner once: claim, then record the note", async () => {
  const b = await background();
  const { record: rec } = await b.ask(b.planMsg());
  const send = (type, extra) => b.ask(Object.assign({ type, user: "77", courseId: "1", createdAt: rec.createdAt, index: 0 }, extra));
  assert.equal((await send("bc:coach:added", { noteId: "901" })).ok, false, "no claim, no record");
  assert.equal((await send("bc:coach:claim", { createdAt: rec.createdAt - 1 })).ok, false, "a replaced plan");
  assert.equal((await send("bc:coach:claim", { index: 9 })).ok, false);
  const first = await send("bc:coach:claim");
  assert.equal(first.ok, true);
  assert.equal(first.reclaimed, false);
  assert.equal((await send("bc:coach:claim")).code, "taken", "a second tab");
  assert.equal((await send("bc:coach:release", { token: "nope" })).ok, false, "only the holder releases");
  assert.equal((await send("bc:coach:release", { token: first.token })).ok, true);
  const a = await send("bc:coach:claim");
  assert.equal(a.reclaimed, true, "a released session is checked for a note before another is made");
  b.tick(121e3);
  const bTab = await send("bc:coach:claim");
  assert.equal(bTab.ok, true, "a claim its tab abandoned lapses");
  assert.equal(bTab.reclaimed, true, "and the new holder is told to look for its note");
  assert.equal((await send("bc:coach:release", { token: a.token })).ok, false, "the old holder can't release it");
  // The slow tab's note lands first and is kept; the new holder's copy isn't.
  assert.equal((await send("bc:coach:added", { token: a.token, noteId: "900" })).ok, true);
  const r = await send("bc:coach:added", { token: bTab.token, noteId: "901" });
  assert.equal(r.code, "taken");
  assert.deepEqual(plain(r.record.added), { 0: "900" });
  assert.equal((await send("bc:coach:added", { token: bTab.token, noteId: "900" })).ok, true, "recording the kept note again is fine");
  assert.equal((await send("bc:coach:claim")).code, "taken");
  const listed = await b.ask({ type: "bc:coach:plans", user: "77", courseIds: ["1", "2"] });
  assert.deepEqual(plain(listed.plans["1"].record.added), { 0: "900" });
  assert.equal(listed.plans["2"].record, null);
  // A different Canvas site sees nothing.
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
