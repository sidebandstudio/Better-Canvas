/* Better Canvas — in-memory API cache with TTL and request dedupe. */
(function () {
  "use strict";
  const BC = (globalThis.BC = globalThis.BC || {});

  const store = new Map();   // key -> {value, expires}
  const inflight = new Map(); // key -> promise

  BC.cache = {
    async wrap(key, ttlMs, fetcher) {
      const now = Date.now();
      const hit = store.get(key);
      if (hit && hit.expires > now) return hit.value;
      if (inflight.has(key)) return inflight.get(key);
      const p = Promise.resolve().then(fetcher).then((val) => {
        if (inflight.get(key) === p) {
          // Keys with a timestamp in them never hit again, so drop expired entries.
          for (const [k, v] of store) if (v.expires <= Date.now()) store.delete(k);
          store.set(key, { value: val, expires: now + ttlMs });
          inflight.delete(key);
        }
        return val;
      }).catch((e) => {
        if (inflight.get(key) === p) inflight.delete(key);
        throw e;
      });
      inflight.set(key, p);
      return p;
    },

    invalidate(prefix) {
      if (!prefix) { store.clear(); inflight.clear(); return; }
      for (const k of Array.from(store.keys())) if (k.indexOf(prefix) === 0) store.delete(k);
      for (const k of Array.from(inflight.keys())) if (k.indexOf(prefix) === 0) inflight.delete(k);
    },

    peek(key) {
      const hit = store.get(key);
      return hit && hit.expires > Date.now() ? hit.value : null;
    },
  };
})();
