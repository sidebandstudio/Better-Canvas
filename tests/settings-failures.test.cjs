const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { root, load, domContext, settle, settingsUIFiles } = require("./audit-helpers.cjs");

function setup(save = async () => { throw Error("Quota exceeded"); }) {
  const { dom, context } = domContext('<div id="root"></div>', { chrome: { runtime: { getURL: (s) => s }, storage: { onChanged: { addListener() {} } } } });
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json")));
  load(context, ...manifest.content_scripts[0].js.filter((file) => file !== "src/content/content.js"), ...settingsUIFiles());
  const messages = [], BC = context.BC;
  BC.toast = Object.fromEntries(["success", "error", "warn"].map((type) => [type, (text) => messages.push({ type, text })]));
  BC.util.warn = () => {};
  const element = dom.window.document.getElementById("root");
  const store = BC.SettingsUI.render(element, { getState: BC.cloneDefaults, save });
  return { dom, context, messages, element, store };
}
test("Apply waits for storage and displays an error without claiming success", async () => {
  const s = setup();
  try {
    s.store.previewTheme(s.context.BC.PRESET_THEMES.find((p) => p.category === "anime"));
    [...s.element.querySelectorAll("button")].find((b) => b.textContent === "Apply theme").click();
    await settle(); await settle();
    assert.equal(s.messages.some((m) => m.type === "success"), false);
    assert.match(s.messages.find((m) => m.type === "error").text, /could not be saved/);
    const alert = s.element.querySelector('[role="alert"]');
    assert.equal(alert.hidden, false); assert.match(alert.textContent, /Quota exceeded/);
  } finally { s.store.destroy(); s.dom.window.close(); }
});
test("settings import waits for storage and reports its failure without a success toast", async () => {
  const s = setup();
  try {
    let items, input;
    s.context.BC.ui.menu = (_button, values) => { items = values; };
    s.element.querySelector('[aria-label="More actions"]').click();
    const create = s.dom.window.document.createElement.bind(s.dom.window.document);
    s.dom.window.document.createElement = (tag, ...args) => {
      const node = create(tag, ...args);
      if (tag === "input") { input = node; node.click = () => {}; }
      return node;
    };
    items.find((item) => item.label.startsWith("Import settings")).onClick();
    Object.defineProperty(input, "files", { value: [{ text: async () => '{"version":5,"enabled":false}' }] });
    input.onchange(); await settle(); await settle();
    assert.equal(s.messages.some((m) => m.type === "success"), false);
    assert.match(s.messages.find((m) => m.type === "error").text, /could not be imported.*Quota exceeded/);
  } finally { s.store.destroy(); s.dom.window.close(); }
});
test("theme import and Save current look report failed persistence", async () => {
  const s = setup();
  try {
    let input;
    const create = s.dom.window.document.createElement.bind(s.dom.window.document);
    s.dom.window.document.createElement = (tag, ...args) => {
      const node = create(tag, ...args);
      if (tag === "input") { input = node; node.click = () => {}; }
      return node;
    };
    [...s.element.querySelectorAll("button")].find((b) => b.textContent.trim() === "Import").click();
    Object.defineProperty(input, "files", { value: [{ text: async () => '{"name":"My theme","settings":{"theming":{"darkMode":"on"}}}' }] });
    input.onchange(); await settle(); await settle();
    assert.match(s.messages.find((m) => m.type === "error").text, /Theme could not be imported.*Quota exceeded/);
    [...s.element.querySelectorAll("button")].find((b) => b.textContent.trim() === "Save current look").click();
    await settle(); await settle();
    assert.equal(s.messages.some((m) => m.type === "success"), false);
    assert.match(s.messages.at(-1).text, /Theme could not be saved.*Quota exceeded/);
  } finally { s.store.destroy(); s.dom.window.close(); }
});


test("quota rejection keeps the settings edit, error and automatic retry value", async () => {
  const db = require("./storage-harness.cjs").database();
  const page = domContext('<div id="root"></div>', { chrome: db.client().chrome });
  let store;
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json")));
    load(page.context, ...manifest.content_scripts[0].js.filter((file) => file !== "src/content/content.js"), ...settingsUIFiles());
    const BC = page.context.BC;
    BC.util.warn = () => {};
    await BC.storage.load();
    db.fail("Quota exceeded");
    store = BC.SettingsUI.render(page.dom.window.document.getElementById("root"), {
      getState: () => BC.storage.current, save: (s) => BC.storage.save(s),
      subscribe: (fn) => BC.storage.subscribe(fn), preview: (s) => BC.storage.adopt(s),
    });
    store.set((d) => { d.enabled = false; });
    await assert.rejects(store.flush(), /Quota exceeded/);
    await settle();
    assert.equal(store.get().enabled, false);
    assert.equal(BC.storage.current.enabled, false);
    assert.match(store.saveError.message, /Quota exceeded/);
    const alert = page.dom.window.document.querySelector('[role="alert"]');
    assert.equal(alert.hidden, false); assert.match(alert.textContent, /Quota exceeded/);
    await settle();
    assert.equal(store.get().enabled, false);
    assert.equal(alert.hidden, false);
    db.fail(null);
    // Exercise the scheduled retry rather than initiating another editor save.
    for (let i = 0; i < 100 && db.data.bcSettings?.enabled !== false; i++) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(db.data.bcSettings.enabled, false);
    assert.equal(store.get().enabled, false);
    assert.equal(BC.storage.current.enabled, false);
    assert.equal(store.saveError, null);
    assert.equal(alert.hidden, true);
  } finally { store?.destroy(); page.dom.window.close(); }
});
test("Save current look leaves out the settings a theme keeps", async () => {
  const s = setup(async (state) => state);
  try {
    s.store.set((d) => { d.theming.reducedMotion = true; d.theming.fontSizeScale = "xl"; d.theming.logo.mode = "hide"; d.theming.accentColor = "#ff0000"; });
    [...s.element.querySelectorAll("button")].find((b) => b.textContent.trim() === "Save current look").click();
    await s.store.flush();
    const saved = s.store.get().customThemes[0].settings.theming;
    assert.equal(saved.accentColor, "#ff0000");
    for (const key of s.context.BC.THEME_KEEPS) assert.equal(Object.hasOwn(saved, key), false, key);
  } finally { s.store.destroy(); s.dom.window.close(); }
});
test("Dashboard course rows show the stored colour and hidden state as soon as they load", async () => {
  const { dom, context } = domContext('<div id="root"></div>', { chrome: { runtime: { getURL: (s) => s }, storage: { onChanged: { addListener() {} } } } });
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json")));
  load(context, ...manifest.content_scripts[0].js.filter((file) => file !== "src/content/content.js"), ...settingsUIFiles());
  const BC = context.BC, state = BC.cloneDefaults();
  state.dashboard.courses["1"] = { hidden: true, color: "#ff0000" };
  const store = BC.SettingsUI.render(dom.window.document.getElementById("root"), {
    getState: () => state, save: async (s) => s,
    getCourses: async () => [{ id: "1", name: "Bio", code: "B1", color: "" }],
  }, { initialTab: "dashboard" });
  try {
    for (let i = 0; i < 5; i++) await settle();
    const row = dom.window.document.querySelector(".bcs-course");
    assert.equal(row.classList.contains("bcs-course--hidden"), true);
    assert.equal(row.querySelector(".bcs-course__swatch").style.background, "rgb(255, 0, 0)");
  } finally { store.destroy(); dom.window.close(); }
});

test("handing over after an update gives Canvas its clicks back when the settings panel was open", async () => {
  const db = require("./storage-harness.cjs").database();
  const chrome = db.client().chrome;
  chrome.runtime.onMessage = { addListener() {} };
  const page = domContext('<div id="bc-drawer" data-bc-node="bc-drawer" style="display: block"></div>', { chrome });
  try {
    page.dom.window.document.body.inert = true;   // a dead copy's open panel
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json")));
    load(page.context, ...manifest.content_scripts[0].js);
    assert.equal(page.dom.window.document.body.inert, false);
    assert.equal(page.dom.window.document.getElementById("bc-drawer"), null);
    let closed = 0;
    page.context.BC.features.settingsPanel.close = () => { closed++; };
    page.dom.window.dispatchEvent(new page.dom.window.CustomEvent("bc:retire"));
    assert.equal(closed, 1, "a live copy closes its panel before stepping aside");
  } finally { page.dom.window.close(); }
});

test("picking a light palette after a light scene shows that palette", async () => {
  const s = setup(async (state) => state);
  try {
    s.store.set((d) => { d.theming.lightBg = "#b4ced4"; });
    s.context.BC.SettingsUI.goto("theming");
    const select = s.element.querySelector('[aria-label="Light palette"]');
    const pick = select.tagName === "SELECT" ? select : select.querySelector("select");
    pick.value = "ocean"; pick.dispatchEvent(new s.dom.window.Event("change", { bubbles: true }));
    assert.equal(s.store.get().theming.lightPreset, "ocean");
    assert.equal(s.store.get().theming.lightBg, "");
  } finally { s.store.destroy(); s.dom.window.close(); }
});



test("reordering a filtered course list keeps the other courses where they were", async () => {
  const { dom, context } = domContext('<div id="root"></div>', { chrome: { runtime: { getURL: (s) => s }, storage: { onChanged: { addListener() {} } } } });
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json")));
  load(context, ...manifest.content_scripts[0].js.filter((file) => file !== "src/content/content.js"), ...settingsUIFiles());
  const BC = context.BC;
  BC.util.warn = () => {};
  const state = BC.cloneDefaults();
  state.dashboard.courseOrder = ["1", "2", "3", "4"];
  const courses = [["1", "MATH 101"], ["2", "CS 1"], ["3", "BIO 1"], ["4", "CS 2"]].map(([id, name]) => ({ id, name, code: "" }));
  const store = BC.SettingsUI.render(dom.window.document.getElementById("root"), { getState: () => state, save: async () => {}, getCourses: async () => courses });
  try {
    BC.SettingsUI.goto("dashboard");
    await settle(); await settle();
    const filter = dom.window.document.querySelector('[aria-label="Filter courses"]');
    filter.value = "cs"; filter.dispatchEvent(new dom.window.Event("input"));
    const grips = dom.window.document.querySelectorAll(".bcs-courses .bcs-sortable__grip");
    assert.equal(grips.length, 2);
    grips[1].dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    assert.deepEqual(JSON.parse(JSON.stringify(store.get().dashboard.courseOrder)), ["1", "4", "3", "2"]);
  } finally { store.destroy(); dom.window.close(); }
});


test("the settings tabs skip their entrance animation when Reduce motion is on", async () => {
  const { dom, context } = domContext('<div id="root"></div>', { chrome: { runtime: { getURL: (s) => s }, storage: { onChanged: { addListener() {} } } } });
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json")));
  load(context, ...manifest.content_scripts[0].js.filter((file) => file !== "src/content/content.js"), ...settingsUIFiles());
  const BC = context.BC;
  BC.util.warn = () => {};
  const state = BC.cloneDefaults();
  state.theming.reducedMotion = true;
  const store = BC.SettingsUI.render(dom.window.document.getElementById("root"), { getState: () => state, save: async () => {} });
  try {
    BC.SettingsUI.goto("files");
    assert.equal(dom.window.document.querySelector(".bcs-main").classList.contains("bcs-main--still"), true);
  } finally { store.destroy(); dom.window.close(); }
});
