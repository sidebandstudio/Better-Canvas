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
