const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { root, load, domContext, copy, settle } = require("./audit-helpers.cjs");

async function surface(name, fail = false) {
  const db = require("./storage-harness.cjs").database({ bcSettings: { version: 2, grades: { gradeHistory: { 7: [{ score: 93 }] } }, todo: { local: { stars: { a: true } } } } });
  const data = db.data, writes = [], chrome = db.client().chrome;
  chrome.tabs = { query: async () => [] };
  const set = db.api.set;
  db.api.set = (values, cb) => { writes.push(copy(values)); return set(values, cb); };
  chrome.storage.local.set = db.api.set;
  db.fail(fail ? "Quota exceeded" : null);
  const html = fs.readFileSync(path.join(root, "src", name, name + ".html"), "utf8");
  const { dom, context } = domContext(html, { chrome });
  let adapter;
  load(context, "src/shared/defaults.js", "src/content/core/util.js", "src/content/core/storage.js");
  context.BC.SettingsUI = { render(_root, value) { adapter = value; } };
  load(context, "src/" + name + "/" + name + ".js");
  await context.BC.storage.load().catch(() => {});
  await settle(); await settle();
  return { db, data, writes, dom, context, adapter, fail: (value) => db.fail(value ? "Quota exceeded" : null) };
}

test("options first upgrade commits legacy history and planner metadata before edits", async () => {
  const s = await surface("options");
  try {
    assert.equal(s.writes[0].bcSettings.version, 5);
    assert.equal(s.writes[0].bcLocal.gradeHistory[7][0].score, 93);
    assert.equal(s.writes[0].bcLocal.todo.stars.a, true);
    await s.adapter.save(s.context.BC.cloneDefaults());
    await settle();
    assert.equal(s.data.bcLocal.gradeHistory[7][0].score, 93);
    assert.equal(s.data.bcLocal.todo.stars.a, true);
  } finally { s.dom.window.close(); }
});
test("options migration failure shows an error and prevents editing", async () => {
  const s = await surface("options", true);
  try {
    assert.match(s.dom.window.document.querySelector('[role="alert"]').textContent, /Quota exceeded/);
    assert.equal(s.data.bcSettings.version, 2);
    assert.equal(s.adapter, undefined);
  } finally { s.dom.window.close(); }
});

test("options page offers to allow the address the toolbar icon sent, then reloads that tab", async () => {
  const db = require("./storage-harness.cjs").database();
  const chrome = db.client().chrome, calls = [], send = chrome.runtime.sendMessage;
  chrome.runtime.sendMessage = (message, callback) => {
    if (message.type !== "bc:syncRegistration") return send(message, callback);
    calls.push(message.type); callback({ ok: true });
  };
  chrome.permissions = { request: (query, callback) => { calls.push(query.origins); callback(true); } };
  chrome.tabs = { query: async () => [], reload: (id, callback) => { calls.push("reload " + id); callback(); } };
  const html = fs.readFileSync(path.join(root, "src/options/options.html"), "utf8");
  for (const [search, offered] of [["?enable=javascript%3Aalert(1)&tab=7", false], ["?enable=https%3A%2F%2Fcanvas.school.edu%3A8443%2Fcourses&tab=7", true]]) {
    const { dom, context } = domContext(html, { chrome });
    dom.reconfigure({ url: "http://bc-test.instructure.com/src/options/options.html" + search });
    try {
      load(context, "src/shared/defaults.js", "src/content/core/util.js", "src/content/core/storage.js");
      context.BC.SettingsUI = { render() {} };
      load(context, "src/options/options.js");
      const bar = dom.window.document.querySelector(".bc-site-offer");
      assert.equal(!!bar, offered);
      if (!bar) continue;
      assert.match(bar.textContent, /Is canvas\.school\.edu your school's Canvas\?/);
      bar.querySelector("button").click();
      assert.deepEqual(copy(calls), [["https://canvas.school.edu/*"], "bc:syncRegistration", "reload 7"]);
      assert.equal(bar.querySelector("button"), null);
      assert.match(bar.textContent, /on for canvas\.school\.edu/);
    } finally { dom.window.close(); }
  }
});

test("study coach courses carry the site the Canvas tab is on when it answers", async () => {
  const s = await surface("options");
  try {
    const chrome = s.context.chrome;
    let url = "https://a.instructure.com/courses";
    chrome.permissions = Object.assign(chrome.permissions || {}, { getAll: async () => ({ origins: [] }) });
    chrome.tabs.query = async () => [{ id: 5, url }];
    chrome.tabs.get = async () => ({ id: 5, url });
    chrome.tabs.sendMessage = (id, msg, cb) => cb(msg.type === "bc:ping" ? { canvas: true }
      : { ok: true, origin: new URL(url).origin, user: "77", courses: [{ id: "1", name: "CS 3500" }] });
    assert.equal((await s.adapter.getCoachCourses()).origin, "https://a.instructure.com");
    // The remembered tab moved to another school's Canvas.
    url = "https://b.instructure.com/courses";
    assert.equal((await s.adapter.getCoachCourses()).origin, "https://b.instructure.com");
    chrome.tabs.get = async () => ({ id: 5, url: "https://a.instructure.com/" });
    await assert.rejects(s.adapter.getCoachCourses(), /moved/);
  } finally { s.dom.window.close(); }
});

test("options adapters reject callback failures and promise rejections", async () => {
  const options = await surface("options");
  try {
    options.fail(true);
    await assert.rejects(options.adapter.save(options.context.BC.cloneDefaults()), /Quota exceeded/);
    await assert.rejects(options.adapter.saveLocal({ notes: {} }), /Quota exceeded/);
    options.db.api.set = () => Promise.reject(new Error("Disk unavailable"));
    await assert.rejects(options.adapter.save(options.context.BC.cloneDefaults()), /Disk unavailable/);
  } finally { options.dom.window.close(); }
});

test("settings flush rejects failed saves so Apply and import can await persistence", async () => {
  const { dom, context } = domContext();
  try {
    load(context, "src/shared/defaults.js", "src/content/core/util.js", "src/shared/settings/state.js");
    const store = context.BC.SettingsState.create({ getState: context.BC.cloneDefaults, save: async () => { throw Error("Disk full"); } });
    store.importJSON('{"grades":{"goals":{"bad":{"target":"<img>"}}}}');
    assert.equal(store.get().grades.goals.bad, undefined);
    await assert.rejects(store.flush(), /Disk full/);
    assert.match(store.saveError.message, /Disk full/);
    store.destroy();
  } finally { dom.window.close(); }
});
