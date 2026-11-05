/*
 * Better Canvas — notifications.
 * In-page toasts (always) and browser notifications (opt-in) for due-soon
 * assignments, new grades, new announcements, goal breaches, streaks at risk.
 * Uses content-side timers and the page Notification API.
 */
(function () {
  "use strict";
  const BC = (globalThis.BC = globalThis.BC || {});
  BC.features = BC.features || {};

  const seen = new Set();      // dedupe keys already fired in THIS page
  // The in-memory set alone reset on every page load. Canvas is mostly full page
  // navigations, and every load re-runs the scans, so "Grade below goal" fired on
  // every single page and due-soon / streak reminders repeated per navigation (and
  // per open tab). Fired keys are therefore also recorded in bcLocal for a few days.
  const SEEN_TTL = 3 * 24 * 60 * 60 * 1000;
  function firedBefore(key) {
    const m = BC.storage.local && BC.storage.local.notifSeen;
    return !!(m && m[key]);
  }

  function isQuietNow(n) {
    if (!n.quietHours || !n.quietHours.enabled) return false;
    return BC.dt.withinSchedule(n.quietHours.start, n.quietHours.end);
  }

  function shouldNotify(n, type) {
    if (!n.enabled && !n.inPage) return false;
    if (!n.types || !n.types[type]) return false;
    if (isQuietNow(n)) return false;
    return true;
  }

  function fire(n, opts) {
    // opts: { title, message, url, key, type }
    if (opts.key && (seen.has(opts.key) || firedBefore(opts.key))) return;
    if (opts.key) seen.add(opts.key);
    // Reminders stay up long enough to be noticed: 12s, held while hovered.
    if (n.inPage) BC.toast.info(opts.message, { title: opts.title, timeout: 12000, actions: opts.url ? [{ label: "Open", onClick: () => window.open(opts.url, "_blank") }] : [] });
    if (n.enabled) {
      try {
        if ("Notification" in window && Notification.permission === "granted") {
          const notif = new Notification(opts.title, { body: opts.message });
          if (opts.url) notif.onclick = () => window.open(opts.url, "_blank");
        }
      } catch (_) {}
    }
    // History goes to bcLocal: a bcSettings write from the notify path re-applied
    // all ~24 features, so every toast came with a visible hitch — and it bloated
    // exported settings JSON.
    BC.storage.updateLocal((d) => {
      const h = (d.notifHistory = d.notifHistory || []);
      h.unshift({ iso: new Date().toISOString(), type: opts.type || "info", title: opts.title, url: opts.url || "" });
      d.notifHistory = h.slice(0, 100);
      if (opts.key) {
        const m = (d.notifSeen = d.notifSeen || {});
        const now = Date.now();
        m[opts.key] = now;
        for (const k of Object.keys(m)) if (now - m[k] > SEEN_TTL) delete m[k];
      }
    });
  }

  // The service worker has always handled bc:setBadge; nothing ever sent it, so
  // the advertised toolbar counter never appeared. Fire-and-forget: the handler
  // responds synchronously, so never await it. Only changes are sent — apply()
  // calls this on every tick, and each message woke the service worker.
  let lastBadge = null;
  function sendBadge(count) {
    const n = count | 0;
    if (n === lastBadge) return;
    lastBadge = n;
    try { chrome.runtime.sendMessage({ type: "bc:setBadge", count: n }, () => void chrome.runtime.lastError); } catch (_) {}
  }
  BC.notifications = { sendBadge };

  async function scanDueSoon(settings) {
    const n = settings.notifications || {};
    const wantToasts = shouldNotify(n, "dueSoon");
    // The badge is independent of the due-soon toast type — you can want the count
    // without the interruptions.
    if (!wantToasts && !n.badgeCount) return;
    try {
      const leadMinutes = settings.notifications.leadMinutes || [60, 240, 1440];
      // Look far enough ahead for the longest reminder, and a day for the badge.
      const ahead = Math.max(24 * 60, ...leadMinutes.map((m) => Number(m) || 0)) + 10;
      const start = new Date();
      const end = new Date(start.getTime() + ahead * 60000);
      const items = await BC.api.plannerItems(start.toISOString(), end.toISOString());
      const now = Date.now();
      let dueCount = 0;
      for (const it of items) {
        // Lectures, office hours and announcements aren't work that comes due.
        if (it.plannable_type === "calendar_event" || it.plannable_type === "announcement") continue;
        const dueISO = it.plannable_date || (it.plannable && it.plannable.due_at);
        if (!dueISO) continue;
        // Done includes submitted work, not only items ticked in the planner —
        // nobody needs a "due soon" reminder for something already handed in.
        if (BC.api.plannerItemDone(it)) continue;
        const diff = new Date(dueISO).getTime() - now;
        if (diff <= 0) continue;
        if (diff <= 24 * 60 * 60 * 1000) dueCount++;
        if (!wantToasts) continue;
        const min = Math.floor(diff / 60000);
        for (const lead of leadMinutes) {
          if (Math.abs(min - lead) < 6) {
            const title = (it.plannable && it.plannable.title) || "Assignment";
            const url = it.html_url || (it.plannable && it.plannable.html_url) || "";
            const key = "due:" + (it.plannable_id || (it.plannable && it.plannable.id)) + ":" + lead;
            fire(settings.notifications, {
              title: "Due " + BC.dt.relative(dueISO),
              message: title + (it.context_name ? " · " + it.context_name : ""),
              url,
              key,
              type: "dueSoon",
            });
          }
        }
      }
      if (n.badgeCount) sendBadge(dueCount);
    } catch (e) { BC.diag.push("notifications:dueSoon", e); }
  }

  // Goal breaches, new grades, new announcements and streak-at-risk all ride ONE
  // coursesWithScores() fetch on the existing 10-minute alarm, so adding three
  // notification types costs one extra (cached) announcements request rather than
  // three separate scans.
  async function scanCourses(settings) {
    const n = settings.notifications || {};
    const wantGoal = shouldNotify(n, "goalBreach");
    const wantGrade = shouldNotify(n, "newGrade");
    const wantAnn = shouldNotify(n, "newAnnouncement");
    const wantStreak = shouldNotify(n, "streakAtRisk");
    if (!wantGoal && !wantGrade && !wantAnn && !wantStreak) return;

    if (wantStreak) scanStreak(settings);
    if (!wantGoal && !wantGrade && !wantAnn) return;

    try {
      const list = await BC.api.coursesWithScores();
      const active = list.filter((c) => !c.concluded);
      if (wantGoal || wantGrade) await scanScores(settings, active, wantGoal, wantGrade);
      if (wantAnn) await scanAnnouncements(settings, active.slice(0, 15));
    } catch (e) { BC.diag.push("notifications:courses", e); }
  }

  async function scanScores(settings, courses, wantGoal, wantGrade) {
    const n = settings.notifications;
    // One number per course. gradeHistory is the wrong source: it only accrues when
    // the user actually VISITS a course's grades page, so it can't detect a change
    // while they sit on the dashboard.
    const seenScores = (BC.storage.local && BC.storage.local.scoreSeen) || {};
    const nextSeen = {}, unseen = [];

    for (const c of courses) {
      const id = String(c.id);
      const cur = BC.api.courseScore(c);
      // An older baseline here, like the 0% once read for an ungraded course,
      // would make the first real grade look like a change.
      if (cur == null) { if (seenScores[id] != null) unseen.push(id); continue; }
      nextSeen[id] = cur;

      if (wantGrade) {
        const prev = seenScores[id];
        // First observation just establishes a baseline — no burst of "new grade"
        // toasts on the day someone installs the extension.
        if (prev != null && Math.abs(Number(cur) - Number(prev)) >= 0.01) {
          fire(n, {
            title: "New grade in " + (c.name || "course"),
            message: Number(prev).toFixed(1) + "% → " + Number(cur).toFixed(1) + "%",
            url: "/courses/" + id + "/grades",
            key: "grade:" + id + ":" + Number(cur).toFixed(2),
            type: "newGrade",
          });
        }
        // Feeds the trend chart, dashboard sparklines and the Insights tab for EVERY
        // course, instead of only ones whose grades page has been opened.
        if (BC.grades && BC.grades.recordScore) BC.grades.recordScore(id, Number(cur));
      }

      if (wantGoal) {
        const goal = ((settings.grades.goals || {})[id] || {}).target;
        if (goal != null && cur < goal) {
          fire(n, {
            title: "Grade below goal",
            message: `${c.name}: ${Number(cur).toFixed(1)}% (target ${goal}%)`,
            url: "/courses/" + id + "/grades",
            key: "goal:" + id + ":" + BC.dt.ymd(new Date()),
            type: "goalBreach",
          });
        }
      }
    }

    if (Object.keys(nextSeen).length || unseen.length) {
      BC.storage.updateLocal((d) => {
        d.scoreSeen = Object.assign(d.scoreSeen || {}, nextSeen);
        for (const id of unseen) delete d.scoreSeen[id];
      });
    }
  }

  async function scanAnnouncements(settings, courses) {
    const n = settings.notifications;
    // High-water mark, not a seen-set: O(1) storage, and immune to prune evicting
    // entries and re-notifying about the same post.
    const mark = (BC.storage.local && BC.storage.local.annSeenAt) || null;
    let newest = mark;

    const lists = await BC.util.mapLimit(courses, 4, (c) =>
      BC.api.courseAnnouncements(c.id, 3).then((a) => ({ c, a })).catch((e) => {
        BC.diag.push("notifications:ann:" + c.id, e);
        return { c, a: [] };
      }));

    for (const { c, a } of lists) {
      for (const post of a || []) {
        const at = post.posted_at || post.created_at;
        if (!at) continue;
        if (!newest || new Date(at) > new Date(newest)) newest = at;
        // First run establishes the mark without notifying about back-catalogue.
        if (!mark || new Date(at) <= new Date(mark)) continue;
        fire(n, {
          title: "New announcement",
          message: (post.title || "Announcement") + " · " + (c.name || ""),
          url: post.html_url || ("/courses/" + c.id + "/announcements"),
          key: "ann:" + (post.id || at),
          type: "newAnnouncement",
        });
      }
    }

    if (newest && newest !== mark) {
      BC.storage.updateLocal((d) => {
        if (!d.annSeenAt || new Date(newest) > new Date(d.annSeenAt)) d.annSeenAt = newest;
      });
    }
  }

  function scanStreak(settings) {
    if (!BC.todo || !BC.todo.streakState) return;
    // Streaks only exist in the planner, and only while they're switched on.
    const t = settings.todo || {};
    if (t.mode !== "custom" || !(t.streaks && t.streaks.enabled)) return;
    const ss = BC.todo.streakState(settings);
    // Only worth interrupting for when there's actually something to lose, the day
    // is nearly over, and grace won't cover it. Quiet hours already gate fire().
    if (ss.current < 2 || ss.todayActive || ss.graceLeft > 0) return;
    if (new Date().getHours() < 18) return;
    fire(settings.notifications, {
      title: "Streak at risk",
      message: "Your " + ss.current + "-day streak ends tonight — complete one task to keep it.",
      url: "/",
      key: "streak:" + BC.dt.ymd(new Date()),
      type: "streakAtRisk",
    });
  }

  function apply(settings) {
    const n = settings.notifications;
    const bag = BC.lifecycle.bag("notifications");

    if (!n || (!n.enabled && !n.inPage)) {
      // Turning notifications off now genuinely stops the scans and leaves the
      // feature able to re-arm. `started` latched true for the life of the page, so
      // enabling browser notifications mid-session never reached
      // requestPermission() and looked broken until a reload.
      bag.clear();
      BC.alarms.clear("bc-notif-due");
      BC.alarms.clear("bc-notif-scan");
      sendBadge(0);
      return;
    }
    if (!n.badgeCount) sendBadge(0);   // clear immediately when the toggle flips off

    if (n.enabled && "Notification" in window && Notification.permission === "default") {
      bag.once("perm", () => { Notification.requestPermission().catch(() => {}); });
    }

    bag.once("arm", () => {
      // Leaving this page may leave no Canvas tab to keep the count current. Sent
      // even when this page never showed a count: another tab's may still be up.
      bag.listen(window, "pagehide", () => {
        try { chrome.runtime.sendMessage({ type: "bc:leftCanvas" }, () => void chrome.runtime.lastError); } catch (_) {}
      });
      // Back/forward cache: the worker may have cleared the count while this page was away.
      bag.listen(window, "pageshow", (e) => {
        if (!e.persisted || !lastBadge) return;
        const n = lastBadge; lastBadge = null; sendBadge(n);
      });
      scanDueSoon(BC.storage.current); scanCourses(BC.storage.current);
      BC.alarms.every("bc-notif-due", 5 * 60 * 1000, () => scanDueSoon(BC.storage.current));
      BC.alarms.every("bc-notif-scan", 10 * 60 * 1000, () => scanCourses(BC.storage.current));
    });
  }

  BC.registry.register({
    id: "notifications", styles: [], nodes: [], apply,
    unmount() { seen.clear(); },
  });
})();
