/*
 * Better Canvas — grades tools.
 * Injects a grade tools panel on /courses/:id/grades: what-if solver,
 * "grade needed on final" calculator, weight donut, grade goal tracker,
 * trend history, missing-assignment warning.
 */
(function () {
  "use strict";
  const BC = (globalThis.BC = globalThis.BC || {});
  BC.features = BC.features || {};

  BC.grades = BC.grades || {};

  BC.grades.gradePoints = function (score, scaleKey) {
    const scale = BC.GPA_SCALES[scaleKey] || BC.GPA_SCALES["standard-4"];
    for (const band of scale.bands) if (score >= band.min) return { points: band.points, letter: band.letter };
    return { points: 0, letter: "F" };
  };

  function keptAssignments(group) {
    const graded = (group.assignments || []).filter((a) => {
      const sub = a.submission;
      return !a.omit_from_final_grade && a.workflow_state !== "unpublished" &&
        !(a.submission_types || []).includes("not_graded") && sub && !sub.excused &&
        sub.workflow_state !== "pending_review" && sub.score != null && sub.score !== "" && Number.isFinite(Number(sub.score));
    });
    const rules = group.rules || {};
    const never = new Set((rules.never_drop || []).map(String));
    const fixed = graded.filter((a) => never.has(String(a.id)));
    let eligible = graded.filter((a) => !never.has(String(a.id)));
    if (!eligible.length) return fixed;
    const count = (n) => Number.isFinite(Number(n)) ? Math.max(0, Math.floor(Number(n))) : 0;
    const low = Math.min(count(rules.drop_lowest), eligible.length - 1);
    const high = low + count(rules.drop_highest) >= eligible.length ? 0 : count(rules.drop_highest);
    // Canvas drops by impact on the group's points ratio, not by assignment
    // percentage. Apply lowest first, then highest, and retain a droppable score.
    // https://community.instructure.com/en/kb/articles/660670-how-do-i-create-rules-for-an-assignment-group
    // Order and limits match Instructure's AssignmentGroupGradeCalculator:
    // https://github.com/instructure/canvas-lms/blob/master/ui/shared/grading/AssignmentGroupGradeCalculator.ts
    if (low) eligible = selectRatio(eligible, fixed, eligible.length - low, true);
    if (high) eligible = selectRatio(eligible, fixed, eligible.length - high, false);
    return fixed.concat(eligible);
  }
  const points = (a) => Math.max(0, Number(a.points_possible) || 0);
  const score = (a) => Number(a.submission.score);
  const idCollator = new Intl.Collator("en", { numeric: true });
  function selectRatio(eligible, fixed, keep, maximize) {
    const candidates = eligible.map((a) => ({ assignment: a, earned: score(a), possible: points(a), id: String(a.id) }));
    const fixedEarned = fixed.reduce((sum, a) => sum + score(a), 0);
    const fixedPossible = fixed.reduce((sum, a) => sum + points(a), 0);
    const tie = (a, b) => idCollator.compare(a.id, b.id);
    const totalPossible = fixedPossible + candidates.reduce((sum, a) => sum + a.possible, 0);
    if (!totalPossible) return candidates.sort((a, b) => (maximize ? b.earned - a.earned : a.earned - b.earned) || tie(a, b)).slice(0, keep).map((a) => a.assignment);
    // Fractional programming: rank score - q * possible, then try the selected
    // subset's exact ratio. Its zero residual proves the subset is optimal.
    // Usually this takes two or three sorts instead of 80 binary-search sorts.
    let q = (fixedEarned + candidates.reduce((sum, a) => sum + a.earned, 0)) / totalPossible;
    let best = null, bestRatio = maximize ? -Infinity : Infinity;
    for (let iteration = 0; iteration < 80; iteration++) {
      for (const a of candidates) a.residual = a.earned - q * a.possible;
      const ranked = candidates.slice().sort((a, b) => (maximize ? b.residual - a.residual : a.residual - b.residual) || tie(a, b));
      const chosen = ranked.slice(0, keep);
      if (!fixedPossible && !chosen.some((a) => a.possible > 0)) {
        const pointed = ranked.find((a) => a.possible > 0);
        if (pointed) chosen[chosen.length - 1] = pointed;
      }
      const possible = fixedPossible + chosen.reduce((sum, a) => sum + a.possible, 0);
      const earned = fixedEarned + chosen.reduce((sum, a) => sum + a.earned, 0);
      const ratio = earned / possible;
      if (best === null || (maximize ? ratio > bestRatio : ratio < bestRatio)) { best = chosen; bestRatio = ratio; }
      if (Math.abs(ratio - q) <= 1e-12 * Math.max(1, Math.abs(ratio))) break;
      q = ratio;
    }
    return best.map((a) => a.assignment);
  }

  const groupTotals = new WeakMap();
  function groupTotal(group) {
    // Include the fields that affect eligibility and drops. In-place API updates
    // invalidate this entry too; object identity alone would keep stale grades.
    const signature = JSON.stringify([group.rules, (group.assignments || []).map((a) => [a.id, a.points_possible,
      a.omit_from_final_grade, a.workflow_state, a.submission_types, a.submission?.score,
      a.submission?.excused, a.submission?.workflow_state])]);
    const cached = groupTotals.get(group);
    if (cached?.signature === signature) return cached;
    const kept = keptAssignments(group);
    const result = { signature, pts: kept.reduce((sum, a) => sum + score(a), 0), poss: kept.reduce((sum, a) => sum + points(a), 0) };
    groupTotals.set(group, result);
    return result;
  }

  BC.grades.computeTotal = function (groups) {
    const weighted = groups.some((g) => g.group_weight);
    let earned = 0, possible = 0;
    for (const group of groups) {
      const { pts, poss } = groupTotal(group);
      if (weighted) {
        if (poss > 0) { earned += pts / poss * (group.group_weight || 0); possible += group.group_weight || 0; }
      } else { earned += pts; possible += poss; }
    }
    return possible > 0 ? earned / possible * 100 : null;
  };

  const CSS = `
    .bc-grade-tools { margin: 16px 0; }
    .bc-grade-tools h3 { margin: 0 0 10px; font-size: 15px; }
    .bc-gt-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .bc-gt-card { padding: 10px; border-radius: 8px; background: var(--bc-surface-3, #f7fafc); }
    .bc-gt-total { font-size: 24px; font-weight: 800; }
    .bc-gt-label { color: var(--bc-muted, #6b7280); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
    .bc-gt-goal { display: flex; align-items: center; gap: 6px; }
    .bc-gt-goal input { padding: 4px; width: 68px; border: 1px solid var(--bc-border, #e5e7eb); border-radius: 4px; background: transparent; color: inherit; }
    .bc-gt-donut { display: flex; align-items: center; gap: 8px; }
    .bc-gt-legend li { list-style: none; font-size: 12px; }
    .bc-gt-legend span { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 4px; }
    .bc-gt-missing { color: var(--bc-danger, #b91c1c); font-size: var(--bc-text-xs, 12px); margin-top: 6px; }
    .bc-gt-final { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
    .bc-gt-final input { padding: 4px; width: 68px; border: 1px solid var(--bc-border, #e5e7eb); border-radius: 4px; background: transparent; color: inherit; }
    .bc-gt-trend { margin-top: 12px; }
    .bc-gt-trend-meta { display: flex; gap: 14px; font-size: 11px; color: var(--bc-muted, #6b7280); margin-top: 2px; }
    .bc-rubric { margin: 0 0 16px; }
    .bc-rubric h3 { margin: 0 0 8px; font-size: 15px; }
    .bc-rubric-crit { margin: 10px 0; }
    .bc-rubric-crit label { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; margin-bottom: 2px; }
    .bc-rubric-crit input[type="range"] { width: 100%; accent-color: var(--bc-accent, #4f46e5); }
    .bc-rubric-total { margin-top: 10px; font-weight: 700; }
    .bc-rubric-impact { font-size: 12px; color: var(--bc-muted, #6b7280); margin-top: 2px; }
  `;

  // No module-level Map. BC.api.assignmentGroups already goes through
  // BC.cache.wrap with a TTL and in-flight de-duplication, so the extra cache was
  // redundant — and by never expiring it was the thing that made the grade panel
  // show stale totals for the whole session after a new grade posted.
  function ensureGroups(courseId) {
    return BC.api.assignmentGroups(courseId);
  }

  // Same rule as the dashboard pill and notifications: current score, else final.
  function canvasScore(courseId) {
    return Promise.resolve().then(() => BC.api.coursesWithScores()).then((list) => {
      const c = list.find((x) => String(x.id) === String(courseId));
      const e = (c && c.enrollments || [])[0] || {};
      const s = e.computed_current_score != null ? e.computed_current_score : e.computed_final_score;
      return s == null ? null : Number(s);
    }).catch(() => null);
  }

  const finalInputs = new Map();   // courseId -> the "need on final" inputs as typed

  function donutSVG(groups, hasWeights) {
    // Show weight distribution
    if (!hasWeights) return "";
    let cum = 0;
    const total = groups.reduce((s, g) => s + (g.group_weight || 0), 0);
    if (total <= 0) return "";
    const R = 26, C = 2 * Math.PI * R;
    // Categorical ramp from the token set, so the donut re-tints per mode instead of
    // staying at fixed light-mode hues.
    const palette = ["var(--bc-cat-1)","var(--bc-cat-2)","var(--bc-cat-3)","var(--bc-cat-4)",
                     "var(--bc-cat-5)","var(--bc-cat-6)","var(--bc-cat-7)","var(--bc-cat-8)"];
    let arcs = "";
    let items = "";
    groups.forEach((g, i) => {
      const w = (g.group_weight || 0) / total;
      const dash = C * w;
      // A negative offset starts this arc where the previous one ended.
      arcs += `<circle cx="30" cy="30" r="${R}" fill="none" stroke="${palette[i%palette.length]}" stroke-width="8" stroke-dasharray="${dash} ${C-dash}" stroke-dashoffset="${-cum}" transform="rotate(-90 30 30)"/>`;
      cum += dash;
      items += `<li><span style="background:${palette[i%palette.length]}"></span>${BC.util.escapeHtml(g.name)} — ${Math.round(w*100)}%</li>`;
    });
    return `<div class="bc-gt-donut"><svg width="60" height="60">${arcs}</svg><ul class="bc-gt-legend">${items}</ul></div>`;
  }

  function trendSVG(hist) {
    if (!hist || hist.length < 2) return "";
    const scores = hist.map((h) => h.score);
    const min = Math.min(...scores), max = Math.max(...scores);
    const pad = Math.max((max - min) * 0.15, 0.5);
    const lo = min - pad, hi = max + pad;
    const W = 260, H = 56;
    const pts = scores.map((s, i) => {
      const x = (i / (scores.length - 1)) * (W - 8) + 4;
      const y = H - 6 - ((s - lo) / (hi - lo)) * (H - 12);
      return x.toFixed(1) + "," + y.toFixed(1);
    }).join(" ");
    const delta = scores[scores.length - 1] - scores[0];
    const sign = delta >= 0 ? "+" : "";
    const color = delta >= 0 ? "var(--bc-success)" : "var(--bc-danger)";
    const first = hist[0].date, lastPt = pts.split(" ").pop().split(",");
    return `<div class="bc-gt-trend">
      <div class="bc-gt-label">Grade trend since ${BC.util.escapeHtml(first)}</div>
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Grade trend chart">
        <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        <circle cx="${lastPt[0]}" cy="${lastPt[1]}" r="3" fill="${color}"/>
      </svg>
      <div class="bc-gt-trend-meta">
        <span>min ${min.toFixed(1)}%</span>
        <span>max ${max.toFixed(1)}%</span>
        <span style="color:${color}">${sign}${delta.toFixed(1)}%</span>
      </div>
    </div>`;
  }

  function render(courseId, settings) {
    const target = BC.util.firstOf(["#grades_summary", "#student-grades-right-content", "#GradeSummarySelectMenuGroup", "#main"]);
    if (!target) return;
    BC.injector.setStyle("bc-grade-tools", CSS);
    const panel = BC.injector.ensureNode("bc-grade-tools", target.parentNode || target, () => {
      const d = document.createElement("div");
      d.className = "bc-grade-tools bc-panel";
      target.parentNode.insertBefore(d, target);
      return d;
    });
    if (!panel.childElementCount) panel.replaceChildren(BC.ui.skeleton(4));
    Promise.all([ensureGroups(courseId), canvasScore(courseId)]).then(([groups, canvas]) => {
      // Canvas's own current score, the number the dashboard, goal alerts and
      // history use too. Our estimate only fills in when Canvas hides it.
      const total = canvas != null ? canvas : BC.grades.computeTotal(groups);
      const estimated = canvas == null && total != null;
      const hasWeights = groups.some((g) => g.group_weight);
      const goal = BC.gradeNumber(((settings.grades.goals || {})[courseId] || {}).target);
      const missing = [];
      for (const g of groups) for (const a of (g.assignments || [])) {
        const sub = a.submission;
        if (sub && sub.missing) missing.push(a);
      }

      recordHistory(courseId, total);

      // History plus a virtual point for today (the write above lands async).
      let hist = ((BC.storage.local && BC.storage.local.gradeHistory) || {})[courseId] || [];
      const today = BC.dt.ymd(new Date());
      if (total != null && !hist.some((e) => e.date === today)) {
        hist = hist.concat([{ date: today, score: +total.toFixed(3) }]);
      }

      // Skip the rebuild when nothing changed or while the user is typing in the panel.
      const sig = [courseId, total == null ? "" : total.toFixed(3), estimated ? 1 : 0, goal, missing.length, hist.length,
                   settings.grades.showWeightDonut ? 1 : 0, settings.grades.showMissingWarning ? 1 : 0,
                   settings.grades.showTrendChart ? 1 : 0].join("|");
      const ae = document.activeElement;
      const typing = ae && panel.contains(ae) && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA");
      if (panel.dataset.bcSig === sig || typing) return;
      panel.dataset.bcSig = sig;

      panel.innerHTML = `
        <h3>Grade Tools</h3>
        <div class="bc-gt-row">
          <div class="bc-gt-card">
            <div class="bc-gt-label">${estimated ? "Estimated course grade" : "Current course grade"}</div>
            <div class="bc-gt-total">${total != null ? total.toFixed(2) + "%" : "—"}</div>
            <div class="bc-gt-goal">Goal:
              <input type="number" min="0" max="150" step="0.5" aria-label="Course grade goal percent" data-goal>
              <span data-goal-status></span>
            </div>
            <div class="bc-gt-final">
              Need on final: <input type="number" min="0" max="150" placeholder="target %" aria-label="Final course target percent" data-target>
              of weight <input type="number" min="0" max="100" placeholder="weight %" aria-label="Final exam weight percent" data-weight>
              <span data-final-needed></span>
            </div>
          </div>
          <div class="bc-gt-card">
            <div class="bc-gt-label">Weights</div>
            ${settings.grades.showWeightDonut ? donutSVG(groups, hasWeights) : ""}
            ${settings.grades.showMissingWarning && missing.length ? `<div class="bc-gt-missing">⚠ ${missing.length} missing assignment${missing.length > 1 ? "s" : ""}</div>` : ""}
          </div>
        </div>
        ${settings.grades.showTrendChart ? trendSVG(hist) : ""}
      `;

      const goalInp = panel.querySelector("[data-goal]");
      goalInp.value = goal === null ? "" : String(goal);
      const goalStatus = panel.querySelector("[data-goal-status]");
      function refreshGoalStatus() {
        const g = BC.gradeNumber(goalInp.value);
        if (g === null || total == null) { goalStatus.textContent = ""; return; }
        goalStatus.textContent = total >= g ? "  ✓ on track" : "  ✗ below goal";
        goalStatus.style.color = total >= g ? "var(--bc-success)" : "var(--bc-danger)";
      }
      refreshGoalStatus();
      goalInp.addEventListener("change", () => {
        const g = BC.gradeNumber(goalInp.value);
        BC.storage.update((d) => { d.grades.goals[courseId] = { target: g, notify: true }; });
        refreshGoalStatus();
      });

      const target2 = panel.querySelector("[data-target]");
      const weight = panel.querySelector("[data-weight]");
      const out = panel.querySelector("[data-final-needed]");
      // The panel rebuilds after a goal save or an auto-refresh. Keep what was typed.
      const kept = finalInputs.get(courseId) || {};
      target2.value = kept.t || ""; weight.value = kept.w || "";
      function compute() {
        finalInputs.set(courseId, { t: target2.value, w: weight.value });
        const t = BC.gradeNumber(target2.value), w = BC.gradeNumber(weight.value, 100);
        if (t === null || w === null || w <= 0 || total == null) { out.textContent = ""; return; }
        // needed = (target - current * (1 - w/100)) / (w/100)
        const wf = w / 100;
        const current = total;
        const needed = (t - current * (1 - wf)) / wf;
        out.textContent = needed > 100 ? ` = ${needed.toFixed(1)}%, more than a perfect score` :
          needed <= 0 ? " = already secured" : ` = ${needed.toFixed(1)}%`;
      }
      target2.addEventListener("input", compute);
      weight.addEventListener("input", compute);
      compute();
    }).catch((e) => {
      BC.util.warn("grades", e);
      panel.dataset.bcSig = "";
      panel.replaceChildren(BC.ui.errorState("Couldn't load grade data.", () => render(courseId, settings)));
    });
  }

  // ---- Rubric predictor (assignment pages) ----

  function computeTotalWith(groups, assignmentId, score) {
    const cloned = groups.map((g) => !(g.assignments || []).some((a) => String(a.id) === String(assignmentId)) ? g : Object.assign({}, g, {
      assignments: (g.assignments || []).map((a) =>
        String(a.id) === String(assignmentId) ? Object.assign({}, a, { submission: { score } }) : a),
    }));
    return BC.grades.computeTotal(cloned);
  }
  // The study coach asks what one more score would do to the course grade.
  BC.grades.computeTotalWith = computeTotalWith;

  function buildRubricUI(panel, asn, rubric, groups, courseId) {
    const aid = String(asn.id);
    const draft = ((BC.storage.local && BC.storage.local.rubricDrafts) || {})[aid] || {};
    const assessment = asn.rubric_assessment || {};
    const maxTotal = rubric.reduce((s, c) => s + (c.points || 0), 0);

    let rows = "";
    for (const c of rubric) {
      const assessed = assessment[c.id] && assessment[c.id].points;
      const max = BC.gradeNumber(c.points, Number.MAX_SAFE_INTEGER) || 0;
      const start = BC.gradeNumber(draft[c.id], max) ?? BC.gradeNumber(assessed, max) ?? max;
      rows += `
        <div class="bc-rubric-crit" data-crit="${BC.util.escapeHtml(String(c.id))}" data-max="${c.points || 0}">
          <label><span>${BC.util.escapeHtml(c.description || "Criterion")}</span>
            <span><b data-val>${start}</b> / ${c.points || 0}</span></label>
          <input type="range" min="0" max="${max}" step="0.5" value="${start}" aria-label="${BC.util.escapeHtml(c.description || "Criterion")} points">
        </div>`;
    }

    panel.innerHTML = `
      <h3>Rubric predictor</h3>
      ${rows}
      <div class="bc-rubric-total" data-total></div>
      <div class="bc-rubric-impact" data-impact></div>
    `;

    let edits = {};
    const saveDraft = BC.util.debounce(() => {
      const patch = { ...edits };
      BC.storage.updateLocal((d) => {
        const rd = (d.rubricDrafts = d.rubricDrafts || {});
        Object.assign((rd[aid] = rd[aid] || {}), patch);
      }).then(() => {
        for (const key of Object.keys(patch)) if (edits[key] === patch[key]) delete edits[key];
      }).catch(() => {});
    }, 500);

    const totalEl = panel.querySelector("[data-total]");
    const impactEl = panel.querySelector("[data-impact]");
    const current = groups ? BC.grades.computeTotal(groups) : null;
    function refresh() {
      let sum = 0;
      for (const row of panel.querySelectorAll(".bc-rubric-crit")) {
        const v = parseFloat(row.querySelector("input").value) || 0;
        row.querySelector("[data-val]").textContent = v;
        sum += v;
      }
      const pct = maxTotal > 0 ? (sum / maxTotal) * 100 : 0;
      totalEl.textContent = `Projected: ${sum} / ${maxTotal} (${pct.toFixed(1)}%)`;
      if (groups) {
        const points = asn.points_possible || maxTotal;
        const scaled = maxTotal > 0 ? (sum / maxTotal) * points : 0;
        const projected = computeTotalWith(groups, aid, scaled);
        if (projected != null) {
          impactEl.textContent = `Course grade if scored: ${projected.toFixed(2)}%` +
            (current != null ? ` (now ${current.toFixed(2)}%)` : "");
        }
      }
      if (Object.keys(edits).length) saveDraft();
    }
    let frame = null;
    panel.addEventListener("input", (e) => {
      if (e.target?.type !== "range") return;
      edits[e.target.closest(".bc-rubric-crit").dataset.crit] = parseFloat(e.target.value) || 0;
      if (frame !== null) return;
      frame = requestAnimationFrame(() => { frame = null; if (panel.isConnected) refresh(); });
    });
    refresh();
  }

  function renderRubric(courseId, assignmentId, settings) {
    const host = BC.util.firstOf(["#right-side", "#assignment_show", "#content"]);
    if (!host) return;
    BC.injector.setStyle("bc-grade-tools", CSS);
    const panel = BC.injector.ensureNode("bc-rubric", host, () => {
      const d = document.createElement("div");
      d.className = "bc-rubric bc-panel";
      host.insertBefore(d, host.firstChild);
      return d;
    });
    if (panel.dataset.bcBuilt === String(assignmentId)) return; // build once; sliders are interactive
    panel.dataset.bcBuilt = String(assignmentId);
    panel.replaceChildren(BC.ui.skeleton(3));
    Promise.all([
      BC.api.assignment(courseId, assignmentId),
      ensureGroups(courseId).catch(() => null),
    ]).then(([asn, groups]) => {
      const rubric = asn && asn.rubric;
      if (!rubric || !rubric.length) { BC.injector.removeNode("bc-rubric"); return; }
      buildRubricUI(panel, asn, rubric, groups, courseId);
    }).catch((e) => {
      BC.util.warn("rubric", e);
      panel.dataset.bcBuilt = "";
      panel.replaceChildren(BC.ui.errorState("Couldn't load the rubric.", () => renderRubric(courseId, assignmentId, settings)));
    });
  }

  // Keyed by course AND day: a Set of course ids alone meant a tab left open across
  // midnight never recorded the new day's score.
  const historyRecorded = new Set();
  // Exported so the background notification scan can record history for EVERY
  // course, not just ones whose grades page happens to get visited. That single
  // caller is what makes the trend chart, dashboard sparklines and the Insights tab
  // actually accumulate data.
  BC.grades.recordScore = function (courseId, total) { return recordHistory(String(courseId), total); };
  // Days are LOCAL calendar days. toISOString() is UTC, so in the Americas the "day"
  // rolled over in the late afternoon and an evening visit was filed under tomorrow.
  function recordHistory(courseId, total) {
    const today = BC.dt.ymd(new Date());
    const key = courseId + ":" + today;
    if (total == null || historyRecorded.has(key)) return;
    // Today's point is usually there already, from an earlier page. Each page load
    // used to make a storage round trip per course to find that out.
    const known = ((BC.storage.local && BC.storage.local.gradeHistory) || {})[courseId];
    if (Array.isArray(known) && known.some((e) => e.date === today)) { historyRecorded.add(key); return; }
    return BC.storage.updateLocal((d) => {
      const gh = (d.gradeHistory = d.gradeHistory || {});
      const arr = gh[courseId] || [];
      if (!arr.some((e) => e.date === today)) arr.push({ date: today, score: +total.toFixed(3) });
      gh[courseId] = arr.slice(-90);
    }).then(() => { historyRecorded.add(key); }).catch(() => {});
  }

  function apply(settings, ctx) {
    const m = ctx.page === "assignment" ? ctx.path.match(/\/assignments\/(\d+)/) : null;
    const onAssignment = !!(m && ctx.courseId && settings.grades.rubricPredictor);
    const onGrades = ctx.page === "grades" && !!ctx.courseId &&
      settings.grades.panelEnabled;

    syncAutoRefresh(onGrades, settings, ctx);

    if (!onAssignment) BC.injector.removeNode("bc-rubric");
    if (!onGrades) BC.injector.removeNode("bc-grade-tools");
    if (!onAssignment && !onGrades) { BC.injector.setStyle("bc-grade-tools", ""); return; }

    if (onGrades) render(ctx.courseId, settings);
    if (onAssignment) renderRubric(ctx.courseId, m[1], settings);
  }

  // Auto-refresh was a headline README claim wired to nothing. No page reload
  // needed — invalidate the cached groups and re-render the existing panel.
  // pageBag means the interval dies on SPA navigation for free, and render()
  // already declines to rebuild while the user is typing in the panel. Switching it
  // off, or changing the interval, now replaces the timer: before, the first one
  // kept firing until the page was left, and a new interval stacked on top of it.
  function syncAutoRefresh(onGrades, settings, ctx) {
    const bag = BC.lifecycle.pageBag("grades");
    const want = onGrades && settings.grades.autoRefresh
      ? "auto:" + ctx.courseId + ":" + Math.max(1, settings.grades.autoRefreshMin | 0) : "";
    if (want ? bag.has(want) : !bag.has("armed")) return;
    bag.clear();
    if (!want) return;
    const mins = Math.max(1, settings.grades.autoRefreshMin | 0);
    bag.once("armed", () => {});
    bag.once(want, () => bag.interval(() => {
      BC.cache.invalidate("LIST " + location.origin + "/api/v1/courses/" + ctx.courseId + "/assignment_groups");
      render(ctx.courseId, BC.storage.current);
    }, mins * 60000));
  }

  BC.registry.register({ id: "grades", styles: ["bc-grade-tools"], nodes: ["bc-grade-tools", "bc-rubric"], apply });
})();
