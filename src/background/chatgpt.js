/*
 * Better Canvas — ChatGPT plan sign-in.
 * Follows OpenAI's open-source "Sign in with ChatGPT" flow, so a student can use
 * their own ChatGPT Plus or Pro plan without an API key. Only this background
 * context ever sees a token. Settings and Canvas pages get status messages back,
 * never credentials. Tokens live in this extension's own IndexedDB, which Canvas
 * pages and content scripts can't open, unlike chrome.storage.local.
 *
 * OpenAI's flow returns to a listener on http://127.0.0.1. An extension can't
 * listen on a port, so it opens sign-in in a tab it owns and reads the callback
 * address when that tab is sent there. PKCE makes the code useless to anything
 * else on the port.
 */
(function () {
  "use strict";

  const ISSUER = "https://auth.openai.com";
  const AUTHORIZE_URL = ISSUER + "/api/accounts/authorize";
  const TOKEN_URL = ISSUER + "/api/accounts/oauth/token";
  const DISCOVERY_URL = ISSUER + "/.well-known/openid-configuration";
  const API = "https://api.openai.com/v1";
  const SCOPES = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
  const PLAN_SCOPE = "chatgpt.tokens.use.direct";
  const NEW_CLIENT = "dynamic_agent_client";
  const APP_NAME = "Better Canvas";
  const CALLBACK_PATH = "/auth/callback";
  // Requested at Connect, never at install: required hosts would make Chrome turn
  // Better Canvas off for every existing user until they accepted a new warning.
  const ORIGINS = ["*://127.0.0.1/*", "https://auth.openai.com/*", "https://api.openai.com/*"];
  const USAGE_URL = "https://chatgpt.com/settings/usage";
  const PENDING_MS = 10 * 60 * 1000;
  const EARLY_REFRESH_MS = 2 * 60 * 1000;
  const CLOCK_SKEW_S = 60;
  // OpenAI's refresh errors that mean the refresh token can never work again.
  const DEAD_REFRESH = ["invalid_grant", "invalid_refresh_token", "token_expired", "refresh_token_expired",
    "refresh_token_invalidated", "refresh_token_reused"];

  // ---- small helpers ------------------------------------------------------

  function b64url(bytes) {
    let s = "";
    for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function fromB64url(s) {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }
  function fail(message, extra) { return Object.assign(new Error(message), extra || {}); }
  function toMs(v) {
    if (typeof v === "number" && isFinite(v)) return v < 1e12 ? v * 1000 : v;
    if (typeof v === "string") { const t = Date.parse(v); return isNaN(t) ? 0 : t; }
    return 0;
  }

  async function pkce(crypto) {
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    return { verifier, challenge };
  }

  // New registrations send dynamic_agent_client and the app name; a saved account
  // sends its issued client ID and the email it signed in with.
  function authorizeUrl(o) {
    const q = new URLSearchParams({ client_id: o.clientId || NEW_CLIENT });
    if (!o.clientId) q.set("agent_name_hint", APP_NAME);
    q.set("ext_agent_host_id", o.hostId);
    if (o.idTokenHint) q.set("id_token_hint", o.idTokenHint);
    if (o.loginHint) q.set("login_hint", o.loginHint);
    q.set("response_type", "code");
    q.set("redirect_uri", o.redirectUri);
    q.set("scope", SCOPES);
    q.set("resource", API);
    q.set("state", o.state);
    q.set("nonce", o.nonce);
    q.set("code_challenge_method", "S256");
    q.set("code_challenge", o.challenge);
    if (o.consent) q.set("prompt", "consent");
    return AUTHORIZE_URL + "?" + q.toString().replace(/\+/g, "%20");
  }

  // Is this the address the pending sign-in returns to? Chrome's "always use
  // secure connections" may have upgraded it to https, which is still ours.
  function isCallback(url, pending) {
    let u;
    try { u = new URL(url); } catch (_) { return false; }
    return /^https?:$/.test(u.protocol) && u.hostname === "127.0.0.1" &&
      u.port === String(pending.port) && u.pathname === CALLBACK_PATH;
  }

  function parseCallback(url, pending) {
    const p = new URL(url).searchParams;
    if (p.get("state") !== pending.state) throw fail("The ChatGPT sign-in didn't match this attempt. Try again.", { code: "state_mismatch" });
    const error = p.get("error");
    if (error === "access_denied") throw fail("You didn't allow Better Canvas to use your ChatGPT plan.", { code: error });
    if (error) throw fail("ChatGPT sign-in failed: " + error + ".", { code: error });
    const issued = p.get("client_id");
    let clientId = pending.clientId;
    if (clientId) {
      // A returning sign-in may leave client_id out. A different one would mean a
      // different registration, which must not replace this account's.
      if (issued && issued !== clientId) throw fail("ChatGPT returned a different app registration. Try again.", { code: "client_mismatch" });
    } else {
      if (!issued || issued === NEW_CLIENT) throw fail("ChatGPT didn't finish registering Better Canvas. Try again.", { code: "registration_incomplete" });
      clientId = issued;
    }
    const code = p.get("code");
    if (!code) throw fail("ChatGPT didn't send a sign-in code. Try again.", { code: "no_code" });
    return { code, clientId };
  }

  function decodeJwt(token) {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) throw fail("ChatGPT sent an invalid ID token.", { code: "bad_id_token" });
    const json = (s) => JSON.parse(new TextDecoder().decode(fromB64url(s)));
    return { header: json(parts[0]), payload: json(parts[1]), signed: parts[0] + "." + parts[1], signature: fromB64url(parts[2]) };
  }

  // Signature against OpenAI's published keys, then issuer, audience, expiry and nonce.
  async function verifyIdToken(token, { jwks, clientId, nonce, now, crypto }) {
    const bad = (why) => fail("ChatGPT's sign-in couldn't be verified (" + why + "). Try again.", { code: "bad_id_token" });
    const t = decodeJwt(token);
    if (t.header.alg !== "RS256") throw bad("algorithm");
    const jwk = (jwks.keys || []).find((k) => k.kid === t.header.kid && k.kty === "RSA");
    if (!jwk) throw bad("unknown key");
    const key = await crypto.subtle.importKey("jwk", { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, t.signature, new TextEncoder().encode(t.signed));
    if (!ok) throw bad("signature");
    const c = t.payload, nowS = now / 1000;
    if (c.iss !== ISSUER) throw bad("issuer");
    if (!(Array.isArray(c.aud) ? c.aud.includes(clientId) : c.aud === clientId)) throw bad("audience");
    if (!(typeof c.exp === "number" && c.exp + CLOCK_SKEW_S > nowS)) throw bad("expired");
    if (c.nonce !== nonce) throw bad("nonce");
    if (typeof c.sub !== "string" || !c.sub) throw bad("subject");
    return c;
  }

  // What the student sees for each documented plan-usage failure.
  function describeError(status, body, requestId) {
    const err = body && typeof body.error === "object" ? body.error : null;
    const code = (err && err.code) || (typeof (body && body.error) === "string" ? body.error : "") || "";
    const extra = { code: code || "http_" + status, status, requestId: requestId || "" };
    const known = {
      subscription_sharing_usage_limit_exceeded: ["Usage limit reached. Check your ChatGPT usage settings.", { manageUsage: true }],
      subscription_sharing_user_not_eligible: ["This ChatGPT account can't share its plan with apps. It needs ChatGPT Plus or Pro."],
      subscription_sharing_usage_unavailable: ["ChatGPT couldn't check your usage right now. Try again in a minute.", { retry: true }],
      subscription_sharing_user_unavailable: ["ChatGPT couldn't load your account right now. Try again in a minute.", { retry: true }],
      subscription_sharing_invalid_user: ["ChatGPT didn't accept this sign-in. Disconnect and sign in again."],
      subscription_sharing_unsupported_capability: ["ChatGPT can't run this kind of request on your plan" + (err && err.param ? " (" + err.param + ")" : "") + "."],
      subscription_sharing_route_not_supported: ["ChatGPT doesn't allow this request from apps."],
      chatpass_v2_scope_not_authorized: ["ChatGPT plan use isn't allowed for this sign-in. Turn on plan use and try again."],
      chatpass_v2_invalid_authorization_context: ["ChatGPT plan use isn't allowed for this sign-in. Turn on plan use and try again."],
    };
    if (known[code]) return fail(known[code][0], Object.assign(extra, known[code][1] || {}));
    if (status === 401) return fail("ChatGPT didn't accept this sign-in. Disconnect and sign in again.", extra);
    if (status === 403) return fail("ChatGPT blocked this request. It may not be available in your region.", extra);
    if (status === 503) return fail("ChatGPT plan use is unavailable right now. Try again later.", Object.assign(extra, { retry: true }));
    const detail = (err && err.message) || (body && typeof body.detail === "string" ? body.detail : "");
    return fail("ChatGPT returned an error" + (detail ? ": " + detail : code ? " (" + code + ")" : "") + ".", extra);
  }

  // Server-sent events from /v1/responses. Success is response.completed and nothing
  // else: a limit can arrive as response.failed after text has started streaming.
  async function readStream(response, onDelta) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = "", text = "";
    const handle = (block) => {
      const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
      if (!data || data === "[DONE]") return null;
      let ev;
      try { ev = JSON.parse(data); } catch (_) { return null; }
      if (ev.type === "response.output_text.delta" && typeof ev.delta === "string") { text += ev.delta; if (onDelta) onDelta(ev.delta); }
      if (ev.type === "response.completed") return { done: true };
      if (ev.type === "response.failed") throw describeError(0, { error: (ev.response && ev.response.error) || { code: "response_failed" } });
      if (ev.type === "response.incomplete") throw fail("ChatGPT stopped before finishing the answer.", { code: "incomplete" });
      if (ev.type === "error") throw describeError(0, { error: ev.error || ev });
      return null;
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (value) buf += decoder.decode(value, { stream: true });
      let i;
      while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
        const block = buf.slice(0, i).replace(/\r/g, "");
        buf = buf.slice(buf.slice(i).match(/^\r?\n\r?\n/)[0].length + i);
        const r = handle(block);
        if (r && r.done) { try { reader.cancel(); } catch (_) {} return { text }; }
      }
      if (done) break;
    }
    if (buf.trim()) { const r = handle(buf.replace(/\r/g, "")); if (r && r.done) return { text }; }
    throw fail("The connection to ChatGPT ended before the answer finished.", { code: "interrupted" });
  }

  // ---- storage ------------------------------------------------------------

  function idbStore(name) {
    let dbP = null;
    const db = () => dbP || (dbP = new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore("kv");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { dbP = null; reject(req.error); };
    }));
    const run = (mode, fn) => db().then((d) => new Promise((resolve, reject) => {
      const tx = d.transaction("kv", mode);
      const req = fn(tx.objectStore("kv"));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    }));
    return {
      get: (k) => run("readonly", (s) => s.get(k)),
      set: (k, v) => run("readwrite", (s) => s.put(v, k)),
      del: (k) => run("readwrite", (s) => s.delete(k)),
    };
  }

  // ---- the service --------------------------------------------------------

  function create({ chrome, fetch, store, crypto, now = () => Date.now(), wait = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
    const post = (url, form) => fetch(url, { method: "POST", body: new URLSearchParams(form), credentials: "omit", referrerPolicy: "no-referrer" });
    const json = (r) => r.json().catch(() => null);
    let discovery = null, jwks = null, refreshing = null;
    const handling = new Set();

    async function getDiscovery() {
      if (discovery) return discovery;
      const r = await fetch(DISCOVERY_URL, { credentials: "omit" });
      if (!r.ok) throw fail("Couldn't reach ChatGPT sign-in. Try again.", { code: "discovery_" + r.status, retry: true });
      return (discovery = await r.json());
    }
    async function getJwks(kid) {
      if (jwks && jwks.keys.some((k) => k.kid === kid)) return jwks;
      const d = await getDiscovery();
      const r = await fetch(d.jwks_uri, { credentials: "omit" });
      if (!r.ok) throw fail("Couldn't load ChatGPT's signing keys. Try again.", { code: "jwks_" + r.status, retry: true });
      return (jwks = await r.json());
    }

    async function hostId() {
      let id = await store.get("host");
      if (!id) { id = "urn:uuid:" + crypto.randomUUID(); await store.set("host", id); }
      return id;
    }
    const registrations = async () => (await store.get("registrations")) || [];
    async function saveRegistration(reg) {
      const list = (await registrations()).filter((r) => r.clientId !== reg.clientId);
      list.unshift(reg);
      await store.set("registrations", list);
    }
    async function activeRegistration() {
      const id = await store.get("active");
      return (await registrations()).find((r) => r.clientId === id) || null;
    }
    async function activeCred() {
      const id = await store.get("active");
      return id ? (await store.get("cred:" + id)) || null : null;
    }
    const prefs = async () => (await store.get("prefs")) || {};
    async function setPrefs(patch) { await store.set("prefs", Object.assign(await prefs(), patch)); }
    async function setError(e) {
      await store.set("lastError", e ? { message: e.message, code: e.code || "", manageUsage: !!e.manageUsage, at: now() } : null);
    }
    async function pendingAttempt() {
      const p = await store.get("pending");
      if (p && now() - p.startedAt > PENDING_MS) { await store.del("pending"); return null; }
      return p || null;
    }

    async function connect({ different, consent, returnTabId } = {}) {
      if (!(await chrome.permissions.contains({ origins: ORIGINS }))) return { ok: false, needsPermission: true, origins: ORIGINS };
      const old = await pendingAttempt();
      if (old && old.tabId != null) chrome.tabs.remove(old.tabId).catch(() => {});
      // A registration whose first code exchange failed has no account yet. OpenAI
      // wants the retry to reuse its issued client ID, not register again.
      const unfinished = (await registrations()).find((r) => !r.sub) || null;
      const reg = different ? null : (await activeRegistration()) || unfinished;
      const cred = reg ? await store.get("cred:" + reg.clientId) : null;
      const { verifier, challenge } = await pkce(crypto);
      const port = 20000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 40000);
      const pending = {
        state: b64url(crypto.getRandomValues(new Uint8Array(24))),
        nonce: b64url(crypto.getRandomValues(new Uint8Array(24))),
        verifier, port, redirectUri: "http://127.0.0.1:" + port + CALLBACK_PATH,
        clientId: reg ? reg.clientId : null, sub: reg ? reg.sub || null : null,
        returnTabId: returnTabId == null ? null : returnTabId, tabId: null, startedAt: now(),
      };
      const url = authorizeUrl({ clientId: pending.clientId, hostId: await hostId(), redirectUri: pending.redirectUri,
        state: pending.state, nonce: pending.nonce, challenge, consent,
        idTokenHint: cred && cred.idToken, loginHint: reg && reg.email });
      // Saved before the tab opens, so a fast redirect still finds it.
      await store.set("pending", pending);
      await setError(null);
      const tab = await chrome.tabs.create({ url, active: true });
      pending.tabId = tab.id;
      const still = await store.get("pending");
      if (still && still.state === pending.state) await store.set("pending", pending);
      return { ok: true, pending: true };
    }

    async function cancel() {
      const p = await pendingAttempt();
      await store.del("pending");
      if (p && p.tabId != null) chrome.tabs.remove(p.tabId).catch(() => {});
      return { ok: true };
    }

    async function onTabUpdated(tabId, change, tab) {
      const url = change.url || (tab && (tab.pendingUrl || tab.url)) || "";
      if (!/^https?:\/\/127\.0\.0\.1:/.test(url) || handling.has(tabId)) return;
      const pending = await pendingAttempt();
      if (!pending || pending.tabId !== tabId || !isCallback(url, pending)) return;
      handling.add(tabId);
      try {
        // One use per attempt: a second update for the same address finds nothing.
        await store.del("pending");
        chrome.tabs.remove(tabId).catch(() => {});
        await finish(pending, url);
        await setError(null);
      } catch (e) {
        await setError(e);
      } finally {
        handling.delete(tabId);
        if (pending.returnTabId != null) chrome.tabs.update(pending.returnTabId, { active: true }).catch(() => {});
      }
    }

    async function onTabRemoved(tabId) {
      const p = await pendingAttempt();
      if (!p || p.tabId !== tabId || handling.has(tabId)) return;
      await store.del("pending");
      await setError(fail("The ChatGPT sign-in tab closed before it finished.", { code: "closed" }));
    }

    async function finish(pending, url) {
      const { code, clientId } = parseCallback(url, pending);
      // Kept before the exchange, so an expired code can retry with the same client.
      if (!pending.clientId) await saveRegistration({ clientId, sub: null, email: "", addedAt: now() });
      const r = await post(TOKEN_URL, { grant_type: "authorization_code", client_id: clientId, code,
        code_verifier: pending.verifier, redirect_uri: pending.redirectUri, resource: API });
      const body = await json(r);
      if (!r.ok) {
        const err = body && (typeof body.error === "string" ? body.error : body.error && body.error.code);
        if (err === "invalid_grant") throw fail("That sign-in expired before it finished. Try again.", { code: err });
        throw fail("ChatGPT sign-in failed" + (err ? " (" + err + ")" : "") + ". Try again.", { code: err || "token_" + r.status });
      }
      if (!body || !body.access_token || !body.id_token) throw fail("ChatGPT didn't send the expected tokens. Try again.", { code: "token_shape" });
      const kid = decodeJwt(body.id_token).header.kid;
      const claims = await verifyIdToken(body.id_token, { jwks: await getJwks(kid), clientId, nonce: pending.nonce, now: now(), crypto });
      if (pending.sub && claims.sub !== pending.sub) {
        throw fail("You signed in with a different ChatGPT account. Use \"Use a different account\" to switch.", { code: "wrong_account" });
      }
      const scopes = String(body.scope || "").split(/\s+/).filter(Boolean);
      await saveRegistration({ clientId, sub: claims.sub, email: claims.email || "", addedAt: now() });
      await store.set("cred:" + clientId, {
        clientId, sub: claims.sub, email: claims.email || "", idToken: body.id_token,
        accessToken: body.access_token, refreshToken: body.refresh_token || "", tokenType: body.token_type || "Bearer",
        expiresAt: now() + (Number(body.expires_in) || 3600) * 1000, earliestRefreshAt: toMs(body.earliest_refresh_at),
        scopes, savedAt: now(),
      });
      await store.set("active", clientId);
      if (scopes.includes(PLAN_SCOPE)) await listModels().catch(() => {});
    }

    // One refresh at a time. Refresh tokens rotate, so two at once would leave
    // one holding a token the other already spent.
    async function freshCred() {
      const cred = await activeCred();
      if (!cred || !cred.refreshToken) throw fail("Connect ChatGPT first.", { code: "signed_out" });
      if (cred.expiresAt - EARLY_REFRESH_MS > now()) return cred;
      if (cred.earliestRefreshAt && now() < cred.earliestRefreshAt && cred.expiresAt > now()) return cred;
      if (!refreshing) refreshing = refresh(cred.clientId).finally(() => { refreshing = null; });
      return refreshing;
    }
    async function refresh(clientId) {
      const cred = await store.get("cred:" + clientId);
      if (!cred) throw fail("Connect ChatGPT first.", { code: "signed_out" });
      const r = await post(TOKEN_URL, { grant_type: "refresh_token", client_id: clientId, refresh_token: cred.refreshToken, resource: API });
      const body = await json(r);
      if (!r.ok || !body || !body.access_token) {
        const code = body && (typeof body.error === "string" ? body.error : body.error && body.error.code);
        if (DEAD_REFRESH.includes(code)) {
          await store.set("cred:" + clientId, Object.assign({}, cred, { accessToken: "", refreshToken: "" }));
          throw fail("Your ChatGPT sign-in expired. Continue with ChatGPT to sign in again.", { code: "signed_out" });
        }
        if (code === "invalid_client") throw fail("ChatGPT no longer recognizes this app registration. Use a different account to register again.", { code });
        throw fail("Couldn't renew your ChatGPT sign-in. Try again shortly.", { code: code || "refresh_" + r.status, retry: true });
      }
      const next = Object.assign({}, cred, {
        accessToken: body.access_token, refreshToken: body.refresh_token || cred.refreshToken,
        expiresAt: now() + (Number(body.expires_in) || 3600) * 1000, earliestRefreshAt: toMs(body.earliest_refresh_at),
        scopes: body.scope ? String(body.scope).split(/\s+/).filter(Boolean) : cred.scopes, savedAt: now(),
      });
      await store.set("cred:" + clientId, next);
      return next;
    }

    async function apiCall(path, init) {
      const cred = await freshCred();
      if (!cred.scopes.includes(PLAN_SCOPE)) throw fail("ChatGPT plan use is off for this sign-in. Turn it on first.", { code: "plan_disabled" });
      const r = await fetch(API + path, Object.assign({ credentials: "omit", referrerPolicy: "no-referrer" }, init, {
        headers: Object.assign({ Authorization: "Bearer " + cred.accessToken }, (init && init.headers) || {}),
      }));
      if (!r.ok) throw describeError(r.status, await json(r), r.headers.get("x-request-id"));
      return r;
    }

    async function listModels() {
      const body = await (await apiCall("/models")).json();
      const models = (body && Array.isArray(body.models) ? body.models : [])
        .filter((m) => m && m.visibility === "list" && typeof m.slug === "string")
        .map((m) => ({ slug: m.slug, name: m.display_name || m.slug }));
      const p = await prefs();
      await setPrefs({ models, model: models.some((m) => m.slug === p.model) ? p.model : (models[0] && models[0].slug) || "" });
      return models;
    }

    // Plan-usage requests must set store:false and stream:true, and carry their
    // history in input; the route rejects temperature, max_output_tokens and others.
    async function respond({ input, instructions, model, onDelta }) {
      const p = await prefs();
      const body = { model: model || p.model || ((await listModels())[0] || {}).slug, input, store: false, stream: true };
      if (!body.model) throw fail("No ChatGPT model is available for this account.", { code: "no_model" });
      if (instructions) body.instructions = instructions;
      const r = await apiCall("/responses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return readStream(r, onDelta);
    }

    async function test() {
      const { text } = await respond({ input: [{ role: "user", content: "Reply with exactly: Connected" }] });
      return { ok: true, text: text.trim() };
    }

    // Revoke at OpenAI first, then forget the tokens. The registration and host ID
    // stay so the next sign-in reuses the same client.
    async function disconnect() {
      await cancel();
      const cred = await activeCred();
      if (!cred) return { ok: true, revoked: true };
      let revoked = false;
      if (cred.refreshToken) {
        for (let attempt = 0; attempt < 3 && !revoked; attempt++) {
          try {
            const d = await getDiscovery();
            const r = await post(d.revocation_endpoint, { token: cred.refreshToken, token_type_hint: "refresh_token", client_id: cred.clientId });
            if (r.ok) revoked = true;
            else if (r.status < 500) break;
          } catch (_) {}
          if (!revoked && attempt < 2) await wait(500 * (attempt + 1));
        }
      } else revoked = true;
      await store.del("cred:" + cred.clientId);
      await setPrefs({ models: [], welcomed: true });
      return { ok: true, revoked };
    }

    async function status() {
      const [granted, pending, reg, cred, p, lastError] = await Promise.all([
        chrome.permissions.contains({ origins: ORIGINS }), pendingAttempt(), activeRegistration(), activeCred(), prefs(), store.get("lastError")]);
      const connected = !!(cred && cred.refreshToken);
      const planEnabled = connected && cred.scopes.includes(PLAN_SCOPE);
      return {
        ok: true, granted, pending: !!pending, connected, planEnabled,
        email: (cred && cred.email) || (reg && reg.email) || "", saved: !!reg,
        models: planEnabled ? p.models || [] : [], model: p.model || "",
        welcome: planEnabled && !p.welcomed, lastError: lastError || null, usageUrl: USAGE_URL, origins: ORIGINS,
      };
    }

    async function setModel(slug) {
      const p = await prefs();
      if (!(p.models || []).some((m) => m.slug === slug)) throw fail("That model isn't available for this account.", { code: "bad_model" });
      await setPrefs({ model: slug });
      return { ok: true };
    }

    const routes = {
      "bc:chatgpt:status": () => status(),
      "bc:chatgpt:connect": (msg, sender) => connect({ different: !!msg.different, consent: !!msg.consent,
        returnTabId: sender && sender.tab ? sender.tab.id : null }),
      "bc:chatgpt:cancel": () => cancel(),
      "bc:chatgpt:disconnect": () => disconnect(),
      "bc:chatgpt:models": () => listModels().then((models) => ({ ok: true, models })),
      "bc:chatgpt:setModel": (msg) => setModel(String(msg.slug || "")),
      "bc:chatgpt:test": () => test(),
      "bc:chatgpt:welcomed": () => setPrefs({ welcomed: true }).then(() => ({ ok: true })),
      "bc:chatgpt:clearError": () => setError(null).then(() => ({ ok: true })),
    };
    function handleMessage(msg, sender, sendResponse) {
      const route = msg && routes[msg.type];
      if (!route) return false;
      if (!sender || sender.id !== chrome.runtime.id) { sendResponse({ ok: false, error: "Untrusted message sender" }); return false; }
      Promise.resolve().then(() => route(msg, sender)).then(sendResponse, (e) => sendResponse({
        ok: false, error: e.message, code: e.code || "", manageUsage: !!e.manageUsage, usageUrl: USAGE_URL }));
      return true;
    }

    return { connect, cancel, onTabUpdated, onTabRemoved, freshCred, listModels, respond, test, disconnect, status, setModel, handleMessage };
  }

  function install(service, chrome) {
    chrome.tabs.onUpdated.addListener((id, change, tab) => { service.onTabUpdated(id, change, tab).catch(() => {}); });
    chrome.tabs.onRemoved.addListener((id) => { service.onTabRemoved(id).catch(() => {}); });
    chrome.runtime.onMessage.addListener(service.handleMessage);
  }

  const api = { create, install, idbStore, authorizeUrl, parseCallback, isCallback, verifyIdToken, decodeJwt, describeError, readStream, pkce, ORIGINS, USAGE_URL };
  globalThis.BCChatGPT = api;
  // Listeners go on in the first turn so a sign-in redirect wakes a sleeping worker.
  if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.onUpdated && typeof indexedDB !== "undefined") {
    install(create({ chrome, fetch: (...a) => fetch(...a), store: idbStore("bc-chatgpt"), crypto: globalThis.crypto }), chrome);
  }
})();
