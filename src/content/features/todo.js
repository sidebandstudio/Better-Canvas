/*
 * Better Canvas — To Do.
 * Three modes (settings.todo.mode):
 *  - "default": Canvas's own list, untouched.
 *  - "clean":   Canvas's own list, restyled to match the rest of Better Canvas.
 *  - "custom":  the Better Canvas planner in its place — list, board and day views,
 *               overdue and snoozed sections, stars, task details, streaks and a
 *               focus timer.
 *
 * The planner renders into a shadow root (BC.ui.mount), so Canvas's stylesheets and
 * the dark mode engine can't restyle it. It is laid out for Canvas's right sidebar,
 * which is only ~240–320px wide; Board and Day also open in a wide sheet.
 */
(function () {
  "use strict";
  const BC = (globalThis.BC = globalThis.BC || {});
  BC.features = BC.features || {};
  const el = (t, a, c) => BC.ui.el(t, a, c);
  const icon = (n, o) => BC.ui.icon(n, o);

  // ---- clean mode: Canvas's own list, restyled ------------------------------
  // Real markup (Canvas's ToDoSidebar): h2.todo-list-header, then
  // ul#planner-todosidebar-item-list > li > .ToDoSidebarItem with __Icon, __Info
  // (__Title link, course text, an InlineList of due date / points) and __Close.
  const S = ".Sidebar__TodoListContainer";
  const CLEAN_CSS = `
    ${S} [data-testid="ToDoSidebar"] {
      margin: 0 0 var(--bc-space-6, 24px) !important; padding: 12px !important;
      border: 1px solid var(--bc-border, #e4e4e7) !important; border-radius: var(--bc-radius-lg, 12px) !important;
      background: var(--bc-surface-2, #fff) !important; color: var(--bc-text, #18181b) !important;
    }
    ${S} h2.todo-list-header {
      display: flex !important; align-items: center !important; margin: 0 0 6px !important; padding: 0 6px 10px !important;
      border: 0 !important; border-bottom: 1px solid var(--bc-border, #e4e4e7) !important;
      font-size: 15px !important; font-weight: 600 !important; line-height: 1.25 !important; color: var(--bc-text, #18181b) !important;
    }
    /* minmax(0, 1fr), not auto: Canvas's TruncateText measures the full title in a
       hidden spacer, and an auto track grew to that width — past the sidebar. */
    ${S} #planner-todosidebar-item-list { display: grid !important; grid-template-columns: minmax(0, 1fr) !important; gap: 2px !important; margin: 0 !important; padding: 0 !important; }
    ${S} #planner-todosidebar-item-list > li { margin: 0 !important; padding: 0 !important; border: 0 !important; background: none !important; }
    ${S} .ToDoSidebarItem {
      display: flex !important; align-items: flex-start !important; gap: 10px !important; margin: 0 !important; padding: 8px 6px !important;
      border: 0 !important; border-radius: var(--bc-radius-md, 8px) !important;
      transition: background-color var(--bc-dur-1, 90ms) var(--bc-ease-standard, ease);
    }
    ${S} .ToDoSidebarItem:hover, ${S} .ToDoSidebarItem:focus-within { background: var(--bc-surface-hover, #f4f4f5) !important; }
    ${S} .ToDoSidebarItem__Icon {
      flex: none !important; box-sizing: content-box !important; width: 14px !important; height: 14px !important;
      margin: 0 !important; padding: 7px !important; border-radius: var(--bc-radius-md, 8px) !important;
      background: var(--bc-accent-weak, rgba(79,70,229,.12)) !important; color: var(--bc-accent-text, #4338ca) !important; fill: currentColor !important;
    }
    ${S} .ToDoSidebarItem__Info {
      flex: 1 1 auto !important; min-width: 0 !important; overflow: hidden !important; display: grid !important;
      grid-template-columns: minmax(0, 1fr) !important; gap: 2px !important; margin: 0 !important;
      font-size: 12px !important; line-height: 1.4 !important; color: var(--bc-muted, #6b6b74) !important;
    }
    ${S} .ToDoSidebarItem__Info * { color: inherit; }
    ${S} .ToDoSidebarItem__Title a, ${S} .ToDoSidebarItem__Title a * {
      color: var(--bc-text, #18181b) !important; font-size: 13px !important; font-weight: 500 !important; line-height: 1.35 !important; text-decoration: none !important;
    }
    ${S} .ToDoSidebarItem__Title a:hover, ${S} .ToDoSidebarItem__Title a:hover * { color: var(--bc-accent-text, #4338ca) !important; }
    ${S} .ToDoSidebarItem__Info ul, ${S} .ToDoSidebarItem__Info li { margin: 0 !important; padding: 0 !important; }
    ${S} .ToDoSidebarItem__Close { flex: none !important; margin: -4px -2px 0 0 !important; opacity: 0; transition: opacity var(--bc-dur-2, 150ms) ease; }
    ${S} .ToDoSidebarItem:hover .ToDoSidebarItem__Close, ${S} .ToDoSidebarItem:focus-within .ToDoSidebarItem__Close { opacity: 1; }
    /* A touch screen has no hover, so the dismiss button was never visible there. */
    @media (hover: none) { ${S} .ToDoSidebarItem__Close { opacity: 1; } }
    ${S} [data-testid="ToDoSidebar"] > :is(a, button, div > a) {
      display: block !important; margin: 6px 0 0 !important; padding: 7px 6px !important; border-radius: var(--bc-radius-md, 8px) !important;
      font-size: 13px !important; font-weight: 500 !important; text-align: center !important; color: var(--bc-accent-text, #4338ca) !important;
      text-decoration: none !important; transition: background-color var(--bc-dur-1, 90ms) ease;
    }
    ${S} [data-testid="ToDoSidebar"] > :is(a, button):hover { background: var(--bc-surface-hover, #f4f4f5) !important; }
  `;

  const HIDE_NATIVE_CSS = `.Sidebar__TodoListContainer, .ToDoSidebar { display: none !important; }`;

  // ---- planner styles (inside the shadow root) ------------------------------
  const HOST_CSS = `:host { display: block; margin: 0 0 var(--bc-space-6, 24px); }`;

  const WIDGET_CSS = `
.pl {
  --pl-accent: var(--bc-todo-accent, var(--bc-accent, #4f46e5));
  position: relative; padding: 14px 14px 8px;
  border: 1px solid var(--bc-border, #e4e4e7); border-radius: var(--bc-radius-lg, 12px);
  background: var(--bc-surface-2, #fff); color: var(--bc-text, #18181b); font-size: var(--bc-text-sm, 13px);
}
.pl--wide { padding: 0; border: 0; border-radius: 0; background: transparent; }
.pl--enter { animation: pl-rise var(--bc-dur-4, 300ms) var(--bc-ease-out, ease) both; }
@keyframes pl-rise { from { opacity: 0; transform: translateY(6px); filter: blur(2px); } }
@keyframes pl-fade-in { from { opacity: 0; } }
@keyframes pl-from-right { from { opacity: 0; transform: translateX(12px); filter: blur(2px); } }
@keyframes pl-from-left { from { opacity: 0; transform: translateX(-12px); filter: blur(2px); } }

/* header */
.pl-head { display: flex; align-items: center; gap: 10px; min-width: 0; }
.pl-ring { position: relative; flex: none; width: 36px; height: 36px; }
.pl-ring svg { display: block; }
.pl-ring__track { stroke: var(--bc-surface-3, #f4f4f5); }
.pl-ring__value { stroke: var(--pl-accent); transition: stroke-dashoffset 700ms var(--bc-ease-out, ease), stroke var(--bc-dur-3, 220ms) ease; }
.pl-ring.is-complete .pl-ring__value { stroke: var(--bc-success, #047857); }
.pl-ring.is-complete { animation: pl-pulse 640ms var(--bc-ease-spring, ease) 1; }
@keyframes pl-pulse { 40% { transform: scale(1.12); } }
.pl-ring__label {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: var(--bc-weight-semibold, 600); font-variant-numeric: tabular-nums; letter-spacing: -.02em;
}
.pl-ring__label--long { font-size: 9px; }
.pl-titles { flex: 1 1 auto; min-width: 0; }
.pl-title { font-size: 15px; font-weight: var(--bc-weight-semibold, 600); line-height: 1.25; letter-spacing: -.01em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pl-sub { margin-top: 2px; font-size: var(--bc-text-xs, 12px); color: var(--bc-muted, #6b6b74);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
.pl-nav { display: flex; align-items: center; flex: none; margin-right: -6px; }
.pl-nav .bc-btn--sm { padding: 0 6px; }
.pl-bar { margin-top: 12px; }
.pl-bar .bc-progress2 { height: 4px; }
.pl-bar .bc-progress2-fill { background: var(--pl-accent); transition-duration: 700ms; }

/* toolbar */
.pl-tools { display: flex; align-items: center; gap: 2px; margin: 12px 0 2px; min-width: 0; }
.pl-tools .bc-seg, .pl-summary { margin-right: auto; }
/* What needs attention, so the toolbar row says something on its own. */
.pl-summary { display: flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; white-space: nowrap;
  font-size: var(--bc-text-xs, 12px); color: var(--bc-muted, #6b6b74); }
.pl-summary__late { color: var(--bc-danger, #b91c1c); font-weight: var(--bc-weight-medium, 500); }
.pl-tools .bc-seg__opt { width: 30px; padding: 0; }

/* body */
.pl-body { margin: 0 -6px; }
.pl-body--next { animation: pl-from-right var(--bc-dur-3, 220ms) var(--bc-ease-out, ease); }
.pl-body--prev { animation: pl-from-left var(--bc-dur-3, 220ms) var(--bc-ease-out, ease); }
.pl-body--fade { animation: pl-fade-in var(--bc-dur-3, 220ms) var(--bc-ease-out, ease); }
.pl-group { margin-top: 10px; break-inside: avoid; }
.pl-group__head {
  display: flex; align-items: baseline; gap: 6px; padding: 2px 6px 4px;
  font-size: var(--bc-text-2xs, 11px); font-weight: var(--bc-weight-semibold, 600); letter-spacing: .04em; text-transform: uppercase; color: var(--bc-muted, #6b6b74);
}
.pl-group__title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pl-group__count { margin-left: auto; font-variant-numeric: tabular-nums; letter-spacing: 0; color: var(--bc-text-subtle, #a1a1aa); }
.pl-group--danger .pl-group__title { color: var(--bc-danger, #b91c1c); }
.pl-list { display: grid; gap: 1px; margin: 0; padding: 0; list-style: none; }

/* rows */
.pl-item {
  position: relative; display: grid; grid-template-columns: 18px minmax(0, 1fr); column-gap: 10px; align-items: start;
  padding: 7px 6px; border-radius: var(--bc-radius-md, 8px);
  transition: background-color var(--bc-dur-1, 90ms) var(--bc-ease-standard, ease);
}
.pl-item:hover, .pl-item:focus-within { background: var(--bc-surface-hover, #f4f4f5); }
.pl--enter .pl-item { animation: pl-rise var(--bc-dur-3, 220ms) var(--bc-ease-out, ease) both; animation-delay: calc(var(--i, 0) * 22ms + 60ms); }
.pl-item.is-leaving {
  overflow: hidden; height: 0 !important; padding-top: 0; padding-bottom: 0; opacity: 0; transform: translateX(10px);
  transition: height var(--bc-dur-3, 220ms) var(--bc-ease-standard, ease), padding var(--bc-dur-3, 220ms) var(--bc-ease-standard, ease),
              opacity var(--bc-dur-2, 150ms) ease, transform var(--bc-dur-3, 220ms) var(--bc-ease-standard, ease);
}
.pl-check {
  position: relative; display: grid; place-items: center; width: 18px; height: 18px; margin: 1px 0 0; padding: 0;
  border: 1.5px solid var(--bc-border-contrast, #a1a1aa); border-radius: 50%; background: transparent;
  color: var(--bc-accent-contrast, #fff); cursor: pointer;
  transition: border-color var(--bc-dur-2, 150ms) ease, background-color var(--bc-dur-2, 150ms) ease, box-shadow var(--bc-dur-2, 150ms) ease;
}
.pl-check svg { width: 11px; height: 11px; fill: none; stroke: currentColor; stroke-width: 3.2; stroke-linecap: round; stroke-linejoin: round; }
/* 18px looks right, but WCAG asks for a 24px target. Grow the hit area only. */
.pl-check::before, .pl-block button::before { content: ""; position: absolute; inset: -4px; }
.pl-block button { position: relative; }
.pl-check path { stroke-dasharray: 1; stroke-dashoffset: 1; transition: stroke-dashoffset var(--bc-dur-3, 220ms) var(--bc-ease-out, ease) 60ms, opacity var(--bc-dur-2, 150ms) ease; }
.pl-check:hover { border-color: var(--pl-accent); box-shadow: 0 0 0 3px var(--bc-accent-weak, rgba(79,70,229,.12)); }
.pl-check:not([aria-checked="true"]):hover { color: var(--pl-accent); }
.pl-check:not([aria-checked="true"]):hover path { stroke-dashoffset: 0; opacity: .45; transition-delay: 0s; }
.pl-check[aria-checked="true"] { border-color: var(--pl-accent); background: var(--pl-accent); }
.pl-check[aria-checked="true"] path { stroke-dashoffset: 0; opacity: 1; }
.pl-check.is-popping { animation: pl-pop var(--bc-dur-4, 300ms) var(--bc-ease-spring, ease); }
@keyframes pl-pop { 0% { transform: scale(1); } 35% { transform: scale(.78); } 70% { transform: scale(1.1); } 100% { transform: scale(1); } }
.pl-check:focus-visible { outline: 2px solid var(--bc-focus-ring, #4f46e5); outline-offset: 2px; }
.pl-item__main { min-width: 0; }
.pl-item__title {
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere;
  color: var(--bc-text, #18181b); font-size: var(--bc-text-sm, 13px); font-weight: var(--bc-weight-medium, 500); line-height: 1.35;
  text-decoration: line-through; text-decoration-color: transparent;
  transition: color var(--bc-dur-3, 220ms) ease, text-decoration-color var(--bc-dur-3, 220ms) ease;
}
.pl-item:not(.is-done) a.pl-item__title:hover { color: var(--bc-accent-text, #4338ca); text-decoration-color: transparent; }
.pl-item.is-done .pl-item__title { color: var(--bc-text-subtle, #a1a1aa); text-decoration-color: currentColor; }
/* Groups wrap to a second line rather than squeezing the course name to nothing
   in the ~240px sidebar; spacing separates them, so a wrapped line never starts
   with a stray dot. */
.pl-item__meta {
  display: flex; flex-wrap: wrap; align-items: center; gap: 2px 10px; margin-top: 3px; min-width: 0;
  font-size: var(--bc-text-xs, 12px); line-height: 1.35; color: var(--bc-muted, #6b6b74);
}
.pl-meta__grp { display: inline-flex; align-items: center; gap: 5px; flex: none; max-width: 100%; min-width: 0; white-space: nowrap; }
.pl-meta__grp .bc-icon { flex: none; width: 12px; height: 12px; }
.pl-meta__course { flex: 0 1 auto; }
.pl-course { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.pl-dot { display: inline-block; flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--pl-c, var(--bc-text-subtle, #a1a1aa));
  box-shadow: inset 0 0 0 1px rgba(128,128,128,.35); }
.pl-due--late { color: var(--bc-danger, #b91c1c); font-weight: var(--bc-weight-medium, 500); }
.pl-due--soon { color: var(--bc-warn, #a16207); }
.pl-pri { padding: 0 5px; border-radius: 4px; background: var(--bc-danger-bg, #fef2f2); color: var(--bc-danger, #b91c1c);
  font-size: 10px; font-weight: var(--bc-weight-bold, 700); line-height: 16px; }
.pl-pri--2 { background: var(--bc-warn-bg, #fffbeb); color: var(--bc-warn, #a16207); }
.pl-starred { color: #f59e0b; }
.pl-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
.pl-chip-sm { display: inline-flex; align-items: center; gap: 3px; height: 18px; padding: 0 6px; border-radius: var(--bc-radius-pill, 999px);
  background: var(--bc-surface-3, #f4f4f5); color: var(--bc-muted, #6b6b74); font-size: var(--bc-text-2xs, 11px); }
.pl-chip-sm .bc-icon { width: 11px; height: 11px; }
.pl-item__actions {
  position: absolute; top: 3px; right: 3px; display: flex; padding-left: 16px;
  background: linear-gradient(to right, transparent, var(--bc-surface-hover, #f4f4f5) 16px);
  border-radius: 0 var(--bc-radius-md, 8px) var(--bc-radius-md, 8px) 0;
  opacity: 0; transform: translateX(4px); pointer-events: none;
  transition: opacity var(--bc-dur-2, 150ms) ease, transform var(--bc-dur-2, 150ms) var(--bc-ease-out, ease);
}
.pl-item:hover .pl-item__actions, .pl-item:focus-within .pl-item__actions { opacity: 1; transform: none; pointer-events: auto; }
.pl-item__actions .bc-iconbtn { width: 26px; height: 26px; }
.pl-item__actions .bc-iconbtn[aria-pressed="true"] { color: #f59e0b; background: transparent; }
@media (hover: none) { .pl-item__actions { opacity: 1; transform: none; pointer-events: auto; } }
.pl--compact .pl-item { padding-top: 5px; padding-bottom: 5px; }
.pl--compact .pl-item__title { -webkit-line-clamp: 1; }
.pl-more {
  display: block; width: 100%; margin: 2px 0 0; padding: 6px 6px 6px 34px; border: 0; border-radius: var(--bc-radius-md, 8px);
  background: transparent; color: var(--bc-accent-text, #4338ca); font: inherit; font-size: var(--bc-text-xs, 12px); font-weight: var(--bc-weight-medium, 500);
  text-align: left; cursor: pointer;
}
.pl-more:hover { background: var(--bc-surface-hover, #f4f4f5); }

/* empty */
.pl-empty { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 20px 10px 12px; text-align: center; animation: pl-fade-in var(--bc-dur-3, 220ms) ease; }
.pl-empty__icon { display: grid; place-items: center; width: 40px; height: 40px; margin-bottom: 6px; border-radius: 50%;
  background: var(--bc-success-bg, #ecfdf5); color: var(--bc-success, #047857); }
.pl-empty__icon .bc-icon { width: 20px; height: 20px; }
.pl-empty__title { font-weight: var(--bc-weight-semibold, 600); }
.pl-empty__hint { font-size: var(--bc-text-xs, 12px); color: var(--bc-muted, #6b6b74); }
.pl-empty .bc-btn { margin-top: 8px; }
.pl-tray__more { align-self: center; font-size: var(--bc-text-xs, 12px); color: var(--bc-muted, #6b6b74); }

/* snoozed */
.pl-snoozed { margin-top: 8px; }
.pl-snoozed > summary {
  display: flex; align-items: center; gap: 6px; padding: 6px; border-radius: var(--bc-radius-md, 8px); list-style: none; cursor: pointer;
  font-size: var(--bc-text-xs, 12px); font-weight: var(--bc-weight-medium, 500); color: var(--bc-muted, #6b6b74);
}
.pl-snoozed > summary::-webkit-details-marker { display: none; }
.pl-snoozed > summary:hover { background: var(--bc-surface-hover, #f4f4f5); color: var(--bc-text, #18181b); }
.pl-snoozed > summary .bc-icon { width: 14px; height: 14px; transition: transform var(--bc-dur-2, 150ms) var(--bc-ease-out, ease); }
.pl-snoozed[open] > summary .bc-icon { transform: rotate(90deg); }
.pl-done > .pl-list { margin-top: 2px; animation: pl-fade-in var(--bc-dur-2, 150ms) ease; }
.pl-snoozed__row { display: flex; align-items: center; gap: 8px; padding: 2px 6px 2px 26px; font-size: var(--bc-text-xs, 12px); animation: pl-fade-in var(--bc-dur-2, 150ms) ease; }
.pl-snoozed__name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pl-snoozed__when { color: var(--bc-text-subtle, #a1a1aa); font-variant-numeric: tabular-nums; }

/* composer */
.pl-add { margin: 4px -6px 0; }
.pl-add__open {
  display: flex; align-items: center; gap: 10px; width: 100%; height: 32px; padding: 0 6px; border: 0; border-radius: var(--bc-radius-md, 8px);
  background: transparent; color: var(--bc-muted, #6b6b74); font: inherit; font-size: var(--bc-text-sm, 13px); text-align: left; cursor: pointer;
  transition: background-color var(--bc-dur-1, 90ms) ease, color var(--bc-dur-1, 90ms) ease;
}
.pl-add__open:hover { background: var(--bc-surface-hover, #f4f4f5); color: var(--bc-text, #18181b); }
.pl-add__plus { display: grid; place-items: center; flex: none; width: 18px; height: 18px; color: var(--pl-accent); }
.pl-add__plus .bc-icon { width: 16px; height: 16px; }
.pl-add__form { display: grid; gap: 8px; padding: 6px; animation: pl-rise var(--bc-dur-2, 150ms) var(--bc-ease-out, ease); }
.pl-add__row { display: flex; gap: 6px; }
.pl-add__row > * { flex: 1 1 0; min-width: 0; }
.pl-add__actions { display: flex; justify-content: flex-end; gap: 6px; }

/* footer */
.pl-foot { display: flex; align-items: center; gap: 4px; margin: 8px -6px 0; padding-top: 8px; border-top: 1px solid var(--bc-border, #e4e4e7); }
.pl-foot__btn {
  display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 8px; border: 0; border-radius: var(--bc-radius-md, 8px);
  background: transparent; color: var(--bc-muted, #6b6b74);
  font: var(--bc-weight-medium, 500) var(--bc-text-xs, 12px)/1 var(--bc-font-sans, system-ui, sans-serif); font-variant-numeric: tabular-nums;
  white-space: nowrap; cursor: pointer; transition: background-color var(--bc-dur-1, 90ms) ease, color var(--bc-dur-1, 90ms) ease;
}
.pl-foot__btn:hover { background: var(--bc-surface-hover, #f4f4f5); color: var(--bc-text, #18181b); }
.pl-foot__btn .bc-icon { width: 14px; height: 14px; }
.pl-streak.is-active .bc-icon { color: #f97316; }
.pl-focus.is-running { background: var(--bc-accent-weak, rgba(79,70,229,.12)); color: var(--bc-accent-text, #4338ca); }

/* streak popover */
.pl-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
.pl-stat__v { font-size: var(--bc-text-xl, 20px); font-weight: var(--bc-weight-semibold, 600); font-variant-numeric: tabular-nums; line-height: 1.2; }
.pl-stat__l { font-size: var(--bc-text-2xs, 11px); color: var(--bc-muted, #6b6b74); }
.pl-pop-note { font-size: var(--bc-text-xs, 12px); color: var(--bc-muted, #6b6b74); }

/* board */
.pl-board { display: grid; gap: 8px; margin-top: 8px; }
.pl-col { padding: 2px 0; border-radius: var(--bc-radius-lg, 12px); transition: background-color var(--bc-dur-2, 150ms) ease, box-shadow var(--bc-dur-2, 150ms) ease; }
.pl-col__head { display: flex; align-items: center; gap: 6px; padding: 4px 6px;
  font-size: var(--bc-text-2xs, 11px); font-weight: var(--bc-weight-semibold, 600); letter-spacing: .04em; text-transform: uppercase; color: var(--bc-muted, #6b6b74); }
.pl-col__dot { width: 6px; height: 6px; border-radius: 50%; background: var(--bc-text-subtle, #a1a1aa); }
.pl-col[data-col="doing"] .pl-col__dot { background: var(--bc-warn, #a16207); }
.pl-col[data-col="done"] .pl-col__dot { background: var(--bc-success, #047857); }
.pl-col.is-drop { background: var(--bc-accent-weak, rgba(79,70,229,.12)); box-shadow: inset 0 0 0 1.5px var(--bc-accent-border, rgba(79,70,229,.45)); }
.pl-col__empty { margin: 2px 6px; padding: 10px 6px; border: 1px dashed var(--bc-border, #e4e4e7); border-radius: var(--bc-radius-md, 8px);
  list-style: none; text-align: center; font-size: var(--bc-text-xs, 12px); color: var(--bc-text-subtle, #a1a1aa); }
.pl-item[draggable="true"] { cursor: grab; }
.pl-item.is-dragging { opacity: .4; }

/* day plan */
.pl-day__hint { padding: 2px 6px 8px; font-size: var(--bc-text-xs, 12px); color: var(--bc-muted, #6b6b74); }
.pl-after-overdue { padding: 10px 6px 2px; }
.pl-tray { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 6px 10px; }
.pl-chip {
  display: inline-flex; align-items: center; gap: 6px; max-width: 100%; height: 26px; padding: 0 10px;
  border: 1px dashed var(--bc-border-strong, #d4d4d8); border-radius: var(--bc-radius-pill, 999px);
  background: var(--bc-surface-2, #fff); color: var(--bc-text, #18181b); font: inherit; font-size: var(--bc-text-xs, 12px); cursor: grab;
  transition: border-color var(--bc-dur-1, 90ms) ease, background-color var(--bc-dur-1, 90ms) ease;
}
.pl-chip:hover { border-color: var(--pl-accent); background: var(--bc-accent-weak, rgba(79,70,229,.12)); }
.pl-chip .pl-dot { flex: none; }
.pl-chip > span:last-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pl-grid { position: relative; margin: 0 6px; border: 1px solid var(--bc-border, #e4e4e7); border-radius: var(--bc-radius-md, 8px); overflow: hidden; }
.pl-hour { display: flex; border-top: 1px solid var(--bc-border-subtle, #f0f0f2); transition: background-color var(--bc-dur-1, 90ms) ease; }
.pl-hour:first-child { border-top: 0; }
.pl-hour__label { flex: 0 0 40px; padding: 3px 6px 0; border-right: 1px solid var(--bc-border-subtle, #f0f0f2);
  font-size: 10px; text-align: right; color: var(--bc-text-subtle, #a1a1aa); font-variant-numeric: tabular-nums; }
.pl-hour.is-drop { background: var(--bc-accent-weak, rgba(79,70,229,.12)); }
.pl-block {
  position: absolute; left: 44px; right: 4px; display: flex; align-items: center; gap: 4px; padding: 0 2px 0 8px; overflow: hidden;
  border-radius: 6px; background: var(--pl-accent); color: var(--bc-accent-contrast, #fff); box-shadow: var(--bc-shadow-1, 0 1px 2px rgba(0,0,0,.08));
  font-size: var(--bc-text-2xs, 11px); font-weight: var(--bc-weight-medium, 500); cursor: grab; animation: pl-fade-in var(--bc-dur-2, 150ms) ease;
}
.pl-block > span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pl-block button { display: grid; place-items: center; flex: none; width: 18px; height: 18px; padding: 0; border: 0; border-radius: 4px;
  background: transparent; color: inherit; opacity: .8; cursor: pointer; }
.pl-block button:hover { opacity: 1; background: rgba(255,255,255,.2); }
.pl-block .bc-icon { width: 12px; height: 12px; }
.pl-grid.is-dragging .pl-block { pointer-events: none; }
.pl-now { position: absolute; left: 40px; right: 0; height: 0; border-top: 2px solid var(--bc-danger, #b91c1c); pointer-events: none; }
.pl-now::before { content: ""; position: absolute; left: -4px; top: -5px; width: 8px; height: 8px; border-radius: 50%; background: var(--bc-danger, #b91c1c); }

/* celebration */
.pl-burst { position: absolute; width: 0; height: 0; pointer-events: none; z-index: 2; }
.pl-burst i { position: absolute; left: -3px; top: -3px; width: 6px; height: 6px; border-radius: 2px; animation: pl-burst 760ms var(--bc-ease-out, ease) forwards; }
@keyframes pl-burst { from { transform: translate(0, 0) scale(.5); opacity: 1; } to { transform: translate(var(--dx), var(--dy)) rotate(160deg) scale(1); opacity: 0; } }

/* the wide sheet */
.pl--wide .pl-title { display: none; }
.pl--wide .pl-sub { margin: 0; font-size: var(--bc-text-md, 14px); font-weight: var(--bc-weight-semibold, 600); color: var(--bc-text, #18181b); }
.pl--wide .pl-body { margin: 0; }
.pl--wide .pl-groups { columns: 2 300px; column-gap: 24px; }
.pl--wide .pl-board { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.pl--wide .pl-col { min-height: 260px; padding: 6px; background: var(--bc-surface-1, #fafafa); }
.pl--wide .pl-add, .pl--wide .pl-foot { margin-left: 0; margin-right: 0; }

@media (prefers-reduced-motion: reduce) {
  .pl, .pl *, .pl-burst { animation: none !important; }
}
`;

  // The details sheet gets its own shadow root, so it carries the bits it reuses.
  const DETAIL_CSS = `
.pld { display: grid; gap: 22px; }
.pld-meta { display: flex; flex-wrap: wrap; gap: 6px; }
.pld-field { display: grid; gap: 8px; }
.pld-label { display: flex; align-items: center; gap: 6px; font-size: var(--bc-text-xs, 12px); font-weight: var(--bc-weight-semibold, 600); color: var(--bc-muted, #6b6b74); }
.pld-count { margin-left: auto; font-weight: var(--bc-weight-medium, 500); font-variant-numeric: tabular-nums; }
.pld-subs { display: grid; gap: 2px; }
.pld-subs:empty { display: none; }
.pld-sub { display: flex; align-items: center; gap: 6px; min-height: 32px; padding: 0 2px 0 6px; border-radius: var(--bc-radius-sm, 6px);
  transition: background-color var(--bc-dur-1, 90ms) ease; animation: pld-in var(--bc-dur-2, 150ms) var(--bc-ease-out, ease); }
.pld-sub:hover { background: var(--bc-surface-hover, #f4f4f5); }
.pld-sub .bc-check { flex: 1; min-width: 0; }
.pld-sub .bc-check span { transition: color var(--bc-dur-2, 150ms) ease; }
.pld-sub.is-done .bc-check span { color: var(--bc-text-subtle, #a1a1aa); text-decoration: line-through; }
.pld-sub .bc-iconbtn { opacity: 0; transition: opacity var(--bc-dur-1, 90ms) ease; }
.pld-sub:hover .bc-iconbtn, .pld-sub:focus-within .bc-iconbtn { opacity: 1; }
.pld-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.pld-chips:empty { display: none; }
.pld .bc-seg { justify-self: start; }
.pl-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--pl-c, #a1a1aa); box-shadow: inset 0 0 0 1px rgba(128,128,128,.35); }
@keyframes pld-in { from { opacity: 0; transform: translateY(-2px); } }
`;

  const POM_CSS = `
:host { position: fixed; right: 16px; bottom: 16px; z-index: var(--bc-z-dock, 2147480000); }
.pom {
  display: flex; align-items: center; gap: 2px; height: 44px; padding: 0 6px 0 8px;
  border: 1px solid var(--bc-border, #e4e4e7); border-radius: var(--bc-radius-pill, 999px);
  background: var(--bc-surface-2, #fff); color: var(--bc-text, #18181b); box-shadow: var(--bc-shadow-3, 0 12px 32px rgba(0,0,0,.12));
  font-size: var(--bc-text-sm, 13px); animation: pom-in var(--bc-dur-4, 300ms) var(--bc-ease-out, ease);
}
@keyframes pom-in { from { opacity: 0; transform: translateY(12px) scale(.96); filter: blur(4px); } }
.pom__ring { display: block; flex: none; }
.pom__ring circle { fill: none; stroke-width: 3; }
.pom__track { stroke: var(--bc-surface-3, #f4f4f5); }
.pom__value { stroke: var(--bc-accent, #4f46e5); stroke-linecap: round; transition: stroke-dashoffset 1s linear; }
.pom.is-break .pom__value { stroke: var(--bc-success, #047857); }
.pom__time { margin: 0 2px 0 4px; padding: 6px; border: 0; border-radius: var(--bc-radius-md, 8px); background: transparent; color: inherit;
  font: var(--bc-weight-semibold, 600) var(--bc-text-md, 14px)/1 var(--bc-font-sans, system-ui, sans-serif); font-variant-numeric: tabular-nums; cursor: pointer; }
.pom__time:hover { background: var(--bc-surface-hover, #f4f4f5); }
.pom__text { display: flex; flex-direction: column; min-width: 0; margin-right: 4px; line-height: 1.2; }
.pom__phase { font-size: var(--bc-text-xs, 12px); font-weight: var(--bc-weight-medium, 500); color: var(--bc-muted, #6b6b74); }
.pom.is-break .pom__phase { color: var(--bc-success, #047857); }
.pom__task { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--bc-text-2xs, 11px); color: var(--bc-text-subtle, #a1a1aa); }
.pom__task:empty { display: none; }
.pom-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.pom-stats__v { font-size: var(--bc-text-xl, 20px); font-weight: var(--bc-weight-semibold, 600); font-variant-numeric: tabular-nums; line-height: 1.2; }
.pom-stats__l { font-size: var(--bc-text-2xs, 11px); color: var(--bc-muted, #6b6b74); }
.pom-stats__task { grid-column: 1 / -1; font-size: var(--bc-text-xs, 12px); color: var(--bc-muted, #6b6b74); }
@media (prefers-reduced-motion: reduce) { .pom { animation: none; } }
`;

  const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" pathLength="1"/></svg>';

  // ---- state ----------------------------------------------------------------

  const state = {
    windowStart: null,        // ISO when the user has paged away from the current window
    filterCourse: "all",
    items: [],
    range: null,              // { start, end, overdue } of the last fetch
    lastFetchKey: "",
    fetchKey: "",
    fetchPromise: null,
    fetchSeq: 0,
    fetchedAt: 0,
    failedKey: "",
    failedAt: 0,
    lastError: null,
    cards: new Map(),         // course id -> { name, code, color } from the dashboard cards
    cardsState: "idle",
    expanded: new Set(),      // groups opened past "collapse after"
    snoozedOpen: false,
    doneOpen: false,
    busy: 0,                  // check-off animations in flight
    dragging: false,
    lastPct: null,
    first: true,
    slide: 0,                 // -1 / 1 after paging, for the slide-in
    lastView: "",
    sheet: null,              // the expanded planner, when open
    canvasItems: [],          // what Canvas returned; recurring tasks are added per render
    pending: new Set(),       // items with a completion write in flight
    // key -> { complete, id, at }: completion changes made here. A planner fetch
    // that was already in flight returns the item as it was BEFORE the change, which
    // put a just-checked card straight back; recent changes win over such replies.
    localDone: new Map(),
    filterLoaded: false,
  };
  let mounted = null;

  // Per-task augmentation lives in bcLocal.todo, not settings: every one of these is
  // written on a micro-interaction, and content.js only re-applies features on a
  // bcSettings write — so these re-render just the planner.
  function tlocal() { return (BC.storage.local && BC.storage.local.todo) || {}; }
  function writeTodoLocal(mutator) {
    return BC.storage.updateLocal((d) => { mutator((d.todo = d.todo || {})); });
  }

  function pruneSnoozes(keys) {
    return writeTodoLocal((L) => {
      for (const key of keys) if (Date.parse(L.snoozed?.[key]) <= Date.now()) delete L.snoozed[key];
    });
  }

  // Must be stable across fetches: stars, snoozes, tags and schedule slots are all
  // keyed on it.
  function keyForItem(it) {
    if (it.bcVirtual) return "rec:" + it.bcRuleId + ":" + it.bcYmd;
    const id = (it.plannable && it.plannable.id) || it.plannable_id ||
      ((it.plannable && it.plannable.title) || "") + "@" + (it.plannable_date || "");
    return (it.plannable_type || "note") + ":" + id;
  }

  // "YYYY-MM-DD" from a date input is a LOCAL calendar day; new Date() would parse it
  // as UTC midnight, which west of UTC is the previous evening.
  function endOfLocalDay(ymd) {
    const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999);
    const d = new Date(ymd);
    return isNaN(d) ? null : d;
  }

  // RRULE-lite: expand settings.todo.recurring into virtual planner items inside
  // [start, end). rule: daily | weekly (days = weekday list) | monthly (day of month).
  function expandRecurring(settings, start, end) {
    const rules = settings.todo.recurring || [];
    if (!rules.length) return [];
    const doneMap = tlocal().recurringDone || {};
    const out = [];
    for (const r of rules) {
      if (!r || !r.id || !r.title) continue;
      const until = r.until ? endOfLocalDay(r.until) : null;
      const hm = BC.dt.parseHM(r.at) || { h: 23, m: 59 };
      const cursor = new Date(start);
      for (let i = 0; i < 62 && cursor < end; i++, cursor.setDate(cursor.getDate() + 1)) {
        if (until && cursor > until) break;
        const kind = r.rule || "daily";
        const ymd = BC.dt.ymd(cursor);
        if (r.from && ymd < r.from) continue;
        if (kind === "weekly" && Array.isArray(r.days) && r.days.length && !r.days.includes(cursor.getDay())) continue;
        // A rule on the 29th-31st falls on the last day of shorter months.
        const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
        if (kind === "monthly" && cursor.getDate() !== Math.min(parseInt(r.day, 10) || 1, lastDay)) continue;
        const due = new Date(cursor); due.setHours(hm.h, hm.m, 0, 0);
        out.push({
          bcVirtual: true, bcRuleId: r.id, bcYmd: ymd,
          bcDone: !!(doneMap[r.id] && doneMap[r.id][ymd]),
          plannable_type: "bc_recurring",
          plannable: { title: r.title },
          plannable_date: due.toISOString(),
          course_id: r.courseId || null,
          context_name: "",
          html_url: "",
        });
      }
    }
    return out;
  }

  // ---- item accessors -------------------------------------------------------

  const TYPE_ICON = {
    assignment: "file", quiz: "check-square", discussion_topic: "message", announcement: "bell",
    wiki_page: "book", calendar_event: "calendar", planner_note: "edit", bc_recurring: "refresh",
    assessment_request: "users",
  };
  const typeKey = (it) => (it.plannable_type === "bc_recurring" ? "planner_note" : it.plannable_type);
  // Lectures, office hours and announcements aren't work that comes due, so they
  // are never overdue.
  const notDue = (it) => it.plannable_type === "calendar_event" || it.plannable_type === "announcement";
  const itemTitle = (it) => (it.plannable && it.plannable.title) || it.plannable_title || "Untitled";
  // Canvas gives relative paths; anything else must at least be http(s).
  function itemUrl(it) {
    const u = String(it.html_url || (it.plannable && it.plannable.html_url) || "");
    return /^\/(?!\/)/.test(u) || /^https?:\/\//i.test(u) ? u : "";
  }
  function itemDate(it) {
    const iso = it.plannable_date || (it.plannable && (it.plannable.due_at || it.plannable.todo_date));
    const d = iso ? new Date(iso) : null;
    return d && !isNaN(d) ? d : null;
  }
  function itemPoints(it) {
    const p = it.plannable && Number(it.plannable.points_possible);
    return p > 0 ? p : null;
  }
  function courseIdOf(it) {
    if (it.course_id) return String(it.course_id);
    if (it.context_type === "Course" && it.context_id) return String(it.context_id);
    return null;
  }
  function courseInfo(it, settings) {
    const id = courseIdOf(it);
    const card = id ? state.cards.get(id) : null;
    const spec = (id && settings.dashboard && settings.dashboard.courses && settings.dashboard.courses[id]) || {};
    const name = it.context_name || (it.plannable && it.plannable.context_name) || (card && card.name) || (id ? "Course " + id : "");
    let label = spec.nickname && spec.nickname.trim() ? spec.nickname.trim() : "";
    // "SOCL2320.33716.202630" -> "SOCL2320": the first segment of the course code
    // is what students actually call a course.
    if (!label && card && card.code) label = card.code.split(".")[0].trim().slice(0, 16);
    if (!label) label = name || (it.bcVirtual ? "Repeats" : "Personal");
    const color = [spec.color, card && card.color].find((c) => c && BC.color.isHex(c)) || "";
    return { id, name: name || label, label, color };
  }
  function isComplete(it) {
    return it.bcVirtual ? !!it.bcDone : BC.api.plannerItemDone(it);
  }

  // "Today" / "Tomorrow" / "Wed" / "Oct 14".
  function shortDay(d) {
    const diff = Math.round((BC.dt.startOfDay(d) - BC.dt.startOfDay(new Date())) / BC.dt.DAY_MS);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff === -1) return "Yesterday";
    if (diff > 1 && diff < 7) return BC.dt.WEEKDAYS[d.getDay()].slice(0, 3);
    return BC.dt.MONTHS[d.getMonth()] + " " + d.getDate();
  }

  // "5 PM", "1:30 PM", "11:59 PM" — no ":00" eating the sidebar's width.
  function shortTime(d) {
    let h = d.getHours();
    const m = d.getMinutes();
    const ap = h >= 12 ? " PM" : " AM";
    h = h % 12 || 12;
    return h + (m ? ":" + String(m).padStart(2, "0") : "") + ap;
  }
  // Due label outside a day group. Canvas's "end of day" deadlines (11:59 PM) read
  // as just the day; anything else keeps its time.
  function dueLabel(d) {
    const endOfDay = d.getHours() === 23 && d.getMinutes() >= 59;
    return shortDay(d) + (endOfDay ? "" : " " + shortTime(d));
  }

  // ---- the window -----------------------------------------------------------

  // Day plan pages one day at a time from today; the other views page by their
  // window and honour "Starts on".
  const stepDays = (t) => (viewOf(t) === "timeblock" ? 1 : rangeDays(t));
  function defaultStart(t) {
    const today = BC.dt.startOfDay(new Date());
    if (viewOf(t) === "timeblock") return today;
    if (t.startOn !== "sunday" && t.startOn !== "monday") return today;
    // A window shorter than a week steps on from the week's start until it holds
    // today. Otherwise "Show 3 days" left today out from Thursday on.
    const week = BC.dt.startOfWeek(today, t.startOn === "monday"), n = rangeDays(t);
    return BC.dt.addDays(week, Math.floor(Math.round((today - week) / BC.dt.DAY_MS) / n) * n);
  }
  function windowStart(t) {
    return state.windowStart ? BC.dt.startOfDay(state.windowStart) : defaultStart(t);
  }
  // Day plan's tray looks three days ahead, so each day step fetches three days.
  const rangeDays = (t) => (viewOf(t) === "timeblock" ? 3 : parseInt(t.rangeDays, 10) || 7);
  const viewOf = (t) => (["list", "kanban", "timeblock"].includes(t.view) ? t.view : "list");

  async function fetchWindow(settings, force) {
    const t = settings.todo;
    const start = windowStart(t);
    const end = BC.dt.addDays(start, rangeDays(t));
    const today = BC.dt.startOfDay(new Date());
    // Overdue work only makes sense next to the window that contains today.
    const overdue = t.showOverdue !== false && start <= today && end > today;
    const from = overdue ? new Date(Math.min(start.getTime(), BC.dt.addDays(today, -14).getTime())) : start;
    const key = from.toISOString() + "/" + end.toISOString();
    // A TTL, not "fetched once": completing something in Canvas's own list should
    // show up here. The BC.api call underneath is cached and de-duplicated.
    const ttl = (BC.api.TTL && BC.api.TTL.planner) || 30000;
    if (state.lastFetchKey === key && Date.now() - state.fetchedAt < ttl) {
      // Returning to a cached window also retires a request for another window.
      if (state.fetchKey && state.fetchKey !== key) {
        state.fetchSeq++;
        state.fetchKey = "";
        state.fetchPromise = null;
      }
      return state.items;
    }
    if (state.fetchKey === key && state.fetchPromise) return state.fetchPromise;
    // apply() runs on every Canvas mutation, so a failing endpoint backs off rather
    // than being re-requested several times a second. Retry and paging pass force.
    if (!force && state.failedKey === key && Date.now() - state.failedAt < ttl) throw state.lastError;
    const seq = ++state.fetchSeq;
    state.fetchKey = key;
    const request = (async () => {
      try {
        const items = await BC.api.plannerItems(from.toISOString(), end.toISOString());
        if (seq !== state.fetchSeq) return state.items;
        state.canvasItems = overlayLocal(items || []);
        state.range = { start, end, overdue };
        mergeItems(BC.storage.current || settings);
        state.lastFetchKey = key;
        state.fetchedAt = Date.now();
        state.failedKey = "";
        return state.items;
      } catch (e) {
        if (seq !== state.fetchSeq) return state.items;
        state.lastFetchKey = "";
        state.failedKey = key; state.failedAt = Date.now(); state.lastError = e;
        throw e;
      } finally {
        if (seq === state.fetchSeq) {
          state.fetchKey = "";
          state.fetchPromise = null;
        }
      }
    })();
    state.fetchPromise = request;
    return request;
  }

  // Course colours and short codes come from the dashboard cards Canvas already
  // fetched for the page (cached), so the planner matches the cards.
  function loadCards() {
    if (state.cardsState !== "idle" || !BC.api) return;
    state.cardsState = "loading";
    BC.api.dashboardCards().then((cards) => {
      for (const c of cards || []) {
        state.cards.set(String(c.id), { name: c.shortName || c.originalName || "", code: c.courseCode || "", color: c.color || "" });
      }
      state.cardsState = "done";
      // Before the first planner fetch lands, a render would say "all caught up".
      if (state.range) rerender(false);
    }).catch(() => { state.cardsState = "failed"; });
  }

  // Changes made here in the last two minutes override what the server sent; after
  // that the server is the truth again (another device may have changed it).
  function overlayLocal(items) {
    const now = Date.now();
    for (const [k, v] of state.localDone) if (now - v.at > 120000) state.localDone.delete(k);
    if (!state.localDone.size) return items;
    for (const it of items) {
      const v = state.localDone.get(keyForItem(it));
      if (!v) continue;
      const o = it.planner_override || {};
      if (o.marked_complete !== v.complete || (v.id != null && o.id == null)) {
        it.planner_override = Object.assign({}, o, v.id != null ? { id: v.id } : null, { marked_complete: v.complete });
      }
    }
    return items;
  }

  // Recurring tasks are expanded on every render rather than at fetch time, so a
  // rule added or edited in Settings shows up at once instead of after the cache.
  function mergeItems(settings) {
    const r = state.range;
    const merged = state.canvasItems.concat(r ? expandRecurring(settings, r.start, r.end) : []);
    merged.sort((a, b) => (itemDate(a) || 0) - (itemDate(b) || 0));
    state.items = merged;
    return merged;
  }

  function courseOptions() {
    const seen = new Map();
    const s = BC.storage.current || {};
    for (const it of state.items) {
      const id = courseIdOf(it);
      if (id && !seen.has(id)) seen.set(id, courseInfo(it, s));
    }
    for (const [id, c] of state.cards) if (!seen.has(id)) seen.set(id, { id, name: c.name, label: c.name, color: BC.color.isHex(c.color) ? c.color : "" });
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  // ---- model ----------------------------------------------------------------

  function buildModel(settings) {
    const t = settings.todo;
    const r = state.range || { start: windowStart(t), end: BC.dt.addDays(windowStart(t), rangeDays(t)), overdue: false };
    mergeItems(settings);
    const L = tlocal();
    const snz = L.snoozed || {};
    const doneAt = L.doneAt || {};
    const now = Date.now();
    const types = t.types || {};
    const f = state.filterCourse;
    const m = { windowItems: [], overdue: [], recentDone: [], sleeping: [], expired: [], total: 0, done: 0, range: r };
    for (const it of state.items) {
      if (types[typeKey(it)] === false) continue;
      const cid = courseIdOf(it);
      if (f === "none" ? !!cid : (f !== "all" && cid !== f)) continue;
      const d = itemDate(it);
      if (!d) continue;
      const k = keyForItem(it);
      if (snz[k]) {
        if (new Date(snz[k]).getTime() > now) { m.sleeping.push(it); continue; }
        m.expired.push(k);
      }
      if (d >= r.start && d < r.end) m.windowItems.push(it);
      else if (r.overdue && d < r.start && !isComplete(it) && !notDue(it)) m.overdue.push(it);
      // Older work you checked off here recently stays reachable in Done, so an
      // accidental check on an overdue item can still be undone.
      else if (d < r.start && isComplete(it) && doneAt[k] && now - doneAt[k] < 7 * BC.dt.DAY_MS) m.recentDone.push(it);
    }
    // Day plan shows one day, so its ring, count and celebration cover that day,
    // not every day fetched for its tray.
    const counted = viewOf(t) === "timeblock" ? m.windowItems.filter((it) => itemDate(it) < BC.dt.addDays(r.start, 1)) : m.windowItems;
    m.total = counted.length;
    m.done = counted.filter(isComplete).length;
    return m;
  }

  function sortItems(items, t) {
    const stars = tlocal().stars || {};
    return items.slice().sort((a, b) => {
      if (t.starredFirst !== false) {
        const sa = stars[keyForItem(a)] ? 1 : 0, sb = stars[keyForItem(b)] ? 1 : 0;
        if (sa !== sb) return sb - sa;
      }
      return (itemDate(a) || 0) - (itemDate(b) || 0);
    });
  }

  const PRI_LABEL = { 1: "Urgent", 2: "High", 3: "Normal" };

  function groupItems(items, settings) {
    const t = settings.todo;
    const L = tlocal();
    const by = t.groupBy || "day";
    const map = new Map();
    for (const it of items) {
      let key, label, order;
      if (by === "day") {
        const d = BC.dt.startOfDay(itemDate(it));
        key = "d" + d.getTime(); label = BC.dt.fmtDay(d); order = d.getTime();
      } else if (by === "course") {
        const c = courseInfo(it, settings);
        key = "c" + (c.id || "-"); label = c.id ? c.name : (it.bcVirtual ? "Repeating tasks" : "Personal"); order = (c.id ? "0" : "1") + label.toLowerCase();
      } else if (by === "priority") {
        const p = (L.priorities || {})[keyForItem(it)] || 3;
        key = "p" + p; label = PRI_LABEL[p] || "P" + p; order = p;
      } else if (by === "tag") {
        const tg = ((L.tagsByItem || {})[keyForItem(it)] || [])[0];
        key = "t" + (tg || ""); label = tg ? "#" + tg : "Untagged"; order = tg ? "0" + tg.toLowerCase() : "1";
      } else {
        key = "all"; label = "Everything"; order = 0;
      }
      if (!map.has(key)) map.set(key, { key, label, order, items: [] });
      map.get(key).items.push(it);
    }
    const groups = [...map.values()].sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
    for (const g of groups) g.items = sortItems(g.items, t);
    return groups;
  }

  // ---- rendering ------------------------------------------------------------

  function rerender(force) {
    const s = BC.storage.current;
    if (!s) return;
    if (mounted && mounted.host.isConnected) render(s, mounted.body, { force });
    if (state.sheet) render(s, state.sheet.container, { wide: true, force });
  }

  function signature(settings, model, wide) {
    const t = settings.todo;
    const items = model.windowItems.concat(model.overdue, model.recentDone, model.sleeping).map((it) => keyForItem(it) + (isComplete(it) ? "+" : "-")).join(",");
    const courses = settings.dashboard && settings.dashboard.courses;
    // The minute keeps "due soon", overdue and the Day plan's now-line current on
    // a tab left open.
    return JSON.stringify([state.lastFetchKey, items, state.filterCourse, state.cards.size, [...state.expanded],
      t, courses, tlocal(), (BC.storage.local || {}).streak, wide ? 1 : 0, Math.floor(Date.now() / 60000)]);
  }

  function shouldSkip(container, sig) {
    if (container.dataset.bcSig === sig) return true;
    if (state.busy || state.dragging) return true;
    const root = container.getRootNode();
    const ae = root.activeElement;
    // Mid-typing in the composer, or with a menu open, a rebuild would eat it.
    if (ae && container.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return true;
    const form = container.querySelector(".pl-add__form:not([hidden])");
    if (form && form.querySelector("input").value) return true;
    return BC.ui.popoverOpen();
  }

  // Enough to find "the same control" after a rebuild: its row and its label.
  const FOCUSABLE = "button, input, select, a[href], [tabindex], summary";
  // A control inside the closed Done section, or anything hidden, can't take focus.
  const shown = (n) => !n.closest("[hidden]") && !(n.closest("details:not([open])") && !n.closest("summary"));
  function focusTarget(container, node) {
    const row = node.closest("[data-key]");
    const keys = [...container.querySelectorAll("[data-key]")].filter(shown).map((n) => n.dataset.key);
    // The control's place in its row survives a label change (Star becomes Unstar).
    const index = row ? [...row.querySelectorAll(FOCUSABLE)].indexOf(node) : -1;
    // A Done or Snoozed heading is found again by its section, since its text
    // carries a count that changes.
    const section = node.tagName === "SUMMARY" && node.parentElement ? node.parentElement.className : null;
    return { key: row && row.dataset.key, next: row ? keys.slice(keys.indexOf(row.dataset.key) + 1) : [], index, section,
      label: node.getAttribute("aria-label"), text: node.textContent, tag: node.tagName };
  }
  function restoreFocus(container, had) {
    const same = (n) => n.tagName === had.tag && (had.label ? n.getAttribute("aria-label") === had.label : n.textContent === had.text);
    const controls = (scope) => [...scope.querySelectorAll(FOCUSABLE)].filter(shown);
    const rowOf = (key) => key && [...container.querySelectorAll("[data-key]")].find((n) => n.dataset.key === key && shown(n));
    const row = rowOf(had.key);
    let target = null;
    if (had.section) target = [...container.querySelectorAll("details > summary")].find((s) => s.parentElement.className === had.section && shown(s)) || null;
    else if (row) {
      const list = controls(row), atIndex = [...row.querySelectorAll(FOCUSABLE)][had.index];
      target = (atIndex && atIndex.tagName === had.tag && shown(atIndex) ? atIndex : null) || list.find(same) || list[0] || null;
    } else if (!had.key) target = controls(container).find(same) || null;
    // The row left the view (checked off with completed hidden): go to the next one.
    if (!target && had.key) for (const key of had.next) { const r = rowOf(key); if (r) { target = controls(r)[0] || null; if (target) break; } }
    if (target) target.focus({ preventScroll: true });
  }

  function render(settings, container, opts) {
    const o = opts || {};
    const t = settings.todo;
    const model = buildModel(settings);
    const sig = signature(settings, model, o.wide);
    if (!o.force && shouldSkip(container, sig)) return;
    container.dataset.bcSig = sig;

    // Snoozes that have expired are dropped in one batched write, so the map can't
    // grow without bound.
    if (model.expired.length) pruneSnoozes(model.expired);

    const view = viewOf(t);
    const enter = state.first && !o.wide;
    const card = el("div", { class: "pl" + (o.wide ? " pl--wide" : "") + (enter ? " pl--enter" : "") + (t.compact ? " pl--compact" : "") });
    if (t.accent && BC.color.isHex(t.accent)) card.style.setProperty("--bc-todo-accent", t.accent);

    card.append(buildHead(settings, model, o));
    if (t.ring !== false && t.progressStyle === "bar") card.append(buildBar(model));
    card.append(buildTools(settings, Object.assign({ model }, o)));

    const motion = state.slide ? (state.slide > 0 ? " pl-body--next" : " pl-body--prev")
      : (state.lastView && state.lastView !== view ? " pl-body--fade" : "");
    const body = el("div", { class: "pl-body" + (o.wide ? "" : motion) });
    if (view === "kanban") renderBoard(body, model, settings, o);
    else if (view === "timeblock") renderDay(body, model, settings, o);
    else renderList(body, model, settings, o);
    card.append(body);

    const composer = buildComposer(settings);
    if (composer) card.append(composer);
    const foot = buildFoot(settings);
    if (foot) card.append(foot);

    // A rebuild replaces every node, which dropped keyboard focus to the page after
    // each check-off, star or filter change. Put it back on the same control.
    const ae = container.getRootNode().activeElement;
    const had = ae && container.contains(ae) ? focusTarget(container, ae) : null;
    container.replaceChildren(card);
    if (had) restoreFocus(container, had);
    syncPomButtons();
    if (!o.wide) { state.first = false; state.slide = 0; state.lastView = view; }
  }

  function buildHead(settings, model, o) {
    const t = settings.todo;
    const r = model.range;
    const lastDay = BC.dt.addDays(r.end, -1);
    const ring = t.ring !== false && t.progressStyle !== "bar";
    const day = viewOf(t) === "timeblock";
    const span = day ? "day" : rangeDays(t) === 7 ? "week" : rangeDays(t) + " days";
    const when = day ? BC.dt.fmtDay(r.start) : BC.dt.fmtRange(r.start, lastDay);
    const sub = when + (!ring && model.total ? " · " + model.done + " of " + model.total + " done" : "");
    return el("div", { class: "pl-head" }, [
      ring ? progressEl(t, model) : null,
      el("div", { class: "pl-titles" }, [
        el("h2", { class: "pl-title", text: "To Do" }),
        el("div", { class: "pl-sub", text: sub }),
      ]),
      el("div", { class: "pl-nav" }, [
        state.windowStart ? BC.ui.button("Today", { variant: "ghost", size: "sm", onClick: () => go(0) }) : null,
        BC.ui.iconButton("chevron-left", { label: "Previous " + span, size: "sm", onClick: () => go(-1) }),
        BC.ui.iconButton("chevron-right", { label: "Next " + span, size: "sm", onClick: () => go(1) }),
      ]),
    ]);
  }

  // Drawn at the previous value and moved to the new one a frame later, so the
  // ring animates instead of snapping.
  function progressEl(t, model) {
    if (!["rainbow", "heart", "cloud"].includes(t.progressStyle) || !BC.progressArt) return ringEl(model);
    const shape = BC.progressArt(t.progressStyle, model.done, model.total);
    shape.style.cssText = "width:50px;flex:none;text-align:center;font-size:10px;line-height:1";
    shape.querySelector("svg").style.cssText = "width:44px;height:44px;display:block;margin:auto";
    return shape;
  }

  function ringEl(model) {
    const { done, total } = model;
    const pct = total ? (done / total) * 100 : 0;
    const from = state.lastPct == null ? 0 : state.lastPct;
    const r = 16.25, c = 2 * Math.PI * r;
    const wrap = el("div", { class: "pl-ring" + (total && done === total ? " is-complete" : ""), role: "img",
      "aria-label": total ? done + " of " + total + " done" : "Nothing due" });
    wrap.innerHTML = '<svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">' +
      '<circle class="pl-ring__track" cx="18" cy="18" r="' + r + '" fill="none" stroke-width="3.5"/>' +
      '<circle class="pl-ring__value" cx="18" cy="18" r="' + r + '" fill="none" stroke-width="3.5" stroke-linecap="round" ' +
      'stroke-dasharray="' + c.toFixed(2) + '" transform="rotate(-90 18 18)"/></svg>';
    const label = total ? done + "/" + total : "–";
    wrap.append(el("span", { class: "pl-ring__label" + (label.length > 4 ? " pl-ring__label--long" : ""), text: label }));
    const v = wrap.querySelector(".pl-ring__value");
    v.style.strokeDashoffset = (c - (from / 100) * c).toFixed(2);
    requestAnimationFrame(() => requestAnimationFrame(() => { v.style.strokeDashoffset = (c - (pct / 100) * c).toFixed(2); }));
    state.lastPct = pct;
    return wrap;
  }

  function buildBar(model) {
    const pct = model.total ? (model.done / model.total) * 100 : 0;
    const bar = BC.ui.progress({ value: state.lastPct == null ? 0 : state.lastPct, label: model.done + " of " + model.total + " done" });
    requestAnimationFrame(() => requestAnimationFrame(() => bar.set(pct)));
    state.lastPct = pct;
    return el("div", { class: "pl-bar" }, [bar.root]);
  }

  function buildTools(settings, o) {
    const t = settings.todo;
    // The view is normally chosen in Settings; the switcher on the list is opt-in.
    // The full-size sheet always has it, since that is where Board and Day get room.
    const seg = o.wide || t.showViewSwitch ? BC.ui.segmented({ size: "sm", ariaLabel: "Planner view", value: viewOf(t),
      options: [{ value: "list", icon: "list", ariaLabel: "List" }, { value: "kanban", icon: "columns", ariaLabel: "Board" },
                { value: "timeblock", icon: "clock", ariaLabel: "Day plan" }],
      onChange: (v) => BC.storage.update((d) => { d.todo.view = v; }) }) : null;
    const filter = BC.ui.iconButton("filter", { label: "Filter by course", size: "sm", pressed: state.filterCourse !== "all" });
    if (state.filterCourse !== "all") filter.title = "Filtered: " + filterName(state.filterCourse);
    filter.setAttribute("aria-haspopup", "menu");
    filter.addEventListener("click", () => openFilterMenu(filter));
    const more = BC.ui.iconButton("sliders", { label: "Planner options", size: "sm" });
    more.setAttribute("aria-haspopup", "menu");
    more.addEventListener("click", () => openOptionsMenu(more));
    const expand = o.wide ? null : BC.ui.iconButton("maximize", { label: "Open the planner full size", size: "sm", onClick: openSheet });
    return el("div", { class: "pl-tools" }, [seg ? seg.root : summaryEl(o.model), filter, expand, more]);
  }

  // "2 overdue · 3 today" — the left of the toolbar when the view switcher is off.
  function summaryEl(model) {
    const today = BC.dt.startOfDay(new Date()).getTime();
    const tomorrow = today + BC.dt.DAY_MS;
    let late = model ? model.overdue.length : 0, todayN = 0;
    for (const it of model ? model.windowItems : []) {
      if (isComplete(it)) continue;
      const d = itemDate(it).getTime();
      if (d < Date.now() && d < today) { if (!notDue(it)) late++; }
      else if (d >= today && d < tomorrow) todayN++;
    }
    const kids = [];
    if (late) kids.push(el("span", { class: "pl-summary__late", text: late + " overdue" }));
    if (todayN) kids.push(el("span", { text: todayN + " today" }));
    if (!kids.length && model && model.total) kids.push(el("span", { text: "Nothing due today" }));
    return el("div", { class: "pl-summary" }, kids);
  }

  function filterName(id) {
    if (id === "none") return "Your tasks";
    const c = courseOptions().find((x) => x.id === id);
    return c ? c.name : "a course";
  }

  function setFilter(id) {
    state.filterCourse = id;
    // Remembered on this device, so the planner opens the way you left it.
    BC.storage.updateLocal((d) => { (d.ui = d.ui || {}).todoFilter = id; });
    rerender(true);
  }

  function openFilterMenu(anchor) {
    const f = state.filterCourse;
    const personal = state.items.some((it) => !courseIdOf(it));
    BC.ui.menu(anchor, [
      { heading: "Show" },
      { label: "All courses", checked: f === "all", onClick: () => setFilter("all") },
      ...courseOptions().map((c) => ({ label: c.name, dot: c.color || "#a1a1aa", checked: f === c.id, onClick: () => setFilter(c.id) })),
      personal ? { label: "Your tasks", icon: "edit", checked: f === "none", onClick: () => setFilter("none") } : null,
    ].filter(Boolean));
  }

  function openOptionsMenu(anchor) {
    const t = BC.storage.current.todo;
    const put = (fn) => () => BC.storage.update((d) => fn(d.todo));
    const radio = (key, value, label, cur) => ({ label, checked: cur === value, onClick: put((x) => { x[key] = value; }) });
    const g = t.groupBy || "day";
    const days = parseInt(t.rangeDays, 10) || 7;   // the setting, not Day plan's fetch window
    BC.ui.menu(anchor, [
      { heading: "Group by" },
      radio("groupBy", "day", "Day", g), radio("groupBy", "course", "Course", g), radio("groupBy", "priority", "Priority", g),
      radio("groupBy", "tag", "Tag", g), radio("groupBy", "none", "Nothing", g),
      { separator: true },
      { heading: "Show" },
      radio("rangeDays", 3, "3 days", days), radio("rangeDays", 7, "1 week", days),
      radio("rangeDays", 14, "2 weeks", days), radio("rangeDays", 30, "1 month", days),
      { separator: true },
      { label: "Completed items", kind: "checkbox", checked: !!t.showCompleted, onClick: put((x) => { x.showCompleted = !x.showCompleted; }) },
      { label: "Overdue work", kind: "checkbox", checked: t.showOverdue !== false, onClick: put((x) => { x.showOverdue = x.showOverdue === false; }) },
      { separator: true },
      { label: "More To Do settings", icon: "settings", onClick: () => BC.features.settingsPanel && BC.features.settingsPanel.open("todo") },
    ]);
  }

  function go(dir) {
    const s = BC.storage.current;
    const t = s.todo;
    if (dir === 0) state.windowStart = null;
    else {
      const next = BC.dt.addDays(windowStart(t), dir * stepDays(t));
      state.windowStart = next.getTime() === defaultStart(t).getTime() ? null : next.toISOString();
    }
    state.slide = dir || (state.slide || 0);
    state.lastFetchKey = "";
    loadAndRender(s, true);
  }

  // ---- list view ------------------------------------------------------------

  function renderList(body, model, settings, o) {
    const t = settings.todo;
    const visible = t.showCompleted ? model.windowItems : model.windowItems.filter((it) => !isComplete(it));
    const wrap = el("div", { class: "pl-groups" });
    let i = 0;
    if (model.overdue.length) wrap.append(groupEl({ key: "overdue", label: "Overdue", tone: "danger", items: sortItems(model.overdue, t) }, settings, o, () => i++));
    for (const g of groupItems(visible, settings)) wrap.append(groupEl(g, settings, o, () => i++));
    if (!visible.length && !model.overdue.length) body.append(emptyEl(model, settings));
    if (wrap.childElementCount) body.append(wrap);
    if (!visible.length && model.overdue.length) {
      const r = model.range;
      body.append(el("div", { class: "pl-day__hint pl-after-overdue", text: (model.total ? "Everything else is done" : "Nothing else due") + ", " +
        BC.dt.fmtRange(r.start, BC.dt.addDays(r.end, -1)) + "." }));
    }
    if (!t.showCompleted) {
      const done = model.windowItems.filter(isComplete).concat(model.recentDone);
      if (done.length) body.append(doneEl(sortItems(done, t), settings, o));
    } else if (model.recentDone.length) {
      body.append(doneEl(sortItems(model.recentDone, t), settings, o));
    }
    if (model.sleeping.length) body.append(snoozedEl(model.sleeping));
  }

  // Finished work when "Completed items" is off: collapsed, but one click away,
  // so something checked by accident is easy to find and uncheck.
  function doneEl(items, settings, o) {
    const det = el("details", { class: "pl-snoozed pl-done" });
    det.open = state.doneOpen;
    det.addEventListener("toggle", () => { state.doneOpen = det.open; });
    det.append(el("summary", null, [icon("chevron-right"), el("span", { text: "Done" }), el("span", { class: "pl-group__count", text: String(items.length) })]));
    const list = el("ul", { class: "pl-list" });
    items.forEach((it, i) => list.append(itemRow(it, settings, o, i, { timeOnly: false })));
    det.append(list);
    return det;
  }

  function groupEl(g, settings, o, nextIndex) {
    const n = settings.todo.collapseAfter | 0;
    const limit = n > 0 && !state.expanded.has(g.key) ? n : Infinity;
    const list = el("ul", { class: "pl-list" });
    const timeOnly = (settings.todo.groupBy || "day") === "day" && g.key !== "overdue";
    for (const it of g.items.slice(0, limit)) list.append(itemRow(it, settings, o, nextIndex(), { timeOnly }));
    const kids = [
      el("div", { class: "pl-group__head" }, [el("span", { class: "pl-group__title", text: g.label }), el("span", { class: "pl-group__count", text: String(g.items.length) })]),
      list,
    ];
    if (g.items.length > limit) {
      kids.push(el("button", { class: "pl-more", type: "button", text: "Show " + (g.items.length - limit) + " more",
        onclick: () => { state.expanded.add(g.key); rerender(true); } }));
    }
    return el("section", { class: "pl-group" + (g.tone ? " pl-group--" + g.tone : ""), "aria-label": g.label }, kids);
  }

  function emptyEl(model, settings) {
    const r = model.range;
    const when = viewOf(settings.todo) === "timeblock" ? BC.dt.fmtDay(r.start) : BC.dt.fmtRange(r.start, BC.dt.addDays(r.end, -1));
    const allDone = model.total > 0;
    // A filter that hides everything has to say so, or an empty list reads as "free".
    if (state.filterCourse !== "all" && !allDone) {
      return el("div", { class: "pl-empty" }, [
        el("div", { class: "pl-empty__icon" }, [icon("filter")]),
        el("div", { class: "pl-empty__title", text: "Nothing for " + filterName(state.filterCourse) }),
        el("div", { class: "pl-empty__hint", text: "Due " + when }),
        BC.ui.button("Show all courses", { size: "sm", onClick: () => setFilter("all") }),
      ]);
    }
    return el("div", { class: "pl-empty" }, [
      el("div", { class: "pl-empty__icon" }, [icon("check")]),
      el("div", { class: "pl-empty__title", text: allDone ? "Everything's done" : "You're all caught up" }),
      el("div", { class: "pl-empty__hint", text: allDone ? model.total + " of " + model.total + " finished, " + when : "Nothing due " + when }),
    ]);
  }

  function itemRow(it, settings, o, index, extra) {
    const t = settings.todo;
    const rd = t.rowDetails || {};
    const key = keyForItem(it);
    const done = isComplete(it);
    const L = tlocal();
    const title = itemTitle(it);
    const url = itemUrl(it);
    const due = itemDate(it);
    const course = courseInfo(it, settings);
    const starred = !!(L.stars || {})[key];
    const pri = (L.priorities || {})[key] || 3;
    const tags = (L.tagsByItem || {})[key] || [];
    const subs = (L.subtasks || {})[key] || [];

    const li = el("li", { class: "pl-item" + (done ? " is-done" : ""), "data-key": key });
    li.style.setProperty("--i", String(Math.min(index || 0, 14)));
    if (course.color) li.style.setProperty("--pl-c", course.color);

    const check = el("button", { class: "pl-check", type: "button", role: "checkbox",
      "aria-checked": done ? "true" : "false", "aria-label": title });
    check.innerHTML = CHECK_SVG;
    check.addEventListener("click", () => toggleDone(it, li, check));

    const titleEl = url
      ? el("a", { class: "pl-item__title", href: url, text: title })
      : el("span", { class: "pl-item__title", text: title });

    const meta = el("div", { class: "pl-item__meta" });
    const grp = (kids, cls) => meta.append(el("span", { class: "pl-meta__grp" + (cls ? " " + cls : "") }, kids));
    const lead = [];
    if (rd.icon !== false) lead.push(icon(TYPE_ICON[it.plannable_type] || "circle"));
    if (pri < 3) lead.push(el("span", { class: "pl-pri pl-pri--" + pri, text: "P" + pri, title: PRI_LABEL[pri] + " priority" }));
    if (rd.course !== false && course.label) {
      lead.push(el("span", { class: "pl-dot", "aria-hidden": "true" }), el("span", { class: "pl-course", text: course.label, title: course.name }));
    }
    if (lead.length) grp(lead, "pl-meta__course");
    if (rd.time !== false && due) {
      const past = due.getTime() < Date.now();
      const late = !done && past && !notDue(it);
      const soon = !done && !past && due.getTime() - Date.now() < 3 * 3600000;
      // Inside a day group the header already says the day.
      const label = t.dueFormat === "absolute" ? due.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " - " + shortTime(due) : extra && extra.timeOnly ? shortTime(due) : dueLabel(due);
      grp([el("span", { class: "pl-due" + (late ? " pl-due--late" : soon ? " pl-due--soon" : ""), text: label,
        title: BC.dt.fmtDay(due) + ", " + BC.dt.fmtTime(due) + (late ? " · past due" : "") })]);
    }
    const pts = itemPoints(it);
    if (rd.points !== false && pts) grp([el("span", { text: pts + " pts" })]);
    if (starred) grp([el("span", { class: "pl-starred", title: "Starred" }, [icon("star", { filled: true })])]);

    const main = el("div", { class: "pl-item__main" }, [titleEl, meta.childElementCount ? meta : null]);
    if (!t.compact && (tags.length || subs.length)) {
      const chips = el("div", { class: "pl-chips" });
      for (const tg of tags.slice(0, 3)) chips.append(el("span", { class: "pl-chip-sm" }, [icon("tag"), tg]));
      if (subs.length) chips.append(el("span", { class: "pl-chip-sm" }, [icon("check-square"), subs.filter((s) => s.done).length + "/" + subs.length]));
      main.append(chips);
    }

    const star = BC.ui.iconButton("star", { label: starred ? "Unstar " + title : "Star " + title, size: "sm", pressed: starred });
    if (starred) star.replaceChildren(icon("star", { filled: true }));
    star.addEventListener("click", () => {
      writeTodoLocal((Lx) => { const st = (Lx.stars = Lx.stars || {}); if (st[key]) delete st[key]; else st[key] = true; }).then(() => rerender(true));
    });
    const more = BC.ui.iconButton("more", { label: "More for " + title, size: "sm" });
    more.setAttribute("aria-haspopup", "menu");
    more.addEventListener("click", () => itemMenu(more, it, settings));
    li.append(check, main, el("div", { class: "pl-item__actions" }, [star, more]));

    if (extra && extra.draggable) {
      li.draggable = true;
      dragSource(li, key, () => li.classList.add("is-dragging"), () => li.classList.remove("is-dragging"));
    }
    return li;
  }
  function itemMenu(anchor, it, settings) {
    const key = keyForItem(it);
    const url = itemUrl(it);
    const view = viewOf(settings.todo);
    const status = (tlocal().status || {})[key];
    const items = [
      { label: "Details", icon: "sliders", onClick: () => openDetails(it) },
      { label: "Snooze until tomorrow", icon: "clock", onClick: () => snooze(key, 1) },
      { label: "Snooze for a week", icon: "calendar", onClick: () => snooze(key, 7) },
    ];
    if (view === "kanban" && !isComplete(it)) {
      items.push(status === "doing"
        ? { label: "Move back to To do", icon: "chevron-left", onClick: () => moveTo(it, "todo") }
        : { label: "Move to In progress", icon: "chevron-right", onClick: () => moveTo(it, "doing") });
    }
    if (settings.todo.pomodoro && settings.todo.pomodoro.enabled) {
      items.push({ label: "Focus on this", icon: "timer", onClick: () => startPomodoro(BC.storage.current, itemTitle(it)) });
    }
    if (url) items.push({ separator: true }, { label: "Open in Canvas", icon: "external", onClick: () => location.assign(url) });
    if (isOwnTask(it)) items.push({ separator: true }, { label: "Delete task", icon: "trash", danger: true, onClick: () => deleteTask(it) });
    BC.ui.menu(anchor, items);
  }

  // Wakes at 08:00 local rather than now + 24h: predictable, and snoozing late at
  // night doesn't push the item into the following evening.
  function snooze(key, days) {
    const wake = BC.dt.addDays(new Date(), days); wake.setHours(8, 0, 0, 0);
    writeTodoLocal((L) => { (L.snoozed = L.snoozed || {})[key] = wake.toISOString(); }).then(() => rerender(true));
    BC.toast.info("Snoozed until " + (days === 1 ? "tomorrow" : shortDay(wake)), { actions: [{ label: "Undo", onClick: () => {
      writeTodoLocal((L) => { delete (L.snoozed || {})[key]; }).then(() => rerender(true));
    } }] });
  }

  function snoozedEl(items) {
    const snz = tlocal().snoozed || {};
    const det = el("details", { class: "pl-snoozed" });
    det.open = state.snoozedOpen;
    det.addEventListener("toggle", () => { state.snoozedOpen = det.open; });
    det.append(el("summary", null, [icon("chevron-right"), el("span", { text: "Snoozed" }), el("span", { class: "pl-group__count", text: String(items.length) })]));
    for (const it of items) {
      const k = keyForItem(it);
      const wake = BC.ui.button("Wake", { variant: "ghost", size: "sm", onClick: () => {
        writeTodoLocal((L) => { delete (L.snoozed || {})[k]; }).then(() => rerender(true));
      } });
      det.append(el("div", { class: "pl-snoozed__row" }, [
        el("span", { class: "pl-snoozed__name", text: itemTitle(it) }),
        el("span", { class: "pl-snoozed__when", text: snz[k] ? shortDay(new Date(snz[k])) : "" }),
        wake,
      ]));
    }
    return det;
  }

  // ---- completing -----------------------------------------------------------

  // Resolves true when the change stuck. Virtual (recurring) items are tracked
  // locally; real ones go to Canvas.
  function setComplete(it, complete) {
    if (it.bcVirtual) {
      return writeTodoLocal((L) => {
        const rd = (L.recurringDone = L.recurringDone || {});
        const m = (rd[it.bcRuleId] = rd[it.bcRuleId] || {});
        if (complete) m[it.bcYmd] = true; else delete m[it.bcYmd];
      }).then(() => {
        it.bcDone = complete;
        return noteDone(keyForItem(it), complete).catch(() => {});
      }).then(() => true).catch(() => false);
    }
    const o = it.planner_override || {};
    return BC.api.setPlannerComplete(it.plannable_type, (it.plannable && it.plannable.id) || it.plannable_id, complete, o.id, o.dismissed)
      .then((saved) => {
        // Keep the id Canvas assigned, or the next toggle POSTs a second override
        // for the same item, which Canvas rejects.
        it.planner_override = Object.assign({}, it.planner_override,
          saved && saved.id != null ? { id: saved.id } : null, { marked_complete: complete });
        state.localDone.set(keyForItem(it), { complete, id: it.planner_override.id, at: Date.now() });
        // A refetch since this row was drawn left it holding an old copy of the
        // item. The next render reads the fresh one, so that gets the change too.
        overlayLocal(state.canvasItems);
        // Record only on success, so a failed write can't inflate the streak.
        return noteDone(keyForItem(it), complete).catch(() => {});
      })
      .then(() => true)
      .catch((e) => { BC.toast.error("Couldn't update: " + e.message); return false; });
  }

  // When something was checked off, so unchecking it today takes back the streak
  // credit it gave (an accidental check shouldn't keep a streak alive), and so
  // recently finished older work stays reachable in Done.
  function noteDone(key, complete) {
    const today = BC.dt.ymd(new Date());
    let creditedToday = false;
    return writeTodoLocal((L) => {
      const m = (L.doneAt = L.doneAt || {});
      if (complete) {
        m[key] = Date.now();
        const keys = Object.keys(m);
        if (keys.length > 150) keys.sort((a, b) => m[a] - m[b]).slice(0, keys.length - 150).forEach((k) => delete m[k]);
      } else {
        creditedToday = !!m[key] && BC.dt.ymd(new Date(m[key])) === today;
        delete m[key];
      }
    }).then(() => (complete ? recordStreakDay() : creditedToday ? unrecordStreakDay() : null));
  }

  // Shared by the checkbox, Undo and the details sheet. One write per item at a
  // time: a double click used to send two, and the second flipped it back.
  function commitDone(it, next) {
    const key = keyForItem(it);
    if (state.pending.has(key)) return Promise.resolve(false);
    state.pending.add(key);
    return setComplete(it, next).then((ok) => {
      state.pending.delete(key);
      if (!ok) return false;
      BC.ui.liveRegion("polite").announce((next ? "Done: " : "Not done: ") + itemTitle(it));
      if (next) {
        BC.toast.success(itemTitle(it), { title: "Marked done", timeout: 6000,
          actions: [{ label: "Undo", onClick: () => undoDone(key) }] });
      }
      return true;
    });
  }

  // Optimistic: the check animates at once; the row only leaves after Canvas has
  // accepted the change, and snaps back if it didn't.
  function toggleDone(it, li, check) {
    if (state.pending.has(keyForItem(it))) return;
    const next = !isComplete(it);
    check.setAttribute("aria-checked", next ? "true" : "false");
    li.classList.toggle("is-done", next);
    if (next && !BC.ui.motion.reduced()) {
      check.classList.remove("is-popping");
      void check.offsetWidth;
      check.classList.add("is-popping");
    }
    state.busy++;
    commitDone(it, next).then((ok) => {
      if (!ok) {
        state.busy--;
        check.setAttribute("aria-checked", next ? "false" : "true");
        li.classList.toggle("is-done", !next);
        return;
      }
      const s = BC.storage.current;
      const t = s.todo;
      const leaves = next && !t.showCompleted && viewOf(t) === "list";
      const finish = () => {
        state.busy--;
        rerender(true);
        const m = buildModel(s);
        if (next && t.celebrate !== false && m.total && m.done === m.total) celebrate();
      };
      if (leaves) collapse(li, finish); else finish();
    });
  }

  function undoDone(key) {
    const it = state.items.find((x) => keyForItem(x) === key);
    if (!it || !isComplete(it) || state.pending.has(key)) return;
    state.pending.add(key);
    setComplete(it, false).then((ok) => {
      state.pending.delete(key);
      if (ok) { BC.toast.info("Moved back to your list"); rerender(true); }
    });
  }

  // ---- your own tasks (Canvas planner notes) ----------------------------------

  const isOwnTask = (it) => !it.bcVirtual && it.plannable_type === "planner_note";
  const noteId = (it) => (it.plannable && it.plannable.id) || it.plannable_id;

  function deleteTask(it) {
    const keep = { title: itemTitle(it), todoDate: it.plannable_date, courseId: courseIdOf(it) || undefined,
      details: (it.plannable && it.plannable.details) || undefined };
    const from = keyForItem(it);
    BC.api.deletePlannerNote(noteId(it)).then(() => {
      state.canvasItems = state.canvasItems.filter((x) => keyForItem(x) !== from);
      state.lastFetchKey = "";
      state.fetchSeq++;
      state.fetchKey = "";
      state.fetchPromise = null;
      rerender(true);
      // Undo re-creates it: Canvas has no restore, so it comes back as a new task.
      // Its steps, note, tags and the rest move to the new task's key.
      BC.toast.info("Task deleted", { title: keep.title, timeout: 7000, actions: [{ label: "Undo", onClick: () => {
        BC.api.createPlannerNote(keep).then((saved) => {
          const to = saved && saved.id != null ? "planner_note:" + saved.id : null;
          return to && writeTodoLocal((L) => {
            for (const name of ["stars", "subtasks", "notes", "tagsByItem", "priorities", "estimates", "scheduled", "status", "snoozed"]) {
              const m = L[name];
              if (m && Object.hasOwn(m, from)) { m[to] = m[from]; delete m[from]; }
            }
          }).catch(() => {});
        }).then(() => { state.lastFetchKey = ""; loadAndRender(BC.storage.current, true); })
          .catch((e) => BC.toast.error("Couldn't restore it: " + e.message));
      } }] });
    }).catch((e) => BC.toast.error("Couldn't delete the task: " + e.message));
  }

  function updateTask(it, patch) {
    return BC.api.updatePlannerNote(noteId(it), patch).then((saved) => {
      if (patch.title != null) it.plannable = Object.assign({}, it.plannable, { title: patch.title });
      if (patch.todoDate) { it.plannable_date = patch.todoDate; it.plannable = Object.assign({}, it.plannable, { todo_date: patch.todoDate }); }
      state.lastFetchKey = "";
      return saved;
    }).catch((e) => { BC.toast.error("Couldn't save: " + e.message); throw e; });
  }

  function collapse(li, done) {
    if (BC.ui.motion.reduced()) { done(); return; }
    setTimeout(() => {
      li.style.height = li.offsetHeight + "px";
      void li.offsetHeight;
      li.classList.add("is-leaving");
      setTimeout(done, 240);
    }, 380);
  }

  function celebrate() {
    BC.ui.liveRegion("polite").announce("Everything's done");
    if (BC.ui.motion.reduced() || !mounted) return;
    const card = mounted.body.querySelector(".pl");
    const anchor = card && (card.querySelector(".pl-ring") || card.querySelector(".pl-head"));
    if (!anchor) return;
    const cr = card.getBoundingClientRect(), ar = anchor.getBoundingClientRect();
    const box = el("div", { class: "pl-burst", "aria-hidden": "true" });
    box.style.left = (ar.left - cr.left + 18) + "px";
    box.style.top = (ar.top - cr.top + ar.height / 2) + "px";
    const colors = ["var(--pl-accent)", "var(--bc-success)", "var(--bc-warn)", "var(--bc-info)", "#ec4899"];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, dist = 24 + (i % 3) * 9;
      const p = el("i");
      p.style.setProperty("--dx", (Math.cos(a) * dist).toFixed(1) + "px");
      p.style.setProperty("--dy", (Math.sin(a) * dist).toFixed(1) + "px");
      p.style.background = colors[i % colors.length];
      box.append(p);
    }
    card.append(box);
    setTimeout(() => box.remove(), 900);
  }

  // ---- drag and drop ----------------------------------------------------------
  // Canvas's dashboard runs a drag-and-drop library (react-dnd, for reordering its
  // course cards) with listeners on window. For any drag that isn't one of its own
  // cards, its dragover handler sets dropEffect = "none" — which tells the browser
  // the drop isn't allowed, so "drop" never fires. Our drags are handled here and
  // stopped before they reach window.
  function dropZone(node, onDrop) {
    node.addEventListener("dragenter", (e) => { e.preventDefault(); e.stopPropagation(); node.classList.add("is-drop"); });
    node.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      node.classList.add("is-drop");
    });
    node.addEventListener("dragleave", (e) => { if (!node.contains(e.relatedTarget)) node.classList.remove("is-drop"); });
    node.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      node.classList.remove("is-drop");
      state.dragging = false;
      const k = e.dataTransfer.getData("text/plain");
      const it = state.items.find((x) => keyForItem(x) === k);
      if (it) onDrop(it);
    });
  }
  // Marks the page while a task is in flight so toasts let the drop through. The
  // window listeners also catch a drag whose source row was re-rendered away, which
  // never gets its own dragend.
  function markDragging() {
    const html = document.documentElement;
    html.setAttribute("data-bc-dragging", "");
    const clear = () => {
      html.removeAttribute("data-bc-dragging");
      for (const t of ["drop", "dragend", "pointermove"]) window.removeEventListener(t, clear, true);
    };
    for (const t of ["drop", "dragend", "pointermove"]) window.addEventListener(t, clear, true);
  }
  function dragSource(node, key, onStart, onEnd) {
    node.addEventListener("dragstart", (e) => {
      e.stopPropagation();
      state.dragging = true;
      e.dataTransfer.setData("text/plain", key);
      e.dataTransfer.effectAllowed = "move";
      markDragging();
      if (onStart) onStart();
    });
    node.addEventListener("dragend", (e) => {
      e.stopPropagation();
      state.dragging = false;
      if (onEnd) onEnd();
    });
  }

  // ---- board view -----------------------------------------------------------

  function moveTo(it, col) {
    const key = keyForItem(it);
    return writeTodoLocal((L) => {
      const st = (L.status = L.status || {});
      if (col === "doing") st[key] = "doing"; else delete st[key];
    }).then(() => {
      const complete = isComplete(it);
      if (col === "done" && !complete) return commitDone(it, true);
      if (col !== "done" && complete) return commitDone(it, false);
      return true;
    }).then(() => rerender(true));
  }

  function renderBoard(body, model, settings, o) {
    const t = settings.todo;
    const status = tlocal().status || {};
    // The board always keeps completed work: its Done column is where it goes.
    const cols = { todo: [], doing: [], done: [] };
    // recentDone too: an overdue task dropped on Done is finished AND outside the
    // window, so it used to vanish from every column instead of landing in Done.
    for (const it of model.windowItems.concat(model.overdue, model.recentDone)) {
      if (isComplete(it)) cols.done.push(it);
      else if (status[keyForItem(it)] === "doing") cols.doing.push(it);
      else cols.todo.push(it);
    }
    const board = el("div", { class: "pl-board" });
    let i = 0;
    for (const [id, label, emptyText] of [["todo", "To do", "Nothing waiting"], ["doing", "In progress", "Drag a task here to start it"], ["done", "Done", "Finished work lands here"]]) {
      const list = el("ul", { class: "pl-list" });
      for (const it of sortItems(cols[id], t).slice(0, 40)) list.append(itemRow(it, settings, o, i++, { draggable: true }));
      if (!cols[id].length) list.append(el("li", { class: "pl-col__empty", text: emptyText }));
      const col = el("section", { class: "pl-col", "data-col": id, "aria-label": label }, [
        el("div", { class: "pl-col__head" }, [el("span", { class: "pl-col__dot" }), el("span", { text: label }), el("span", { class: "pl-group__count", text: String(cols[id].length) })]),
        list,
      ]);
      dropZone(col, (it) => moveTo(it, id));
      board.append(col);
    }
    body.append(board);
  }

  // ---- day view -------------------------------------------------------------

  const TB_START = 7, TB_END = 22;
  const hourLabel = (h) => (h % 12 === 0 ? 12 : h % 12) + (h < 12 ? " AM" : " PM");

  function renderDay(body, model, settings, o) {
    const row = o.wide ? 44 : 32;
    const today = BC.dt.startOfDay(new Date());
    // The window starts at the planned day (see defaultStart / stepDays).
    const day = BC.dt.startOfDay(model.range.start);
    const ymd = BC.dt.ymd(day);
    const L = tlocal();
    const sched = L.scheduled || {};
    const pool = model.windowItems.concat(model.overdue);
    const slotOf = (it) => { const s = sched[keyForItem(it)]; return s && s.ymd === ymd ? s : null; };
    // The tray is what's worth planning for THIS day: overdue work, things due in
    // the next three days, and only this day's copy of a repeating task — not every
    // item in the window.
    const horizon = BC.dt.addDays(day, 3).getTime();
    const relevant = pool.filter((it) => (it.bcVirtual ? it.bcYmd === ymd : itemDate(it).getTime() < horizon));
    const unscheduled = relevant.filter((it) => !isComplete(it) && !slotOf(it));

    const save = (it, h) => writeTodoLocal((Lx) => {
      const key = keyForItem(it);
      (Lx.scheduled = Lx.scheduled || {})[key] = { ymd, start: String(h).padStart(2, "0") + ":00", dur: Lx.estimates?.[key] || 60 };
    }).then(() => rerender(true));

    // The header already names the day.
    body.append(el("div", { class: "pl-day__hint", text: "Drag a task onto an hour, or click it to pick one." }));

    const tray = el("div", { class: "pl-tray" });
    for (const it of sortItems(unscheduled, settings.todo).slice(0, 12)) {
      const c = courseInfo(it, settings);
      const chip = el("button", { class: "pl-chip", type: "button", draggable: "true", title: itemTitle(it) }, [
        el("span", { class: "pl-dot", style: c.color ? "--pl-c:" + c.color : null }),
        el("span", { text: itemTitle(it) }),
      ]);
      dragSource(chip, keyForItem(it));
      chip.addEventListener("click", () => {
        const hours = [];
        for (let h = TB_START; h < TB_END; h++) hours.push({ label: hourLabel(h), onClick: () => save(it, h) });
        BC.ui.menu(chip, [{ heading: "Schedule at" }].concat(hours), { align: "start" });
      });
      tray.append(chip);
    }
    if (unscheduled.length > 12) tray.append(el("span", { class: "pl-tray__more", text: "+" + (unscheduled.length - 12) + " more" }));
    if (!unscheduled.length) tray.append(el("span", { class: "pl-day__hint", text: relevant.length ? "Everything is scheduled." : "Nothing to plan." }));
    body.append(tray);

    const grid = el("div", { class: "pl-grid" });
    for (let h = TB_START; h < TB_END; h++) {
      const hour = el("div", { class: "pl-hour", style: "height:" + row + "px", "data-h": String(h) }, [el("span", { class: "pl-hour__label", text: hourLabel(h).replace(" ", "") })]);
      dropZone(hour, (it) => save(it, h));
      grid.append(hour);
    }
    for (const it of pool) {
      const s = slotOf(it);
      const hm = s && BC.dt.parseHM(s.start);
      if (!hm) continue;
      const key = keyForItem(it);
      const top = ((hm.h * 60 + hm.m) - TB_START * 60) / 60 * row;
      const height = Math.max(((s.dur || 60) / 60) * row - 2, 18);
      const unsched = el("button", { type: "button", "aria-label": "Unschedule " + itemTitle(it), title: "Unschedule" }, [icon("x")]);
      unsched.addEventListener("click", () => writeTodoLocal((Lx) => { delete (Lx.scheduled || {})[key]; }).then(() => rerender(true)));
      const block = el("div", { class: "pl-block", draggable: "true", style: "top:" + top + "px;height:" + height + "px", title: itemTitle(it) + " · " + s.start },
        [el("span", { text: itemTitle(it) }), unsched]);
      dragSource(block, key);
      grid.append(block);
    }
    // Blocks cover their hour rows, so during a drag they let it through to the
    // hour underneath. The class waits a tick, because restyling the source
    // inside dragstart can cancel the drag.
    let dragging = false;
    body.addEventListener("dragstart", () => { dragging = true; setTimeout(() => grid.classList.toggle("is-dragging", dragging)); }, true);
    for (const type of ["dragend", "drop"]) body.addEventListener(type, () => { dragging = false; grid.classList.remove("is-dragging"); }, true);
    if (ymd === BC.dt.ymd(today)) {
      const now = new Date();
      const mins = now.getHours() * 60 + now.getMinutes();
      if (mins >= TB_START * 60 && mins < TB_END * 60) grid.append(el("div", { class: "pl-now", style: "top:" + ((mins - TB_START * 60) / 60 * row) + "px" }));
    }
    body.append(grid);
  }

  // ---- composer -------------------------------------------------------------

  function buildComposer(settings) {
    const t = settings.todo;
    if (!t.allowNewTask) return null;
    const openBtn = el("button", { class: "pl-add__open", type: "button" }, [el("span", { class: "pl-add__plus" }, [icon("plus")]), el("span", { text: "Add task" })]);
    const input = BC.ui.input({ size: "sm", placeholder: "What needs doing?", ariaLabel: "New task" });
    const daySel = BC.ui.select({ size: "sm", ariaLabel: "Due", value: t.newTaskDay === "tomorrow" ? "1" : "0",
      options: [{ value: "0", label: "Today" }, { value: "1", label: "Tomorrow" }, { value: "2", label: "In 2 days" },
                { value: "7", label: "In a week" }, { value: "pick", label: "Pick a date…" }] });
    const dateInp = BC.ui.input({ size: "sm", type: "date", ariaLabel: "Due date" });
    dateInp.hidden = true;
    daySel.addEventListener("change", () => { dateInp.hidden = daySel.value !== "pick"; if (!dateInp.hidden) dateInp.focus(); });
    const courseSel = BC.ui.select({ size: "sm", ariaLabel: "Course", value: "",
      options: [{ value: "", label: "No course" }].concat(courseOptions().map((c) => ({ value: c.id, label: c.label }))) });
    const cancel = BC.ui.button("Cancel", { variant: "ghost", size: "sm" });
    const addBtn = BC.ui.button("Add task", { variant: "primary", size: "sm", type: "submit" });
    const form = el("form", { class: "pl-add__form" }, [input, el("div", { class: "pl-add__row" }, [daySel, courseSel]), dateInp,
      el("div", { class: "pl-add__actions" }, [cancel, addBtn])]);
    form.hidden = true;
    const setOpen = (v) => { openBtn.hidden = v; form.hidden = !v; if (v) input.focus(); };
    openBtn.addEventListener("click", () => setOpen(true));
    cancel.addEventListener("click", () => { input.value = ""; setOpen(false); openBtn.focus(); });
    form.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.stopPropagation(); input.value = ""; setOpen(false); openBtn.focus(); }
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const title = input.value.trim();
      if (!title) { input.focus(); return; }
      let day;
      if (daySel.value === "pick") {
        day = endOfLocalDay(dateInp.value);
        if (!day) { dateInp.focus(); return; }
      } else {
        day = BC.dt.addDays(new Date(), parseInt(daySel.value, 10) || 0);
        day.setHours(23, 59, 0, 0);
      }
      addBtn.disabled = true;
      BC.api.createPlannerNote({ title, todoDate: day.toISOString(), courseId: courseSel.value || undefined })
        .then(() => {
          input.value = "";
          state.lastFetchKey = "";
          BC.toast.success("Task added");
          loadAndRender(BC.storage.current, true);
        })
        .catch((err) => { addBtn.disabled = false; BC.toast.error("Couldn't add task: " + err.message); });
    });
    return el("div", { class: "pl-add" }, [openBtn, form]);
  }

  // ---- footer: streak + focus -----------------------------------------------

  function buildFoot(settings) {
    const t = settings.todo;
    const kids = [];
    if (t.streaks && t.streaks.enabled) {
      const ss = streakState(settings);
      const b = el("button", { class: "pl-foot__btn pl-streak" + (ss.current > 0 ? " is-active" : ""), type: "button", "aria-haspopup": "dialog" },
        [icon("flame"), el("span", { text: ss.current ? ss.current + "-day streak" : "Start a streak" })]);
      b.addEventListener("click", () => openStreak(b));
      kids.push(b);
      // Persist a new personal best, but only when it actually increases.
      const best = ((BC.storage.local && BC.storage.local.streak && BC.storage.local.streak.best) | 0);
      if (ss.current > best) BC.storage.updateLocal((d) => { const streak = (d.streak = d.streak || {}); streak.best = Math.max(streak.best || 0, ss.current); });
    }
    if (t.pomodoro && t.pomodoro.enabled) {
      const f = el("button", { class: "pl-foot__btn pl-focus", type: "button", style: "margin-left:auto" }, [icon("timer"), el("span", { text: "Focus" })]);
      f.addEventListener("click", () => togglePomodoro(BC.storage.current));
      kids.push(f);
    }
    return kids.length ? el("div", { class: "pl-foot" }, kids) : null;
  }

  function openStreak(anchor) {
    const s = BC.storage.current;
    const ss = streakState(s);
    const stat = (v, l) => el("div", null, [el("div", { class: "pl-stat__v", text: String(v) }), el("div", { class: "pl-stat__l", text: l })]);
    const content = el("div", null, [
      el("div", { class: "pl-stats" }, [
        stat(ss.current, ss.current === 1 ? "day now" : "days now"), stat(ss.best, "best"),
        stat(ss.graceLeft, ss.graceLeft === 1 ? "grace day left" : "grace days left"), stat(ss.repairsLeft, "repairs this month"),
      ]),
    ]);
    if (ss.brokenGap && ss.repairsLeft > 0) {
      content.append(BC.ui.button("Repair " + shortDay(endOfLocalDay(ss.brokenGap)), { variant: "primary", size: "sm", block: true, icon: "refresh",
        onClick: () => { BC.ui.closePopovers(); repairStreak(ss.brokenGap).then(() => rerender(true)); } }));
    } else {
      content.append(el("div", { class: "pl-pop-note", text: ss.brokenGap ? "No repairs left this month." :
        ss.todayActive ? "Today already counts." : "Finish one task today to keep it going." }));
    }
    BC.ui.popover(anchor, content, { padded: true, width: 240, label: "Streak" });
  }

  // ---- streaks --------------------------------------------------------------
  // Activity is RECORDED: deriving it from the fetched window could never see past
  // a week.
  function unrecordStreakDay() {
    return BC.storage.updateLocal((d) => {
      const s = d.streak;
      const k = BC.dt.ymd(new Date());
      if (!s || !s.days || !s.days[k]) return;
      if (s.days[k] > 1) s.days[k]--; else delete s.days[k];
    });
  }

  function recordStreakDay() {
    return BC.storage.updateLocal((d) => {
      const s = (d.streak = d.streak || { days: {}, repairs: {}, repaired: {}, best: 0 });
      const k = BC.dt.ymd(new Date());
      s.days = s.days || {};
      s.days[k] = (s.days[k] || 0) + 1;
      const keys = Object.keys(s.days).sort();
      while (keys.length > 120) delete s.days[keys.shift()];
    });
  }

  // Grace is derived during the walk rather than persisted; only repairs (a genuine
  // consumable) and the best-ever streak are stored.
  function streakState(settings) {
    const st = (BC.storage.local && BC.storage.local.streak) || {};
    const days = st.days || {};
    const repaired = st.repaired || {};
    const cfg = (settings && settings.todo && settings.todo.streaks) || {};
    const graceAllowed = Math.max(0, cfg.graceDays | 0);
    const repairsAllowed = Math.max(0, cfg.repairsAvailable | 0);
    const month = BC.dt.ymd(new Date()).slice(0, 7);
    const repairsUsed = ((st.repairs || {})[month]) | 0;
    const todayKey = BC.dt.ymd(new Date());
    // Before the first recorded day there is no data, which is not the same as a
    // missed day — otherwise a fresh install "breaks" a streak it never had.
    const known = Object.keys(days).concat(Object.keys(repaired)).sort();
    const earliest = known.length ? known[0] : todayKey;

    let current = 0, graceUsed = 0, brokenGap = null;
    const cursor = new Date(); cursor.setHours(0, 0, 0, 0);
    for (let i = 0; i < 120; i++) {
      const k = BC.dt.ymd(cursor);
      if (days[k] > 0 || repaired[k]) current++;
      else if (k === todayKey) { /* today isn't a miss until midnight */ }
      else if (k < earliest) break;
      else if (graceUsed < graceAllowed) graceUsed++;
      else { brokenGap = k; break; }
      cursor.setDate(cursor.getDate() - 1);
    }
    return {
      current,
      best: Math.max(st.best | 0, current),
      graceLeft: Math.max(0, graceAllowed - graceUsed),
      repairsLeft: Math.max(0, repairsAllowed - repairsUsed),
      brokenGap,
      todayActive: days[todayKey] > 0 || !!repaired[todayKey],
    };
  }

  function repairStreak(ymd) {
    const month = BC.dt.ymd(new Date()).slice(0, 7);
    return BC.storage.updateLocal((d) => {
      const s = (d.streak = d.streak || { days: {}, repairs: {}, repaired: {}, best: 0 });
      (s.repaired = s.repaired || {})[ymd] = true;
      s.repairs = s.repairs || {};
      s.repairs[month] = (s.repairs[month] | 0) + 1;
    });
  }

  // Exported so the streak-at-risk notification reuses the same computation.
  BC.todo = Object.assign(BC.todo || {}, { streakState });

  // ---- details sheet --------------------------------------------------------

  function openDetails(it) {
    const s = BC.storage.current;
    const key = keyForItem(it);
    const L = tlocal();
    const course = courseInfo(it, s);
    const due = itemDate(it);
    const url = itemUrl(it);
    const pts = itemPoints(it);
    let subs = ((L.subtasks || {})[key] || []).map((x) => ({ ...x }));
    let tags = ((L.tagsByItem || {})[key] || []).slice();
    const save = (fn) => writeTodoLocal(fn);

    const courseChip = course.label ? BC.ui.chip(course.label) : null;
    if (courseChip) {
      courseChip.prepend(el("span", { class: "pl-dot", style: course.color ? "--pl-c:" + course.color : null }));
      courseChip.title = course.name;
    }
    const meta = el("div", { class: "pld-meta" }, [
      courseChip,
      due ? BC.ui.chip(shortDay(due) + " · " + BC.dt.fmtTime(due)) : null,
      pts ? BC.ui.chip(pts + " pts") : null,
      isComplete(it) ? BC.ui.badge("Done", { tone: "success" }) : null,
    ]);

    const pri = BC.ui.segmented({ ariaLabel: "Priority", size: "sm", value: String((L.priorities || {})[key] || 3),
      options: [{ value: "1", label: "Urgent" }, { value: "2", label: "High" }, { value: "3", label: "Normal" }],
      onChange: (v) => save((x) => { const m = (x.priorities = x.priorities || {}); if (v === "3") delete m[key]; else m[key] = parseInt(v, 10); }) });

    const subList = el("div", { class: "pld-subs" });
    const subCount = el("span", { class: "pld-count" });
    const saveSubs = (operation, onSaved) => save((x) => {
      const m = (x.subtasks = x.subtasks || {});
      const steps = operation(m[key] || []);
      if (steps.length) m[key] = steps; else delete m[key];
    }).then(() => { subs = (tlocal().subtasks || {})[key] || []; drawSubs(); if (onSaved) onSaved(); }).catch(() => {});
    function drawSubs() {
      subList.replaceChildren(...subs.map((sub) => {
        const cb = BC.ui.checkbox({ checked: sub.done, label: sub.text, onChange: (v) => saveSubs((steps) => steps.map((step) => step.id === sub.id ? { ...step, done: v } : step)) });
        const rename = BC.ui.iconButton("edit", { label: "Rename " + sub.text, size: "sm", onClick: () => {
          const text = prompt("Step name", sub.text)?.trim();
          if (text) saveSubs((steps) => steps.map((step) => step.id === sub.id ? { ...step, text } : step));
        } });
        const del = BC.ui.iconButton("x", { label: "Remove " + sub.text, size: "sm", onClick: () => saveSubs((steps) => steps.filter((step) => step.id !== sub.id)) });
        return el("div", { class: "pld-sub" + (sub.done ? " is-done" : "") }, [cb, rename, del]);
      }));
      subCount.textContent = subs.length ? subs.filter((x) => x.done).length + " of " + subs.length : "";
    }
    drawSubs();
    const subInput = BC.ui.input({ size: "sm", placeholder: "Add a step and press Enter", ariaLabel: "Add a step" });
    subInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const text = subInput.value.trim();
      if (!text) return;
      const step = { id: BC.util.uuid(), text, done: false };
      const entered = subInput.value;
      saveSubs((steps) => steps.concat([step]), () => { if (subInput.value === entered) subInput.value = ""; });
    });

    const tagWrap = el("div", { class: "pld-chips" });
    const saveTags = (operation, onSaved) => save((x) => {
      const m = (x.tagsByItem = x.tagsByItem || {});
      const next = operation(m[key] || []);
      if (next.length) m[key] = next; else delete m[key];
    }).then(() => { tags = (tlocal().tagsByItem || {})[key] || []; drawTags(); if (onSaved) onSaved(); }).catch(() => {});
    function drawTags() {
      tagWrap.replaceChildren(...tags.map((tg) => BC.ui.chip(tg, { onRemove: () => saveTags((fresh) => fresh.filter((tag) => tag !== tg)) })));
    }
    drawTags();
    const listId = "pld-tags-" + Math.random().toString(36).slice(2, 7);
    const tagInput = BC.ui.input({ size: "sm", placeholder: "Add a tag and press Enter", ariaLabel: "Add a tag" });
    tagInput.setAttribute("list", listId);
    const datalist = el("datalist", { id: listId }, ((s.todo && s.todo.tags) || []).map((tg) => el("option", { value: tg })));
    tagInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== ",") return;
      e.preventDefault();
      const v = tagInput.value.replace(/,/g, "").trim();
      const entered = tagInput.value;
      if (v) saveTags((fresh) => fresh.includes(v) ? fresh : fresh.concat([v]), () => { if (tagInput.value === entered) tagInput.value = ""; });
    });

    const est = BC.ui.segmented({ ariaLabel: "Time estimate", size: "sm", value: String((L.estimates || {})[key] || ""),
      options: [{ value: "", label: "None" }, { value: "15", label: "15m" }, { value: "30", label: "30m" }, { value: "60", label: "1h" },
                { value: "90", label: "1.5h" }, { value: "120", label: "2h" }],
      onChange: (v) => save((x) => { const m = (x.estimates = x.estimates || {}); const n = parseInt(v, 10); if (n > 0) m[key] = n; else delete m[key]; }) });

    const note = el("textarea", { class: "bc-textarea", rows: "3", placeholder: "Only you can see this", "aria-label": "Note" });
    note.value = (L.notes || {})[key] || "";
    // Saved as you type: "change" only fires on blur, and closing the sheet with Esc
    // mid-sentence lost the note.
    let noteSent = note.value;
    const saveNote = () => {
      if (note.value === noteSent) return;
      const value = note.value;
      noteSent = value;
      save((x) => { const m = (x.notes = x.notes || {}); if (value.trim()) m[key] = value; else delete m[key]; })
        .catch(() => { if (noteSent === value) noteSent = null; });
    };
    note.addEventListener("input", BC.util.debounce(saveNote, 400));
    note.addEventListener("change", saveNote);

    // Your own tasks can be renamed and moved; Canvas's items belong to Canvas.
    const own = isOwnTask(it);
    let titleField = null, dateField = null;
    if (own) {
      titleField = BC.ui.input({ size: "sm", ariaLabel: "Task name", value: itemTitle(it) });
      titleField.addEventListener("change", () => {
        const v = titleField.value.trim();
        if (v && v !== itemTitle(it)) updateTask(it, { title: v }).catch(() => { titleField.value = itemTitle(it); });
      });
      dateField = BC.ui.input({ size: "sm", type: "date", ariaLabel: "Due date", value: due ? BC.dt.ymd(due) : "" });
      dateField.addEventListener("change", () => {
        const d = endOfLocalDay(dateField.value);
        if (d) updateTask(it, { todoDate: d.toISOString() }).catch(() => {});
      });
    }

    const field = (label, kids, extra) => el("div", { class: "pld-field" }, [el("div", { class: "pld-label" }, [el("span", { text: label }), extra || null]), ...kids]);
    const content = el("div", { class: "pld" }, [
      meta,
      own ? field("Task", [titleField]) : null,
      own ? field("Due", [dateField]) : null,
      field("Priority", [pri.root]),
      field("Steps", [subList, subInput], subCount),
      field("Tags", [tagWrap, tagInput, datalist]),
      field("Time estimate", [est.root]),
      field("Note", [note]),
    ]);
    const actions = [];
    let sheet = null;
    if (own) actions.push(BC.ui.button("Delete", { variant: "danger", icon: "trash", onClick: () => { sheet.close(); deleteTask(it); } }));
    const doneBtn = BC.ui.button(isComplete(it) ? "Mark not done" : "Mark done", { icon: isComplete(it) ? "undo" : "check" });
    doneBtn.addEventListener("click", () => {
      const next = !isComplete(it);
      doneBtn.disabled = true;
      commitDone(it, next).then(() => {
        doneBtn.disabled = false;
        const now = isComplete(it);
        doneBtn.replaceChildren(icon(now ? "undo" : "check"), el("span", { text: now ? "Mark not done" : "Mark done" }));
      });
    });
    actions.push(doneBtn);
    if (url) actions.push(BC.ui.button("Open in Canvas", { icon: "external", onClick: () => location.assign(url) }));
    if (s.todo.pomodoro && s.todo.pomodoro.enabled) {
      actions.push(BC.ui.button("Start focus", { variant: "primary", icon: "timer", onClick: () => { startPomodoro(BC.storage.current, itemTitle(it)); sheet.close(); } }));
    }
    sheet = BC.ui.sheet({ title: itemTitle(it), body: [el("style", null, DETAIL_CSS), content], actions, width: 460, nodeId: "bc-todo-details",
      onClose: () => { saveNote(); rerender(true); } });
    sheet.open();
  }

  // ---- full-size sheet ------------------------------------------------------

  function openSheet() {
    if (state.sheet) return;
    const container = el("div");
    const sheet = BC.ui.sheet({ title: "To Do", body: [el("style", null, WIDGET_CSS), container], width: 980, nodeId: "bc-todo-sheet",
      onClose: () => { state.sheet = null; rerender(true); } });
    state.sheet = { container, sheet };
    sheet.open();
    render(BC.storage.current, container, { wide: true, force: true });
  }

  // ---- mounting -------------------------------------------------------------

  function ensureMount() {
    const target = document.querySelector(".Sidebar__TodoListContainer, .ToDoSidebar") ||
      document.querySelector("#right-side .events_list");
    if (!target || !target.parentNode) return null;
    const m = BC.ui.mount("bc-todo-widget", { css: HOST_CSS + WIDGET_CSS, className: "bc-todo-host",
      place: (host) => target.parentNode.insertBefore(host, target) });
    if (m.fresh) { state.first = true; state.lastPct = null; }
    mounted = m;
    return m;
  }

  function loadAndRender(settings, force) {
    if (!mounted || !mounted.host.isConnected) return;
    if (!state.filterLoaded) {
      state.filterLoaded = true;
      const saved = ((BC.storage.local || {}).ui || {}).todoFilter;
      if (saved) state.filterCourse = saved;
    }
    const body = mounted.body;
    if (!body.childElementCount) {
      body.replaceChildren(el("div", { class: "pl" }, [el("div", { class: "pl-head" }, [el("div", { class: "pl-titles" }, [el("h2", { class: "pl-title", text: "To Do" })])]),
        el("div", { style: "margin-top:12px" }, [BC.ui.skeleton(4)])]));
    }
    loadCards();
    fetchWindow(settings, force).then(() => rerender(force)).catch((e) => {
      BC.util.warn("planner", e);
      if (state.items.length) { rerender(force); return; }
      body.dataset.bcSig = "";
      body.replaceChildren(el("div", { class: "pl" }, [
        el("div", { class: "pl-head" }, [el("div", { class: "pl-titles" }, [el("h2", { class: "pl-title", text: "To Do" })])]),
        el("div", { style: "margin-top:12px" }, [BC.ui.errorState("Couldn't load your planner.", () => loadAndRender(BC.storage.current, true))]),
      ]));
    });
  }

  // ---- focus timer (Pomodoro) -----------------------------------------------
  // Timestamp-based state machine persisted in bcLocal.pomodoro, so a running
  // session survives reloads and navigation. Phases: work -> short / long break.
  const PHASE_LABEL = { work: "Focus", short: "Short break", long: "Long break" };

  function pomBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.frequency.value = 880; g.gain.value = 0.08;
      osc.onended = () => ctx.close();   // browsers cap open audio contexts
      osc.start(); osc.stop(ctx.currentTime + 0.3);
    } catch (_) {}
  }

  function phaseMinutes(cfg, phase) {
    if (phase === "short") return cfg.shortBreakMin || 5;
    if (phase === "long") return cfg.longBreakMin || 15;
    return cfg.workMin || 25;
  }

  function pomState() { return (BC.storage.local || {}).pomodoro || null; }
  function pomRunning() { const p = pomState(); return !!(p && p.phase); }
  const fmtLeft = (ms) => { const sec = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); };

  // Every planner "Focus" button, in both shadow roots, follows the timer.
  function syncPomButtons() {
    const p = pomState();
    const running = !!(p && p.phase);
    const text = running ? fmtLeft(p.endsAt - Date.now()) : "Focus";
    for (const id of ["bc-todo-widget", "bc-todo-sheet"]) {
      const host = document.querySelector('[data-bc-node="' + id + '"]');
      if (!host || !host.shadowRoot) continue;
      for (const b of host.shadowRoot.querySelectorAll(".pl-focus")) {
        const want = running ? "on" : "off";
        if (b.dataset.state !== want) {
          b.dataset.state = want;
          b.classList.toggle("is-running", running);
          b.setAttribute("aria-label", running ? "Stop the focus session" : "Start a focus session");
          b.replaceChildren(icon(running ? "pause" : "timer"), el("span", { text }));
        }
        const span = b.querySelector("span");
        if (span && span.textContent !== text) span.textContent = text;
      }
    }
  }

  function togglePomodoro(settings) {
    if (pomRunning()) stopPomodoro();
    else startPomodoro(settings);
  }

  // Always (re)starts a work phase: "Focus on this" must not stop a running timer.
  function startPomodoro(settings, taskTitle) {
    const cfg = settings.todo.pomodoro || {};
    const min = phaseMinutes(cfg, "work");
    BC.storage.updateLocal((d) => {
      const prev = d.pomodoro || {};
      d.pomodoro = {
        // A stopped timer starts a new set, so its long break isn't early.
        phase: "work", cycle: prev.phase ? prev.cycle || 0 : 0,
        startedAt: Date.now(), endsAt: Date.now() + min * 60000,
        taskTitle: taskTitle || "", sessions: prev.sessions || [],
      };
    }).then(() => { BC.toast.success("Focus session started · " + min + " min"); ensurePomodoroDock(BC.storage.current); syncPomButtons(); });
  }

  function stopPomodoro() {
    stopPomTick();
    BC.storage.updateLocal((d) => {
      if (d.pomodoro) { d.pomodoro.phase = null; d.pomodoro.taskTitle = ""; }
    }).then(() => { BC.injector.removeNode("bc-pom-dock"); syncPomButtons(); BC.toast.info("Focus session stopped"); });
  }

  // `endsAt` is the phase end the caller saw. Every open Canvas tab ticks, so a
  // second tab, or a slow write, would otherwise advance again and skip the break.
  function advancePomodoro(settings, endsAt) {
    const cfg = (settings.todo && settings.todo.pomodoro) || {};
    let advanced = false;
    BC.storage.updateLocal((d) => {
      advanced = false;
      const p = d.pomodoro;
      if (!p || !p.phase || p.endsAt !== endsAt) return;
      advanced = true;
      if (p.phase === "work") {
        p.cycle = (p.cycle || 0) + 1;
        // Skip ends a session early. Log the minutes actually focused.
        const min = Math.min(phaseMinutes(cfg, "work"), Math.round((Date.now() - p.startedAt) / 60000));
        (p.sessions = p.sessions || []).push({ start: p.startedAt, end: Date.now(), min, task: p.taskTitle || "" });
        if (p.sessions.length > 200) p.sessions = p.sessions.slice(-200);
        p.phase = p.cycle % (cfg.longEvery || 4) === 0 ? "long" : "short";
      } else {
        p.phase = "work";
      }
      p.startedAt = Date.now();
      p.endsAt = Date.now() + phaseMinutes(cfg, p.phase) * 60000;
    }).then(() => {
      const p = pomState();
      if (!advanced || !p || !p.phase) return;
      if (cfg.sound !== false) pomBeep();
      BC.toast.success(p.phase === "work" ? "Break's over — back to it" : "Session done. " + PHASE_LABEL[p.phase] + " time.");
    });
  }

  let pomTimer = null;
  function stopPomTick() {
    if (pomTimer) { clearInterval(pomTimer); pomTimer = null; }
  }

  const POM_R = 11, POM_C = 2 * Math.PI * POM_R;

  function buildDock(body) {
    const ring = el("span", { class: "pom__ring", "aria-hidden": "true" });
    ring.innerHTML = '<svg width="28" height="28" viewBox="0 0 28 28"><circle class="pom__track" cx="14" cy="14" r="' + POM_R + '"/>' +
      '<circle class="pom__value" cx="14" cy="14" r="' + POM_R + '" stroke-dasharray="' + POM_C.toFixed(2) + '" transform="rotate(-90 14 14)"/></svg>';
    const time = el("button", { class: "pom__time", type: "button", "data-pom-time": "", "aria-label": "Focus session details", text: "--:--" });
    time.addEventListener("click", () => {
      const p = pomState() || {};
      const today = BC.dt.ymd(new Date());
      const sessions = (p.sessions || []).filter((x) => BC.dt.ymd(new Date(x.start)) === today);
      const mins = sessions.reduce((n, x) => n + (x.min || 0), 0);
      const stat = (v, l) => el("div", null, [el("div", { class: "pom-stats__v", text: String(v) }), el("div", { class: "pom-stats__l", text: l })]);
      BC.ui.popover(time, el("div", { class: "pom-stats" }, [
        stat(sessions.length, sessions.length === 1 ? "session today" : "sessions today"), stat(mins, "minutes focused"),
        p.taskTitle ? el("div", { class: "pom-stats__task", text: "On: " + p.taskTitle }) : null,
      ]), { padded: true, width: 220, label: "Focus stats" });
    });
    const phase = el("span", { class: "pom__phase", "data-pom-phase": "" });
    const task = el("span", { class: "pom__task", "data-pom-task": "" });
    const skip = BC.ui.iconButton("skip", { label: "Skip to the next phase", size: "sm", onClick: () => advancePomodoro(BC.storage.current, (pomState() || {}).endsAt) });
    const stop = BC.ui.iconButton("x", { label: "Stop the focus session", size: "sm", onClick: stopPomodoro });
    body.replaceChildren(el("div", { class: "pom", role: "group", "aria-label": "Focus timer" }, [ring, time, el("span", { class: "pom__text" }, [phase, task]), skip, stop]));
  }

  function tickDock() {
    const p = pomState();
    const host = document.querySelector('[data-bc-node="bc-pom-dock"]');
    if (!p || !p.phase) { BC.injector.removeNode("bc-pom-dock"); stopPomTick(); syncPomButtons(); return; }
    const remaining = p.endsAt - Date.now();
    if (remaining <= 0) { advancePomodoro(BC.storage.current, p.endsAt); return; }
    syncPomButtons();
    const root = host && host.shadowRoot;
    if (!root) return;
    const set = (sel, v) => { const n = root.querySelector(sel); if (n && n.textContent !== v) n.textContent = v; };
    set("[data-pom-time]", fmtLeft(remaining));
    set("[data-pom-phase]", PHASE_LABEL[p.phase] || "");
    set("[data-pom-task]", p.taskTitle || "");
    const box = root.querySelector(".pom");
    if (box) box.classList.toggle("is-break", p.phase !== "work");
    const v = root.querySelector(".pom__value");
    const total = Math.max(1, p.endsAt - p.startedAt);
    if (v) v.style.strokeDashoffset = (POM_C * (remaining / total)).toFixed(2);
  }

  function ensurePomodoroDock(settings) {
    const p = pomState();
    if (!p || !p.phase || !settings || !settings.todo.pomodoro || settings.todo.pomodoro.enabled === false) {
      BC.injector.removeNode("bc-pom-dock");
      stopPomTick();
      return;
    }
    const m = BC.ui.mount("bc-pom-dock", { css: POM_CSS });
    if (m.fresh) { buildDock(m.body); tickDock(); }
    // Held by handle so stopping the timer really stops the 1s tick.
    if (!pomTimer) pomTimer = BC.lifecycle.bag("todo").interval(tickDock, 1000);
  }

  // ---- apply ----------------------------------------------------------------

  function apply(settings, ctx) {
    // The focus timer follows the user across every Canvas page.
    ensurePomodoroDock(settings);
    const t = settings.todo || {};
    const onDash = ctx.page === "dashboard";
    // Dashboard → Right sidebar → To Do switched off hides the planner as well.
    const d = settings.dashboard || {};
    const hidden = d.enabled && d.widgets && d.widgets.todo === false;
    // The planner lives on the dashboard; course pages show Canvas's own list, which
    // gets the clean restyle in Planner mode too rather than being left raw.
    BC.injector.setStyle("bc-todo-clean", t.mode === "clean" || (t.mode === "custom" && !onDash) ? CLEAN_CSS : "");
    BC.injector.setStyle("bc-todo-hide", onDash && t.mode === "custom" ? HIDE_NATIVE_CSS : "");
    if (!onDash || t.mode !== "custom" || hidden) {
      BC.injector.removeNode("bc-todo-widget");
      mounted = null;
      return;
    }
    if (ensureMount()) loadAndRender(settings);
    if (!clockTimer) {
      // Each minute redraws due labels. After midnight the window itself moves,
      // so the new day is fetched rather than yesterday's redrawn.
      let day = BC.dt.ymd(new Date());
      const tick = () => {
        if (document.hidden) return;
        const now = BC.dt.ymd(new Date());
        if (now !== day) { day = now; loadAndRender(BC.storage.current); } else rerender();
      };
      clockTimer = BC.lifecycle.bag("todo").interval(tick, 60000);
      BC.lifecycle.bag("todo").listen(document, "visibilitychange", tick);
    }
  }
  let clockTimer = null;

  BC.registry.register({
    id: "todo",
    styles: ["bc-todo-clean", "bc-todo-hide"],
    nodes: ["bc-todo-widget", "bc-pom-dock", "bc-todo-sheet", "bc-todo-details"],
    apply,
    unmount() {
      // The bag clear already killed the interval; null the handle so a re-enable
      // starts a fresh one instead of assuming one is still live.
      pomTimer = null;
      clockTimer = null;
      mounted = null;
      state.sheet = null;
      state.lastFetchKey = "";
      state.fetchSeq++;
      state.fetchKey = "";
      state.fetchPromise = null;
      state.range = null;
      state.failedKey = "";
      state.fetchedAt = 0;
      state.items = [];
      state.canvasItems = [];
      state.pending.clear();
      state.localDone.clear();
      state.first = true;
      state.lastPct = null;
    },
  });
})();
