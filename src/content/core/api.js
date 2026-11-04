/*
 * Better Canvas — Canvas REST API helper.
 * Runs same-origin so requests use the user's Canvas session. Read-only except
 * for user-initiated planner writes. Cached (60s), deduped, retried on 5xx.
 */
(function () {
  "use strict";
  const BC = (globalThis.BC = globalThis.BC || {});
  const base = location.origin;

  function csrfToken() {
    const m = document.cookie.match(/(?:^|;\s*)_csrf_token=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : "";
  }

  function parseNextLink(h) {
    if (!h) return null;
    // Split only between entries — URLs inside <> can themselves contain commas.
    for (const part of h.split(/,(?=\s*<)/)) {
      const m = part.match(/<([^>]+)>\s*;\s*rel="next"/);
      if (m) return m[1];
    }
    return null;
  }

  function stripPrefix(text) { return text.replace(/^while\(1\);?/, ""); }

  async function fetchOnce(url, opts) {
    const res = await fetch(url, opts);
    if (!res.ok) {
      const err = new Error("Canvas API " + res.status + " " + url);
      err.status = res.status;
      throw err;
    }
    return res;
  }

  async function fetchRetry(url, opts, tries) {
    let last;
    const n = tries || 3;
    for (let i = 0; i < n; i++) {
      try { return await fetchOnce(url, opts); }
      catch (e) {
        last = e;
        if (e.status && e.status < 500) throw e;
        if (i < n - 1) await new Promise((r) => setTimeout(r, 200 * (i + 1)));
      }
    }
    throw last;
  }

  const jsonHeaders = { Accept: "application/json+canvas-string-ids, application/json" };

  // Per-endpoint cache TTLs (ms). Slow-changing data caches longer.
  const TTL = {
    self: 5 * 60000,
    cards: 60000,
    courses: 60000,
    groups: 60000,
    announcements: 2 * 60000,
    people: 5 * 60000,
    files: 2 * 60000,
    assignments: 60000,
    assignment: 60000,
    planner: 30000,
    modules: 60000,
    course: 5 * 60000,
  };

  async function plannerMutation(method, path, body) {
    const result = await api.mutate(method, path, body);
    BC.cache && BC.cache.invalidate("LIST " + base + "/api/v1/planner/items");
    if (BC.dashboard) BC.dashboard.invalidatePlanner();
    return result;
  }

  const api = (BC.api = {
    TTL,

    // One definition of "done" for a planner item, shared by the planner widget,
    // the dashboard progress bars and the due-soon scan. Canvas's own planner lets
    // an explicit override win: un-checking a submitted assignment sets
    // marked_complete=false, and treating "submitted" as done regardless meant it
    // could never be un-checked.
    plannerItemDone(it) {
      if (!it) return false;
      const o = it.planner_override;
      if (o && typeof o.marked_complete === "boolean") return o.marked_complete;
      // Peer reviews carry no submission. A teacher's redo request reopens one.
      if (it.plannable_type === "assessment_request") return !!(it.plannable && it.plannable.workflow_state === "completed");
      const s = it.submissions;
      return !!(s && !s.redo_request && (s.submitted || s.graded));
    },
    async getJSON(path, { ttl } = {}) {
      const url = path.startsWith("http") ? path : base + path;
      const key = "GET " + url;
      const doIt = async () => {
        const res = await fetchRetry(url, { credentials: "include", headers: jsonHeaders });
        return JSON.parse(stripPrefix(await res.text()));
      };
      if (ttl && BC.cache) return BC.cache.wrap(key, ttl, doIt);
      return doIt();
    },

    async getList(path, { maxPages = 20, ttl, withMeta = false } = {}) {
      const url0 = path.startsWith("http") ? path : base + path;
      const key = "LIST " + url0 + (withMeta ? " +meta" : "");
      const doIt = async () => {
        const out = [];
        let url = url0, pages = 0;
        while (url && pages < maxPages) {
          const res = await fetchRetry(url, { credentials: "include", headers: jsonHeaders });
          const data = JSON.parse(stripPrefix(await res.text()));
          if (Array.isArray(data)) out.push(...data);
          url = parseNextLink(res.headers.get("Link"));
          pages++;
        }
        const truncated = !!url;
        if (truncated) BC.util.warn("api: list truncated at " + maxPages + " pages: " + url0);
        return withMeta ? { items: out, truncated, pages } : out;
      };
      if (ttl && BC.cache) return BC.cache.wrap(key, ttl, doIt);
      return doIt();
    },

    self() { return api.getJSON("/api/v1/users/self", { ttl: TTL.self }); },

    dashboardCards() {
      return api.getJSON("/api/v1/dashboard/dashboard_cards", { ttl: TTL.cards });
    },

    coursesWithScores() {
      return api.getList(
        "/api/v1/courses?enrollment_state=active&enrollment_type=student" +
        "&include[]=total_scores&include[]=current_grading_period_scores&include[]=concluded&include[]=term&per_page=100",
        { maxPages: 20, ttl: TTL.courses }
      );
    },

    // The score Canvas shows the student for a course from coursesWithScores.
    // The final score counts ungraded work as zero, so before anything is graded
    // it reads 0% while the current score is null. It only stands in once the
    // course is over. A course that hides the all-periods total shows the
    // current grading period's score instead.
    courseScore(c) {
      const e = ((c && c.enrollments) || [])[0] || {};
      let s = e.computed_current_score;
      if (api.scorePeriod(c)) s = e.current_period_computed_current_score;
      else if (s == null && (c.concluded === true || e.enrollment_state === "completed")) s = e.computed_final_score;
      return s == null || s === "" || !Number.isFinite(Number(s)) ? null : Number(s);
    },
    // The grading period behind that score, or null when it covers every period.
    scorePeriod(c) {
      const e = ((c && c.enrollments) || [])[0] || {};
      return (e.has_grading_periods && e.totals_for_all_grading_periods_option === false && e.current_grading_period_id) || null;
    },

    // Past-term courses. enrollment_state=active above leaves them out.
    completedCourses() {
      return api.getList("/api/v1/courses?enrollment_state=completed&per_page=100", { maxPages: 5, ttl: TTL.courses });
    },

    // periodId keeps only that grading period's assignments.
    assignmentGroups(courseId, periodId) {
      return api.getList(
        `/api/v1/courses/${courseId}/assignment_groups?include[]=assignments&include[]=submission&per_page=100` +
          (periodId ? "&grading_period_id=" + encodeURIComponent(periodId) + "&scope_assignments_to_student=true" : ""),
        { maxPages: 10, ttl: TTL.groups }
      );
    },

    courseAnnouncements(courseId, count = 5) {
      return api.getList(
        `/api/v1/announcements?context_codes[]=course_${courseId}&per_page=${count}`,
        { maxPages: 1, ttl: TTL.announcements }
      );
    },

    coursePeople(courseId, roles, include) {
      const q = (roles || []).map((r) => "enrollment_type[]=" + encodeURIComponent(r))
        .concat((include || []).map((x) => "include[]=" + encodeURIComponent(x))).join("&");
      return api.getList(
        `/api/v1/courses/${courseId}/users?per_page=100${q ? "&" + q : ""}`,
        { maxPages: 15, ttl: TTL.people }
      );
    },

    // maxPages is caller-controlled: the cross-course library fans out over ~20
    // courses, where 20 pages each is 400 requests. A per-course view can ask for
    // more.
    courseFiles(courseId, maxPages = 20) {
      return api.getList(
        `/api/v1/courses/${courseId}/files?per_page=100`,
        { maxPages, ttl: TTL.files }
      );
    },

    courseAssignments(courseId) {
      return api.getList(
        `/api/v1/courses/${courseId}/assignments?include[]=submission&per_page=100`,
        { maxPages: 10, ttl: TTL.assignments }
      );
    },

    assignment(courseId, id) {
      return api.getJSON(
        `/api/v1/courses/${courseId}/assignments/${id}?include[]=submission&include[]=rubric_assessment&include[]=score_statistics`,
        { ttl: TTL.assignment }
      );
    },

    async courseModules(courseId) {
      const mods = await api.getList(
        `/api/v1/courses/${courseId}/modules?include[]=items&per_page=50`,
        { maxPages: 10, ttl: TTL.modules }
      );
      // Canvas leaves out the items of a module it thinks is too big to inline.
      await Promise.all(mods.filter((m) => !m.items && m.items_count).map(async (m) => {
        m.items = await api.getList(`/api/v1/courses/${courseId}/modules/${m.id}/items?per_page=100`, { maxPages: 10, ttl: TTL.modules });
      }));
      return mods;
    },

    course(courseId) {
      return api.getJSON(
        `/api/v1/courses/${courseId}?include[]=term`,
        { ttl: TTL.course }
      );
    },

    plannerItems(startISO, endISO) {
      const q = "/api/v1/planner/items?per_page=100" +
        (startISO ? "&start_date=" + encodeURIComponent(startISO) : "") +
        (endISO ? "&end_date=" + encodeURIComponent(endISO) : "");
      return api.getList(q, { maxPages: 10, ttl: TTL.planner });
    },

    async setPlannerComplete(plannableType, plannableId, complete, overrideId) {
      const method = overrideId ? "PUT" : "POST";
      const path = overrideId ? "/api/v1/planner/overrides/" + overrideId : "/api/v1/planner/overrides";
      const body = overrideId
        ? { marked_complete: !!complete }
        : { plannable_type: plannableType, plannable_id: plannableId, marked_complete: !!complete };
      return plannerMutation(method, path, body);
    },

    createPlannerNote({ title, todoDate, courseId, details }) {
      const body = { title: title, todo_date: todoDate };
      if (details) body.details = details;
      if (courseId) body.course_id = courseId;
      return plannerMutation("POST", "/api/v1/planner_notes", body);
    },

    updatePlannerNote(id, { title, todoDate, details } = {}) {
      const body = {};
      if (title != null) body.title = title;
      if (todoDate) body.todo_date = todoDate;
      if (details != null) body.details = details;
      return plannerMutation("PUT", "/api/v1/planner_notes/" + encodeURIComponent(id), body);
    },

    deletePlannerNote(id) {
      return plannerMutation("DELETE", "/api/v1/planner_notes/" + encodeURIComponent(id), {});
    },

    async mutate(method, path, body) {
      const url = path.startsWith("http") ? path : base + path;
      // Only idempotent writes are retried. A POST that timed out or 5xx'd may still
      // have been applied server-side, and retrying it created duplicate planner notes.
      const res = await fetchRetry(url, {
        method, credentials: "include",
        headers: Object.assign({}, jsonHeaders, {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken(),
        }),
        body: JSON.stringify(body),
      }, method === "POST" ? 1 : 2);
      const text = await res.text();
      return text ? JSON.parse(stripPrefix(text)) : null;
    },
  });
})();
