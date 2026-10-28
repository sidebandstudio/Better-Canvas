# Better Canvas 3.3.2

A customizable study workspace for Instructure Canvas — free forever, settings stored locally, no accounts, no telemetry.

- **Cross-browser.** Chrome (Manifest V3), Firefox, Zen.
- **Canvas API calls stay on your school's domain** and use your existing session. Theme search queries go to Openverse, and theme images load directly from their publishers. Canvas grades and coursework are not sent to the theme library.
- **No paywalls, no accounts.** Every feature ships free.

---

## Features

### Edit Canvas
- **Full-window editor** with grouped Themes, Appearance, Background, Dashboard, Widgets, To Do, Sidebar, and Accessibility controls. Responsive at laptop and phone widths.
- **Live preview** in Edit Canvas is a scaled copy of the Canvas page you opened it on, with your changes applied. Preview a theme, then Apply or Cancel; trying one never changes saved settings. Other controls save immediately and support Undo. The settings tab has no Canvas page to copy, so it shows a labeled sample.

### Appearance (30+ knobs)
- Dark mode: Off / On / Auto (system) / Scheduled window.
- **Dark mode inside iframes** — SpeedGrader submissions, New Quizzes, and other embedded Canvas frames.
- **6 dark palettes** (Neutral, Slate, Midnight, Nord, Dracula, Solarized) + **6 light palettes** + custom-background derivation.
- **22 complete theme packs** across Nature, Space, City, Art, Minimal, and Anime. Each includes a visible wallpaper, different course images, coordinated navigation and panels, and its own typography and shape treatment. Twelve original illustrated collections work offline; four photographic/art collections include 32 to 48 visually screened images with source and license credits. Twelve classic color palettes have a separate gallery.
- **Six anime looks** use 64 original painted course scenes across two collections and two full-size wallpapers. Each collection assigns 32 distinct scenes before extending larger rosters with unique illustrations. Fireflies, rain, stars and petals are CSS motion layers over the artwork; Still and reduced-motion controls stop them, and offscreen course cards pause. These assets work offline. [Artwork prompts](docs/artwork-prompts.txt).
- **Explore online** — search the growing [Openverse image library](https://api.openverse.org/v1/), load more results, and apply a photo or artwork in light or dark mode. Choose a wallpaper and the gallery collects different related images for the course cards. Small result sets are completed with matching original illustrations. Wallpaper is on by default. Selected online themes are saved locally with source and license credits. No API key needed. Requests are cached for ten minutes; Refresh fetches fresh results, and service outages/rate limits display a retry message.
- **Theme creator** — save your current look, including card artwork, export/import as JSON, and share without accounts. Original illustrations work offline. Photos load from their publishers and fall back to matching illustrations if unavailable.
- **Theme rotation** — cycle through selected themes daily or weekly.
- Accent color, custom font stack, five font-size scales, line-height + letter-spacing sliders.
- Density (Compact/Default/Spacious/Cozy), global corner-radius slider, rounded-vs-square UI toggle, sidebar-width control.
- **Color-blind modes** (Protanopia/Deuteranopia/Tritanopia). SVG filters shift colors you may confuse toward ones you can tell apart.
- **High-contrast**, **reduced-motion**, master **animation-speed slider**.
- Cursor styles (system, arrow, dot, ring, crosshair) with size and colour, and focus-ring styles, each with a picture of what it looks like.
- Institution logo: hide / replace with image / replace with text.

### Dashboard
- Card layouts: **Grid / List / Masonry / Compact**, with size and radius sliders.
- Drag-reorder, rename, recolor, hide, background-image per card.
- **Inline grade badge**, **progress bar**, **due-count badge**, **grade sparkline** from locally recorded history.
- Course search bar, hover-lift animation.
- **Semester progress bar** — "Week 9 of 15 · 43 days left" from your term dates.
- Auto-hide concluded courses.
- Widgets: To Do, Coming Up, Recent Feedback, View Grades, and an estimated-**GPA** card.

### Planner / To Do
Three modes:
- **Canvas default** — untouched.
- **Clean circles** — CSS restyle of the native list.
- **Planner widget** — completion **ring**, week nav, course filter, groupings (day/course/priority/tag/none), views (list/**kanban**/time-block), custom accent, star / snooze, personal tasks.
- **Progress styles:** Circle, Rainbow, Bar, Heart, Cloud, or None. Absolute or relative due dates, date/course grouping, rolling/Sunday/Monday week starts and configurable date windows.
- **Kanban board** with drag-and-drop status columns; dropping on Done completes the Canvas item.
- **Time-block view** — drag tasks onto a 7am–10pm day grid to schedule them.
- **Recurring tasks** (daily / weekly with weekday mask / monthly), **subtasks**, **tags**, and **priorities** with an item-detail popover.
- **Streaks** with configurable **grace days** + monthly **repairs** (fixes the #1 Tasks-for-Canvas complaint).
- **Pomodoro** timer with a persistent dock widget, task binding, and a local session log — survives reloads.

### Grades & GPA
- **Grade tools panel** on every course grades page: current score, goal tracker, "grade needed on final" solver, **weight donut**, **missing-assignments** warning.
- **Grade trend chart** — inline SVG of your locally stored grade history per course.
- **Rubric predictor** on assignment pages: slide each criterion and see the projected score plus its impact on your course grade.
- **Grade goals** with breach notifications.
- **What-if** grades (Canvas built-in stays on).
- **GPA calculator**: Standard 4.0 / 4.3 scale (A+ = 4.3) / High-school unweighted.
- Auto-refresh grades page (configurable interval).

### Notifications
- In-page toasts and **browser notifications** (opt-in via permission).
- Types: due-soon, new grade, new announcement, goal breach, streak-at-risk.
- Per-type toggles, **quiet hours** window, toolbar **badge counter** for items due in 24 hours.
- Configurable lead times (defaults 1h/4h/1d).

### Files
- **Cross-course library** — one panel that lists every file across every course, with search + type + course + sort filters.
- **Star / favorite** files and filter to just your starred ones, one-click open.

### Announcements
- **Aggregator** on the dashboard: recent announcements across all your courses, newest first.

### Modules & courses
- **Module progress bars** — per-module completion on the modules page plus a course-wide summary.

### Discussions
- **Collapse/expand all replies**, **jump to next unread**, reply/unread/word-count stats.
- **Instructor posts highlighted** with a left border and tag.

### Quizzes
- **Quiz draft saver** — classic-quiz answers are snapshotted locally as you type; if the tab crashes or closes, a restore banner brings them back. Crash protection only — it never answers or submits anything.

### Calendar
- **.ics export** of Canvas assignments + personal events (download).
- **Mini month view** on dashboard.
- **Syllabus date extraction** — scan the syllabus page for dates and add the ones you pick to the planner.

### Navigation
- Reorder / hide global-nav items; add custom global links.
- Hide / reorder course-nav tabs by label; add custom course links.
- Breadcrumbs style (default / compact / hidden), course **quick-switch tab bar**.

### Command palette & shortcuts
- **⌘K / Ctrl-K palette** — jump to any tab, any course, any command.
- **Rebindable shortcuts** for every action (⌘⇧S settings, ⌘⇧D dark, ⌥⇧T quick task, ⌥⇧N quick note, ⌘⇧F focus mode, g d/g/i/c to navigate). On Windows/Linux ⌘ is Ctrl and ⌥ is Alt.

### Productivity
- **Focus mode** on any Canvas page.
- **Reading ruler** and **reading-progress bar** on long pages. The progress bar is off by default.
- **Sticky notes** anywhere on Canvas, per URL.
- **Auto-save drafts** for every textarea, restored on next visit.
- **Word / character count** on all Canvas text editors.
- A **Tools** item in Canvas's menu with Copy link, Print, focus mode and a new sticky note. Printing leaves out Canvas's menus and Better Canvas overlays, in black on white.

### Assignment previews
- Hover over any assignment link to see a card with its title, due date, points, score and description. Escape or scrolling closes it, and Productivity has a switch for it.

### Accessibility
- **TTS "Speak"** button on assignments, announcements and discussion bodies. Off by default.
- **Larger click targets**, **dyslexia-friendly font stack**.
- Color-blind color correction. Reduced-motion honored.

### Insights
- **Study-time tracking**: time a Canvas tab is visible, focused and in use, per course per day, all local, with a 14-day chart in settings.
- **Grade trend sparklines** and **Pomodoro session history** in the same tab.

### Instructor helpers
- **Roster CSV export**, attendance quick-mark (P/A buttons + CSV), **ungraded-count badges** on the assignments index. They appear only in courses where you are a teacher, TA or designer.

### ChatGPT
- **Use your own ChatGPT plan.** Settings, ChatGPT, Continue with ChatGPT signs in on OpenAI's page with your ChatGPT Plus or Pro account, including Google, Apple or Microsoft logins. No API key. Pick a model, send a test message, see usage in ChatGPT settings, or disconnect.
- Tokens stay in the extension's own database and never reach Canvas pages. Requests go straight to api.openai.com.

### Study coach
- A dashboard section that ranks your courses by how far each sits from its goal, from Grade Tools or a default of 80%.
- For the next big assignment it works out the score you need, and how far that assignment can move your grade. Missing work shows what full credit would bring you to. Better Canvas does this math from Canvas's grade data, the same way Grade Tools does.
- With ChatGPT connected, **Make a study plan** asks your ChatGPT plan for study sessions built from your weakest scores, the syllabus, modules and announcements, with links to the Canvas pages. A course goes to ChatGPT only after you turn it on, and it asks first. ChatGPT never supplies a number the coach shows.
- **Add to planner** saves each session as a Canvas planner note at its time, and in the planner's Day view.
- Plans rewrite themselves when a grade posts or a due date moves, at most once a day per course. You can turn that off.

### Backgrounds & CSS
- Full-page background: solid / gradient / image / **repeating pattern** (dots, grid, diagonal, topography), blur + opacity.
- **Custom CSS** escape hatch, injected on every page.

### Data
- Export / import all settings.
- Reset all options. Recurring tasks, tags, grade goals, GPA credits, saved themes, custom links, course nicknames and planner data are kept.
- Undo/redo history (last 30 changes) inside the settings drawer. A burst of typing in one field is one step.

---

## Install (from source)

1. Build the unpacked extensions:
   ```powershell
   npm ci
   npm test
   powershell -ExecutionPolicy Bypass -File build.ps1
   ```
   This populates `dist/chrome` and `dist/firefox` after syntax-checking every JS file. Release archives use `Better-Canvas-3.3.2-Chromium.zip` and `Better-Canvas-3.3.2-Firefox.zip`.

2. Load it:
   - **Chrome**: `chrome://extensions` → Developer mode → **Load unpacked** → select `dist/chrome`.
   - **Firefox / Zen**: `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → select `dist/firefox/manifest.json`.

3. Open any `*.instructure.com` page. Better Canvas runs automatically.

### Custom school domains
For non-instructure.com Canvas (e.g. `canvas.yourschool.edu`), click the toolbar icon on that site. The settings tab that opens asks to allow that address, and the background service worker then registers the content scripts on it.

---

## Privacy

Your settings and local study data stay on this device. Image searches send your query to api.openverse.org. Photo themes and previews load images from third-party hosts. If you connect ChatGPT, sign-in goes through auth.openai.com and requests that use your plan go to api.openai.com. The study coach sends a course there only after you turn it on. No telemetry. Canvas calls go to your own Canvas instance using your existing cookies:

- **Reads (GET):** dashboard cards, courses/scores/terms, planner items, assignment groups, rubrics, modules, files, announcements, course people.
- **Writes (planner only):** mark a task complete, add a personal task (planner widget, syllabus extract, study coach sessions). Uses Canvas's CSRF token — same as the Canvas UI. Nothing else is ever written — no grades, no quiz answers.

Settings live in `bcSettings`. Everything device-local — sticky notes, drafts, quiz drafts, study time, grade history, and planner metadata (stars, snoozes, subtasks, kanban status, streaks) — lives in `bcLocal`. Export/import carries both, so a backup round-trips your planner state as well as your settings. Telemetry is hard-wired **off**.

---

## Architecture

Vanilla JavaScript. No framework. No bundler. Every module attaches to a shared `globalThis.BC` namespace and is loaded as a classic script in dependency order.

The settings workspace and the photo theme data, about 290 KB, are not in the page bundle. When the drawer first opens, or hovering its menu item warms it up, the background injects `theme-artwork.js` and the `src/shared/settings/` files other than `studio.js` into the page's content-script world. The options page loads them directly.

```
manifest.json / manifest.firefox.json    per-browser MV3 manifests
build.ps1                                copy src/ + right manifest into dist/{chrome,firefox}
src/
  shared/
    defaults.js                          settings schema + deep-merge + migrations
    themes.js                            preset themes + isDarkActive
    theme-library.js                     online image themes + source validation
    theme-artwork.js                     photographic collections + licenses
    theme-scenes.js                      offline scene collections + wallpapers
    tokens.js                            the single design-token emitter, shared by the
                                         page, the drawer's shadow root and the options
                                         page (+ the readability guard)
    settings/
      state.js                           undo/redo store, subscribe, adapter
      components.js                      Switch/Select/Slider/Sortable/Tags/Links/Keybind…
      index.js                           BC.SettingsUI.render(root, adapter) — every tab
  content/
    core/
      util.js, storage.js, injector.js, detect.js, observer.js
      lifecycle.js     feature registry + per-feature listener/interval bags + BC.diag
      ui.js            shared panel/card/tabs/skeleton/empty/error components
      datetime.js, color.js, cache.js, api.js, alarms.js, toast.js
      (color.js also carries the WCAG contrast helpers the token guard uses)
      shortcuts.js, commandPalette.js
    features/
      theming.js       dark/light palettes, accent, font, density, radius, focus ring, colorblind
      cosmetics.js     full-page background + custom CSS
      navigation.js    global/course nav + breadcrumbs + course tabs
      dashboard.js     cards, layouts, badges, inline grade, sparkline, hover preview
      todo.js          planner widget + kanban + time-block + recurring + streaks + Pomodoro
      grades.js        what-if, weight donut, final solver, trend chart, rubric predictor
      coach.js         study coach: needed scores per course, ChatGPT study plans, add to planner
      notifications.js due-soon + goal + announcement scans + in-page + browser toasts
      files.js         cross-course files library
      announcements.js aggregator panel
      calendar.js      .ics export + mini month view
      previews.js      hover assignment cards
      productivity.js  focus mode, reading ruler, sticky notes, drafts, word count, print
      accessibility.js TTS, color-blind correction filters
      instructor.js    roster CSV, attendance quick-mark, ungraded badges
      quizsaver.js     classic-quiz local draft autosave + restore banner
      modules.js       per-module + course progress bars
      semester.js      dashboard term-progress bar
      discussions.js   collapse, jump-to-unread, stats, instructor highlight
      insights.js      local study-time tracker
      syllabus.js      syllabus date extraction → planner
      rotation.js      daily/weekly theme rotation
      onboarding.js    first-run tour
      settings-panel.js  left-nav trigger + Shadow-DOM drawer
    frame.js           iframe-only dark mode (SpeedGrader, New Quizzes)
    content.js         entry: applies registered features, wires observer + shortcuts + palette
  background/
    service-worker.js  register dynamic scripts on custom domains + badge + context menu + toolbar icon
    chatgpt.js         ChatGPT plan sign-in, token refresh and streamed /v1/responses calls; the only code that holds tokens
    coach.js           study plans: opt-in and daily-limit checks, the ChatGPT request, and checking and saving the answer
  options/             standalone options page hosting the shared settings UI
```

### How it fits together

- **Features self-register** via `BC.registry.register({ id, styles, nodes, apply })`; `content.js` iterates the registry (theming first) and applies each feature's idempotent `apply(settings, ctx)` on every observer tick. Features swap keyed `<style>` text or toggle classes — re-applying is cheap and survives Canvas's React re-renders. Teardown derives its style/node keys from the registry.
- **`BC.lifecycle.bag(id)`** gives each feature scoped listeners/intervals that are cleared on disable; `pageBag(id)` also clears on SPA navigation. Errors land in the `BC.diag` ring buffer.
- **Settings UI is shared** via `BC.SettingsUI.render(rootEl, adapter)`. The in-page workspace backs it with live `BC.storage` + `BC.api`; the options page backs it with `chrome.storage` + messaging the active Canvas tab.
- **Dark mode / theming** is driven by CSS variables. `theming.js` emits one variable block and a static rule set consumes it — re-tinting is a single style swap.
- **Command palette + shortcuts** are wired centrally in `content.js` from `settings.shortcuts.bindings`, so users can rebind everything from Settings → Shortcuts.

### Adding a feature

1. Create `src/content/features/yourfeature.js` ending with `BC.registry.register({ id, styles: [...], nodes: [...], apply(settings, ctx) })` — declare every keyed style and node it injects so teardown can clean up.
2. Add any new settings to `src/shared/defaults.js`.
3. Register the script in both manifests and the `CONTENT_JS` list in `src/background/service-worker.js` (before `observer.js`).
4. Add controls to `src/shared/settings/index.js`.
5. Rebuild with `build.ps1`.

---

## Development

- After editing source, run `build.ps1` and reload the unpacked extension, then refresh Canvas.
- Pushing to GitHub doesn't update the Chrome Web Store copy. To ship a release there, follow [RELEASING.md](RELEASING.md).
- `build.ps1` runs `node --check` on every `.js` file before copying.
- Install test dependencies with `npm ci`, then run `npm test` to run every `tests/*.test.cjs` suite.
- Suites cover storage concurrency and targeted reads, sticky notes, grade rules and brute-force equivalence, grade input validation and slider batching, settings failures, options migrations, frame bundles, quiz toggles, dashboard loaders, privacy/manifests, themes and studio artwork.
- Run `node tests/headless-browser-check.cjs` after building. It requires a Playwright Chromium installation, `PLAYWRIGHT_BROWSERS_PATH` for its location and `BC_BROWSER_SCRATCH` for temporary browser files. It loads the unpacked Chromium extension and runs the studio browser checks against local synthetic pages.
- Run `node tests/firefox-check.cjs` after building to load `dist/firefox` in a real Firefox through geckodriver. Set `BC_FIREFOX` to `firefox.exe`, `BC_GECKODRIVER` to `geckodriver.exe` and `BC_BROWSER_SCRATCH`. It resolves every host name to this machine, uses the same local synthetic pages, and checks the settings drawer, a theme save, the WebP artwork and quiz drafts.
- `node tests/real-canvas-check.cjs` is opt-in. Set `BC_CANVAS_PAGES` to comma-separated `*.instructure.com` pages that open without a login, such as a public course syllabus. It only loads those pages, with dark mode off and then on, and reports extension errors, repeated failing requests and text contrast below WCAG AA.
- Run `node tests/studio-fixture.cjs` and open `http://light-vm.tailde9e5d.ts.net:8076` for a synthetic 32-course dashboard. It uses mocked extension storage and Canvas requests, with no school login or account data. Evaluate `tests/studio-browser-checks.js` in that page for the interactive checks. The fixture cannot verify an installed extension's permissions or a school's specific Canvas layout.
- Check the editor at 1440×900, 1280×800, and 390×844, including all tabs, scrolling, keyboard focus, and the Apply/Cancel bar.
