// supabase/functions/_shared/jd-oauth-crypto.ts
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
function tokenRequest(config, values) {
  const body = new URLSearchParams({ ...values, client_id: config.client_id });
  const headers = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  if (config.resource) body.set("resource", config.resource);
  if (config.token_endpoint_auth_method === "client_secret_post") body.set("client_secret", config.client_secret);
  if (config.token_endpoint_auth_method === "client_secret_basic") headers.Authorization = "Basic " + btoa(encodeURIComponent(config.client_id) + ":" + encodeURIComponent(config.client_secret));
  return { method: "POST", headers, body, redirect: "error", signal: AbortSignal.timeout(15e3) };
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
function canUseConnector(server, actor) {
  return Boolean(server) && (!server.access_owner_user_id || server.access_owner_user_id === actor);
}
function providerTokenBundle(providerId, payload, previous = null, now = Date.now()) {
  if (providerId === "slack" && payload?.token_type === "user") return tokenBundle({ ...payload, token_type: "Bearer", scope: payload.scope || payload.authed_user?.scope }, previous, now);
  return tokenBundle(payload, previous, now);
}

// supabase/functions/_shared/jd-connector-oauth.ts
var connectorOAuthKey = () => Deno.env.get("JD_OAUTH_ENCRYPTION_KEY") || getJdSecret("JD_OAUTH_ENCRYPTION_KEY");
var connectorOAuthConfig = (id) => oauthConfig(id, Deno.env.get("JD_MCP_OAUTH_CLIENTS_JSON") || "", Deno.env.get("JD_MCP_ALLOWED_HOSTS") || "");
async function connectorOAuthToken(db, server, dependencies = {}) {
  const { data: row, error } = await db.from("jd_connector_oauth_tokens").select("bundle_ciphertext,expires_at,generation").eq("server_id", server.id).eq("school_id", server.school_id).eq("generation", server.oauth_generation).maybeSingle();
  if (error || !row) throw Error("Provider sign-in required. Connect again from the directory.");
  const key = await importAesKey(dependencies.key || connectorOAuthKey());
  let stored;
  try {
    stored = JSON.parse(await decryptSecret(row.bundle_ciphertext, key));
  } catch {
    throw Error("Provider credentials could not be read. Reconnect.");
  }
  const now = dependencies.now ?? Date.now();
  if (!row.expires_at || Date.parse(row.expires_at) > now + 6e4) return stored.access_token;
  if (!stored.refresh_token) throw Error("Provider access expired. Sign in again; no API key is needed.");
  const config = (dependencies.config || connectorOAuthConfig)(server.oauth_provider_id), lease = crypto.randomUUID();
  const { data: claimed, error: claimError } = await db.rpc("jd_claim_connector_refresh", { p_server: server.id, p_school: server.school_id, p_generation: server.oauth_generation, p_lease: lease });
  if (claimError || claimed !== true) throw Error("Provider credentials are refreshing or disconnected. Try again shortly.");
  try {
    const response = await (dependencies.fetch || fetch)(config.token_endpoint, tokenRequest(config, { grant_type: "refresh_token", refresh_token: stored.refresh_token }));
    const bundle = providerTokenBundle(server.oauth_provider_id, await oauthJson(response), stored, now);
    const { data: saved, error: saveError } = await db.rpc("jd_save_connector_refresh", { p_server: server.id, p_school: server.school_id, p_generation: server.oauth_generation, p_lease: lease, p_bundle: await encryptSecret(JSON.stringify(bundle), key), p_expiry: bundle.expires_at });
    if (saveError || saved !== true) throw Error("Connection changed during refresh. Sign in again.");
    return bundle.access_token;
  } catch {
    await db.from("jd_connector_servers").update({ status: "error", last_error_code: "OAUTH_RECONNECT_REQUIRED" }).eq("id", server.id).eq("school_id", server.school_id).eq("oauth_generation", server.oauth_generation);
    throw Error("Provider refresh could not be confirmed. Sign in again from the directory.");
  }
}
async function prepareConnectorRevocation(db, server) {
  try {
    const config = connectorOAuthConfig(server.oauth_provider_id);
    if (!config.revocation_endpoint) return null;
    const { data, error } = await db.from("jd_connector_oauth_tokens").select("bundle_ciphertext").eq("server_id", server.id).eq("school_id", server.school_id).eq("generation", server.oauth_generation).maybeSingle();
    if (error || !data) return null;
    const stored = JSON.parse(await decryptSecret(data.bundle_ciphertext, await importAesKey(connectorOAuthKey())));
    return { url: config.revocation_endpoint, request: tokenRequest(config, { token: stored.refresh_token || stored.access_token, token_type_hint: stored.refresh_token ? "refresh_token" : "access_token" }) };
  } catch {
    return null;
  }
}

// supabase/functions/jd-connect/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";

// supabase/functions/_shared/jd-mcp-core.ts
function validateMcpEndpoint(value, allowedHosts) {
  if (typeof value !== "string" || value.length > 2048) throw new Error("A valid MCP endpoint URL is required");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("MCP endpoint must be a valid HTTPS URL");
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.port && url.port !== "443") throw new Error("MCP endpoints must use HTTPS on port 443 without embedded credentials, query strings or fragments");
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) throw new Error("Private, local and IP-address MCP endpoints are not allowed");
  const allow = new Set(allowedHosts.map((x) => x.trim().toLowerCase()).filter(Boolean));
  if (!allow.has(host)) throw new Error("This MCP host is not on the server allowlist");
  return url;
}
function isReadOnlyTool(tool) {
  const a = tool.annotations || {};
  return a.readOnlyHint === true && a.destructiveHint !== true && a.openWorldHint !== true;
}
function parseMcpPayload(body, contentType) {
  if (contentType.includes("text/event-stream")) {
    const events = body.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).filter(Boolean);
    for (let i = events.length - 1; i >= 0; i--) {
      try {
        const parsed = JSON.parse(events[i]);
        if (parsed && typeof parsed === "object" && ("result" in parsed || "error" in parsed)) return parsed;
      } catch {
      }
    }
    throw new Error("MCP server returned no valid JSON-RPC response");
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("MCP server returned an invalid JSON response");
  }
}
function validateToolName(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(value)) throw new Error("Invalid MCP tool name");
  return value;
}

// supabase/functions/jd-connect/index.ts
var cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json", "Cache-Control": "no-store" };
var send = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
var safeError = (e) => e instanceof Error ? e.message : "Connector operation failed";
var asObject = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
var clip = (v, n = 4e3) => typeof v === "string" ? v.trim().slice(0, n) : "";
var MAX_RESULT = 9e4;
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return send({ error: "Method not allowed" }, 405);
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearer) return send({ error: "Authentication required" }, 401);
  const declaredLength = Number(req.headers.get("Content-Length") || 0);
  if (declaredLength > 12e4) return send({ error: "Request body exceeds the 120 KB limit" }, 413);
  let body;
  try {
    body = await req.json();
  } catch {
    return send({ error: "Invalid JSON" }, 400);
  }
  if (JSON.stringify(body).length > 12e4) return send({ error: "Request body exceeds the 120 KB limit" }, 413);
  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return send({ error: "JD Connect is not configured" }, 503);
  const internal = bearer === service;
  let actorId = "";
  if (internal) {
    actorId = clip(body.internalActorId, 64);
    if (!actorId) return send({ error: "Internal actor context is required" }, 401);
  } else {
    const auth = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${bearer}` } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await auth.auth.getUser(bearer);
    if (authError || !authData.user) return send({ error: "Invalid session" }, 401);
    actorId = authData.user.id;
  }
  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile, error: profileError } = await db.from("profiles").select("id,school_id,role").eq("id", actorId).maybeSingle();
  if (profileError || !profile?.school_id) return send({ error: "Workspace membership required" }, 403);
  if (!["owner", "admin", "manager"].includes(String(profile.role))) return send({ error: "Manager permission required for JD Connect" }, 403);
  const school = profile.school_id, actor = actorId;
  const allowed = (Deno.env.get("JD_MCP_ALLOWED_HOSTS") || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const encoded = connectorOAuthKey();
  const key = encoded ? await importAesKey(encoded).catch(() => null) : null;
  const requireEncryptionKey = () => {
    if (!key) throw new Error("JD_OAUTH_ENCRYPTION_KEY is missing or invalid; configure the 32-byte base64 encryption key before storing credentials or approving write-capable connector calls");
    return key;
  };
  const audit = async (type, meta) => await db.rpc("jd_business_audit", { p_school_id: school, p_actor_id: actor, p_event_type: type, p_event: meta });
  const getServer = async (id) => {
    const { data, error } = await db.from("jd_connector_servers").select("id,school_id,name,endpoint_url,host,status,protocol_version,server_info,oauth_provider_id,access_owner_user_id,oauth_actor_id,oauth_generation").eq("id", id).eq("school_id", school).maybeSingle();
    if (error || !data || !canUseConnector(data, actor)) throw new Error("Connector not found or not shared with you");
    return data;
  };
  const visibleServerIds = async () => {
    const { data, error } = await db.from("jd_connector_servers").select("id,access_owner_user_id").eq("school_id", school);
    if (error) throw new Error("Could not check connector visibility");
    return (data || []).filter((s) => canUseConnector(s, actor)).map((s) => s.id);
  };
  const getToken = async (id, expectedGeneration) => {
    const server = await getServer(id);
    if (server.oauth_provider_id) {
      if (expectedGeneration !== void 0 && server.oauth_generation !== expectedGeneration) throw new Error("Connection changed before execution. Request approval again.");
      return connectorOAuthToken(db, server);
    }
    const { data, error } = await db.from("jd_connector_credentials").select("encrypted_bearer_token").eq("server_id", id).eq("school_id", school).maybeSingle();
    if (error) throw new Error("Could not load connector credentials");
    return data?.encrypted_bearer_token ? await decryptSecret(data.encrypted_bearer_token, requireEncryptionKey()) : "";
  };
  const rpc = async (endpoint, token, method, params = {}, sessionId) => {
    validateMcpEndpoint(endpoint, allowed);
    const id = crypto.randomUUID(), notification = method.startsWith("notifications/");
    const headers = { "Content-Type": "application/json", "Accept": "application/json, text/event-stream", "MCP-Protocol-Version": "2025-06-18" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;
    const response = await fetch(endpoint, { method: "POST", headers, redirect: "error", signal: AbortSignal.timeout(15e3), body: JSON.stringify(notification ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id, method, params }) });
    const newSession = response.headers.get("Mcp-Session-Id") || sessionId || "";
    if (response.status === 202) return { result: {}, sessionId: newSession };
    const raw = await response.text();
    if (!response.ok) throw new Error(`MCP server returned HTTP ${response.status}`);
    if (notification) return { result: {}, sessionId: newSession };
    const payload = parseMcpPayload(raw, response.headers.get("Content-Type") || "application/json");
    if (payload.error) throw new Error(clip(payload.error.message, 300) || "MCP protocol error");
    if (!("result" in payload)) throw new Error("MCP server omitted the JSON-RPC result");
    return { result: payload.result, sessionId: newSession };
  };
  const connect = async (server, token) => {
    const init = await rpc(server.endpoint_url, token, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "jd-connect", version: "1.0.0" } });
    await rpc(server.endpoint_url, token, "notifications/initialized", {}, init.sessionId || void 0).catch(() => ({ result: {}, sessionId: init.sessionId }));
    return { protocolVersion: clip(init.result.protocolVersion, 40) || "2025-06-18", serverInfo: asObject(init.result.serverInfo), sessionId: init.sessionId };
  };
  const refreshTools = async (server, token) => {
    const session = await connect(server, token);
    const listed = await rpc(server.endpoint_url, token, "tools/list", {}, session.sessionId || void 0);
    const raw = Array.isArray(listed.result.tools) ? listed.result.tools : [];
    if (raw.length > 250) throw new Error("MCP server exposes too many tools (maximum 250)");
    const tools = raw.map((t) => {
      const name = validateToolName(t?.name), schema = asObject(t?.inputSchema), annotations = asObject(t?.annotations);
      return { school_id: school, server_id: server.id, name, description: clip(t?.description, 4e3), input_schema: schema, annotations, read_only: false };
    });
    if (server.oauth_provider_id) {
      const { data: saved, error } = await db.rpc("jd_save_connector_oauth_discovery", { p_server: server.id, p_school: school, p_generation: server.oauth_generation, p_tools: tools, p_protocol: session.protocolVersion, p_info: session.serverInfo });
      if (error || saved !== true) throw new Error("Connection changed during discovery. Refresh connections.");
      return tools;
    }
    const { error: deleteError } = await db.from("jd_connector_tools").delete().eq("server_id", server.id).eq("school_id", school);
    if (deleteError) throw new Error("Could not replace connector tool catalogue");
    if (tools.length) {
      const { error } = await db.from("jd_connector_tools").insert(tools);
      if (error) throw new Error("Could not save discovered MCP tools");
    }
    await db.from("jd_connector_servers").update({ status: "connected", protocol_version: session.protocolVersion, server_info: session.serverInfo, last_connected_at: (/* @__PURE__ */ new Date()).toISOString(), last_error_code: null, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", server.id).eq("school_id", school);
    return tools;
  };
  const execute = async (server, toolName, args, approvalId) => {
    const started = Date.now();
    const { data: run, error: insertError } = await db.from("jd_connector_executions").insert({ school_id: school, server_id: server.id, approval_id: approvalId, requested_by: actor, tool_name: toolName, status: "running" }).select("id").single();
    if (insertError || !run) throw new Error("Could not create connector execution record");
    let remoteResult = null;
    try {
      const token = await getToken(server.id, server.oauth_generation), session = await connect(server, token);
      const response = await rpc(server.endpoint_url, token, "tools/call", { name: toolName, arguments: args }, session.sessionId || void 0);
      remoteResult = response.result;
      const resultObject = asObject(remoteResult);
      if (resultObject.isError === true) {
        const content = Array.isArray(resultObject.content) ? resultObject.content : [];
        const detail = content.map((item) => clip(item?.text, 500)).filter(Boolean).join("\\n");
        const remoteFailure = new Error(detail || "Remote MCP tool returned isError=true");
        remoteFailure.code = "MCP_TOOL_ERROR";
        throw remoteFailure;
      }
      const serialized = JSON.stringify(remoteResult);
      if (serialized.length > MAX_RESULT) throw new Error("Connector result exceeds the 90 KB limit");
      const { error: updateError } = await db.from("jd_connector_executions").update({ status: "succeeded", result_json: remoteResult, error_code: null, duration_ms: Date.now() - started, completed_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", run.id).eq("school_id", school);
      if (updateError) throw new Error("Remote tool returned success, but execution evidence could not be persisted");
      const warnings = [];
      let approvalStatusPersisted = true;
      if (approvalId) {
        const { error: approvalUpdateError } = await db.from("jd_connector_approvals").update({ status: "executed", execution_id: run.id }).eq("id", approvalId).eq("school_id", school);
        if (approvalUpdateError) {
          approvalStatusPersisted = false;
          warnings.push("Execution succeeded and evidence was saved, but approval status could not be updated.");
        }
      }
      let auditError = null;
      try {
        const auditResult = await audit("connector.tool.executed", { server_id: server.id, tool_name: toolName, execution_id: run.id, approval_id: approvalId });
        auditError = auditResult.error;
      } catch (error) {
        auditError = error;
      }
      if (auditError) warnings.push("Execution succeeded and evidence was saved, but the audit event could not be recorded.");
      return { executionId: run.id, result: remoteResult, evidence: { persisted: true, source: "jd_connector_executions", audit_recorded: !auditError, approval_status_persisted: approvalStatusPersisted }, warnings };
    } catch (e) {
      if (server.oauth_provider_id && /HTTP (401|403)/.test(safeError(e))) await db.from("jd_connector_servers").update({ status: "error", last_error_code: "OAUTH_RECONNECT_REQUIRED" }).eq("id", server.id).eq("school_id", school).eq("oauth_generation", server.oauth_generation);
      const code = clip(e?.code, 80) || "MCP_CALL_FAILED";
      const failureMessage = e instanceof Error ? e.message : "Connector operation failed";
      const { error: failureUpdateError } = await db.from("jd_connector_executions").update({ status: "failed", result_json: remoteResult, error_code: code, duration_ms: Date.now() - started, completed_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", run.id).eq("school_id", school);
      if (failureUpdateError) throw new Error(failureMessage + "; failed execution evidence could not be persisted");
      if (approvalId) {
        const { error: approvalFailureError } = await db.from("jd_connector_approvals").update({ status: "failed", execution_id: run.id }).eq("id", approvalId).eq("school_id", school);
        if (approvalFailureError) throw new Error(failureMessage + "; approval failure status could not be persisted");
      }
      const { error: auditFailureError } = await audit("connector.tool.failed", { server_id: server.id, tool_name: toolName, execution_id: run.id, error_code: code });
      if (auditFailureError) throw new Error(failureMessage + "; failure audit event could not be persisted");
      throw e;
    }
  };
  try {
    if (body.action === "catalog") return send({ protocol: "MCP Streamable HTTP", transport: "HTTPS", approvalPolicy: "OAuth connections require human approval for every untrusted or write-capable tool. Legacy/custom grants retain their existing separate policy.", providers: Object.values(MCP_OAUTH_PROVIDERS).map((p) => p.name), nativeApps: ["Google Workspace", "Microsoft 365"], hostAllowlistConfigured: allowed.length > 0 });
    if (body.action === "servers.list") {
      const { data, error } = await db.from("jd_connector_servers").select("id,name,host,endpoint_url,status,protocol_version,server_info,last_connected_at,last_error_code,created_at,oauth_provider_id,access_owner_user_id,oauth_actor_id").eq("school_id", school).order("created_at", { ascending: false });
      if (error) throw error;
      const visible = (data || []).filter((s) => canUseConnector(s, actor)), ids = visible.map((s) => s.id);
      const { data: grants, error: grantError } = ids.length ? await db.from("jd_connector_grants").select("server_id,access_level,granted_by,granted_at,expires_at").eq("school_id", school).in("server_id", ids) : { data: [], error: null };
      if (grantError) throw grantError;
      const byServer = new Map((grants || []).map((g) => [g.server_id, g]));
      return send({ servers: visible.map((server) => ({ ...server, grant: byServer.get(server.id) || { access_level: "read_only", granted_at: null, expires_at: null } })) });
    }
    if (body.action === "grants.set") {
      if (internal) return send({ error: "Connector permissions must be changed by a signed-in person" }, 403);
      if (!["owner", "admin"].includes(String(profile.role))) return send({ error: "Only an owner or admin can change connector permissions" }, 403);
      const server = await getServer(clip(body.serverId, 64));
      if (server.oauth_provider_id && body.accessLevel !== "read_only") return send({ error: "OAuth write actions require per-action human approval" }, 400);
      const level = body.accessLevel;
      if (!["read_only", "read_write", "full_control"].includes(level)) return send({ error: "Access level must be read_only, read_write or full_control" }, 400);
      const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
      if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now())) return send({ error: "Grant expiry must be a future date" }, 400);
      const { data: grant, error } = await db.from("jd_connector_grants").upsert({ school_id: school, server_id: server.id, access_level: level, granted_by: actor, granted_at: (/* @__PURE__ */ new Date()).toISOString(), expires_at: expiresAt?.toISOString() || null }, { onConflict: "server_id" }).select("server_id,access_level,granted_by,granted_at,expires_at").single();
      if (error || !grant) throw new Error("Could not persist connector permissions");
      const auditResult = await audit("connector.permissions.granted", { server_id: server.id, access_level: level, expires_at: grant.expires_at });
      if (auditResult.error) throw new Error("Permission was saved but its audit event could not be recorded");
      return send({ grant });
    }
    if (body.action === "grants.revoke") {
      const server = await getServer(clip(body.serverId, 64));
      const { error } = await db.from("jd_connector_grants").delete().eq("server_id", server.id).eq("school_id", school);
      if (error) throw new Error("Could not revoke connector permissions");
      const auditResult = await audit("connector.permissions.revoked", { server_id: server.id });
      if (auditResult.error) throw new Error("Permission was revoked but its audit event could not be recorded");
      return send({ revoked: true, serverId: server.id });
    }
    if (body.action === "servers.public_connect") {
      if (internal || body.confirm !== true) return send({ error: "Confirm public access as a signed-in person" }, 403);
      const presets = { exa: { name: "Exa", endpoint: "https://mcp.exa.ai/mcp" }, firecrawl: { name: "Firecrawl", endpoint: "https://mcp.firecrawl.dev/v2/mcp" } };
      if (!Object.hasOwn(presets, body.providerId)) return send({ error: "No keyless access configured for this provider" }, 400);
      const preset = presets[body.providerId], endpoint = validateMcpEndpoint(preset.endpoint, allowed);
      const { data: server, error } = await db.from("jd_connector_servers").insert({ school_id: school, name: preset.name, endpoint_url: endpoint.toString(), host: endpoint.hostname, status: "error", created_by: actor, access_owner_user_id: actor }).select("id,name,endpoint_url,host").single();
      if (error || !server) throw new Error("Could not register public access; inspect existing connections before retrying");
      try {
        const tools = await refreshTools(server, "");
        await audit("connector.public.connected", { server_id: server.id, provider_id: body.providerId });
        return send({ server, tools });
      } catch {
        throw new Error("Public tool discovery failed. No working connection confirmed. Inspect My connections.");
      }
    }
    if (body.action === "servers.register") {
      if (internal || !["owner", "admin"].includes(String(profile.role)) || Deno.env.get("JD_MCP_ALLOW_CUSTOM_SETUP") !== "true") return send({ error: "Custom credential setup is operator-only. Use provider sign-in in the directory." }, 403);
      if (!allowed.length) return send({ error: "No MCP hosts are enabled. Configure JD_MCP_ALLOWED_HOSTS before registering a server." }, 503);
      const endpoint = validateMcpEndpoint(body.endpoint, allowed), name = clip(body.name, 100);
      if (!name) return send({ error: "Connector name is required" }, 400);
      const token = clip(body.bearerToken, 8e3);
      if (token && token.length < 12) return send({ error: "Bearer token is too short" }, 400);
      const { data: server, error } = await db.from("jd_connector_servers").insert({ school_id: school, name, endpoint_url: endpoint.toString(), host: endpoint.hostname, status: "connected", created_by: actor }).select("id,name,endpoint_url,host").single();
      if (error || !server) throw new Error("Could not register MCP server");
      if (token) {
        const encrypted = await encryptSecret(token, requireEncryptionKey());
        const { error: credentialError } = await db.from("jd_connector_credentials").insert({ server_id: server.id, school_id: school, encrypted_bearer_token: encrypted, key_version: "aes-gcm-v1" });
        if (credentialError) throw new Error("Could not securely store connector credentials");
      }
      try {
        const tools = await refreshTools(server, token);
        await audit("connector.server.registered", { server_id: server.id, host: endpoint.hostname, tool_count: tools.length });
        return send({ server, tools, notice: "MCP server connected and tools discovered" }, 201);
      } catch (e) {
        await db.from("jd_connector_servers").update({ status: "error", last_error_code: "INITIALIZATION_FAILED" }).eq("id", server.id);
        throw e;
      }
    }
    if (body.action === "servers.disconnect") {
      const id = clip(body.serverId, 64);
      const server = await getServer(id);
      if (internal) return send({ error: "Disconnect must be requested by a signed-in person" }, 403);
      if (server.oauth_provider_id) {
        const revocation = await prepareConnectorRevocation(db, server);
        const { data: done, error } = await db.rpc("jd_disconnect_connector_oauth", { p_server: id, p_actor: actor });
        if (error || done !== true) throw new Error("Could not disconnect safely");
        let revocationAccepted = false;
        if (revocation) try {
          const response = await fetch(revocation.url, revocation.request);
          revocationAccepted = response.ok;
          await response.body?.cancel();
        } catch {
        }
        await audit("connector.oauth.disconnected", { server_id: id, local_credentials_erased: true, provider_revocation_accepted: revocationAccepted });
        return send({ disconnected: true, providerRevocationAccepted: revocationAccepted, notice: revocationAccepted ? "JD credentials removed. Provider accepted the token revocation request; review its authorised apps to confirm any remaining grants. In-flight requests may still finish." : "JD access and stored credentials removed. Provider revocation was unavailable or unconfirmed; remove JD in the provider\u2019s authorised apps too. In-flight requests may still finish." });
      }
      const [{ error: credentialError }, { error: toolError }, { error: approvalError }, { error: serverError }] = await Promise.all([
        db.from("jd_connector_credentials").delete().eq("server_id", id).eq("school_id", school),
        db.from("jd_connector_tools").delete().eq("server_id", id).eq("school_id", school),
        db.from("jd_connector_approvals").update({ status: "expired" }).eq("server_id", id).eq("school_id", school).eq("status", "pending"),
        db.from("jd_connector_servers").update({ status: "disabled", last_error_code: null, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).eq("school_id", school)
      ]);
      if (credentialError || toolError || approvalError || serverError) throw new Error("Could not disconnect MCP server safely");
      await audit("connector.server.disconnected", { server_id: id, host: server.host, credentials_deleted: true });
      return send({ disconnected: true, history_preserved: true });
    }
    if (body.action === "servers.reconnect") {
      if (internal || !["owner", "admin"].includes(String(profile.role)) || Deno.env.get("JD_MCP_ALLOW_CUSTOM_SETUP") !== "true") return send({ error: "Use provider sign-in to reconnect. Custom token setup is operator-only." }, 403);
      const id = clip(body.serverId, 64), token = clip(body.bearerToken, 8e3);
      if (token && token.length < 12) return send({ error: "Bearer token is too short" }, 400);
      const server = await getServer(id);
      if (server.oauth_provider_id) return send({ error: "Reconnect this provider with OAuth from the directory" }, 400);
      const credentialResult = token ? await db.from("jd_connector_credentials").upsert({ server_id: id, school_id: school, encrypted_bearer_token: await encryptSecret(token, requireEncryptionKey()), key_version: "aes-gcm-v1", updated_at: (/* @__PURE__ */ new Date()).toISOString() }, { onConflict: "server_id" }) : await db.from("jd_connector_credentials").delete().eq("server_id", id).eq("school_id", school);
      const credentialError = credentialResult.error;
      if (credentialError) throw new Error("Could not securely update connector credentials");
      await db.from("jd_connector_servers").update({ status: "connected", last_error_code: null, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).eq("school_id", school);
      const tools = await refreshTools(server, token);
      await audit("connector.server.reconnected", { server_id: id, host: server.host, tool_count: tools.length });
      return send({ reconnected: true, tools });
    }
    if (body.action === "tools.refresh") {
      const server = await getServer(clip(body.serverId, 64)), token = await getToken(server.id, server.oauth_generation);
      try {
        const tools = await refreshTools(server, token);
        await audit("connector.tools.refreshed", { server_id: server.id, tool_count: tools.length });
        return send({ tools });
      } catch (e) {
        if (server.oauth_provider_id) await db.from("jd_connector_servers").update({ status: "error", last_error_code: /HTTP (401|403)/.test(safeError(e)) ? "OAUTH_RECONNECT_REQUIRED" : "DISCOVERY_FAILED" }).eq("id", server.id).eq("school_id", school).eq("oauth_generation", server.oauth_generation);
        throw e;
      }
    }
    if (body.action === "tools.set_read_only") {
      const id = clip(body.toolId, 64), enabled = body.enabled === true;
      const { data: tool, error } = await db.from("jd_connector_tools").select("id,server_id,name,annotations").eq("id", id).eq("school_id", school).maybeSingle();
      if (error || !tool) return send({ error: "MCP tool not found" }, 404);
      await getServer(tool.server_id);
      if (internal) return send({ error: "Tool trust requires a signed-in person" }, 403);
      if (enabled && !isReadOnlyTool({ name: tool.name, annotations: asObject(tool.annotations) })) return send({ error: "This MCP tool is not explicitly annotated as read-only and cannot be trusted for automatic execution" }, 400);
      const { error: updateError } = await db.from("jd_connector_tools").update({ read_only: enabled }).eq("id", id).eq("school_id", school);
      if (updateError) throw new Error("Could not update tool permission");
      await audit("connector.tool.permission_changed", { tool_id: id, tool_name: tool.name, automatic_read_only: enabled });
      return send({ toolId: id, automaticReadOnly: enabled });
    }
    if (body.action === "tools.list") {
      const ids = await visibleServerIds();
      if (!ids.length) return send({ tools: [] });
      const query = db.from("jd_connector_tools").select("id,server_id,name,description,input_schema,annotations,read_only,discovered_at").eq("school_id", school).in("server_id", ids).order("name");
      const serverId = clip(body.serverId, 64);
      if (serverId) query.eq("server_id", serverId);
      const { data, error } = await query;
      if (error) throw error;
      return send({ tools: data || [] });
    }
    if (body.action === "tools.call") {
      const toolId = clip(body.toolId, 64), args = asObject(body.arguments);
      const { data: tool, error } = await db.from("jd_connector_tools").select("id,server_id,name,read_only,annotations").eq("id", toolId).eq("school_id", school).maybeSingle();
      if (error || !tool) return send({ error: "MCP tool not found" }, 404);
      const server = await getServer(tool.server_id);
      if (server.status !== "connected") return send({ error: "Provider is not connected. Sign in or refresh tools first." }, 409);
      const { data: grant, error: grantError } = await db.from("jd_connector_grants").select("access_level,expires_at").eq("server_id", server.id).eq("school_id", school).maybeSingle();
      if (grantError) throw new Error("Could not verify connector permissions");
      const activeGrant = grant && (!grant.expires_at || new Date(grant.expires_at).getTime() > Date.now()) ? grant : null;
      const level = activeGrant?.access_level || "read_only";
      const readOnly = isReadOnlyTool({ name: tool.name, annotations: asObject(tool.annotations) });
      const elevated = level === "read_write" || level === "full_control";
      const unrestricted = level === "full_control";
      const legacyRequiresApproval = !readOnly && (!elevated || !unrestricted && (asObject(tool.annotations).destructiveHint === true || asObject(tool.annotations).openWorldHint === true));
      const requiresApproval = server.oauth_provider_id ? !readOnly || tool.read_only !== true : legacyRequiresApproval;
      if (requiresApproval) {
        const serializedArgs = JSON.stringify(args);
        if (serializedArgs.length > 3e4) return send({ error: "Tool arguments exceed the 30 KB approval limit" }, 413);
        const encrypted = await encryptSecret(serializedArgs, requireEncryptionKey());
        const { data: approval, error: approvalError } = await db.from("jd_connector_approvals").insert({ school_id: school, server_id: server.id, requested_by: actor, tool_name: tool.name, arguments_ciphertext: encrypted }).select("id,status,expires_at").single();
        if (approvalError || !approval) return send({ error: "Could not create approval request" }, 500);
        await audit("connector.approval.requested", { server_id: server.id, tool_name: tool.name, approval_id: approval.id });
        return send({ requiresApproval: true, approval });
      }
      const result = await execute(server, tool.name, args, null);
      return send({ requiresApproval: false, permissionLevel: level, ...result });
    }
    if (body.action === "approvals.list") {
      const ids = await visibleServerIds();
      if (!ids.length) return send({ approvals: [] });
      const { data, error } = await db.from("jd_connector_approvals").select("id,server_id,requested_by,tool_name,arguments_ciphertext,status,resolved_by,resolved_at,expires_at,created_at").eq("school_id", school).in("server_id", ids).eq("status", "pending").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      const approvals = await Promise.all((data || []).map(async (row) => ({ id: row.id, server_id: row.server_id, requested_by: row.requested_by, tool_name: row.tool_name, status: row.status, resolved_by: row.resolved_by, resolved_at: row.resolved_at, expires_at: row.expires_at, created_at: row.created_at, arguments: asObject(JSON.parse(await decryptSecret(row.arguments_ciphertext, requireEncryptionKey()))) })));
      return send({ approvals });
    }
    if (body.action === "approvals.get") {
      const id = clip(body.approvalId, 64);
      if (!id) return send({ error: "approvalId is required" }, 400);
      const { data: approval, error } = await db.from("jd_connector_approvals").select("id,server_id,requested_by,tool_name,status,resolved_by,resolved_at,expires_at,execution_id,created_at").eq("id", id).eq("school_id", school).maybeSingle();
      if (error || !approval) return send({ error: "Approval request not found" }, 404);
      await getServer(approval.server_id);
      let execution = null;
      if (approval.execution_id) {
        const { data, error: executionError } = await db.from("jd_connector_executions").select("id,tool_name,status,result_json,error_code,duration_ms,created_at,completed_at").eq("id", approval.execution_id).eq("school_id", school).maybeSingle();
        if (executionError) return send({ error: "Approval status was found but execution evidence could not be loaded" }, 500);
        execution = data || null;
      }
      return send({ approval, execution, evidence: { persisted: !!execution, source: "jd_connector_executions" } });
    }
    if (body.action === "approvals.resolve") {
      if (internal) return send({ error: "Approvals must be resolved by a signed-in person" }, 403);
      const id = clip(body.approvalId, 64), decision = body.decision === "approve" ? "approved" : body.decision === "deny" ? "denied" : "";
      if (!decision) return send({ error: "Decision must be approve or deny" }, 400);
      const { data: approval, error } = await db.from("jd_connector_approvals").select("*").eq("id", id).eq("school_id", school).eq("status", "pending").maybeSingle();
      if (error || !approval) return send({ error: "Pending approval not found" }, 404);
      const approvalServer = await getServer(approval.server_id);
      if (approvalServer.status !== "connected") return send({ error: "Provider is no longer connected" }, 409);
      if (new Date(approval.expires_at).getTime() < Date.now()) {
        await db.from("jd_connector_approvals").update({ status: "expired" }).eq("id", id);
        return send({ error: "Approval expired" }, 410);
      }
      const { data: claimed, error: claimError } = await db.from("jd_connector_approvals").update({ status: decision, resolved_by: actor, resolved_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).eq("school_id", school).eq("status", "pending").select("id").maybeSingle();
      if (claimError || !claimed) return send({ error: "Approval was already resolved" }, 409);
      if (decision === "denied") {
        await audit("connector.approval.denied", { approval_id: id, tool_name: approval.tool_name });
        return send({ approved: false, denied: true });
      }
      try {
        const server = await getServer(approval.server_id);
        if (server.status !== "connected" || server.oauth_provider_id && server.oauth_generation !== approvalServer.oauth_generation) throw new Error("Connection changed after approval. Request approval again.");
        const raw = await decryptSecret(approval.arguments_ciphertext, requireEncryptionKey()), args = asObject(JSON.parse(raw));
        const result = await execute(server, approval.tool_name, args, id);
        return send({ approved: true, ...result });
      } catch (e) {
        await db.from("jd_connector_approvals").update({ status: "failed" }).eq("id", id).eq("school_id", school);
        throw e;
      }
    }
    if (body.action === "executions.list") {
      const ids = await visibleServerIds();
      if (!ids.length) return send({ executions: [] });
      const { data, error } = await db.from("jd_connector_executions").select("id,server_id,approval_id,requested_by,tool_name,status,result_json,error_code,duration_ms,created_at,completed_at").eq("school_id", school).in("server_id", ids).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return send({ executions: data || [] });
    }
    return send({ error: "Unknown JD Connect action" }, 400);
  } catch (e) {
    const message = safeError(e);
    if (message.includes("allowlist") || message.includes("HTTPS") || message.includes("Private,")) return send({ error: message }, 400);
    return send({ error: message }, 500);
  }
});
