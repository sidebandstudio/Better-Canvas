/*
 * Better Canvas — CSS injection manager.
 * Each feature owns one keyed <style> tag. Re-applying just swaps textContent,
 * so there is never a flash of duplicate styles and nothing leaks if disabled.
 * Tags are kept last in <head> so our rules win over Canvas's stylesheets.
 */
(function () {
  "use strict";
  const BC = (globalThis.BC = globalThis.BC || {});
  const tags = new Map();

  function host() {
    return document.head || document.documentElement;
  }

  const injector = (BC.injector = {
    // Create/update a keyed style tag. Empty/false css removes it.
    setStyle(key, css) {
      if (!css) return injector.removeStyle(key);
      let tag = tags.get(key);
      if (!tag || !tag.isConnected) {
        tag = document.createElement("style");
        tag.setAttribute("data-better-canvas", key);
        tags.set(key, tag);
      }
      if (tag.textContent !== css) tag.textContent = css;
      // Keep appended last so cascade order favors our rules — but only re-append
      // when we are actually no longer last. An unconditional appendChild is a
      // remove+insert per DOM spec, which invalidates the CSSOM and forces a
      // full-document style recalc; with ~20 keyed sheets per applyAll that was
      // the single largest source of idle jank. All of them move together, in the
      // order they were made: moving one at a time past a stylesheet Canvas added
      // later reversed them, so the static defaults ended up after the user's
      // theme and won.
      const h = host();
      const last = h.lastElementChild;
      if (tag.parentNode !== h || (last && !last.hasAttribute("data-better-canvas"))) for (const t of tags.values()) h.appendChild(t);
    },

    removeStyle(key) {
      const tag = tags.get(key);
      if (tag && tag.parentNode) tag.parentNode.removeChild(tag);
      tags.delete(key);
    },

    // Ensure a singleton DOM node identified by data-bc-node exists under parent.
    // factory() builds it the first time. Returns the node.
    ensureNode(id, parent, factory) {
      let node = document.querySelector(`[data-bc-node="${id}"]`);
      if (!node || !node.isConnected) {
        node = factory();
        node.setAttribute("data-bc-node", id);
        // Factories may attach the node themselves (e.g. prepend); only
        // append as a fallback when it is still detached.
        if (!node.isConnected) (parent || document.body || document.documentElement).appendChild(node);
      }
      return node;
    },

    removeNode(id) {
      document
        .querySelectorAll(`[data-bc-node="${id}"]`)
        .forEach((n) => n.remove());
    },
  });
})();
