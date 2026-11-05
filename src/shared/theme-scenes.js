/* Original, offline scene collections. Each seed draws a different composition. */
(function () {
  "use strict";
  const BC = globalThis.BC;
  const scenes = [
    { id: "woodland", name: "Forest Retreat", category: "nature", dark: true, colors: ["#102f2b", "#347364", "#9cbea3", "#e5d8a6"], accent: "#90c9a6", description: "Layered evergreen forests · soft glass · moss green" },
    { id: "alpine", name: "Alpine Morning", category: "nature", dark: false, colors: ["#b4ced4", "#668e9c", "#e4e8df", "#e7c9a1"], accent: "#396878", description: "Alpine peaks · cool mist · open, airy surfaces" },
    { id: "dunes", name: "Desert Solstice", category: "nature", dark: false, colors: ["#edc7a3", "#b86f4f", "#d39168", "#f7e8c4"], accent: "#9c482e", description: "Sculpted dunes · terracotta · warm editorial type" },
    { id: "orbit", name: "Lunar Observatory", category: "space", dark: true, colors: ["#0b1429", "#324974", "#8aabcf", "#e3d6bd"], accent: "#a8c5ec", description: "Planetary studies · midnight glass · fine orbital lines" },
    { id: "nebula", name: "Cosmic Bloom", category: "space", dark: true, colors: ["#1e1036", "#653b96", "#c871a9", "#b3c3ff"], accent: "#d0a3f0", description: "Clouds of stardust · violet glow · deep plum panels" },
    { id: "aurora", name: "Northern Lights", category: "space", dark: true, colors: ["#071d2b", "#1e6b71", "#79d9b6", "#b7a2e8"], accent: "#8ee0c1", description: "Aurora ribbons · arctic silhouettes · luminous mint" },
    { id: "metro", name: "After Hours", category: "city", dark: true, colors: ["#101c35", "#283a62", "#e09d94", "#87cbd5"], accent: "#f0b4a4", description: "Night skylines · warm windows · smoked blue glass" },
    { id: "blueprint", name: "City Blueprint", category: "city", dark: true, colors: ["#0c2942", "#1c4862", "#90b9cb", "#e0c7a3"], accent: "#9dd5eb", description: "Architectural drawings · drafting grid · crisp edges" },
    { id: "gallery", name: "Bauhaus Studio", category: "art", dark: false, colors: ["#efe2c8", "#c85c3e", "#234d60", "#d8ab42"], accent: "#a8402e", description: "Original geometric compositions · cream paper · gallery frames" },
    { id: "collage", name: "Cut Paper", category: "art", dark: false, colors: ["#f0e5e0", "#b36e78", "#607e74", "#dfa36a"], accent: "#8f4459", description: "Layered paper shapes · muted pastels · sculptural corners" },
    { id: "paper", name: "Quiet Hours", category: "minimal", dark: false, colors: ["#e8e2d6", "#c0b4a1", "#8f9786", "#a48d78"], accent: "#655d4d", description: "Architectural shadows · warm linen · bookish typography" },
    { id: "mono", name: "Graphite", category: "minimal", dark: true, colors: ["#181b20", "#373d47", "#6a737b", "#b5b9b5"], accent: "#bdc9c4", description: "Monochrome forms · hairline borders · precise typography" },
  ];
  const byId = Object.assign(Object.create(null), Object.fromEntries(scenes.map((s) => [s.id, s])));
  const byName = Object.assign(Object.create(null), Object.fromEntries(scenes.map((s) => [s.name, s])));
  const cache = new Map();

  // What changes from one card to the next. Moving blurred clouds around wasn't
  // enough: every card still read as the same picture. Each seed also shifts the
  // hue within the theme's family, may mirror the layout and tilts the sky, and
  // the space scenes get a different subject and horizon. Courses pick seeds by
  // a hash of their id, not by position, so no two of the first 48 seeds share
  // both subject and hue; the second 24 offset the hue to keep it that way.
  const HUES = [0, 22, -22, 11, -11, 32, -32, 6];
  function layout(seed) {
    const n = Math.max(0, seed | 0);
    return { hue: HUES[(n + 3 * Math.floor(n / 24)) % 8], subject: n % 6, horizon: Math.floor(n / 6) % 4,
      mirror: (Math.floor(n / 3) + Math.floor(n / 24)) % 2 === 1, sky: n % 4 };
  }
  function shiftHue(hex, deg) {
    const v = parseInt(hex.slice(1), 16), r = (v >> 16) / 255, g = (v >> 8 & 255) / 255, b = (v & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
    if (!deg || !d) return hex;
    const c = d, h = ((max === r ? (g - b) / d % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60 + deg + 720) % 360;
    const x = c * (1 - Math.abs(h / 60 % 2 - 1)), m = l - c / 2;
    const rgb = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return "#" + rgb.map((u) => Math.round(Math.min(1, Math.max(0, u + m)) * 255).toString(16).padStart(2, "0")).join("");
  }

  function artwork(id, seed, wallpaper = false) {
    const s = byId[id] || byId.woodland;
    const key = s.id + ":" + seed + ":" + wallpaper;
    if (cache.has(key)) return cache.get(key);
    let n = (Number(seed) + 1) * 2654435761 >>> 0;
    const rand = (lo, hi) => { n ^= n << 13; n ^= n >>> 17; n ^= n << 5; return lo + (n >>> 0) / 4294967296 * (hi - lo); };
    const int = (lo, hi) => Math.round(rand(lo, hi));
    const L = layout(seed);
    // The wallpaper keeps the theme's own colours, which the panels are built on.
    const [bg, mid, fg, glow] = s.colors.map((c) => shiftHue(c, wallpaper ? 0 : L.hue));
    const shapes = [];
    const circle = (x, y, r, fill, opacity = 1) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" opacity="${opacity}"/>`;
    const path = (d, fill, extra = "") => `<path d="${d}" fill="${fill}" ${extra}/>`;
    const sunX = int(140, 1060), sunY = int(70, 270);
    if (["woodland", "alpine", "dunes"].includes(s.id)) {
      shapes.push(circle(sunX, sunY, int(36, 75), glow, .85));
      for (let layer = 0; layer < 5; layer++) {
        const y = 200 + layer * 75;
        let d = `M-100 800L-100 ${y}`;
        for (let x = -100; x <= 1400; x += 150) {
          d += s.id === "alpine" ? `L${x} ${int(y - 170, y + 35)}` : `Q${x - 75} ${int(y - 130, y + 50)} ${x + 75} ${int(y - 15, y + 70)}`;
        }
        shapes.push(path(d + "L1400 800Z", [fg, mid, bg, mid, bg][layer], `opacity="${.35 + layer * .15}"`));
        if (s.id === "woodland") for (let j = 0; j < 12; j++) {
          const x = int(-40, 1240), h = int(45, 100) + layer * 20, base = y + int(70, 150);
          shapes.push(path(`M${x} ${base - h}l${h / 3} ${h}h${-h * 2 / 3}Z`, layer > 2 ? bg : mid, `opacity="${.3 + layer * .16}"`));
        }
      }
    } else if (["orbit", "nebula", "aurora"].includes(s.id)) {
      // The theme's own layer stays on every card; the subject and horizon change.
      const fx = int(220, 980), fy = int(130, 360);
      if (s.id === "nebula") {
        const band = L.subject % 2 === 0, tilt = int(-35, 35), k = int(5, 9);
        for (let j = 0; j < k; j++) {
          const t = j / (k - 1), cx = band ? Math.round(100 + t * 1000) + int(-80, 80) : int(50, 1150), cy = band ? Math.round(520 - t * 380) + int(-90, 90) : int(40, 620);
          shapes.push(`<ellipse cx="${cx}" cy="${cy}" rx="${int(90, 340)}" ry="${int(35, 150)}" fill="${[mid, fg, glow][j % 3]}" opacity="${rand(.18, .34).toFixed(2)}" filter="url(#soft)" transform="rotate(${tilt + int(-15, 15)} ${cx} ${cy})"/>`);
        }
      }
      if (s.id === "aurora") for (let j = 0, k = int(3, 6); j < k; j++) shapes.push(path(`M-100 ${int(0, 300)}Q${int(150, 500)} ${int(300, 620)} ${int(500, 800)} ${int(120, 260)}T1300 ${int(30, 380)}`, "none", `stroke="${j % 2 ? glow : fg}" stroke-width="${int(15, 70)}" opacity="${rand(.16, .3).toFixed(2)}" filter="url(#soft)"`));
      if (s.id === "orbit") for (let j = 0; j < 3; j++) shapes.push(`<ellipse cx="${fx}" cy="${fy}" rx="${int(220, 520)}" ry="${int(40, 120)}" fill="none" stroke="${fg}" stroke-width="1.2" opacity=".3" transform="rotate(${int(-30, 30)} ${fx} ${fy})"/>`);
      for (let j = 0, k = int(45, 110); j < k; j++) shapes.push(circle(int(0, 1200), int(0, 650), rand(.4, j % 9 ? 1.8 : 3.2).toFixed(1), glow, rand(.25, .85).toFixed(2)));
      const subjects = [
        // A glowing core
        () => circle(fx, fy, int(170, 260), "url(#core)") + circle(fx, fy, int(6, 12), glow, .9),
        // A ringed planet; the ring's near half is drawn over it
        () => {
          const r = int(55, 105), rx = Math.round(r * 2.3), ry = Math.round(r * .45);
          const ring = `fill="none" stroke="${glow}" stroke-width="${int(3, 7)}" opacity=".6" transform="rotate(${int(-28, 28)} ${fx} ${fy})"`;
          return `<ellipse cx="${fx}" cy="${fy}" rx="${rx}" ry="${ry}" ${ring}/>` + circle(fx, fy, r, "url(#planet)") + `<path d="M${fx - rx} ${fy}A${rx} ${ry} 0 0 0 ${fx + rx} ${fy}" ${ring}/>`;
        },
        // A crescent moon
        () => {
          const r = int(48, 85), dx = Math.round(r * rand(.3, .55));
          return `<mask id="cut"><rect width="1200" height="700" fill="#fff"/><circle cx="${fx + dx}" cy="${fy - Math.round(dx / 3)}" r="${r}" fill="#000"/></mask>` +
            circle(fx, fy, Math.round(r * 1.6), glow, .08) + `<circle cx="${fx}" cy="${fy}" r="${r}" fill="${glow}" mask="url(#cut)"/>`;
        },
        // A spiral galaxy
        () => {
          const a = int(0, 180);
          let g = "";
          for (let j = 0; j < 4; j++) g += `<ellipse cx="${fx}" cy="${fy}" rx="${200 - j * 42}" ry="${62 - j * 12}" fill="${j % 2 ? fg : glow}" opacity="${(.16 + j * .07).toFixed(2)}" filter="url(#soft)" transform="rotate(${a + j * 34} ${fx} ${fy})"/>`;
          return g + circle(fx, fy, int(10, 18), glow, .95);
        },
        // A comet
        () => {
          const len = int(260, 480), ang = rand(.25, .6), x2 = Math.round(fx - len * Math.cos(ang)), y2 = Math.round(fy - len * Math.sin(ang));
          return `<linearGradient id="tail" gradientUnits="userSpaceOnUse" x1="${fx}" y1="${fy}" x2="${x2}" y2="${y2}"><stop stop-color="${glow}" stop-opacity=".9"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></linearGradient>` +
            `<path d="M${fx} ${fy}L${x2} ${y2}" stroke="url(#tail)" stroke-width="${int(5, 10)}" stroke-linecap="round"/>` + circle(fx, fy, 26, glow, .18) + circle(fx, fy, int(6, 10), glow);
        },
        // A giant planet rising at one edge, with a small moon
        () => { const r = int(240, 330); return circle(rand(0, 1) > .5 ? int(-20, 200) : int(1000, 1220), Math.round(700 + r * .05), r, "url(#planet)", .95) + circle(fx, fy, int(14, 26), fg); },
      ];
      const horizons = [
        // Peaks
        () => path(`M0 700V${int(560, 640)}L${int(120, 260)} ${int(560, 610)}L${int(350, 600)} ${int(460, 530)}L${int(700, 860)} ${int(570, 620)}L${int(950, 1080)} ${int(510, 580)}L1200 ${int(550, 620)}V700Z`, bg),
        // Rolling hills in two layers
        () => path(`M0 700V${int(560, 620)}Q${int(250, 450)} ${int(470, 540)} 650 ${int(560, 600)}T1200 ${int(540, 610)}V700Z`, mid, 'opacity=".55"') +
          path(`M0 700V${int(600, 650)}Q${int(300, 600)} ${int(540, 590)} 800 ${int(610, 640)}T1200 ${int(600, 650)}V700Z`, bg),
        // A still lake catching the light
        () => {
          let g = path("M0 590H1200V700H0Z", bg, 'opacity=".88"');
          for (let j = 0; j < 7; j++) { const x = fx + int(-120, 120); g += path(`M${x - int(20, 90)} ${int(600, 690)}h${int(40, 180)}`, "none", `stroke="${glow}" stroke-width="2" opacity="${rand(.15, .45).toFixed(2)}"`); }
          return g;
        },
        // Open sky
        () => "",
      ];
      shapes.push(subjects[L.subject](), horizons[L.horizon]());
    } else if (["metro", "blueprint"].includes(s.id)) {
      shapes.push(circle(sunX, sunY, int(25, 55), glow, .75));
      if (s.id === "blueprint") for (let x = 0; x < 1200; x += 32) shapes.push(path(`M${x} 0V700M0 ${x}H1200`, "none", `stroke="${fg}" opacity=".1"`));
      for (let layer = 0; layer < 3; layer++) for (let x = -30; x < 1250;) {
        const w = int(45, 120), h = int(90, 380), y = 610 - h + layer * 20;
        shapes.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${layer === 1 ? mid : bg}" stroke="${fg}" stroke-opacity="${s.id === "blueprint" ? .6 : .12}"/>`);
        if (rand(0, 1) > .55) shapes.push(path(`M${x + w / 2} ${y}v-25`, "none", `stroke="${fg}" opacity=".5"`));
        let windows = "";
        for (let wx = x + 10; wx < x + w - 8; wx += 20) for (let wy = y + 15; wy < 580; wy += 30) {
          if (rand(0, 1) > .58) windows += `M${wx} ${wy}h4v8h-4z`;
        }
        shapes.push(path(windows, layer % 2 ? fg : glow, 'opacity=".5"'));
        x += w + int(5, 22);
      }
      shapes.push(path("M0 625H1200", "none", `stroke="${glow}" opacity=".35"`));
    } else {
      // Different arrangements, shapes and negative space for every card.
      for (let j = 0; j < 7; j++) {
        const x = int(-60, 1060), y = int(-60, 580), w = int(80, 300), h = int(80, 330), fill = [mid, fg, glow][j % 3];
        if (s.id === "collage") shapes.push(path(`M${x} ${y}q${w} ${-h / 2} ${w} ${h / 2}t${-w / 2} ${h / 2}t${-w / 2} ${-h}Z`, fill, 'opacity=".85"'));
        else if (j % 3 === 0) shapes.push(circle(x, y, w / 2, fill, .75));
        else shapes.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${s.id === "paper" ? w / 2 : 0}" fill="${fill}" opacity=".75" transform="rotate(${s.id === "gallery" ? 0 : int(-35, 35)} ${x} ${y})"/>`);
      }
      if (s.id !== "collage") for (let j = 0; j < 6; j++) shapes.push(path(`M${150 + j * 24} 70v540`, "none", `stroke="${bg}" stroke-width="2" opacity=".7"`));
    }
    const sky = ['x2="0" y2="1"', 'x2="1" y2="1"', 'x1="1" x2="0" y2="1"', 'x2=".35" y2="1"'][L.sky];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="${wallpaper ? 1000 : 850}" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="sky" ${sky}><stop stop-color="${bg}"/><stop offset="1" stop-color="${mid}"/></linearGradient><linearGradient id="planet" x2="1" y2=".6"><stop stop-color="${glow}"/><stop offset=".55" stop-color="${fg}"/><stop offset="1" stop-color="${bg}"/></linearGradient><radialGradient id="core"><stop stop-color="${glow}" stop-opacity=".55"/><stop offset=".45" stop-color="${fg}" stop-opacity=".18"/><stop offset="1" stop-color="${fg}" stop-opacity="0"/></radialGradient><filter id="soft"><feGaussianBlur stdDeviation="18"/></filter></defs><path fill="url(#sky)" d="M0 0H1200V700H0Z"/><g${L.mirror ? ' transform="matrix(-1 0 0 1 1200 0)"' : ""}>${shapes.join("")}</g></svg>`;
    const result = { url: "data:image/svg+xml," + encodeURIComponent(svg), title: s.name + " · composition " + (seed + 1), creator: "Better Canvas", license: "Original artwork" };
    if (cache.size > 1024) cache.clear();
    cache.set(key, result);
    return result;
  }
  // Settings store a short reference, which BC.themeMedia resolves to the drawing
  // when it's painted. Storing the data URIs put up to 1.2 MB in bcSettings, and
  // every settings write and every frame load carried it.
  BC.sceneArtData = artwork;
  BC.sceneLayout = layout;
  BC.sceneArt = function (id, seed, wallpaper = false) {
    const s = byId[id] || byId.woodland, n = Math.max(0, seed | 0);
    return { url: "bc-scene:" + s.id + "#" + n + (wallpaper ? ":wall" : ""), title: s.name + " · composition " + (n + 1),
      creator: "Better Canvas", license: "Original artwork" };
  };
  // Swap data URIs saved by 3.3.1 and earlier for their references. Those came
  // from an older version of the drawings, so they're recognised by the
  // generator's markup and the composition title rather than drawn again.
  const drawn = (url, height) => {
    if (typeof url !== "string" || !url.startsWith("data:image/svg+xml,")) return false;
    try {
      return decodeURIComponent(url.slice(19)).startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="' + height + '" viewBox="0 0 1200 700"');
    } catch (_) { return false; }
  };
  BC.compactSceneArt = function (settings) {
    const fix = (s) => {
      for (const img of (s && s.dashboard && Array.isArray(s.dashboard.themeImages) && s.dashboard.themeImages) || []) {
        const m = img && img.creator === "Better Canvas" && /^(.+) · composition (\d+)$/.exec(img.title || "");
        if (m && byName[m[1]] && drawn(img.url, 850)) img.url = BC.sceneArt(byName[m[1]].id, +m[2] - 1).url;
      }
      const exp = s && s.theming && s.theming.experience, bg = s && s.cosmetics && s.cosmetics.background;
      if (exp && byId[exp] && bg && drawn(bg.image, 1000)) bg.image = BC.sceneArt(exp, 731, true).url;
    };
    if (!settings) return settings;
    fix(settings);
    for (const t of Array.isArray(settings.customThemes) ? settings.customThemes : []) fix(t && t.settings);
    return settings;
  };
  BC.themeScenes = byId;
  for (const s of scenes) {
    const theme = BC.themeLibrary.makeTheme([], s);
    let images;
    Object.defineProperty(theme.settings.dashboard, "themeImages", { enumerable: true,
      get() { return images || (images = Array.from({ length: 48 }, (_, i) => BC.sceneArt(s.id, i))); } });
    theme.id = "scene-" + s.id;
    theme.description = s.description;
    // The base colour belongs to the scene's own mode. Set for both, switching
    // modes put dark text on a dark page next to white panels.
    Object.assign(theme.settings.theming, {
      experience: s.id, [s.dark ? "darkBg" : "lightBg"]: s.colors[0], accentColor: s.accent,
      radius: ["blueprint", "gallery", "mono"].includes(s.id) ? 6 : 20,
      font: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    });
    theme.settings.cosmetics.background = { mode: "image", image: BC.sceneArt(s.id, 731, true).url, opacity: 100, blur: 0, when: "always" };
    BC.PRESET_THEMES.push(theme);
  }
})();
