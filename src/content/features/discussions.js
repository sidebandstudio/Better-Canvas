/*
 * Better Canvas — discussion enhancements.
 * Jump to the next unread reply and see reply / word counts on a discussion topic,
 * plus (classic discussions only) collapsing reply threads and highlighting
 * instructor posts.
 *
 * Canvas has two discussion UIs. The redesign (#discussion-redesign-layout, React)
 * already has its own Collapse Threads button, an Unread filter and TEACHER / AUTHOR
 * tags, so only what it lacks is added there. The classic page keeps the full set.
 */
(function () {
  "use strict";
  const BC = (globalThis.BC = globalThis.BC || {});
  BC.features = BC.features || {};

  const REDESIGN = "#discussion-redesign-layout";
  const CLASSIC = "#discussion_container";
  const R_ENTRY = '[data-testid="discussion-entry-container"]';
  const R_UNREAD = '[data-testid="is-unread"]';

  // Classic-page decorations live on Canvas's own nodes, so they stay in the page.
  const CSS = `
    .bc-instr-post { border-left: 3px solid var(--bc-accent, #0374b5) !important; padding-left: 8px; }
    .bc-instr-tag {
      display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 999px;
      background: var(--bc-accent, #0374b5); color: var(--bc-accent-contrast, #fff); font-size: var(--bc-text-3xs, 10px); font-weight: 700; vertical-align: middle;
    }
  `;
  const COLLAPSE_CSS = "#discussion_subentries .discussion-entries .discussion-entries { display: none !important; }";

  const BAR_CSS = `
:host { display: block; margin: 0 0 var(--bc-space-3, 12px); }
.db { display: flex; align-items: center; gap: var(--bc-space-2, 8px); flex-wrap: wrap; animation: db-in var(--bc-dur-3, 220ms) var(--bc-ease-out, ease); }
.db__meta { display: inline-flex; align-items: center; gap: 6px; font-size: var(--bc-text-xs, 12px); color: var(--bc-muted, #6b6b74); font-variant-numeric: tabular-nums; }
.db__meta b { color: var(--bc-text, #18181b); font-weight: var(--bc-weight-semibold, 600); }
.db__meta .db__unread { color: var(--bc-accent-text, #4338ca); }
@keyframes db-in { from { opacity: 0; transform: translateY(-3px); } }
@media (prefers-reduced-motion: reduce) { .db { animation: none; } }
`;

  let collapsed = false;

  function layout() {
    if (document.querySelector(REDESIGN)) return "redesign";
    if (document.querySelector(CLASSIC)) return "classic";
    return null;   // not rendered yet — never fall back to <body>
  }

  function unreadEntries(kind) {
    if (kind === "redesign") {
      return [...document.querySelectorAll(R_UNREAD)].map((u) => u.closest(R_ENTRY)).filter(Boolean);
    }
    return [...document.querySelectorAll(".discussion_entry.unread, .entry.unread .discussion_entry")];
  }

  function jumpToUnread(kind) {
    const unread = unreadEntries(kind);
    if (!unread.length) {
      // Canvas's counter can still show unread replies inside collapsed threads or
      // on other pages. Say where they are rather than "none" beside "3 unread".
      const counted = stats(kind).unread > 0;
      BC.toast.info(counted ? "The unread replies are in collapsed threads or on another page."
        : document.querySelector('[data-testid="pagination"]') ? "No unread replies on this page" : "No unread replies");
      return;
    }
    const y = window.scrollY;
    const next = unread.find((el) => el.getBoundingClientRect().top + window.scrollY > y + 80) || unread[0];
    const reduced = BC.ui && BC.ui.motion.reduced();
    next.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    // A brief ring on the reply, drawn with the animation API so nothing is written
    // to Canvas's element.
    if (!reduced && next.animate) {
      next.animate([{ boxShadow: "0 0 0 2px var(--bc-accent, #4f46e5)" }, { boxShadow: "0 0 0 2px transparent" }],
        { duration: 1600, easing: "ease-out", delay: 250 });
    }
  }

  const countWords = (nodes) => [...nodes].reduce((n, m) => n + (m.textContent.trim().match(/\S+/g) || []).length, 0);

  function stats(kind) {
    if (kind === "redesign") {
      const entries = document.querySelectorAll(R_ENTRY);
      // Canvas's own counter covers every page of replies; the DOM only holds one.
      const text = (document.querySelector('[data-testid="replies-counter"]') || {}).textContent || "";
      const num = (re) => { const m = text.match(re); return m ? parseInt(m[1].replace(/,/g, ""), 10) : null; };
      const posts = num(/([\d,]+)\s*repl/i);
      const unread = num(/([\d,]+)\s*unread/i);
      return {
        posts: posts != null ? posts : entries.length,
        unread: unread != null ? unread : document.querySelectorAll(R_ENTRY + " " + R_UNREAD).length,
        words: countWords(document.querySelectorAll(R_ENTRY + " .user_content")),
        paged: !!document.querySelector('[data-testid="pagination"]'),
      };
    }
    return {
      posts: document.querySelectorAll("#discussion_subentries .discussion_entry").length,
      unread: document.querySelectorAll(".discussion_entry.unread, .entry.unread").length,
      words: countWords(document.querySelectorAll("#discussion_subentries .message, #discussion_topic .message")),
      paged: false,
    };
  }

  async function highlightInstructors(courseId) {
    try {
      const staff = await BC.api.coursePeople(courseId, ["teacher", "ta"]);
      const ids = new Set(staff.map((u) => String(u.id)));
      const sel = "#discussion_subentries .discussion_entry, #discussion_topic.discussion_entry, article#discussion_topic";
      document.querySelectorAll(sel).forEach((entry) => {
        if (entry.dataset.bcInstrChecked) return;
        entry.dataset.bcInstrChecked = "1";
        const a = entry.querySelector("a[href*='/users/']");
        const m = a && (a.getAttribute("href") || "").match(/\/users\/(\d+)/);
        if (!m || !ids.has(m[1])) return;
        entry.classList.add("bc-instr-post");
        if (!entry.querySelector(".bc-instr-tag")) {
          const tag = document.createElement("span");
          tag.className = "bc-instr-tag";
          tag.setAttribute("data-bc-node", "bc-instr-tag");   // declared below, so teardown removes it
          tag.textContent = "Instructor";
          a.insertAdjacentElement("afterend", tag);
        }
      });
    } catch (e) { BC.diag.push("discussions", e); }
  }

  // Undoes the highlight on Canvas's own entries — the class and the "checked"
  // stamp live on nodes we don't own, so no node/style teardown reaches them.
  function clearInstructorMarks() {
    BC.injector.removeNode("bc-instr-tag");
    for (const el of document.querySelectorAll("[data-bc-instr-checked]")) {
      el.classList.remove("bc-instr-post");
      delete el.dataset.bcInstrChecked;
    }
  }

  function buildBar(body, d, kind) {
    const kids = [];
    // The redesign has its own Collapse Threads button.
    if (d.collapse && kind === "classic") {
      const btn = BC.ui.button(collapsed ? "Expand replies" : "Collapse replies", { size: "sm", icon: collapsed ? "maximize" : "minus" });
      btn.addEventListener("click", () => {
        collapsed = !collapsed;
        BC.injector.setStyle("bc-disc-collapse", collapsed ? COLLAPSE_CSS : "");
        btn.replaceChildren(BC.ui.icon(collapsed ? "maximize" : "minus"), BC.ui.el("span", { text: collapsed ? "Expand replies" : "Collapse replies" }));
      });
      kids.push(btn);
    }
    if (d.jumpToUnread) kids.push(BC.ui.button("Next unread", { size: "sm", icon: "chevron-down", onClick: () => jumpToUnread(kind) }));
    if (d.wordCount) kids.push(BC.ui.el("span", { class: "db__meta", "aria-live": "polite" }));
    body.replaceChildren(BC.ui.el("div", { class: "db" }, kids));
  }

  function paintMeta(body, s) {
    const meta = body.querySelector(".db__meta");
    if (!meta) return;
    const sig = s.posts + "/" + s.unread + "/" + s.words + "/" + s.paged;
    if (meta.dataset.sig === sig) return;
    meta.dataset.sig = sig;
    const b = (t) => BC.ui.el("b", { text: t });
    meta.replaceChildren(...[
      b(s.posts.toLocaleString()), BC.ui.el("span", { text: s.posts === 1 ? "reply" : "replies" }),
      s.unread ? BC.ui.el("span", { class: "db__unread", text: "· " + s.unread.toLocaleString() + " unread" }) : null,
      s.words ? BC.ui.el("span", { text: "· " + s.words.toLocaleString() + " words" + (s.paged ? " on this page" : "") }) : null,
    ].filter(Boolean));
  }

  function removeBar() {
    BC.injector.removeNode("bc-disc-bar");
  }

  function apply(settings, ctx) {
    const d = settings.discussions || {};
    const anyOn = d.collapse || d.jumpToUnread || d.wordCount || d.instructorHighlight;
    // Group discussions live under /groups, so they aren't a course "discussions" page.
    const onTopic = /^\/(courses|groups)\/\d+\/discussion_topics\/\d+/.test(ctx.path);
    const kind = onTopic ? layout() : null;
    if (!anyOn || !kind) {
      collapsed = false;
      removeBar();
      BC.injector.setStyle("bc-disc-css", "");
      BC.injector.setStyle("bc-disc-collapse", "");
      clearInstructorMarks();
      return;
    }
    BC.injector.setStyle("bc-disc-css", kind === "classic" ? CSS : "");

    const s = stats(kind);
    const wantBar = (d.jumpToUnread || d.wordCount || (d.collapse && kind === "classic")) && s.posts > 0;
    if (wantBar) {
      const anchor = kind === "redesign" ? document.querySelector(REDESIGN) : document.querySelector(CLASSIC).firstElementChild;
      const parent = kind === "redesign" ? anchor.parentNode : document.querySelector(CLASSIC);
      const m = BC.ui.mount("bc-disc-bar", { css: BAR_CSS, place: (host) => parent.insertBefore(host, anchor) });
      const sig = [kind, !!d.collapse, !!d.jumpToUnread, !!d.wordCount].join(",");
      if (m.host.dataset.bcSig !== sig) { m.host.dataset.bcSig = sig; buildBar(m.body, d, kind); }
      paintMeta(m.body, s);
    } else {
      // Nothing to jump to or count on a topic without replies (most announcements).
      removeBar();
    }

    // The redesign tags instructors itself.
    if (d.instructorHighlight && kind === "classic" && ctx.courseId) highlightInstructors(ctx.courseId);
    else clearInstructorMarks();
  }

  BC.registry.register({
    id: "discussions",
    styles: ["bc-disc-css", "bc-disc-collapse"],
    nodes: ["bc-disc-bar", "bc-instr-tag"],
    apply,
    unmount() { collapsed = false; clearInstructorMarks(); },
  });
})();
