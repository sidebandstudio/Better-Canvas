const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const copy = (v) => JSON.parse(JSON.stringify(v));
function context() {
  const ctx = vm.createContext({ URL, console, setTimeout, clearTimeout, structuredClone });
  for (const file of ["defaults", "themes", "theme-library", "theme-scenes", "theme-artwork", "theme-media"]) {
    vm.runInContext(fs.readFileSync(path.join(root, "src/shared/" + file + ".js"), "utf8"), ctx);
  }
  return ctx;
}

test("every preset stays readable after the user flips dark mode, and old scene colours are repaired", () => {
  const ctx = context();
  for (const file of ["src/content/core/color.js", "src/shared/tokens.js"]) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), ctx);
  const { BC } = ctx, C = BC.color;
  for (const p of BC.PRESET_THEMES) {
    const t = { ...BC.defaults.theming, ...p.settings.theming };
    const r = BC.tokens.resolve(t)[t.darkMode === "on" ? "light" : "dark"];
    for (const surface of ["surface-1", "surface-2"]) assert.ok(C.contrastRatio(r.text, r[surface]) >= 4.5, p.id + " " + surface);
  }
  const equal = (experience, bg) => ({ experience, darkBg: bg, lightBg: bg });
  const saved = BC.mergeDefaults({ version: 5, theming: equal("woodland", "#102f2b"), customThemes: [{ id: "t", settings: { theming: equal("gallery", "#efe2c8") } }] });
  assert.equal(saved.theming.darkBg, "#102f2b");
  assert.equal(saved.theming.lightBg, "");
  assert.equal(saved.customThemes[0].settings.theming.darkBg, "");
  assert.equal(saved.customThemes[0].settings.theming.lightBg, "#efe2c8");
  // The repair runs once. A later choice of the same colour for both modes stays.
  const chosen = BC.mergeDefaults({ version: BC.SETTINGS_VERSION, theming: equal("gallery", "#efe2c8") });
  assert.equal(chosen.theming.darkBg, "#efe2c8");
});

test("font stacks with an unclosed quote are refused so they can't swallow later rules", () => {
  const ctx = context();
  for (const file of ["src/content/core/color.js", "src/shared/tokens.js"]) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), ctx);
  const safe = (v) => ctx.BC.tokens.safeFontStack(v);
  assert.equal(safe('"Segoe UI", Inter, sans-serif'), '"Segoe UI", Inter, sans-serif');
  assert.equal(safe("'Open Sans', serif"), "'Open Sans', serif");
  assert.equal(safe('"Segoe UI, sans-serif'), "");
  assert.equal(safe("Inter'"), "");
  assert.equal(safe("Inter; } html{display:none}"), "");
});

test("cursor settings draw the chosen shape, read the old Large value and survive theme changes", () => {
  const ctx = context();
  for (const file of ["src/content/core/color.js", "src/shared/tokens.js"]) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), ctx);
  const { BC } = ctx;
  assert.deepEqual(copy(BC.tokens.cursor({ cursor: "default" })), { shape: "default", css: "" });
  const legacy = BC.tokens.cursor({ cursor: "large" });
  assert.equal(legacy.shape, "arrow");
  assert.match(legacy.css, /^url\("data:image\/svg\+xml,[^"]+"\) 2 2, auto$/);
  const ring = BC.tokens.cursor({ cursor: "ring", cursorSize: 99, cursorColor: "#fff" });
  assert.match(decodeURIComponent(ring.src), /width='48'.*stroke='#000000'.*stroke='#ffffff'/);
  assert.match(ring.css, / 24 24, auto$/);
  assert.match(BC.tokens.cursor({ cursor: "precise" }).css, /, crosshair$/);
  assert.equal(BC.tokens.cursor({ cursor: "<script>" }).shape, "default");
  assert.doesNotMatch(decodeURIComponent(BC.tokens.cursor({ cursor: "dot", cursorColor: "red'/><script>" }).src), /script|red/);
  const state = BC.cloneDefaults();
  Object.assign(state.theming, { cursor: "dot", cursorSize: 40, cursorColor: "#db2777", focusRing: "bold" });
  BC.applyTheme(state, BC.PRESET_THEMES.find((p) => p.id === "rose"));
  assert.deepEqual([state.theming.cursor, state.theming.cursorSize, state.theming.cursorColor, state.theming.focusRing], ["dot", 40, "#db2777", "bold"]);
});

test("switching themes replaces image overrides, preserves course data and rotation", () => {
  const { BC } = context(), state = BC.cloneDefaults();
  state.dashboard.courses = { "1": { nickname: "Biology", hidden: true, note: "Keep", bgImage: "https://old.example/image.jpg" } };
  const courses = state.dashboard.courses, rotation = state.theming.rotation;
  Object.assign(rotation, { enabled: true, themeIds: ["nord", "rose"] });
  state.theming.reducedMotion = true;
  state.theming.darkBg = "#123456";
  state.theming.highContrast = true;
  state.cosmetics.background = { mode: "image", image: "https://old.example/page.jpg" };
  BC.applyTheme(state, BC.PRESET_THEMES.find((p) => p.id === "rose"));
  assert.equal(state.dashboard.courses, courses);
  assert.deepEqual(copy(courses["1"]), { nickname: "Biology", hidden: true, note: "Keep" });
  assert.equal(state.dashboard.themeImages.length, 3);
  assert.equal(state.theming.rotation, rotation);
  assert.equal(rotation.enabled, true);
  assert.equal(state.theming.reducedMotion, true);
  assert.equal(state.theming.highContrast, false);
  assert.equal(state.theming.darkBg, "");
  assert.equal(state.cosmetics.background.mode, "none");
  BC.applyTheme(state, BC.PRESET_THEMES[0]);
  assert.equal(state.dashboard.themeImages.length, 0);
});

test("shared theme imports round-trip artwork and credits without accepting course/account settings", () => {
  const { BC } = context();
  const p = BC.PRESET_THEMES.find((p) => p.id === "photos-space");
  const source = copy(p.settings);
  source.dashboard.courses = { "1": { hidden: true, nickname: "Unwanted" } };
  source.enabled = false;
  source.theming.rotation = { enabled: true };
  const result = BC.themeOnly(source);
  assert.deepEqual(copy(result.dashboard), copy(p.settings.dashboard));
  assert.equal(result.theming.rotation, undefined);
  assert.equal(result.enabled, undefined);
  const state = BC.cloneDefaults();
  BC.applyTheme(state, { settings: result });
  assert.deepEqual(copy(state.dashboard.themeImages), copy(p.settings.dashboard.themeImages));
  assert.equal(state.enabled, true);
  assert.ok(state.dashboard.themeImages[0].source);
});

test("course artwork assignment survives ordering changes and applies to new courses", () => {
  const { BC } = context(), images = [{ url: "a" }, { url: "b" }, { url: "c" }];
  const before = Object.fromEntries(["123", "456", "789"].map((id) => [id, BC.themeImageForCourse(images, id)]));
  for (const id of ["789", "456", "123"]) assert.equal(BC.themeImageForCourse(images, id), before[id]);
  assert.ok(BC.themeImageForCourse(images, "new-course"));
  assert.equal(BC.themeImageForCourse([], "123"), null);
});

test("featured library has distinct themes across all six categories with image credits", () => {
  const { BC } = context();
  const complete = BC.PRESET_THEMES.filter((p) => !p.classic);
  assert.equal(complete.length, 22);
  assert.equal(new Set(BC.PRESET_THEMES.map((p) => p.id)).size, BC.PRESET_THEMES.length);
  for (const category of BC.themeLibrary.categories) {
    const items = complete.filter((p) => p.category === category.id);
    assert.ok(items.length >= 2);
    for (const p of items) {
      assert.ok(p.settings.dashboard.themeImages.length >= 32);
      assert.equal(new Set(p.settings.dashboard.themeImages.map((i) => i.url)).size, p.settings.dashboard.themeImages.length);
      assert.equal(p.settings.cosmetics.background.mode, "image");
      assert.equal(p.settings.cosmetics.background.opacity, 100);
      assert.ok(p.settings.theming.experience);
      assert.ok(JSON.stringify(p).length < 1500000, "theme fits in local storage with saved copies");
      if (p.id.startsWith("photos-")) {
        const image = p.settings.dashboard.themeImages[0];
        assert.ok(image.title && image.license && image.source && image.licenseUrl);
      }
    }
  }
});

test("online image data is validated and markup never becomes executable theme code", () => {
  const ctx = context(), { BC } = ctx;
  const image = { id: "12345678-1234-1234-1234-123456789abc", title: "<img src=x onerror=alert(1)>Lake", creator: "A",
    url: "https://images.example.org/lake.jpg", foreign_landing_url: "https://example.org/photo", license: "cc0", license_url: "https://creativecommons.org/publicdomain/zero/1.0/" };
  assert.equal(BC.themeLibrary.normalize(image).title, "Lake");
  for (const change of [{ mature: true }, { url: "javascript:alert(1)" }, { url: "https://127.0.0.1/a" },
    { url: "https://local.internal/a" }, { id: "../../foo" }, { license: "unknown" }]) {
    assert.equal(BC.themeLibrary.normalize({ ...image, ...change }), null);
  }
  const source = JSON.parse('{"theming":{"__proto__":{"polluted":true}},"dashboard":{"themeImages":[{"url":"javascript:alert(1)"}]}}');
  const state = BC.cloneDefaults();
  BC.applyTheme(state, { settings: source });
  assert.equal(vm.runInContext("Object.prototype.polluted", ctx), undefined);
  assert.equal(state.dashboard.themeImages.length, 0);
});

test("image themes retain deterministic IDs and include wallpaper by default", () => {
  const { BC } = context(), image = { url: "https://images.example.org/a.jpg" };
  const a = BC.themeLibrary.makeTheme([image], { dark: false, background: true, category: "city" });
  const b = BC.themeLibrary.makeTheme([image], { dark: false, background: true, category: "city" });
  assert.equal(a.id, b.id);
  assert.equal(a.settings.theming.darkMode, "off");
  assert.equal(a.settings.cosmetics.background.image, image.url);
  const c = BC.themeLibrary.makeTheme([image], { dark: true });
  assert.notEqual(a.id, c.id);
  assert.equal(c.settings.cosmetics.background.mode, "image");
  assert.equal(BC.themeLibrary.makeTheme([image], { background: false }).settings.cosmetics.background.mode, "none");
});

test("course assignment resolves hash collisions without repeats and ignores display order", () => {
  const { BC } = context();
  const pool = BC.PRESET_THEMES.find((p) => p.id === "scene-woodland").settings.dashboard.themeImages;
  const ids = Array.from({ length: 48 }, (_, i) => String(100 + i * 48));
  const a = BC.assignThemeImages(pool, ids), b = BC.assignThemeImages(pool, ids.slice().reverse());
  assert.equal(new Set(Array.from(a.values(), (i) => i.url)).size, 48);
  for (const id of ids) assert.equal(a.get(id), b.get(id));
  assert.equal(BC.assignThemeImages([], ids).size, 0);
  assert.equal(BC.themeImages([pool[0], pool[0], pool[1]]).length, 2);
});

test("full themes reset completely to defaults, preserve course preferences and round-trip", () => {
  const { BC } = context(), s = BC.cloneDefaults();
  s.dashboard.layout = "list"; s.dashboard.courseOrder = ["3", "2"];
  BC.applyTheme(s, BC.PRESET_THEMES.find((p) => p.id === "scene-gallery"));
  const imported = BC.themeOnly(copy(s));
  assert.equal(imported.theming.experience, "gallery");
  assert.equal(imported.dashboard.themeImages.length, 48);
  assert.equal(s.dashboard.layout, "list");
  BC.applyTheme(s, BC.PRESET_THEMES.find((p) => p.id === "bc-default"));
  assert.equal(s.theming.experience, "");
  assert.equal(s.theming.lightBg, "");
  assert.equal(s.cosmetics.background.mode, "none");
  assert.equal(s.dashboard.themeImages.length, 0);
  assert.deepEqual(copy(s.dashboard.courseOrder), ["3", "2"]);
});

test("applying a theme keeps custom CSS, the logo choice, sidebar width and dark schedule", () => {
  const { BC } = context(), s = BC.cloneDefaults();
  s.cosmetics.customCss = "a{color:red}";
  s.theming.logo = { mode: "text", url: "", text: "NEU" };
  s.theming.sidebarWidth = 220;
  s.theming.darkSchedule = { start: "18:00", end: "06:30" };
  for (const id of ["scene-gallery", "bc-default"]) BC.applyTheme(s, BC.PRESET_THEMES.find((p) => p.id === id));
  assert.equal(s.cosmetics.customCss, "a{color:red}");
  assert.deepEqual(copy(s.theming.logo), { mode: "text", url: "", text: "NEU" });
  assert.equal(s.theming.sidebarWidth, 220);
  assert.deepEqual(copy(s.theming.darkSchedule), { start: "18:00", end: "06:30" });
  BC.applyTheme(s, { settings: { cosmetics: { customCss: "b{color:blue}" } } });
  assert.equal(s.cosmetics.customCss, "b{color:blue}");
});

test("automatic rotation applies image collections without disabling future rotation", async () => {
  const ctx = context(), { BC } = ctx, state = BC.cloneDefaults();
  const theme = BC.PRESET_THEMES.find((p) => p.name === "Deep Space");
  state.theming.rotation = { enabled: true, mode: "daily", themeIds: [theme.id] };
  let feature, writes = 0;
  BC.registry = { register: (f) => { feature = f; } };
  BC.storage = { local: {}, updateLocal: async (fn) => fn(BC.storage.local), update: async (fn) => { writes++; fn(state); } };
  BC.toast = { info() {} }; BC.diag = { push(_, e) { throw e; } };
  vm.runInContext(fs.readFileSync(path.join(root, "src/content/features/rotation.js"), "utf8"), ctx);
  feature.apply(state);
  await new Promise((r) => setImmediate(r));
  assert.equal(state.dashboard.themeImages.length, 48);
  assert.equal(state.theming.rotation.enabled, true);
  feature.apply(state);
  await new Promise((r) => setImmediate(r));
  assert.equal(writes, 1);
});

test("rotation to a deleted saved theme writes once and then waits for the next period", async () => {
  const ctx = context(), { BC } = ctx, state = BC.cloneDefaults();
  state.theming.rotation = { enabled: true, mode: "daily", themeIds: ["u-deleted"] };
  let feature, writes = 0;
  BC.registry = { register: (f) => { feature = f; } };
  BC.storage = { local: {}, updateLocal: async (fn) => fn(BC.storage.local), update: async (fn) => { writes++; fn(state); } };
  BC.toast = { info() {} }; BC.diag = { push(_, e) { throw e; } };
  vm.runInContext(fs.readFileSync(path.join(root, "src/content/features/rotation.js"), "utf8"), ctx);
  for (let i = 0; i < 3; i++) { feature.apply(state); await new Promise((r) => setImmediate(r)); }
  assert.equal(writes, 1);
});

function background(fetch) {
  const handlers = [];
  const event = { addListener() {} };
  const chrome = { runtime: { id: "test", onMessage: { addListener: (h) => handlers.push(h) }, onInstalled: event, onStartup: event },
    permissions: { onAdded: event, onRemoved: event }, contextMenus: { onClicked: event }, tabs: {} };
  const ctx = vm.createContext({ chrome, fetch, URLSearchParams, AbortController, console, setTimeout, clearTimeout });
  vm.runInContext(fs.readFileSync(path.join(root, "src/background/service-worker.js"), "utf8"), ctx);
  return { ctx, message: (msg) => new Promise((resolve) => handlers.at(-1)(msg, { id: "test" }, resolve)) };
}

test("theme API requests use a fixed public endpoint, omit credentials and cache/dedupe searches", async () => {
  const calls = [], pending = [];
  const bg = background((url, options) => { calls.push({ url, options }); return new Promise((resolve) => pending.push(resolve)); });
  const msg = { type: "bc:themeSearch", query: "space", page: 1, url: "https://untrusted.example" };
  const a = bg.message(msg), b = bg.message(msg);
  assert.equal(calls.length, 1);
  const url = new URL(calls[0].url);
  assert.equal(url.origin, "https://api.openverse.org");
  assert.equal(url.searchParams.get("mature"), "false");
  assert.equal(calls[0].options.credentials, "omit");
  assert.equal(calls[0].options.referrerPolicy, "no-referrer");
  pending[0]({ ok: true, json: async () => ({ results: [], page_count: 100, result_count: 2000 }) });
  assert.equal((await a).pages, 20); await b;
  await bg.message(msg); assert.equal(calls.length, 1);
  const refresh = bg.message({ ...msg, refresh: true });
  assert.equal(calls.length, 2);
  pending[1]({ ok: true, json: async () => ({ results: [], page_count: 0 }) }); await refresh;
  assert.deepEqual(copy(vm.runInContext('customOrigins(["https://api.openverse.org/*", "*://*.instructure.com/*", "https://school.example/*"])', bg.ctx)), ["https://school.example/*"]);
});

test("theme API failures and rate limits reach the gallery as recoverable errors", async () => {
  const bg = background(async () => ({ ok: false, status: 429 }));
  const result = await bg.message({ type: "bc:themeSearch", query: "nature" });
  assert.equal(result.ok, false);
  assert.match(result.error, /Wait a minute/);
  const empty = await bg.message({ type: "bc:themeSearch", query: " " });
  assert.match(empty.error, /Enter something/);
});
