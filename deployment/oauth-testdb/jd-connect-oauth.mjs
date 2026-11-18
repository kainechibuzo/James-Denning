// supabase/functions/jd-connect-oauth/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";

// supabase/functions/_shared/jd-oauth-crypto.ts
var base64Url = (bytes) => {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).split("+").join("-").split("/").join("_").replace(/=+$/g, "");
};
var sha256Hex = async (value) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map((v) => v.toString(16).padStart(2, "0")).join("");
var importAesKey = async (encoded) => {
  const raw = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error("JD_OAUTH_ENCRYPTION_KEY must decode to exactly 32 bytes");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
};
var encryptSecret = async (value, key) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value)));
  const combined = new Uint8Array(iv.length + encrypted.length);
  combined.set(iv);
  combined.set(encrypted, iv.length);
  return "\\x" + Array.from(combined).map((v) => v.toString(16).padStart(2, "0")).join("");
};
var decryptSecret = async (value, key) => {
  const hex = value.startsWith("\\x") ? value.slice(2) : value;
  if (hex.length < 28 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) throw new Error("Encrypted OAuth material is malformed");
  const bytes = Uint8Array.from(hex.match(/.{2}/g), (x) => parseInt(x, 16));
  const iv = bytes.slice(0, 12), ciphertext = bytes.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plain);
};

// supabase/functions/_shared/jd-secrets.ts
var cachedRaw = null;
var cachedBundle = {};
function readBundle() {
  const raw = Deno.env.get("JD_SECRETS_JSON") || "";
  if (!raw) return {};
  if (raw === cachedRaw) return cachedBundle;
  cachedRaw = raw;
  try {
    const parsed = JSON.parse(raw);
    cachedBundle = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    cachedBundle = {};
  }
  return cachedBundle;
}
function getJdSecret(name) {
  const value = readBundle()[name];
  if (typeof value !== "string") return "";
  const secret = value.trim();
  if (secret.length < 32) return "";
  if (name === "JD_OAUTH_ENCRYPTION_KEY") {
    try {
      if (Uint8Array.from(atob(secret), (c) => c.charCodeAt(0)).length !== 32) return "";
    } catch {
      return "";
    }
  }
  return secret;
}

// supabase/functions/_shared/jd-connector-oauth-policy.mjs
var MCP_OAUTH_PROVIDERS = Object.freeze({
  github: { name: "GitHub", endpoint: "https://api.githubcopilot.com/mcp/" },
  notion: { name: "Notion", endpoint: "https://mcp.notion.com/mcp" },
  slack: { name: "Slack", endpoint: "https://mcp.slack.com/mcp" },
  vercel: { name: "Vercel", endpoint: "https://mcp.vercel.com" },
  asana: { name: "Asana", endpoint: "https://mcp.asana.com/v2/mcp" },
  clickup: { name: "ClickUp", endpoint: "https://mcp.clickup.com/mcp" },
  todoist: { name: "Todoist", endpoint: "https://ai.todoist.net/mcp" },
  pipedrive: { name: "Pipedrive", endpoint: "https://mcp.pipedrive.ai/mcp" },
  atlassian: { name: "Atlassian", endpoint: "https://mcp.atlassian.com/v2/mcp" },
  airtable: { name: "Airtable", endpoint: "https://mcp.airtable.com/mcp" },
  supabase: { name: "Supabase", endpoint: "https://mcp.supabase.com/mcp" },
  cloudflare: { name: "Cloudflare", endpoint: "https://mcp.cloudflare.com/mcp" },
  linear: { name: "Linear", endpoint: "https://mcp.linear.app/mcp/readonly" }
});
function publicHttps(value) {
  let u;
  try {
    u = new URL(value);
  } catch {
    throw Error("Operator OAuth URL is invalid.");
  }
  if (u.protocol !== "https:" || u.username || u.password || u.hash || u.port && u.port !== "443" || u.hostname === "localhost" || u.hostname.endsWith(".local") || u.hostname.endsWith(".internal") || /^[\d.]+$/.test(u.hostname) || u.hostname.includes(":")) throw Error("Operator OAuth URL must be public HTTPS.");
  return u;
}
function oauthConfig(providerId, raw, allowedHosts) {
  if (!Object.hasOwn(MCP_OAUTH_PROVIDERS, providerId)) throw Error("Provider does not offer a configured sign-in route.");
  let all;
  try {
    all = JSON.parse(raw || "{}");
  } catch {
    throw Error("Operator OAuth configuration is invalid.");
  }
  const c = all[providerId];
  if (!c || typeof c.client_id !== "string" || !c.client_id.trim()) throw Error("Provider sign-in needs operator setup. No API key is required from you.");
  const hosts = new Set(allowedHosts.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));
  const endpoint = MCP_OAUTH_PROVIDERS[providerId].endpoint;
  for (const value of [c.authorization_endpoint, c.token_endpoint, ...c.revocation_endpoint ? [c.revocation_endpoint] : [], endpoint]) {
    const url = publicHttps(value);
    if (url.search || !hosts.has(url.hostname)) throw Error("Provider OAuth host is not on the operator allowlist.");
  }
  if (providerId === "github" && (c.authorization_endpoint !== "https://github.com/login/oauth/authorize" || c.token_endpoint !== "https://github.com/login/oauth/access_token" || c.token_endpoint_auth_method === "none")) throw Error("GitHub MCP requires its registered confidential OAuth client.");
  if (providerId === "slack" && (c.authorization_endpoint !== "https://slack.com/oauth/v2_user/authorize" || c.token_endpoint !== "https://slack.com/api/oauth.v2.user.access" || c.token_endpoint_auth_method === "none")) throw Error("Slack MCP requires its confidential user-token OAuth endpoints.");
  if (!Array.isArray(c.scopes) || c.scopes.some((s) => typeof s !== "string" || !s || /[\s,]/.test(s)) || c.scopes.length > 40) throw Error("Operator must configure reviewed provider scopes.");
  if (!["none", "client_secret_post", "client_secret_basic"].includes(c.token_endpoint_auth_method)) throw Error("Unsupported provider OAuth client authentication.");
  if (c.token_endpoint_auth_method !== "none" && (typeof c.client_secret !== "string" || !c.client_secret)) throw Error("Operator OAuth app secret is missing.");
  if (![" ", ","].includes(c.scope_separator || " ")) throw Error("Invalid OAuth scope separator.");
  if (c.resource && c.resource !== endpoint) throw Error("OAuth resource must match the MCP endpoint.");
  const extras = c.authorization_parameters || {};
  if (Object.keys(extras).some((k) => !["prompt", "access_type", "audience"].includes(k)) || Object.values(extras).some((v) => typeof v !== "string" || v.length > 500)) throw Error("Unsupported OAuth authorization parameter.");
  return { ...c, providerId, endpoint, scope_separator: c.scope_separator || " ", authorization_parameters: extras };
}
function authorizationUrl(config, { state, challenge, redirect }) {
  const u = publicHttps(config.authorization_endpoint);
  u.searchParams.set("client_id", config.client_id);
  u.searchParams.set("redirect_uri", publicHttps(redirect).toString());
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("scope", config.scopes.join(config.scope_separator));
  if (config.resource) u.searchParams.set("resource", config.resource);
  for (const [k, v] of Object.entries(config.authorization_parameters)) u.searchParams.set(k, v);
  return u.toString();
}
function tokenRequest(config, values) {
  const body = new URLSearchParams({ ...values, client_id: config.client_id });
  const headers2 = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  if (config.resource) body.set("resource", config.resource);
  if (config.token_endpoint_auth_method === "client_secret_post") body.set("client_secret", config.client_secret);
  if (config.token_endpoint_auth_method === "client_secret_basic") headers2.Authorization = "Basic " + btoa(encodeURIComponent(config.client_id) + ":" + encodeURIComponent(config.client_secret));
  return { method: "POST", headers: headers2, body, redirect: "error", signal: AbortSignal.timeout(15e3) };
}
function tokenBundle(payload, previous = null, now = Date.now()) {
  if (!payload || payload.error || payload.ok === false || typeof payload.access_token !== "string" || !payload.access_token || payload.access_token.length > 16e3 || /[\r\n]/.test(payload.access_token)) throw Error("Provider did not return a usable access token. Reconnect.");
  if (payload.token_type && String(payload.token_type).toLowerCase() !== "bearer") throw Error("Provider returned an unsupported token type.");
  const expiry = payload.expires_in === void 0 ? null : Number(payload.expires_in);
  if (expiry !== null && (!Number.isFinite(expiry) || expiry <= 0 || expiry > 31536e4)) throw Error("Provider returned an invalid token expiry.");
  const refresh = payload.refresh_token ?? previous?.refresh_token ?? null;
  if (refresh !== null && (typeof refresh !== "string" || refresh.length > 16e3)) throw Error("Provider returned an invalid refresh token.");
  return { access_token: payload.access_token, refresh_token: refresh, expires_at: expiry === null ? null : new Date(now + expiry * 1e3).toISOString(), scope: typeof payload.scope === "string" ? payload.scope : previous?.scope || "", token_type: "Bearer" };
}
async function oauthJson(response) {
  if (!response.ok) {
    await response.body?.cancel();
    throw Error("Provider authorization request failed (HTTP " + response.status + "). Reconnect or contact your operator.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw Error("Empty provider response.");
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 65536) {
        await reader.cancel();
        throw Error("Provider OAuth response exceeds limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(out));
  } catch {
    throw Error("Provider returned invalid OAuth JSON.");
  }
}
function providerTokenBundle(providerId, payload, previous = null, now = Date.now()) {
  if (providerId === "slack" && payload?.token_type === "user") return tokenBundle({ ...payload, token_type: "Bearer", scope: payload.scope || payload.authed_user?.scope }, previous, now);
  return tokenBundle(payload, previous, now);
}

// supabase/functions/_shared/jd-connector-oauth.ts
var connectorOAuthKey = () => Deno.env.get("JD_OAUTH_ENCRYPTION_KEY") || getJdSecret("JD_OAUTH_ENCRYPTION_KEY");
var connectorOAuthConfig = (id) => oauthConfig(id, Deno.env.get("JD_MCP_OAUTH_CLIENTS_JSON") || "", Deno.env.get("JD_MCP_ALLOWED_HOSTS") || "");

// supabase/functions/jd-connect-oauth/index.ts
var headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
var send = (x, status = 200) => new Response(JSON.stringify(x), { status, headers });
var page = (message, status = 200) => new Response('<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>JD connection</title></head><body><h1>JD Connect</h1><p>' + message + "</p><p>You can close this tab and return to JD. Refresh connections to see the latest status.</p></body></html>", { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'", "X-Content-Type-Options": "nosniff" } });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (!["GET", "POST"].includes(req.method)) return send({ error: "Method not allowed" }, 405);
  const base = Deno.env.get("SUPABASE_URL"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!base || !service || !anon) return send({ error: "Connector sign-in service is not configured" }, 503);
  const db = createClient(base, service, { auth: { persistSession: false, autoRefreshToken: false } });
  if (req.method === "GET") {
    try {
      const u = new URL(req.url), state = u.searchParams.get("state") || "";
      if (state.length < 32 || state.length > 128) return page("Invalid sign-in state. Start again in JD.", 400);
      const { data, error } = await db.rpc("jd_consume_connector_oauth", { p_state_hash: await sha256Hex(state) }), row = data?.[0];
      if (error || !row) return page("This sign-in expired or was already used. Start again in JD.", 400);
      if (u.searchParams.has("error")) return page("You did not approve access. Nothing was connected.", 400);
      const code = u.searchParams.get("code");
      if (!code || code.length > 4096) return page("Missing or invalid provider code.", 400);
      const { data: profile2, error: profileError2 } = await db.from("profiles").select("school_id,role").eq("id", row.actor_id).maybeSingle();
      if (profileError2 || profile2?.school_id !== row.school_id || !["owner", "admin", "manager"].includes(profile2?.role)) return page("Workspace permission changed. Start again with an authorised account.", 403);
      const config = connectorOAuthConfig(row.provider_id);
      if (await sha256Hex(JSON.stringify(config)) !== row.config_hash) return page("Operator configuration changed. Start sign-in again.", 409);
      const key = await importAesKey(connectorOAuthKey()), verifier = await decryptSecret(row.verifier_ciphertext, key);
      const response = await fetch(config.token_endpoint, tokenRequest(config, { grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: row.redirect_uri }));
      const bundle = providerTokenBundle(row.provider_id, await oauthJson(response));
      const { data: saved, error: saveError } = await db.rpc("jd_finish_connector_oauth", { p_server: row.server_id, p_actor: row.actor_id, p_generation: row.generation, p_bundle: await encryptSecret(JSON.stringify(bundle), key), p_expiry: bundle.expires_at });
      if (saveError || saved !== true) return page("Connection changed or was disconnected. No usable connection was saved. Start again if you still want access.", 409);
      const discovery = await fetch(base.replace(/\/$/, "") + "/functions/v1/jd-connect", { method: "POST", headers: { Authorization: "Bearer " + service, "Content-Type": "application/json" }, redirect: "error", signal: AbortSignal.timeout(45e3), body: JSON.stringify({ action: "tools.refresh", serverId: row.server_id, internalActorId: row.actor_id }) });
      const result = await discovery.json().catch(() => null);
      if (!discovery.ok || !Array.isArray(result?.tools)) return page("Sign-in was saved, but MCP tool discovery failed. No working connection is confirmed. Return to JD to retry discovery or disconnect.", 502);
      const { error: auditError } = await db.rpc("jd_business_audit", { p_school_id: row.school_id, p_actor_id: row.actor_id, p_event_type: "connector.oauth.connected", p_event: { server_id: row.server_id, provider_id: row.provider_id, tool_count: result.tools.length } });
      return page(auditError ? "Provider connected and tools discovered, but the audit event could not be recorded. Ask your operator to review." : "Provider connected and tools discovered. Tool permissions and human approval still apply.");
    } catch {
      return page("Sign-in could not be completed safely. Return to JD and reconnect or contact your operator.", 502);
    }
  }
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearer || bearer === service) return send({ error: "Sign in as a person to connect an account" }, 401);
  const auth = createClient(base, anon, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await auth.auth.getUser(bearer);
  if (authError || !authData.user) return send({ error: "Invalid session" }, 401);
  const actor = authData.user.id, { data: profile, error: profileError } = await db.from("profiles").select("school_id,role").eq("id", actor).maybeSingle();
  if (profileError || !profile?.school_id || !["owner", "admin", "manager"].includes(profile.role)) return send({ error: "Workspace manager permission required" }, 403);
  try {
    const raw = await req.text();
    if (raw.length > 4e3) return send({ error: "Request too large" }, 413);
    const b = JSON.parse(raw);
    if (b.action === "providers") {
      const providers = Object.entries(MCP_OAUTH_PROVIDERS).map(([id, p]) => {
        try {
          const c = connectorOAuthConfig(id);
          publicHttps(Deno.env.get("JD_MCP_OAUTH_CALLBACK_URL"));
          if (!connectorOAuthKey()) throw Error();
          return { id, name: p.name, configured: true, scopes: c.scopes };
        } catch {
          return { id, name: p.name, configured: false, scopes: [] };
        }
      });
      return send({ providers });
    }
    if (b.action !== "start") return send({ error: "Unknown sign-in action" }, 400);
    if (b.confirm !== true) return send({ error: "Review and confirm the requested connection first" }, 400);
    if (b.sharing !== "personal" && b.sharing !== "organisation") return send({ error: "Choose personal or organisation access" }, 400);
    if (b.sharing === "organisation" && !["owner", "admin"].includes(profile.role)) return send({ error: "Only owners/admins may share an account with the organisation" }, 403);
    const config = connectorOAuthConfig(b.providerId), redirect = publicHttps(Deno.env.get("JD_MCP_OAUTH_CALLBACK_URL")).toString();
    const key = await importAesKey(connectorOAuthKey()), state = base64Url(crypto.getRandomValues(new Uint8Array(32))), verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
    const { error: auditError } = await db.rpc("jd_business_audit", { p_school_id: profile.school_id, p_actor_id: actor, p_event_type: "connector.oauth.requested", p_event: { provider_id: b.providerId, sharing: b.sharing } });
    if (auditError) return send({ error: "Could not record connection consent. Nothing was started." }, 500);
    const { error } = await db.rpc("jd_begin_connector_oauth", { p_actor: actor, p_provider: b.providerId, p_endpoint: config.endpoint, p_name: MCP_OAUTH_PROVIDERS[b.providerId].name, p_shared: b.sharing === "organisation", p_state_hash: await sha256Hex(state), p_verifier: await encryptSecret(verifier, key), p_config_hash: await sha256Hex(JSON.stringify(config)), p_redirect: redirect });
    if (error) return send({ error: "Could not start sign-in. The workspace slot may belong to another account, or the OAuth migration is missing." }, 409);
    return send({ authorization_url: authorizationUrl(config, { state, challenge, redirect }), authorization_origin: new URL(config.authorization_endpoint).origin });
  } catch {
    return send({ error: "Provider sign-in needs operator configuration. You do not need to find an API key." }, 503);
  }
});
