/*
 * Better Canvas — study coach on the dashboard.
 * Ranks courses by how far they sit from their goal, and works out from Canvas's
 * own grade data what the next big assignment needs. All of that math runs here.
 *
 * For courses the student turns on, the background asks their own ChatGPT plan
 * for a study plan (src/background/coach.js). ChatGPT never sees a course the
 * student didn't turn on, and none of the numbers shown come from it.
 *
 * A Canvas page shares this DOM and can click these buttons, so every action
 * checks event.isTrusted, which a page script can't fake.
 */
(function () {
  "use strict";
  const BC = (globalThis.BC = globalThis.BC || {});
  BC.features = BC.features || {};
  const el = (t, a, c) => BC.ui.el(t, a, c);

  const DAY_MS = 864e5;
  const HORIZON_DAYS = 21;       // how far ahead the coach looks for graded work
  const MAX_COURSES = 12;
  const RELOAD_MS = 10 * 60000;

  // ---- the math ------------------------------------------------------------

  const counts = (a) => !a.omit_from_final_grade && a.workflow_state !== "unpublished" &&
    !(a.submission_types || []).includes("not_graded") && Number(a.points_possible) > 0;
  const graded = (a) => {
    const s = a.submission;
    return !!s && !s.excused && s.workflow_state !== "pending_review" && s.score != null && s.score !== "" && Number.isFinite(Number(s.score));
  };
  const handedIn = (a) => {
    const s = a.submission || {};
    return !!(s.excused || s.submitted_at || s.workflow_state === "submitted" || s.workflow_state === "pending_review");
  };
  const pct1 = (n) => Math.round(n * 10) / 10;

  // The score on one assignment that brings the course to `target`, by the same
  // calculator as Grade Tools. More points never lower a grade, so bisect.
  function needOn(groups, a, target) {
    const P = Number(a.points_possible);
    const at = (s) => BC.grades.computeTotalWith(groups, a.id, s);
    const best = at(P), worst = at(0);
    if (best == null || worst == null) return null;
    let needed = 0;
    if (worst < target) {
      if (best < target) needed = Infinity;
      else {
        let lo = 0, hi = P;
        for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (at(mid) >= target) hi = mid; else lo = mid; }
        // Rounded up to a tenth. The bisection lands a hair above an exact answer
        // like 70, which would otherwise round up to 70.1.
        needed = Math.ceil((hi / P) * 1000 - 1e-6) / 10;
        if (at((needed / 100) * P) < target) needed = Math.round(needed * 10 + 1) / 10;
      }
    }
    return { best, worst, needed };
  }

  // Everything the panel says about one course. `now` is a timestamp.
  function analyze({ course, groups, goal, defaultGoal, scale, now }) {
    const enr = (course.enrollments || [])[0] || {};
    const raw = enr.computed_current_score != null ? enr.computed_current_score : enr.computed_final_score;
    const canvas = raw == null ? null : Number(raw);
    const ours = BC.grades.computeTotal(groups);
    const score = canvas != null ? canvas : ours;
    const hasGoal = goal != null;
    const target = hasGoal ? goal : defaultGoal;
    // Projections use Better Canvas's calculator. When it and Canvas disagree by
    // more than a point, Canvas is counting something it doesn't show, such as
    // hidden grades, so a needed score would be a guess.
    const comparable = canvas == null || (ours != null && Math.abs(ours - canvas) <= 1);
    const items = [];
    for (const g of groups) for (const a of g.assignments || []) if (counts(a)) items.push(Object.assign({ groupName: g.name || "" }, a));

    const end = now + HORIZON_DAYS * DAY_MS;
    const upcoming = items.filter((a) => !graded(a) && !handedIn(a) && a.due_at &&
      Date.parse(a.due_at) > now && Date.parse(a.due_at) <= end).sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at));
    let focus = null;
    if (comparable && score != null) {
      for (const a of upcoming) {
        const n = needOn(groups, a, target);
        if (!n || n.best - n.worst < 1) continue;
        if (!focus || n.best - n.worst > focus.best - focus.worst) {
          focus = { id: String(a.id), name: a.name || "Assignment", url: a.html_url || "", dueAt: a.due_at, best: n.best, worst: n.worst, needed: n.needed, kind: kindOf(a) };
        }
      }
    }
    const missing = items.filter((a) => a.submission && a.submission.missing && !handedIn(a)).map((a) => ({
      id: String(a.id), name: a.name || "Assignment", url: a.html_url || "",
      ifFull: comparable ? BC.grades.computeTotalWith(groups, a.id, Number(a.points_possible)) : null,
    }));

    let status = "unknown";
    if (score != null) {
      if (score < target) status = "behind";
      else if (missing.length || (focus && focus.needed >= 70)) status = "watch";
      else status = "ok";
    }
    const gradedSig = items.filter(graded).map((a) => a.id + ":" + a.submission.score).join(",");
    const fingerprint = hash(JSON.stringify([score == null ? null : pct1(score), target, focus && [focus.id, focus.dueAt],
      missing.map((m) => m.id), upcoming.map((a) => a.id + "@" + a.due_at), gradedSig]));
    return {
      id: String(course.id), name: course.name || course.course_code || "Course " + course.id, code: course.course_code || "",
      score, letter: score == null ? "" : BC.grades.gradePoints(score, scale).letter,
      target, targetLetter: BC.grades.gradePoints(target, scale).letter, hasGoal, comparable, status,
      gap: score == null ? 0 : target - score, focus, missing, upcoming: upcoming.slice(0, 10).map((a) => ({ id: String(a.id), name: a.name, dueAt: a.due_at })),
      fingerprint,
    };
  }

  function kindOf(a) {
    const t = a.submission_types || [];
    if (a.is_quiz_assignment || t.includes("online_quiz")) return "quiz";
    if (t.includes("discussion_topic")) return "discussion";
    return "assignment";
  }

  const RANK = { behind: 0, watch: 1, ok: 2, unknown: 3 };
  function rank(list) {
    return list.slice().sort((a, b) => RANK[a.status] - RANK[b.status] || b.gap - a.gap || a.name.localeCompare(b.name));
  }

  // FNV-1a. Only compares a plan's inputs with the course's current ones.
  function hash(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16);
  }

  // A click from the student, not from a page script. Tests swap this out,
  // since a test browser can't make a trusted click.
  const trusted = (e) => BC.coach.trusted(e);
  BC.coach = { analyze, needOn, rank, trusted: (e) => !!(e && e.isTrusted) };

  // ---- what goes to ChatGPT ------------------------------------------------

  // Course HTML as plain text. DOMParser builds an inert document: no scripts
  // run and no images load.
  function text(html, max) {
    if (!html) return "";
    const doc = new DOMParser().parseFromString(String(html), "text/html");
    for (const n of doc.querySelectorAll("script, style, noscript, template")) n.remove();
    return (doc.body ? doc.body.textContent : "").replace(/\s+/g, " ").trim().slice(0, max);
  }
  const sameSite = (url) => { try { return new URL(url, location.origin).origin === location.origin ? new URL(url, location.origin).href : ""; } catch (_) { return ""; } };

  // One course's data, with an id for everything the plan may point at. Quiz
  // questions and answers are never fetched, so they can't be sent.
  async function buildContext(c, course, groups) {
    const links = {};
    const ref = (id, title, url) => { const u = sameSite(url); if (u) links[id] = { title: String(title || "").slice(0, 200), url: u }; return id; };
    const base = location.origin + "/courses/" + c.id;
    const [modules, syllabus, announcements] = await Promise.all([
      BC.api.courseModules(c.id).catch(() => []),
      BC.api.getJSON("/api/v1/courses/" + c.id + "?include[]=syllabus_body", { ttl: BC.api.TTL.course }).catch(() => null),
      BC.api.courseAnnouncements(c.id, 5).catch(() => []),
    ]);
    const all = [];
    for (const g of groups) for (const a of g.assignments || []) all.push(Object.assign({ groupName: g.name || "" }, a));
    const byId = new Map(all.map((a) => [String(a.id), a]));
    const percent = (a) => pct1(Number(a.submission.score) / Number(a.points_possible) * 100);
    const now = Date.now();
    const firstDay = new Date(now).getHours() < 20 ? BC.dt.ymd(now) : BC.dt.ymd(now + DAY_MS);
    let lastDay = BC.dt.ymd(now + 6 * DAY_MS);
    if (c.focus) {
      const due = Date.parse(c.focus.dueAt);
      const before = BC.dt.ymd(due - DAY_MS);
      lastDay = before >= firstDay ? before : BC.dt.ymd(due);
    }
    const focusRaw = c.focus && byId.get(c.focus.id);
    const context = {
      today: BC.dt.ymd(now),
      weekday: new Date(now).toLocaleDateString("en-US", { weekday: "long" }),
      plan: { firstDay, lastDay },
      course: { name: c.name, code: c.code },
      grade: { current: c.score == null ? null : pct1(c.score), letter: c.letter, target: c.target, targetLetter: c.targetLetter, studentSetTarget: c.hasGoal },
      focus: c.focus ? {
        id: ref("a" + c.focus.id, c.focus.name, c.focus.url), name: c.focus.name, kind: c.focus.kind, due: c.focus.dueAt,
        scoreNeeded: Number.isFinite(c.focus.needed) ? c.focus.needed : null, gradeIfPerfect: pct1(c.focus.best), gradeIfZero: pct1(c.focus.worst),
        // A quiz's description can hold its instructions; leave it out.
        description: focusRaw && kindOf(focusRaw) !== "quiz" ? text(focusRaw.description, 3000) : "",
      } : null,
      groups: groups.map((g) => {
        const done = (g.assignments || []).filter((a) => counts(a) && graded(a));
        const earned = done.reduce((s, a) => s + Number(a.submission.score), 0), possible = done.reduce((s, a) => s + Number(a.points_possible), 0);
        return { name: g.name || "", weight: g.group_weight || 0, yourPercent: possible ? pct1(earned / possible * 100) : null, graded: done.length };
      }),
      graded: all.filter((a) => counts(a) && graded(a)).sort((a, b) => Date.parse(b.due_at || 0) - Date.parse(a.due_at || 0)).slice(0, 40)
        .map((a) => ({ id: ref("a" + a.id, a.name, a.html_url), name: a.name, group: a.groupName, percent: percent(a) })),
      missing: c.missing.map((m) => ({ id: ref("a" + m.id, m.name, m.url), name: m.name })),
      upcoming: c.upcoming.map((u) => { const a = byId.get(u.id) || {}; return { id: ref("a" + u.id, u.name, a.html_url), name: u.name, due: u.dueAt, group: a.groupName || "" }; }),
      modules: (modules || []).slice(0, 15).map((m) => ({
        id: ref("m" + m.id, m.name, base + "/modules#module_" + m.id), name: m.name,
        items: (m.items || []).filter((it) => it.type !== "SubHeader").slice(0, 12).map((it) => ({ id: ref("i" + it.id, it.title, it.html_url), title: it.title, type: it.type })),
      })),
      syllabus: syllabus ? text(syllabus.syllabus_body, 6000) : "",
      announcements: (announcements || []).slice(0, 5).map((n) => ({ id: ref("n" + n.id, n.title, n.html_url), title: n.title, posted: n.posted_at, text: text(n.message, 600) })),
    };
    if (context.syllabus) ref("s", "Syllabus", base + "/assignments/syllabus");
    return { context, links };
  }

  // ---- state ---------------------------------------------------------------

  const state = {
    gen: 0,
    load: "idle",            // idle | loading | done | failed
    next: 0,
    failures: 0,
    loadedAt: 0,
    user: "",
    raw: [],                 // [{ course, groups }]
    courses: [],             // ranked analyses
    ai: null,                // { connected, usageUrl } once the background answers
    plans: new Map(),        // course id -> stored record
    autoReadyAt: new Map(),
    busy: new Set(),
    errors: new Map(),
    adding: new Set(),
    autoTried: new Set(),
    sig: "",
  };

  function send(type, extra) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(Object.assign({ type }, extra || {}), (r) => resolve(chrome.runtime.lastError || !r
          ? { ok: false, error: "Better Canvas's background didn't answer. Reload the page and try again." } : r));
      } catch (e) { resolve({ ok: false, error: e.message }); }
    });
  }

  function settingsSig(s) {
    return JSON.stringify([s.coach, s.grades.goals, s.grades.gpaScale]);
  }

  function analyzeAll(s) {
    const now = Date.now();
    state.courses = rank(state.raw.map(({ course, groups }) => analyze({
      course, groups, now, scale: s.grades.gpaScale, defaultGoal: BC.gradeNumber(s.coach.defaultGoal) ?? 80,
      goal: BC.gradeNumber(((s.grades.goals || {})[course.id] || {}).target),
    })));
  }

  async function load(s) {
    const [list, self] = await Promise.all([BC.api.coursesWithScores(), BC.api.self().catch(() => null)]);
    state.user = self && self.id != null ? String(self.id) : "";
    const hidden = (s.dashboard && s.dashboard.courses) || {};
    const active = list.filter((c) => !c.concluded && !(hidden[c.id] && hidden[c.id].hidden)).slice(0, MAX_COURSES);
    const loaded = await Promise.all(active.map((course) => BC.api.assignmentGroups(course.id).then((groups) => ({ course, groups }), () => null)));
    if (active.length && !loaded.some(Boolean)) throw new Error("Couldn't load any course's grades");
    state.raw = loaded.filter(Boolean);
  }

  function ensureLoaded(s) {
    BC.lifecycle.pageBag("coach").once("visible", () => BC.lifecycle.pageBag("coach").listen(document, "visibilitychange", () => {
      if (!document.hidden && BC.requestApply) BC.requestApply();
    }));
    if (state.load === "loading" || Date.now() < state.next || document.hidden) return;
    const gen = state.gen;
    state.load = "loading";
    const wake = (ms) => BC.lifecycle.pageBag("coach").timeout(() => { if (BC.requestApply) BC.requestApply(); }, ms);
    load(s).then(() => {
      if (gen !== state.gen) return;
      state.load = "done"; state.failures = 0; state.loadedAt = Date.now();
      state.next = Date.now() + RELOAD_MS; wake(RELOAD_MS);
      analyzeAll(BC.storage.current);
      render();
      return syncPlans(gen);
    }).catch((e) => {
      if (gen !== state.gen) return;
      state.load = "failed";
      const delay = Math.min(60000, 1000 * 2 ** Math.min(state.failures++, 6));
      state.next = Date.now() + delay; wake(delay);
      BC.diag.push("coach:load", e);
      render();
    });
  }

  async function syncPlans(gen) {
    const status = await send("bc:coach:status");
    if (gen !== state.gen) return;
    state.ai = { connected: !!(status.ok && status.connected), usageUrl: status.usageUrl || "https://chatgpt.com/settings/usage" };
    if (state.ai.connected && state.user) {
      const r = await send("bc:coach:plans", { user: state.user, courseIds: state.courses.map((c) => c.id) });
      if (gen !== state.gen) return;
      if (r.ok) for (const [id, p] of Object.entries(r.plans || {})) {
        if (p.record) state.plans.set(id, p.record); else state.plans.delete(id);
        state.autoReadyAt.set(id, p.autoReadyAt || 0);
      }
    }
    render();
    autoUpdate(gen);
  }

  const optedIn = (id) => !!((BC.storage.current.coach || {}).courses || {})[id];
  const lastDay = (rec) => rec.plan.sessions.length ? rec.plan.sessions[rec.plan.sessions.length - 1].day : BC.dt.ymd(rec.createdAt);
  const isStale = (c, rec) => !rec || rec.fingerprint !== c.fingerprint || lastDay(rec) < BC.dt.ymd(Date.now());

  // Rewrites plans for turned-on courses that need attention, one at a time, when
  // their grades or due dates changed. The background allows one a day per course.
  async function autoUpdate(gen) {
    const s = BC.storage.current;
    if (!state.ai || !state.ai.connected || !s.coach.autoUpdate) return;
    for (const c of state.courses) {
      if (gen !== state.gen) return;
      if (c.status !== "behind" && c.status !== "watch") continue;
      if (!optedIn(c.id) || state.autoTried.has(c.id) || state.busy.has(c.id)) continue;
      if (!isStale(c, state.plans.get(c.id)) || Date.now() < (state.autoReadyAt.get(c.id) || 0)) continue;
      state.autoTried.add(c.id);
      await requestPlan(c, true);
    }
  }

  async function requestPlan(c, auto) {
    if (state.busy.has(c.id) || !state.user) return;
    const raw = state.raw.find((r) => String(r.course.id) === c.id);
    if (!raw) return;
    state.busy.add(c.id); state.errors.delete(c.id);
    render();
    try {
      const { context, links } = await buildContext(c, raw.course, raw.groups);
      const r = await send("bc:coach:plan", { user: state.user, courseId: c.id, fingerprint: c.fingerprint, context, links, auto: !!auto });
      if (r.ok) { state.plans.set(c.id, r.record); state.autoReadyAt.set(c.id, Date.now() + 20 * 3600e3); }
      else if (!(auto && r.code === "auto_wait")) state.errors.set(c.id, r);
    } catch (e) {
      state.errors.set(c.id, { error: "Couldn't gather this course for ChatGPT. Try again." });
      BC.diag.push("coach:plan", e);
    } finally { state.busy.delete(c.id); render(); }
  }

  // The first plan for a course asks before anything leaves the browser.
  function confirmCourse(c) {
    return new Promise((resolve) => {
      let dlg = null, ok = false;
      const cancel = BC.ui.button("Cancel", { variant: "ghost", size: "sm", onClick: () => dlg.close() });
      const go = BC.ui.button("Send and make a plan", { variant: "primary", size: "sm", onClick: (e) => {
        if (!trusted(e)) return;
        ok = true; dlg.close();
      } });
      dlg = BC.ui.dialog({
        title: "Send " + c.name + " to ChatGPT?",
        body: [
          el("p", { text: "To write a study plan, Better Canvas sends this course's data to OpenAI through your ChatGPT plan:" }),
          el("ul", null, [
            el("li", { text: "Your scores on graded work, by assignment group" }),
            el("li", { text: "Names and due dates of upcoming and missing work, and the instructions for the next big one" }),
            el("li", { text: "Module and item titles, the syllabus and the last 5 announcements" }),
          ]),
          el("p", { text: "It never sends your name, quiz questions, your answers or other courses. You can turn this off in Study coach settings." }),
        ],
        actions: [cancel, go],
        onClose: () => resolve(ok),
      });
      dlg.open();
    });
  }

  async function makePlan(c, e) {
    if (!trusted(e)) return;
    if (!optedIn(c.id)) {
      if (!(await confirmCourse(c))) return;
      await BC.storage.update((d) => { d.coach.courses[c.id] = true; });
    }
    requestPlan(c, false);
  }

  const sessionStart = (x) => { const [y, m, d] = x.day.split("-").map(Number); const [h, mi] = x.start.split(":").map(Number); return new Date(y, m - 1, d, h, mi); };
  const upcomingSessions = (rec) => rec.plan.sessions.map((x, i) => ({ x, i })).filter(({ x }) => sessionStart(x).getTime() > Date.now());

  // Each session becomes a Canvas planner note at its time, which also shows up in
  // Canvas's own planner and app, plus a block in the planner's day view.
  async function addToPlanner(c, e) {
    if (!trusted(e) || state.adding.has(c.id)) return;
    let rec = state.plans.get(c.id);
    if (!rec) return;
    state.adding.add(c.id); state.errors.delete(c.id);
    render();
    try {
      for (const { x, i } of upcomingSessions(rec)) {
        if (rec.added[i]) continue;
        const note = await BC.api.createPlannerNote({
          title: plain(x.task, rec.links).slice(0, 200), todoDate: sessionStart(x).toISOString(), courseId: c.id,
          details: "Study session from Better Canvas's study coach" + (rec.focusName ? " for " + rec.focusName : "") + ".",
        });
        if (!note || note.id == null) throw new Error("Canvas didn't return the new planner item");
        await BC.storage.updateLocal((d) => {
          const t = (d.todo = d.todo || {});
          (t.scheduled = t.scheduled || {})["planner_note:" + note.id] = { ymd: x.day, start: x.start, dur: x.minutes };
        });
        const r = await send("bc:coach:added", { user: state.user, courseId: c.id, createdAt: rec.createdAt, index: i, noteId: String(note.id) });
        rec = r.ok ? r.record : Object.assign({}, rec, { added: Object.assign({}, rec.added, { [i]: String(note.id) }) });
        state.plans.set(c.id, rec);
      }
      BC.toast && BC.toast.success("Study sessions added to your planner.");
    } catch (err) {
      const done = upcomingSessions(rec).filter(({ i }) => rec.added[i]).length;
      state.errors.set(c.id, { error: (done ? "Added " + done + " of " + upcomingSessions(rec).length + " sessions. " : "") + "Canvas didn't save the rest. Try again." });
      BC.diag.push("coach:planner", err);
    } finally { state.adding.delete(c.id); render(); }
  }

  // ---- drawing -------------------------------------------------------------

  // Plan text with each [[id]] turned into a link named by Canvas, not by ChatGPT.
  // An id with no link is dropped along with the space before it.
  const known = (t, links) => String(t || "").replace(/\s*\[\[([^\]]+)\]\]/g, (m, id) => (links && links[id] ? m : ""));
  function rich(t, links) {
    const out = [];
    const parts = known(t, links).split(/\[\[([^\]]+)\]\]/);
    parts.forEach((part, i) => {
      if (i % 2 === 0) { if (part) out.push(document.createTextNode(part)); return; }
      const link = links && links[part];
      const url = link && sameSite(link.url);
      if (link && url) out.push(el("a", { href: url, text: link.title }));
      else if (link) out.push(document.createTextNode(link.title));
    });
    return out;
  }
  function plain(t, links) {
    return known(t, links).replace(/\[\[([^\]]+)\]\]/g, (m, id) => links[id].title).replace(/\s+/g, " ").trim();
  }

  const fmtPct = (n) => n.toFixed(1) + "%";
  const fmtDue = (iso) => BC.dt.fmtDay(iso) + ", " + BC.dt.fmtTime(iso);
  const shortDay = (d) => { const f = BC.dt.fmtDay(d); return /^(Today|Tomorrow)$/.test(f) ? f : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); };
  const fmtMin = (m) => (m >= 60 ? Math.floor(m / 60) + "h" + (m % 60 ? " " + (m % 60) + "m" : "") : m + "m");
  const link = (name, url) => { const u = sameSite(url); return u ? el("a", { href: u, text: name }) : el("b", { text: name }); };
  const p = (kids, cls) => el("p", { class: cls || null }, kids);
  const targetText = (c) => fmtPct(c.target) + " (" + c.targetLetter + ")";

  function mathLines(c) {
    const out = [];
    if (!c.comparable) {
      out.push(p(["Canvas counts something in this course that Better Canvas can't see, like hidden grades, so it won't guess what you need."]));
    } else if (c.focus) {
      const f = c.focus, due = " due " + fmtDue(f.dueAt);
      if (f.needed === Infinity) out.push(p(["Even 100% on ", link(f.name, f.url), "," + due + ", leaves you at ", el("b", { text: fmtPct(f.best) }), ", under " + targetText(c) + "."]));
      else if (f.needed <= 0) out.push(p([link(f.name, f.url), "," + due + ", can't pull you below " + targetText(c) + "."]));
      else out.push(p(["You need ", el("b", { text: fmtPct(f.needed) }), " on ", link(f.name, f.url), "," + due + ", to reach " + targetText(c) + "."]));
      out.push(p(["It can move your grade anywhere from " + fmtPct(f.worst) + " to " + fmtPct(f.best) + "."], "co-sub"));
    }
    for (const m of c.missing.slice(0, 2)) {
      out.push(p(m.ifFull != null && c.comparable
        ? [link(m.name, m.url), " is missing. Full credit on it would bring you to ", el("b", { text: fmtPct(m.ifFull) }), "."]
        : [link(m.name, m.url), " is missing."]));
    }
    if (c.missing.length > 2) out.push(p([String(c.missing.length - 2) + " more missing."], "co-sub"));
    if (c.comparable && !c.focus && !c.upcoming.length) out.push(p(["Nothing graded is due in the next 3 weeks."], "co-sub"));
    return out;
  }

  function aiBlock(c) {
    if (!state.ai || !state.ai.connected) return null;
    const rec = state.plans.get(c.id), err = state.errors.get(c.id);
    const kids = [];
    if (err) {
      kids.push(el("div", { class: "co-err", role: "alert" }, [el("span", { text: err.error || "Something went wrong." }),
        err.manageUsage ? el("a", { href: state.ai.usageUrl, target: "_blank", rel: "noopener noreferrer", text: " Manage usage" }) : null]));
    }
    if (state.busy.has(c.id)) {
      kids.push(el("div", { class: "co-busy", role: "status" }, [el("span", { class: "co-dot" }), "Writing a study plan with ChatGPT…"]));
      return el("div", { class: "co-ai" }, kids);
    }
    if (!rec || !optedIn(c.id)) {
      kids.push(el("div", { class: "co-actions" }, [BC.ui.button("Make a study plan", { size: "sm", variant: "primary", onClick: (e) => makePlan(c, e) })]));
      return el("div", { class: "co-ai" }, kids);
    }
    const next = upcomingSessions(rec);
    kids.push(el("div", { class: "co-tag", text: "ChatGPT" }));
    if (rec.plan.summary) kids.push(p(rich(rec.plan.summary, rec.links), "co-summary"));
    if (next.length) {
      kids.push(el("ul", { class: "co-plan" }, next.map(({ x, i }) => el("li", { class: rec.added[i] ? "is-added" : null }, [
        el("span", { class: "co-when", text: shortDay(sessionStart(x)) + " " + BC.dt.fmtTime(sessionStart(x)) + " · " + fmtMin(x.minutes) }),
        el("span", null, rich(x.task, rec.links)),
      ]))));
    }
    if (rec.plan.caveat) kids.push(p(rich(rec.plan.caveat, rec.links), "co-sub"));
    const stale = isStale(c, rec);
    if (stale) kids.push(p([next.length ? "Your grades or due dates changed since ChatGPT wrote this plan." : "This plan's sessions are over."], "co-sub"));
    const left = next.filter(({ i }) => !rec.added[i]).length;
    const actions = [];
    if (next.length) {
      const b = BC.ui.button(state.adding.has(c.id) ? "Adding…" : left ? (left < next.length ? "Add the rest to planner" : "Add to planner") : "Added to planner",
        { size: "sm", variant: left ? "primary" : "ghost", icon: left ? "plus" : "check", onClick: (e) => addToPlanner(c, e) });
      b.disabled = !left || state.adding.has(c.id);
      actions.push(b);
    }
    actions.push(BC.ui.button(stale ? "Update plan" : "New plan", { size: "sm", variant: stale && !next.length ? "primary" : "ghost", icon: "refresh", onClick: (e) => makePlan(c, e) }));
    kids.push(el("div", { class: "co-actions" }, actions));
    return el("div", { class: "co-ai" }, kids);
  }

  function courseRow(c) {
    const grades = location.origin + "/courses/" + c.id + "/grades";
    return el("article", { class: "co-row is-" + c.status }, [
      el("div", { class: "co-bar", "aria-hidden": "true" }),
      el("div", { class: "co-main" }, [
        el("div", { class: "co-top" }, [
          el("a", { class: "co-course", href: grades, text: c.name }),
          el("span", { class: "co-grade", text: fmtPct(c.score) + " " + c.letter }),
          el("span", { class: "co-goal", text: (c.hasGoal ? "goal " : "target ") + targetText(c) }),
        ]),
        el("div", { class: "co-math" }, mathLines(c)),
        aiBlock(c),
      ]),
    ]);
  }

  function okRow(c) {
    const next = c.upcoming[0];
    return el("li", null, [
      el("a", { class: "co-course", href: location.origin + "/courses/" + c.id + "/grades", text: c.name }),
      el("span", { class: "co-grade", text: fmtPct(c.score) + " " + c.letter }),
      el("span", { class: "co-sub", text: next ? "On track. Next up: " + next.name + ", " + BC.dt.fmtDay(next.dueAt) + "." : "On track." }),
    ]);
  }

  function openSettings(e, section) {
    if (!trusted(e)) return;
    send("bc:openOptions", { section });
  }

  function render() {
    const host = document.querySelector('[data-bc-node="bc-coach"]');
    const body = host && host.shadowRoot && host.shadowRoot.querySelector(".bc-root");
    if (!body) return;
    // Keep keyboard focus on the same control across a redraw.
    const active = host.shadowRoot.activeElement;
    const focusKey = active && active.closest("[data-key]") ? active.closest("[data-key]").dataset.key + "|" + active.textContent : "";

    const head = el("header", { class: "co-head" }, [
      el("h2", { text: "Study coach" }),
      state.ai && state.ai.connected ? el("span", { class: "co-pill", text: "Using ChatGPT plan" }) : null,
      el("span", { class: "co-when-head", text: state.loadedAt ? "Updated " + BC.dt.fmtTime(state.loadedAt) : "" }),
      BC.ui.iconButton("settings", { label: "Study coach settings", size: "sm", onClick: (e) => openSettings(e, "coach") }),
    ]);
    const kids = [head];
    if (state.load === "failed" && !state.courses.length) {
      kids.push(BC.ui.errorState("Couldn't load your grades.", () => { state.next = 0; if (BC.requestApply) BC.requestApply(); }));
    } else if (!state.courses.length) {
      kids.push(state.load === "done" ? el("p", { class: "co-sub", text: "No current courses with grades yet." }) : BC.ui.skeleton(3));
    } else {
      const focus = state.courses.filter((c) => c.status === "behind" || c.status === "watch");
      const fine = state.courses.filter((c) => c.status === "ok");
      for (const c of focus) { const r = courseRow(c); r.dataset.key = c.id; kids.push(r); }
      if (fine.length) kids.push(el("ul", { class: "co-ok" }, fine.map(okRow)));
      if (!focus.length) kids.push(el("p", { class: "co-sub", text: "Every course is at or above its target." }));
    }
    const foot = [];
    if (state.ai && !state.ai.connected) {
      foot.push(el("span", { text: "Connect your ChatGPT Plus or Pro plan to get study plans for these courses." }),
        BC.ui.button("Set up ChatGPT", { size: "sm", variant: "ghost", onClick: (e) => openSettings(e, "chatgpt") }));
    } else if (state.ai) {
      foot.push(el("span", { text: "Only courses you turn on go to ChatGPT. Grades and the scores you need come from Better Canvas, not ChatGPT." }));
    }
    if (foot.length) kids.push(el("footer", { class: "co-foot" }, foot));
    body.replaceChildren(...kids);

    if (focusKey) {
      const [key, label] = focusKey.split("|");
      const row = body.querySelector('[data-key="' + key + '"]');
      const again = row && [...row.querySelectorAll("button, a")].find((b) => b.textContent === label);
      if (again) again.focus();
    }
  }

  const CSS = `
:host { display: block; margin: 0 0 var(--bc-space-5, 20px); }
.bc-root { padding: var(--bc-space-4, 16px); border: 1px solid var(--bc-border, #e4e4e7); border-radius: var(--bc-radius-lg, 12px);
  background: var(--bc-surface-2, #fff); color: var(--bc-text, #18181b); font-size: var(--bc-text-sm, 13px); line-height: 1.45; }
.co-head { display: flex; align-items: center; gap: var(--bc-space-3, 12px); margin-bottom: var(--bc-space-3, 12px); }
.co-head h2 { margin: 0; font-size: var(--bc-text-md, 15px); font-weight: var(--bc-weight-semibold, 600); }
.co-pill { font-size: var(--bc-text-2xs, 11px); padding: 2px 8px; border-radius: var(--bc-radius-pill, 999px); background: var(--bc-surface-3, #f4f4f5); color: var(--bc-muted, #6b6b74); }
.co-when-head { margin-left: auto; font-size: var(--bc-text-xs, 12px); color: var(--bc-muted, #6b6b74); }
.co-row { display: grid; grid-template-columns: 4px minmax(0, 1fr); gap: var(--bc-space-3, 12px); padding: var(--bc-space-3, 12px) 0; border-top: 1px solid var(--bc-border, #e4e4e7); }
.co-head + .co-row { border-top: 0; padding-top: 0; }
.co-bar { border-radius: 2px; background: var(--bc-success, #16a34a); }
.is-behind .co-bar { background: var(--bc-danger, #dc2626); }
.is-watch .co-bar { background: #d97706; }
.co-top { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
.co-course { font-weight: var(--bc-weight-semibold, 600); color: inherit; text-decoration: none; }
.co-course:hover { text-decoration: underline; }
.co-grade, .co-goal { font-variant-numeric: tabular-nums; color: var(--bc-muted, #6b6b74); }
.co-math { margin-top: 6px; padding: 8px 10px; border-radius: var(--bc-radius-md, 8px); background: var(--bc-surface-3, #f4f4f5); }
.co-math:empty { display: none; }
.co-math p, .co-ai p { margin: 0 0 4px; }
.co-math p:last-child, .co-ai p:last-child { margin-bottom: 0; }
.co-math b { font-variant-numeric: tabular-nums; }
a { color: var(--bc-link, #2563eb); }
.co-sub { color: var(--bc-muted, #6b6b74); font-size: var(--bc-text-xs, 12px); }
.co-ai { margin-top: 8px; }
.co-tag { font-size: var(--bc-text-2xs, 11px); text-transform: uppercase; letter-spacing: .04em; color: var(--bc-muted, #6b6b74); margin-bottom: 2px; }
.co-plan { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 6px 14px; list-style: none; margin: 6px 0; padding: 0; }
.co-plan li { display: contents; }
.co-plan li.is-added .co-when::after { content: " · in planner"; }
.co-when { color: var(--bc-muted, #6b6b74); font-variant-numeric: tabular-nums; white-space: nowrap; }
.co-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.co-busy { display: flex; align-items: center; gap: 8px; color: var(--bc-muted, #6b6b74); }
.co-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--bc-accent, #4f46e5); animation: co-pulse 1s ease-in-out infinite alternate; }
@keyframes co-pulse { from { opacity: .3; } }
.co-err { color: var(--bc-danger, #b91c1c); margin-bottom: 6px; }
.co-ok { list-style: none; margin: 0; padding: var(--bc-space-2, 8px) 0 0; border-top: 1px solid var(--bc-border, #e4e4e7); }
.co-head + .co-ok { border-top: 0; padding-top: 0; }
.co-ok li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; padding: 3px 0; }
.co-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-top: var(--bc-space-3, 12px);
  padding-top: var(--bc-space-3, 12px); border-top: 1px solid var(--bc-border, #e4e4e7); font-size: var(--bc-text-xs, 12px); color: var(--bc-muted, #6b6b74); }
@media (max-width: 640px) { .co-plan { grid-template-columns: minmax(0, 1fr); gap: 0; } .co-plan li > span:last-child { margin-bottom: 6px; } }
@media (prefers-reduced-motion: reduce) { .co-dot { animation: none; } }
`;

  function mount() {
    const container = document.getElementById("DashboardCard_Container") || document.querySelector(".ic-DashboardCard__box") ||
      document.getElementById("dashboard-planner");
    if (!container || !container.parentNode) return null;
    // Above the course filter when that's on, so the filter stays next to the cards.
    const search = document.querySelector('[data-bc-node="bc-course-search"]');
    const before = search && search.parentNode === container.parentNode ? search : container;
    return BC.ui.mount("bc-coach", { css: CSS, place: (host) => container.parentNode.insertBefore(host, before) });
  }

  function apply(settings, ctx) {
    const on = ctx.page === "dashboard" && settings.dashboard && settings.dashboard.enabled && settings.coach && settings.coach.enabled;
    if (!on) { BC.injector.removeNode("bc-coach"); return; }
    BC.lifecycle.pageBag("coach").once("visit", () => {
      state.gen++; state.load = "idle"; state.next = 0; state.failures = 0; state.autoTried.clear();
    });
    const m = mount();
    if (!m) return;
    ensureLoaded(settings);
    const sig = settingsSig(settings);
    if (sig !== state.sig) {
      state.sig = sig;
      if (state.raw.length) analyzeAll(settings);
      render();
    } else if (m.fresh) render();
  }

  BC.registry.register({
    id: "coach",
    nodes: ["bc-coach"],
    apply,
    unmount() {
      state.gen++;
      state.load = "idle"; state.raw = []; state.courses = []; state.plans.clear(); state.errors.clear(); state.sig = "";
    },
  });
})();
