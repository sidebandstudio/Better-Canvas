/* Better Canvas — Canvas detection + page-context identification. */
(function () {
  "use strict";
  const BC = (globalThis.BC = globalThis.BC || {});

  let cachedIsCanvas = null;

  function pageFromPath(path) {
    if (!path) return "other";
    // ePortfolios and data exports live under /dashboard/ too, as pages of their own.
    if (path === "/" || /^\/dashboard\/?$/.test(path)) return "dashboard";
    if (/^\/courses\/\d+\/grades/.test(path)) return "grades";
    if (/^\/courses\/\d+\/gradebook/.test(path)) return "gradebook";
    if (/^\/courses\/\d+\/modules/.test(path)) return "modules";
    if (/^\/courses\/\d+\/assignments\/\d+/.test(path)) return "assignment";
    if (/^\/courses\/\d+\/assignments/.test(path)) return "assignments";
    if (/^\/courses\/\d+\/discussion_topics/.test(path)) return "discussions";
    if (/^\/courses\/\d+\/announcements/.test(path)) return "announcements";
    if (/^\/courses\/\d+\/files/.test(path)) return "files";
    if (/^\/courses\/\d+\/pages/.test(path)) return "pages";
    if (/^\/courses\/\d+/.test(path)) return "course";
    if (/^\/calendar/.test(path)) return "calendar";
    if (/^\/conversations/.test(path)) return "inbox";
    if (/^\/profile/.test(path)) return "profile";
    if (/^\/accounts/.test(path)) return "admin";
    if (/^\/files/.test(path)) return "files";
    return "other";
  }

  BC.detect = {
    isCanvas() {
      if (cachedIsCanvas) return true;
      const hit =
        !!document.querySelector('meta[name="csrf-param"]') ||
        !!document.querySelector('link[href*="brandable_css"]') ||
        (() => {
          const app = document.getElementById("application");
          return app && /\bic-app\b/.test(app.className);
        })() ||
        !!document.querySelector(
          "header.ic-app-header, #header.ic-app-header, .ic-app-header__main-navigation"
        );
      if (hit) cachedIsCanvas = true;
      return !!hit;
    },

    isInstructureDomain() {
      return /(^|\.)instructure\.com$/.test(location.hostname);
    },

    context() {
      const path = location.pathname;
      const courseId = BC.util.courseIdFromHref(path);
      let page = pageFromPath(path);
      if (page === "other" && document.getElementById("DashboardCard_Container")) page = "dashboard";
      return { page, courseId, path, search: location.search };
    },

    waitFor(selector, timeout) {
      const to = timeout || 5000;
      return new Promise((resolve) => {
        const found = document.querySelector(selector);
        if (found) return resolve(found);
        const obs = new MutationObserver(() => {
          const n = document.querySelector(selector);
          if (n) { obs.disconnect(); resolve(n); }
        });
        obs.observe(document.documentElement, { childList: true, subtree: true });
        setTimeout(() => { obs.disconnect(); resolve(document.querySelector(selector)); }, to);
      });
    },
  };
})();
