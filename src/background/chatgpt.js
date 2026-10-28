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
  const FINISHING_MS = 60 * 1000;
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
        if (r && r.done) { reader.cancel().catch(() => {}); return { text }; }
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

  function create({ chrome, fetch, store, crypto, now = () => Date.now(), wait = (ms) => new Promise((r) => setTimeout(r, ms)), requestMs = 15000 }) {
    // Every sign-in request has a time limit, so a hung one can't hold the turn
    // below and leave Disconnect waiting. Three of them fit inside FINISHING_MS.
    const late = (e) => e && (e.name === "TimeoutError" || e.name === "AbortError");
    const tooSlow = () => fail("ChatGPT took too long to answer. Try again.", { code: "timeout", retry: true });
    async function timed(url, init) {
      try { return await fetch(url, Object.assign({ signal: AbortSignal.timeout(requestMs) }, init)); }
      catch (e) { throw late(e) ? tooSlow() : e; }
    }
    const post = (url, form) => timed(url, { method: "POST", body: new URLSearchParams(form), credentials: "omit", referrerPolicy: "no-referrer" });
    // The time limit also covers reading the body.
    const json = (r) => r.json().catch((e) => { if (late(e)) throw tooSlow(); return null; });
    let discovery = null, jwks = null, refreshing = null;
    const handling = new Set();
    // Sign-in, refresh and disconnect take turns, so Disconnect can't be undone by
    // an exchange or refresh that was already on its way back.
    let turn = Promise.resolve();
    const exclusive = (fn) => { const r = turn.then(fn); turn = r.catch(() => {}); return r; };
    const extOrigin = chrome.runtime.getURL("");

    async function getDiscovery() {
      if (discovery) return discovery;
      const r = await timed(DISCOVERY_URL, { credentials: "omit" });
      const body = r.ok ? await json(r) : null;
      if (!body || !body.jwks_uri) throw fail("Couldn't reach ChatGPT sign-in. Try again.", { code: "discovery_" + r.status, retry: true });
      return (discovery = body);
    }
    async function getJwks(kid) {
      if (jwks && jwks.keys.some((k) => k.kid === kid)) return jwks;
      const d = await getDiscovery();
      const r = await timed(d.jwks_uri, { credentials: "omit" });
      const body = r.ok ? await json(r) : null;
      if (!body || !Array.isArray(body.keys)) throw fail("Couldn't load ChatGPT's signing keys. Try again.", { code: "jwks_" + r.status, retry: true });
      return (jwks = body);
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
    // Stored once per registration, so two accounts with one email keep their labels
    // when either signs in again and moves to the front of the list.
    function labelFor(list, clientId, base) {
      const taken = new Set(list.filter((r) => r.clientId !== clientId).map((r) => r.label || r.email));
      if (!taken.has(base)) return base;
      for (let n = 2; ; n++) if (!taken.has(base + " (" + n + ")")) return base + " (" + n + ")";
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
      await store.set("lastError", e ? { message: e.message, code: e.code || "", manageUsage: !!e.manageUsage,
        status: e.status || 0, requestId: e.requestId || "", at: now() } : null);
    }
    async function pendingAttempt() {
      const p = await store.get("pending");
      if (!p) return null;
      // A worker stopped mid-exchange leaves "finishing" behind; don't wait on it forever.
      if (p.finishing && now() - p.finishing > FINISHING_MS) {
        await store.del("pending");
        await setError(fail("Sign-in was interrupted. Try again.", { code: "interrupted" }));
        return null;
      }
      if (!p.finishing && now() - p.startedAt > PENDING_MS) { await store.del("pending"); return null; }
      return p;
    }

    async function connect({ different, consent, clientId, returnTabId } = {}) {
      if (!(await chrome.permissions.contains({ origins: ORIGINS }))) return { ok: false, needsPermission: true, origins: ORIGINS };
      const old = await pendingAttempt();
      if (old && old.finishing) throw fail("Better Canvas is still finishing the last sign-in.", { code: "busy" });
      if (old && old.tabId != null) chrome.tabs.remove(old.tabId).catch(() => {});
      const list = await registrations();
      // A registration whose first code exchange failed has no account yet. OpenAI
      // wants the retry to reuse its issued client ID, not register again.
      const unfinished = list.find((r) => !r.sub) || null;
      const reg = clientId ? list.find((r) => r.clientId === clientId && r.sub)
        : different ? null : (await activeRegistration()) || unfinished;
      if (clientId && !reg) throw fail("That ChatGPT account isn't saved here anymore.", { code: "unknown_account" });
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
      let tab;
      try { tab = await chrome.tabs.create({ url, active: true }); }
      catch (e) { await store.del("pending"); throw e; }
      pending.tabId = tab.id;
      const still = await store.get("pending");
      if (still && still.state === pending.state) await store.set("pending", pending);
      return { ok: true, pending: true };
    }

    async function cancel() {
      const p = await pendingAttempt();
      if (p && p.finishing) return { ok: true };
      await store.del("pending");
      if (p && p.tabId != null) chrome.tabs.remove(p.tabId).catch(() => {});
      return { ok: true };
    }

    async function onTabUpdated(tabId, change, tab) {
      const url = change.url || (tab && (tab.pendingUrl || tab.url)) || "";
      // Taken before the first await, so two updates for one callback can't both spend its code.
      if (!/^https?:\/\/127\.0\.0\.1:\d+\/auth\/callback\?/.test(url) || handling.has(tabId)) return;
      handling.add(tabId);
      let pending = null;
      try {
        // The whole claim runs in Disconnect's turn. Either Disconnect goes first and
        // this finds no attempt, or it goes after and revokes what this saved.
        await exclusive(async () => {
          const p = await pendingAttempt();
          if (!p || p.tabId !== tabId || p.finishing || !isCallback(url, p)) return;
          pending = p;
          // Stays pending, marked used, until the exchange is done, so settings keep waiting.
          await store.set("pending", Object.assign({}, p, { finishing: now() }));
          chrome.tabs.remove(tabId).catch(() => {});
          await finish(p, url);
        });
        if (pending) {
          await setError(null);
          await listModels().catch(() => {});
        }
      } catch (e) {
        await setError(e);
      } finally {
        if (pending) {
          const still = await store.get("pending");
          if (still && still.state === pending.state) await store.del("pending");
          if (pending.returnTabId != null) chrome.tabs.update(pending.returnTabId, { active: true }).catch(() => {});
        }
        handling.delete(tabId);
      }
    }

    async function onTabRemoved(tabId) {
      const p = await pendingAttempt();
      if (!p || p.tabId !== tabId || p.finishing || handling.has(tabId)) return;
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
      // Settings gave up on this attempt (a stuck exchange timed out), so don't sign in behind their back.
      const still = await store.get("pending");
      if (!still || still.state !== pending.state) {
        if (body.refresh_token) await revoke(body.refresh_token, clientId);
        throw fail("Sign-in was interrupted. Try again.", { code: "interrupted" });
      }
      const scopes = String(body.scope || "").split(/\s+/).filter(Boolean);
      const list = await registrations();
      const prev = list.find((r) => r.clientId === clientId);
      await saveRegistration({ clientId, sub: claims.sub, email: claims.email || "", addedAt: (prev && prev.addedAt) || now(),
        label: (prev && prev.label) || labelFor(list, clientId, claims.email || "ChatGPT account") });
      await store.set("cred:" + clientId, {
        clientId, sub: claims.sub, email: claims.email || "", idToken: body.id_token,
        accessToken: body.access_token, refreshToken: body.refresh_token || "", tokenType: body.token_type || "Bearer",
        expiresAt: now() + (Number(body.expires_in) || 3600) * 1000, earliestRefreshAt: toMs(body.earliest_refresh_at),
        scopes, savedAt: now(),
      });
      await store.set("active", clientId);
    }

    // One refresh at a time. Refresh tokens rotate, so two at once would leave
    // one holding a token the other already spent.
    async function freshCred() {
      const cred = await activeCred();
      if (!cred || !cred.refreshToken) throw fail("Connect ChatGPT first.", { code: "signed_out" });
      if (cred.expiresAt - EARLY_REFRESH_MS > now()) return cred;
      if (cred.earliestRefreshAt && now() < cred.earliestRefreshAt && cred.expiresAt > now()) return cred;
      if (!refreshing) refreshing = exclusive(() => refresh(cred.clientId)).finally(() => { refreshing = null; });
      return refreshing;
    }
    async function refresh(clientId) {
      // Reread inside the turn: Disconnect may have run, or another refresh finished.
      const cred = await store.get("cred:" + clientId);
      if (!cred || !cred.refreshToken || (await store.get("active")) !== clientId) throw fail("Connect ChatGPT first.", { code: "signed_out" });
      if (cred.expiresAt - EARLY_REFRESH_MS > now()) return cred;
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

    async function listModels(signal) {
      const body = await (await apiCall("/models", { signal })).json();
      const models = (body && Array.isArray(body.models) ? body.models : [])
        .filter((m) => m && m.visibility === "list" && typeof m.slug === "string")
        .map((m) => ({ slug: m.slug, name: m.display_name || m.slug }));
      const p = await prefs();
      await setPrefs({ models, model: models.some((m) => m.slug === p.model) ? p.model : (models[0] && models[0].slug) || "" });
      return models;
    }

    // Plan-usage requests must set store:false and stream:true, and carry their
    // history in input; the route rejects temperature, max_output_tokens and others.
    // `text` is the Responses output format, such as a JSON schema.
    async function respond({ input, instructions, model, onDelta, text, signal }) {
      const p = await prefs();
      const body = { model: model || p.model || ((await listModels(signal))[0] || {}).slug, input, store: false, stream: true };
      if (!body.model) throw fail("No ChatGPT model is available for this account.", { code: "no_model" });
      if (instructions) body.instructions = instructions;
      if (text) body.text = text;
      const r = await apiCall("/responses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
      return readStream(r, onDelta);
    }

    async function test() {
      const { text } = await respond({ input: [{ role: "user", content: "Reply with exactly: Connected" }] });
      return { ok: true, text: text.trim() };
    }

    // Revoke at OpenAI first, then forget the tokens. The registration and host ID
    // stay so the next sign-in reuses the same client.
    // OpenAI answers an empty 200 even for a token that's already dead.
    async function revoke(token, clientId) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const d = await getDiscovery();
          const r = await post(d.revocation_endpoint, { token, token_type_hint: "refresh_token", client_id: clientId });
          if (r.ok) return true;
          if (r.status < 500) return false;
        } catch (_) {}
        if (attempt < 2) await wait(500 * (attempt + 1));
      }
      return false;
    }

    const disconnect = () => exclusive(async () => {
      await cancel();
      const cred = await activeCred();
      if (!cred) return { ok: true, revoked: true };
      const revoked = cred.refreshToken ? await revoke(cred.refreshToken, cred.clientId) : true;
      await store.del("cred:" + cred.clientId);
      await setPrefs({ models: [], welcomed: true });
      return { ok: true, revoked };
    });

    async function status() {
      // First, on its own: clearing a stuck attempt records the error read below.
      const pending = await pendingAttempt();
      const [granted, reg, cred, p, lastError] = await Promise.all([
        chrome.permissions.contains({ origins: ORIGINS }), activeRegistration(), activeCred(), prefs(), store.get("lastError")]);
      const connected = !!(cred && cred.refreshToken);
      const planEnabled = connected && cred.scopes.includes(PLAN_SCOPE);
      const accounts = (await registrations()).filter((r) => r.sub).map((r) => ({ clientId: r.clientId,
        active: !!reg && r.clientId === reg.clientId, label: r.label || r.email || "ChatGPT account" }));
      return {
        ok: true, granted, pending: !!pending, finishing: !!(pending && pending.finishing), connected, planEnabled,
        email: (cred && cred.email) || (reg && reg.email) || "", accounts,
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
        clientId: typeof msg.clientId === "string" ? msg.clientId : "", returnTabId: sender && sender.tab ? sender.tab.id : null }),
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
      // Only Better Canvas's own pages. A Canvas page shares the DOM with the content
      // script's drawer and can click its buttons, so nothing here answers a Canvas tab.
      if (!sender || sender.id !== chrome.runtime.id || typeof sender.url !== "string" || !sender.url.startsWith(extOrigin)) {
        sendResponse({ ok: false, error: "Open Better Canvas's settings page to use ChatGPT." });
        return false;
      }
      Promise.resolve().then(() => route(msg, sender)).then(sendResponse, (e) => sendResponse({
        ok: false, error: e.message, code: e.code || "", manageUsage: !!e.manageUsage, usageUrl: USAGE_URL,
        status: e.status || 0, requestId: e.requestId || "" }));
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
    // The study coach (coach.js) sends its requests through this same service.
    api.service = create({ chrome, fetch: (...a) => fetch(...a), store: idbStore("bc-chatgpt"), crypto: globalThis.crypto });
    install(api.service, chrome);
  }
})();
