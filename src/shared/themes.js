/* Better Canvas — built-in theme presets (light + dark). */
(function () {
  "use strict";
  const BC = (globalThis.BC = globalThis.BC || {});
  // The all-frames bundle also runs after the main bundle in the top document.
  if (BC.PRESET_THEMES) return;

  BC.DARK_TONES = {
    neutral:  { bg: "#111113", label: "Neutral" },
    slate:    { bg: "#141821", label: "Slate (cool)" },
    black:    { bg: "#09090b", label: "Midnight" },
    nord:     { bg: "#2e3440", label: "Nord" },
    dracula:  { bg: "#282a36", label: "Dracula" },
    solarized:{ bg: "#002b36", label: "Solarized Dark" },
  };

  BC.LIGHT_PRESETS = {
    default:   { bg: "#fafafa", accent: "",        label: "Default" },
    rose:      { bg: "#fdf2f7", accent: "#c2185b", label: "Rose" },
    forest:    { bg: "#f0f7ee", accent: "#2e7d32", label: "Forest" },
    ocean:     { bg: "#eff7fb", accent: "#0277bd", label: "Ocean" },
    sand:      { bg: "#fbf6ee", accent: "#a15c1b", label: "Sand" },
    solarized: { bg: "#fdf6e3", accent: "#268bd2", label: "Solarized Light" },
  };

  // Preset theme snapshots (shareable via JSON export/import).
  BC.PRESET_THEMES = [
    {
      id: "bc-default",
      name: "Better Canvas Default",
      settings: {
        theming: { darkMode: "off", darkTone: "neutral", lightPreset: "default", accentColor: "", radius: 8, density: "default" },
      },
    },
    {
      id: "midnight",
      name: "Midnight",
      settings: {
        theming: { darkMode: "on", darkTone: "black", accentColor: "#6366f1", radius: 10, density: "default" },
      },
    },
    {
      id: "nord",
      name: "Nord",
      settings: {
        theming: { darkMode: "on", darkTone: "nord", accentColor: "#88c0d0", radius: 8, density: "default" },
      },
    },
    {
      id: "dracula",
      name: "Dracula",
      settings: {
        theming: { darkMode: "on", darkTone: "dracula", accentColor: "#bd93f9", radius: 12, density: "default" },
      },
    },
    {
      id: "solarized-dark",
      name: "Solarized Dark",
      settings: {
        theming: { darkMode: "on", darkTone: "solarized", accentColor: "#268bd2", radius: 6, density: "default" },
      },
    },
    {
      id: "rose",
      name: "Rose",
      settings: {
        theming: { darkMode: "off", lightPreset: "rose", accentColor: "#c2185b", radius: 12, density: "default" },
      },
    },
    {
      id: "forest",
      name: "Forest",
      settings: {
        theming: { darkMode: "off", lightPreset: "forest", accentColor: "#2e7d32", radius: 10, density: "default" },
      },
    },
    {
      id: "ocean",
      name: "Ocean",
      settings: {
        theming: { darkMode: "off", lightPreset: "ocean", accentColor: "#0277bd", radius: 10, density: "default" },
      },
    },
    {
      id: "sand",
      name: "Sand",
      settings: {
        theming: { darkMode: "off", lightPreset: "sand", accentColor: "#a15c1b", radius: 8, density: "default" },
      },
    },
    {
      id: "high-contrast",
      name: "High Contrast",
      settings: {
        theming: { darkMode: "on", darkTone: "black", accentColor: "#ffcc00", highContrast: true, focusRing: "bold", radius: 4 },
      },
    },
    {
      id: "focus",
      name: "Focus",
      settings: {
        theming: { darkMode: "auto", accentColor: "", radius: 6, density: "compact", reducedMotion: true },
        dashboard: { hoverLift: false, showBadges: false },
      },
    },
    {
      id: "cozy",
      name: "Cozy",
      settings: {
        theming: { darkMode: "off", lightPreset: "sand", accentColor: "#b45309", radius: 16, density: "spacious", lineHeight: 1.7 },
      },
    },
  ];

  // A theme carries portable artwork, never course names, grades or course IDs.
  BC.themeImages = function (images) {
    if (!Array.isArray(images)) return [];
    const seen = new Set();
    return images.slice(0, 128).map((image) => {
      if (typeof image === "string") image = { url: image };
      if (!image || typeof image !== "object") return null;
      const url = typeof image.url === "string" ? image.url.trim() : "";
      if (!/^(https:\/\/|data:image\/)/i.test(url) && !(BC.themeMedia && BC.themeMedia.parse(url))) return null;
      if (seen.has(url)) return null;
      seen.add(url);
      const out = { url };
      for (const key of ["title", "creator", "license"]) {
        if (typeof image[key] === "string") out[key] = image[key].slice(0, 200);
      }
      for (const key of ["source", "licenseUrl", "thumbnail"]) {
        if (typeof image[key] === "string" && /^https:\/\//i.test(image[key])) out[key] = image[key];
      }
      return out;
    }).filter(Boolean);
  };

  BC.themeOnly = function (src) {
    if (!src || typeof src !== "object" || Array.isArray(src)) return null;
    const out = {};
    for (const key of ["theming", "cosmetics"]) {
      if (src[key] && typeof src[key] === "object" && !Array.isArray(src[key])) out[key] = BC.cleanData(src[key]);
    }
    if (out.theming) delete out.theming.rotation;
    if (src.dashboard && Array.isArray(src.dashboard.themeImages)) {
      out.dashboard = { themeImages: BC.themeImages(src.dashboard.themeImages) };
    }
    return Object.keys(out).length ? out : null;
  };

  BC.applyTheme = function (target, preset) {
    const src = BC.themeOnly(preset.settings || preset);
    if (!src) return;
    const merge = (to, from) => {
      for (const key of Object.keys(from)) {
        const value = from[key];
        // Same rule as mergeDefaults.
        if (to[key] !== undefined && BC.settingShape(to[key]) !== BC.settingShape(value)) continue;
        if (Array.isArray(value)) to[key] = JSON.parse(JSON.stringify(value));
        else if (value && typeof value === "object") {
          if (!to[key] || typeof to[key] !== "object" || Array.isArray(to[key])) to[key] = {};
          merge(to[key], value);
        } else to[key] = value;
      }
    };
    // Reset the previous look before applying the next. Rotation and the user's
    // non-visual dashboard settings survive, including names/order/hidden cards.
    const baseTheming = { ...BC.defaults.theming };
    delete baseTheming.rotation;
    const accessibility = {};
    for (const key of BC.THEME_KEEPS) {
      // Copy objects, because the merge below resets them in place.
      const value = target.theming[key];
      if (!src.theming || !(key in src.theming)) accessibility[key] = value && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value;
    }
    const customCss = target.cosmetics.customCss;
    merge(target.theming, baseTheming);
    merge(target.cosmetics, BC.defaults.cosmetics);
    merge(target, src);
    Object.assign(target.theming, accessibility);
    if (!src.cosmetics || !("customCss" in src.cosmetics)) target.cosmetics.customCss = customCss;
    target.dashboard.themeImages = BC.themeImages(src.dashboard && src.dashboard.themeImages);
    for (const course of Object.values(target.dashboard.courses || {})) {
      if (!course || typeof course !== "object") continue;
      delete course.bgImage;
      delete course.bgGradient;
    }
  };

  BC.themeImageForCourse = function (images, courseId) {
    if (!Array.isArray(images) || !images.length) return null;
    let hash = 0;
    for (const ch of String(courseId)) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) >>> 0;
    return images[hash % images.length];
  };

  // Resolve collisions across the whole roster, not independently per card.
  // Sorting IDs keeps assignments identical when cards are dragged or filtered.
  BC.assignThemeImages = function (images, courseIds) {
    const pool = Array.from(new Map((images || []).map((image) => [image.url, image])).values());
    const assigned = new Map(), used = new Set();
    if (!pool.length) return assigned;
    for (const id of Array.from(new Set(Array.from(courseIds, String))).sort()) {
      if (used.size === pool.length) used.clear();
      let slot = pool.indexOf(BC.themeImageForCourse(pool, id));
      while (used.has(slot)) slot = (slot + 1) % pool.length;
      used.add(slot);
      assigned.set(id, pool[slot]);
    }
    return assigned;
  };

  // Local vector artwork gives the minimal presets real card images, even
  // offline. Three coordinated variations are used across the course cards.
  function minimalArt(accent, base, n) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${base}"/><stop offset="1" stop-color="${accent}"/></linearGradient></defs><path fill="url(#g)" d="M0 0h800v400H0z"/><circle cx="${160 + n * 240}" cy="${100 + n * 30}" r="155" fill="${accent}" opacity=".5"/><path d="M-80 380Q240 ${-60 + n * 100} 880 280" stroke="white" stroke-opacity=".17" stroke-width="120" fill="none"/><circle cx="660" cy="60" r="210" fill="none" stroke="white" stroke-opacity=".16" stroke-width="2"/></svg>`;
    return { url: "data:image/svg+xml," + encodeURIComponent(svg), title: "Minimal curves" };
  }
  for (const preset of BC.PRESET_THEMES) {
    preset.category = "minimal";
    preset.classic = true;
    const t = preset.settings.theming;
    const base = (BC.DARK_TONES[t.darkTone] || BC.DARK_TONES.neutral).bg;
    preset.settings.dashboard = { themeImages: preset.id === "bc-default" ? [] :
      [0, 1, 2].map((n) => minimalArt(t.accentColor || "#6366f1", base, n)) };
  }

  // isDarkActive — canonical source of truth used by every surface.
  BC.isDarkActive = function (settings) {
    if (!settings || !settings.theming) return false;
    const mode = settings.theming.darkMode;
    if (mode === "on") return true;
    if (mode === "off") return false;
    if (mode === "auto") {
      try { return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches; }
      catch (_) { return false; }
    }
    if (mode === "scheduled") {
      const sc = settings.theming.darkSchedule || {};
      return BC.dt ? BC.dt.withinSchedule(sc.start, sc.end) : false;
    }
    return false;
  };
})();
