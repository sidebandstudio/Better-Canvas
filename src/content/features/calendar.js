/* Better Canvas — calendar (.ics export + mini month view on dashboard). */
(function () {
  "use strict";
  const BC = (globalThis.BC = globalThis.BC || {});
  BC.features = BC.features || {};

  function icsEscape(s) {
    return String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,")
      .replace(/\r\n|\r|\n/g, "\\n");
  }

  // RFC 5545 §3.1: content lines longer than 75 octets must be folded (CRLF plus
  // one space). Long assignment titles produced lines strict importers reject.
  const utf8 = new TextEncoder();
  function icsFold(line) {
    if (utf8.encode(line).length <= 75) return line;
    const out = [];
    let cur = "", len = 0;
    for (const ch of line) {
      const n = utf8.encode(ch).length;
      // Continuation lines start with the folding space, so they hold 74 octets.
      if (len + n > (out.length ? 74 : 75)) { out.push(cur); cur = ""; len = 0; }
      cur += ch; len += n;
    }
    out.push(cur);
    return out.join("\r\n ");
  }

  // Announcements are posts, not things that happen or come due.
  function isDated(it) { return it.plannable_type !== "announcement"; }

  function icsDate(d) {
    const x = new Date(d);
    const pad = (n) => String(n).padStart(2, "0");
    return x.getUTCFullYear() + pad(x.getUTCMonth() + 1) + pad(x.getUTCDate()) + "T" +
           pad(x.getUTCHours()) + pad(x.getUTCMinutes()) + "00Z";
  }

  async function exportIcs() {
    try {
      const start = new Date(); start.setDate(start.getDate() - 14);
      const end = new Date(); end.setDate(end.getDate() + 90);
      const items = await BC.api.plannerItems(start.toISOString(), end.toISOString());
      // Canvas stores an all-day event as midnight where its creator is, so this
      // browser's clock can put it on the day before. The event's all_day_date
      // can't, but only the calendar events API sends it.
      const isAllDay = (it) => it.plannable_type === "calendar_event" && it.plannable && it.plannable.all_day;
      const allDayDates = new Map(await Promise.all(items.filter(isAllDay).map((it) =>
        BC.api.getJSON("/api/v1/calendar_events/" + encodeURIComponent(it.plannable_id || it.plannable.id))
          .then((ev) => [it, ev && /^\d{4}-\d{2}-\d{2}$/.test(ev.all_day_date) ? ev.all_day_date : null], () => [it, null]))));
      // Personal events were advertised but nothing ever wrote them and there was no
      // UI, so the setting is gone. bcLocal.calendarEvents is left as the read path
      // in case the feature is built later; today it's simply empty.
      const local = (BC.storage.local && BC.storage.local.calendarEvents) || [];
      const lines = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Better Canvas//EN","CALSCALE:GREGORIAN"];
      for (const it of items) {
        if (!isDated(it)) continue;
        const pl = it.plannable || {};
        const due = it.plannable_date || pl.due_at; if (!due) continue;
        // Ids are only unique per type: an assignment and a discussion can share one.
        const uid = "bc-" + (it.plannable_type || "item") + "-" + (it.plannable_id || pl.id || Math.random()) + "@" + location.host;
        // Calendar events keep their real span, and all-day events stay all-day.
        // Due work is a 30-minute block from the due time.
        const allDay = isAllDay(it);
        const ymd = (d) => BC.dt.ymd(new Date(d)).replace(/-/g, "");   // the local calendar day
        // The end date is exclusive: the next calendar day, by date rather than by
        // adding 24 hours, which lands on the same day when clocks go back.
        const dayAfter = (d) => { const x = new Date(d); x.setDate(x.getDate() + 1); return x; };
        const day = allDayDates.get(it);
        const dayStart = day && new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
        const span = allDay && dayStart ? ["DTSTART;VALUE=DATE:" + ymd(dayStart), "DTEND;VALUE=DATE:" + ymd(dayAfter(dayStart))]
          : allDay ? ["DTSTART;VALUE=DATE:" + ymd(pl.start_at || due), "DTEND;VALUE=DATE:" + ymd(dayAfter(pl.end_at || pl.start_at || due))]
          : ["DTSTART:" + icsDate(pl.start_at || due), "DTEND:" + icsDate(pl.end_at || new Date(new Date(due).getTime() + 30 * 60 * 1000))];
        const url = it.html_url ? new URL(it.html_url, location.origin).href : "";
        lines.push("BEGIN:VEVENT",
          "UID:" + uid,
          "DTSTAMP:" + icsDate(new Date()),
          ...span,
          "SUMMARY:" + icsEscape(pl.title || "Assignment"),
          "DESCRIPTION:" + icsEscape(it.context_name || ""),
          ...(url ? ["URL:" + url] : []),
          "END:VEVENT");
      }
      for (const ev of local) {
        lines.push("BEGIN:VEVENT",
          "UID:bc-local-" + (ev.id || Math.random()) + "@better-canvas",
          "DTSTAMP:" + icsDate(new Date()),
          "DTSTART:" + icsDate(ev.start),
          "DTEND:" + icsDate(ev.end || ev.start),
          "SUMMARY:" + icsEscape(ev.title),
          "DESCRIPTION:" + icsEscape(ev.description || ""),
          "END:VEVENT");
      }
      lines.push("END:VCALENDAR");
      const blob = new Blob([lines.map(icsFold).join("\r\n") + "\r\n"], { type: "text/calendar" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "better-canvas.ics"; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      // Counted from what was written: items without a date are skipped above.
      const n = lines.filter((l) => l === "BEGIN:VEVENT").length;
      BC.toast.success("Exported " + n + " event" + (n === 1 ? "" : "s"));
    } catch (e) { BC.toast.error("Export failed: " + e.message); }
  }

  BC.calendar = { exportIcs };

  const CSS = `
    .bc-mini-cal {
      background: var(--bc-surface-2, #fff); border: 1px solid var(--bc-border, #e5e7eb);
      border-radius: 10px; padding: 12px; margin-bottom: 12px;
    }
    .bc-mini-cal h4 { margin: 0 0 8px; font-size: 14px; }
    .bc-mini-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; }
    .bc-mini-cell {
      aspect-ratio: 1 / 1; display: flex; align-items: center; justify-content: center;
      font-size: 12px; border-radius: 4px; background: var(--bc-surface-3, #f7fafc); color: var(--bc-text, inherit);
      position: relative;
    }
    .bc-mini-cell.today { background: var(--bc-accent, #0374b5); color: var(--bc-accent-contrast, #fff); }
    .bc-mini-cell.has::after { content:""; position: absolute; right: 4px; top: 4px; width: 5px; height: 5px; background: var(--bc-accent, #0374b5); border-radius: 50%; }
    .bc-mini-cell.today.has::after { background: var(--bc-accent-contrast, #fff); }
  `;

  async function renderMini(mount) {
    const today = new Date();
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const last  = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    // The query runs to the START of next month. Ending it at `last` (00:00 on the
    // last day) silently dropped everything due on the final day of the month.
    const next  = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    let items = [];
    try {
      items = await BC.api.plannerItems(first.toISOString(), next.toISOString());
    } catch (e) {
      // A swallowed failure rendered an empty month grid, which is indistinguishable
      // from "nothing is due" — the most misleading failure mode in the extension.
      BC.diag.push("calendar:mini", e);
      if (BC.ui) {
        mount.replaceChildren(BC.ui.errorState("Couldn't load this month.", () => renderMini(mount)));
        return;
      }
    }
    const dueByDay = new Set();
    for (const it of items) {
      const d = it.plannable_date || (it.plannable && it.plannable.due_at);
      if (!d || !isDated(it)) continue;
      const when = new Date(d);
      if (when.getMonth() === today.getMonth() && when.getFullYear() === today.getFullYear()) dueByDay.add(when.getDate());
    }
    let html = `<h4>${BC.dt.MONTHS[today.getMonth()]} ${today.getFullYear()}</h4><div class="bc-mini-grid">`;
    const startDow = first.getDay();
    for (let i = 0; i < startDow; i++) html += `<div></div>`;
    for (let d = 1; d <= last.getDate(); d++) {
      const cls = ["bc-mini-cell"];
      if (d === today.getDate()) cls.push("today");
      if (dueByDay.has(d)) cls.push("has");
      html += `<div class="${cls.join(" ")}">${d}</div>`;
    }
    html += `</div>`;
    mount.innerHTML = html;
  }

  function apply(settings, ctx) {
    const c = settings.calendar || {};
    if (!c.miniOnDashboard || ctx.page !== "dashboard") {
      BC.injector.removeNode("bc-mini-cal");
      BC.injector.setStyle("bc-mini-cal-css", "");
      return;
    }
    BC.injector.setStyle("bc-mini-cal-css", CSS);
    const target = BC.util.firstOf(["#right-side", "#dashboard", "#DashboardCard_Container"]);
    if (!target) return;
    const panel = BC.injector.ensureNode("bc-mini-cal", target.parentNode || target, () => {
      const d = document.createElement("div");
      d.className = "bc-mini-cal";
      (target.parentNode || target).insertBefore(d, target);
      return d;
    });
    if (panel._loaded) return;
    panel._loaded = true;
    renderMini(panel);
  }

  BC.registry.register({ id: "calendar", styles: ["bc-mini-cal-css"], nodes: ["bc-mini-cal"], apply });
})();
