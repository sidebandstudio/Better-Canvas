/*
 * Better Canvas — background service worker.
 * Registers dynamic content scripts on user-granted custom Canvas domains.
 * Manages toolbar badge count. All content-side features run in the tab.
 */

// ChatGPT plan sign-in. Firefox loads it from the manifest's background scripts.
if (typeof importScripts === "function") importScripts("chatgpt.js");

const CONTENT_JS = [
  "src/shared/defaults.js",
  "src/shared/themes.js",
  "src/shared/theme-library.js",
  "src/shared/theme-scenes.js",
    "src/shared/theme-media.js",
  "src/content/core/util.js",
  "src/content/core/datetime.js",
  "src/content/core/color.js",
  "src/shared/tokens.js",
  "src/content/core/storage.js",
  "src/content/core/detect.js",
  "src/content/core/injector.js",
  "src/content/core/lifecycle.js",
  "src/content/core/icons.js",
  "src/content/core/darkengine.js",
  "src/content/core/ui.js",
  "src/content/core/cache.js",
  "src/content/core/api.js",
  "src/content/core/alarms.js",
  "src/content/core/toast.js",
  "src/content/core/shortcuts.js",
  "src/content/core/commandPalette.js",
    "src/shared/settings/studio.js",
  "src/content/features/theming.js",
  "src/content/features/cosmetics.js",
  "src/content/features/navigation.js",
  "src/content/features/dashboard.js",
  "src/content/features/todo.js",
  "src/content/features/grades.js",
  "src/content/features/notifications.js",
  "src/content/features/files.js",
  "src/content/features/announcements.js",
  "src/content/features/calendar.js",
  "src/content/features/previews.js",
  "src/content/features/productivity.js",
  "src/content/features/accessibility.js",
  "src/content/features/instructor.js",
  "src/content/features/quizsaver.js",
  "src/content/features/modules.js",
  "src/content/features/semester.js",
  "src/content/features/discussions.js",
  "src/content/features/insights.js",
  "src/content/features/syllabus.js",
  "src/content/features/rotation.js",
  "src/content/features/onboarding.js",
  "src/content/features/settings-panel.js",
  "src/content/core/observer.js",
  "src/content/content.js",
];

// Only the settings workspace needs these, about 290 KB, so they load on first use
// instead of on every Canvas page. studio.js stays in CONTENT_JS: the planner
// draws its progress shapes with it.
const SETTINGS_UI_JS = [
  "src/shared/theme-artwork.js",
  "src/shared/settings/state.js",
  "src/shared/settings/components.js",
  "src/shared/settings/index.js",
];

const FRAME_JS = [
  "src/shared/defaults.js",
  "src/shared/themes.js",
  "src/content/core/datetime.js",
  "src/content/core/color.js",
  "src/shared/tokens.js",
  "src/content/core/darkengine.js",
  "src/content/frame.js",
];

const DYNAMIC_ID = "bc-dynamic";
const DYNAMIC_FRAME_ID = "bc-dynamic-frame";
const MENU_ID = "bc-add-task";
const BASE_PATTERNS = ["*://*.instructure.com/*"];

// Granted hosts that aren't Canvas: the theme library, and the loopback and
// OpenAI addresses ChatGPT sign-in asks for. Better Canvas must never run on them.
const NOT_CANVAS = /^[^:]+:\/\/(api\.openverse\.org|127\.0\.0\.1|auth\.openai\.com|api\.openai\.com)\//;
function customOrigins(origins) {
  return (origins || []).filter((o) => !/instructure\.com/.test(o) && !NOT_CANVAS.test(o));
}

// The "add this as a task" menu was limited to *.instructure.com, so it never
// appeared on a custom school domain even after access was granted there.
function syncMenuPatterns(matches) {
  try {
    chrome.contextMenus.update(MENU_ID, { documentUrlPatterns: BASE_PATTERNS.concat(matches) },
      () => void chrome.runtime.lastError);
  } catch (_) {}
}

async function syncRegistration() {
  try {
    const perms = await chrome.permissions.getAll();
    const matches = customOrigins(perms.origins);
    syncMenuPatterns(matches);
    const ids = [DYNAMIC_ID, DYNAMIC_FRAME_ID];
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids });
    if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: existing.map((s) => s.id) });
    if (!matches.length) return;
    await chrome.scripting.registerContentScripts([
      {
        id: DYNAMIC_ID, js: CONTENT_JS, matches,
        runAt: "document_start", allFrames: false, persistAcrossSessions: true,
      },
      {
        id: DYNAMIC_FRAME_ID, js: FRAME_JS, matches,
        runAt: "document_start", allFrames: true, matchOriginAsFallback: true, persistAcrossSessions: true,
      },
    ]);
  } catch (e) { console.warn("[Better Canvas] registration sync failed", e); }
}

chrome.runtime.onInstalled.addListener(syncRegistration);

// Tabs that were open during an update keep running the old copy (cut off from the
// extension) until they're refreshed. Inject the new one; it asks the old one to
// step aside, so the tab switches over without a reload.
async function reinjectOpenTabs(details) {
  if (!details || (details.reason !== "update" && details.reason !== "install")) return;
  try {
    const perms = await chrome.permissions.getAll();
    // customOrigins also leaves out the Openverse API, which isn't a Canvas page.
    const tabs = await chrome.tabs.query({ url: ["*://*.instructure.com/*"].concat(customOrigins(perms.origins)) });
    for (const t of tabs) {
      if (t.discarded || !t.id) continue;
      try {
        // A copy from THIS install already answers; nothing to do.
        const alive = await new Promise((res) => {
          try { chrome.tabs.sendMessage(t.id, { type: "bc:ping" }, (r) => { void chrome.runtime.lastError; res(!!r); }); }
          catch (_) { res(false); }
        });
        if (alive) continue;
        // A copy from before the handover existed can't be asked to step aside, and
        // two copies would fight over the same stylesheets — that tab needs a refresh.
        const [probe] = await chrome.scripting.executeScript({ target: { tabId: t.id }, func: () => ({
          old: !!document.querySelector("style[data-better-canvas]"),
          handover: document.documentElement.hasAttribute("data-bc-handover"),
        }) });
        if (probe && probe.result && probe.result.old && !probe.result.handover) continue;
        await chrome.scripting.executeScript({ target: { tabId: t.id }, files: CONTENT_JS });
        await chrome.scripting.executeScript({ target: { tabId: t.id, allFrames: true }, files: FRAME_JS });
      } catch (_) { /* a tab mid-navigation or an error page; it'll load fresh anyway */ }
    }
  } catch (_) {}
}
chrome.runtime.onInstalled.addListener(reinjectOpenTabs);
chrome.runtime.onStartup.addListener(syncRegistration);
if (chrome.permissions && chrome.permissions.onAdded) chrome.permissions.onAdded.addListener(syncRegistration);
if (chrome.permissions && chrome.permissions.onRemoved) chrome.permissions.onRemoved.addListener(syncRegistration);

// Only this fixed public endpoint is reachable through the theme message. Never
// proxy a caller-supplied URL or send Canvas session cookies to the image source.
const themeSearchCache = new Map();
const themeSearchPending = new Map();
async function searchThemeImages(msg) {
  const query = typeof msg.query === "string" ? msg.query.trim().slice(0, 120) : "";
  const page = Math.min(20, Math.max(1, Number(msg.page) | 0));
  if (!query) throw new Error("Enter something to search for.");
  const key = query.toLowerCase() + ":" + page;
  const cached = themeSearchCache.get(key);
  if (!msg.refresh && cached && Date.now() - cached.at < 600000) return cached.data;
  if (themeSearchPending.has(key)) return themeSearchPending.get(key);
  const request = (async () => {
    const params = new URLSearchParams({ q: query, page: String(page), page_size: "20",
      license: "cc0,pdm,by,by-sa", mature: "false", aspect_ratio: "wide", filter_dead: "true" });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch("https://api.openverse.org/v1/images/?" + params, {
        credentials: "omit", referrerPolicy: "no-referrer", signal: controller.signal,
      });
      if (response.status === 429) throw new Error("The image library is busy. Wait a minute, then try again.");
      if (!response.ok) throw new Error("The image library is unavailable. Try again shortly.");
      const body = await response.json();
      if (!Array.isArray(body.results)) throw new Error("The image library returned an invalid response.");
      const data = { ok: true, results: body.results.slice(0, 20), page,
        pages: Math.min(20, Math.max(0, Number(body.page_count) || 0)), total: Math.max(0, Number(body.result_count) || 0) };
      themeSearchCache.set(key, { at: Date.now(), data });
      if (themeSearchCache.size > 30) themeSearchCache.delete(themeSearchCache.keys().next().value);
      return data;
    } finally { clearTimeout(timer); }
  })();
  themeSearchPending.set(key, request);
  try { return await request; } finally { themeSearchPending.delete(key); }
}

// One writer per extension. Every request rereads persisted state; worker restarts
// need no in-memory revision or tombstone recovery. Failures do not stall the queue.
let storageWrites = Promise.resolve();
function storageCall(method, value) {
  return new Promise((resolve, reject) => {
    let finished = false;
    const done = (result) => {
      if (finished) return;
      finished = true;
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message)); else resolve(result);
    };
    try {
      const promise = chrome.storage.local[method](value, done);
      if (promise?.then) promise.then(done, reject);
    } catch (error) { reject(error); }
  });
}
async function storageHash(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value ?? null));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
// Compute tokens in the extension origin, where Web Crypto is available even
// when a content script runs on a school's HTTP development instance.
async function readLocalSnapshot(msg) {
  const values = await storageCall("get", msg.migrate ? ["bcLocal", "bcSettings"] : ["bcLocal"]);
  return { ok: true, values, base: await storageHash(values.bcLocal),
    ...(msg.migrate ? { settingsBase: await storageHash(values.bcSettings) } : {}) };
}
async function commitLocal(msg) {
  if (!msg.value || typeof msg.value !== "object" || Array.isArray(msg.value)) throw new Error("Invalid local data");
  const migrating = Object.hasOwn(msg, "settings");
  const stored = await storageCall("get", migrating ? ["bcLocal", "bcSettings"] : ["bcLocal"]);
  if (msg.base !== await storageHash(stored.bcLocal) ||
      (migrating && msg.settingsBase !== await storageHash(stored.bcSettings))) return { ok: false, conflict: true };
  const values = { bcLocal: msg.value };
  if (migrating) values.bcSettings = msg.settings;
  await storageCall("set", values);
  return { ok: true };
}

// Study time arrives as small increments, often from a page that's unloading,
// so the worker adds them here instead of the page doing a read and a commit.
async function addStudyTime(msg) {
  const minutes = Number(msg.minutes);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(msg.ymd || "") || !/^(\d{1,20}|other)$/.test(msg.key || "") || !(minutes > 0 && minutes <= 60)) {
    throw new Error("Invalid study time");
  }
  const stored = await storageCall("get", ["bcLocal"]);
  const local = stored.bcLocal && typeof stored.bcLocal === "object" ? stored.bcLocal : {};
  const st = (local.studyTime = local.studyTime && typeof local.studyTime === "object" ? local.studyTime : {});
  const day = (st[msg.ymd] = st[msg.ymd] && typeof st[msg.ymd] === "object" ? st[msg.ymd] : {});
  day[msg.key] = +((Number(day[msg.key]) || 0) + minutes).toFixed(2);
  const days = Object.keys(st).sort();
  while (days.length > 60) delete st[days.shift()];
  await storageCall("set", { bcLocal: local });
  return { ok: true };
}

// Submitting a quiz navigates straight away. One message handled here can't be cut
// in half by that the way a read-then-commit round trip from the page could.
async function clearQuizDrafts(msg) {
  const root = String(msg.root || "");
  if (!/^\/courses\/\d+\/quizzes\/\d+$/.test(root)) throw new Error("Invalid quiz");
  const stored = await storageCall("get", ["bcLocal"]);
  const drafts = stored.bcLocal && stored.bcLocal.quizDrafts;
  if (!drafts || typeof drafts !== "object") return { ok: true };
  const keys = Object.keys(drafts).filter((k) => k === root || k.startsWith(root + "/") || k.startsWith(root + "#"));
  if (!keys.length) return { ok: true };
  for (const k of keys) delete drafts[k];
  await storageCall("set", { bcLocal: stored.bcLocal });
  return { ok: true };
}

async function readSettingsSnapshot() {
  const values = await storageCall("get", ["bcSettings"]);
  return { ok: true, value: values.bcSettings, base: await storageHash(values.bcSettings) };
}
async function commitSettings(msg) {
  if (!msg.value || typeof msg.value !== "object" || Array.isArray(msg.value)) throw new Error("Invalid settings");
  const stored = await storageCall("get", ["bcSettings"]);
  if (msg.base !== await storageHash(stored.bcSettings)) return { ok: false, conflict: true };
  await storageCall("set", { bcSettings: msg.value });
  return { ok: true };
}

// Messages from Canvas tabs and the options page.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender?.id !== chrome.runtime.id) { sendResponse({ ok: false, error: "Untrusted message sender" }); return; }
  if (!msg || !msg.type) return;
  if (msg.type === "bc:localRead" || msg.type === "bc:settingsRead") {
    (msg.type === "bc:settingsRead" ? readSettingsSnapshot() : readLocalSnapshot(msg)).then(sendResponse, (error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (["bc:localCommit", "bc:settingsCommit", "bc:studyTime", "bc:quizSubmitted"].includes(msg.type)) {
    const result = storageWrites.then(() => msg.type === "bc:settingsCommit" ? commitSettings(msg)
      : msg.type === "bc:studyTime" ? addStudyTime(msg) : msg.type === "bc:quizSubmitted" ? clearQuizDrafts(msg) : commitLocal(msg));
    storageWrites = result.catch(() => {});
    result.then(sendResponse, (error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (msg.type === "bc:themeSearch") {
    searchThemeImages(msg).then(sendResponse, (e) => sendResponse({ ok: false, error:
      e.name === "AbortError" ? "The image library took too long. Try again." : e.message }));
    return true;
  }
  // Same isolated world as the page's content scripts, so the files join their BC.
  if (msg.type === "bc:loadSettingsUI") {
    if (!sender.tab || sender.tab.id == null) { sendResponse({ ok: false, error: "Settings open only in a Canvas tab" }); return; }
    chrome.scripting.executeScript({ target: { tabId: sender.tab.id, frameIds: [sender.frameId || 0] }, files: SETTINGS_UI_JS })
      .then(() => sendResponse({ ok: true }), (e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg.type === "bc:syncRegistration") { syncRegistration().then(() => sendResponse({ ok: true })); return true; }
  // Content scripts can't open the options page themselves.
  if (msg.type === "bc:openOptions") {
    // A section opens that settings tab, e.g. ChatGPT, whose permission prompt only an extension page can show.
    if (/^[a-z]+$/.test(msg.section || "")) chrome.tabs.create({ url: chrome.runtime.getURL("src/options/options.html?section=" + msg.section) });
    else chrome.runtime.openOptionsPage();
    sendResponse({ ok: true }); return;
  }
  if (msg.type === "bc:setBadge") {
    try {
      const n = msg.count | 0;
      chrome.action.setBadgeText({ text: n > 0 ? String(n) : "" });
      chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
    } catch (_) {}
    sendResponse({ ok: true }); return;
  }
  if (msg.type === "bc:leftCanvas") { clearBadgeWithoutCanvas(); sendResponse({ ok: true }); return; }
});

// Only an open Canvas page refreshes the count. Once the last one closes or
// navigates away, the number would otherwise stay on the toolbar for days. The
// delay lets a navigating tab report its new address first.
function clearBadgeWithoutCanvas() {
  setTimeout(async () => {
    try {
      const perms = await chrome.permissions.getAll();
      const tabs = await chrome.tabs.query({ url: BASE_PATTERNS.concat(customOrigins(perms.origins)) });
      if (!tabs.length) await chrome.action.setBadgeText({ text: "" });
    } catch (_) {}
  }, 1000);
}
try { chrome.tabs.onRemoved.addListener(clearBadgeWithoutCanvas); } catch (_) {}

// The toolbar icon opens settings: the drawer on a Canvas page, the options page
// anywhere else. On a school's own Canvas address that isn't allowed yet, the
// options page offers to allow it. activeTab is what lets this read tab.url there.
async function openSettings(tab) {
  const opened = tab && tab.id != null && await new Promise((res) => {
    try { chrome.tabs.sendMessage(tab.id, { type: "bc:openSettings" }, (r) => { void chrome.runtime.lastError; res(!!(r && r.ok)); }); }
    catch (_) { res(false); }
  });
  if (opened) return;
  let url = null;
  try { url = new URL(tab.url); } catch (_) {}
  if (url && /^https?:$/.test(url.protocol) && !/(^|\.)instructure\.com$/.test(url.hostname) &&
      !(await chrome.permissions.contains({ origins: [url.protocol + "//" + url.hostname + "/*"] }))) {
    const query = new URLSearchParams({ enable: url.origin, tab: String(tab.id) });
    chrome.tabs.create({ url: chrome.runtime.getURL("src/options/options.html?" + query) });
    return;
  }
  chrome.runtime.openOptionsPage();
}
try { chrome.action.onClicked.addListener(openSettings); } catch (_) {}

// Right-click context menu: quick-add task
try {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "Better Canvas: add this as a task",
      contexts: ["page", "selection", "link"],
      documentUrlPatterns: BASE_PATTERNS,
    }, () => {
      void chrome.runtime.lastError;
      // onInstalled fires syncRegistration too, but possibly before this create()
      // lands — re-apply the custom-domain patterns once the item exists.
      chrome.permissions.getAll().then((p) => syncMenuPatterns(customOrigins(p.origins)), () => {});
    });
  });
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== MENU_ID || !tab || tab.id == null) return;
    // A callback, so a tab without the content script (a page still loading, or one
    // opened before install) doesn't surface as an unhandled rejection.
    chrome.tabs.sendMessage(tab.id, { type: "bc:addTaskFromContext", info }, () => void chrome.runtime.lastError);
  });
} catch (_) {}
