/*
 * Better Canvas — adaptive dark mode.
 *
 * Canvas mixes three generations of UI: legacy Rails views (.btn, .ig-row), React
 * with InstUI (hashed css-*-view classes that change between releases), and course
 * content full of inline colours. A fixed list of selectors can't cover that — the
 * old blanket rules painted every button the same dark box and still left InstUI
 * surfaces white. Instead this reads each element's computed colours and tags only
 * the ones that need changing; one small stylesheet maps each tag to a token.
 *
 *   data-bc-dbg   background  1 page · 2 panel · 3 control / well · hN tinted (hue bucket)
 *   data-bc-dfg   text        t body · m muted · hN tinted · k keep dark (on a light chip)
 *   data-bc-dbd   edges       the border sides ("t r b l") that were light; "x" a light text shadow
 *   data-bc-dhov  hover       turns light only while hovered
 *   data-bc-dhovdark          a pinned light chip that turns dark while hovered
 *
 * Reads happen before writes, so classification sees Canvas's own colours rather
 * than ones we've already changed. Editable regions are never tagged: the rich
 * content editor serializes its DOM, and our attributes would end up in the
 * user's submission.
 *
 * Shared by the top document (theming.js) and same-origin subframes (frame.js), so
 * it depends on nothing but the DOM.
 */
(function () {
  "use strict";
  const BC = (globalThis.BC = globalThis.BC || {});
  // The subframe bundle also lists this file and runs in the top frame too; a
  // second copy would orphan the first one's observer.
  if (BC.darkEngine) return;

  const ATTRS = ["data-bc-dbg", "data-bc-dfg", "data-bc-dbd"];
  const TAGGED = "[data-bc-dbg],[data-bc-dfg],[data-bc-dbd]";
  const SKIP = new Set(["SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT", "TEMPLATE", "HEAD", "TITLE",
    "IMG", "VIDEO", "AUDIO", "CANVAS", "IFRAME", "PICTURE", "SOURCE", "TRACK", "OBJECT", "EMBED", "BR", "WBR"]);
  const OURS = "[data-bc-node],[data-better-canvas],#bc-bg-layer";
  const HUES = 12;

  // Thresholds, in relative luminance (0 black – 1 white).
  const BG_LIGHT = 0.75;     // a background this light gets darkened
  const BG_WHITE = 0.96;     // …and this light counts as "white" rather than "grey"
  const MID = 0.45;          // below this a surface already reads as dark
  const FG_DARK = 0.26;      // text darker than this can't hold 4.5:1 on our surfaces
  const FLIP = 0.18;         // light text reads better below this, dark text above
  const NEUTRAL = 10;        // max channel spread (0–255) still counted as grey

  // ---- colour maths ---------------------------------------------------------

  const RGB_RE = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)/;
  // Chrome reports color-mix() backgrounds, like the scene panels, this way, with
  // channels from 0 to 1.
  const SRGB_RE = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+)(%?))?\s*\)/;
  function parse(s) {
    let m = RGB_RE.exec(s || "");
    const srgb = !m && !!(m = SRGB_RE.exec(s || ""));
    if (!m) return null;
    const ch = (v) => (srgb ? Math.round(v * 255) : +v);
    let a = m[4] == null ? 1 : parseFloat(m[4]);
    if (m[5] === "%") a /= 100;
    return { r: ch(m[1]), g: ch(m[2]), b: ch(m[3]), a };
  }
  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || "").trim());
    if (!m) return null;
    let h = m[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const chan = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * chan(c.r) + 0.7152 * chan(c.g) + 0.0722 * chan(c.b);
  const spread = (c) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
  const key = (c) => c.r + "," + c.g + "," + c.b;
  // The page under everything, for colours that let it show through.
  let page = { r: 24, g: 24, b: 27, a: 1 };
  const over = (c, u) => ({ r: c.r * c.a + u.r * (1 - c.a), g: c.g * c.a + u.g * (1 - c.a), b: c.b * c.a + u.b * (1 - c.a), a: 1 });
  function hue(c) {
    const r = c.r / 255, g = c.g / 255, b = c.b / 255;
    const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
    if (!d) return 0;
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
    return h < 0 ? h + 360 : h;
  }
  const bucket = (c) => Math.round(hue(c) / (360 / HUES)) % HUES;

  // ---- stylesheets ----------------------------------------------------------

  // Hand-written rules for the handful of regions where the right answer isn't
  // derivable from colours alone (the sticky dashboard header should match the
  // page, not float as a lighter band; card footers shouldn't be accent-coloured).
  // Everything else is the engine's job.
  function baseCss() {
    return `
html.bc-dark { color-scheme: dark; background-color: var(--bc-surface-1) !important;
  --ic-brand-font-color-dark: var(--bc-text) !important; --ic-link-color: var(--bc-link) !important; }
html.bc-dark body { background-color: var(--bc-surface-1) !important; color: var(--bc-text) !important; }
html.bc-dark ::placeholder { color: var(--bc-text-subtle, var(--bc-muted)) !important; opacity: 1 !important; }
html.bc-dark ::selection { background-color: var(--bc-accent); color: var(--bc-accent-contrast, #fff); }
/* Canvas fills its skip link with the link colour under white text. Dark mode's link colour is light. */
html.bc-dark #skip_navigation_link { background-color: var(--bc-accent) !important; color: var(--bc-accent-contrast, #fff) !important; }
/* Canvas renders equations as black ink on a transparent image. */
html.bc-dark img.equation_image { background-color: #fff !important; border-radius: 2px; padding: 1px 2px; }
html.bc-dark :is(#content, #right-side, #breadcrumbs, .user_content, .ic-app-main-content, .ToDoSidebar) a[href]:not(.Button, .btn, [role="button"], [class*="baseButton"], .ic-DashboardCard__link, .ic-DashboardCard__action, [data-bc-dfg="k"]) {
  color: var(--bc-link) !important;
}
html.bc-dark .ic-Dashboard-header__layout { background-color: var(--bc-surface-1) !important; box-shadow: none !important; border-color: var(--bc-border) !important; }
html.bc-dark .ic-DashboardCard { background-color: var(--bc-surface-2) !important; box-shadow: 0 0 0 1px var(--bc-border) !important; }
html.bc-dark .ic-DashboardCard:hover { box-shadow: 0 0 0 1px var(--bc-border-strong, var(--bc-border)), var(--bc-shadow-3) !important; }
html.bc-dark .ic-DashboardCard__header_content, html.bc-dark .ic-DashboardCard__action-container { background-color: transparent !important; }
html.bc-dark .ic-DashboardCard__header-subtitle, html.bc-dark .ic-DashboardCard__header-term { color: var(--bc-muted) !important; }
html.bc-dark .ic-DashboardCard__action { color: var(--bc-muted) !important; }
html.bc-dark .ic-DashboardCard__action:hover { color: var(--bc-text) !important; }
html.bc-dark hr { border-color: var(--bc-border) !important; }
`;
  }

  function tagCss() {
    let css = `
[data-bc-dscan], [data-bc-dscan] * { transition: none !important; }
html.bc-dark [data-bc-dbg="1"] { background-color: var(--bc-surface-1) !important; }
html.bc-dark [data-bc-dbg="2"] { background-color: var(--bc-surface-2) !important; }
html.bc-dark [data-bc-dbg="3"] { background-color: var(--bc-surface-3) !important; }
html.bc-dark :is(a, button, summary, label, [role="button"], [role="tab"], [role="menuitem"], [role="option"], [tabindex])[data-bc-dbg]:hover {
  background-color: var(--bc-surface-pressed, var(--bc-surface-3)) !important;
}
html.bc-dark [data-bc-dhov]:hover { background-color: var(--bc-surface-hover, var(--bc-surface-3)) !important; color: var(--bc-text) !important; }
html.bc-dark [data-bc-dfg="t"] { color: var(--bc-text) !important; }
html.bc-dark [data-bc-dfg="m"] { color: var(--bc-muted) !important; }
html.bc-dark [data-bc-dfg="k"] { color: #1f1f23 !important; }
/* Still reads as a link: at least 5.4:1 on the darkest chip that gets pinned. */
html.bc-dark a[data-bc-dfg="k"] { color: #1e3a8a !important; text-decoration: underline; }
/* A chip that darkens on hover gets the page's light text back while hovered. */
html.bc-dark [data-bc-dhovdark]:hover, html.bc-dark [data-bc-dhovdark]:hover [data-bc-dfg="k"] { color: var(--bc-text) !important; }
html.bc-dark [data-bc-dbd~="t"] { border-top-color: var(--bc-border) !important; }
html.bc-dark [data-bc-dbd~="r"] { border-right-color: var(--bc-border) !important; }
html.bc-dark [data-bc-dbd~="b"] { border-bottom-color: var(--bc-border) !important; }
html.bc-dark [data-bc-dbd~="l"] { border-left-color: var(--bc-border) !important; }
html.bc-dark [data-bc-dbd~="x"] { text-shadow: none !important; }
`;
    for (let i = 0; i < HUES; i++) {
      const h = Math.round(i * (360 / HUES));
      css += `html.bc-dark [data-bc-dbg="h${i}"] { background-color: hsl(${h}, 30%, 17%) !important; }\n`;
      css += `html.bc-dark [data-bc-dfg="h${i}"] { color: hsl(${h}, 80%, 72%) !important; }\n`;
    }
    return css;
  }

  // ---- classification -------------------------------------------------------

  // The dark surfaces currently in force, so an element already painted by a
  // hand-written rule (or an earlier pass) resolves to the right layer.
  function readTokens() {
    const cs = getComputedStyle(document.documentElement);
    const out = {};
    for (const n of ["1", "2", "3"]) {
      const c = hexToRgb(cs.getPropertyValue("--bc-surface-" + n)) || parse(cs.getPropertyValue("--bc-surface-" + n));
      if (c) out[key(c)] = n;
      if (c && n === "1") page = c;
    }
    return out;
  }

  function eligible(el) {
    if (SKIP.has(el.tagName)) return false;
    if (el.ownerSVGElement) return false;            // inside an <svg>: colour comes from the root
    if (el.isContentEditable) return false;          // see header: never write into an editor
    return !el.closest(OURS);
  }

  function sidesOf(cs) {
    const out = [];
    for (const [s, name] of [["t", "Top"], ["r", "Right"], ["b", "Bottom"], ["l", "Left"]]) {
      const w = parseFloat(cs["border" + name + "Width"]);
      const st = cs["border" + name + "Style"];
      if (!(w > 0) || st === "none" || st === "hidden") continue;
      const c = parse(cs["border" + name + "Color"]);
      if (!c || c.a < 0.2) continue;
      out.push({ s, light: lum(c) > 0.4 });
    }
    return out;
  }

  // Natural colours of one element. `surf` is what it will look like once tagged:
  //   "1" | "2" | "3" | "h" — dark (ours); "dark" — already dark; "light" — stays
  //   light (mid-tone chips, images); null — transparent, inherits.
  function read(el, cs, tokens) {
    const r = { el, bg: null, fg: null, bd: null, surf: null, own: false };
    const bg = parse(cs.backgroundColor);
    const img = cs.backgroundImage && cs.backgroundImage !== "none";
    if (bg && bg.a >= 0.35) {
      r.own = true;
      const t = tokens[key(bg)];
      const L = lum(bg);
      if (t) r.surf = t;
      else if (img) r.surf = "light";
      else if (L >= BG_LIGHT) {
        if (spread(bg) <= NEUTRAL) {
          r.kind = L >= BG_WHITE ? "white" : "grey";
          const sh = cs.boxShadow && cs.boxShadow !== "none";
          const rad = parseFloat(cs.borderTopLeftRadius) >= 2 || parseFloat(cs.borderBottomRightRadius) >= 2;
          r.panel = sh || rad || sidesOf(cs).length >= 3;
        } else {
          r.kind = "tint";
          r.hue = bucket(bg);
        }
      } else {
        // A solid mid-tone colour we leave as it is. A see-through one shows the
        // dark page under it, so the colour that shows decides: light text where
        // it comes out dark, the chip's dark text where it stays light.
        // decide() looks again once it knows what is under it.
        const solid = bg.a >= 0.9, shown = solid ? L : lum(over(bg, page));
        r.surf = solid ? (L < MID ? "dark" : "light") : shown < FLIP ? "3" : "light";
        r.chip = solid ? L >= MID : shown >= FLIP;
        if (solid) r.shown = bg; else r.see = bg;
      }
    } else if (img) {
      r.own = true;
      r.surf = "light";
    }
    const fg = parse(cs.color);
    if (fg && fg.a >= 0.4 && lum(fg) < FG_DARK) r.fgDark = fg;
    if (fg && fg.a >= 0.4 && lum(fg) > 0.5) r.fgLight = true;
    const sides = sidesOf(cs);
    if (sides.some((x) => x.light)) r.sides = sides;
    // Legacy headers emboss their text with a white shadow, which blurs it once
    // the text is light.
    if (cs.textShadow && cs.textShadow !== "none") {
      const sc = parse(cs.textShadow);
      if (sc && sc.a > 0.2 && lum(sc) > 0.5) r.shadow = true;
    }
    return r;
  }

  // What an element's ancestors resolve to, for elements outside the current batch.
  function outer(el, tokens, batch) {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const b = batch.get(p);
      if (b && b.surf) return b.surf;
      if (b) continue;
      if (p === document.body || p === document.documentElement) return "1";
      const cs = getComputedStyle(p);
      const bg = parse(cs.backgroundColor);
      if (cs.backgroundImage && cs.backgroundImage !== "none" && (!bg || bg.a < 0.35)) return "light";
      if (!bg || bg.a < 0.35) continue;
      const t = tokens[key(bg)];
      if (t) return t;
      const tag = p.getAttribute("data-bc-dbg");
      if (tag) return tag.charAt(0) === "h" ? "h" : tag;
      if (bg.a < 0.9) return lum(over(bg, beneath(p, tokens, batch))) < FLIP ? "3" : "light";
      return lum(bg) < MID ? "dark" : "light";
    }
    return "1";
  }

  // What shows under a see-through background: the nearest fill we leave as it
  // is, or the dark page once that fill is darkened.
  function beneath(el, tokens, batch) {
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const b = batch.get(p);
      if (b) { if (b.own) return b.shown || page; continue; }
      const cs = getComputedStyle(p);
      if (cs.backgroundImage && cs.backgroundImage !== "none") return page;
      const bg = parse(cs.backgroundColor);
      if (!bg || bg.a < 0.35) continue;
      if (tokens[key(bg)] || p.hasAttribute("data-bc-dbg") || lum(bg) >= BG_LIGHT) return page;
      return bg.a >= 0.9 ? bg : over(bg, beneath(p, tokens, batch));
    }
    return page;
  }

  // Whether the nearest ancestor with a background is a solid mid-tone colour that
  // stays light. Photos and images don't count: text over them is left alone.
  function insideChip(el, tokens, batch) {
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const b = batch.get(p);
      if (b) { if (b.own) return !!b.chip; continue; }
      const cs = getComputedStyle(p);
      if (cs.backgroundImage && cs.backgroundImage !== "none") return false;
      const bg = parse(cs.backgroundColor);
      if (!bg || bg.a < 0.35) continue;
      if (p.hasAttribute("data-bc-dbg") || lum(bg) >= BG_LIGHT) return false;
      return bg.a >= 0.9 ? lum(bg) >= MID : lum(over(bg, beneath(p, tokens, batch))) >= FLIP;
    }
    return false;
  }

  function decide(r, tokens, batch) {
    const out = { dbg: null, dfg: null, dbd: null };
    if (r.el === document.body || r.el === document.documentElement) { r.surf = "1"; return out; }
    if (r.see) {
      r.shown = over(r.see, beneath(r.el, tokens, batch));
      r.chip = lum(r.shown) >= FLIP;
      r.surf = r.chip ? "light" : "3";
    }
    if (r.kind) {
      if (r.kind === "tint") { out.dbg = "h" + r.hue; r.surf = "h"; }
      else if (r.kind === "grey") { out.dbg = "3"; r.surf = "3"; }
      else if (r.panel) { out.dbg = "2"; r.surf = "2"; }
      else {
        // A plain white box takes the layer it sits on: white-on-white in Canvas is
        // seamless, so it should stay seamless in the dark (no lighter bands).
        const around = outer(r.el, tokens, batch);
        out.dbg = around === "1" ? "1" : around === "dark" ? "3" : "2";
        r.surf = out.dbg;
      }
    }
    // Transparent elements keep surf null, so their children look further up.
    const surf = r.surf || outer(r.el, tokens, batch);
    const darkAfter = surf !== "light";

    // A solid mid-tone background we leave light (a pasted table colour, a pale
    // chip) kept the page's light text: light text on #ffd966 measured 1.24:1.
    // The chip pins dark text, and so does light text inside one, links included.
    if (!darkAfter && ((r.own && r.chip) || (r.fgLight && insideChip(r.el, tokens, batch)))) out.dfg = "k";
    if (r.fgDark) {
      if (!darkAfter) {
        // Dark text on a chip we leave light. It may only be dark because it
        // inherits Canvas's colour from an ancestor we're about to lighten, so the
        // chip pins it.
        if (r.own || r.el.tagName === "A") out.dfg = "k";
      } else if (surf !== "dark") {
        const c = r.fgDark;
        out.dfg = spread(c) < 40 ? (lum(c) < 0.05 ? "t" : "m") : "h" + bucket(c);
      }
    }
    if (darkAfter) {
      const marks = r.sides ? r.sides.filter((x) => x.light).map((x) => x.s) : [];
      if (r.shadow) marks.push("x");
      if (marks.length) out.dbd = marks.join(" ");
    }
    return out;
  }

  // ---- passes ---------------------------------------------------------------

  const stats = { scans: 0, last: 0, ms: 0, tagged: 0, fullMs: 0 };

  function collect(root) {
    const list = [];
    if (root.nodeType !== 1) return list;
    if (eligible(root)) list.push(root);
    const all = root.getElementsByTagName("*");
    for (let i = 0; i < all.length; i++) if (eligible(all[i])) list.push(all[i]);
    return list;
  }

  function setAttr(el, name, v) {
    if (v) { if (el.getAttribute(name) !== v) el.setAttribute(name, v); }
    else if (el.hasAttribute(name)) el.removeAttribute(name);
  }

  function pass(roots) {
    const t0 = performance.now();
    const els = [];
    const seen = new Set();
    for (const root of roots) {
      if (!root.isConnected) continue;
      for (const el of collect(root)) if (!seen.has(el)) { seen.add(el); els.push(el); }
    }
    if (!els.length) return;
    // Freeze transitions while we work. Canvas animates background-color on most
    // buttons and nav links, and a read taken mid-fade returns the in-between
    // colour (often still transparent), which left those controls white. Writing
    // the tags while frozen also means they snap in rather than fading from white.
    const frozen = roots.filter((r) => r.isConnected);
    for (const r of frozen) r.setAttribute("data-bc-dscan", "");
    // 1. Forget what we decided before, so every read below is Canvas's own value.
    for (const el of els) if (el.hasAttribute("data-bc-dbg") || el.hasAttribute("data-bc-dfg") || el.hasAttribute("data-bc-dbd")) {
      for (const a of ATTRS) el.removeAttribute(a);
    }
    // 2. Read everything (one style recalc), then decide in document order so an
    // element's ancestors are always settled first.
    const tokens = readTokens();
    const batch = new Map();
    const rows = els.map((el) => { const r = read(el, getComputedStyle(el), tokens); batch.set(el, r); return r; });
    const decisions = rows.map((r) => decide(r, tokens, batch));
    // 3. Write.
    let tagged = 0;
    for (let i = 0; i < rows.length; i++) {
      const el = rows[i].el, d = decisions[i];
      setAttr(el, "data-bc-dbg", d.dbg);
      setAttr(el, "data-bc-dfg", d.dfg);
      setAttr(el, "data-bc-dbd", d.dbd);
      if (d.dbg || d.dfg || d.dbd) tagged++;
    }
    // Resolve the new colours while transitions are still frozen. Unfreezing in
    // the same task left the light values from step 2 as the "before" state, so
    // every rescan faded Canvas's animated buttons from light to dark.
    if (frozen.length) void getComputedStyle(frozen[0]).backgroundColor;
    for (const r of frozen) r.removeAttribute("data-bc-dscan");
    stats.scans++;
    stats.last = els.length;
    stats.tagged = tagged;
    stats.ms = Math.round(performance.now() - t0);
    if (roots[0] === document.body) stats.fullMs = Math.max(stats.fullMs, stats.ms);
  }

  // ---- live updates ---------------------------------------------------------

  let running = false;
  let mo = null;
  let queued = new Set();
  let timer = 0, frame = 0, lastFlush = 0;

  function flush() {
    timer = 0; frame = 0; lastFlush = performance.now();
    const roots = [...queued].filter((n) => n.isConnected);
    queued = new Set();
    if (!running || !roots.length) return;
    // Many scattered changes (a re-render) are cheaper as one full pass.
    if (roots.length > 150) { pass([document.body]); return; }
    // Drop roots inside other roots.
    const top = roots.filter((n) => !roots.some((m) => m !== n && m.contains(n)));
    pass(top);
  }

  function enqueue(n) {
    if (n.nodeType !== 1 || n.closest(OURS)) return;
    queued.add(n);
    if (timer || frame) return;
    // The first change after a quiet spell is darkened before the next paint, so
    // a new panel never shows white. A burst right after a pass waits out 90ms.
    const wait = 90 - (performance.now() - lastFlush);
    if (wait > 0) timer = setTimeout(flush, wait); else frame = requestAnimationFrame(flush);
  }

  function onMutations(muts) {
    for (const m of muts) {
      if (m.type === "childList") { for (const n of m.addedNodes) enqueue(n); }
      else enqueue(m.target);
    }
  }

  // Backgrounds that only turn light on :hover never show up in a scan. Nor do
  // light chips that turn dark on :hover, whose pinned dark text would vanish;
  // those get data-bc-dhovdark. Checked again after Canvas's ~200ms colour fade.
  let hoverFrame = 0, hoverTarget = null, hoverTimer = 0;
  function hoverCheck() {
    if (!running) return;
    let el = hoverTarget && hoverTarget.nodeType === 1 ? hoverTarget : null;
    for (let i = 0; el && i < 4; i++, el = el.parentElement) {
      if (el === document.body || el.hasAttribute("data-bc-dbg") || el.hasAttribute("data-bc-dhov")) continue;
      if (!eligible(el)) return;
      const cs = getComputedStyle(el);
      const bg = parse(cs.backgroundColor);
      if (!bg || bg.a < 0.35 || cs.backgroundImage !== "none") continue;
      if (lum(bg) >= BG_LIGHT) el.setAttribute("data-bc-dhov", "");
      else if (lum(bg) < MID && el.getAttribute("data-bc-dfg") === "k" && el.matches(":hover")) el.setAttribute("data-bc-dhovdark", "");
    }
  }
  function onOver(e) {
    hoverTarget = e.target;
    if (hoverFrame) return;
    hoverFrame = requestAnimationFrame(() => { hoverFrame = 0; hoverCheck(); });
    clearTimeout(hoverTimer); hoverTimer = setTimeout(hoverCheck, 300);
  }

  // A scan at document_start runs before Canvas's stylesheets have applied, and
  // stylesheet loads aren't DOM mutations, so nothing would ever correct it. Full
  // passes follow the page's own load milestones and any stylesheet it adds later.
  let fullTimer = 0;
  function fullSoon(ms) {
    if (!running) return;
    clearTimeout(fullTimer);
    fullTimer = setTimeout(() => { fullTimer = 0; if (running) pass([document.body]); }, ms);
  }
  const onReady = () => fullSoon(0);
  const onLoad = () => { fullSoon(0); setTimeout(() => fullSoon(0), 1200); };
  let headMo = null;
  function watchStylesheets() {
    if (!document.head) return;
    headMo = new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeName === "LINK" && /stylesheet/i.test(n.rel || "")) {
          n.addEventListener("load", () => fullSoon(250), { once: true });
        }
      }
    });
    headMo.observe(document.head, { childList: true });
  }

  function clearAll() {
    for (const el of document.querySelectorAll(TAGGED + ",[data-bc-dhov],[data-bc-dhovdark]")) {
      for (const a of ATTRS) el.removeAttribute(a);
      el.removeAttribute("data-bc-dhov");
      el.removeAttribute("data-bc-dhovdark");
    }
  }

  BC.darkEngine = {
    baseCss,
    tagCss,
    stats,
    get running() { return running; },

    start() {
      if (running || !document.body) return;
      running = true;
      pass([document.body]);
      mo = new MutationObserver(onMutations);
      mo.observe(document.body, {
        childList: true, subtree: true, attributes: true,
        attributeFilter: ["class", "style", "aria-selected", "aria-current", "aria-expanded", "aria-checked"],
      });
      document.addEventListener("mouseover", onOver, { capture: true, passive: true });
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", onReady, { once: true });
      if (document.readyState !== "complete") window.addEventListener("load", onLoad, { once: true });
      watchStylesheets();
    },

    stop() {
      if (!running) return;
      running = false;
      if (mo) { mo.disconnect(); mo = null; }
      if (headMo) { headMo.disconnect(); headMo = null; }
      if (timer) { clearTimeout(timer); timer = 0; }
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
      if (fullTimer) { clearTimeout(fullTimer); fullTimer = 0; }
      queued = new Set();
      document.removeEventListener("mouseover", onOver, { capture: true });
      document.removeEventListener("DOMContentLoaded", onReady);
      window.removeEventListener("load", onLoad);
      clearAll();
    },

    // Re-derive everything, e.g. after the palette changes.
    rescan() { if (running) pass([document.body]); },
  };
})();
