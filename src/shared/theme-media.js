/* Original bundled artwork. Portable references survive export and browser changes. */
(function () {
  "use strict";
  const BC = globalThis.BC = globalThis.BC || {};
  const parse = (url) => {
    // A generated scene drawing. It's a whole image, so it's marked like a
    // wallpaper: sized to cover, not cut from a sprite sheet.
    const scene = /^bc-scene:([a-z]+)#(\d{1,5})(:wall)?$/.exec(String(url || ""));
    if (scene) return BC.themeScenes && BC.themeScenes[scene[1]] ? { scene: scene[1], seed: +scene[2], wall: !!scene[3], wallpaper: true } : null;
    const wall = /^bc-wall:(anime-garden|anime-night)$/.exec(String(url || ""));
    if (wall) return { name: wall[1], wallpaper: true, index: 0 };
    const m = /^bc-art:(anime-garden|anime-night)#(\d{1,2})$/.exec(String(url || ""));
    return m && +m[2] < 32 ? { name: m[1], index: +m[2] } : null;
  };
  const resolve = (url) => {
    const art = parse(url);
    if (art && art.scene) return BC.sceneArtData(art.scene, art.seed, art.wall).url;
    return art ? chrome.runtime.getURL("src/assets/themes/" + art.name + (art.wallpaper ? "-wallpaper.webp" : ".webp#scene-" + art.index)) : url;
  };
  const position = (url) => {
    const art = parse(url);
    return art && !art.wallpaper ? (art.index % 4 / 3 * 100) + "% " + (Math.floor(art.index / 4) / 7 * 100) + "%" : "center";
  };
  const style = (url, wallpaper = false) => {
    if (!BC.util.isSafeUrl(url)) return "";
    const art = parse(url);
    const size = art && !art.wallpaper ? (wallpaper ? "max(400%, 600vh) max(800%, 533.333vw)" : "400% 800%") : "cover";
    return 'background-image:url("' + BC.util.cssUrl(url) + '");background-size:' + size + ';background-position:' + position(url) + ';background-repeat:no-repeat;';
  };
  BC.themeMedia = { parse, resolve, position, style };
  BC.themeLibrary.categories.push({ id: "anime", label: "Anime", query: "anime landscape", accent: "#839e75", tone: "#162521", light: "forest" });
  const packs = [
    ["anime-reverie", "Forest Reverie", "anime-garden", 0, "woodland", "#172c26", "#a4c990", "fireflies", "A hand-painted woodland, warm light and drifting fireflies."],
    ["anime-sakura", "Sakura Days", "anime-garden", 5, "paper", "#f9eee8", "#a95670", "petals", "Soft pinks, garden paths and falling cherry blossoms."],
    ["anime-moon", "Moss & Moon", "anime-garden", 13, "woodland", "#15262c", "#83c5c4", "fireflies", "A quiet forest retreat with luminous evening greens."],
    ["anime-rain", "Rainy After Hours", "anime-night", 0, "metro", "#181d35", "#b6a3f5", "rain", "Neon streets, cozy windows and a gentle rain loop."],
    ["anime-stars", "Starlit Study", "anime-night", 16, "orbit", "#191c39", "#a2bafd", "stars", "Painted galaxies, moonlit rooms and slowly drifting stars."],
    ["anime-dream", "Daydream Express", "anime-night", 4, "gallery", "#f4e7de", "#905b8a", "petals", "Sunset train rides and lavender skies with floating petals."],
  ];
  for (const [id, name, asset, offset, experience, bg, accent, motion, description] of packs) {
    const light = id === "anime-sakura" || id === "anime-dream";
    const images = Array.from({ length: 32 }, (_, i) => ({ url: "bc-art:" + asset + "#" + ((i + offset) % 32), title: name + " · scene " + (i + 1), creator: "Better Canvas original artwork" }));
    BC.PRESET_THEMES.push({ id, name, category: "anime", animated: true, description, settings: {
      theming: { darkMode: light ? "off" : "on", [light ? "lightBg" : "darkBg"]: bg, accentColor: accent, radius: 18, experience },
      dashboard: { themeImages: images },
      cosmetics: { background: { mode: "image", image: "bc-wall:" + asset, opacity: 100, blur: 0, when: "always" }, motion },
    } });
  }
  // Compositor-only layers; no remote videos, timers, or motion when reduced motion is requested.
  BC.themeMotionCSS = function (motion, selector) {
    if (!["fireflies", "petals", "rain", "stars"].includes(motion)) return "";
    const rain = motion === "rain", petals = motion === "petals";
    const image = rain ? "repeating-linear-gradient(105deg,transparent 0 45px,#c4daff55 46px,transparent 47px 92px)" :
      petals ? "radial-gradient(ellipse at 18% 25%,#ffb6cfbb 0 3px,transparent 5px),radial-gradient(ellipse at 71% 64%,#f9d3e5bb 0 2px,transparent 4px)" :
      "radial-gradient(circle at 17% 33%,#fff8cacc 0 1px,transparent 3px),radial-gradient(circle at 67% 72%,#b8f5dbbb 0 1px,transparent 3px)";
    const targets = selector.split(",").map((s) => s.trim());
    const layers = targets.map((s) => s + "::after").join(",");
    return `${selector} { overflow:hidden; }
      ${targets.map((s) => s + ":not(#bc-bg-layer)").join(",")} { position:relative; }
      ${layers} { content:""; position:absolute; inset:-35%; pointer-events:none; background-image:${image}; background-size:${rain ? "150px 200px" : "210px 170px"}; animation:bc-scene-drift ${rain ? "2" : petals ? "18" : "28"}s linear infinite; opacity:.7; }
      @keyframes bc-scene-drift { from { transform:translate3d(-2%,-12%,0); } to { transform:translate3d(4%,12%,0); } }
      @media(prefers-reduced-motion:reduce) { ${layers} { animation:none; display:none; } }`;
  };
})();
