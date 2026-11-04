/*
 * Better Canvas — theming.
 * Emits CSS variables and rules for light presets, accent color, font, density,
 * radius, focus ring, color-blind mode and reduced motion, and switches the dark
 * mode engine (core/darkengine.js) on and off.
 * All feature CSS references these vars so re-tinting is one style swap.
 */
(function () {
  "use strict";
  const BC = (globalThis.BC = globalThis.BC || {});
  BC.features = BC.features || {};

  const FONT_SCALE = { xs: 0.85, s: 0.92, m: 1.0, l: 1.08, xl: 1.18 };
  const DENSITY_PAD = { compact: 0.6, default: 1.0, spacious: 1.4, cozy: 1.7 };

  // Dark mode itself lives in core/darkengine.js: a few hand-written region rules
  // plus computed-colour tagging, shared with same-origin subframes.
  const staticCSS = `
    /* Accent variable — Canvas reads --ic-brand-primary in many places */
    :root[data-bc-accent] { --ic-brand-primary: var(--bc-accent) !important;
      --ic-brand-button--primary-bgd: var(--bc-accent) !important; --ic-brand-button--primary-text: var(--bc-accent-contrast, #fff) !important; }
    /* Canvas keeps white text on primary buttons, unreadable on a light accent. */
    :root[data-bc-accent] .btn-primary, :root[data-bc-accent] .Button--primary {
      background: var(--bc-accent) !important; border-color: var(--bc-accent) !important; color: var(--bc-accent-contrast, #fff) !important;
    }

    /* Density */
    :root[data-bc-density="compact"]  { --bc-density: 0.6; }
    :root[data-bc-density="spacious"] { --bc-density: 1.4; }
    :root[data-bc-density="cozy"]     { --bc-density: 1.7; }

    /* Global radius */
    :root[data-bc-radius] .ic-DashboardCard, :root[data-bc-radius] .ic-DashboardCard__box,
    :root[data-bc-radius] .btn, :root[data-bc-radius] input, :root[data-bc-radius] select,
    :root[data-bc-radius] .Button, :root[data-bc-radius] .card, :root[data-bc-radius] .panel {
      border-radius: var(--bc-radius) !important;
    }

    /* Focus ring */
    :root[data-bc-focus="bold"] *:focus-visible { outline: 3px solid var(--bc-accent, #4f46e5) !important; outline-offset: 2px; }
    :root[data-bc-focus="high-contrast"] *:focus-visible { outline: 3px solid #ffeb3b !important; outline-offset: 2px; box-shadow: 0 0 0 4px #000 !important; }

    /* Cursor, drawn by BC.tokens.cursor into --bc-cursor. Links keep their hand
       and text fields their I-beam, except under the crosshair. */
    :root:is([data-bc-cursor="arrow"], [data-bc-cursor="dot"], [data-bc-cursor="ring"]) { cursor: var(--bc-cursor) !important; }
    :root:is([data-bc-cursor="arrow"], [data-bc-cursor="dot"], [data-bc-cursor="ring"]) :is(textarea, [contenteditable]:not([contenteditable="false"]),
      input:is(:not([type]), [type="text"], [type="search"], [type="email"], [type="url"], [type="password"], [type="number"], [type="tel"])) { cursor: text; }
    :root[data-bc-cursor="precise"], :root[data-bc-cursor="precise"] * { cursor: var(--bc-cursor) !important; }

    /* High contrast (its contrast() filter is set inline with the colour-blind one) */
    :root[data-bc-hc="1"] * { text-shadow: none !important; }

    /* Reduced motion */
    :root[data-bc-motion="0"] *, :root[data-bc-motion="0"] *::before, :root[data-bc-motion="0"] *::after {
      animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; scroll-behavior: auto !important;
      /* One run, or an infinite spinner lands at a random angle every frame. */
      animation-iteration-count: 1 !important;
    }

    /* Rounded UI off */
    :root[data-bc-rounded="0"] .ic-DashboardCard, :root[data-bc-rounded="0"] .btn, :root[data-bc-rounded="0"] input,
    :root[data-bc-rounded="0"] select, :root[data-bc-rounded="0"] .Button { border-radius: 0 !important; }
  `;

  // The mode-independent half never changes, so build it once rather than
  // reassembling a multi-KB string on every observer tick.
  let staticCssCache = null;
  function staticSheet() {
    if (staticCssCache == null) {
      staticCssCache = staticCSS + "\n" + BC.tokens.staticCss() + "\n" + BC.darkEngine.baseCss() + "\n" + BC.darkEngine.tagCss();
    }
    return staticCssCache;
  }

  // Memoized against a signature of every input that affects the output.
  let lastSig = null;
  let lastCss = "";
  let appliedFilter = "";      // the root `filter` we last wrote
  let appliedCursor = "";      // and the --bc-cursor value

  function buildCss(settings) {
    const t = settings.theming;
    const fontSize = FONT_SCALE[t.fontSizeScale || "m"] || 1;
    // Numbers only. A string from an imported file would land in the CSS as is.
    const lineHeight = Number(t.lineHeight) || 1.5;
    const letter = Number(t.letterSpacing) || 0;
    const density = DENSITY_PAD[t.density] || 1;

    // cssSafe only strips <>, which is not enough for a value interpolated into a
    // declaration — a stack of `Inter; } html{display:none} .x {` would escape it.
    const font = BC.tokens.safeFontStack(t.font);
    const fontRule = font
      ? `:root, html body, .ic-app { font-family: ${font} !important; }
         :root { --bc-font-sans: ${font}; }`
      : "";

    // Canvas's own text is only overridden when a setting moves off its default.
    // A fixed 14px root on every page shrank every rem-sized Canvas control and
    // ignored the browser's font size setting. The scale is a percentage of it.
    // The custom properties are what let OUR components scale alongside it.
    const bodyText = [
      lineHeight !== 1.5 ? `line-height: ${lineHeight} !important;` : "",
      letter ? `letter-spacing: ${letter}px !important;` : "",
    ].join(" ").trim();
    const scaleRule = (fontSize !== 1 ? `:root { font-size: ${+(fontSize * 100).toFixed(2)}% !important; }\n` : "") +
      (bodyText ? `:root, html body { ${bodyText} }\n` : "") + `
    :root {
      --bc-font-scale: ${fontSize};
      --bc-line-height: ${lineHeight};
      --bc-letter-spacing: ${letter}px;
    }`;
    const densityRule = `:root { --bc-density: ${density}; }`;
    const radiusRule  = `:root { --bc-radius: ${t.radius|0}px; }`;

    // Light preset page background (skipped when a custom cosmetic background is active).
    const lp = (BC.LIGHT_PRESETS || {})[t.lightPreset];
    const bgCfg = settings.cosmetics && settings.cosmetics.background;
    // Only a background that is actually showing in this mode replaces the preset.
    const cosmeticBg = !!bgCfg && bgCfg.mode !== "none" &&
      (bgCfg.when === "dark" ? BC.isDarkActive(settings) : bgCfg.when === "light" ? !BC.isDarkActive(settings) : true);
    const lightBgRule = (lp && t.lightPreset !== "default" && !cosmeticBg)
      ? `html:not(.bc-dark) body, html:not(.bc-dark) .ic-Layout-contentMain { background-color: ${lp.bg} !important; }`
      : "";

    let logoRule = "";
    if (t.logo && t.logo.mode === "hide") {
      logoRule = ".ic-app-header__logomark, .ic-app-header__logomark-container { display: none !important; }";
    } else if (t.logo && t.logo.mode === "replace" && BC.util.isSafeUrl(t.logo.url)) {
      logoRule = `.ic-app-header__logomark, .ic-app-header__logomark-container { background-image: url("${BC.util.cssUrl(t.logo.url)}") !important; background-size: contain !important; background-repeat: no-repeat !important; background-position: center !important; content: "" !important; }
      .ic-app-header__logomark img, .ic-app-header__logomark-container img { visibility: hidden !important; }`;
    }

    // Dyslexia font override
    const dyslexiaRule = (settings.accessibility && settings.accessibility.dyslexiaFont)
      ? `:root, html body, .ic-app, .ic-DashboardCard, .ic-Sidebar { font-family: "Comic Sans MS", "OpenDyslexic", Verdana, sans-serif !important; letter-spacing: 0.03em !important; }`
      : "";

    // Large targets
    const largeTargets = (settings.accessibility && settings.accessibility.largeTargets)
      ? `button, .btn, .Button, a[role=button], input[type=checkbox], input[type=radio] { min-height: 40px !important; min-width: 40px !important; }`
      : "";

    return BC.tokens.css(t) + "\n" + scaleRule + "\n" + densityRule + "\n" + radiusRule + "\n" +
           lightBgRule + "\n" + fontRule + "\n" + logoRule + "\n" + dyslexiaRule + "\n" + largeTargets + "\n" +
           `.bc-logo-text { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color: var(--bc-text); font-weight:700; font-size: var(--bc-text-sm); letter-spacing:.03em; }`;
  }

  // Imperative root state. Cheap, but every write is guarded: an unguarded
  // classList or attribute write re-serializes the attribute even when the value
  // is unchanged, which is both a style invalidation and an observer self-trigger,
  // ~5x/second forever.
  function applyRootState(settings) {
    const t = settings.theming;
    const doc = document.documentElement;
    const active = BC.isDarkActive(settings);
    if (doc.classList.contains("bc-dark") !== active) doc.classList.toggle("bc-dark", active);

    const lp = (BC.LIGHT_PRESETS || {})[t.lightPreset];
    const attr = (k, v) => { if (doc.getAttribute(k) !== v) doc.setAttribute(k, v); };
    const wantAccent = !!(BC.color.normalizeHex(t.accentColor) || (lp && lp.accent));
    if (doc.hasAttribute("data-bc-accent") !== wantAccent) doc.toggleAttribute("data-bc-accent", wantAccent);
    attr("data-bc-density", t.density || "default");
    attr("data-bc-radius", String(t.radius | 0));
    attr("data-bc-focus", t.focusRing || "default");
    const cursor = BC.tokens.cursor(t);
    attr("data-bc-cursor", cursor.shape);
    if (cursor.css !== appliedCursor) {
      if (cursor.css) doc.style.setProperty("--bc-cursor", cursor.css); else doc.style.removeProperty("--bc-cursor");
      appliedCursor = cursor.css;
    }
    attr("data-bc-hc", t.highContrast ? "1" : "0");
    attr("data-bc-motion", (t.reducedMotion || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) ? "0" : "1");
    attr("data-bc-rounded", t.roundedUI ? "1" : "0");

    // One inline `filter` carries both effects. High contrast used to be a
    // stylesheet filter on :root, which the colour-blind inline filter silently
    // replaced — turning both on dropped the contrast boost.
    // Compared against what we last wrote, not read back: the browser serializes
    // url(#id) as url("#id"), so a read-back never matched and the page-wide filter
    // was rewritten — a full repaint — on every tick.
    const cb = (t.colorBlind && t.colorBlind !== "off") ? BC.color.colorBlindFilter(t.colorBlind) : "";
    const filter = [t.highContrast ? "contrast(1.15)" : "", cb].filter(Boolean).join(" ");
    if (filter !== appliedFilter || (filter && !doc.style.filter)) { doc.style.filter = filter; appliedFilter = filter; }

    // Clamped: the durations are calc(Nms / speed), so a corrupted import setting
    // this to 0 would produce division by zero across every animation.
    const speed = String(BC.util.clamp(Number(t.animSpeed) || 1, 0.25, 4));
    if (doc.style.getPropertyValue("--bc-anim-speed") !== speed) doc.style.setProperty("--bc-anim-speed", speed);

    const sw = (t.sidebarWidth && t.sidebarWidth > 0) ? t.sidebarWidth + "px" : "";
    if (doc.style.getPropertyValue("--bc-sidebar-w") !== sw) {
      if (sw) doc.style.setProperty("--bc-sidebar-w", sw);
      else doc.style.removeProperty("--bc-sidebar-w");
    }

    // Text-mode logo replacement is a real node, so it can't live in a stylesheet.
    const existing = document.getElementById("bc-logo-text");
    if (t.logo && t.logo.mode === "text" && t.logo.text) {
      const label = String(t.logo.text).slice(0, 24);
      if (!existing) {
        const holder = document.querySelector(".ic-app-header__logomark, .ic-app-header__logomark-container");
        if (holder) {
          const s = document.createElement("span");
          s.id = "bc-logo-text";
          s.className = "bc-logo-text";
          s.setAttribute("data-bc-node", "bc-logo-text");
          s.textContent = label;
          holder.style.position = "relative";
          holder.appendChild(s);
        }
      } else if (existing.textContent !== label) {
        existing.textContent = label;
      }
    } else if (existing) {
      existing.remove();
    }
  }

  function apply(settings, ctx) {
    const t = settings.theming;
    const a = settings.accessibility || {};
    const bgc = (settings.cosmetics && settings.cosmetics.background) || {};
    const cos = (bgc.mode || "") + "/" + (bgc.when || "") + "/" + (BC.isDarkActive(settings) ? 1 : 0);

    BC.injector.setStyle("bc-static", staticSheet());

    const sig = BC.tokens.signature(t) + "|" + (a.dyslexiaFont ? 1 : 0) + (a.largeTargets ? 1 : 0) + "|" + cos;
    if (sig !== lastSig) { lastSig = sig; lastCss = buildCss(settings); }
    BC.injector.setStyle("bc-theming", lastCss);

    applyRootState(settings);

    // After the root class and stylesheets are in place, so the first scan reads
    // the dark tokens it maps onto.
    if (BC.isDarkActive(settings)) BC.darkEngine.start();
    else BC.darkEngine.stop();
  }

  BC.registry.register({
    id: "theming", styles: ["bc-static", "bc-theming"], nodes: ["bc-logo-text"], apply,
    // Teardown removes our stylesheets, so the memo has to be invalidated or a
    // re-enable would skip rebuilding them. (The root-level inline state is cleared
    // centrally in content.js's teardown.)
    unmount() { lastSig = null; appliedFilter = ""; appliedCursor = ""; BC.darkEngine.stop(); },
  });
})();
