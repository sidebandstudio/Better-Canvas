const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const { root, load, settle } = require("./audit-helpers.cjs");
const { database } = require("./storage-harness.cjs");

for (const mode of ["daily", "weekly"]) {
  test(mode + " rotation waits until the next period after a local quota failure without looping on its settings write", async () => {
    const db = database({ bcSettings: { version: 5, theming: { rotation: { enabled: true, mode, themeIds: ["bc-default"] } } } });
    const a = await feature(db, "rotation", "apply"), BC = a.context.BC;
    load(a.context, "src/shared/themes.js");
    BC.testNow = Date.now(); vm.runInContext("Date.now = () => BC.testNow", a.context);
    const counts = { settings: 0, local: 0 }, errors = [];
    BC.diag = { push(_source, error) { errors.push(error.message); } }; BC.toast = { info() {}, error() {} };
    BC.storage.subscribe((settings) => BC.testAction(settings));
    db.beforeSend((message) => {
      if (message.type === "bc:settingsCommit") counts.settings++;
      if (message.type === "bc:localCommit") counts.local++;
    });
    const set = db.api.set;
    db.api.set = (values, callback) => {
      if (!values.bcLocal) return set(values, callback);
      queueMicrotask(() => { db.runtime.lastError = { message: "local quota" }; callback(); delete db.runtime.lastError; });
    };
    BC.testAction(BC.storage.current);
    for (let i = 0; i < 100 && !errors.length; i++) await new Promise((resolve) => setTimeout(resolve, 5));
    for (let i = 0; i < 10; i++) await settle();
    assert.deepEqual(counts, { settings: 1, local: 1 });
    assert.deepEqual(errors, ["local quota"]);
    assert.equal(db.data.bcLocal.lastRotation, undefined);
    for (let i = 0; i < 5; i++) { BC.testAction(BC.storage.current); await settle(); }
    assert.deepEqual(counts, { settings: 1, local: 1 });
    db.api.set = set; BC.testNow += 864e5 * (mode === "weekly" ? 7 : 1);
    BC.testAction(BC.storage.current);
    for (let i = 0; i < 100 && !db.data.bcLocal.lastRotation; i++) await new Promise((resolve) => setTimeout(resolve, 5));
    for (let i = 0; i < 10; i++) await settle();
    assert.deepEqual(counts, { settings: 2, local: 2 });
    assert.equal(db.data.bcLocal.lastRotation.themeId, "bc-default");
  });
}

test("rotation retries failed themes next period and selects current settings inside its write", async () => {
  const db = database({ bcSettings: { version: 5, theming: { rotation: { enabled: true, mode: "daily", themeIds: ["chosen"] } },
    customThemes: [{ id: "chosen", name: "Chosen", settings: { theming: { accentColor: "#ff0000" } } }] } });
  const a = await feature(db, "rotation", "apply"), b = db.tab(); await b.storage.load();
  const BC = a.context.BC; load(a.context, "src/shared/themes.js");
  BC.testNow = Date.now(); vm.runInContext("Date.now = () => BC.testNow", a.context);
  const errors = []; BC.diag = { push(_source, error) { errors.push(error); } }; BC.toast = { info() {}, error() {} };
  db.fail("quota"); BC.testAction(BC.storage.current); await assert.rejects(a.storage.update(() => {}), /quota/);
  await a.storage.updateLocal(() => {});
  assert.equal(errors.length, 1); assert.equal(db.data.bcLocal.lastRotation, undefined);
  db.fail(null);
  await b.storage.update((d) => { d.customThemes[0].settings.theming.accentColor = "#00ff00"; d.dashboard.themeImages = [{ url: "https://external.test/art" }]; });
  BC.testNow += 864e5;
  BC.testAction(BC.storage.current); await a.storage.update(() => {}); await a.storage.updateLocal(() => {});
  assert.equal(db.data.bcSettings.theming.accentColor, "#00ff00");
  assert.deepEqual(db.data.bcSettings.dashboard.themeImages, []);
  assert.equal(db.data.bcLocal.lastRotation.themeId, "chosen");
});

async function feature(db, name, expose) {
  const tab = db.tab(); await tab.storage.load();
  tab.context.BC.registry = { register() {} }; tab.context.BC.util.warn = () => {};
  vm.runInContext(fs.readFileSync(path.join(root, "src/content/features/" + name + ".js"), "utf8")
    .replace("  BC.registry.register({", "  BC.testAction = " + expose + ";\n  BC.registry.register({"), tab.context);
  return tab;
}

test("navigation retries the same snapshot after a rejected write", async () => {
  const db = database(), a = await feature(db, "navigation", "snapshot"), BC = a.context.BC;
  BC.readGlobalNav = () => ["Dashboard"]; BC.readCourseNav = () => ["Grades"];
  db.fail("quota"); BC.testAction(); await a.storage.updateLocal(() => {});
  assert.equal(db.data.bcLocal.navItems, undefined);
  db.fail(null); BC.testAction(); await a.storage.updateLocal(() => {});
  assert.deepEqual(db.data.bcLocal.navItems, ["Dashboard"]);
  assert.deepEqual(db.data.bcLocal.courseNavItems, ["Grades"]);
});

test("a retained announcement scan cannot lower another context's high-water mark", async () => {
  const old = "2026-10-01T00:00:00Z", middle = "2026-10-02T00:00:00Z", latest = "2026-10-03T00:00:00Z";
  const db = database({ bcLocal: { annSeenAt: old } }), a = await feature(db, "notifications", "scanAnnouncements"), b = db.tab();
  await b.storage.load(); const BC = a.context.BC;
  load(a.context, "src/content/core/datetime.js");
  let release;
  BC.api = { courseAnnouncements: () => new Promise((resolve) => { release = () => resolve([{ id: 1, posted_at: middle }]); }) };
  BC.toast = { info() {} };
  const scan = BC.testAction({ notifications: { inPage: false, enabled: false } }, [{ id: 1 }]);
  assert.ok(release);
  await b.storage.updateLocal((d) => { d.annSeenAt = latest; });
  release(); await scan; await a.storage.updateLocal(() => {});
  assert.equal(db.data.bcLocal.annSeenAt, latest);
});
