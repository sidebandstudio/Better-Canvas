/*
 * Better Canvas — dashboard.
 * Card reorder / rename / recolor / hide / bg-image, layout modes, card sizes,
 * inline grade badge, progress bar, unread badges, hover-preview, auto-hide
 * concluded courses, sidebar widget toggles.
 */
(function () {
  "use strict";
  const BC = (globalThis.BC = globalThis.BC || {});
  BC.features = BC.features || {};

  // What Canvas showed before we overrode it, recorded at the moment of the first
  // override. Only nodes we actually changed are ever restored, so a name or colour
  // the user later edits in Canvas itself is never forced back to a stale value.
  const originalTitles = new WeakMap();
  const originalColors = new WeakMap();
  const originalImages = new WeakMap();
  const renamed = new WeakSet();       // cards whose title we replaced
  const recolored = new WeakSet();     // heroes whose colour we replaced
  const appliedImg = new WeakMap();    // last background-image WE wrote; absent = untouched
  let concludedIds = null;
  let concludedFetching = false;
  let cardsTouched = false;            // something on the cards needs restoring on disable

  // Canvas's card markup (DashboardCard.tsx) puts the aria-hidden colour block
  // (.ic-DashboardCard__header_hero) BEFORE the link that holds the title, and
  // querySelector("a, b, c") returns the first match in DOCUMENT order — so the old
  // combined selector picked the empty hero as the "title": nicknames were written
  // into the colour block, the real name never changed, and course search only
  // ever matched nicknames. Each part is now looked up on its own.
  function titleNode(card) {
    return card.querySelector(".ic-DashboardCard__header-title span") ||
           card.querySelector(".ic-DashboardCard__header-title");
  }
  function heroNode(card) {
    return card.querySelector(".ic-DashboardCard__header_hero") || card.querySelector(".ic-DashboardCard__link");
  }
  // The course image (when there is one) sits on __header_image beneath a
  // translucent hero; otherwise the opaque hero itself is the only visible surface.
  function imageNode(card) {
    return card.querySelector(".ic-DashboardCard__header_image") || card.querySelector(".ic-DashboardCard__header_hero");
  }
  function originalTitle(card) {
    if (renamed.has(card)) return originalTitles.get(card) || "";
    const t = titleNode(card);
    return t ? t.textContent : "";
  }
  // style.backgroundColor reads back as rgb(), so compare in that form.
  function cssColor(hex) {
    const c = BC.color.hexToRgb(hex);
    return c ? "rgb(" + c.r + ", " + c.g + ", " + c.b + ")" : hex;
  }

  let concludedRetryAt = 0;
  function maybeFetchConcluded(auto) {
    if (!auto || concludedIds || concludedFetching || !BC.api || Date.now() < concludedRetryAt) return;
    concludedFetching = true;
    Promise.all([BC.api.coursesWithScores(), BC.api.completedCourses()]).then(([active, completed]) => {
      const ended = active.filter((c) => c.concluded || (c.enrollments || []).some((e) => e.enrollment_state === "completed"));
      concludedIds = new Set(ended.concat(completed).map((c) => String(c.id)));
      if (BC.requestApply) BC.requestApply();
    }).catch((e) => {
      concludedRetryAt = Date.now() + 60000;   // not on every page update
      BC.diag.push("dashboard:concluded", e);
    }).finally(() => { concludedFetching = false; });
  }

  function widgetsCss(w) {
    const rules = [];
    if (!w.todo)           rules.push(`.Sidebar__TodoListContainer, .ToDoSidebar { display: none !important; }`);
    // Canvas draws both lists from one template, as .events_list.coming_up and
    // .events_list.recent_feedback, so hiding .events_list took Recent Feedback too.
    if (!w.comingUp)       rules.push(`.coming_up { display: none !important; }`);
    if (!w.recentFeedback) rules.push(`.recent_feedback { display: none !important; }`);
    // The sidebar button, or the header button on Canvas's newer header. The sidebar
    // wrapper goes too when the button is all it holds, or scene themes frame it as an empty card.
    if (!w.viewGrades)     rules.push(`#ic-Dashboard-header__view_grades_button, :has(> #ic-Dashboard-header__view_grades_button),
      #right-side a.button-sidebar-wide[href$="/grades"],
      #right-side > div:has(> a.button-sidebar-wide[href$="/grades"]):not(:has(> :not(a[href$="/grades"]))) { display: none !important; }`);
    return rules.join("\n");
  }

  // Whatever element directly holds the cards. Current Canvas nests them one level
  // deeper (.ic-DashboardCard__box > .ic-DashboardCard__box__container > cards) than
  // older Canvas did (.ic-DashboardCard__box > cards). Styling .ic-DashboardCard__box
  // in the newer markup made the inner wrapper a single ~250px grid cell, so every
  // card stacked in one narrow column — the default layout was broken for everyone.
  const CARDS = ":where(#DashboardCard_Container, #DashboardCard_Container *):has(> .ic-DashboardCard)";
  const CARD = CARDS + " > .ic-DashboardCard";

  function layoutCss(d) {
    const size = { s: 200, m: 250, l: 320 }[d.cardSize || "m"] || 250;
    const rad = (d.cardRadius|0) + "px";
    let css = `
      .ic-DashboardCard { border-radius: ${rad} !important; overflow: hidden; }
      .ic-DashboardCard[data-bc-image] .ic-DashboardCard__header_hero { background-color: transparent !important; opacity: 1 !important; }
      .ic-DashboardCard__link, .ic-DashboardCard__box { border-radius: ${rad} !important; }
      ${d.hoverLift ? `.ic-DashboardCard { transition: transform var(--bc-dur-3, 220ms) var(--bc-ease-out, ease), box-shadow var(--bc-dur-3, 220ms) var(--bc-ease-out, ease); }
      .ic-DashboardCard:hover { transform: translateY(-3px); box-shadow: var(--bc-shadow-3, 0 10px 30px rgba(0,0,0,.12)); }
      .ic-DashboardCard__header_hero, .ic-DashboardCard__header_image { transition: filter var(--bc-dur-3, 220ms) ease; }
      .ic-DashboardCard:hover .ic-DashboardCard__header_hero { filter: saturate(1.08) brightness(1.04); }` : ""}
      /* Canvas squeezes its title against "Switch to new dashboard view" once the
         page is narrow (e.g. with our settings panel open). */
      .ic-Dashboard-header__layout { gap: var(--bc-space-3, 12px); flex-wrap: wrap; }
      /* List View and Recent Activity hide the card container inline. The layouts
         below set display with !important, so keep Canvas's hide winning. */
      #DashboardCard_Container:is([style*="display: none"], [style*="display:none"]) { display: none !important; }
    `;
    // Canvas gives each card a fixed 262px width and a side margin, and offsets the
    // wrapper by a matching negative margin so the first column lines up with the
    // page. The grid, list and masonry layouts size and space the cards themselves,
    // so the card margin goes — and so must the offset, or every card sits ~36px left
    // of the "Dashboard" heading. Both wrappers are reset, whichever carries it.
    const reset = `#DashboardCard_Container .ic-DashboardCard__box, ${CARDS} { margin-left: 0 !important; margin-right: 0 !important; }`;
    if (d.layout === "grid") css += `
      ${reset}
      ${CARDS} { display: grid !important; grid-template-columns: repeat(auto-fill, minmax(${size}px, 1fr)) !important; gap: 16px !important; }
      ${CARD} { width: auto !important; margin: 0 !important; }`;
    // The header (colour block + title) used to be squeezed into a 120px column; the
    // colour block is the 120px thumbnail now and the title takes the rest.
    if (d.layout === "list") css += `
      ${reset}
      ${CARDS} { display: flex !important; flex-direction: column !important; gap: 8px !important; }
      ${CARD} { width: 100% !important; height: auto !important; margin: 0 !important; }
      ${CARD} .ic-DashboardCard__header { display: flex !important; align-items: center !important; }
      ${CARD} .ic-DashboardCard__header > .ic-DashboardCard__header_hero,
      ${CARD} .ic-DashboardCard__header_image { flex: 0 0 120px !important; width: 120px !important; height: 72px !important; }
      ${CARD} .ic-DashboardCard__header_image > .ic-DashboardCard__header_hero { height: 100% !important; }
      ${CARD} .ic-DashboardCard__link { flex: 1 1 auto !important; min-width: 0 !important; }
      ${CARD} .ic-DashboardCard__action-container { display: none !important; }`;
    // A shorter colour block rather than a max-height, which clipped off the card's
    // action icons.
    if (d.layout === "compact") css += `
      ${CARD} .ic-DashboardCard__header > .ic-DashboardCard__header_hero,
      ${CARD} .ic-DashboardCard__header_image { height: 48px !important; }
      /* 48px holds one row of pills: grade on the left, due count on the right. */
      ${CARD} .bc-inline-grade { top: 13px !important; }
      ${CARD} .bc-badges { top: 13px !important; bottom: auto !important; left: auto !important; right: 10px !important; }
      ${CARD} .bc-card-spark { display: none !important; }`;
    // CSS columns only apply to block containers; Canvas's card wrapper is flex, so
    // the old rule was ignored and masonry looked identical to the default.
    if (d.layout === "masonry") css += `
      ${reset}
      ${CARDS} { display: block !important; columns: ${Math.max(2, Math.floor(1200 / size))} ${size}px !important; column-gap: 14px !important; }
      ${CARD} { display: block !important; width: 100% !important; margin: 0 0 14px !important; break-inside: avoid !important; }
      /* Hidden, finished and filtered-out cards are hidden inline. */
      ${CARD}:is([style*="display: none"], [style*="display:none"]) { display: none !important; }`;
    return css;
  }

  function overlayCard(card, spec) {
    // spec: { nickname, color, bgImage, hidden }
    const title = titleNode(card);
    if (title) {
      // Read before write. Assigning textContent replaces the child text node even
      // when the string is identical; the observer sees a childList mutation whose
      // added node is a bare text node on a Canvas-owned element, treats it as
      // foreign, and schedules another applyAll — forever, on every card.
      const nick = spec.nickname && spec.nickname.trim() ? spec.nickname : null;
      if (nick) {
        if (!renamed.has(card)) { originalTitles.set(card, title.textContent); renamed.add(card); }
        if (title.textContent !== nick) title.textContent = nick;
      } else if (renamed.has(card)) {
        const orig = originalTitles.get(card) || "";
        if (title.textContent !== orig) title.textContent = orig;
        renamed.delete(card);
      }
    }
    const hero = heroNode(card);
    if (hero) {
      // Clearing a custom colour now restores Canvas's; it used to keep showing the
      // custom one until a reload. Compared against the live value, so a React
      // re-render that resets the colour gets the override re-applied.
      const custom = spec.color && BC.color.isHex(spec.color) ? cssColor(spec.color) : null;
      if (custom) {
        if (!recolored.has(hero)) { originalColors.set(hero, hero.style.backgroundColor || ""); recolored.add(hero); }
        if (hero.style.backgroundColor !== custom) hero.style.backgroundColor = custom;
      } else if (recolored.has(hero)) {
        hero.style.backgroundColor = originalColors.get(hero) || "";
        recolored.delete(hero);
      }
    }
    const header = imageNode(card);
    if (header) {
      const fallback = spec.bgFallback && BC.util.isSafeUrl(spec.bgFallback) ? `, url("${BC.util.cssUrl(spec.bgFallback)}")` : "";
      const want = (spec.bgImage && BC.util.isSafeUrl(spec.bgImage)) ? `url("${BC.util.cssUrl(spec.bgImage)}")${fallback}` : null;
      const last = appliedImg.get(header);
      if (want && last === undefined) originalImages.set(header,
        ["background-image", "background-size", "background-position"].map((key) =>
          [key, header.style.getPropertyValue(key), header.style.getPropertyPriority(key)]));
      // React can repaint an existing node. Compare the live style as well as
      // our last value so the school image cannot silently overwrite a theme.
      if (want && (last !== want || header.style.backgroundImage !== want || header.style.getPropertyPriority("background-image") !== "important")) {
        header.style.setProperty("background-image", want, "important");
        header.style.setProperty("background-size", BC.themeMedia && BC.themeMedia.parse(spec.bgImage) && !BC.themeMedia.parse(spec.bgImage).wallpaper ? "400% 800%" : "cover", "important");
        header.style.setProperty("background-position", BC.themeMedia ? BC.themeMedia.position(spec.bgImage) : "center", "important");
        appliedImg.set(header, want);
      } else if (!want && last !== undefined) {
        for (const [key, value, priority] of originalImages.get(header) || []) {
          if (value) header.style.setProperty(key, value, priority);
          else header.style.removeProperty(key);
        }
        appliedImg.delete(header);
      }
      if (card.hasAttribute("data-bc-image") !== !!want) card.toggleAttribute("data-bc-image", !!want);
    }
    const wantDisplay = spec.hidden ? "none" : "";
    if (card.style.display !== wantDisplay) card.style.display = wantDisplay;
  }

  // Inline state on Canvas's own nodes that no stylesheet removal undoes. Without
  // this, turning the dashboard feature (or the whole extension) off left every
  // nickname, colour, hidden card and custom order in place until a reload.
  function restoreCards() {
    if (!cardsTouched) return;
    cardsTouched = false;
    for (const card of document.querySelectorAll(".ic-DashboardCard")) {
      overlayCard(card, {});
      if (card.style.order) card.style.order = "";
    }
  }

  const NODES = ["bc-inline-grade", "bc-progress", "bc-badges", "bc-card-spark", "bc-course-search", "bc-gpa-card"];

  // The colour block at the top of the card. Overlays sit on it (top-left and
  // bottom corners) so they never cover Canvas's ⋮ menu at the top right or the
  // action icons along the bottom of the card. The colour block alone: the header
  // also wraps the course code and term below it, which the overlays used to cover.
  function headerOf(card) {
    return card.querySelector(".ic-DashboardCard__header_image") || card.querySelector(".ic-DashboardCard__header") || card;
  }

  function overlayInlineGrade(card, courseId, scoresMap) {
    const s = scoresMap.get(String(courseId));
    if (s == null) return;
    let badge = card.querySelector(".bc-inline-grade");
    if (!badge) {
      badge = document.createElement("div");
      badge.className = "bc-inline-grade";
      badge.setAttribute("data-bc-node", "bc-inline-grade");
      badge.append(document.createElement("i"), document.createElement("span"));
      headerOf(card).appendChild(badge);
    }
    const text = s.toFixed(1) + "%";
    const label = badge.querySelector("span");
    if (label.textContent !== text) label.textContent = text;
    // A glass pill over the course colour, with the grade band as a dot. The dot
    // uses the dark-mode band colours because the pill is always dark.
    let band = "a";
    if (s < 90) band = "b";
    if (s < 80) band = "c";
    if (s < 70) band = "d";
    if (s < 60) band = "f";
    if (badge.dataset.bcBand !== band) {
      badge.dataset.bcBand = band;
      badge.title = "Current grade: " + text;
    }
  }

  function overlayProgress(card, plannerCountByCourse) {
    const cid = BC.util.courseIdFromHref(card.querySelector("a") && card.querySelector("a").getAttribute("href"));
    if (!cid) return;
    const info = plannerCountByCourse.get(cid);
    if (!info) return;
    const pct = info.total ? Math.round((info.done / info.total) * 100) : 0;
    let bar = card.querySelector(".bc-progress");
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "bc-progress";
      bar.setAttribute("data-bc-node", "bc-progress");
      bar.setAttribute("role", "progressbar");
      bar.setAttribute("aria-label", "Planner items done in the last month");
      bar.innerHTML = `<div class="bc-progress-fill"></div>`;
      headerOf(card).appendChild(bar);
    }
    bar.setAttribute("aria-valuenow", String(pct));
    bar.title = pct + "% of recent planner items done";
    const fill = bar.querySelector(".bc-progress-fill");
    const w = pct + "%";
    if (fill.style.width !== w) fill.style.width = w;
  }

  // Previously this read a `badges` Map that nothing ever populated, so it always
  // returned at the first guard — the advertised badges never appeared. Now it shows
  // the one count that's free from data we already fetch: items due in 24 hours.
  function overlayDueBadge(card, courseId) {
    const n = dueSoonByCourse.get(String(courseId)) || 0;
    let strip = card.querySelector(".bc-badges");
    if (!n) { if (strip) strip.remove(); return; }
    if (!strip) {
      strip = document.createElement("div");
      strip.className = "bc-badges";
      strip.setAttribute("data-bc-node", "bc-badges");
      headerOf(card).appendChild(strip);
    }
    if (strip.dataset.bcN === String(n)) return;   // apply() runs ~5x/sec
    strip.dataset.bcN = String(n);
    const label = n + " item" + (n === 1 ? "" : "s") + " due in the next 24 hours";
    const b = document.createElement("span");
    b.className = "bc-badge due";
    if (BC.icons) b.appendChild(BC.icons.el("clock"));
    b.appendChild(document.createTextNode(n + " due soon"));
    b.title = label;
    b.setAttribute("aria-label", label);   // the bare number conveys nothing alone
    strip.replaceChildren(b);
  }

  // Grade trend from locally recorded history. Stamped with the history length so
  // the SVG is rebuilt only when a new point actually lands.
  function overlaySparkline(card, courseId) {
    const hist = ((BC.storage.local && BC.storage.local.gradeHistory) || {})[String(courseId)] || [];
    if (hist.length < 2) return;
    // The stamp lives on Canvas's card, which outlives our node: after a toggle-off
    // or teardown removed the sparkline, a matching stamp alone stopped it ever
    // coming back.
    if (card.dataset.bcSpark === String(hist.length) && card.querySelector(".bc-card-spark")) return;
    card.dataset.bcSpark = String(hist.length);
    const svg = BC.ui.sparkline(hist.map((h) => Number(h.score)).filter((n) => isFinite(n)),
      { width: 96, height: 22, label: "Grade trend for this course" });
    if (!svg) return;
    const existing = card.querySelector(".bc-card-spark");
    if (existing) existing.remove();
    const wrap = document.createElement("div");
    wrap.className = "bc-card-spark";
    wrap.setAttribute("data-bc-node", "bc-card-spark");
    wrap.appendChild(svg);
    headerOf(card).appendChild(wrap);
  }

  // Built ONCE by the factory and never rewritten by apply() — that's what keeps the
  // caret and the typed value alive across Canvas's own re-renders.
  let query = "";
  const SEARCH_CSS = `
:host { display: block; margin: 0 0 var(--bc-space-5, 20px); }
.cs { display: flex; align-items: center; gap: var(--bc-space-3, 12px); }
.cs .bc-input-wrap { flex: 0 1 340px; min-width: 0; }
.cs .bc-input { height: var(--bc-control-h-lg, 36px); font-size: var(--bc-text-sm, 13px); }
.cs .bc-input::-webkit-search-cancel-button { cursor: pointer; }
.cs__count { font-size: var(--bc-text-xs, 12px); color: var(--bc-muted, #6b6b74); font-variant-numeric: tabular-nums; white-space: nowrap;
  animation: cs-in var(--bc-dur-2, 150ms) ease; }
.cs__count:empty { display: none; }
@keyframes cs-in { from { opacity: 0; } }
`;
  function ensureCourseSearch() {
    if (document.querySelector('[data-bc-node="bc-course-search"]')) return;
    const container = document.getElementById("DashboardCard_Container") || document.querySelector(".ic-DashboardCard__box");
    if (!container || !container.parentNode) return;
    const m = BC.ui.mount("bc-course-search", { css: SEARCH_CSS, place: (host) => container.parentNode.insertBefore(host, container) });
    const field = BC.ui.input({ type: "search", placeholder: "Filter courses", ariaLabel: "Filter courses", icon: "search" });
    const input = field.input;
    input.value = query;
    const changed = () => {
      query = input.value.trim().toLowerCase();
      if (BC.requestApply) BC.requestApply();
    };
    input.addEventListener("input", changed);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && input.value) { e.stopPropagation(); input.value = ""; changed(); }
    });
    m.body.replaceChildren(BC.ui.el("div", { class: "cs" }, [field, BC.ui.el("span", { class: "cs__count", "aria-live": "polite" })]));
  }
  function setSearchCount(shown, total) {
    const host = document.querySelector('[data-bc-node="bc-course-search"]');
    const out = host && host.shadowRoot && host.shadowRoot.querySelector(".cs__count");
    if (!out) return;
    const text = query ? shown + " of " + total + " courses" : "";
    if (out.textContent !== text) out.textContent = text;
  }

  // Every input already exists: coursesWithScores() is fetched for inline grades,
  // BC.grades.gradePoints is exported, and creditsByCourse is user-editable.
  function ensureGpaCard(settings) {
    if (!scoresMap.size) return;
    const host = document.querySelector("#right-side") || document.querySelector(".ic-app-main-content__secondary");
    if (!host) return;
    const credits = (settings.grades && settings.grades.creditsByCourse) || {};
    const scale = settings.grades && settings.grades.gpaScale;
    // Same rules as the GPA calculator in Settings → Grades: a course with no credit
    // entry counts as 3, and 0 excludes it. Treating "unset" as 0 here made the two
    // disagree as soon as some — but not all — courses had credits entered.
    const configured = Object.keys(credits).length > 0;
    let weighted = 0, hours = 0, count = 0;
    for (const [id, score] of scoresMap) {
      const cr = credits[id] != null ? (Number(credits[id]) || 0) : 3;
      if (cr <= 0) continue;
      weighted += BC.grades.gradePoints(Number(score), scale).points * cr;
      hours += cr; count++;
    }
    if (!count) { BC.injector.removeNode("bc-gpa-card"); return; }
    // With nothing configured every course weighs 3, i.e. a plain unweighted mean.
    const gpa = weighted / hours;
    const sub = configured ? hours + " credit hours" : count + " courses · unweighted";
    const node = BC.injector.ensureNode("bc-gpa-card", host, () => {
      const el = document.createElement("div");
      el.className = "bc-panel bc-gpa-card";
      host.prepend(el);
      return el;
    });
    const sig = gpa.toFixed(3) + "|" + sub;
    if (node.dataset.bcSig === sig) return;
    node.dataset.bcSig = sig;
    node.replaceChildren(BC.ui.stat({ label: "Estimated GPA", value: gpa.toFixed(2), sub }));
  }

  let scoresMap = new Map();
  let plannerCountByCourse = new Map();
  let dueSoonByCourse = new Map();

  const loadState = { scores: { status: "idle", next: 0, failures: 0, generation: 0 }, planner: { status: "idle", next: 0, failures: 0, generation: 0 } };
  function invalidateLoad(key) {
    const state = loadState[key];
    state.generation++; state.status = "idle"; state.next = 0; state.failures = 0;
  }
  BC.dashboard = {
    invalidatePlanner() { invalidateLoad("planner"); if (BC.requestApply) BC.requestApply(); },
  };
  function ensureLoaded(key, loader) {
    const state = loadState[key];
    // A hidden tab doesn't fetch. It catches up when it's shown, including a
    // dashboard first opened in a background tab, so listen before bailing out.
    BC.lifecycle.pageBag("dashboard").once("visible", () => BC.lifecycle.pageBag("dashboard").listen(document, "visibilitychange", () => {
      if (!document.hidden && BC.requestApply) BC.requestApply();
    }));
    if (state.status === "loading" || Date.now() < state.next || document.hidden) return;
    const generation = state.generation;
    state.status = "loading";
    const wake = (delay) => BC.lifecycle.pageBag("dashboard").timeout(() => { if (!document.hidden && BC.requestApply) BC.requestApply(); }, delay);
    Promise.resolve().then(loader).then((data) => {
      if (state.generation !== generation) return;
      if (key === "scores") scoresMap = data;
      else { plannerCountByCourse = data.counts; dueSoonByCourse = data.dueSoon; }
      state.status = "done"; state.failures = 0;
      const ttl = key === "scores" ? BC.api.TTL.courses : BC.api.TTL.planner;
      state.next = Date.now() + ttl; wake(ttl);
      if (BC.requestApply) BC.requestApply();
    }).catch((e) => {
      if (state.generation !== generation) return;
      state.status = "failed";
      const delay = Math.min(60000, 1000 * 2 ** Math.min(state.failures++, 6));
      state.next = Date.now() + delay; wake(delay);
      BC.diag.push("dashboard:" + key, e);
    });
  }

  async function loadInlineGrades() {
    const list = await BC.api.coursesWithScores();
    const scores = new Map();
    for (const c of list) {
      const s = BC.api.courseScore(c);
      if (s != null) scores.set(String(c.id), s);
    }
    return scores;
  }

  async function loadPlannerCounts() {
    const start = new Date(); start.setDate(start.getDate() - 30);
    const end = new Date(); end.setDate(end.getDate() + 14);
    const items = await BC.api.plannerItems(start.toISOString(), end.toISOString());
    const counts = new Map(), dueSoon = new Map();
    const now = Date.now();
    for (const it of items) {
      const cid = it.course_id ? String(it.course_id) : (it.context_type === "Course" ? String(it.context_id) : null);
      if (!cid) continue;
      // Lectures, office hours and announcements aren't work that comes due.
      if (it.plannable_type === "calendar_event" || it.plannable_type === "announcement") continue;
      const done = BC.api.plannerItemDone(it);
      const dueISO = it.plannable_date || (it.plannable && it.plannable.due_at);
      // The bar is "done in the last month", so work that isn't due yet stays out:
      // counting it showed a caught-up student about 60%.
      if (dueISO && new Date(dueISO).getTime() <= now) {
        const entry = counts.get(cid) || { total: 0, done: 0 };
        entry.total++;
        if (done) entry.done++;
        counts.set(cid, entry);
      }

      // Due-in-24h count for the card badge — free from the data we already have.
      if (!done && dueISO) {
        const diff = new Date(dueISO).getTime() - now;
        if (diff > 0 && diff <= 24 * 60 * 60 * 1000) dueSoon.set(cid, (dueSoon.get(cid) || 0) + 1);
      }
    }
    return { counts, dueSoon };
  }

  function apply(settings, ctx) {
    if (ctx.page !== "dashboard") {
      BC.injector.setStyle("bc-dashboard-ui", "");
      BC.injector.setStyle("bc-dashboard-widgets", "");
      return;
    }
    const d = settings.dashboard || {};
    if (!d.enabled) {
      // This used to just return, leaving every stylesheet, overlay and card edit in
      // place — the switch did nothing until a reload.
      BC.injector.setStyle("bc-dashboard-ui", "");
      BC.injector.setStyle("bc-dashboard-widgets", "");
      for (const n of NODES) BC.injector.removeNode(n);
      restoreCards();
      return;
    }

    // pageBag marks clear on SPA navigation, so this re-arms the loaders exactly
    // once per page visit. The underlying BC.api calls are TTL-cached, so
    // navigating back is a cache hit rather than a refetch.
    BC.lifecycle.pageBag("dashboard").once("loaders", () => {
      invalidateLoad("scores");
      invalidateLoad("planner");
    });

    // widget CSS
    const widgetCss = widgetsCss(d.widgets || {}) + (d.hideSidebar ? "\n#right-side, #right-side-wrapper { display: none !important; }\n#main { margin-right: 0 !important; }" : "");
    BC.injector.setStyle("bc-dashboard-widgets", widgetCss);

    // layout CSS
    BC.injector.setStyle("bc-dashboard-ui", layoutCss(d) + `
      .ic-DashboardCard { position: relative; }
      .ic-DashboardCard__header, .ic-DashboardCard__header_image { position: relative; }
      /* glass pills over the course colour */
      .bc-inline-grade, .bc-badge {
        display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 8px;
        border-radius: var(--bc-radius-pill, 999px); background: rgba(10,10,12,.55); color: #fff;
        -webkit-backdrop-filter: blur(8px) saturate(1.4); backdrop-filter: blur(8px) saturate(1.4);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.14);
        font: 600 11px/1 var(--bc-font-sans, system-ui, sans-serif); font-variant-numeric: tabular-nums; letter-spacing: 0;
        pointer-events: none; animation: bc-pill-in var(--bc-dur-3, 220ms) var(--bc-ease-out, ease) both;
      }
      @keyframes bc-pill-in { from { opacity: 0; transform: translateY(-3px); filter: blur(2px); } }
      .bc-inline-grade { position: absolute; top: 10px; left: 10px; z-index: 2; }
      .bc-inline-grade i { width: 7px; height: 7px; border-radius: 50%; background: #34d399; }
      .bc-inline-grade[data-bc-band="b"] i { background: #a3e635; }
      .bc-inline-grade[data-bc-band="c"] i { background: #fbbf24; }
      .bc-inline-grade[data-bc-band="d"] i { background: #fb923c; }
      .bc-inline-grade[data-bc-band="f"] i { background: #f87171; }
      .bc-badges { position: absolute; left: 10px; bottom: 10px; z-index: 2; display: flex; gap: 4px; pointer-events: none; }
      .bc-badge svg { width: 12px; height: 12px; }
      .bc-badge.due { background: rgba(120,53,15,.72); }
      .bc-progress { position: absolute; left: 0; right: 0; bottom: 0; z-index: 2; height: 3px; background: rgba(0,0,0,.22); pointer-events: none; }
      .bc-progress-fill {
        height: 100%; width: 0%; background: rgba(255,255,255,.92);
        transition: width 700ms var(--bc-ease-out, ease);
      }
      .bc-card-spark {
        position: absolute; right: 10px; bottom: 10px; z-index: 2; padding: 3px 6px;
        border-radius: var(--bc-radius-md, 8px); background: rgba(10,10,12,.45);
        --bc-success: #34d399; --bc-danger: #f87171;
        -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
        line-height: 0; pointer-events: none;
      }
      .bc-gpa-card { margin-bottom: var(--bc-space-5, 20px); }
      @media (prefers-reduced-motion: reduce) { .bc-inline-grade, .bc-badge { animation: none; } }
    `);

    // course cards
    if (d.autoHideConcluded) maybeFetchConcluded(true);
    const cards = document.querySelectorAll(".ic-DashboardCard");
    if (!cards.length) return;

    // Build id order + reordering
    const cardsById = new Map();
    for (const card of cards) {
      const a = card.querySelector("a.ic-DashboardCard__link");
      const cid = a && BC.util.courseIdFromHref(a.getAttribute("href"));
      if (cid) cardsById.set(cid, card);
    }

    const order = d.courseOrder || [];
    const ordered = new Set(order);
    let idx = 0;
    const setOrder = (c) => { const o = String(idx++); if (c.style.order !== o) c.style.order = o; };
    for (const id of order) {
      const c = cardsById.get(id);
      if (c) setOrder(c);
    }
    for (const [id, card] of cardsById) if (!ordered.has(id)) setOrder(card);

    if (d.courseSearch) ensureCourseSearch();
    else {
      query = "";
      BC.injector.removeNode("bc-course-search");
    }
    if (d.widgets && d.widgets.gpa) ensureGpaCard(settings);
    else BC.injector.removeNode("bc-gpa-card");

    // Overlays whose toggle is off are removed, not just left un-updated — turning
    // one off used to leave it on the cards until a reload.
    if (!d.showInlineGrade) BC.injector.removeNode("bc-inline-grade");
    if (!d.showProgressBar) BC.injector.removeNode("bc-progress");
    if (!d.showBadges)      BC.injector.removeNode("bc-badges");
    if (!d.showSparkline)   BC.injector.removeNode("bc-card-spark");

    // Apply per-card overrides
    const scene = BC.themeScenes && BC.themeScenes[settings.theming.experience];
    const pool = (d.themeImages || []).slice();
    // Larger rosters keep getting different compositions instead of wrapping
    // back to the beginning of a finite photograph collection.
    if (scene && pool.length) for (let i = pool.length; i < cardsById.size; i++) pool.push(BC.sceneArt(scene.id, 1000 + i));
    const artworkByCourse = BC.assignThemeImages(pool, cardsById.keys());
    cardsTouched = true;
    let shown = 0;
    for (const [id, card] of cardsById) {
      const spec = (d.courses && d.courses[id]) || {};
      // The search filter folds into the existing hidden computation, so it's
      // idempotent and survives re-apply with no extra DOM bookkeeping. Matches
      // the real name, the course code and the nickname.
      const code = card.querySelector(".ic-DashboardCard__header-subtitle");
      const name = (originalTitle(card) + " " + (card.getAttribute("aria-label") || "") + " " +
                    (code ? code.textContent : "") + " " + (spec.nickname || "")).toLowerCase();
      const effHidden = spec.hidden === true
        || (d.autoHideConcluded && concludedIds && concludedIds.has(id))
        || (!!query && name.indexOf(query) === -1);
      const artwork = artworkByCourse.get(id);
      // Only remote photos can fail to load and need a drawing behind them.
      const fallback = !spec.bgImage && artwork && /^https?:/i.test(artwork.url) && scene
        ? BC.sceneArt(scene.id, Array.from(artworkByCourse.keys()).indexOf(id)).url : "";
      overlayCard(card, { ...spec, bgImage: spec.bgImage || (artwork && artwork.url), bgFallback: fallback, hidden: effHidden });
      if (!effHidden) shown++;
      if (d.showInlineGrade)   overlayInlineGrade(card, id, scoresMap);
      if (d.showProgressBar)   overlayProgress(card, plannerCountByCourse);
      if (d.showBadges)        overlayDueBadge(card, id);
      if (d.showSparkline)     overlaySparkline(card, id);
    }
    if (d.courseSearch) setSearchCount(shown, cardsById.size);

    // Each loader feeds more than one feature: the GPA card reads the scores, and
    // the due-count badges read the planner counts. Gating them on the inline-grade
    // and progress-bar toggles alone meant the GPA card and badges never appeared
    // unless those unrelated toggles were on too.
    if (d.showInlineGrade || (d.widgets && d.widgets.gpa)) ensureLoaded("scores", loadInlineGrades);
    if (d.showProgressBar || d.showBadges) ensureLoaded("planner", loadPlannerCounts);
  }

  BC.registry.register({
    id: "dashboard",
    styles: ["bc-dashboard-widgets", "bc-dashboard-ui"],
    // These were injected per card but declared nowhere, so teardown left every
    // badge, grade pill and progress bar stuck on the Canvas cards.
    nodes: NODES,
    apply,
    unmount() {
      restoreCards();
      scoresMap.clear();
      plannerCountByCourse.clear();
      dueSoonByCourse.clear();
      concludedIds = null;
      concludedFetching = false;
      invalidateLoad("scores");
      invalidateLoad("planner");
      query = "";
    },
  });
})();
