/*
 * Better Canvas — scheduled theme rotation.
 * Cycles through the user's selected themes once per day or week. Applies at
 * most once per period (tracked in bcLocal.lastRotation) so it never fights
 * manual theme changes mid-period.
 */
(function () {
  "use strict";
  const BC = (globalThis.BC = globalThis.BC || {});
  BC.features = BC.features || {};

  const DAY = 864e5;

  let rotating = false;
  let failedPeriod = null;

  function apply(settings) {
    const r = settings.theming && settings.theming.rotation;
    if (!r || !r.enabled || !Array.isArray(r.themeIds) || !r.themeIds.length) return;
    // Bail until bcLocal is actually loaded. The guard below reads lastRotation from
    // it; when it was still null the guard read undefined, never tripped, and the
    // settings write re-entered apply() — repeated theme merges and toast spam.
    if (!BC.storage.local) return;
    if (rotating) return;

    // Periods count LOCAL days: dividing raw epoch ms rotated at UTC midnight, which
    // is mid-afternoon or evening across the Americas.
    const localDay = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / DAY);
    const idx = r.mode === "weekly" ? Math.floor(localDay / 7) : localDay;
    const period = (r.mode || "daily") + ":" + idx;
    const last = BC.storage.local.lastRotation;
    if (last?.period === period || failedPeriod === period) return;

    // Photo presets arrive with the settings workspace, not the page bundle.
    const wanted = r.themeIds[idx % r.themeIds.length];
    if (!BC.SettingsUI && BC.loadSettingsUI && !(settings.customThemes || []).concat(BC.PRESET_THEMES || []).some((t) => t && t.id === wanted)) {
      rotating = true;
      BC.loadSettingsUI().catch((e) => { failedPeriod = period; BC.diag.push("rotation", e); })
        .then(() => { rotating = false; if (BC.requestApply) BC.requestApply(); });
      return;
    }

    // The in-flight guard blocks re-entry until the theme and period both save.
    // Record successful rotations in storage. Failed attempts wait for the next period.
    rotating = true;
    let applied;
    BC.storage.update((d) => {
      applied = null;
      const rotation = d.theming.rotation;
      if (!rotation.enabled || !rotation.themeIds?.length) return;
      const index = rotation.mode === "weekly" ? Math.floor(localDay / 7) : localDay;
      const id = rotation.themeIds[index % rotation.themeIds.length];
      const theme = (d.customThemes || []).concat(BC.PRESET_THEMES || []).find((t) => t && t.id === id);
      if (!theme?.settings) return;
      BC.applyTheme(d, theme);
      applied = { period: (rotation.mode || "daily") + ":" + index, themeId: id, name: theme.name || id };
    }).then(() => {
        // A deleted saved theme leaves its id behind. Without this the unchanged
        // commit re-ran applyAll, which landed here again several times a second.
        if (!applied) { failedPeriod = period; return; }
        return BC.storage.updateLocal((d) => { d.lastRotation = { period: applied.period, themeId: applied.themeId }; })
          .then(() => BC.toast.info("Theme rotated: " + applied.name));
      })
      .catch((e) => { failedPeriod = applied?.period || period; BC.diag.push("rotation", e); })
      .then(() => { rotating = false; });
  }

  BC.registry.register({ id: "rotation", styles: [], nodes: [], apply, unmount() { rotating = false; } });
})();
