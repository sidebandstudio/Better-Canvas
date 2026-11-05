const assert = require("node:assert/strict");
const test = require("node:test");
const { load, domContext } = require("./audit-helpers.cjs");

test("quiz saved status and discard wait for storage confirmation and recover after failure", async () => {
  const { database } = require("./storage-harness.cjs"), { settle } = require("./audit-helpers.cjs");
  const key = "/courses/1/quizzes/2/take", db = database({ bcLocal: { notes: {}, drafts: {}, cache: {}, quizDrafts: { [key]: { savedAt: Date.now(), answers: { answer: "old draft" } } } } });
  const client = db.client(), timers = new Map(); let next = 0;
  const page = domContext('<div id="content"><div id="questions"><input name="answer" type="text" value="new answer"></div></div>', {
    chrome: client.chrome, setTimeout: (fn) => { timers.set(++next, fn); return next; }, clearTimeout: (id) => timers.delete(id),
  });
  page.dom.reconfigure({ url: "http://bc-test.instructure.com" + key });
  load(page.context, "src/shared/defaults.js", "src/content/core/util.js", "src/content/core/lifecycle.js", "src/content/core/storage.js");
  const BC = page.context.BC, doc = page.dom.window.document;
  BC.util.warn = () => {}; await BC.storage.load();
  BC.injector = { setStyle() {}, removeNode(id) { doc.querySelector('[data-bc-node="' + id + '"]')?.remove(); },
    ensureNode(id, _host, factory) { const node = doc.querySelector('[data-bc-node="' + id + '"]') || factory(); node.dataset.bcNode = id; return node; } };
  load(page.context, "src/content/features/quizsaver.js");
  const settings = BC.cloneDefaults(); settings.productivity.quizDraftSaver = true;
  BC.features.quizsaver.apply(settings, { path: key });
  const change = () => doc.querySelector("input").dispatchEvent(new page.dom.window.Event("input", { bubbles: true }));
  try {
    db.fail("quota"); change(); const callback = [...timers.values()][0]; timers.clear(); callback();
    await BC.storage.updateLocal(() => {}); await settle();
    assert.equal(doc.querySelector(".bc-quiz-save-dot").classList.contains("show"), false);
    [...doc.querySelectorAll("button")].find((b) => b.textContent === "Discard draft").click(); await BC.storage.updateLocal(() => {}); await settle();
    assert.ok(doc.querySelector(".bc-quiz-banner"));
    db.fail(null); change(); const retry = [...timers.values()][0]; timers.clear(); retry(); await BC.storage.updateLocal(() => {}); await settle();
    assert.equal(db.data.bcLocal.quizDrafts[key].answers.answer, "new answer");
    assert.equal(doc.querySelector(".bc-quiz-save-dot").classList.contains("show"), true);
    [...doc.querySelectorAll("button")].find((b) => b.textContent === "Discard draft").click(); await BC.storage.updateLocal(() => {}); await settle();
    assert.equal(doc.querySelector(".bc-quiz-banner"), null);
    assert.equal(db.data.bcLocal.quizDrafts[key], undefined);
  } finally { BC.features.quizsaver.unmount(); page.dom.window.close(); }
});

test("disabling quiz draft saving removes listeners, cancels saves and guards already queued callbacks", () => {
  const timers = new Map(), queued = []; let next = 0, writes = 0;
  const { dom, context } = domContext('<div id="questions"><input name="answer" type="text" value="Local answer"></div>', {
    setTimeout: (fn) => { timers.set(++next, fn); return next; }, clearTimeout: (id) => timers.delete(id),
  });
  try {
    dom.reconfigure({ url: "http://bc-test.instructure.com/courses/1/quizzes/2/take" });
    load(context, "src/shared/defaults.js", "src/content/core/util.js", "src/content/core/lifecycle.js");
    const BC = context.BC;
    BC.injector = { setStyle() {}, removeNode() {}, ensureNode() {} };
    BC.storage = { local: {}, updateLocal(fn) { queued.push(fn); return Promise.resolve(); } };
    load(context, "src/content/features/quizsaver.js");
    const settings = BC.cloneDefaults(), ctx = { path: dom.window.location.pathname };
    const apply = () => BC.features.quizsaver.apply(settings, ctx);
    settings.productivity.quizDraftSaver = true; apply();
    const input = dom.window.document.querySelector("input"), change = () => input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    change(); assert.equal(timers.size, 1);
    const staleCallback = [...timers.values()][0];
    settings.productivity.quizDraftSaver = false; apply();
    assert.equal(timers.size, 0);
    change(); staleCallback(); assert.equal(timers.size, 0); assert.equal(queued.length, 0);
    settings.productivity.quizDraftSaver = true; apply(); change();
    [...timers.values()][0](); timers.clear(); assert.equal(queued.length, 1);
    settings.productivity.quizDraftSaver = false; apply();
    const data = {}; queued.shift()(data); assert.deepEqual(data, {});
    settings.productivity.quizDraftSaver = true; apply(); change();
    [...timers.values()][0](); timers.clear(); queued.shift()(data);
    if (data.quizDrafts) writes++;
    assert.equal(writes, 1, "reenabling installs one working listener set");
    assert.equal(data.quizDrafts[ctx.path].answers.answer, "Local answer");
    BC.features.quizsaver.unmount(); change(); assert.equal(timers.size, 0);
  } finally { dom.window.close(); }
});

test("the quiz restore banner is offered only when the page opens, and Next keeps the drafts", async () => {
  const { database } = require("./storage-harness.cjs"), { settle } = require("./audit-helpers.cjs");
  const key = "/courses/1/quizzes/2/take/questions/5";
  const db = database({ bcLocal: { quizDrafts: { [key]: { savedAt: Date.now(), answers: { "q1:a": true, essay: "<p>old</p>" } } } } });
  const client = db.client();
  const page = domContext('<div id="content"><form id="submit_quiz_form"><div id="questions">' +
    '<input type="radio" name="q1" value="a" checked><input type="radio" name="q1" value="b">' +
    '<textarea class="question_input" name="essay"></textarea></div><button type="submit" class="next-question">Next</button></form></div>', { chrome: client.chrome });
  try {
    page.dom.reconfigure({ url: "http://bc-test.instructure.com" + key });
    load(page.context, "src/shared/defaults.js", "src/content/core/util.js", "src/content/core/lifecycle.js", "src/content/core/storage.js");
    const BC = page.context.BC, doc = page.dom.window.document;
    await BC.storage.load(); await BC.storage.loadLocal();
    BC.injector = { setStyle() {}, removeNode(id) { doc.querySelector('[data-bc-node="' + id + '"]')?.remove(); },
      ensureNode(id, _host, factory) { const node = doc.querySelector('[data-bc-node="' + id + '"]') || factory(); node.dataset.bcNode = id; return node; } };
    load(page.context, "src/content/features/quizsaver.js");
    const settings = BC.cloneDefaults(); settings.productivity.quizDraftSaver = true;
    const apply = () => BC.features.quizsaver.apply(settings, { path: key });
    apply();
    assert.equal(doc.querySelector(".bc-quiz-banner"), null, "the essay editor's textarea isn't compared");
    const b = doc.querySelector('[value="b"]');
    b.checked = true; b.dispatchEvent(new page.dom.window.Event("change", { bubbles: true }));
    apply();
    assert.equal(doc.querySelector(".bc-quiz-banner"), null, "a new answer waiting to be saved isn't offered back");
    const W = page.dom.window;
    doc.getElementById("submit_quiz_form").dispatchEvent(new W.SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: doc.querySelector(".next-question") }));
    await new Promise((r) => page.dom.window.setTimeout(r, 0)); await settle();
    assert.ok(db.data.bcLocal.quizDrafts[key], "Next isn't a final submit");
  } finally { page.context.BC.features.quizsaver.unmount(); page.dom.window.close(); }
});
