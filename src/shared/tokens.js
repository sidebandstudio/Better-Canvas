/*
 * Better Canvas — the single design-token emitter.
 *
 * This lives in shared/ because three separate documents need byte-identical
 * tokens: the Canvas page (via theming.js), the settings drawer's shadow root
 * and the standalone options page. Only theming.js is a
 * content script, so the emitter cannot live there. Before this existed there
 * were four disconnected colour systems and three of them never saw the user's
 * theme at all.
 *
 * Pure: no DOM, no storage. Depends only on BC.color, BC.DARK_TONES and
 * BC.LIGHT_PRESETS.
 *
 * Design direction is "clean & minimal": neutral (zinc-like) surfaces, thin quiet
 * borders, one accent, a strict 4px spacing scale and tabular figures. Panels at
 * rest get a border and NO shadow; elevation is reserved for things that float.
 */
(function () {
  "use strict";
  const BC = (globalThis.BC = globalThis.BC || {});
  if (BC.tokens) return;

  // Text contrast floor (WCAG AA). Non-text (rings, bars, chart strokes) uses 3:1
  // per WCAG 1.4.11.
  const AA_TEXT = 4.5;
  const AA_NONTEXT = 3.0;

  // Used when a custom background makes settings text unreadable no matter how far
  // we push the foreground — e.g. darkBg #e8e8e8 yields ~1.05:1, reachable in two
  // clicks today.
  const SAFE_NEUTRAL = {
    light: { bg: "#fafafa", bg2: "#ffffff", bg3: "#f4f4f5", border: "#e4e4e7", text: "#18181b", muted: "#6b6b74" },
    dark:  { bg: "#111113", bg2: "#1b1b1e", bg3: "#26262a", border: "#2f2f34", text: "#f4f4f5", muted: "#a1a1aa" },
  };

  // Semantic fills. These differ from the values previously hardcoded around the
  // codebase because those failed AA: white on #ca8a04 is 2.6:1 and on #65a30d is
  // 2.9:1. Every light fill below clears 4.5:1 against white.
  const SEMANTIC = {
    light: {
      success: "#047857", "success-fg": "#ffffff", "success-bg": "#ecfdf5",
      warn:    "#a16207", "warn-fg":    "#ffffff", "warn-bg":    "#fffbeb",
      danger:  "#b91c1c", "danger-fg":  "#ffffff", "danger-bg":  "#fef2f2",
      info:    "#0369a1", "info-fg":    "#ffffff", "info-bg":    "#eff6ff",
    },
    dark: {
      success: "#34d399", "success-fg": "#05261c", "success-bg": "rgba(52,211,153,.14)",
      warn:    "#fbbf24", "warn-fg":    "#2b1f02", "warn-bg":    "rgba(251,191,36,.14)",
      danger:  "#f87171", "danger-fg":  "#2a0b0b", "danger-bg":  "rgba(248,113,113,.14)",
      info:    "#60a5fa", "info-fg":    "#0a1a2e", "info-bg":    "rgba(96,165,250,.14)",
    },
  };

  // Grade bands are categorical, not semantic — a C is not a "warning".
  const GRADE = {
    light: { a: "#047857", b: "#4d7c0f", c: "#a16207", d: "#c2410c", f: "#b91c1c" },
    dark:  { a: "#34d399", b: "#a3e635", c: "#fbbf24", d: "#fb923c", f: "#f87171" },
  };

  // Categorical chart ramp (weight donut, etc). Same hue order in both modes so a
  // legend stays stable across a mode switch.
  const CAT = {
    light: ["#4f46e5", "#0891b2", "#059669", "#a16207", "#c2410c", "#be185d", "#7c3aed", "#4d7c0f"],
    dark:  ["#8b85f0", "#3fc0dd", "#34d399", "#e0a82e", "#f97b4a", "#ec4899", "#a78bfa", "#a3e635"],
  };

  // Deliberately NOT theme-derived: sticky notes keep their paper metaphor. They
  // do need a dark variant though — they were a glaring white rectangle before.
  const NOTE = {
    light: { bg: "#fffbe6", border: "#f6d67a", text: "#1f1a05" },
    dark:  { bg: "#3a3421", border: "#5a4f2c", text: "#f0e6c8" },
  };

  // 1 = resting lift (segmented thumb, switch knob), 2 = menus and popovers,
  // 3 = dialogs and sheets, 4 = the settings panel against the page.
  const SHADOW = {
    light: {
      1: "0 1px 2px rgba(24,24,27,.08)",
      2: "0 4px 12px rgba(24,24,27,.08), 0 1px 3px rgba(24,24,27,.06)",
      3: "0 12px 32px rgba(24,24,27,.12), 0 2px 8px rgba(24,24,27,.06)",
      4: "0 0 0 1px rgba(24,24,27,.04), -12px 0 40px rgba(24,24,27,.10)",
    },
    dark: {
      1: "0 1px 2px rgba(0,0,0,.5)",
      2: "0 4px 16px rgba(0,0,0,.5), 0 1px 3px rgba(0,0,0,.4)",
      3: "0 16px 40px rgba(0,0,0,.6), 0 2px 8px rgba(0,0,0,.4)",
      4: "0 0 0 1px rgba(255,255,255,.04), -12px 0 48px rgba(0,0,0,.5)",
    },
  };

  // Resolve one mode's colour tokens, applying the readability guard.
  function resolveMode(pal, mode) {
    const C = BC.color;
    const guard = { textCorrected: false, surfaceFallback: false };

    const S1 = pal.bg, S2 = pal.bg2, S3 = pal.bg3, border = pal.border;

    // Guard against EVERY surface the ink can land on, not just one. Body text
    // appears on the page background and inside panels; muted text appears on
    // panels and on cards. Guarding a single pairing leaves the others short (pure
    // mid-grey custom backgrounds landed at 4.1-4.3:1 that way). Each pass only
    // pushes further toward an endpoint and returns early once it passes, so for
    // every shipped theme — which already clears AA — this is a no-op.
    const guardOn = (fg, min, surfaces) => {
      let out = fg;
      for (const s of surfaces) out = C.ensureContrast(out, s, min);
      return out;
    };

    // Text guard.
    const text = guardOn(pal.text, AA_TEXT, [S2, S1, S3]);
    if (text !== pal.text) guard.textCorrected = true;

    // A custom "dark" background light enough that legible text has to be DARK has
    // defeated dark mode. Text stays readable either way, but the settings panel
    // would then be a near-white sheet while every other dark-mode surface expects
    // the opposite — so the settings surfaces (only) fall back to a neutral set and
    // the Appearance tab says why. Canvas pages keep the user's choice: they picked
    // it, and we don't own their reading of Canvas content.
    //
    // Note there is deliberately no "neither endpoint reaches AA" branch: white
    // clears 4.5:1 up to background luminance 0.183 and black from 0.175, so the
    // ranges overlap and every possible surface has a passing endpoint. Such a
    // branch would be unreachable.
    if (mode === "dark" && C.relLuminance(text) < 0.5) guard.surfaceFallback = true;

    // Guard muted, then keep it distinguishable from body text — and re-guard,
    // because the distinctness mix would otherwise throw away the contrast we just
    // established (it dropped muted to ~2.6:1 on light custom backgrounds).
    let muted = guardOn(pal.muted, AA_TEXT, [S3, S2, S1]);
    if (C.contrastRatio(muted, text) < 1.3) muted = guardOn(C.mix(text, S2, 0.35), AA_TEXT, [S3, S2, S1]);
    const textSubtle = guardOn(C.mix(muted, S2, 0.28), AA_TEXT, [S3, S2]);

    // Accent family. The accent FILL is never altered — the user picked it. What
    // gets derived is everything that has to be legible against or on top of it.
    const accent = pal.accent;
    // Bounded by the accent itself: a mid-luminance accent can cap text-on-accent
    // below 4.5:1 no matter what, and the fix would be to change the fill — which
    // we've committed not to do. contrastText picks the better endpoint and
    // ensureContrast can only improve on it, so this is always the best achievable.
    const accentContrast = C.ensureContrast(C.contrastText(accent), accent, AA_TEXT);
    // Links sit on all three surfaces, like body text.
    const accentText = guardOn(accent, AA_TEXT, [S2, S1, S3]);
    const accentStroke = C.ensureContrast(accent, S2, AA_NONTEXT);
    const dark = mode === "dark";

    const t = {
      "surface-1": S1,
      "surface-2": S2,
      "surface-3": S3,
      "surface-4": dark ? "rgba(255,255,255,.055)" : "rgba(16,24,40,.045)",
      "surface-inverse": dark ? "#f2f4f7" : "#1f2937",
      "text-inverse": dark ? "#16181d" : "#ffffff",
      "overlay": dark ? "rgba(0,0,0,.62)" : "rgba(15,20,28,.44)",

      // Interaction states for anything sitting on a panel.
      "surface-hover": dark ? C.lighten(S2, 0.06) : C.darken(S2, 0.04),
      "surface-pressed": dark ? C.lighten(S2, 0.1) : C.darken(S2, 0.075),

      border: border,
      "border-subtle": C.mix(border, S2, 0.5),
      // A hover/selected step up from `border`; still quiet.
      "border-strong": C.mix(border, text, 0.2),
      // Non-text UI that must be perceivable on its own (checkbox outline, the
      // unchecked switch track): 3:1 per WCAG 1.4.11.
      "border-contrast": C.ensureContrast(border, S2, AA_NONTEXT),

      text: text,
      muted: muted,
      "text-subtle": textSubtle,
      link: accentText,

      accent: accent,
      "accent-contrast": accentContrast,
      "accent-text": accentText,
      "accent-stroke": accentStroke,
      "accent-hover": dark ? C.lighten(accent, 0.1) : C.darken(accent, 0.08),
      "accent-weak": C.withAlpha(accent, 0.12),
      "accent-border": C.withAlpha(accent, 0.45),
      "focus-ring": accentStroke,
      "focus-halo": S2,

      "note-bg": NOTE[mode].bg,
      "note-border": NOTE[mode].border,
      "note-text": NOTE[mode].text,
      "pattern-ink": dark ? "rgba(255,255,255,.07)" : "rgba(0,0,0,.06)",
      "ruler-tint": dark ? "rgba(255,235,59,.10)" : "rgba(255,235,59,.16)",
    };

    for (const [k, v] of Object.entries(SEMANTIC[mode])) t[k] = v;
    t["danger-border"] = C.withAlpha(SEMANTIC[mode].danger, 0.45);
    for (const [k, v] of Object.entries(GRADE[mode])) {
      t["grade-" + k] = v;
      t["grade-" + k + "-fg"] = C.ensureContrast(C.contrastText(v), v, AA_TEXT);
    }
    CAT[mode].forEach((c, i) => { t["cat-" + (i + 1)] = c; });
    for (const [k, v] of Object.entries(SHADOW[mode])) t["shadow-" + k] = v;

    return { tokens: t, guard };
  }

  function decls(t, indent) {
    const pad = indent || "  ";
    return Object.keys(t).map((k) => pad + "--bc-" + k + ": " + t[k] + ";").join("\n");
  }

  // The settings-surface override: the neutral set, scoped to `sel`.
  function emitSafe(sel, s) {
    return sel + " {\n" +
      "  --bc-surface-1: " + s.bg + "; --bc-surface-2: " + s.bg2 + "; --bc-surface-3: " + s.bg3 + ";\n" +
      "  --bc-border: " + s.border + "; --bc-text: " + s.text + "; --bc-muted: " + s.muted + ";\n" +
      "  --bc-text-subtle: " + s.muted + ";\n}";
  }

  // Back-compat aliases. Older feature CSS (and any user custom CSS) still
  // references these; they resolve per-mode via the canonical names.
  const ALIASES = `
  --bc-d-bg: var(--bc-surface-1); --bc-d-bg2: var(--bc-surface-2);
  --bc-d-bg3: var(--bc-surface-3); --bc-d-border: var(--bc-border);
  --bc-d-text: var(--bc-text); --bc-d-muted: var(--bc-muted);
  --bc-d-link: var(--bc-link);`;

  BC.tokens = {
    resolve(theming) {
      const pals = BC.color.themePalettes(theming || {});
      const light = resolveMode(pals.light, "light");
      const dark = resolveMode(pals.dark, "dark");
      return {
        light: light.tokens,
        dark: dark.tokens,
        guard: {
          light: light.guard,
          dark: dark.guard,
          // True when EITHER mode had to fall back, since the settings surfaces
          // need one consistent answer.
          surfaceFallback: light.guard.surfaceFallback || dark.guard.surfaceFallback,
        },
      };
    },

    // scope: selector for the light/base block (default ":root").
    // mode: "both" (default) | "light" | "dark" — the options page renders a
    // single mode, the Canvas page needs both.
    css(theming, opts) {
      const o = opts || {};
      const scope = o.scope || ":root";
      const r = BC.tokens.resolve(theming);
      const out = [];
      if (o.mode === "dark") {
        out.push(scope + " {\n" + decls(r.dark) + ALIASES + "\n}");
      } else {
        out.push(scope + " {\n" + decls(r.light) + ALIASES + "\n}");
        if (o.mode !== "light") out.push("html.bc-dark {\n" + decls(r.dark) + "\n}");
      }
      // Settings surfaces only. Canvas pages keep whatever theme the user chose —
      // they picked it, and we don't own their reading of Canvas content — but the
      // settings panel must stay operable, so it gets the safe neutral set and an
      // honest notice (rendered by the Appearance tab).
      if (r.guard.surfaceFallback) {
        out.push(emitSafe(".bc-app", SAFE_NEUTRAL.light));
        out.push(emitSafe("html.bc-dark .bc-app, .bc-app.bc-dark", SAFE_NEUTRAL.dark));
      }
      return out.join("\n");
    },

    // The same override on its own, for a document css() can't reach: rules
    // emitted on the Canvas page never match .bc-app inside the settings drawer's
    // shadow root. "" when no fallback is needed.
    fallbackCss(theming, dark) {
      if (!BC.tokens.resolve(theming).guard.surfaceFallback) return "";
      return emitSafe(".bc-app", SAFE_NEUTRAL[dark ? "dark" : "light"]);
    },

    // Mode-independent scales. Written once and never rebuilt.
    staticCss() {
      return `
:root {
  /* spacing: one strict 4px scale. Density multiplies it (data-bc-density). */
  --bc-space-scale: 1;
  --bc-space-unit: calc(4px * var(--bc-space-scale, 1));
  --bc-space-1: calc(4px * var(--bc-space-scale, 1));
  --bc-space-2: calc(8px * var(--bc-space-scale, 1));
  --bc-space-3: calc(12px * var(--bc-space-scale, 1));
  --bc-space-4: calc(16px * var(--bc-space-scale, 1));
  --bc-space-5: calc(20px * var(--bc-space-scale, 1));
  --bc-space-6: calc(24px * var(--bc-space-scale, 1));
  --bc-space-7: calc(32px * var(--bc-space-scale, 1));
  --bc-space-8: calc(40px * var(--bc-space-scale, 1));
  --bc-space-9: calc(48px * var(--bc-space-scale, 1));

  /* controls share one height so rows of mixed controls line up */
  --bc-control-h: 32px;
  --bc-control-h-sm: 28px;
  --bc-control-h-lg: 36px;

  /* radius, derived from the user's slider (default 8px) */
  --bc-radius: 8px;
  --bc-radius-sm: calc(var(--bc-radius) * 0.75);
  --bc-radius-md: var(--bc-radius);
  --bc-radius-lg: calc(var(--bc-radius) * 1.5);
  --bc-radius-xl: calc(var(--bc-radius) * 2);
  --bc-radius-pill: 999px;
  --bc-radius-circle: 50%;

  /* type */
  --bc-font-sans: "Inter var", Inter, system-ui, -apple-system, "Segoe UI Variable Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --bc-font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  --bc-font-scale: 1;
  --bc-text-3xs: calc(11px * var(--bc-font-scale));
  --bc-text-2xs: calc(11px * var(--bc-font-scale));
  --bc-text-xs:  calc(12px * var(--bc-font-scale));
  --bc-text-sm:  calc(13px * var(--bc-font-scale));
  --bc-text-md:  calc(14px * var(--bc-font-scale));
  --bc-text-lg:  calc(16px * var(--bc-font-scale));
  --bc-text-xl:  calc(20px * var(--bc-font-scale));
  --bc-text-2xl: calc(24px * var(--bc-font-scale));
  --bc-text-figure: calc(28px * var(--bc-font-scale));
  --bc-line-height: 1.5;
  --bc-leading-tight: 1.25;
  --bc-leading-snug: 1.4;
  --bc-leading-body: var(--bc-line-height);
  --bc-letter-spacing: 0px;
  --bc-tracking: var(--bc-letter-spacing);
  --bc-tracking-caps: 0.04em;
  --bc-weight-regular: 400;
  --bc-weight-medium: 500;
  --bc-weight-semibold: 600;
  --bc-weight-bold: 700;

  /* motion — dividing by the speed slider means 2x really is twice as fast */
  --bc-anim-speed: 1;
  --bc-dur-1: calc(90ms / var(--bc-anim-speed, 1));
  --bc-dur-2: calc(150ms / var(--bc-anim-speed, 1));
  --bc-dur-3: calc(220ms / var(--bc-anim-speed, 1));
  --bc-dur-4: calc(300ms / var(--bc-anim-speed, 1));
  --bc-ease-standard: cubic-bezier(.2,0,.2,1);
  --bc-ease-out: cubic-bezier(.05,.7,.1,1);
  --bc-ease-in: cubic-bezier(.3,0,.8,.15);
  --bc-ease-spring: cubic-bezier(.22,.61,.36,1);

  /* z-index scale (dock < notes < hud < popover < drawer < modal < palette < toast) */
  --bc-z-base: 1;
  --bc-z-raised: 10;
  --bc-z-sticky: 100;
  --bc-z-dock: 2147480000;
  --bc-z-underlay: 2147480500;
  --bc-z-hud: 2147481000;
  --bc-z-popover: 2147481500;
  --bc-z-drawer: 2147482000;
  --bc-z-modal: 2147482500;
  --bc-z-palette: 2147483000;
  --bc-z-toast: 2147483200;
}

:root[data-bc-density="compact"]  { --bc-space-scale: 0.85; }
:root[data-bc-density="spacious"] { --bc-space-scale: 1.15; }
:root[data-bc-density="cozy"]     { --bc-space-scale: 1.3; }

/* "Rounded UI off" squares our own components too, not just Canvas's. */
:root[data-bc-rounded="0"] { --bc-radius: 0px; }

:root[data-bc-motion="0"] {
  --bc-dur-1: 0.01ms; --bc-dur-2: 0.01ms; --bc-dur-3: 0.01ms; --bc-dur-4: 0.01ms;
}
@media (prefers-reduced-motion: reduce) {
  :root {
    --bc-dur-1: 0.01ms; --bc-dur-2: 0.01ms; --bc-dur-3: 0.01ms; --bc-dur-4: 0.01ms;
  }
}`;
    },

    // The Cursor setting as a CSS cursor value, drawn in the user's colour with a
    // black or white edge, whichever stands out. "" keeps the system pointer.
    cursor(theming) {
      const t = theming || {};
      const shape = t.cursor === "large" ? "arrow" : ["arrow", "dot", "ring", "precise"].includes(t.cursor) ? t.cursor : "default";
      if (shape === "default") return { shape, css: "" };
      const size = Math.round(Math.min(48, Math.max(16, Number(t.cursorSize) || 32)));
      const fill = BC.color.normalizeHex(t.cursorColor) || "#000000";
      const edge = BC.color.contrastText(fill) === "#ffffff" ? "#ffffff" : "#000000";
      const cross = "M16 2v10M16 20v10M2 16h10M20 16h10";
      const art = {
        arrow: `<polygon points='2,2 2,29 9,22 13,30 17,28 13,20 22,20' fill='${fill}' stroke='${edge}' stroke-width='2' stroke-linejoin='round'/>`,
        dot: `<circle cx='16' cy='16' r='8' fill='${fill}' stroke='${edge}' stroke-width='2'/>`,
        ring: `<circle cx='16' cy='16' r='10' fill='none' stroke='${edge}' stroke-width='6'/><circle cx='16' cy='16' r='10' fill='none' stroke='${fill}' stroke-width='3'/>`,
        precise: `<path d='${cross}' stroke='${edge}' stroke-width='5' stroke-linecap='round'/><path d='${cross}' stroke='${fill}' stroke-width='2.5' stroke-linecap='round'/>`,
      }[shape];
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 32 32'>${art}</svg>`;
      const hot = shape === "arrow" ? Math.round(size / 16) : Math.round(size / 2);
      const src = "data:image/svg+xml," + encodeURIComponent(svg);
      return { shape, src, css: `url("${src}") ${hot} ${hot}, ${shape === "precise" ? "crosshair" : "auto"}` };
    },

    // Memo key so theming.js can skip rebuilding a multi-KB string on every tick.
    signature(theming) {
      const t = theming || {};
      return [
        t.darkMode, t.darkTone, t.darkBg, t.lightBg, t.lightPreset, t.accentColor, t.experience,
        t.font, t.fontSizeScale, t.lineHeight, t.letterSpacing, t.density,
        t.radius, t.roundedUI, t.cursor, t.focusRing, t.colorBlind,
        t.highContrast, t.reducedMotion, t.animSpeed, t.sidebarWidth,
        t.logo && t.logo.mode, t.logo && t.logo.url, t.logo && t.logo.text,
      ].join("\u0001");
    },

    // theming.js interpolates the user's font stack into a declaration, and
    // cssSafe only strips <>, so `Inter; } html{display:none} .x {` would escape
    // it. Allow only what can appear in a real font-family value. Each name must
    // also close its quotes. A stray quote opened a CSS string that swallowed the
    // rest of the sheet. Letters from any script are fine, so names like
    // "微软雅黑" or "맑은 고딕" work.
    safeFontStack(s) {
      const v = String(s == null ? "" : s).trim().slice(0, 200);
      const name = /^\s*(?:"[^"]*"|'[^']*'|[\p{L}\p{M}\p{N}_\s-]+)\s*$/u;
      return /^[\p{L}\p{M}\p{N}_\s,'"-]+$/u.test(v) && v.split(",").every((part) => name.test(part)) ? v : "";
    },
  };
})();
