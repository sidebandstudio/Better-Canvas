/*
 * Better Canvas — module progress tracking.
 * Per-module progress bars on the modules page plus a course-wide summary,
 * computed from Canvas completion requirements. Read-only.
 */
(function () {
  "use strict";
  const BC = (globalThis.BC = globalThis.BC || {});
  BC.features = BC.features || {};

  const CSS = `
    .bc-mod-bar { display: flex; align-items: center; gap: 8px; margin: 6px 12px 8px; }
    .bc-mod-track { flex: 1; height: 6px; border-radius: 999px; background: var(--bc-surface-3, #e5e7eb); overflow: hidden; }
    .bc-mod-fill { height: 100%; background: var(--bc-accent, #0374b5); border-radius: 999px; transition: width .4s ease; }
    .bc-mod-fill.done { background: var(--bc-success, #047857); }
    .bc-mod-label { font-size: 12px; color: var(--bc-muted, #6b7280); white-space: nowrap; }
    .bc-mod-summary {
      display: flex; align-items: center; gap: 12px; margin: 8px 0; padding: 10px 14px;
      border-radius: 10px; background: var(--bc-surface-2, #f3f4f6);
      border: 1px solid var(--bc-border, #e5e7eb); font-size: 13px; font-weight: 600;
    }
    .bc-mod-summary .bc-mod-track { max-width: 260px; }
  `;

  function setBar(bar, done, total) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    const fill = bar.querySelector(".bc-mod-fill");
    fill.style.width = pct + "%";
    fill.classList.toggle("done", pct >= 100);
    const label = bar.querySelector(".bc-mod-label");
    if (label) label.textContent = done + "/" + total + " · " + pct + "%";
    return pct;
  }

  function moduleBar(host) {
    let bar = host.querySelector(".bc-mod-bar");
    if (bar) return bar;
    bar = document.createElement("div");
    bar.className = "bc-mod-bar";
    bar.setAttribute("data-bc-node", "bc-mod-bar");   // declared below so teardown removes it
    bar.innerHTML = '<div class="bc-mod-track"><div class="bc-mod-fill"></div></div><span class="bc-mod-label"></span>';
    const header = host.querySelector(".header, .ig-header");
    if (header) header.insertAdjacentElement("afterend", bar);
    else host.prepend(bar);
    return bar;
  }

  // A failed request (signed out, offline) waits a minute. Without this, every
  // page update fetched the modules again.
  let failedAt = 0;
  function render(courseId) {
    if (Date.now() - failedAt < 60000) return;
    BC.api.courseModules(courseId).then((mods) => {
      let done = 0, total = 0;
      for (const m of mods) {
        const req = (m.items || []).filter((it) => it.completion_requirement);
        // Canvas sends completion only to students. A teacher's modules have none.
        if (!req.some((it) => "completed" in it.completion_requirement)) continue;
        // A "complete one item" module needs one requirement, not all of them, and
        // Canvas's own completed state wins over the item flags.
        const need = m.requirement_type === "one" ? 1 : req.length;
        const d = m.state === "completed" ? need : Math.min(need, req.filter((it) => it.completion_requirement.completed).length);
        done += d; total += need;
        const host = document.getElementById("context_module_" + m.id);
        if (host) setBar(moduleBar(host), d, need);
      }
      if (!total) { BC.injector.removeNode("bc-mod-summary"); return; }
      const summary = BC.injector.ensureNode("bc-mod-summary", document.querySelector("#content") || document.body, () => {
        const div = document.createElement("div");
        div.className = "bc-mod-summary";
        div.innerHTML = '<span class="bc-mod-sum"></span><div class="bc-mod-track"><div class="bc-mod-fill"></div></div>';
        (document.querySelector("#content") || document.body).prepend(div);
        return div;
      });
      const pct = total ? Math.round((done / total) * 100) : 0;
      summary.querySelector(".bc-mod-sum").textContent = "Course progress: " + done + "/" + total + " requirements (" + pct + "%)";
      const fill = summary.querySelector(".bc-mod-fill");
      fill.style.width = pct + "%";
      fill.classList.toggle("done", pct >= 100);
    }).catch((e) => { failedAt = Date.now(); BC.diag.push("modules", e); });
  }

  function apply(settings, ctx) {
    const on = settings.modules && settings.modules.progressBars && ctx.page === "modules" && ctx.courseId;
    if (!on) {
      BC.injector.removeNode("bc-mod-summary");
      BC.injector.setStyle("bc-mod-css", "");
      document.querySelectorAll(".bc-mod-bar").forEach((n) => n.remove());
      return;
    }
    BC.injector.setStyle("bc-mod-css", CSS);
    render(ctx.courseId);
  }

  // bc-mod-bar was injected per module but never declared, so disabling the
  // extension left stale progress bars sitting inside Canvas's module headers.
  BC.registry.register({ id: "modules", styles: ["bc-mod-css"], nodes: ["bc-mod-summary", "bc-mod-bar"], apply });
})();
