/*
 * Better Canvas — shared UI kit.
 *
 * One stylesheet and one set of factories for every surface we draw: the settings
 * panel, the options page, and every widget injected into Canvas. Before this,
 * each feature shipped its own CSS with literal pixel values, and Canvas's global
 * `button` / `input` / `h3` rules leaked into all of it — which is why spacing was
 * inconsistent everywhere.
 *
 * Widgets injected into Canvas should use BC.ui.mount(): it renders into a Shadow
 * DOM root, so Canvas's stylesheets (and the dark-mode overrides aimed at Canvas)
 * can't reach in. Design tokens are CSS custom properties on :root, which DO
 * inherit through the shadow boundary, so mounted widgets still follow the theme.
 */
(function () {
  "use strict";
  const BC = (globalThis.BC = globalThis.BC || {});

  // Every value is a token, with a literal fallback so the kit still renders if it
  // paints before theming has emitted them (or in the options page).
  const SHEET = `
:host { all: initial; display: block; }
.bc-root {
  font-family: var(--bc-font-sans, system-ui, sans-serif);
  font-size: var(--bc-text-md, 14px);
  line-height: var(--bc-leading-snug, 1.4);
  letter-spacing: var(--bc-tracking, 0px);
  color: var(--bc-text, #18181b);
  text-align: left;
  -webkit-font-smoothing: antialiased;
}
/* Resets use :where() so they weigh exactly one class: enough to beat Canvas's
   bare element rules (h3, p, a), never enough to beat a component's own class. */
.bc-root *, .bc-root *::before, .bc-root *::after { box-sizing: border-box; }
.bc-root :where(h1, h2, h3, h4, h5, h6, p, ul, ol, li, figure, fieldset, legend) {
  margin: 0; padding: 0; border: 0; font: inherit; color: inherit; letter-spacing: inherit;
}
.bc-root :where(ul, ol) { list-style: none; }
.bc-root :where(button, input, select, textarea) {
  font-family: inherit; font-size: inherit; line-height: inherit; color: inherit; margin: 0;
}
.bc-root :where(a) { color: var(--bc-accent-text, #4338ca); text-decoration: none; }
.bc-root :where(a:hover) { text-decoration: underline; }
.bc-root :where(:focus-visible) { outline: 2px solid var(--bc-focus-ring, #4f46e5); outline-offset: 2px; }
.bc-root [hidden] { display: none !important; }

.bc-icon { flex: none; display: inline-block; vertical-align: middle; }

/* ---- type ---- */
.bc-title    { font-size: var(--bc-text-lg, 16px); font-weight: var(--bc-weight-semibold, 600); line-height: var(--bc-leading-tight, 1.25); }
.bc-heading  { font-size: var(--bc-text-md, 14px); font-weight: var(--bc-weight-semibold, 600); line-height: var(--bc-leading-tight, 1.25); }
.bc-muted    { color: var(--bc-muted, #6b6b74); }
.bc-caption  { font-size: var(--bc-text-xs, 12px); color: var(--bc-muted, #6b6b74); line-height: var(--bc-leading-snug, 1.4); }
.bc-eyebrow  { font-size: var(--bc-text-2xs, 11px); font-weight: var(--bc-weight-semibold, 600); text-transform: uppercase;
               letter-spacing: var(--bc-tracking-caps, .04em); color: var(--bc-muted, #6b6b74); }
.bc-num      { font-variant-numeric: tabular-nums; letter-spacing: 0; }
.bc-truncate { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bc-sr-only  { position: absolute !important; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%);
               white-space: nowrap; border: 0; padding: 0; margin: -1px; }

/* ---- layout helpers ---- */
.bc-row-flex { display: flex; align-items: center; gap: var(--bc-space-2, 8px); min-width: 0; }
.bc-stack    { display: flex; flex-direction: column; gap: var(--bc-space-3, 12px); min-width: 0; }
.bc-spacer   { flex: 1 1 auto; }
.bc-divider  { height: 1px; background: var(--bc-border, #e4e4e7); border: 0; margin: var(--bc-space-2, 8px) 0; }

/* ---- buttons ---- */
.bc-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: var(--bc-space-2, 8px);
  height: var(--bc-control-h, 32px); padding: 0 var(--bc-space-3, 12px); margin: 0;
  border: 1px solid var(--bc-border, #e4e4e7); border-radius: var(--bc-radius-md, 8px);
  background: var(--bc-surface-2, #fff); color: var(--bc-text, #18181b);
  font: var(--bc-weight-medium, 500) var(--bc-text-sm, 13px)/1 var(--bc-font-sans, system-ui, sans-serif);
  white-space: nowrap; cursor: pointer; user-select: none; box-shadow: none; text-decoration: none;
  transition: background-color var(--bc-dur-2, 150ms) var(--bc-ease-standard, ease),
              border-color var(--bc-dur-2, 150ms) var(--bc-ease-standard, ease),
              color var(--bc-dur-2, 150ms) var(--bc-ease-standard, ease),
              box-shadow var(--bc-dur-2, 150ms) var(--bc-ease-standard, ease),
              transform var(--bc-dur-1, 90ms) var(--bc-ease-out, ease);
}
.bc-btn:hover { background: var(--bc-surface-hover, #f4f4f5); border-color: var(--bc-border-strong, #d4d4d8); }
.bc-btn:active { background: var(--bc-surface-pressed, #e4e4e7); transform: scale(.97); }
.bc-btn:focus-visible { outline: 2px solid var(--bc-focus-ring, #4f46e5); outline-offset: 2px; }
.bc-btn:disabled, .bc-btn[aria-disabled="true"] { opacity: .5; cursor: default; pointer-events: none; }
.bc-btn .bc-icon { width: 16px; height: 16px; }
.bc-btn--primary { background: var(--bc-accent, #4f46e5); border-color: var(--bc-accent, #4f46e5); color: var(--bc-accent-contrast, #fff); }
.bc-btn--primary:hover { background: var(--bc-accent-hover, #4338ca); border-color: var(--bc-accent-hover, #4338ca); box-shadow: 0 2px 8px var(--bc-accent-weak, rgba(79,70,229,.25)); }
.bc-btn--primary:active { background: var(--bc-accent-hover, #4338ca); }
.bc-btn--ghost { background: transparent; border-color: transparent; }
.bc-btn--ghost:hover { background: var(--bc-surface-hover, #f4f4f5); border-color: transparent; }
.bc-btn--danger { color: var(--bc-danger, #b91c1c); }
.bc-btn--danger:hover { background: var(--bc-danger-bg, #fef2f2); border-color: var(--bc-danger-border, #fca5a5); }
.bc-btn--sm { height: var(--bc-control-h-sm, 28px); padding: 0 var(--bc-space-2, 8px); font-size: var(--bc-text-xs, 12px); gap: 6px; }
.bc-btn--sm .bc-icon { width: 14px; height: 14px; }
.bc-btn--block { width: 100%; }

.bc-iconbtn {
  display: inline-flex; align-items: center; justify-content: center; flex: none;
  width: var(--bc-control-h, 32px); height: var(--bc-control-h, 32px); padding: 0; margin: 0;
  border: 1px solid transparent; border-radius: var(--bc-radius-md, 8px);
  background: transparent; color: var(--bc-muted, #6b6b74); cursor: pointer; box-shadow: none;
  transition: background-color var(--bc-dur-2, 150ms) var(--bc-ease-standard, ease),
              color var(--bc-dur-2, 150ms) var(--bc-ease-standard, ease),
              transform var(--bc-dur-1, 90ms) var(--bc-ease-out, ease);
}
.bc-iconbtn:hover { background: var(--bc-surface-hover, #f4f4f5); color: var(--bc-text, #18181b); }
.bc-iconbtn:active { background: var(--bc-surface-pressed, #e4e4e7); transform: scale(.92); }
.bc-iconbtn:focus-visible { outline: 2px solid var(--bc-focus-ring, #4f46e5); outline-offset: 1px; }
.bc-iconbtn[aria-pressed="true"] { color: var(--bc-accent-text, #4338ca); background: var(--bc-accent-weak, rgba(79,70,229,.12)); }
.bc-iconbtn:disabled { opacity: .45; cursor: default; pointer-events: none; }
.bc-iconbtn .bc-icon { width: 16px; height: 16px; }
.bc-iconbtn--sm { width: var(--bc-control-h-sm, 28px); height: var(--bc-control-h-sm, 28px); border-radius: var(--bc-radius-sm, 6px); }
.bc-iconbtn--sm .bc-icon { width: 15px; height: 15px; }
.bc-iconbtn--outline { border-color: var(--bc-border, #e4e4e7); background: var(--bc-surface-2, #fff); }

/* ---- form controls ---- */
.bc-input, .bc-select, .bc-textarea {
  display: block; width: 100%; height: var(--bc-control-h, 32px); margin: 0;
  padding: 0 var(--bc-space-3, 12px);
  border: 1px solid var(--bc-border, #e4e4e7); border-radius: var(--bc-radius-md, 8px);
  background: var(--bc-surface-2, #fff); color: var(--bc-text, #18181b);
  font: var(--bc-weight-regular, 400) var(--bc-text-sm, 13px)/1.3 var(--bc-font-sans, system-ui, sans-serif);
  box-shadow: none; outline: none; vertical-align: middle;
  transition: border-color var(--bc-dur-1, 90ms) var(--bc-ease-standard, ease), box-shadow var(--bc-dur-1, 90ms) var(--bc-ease-standard, ease);
}
.bc-input::placeholder, .bc-textarea::placeholder { color: var(--bc-text-subtle, #a1a1aa); opacity: 1; }
.bc-input:hover, .bc-select:hover, .bc-textarea:hover { border-color: var(--bc-border-strong, #d4d4d8); }
.bc-input:focus, .bc-select:focus, .bc-textarea:focus {
  border-color: var(--bc-accent-stroke, #4f46e5);
  box-shadow: 0 0 0 3px var(--bc-accent-weak, rgba(79,70,229,.15));
}
.bc-input--sm, .bc-select--sm { height: var(--bc-control-h-sm, 28px); font-size: var(--bc-text-xs, 12px); padding: 0 var(--bc-space-2, 8px); }
.bc-textarea { height: auto; min-height: 80px; padding: var(--bc-space-2, 8px) var(--bc-space-3, 12px); resize: vertical; line-height: 1.5; }
.bc-textarea--mono { font-family: var(--bc-font-mono, monospace); font-size: var(--bc-text-xs, 12px); }
.bc-select {
  appearance: none; -webkit-appearance: none; cursor: pointer; padding-right: 32px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 10px center; background-size: 14px 14px;
}
.bc-select--sm { padding-right: 26px; background-position: right 7px center; }
.bc-select option { background: var(--bc-surface-2, #fff); color: var(--bc-text, #18181b); }
.bc-input-wrap { position: relative; display: block; }
.bc-input-wrap > .bc-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); width: 15px; height: 15px; color: var(--bc-muted, #6b6b74); pointer-events: none; }
.bc-input-wrap > .bc-input { padding-left: 32px; }
.bc-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.bc-label { font-size: var(--bc-text-xs, 12px); font-weight: var(--bc-weight-medium, 500); color: var(--bc-muted, #6b6b74); }

/* segmented control */
.bc-seg {
  position: relative; display: inline-flex; align-items: center; gap: 2px; padding: 2px; max-width: 100%;
  border-radius: var(--bc-radius-md, 8px); background: var(--bc-surface-3, #f4f4f5); isolation: isolate;
}
/* One thumb slides between options instead of each option painting its own
   background; until it has been measured the selected option paints itself. */
.bc-seg__thumb {
  position: absolute; z-index: -1; top: 2px; bottom: 2px; left: 0; width: 0;
  border-radius: calc(var(--bc-radius-md, 8px) - 2px); background: var(--bc-surface-2, #fff);
  box-shadow: var(--bc-shadow-1, 0 1px 2px rgba(0,0,0,.08)); opacity: 0; pointer-events: none;
  transition: transform var(--bc-dur-3, 220ms) var(--bc-ease-out, ease), width var(--bc-dur-3, 220ms) var(--bc-ease-out, ease);
}
.bc-seg--live .bc-seg__thumb { opacity: 1; }
.bc-seg--live .bc-seg__opt[aria-checked="true"] { background: transparent; box-shadow: none; }
.bc-seg__opt {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; flex: 1 1 auto;
  height: calc(var(--bc-control-h, 32px) - 4px); padding: 0 var(--bc-space-3, 12px); margin: 0;
  border: 0; border-radius: calc(var(--bc-radius-md, 8px) - 2px); background: transparent;
  color: var(--bc-muted, #6b6b74); font: var(--bc-weight-medium, 500) var(--bc-text-xs, 12px)/1 var(--bc-font-sans, system-ui, sans-serif);
  white-space: nowrap; cursor: pointer; box-shadow: none;
  transition: background-color var(--bc-dur-2, 150ms) var(--bc-ease-standard, ease), color var(--bc-dur-2, 150ms) var(--bc-ease-standard, ease),
              transform var(--bc-dur-1, 90ms) var(--bc-ease-out, ease);
}
.bc-seg__opt:hover { color: var(--bc-text, #18181b); }
.bc-seg__opt:active { transform: scale(.97); }
.bc-seg__opt[aria-checked="true"] { background: var(--bc-surface-2, #fff); color: var(--bc-text, #18181b); box-shadow: var(--bc-shadow-1, 0 1px 2px rgba(0,0,0,.08)); }
.bc-seg__opt:focus-visible { outline: 2px solid var(--bc-focus-ring, #4f46e5); outline-offset: 0; }
.bc-seg__opt .bc-icon { width: 14px; height: 14px; }
.bc-seg--sm .bc-seg__opt { height: calc(var(--bc-control-h-sm, 28px) - 4px); padding: 0 var(--bc-space-2, 8px); }
.bc-seg--icons .bc-seg__opt { padding: 0 var(--bc-space-2, 8px); }

/* switch */
.bc-switch {
  position: relative; display: inline-block; flex: none; width: 34px; height: 20px; margin: 0; padding: 0;
  border: 0; border-radius: var(--bc-radius-pill, 999px); background: var(--bc-border-contrast, #a1a1aa);
  cursor: pointer; box-shadow: none; transition: background-color var(--bc-dur-2, 150ms) var(--bc-ease-standard, ease);
}
.bc-switch::after {
  content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 999px;
  background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.25);
  transition: transform var(--bc-dur-3, 220ms) var(--bc-ease-spring, ease), width var(--bc-dur-2, 150ms) var(--bc-ease-out, ease);
}
.bc-switch[aria-checked="true"] { background: var(--bc-accent, #4f46e5); }
.bc-switch[aria-checked="true"]::after { transform: translateX(14px); }
.bc-switch:active::after { width: 20px; }
.bc-switch[aria-checked="true"]:active::after { transform: translateX(10px); }
.bc-switch:focus-visible { outline: 2px solid var(--bc-focus-ring, #4f46e5); outline-offset: 2px; }
.bc-switch:disabled { opacity: .5; cursor: default; }

/* checkbox (custom box over a real input) */
.bc-check { display: inline-flex; align-items: center; gap: var(--bc-space-2, 8px); cursor: pointer; font-size: var(--bc-text-sm, 13px); }
.bc-check input {
  appearance: none; -webkit-appearance: none; flex: none; width: 16px; height: 16px; margin: 0;
  border: 1.5px solid var(--bc-border-contrast, #a1a1aa); border-radius: 4px; background: var(--bc-surface-2, #fff);
  display: inline-grid; place-content: center; cursor: pointer;
}
.bc-check input::after {
  content: ""; width: 9px; height: 5px; margin-top: -2px; border: 2px solid var(--bc-accent-contrast, #fff);
  border-top: 0; border-right: 0; transform: rotate(-45deg) scale(0); transition: transform var(--bc-dur-3, 220ms) var(--bc-ease-spring, ease);
}
.bc-check input { transition: background-color var(--bc-dur-2, 150ms) ease, border-color var(--bc-dur-2, 150ms) ease; }
.bc-check input:checked { background: var(--bc-accent, #4f46e5); border-color: var(--bc-accent, #4f46e5); }
.bc-check input:checked::after { transform: rotate(-45deg) scale(1); }
.bc-check input:focus-visible { outline: 2px solid var(--bc-focus-ring, #4f46e5); outline-offset: 2px; }

/* chips + badges */
.bc-chip {
  display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 var(--bc-space-2, 8px);
  border-radius: var(--bc-radius-pill, 999px); background: var(--bc-surface-3, #f4f4f5); color: var(--bc-text, #18181b);
  font-size: var(--bc-text-xs, 12px); font-weight: var(--bc-weight-medium, 500); white-space: nowrap;
}
.bc-chip__x { display: inline-flex; width: 16px; height: 16px; margin-right: -4px; padding: 0; border: 0; border-radius: 50%;
  align-items: center; justify-content: center; background: transparent; color: var(--bc-muted, #6b6b74); cursor: pointer; }
.bc-chip__x:hover { background: var(--bc-surface-pressed, #e4e4e7); color: var(--bc-text, #18181b); }
.bc-chip__x .bc-icon { width: 12px; height: 12px; }
.bc-chip__x { position: relative; }
.bc-chip__x::before { content: ""; position: absolute; inset: -4px; }   /* a 24px target */
.bc-badge2 {
  display: inline-flex; align-items: center; gap: 4px; height: 20px; padding: 0 6px;
  border-radius: var(--bc-radius-pill, 999px); background: var(--bc-surface-3, #f4f4f5); color: var(--bc-text, #18181b);
  font-size: var(--bc-text-2xs, 11px); font-weight: var(--bc-weight-semibold, 600); font-variant-numeric: tabular-nums; white-space: nowrap;
}
.bc-badge2--accent  { background: var(--bc-accent-weak, rgba(79,70,229,.12)); color: var(--bc-accent-text, #4338ca); }
.bc-badge2--success { background: var(--bc-success-bg, #ecfdf5); color: var(--bc-success, #047857); }
.bc-badge2--warn    { background: var(--bc-warn-bg, #fffbeb); color: var(--bc-warn, #a16207); }
.bc-badge2--danger  { background: var(--bc-danger-bg, #fef2f2); color: var(--bc-danger, #b91c1c); }
.bc-badge2--info    { background: var(--bc-info-bg, #eff6ff); color: var(--bc-info, #0369a1); }
.bc-badge2--solid   { background: var(--bc-accent, #4f46e5); color: var(--bc-accent-contrast, #fff); }

/* ---- surfaces ---- */
.bc-panel {
  background: var(--bc-surface-2, #fff); color: var(--bc-text, #18181b);
  border: 1px solid var(--bc-border, #e4e4e7); border-radius: var(--bc-radius-lg, 12px);
  padding: var(--bc-space-4, 16px); margin: 0 0 var(--bc-space-4, 16px);
  font-family: var(--bc-font-sans, system-ui, sans-serif); font-size: var(--bc-text-md, 14px); line-height: var(--bc-leading-snug, 1.4);
}
.bc-panel-head { display: flex; align-items: center; gap: var(--bc-space-2, 8px); margin-bottom: var(--bc-space-3, 12px); min-width: 0; }
.bc-panel-title { flex: 1; min-width: 0; margin: 0; font-size: var(--bc-text-md, 14px); font-weight: var(--bc-weight-semibold, 600); line-height: var(--bc-leading-tight, 1.25); }
.bc-panel-head > .bc-icon { width: 16px; height: 16px; color: var(--bc-muted, #6b6b74); }
.bc-panel-desc { margin: calc(-1 * var(--bc-space-2, 8px)) 0 var(--bc-space-3, 12px); font-size: var(--bc-text-xs, 12px); color: var(--bc-muted, #6b6b74); }
.bc-card { background: var(--bc-surface-3, #f4f4f5); border-radius: var(--bc-radius-md, 8px); padding: var(--bc-space-3, 12px); }

/* ---- menus / popovers ---- */
/* Above the settings panel and sheets, since menus open from inside both. */
.bc-pop {
  position: fixed; z-index: 2147482900; min-width: 200px; max-width: 320px;
  padding: 4px; border: 1px solid var(--bc-border, #e4e4e7); border-radius: var(--bc-radius-lg, 12px);
  background: var(--bc-surface-2, #fff); color: var(--bc-text, #18181b); box-shadow: var(--bc-shadow-2, 0 4px 12px rgba(0,0,0,.1));
  font-family: var(--bc-font-sans, system-ui, sans-serif); font-size: var(--bc-text-sm, 13px);
  transform-origin: var(--bc-pop-origin, top right);
  animation: bc-pop-in var(--bc-dur-2, 150ms) var(--bc-ease-out, ease);
}
.bc-pop--pad { padding: var(--bc-space-3, 12px); }
.bc-pop--out { pointer-events: none; animation: bc-pop-out var(--bc-dur-1, 90ms) var(--bc-ease-in, ease) forwards; }
@keyframes bc-pop-in { from { opacity: 0; transform: translateY(-4px) scale(.97); filter: blur(2px); } to { opacity: 1; transform: none; filter: blur(0); } }
@keyframes bc-pop-out { to { opacity: 0; transform: translateY(-2px) scale(.98); filter: blur(1.5px); } }
.bc-menu__item {
  display: flex; align-items: center; gap: var(--bc-space-2, 8px); width: 100%; height: 32px;
  padding: 0 var(--bc-space-2, 8px); margin: 0; border: 0; border-radius: var(--bc-radius-sm, 6px);
  background: transparent; color: var(--bc-text, #18181b); font: inherit; text-align: left; cursor: pointer; box-shadow: none;
}
.bc-menu__item { transition: background-color var(--bc-dur-1, 90ms) ease; }
.bc-menu__item:hover, .bc-menu__item:focus-visible { background: var(--bc-surface-hover, #f4f4f5); outline: none; }
.bc-menu__item .bc-icon { width: 16px; height: 16px; color: var(--bc-muted, #6b6b74); }
.bc-menu__dot { flex: none; width: 8px; height: 8px; margin: 0 4px; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(128,128,128,.3); }
.bc-menu__item--danger { color: var(--bc-danger, #b91c1c); }
.bc-menu__item--danger .bc-icon { color: inherit; }
.bc-menu__item[aria-checked="true"]::after {
  content: ""; flex: none; width: 14px; height: 14px; margin-left: auto; background: var(--bc-accent-text, #4338ca);
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'/%3E%3C/svg%3E") center / contain no-repeat;
          mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'/%3E%3C/svg%3E") center / contain no-repeat;
}
.bc-menu__sep { height: 1px; margin: 4px; background: var(--bc-border, #e4e4e7); }
.bc-menu__label { padding: 6px var(--bc-space-2, 8px) 4px; font-size: var(--bc-text-2xs, 11px); font-weight: var(--bc-weight-semibold, 600);
  text-transform: uppercase; letter-spacing: var(--bc-tracking-caps, .04em); color: var(--bc-muted, #6b6b74); }

/* ---- async states ---- */
.bc-sk { display: grid; gap: var(--bc-space-2, 8px); padding: var(--bc-space-1, 4px) 0; }
.bc-sk-bar {
  height: 12px; border-radius: var(--bc-radius-sm, 6px);
  background: linear-gradient(90deg, var(--bc-surface-3, #f4f4f5) 25%, var(--bc-surface-hover, #ececee) 50%, var(--bc-surface-3, #f4f4f5) 75%);
  background-size: 200% 100%; animation: bc-shimmer 1.2s ease-in-out infinite;
}
@keyframes bc-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.bc-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: var(--bc-space-5, 20px) var(--bc-space-3, 12px);
  text-align: center; color: var(--bc-muted, #6b6b74); font-size: var(--bc-text-sm, 13px); }
.bc-empty > .bc-icon { width: 20px; height: 20px; color: var(--bc-text-subtle, #a1a1aa); margin-bottom: 2px; }
.bc-empty-hint { font-size: var(--bc-text-xs, 12px); color: var(--bc-text-subtle, var(--bc-muted, #6b6b74)); }
.bc-error { display: flex; align-items: center; gap: var(--bc-space-2, 8px); flex-wrap: wrap; padding: var(--bc-space-3, 12px);
  border-radius: var(--bc-radius-md, 8px); background: var(--bc-danger-bg, #fef2f2); color: var(--bc-danger, #b91c1c); font-size: var(--bc-text-sm, 13px); }
.bc-error > .bc-icon { width: 16px; height: 16px; }
.bc-error .bc-btn { margin-left: auto; }

/* ---- data display ---- */
.bc-stat { display: flex; flex-direction: column; gap: 2px; }
.bc-stat-value { font-size: var(--bc-text-figure, 28px); font-weight: var(--bc-weight-semibold, 600); line-height: var(--bc-leading-tight, 1.25); font-variant-numeric: tabular-nums; }
.bc-stat-sub { font-size: var(--bc-text-xs, 12px); color: var(--bc-muted, #6b6b74); }
.bc-t-success { color: var(--bc-success, #047857); }
.bc-t-warn    { color: var(--bc-warn, #a16207); }
.bc-t-danger  { color: var(--bc-danger, #b91c1c); }
.bc-progress2 { position: relative; height: 6px; border-radius: var(--bc-radius-pill, 999px); background: var(--bc-surface-3, #f4f4f5); overflow: hidden; }
.bc-progress2-fill { height: 100%; width: 0%; border-radius: inherit; background: var(--bc-accent-stroke, #4f46e5);
  transition: width var(--bc-dur-4, 300ms) var(--bc-ease-out, ease); }
.bc-bg-success { background: var(--bc-success, #047857); }
.bc-bg-warn    { background: var(--bc-warn, #a16207); }
.bc-bg-danger  { background: var(--bc-danger, #b91c1c); }
.bc-spark { line-height: 0; display: inline-block; }
.bc-ring { display: block; flex: none; }
.bc-ring__track { stroke: var(--bc-surface-3, #f4f4f5); }
.bc-ring__value { stroke: var(--bc-accent-stroke, #4f46e5); transition: stroke-dashoffset var(--bc-dur-4, 300ms) var(--bc-ease-out, ease); }
.bc-kbd { display: inline-flex; align-items: center; height: 20px; padding: 0 6px; border: 1px solid var(--bc-border, #e4e4e7);
  border-bottom-width: 2px; border-radius: var(--bc-radius-sm, 6px); background: var(--bc-surface-2, #fff);
  font: var(--bc-weight-medium, 500) var(--bc-text-2xs, 11px)/1 var(--bc-font-mono, monospace); color: var(--bc-muted, #6b6b74); }

/* ---- tabs ---- */
.bc-tabs [role="tablist"] { display: flex; gap: var(--bc-space-4, 16px); border-bottom: 1px solid var(--bc-border, #e4e4e7); margin-bottom: var(--bc-space-3, 12px); }
.bc-tabs [role="tab"] { height: 36px; padding: 0; margin: 0 0 -1px; border: 0; border-bottom: 2px solid transparent; background: transparent;
  color: var(--bc-muted, #6b6b74); font: var(--bc-weight-medium, 500) var(--bc-text-sm, 13px)/1 var(--bc-font-sans, system-ui, sans-serif); cursor: pointer; }
.bc-tabs [role="tab"]:hover { color: var(--bc-text, #18181b); }
.bc-tabs [role="tab"][aria-selected="true"] { color: var(--bc-text, #18181b); border-bottom-color: var(--bc-accent-stroke, #4f46e5); }

/* ---- dialogs + sheets ---- */
.bc-scrim {
  position: fixed; inset: 0; z-index: var(--bc-z-modal, 2147482500);
  display: flex; align-items: center; justify-content: center; padding: var(--bc-space-6, 24px);
  background: var(--bc-overlay, rgba(15,20,28,.44)); animation: bc-fade var(--bc-dur-3, 220ms) var(--bc-ease-out, ease);
}
@keyframes bc-fade { from { opacity: 0; } to { opacity: 1; } }
.bc-dialog {
  width: 100%; max-width: 440px; max-height: calc(100vh - 48px); overflow: auto;
  padding: var(--bc-space-6, 24px); border: 1px solid var(--bc-border, #e4e4e7); border-radius: var(--bc-radius-xl, 16px);
  background: var(--bc-surface-2, #fff); color: var(--bc-text, #18181b); box-shadow: var(--bc-shadow-3, 0 12px 32px rgba(0,0,0,.15));
  font-family: var(--bc-font-sans, system-ui, sans-serif); font-size: var(--bc-text-md, 14px); line-height: var(--bc-leading-body, 1.5);
  animation: bc-pop 300ms cubic-bezier(.22, 1, .36, 1);
}
@keyframes bc-pop { from { opacity: 0; transform: scale(.97); filter: blur(3px); } to { opacity: 1; transform: none; filter: blur(0); } }
.bc-dialog-title { margin: 0 0 var(--bc-space-2, 8px); font-size: var(--bc-text-lg, 16px); font-weight: var(--bc-weight-semibold, 600); line-height: var(--bc-leading-tight, 1.25); }
.bc-dialog-body { color: var(--bc-text, #18181b); }
.bc-dialog-body p { margin: 0; color: var(--bc-muted, #6b6b74); }
.bc-dialog-foot { display: flex; align-items: center; justify-content: space-between; gap: var(--bc-space-2, 8px); margin-top: var(--bc-space-6, 24px); }
.bc-tour-nav { display: inline-flex; align-items: center; gap: var(--bc-space-2, 8px); }
.bc-scrim--sheet { justify-content: flex-end; align-items: stretch; padding: 0; }
.bc-sheet {
  display: flex; flex-direction: column; width: min(480px, 100vw); height: 100%;
  border-left: 1px solid var(--bc-border, #e4e4e7); background: var(--bc-surface-2, #fff); color: var(--bc-text, #18181b);
  box-shadow: var(--bc-shadow-4, -12px 0 40px rgba(0,0,0,.1)); font-family: var(--bc-font-sans, system-ui, sans-serif);
  font-size: var(--bc-text-md, 14px); animation: bc-sheet-in 380ms cubic-bezier(.22, 1, .36, 1);
}
@keyframes bc-sheet-in { from { transform: translateX(32px); opacity: 0; filter: blur(5px); } to { transform: none; opacity: 1; filter: blur(0); } }
@keyframes bc-sheet-out { to { transform: translateX(32px); opacity: 0; filter: blur(4px); } }
@keyframes bc-fade-out { to { opacity: 0; } }
@keyframes bc-pop-away { to { opacity: 0; transform: scale(.98); } }
.bc-scrim--out { animation: bc-fade-out var(--bc-dur-2, 150ms) var(--bc-ease-in, ease) forwards; pointer-events: none; }
.bc-scrim--out .bc-sheet { animation: bc-sheet-out var(--bc-dur-2, 150ms) var(--bc-ease-in, ease) forwards; }
.bc-scrim--out .bc-dialog { animation: bc-pop-away var(--bc-dur-2, 150ms) var(--bc-ease-in, ease) forwards; }
.bc-sheet__head { display: flex; align-items: center; gap: var(--bc-space-2, 8px); padding: var(--bc-space-4, 16px) var(--bc-space-5, 20px);
  border-bottom: 1px solid var(--bc-border, #e4e4e7); }
.bc-sheet__title { flex: 1; min-width: 0; font-size: var(--bc-text-lg, 16px); font-weight: var(--bc-weight-semibold, 600); }
.bc-sheet__body { flex: 1; overflow: auto; scrollbar-width: thin; padding: var(--bc-space-5, 20px); }
.bc-sheet__foot { display: flex; justify-content: flex-end; gap: var(--bc-space-2, 8px); padding: var(--bc-space-3, 12px) var(--bc-space-5, 20px);
  border-top: 1px solid var(--bc-border, #e4e4e7); }

@media (prefers-reduced-motion: reduce) {
  .bc-sk-bar, .bc-scrim, .bc-dialog, .bc-sheet, .bc-pop { animation: none; }
  .bc-btn:active, .bc-iconbtn:active, .bc-seg__opt:active { transform: none; }
}
:root[data-bc-motion="0"] .bc-sk-bar, :root[data-bc-motion="0"] .bc-scrim, :root[data-bc-motion="0"] .bc-dialog,
:root[data-bc-motion="0"] .bc-sheet, :root[data-bc-motion="0"] .bc-pop { animation: none; }
`;

  // Hoisted behind a flag: every factory called ensure(), so a panel built from a
  // dozen primitives hit setStyle a dozen times. Reset by the registry apply() so
  // teardown followed by re-enable still re-injects the sheet.
  let injected = false;
  function ensure() {
    if (injected) return;
    injected = true;
    if (BC.injector) BC.injector.setStyle("bc-ui", SHEET);
    else if (document.head && !document.querySelector('style[data-better-canvas="bc-ui"]')) {
      // Standalone documents (the options page) have no injector.
      const tag = document.createElement("style");
      tag.setAttribute("data-better-canvas", "bc-ui");
      tag.textContent = SHEET;
      document.head.appendChild(tag);
    }
  }

  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    for (const k of Object.keys(attrs || {})) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k === "html") n.innerHTML = v;
      else if (k.indexOf("on") === 0 && typeof v === "function") n.addEventListener(k.slice(2).toLowerCase(), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const c of [].concat(children || [])) {
      if (c == null || c === false) continue;
      n.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
    }
    return n;
  }

  // An icon by name, or a text glyph for anything the set doesn't have.
  function icon(name, opts) {
    if (BC.icons && BC.icons.has(name)) return BC.icons.el(name, opts);
    return el("span", { class: "bc-icon", "aria-hidden": "true", text: name || "" });
  }

  const VARIANT = { primary: "primary", ghost: "ghost", danger: "danger", secondary: "", default: "" };

  // Positions a floating element next to its anchor, flipping above / to the left
  // when it would run off-screen. Fixed positioning, so it works inside a shadow
  // root and inside scrolling containers alike.
  function place(pop, anchor, align) {
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    // "side": beside the anchor (nav items down the left edge open to the right).
    if (align === "side") {
      const sl = Math.min(r.right + 8, vw - w - 8);
      const st = Math.max(8, Math.min(r.top, vh - h - 8));
      pop.style.setProperty("--bc-pop-origin", "top left");
      pop.style.left = Math.round(sl) + "px";
      pop.style.top = Math.round(st) + "px";
      return;
    }
    let left = align === "start" ? r.left : r.right - w;
    left = Math.max(8, Math.min(left, vw - w - 8));
    let top = r.bottom + 6;
    const above = top + h > vh - 8 && r.top - h - 6 > 8;
    if (above) top = r.top - h - 6;
    pop.style.setProperty("--bc-pop-origin", (above ? "bottom " : "top ") + (align === "start" ? "left" : "right"));
    pop.style.left = Math.round(left) + "px";
    pop.style.top = Math.round(Math.max(8, top)) + "px";
  }

  let openPop = null;   // one floating menu/popover at a time

  // Plays the exit animation, then removes the host. Without motion it goes at once.
  function leave(scrim, host) {
    if (BC.ui.motion.reduced()) { host.remove(); return; }
    scrim.classList.add("bc-scrim--out");
    setTimeout(() => host.remove(), 160);
  }

  function closePop() {
    if (!openPop) return;
    const p = openPop;
    openPop = null;
    p.cleanup();
  }

  // Generic anchored popover. `content` is a node; returns { el, close }.
  function popover(anchor, content, opts) {
    const o = opts || {};
    closePop();
    ensure();
    const pop = el("div", { class: "bc-pop" + (o.padded ? " bc-pop--pad" : ""), role: o.role || "dialog" });
    if (o.label) pop.setAttribute("aria-label", o.label);
    if (o.width) pop.style.width = o.width + "px";
    pop.appendChild(content);
    // Its own body-level layer. Appended next to the anchor, a transformed Canvas
    // ancestor (the right sidebar has one) turned position:fixed into "fixed to that
    // box", which put menus opened from the planner ~1000px off screen. The layer
    // copies the anchor's shadow stylesheet, so custom popover content keeps its
    // styles, and Canvas's CSS still can't reach in.
    const root = anchor.getRootNode();
    const layer = document.createElement("div");
    layer.setAttribute("data-bc-node", "bc-pop-layer");
    const sr = layer.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    const css = root instanceof ShadowRoot ? [...root.querySelectorAll("style")].map((t) => t.textContent).join("\n") : "";
    style.textContent = css.indexOf(".bc-pop {") === -1 ? SHEET + css : css;
    const holder = el("div", { class: "bc-root" }, [pop]);
    sr.append(style, holder);
    document.documentElement.appendChild(layer);
    place(pop, anchor, o.align);
    anchor.setAttribute("aria-expanded", "true");

    const onDown = (e) => {
      const path = e.composedPath ? e.composedPath() : [e.target];
      if (path.includes(pop) || path.includes(anchor)) return;
      closePop();
    };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); closePop(); anchor.focus(); } };
    const onScroll = () => place(pop, anchor, o.align);
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);
    const handle = {
      el: pop,
      close: closePop,
      cleanup() {
        document.removeEventListener("mousedown", onDown, true);
        document.removeEventListener("keydown", onKey, true);
        window.removeEventListener("resize", onScroll);
        window.removeEventListener("scroll", onScroll, true);
        anchor.setAttribute("aria-expanded", "false");
        if (BC.ui.motion.reduced()) layer.remove();
        else { pop.classList.add("bc-pop--out"); setTimeout(() => layer.remove(), 110); }
        if (o.onClose) BC.util.guard(o.onClose, "popover onClose");
      },
    };
    openPop = handle;
    return handle;
  }

  BC.ui = {
    el,
    icon,
    css() { return SHEET; },
    closePopovers: closePop,
    popoverOpen() { return !!openPop; },

    // Render a widget into its own Shadow DOM root. Idempotent per id: an existing
    // connected host is reused. `place(host)` inserts the host the first time.
    // Returns { host, root, body } — query and render inside `body`.
    mount(id, { place: insert, css, className, inline } = {}) {
      let host = document.querySelector('[data-bc-node="' + id + '"]');
      if (host && host.isConnected && host.shadowRoot) {
        return { host, root: host.shadowRoot, body: host.shadowRoot.querySelector(".bc-root"), fresh: false };
      }
      host = document.createElement("div");
      host.setAttribute("data-bc-node", id);
      host.className = "bc-host" + (className ? " " + className : "");
      if (inline) host.style.display = "inline-block";
      const root = host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = SHEET + (css || "");
      const body = document.createElement("div");
      body.className = "bc-root";
      root.append(style, body);
      if (insert) insert(host);
      // Unplaced hosts are floating UI. They hang off <html>, not <body>: the body is
      // scaled while the settings panel is open, and these must stay full size.
      if (!host.isConnected) document.documentElement.appendChild(host);
      return { host, root, body, fresh: true };
    },

    panel({ title, description, actions, icon: ic } = {}) {
      ensure();
      const body = el("div", { class: "bc-panel-body" });
      const kids = [];
      if (title || (actions && actions.length)) {
        kids.push(el("div", { class: "bc-panel-head" }, [
          ic ? icon(ic) : null,
          el("h3", { class: "bc-panel-title", text: title || "" }),
          ...(actions || []),
        ]));
      }
      if (description) kids.push(el("p", { class: "bc-panel-desc", text: description }));
      kids.push(body);
      const root = el("section", { class: "bc-panel" }, kids);
      return { root, head: root.querySelector(".bc-panel-head"), body };
    },

    card(children) {
      ensure();
      return el("div", { class: "bc-card" }, children || []);
    },

    // variant: primary | secondary | ghost | danger; size: md | sm.
    button(label, { variant, size, icon: ic, iconRight, title, onClick, block, type } = {}) {
      ensure();
      const v = VARIANT[variant] != null ? VARIANT[variant] : "";
      const b = el("button", {
        class: "bc-btn" + (v ? " bc-btn--" + v : "") + (size === "sm" ? " bc-btn--sm" : "") + (block ? " bc-btn--block" : ""),
        type: type || "button",
      }, [ic ? icon(ic) : null, label != null ? el("span", { text: String(label) }) : null, iconRight ? icon(iconRight) : null]);
      if (title) b.title = title;
      if (onClick) b.addEventListener("click", onClick);
      return b;
    },

    // `label` is required — an icon-only control with no accessible name is the
    // single most common a11y defect in this codebase.
    iconButton(glyph, { label, title, variant, size, pressed, onClick } = {}) {
      ensure();
      if (!label) BC.util.warn("ui.iconButton called without a label", glyph);
      const b = el("button", {
        class: "bc-iconbtn" + (size === "sm" ? " bc-iconbtn--sm" : "") + (variant === "outline" ? " bc-iconbtn--outline" : ""),
        type: "button", "aria-label": label || "", title: title || label || "",
      }, [icon(glyph)]);
      if (pressed != null) b.setAttribute("aria-pressed", pressed ? "true" : "false");
      if (onClick) b.addEventListener("click", onClick);
      return b;
    },

    input({ value, placeholder, type, ariaLabel, size, icon: ic, onInput, onChange } = {}) {
      ensure();
      const inp = el("input", {
        class: "bc-input" + (size === "sm" ? " bc-input--sm" : ""), type: type || "text",
        placeholder: placeholder || "", "aria-label": ariaLabel || placeholder || "",
      });
      if (value != null) inp.value = value;
      if (onInput) inp.addEventListener("input", () => onInput(inp.value, inp));
      if (onChange) inp.addEventListener("change", () => onChange(inp.value, inp));
      if (!ic) return inp;
      const wrap = el("label", { class: "bc-input-wrap" }, [icon(ic), inp]);
      wrap.input = inp;
      return wrap;
    },

    select({ value, options, ariaLabel, size, onChange } = {}) {
      ensure();
      const sel = el("select", { class: "bc-select" + (size === "sm" ? " bc-select--sm" : ""), "aria-label": ariaLabel || "" });
      for (const o of options || []) sel.appendChild(el("option", { value: String(o.value) }, o.label));
      if (value != null) sel.value = String(value);
      if (onChange) sel.addEventListener("change", () => onChange(sel.value, sel));
      return sel;
    },

    // Radiogroup of buttons. Returns { root, set(value) }.
    segmented({ value, options, ariaLabel, size, onChange } = {}) {
      ensure();
      const root = el("div", {
        class: "bc-seg" + (size === "sm" ? " bc-seg--sm" : "") + ((options || []).every((o) => o.icon && !o.label) ? " bc-seg--icons" : ""),
        role: "radiogroup", "aria-label": ariaLabel || "",
      });
      const thumb = el("span", { class: "bc-seg__thumb", "aria-hidden": "true" });
      root.appendChild(thumb);
      const btns = (options || []).map((o) => {
        const b = el("button", {
          class: "bc-seg__opt", type: "button", role: "radio", "data-value": String(o.value),
          title: o.title || (o.icon && !o.label ? o.ariaLabel || String(o.value) : null),
          "aria-label": o.icon && !o.label ? (o.ariaLabel || o.title || String(o.value)) : null,
        }, [o.icon ? icon(o.icon) : null, o.label ? el("span", { text: o.label }) : null]);
        b.addEventListener("click", () => { set(o.value); if (onChange) onChange(o.value); });
        root.appendChild(b);
        return b;
      });
      // Arrow keys move the selection, as a radiogroup should.
      root.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const i = btns.findIndex((b) => b.getAttribute("aria-checked") === "true");
        const n = btns[(i + (e.key === "ArrowRight" ? 1 : btns.length - 1)) % btns.length];
        e.preventDefault(); n.focus(); n.click();
      });
      // The thumb follows the selected option. It can only be measured once the
      // control is laid out, so a ResizeObserver places it (without animating) the
      // first time and keeps it aligned when the control reflows.
      let placed = false;
      function moveThumb() {
        const on = btns.find((b) => b.getAttribute("aria-checked") === "true");
        if (!on || !on.offsetWidth) { root.classList.remove("bc-seg--live"); return; }
        if (!placed) thumb.style.transition = "none";
        thumb.style.width = on.offsetWidth + "px";
        thumb.style.transform = "translateX(" + on.offsetLeft + "px)";
        root.classList.add("bc-seg--live");
        if (!placed) { void thumb.offsetWidth; thumb.style.transition = ""; placed = true; }
      }
      if (typeof ResizeObserver === "function") new ResizeObserver(() => { placed = false; moveThumb(); }).observe(root);
      function set(v) {
        for (const b of btns) {
          const on = b.dataset.value === String(v);
          b.setAttribute("aria-checked", on ? "true" : "false");
          b.tabIndex = on ? 0 : -1;
        }
        moveThumb();
      }
      set(value);
      if (!btns.some((b) => b.tabIndex === 0) && btns[0]) btns[0].tabIndex = 0;
      return { root, set };
    },

    // role="switch" button. Returns { root, set(checked) }.
    toggle({ checked, ariaLabel, onChange } = {}) {
      ensure();
      const b = el("button", { class: "bc-switch", type: "button", role: "switch", "aria-label": ariaLabel || "" });
      const set = (v) => b.setAttribute("aria-checked", v ? "true" : "false");
      b.addEventListener("click", () => {
        const v = b.getAttribute("aria-checked") !== "true";
        set(v);
        if (onChange) onChange(v);
      });
      set(!!checked);
      return { root: b, set };
    },

    checkbox({ checked, label, ariaLabel, onChange } = {}) {
      ensure();
      const input = el("input", { type: "checkbox", "aria-label": label ? null : ariaLabel || null });
      input.checked = !!checked;
      if (onChange) input.addEventListener("change", () => onChange(input.checked));
      const root = el("label", { class: "bc-check" }, [input, label ? el("span", { text: label }) : null]);
      root.input = input;
      return root;
    },

    chip(text, { onRemove, removeLabel } = {}) {
      ensure();
      const c = el("span", { class: "bc-chip" }, [el("span", { text: String(text) })]);
      if (onRemove) {
        c.appendChild(el("button", { class: "bc-chip__x", type: "button", "aria-label": removeLabel || ("Remove " + text), onclick: onRemove }, [icon("x")]));
      }
      return c;
    },

    // items: [{ label, icon, onClick, danger, checked, kind } | { separator: true } | { heading }]
    // `checked` makes an item a radio; kind: "checkbox" makes it an on/off toggle.
    menu(anchor, items, opts) {
      const list = el("div", { class: "bc-menu", role: "menu" });
      for (const it of items || []) {
        if (it.separator) { list.appendChild(el("div", { class: "bc-menu__sep", role: "separator" })); continue; }
        if (it.heading) { list.appendChild(el("div", { class: "bc-menu__label", text: it.heading })); continue; }
        const b = el("button", {
          class: "bc-menu__item" + (it.danger ? " bc-menu__item--danger" : ""), type: "button",
          role: it.checked != null ? (it.kind === "checkbox" ? "menuitemcheckbox" : "menuitemradio") : "menuitem",
          "aria-checked": it.checked != null ? (it.checked ? "true" : "false") : null,
        }, [it.dot && /^#[0-9a-f]{6}$/i.test(it.dot) ? el("span", { class: "bc-menu__dot", style: "background:" + it.dot }) : it.icon ? icon(it.icon) : null,
            el("span", { class: "bc-truncate", text: it.label })]);
        // Focus goes back to the menu button first, so a dialog the item opens
        // returns there instead of to a menu item that's about to go.
        b.addEventListener("click", () => { closePop(); BC.util.guard(() => anchor.focus({ preventScroll: true }), "menu focus"); if (it.onClick) BC.util.guard(it.onClick, "menu item"); });
        list.appendChild(b);
      }
      list.addEventListener("keydown", (e) => {
        const items2 = [...list.querySelectorAll(".bc-menu__item")];
        const i = items2.indexOf(e.target);
        if (e.key === "ArrowDown") { e.preventDefault(); (items2[i + 1] || items2[0]).focus(); }
        if (e.key === "ArrowUp") { e.preventDefault(); (items2[i - 1] || items2[items2.length - 1]).focus(); }
      });
      const p = popover(anchor, list, Object.assign({ role: "presentation" }, opts));
      const first = list.querySelector(".bc-menu__item");
      if (first && (!opts || opts.focus !== false)) first.focus();
      return p;
    },

    popover,

    skeleton(rows = 3) {
      ensure();
      const widths = [92, 68, 80, 55, 74];
      const bars = [];
      for (let i = 0; i < rows; i++) bars.push(el("div", { class: "bc-sk-bar", style: "width:" + widths[i % widths.length] + "%" }));
      return el("div", { class: "bc-sk", role: "status", "aria-label": "Loading" }, bars);
    },

    empty(message, hint, { icon: ic } = {}) {
      ensure();
      return el("div", { class: "bc-empty" }, [
        ic ? icon(ic) : null,
        el("div", { text: message || "Nothing here yet." }),
        hint ? el("div", { class: "bc-empty-hint", text: hint }) : null,
      ]);
    },

    errorState(message, onRetry) {
      ensure();
      return el("div", { class: "bc-error", role: "alert" }, [
        icon("alert"),
        el("span", { class: "bc-error-msg", text: message || "Something went wrong." }),
        onRetry ? BC.ui.button("Retry", { size: "sm", onClick: onRetry }) : null,
      ]);
    },

    visuallyHidden(text) { return el("span", { class: "bc-sr-only", text: text || "" }); },

    // Honours BOTH the in-app reduced-motion switch and the OS setting. CSS can't
    // reach JS-driven animation (scrollIntoView, rAF sequences), so those gate here.
    motion: {
      reduced() {
        if (document.documentElement.getAttribute("data-bc-motion") === "0") return true;
        return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      },
    },

    // Two singletons: one host cannot serve both politeness levels.
    liveRegion(politeness) {
      const assertive = politeness === "assertive";
      const id = assertive ? "bc-live-assertive" : "bc-live-polite";
      let node = document.querySelector('[data-bc-node="' + id + '"]');
      if (!node) {
        ensure();
        node = el("div", {
          class: "bc-sr-only", role: assertive ? "alert" : "status",
          "aria-live": assertive ? "assertive" : "polite", "aria-atomic": "true",
        });
        node.setAttribute("data-bc-node", id);
        (document.body || document.documentElement).appendChild(node);
      }
      return {
        announce(text) {
          // Clear first, or an identical string is not re-announced.
          node.textContent = "";
          setTimeout(() => { node.textContent = String(text == null ? "" : text); }, 30);
        },
      };
    },

    badge(text, { tone, label } = {}) {
      ensure();
      const s = el("span", { class: "bc-badge2" + (tone ? " bc-badge2--" + tone : ""), text: String(text) });
      if (label) s.setAttribute("aria-label", label);
      return s;
    },

    stat({ label, value, sub, tone } = {}) {
      ensure();
      return el("div", { class: "bc-stat" }, [
        el("div", { class: "bc-eyebrow", text: label || "" }),
        el("div", { class: "bc-stat-value" + (tone ? " bc-t-" + tone : ""), text: String(value == null ? "—" : value) }),
        sub ? el("div", { class: "bc-stat-sub", text: sub }) : null,
      ]);
    },

    // set() transitions ONLY when the value actually changed, so a bar inside a
    // feature that re-applies several times a second stops re-animating every tick.
    progress({ value = 0, max = 100, label, tone } = {}) {
      ensure();
      const fill = el("div", { class: "bc-progress2-fill" + (tone ? " bc-bg-" + tone : "") });
      const root = el("div", {
        class: "bc-progress2", role: "progressbar",
        "aria-valuemin": "0", "aria-valuemax": String(max), "aria-label": label || "Progress",
      }, [fill]);
      let current = null;
      function set(v) {
        const pct = Math.max(0, Math.min(100, max ? (Number(v) / max) * 100 : 0));
        if (current !== null && Math.abs(current - pct) < 0.01) return;
        current = pct;
        root.setAttribute("aria-valuenow", String(Math.round(Number(v) || 0)));
        fill.style.width = pct.toFixed(1) + "%";
      }
      set(value);
      return { root, set };
    },

    // Circular progress. Returns an <svg> string-built element.
    ring(pct, { size = 36, stroke = 4, label } = {}) {
      const p = Math.max(0, Math.min(100, Number(pct) || 0));
      const r = (size - stroke) / 2, c = 2 * Math.PI * r;
      const wrap = el("span", { class: "bc-spark" });
      wrap.innerHTML = '<svg class="bc-ring" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size +
        '" role="img" aria-label="' + BC.util.escapeHtml(label || (Math.round(p) + "% complete")) + '">' +
        '<circle class="bc-ring__track" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke-width="' + stroke + '"/>' +
        '<circle class="bc-ring__value" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke-width="' + stroke +
        '" stroke-linecap="round" stroke-dasharray="' + c.toFixed(2) + '" stroke-dashoffset="' + (c - (p / 100) * c).toFixed(2) +
        '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/></svg>';
      return wrap;
    },

    // The one implementation of sparkline point math.
    sparkline(values, { width = 120, height = 28, pad = 3, tone = "auto", label } = {}) {
      ensure();
      const v = (values || []).map(Number).filter((n) => isFinite(n));
      if (v.length < 2) return null;
      const min = Math.min(...v), max = Math.max(...v);
      const span = Math.max(0.001, max - min);
      const pts = v.map((s, i) =>
        ((i / (v.length - 1)) * (width - pad * 2) + pad).toFixed(1) + "," +
        (height - pad - ((s - min) / span) * (height - pad * 2)).toFixed(1)).join(" ");
      const delta = v[v.length - 1] - v[0];
      const stroke = tone === "auto"
        ? (delta >= 0 ? "var(--bc-success)" : "var(--bc-danger)")
        : "var(--bc-accent-stroke, var(--bc-accent))";
      const wrap = el("span", { class: "bc-spark" });
      wrap.innerHTML = '<svg width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height +
        '" role="img" aria-label="' + BC.util.escapeHtml(label || ("Trend, " + (delta >= 0 ? "up " : "down ") + Math.abs(delta).toFixed(1))) +
        '"><polyline points="' + pts + '" fill="none" stroke="' + stroke + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>';
      return wrap;
    },

    // container may be a ShadowRoot. From outside a shadow root
    // document.activeElement reports the HOST, not the focused control, so a naive
    // trap on the drawer never matches and lets focus escape immediately.
    focusTrap(container, { initial, returnTo } = {}) {
      const SEL = 'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),' +
                  'textarea:not(:disabled),[tabindex]:not([tabindex="-1"]),summary,' +
                  '[contenteditable=""],[contenteditable="true"]';
      const activeIn = () => container.activeElement || document.activeElement;
      const tabbables = () => Array.from(container.querySelectorAll(SEL))
        .filter((e) => !e.hasAttribute("inert") && e.getClientRects().length > 0);
      let previous = returnTo ||
        (document.activeElement && document.activeElement !== document.body ? document.activeElement : null);
      // An opener inside a shadow root shows up as its host, which can't take focus.
      while (previous && previous.shadowRoot && previous.shadowRoot.activeElement) previous = previous.shadowRoot.activeElement;

      function onKey(e) {
        if (e.key !== "Tab") return;
        const list = tabbables();
        if (!list.length) return;
        const first = list[0], last = list[list.length - 1];
        const cur = activeIn();
        if (e.shiftKey && (cur === first || list.indexOf(cur) === -1)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
      }
      container.addEventListener("keydown", onKey, true);
      const target = initial || tabbables()[0];
      if (target) BC.util.guard(() => target.focus(), "focusTrap initial");
      return {
        release() {
          container.removeEventListener("keydown", onKey, true);
          if (previous && previous.isConnected) BC.util.guard(() => previous.focus(), "focusTrap restore");
        },
      };
    },

    // Modal dialog: scrim, focus trap, Escape, focus restoration. Mounted in its own
    // shadow root so Canvas's CSS can't restyle it.
    dialog({ title, body, actions, dismissible = true, onClose, nodeId = "bc-dialog" } = {}) {
      const titleId = "bc-dlg-t-" + Math.random().toString(36).slice(2, 8);
      const head = el("h2", { class: "bc-dialog-title", id: titleId, text: title || "" });
      const bodyEl = el("div", { class: "bc-dialog-body" }, body ? [].concat(body) : []);
      const foot = el("div", { class: "bc-dialog-foot" }, actions || []);
      const panel = el("div", {
        class: "bc-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": title ? titleId : null,
      }, title ? [head, bodyEl, foot] : [bodyEl, foot]);
      const scrim = el("div", { class: "bc-scrim" }, [panel]);

      let mounted = null, trap = null;
      function close() {
        if (trap) { trap.release(); trap = null; }
        if (mounted) { leave(scrim, mounted.host); mounted = null; }
        if (onClose) BC.util.guard(onClose, "dialog onClose");
      }
      scrim.addEventListener("mousedown", (e) => { if (dismissible && e.target === scrim) close(); });
      scrim.addEventListener("keydown", (e) => { if (dismissible && e.key === "Escape") { e.stopPropagation(); close(); } });

      return {
        root: scrim, panel, body: bodyEl, foot,
        open() {
          mounted = BC.ui.mount(nodeId);
          mounted.body.replaceChildren(scrim);
          trap = BC.ui.focusTrap(mounted.root);
          return scrim;
        },
        close,
        setBody(node) { bodyEl.replaceChildren(node); },
      };
    },

    // Right-side sheet over a scrim (task details, expanded views).
    sheet({ title, body, actions, width, onClose, nodeId = "bc-sheet" } = {}) {
      const closeBtn = BC.ui.iconButton("x", { label: "Close" });
      const head = el("div", { class: "bc-sheet__head" }, [el("h2", { class: "bc-sheet__title", text: title || "" }), closeBtn]);
      const bodyEl = el("div", { class: "bc-sheet__body" }, body ? [].concat(body) : []);
      const foot = actions && actions.length ? el("div", { class: "bc-sheet__foot" }, actions) : null;
      const panel = el("div", { class: "bc-sheet", role: "dialog", "aria-modal": "true", "aria-label": title || "Details" }, [head, bodyEl, foot]);
      if (width) panel.style.width = "min(" + width + "px, 100vw)";
      const scrim = el("div", { class: "bc-scrim bc-scrim--sheet" }, [panel]);
      let mounted = null, trap = null;
      function close() {
        if (trap) { trap.release(); trap = null; }
        if (mounted) { leave(scrim, mounted.host); mounted = null; }
        if (onClose) BC.util.guard(onClose, "sheet onClose");
      }
      closeBtn.addEventListener("click", close);
      scrim.addEventListener("mousedown", (e) => { if (e.target === scrim) close(); });
      scrim.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } });
      return {
        root: scrim, panel, body: bodyEl,
        open() {
          mounted = BC.ui.mount(nodeId);
          mounted.body.replaceChildren(scrim);
          trap = BC.ui.focusTrap(mounted.root);
          return scrim;
        },
        close,
      };
    },

    // items: [{ id, label, render(container) }] — roving-tabindex tablist.
    tabs(items, { initial } = {}) {
      ensure();
      const list = el("div", { role: "tablist" });
      const view = el("div", { class: "bc-tabview", role: "tabpanel" });
      const root = el("div", { class: "bc-tabs" }, [list, view]);
      const btns = new Map();
      let current = null;

      function select(id, focus) {
        if (current === id) return;
        current = id;
        for (const [tid, b] of btns) {
          const on = tid === id;
          b.setAttribute("aria-selected", on ? "true" : "false");
          b.tabIndex = on ? 0 : -1;
          if (on && focus) b.focus();
        }
        view.innerHTML = "";
        const item = items.find((i) => i.id === id);
        if (item) item.render(view);
      }

      items.forEach((item) => {
        const b = el("button", { role: "tab", type: "button", text: item.label, "aria-selected": "false" });
        b.tabIndex = -1;
        b.addEventListener("click", () => select(item.id));
        btns.set(item.id, b);
        list.appendChild(b);
      });
      list.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const ids = items.map((i) => i.id);
        const idx = ids.indexOf(current);
        const next = ids[(idx + (e.key === "ArrowRight" ? 1 : ids.length - 1)) % ids.length];
        select(next, true);
        e.preventDefault();
      });

      select(initial || (items[0] && items[0].id));
      return { root, select };
    },
  };

  // Registered so teardown removes the shared sheet with everything else. Guarded
  // because the kit is also loaded in documents that have no registry.
  if (BC.registry) {
    BC.registry.register({
      id: "ui", styles: ["bc-ui"], nodes: ["bc-dialog", "bc-sheet", "bc-pop-layer"],
      apply() {
        // Re-assert only if a teardown actually removed the sheet, rather than
        // calling setStyle on every tick.
        if (injected && !document.querySelector('style[data-better-canvas="bc-ui"]')) injected = false;
        ensure();
      },
      unmount() { closePop(); },
    });
  }
})();
