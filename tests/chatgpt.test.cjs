const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const { root } = require("./audit-helpers.cjs");

function loadModule() {
  const context = vm.createContext({ console, URL, URLSearchParams, TextEncoder, TextDecoder, atob, btoa, setTimeout, clearTimeout, AbortSignal, crypto: webcrypto });
  vm.runInContext(fs.readFileSync(path.join(root, "src/background/chatgpt.js"), "utf8"), context, { filename: "chatgpt.js" });
  return context.BCChatGPT;
}
const M = loadModule();
// Objects made inside the vm have its own Object prototype, which deepStrictEqual rejects.
const plain = (v) => JSON.parse(JSON.stringify(v));

const b64url = (buf) => Buffer.from(buf).toString("base64url");
async function signer() {
  const pair = await webcrypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const jwk = Object.assign(await webcrypto.subtle.exportKey("jwk", pair.publicKey), { kid: "k1", use: "sig" });
  const sign = async (payload, header = { alg: "RS256", kid: "k1", typ: "JWT" }) => {
    const input = b64url(JSON.stringify(header)) + "." + b64url(JSON.stringify(payload));
    const sig = await webcrypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(input));
    return input + "." + b64url(sig);
  };
  return { jwks: { keys: [jwk] }, sign };
}
const sse = (events) => events.map((e) => "event: " + e.type + "\ndata: " + JSON.stringify(e) + "\n\n").join("");

// A fake OpenAI: records every request, signs ID tokens for whoever is "signing in".
async function harness(opts = {}) {
  const keys = await signer();
  const calls = [], tabs = [], removed = [];
  const data = new Map();
  const store = {
    get: async (k) => (data.has(k) ? structuredClone(data.get(k)) : undefined),
    set: async (k, v) => { data.set(k, structuredClone(v)); },
    del: async (k) => { data.delete(k); },
  };
  let clock = 1_800_000_000_000;
  const world = {
    granted: true, sub: "user-1", email: "student@example.edu", scope: "chatgpt.tokens.use.direct email offline_access openid profile resource.invoke",
    refreshCount: 0, tokenStatus: 200, tokenError: null, refreshError: null, revokeStatus: 200, hold: null, stall: null,
    responses: () => new Response(sse([{ type: "response.output_text.delta", delta: "Connected" }, { type: "response.completed", response: {} }]), { status: 200 }),
    idClaims: {},
  };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  async function fetch(url, init = {}) {
    const form = init.body instanceof URLSearchParams ? Object.fromEntries(init.body) : null;
    calls.push({ url, method: init.method || "GET", form, body: typeof init.body === "string" ? JSON.parse(init.body) : null, headers: init.headers || {} });
    // Headers arrive but the body never finishes, until the request's time limit errors it.
    if (world.stall && world.stall.test(url)) {
      return new Response(new ReadableStream({ start(c) { init.signal.addEventListener("abort", () => c.error(init.signal.reason)); } }), { status: 200 });
    }
    if (url === "https://auth.openai.com/.well-known/openid-configuration") {
      return json({ jwks_uri: "https://auth.openai.com/jwks", revocation_endpoint: "https://auth.openai.com/oauth/revoke" });
    }
    if (url === "https://auth.openai.com/jwks") return json(keys.jwks);
    if (url === "https://auth.openai.com/oauth/revoke") return new Response("", { status: world.revokeStatus });
    if (url === "https://auth.openai.com/api/accounts/oauth/token") {
      // A held response still gives up when the request's time limit fires.
      if (world.hold) await Promise.race([world.hold, new Promise((_, no) => init.signal && init.signal.addEventListener("abort", () => no(init.signal.reason)))]);
      if (form.grant_type === "refresh_token") {
        world.refreshCount++;
        if (world.refreshError) return json({ error: world.refreshError }, 400);
        return json({ access_token: "access-" + (world.refreshCount + 1), refresh_token: "refresh-" + (world.refreshCount + 1), expires_in: 3600, token_type: "Bearer" });
      }
      if (world.tokenError) return json({ error: world.tokenError }, world.tokenStatus);
      const pending = await store.get("pendingSeen");
      const idToken = await keys.sign(Object.assign({ iss: "https://auth.openai.com", aud: form.client_id, sub: world.sub, email: world.email,
        nonce: pending && pending.nonce, iat: clock / 1000, exp: clock / 1000 + 3600 }, world.idClaims));
      return json({ access_token: "access-1", refresh_token: "refresh-1", id_token: idToken, token_type: "Bearer", expires_in: 3600, scope: world.scope });
    }
    if (url === "https://api.openai.com/v1/models") return json({ models: [{ slug: "gpt-a", display_name: "GPT A", visibility: "list" }, { slug: "hidden", visibility: "hide" }] });
    if (url === "https://api.openai.com/v1/responses") return world.responses();
    throw new Error("unexpected fetch " + url);
  }
  const chrome = {
    runtime: { id: "bc", getURL: (f) => "chrome-extension://bc/" + f },
    permissions: { contains: async () => world.granted },
    tabs: {
      create: async ({ url }) => { tabs.push(url); return { id: 7 }; },
      remove: async (id) => { removed.push(id); },
      update: async () => ({}),
    },
  };
  const service = M.create({ chrome, fetch, store, crypto: webcrypto, now: () => clock, wait: async () => {}, requestMs: opts.requestMs || 15000 });
  // Lets the fake token endpoint sign with the nonce of the attempt in flight.
  async function connect(o) {
    const r = await service.connect(o);
    if (r.ok) await store.set("pendingSeen", await store.get("pending"));
    return r;
  }
  async function callback(params, tabId = 7) {
    const p = await store.get("pending");
    const q = new URLSearchParams(Object.assign({ state: p.state }, params));
    await service.onTabUpdated(tabId, { url: p.redirectUri + "?" + q }, { id: tabId });
  }
  const page = { id: "bc", url: "chrome-extension://bc/src/options/options.html?section=chatgpt", tab: { id: 3 } };
  const ask = (msg, sender = page) => new Promise((res) => { if (!service.handleMessage(msg, sender, res)) setTimeout(() => res(null), 0); });
  return { service, store, data, calls, tabs, removed, world, connect, callback, ask, page, tick: (ms) => { clock += ms; }, now: () => clock, keys };
}
// A promise and the function that settles it, for holding a fake response mid-flight.
function gate() { let open; const p = new Promise((r) => { open = r; }); return { p, open }; }
const flush = () => new Promise((r) => setImmediate(r));
const tokenCalls = (h) => h.calls.filter((c) => c.url.endsWith("/oauth/token"));

test("a first sign-in registers Better Canvas with PKCE and a 127.0.0.1 callback", async () => {
  const h = await harness();
  assert.deepEqual(plain(await h.connect()), { ok: true, pending: true });
  const u = new URL(h.tabs[0]);
  const q = Object.fromEntries(u.searchParams);
  assert.equal(u.origin + u.pathname, "https://auth.openai.com/api/accounts/authorize");
  assert.equal(q.client_id, "dynamic_agent_client");
  assert.equal(q.agent_name_hint, "Better Canvas");
  assert.match(q.ext_agent_host_id, /^urn:uuid:[0-9a-f-]{36}$/);
  assert.match(q.redirect_uri, /^http:\/\/127\.0\.0\.1:\d{5}\/auth\/callback$/);
  assert.equal(q.scope, "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct");
  assert.equal(q.resource, "https://api.openai.com/v1");
  assert.equal(q.response_type, "code");
  assert.equal(q.code_challenge_method, "S256");
  const pending = await h.store.get("pending");
  const digest = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(pending.verifier));
  assert.equal(q.code_challenge, b64url(digest));
  assert.equal(q.state, pending.state);
  assert.equal(q.nonce, pending.nonce);
  assert.equal(pending.tabId, 7);
  assert.doesNotMatch(h.tabs[0], /\+/, "spaces are %20, not +");
});

test("the callback tab is closed, the code exchanged and the plan connected", async () => {
  const h = await harness();
  await h.connect();
  await h.callback({ code: "code-1", client_id: "oaiapp_1" });
  assert.deepEqual(h.removed, [7]);
  const [exchange] = tokenCalls(h);
  const pending = await h.store.get("pendingSeen");
  assert.deepEqual(plain(exchange.form), { grant_type: "authorization_code", client_id: "oaiapp_1", code: "code-1",
    code_verifier: pending.verifier, redirect_uri: pending.redirectUri, resource: "https://api.openai.com/v1" });
  const s = await h.service.status();
  assert.equal(s.connected, true);
  assert.equal(s.planEnabled, true);
  assert.equal(s.email, "student@example.edu");
  assert.deepEqual(plain(s.models), [{ slug: "gpt-a", name: "GPT A" }]);
  assert.equal(s.model, "gpt-a");
  assert.equal(s.welcome, true);
  assert.equal(s.pending, false);
  assert.equal(JSON.stringify(s).includes("access-1"), false, "status never carries a token");
  assert.equal(JSON.stringify(s).includes("refresh-1"), false);
  // A second update for the same address must not exchange the code again.
  await h.service.onTabUpdated(7, { url: pending.redirectUri + "?code=code-1&state=" + pending.state }, { id: 7 });
  assert.equal(tokenCalls(h).length, 1);
});

test("callbacks that don't belong to the attempt are ignored or rejected", async () => {
  const h = await harness();
  await h.connect();
  const p = await h.store.get("pending");
  await h.service.onTabUpdated(8, { url: p.redirectUri + "?code=x&state=" + p.state }, { id: 8 });
  await h.service.onTabUpdated(7, { url: "http://127.0.0.1:1/auth/callback?code=x&state=" + p.state }, { id: 7 });
  await h.service.onTabUpdated(7, { url: "https://example.com/?code=x" }, { id: 7 });
  assert.ok(await h.store.get("pending"), "other tabs, ports and sites leave the attempt alone");
  await h.callback({ code: "x", client_id: "oaiapp_1", state: "forged" });
  assert.equal((await h.service.status()).lastError.code, "state_mismatch");
  assert.equal(tokenCalls(h).length, 0);

  await h.connect();
  await h.callback({ error: "access_denied" });
  assert.equal((await h.service.status()).lastError.code, "access_denied");
  await h.connect();
  await h.callback({ code: "x" });
  assert.equal((await h.service.status()).lastError.code, "registration_incomplete", "a new registration needs its issued client ID");
  await h.connect();
  await h.callback({ code: "x", client_id: "dynamic_agent_client" });
  assert.equal((await h.service.status()).lastError.code, "registration_incomplete");
  assert.equal(tokenCalls(h).length, 0);
});

test("a returning sign-in reuses the issued client, and rejects another client or account", async () => {
  const h = await harness();
  await h.connect();
  await h.callback({ code: "c1", client_id: "oaiapp_1" });
  await h.service.disconnect();
  await h.connect();
  const q = Object.fromEntries(new URL(h.tabs[1]).searchParams);
  assert.equal(q.client_id, "oaiapp_1");
  assert.equal(q.login_hint, "student@example.edu");
  assert.equal("agent_name_hint" in q, false);
  assert.equal("id_token_hint" in q, false, "the ID token goes away at sign-out");
  assert.equal(q.ext_agent_host_id, Object.fromEntries(new URL(h.tabs[0]).searchParams).ext_agent_host_id);

  await h.callback({ code: "c2", client_id: "oaiapp_other" });
  assert.equal((await h.service.status()).lastError.code, "client_mismatch");

  await h.connect();
  h.world.sub = "someone-else";
  await h.callback({ code: "c3" });
  const s = await h.service.status();
  assert.equal(s.lastError.code, "wrong_account");
  assert.equal(s.connected, false, "the other account's tokens are not saved");

  await h.connect();
  h.world.sub = "user-1";
  await h.callback({ code: "c4" });
  assert.equal((await h.service.status()).connected, true, "the callback may leave client_id out");
  assert.equal(tokenCalls(h).at(-1).form.client_id, "oaiapp_1");
});

test("ID tokens are checked for signature, issuer, audience, expiry and nonce", async () => {
  for (const [name, claims, header] of [
    ["nonce", { nonce: "wrong" }],
    ["audience", { aud: "oaiapp_someone" }],
    ["issuer", { iss: "https://evil.example" }],
    ["expired", { exp: 1_700_000_000 }],
    ["algorithm", {}, { alg: "none", kid: "k1" }],
  ]) {
    const h = await harness();
    h.world.idClaims = claims;
    if (header) {
      const realSign = h.keys.sign;
      h.keys.sign = (payload) => realSign(payload, header);
    }
    await h.connect();
    await h.callback({ code: "c", client_id: "oaiapp_1" });
    const s = await h.service.status();
    assert.equal(s.lastError && s.lastError.code, "bad_id_token", name);
    assert.equal(s.connected, false, name);
  }
  const h = await harness();
  const token = await h.keys.sign({ iss: "https://auth.openai.com", aud: "c", sub: "s", nonce: "n", exp: 2e9 });
  const [a, b, sig] = token.split(".");
  const flipped = a + "." + b + "." + (sig[0] === "A" ? "B" : "A") + sig.slice(1);
  await assert.rejects(M.verifyIdToken(flipped, { jwks: h.keys.jwks, clientId: "c", nonce: "n", now: 1e12, crypto: webcrypto }), /signature/);
  const claims = await M.verifyIdToken(token, { jwks: h.keys.jwks, clientId: "c", nonce: "n", now: 1e12, crypto: webcrypto });
  assert.equal(claims.sub, "s");
});

test("a sign-in without plan permission stays signed in but sends nothing", async () => {
  const h = await harness();
  h.world.scope = "email offline_access openid profile";
  await h.connect();
  await h.callback({ code: "c", client_id: "oaiapp_1" });
  const s = await h.service.status();
  assert.equal(s.connected, true);
  assert.equal(s.planEnabled, false);
  assert.equal(s.welcome, false);
  await assert.rejects(h.service.test(), (e) => e.code === "plan_disabled");
  assert.equal(h.calls.some((c) => c.url.startsWith("https://api.openai.com")), false);
  await h.connect({ consent: true });
  assert.equal(new URL(h.tabs[1]).searchParams.get("prompt"), "consent");
});

test("refreshes run one at a time, rotate the refresh token, and a dead one signs out", async () => {
  const h = await harness();
  await h.connect();
  await h.callback({ code: "c", client_id: "oaiapp_1" });
  h.tick(59 * 60 * 1000);
  const [a, b] = await Promise.all([h.service.freshCred(), h.service.freshCred()]);
  assert.equal(h.world.refreshCount, 1);
  assert.equal(a.accessToken, "access-2");
  assert.equal(b.accessToken, "access-2");
  const refreshCall = tokenCalls(h).at(-1);
  assert.deepEqual(plain(refreshCall.form), { grant_type: "refresh_token", client_id: "oaiapp_1", refresh_token: "refresh-1", resource: "https://api.openai.com/v1" });
  assert.equal((await h.store.get("cred:oaiapp_1")).refreshToken, "refresh-2");
  await h.service.freshCred();
  assert.equal(h.world.refreshCount, 1, "a fresh token isn't refreshed again");

  h.tick(60 * 60 * 1000);
  h.world.refreshError = "refresh_token_reused";
  await assert.rejects(h.service.freshCred(), (e) => e.code === "signed_out");
  const s = await h.service.status();
  assert.equal(s.connected, false);
  assert.equal(s.accounts.length, 1, "the registration survives for the next sign-in");
});

test("responses stream with store:false, and only response.completed counts", async () => {
  const h = await harness();
  await h.connect();
  await h.callback({ code: "c", client_id: "oaiapp_1" });
  assert.deepEqual(plain(await h.service.test()), { ok: true, text: "Connected" });
  const req = h.calls.find((c) => c.url.endsWith("/responses"));
  assert.equal(req.headers.Authorization, "Bearer access-1");
  assert.deepEqual(plain(req.body), { model: "gpt-a", input: [{ role: "user", content: "Reply with exactly: Connected" }], store: false, stream: true });

  h.world.responses = () => new Response(sse([{ type: "response.output_text.delta", delta: "Conn" },
    { type: "response.failed", response: { error: { code: "subscription_sharing_usage_limit_exceeded" } } }]), { status: 200 });
  await assert.rejects(h.service.test(), (e) => e.manageUsage === true && /Usage limit reached/.test(e.message));
  h.world.responses = () => new Response(sse([{ type: "response.output_text.delta", delta: "Conn" }]), { status: 200 });
  await assert.rejects(h.service.test(), (e) => e.code === "interrupted");
  h.world.responses = () => new Response(sse([{ type: "response.incomplete", response: {} }]), { status: 200 });
  await assert.rejects(h.service.test(), (e) => e.code === "incomplete");
  h.world.responses = () => new Response(JSON.stringify({ error: { code: "subscription_sharing_usage_limit_exceeded" } }), { status: 429 });
  await assert.rejects(h.service.test(), (e) => e.manageUsage === true && e.status === 429);
  h.world.responses = () => new Response(JSON.stringify({ detail: "Direct routing is unavailable" }), { status: 503 });
  await assert.rejects(h.service.test(), (e) => e.retry === true);
  // CRLF framing and an event split across chunks still parse.
  h.world.responses = () => {
    const text = sse([{ type: "response.output_text.delta", delta: "Hi" }, { type: "response.completed" }]).replace(/\n/g, "\r\n");
    const enc = new TextEncoder();
    return new Response(new ReadableStream({ start(c) { c.enqueue(enc.encode(text.slice(0, 17))); c.enqueue(enc.encode(text.slice(17))); c.close(); } }), { status: 200 });
  };
  assert.equal((await h.service.test()).text, "Hi");
});

test("disconnect revokes the refresh token before forgetting it", async () => {
  const h = await harness();
  await h.connect();
  await h.callback({ code: "c", client_id: "oaiapp_1" });
  const r = await h.service.disconnect();
  assert.equal(r.revoked, true);
  const revoke = h.calls.find((c) => c.url.endsWith("/oauth/revoke"));
  assert.deepEqual(plain(revoke.form), { token: "refresh-1", token_type_hint: "refresh_token", client_id: "oaiapp_1" });
  assert.equal(h.data.has("cred:oaiapp_1"), false);
  assert.ok(h.data.get("host"));
  assert.equal(h.data.get("registrations")[0].clientId, "oaiapp_1");
  assert.equal((await h.service.status()).connected, false);

  await h.connect();
  await h.callback({ code: "c2" });
  h.world.revokeStatus = 503;
  const before = h.calls.length;
  const r2 = await h.service.disconnect();
  assert.equal(r2.revoked, false, "an unconfirmed revocation is reported");
  assert.equal(h.calls.slice(before).filter((c) => c.url.endsWith("/oauth/revoke")).length, 3, "5xx is retried");
  assert.equal(h.data.has("cred:oaiapp_1"), false, "tokens are cleared anyway");
});

test("connect waits for permission, a closed tab ends the attempt, and other senders are refused", async () => {
  const h = await harness();
  h.world.granted = false;
  const r = await h.service.connect();
  assert.equal(r.needsPermission, true);
  assert.deepEqual([...r.origins], ["*://127.0.0.1/*", "https://auth.openai.com/*", "https://api.openai.com/*"]);
  assert.equal(h.tabs.length, 0);
  h.world.granted = true;
  await h.connect();
  await h.service.onTabRemoved(7);
  const s = await h.service.status();
  assert.equal(s.pending, false);
  assert.equal(s.lastError.code, "closed");

  assert.equal((await h.ask({ type: "bc:chatgpt:status" }, { id: "another-extension", url: h.page.url })).ok, false);
  assert.equal(await h.ask({ type: "bc:other" }), null, "other messages are left to the service worker");
  assert.equal((await h.ask({ type: "bc:chatgpt:status" })).ok, true);
});

test("Canvas tabs can't drive ChatGPT, even through the extension's own content script", async () => {
  const h = await harness();
  await h.connect();
  await h.callback({ code: "c", client_id: "oaiapp_1" });
  const canvas = { id: "bc", url: "https://school.instructure.com/courses/1", tab: { id: 9 }, frameId: 0 };
  for (const type of ["bc:chatgpt:status", "bc:chatgpt:connect", "bc:chatgpt:test", "bc:chatgpt:disconnect", "bc:chatgpt:models",
    "bc:chatgpt:setModel", "bc:chatgpt:cancel", "bc:chatgpt:welcomed", "bc:chatgpt:clearError"]) {
    const r = await h.ask({ type }, canvas);
    assert.equal(r.ok, false, type);
  }
  assert.equal(h.calls.filter((c) => c.url.endsWith("/responses") || c.url.endsWith("/oauth/revoke")).length, 0);
  assert.equal((await h.service.status()).connected, true);
  const settings = fs.readFileSync(path.join(root, "src/shared/settings/index.js"), "utf8");
  assert.match(settings, /Open ChatGPT settings/, "the drawer sends people to the settings page instead");
});

test("one callback exchanges its code once, even when two updates race", async () => {
  const h = await harness();
  await h.connect();
  const p = await h.store.get("pending");
  const url = p.redirectUri + "?" + new URLSearchParams({ code: "c", state: p.state, client_id: "oaiapp_1" });
  await Promise.all([h.service.onTabUpdated(7, { url }, { id: 7 }), h.service.onTabUpdated(7, {}, { id: 7, url })]);
  assert.equal(tokenCalls(h).length, 1);
  const s = await h.service.status();
  assert.equal(s.connected, true);
  assert.equal(s.lastError, null);
});

test("settings keep waiting while the code is exchanged, and a stuck exchange gives up", async () => {
  const h = await harness();
  await h.connect();
  const g = gate();
  h.world.hold = g.p;
  const done = h.callback({ code: "c", client_id: "oaiapp_1" });
  await flush(); await flush();
  let s = await h.service.status();
  assert.equal(s.pending, true, "still pending mid-exchange");
  assert.equal(s.finishing, true);
  assert.equal(s.connected, false);
  await h.service.cancel();
  assert.equal((await h.service.status()).pending, true, "Cancel can't drop an exchange in progress");
  assert.equal((await h.ask({ type: "bc:chatgpt:connect" })).code, "busy");
  h.world.hold = null; g.open();
  await done;
  s = await h.service.status();
  assert.equal(s.pending, false);
  assert.equal(s.connected, true);
  assert.equal(s.models.length, 1, "models are loaded before the wait ends");

  const h2 = await harness();
  await h2.connect();
  const p = await h2.store.get("pending");
  await h2.store.set("pending", Object.assign({}, p, { finishing: h2.now() }));
  h2.tick(61 * 1000);
  s = await h2.service.status();
  assert.equal(s.pending, false);
  assert.equal(s.lastError.code, "interrupted");
});

test("Disconnect waits for a sign-in or refresh in flight, then revokes what it returned", async () => {
  const h = await harness();
  await h.connect();
  const g = gate();
  h.world.hold = g.p;
  const signIn = h.callback({ code: "c", client_id: "oaiapp_1" });
  await flush(); await flush();
  const out = h.service.disconnect();
  h.world.hold = null; g.open();
  await signIn;
  const r = await out;
  assert.equal(r.revoked, true);
  assert.equal(h.calls.find((c) => c.url.endsWith("/oauth/revoke")).form.token, "refresh-1", "the token that arrived late is revoked");
  assert.equal((await h.service.status()).connected, false);

  await h.connect();
  await h.callback({ code: "c2" });
  h.tick(59 * 60 * 1000);
  const g2 = gate();
  h.world.hold = g2.p;
  const renewing = h.service.freshCred();
  await flush(); await flush();
  const out2 = h.service.disconnect();
  h.world.hold = null; g2.open();
  await renewing;
  await out2;
  const revokes = h.calls.filter((c) => c.url.endsWith("/oauth/revoke"));
  assert.equal(revokes.at(-1).form.token, "refresh-2", "the rotated refresh token is the one revoked");
  assert.equal((await h.service.status()).connected, false, "a refresh that lands late can't sign back in");
  await assert.rejects(h.service.freshCred(), (e) => e.code === "signed_out");
});

test("Disconnect and a callback arriving together never leave a live sign-in behind", async () => {
  // Disconnect first: the attempt is gone before the callback looks for it.
  let h = await harness();
  await h.connect();
  let p = await h.store.get("pending");
  let url = p.redirectUri + "?" + new URLSearchParams({ code: "c", state: p.state, client_id: "oaiapp_1" });
  await Promise.all([h.service.disconnect(), h.service.onTabUpdated(7, { url }, { id: 7 })]);
  assert.equal(tokenCalls(h).length, 0, "no code is spent after Disconnect");
  assert.equal((await h.service.status()).connected, false);

  // Callback first: Disconnect waits for it and revokes the new tokens.
  h = await harness();
  await h.connect();
  p = await h.store.get("pending");
  url = p.redirectUri + "?" + new URLSearchParams({ code: "c", state: p.state, client_id: "oaiapp_1" });
  const r = await Promise.all([h.service.onTabUpdated(7, { url }, { id: 7 }), h.service.disconnect()]);
  assert.equal(r[1].revoked, true);
  assert.equal(h.calls.filter((c) => c.url.endsWith("/oauth/revoke")).length, 1);
  assert.equal((await h.service.status()).connected, false);
});

test("a hung exchange times out and frees Disconnect, and a late one isn't kept", async () => {
  let h = await harness({ requestMs: 30 });
  await h.connect();
  h.world.hold = new Promise(() => {});
  await h.callback({ code: "c", client_id: "oaiapp_1" });
  let s = await h.service.status();
  assert.equal(s.lastError.code, "timeout");
  assert.equal(s.pending, false);
  assert.deepEqual(plain(await h.service.disconnect()), { ok: true, revoked: true }, "the turn is free again");

  // Settings gave up on a stuck exchange; when its answer finally lands it's revoked, not saved.
  h = await harness();
  await h.connect();
  const g = gate();
  h.world.hold = g.p;
  const late = h.callback({ code: "c", client_id: "oaiapp_1" });
  await flush(); await flush();
  h.tick(61 * 1000);
  assert.equal((await h.service.status()).lastError.code, "interrupted");
  h.world.hold = null; g.open();
  await late;
  s = await h.service.status();
  assert.equal(s.connected, false);
  assert.equal(s.lastError.code, "interrupted");
  assert.equal(h.calls.find((c) => c.url.endsWith("/oauth/revoke")).form.token, "refresh-1");
});

test("a body that stops arriving counts as a timeout, during discovery and the exchange", async () => {
  for (const stall of [/openid-configuration/, /oauth\/token/]) {
    const h = await harness({ requestMs: 30 });
    h.world.stall = stall;
    await h.connect();
    await h.callback({ code: "c", client_id: "oaiapp_1" });
    const s = await h.service.status();
    assert.equal(s.lastError && s.lastError.code, "timeout", String(stall));
    assert.equal(s.connected, false);
  }
});

test("two accounts with one email keep their labels when either signs in again", async () => {
  const h = await harness();
  await h.connect();
  await h.callback({ code: "a", client_id: "oaiapp_A" });
  await h.service.disconnect();
  h.world.sub = "user-1-workspace-2";
  await h.connect({ different: true });
  await h.callback({ code: "b", client_id: "oaiapp_B" });
  await h.service.disconnect();
  const labels = async () => Object.fromEntries((await h.service.status()).accounts.map((a) => [a.clientId, a.label]));
  const before = await labels();
  assert.deepEqual(plain(before), { oaiapp_A: "student@example.edu", oaiapp_B: "student@example.edu (2)" });
  h.world.sub = "user-1";
  await h.connect({ clientId: "oaiapp_A" });
  await h.callback({ code: "a2" });
  assert.deepEqual(plain(await labels()), plain(before));
});

test("saved accounts can be picked again without registering a new client", async () => {
  const h = await harness();
  await h.connect();
  await h.callback({ code: "a", client_id: "oaiapp_A" });
  await h.service.disconnect();
  h.world.sub = "user-2"; h.world.email = "other@example.edu";
  await h.connect({ different: true });
  assert.equal(new URL(h.tabs.at(-1)).searchParams.get("client_id"), "dynamic_agent_client");
  await h.callback({ code: "b", client_id: "oaiapp_B" });
  await h.service.disconnect();
  const s = await h.service.status();
  assert.deepEqual(plain(s.accounts.map((a) => [a.clientId, a.label, a.active])),
    [["oaiapp_B", "other@example.edu", true], ["oaiapp_A", "student@example.edu", false]]);
  await h.connect({ clientId: "oaiapp_A" });
  const q = new URL(h.tabs.at(-1)).searchParams;
  assert.equal(q.get("client_id"), "oaiapp_A");
  assert.equal(q.get("login_hint"), "student@example.edu");
  h.world.sub = "user-1"; h.world.email = "student@example.edu";
  await h.callback({ code: "a2" });
  assert.equal((await h.service.status()).email, "student@example.edu");
  await assert.rejects(h.service.connect({ clientId: "oaiapp_gone" }), (e) => e.code === "unknown_account");
});

test("errors keep the HTTP status and request ID for reporting", async () => {
  const h = await harness();
  await h.connect();
  await h.callback({ code: "c", client_id: "oaiapp_1" });
  h.world.responses = () => new Response(JSON.stringify({ error: { code: "subscription_sharing_invalid_user" } }), { status: 401, headers: { "x-request-id": "req_123" } });
  const r = await h.ask({ type: "bc:chatgpt:test" });
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
  assert.equal(r.requestId, "req_123");
  assert.equal(r.code, "subscription_sharing_invalid_user");
});

test("granted ChatGPT hosts never become custom Canvas domains", async () => {
  const listeners = {}, registered = [];
  const event = (name) => ({ addListener: (fn) => { (listeners[name] = listeners[name] || []).push(fn); } });
  const context = vm.createContext({ console, structuredClone, queueMicrotask, crypto: webcrypto, TextEncoder, URL, URLSearchParams, setTimeout, clearTimeout, chrome: {
    runtime: { id: "bc", onInstalled: event("installed"), onStartup: event("startup"), onMessage: event("message"), getURL: (f) => "chrome-extension://bc/" + f },
    permissions: { getAll: async () => ({ origins: ["*://127.0.0.1/*", "https://auth.openai.com/*", "https://api.openai.com/*", "https://api.openverse.org/*", "https://canvas.school.edu/*"] }),
      onAdded: event("added"), onRemoved: event("removed") },
    scripting: { getRegisteredContentScripts: async () => [], unregisterContentScripts: async () => {}, registerContentScripts: async (s) => { registered.push(...s); } },
    contextMenus: { update() {}, create() {}, onClicked: event("menu") },
    tabs: { onRemoved: event("tabRemoved"), query: async () => [] },
    action: { onClicked: event("action") }, storage: { local: {} },
  } });
  vm.runInContext(fs.readFileSync(path.join(root, "src/background/service-worker.js"), "utf8"), context);
  await listeners.added[0]();
  assert.deepEqual(plain(registered.map((s) => s.matches)), [["https://canvas.school.edu/*"], ["https://canvas.school.edu/*"]]);
});

test("the settings tab, manifests and module agree on the ChatGPT hosts", () => {
  const settings = fs.readFileSync(path.join(root, "src/shared/settings/index.js"), "utf8");
  const listed = vm.runInNewContext(/const CHATGPT_ORIGINS = (\[[^\]]*\]);/.exec(settings)[1]);
  assert.deepEqual([...listed], [...M.ORIGINS]);
  const chrome = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  const firefox = JSON.parse(fs.readFileSync(path.join(root, "manifest.firefox.json"), "utf8"));
  for (const m of [chrome, firefox]) {
    assert.equal(m.host_permissions.some((h) => /openai|127\.0\.0\.1/.test(h)), false, "only asked for at Connect");
    assert.ok(m.optional_host_permissions.includes("*://*/*"));
  }
  // The study coach sends its requests through the same service, so it loads after it.
  assert.deepEqual(firefox.background.scripts, ["src/background/chatgpt.js", "src/background/coach.js", "src/background/service-worker.js"]);
  assert.match(fs.readFileSync(path.join(root, "src/background/service-worker.js"), "utf8"), /importScripts\("chatgpt\.js", "coach\.js"\)/);
});
