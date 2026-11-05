/* Evaluate in the synthetic fixture served by studio-fixture.cjs. */
(async () => {
  if (chrome.runtime.id !== "audit-mock" || !["localhost", "127.0.0.1"].includes(location.hostname)) throw Error("Run only in the local synthetic fixture");
  const results = [], check = (value, message) => { if (!value) throw Error(message); results.push(message); };
  const root = document.querySelector("#bc-drawer").shadowRoot;
  const wait = () => new Promise((resolve) => setTimeout(resolve, 420));
  const until = async (test, message) => {
    for (let i = 0; i < 60; i++) { const value = await test(); if (value) return check(value, message); await new Promise((resolve) => setTimeout(resolve, 100)); }
    check(false, message);
  };
  const mirror = () => root.querySelector(".bcs-mirror iframe.is-front")?.contentDocument;
  const saved = () => new Promise((resolve) => chrome.storage.local.get("bcSettings", (r) => resolve(JSON.stringify(r.bcSettings))));
  const wallpaper = () => { const layer = mirror()?.querySelector("#bc-bg-layer"); return layer ? getComputedStyle(layer).backgroundImage : ""; };
  const click = (text) => {
    const button = [...root.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
    if (!button) throw Error("Missing button: " + text); button.click();
  };
  BC.SettingsUI.goto("themes");
  const initial = JSON.stringify(BC.storage.current), initialSaved = await saved();
  await until(() => mirror()?.querySelectorAll(".ic-DashboardCard").length === 32 && !mirror().querySelector("script, #bc-drawer"), "Live preview is a copy of this page without its scripts or the workspace");
  check(root.querySelector(".bcs-mirror iframe").getAttribute("sandbox") === "allow-same-origin" && root.querySelector(".bcs-mirror-shield"), "The copy can't run scripts or be clicked");
  root.querySelector('[aria-label="Preview theme Rainy After Hours"]').click();
  check(await saved() === initialSaved && BC.storage.current.cosmetics.motion === "rain", "Preview shows a theme on Canvas without saving it");
  await until(() => wallpaper().includes("anime-night-wallpaper"), "Live preview shows the theme being tried");
  check(!root.querySelector(".bcs-draft-bar").hidden, "Preview offers Apply and Cancel");
  click("Cancel");
  check(JSON.stringify(BC.storage.current) === initial && await saved() === initialSaved, "Cancel puts the original theme back");
  await until(() => !wallpaper().includes("anime-night-wallpaper"), "Live preview drops the cancelled theme");
  const frame = root.querySelector(".bcs-mirror iframe.is-front");
  check(frame.contentWindow.innerWidth === innerWidth && frame.contentWindow.innerHeight === innerHeight, "The copy has the window's own size");
  root.querySelector('[aria-label="Preview theme Rainy After Hours"]').click();
  const other = JSON.parse(await saved()); other.theming.lineHeight = 1.9;
  await new Promise((resolve) => chrome.storage.local.set({ bcSettings: other }, resolve)); await wait();
  click("Cancel");
  await until(() => BC.storage.current.theming.lineHeight === 1.9 && BC.storage.current.cosmetics.motion !== "rain", "A change from another tab during a theme preview lands after Cancel");
  const title = document.querySelector(".ic-DashboardCard__header-title span").firstChild, oldTitle = title.data;
  title.data = "Renamed course";
  await until(() => mirror()?.querySelector(".ic-DashboardCard__header-title span")?.textContent === "Renamed course", "Live preview follows a text change on the page");
  title.data = oldTitle;
  BC.SettingsUI.goto("theming");
  const lineHeight = root.querySelector('input[type="range"][aria-label="Line height"]');
  lineHeight.value = lineHeight.max; lineHeight.dispatchEvent(new Event("input", { bubbles: true }));
  await until(() => mirror() && getComputedStyle(mirror().body).lineHeight === getComputedStyle(document.body).lineHeight && mirror().querySelector('style[data-better-canvas="bc-theming"]').textContent === document.querySelector('style[data-better-canvas="bc-theming"]').textContent, "Live preview follows a slider as it moves");
  lineHeight.value = lineHeight.min; lineHeight.dispatchEvent(new Event("input", { bubbles: true }));
  BC.SettingsUI.goto("themes");
  root.querySelector('[aria-label="Preview theme Rainy After Hours"]').click();
  await wait(); await wait();
  check(BC.storage.current.cosmetics.motion === "rain" && JSON.parse(await saved()).theming.lineHeight === 1.1, "A save that lands during a theme preview leaves the theme showing");
  await until(() => wallpaper().includes("anime-night-wallpaper"), "Live preview keeps the theme through that save");
  click("Cancel");
  await until(() => BC.storage.current.cosmetics.motion !== "rain" && BC.storage.current.theming.lineHeight === 1.1, "Cancel then shows the saved settings");
  root.querySelector('[aria-label="Preview theme Rainy After Hours"]').click(); click("Apply theme"); await wait();
  check(BC.storage.current.cosmetics.motion === "rain", "Apply saves the selected full theme");
  const cards = [...document.querySelectorAll(".ic-DashboardCard__header_image")];
  check(new Set(cards.map((n) => getComputedStyle(n).backgroundImage + "|" + getComputedStyle(n).backgroundPosition)).size === 32, "32 course cards have distinct anime scenes");
  scrollTo(0, 600);
  check(document.querySelector(".ic-Dashboard-header").getBoundingClientRect().bottom < 0, "The scene dashboard header scrolls away with the page");
  scrollTo(0, 0);
  const bg = document.querySelector("#bc-bg-layer");
  check(getComputedStyle(bg).position === "fixed" && getComputedStyle(bg).backgroundImage.includes("anime-night-wallpaper"), "Full-size wallpaper stays fixed and retains its image");
  check(getComputedStyle(bg, "::after").animationName === "bc-scene-drift", "Wallpaper motion runs");
  check(getComputedStyle(cards.at(-1), "::after").animationPlayState === "paused", "Offscreen card motion pauses");
  await BC.storage.update((s) => { s.theming.reducedMotion = true; }); BC.applyNow();
  check(getComputedStyle(bg, "::after").animationName === "none", "Reduced-motion preference stops animation");
  await BC.storage.update((s) => { s.theming.reducedMotion = false; }); BC.applyNow();
  BC.SettingsUI.goto("theming");
  root.querySelector('[aria-label="Cursor"] [data-value="dot"]').click();
  await until(() => document.documentElement.getAttribute("data-bc-cursor") === "dot" && getComputedStyle(document.documentElement).cursor.startsWith('url("data:image/svg+xml') && getComputedStyle(document.querySelector("a")).cursor === "pointer", "A drawn cursor applies to the page and links keep their hand");
  check(root.querySelector(".bcs-cursor-pad").style.cursor.startsWith("url(") && root.querySelectorAll('[aria-label="Cursor"] img').length === 5, "Cursor cards and the Try it box show the cursor");
  root.querySelector('[aria-label="Cursor"] [data-value="default"]').click();
  await until(() => document.documentElement.getAttribute("data-bc-cursor") === "default" && getComputedStyle(document.documentElement).cursor === "auto", "The system cursor setting clears it");
  check(root.querySelectorAll('[aria-label="Focus ring"] .bcs-ring-demo').length === 3, "Focus ring choices each show the ring on a sample button");
  for (const id of ["themes", "theming", "cosmetics", "dashboard", "widgets", "todo", "navigation", "accessibility", "grades", "calendar", "files", "announcements", "productivity", "notifications", "shortcuts", "instructor", "insights", "about"]) {
    BC.SettingsUI.goto(id); check(root.querySelector(".bcs-main").childElementCount > 0, id + " section renders");
  }
  // Canvas's own sidebar markup (users/dashboard_sidebar.html.erb, shared/_event_list.html.erb)
  // and the newer header's View Grades button.
  document.querySelector("#right-side").insertAdjacentHTML("beforeend", '<div class="events_list coming_up" id="t-up"><h2>Coming Up</h2></div>' +
    '<div class="events_list recent_feedback" id="t-feedback"><h2>Recent Feedback</h2></div><div id="t-grades"><a href="/grades" class="Button button-sidebar-wide">View Grades</a></div>' +
    '<div id="t-teacher"><button type="button" id="start_new_course" class="btn button-sidebar-wide">Start a New Course</button><a href="/grades" class="Button button-sidebar-wide" id="t-teacher-grades">View Grades</a></div>');
  document.querySelector(".ic-Dashboard-header__layout").insertAdjacentHTML("beforeend", '<span id="t-header"><a id="ic-Dashboard-header__view_grades_button" href="/grades">View Grades</a></span>');
  const shown = (...ids) => ids.map((id) => getComputedStyle(document.getElementById(id)).display !== "none").join();
  const widget = (label) => root.querySelector('[aria-label="' + label + ' widget"]').click();
  BC.SettingsUI.goto("widgets");
  widget("Coming Up");
  await until(() => shown("t-up", "t-feedback") === "false,true", "Hiding Coming Up leaves Recent Feedback");
  widget("Coming Up"); widget("Recent Feedback");
  await until(() => shown("t-up", "t-feedback") === "true,false", "Hiding Recent Feedback leaves Coming Up");
  widget("Recent Feedback"); widget("View Grades");
  await until(() => shown("t-grades", "t-header", "t-teacher-grades", "t-teacher", "t-up", "t-feedback") === "false,false,false,true,true,true", "Hiding View Grades removes its sidebar and header buttons and nothing else");
  widget("View Grades");
  await until(() => shown("t-grades", "t-header", "t-teacher-grades") === "true,true,true", "View Grades comes back");
  for (const id of ["t-up", "t-feedback", "t-grades", "t-teacher", "t-header"]) document.getElementById(id).remove();
  BC.SettingsUI.goto("todo");
  root.querySelector('[aria-label="To Do list style"] [data-value="custom"]').click();
  for (const shape of ["ring", "rainbow", "bar", "heart", "cloud", "off"]) {
    root.querySelector('[aria-label="Progress shape"] [data-value="' + shape + '"]').click();
    check(shape === "off" ? BC.storage.current.todo.ring === false : BC.storage.current.todo.progressStyle === shape, shape + " progress setting applies");
  }
  root.querySelector('[aria-label="Progress shape"] [data-value="heart"]').click();
  root.querySelector('[aria-label="Due-date format"] [data-value="absolute"]').click();
  await BC.storage.update((s) => { s.dashboard.layout = "masonry"; s.dashboard.courses["100"] = { ...(s.dashboard.courses["100"] || {}), hidden: true }; }); BC.applyNow();
  check(getComputedStyle(document.querySelector(".ic-DashboardCard")).display === "none" && getComputedStyle(document.querySelectorAll(".ic-DashboardCard")[1]).display === "block", "A hidden course stays hidden in the masonry layout");
  await BC.storage.update((s) => { s.dashboard.layout = "grid"; s.dashboard.courses["100"].hidden = false; }); BC.applyNow();
  BC.features.settingsPanel.close();
  check(!document.body.inert, "Closing the editor restores Canvas interaction");
  BC.api.plannerItems = async () => [{ plannable_type: "assignment", plannable_date: new Date(Date.now() + 86400000).toISOString(), plannable: { id: 81, title: "Sample essay", points_possible: 10 }, course_id: 100, html_url: "/courses/100/assignments/81", planner_override: { marked_complete: false } }];
  BC.features.todo.apply(BC.storage.current, { page: "dashboard" }); await wait();
  const planner = document.querySelector('[data-bc-node="bc-todo-widget"]').shadowRoot;
  check(planner.querySelector(".bcs-progress-art svg path"), "Actual planner renders heart progress");
  check(/\d/.test(planner.querySelector(".pl-due").textContent) && !planner.querySelector(".pl-due").textContent.includes("Tomorrow"), "Actual planner uses absolute due dates");
  const loaded = await Promise.all(["bc-wall:anime-garden", "bc-wall:anime-night", "bc-art:anime-garden#0", "bc-art:anime-night#31"].map((url) => new Promise((resolve) => {
    const image = new Image(); image.onload = () => resolve(image.naturalWidth >= 1000); image.onerror = () => resolve(false); image.src = BC.themeMedia.resolve(url);
  })));
  check(loaded.every(Boolean), "Both atlases and high-resolution wallpapers decode");
  BC.features.settingsPanel.open("todo");
  await until(() => mirror()?.querySelector('[data-bc-node="bc-todo-widget"]')?.shadowRoot?.querySelector(".bcs-progress-art svg path"), "Live preview copies the planner widget with its heart progress");
  const marker = planner.querySelector(".bc-root").appendChild(Object.assign(document.createElement("p"), { className: "bc-test-marker", textContent: "Added later" }));
  await until(() => mirror()?.querySelector('[data-bc-node="bc-todo-widget"]')?.shadowRoot?.querySelector(".bc-test-marker"), "Live preview follows changes inside the planner widget");
  marker.remove();
  BC.SettingsUI.goto("themes");
  check(!auditErrors.length, "No browser runtime errors");
  window.bcStudioTestResults = results;
  return results;
})()
