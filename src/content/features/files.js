/* Better Canvas — cross-course files library. */
(function () {
  "use strict";
  const BC = (globalThis.BC = globalThis.BC || {});
  BC.features = BC.features || {};

  const CSS = `
    .bc-files-head { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
    .bc-files-head input, .bc-files-head select { padding: 4px 8px; border-radius: 6px; border: 1px solid var(--bc-border, #e5e7eb); background: transparent; color: inherit; }
    .bc-files-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 6px; }
    .bc-file {
      display: grid; grid-template-columns: 24px 1fr auto; gap: 6px;
      padding: 6px 8px; border-radius: 6px; background: var(--bc-surface-3, #f7fafc);
    }
    .bc-file a { color: inherit; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bc-file-ic { text-align: center; opacity: .7; }
    .bc-file-star { cursor: pointer; opacity: .6; border-radius: var(--bc-radius-sm, 4px); }
    .bc-file-star.on { opacity: 1; }
    .bc-file-star:focus-visible { outline: 2px solid var(--bc-focus-ring, var(--bc-accent, #4f46e5)); outline-offset: 1px; }
    .bc-files-list .bc-empty, .bc-files-list .bc-error, .bc-files-list .bc-sk { grid-column: 1 / -1; }
  `;

  const cache = { files: [], loadedAt: 0, failed: 0 };

  async function loadAll() {
    if (Date.now() - cache.loadedAt < 60000 && cache.files.length) return cache.files;
    const courses = await BC.api.coursesWithScores();
    const active = courses.filter((c) => !c.concluded).slice(0, 20);
    const all = [];
    let failed = 0;
    // Concurrency-limited to 4, and 3 pages per course rather than 20. Previously
    // this was Promise.all over every course at 20 pages each — up to ~400
    // simultaneous requests fired from the dashboard, which trips Canvas's rate
    // limiter and breaks every other feature for minutes.
    await BC.util.mapLimit(active, 4, async (c) => {
      try {
        const files = await BC.api.courseFiles(c.id, 3);
        for (const f of files) all.push({ ...f, courseName: c.name, courseId: c.id });
      } catch (e) {
        // A teacher who hides the Files tab keeps students out of its files. That
        // is the course's choice, not a failure to report.
        if (e.status === 401 || e.status === 403) return;
        failed++;
        BC.diag.push("files:" + c.id, e);   // was swallowed entirely
      }
    });
    cache.files = all; cache.loadedAt = Date.now(); cache.failed = failed;
    return all;
  }

  function iconFor(f) {
    const ct = (f["content-type"] || f.content_type || "").toLowerCase();
    if (ct.includes("pdf")) return "📄";
    if (ct.startsWith("image")) return "🖼";
    if (ct.startsWith("video")) return "🎬";
    if (ct.startsWith("audio")) return "🎵";
    if (ct.includes("word") || ct.includes("doc")) return "📝";
    if (ct.includes("sheet") || ct.includes("excel")) return "📊";
    if (ct.includes("zip") || ct.includes("compressed")) return "🗜";
    return "📎";
  }

  function render(mount, settings) {
    const s = settings.files || {};
    const stars = new Set(s.starred || []);
    mount.innerHTML = `
      <div class="bc-files-head">
        <strong>Files</strong>
        <input placeholder="Search files…" type="search" data-filter aria-label="Search files">
        <select data-type aria-label="File type">
          <option value="">All types</option>
          <option value="starred">★ Starred</option>
          <option value="pdf">PDF</option>
          <option value="image">Images</option>
          <option value="video">Video</option>
          <option value="doc">Docs</option>
        </select>
        <select data-course aria-label="Course"><option value="">All courses</option></select>
        <select data-sort aria-label="Sort by">
          <option value="recent">Recent</option>
          <option value="name">Name</option>
          <option value="size">Size</option>
        </select>
        <button type="button" class="bc-btn" data-refresh>Refresh</button>
      </div>
      <div class="bc-files-list"></div>
    `;
    const list = mount.querySelector(".bc-files-list");
    const filter = mount.querySelector("[data-filter]");
    const typeSel = mount.querySelector("[data-type]");
    const courseSel = mount.querySelector("[data-course]");
    const sortSel = mount.querySelector("[data-sort]");
    const refresh = mount.querySelector("[data-refresh]");

    function draw(files) {
      const q = filter.value.toLowerCase();
      const type = typeSel.value;
      const course = courseSel.value;
      const sort = sortSel.value;
      let items = files.filter((f) => (f.display_name || "").toLowerCase().includes(q));
      // Stars used to be purely decorative: nothing could filter or find by them.
      if (type === "starred") items = items.filter((f) => stars.has(String(f.id)));
      else if (type) items = items.filter((f) => {
        const ct = (f["content-type"] || f.content_type || "").toLowerCase();
        if (type === "pdf") return ct.includes("pdf");
        if (type === "image") return ct.startsWith("image");
        if (type === "video") return ct.startsWith("video");
        if (type === "doc") return ct.includes("word") || ct.includes("doc") || ct.includes("openxml");
        return true;
      });
      if (course) items = items.filter((f) => String(f.courseId) === course);
      if (sort === "name") items.sort((a, b) => (a.display_name || "").localeCompare(b.display_name || ""));
      else if (sort === "size") items.sort((a, b) => (b.size || 0) - (a.size || 0));
      else items.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
      const failedNote = cache.failed ? `<div class="bc-file">Files from ${cache.failed} course${cache.failed === 1 ? "" : "s"} couldn't load. Refresh to try again.</div>` : "";
      if (!items.length) {
        list.replaceChildren(BC.ui.empty(
          files.length ? "No files match the current filters." : cache.failed ? "No files loaded." : "No files found in your active courses.",
          files.length ? "" : cache.failed ? "Some courses couldn't be reached. Refresh to try again." : "Files appear here once your courses have published files."
        ));
        if (failedNote && files.length) list.insertAdjacentHTML("afterbegin", failedNote);
        return;
      }
      // f.url is the download link, which opened a blank tab and downloaded the
      // file. The course file page previews it and has its own download button.
      list.innerHTML = failedNote + items.slice(0, 200).map((f) => `
        <div class="bc-file">
          <span class="bc-file-ic">${iconFor(f)}</span>
          <a href="${BC.util.escapeHtml(f.courseId && f.id ? "/courses/" + f.courseId + "/files/" + f.id : f.url || f.html_url || "#")}" target="_blank" rel="noopener" title="${BC.util.escapeHtml(f.courseName || "")}">${BC.util.escapeHtml(f.display_name || "")}</a>
          <span class="bc-file-star ${stars.has(String(f.id)) ? "on" : ""}" data-id="${BC.util.escapeHtml(String(f.id))}" title="Star" role="button" tabindex="0" aria-label="Star ${BC.util.escapeHtml(f.display_name || "file")}" aria-pressed="${stars.has(String(f.id)) ? "true" : "false"}">★</span>
        </div>
      `).join("");
    }

    // Optimistic star toggle, delegated once (list element survives redraws). The
    // write sets the state the UI now shows rather than toggling stored state, so
    // the two can't drift apart.
    function toggleStar(star) {
      const on = !star.classList.contains("on");
      star.classList.toggle("on", on);
      star.setAttribute("aria-pressed", on ? "true" : "false");
      const id = String(star.getAttribute("data-id"));
      if (on) stars.add(id); else stars.delete(id);
      BC.storage.update((d) => {
        const arr = new Set((d.files.starred || []).map(String));
        if (on) arr.add(id); else arr.delete(id);
        d.files.starred = Array.from(arr);
      });
    }
    list.addEventListener("click", (e) => {
      const star = e.target.closest(".bc-file-star");
      if (star) toggleStar(star);
    });
    // role="button" promises Enter/Space — a span gives neither for free, so the
    // stars were unreachable from the keyboard.
    list.addEventListener("keydown", (e) => {
      const star = e.target.closest && e.target.closest(".bc-file-star");
      if (!star || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      toggleStar(star);
    });

    function loadAndDraw() {
      list.replaceChildren(BC.ui.skeleton(4));
      loadAll().then((files) => {
        const courses = new Map();
        for (const f of files) if (f.courseId) courses.set(String(f.courseId), f.courseName || String(f.courseId));
        courseSel.length = 1;
        for (const [id, name] of courses) {
          const o = document.createElement("option"); o.value = id; o.textContent = name;
          courseSel.appendChild(o);
        }
        draw(files);
        [filter, typeSel, courseSel, sortSel].forEach((el) => { el.oninput = () => draw(files); });
      }).catch((e) => {
        BC.util.warn("files", e);
        list.replaceChildren(BC.ui.errorState("Couldn't load files.", () => { cache.loadedAt = 0; loadAndDraw(); }));
      });
    }

    refresh.addEventListener("click", () => { cache.loadedAt = 0; loadAndDraw(); });
    loadAndDraw();
  }

  function apply(settings, ctx) {
    const f = settings.files || {};
    if (!f.enabled || ctx.page !== "dashboard") {
      BC.injector.removeNode("bc-files-panel");
      BC.injector.setStyle("bc-files-css", "");
      return;
    }
    BC.injector.setStyle("bc-files-css", CSS);
    const target = document.querySelector("#dashboard, #DashboardCard_Container");
    if (!target) return;
    const panel = BC.injector.ensureNode("bc-files-panel", target.parentNode || target, () => {
      const d = document.createElement("div");
      d.className = "bc-files-panel bc-panel";
      target.parentNode.insertBefore(d, target);
      return d;
    });
    if (!panel.childElementCount) render(panel, settings);
  }

  BC.registry.register({ id: "files", styles: ["bc-files-css"], nodes: ["bc-files-panel"], apply });
})();
