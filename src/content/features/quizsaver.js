/*
 * Better Canvas — quiz draft saver.
 * Crash protection for classic quizzes: snapshots answer inputs locally while
 * a quiz is being taken, and offers to restore them after a reload or crash.
 * Never answers questions and never submits anything on its own.
 */
(function () {
  "use strict";
  const BC = (globalThis.BC = globalThis.BC || {});
  BC.features = BC.features || {};

  const CSS = `
    .bc-quiz-banner {
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
      margin: 10px 0; padding: 10px 14px; border-radius: 10px;
      background: var(--bc-surface-2, #eef2ff); border: 1px solid var(--bc-border, #e5e7eb);
      font-size: 14px;
    }
    .bc-quiz-banner .bc-btn { padding: 4px 10px; }
    .bc-quiz-save-dot {
      position: fixed; bottom: 14px; left: 14px; z-index: var(--bc-z-dock, 2147480000);
      padding: 4px 10px; border-radius: 999px; font-size: 11px;
      background: var(--bc-surface-2, #f3f4f6); color: var(--bc-muted, #6b7280);
      border: 1px solid var(--bc-border, #e5e7eb); opacity: 0; transition: opacity .3s ease;
      pointer-events: none;
    }
    .bc-quiz-save-dot.show { opacity: 1; }
  `;

  const MAX_DRAFTS = 10;
  const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  let saverEnabled = false, saveTimer = null, submitted = false;

  function stop() {
    saverEnabled = submitted = false;
    clearTimeout(saveTimer); saveTimer = null;
    BC.lifecycle.clear("quizsaver");
  }

  function onTakePage(path) {
    return /^\/courses\/\d+\/quizzes\/\d+\/take/.test(path);
  }

  // Keyed by attempt as well as page. A timed auto-submit never clicks Submit, so
  // the next attempt used to open with a banner offering the old answers.
  function draftKey() {
    const attempt = document.querySelector('#submit_quiz_form input[name="attempt"], #submit_quiz_form [name="attempt"]');
    const path = location.pathname.replace(/\/$/, "");
    return attempt && attempt.value ? path + "#attempt-" + attempt.value : path;
  }
  // Every page of a one-question-at-a-time quiz has its own draft.
  const quizRoot = () => (location.pathname.match(/^\/courses\/\d+\/quizzes\/\d+/) || [""])[0];

  // The page is about to navigate, so this is one message to the background rather
  // than a read and a commit. `submitted` stops a save already in flight from
  // writing the draft back after it. If the page is still here 10 seconds later,
  // or the clear failed, the submit didn't go through and saving resumes.
  const SUBMIT_GRACE_MS = 10000;
  function deleteQuizDrafts() {
    const root = quizRoot();
    clearTimeout(saveTimer); saveTimer = null;
    if (!root) return Promise.resolve();
    submitted = true;
    BC.lifecycle.bag("quizsaver").timeout(() => { submitted = false; }, SUBMIT_GRACE_MS);
    return BC.storage.request({ type: "bc:quizSubmitted", root }).catch((e) => { submitted = false; throw e; });
  }

  // Essay answers are left out. Canvas moves them into a rich text editor in an
  // iframe, so typing there never reaches these listeners, and writing the hidden
  // textarea back changed nothing the student sees or submits.
  function collectInputs() {
    return Array.from(document.querySelectorAll(
      "#questions input[type=radio], #questions input[type=checkbox], " +
      "#questions input[type=text], #questions input[type=number], " +
      "#questions textarea:not(.question_input), #questions select"
    ));
  }

  function inputKey(el, idx) {
    const base = el.name || el.id || "i" + idx;
    return el.type === "radio" || el.type === "checkbox" ? base + ":" + el.value : base;
  }

  function snapshot() {
    const answers = {};
    collectInputs().forEach((el, idx) => {
      const key = inputKey(el, idx);
      if (el.type === "radio" || el.type === "checkbox") {
        if (el.checked) answers[key] = true;
      } else if (el.value) {
        answers[key] = el.value;
      }
    });
    return answers;
  }

  function flashSaved() {
    const dot = document.querySelector('[data-bc-node="bc-quiz-dot"]');
    if (!dot) return;
    dot.classList.add("show");
    BC.lifecycle.bag("quizsaver").timeout(() => dot.classList.remove("show"), 1200);
  }

  function saveDraft() {
    if (!saverEnabled || submitted || !onTakePage(location.pathname)) return;
    const answers = snapshot();
    const key = draftKey();
    BC.storage.updateLocal((d) => {
      if (!saverEnabled || submitted) return;
      const q = (d.quizDrafts = d.quizDrafts || {});
      if (!Object.keys(answers).length) { delete q[key]; return; }
      q[key] = { savedAt: Date.now(), answers };
      const keys = Object.keys(q);
      if (keys.length > MAX_DRAFTS) {
        keys.sort((a, b) => ((q[a] && q[a].savedAt) || 0) - ((q[b] && q[b].savedAt) || 0));
        for (const k of keys.slice(0, keys.length - MAX_DRAFTS)) delete q[k];
      }
    }).then(() => { if (saverEnabled && draftKey() === key) flashSaved(); }).catch(() => {});
  }

  function deleteDraft(key) {
    clearTimeout(saveTimer); saveTimer = null;
    return BC.storage.updateLocal((d) => {
      if (d.quizDrafts) delete d.quizDrafts[key];
    });
  }

  function diffCount(draft) {
    let n = 0;
    collectInputs().forEach((el, idx) => {
      const v = draft.answers[inputKey(el, idx)];
      if (v === undefined) return;
      if (el.type === "radio" || el.type === "checkbox") { if (!el.checked) n++; }
      else if (el.value !== v) n++;
    });
    return n;
  }

  function restore(draft) {
    let applied = 0;
    collectInputs().forEach((el, idx) => {
      const v = draft.answers[inputKey(el, idx)];
      if (v === undefined) return;
      if (el.type === "radio" || el.type === "checkbox") {
        if (!el.checked) {
          el.checked = true;
          el.dispatchEvent(new Event("change", { bubbles: true }));
          applied++;
        }
      } else if (el.value !== v) {
        el.value = v;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        applied++;
      }
    });
    if (applied) BC.toast.success("Restored " + applied + " answer" + (applied === 1 ? "" : "s"));
    else BC.toast.info("Your answers already match the saved draft");
  }

  function ensureBanner(draft) {
    const host = document.querySelector("#content") || document.body;
    const banner = BC.injector.ensureNode("bc-quiz-banner", host, () => {
      const div = document.createElement("div");
      div.className = "bc-quiz-banner";
      host.prepend(div);
      return div;
    });
    if (banner.dataset.bcBuilt) return;
    banner.dataset.bcBuilt = "1";
    const when = new Date(draft.savedAt).toLocaleString();
    const msg = document.createElement("span");
    msg.innerHTML = "💾 Better Canvas saved a local draft of your answers (<b>" +
      BC.util.escapeHtml(when) + "</b>). Restore them?";
    const yes = document.createElement("button");
    yes.className = "bc-btn"; yes.textContent = "Restore answers";
    yes.addEventListener("click", () => { restore(draft); BC.injector.removeNode("bc-quiz-banner"); });
    const no = document.createElement("button");
    no.className = "bc-btn"; no.textContent = "Discard draft";
    no.addEventListener("click", () => { deleteDraft(draftKey()).then(() => BC.injector.removeNode("bc-quiz-banner")).catch(() => {}); });
    banner.appendChild(msg); banner.appendChild(yes); banner.appendChild(no);
  }

  const debouncedSave = () => {
    if (!saverEnabled) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveTimer = null; saveDraft(); }, 800);
  };

  function pruneOld() {
    const q = BC.storage.local && BC.storage.local.quizDrafts;
    if (!q) return;
    const cutoff = Date.now() - MAX_AGE_MS;
    const stale = Object.keys(q).filter((k) => !q[k] || (q[k].savedAt || 0) < cutoff);
    if (stale.length) BC.storage.updateLocal((d) => {
      for (const k of stale) if (d.quizDrafts?.[k] && (d.quizDrafts[k].savedAt || 0) < cutoff) delete d.quizDrafts[k];
    });
  }

  function apply(settings, ctx) {
    const enabled = settings.productivity && settings.productivity.quizDraftSaver;
    const active = enabled && onTakePage(ctx.path) && !!document.querySelector("#questions");
    if (!active) {
      stop();
      BC.injector.removeNode("bc-quiz-banner");
      BC.injector.removeNode("bc-quiz-dot");
      BC.injector.setStyle("bc-quiz-css", "");
      return;
    }
    saverEnabled = true;
    BC.injector.setStyle("bc-quiz-css", CSS);
    BC.injector.ensureNode("bc-quiz-dot", document.body, () => {
      const dot = document.createElement("div");
      dot.className = "bc-quiz-save-dot";
      dot.textContent = "Draft saved";
      document.body.appendChild(dot);
      return dot;
    });

    const bag = BC.lifecycle.bag("quizsaver");
    bag.once("listeners", () => {
      const inQuestions = (t) => t && t.closest && t.closest("#questions");
      bag.listen(document, "change", (e) => { if (inQuestions(e.target)) debouncedSave(); }, true);
      bag.listen(document, "input", (e) => { if (inQuestions(e.target)) debouncedSave(); }, true);
      // Submitting the quiz makes every draft of it obsolete, on every page. Wait
      // until the event has run: a cancelled "submit anyway?" prompt prevents it,
      // and the drafts must survive that. A timed auto-submit sends no event, which
      // is why drafts are keyed by attempt.
      bag.listen(document, "submit", (e) => {
        if (!e.target || e.target.id !== "submit_quiz_form") return;
        // One question at a time: Next and Previous submit this form too.
        if (e.submitter && e.submitter.matches(".next-question, .previous-question")) return;
        setTimeout(() => { if (!e.defaultPrevented) deleteQuizDrafts().catch(() => {}); });
      }, true);
      // Back from a failed submit through the back/forward cache.
      bag.listen(window, "pageshow", (e) => { if (e.persisted) submitted = false; });
      BC.util.onReady(() => BC.requestApply && BC.requestApply());
    });

    // Offer the draft once, when the page has loaded. Saves wait 800 ms, so a
    // check on every apply saw each new answer as a difference from the draft
    // and offered to put the old one back.
    if (document.readyState === "loading") return;
    bag.once("offer", () => {
      pruneOld();
      const draft = BC.storage.local && BC.storage.local.quizDrafts && BC.storage.local.quizDrafts[draftKey()];
      if (draft && draft.answers && diffCount(draft) > 0) ensureBanner(draft);
    });
  }

  BC.registry.register({
    id: "quizsaver",
    styles: ["bc-quiz-css"],
    nodes: ["bc-quiz-banner", "bc-quiz-dot"],
    apply,
    unmount: stop,
  });
})();
