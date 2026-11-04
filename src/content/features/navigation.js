/* Better Canvas — global + course navigation editing, breadcrumbs, quick-search, course tabs. */
(function () {
  "use strict";
  const BC = (globalThis.BC = globalThis.BC || {});
  BC.features = BC.features || {};

  // Custom-link lists are rebuilt only when their content changes. They used to be
  // removed and recreated on every applyAll — several times a second whenever
  // Canvas mutates the page — which also yanked keyboard focus off a link mid-tab.
  function syncCustomLinks(nodeId, list, links, linkCss) {
    // A path on this Canvas, like /courses/1/files, is as safe as a full address.
    const safe = (links || []).filter((l) => l && (BC.util.isSafeHttpUrl(l.url) || /^\/(?!\/)\S*$/.test(l.url || "")));
    let ul = document.getElementById(nodeId);
    if (!safe.length) { if (ul) ul.remove(); return; }
    const sig = JSON.stringify(safe.map((l) => [l.url, l.label || "", !!l.newTab]));
    if (ul && ul.dataset.bcSig === sig && ul.previousElementSibling === list) return;
    if (!ul) {
      ul = document.createElement("ul");
      ul.id = nodeId;
      ul.setAttribute("data-bc-node", nodeId);
      ul.style.listStyle = "none"; ul.style.padding = "0"; ul.style.margin = "8px 0 0";
    }
    ul.dataset.bcSig = sig;
    ul.replaceChildren(...safe.map((l) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = l.url; a.textContent = l.label || l.url;
      if (l.newTab) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
      a.style.cssText = linkCss;
      li.appendChild(a);
      return li;
    }));
    if (ul.previousElementSibling !== list) list.parentNode.insertBefore(ul, list.nextSibling);
  }

  // Guarded writes: an inline style that already holds the value is left alone.
  function setStyleProp(el, prop, value) { if (el.style[prop] !== value) el.style[prop] = value; }

  // ---- what this school's nav actually has --------------------------------------
  // Settings used to show a fixed list of every item Canvas *could* have (Commons,
  // Admin…) and missed what schools add themselves — apps like Studio have no
  // link id, so they couldn't be hidden or moved at all. The lists now come from the
  // real menus, and are remembered (bcLocal) for the options page, which has no
  // Canvas page to read.
  const OURS = new Set(["bc-nav-open", "bc-nav-tools"]);
  function globalKey(li) {
    const a = li.querySelector(":scope > a, a");
    if (a && a.id) return a.id;
    if (li.id) return li.id;
    const t = labelOf(li);
    return t ? "label:" + t.toLowerCase() : "";
  }
  function labelOf(li) {
    const t = li.querySelector(".menu-item__text");
    return ((t ? t.textContent : li.textContent) || "").replace(/\s+/g, " ").trim();
  }
  BC.readGlobalNav = function () {
    const list = document.querySelector("#menu");
    if (!list) return [];
    return [...list.querySelectorAll(":scope > li")]
      .filter((li) => !OURS.has(li.getAttribute("data-bc-node")))
      .map((li) => ({ key: globalKey(li), label: labelOf(li), app: li.classList.contains("globalNavExternalTool") }))
      .filter((x) => x.key && x.label);
  };
  // A tab's name without its unread badge ("Grades" rather than "Grades 10").
  function tabLabel(li) {
    const a = li.querySelector("a") || li;
    let text = "";
    for (const n of a.childNodes) {
      if (n.nodeType === 3) text += n.textContent;
      else if (n.nodeType === 1 && !/badge|screenreader/i.test(n.className || "")) text += n.textContent;
    }
    return text.replace(/\s+/g, " ").trim();
  }
  BC.readCourseNav = function () {
    const list = document.querySelector("#section-tabs");
    if (!list) return [];
    return [...list.querySelectorAll(":scope > li")].map(tabLabel).filter(Boolean);
  };

  // Remember what was seen, so the options page can list it too. Course menus
  // differ per course, so their labels accumulate (bounded).
  let lastSnap = "";
  function snapshot() {
    const g = BC.readGlobalNav();
    const c = BC.readCourseNav();
    const local = (BC.storage && BC.storage.local) || {};
    const known = local.courseNavItems || [];
    const merged = known.slice();
    for (const t of c) if (!merged.some((x) => x.toLowerCase() === t.toLowerCase())) merged.push(t);
    const sig = JSON.stringify([g, merged.slice(0, 60)]);
    if (sig === lastSnap) return;
    const prev = JSON.stringify([local.navItems || [], known]);
    if (prev === sig || (!g.length && !c.length)) return;
    BC.storage.updateLocal((d) => {
      if (g.length) d.navItems = g;
      if (c.length) {
        const latest = (d.courseNavItems || []).slice();
        for (const t of c) if (!latest.some((x) => x.toLowerCase() === t.toLowerCase())) latest.push(t);
        d.courseNavItems = latest.slice(0, 60);
      }
    }).then(() => { lastSnap = sig; }).catch(() => {});
  }

  // Flexbox order for one menu item. Saved items take their saved slot; everything
  // else (our own buttons, your links, a tab added since) keeps its place after
  // them. Leaving those at the default 0 used to pull them all above the saved
  // ones, so Better Canvas and Tools jumped to the top of the menu. With nothing
  // saved every item is reset, which restores Canvas's own order.
  function rankFor(saved) {
    return (key, i) => (!saved.size ? "" : key != null && saved.has(key) ? String(saved.get(key)) : String(saved.size + i));
  }

  function applyGlobalNav(nav) {
    const list = document.querySelector("#menu");
    if (!list) return;
    const hidden = new Set(nav.hidden || []);
    const orderMap = new Map();
    (nav.order || []).forEach((k, i) => orderMap.set(k, i));
    // Hidden through a stylesheet keyed on the whole <li> (hiding just the link left
    // an empty slot), so teardown removes it with everything else.
    let css = "";
    const items = list.querySelectorAll(":scope > li");
    const rank = rankFor(orderMap);
    items.forEach((li, i) => {
      if (OURS.has(li.getAttribute("data-bc-node"))) { setStyleProp(li, "order", rank(null, i)); return; }
      const key = globalKey(li);
      if (key && hidden.has(key)) {
        const a = li.querySelector("a[id]");
        if (li.id) css += "#menu > li#" + CSS.escape(li.id) + " { display: none !important; }\n";
        else if (a) css += "#menu > li:has(> a#" + CSS.escape(a.id) + ") { display: none !important; }\n";
        else setStyleProp(li, "display", "none");
      } else if (li.style.display === "none") setStyleProp(li, "display", "");
      setStyleProp(li, "order", rank(key, i));
    });
    BC.injector.setStyle("bc-nav-global-hidden", css);
    setStyleProp(list, "display", "flex"); setStyleProp(list, "flexDirection", "column");

    syncCustomLinks("bc-nav-custom", list, nav.customLinks,
      "display:flex; align-items:center; gap:8px; padding:8px 10px; color:inherit; text-decoration:none;");
  }

  function applyCourseNav(nav) {
    const list = document.querySelector("#section-tabs");
    if (!list) return;
    const hiddenSet = new Set((nav.hidden || []).map((s) => s.toLowerCase()));
    const orderIdx = new Map(); (nav.order || []).forEach((s, i) => orderIdx.set(String(s).toLowerCase(), i));
    const rank = rankFor(orderIdx);
    list.querySelectorAll(":scope > li").forEach((li, i) => {
      const label = tabLabel(li).toLowerCase();
      setStyleProp(li, "display", hiddenSet.has(label) ? "none" : "");
      setStyleProp(li, "order", rank(label, i));
    });
    setStyleProp(list, "display", "flex"); setStyleProp(list, "flexDirection", "column");

    syncCustomLinks("bc-course-custom", list, nav.customLinks,
      "display:block; padding:6px 10px; color:inherit; text-decoration:none; border-radius:6px;");
  }

  function applyBreadcrumbs(mode) {
    let css = "";
    if (mode === "hidden") css = ".ic-app-crumbs { display: none !important; }";
    else if (mode === "compact") css = ".ic-app-crumbs { font-size: 12px !important; padding: 4px 8px !important; }";
    BC.injector.setStyle("bc-breadcrumbs", css);
  }

  function applyCourseTabs(settings) {
    const enabled = settings.navigation && settings.navigation.courseTabs;
    if (!enabled) {
      BC.injector.setStyle("bc-course-tabs", "");
      BC.injector.removeNode("bc-course-tabs");
      return;
    }
    // Pinned quick-switch bar at the top of the main content area (every page).
    const cards = (BC.cache && BC.cache.peek("GET " + location.origin + "/api/v1/dashboard/dashboard_cards")) || null;
    if (!cards) {
      // The cards cache expires after a minute, so fetch them once per page.
      BC.lifecycle.pageBag("course-tabs").once("cards", () => BC.api.dashboardCards().then(() => BC.requestApply && BC.requestApply(), () => {}));
      return;
    }
    const target = document.querySelector("#main");
    if (!target) return;
    BC.injector.setStyle("bc-course-tabs", `
      .bc-course-tabs {
        display: flex; gap: var(--bc-space-2, 6px); overflow-x: auto;
        padding: var(--bc-space-2, 6px) var(--bc-space-4, 10px); background: transparent;
        border-bottom: 1px solid var(--bc-border, #e5e7eb);
      }
      .bc-ct-tab {
        display:inline-block; padding: 4px var(--bc-space-4, 10px);
        border-radius: var(--bc-radius-pill, 999px);
        background: var(--bc-surface-4, rgba(0,0,0,.05)); color: inherit; text-decoration:none;
        border-left: 4px solid var(--tint, #0374b5);
        font-size: var(--bc-text-xs, 12px); white-space: nowrap;
      }
      .bc-ct-tab.active { background: var(--tint); color: var(--tint-fg, var(--bc-accent-contrast, #fff)); }
      .bc-ct-tab:focus-visible { outline: 2px solid var(--bc-focus-ring, var(--bc-accent, #4f46e5)); outline-offset: 2px; }
    `);
    const bar = BC.injector.ensureNode("bc-course-tabs", target, () => {
      const el = document.createElement("div");
      el.className = "bc-course-tabs";
      target.prepend(el);
      return el;
    });
    const pinned = new Set((settings.dashboard.pinned || []).map(String));
    const items = cards.filter((c) => pinned.has(String(c.id)) || pinned.size === 0).slice(0, 12);
    const cur = BC.util.courseIdFromHref(location.pathname);
    // Rebuilt only when what it shows changes — not on every tick, which dropped
    // keyboard focus off the tab being navigated to.
    const sig = cur + "|" + items.map((c) => c.id + ":" + (c.shortName || c.originalName || "") + ":" + (c.color || "")).join(",");
    if (bar.dataset.bcSig === sig) return;
    bar.dataset.bcSig = sig;
    bar.innerHTML = "";
    for (const c of items) {
      const a = document.createElement("a");
      a.className = "bc-ct-tab" + (String(c.id) === cur ? " active" : "");
      a.href = "/courses/" + c.id;
      a.title = c.shortName || c.originalName;
      a.textContent = c.shortName || c.originalName || ("Course " + c.id);
      const tint = c.color || "#0374b5";
      a.style.setProperty("--tint", tint);
      // Course colours are arbitrary and user-chosen, so the label colour has to be
      // computed per course. Forcing white made light course colours unreadable.
      a.style.setProperty("--tint-fg", BC.color.contrastText(tint));
      bar.appendChild(a);
    }
  }

  function apply(settings) {
    const nav = settings.navigation || {};
    if (nav.global) applyGlobalNav(nav.global);
    if (nav.course) applyCourseNav(nav.course);
    applyBreadcrumbs(nav.breadcrumbs || "default");
    applyCourseTabs(settings);
    BC.util.guard(snapshot, "nav snapshot");
  }

  // Order and course-tab visibility are inline styles on Canvas's own items, which
  // no stylesheet removal undoes; without this, turning Better Canvas off left the
  // menus reordered and tabs hidden until a reload.
  function unmount() {
    for (const sel of ["#menu", "#section-tabs"]) {
      const list = document.querySelector(sel);
      if (!list) continue;
      for (const li of list.querySelectorAll(":scope > li")) { li.style.order = ""; if (li.style.display === "none") li.style.display = ""; }
      list.style.display = ""; list.style.flexDirection = "";
    }
    lastSnap = "";
  }

  BC.registry.register({ id: "navigation", styles: ["bc-nav-global-hidden", "bc-breadcrumbs", "bc-course-tabs"], nodes: ["bc-course-tabs", "bc-nav-custom", "bc-course-custom"], apply, unmount });
})();
