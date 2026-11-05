/* Better Canvas - full-window Edit Canvas workspace. Canvas is never reparented or scaled. */
(function () {
  "use strict";
  const BC = globalThis.BC = globalThis.BC || {};
  BC.features = BC.features || {};
  const DRAWER_ID = "bc-drawer";
  let drawerHost, shadow, store, isOpen = false, returnFocus, wasInert = false;
  function makeAdapter() {
    return {
      getState() { return BC.storage.current || BC.cloneDefaults(); },
      save(s, options) { return BC.storage.save(s, undefined, options); },
      // Same JS realm as applyAll, so a change can be reflected on the page in the
      // same frame rather than after the save debounce plus a storage round-trip.
      preview(s, theme) { BC.storage.adopt(s, theme); if (BC.applyNow) BC.applyNow(); },
      subscribe(cb) { return BC.storage.subscribe(cb); },
      // Export/import must round-trip bcLocal too, since planner metadata lives
      // there rather than inside settings.
      getLocal() { return BC.storage.loadLocal().then(() => BC.storage.local); },
      saveLocal(obj) { return BC.storage.saveLocal(obj); },
      updateLocal(mutator) { return BC.storage.updateLocal(mutator); },
      openOptions() { try { chrome.runtime.sendMessage({ type: "bc:openOptions" }, () => void chrome.runtime.lastError); } catch (_) {} },
      getCourses: () => BC.api.dashboardCards().then((cards) => cards.map((c) => ({ id: String(c.id), name: c.shortName || c.originalName || c.courseCode || ("Course " + c.id), code: c.courseCode || "", color: c.color || "" }))),
      getGpaData: () => BC.api.coursesWithScores().then((courses) => courses.map((c) => {
        const enr = (c.enrollments || [])[0] || {};
        return { id: String(c.id), name: c.name || c.course_code || ("Course " + c.id), score: BC.api.courseScore(c), concluded: c.concluded === true || enr.enrollment_state === "completed" };
      })),
    };
  }

  function installNavItem() {
    const menu = document.querySelector("#menu");
    if (!menu) return;
    if (document.getElementById("bc-open-settings")) return;
    const li = document.createElement("li");
    li.className = "ic-app-header__menu-list-item";
    li.setAttribute("data-bc-node", "bc-nav-open");
    const a = document.createElement("a");
    a.id = "bc-open-settings";
    a.href = "#";
    a.className = "ic-app-header__menu-list-link";
    a.setAttribute("role", "button");
    a.setAttribute("aria-expanded", "false");
    a.setAttribute("aria-controls", DRAWER_ID);
    // <a role="button"> activates on Enter but not Space.
    a.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Spacebar") { e.preventDefault(); toggle(); }
    });
    a.innerHTML = `<div class="menu-item-icon-container" aria-hidden="true">
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
        <rect x="3" y="3" width="20" height="20" rx="6" stroke="currentColor" stroke-width="1.75"/>
        <path d="M9 9.5h4.2a2.1 2.1 0 0 1 0 4.2H9zm0 4.2h4.8a2.2 2.2 0 0 1 0 4.3H9z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
      </svg></div>
      <div class="menu-item__text">Better Canvas</div>`;
    a.addEventListener("click", (e) => { e.preventDefault(); toggle(); });
    // Building the panel on hover means the click only has to animate it.
    const warm = () => {
      if (!drawerHost || !drawerHost.isConnected) loadUI().then(() => BC.util.guard(ensureDrawer, "drawer warm-up"), () => {});
    };
    a.addEventListener("pointerenter", warm, { once: true });
    a.addEventListener("focus", warm, { once: true });
    li.appendChild(a);
    menu.appendChild(li);
  }


  // The workspace code isn't in the page bundle. The background injects it on
  // first use, and hovering the menu item starts that early.
  let loading = null;
  function loadUI() {
    if (BC.SettingsUI) return Promise.resolve();
    return loading || (loading = new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ type: "bc:loadSettingsUI" }, (r) => {
          const error = chrome.runtime.lastError;
          if (BC.SettingsUI) return resolve();
          loading = null;
          reject(new Error(error?.message || r?.error || "Settings did not load"));
        });
      } catch (e) { loading = null; reject(e); }
    }));
  }
  BC.loadSettingsUI = loadUI;

  function ensureDrawer() {
    if (drawerHost && drawerHost.isConnected) return drawerHost;
    // A theme still being tried would otherwise stay on the page with nothing to end it.
    if (store) { store.cancelThemePreview?.(); store.destroy(); }
    drawerHost = document.createElement("div");
    drawerHost.id = DRAWER_ID;
    drawerHost.setAttribute("data-bc-node", DRAWER_ID);
    drawerHost.style.cssText = "position:fixed;inset:0;z-index:2147482000;display:none;padding:12px;background:#10131bdd;box-sizing:border-box";
    document.documentElement.appendChild(drawerHost);
    shadow = drawerHost.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = ":host{all:initial}.frame{height:100%;width:100%;overflow:hidden;border-radius:22px;box-shadow:0 20px 80px #0005}.root{height:100%;min-height:0}@media(max-width:760px){.frame{border-radius:12px}}";
    const frame = document.createElement("div"); frame.className = "frame";
    frame.setAttribute("role", "dialog"); frame.setAttribute("aria-modal", "true"); frame.setAttribute("aria-label", "Better Canvas workspace");
    const root = document.createElement("div"); root.className = "root";
    frame.appendChild(root); shadow.append(style, frame);
    store = BC.SettingsUI.render(root, makeAdapter(), { onClose: close, variant: "studio" });
    BC.lifecycle.bag("settingsPanel-persist").once("keyboard", () => {
      document.addEventListener("keydown", (e) => {
        if (!isOpen) return;
        if (e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); close(); return; }
        if (e.key !== "Tab" || !e.composedPath().includes(drawerHost)) return;
        const nodes = [...shadow.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]')].filter((n) => n.getClientRects().length && n.tabIndex >= 0);
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && shadow.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && shadow.activeElement === last) { e.preventDefault(); first?.focus(); }
      });
    });
    return drawerHost;
  }
  function setExpanded(on) { document.getElementById("bc-open-settings")?.setAttribute("aria-expanded", String(on)); }
  // A close or second toggle while the first load runs cancels the open.
  let wantOpen = false;
  function open(tab) {
    if (!BC.SettingsUI) {
      wantOpen = true;
      loadUI().then(() => { if (wantOpen) open(tab); }, (e) => {
        if (!wantOpen) return;
        wantOpen = false;
        BC.diag.push("settings load", e);
        BC.toast.error("Better Canvas settings couldn't load. Refresh the page and try again.");
      });
      return;
    }
    wantOpen = false;
    ensureDrawer();
    if (typeof tab === "string") BC.SettingsUI.goto(tab);
    if (isOpen) return;
    returnFocus = document.activeElement;
    wasInert = document.body.inert; document.body.inert = true;
    isOpen = true; drawerHost.style.display = "block"; setExpanded(true);
    BC.injector.setStyle("bc-studio-open", "html{overflow:hidden!important}");
    if (!BC.ui.motion.reduced()) drawerHost.animate([{ opacity: 0, transform: "translateY(8px) scale(.99)" }, { opacity: 1, transform: "none" }], { duration: 180, easing: "ease-out" });
    requestAnimationFrame(() => shadow.querySelector('.bcs-nav__item[aria-current="page"]')?.focus());
  }
  function close() {
    wantOpen = false;
    if (!isOpen) return;
    store?.cancelThemePreview?.(); BC.ui.closePopovers();
    isOpen = false; drawerHost.style.display = "none";
    document.body.inert = wasInert; BC.injector.setStyle("bc-studio-open", ""); setExpanded(false);
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  }
  function toggle() { isOpen || wantOpen ? close() : open(); }
  BC.registry.register({ id: "settingsPanel", styles: [], nodes: [], apply: installNavItem, open, close, toggle, isOpen: () => isOpen });
})();
