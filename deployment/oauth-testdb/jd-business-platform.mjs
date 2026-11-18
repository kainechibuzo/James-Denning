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

// supabase/functions/_shared/jd-workspace-connectors.mjs
var G = "https://www.googleapis.com/auth/";
var service = (id, name, provider, category, description, scopes) => Object.freeze({ id, name, provider, category, description, scopes: Object.freeze(scopes) });
var WORKSPACE_SERVICES = Object.freeze([
  service("gmail", "Gmail", "google-workspace", "Email", "Find messages and read subjects, senders and snippets. No sending or mailbox changes.", [G + "gmail.readonly"]),
  service("google-drive", "Google Drive", "google-workspace", "Files", "Find files and folders and inspect metadata. No sharing, deleting or file downloads.", [G + "drive.metadata.readonly"]),
  service("google-sheets", "Google Sheets", "google-workspace", "Spreadsheets", "Find spreadsheets and read a bounded cell range. No edits.", [G + "drive.metadata.readonly", G + "spreadsheets.readonly"]),
  service("google-docs", "Google Docs", "google-workspace", "Documents", "Find documents and read document text. No edits.", [G + "drive.metadata.readonly", G + "documents.readonly"]),
  service("google-calendar", "Google Calendar", "google-workspace", "Scheduling", "Read upcoming primary-calendar events. No invitations or changes.", [G + "calendar.events.readonly"]),
  service("outlook", "Outlook", "microsoft-365", "Email", "Read recent messages, subjects and body previews. No sending or mailbox changes.", ["Mail.Read"]),
  service("onedrive", "OneDrive", "microsoft-365", "Files", "Find files and inspect metadata. No sharing, deleting or downloads.", ["Files.Read"]),
  service("excel", "Excel", "microsoft-365", "Spreadsheets", "Find Excel files and inspect metadata. Workbook cells and editing are not implemented.", ["Files.Read"]),
  service("word", "Word", "microsoft-365", "Documents", "Find Word files and inspect metadata. Document text and editing are not implemented.", ["Files.Read"]),
  service("outlook-calendar", "Outlook Calendar", "microsoft-365", "Scheduling", "Read upcoming calendar events. No invitations or changes.", ["Calendars.Read"]),
  service("microsoft-teams", "Microsoft Teams", "microsoft-365", "Collaboration", "List joined teams. Reading chat messages and posting are not implemented.", ["Team.ReadBasic.All"])
]);
var WORKSPACE_PROVIDERS = Object.freeze({
  "google-workspace": Object.freeze({ name: "Google", authOrigin: "https://accounts.google.com", authPath: "/o/oauth2/v2/auth", clientIdEnv: "JD_OAUTH_GOOGLE_CLIENT_ID", clientSecretEnv: "JD_OAUTH_GOOGLE_CLIENT_SECRET" }),
  "microsoft-365": Object.freeze({ name: "Microsoft", authOrigin: "https://login.microsoftonline.com", authPath: "/common/oauth2/v2.0/authorize", clientIdEnv: "JD_OAUTH_MICROSOFT_CLIENT_ID", clientSecretEnv: "JD_OAUTH_MICROSOFT_CLIENT_SECRET" })
});
var workspaceService = (id) => WORKSPACE_SERVICES.find((s) => s.id === id);
function selectedWorkspaceServices(provider, ids) {
  if (!Object.hasOwn(WORKSPACE_PROVIDERS, provider) || !Array.isArray(ids) || !ids.length || ids.length > WORKSPACE_SERVICES.length) throw Error("Select at least one supported app.");
  const unique = [...new Set(ids)];
  if (unique.some((id) => typeof id !== "string" || workspaceService(id)?.provider !== provider)) throw Error("App selection does not belong to this provider.");
  return unique;
}
function workspaceScopes(provider, ids) {
  const selected = selectedWorkspaceServices(provider, ids);
  return [.../* @__PURE__ */ new Set(["openid", "email", "profile", ...provider === "microsoft-365" ? ["offline_access"] : [], ...selected.flatMap((id) => workspaceService(id).scopes)])];
}
function workspaceAccess(service2, connection, actorId, now = Date.now()) {
  if (!connection || connection.status !== "connected") return "not_connected";
  if (connection.connected_by !== actorId) return "different_account_owner";
  if (!Array.isArray(connection.enabled_read_services) || !connection.enabled_read_services.includes(service2.id)) return "not_selected";
  const expiry = Date.parse(connection.token_expires_at);
  if (!Number.isFinite(expiry) || expiry <= now) return "reconnect_required";
  if (!Array.isArray(connection.scopes) || !service2.scopes.every((s) => connection.scopes.includes(s))) return "permission_required";
  return "read_access";
}
var text = (v, max = 2e3) => typeof v === "string" ? v.slice(0, max) : "";
var idPart = (value) => {
  if (typeof value !== "string" || !value || value.length > 256 || /[\u0000-\u0020/\\?#]/.test(value) || [".", ".."].includes(value)) throw Error("A valid provider record ID is required.");
  return encodeURIComponent(value);
};
function workspaceReadRequest(id, args = {}, now = /* @__PURE__ */ new Date()) {
  if (!workspaceService(id)) throw Error("Unsupported workspace app.");
  if (Object.keys(args).some((k) => !["resourceId", "query", "range"].includes(k))) throw Error("Unsupported read argument.");
  const query = text(args.query, 160), resource = args.resourceId ? idPart(args.resourceId) : null;
  let url, view = id;
  if (id === "gmail") url = resource ? new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${resource}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`) : new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10");
  if (id === "gmail" && !resource && query) url.searchParams.set("q", query);
  if (["google-drive", "google-sheets", "google-docs"].includes(id)) {
    if (resource && id === "google-docs") url = new URL(`https://docs.googleapis.com/v1/documents/${resource}`);
    else if (resource && id === "google-sheets") {
      const range = args.range || "A1:Z50";
      if (typeof range !== "string" || range.length > 120 || /[\u0000-\u001f]/.test(range)) throw Error("Use a short spreadsheet range.");
      url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${resource}/values/${encodeURIComponent(range)}`);
    } else if (resource) url = new URL(`https://www.googleapis.com/drive/v3/files/${resource}?fields=id,name,mimeType,webViewLink,modifiedTime,size`);
    else {
      url = new URL("https://www.googleapis.com/drive/v3/files?pageSize=10&fields=files(id,name,mimeType,webViewLink,modifiedTime),nextPageToken");
      let q = "trashed = false";
      if (id !== "google-drive") q += ` and mimeType = '${id === "google-docs" ? "application/vnd.google-apps.document" : "application/vnd.google-apps.spreadsheet"}'`;
      if (query) q += ` and name contains '${query.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
      url.searchParams.set("q", q);
      view = "files";
    }
  }
  if (id === "google-calendar") {
    url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=10&singleEvents=true&orderBy=startTime");
    url.searchParams.set("timeMin", now.toISOString());
    if (query) url.searchParams.set("q", query);
  }
  if (id === "outlook") url = new URL(`https://graph.microsoft.com/v1.0/me/messages${resource ? "/" + resource : ""}?$select=id,subject,from,receivedDateTime,bodyPreview,webLink${resource ? "" : "&$top=10&$orderby=receivedDateTime desc"}`);
  if (["onedrive", "excel", "word"].includes(id)) {
    if (resource) url = new URL(`https://graph.microsoft.com/v1.0/me/drive/items/${resource}?$select=id,name,webUrl,size,lastModifiedDateTime,file,folder`);
    else {
      const term = id === "excel" ? ".xlsx" : id === "word" ? ".docx" : query;
      url = new URL(term ? `https://graph.microsoft.com/v1.0/me/drive/root/search(q='${encodeURIComponent(term.replace(/'/g, "''"))}')` : "https://graph.microsoft.com/v1.0/me/drive/root/children");
      url.searchParams.set("$top", "10");
      url.searchParams.set("$select", "id,name,webUrl,size,lastModifiedDateTime,file,folder");
    }
  }
  if (id === "outlook-calendar") {
    url = new URL("https://graph.microsoft.com/v1.0/me/calendarView?$top=10&$select=id,subject,start,end,location,webLink&$orderby=start/dateTime");
    url.searchParams.set("startDateTime", now.toISOString());
    url.searchParams.set("endDateTime", new Date(now.getTime() + 30 * 864e5).toISOString());
  }
  if (id === "microsoft-teams") url = new URL("https://graph.microsoft.com/v1.0/me/joinedTeams?$select=id,displayName,description");
  if (!url) throw Error("Unsupported read request.");
  return { url: url.toString(), method: "GET", view, resource: Boolean(resource) };
}
function projectWorkspaceResponse(serviceId, request, data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw Error("Provider returned an invalid response.");
  let result;
  if (request.view === "files") result = { files: (data.files || []).slice(0, 10) };
  else if (serviceId === "gmail") result = request.resource ? { id: data.id, snippet: text(data.snippet), headers: (data.payload?.headers || []).filter((h) => ["subject", "from", "date"].includes(String(h.name).toLowerCase())).map((h) => ({ name: h.name, value: text(h.value) })) } : { messages: (data.messages || []).slice(0, 10), hint: "Use a returned message ID to read its subject, sender and snippet." };
  else if (serviceId === "google-docs" && request.resource) {
    let output = "";
    const visit = (x, depth = 0) => {
      if (depth > 25 || output.length >= 3e4 || !x || typeof x !== "object") return;
      if (x.textRun?.content) output += text(x.textRun.content, 3e4 - output.length);
      for (const [k, v] of Object.entries(x)) if (k !== "textRun") {
        if (Array.isArray(v)) v.forEach((y) => visit(y, depth + 1));
        else if (v && typeof v === "object") visit(v, depth + 1);
      }
    };
    visit(data.body);
    result = { title: text(data.title), text: output, content_limited: output.length >= 3e4 };
  } else if (serviceId === "google-sheets" && request.resource) result = { range: text(data.range), values: (data.values || []).slice(0, 50).map((row) => row.slice(0, 26).map((cell) => text(String(cell), 1e3))), limited_to: "50 rows, 26 columns, 1000 characters per cell" };
  else if (serviceId === "google-calendar") result = { events: (data.items || []).slice(0, 10).map((e) => ({ id: e.id, summary: text(e.summary), start: e.start, end: e.end, location: text(e.location), htmlLink: e.htmlLink })) };
  else if (serviceId === "outlook") result = { messages: (request.resource ? [data] : data.value || []).slice(0, 10).map((m) => ({ id: m.id, subject: text(m.subject), from: m.from, receivedDateTime: m.receivedDateTime, bodyPreview: text(m.bodyPreview, 4e3), webLink: m.webLink })) };
  else if (serviceId === "outlook-calendar") result = { events: (data.value || []).slice(0, 10).map((e) => ({ id: e.id, subject: text(e.subject), start: e.start, end: e.end, location: e.location, webLink: e.webLink })) };
  else if (serviceId === "microsoft-teams") result = { teams: (data.value || []).slice(0, 10).map((t) => ({ id: t.id, name: text(t.displayName), description: text(t.description) })) };
  else result = { files: (request.resource ? [data] : data.value || []).slice(0, 10).map((f) => ({ id: f.id, name: text(f.name), mimeType: f.mimeType || f.file?.mimeType, url: f.webUrl || f.webViewLink, size: f.size, modified: f.lastModifiedDateTime || f.modifiedTime })) };
  return { ...result, more_available: Boolean(data.nextPageToken || data["@odata.nextLink"]), scope: "bounded read-only result; not a full account export", external_content_is_untrusted: true };
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

// supabase/functions/_shared/jd-workspace-refresh.ts
async function refreshWorkspaceConnection(ctx, providerId, dependencies = {}) {
  if (!["owner", "admin", "manager"].includes(ctx.role) || !Object.hasOwn(WORKSPACE_PROVIDERS, providerId)) throw Error("Workspace refresh is not authorised.");
  const { data: row, error } = await ctx.admin.from("jd_business_oauth_connections").select("provider_id,status,scopes,connected_by,enabled_read_services,token_expires_at,encrypted_credentials").eq("school_id", ctx.schoolId).eq("provider_id", providerId).eq("connected_by", ctx.userId).maybeSingle();
  if (error || row?.status !== "connected" || row.connected_by !== ctx.userId || !row.encrypted_credentials) throw Error("No active personal connection to refresh.");
  const key = await importAesKey(dependencies.key || getJdSecret("JD_OAUTH_ENCRYPTION_KEY"));
  const stored = JSON.parse(await decryptSecret(row.encrypted_credentials, key));
  if (!stored.refresh_token) throw Error("Provider did not issue offline access. Sign in again.");
  const env = dependencies.env || ((k) => Deno.env.get(k));
  const provider = WORKSPACE_PROVIDERS[providerId], client = env(provider.clientIdEnv), secret = env(provider.clientSecretEnv);
  if (!client || !secret) throw Error("Operator provider configuration is missing.");
  const { error: auditError } = await ctx.admin.rpc("jd_business_audit", { p_school_id: ctx.schoolId, p_actor_id: ctx.userId, p_event_type: "workspace.oauth.refresh_requested", p_event: { provider_id: providerId } });
  if (auditError) throw Error("Could not record refresh audit.");
  const lease = crypto.randomUUID(), base = { p_school: ctx.schoolId, p_actor: ctx.userId, p_provider: providerId, p_previous: row.encrypted_credentials, p_lease: lease };
  const { data: claimed, error: claimError } = await ctx.admin.rpc("jd_claim_workspace_refresh", base);
  if (claimError || claimed !== true) throw Error("Connection is refreshing or changed. Try again shortly.");
  try {
    const config = { client_id: client, client_secret: secret, token_endpoint_auth_method: "client_secret_post" };
    const endpoint = providerId === "google-workspace" ? "https://oauth2.googleapis.com/token" : "https://login.microsoftonline.com/common/oauth2/v2.0/token";
    const payload = await oauthJson(await (dependencies.fetch || fetch)(endpoint, tokenRequest(config, { grant_type: "refresh_token", refresh_token: stored.refresh_token })));
    const bundle = tokenBundle(payload, { ...stored, scope: (row.scopes || []).join(" ") }, dependencies.now ?? Date.now());
    if (!bundle.expires_at) throw Error("Missing provider expiry.");
    const scopes = bundle.scope.split(/[ ,]+/).filter(Boolean), encrypted = await encryptSecret(JSON.stringify(bundle), key);
    const { data: saved, error: saveError } = await ctx.admin.rpc("jd_save_workspace_refresh", { ...base, p_bundle: encrypted, p_expiry: bundle.expires_at, p_scopes: scopes });
    if (saveError || saved !== true) throw Error("Connection changed during refresh.");
    return { ...row, encrypted_credentials: encrypted, token_expires_at: bundle.expires_at, scopes };
  } catch {
    throw Error("Provider refresh could not be confirmed. Sign in again.");
  }
}

// supabase/functions/_shared/jd-workspace-service.ts
var fields = "provider_id,status,scopes,connected_by,token_expires_at,enabled_read_services";
function authorised(ctx) {
  if (!["owner", "admin", "manager"].includes(ctx.role) || !ctx.schoolId || !ctx.userId) throw Error("Workspace manager permission required.");
}
async function workspaceCatalog(ctx, env = (key) => Deno.env.get(key)) {
  authorised(ctx);
  const { data, error } = await ctx.admin.from("jd_business_oauth_connections").select(fields).eq("school_id", ctx.schoolId).eq("connected_by", ctx.userId);
  if (error) throw Error("Workspace connection metadata unavailable. Apply the workspace read-services migration first.");
  return { providers: Object.entries(WORKSPACE_PROVIDERS).map(([id, p]) => ({ id, name: p.name, configured: Boolean(env(p.clientIdEnv) && env(p.clientSecretEnv) && env("JD_OAUTH_CALLBACK_URL") && getJdSecret("JD_OAUTH_ENCRYPTION_KEY")), services: WORKSPACE_SERVICES.filter((s) => s.provider === id).map((s) => ({ ...s, access: workspaceAccess(s, (data || []).find((c) => c.provider_id === id), ctx.userId) })) })), notice: "Read-only access belongs to the person who authorised the provider in this workspace. Identity-only OAuth is not app access. No sending, editing, sharing or deleting is implemented." };
}
async function boundedJson(response) {
  const reader = response.body?.getReader();
  if (!reader) throw Error("Provider returned an empty response.");
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024 * 1024) {
        await reader.cancel();
        throw Error("Provider response too large. Use a smaller record or range.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw Error("Provider returned invalid JSON.");
  }
}
async function readWorkspaceApp(args, ctx, dependencies = {}) {
  authorised(ctx);
  const service2 = workspaceService(args.service_id);
  if (!service2) throw Error("Unsupported workspace app.");
  const request = workspaceReadRequest(service2.id, args.arguments || {}, new Date(dependencies.now ?? Date.now()));
  const { data: loadedConnection, error } = await ctx.admin.from("jd_business_oauth_connections").select(fields + ",encrypted_credentials").eq("school_id", ctx.schoolId).eq("provider_id", service2.provider).eq("connected_by", ctx.userId).maybeSingle();
  if (error) throw Error("Could not load workspace connection.");
  let connection = loadedConnection;
  const now = dependencies.now ?? Date.now();
  const consent = workspaceAccess(service2, { ...connection, token_expires_at: new Date(now + 36e5).toISOString() }, ctx.userId, now);
  if (consent === "read_access" && connection?.token_expires_at && Date.parse(connection.token_expires_at) <= now + 6e4) connection = await refreshWorkspaceConnection(ctx, service2.provider, dependencies);
  const access = workspaceAccess(service2, connection, ctx.userId, now);
  if (access !== "read_access") throw Error("App read access unavailable: " + access + ". Select this app and reconnect in Connectors.");
  const key = dependencies.key ?? getJdSecret("JD_OAUTH_ENCRYPTION_KEY");
  if (!key) throw Error("Provider credential encryption is not configured.");
  let stored;
  try {
    stored = JSON.parse(await decryptSecret(connection.encrypted_credentials, await importAesKey(key)));
  } catch {
    throw Error("Stored provider credentials are unavailable. Reconnect.");
  }
  if (typeof stored.access_token !== "string" || !stored.access_token) throw Error("Stored provider access token is missing.");
  const audit = await ctx.admin.rpc("jd_business_audit", { p_school_id: ctx.schoolId, p_actor_id: ctx.userId, p_event_type: "workspace.read.requested", p_event: { service_id: service2.id } });
  if (audit.error) throw Error("Could not record read audit. No provider request was made.");
  const response = await (dependencies.fetch || fetch)(request.url, { method: "GET", headers: { Authorization: "Bearer " + stored.access_token, Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(15e3) });
  if (!response.ok) {
    await response.body?.cancel();
    throw Error(response.status === 401 || response.status === 403 ? "Provider rejected access. Reconnect with the required permissions." : "Provider read failed (HTTP " + response.status + ").");
  }
  const result = projectWorkspaceResponse(service2.id, request, await boundedJson(response));
  if (JSON.stringify(result).length > 6e4) throw Error("Result exceeds the read limit. Use a smaller range.");
  return { service_id: service2.id, ...result };
}

// supabase/functions/jd-business-platform/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";

// supabase/functions/_shared/jd-business-forecast.ts
function evaluateTrailingMean(series, minimumTraining = 3) {
  const ordered = [...series].sort((a, b) => a.month.localeCompare(b.month));
  if (ordered.length < minimumTraining + 1) return { trainingPeriods: ordered.length, holdoutPeriods: 0, mae: null, mape: null, predictions: [], method: "expanding_trailing_mean" };
  const predictions = [];
  for (let i = minimumTraining; i < ordered.length; i++) {
    const train = ordered.slice(0, i).map((x) => Number(x.actual));
    if (train.some((x) => !Number.isFinite(x))) continue;
    const predicted = train.reduce((a, b) => a + b, 0) / train.length;
    predictions.push({ month: ordered[i].month, actual: Number(ordered[i].actual), predicted });
  }
  if (!predictions.length) return { trainingPeriods: minimumTraining, holdoutPeriods: 0, mae: null, mape: null, predictions, method: "expanding_trailing_mean" };
  const mae = predictions.reduce((n, x) => n + Math.abs(x.actual - x.predicted), 0) / predictions.length;
  const nonZero = predictions.filter((x) => x.actual !== 0);
  const mape = nonZero.length ? nonZero.reduce((n, x) => n + Math.abs((x.actual - x.predicted) / x.actual), 0) / nonZero.length * 100 : null;
  return { trainingPeriods: ordered.length - predictions.length, holdoutPeriods: predictions.length, mae: Number(mae.toFixed(4)), mape: mape === null ? null : Number(mape.toFixed(4)), predictions, method: "expanding_trailing_mean" };
}

// supabase/functions/_shared/jd-expense-anomalies.ts
var num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
var dayMs = 864e5;
var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
var median = (values) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
function analyseExpenseAnomalies(expenses = [], budgets = [], nowInput) {
  const now = DATE_RE.test(nowInput ?? "") ? /* @__PURE__ */ new Date(nowInput + "T00:00:00Z") : /* @__PURE__ */ new Date();
  const findings = [];
  const approved = expenses.filter(
    (row) => ["approved", "paid"].includes(String(row?.status ?? "").toLowerCase()) && (num(row?.amount) ?? 0) > 0 && DATE_RE.test(String(row?.incurred_on ?? ""))
  );
  for (const budget of budgets) {
    if (String(budget?.status ?? "active").toLowerCase() !== "active") continue;
    const category = String(budget?.category ?? "").trim();
    const currency = String(budget?.currency ?? "").trim().toUpperCase();
    const budgetAmount = num(budget?.budget_amount);
    if (!category || !DATE_RE.test(String(budget?.period_start ?? "")) || !DATE_RE.test(String(budget?.period_end ?? "")) || budgetAmount === null || budgetAmount <= 0) continue;
    const threshold = Math.min(Math.max(num(budget?.alert_threshold_pct) ?? 80, 1), 100);
    const spend = approved.filter((row) => String(row.category ?? "").trim() === category && String(row.currency ?? "").trim().toUpperCase() === currency && String(row.incurred_on) >= budget.period_start && String(row.incurred_on) <= budget.period_end).reduce((sum, row) => sum + (num(row.amount) ?? 0), 0);
    const utilisation = spend / budgetAmount * 100;
    if (utilisation >= 100) {
      findings.push({
        id: `budget_exceeded:${category}:${currency}`,
        severity: "high",
        keys: ["jd_business_expenses", "jd_business_budgets"],
        title: `Approved spend in '${category}' has exceeded the ${currency} budget for the period`,
        evidence: `approved_spend=${spend.toFixed(2)} ${currency} vs budget_amount=${budgetAmount.toFixed(2)} ${currency} (utilisation ${utilisation.toFixed(1)}%)`,
        recommendation: "Review the overage in the expense approval queue; adjust the budget or escalate per workspace policy. JD never modifies budgets or expenses."
      });
    } else if (utilisation >= threshold) {
      findings.push({
        id: `budget_threshold:${category}:${currency}`,
        severity: "warning",
        keys: ["jd_business_expenses", "jd_business_budgets"],
        title: `Approved spend in '${category}' reached ${utilisation.toFixed(1)}% of the ${currency} budget`,
        evidence: `approved_spend=${spend.toFixed(2)} ${currency} vs budget_amount=${budgetAmount.toFixed(2)} ${currency} (alert threshold ${threshold}%)`,
        recommendation: "Flag to the workspace administrator before the period closes; no writes are performed by this analysis."
      });
    }
  }
  const byGroup = /* @__PURE__ */ new Map();
  for (const row of approved) {
    const groupKey = `${String(row.category ?? "").trim().toLowerCase()}|${String(row.currency ?? "").trim().toUpperCase()}`;
    const list = byGroup.get(groupKey) ?? [];
    list.push(row);
    byGroup.set(groupKey, list);
  }
  for (const [groupKey, rows] of byGroup) {
    if (rows.length < 5) continue;
    const amounts = rows.map((row) => num(row.amount) ?? 0);
    const med = median(amounts);
    if (med <= 0) continue;
    for (const row of rows) {
      const amount = num(row.amount) ?? 0;
      if (amount >= 3 * med) {
        const [category, currency] = groupKey.split("|");
        findings.push({
          id: `outlier:${category}:${currency}:${String(row.incurred_on)}:${amount.toFixed(2)}`,
          severity: "warning",
          keys: ["jd_business_expenses"],
          title: `Single ${currency} expense in '${row.category}' is at least 3x the category median`,
          evidence: `amount=${amount.toFixed(2)} ${currency} vs category median=${med.toFixed(2)} ${currency} (samples=${rows.length}, date=${row.incurred_on})`,
          recommendation: "Verify the receipt and approval chain for this expense; repeated outliers may indicate duplicate or miscoded entries. JD does not void or refund expenses."
        });
      }
    }
  }
  const nowMs = now.getTime();
  const windowStart = new Date(nowMs - 90 * dayMs).toISOString().slice(0, 10);
  const priorStart = new Date(nowMs - 180 * dayMs).toISOString().slice(0, 10);
  const end = now.toISOString().slice(0, 10);
  const trend = /* @__PURE__ */ new Map();
  for (const row of approved) {
    const groupKey = `${String(row.category ?? "").trim().toLowerCase()}|${String(row.currency ?? "").trim().toUpperCase()}`;
    const entry = trend.get(groupKey) ?? { current: 0, prior: 0, currentCount: 0, category: String(row.category ?? "").trim(), currency: String(row.currency ?? "").trim().toUpperCase() };
    const on = String(row.incurred_on);
    const amount = num(row.amount) ?? 0;
    if (on >= windowStart && on <= end) {
      entry.current += amount;
      entry.currentCount += 1;
    } else if (on >= priorStart && on < windowStart) {
      entry.prior += amount;
    }
    trend.set(groupKey, entry);
  }
  for (const entry of trend.values()) {
    if (entry.prior > 0 && entry.current >= 1.5 * entry.prior && entry.currentCount >= 3) {
      const increase = (entry.current - entry.prior) / entry.prior * 100;
      findings.push({
        id: `trend_spike:${entry.category.toLowerCase()}:${entry.currency}`,
        severity: "warning",
        keys: ["jd_business_expenses"],
        title: `Approved spend in '${entry.category}' rose ${increase.toFixed(0)}% versus the prior 90 days`,
        evidence: `trailing_90d=${entry.current.toFixed(2)} ${entry.currency} (n=${entry.currentCount}) vs prior_90d=${entry.prior.toFixed(2)} ${entry.currency}`,
        recommendation: `Investigate drivers before approving further ${entry.currency} spend in this category; report-only, no records are changed.`
      });
    }
  }
  const high = findings.filter((f) => f.severity === "high").length;
  const warning = findings.filter((f) => f.severity === "warning").length;
  const info = findings.filter((f) => f.severity === "info").length;
  return {
    unchanged: true,
    findings,
    summary: { high, warning, info, total: findings.length, approved_records_analysed: approved.length, budgets_evaluated: budgets.length },
    evidence: "jd_business_expenses",
    generated_at: now.toISOString(),
    limitations: [
      "Only approved/paid expenses are analysed; submitted-but-unreviewed spend is out of scope by design.",
      "Currencies are never summed across one another; comparisons stay within a single currency.",
      "Statistical outliers require at least five samples per category+currency; below that, no outlier findings are emitted.",
      "Findings are advisory; JD performs no writes, voids, refunds or budget changes from this analysis."
    ]
  };
}

// supabase/functions/_shared/jd-kpi-trends.ts
var num2 = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
var monthOf = (iso) => {
  if (typeof iso !== "string") return null;
  const m = iso.slice(0, 7);
  return /^\d{4}-\d{2}$/.test(m) ? m : null;
};
var monthKey = (year, month0) => `${year}-${String(month0 + 1).padStart(2, "0")}`;
function analyseKpiTrends(input = {}, nowInput, monthsBack = 12) {
  const now = nowInput && /^\d{4}-\d{2}-\d{2}$/.test(nowInput) ? /* @__PURE__ */ new Date(nowInput + "T00:00:00Z") : /* @__PURE__ */ new Date();
  const months = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(monthKey(d.getUTCFullYear(), d.getUTCMonth()));
  }
  const inRange = new Set(months);
  const index = new Map(months.map((m, i) => [m, i]));
  const zero = () => months.map(() => 0);
  const zeroByCurrency = () => ({});
  const cashIn = zeroByCurrency(), cashOut = zeroByCurrency(), expensesByCurrency = zeroByCurrency();
  const newOpportunities = zero(), wonOpportunitiesCreated = zero(), resolvedSupport = zero(), newCustomers = zero();
  for (const row of input.cash ?? []) {
    const m = monthOf(row?.occurred_on);
    if (!m || !inRange.has(m)) continue;
    const amount = num2(row?.amount);
    if (amount === null) continue;
    const currency = String(row?.currency ?? "NGN").trim().toUpperCase() || "NGN";
    const direction = String(row?.direction ?? "").toLowerCase();
    const cleared = String(row?.status ?? "cleared").toLowerCase() === "cleared";
    if (!cleared) continue;
    const target = direction === "inflow" ? cashIn : direction === "outflow" ? cashOut : null;
    if (!target) continue;
    target[currency] ??= zero();
    target[currency][index.get(m)] += amount;
  }
  for (const row of input.expenses ?? []) {
    const m = monthOf(row?.incurred_on);
    if (!m || !inRange.has(m)) continue;
    const amount = num2(row?.amount);
    if (amount === null) continue;
    if (!["approved", "paid"].includes(String(row?.status ?? "").toLowerCase())) continue;
    const currency = String(row?.currency ?? "NGN").trim().toUpperCase() || "NGN";
    expensesByCurrency[currency] ??= zero();
    expensesByCurrency[currency][index.get(m)] += amount;
  }
  for (const row of input.opportunities ?? []) {
    const m = monthOf(row?.created_at);
    if (!m || !inRange.has(m)) continue;
    newOpportunities[index.get(m)] += 1;
    if (String(row?.stage ?? "").toLowerCase() === "won") wonOpportunitiesCreated[index.get(m)] += 1;
  }
  for (const row of input.support ?? []) {
    const m = monthOf(row?.resolved_at);
    if (!m || !inRange.has(m)) continue;
    resolvedSupport[index.get(m)] += 1;
  }
  for (const row of input.customers ?? []) {
    const m = monthOf(row?.created_at);
    if (!m || !inRange.has(m)) continue;
    newCustomers[index.get(m)] += 1;
  }
  const tail3 = (series) => series.slice(-3).reduce((a, b) => a + b, 0);
  const prior3 = (series) => series.slice(-6, -3).reduce((a, b) => a + b, 0);
  const movement = (series) => ({ trailing_3m: tail3(series), prior_3m: prior3(series), delta: tail3(series) - prior3(series) });
  return {
    unchanged: true,
    months,
    series: {
      cash_in_by_currency: cashIn,
      cash_out_by_currency: cashOut,
      approved_expenses_by_currency: expensesByCurrency,
      new_opportunities: newOpportunities,
      won_opportunities_created: wonOpportunitiesCreated,
      resolved_support_cases: resolvedSupport,
      new_customers: newCustomers
    },
    movement: {
      new_opportunities: movement(newOpportunities),
      resolved_support_cases: movement(resolvedSupport),
      new_customers: movement(newCustomers)
    },
    limitations: [
      "Cash KPIs count cleared transactions only; pending inflows are excluded.",
      "Won-opportunity movement is attributed to the creation month of currently-won records (no closed_at timestamp exists); treat it as an approximation, not a win-rate.",
      "Money is grouped by currency; no cross-currency totals are produced.",
      "Counts are bucket-of-record timestamps bucketed in UTC months; no timezone adjustment is applied."
    ]
  };
}

// supabase/functions/_shared/jd-document-security.ts
var MB = 1024 * 1024;
var DOCUMENT_MAX_BYTES = 20 * MB;
var DECLARED_MIME_TO_DETECTED = {
  "application/pdf": ["pdf"],
  "text/plain": ["text"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "image/png": ["png"],
  "image/jpeg": ["jpeg"],
  "image/tiff": ["tiff"]
};
var startsWith = (bytes, signature, offset = 0) => {
  if (offset + signature.length > bytes.length) return false;
  for (let i = 0; i < signature.length; i += 1) if (bytes[offset + i] !== signature[i]) return false;
  return true;
};
var indexOfAscii = (bytes, needle, from = 0) => {
  const target = new TextEncoder().encode(needle.toLowerCase());
  outer: for (let i = from; i + target.length <= bytes.length; i += 1) {
    for (let j = 0; j < target.length; j += 1) {
      const b = bytes[i + j];
      const lower = b >= 65 && b <= 90 ? b + 32 : b;
      if (lower !== target[j]) continue outer;
    }
    return i;
  }
  return -1;
};
var peSignatureAt = (bytes, offset) => {
  if (offset + 64 > bytes.length) return false;
  const e_lfanew = bytes[offset + 60] | bytes[offset + 61] << 8 | bytes[offset + 62] << 16 | bytes[offset + 63] << 24;
  if (e_lfanew < 64 || offset + e_lfanew + 4 > bytes.length) return false;
  return bytes[offset + e_lfanew] === 80 && bytes[offset + e_lfanew + 1] === 69 && bytes[offset + e_lfanew + 2] === 0 && bytes[offset + e_lfanew + 3] === 0;
};
var findEmbeddedExecutable = (bytes) => {
  for (let i = 0; i + 4 <= bytes.length; i += 1) {
    if (bytes[i] === 127 && bytes[i + 1] === 69 && bytes[i + 2] === 76 && bytes[i + 3] === 70) {
      return { kind: "embedded ELF payload", offset: i };
    }
    if (bytes[i] === 77 && bytes[i + 1] === 90 && peSignatureAt(bytes, i)) {
      return { kind: "embedded Windows PE payload", offset: i };
    }
  }
  return null;
};
var sniffType = (bytes) => {
  if (!bytes.length) return "unsupported";
  if (startsWith(bytes, [37, 80, 68, 70, 45])) return "pdf";
  if (startsWith(bytes, [137, 80, 78, 71, 13, 10, 26, 10])) return "png";
  if (startsWith(bytes, [255, 216, 255])) return "jpeg";
  if (startsWith(bytes, [73, 73, 42, 0]) || startsWith(bytes, [77, 77, 0, 42]) || startsWith(bytes, [73, 73, 43, 0]) || startsWith(bytes, [77, 77, 0, 43])) return "tiff";
  if (startsWith(bytes, [208, 207, 17, 224, 161, 177, 26, 225])) return "ole2";
  if (startsWith(bytes, [80, 75, 3, 4]) || startsWith(bytes, [80, 75, 5, 6]) || startsWith(bytes, [80, 75, 7, 8])) {
    if (indexOfAscii(bytes, "vbaProject.bin") !== -1) return "executable";
    if (indexOfAscii(bytes, "word/document.xml") !== -1 || indexOfAscii(bytes, "word/") !== -1) return "docx";
    return "zip-container";
  }
  if (startsWith(bytes, [127, 69, 76, 70])) return "executable";
  if (startsWith(bytes, [77, 90]) && peSignatureAt(bytes, 0)) return "executable";
  if (startsWith(bytes, [254, 237, 250, 206]) || startsWith(bytes, [254, 237, 250, 207]) || startsWith(bytes, [206, 250, 237, 254]) || startsWith(bytes, [207, 250, 237, 254]) || startsWith(bytes, [202, 254, 186, 190]) || startsWith(bytes, [190, 186, 254, 202])) return "executable";
  if (startsWith(bytes, [35, 33])) return "script";
  if (startsWith(bytes, [255, 254]) || startsWith(bytes, [254, 255])) return "unsupported";
  const window = bytes.subarray(0, Math.min(bytes.length, 8192));
  for (const b of window) {
    if (b === 0) return "unsupported";
    if (b < 32 && b !== 9 && b !== 10 && b !== 13) return "unsupported";
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(window);
    return "text";
  } catch {
    return "unsupported";
  }
};
var reject = (declaredMime, detected, reason) => ({
  verdict: "reject",
  reason,
  detected_type: detected,
  declared_mime: declaredMime,
  scan_status: "signature_screen_rejected"
});
var screenDocument = (bytes, declaredMime) => {
  const mime = String(declaredMime || "").toLowerCase();
  const allowed = DECLARED_MIME_TO_DETECTED[mime];
  if (!allowed) return reject(mime, "unsupported", "Declared MIME type is not supported for document upload.");
  if (!bytes.length) return reject(mime, "unsupported", "The uploaded file is empty.");
  if (bytes.length > DOCUMENT_MAX_BYTES) return reject(mime, "unsupported", "The uploaded file exceeds the 20 MB limit.");
  const detected = sniffType(bytes);
  if (detected === "executable") return reject(mime, detected, "The file contains executable code and cannot be stored as a document.");
  if (detected === "script") return reject(mime, detected, "The file is a script and cannot be stored as a document.");
  if (detected === "ole2") return reject(mime, detected, "Legacy Office (OLE) compound files are not accepted. Re-save the document as DOCX, PDF or plain text.");
  if (detected === "zip-container") return reject(mime, detected, "The file is a ZIP archive, not a supported document.");
  const embedded = findEmbeddedExecutable(bytes);
  if (embedded) return reject(mime, detected, `The file contains an ${embedded.kind} at offset ${embedded.offset} and was rejected.`);
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" && indexOfAscii(bytes, "vbaProject.bin") !== -1) {
    return reject(mime, detected, "Macro-enabled Word documents are not accepted.");
  }
  if (!allowed.includes(detected)) {
    return reject(mime, detected, `The file content (${detected}) does not match the declared type (${mime}).`);
  }
  return {
    verdict: "pass",
    reason: null,
    detected_type: detected,
    declared_mime: mime,
    scan_status: "signature_screen_passed"
  };
};

// supabase/functions/jd-business-platform/index.ts
var cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json", "Cache-Control": "no-store" };
var send = (x, s = 200) => new Response(JSON.stringify(x), { status: s, headers: cors });
var uuid = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
var str = (v, n = 500) => typeof v === "string" ? v.trim().slice(0, n) : "";
var num3 = (v, min = 0, max = 1e12) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
var date = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
var tables = { customers: "jd_business_customers", opportunities: "jd_business_opportunities", expenses: "jd_business_expenses", contracts: "jd_business_contracts", documents: "jd_business_documents", support: "jd_business_support_cases", reports: "jd_business_reports", cashflow: "jd_business_cash_transactions", budgets: "jd_business_budgets" };
var columns = { customers: "id,name,customer_type,email,phone,company,status,consent_status,consent_updated_at,consent_updated_by,consent_source,owner_id,created_at,updated_at", opportunities: "id,customer_id,title,stage,amount,currency,probability,expected_close_date,next_action,owner_id,created_at,updated_at", expenses: "id,category,description,amount,currency,incurred_on,status,vendor,reference,created_at,updated_at", contracts: "id,customer_id,title,contract_type,status,value,currency,starts_on,expires_on,renewal_notice_days,created_at,updated_at", documents: "id,title,mime_type,byte_size,extraction_status,summary,extracted_text,checksum_sha256,source_metadata,created_at,updated_at", support: "id,customer_id,title,description,status,priority,assigned_to,sla_due_at,first_response_at,resolved_at,resolution_note,created_at,updated_at", reports: "id,title,report_type,period_start,period_end,status,report_json,source_metadata,created_at,updated_at", cashflow: "id,direction,amount,currency,occurred_on,status,category,description,reference,customer_id,created_at,updated_at", budgets: "id,category,currency,period_start,period_end,budget_amount,alert_threshold_pct,status,created_at,updated_at" };
var stages = ["lead", "qualified", "proposal", "negotiation", "won", "lost"];
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return send({ error: "Method not allowed" }, 405);
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return send({ error: "Authentication required" }, 401);
  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !key) return send({ error: "Service not configured" }, 503);
  const auth = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: user, error: authErr } = await auth.auth.getUser(token);
  if (authErr || !user.user) return send({ error: "Invalid session" }, 401);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: p, error: pe } = await db.from("profiles").select("id,school_id,role").eq("id", user.user.id).maybeSingle();
  if (pe || !p?.school_id) return send({ error: "Workspace required" }, 403);
  if (!["owner", "admin", "manager"].includes(p.role)) return send({ error: "Manager permission required" }, 403);
  let b;
  try {
    b = await req.json();
  } catch {
    return send({ error: "Invalid JSON" }, 400);
  }
  const school = p.school_id, actor = user.user.id;
  if (p.role === "owner" && !(b?.action === "oauth.refresh" && Object.hasOwn(WORKSPACE_PROVIDERS, str(b.providerId, 60))) && !["workspace.catalog", "workspace.read", "workspace.disconnect", "oauth.start"].includes(b?.action)) return send({ error: "Manager permission required for this business action" }, 403);
  const audit = async (type, meta) => {
    await db.rpc("jd_business_audit", { p_school_id: school, p_actor_id: actor, p_event_type: type, p_event: meta });
  };
  const list = async (k) => {
    if (!tables[k]) throw new Error("Unsupported type");
    const { data, error } = await db.from(tables[k]).select(columns[k]).eq("school_id", school).order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    return data || [];
  };
  try {
    if (b.action === "overview") {
      const [customers, opportunities, expenses, contracts, support, documents, checks] = await Promise.all([list("customers"), list("opportunities"), list("expenses"), list("contracts"), list("support"), list("documents"), db.from("jd_business_service_checks").select("provider_id,status,latency_ms,checked_at").eq("school_id", school).order("checked_at", { ascending: false }).limit(100)]);
      if (checks.error) throw checks.error;
      const open = opportunities.filter((o) => !["won", "lost"].includes(o.stage));
      const sumByCurrency = (rows, field) => {
        const out = {};
        for (const row of rows) {
          const currency = row.currency || "NGN";
          out[currency] = (out[currency] || 0) + Number(row[field] || 0);
        }
        return out;
      };
      const won = opportunities.filter((o) => o.stage === "won"), approved = expenses.filter((e) => ["approved", "paid"].includes(e.status));
      const weightedByCurrency = {};
      for (const o of open) {
        const currency = o.currency || "NGN";
        weightedByCurrency[currency] = (weightedByCurrency[currency] || 0) + Number(o.amount) * Number(o.probability) / 100;
      }
      return send({ counts: { customers: customers.length, opportunities: opportunities.length, won_opportunities: won.length, expenses: expenses.length, contracts: contracts.length, active_contracts: contracts.filter((c) => c.status === "active").length, support: support.length, documents: documents.length }, revenue_won_by_currency: sumByCurrency(won, "amount"), pipeline_by_currency: sumByCurrency(open, "amount"), weighted_pipeline_by_currency: weightedByCurrency, approved_expenses_by_currency: sumByCurrency(approved, "amount"), currency_note: "Every total is grouped by currency. Won opportunity value is not cash received; legacy school fee data is not presumed company revenue.", recent_opportunities: opportunities.slice(0, 8), recent_support: support.slice(0, 8), renewals: contracts.filter((c) => c.status === "active" && c.expires_on && new Date(c.expires_on).getTime() <= Date.now() + Number(c.renewal_notice_days) * 864e5), service_checks: checks.data || [] });
    }
    if (b.action === "list") return send({ items: await list(str(b.kind, 30)) });
    if (b.action === "create") {
      const k = str(b.kind, 30), x = b.record || {};
      if (!tables[k] || k === "documents") return send({ error: "Unsupported create" }, 400);
      let row = { school_id: school, created_by: actor };
      if (k === "customers") {
        row = { ...row, name: str(x.name, 180), customer_type: ["person", "organisation"].includes(x.customer_type) ? x.customer_type : "organisation", email: str(x.email, 254) || null, phone: str(x.phone, 40) || null, company: str(x.company, 180) || null, status: "active", consent_status: ["unknown", "granted", "withdrawn"].includes(x.consent_status) ? x.consent_status : "unknown", owner_id: uuid(x.owner_id) ? x.owner_id : null, notes: str(x.notes, 5e3) };
        if (!row.name) return send({ error: "Customer name required" }, 400);
      } else if (k === "opportunities") {
        const a = num3(x.amount);
        if (!str(x.title, 180) || a === null) return send({ error: "Title and valid amount required" }, 400);
        row = { ...row, customer_id: uuid(x.customer_id) ? x.customer_id : null, title: str(x.title, 180), stage: "lead", amount: a, currency: str(x.currency, 3).toUpperCase() || "NGN", probability: num3(x.probability ?? 10, 0, 100), expected_close_date: date(x.expected_close_date), next_action: str(x.next_action, 500) || null };
      } else if (k === "expenses") {
        const a = num3(x.amount, 0.01);
        if (a === null || !str(x.category, 100) || !str(x.description, 300) || !date(x.incurred_on)) return send({ error: "Category, description, amount and date required" }, 400);
        row = { ...row, category: str(x.category, 100), description: str(x.description, 300), amount: a, currency: str(x.currency, 3).toUpperCase() || "NGN", incurred_on: date(x.incurred_on), status: "submitted", vendor: str(x.vendor, 180) || null };
      } else if (k === "contracts") {
        if (!str(x.title, 180)) return send({ error: "Contract title required" }, 400);
        row = { ...row, customer_id: uuid(x.customer_id) ? x.customer_id : null, title: str(x.title, 180), contract_type: str(x.contract_type, 60) || "proposal", status: "draft", value: num3(x.value, 0), currency: str(x.currency, 3).toUpperCase() || "NGN", starts_on: date(x.starts_on), expires_on: date(x.expires_on), renewal_notice_days: num3(x.renewal_notice_days ?? 30, 0, 365) };
      } else if (k === "support") {
        if (!str(x.title, 180)) return send({ error: "Case title required" }, 400);
        row = { ...row, customer_id: uuid(x.customer_id) ? x.customer_id : null, title: str(x.title, 180), description: str(x.description, 1e4), status: "open", priority: ["low", "normal", "high", "urgent"].includes(x.priority) ? x.priority : "normal", assigned_to: uuid(x.assigned_to) ? x.assigned_to : null, sla_due_at: typeof x.sla_due_at === "string" ? x.sla_due_at : null };
      } else if (k === "cashflow") {
        const amount = num3(x.amount, 0.01);
        if (!amount || !["inflow", "outflow"].includes(x.direction) || !date(x.occurred_on) || !str(x.category, 100) || !str(x.description, 300)) return send({ error: "Direction, positive amount, date, category and description required" }, 400);
        row = { ...row, direction: x.direction, amount, currency: str(x.currency, 3).toUpperCase() || "NGN", occurred_on: date(x.occurred_on), status: "pending", category: str(x.category, 100), description: str(x.description, 300), reference: str(x.reference, 120) || null, customer_id: uuid(x.customer_id) ? x.customer_id : null };
      } else if (k === "budgets") {
        const amount = num3(x.budget_amount, 0.01), start = date(x.period_start), end = date(x.period_end);
        if (!amount || !str(x.category, 100) || !start || !end || end < start) return send({ error: "Budget category, positive amount and valid period required" }, 400);
        row = { ...row, category: str(x.category, 100), currency: str(x.currency, 3).toUpperCase() || "NGN", period_start: start, period_end: end, budget_amount: amount, alert_threshold_pct: num3(x.alert_threshold_pct ?? 80, 1, 100), status: "active" };
      } else if (k === "reports") {
        const s = date(x.period_start), e = date(x.period_end);
        if (!str(x.title, 180) || !s || !e || e < s) return send({ error: "Report title and valid dates required" }, 400);
        row = { ...row, title: str(x.title, 180), report_type: str(x.report_type, 60) || "executive", period_start: s, period_end: e, status: "draft", report_json: x.report_json || {}, source_metadata: x.source_metadata || {} };
      }
      if (row.customer_id) {
        const { data: c } = await db.from("jd_business_customers").select("id").eq("id", row.customer_id).eq("school_id", school).maybeSingle();
        if (!c) return send({ error: "Customer outside workspace" }, 400);
      }
      const { data: inserted, error } = await db.from(tables[k]).insert(row).select(columns[k]).single();
      if (error || !inserted) return send({ error: "Could not create record", detail: error?.message || "No record returned" }, 400);
      const data = inserted;
      if (k === "contracts" && str(x.body, 5e4)) {
        const body = str(x.body, 5e4), hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)))).map((v) => v.toString(16).padStart(2, "0")).join("");
        const { error: ve } = await db.from("jd_business_contract_versions").insert({ school_id: school, contract_id: data.id, version_no: 1, title: data.title, body, content_hash: hash, created_by: actor });
        if (ve) return send({ error: "Contract created but version save failed", record: data }, 500);
      }
      await audit(`business.${k}.created`, { record_id: data.id });
      return send({ item: data }, 201);
    }
    if (b.action === "update") {
      const k = str(b.kind, 30), id = uuid(b.id) ? b.id : null, x = b.changes || {};
      if (!tables[k] || !id || k === "documents") return send({ error: "Unsupported update" }, 400);
      let patch = { updated_at: (/* @__PURE__ */ new Date()).toISOString() };
      if (k === "customers") {
        for (const f of ["name", "email", "phone", "company", "notes"]) if (f in x) patch[f] = str(x[f], f === "notes" ? 5e3 : 254);
        if ("consent_status" in x) {
          if (!["unknown", "granted", "withdrawn"].includes(x.consent_status)) return send({ error: "Invalid consent" }, 400);
          const source = str(x.consent_source, 500);
          if (x.consent_status !== "unknown" && !source) return send({ error: "Record the consent source or evidence before changing consent status" }, 400);
          patch.consent_status = x.consent_status;
          patch.consent_updated_at = (/* @__PURE__ */ new Date()).toISOString();
          patch.consent_updated_by = actor;
          patch.consent_source = source;
        }
      } else if (k === "opportunities") {
        if ("title" in x) patch.title = str(x.title, 180);
        if ("amount" in x) {
          const a = num3(x.amount);
          if (a === null) return send({ error: "Invalid amount" }, 400);
          patch.amount = a;
        }
        if ("probability" in x) {
          const a = num3(x.probability, 0, 100);
          if (a === null) return send({ error: "Invalid probability" }, 400);
          patch.probability = a;
        }
        if ("stage" in x) {
          if (!stages.includes(x.stage)) return send({ error: "Invalid sales stage" }, 400);
          patch.stage = x.stage;
        }
        if ("expected_close_date" in x) patch.expected_close_date = date(x.expected_close_date);
        if ("next_action" in x) patch.next_action = str(x.next_action, 500);
      } else if (k === "cashflow") {
        if (!["cleared", "void"].includes(x.status)) return send({ error: "Cash transactions may only be cleared or voided" }, 400);
        patch.status = x.status;
      } else if (k === "expenses") {
        if (p.role !== "admin") return send({ error: "Admin required for expense decisions" }, 403);
        if (!["approved", "rejected"].includes(x.status)) return send({ error: "Only approve/reject decisions supported" }, 400);
        patch.status = x.status;
        patch.approved_by = actor;
        patch.approved_at = (/* @__PURE__ */ new Date()).toISOString();
      } else if (k === "contracts") {
        if (!["draft", "in_review", "approved", "active", "expired", "terminated"].includes(x.status)) return send({ error: "Invalid contract state" }, 400);
        if (["approved", "active", "terminated"].includes(x.status) && p.role !== "admin") return send({ error: "Admin approval required" }, 403);
        patch.status = x.status;
      } else if (k === "support") {
        if ("status" in x) {
          if (!["open", "in_progress", "waiting", "resolved", "closed"].includes(x.status)) return send({ error: "Invalid case status" }, 400);
          patch.status = x.status;
          if (x.status === "resolved") patch.resolved_at = (/* @__PURE__ */ new Date()).toISOString();
          if (x.status === "in_progress") patch.first_response_at = (/* @__PURE__ */ new Date()).toISOString();
        }
        if ("priority" in x) {
          if (!["low", "normal", "high", "urgent"].includes(x.priority)) return send({ error: "Invalid priority" }, 400);
          patch.priority = x.priority;
        }
        if ("resolution_note" in x) patch.resolution_note = str(x.resolution_note, 5e3);
        if ("assigned_to" in x) patch.assigned_to = uuid(x.assigned_to) ? x.assigned_to : null;
      } else if (k === "budgets") {
        if (!["active", "archived"].includes(x.status)) return send({ error: "Invalid budget state" }, 400);
        patch.status = x.status;
        if ("budget_amount" in x) {
          const amount = num3(x.budget_amount, 0.01);
          if (!amount) return send({ error: "Invalid budget amount" }, 400);
          patch.budget_amount = amount;
        }
        if ("alert_threshold_pct" in x) {
          const threshold = num3(x.alert_threshold_pct, 1, 100);
          if (!threshold) return send({ error: "Invalid alert threshold" }, 400);
          patch.alert_threshold_pct = threshold;
        }
      } else if (k === "reports") {
        if (!["in_review", "approved", "shared"].includes(x.status)) return send({ error: "Invalid report state" }, 400);
        if (x.status === "shared" && p.role !== "admin") return send({ error: "Admin required" }, 403);
        patch.status = x.status;
      }
      const { data: updated, error } = await db.from(tables[k]).update(patch).eq("id", id).eq("school_id", school).select(columns[k]).maybeSingle();
      if (error || !updated) return send({ error: "Record not found or update rejected" }, 404);
      const data = updated;
      await audit(`business.${k}.updated`, { record_id: id, fields: Object.keys(patch) });
      return send({ item: data });
    }
    if (b.action === "sla.policy.list") {
      const { data, error } = await db.from("jd_business_sla_policies").select("id,priority,first_response_minutes,resolution_minutes,escalation_after_minutes,notify_email,notify_phone,enabled,updated_at").eq("school_id", school).order("priority");
      if (error) throw error;
      return send({ policies: data || [] });
    }
    if (b.action === "sla.policy.save") {
      if (p.role !== "admin") return send({ error: "Only workspace administrators can change SLA policies" }, 403);
      const priority = str(b.priority, 20), first = num3(b.first_response_minutes, 1, 43200), resolution = num3(b.resolution_minutes, 1, 129600), escalation = num3(b.escalation_after_minutes, 1, 129600);
      if (!["low", "normal", "high", "urgent"].includes(priority) || first === null || resolution === null || escalation === null || escalation < first) return send({ error: "Valid priority and SLA minute thresholds are required" }, 400);
      const email = str(b.notify_email, 254), phone = str(b.notify_phone, 30);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send({ error: "Notification email is invalid" }, 400);
      if (phone && !/^\+[1-9]\d{7,14}$/.test(phone)) return send({ error: "SMS destination must be E.164 format" }, 400);
      const { data, error } = await db.from("jd_business_sla_policies").upsert({ school_id: school, priority, first_response_minutes: first, resolution_minutes: resolution, escalation_after_minutes: escalation, notify_email: email || null, notify_phone: phone || null, enabled: b.enabled !== false, created_by: actor, updated_at: (/* @__PURE__ */ new Date()).toISOString() }, { onConflict: "school_id,priority" }).select("id,priority,first_response_minutes,resolution_minutes,escalation_after_minutes,notify_email,notify_phone,enabled").single();
      if (error) throw error;
      await audit("business.sla.policy_updated", { priority });
      return send({ policy: data });
    }
    if (b.action === "revenue.analytics") {
      const start = date(b.period_start) || new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10), end = date(b.period_end) || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const { data, error } = await db.from("jd_business_cash_transactions").select("customer_id,direction,amount,currency,occurred_on,status,category").eq("school_id", school).eq("direction", "inflow").gte("occurred_on", start).lte("occurred_on", end).order("occurred_on");
      if (error) throw error;
      const rows = data || [], byCurrency = {}, customers = {};
      for (const r of rows) {
        const c = r.currency || "NGN";
        byCurrency[c] ??= { cleared_cash_received: 0, pending_inflows: 0, monthly: {}, categories: {}, transaction_count: 0 };
        byCurrency[c].transaction_count++;
        if (r.status === "cleared") {
          byCurrency[c].cleared_cash_received += Number(r.amount);
          byCurrency[c].monthly[r.occurred_on.slice(0, 7)] = (byCurrency[c].monthly[r.occurred_on.slice(0, 7)] || 0) + Number(r.amount);
          byCurrency[c].categories[r.category] = (byCurrency[c].categories[r.category] || 0) + Number(r.amount);
          if (r.customer_id) {
            customers[r.customer_id] ??= { customer_id: r.customer_id, currency: c, amount: 0 };
            customers[r.customer_id].amount += Number(r.amount);
          }
        } else if (r.status === "pending") byCurrency[c].pending_inflows += Number(r.amount);
      }
      const topCustomers = Object.values(customers).sort((a, b2) => b2.amount - a.amount).slice(0, 10);
      return send({ period: { start, end }, by_currency: byCurrency, top_customers: topCustomers, caveat: "Revenue intelligence uses only manually recorded cleared cash-in transactions. Pending inflows are not counted as received revenue; opportunity wins are not cash receipts." });
    }
    if (b.action === "budget.analytics") {
      const [budgets, expenses] = await Promise.all([list("budgets"), list("expenses")]);
      const now = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const usage = budgets.filter((x) => x.status === "active").map((budget) => {
        const spend = expenses.filter((e) => e.currency === budget.currency && e.category === budget.category && ["approved", "paid"].includes(e.status) && e.incurred_on >= budget.period_start && e.incurred_on <= budget.period_end).reduce((n, e) => n + Number(e.amount), 0);
        const pct = spend / Number(budget.budget_amount) * 100;
        return { ...budget, approved_spend: spend, remaining: Number(budget.budget_amount) - spend, utilisation_pct: pct, alert: pct >= 100 ? "over_budget" : pct >= Number(budget.alert_threshold_pct) ? "threshold_reached" : "normal", period_active: budget.period_start <= now && budget.period_end >= now };
      });
      return send({ budgets: usage, alerts: usage.filter((x) => x.utilisation_pct >= Number(x.alert_threshold_pct)), caveat: "Only approved/paid expense records are counted. Variance is scoped to the exact category, currency and budget period." });
    }
    if (b.action === "pipeline.analytics") {
      const rows = await list("opportunities"), byCurrency = {};
      for (const r of rows) {
        const currency = r.currency || "NGN";
        byCurrency[currency] ??= { total: 0, stages: {} };
        byCurrency[currency].total++;
        byCurrency[currency].stages[r.stage] ??= { count: 0, amount: 0, weighted: 0 };
        byCurrency[currency].stages[r.stage].count++;
        byCurrency[currency].stages[r.stage].amount += Number(r.amount);
        byCurrency[currency].stages[r.stage].weighted += Number(r.amount) * Number(r.probability) / 100;
      }
      return send({ by_currency: byCurrency, total: rows.length, caveat: "Pipeline values and weighted values are grouped by currency; do not add across currencies." });
    }
    if (b.action === "expense.analytics") {
      const { data: expenseRows, error } = await db.from("jd_business_expenses").select("category,amount,currency,status").eq("school_id", school).limit(200);
      if (error) throw error;
      const rows = expenseRows || [];
      const approved = rows.filter((e) => ["approved", "paid"].includes(e.status)), byCategory = {};
      for (const e of approved) byCategory[e.category] = (byCategory[e.category] || 0) + Number(e.amount);
      const byCurrency = {};
      for (const e of approved) byCurrency[e.currency] = (byCurrency[e.currency] || 0) + Number(e.amount);
      return send({ approved_total: approved.length === 0 ? 0 : Object.keys(byCurrency).length === 1 ? Object.values(byCurrency)[0] : null, byCurrency, byCategory, source_count: approved.length, caveat: "Approved and paid records only. Totals are split by currency; no mixed-currency sum is produced." });
    }
    if (b.action === "expense.anomalies") {
      const now = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const [budgetRows, expenseRows] = await Promise.all([db.from("jd_business_budgets").select("category,currency,period_start,period_end,budget_amount,alert_threshold_pct,status").eq("school_id", school).limit(200), db.from("jd_business_expenses").select("id,category,amount,currency,incurred_on,status").eq("school_id", school).order("incurred_on", { ascending: false }).limit(200)]);
      if (budgetRows.error) throw budgetRows.error;
      if (expenseRows.error) throw expenseRows.error;
      const analysis = analyseExpenseAnomalies(expenseRows.data || [], budgetRows.data || [], now);
      return send(analysis);
    }
    if (b.action === "kpi.trends") {
      const monthsBack = num3(b.months_back, 1, 24) ?? 12;
      const [cash, expenses, opps, support, customers] = await Promise.all([db.from("jd_business_cash_transactions").select("occurred_on,direction,amount,currency,status").eq("school_id", school).order("occurred_on", { ascending: false }).limit(500), db.from("jd_business_expenses").select("incurred_on,amount,currency,status").eq("school_id", school).order("incurred_on", { ascending: false }).limit(500), db.from("jd_business_opportunities").select("created_at,stage").eq("school_id", school).order("created_at", { ascending: false }).limit(500), db.from("jd_business_support_cases").select("created_at,resolved_at,status").eq("school_id", school).order("created_at", { ascending: false }).limit(500), db.from("jd_business_customers").select("created_at").eq("school_id", school).order("created_at", { ascending: false }).limit(500)]);
      for (const r of [cash, expenses, opps, support, customers]) {
        if (r.error) throw r.error;
      }
      const trends = analyseKpiTrends({ cash: cash.data || [], expenses: expenses.data || [], opportunities: opps.data || [], support: support.data || [], customers: customers.data || [] }, (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), monthsBack);
      return send(trends);
    }
    if (b.action === "monitor.run") {
      if (!["admin", "manager"].includes(p.role)) return send({ error: "Manager permission required to run external service checks" }, 403);
      const probes = {
        "google-workspace": { url: "https://accounts.google.com/.well-known/openid-configuration", accepted: [200] },
        "microsoft-365": { url: "https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration", accepted: [200] },
        "linkedin": { url: "https://www.linkedin.com/oauth/.well-known/openid-configuration", accepted: [200] },
        "slack": { url: "https://slack.com/api/api.test", accepted: [200] },
        "paystack": { url: "https://api.paystack.co/bank", accepted: [200, 401, 403] }
      };
      const results = [];
      for (const [provider, probe] of Object.entries(probes)) {
        const started = Date.now();
        let status = "unknown", statusCode = null, errorCode = null;
        try {
          const response = await fetch(probe.url, { method: "GET", headers: { "Accept": "application/json" }, signal: AbortSignal.timeout(6e3), redirect: "error" });
          statusCode = response.status;
          status = probe.accepted.includes(response.status) ? "healthy" : response.status >= 500 ? "down" : "degraded";
          if (status !== "healthy") errorCode = "unexpected_http_status";
          await response.body?.cancel();
        } catch (e) {
          status = "down";
          errorCode = e instanceof Error ? e.name === "TimeoutError" ? "timeout" : "connection_failed" : "connection_failed";
        }
        const result = { provider_id: provider, status, latency_ms: Date.now() - started, status_code: statusCode, error_code: errorCode, checked_at: (/* @__PURE__ */ new Date()).toISOString() };
        results.push(result);
        const { error } = await db.from("jd_business_service_checks").insert({ school_id: school, ...result });
        if (error) throw error;
      }
      await audit("business.monitor.completed", { providers: results.length, down: results.filter((x) => x.status === "down").length });
      return send({ checks: results, notice: "Checks verify public endpoint reachability only; they do not prove that your OAuth credentials or business integration are connected." });
    }
    if (b.action === "workspace.catalog") return send(await workspaceCatalog({ admin: db, schoolId: school, userId: actor, role: p.role }));
    if (b.action === "workspace.read") return send(await readWorkspaceApp(b, { admin: db, schoolId: school, userId: actor, role: p.role }));
    if (b.action === "workspace.disconnect") {
      const providerId = str(b.providerId, 60);
      if (!Object.hasOwn(WORKSPACE_PROVIDERS, providerId)) return send({ error: "Unsupported workspace provider" }, 400);
      const { error } = await db.from("jd_business_oauth_connections").update({ status: "revoked", encrypted_credentials: null, enabled_read_services: [], token_expires_at: null, key_version: null, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("school_id", school).eq("provider_id", providerId).eq("connected_by", actor);
      if (error) throw error;
      await audit("workspace.disconnected", { provider_id: providerId });
      return send({ notice: "JD credentials erased locally. Remove JD in your provider account permissions to revoke the provider grant too." });
    }
    if (b.action === "oauth.start") {
      const providerId = str(b.providerId, 60), providerConfig = {
        "google-workspace": { authUrl: "https://accounts.google.com/o/oauth2/v2/auth", clientIdEnv: "JD_OAUTH_GOOGLE_CLIENT_ID" },
        "microsoft-365": { authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize", clientIdEnv: "JD_OAUTH_MICROSOFT_CLIENT_ID" },
        "linkedin": { authUrl: "https://www.linkedin.com/oauth/v2/authorization", clientIdEnv: "JD_OAUTH_LINKEDIN_CLIENT_ID" },
        "slack": { authUrl: "https://slack.com/oauth/v2/authorize", clientIdEnv: "JD_OAUTH_SLACK_CLIENT_ID" }
      };
      const config = providerConfig[providerId];
      if (!config) return send({ error: "This provider requires a separate API-key or provider-specific connection flow" }, 400);
      const clientId = Deno.env.get(config.clientIdEnv), callback = Deno.env.get("JD_OAUTH_CALLBACK_URL"), encodedKey = getJdSecret("JD_OAUTH_ENCRYPTION_KEY");
      if (!clientId || !callback || !encodedKey) return send({ error: "OAuth provider credentials, callback URL or encryption key are not configured" }, 503);
      const callbackUrl = new URL(callback);
      if (callbackUrl.protocol !== "https:" && callbackUrl.hostname !== "localhost") return send({ error: "OAuth callback URL must use HTTPS" }, 503);
      const { data: catalog, error: catalogError } = await db.from("jd_business_integration_catalog").select("required_scopes").eq("id", providerId).eq("enabled", true).maybeSingle();
      if (catalogError || !catalog) return send({ error: "Integration is unavailable" }, 404);
      let enabledServices = [], requestedScopes = catalog.required_scopes || [];
      if (Object.hasOwn(WORKSPACE_PROVIDERS, providerId)) {
        try {
          enabledServices = selectedWorkspaceServices(providerId, b.services);
          requestedScopes = workspaceScopes(providerId, enabledServices);
        } catch {
          return send({ error: "Select supported read-only apps in JD Connect before authorising." }, 400);
        }
        if (!Deno.env.get(WORKSPACE_PROVIDERS[providerId].clientSecretEnv)) return send({ error: "Provider app secret is not configured" }, 503);
        const { data: existing, error: existingError } = await db.from("jd_business_oauth_connections").select("connected_by,status").eq("school_id", school).eq("provider_id", providerId).maybeSingle();
        if (existingError) throw existingError;
        if (existing?.status === "connected" && existing.connected_by !== actor) return send({ error: "This workspace provider slot belongs to another user. Ask that user to disconnect first." }, 409);
      }
      const state = base64Url(crypto.getRandomValues(new Uint8Array(32))), verifier = base64Url(crypto.getRandomValues(new Uint8Array(32))), challenge = base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
      const key2 = await importAesKey(encodedKey), encryptedVerifier = await encryptSecret(verifier, key2), stateHash = await sha256Hex(state), expiresAt = new Date(Date.now() + 10 * 60 * 1e3).toISOString();
      const { error: stateError } = await db.from("jd_business_oauth_states").insert({ school_id: school, provider_id: providerId, actor_id: actor, state_hash: stateHash, pkce_verifier_encrypted: encryptedVerifier, redirect_uri: callback, expires_at: expiresAt, enabled_read_services: enabledServices });
      if (stateError) throw stateError;
      const authUrl = new URL(config.authUrl);
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", callback);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", requestedScopes.join(" "));
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("code_challenge", challenge);
      authUrl.searchParams.set("code_challenge_method", "S256");
      if (providerId === "google-workspace") {
        authUrl.searchParams.set("access_type", "offline");
        authUrl.searchParams.set("prompt", "consent");
      }
      if (providerId === "slack") {
        authUrl.searchParams.set("scope", (catalog.required_scopes || []).join(","));
      }
      await audit("business.oauth.started", { provider_id: providerId, expires_at: expiresAt });
      return send({ authorization_url: authUrl.toString(), expires_at: expiresAt });
    }
    if (["oauth.refresh", "oauth.verify", "oauth.disconnect"].includes(b.action) && Object.hasOwn(WORKSPACE_PROVIDERS, str(b.providerId, 60))) {
      const { data: owner, error } = await db.from("jd_business_oauth_connections").select("connected_by").eq("school_id", school).eq("provider_id", str(b.providerId, 60)).maybeSingle();
      if (error || owner?.connected_by !== actor) return send({ error: "Only the account owner may manage this workspace provider connection" }, 403);
    }
    if (b.action === "oauth.refresh" && Object.hasOwn(WORKSPACE_PROVIDERS, str(b.providerId, 60))) {
      const connection = await refreshWorkspaceConnection({ admin: db, schoolId: school, userId: actor, role: p.role }, str(b.providerId, 60));
      return send({ provider_id: connection.provider_id, status: connection.status, token_expires_at: connection.token_expires_at });
    }
    if (b.action === "oauth.refresh") {
      const providerId = str(b.providerId, 60), config = {
        "google-workspace": { tokenUrl: "https://oauth2.googleapis.com/token", clientIdEnv: "JD_OAUTH_GOOGLE_CLIENT_ID", clientSecretEnv: "JD_OAUTH_GOOGLE_CLIENT_SECRET" },
        "microsoft-365": { tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token", clientIdEnv: "JD_OAUTH_MICROSOFT_CLIENT_ID", clientSecretEnv: "JD_OAUTH_MICROSOFT_CLIENT_SECRET" },
        "linkedin": { tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken", clientIdEnv: "JD_OAUTH_LINKEDIN_CLIENT_ID", clientSecretEnv: "JD_OAUTH_LINKEDIN_CLIENT_SECRET" },
        "slack": { tokenUrl: "https://slack.com/api/oauth.v2.access", clientIdEnv: "JD_OAUTH_SLACK_CLIENT_ID", clientSecretEnv: "JD_OAUTH_SLACK_CLIENT_SECRET" }
      };
      const provider = config[providerId];
      if (!provider) return send({ error: "Refresh is not supported for this provider" }, 400);
      const { data: connectionData, error: connectionError } = await db.from("jd_business_oauth_connections").select("encrypted_credentials,scopes").eq("school_id", school).eq("provider_id", providerId).eq("status", "connected").maybeSingle();
      const connection = connectionData;
      if (connectionError || !connection?.encrypted_credentials) return send({ error: "No active encrypted connection was found" }, 404);
      const encoded = getJdSecret("JD_OAUTH_ENCRYPTION_KEY"), clientId = Deno.env.get(provider.clientIdEnv), clientSecret = Deno.env.get(provider.clientSecretEnv);
      if (!encoded || !clientId || !clientSecret) return send({ error: "OAuth encryption key or provider credentials are not configured" }, 503);
      const key2 = await importAesKey(encoded), stored = JSON.parse(await decryptSecret(connection.encrypted_credentials, key2));
      if (!stored.refresh_token) return send({ error: "Provider did not issue a refresh token; reconnect with offline access" }, 409);
      const form = new URLSearchParams({ grant_type: "refresh_token", refresh_token: stored.refresh_token, client_id: clientId, client_secret: clientSecret });
      const response = await fetch(provider.tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" }, body: form, signal: AbortSignal.timeout(1e4), redirect: "error" });
      const token2 = await response.json().catch(() => null);
      if (!response.ok || !token2?.access_token) return send({ error: "Provider token refresh failed; reconnect this integration" }, 502);
      const next = { access_token: token2.access_token, refresh_token: token2.refresh_token || stored.refresh_token, token_type: token2.token_type || stored.token_type || "Bearer", scope: connection.scopes, issued_at: (/* @__PURE__ */ new Date()).toISOString() };
      const encrypted = await encryptSecret(JSON.stringify(next), key2), expires = Number(token2.expires_in), expiresAt = Number.isFinite(expires) && expires > 0 ? new Date(Date.now() + expires * 1e3).toISOString() : null;
      const { error: saveError } = await db.from("jd_business_oauth_connections").update({ encrypted_credentials: encrypted, token_expires_at: expiresAt, last_checked_at: (/* @__PURE__ */ new Date()).toISOString(), last_error_code: null, key_version: "aes-gcm-v1", updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("school_id", school).eq("provider_id", providerId);
      if (saveError) throw saveError;
      await audit("business.oauth.refreshed", { provider_id: providerId });
      return send({ provider_id: providerId, status: "connected", token_expires_at: expiresAt });
    }
    if (b.action === "oauth.verify") {
      const providerId = str(b.providerId, 60), encoded = getJdSecret("JD_OAUTH_ENCRYPTION_KEY");
      if (!encoded) return send({ error: "OAuth encryption key is not configured" }, 503);
      const { data: connection, error } = await db.from("jd_business_oauth_connections").select("encrypted_credentials,scopes").eq("school_id", school).eq("provider_id", providerId).eq("status", "connected").maybeSingle();
      if (error || !connection?.encrypted_credentials) return send({ error: "No active connection found" }, 404);
      const stored = JSON.parse(await decryptSecret(connection.encrypted_credentials, await importAesKey(encoded)));
      const endpoints = { "google-workspace": "https://openidconnect.googleapis.com/v1/userinfo", "microsoft-365": "https://graph.microsoft.com/oidc/userinfo", "linkedin": "https://api.linkedin.com/v2/userinfo", "slack": "https://slack.com/api/auth.test" };
      const endpoint = endpoints[providerId];
      if (!endpoint) return send({ error: "Live verification is not supported for this provider" }, 400);
      const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${stored.access_token}`, Accept: "application/json" }, signal: AbortSignal.timeout(1e4), redirect: "error" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || providerId === "slack" && payload?.ok !== true) {
        await db.from("jd_business_oauth_connections").update({ last_error_code: "provider_verification_failed", last_checked_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("school_id", school).eq("provider_id", providerId);
        return send({ verified: false, provider_id: providerId, error: "Provider rejected the stored access token. Reconnect the integration." }, 502);
      }
      await db.from("jd_business_oauth_connections").update({ last_checked_at: (/* @__PURE__ */ new Date()).toISOString(), last_error_code: null }).eq("school_id", school).eq("provider_id", providerId);
      await audit("business.oauth.verified", { provider_id: providerId });
      const identity = providerId === "slack" ? { team: payload.team, name: payload.user } : providerId === "microsoft-365" ? { name: payload.name, account: payload.email || payload.preferred_username } : { name: payload.name, email: payload.email, sub: payload.sub };
      return send({ verified: true, provider_id: providerId, identity });
    }
    if (b.action === "integration.save_paystack_key") {
      const apiKey = str(b.apiKey, 200);
      if (!/^(sk_test_|sk_live_|rk_test_|rk_live_)[A-Za-z0-9_]+$/.test(apiKey)) return send({ error: "A valid Paystack test, live or restricted secret key is required" }, 400);
      const response = await fetch("https://api.paystack.co/balance", { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }, signal: AbortSignal.timeout(1e4), redirect: "error" });
      const verification = await response.json().catch(() => null);
      if (!response.ok || verification?.status !== true) return send({ error: "Paystack rejected this API key" }, 401);
      const encoded = getJdSecret("JD_OAUTH_ENCRYPTION_KEY");
      if (!encoded) return send({ error: "Server encryption key is not configured" }, 503);
      const encrypted = await encryptSecret(JSON.stringify({ secret_key: apiKey, issued_at: (/* @__PURE__ */ new Date()).toISOString() }), await importAesKey(encoded));
      const { error } = await db.from("jd_business_oauth_connections").upsert({ school_id: school, provider_id: "paystack", status: "connected", scopes: ["transaction:read"], connected_by: actor, connected_at: (/* @__PURE__ */ new Date()).toISOString(), encrypted_credentials: encrypted, key_version: "aes-gcm-v1", last_checked_at: (/* @__PURE__ */ new Date()).toISOString(), last_error_code: null, updated_at: (/* @__PURE__ */ new Date()).toISOString() }, { onConflict: "school_id,provider_id" });
      if (error) throw error;
      await audit("business.paystack.connected", { mode: apiKey.startsWith("sk_test_") || apiKey.startsWith("rk_test_") ? "test" : "live" });
      return send({ provider_id: "paystack", status: "connected", mode: apiKey.startsWith("sk_test_") || apiKey.startsWith("rk_test_") ? "test" : "live", verified: true });
    }
    if (b.action === "integration.disconnect_paystack") {
      const { data, error } = await db.from("jd_business_oauth_connections").update({ status: "revoked", encrypted_credentials: null, key_version: null, last_error_code: "locally_disconnected", updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("school_id", school).eq("provider_id", "paystack").select("provider_id").maybeSingle();
      if (error || !data) return send({ error: "Paystack connection not found" }, 404);
      await audit("business.paystack.disconnected", { mode: "local_credential_erasure" });
      return send({ provider_id: "paystack", status: "revoked", notice: "The encrypted Paystack key was erased from JD. Rotate/revoke the key in Paystack if it may have been exposed." });
    }
    if (b.action === "paystack.transactions.sync") {
      const encoded = getJdSecret("JD_OAUTH_ENCRYPTION_KEY");
      if (!encoded) return send({ error: "Server encryption key is not configured" }, 503);
      const { data: connection, error } = await db.from("jd_business_oauth_connections").select("encrypted_credentials").eq("school_id", school).eq("provider_id", "paystack").eq("status", "connected").maybeSingle();
      if (error || !connection?.encrypted_credentials) return send({ error: "Paystack is not connected" }, 404);
      const stored = JSON.parse(await decryptSecret(connection.encrypted_credentials, await importAesKey(encoded))), from = date(b.from), to = date(b.to);
      const query = new URLSearchParams({ perPage: "100", page: "1", status: "success" });
      if (from) query.set("from", from + "T00:00:00.000Z");
      if (to) query.set("to", to + "T23:59:59.999Z");
      const response = await fetch("https://api.paystack.co/transaction?" + query.toString(), { headers: { Authorization: `Bearer ${stored.secret_key}`, Accept: "application/json" }, signal: AbortSignal.timeout(15e3), redirect: "error" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.status !== true) return send({ error: "Paystack transaction retrieval failed" }, 502);
      const transactions = Array.isArray(payload.data) ? payload.data : [], currency = String(transactions[0]?.currency || "NGN").toUpperCase();
      const { data: batch, error: batchError } = await db.from("jd_business_cash_statement_imports").insert({ school_id: school, file_name: "Paystack API import", currency, row_count: transactions.length, imported_by: actor }).select("id").single();
      if (batchError) throw batchError;
      const accepted = [];
      for (const tx of transactions) {
        if (tx.status !== "success" || !tx.paid_at || !Number.isFinite(Number(tx.amount)) || !tx.currency) continue;
        const ccy = String(tx.currency).toUpperCase(), decimals = ["JPY", "KRW"].includes(ccy) ? 0 : 2, amount = Number(tx.amount) / Math.pow(10, decimals), occurred = new Date(tx.paid_at).toISOString().slice(0, 10), reference = str(tx.reference, 180), description = str(tx.gateway_response || tx.channel || "Paystack transaction", 300);
        if (amount <= 0) continue;
        const fingerprint = await sha256Hex([occurred, "inflow", amount.toFixed(2), ccy, reference].join("|"));
        const { error: error2 } = await db.from("jd_business_cash_statement_rows").insert({ school_id: school, import_id: batch.id, occurred_on: occurred, direction: "inflow", amount, currency: ccy, reference, description, row_fingerprint: fingerprint }).select("id").maybeSingle();
        if (!error2) accepted.push(reference);
      }
      await audit("business.paystack.transactions_synced", { import_id: batch.id, received: transactions.length, imported: accepted.length });
      return send({ import_id: batch.id, received: transactions.length, imported: accepted.length, notice: "Paystack transactions were imported as bank-statement rows. Reconcile them against cashflow records manually; no payment or refund action is exposed." });
    }
    if (b.action === "oauth.disconnect") {
      const providerId = str(b.providerId, 60), encoded = getJdSecret("JD_OAUTH_ENCRYPTION_KEY");
      if (!["google-workspace", "microsoft-365", "linkedin", "slack"].includes(providerId)) return send({ error: "OAuth disconnect is not supported for this provider" }, 400);
      if (!encoded) return send({ error: "OAuth encryption key is not configured" }, 503);
      const { data: connection, error } = await db.from("jd_business_oauth_connections").select("encrypted_credentials,scopes").eq("school_id", school).eq("provider_id", providerId).eq("status", "connected").maybeSingle();
      if (error || !connection?.encrypted_credentials) return send({ error: "Connected integration not found" }, 404);
      const stored = JSON.parse(await decryptSecret(connection.encrypted_credentials, await importAesKey(encoded)));
      let remoteRevoked = false, remoteDetail = "";
      if (providerId === "google-workspace") {
        const token2 = stored.refresh_token || stored.access_token, form = new URLSearchParams({ token: token2 });
        const response = await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form, signal: AbortSignal.timeout(1e4), redirect: "error" });
        if (!response.ok) return send({ error: "Google rejected remote token revocation; local credentials were retained" }, 502);
        remoteRevoked = true;
      } else if (providerId === "slack") {
        const response = await fetch("https://slack.com/api/auth.revoke", { method: "POST", headers: { "Authorization": `Bearer ${stored.access_token}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ test: "false" }), signal: AbortSignal.timeout(1e4), redirect: "error" });
        const result = await response.json().catch(() => null);
        if (!response.ok || result?.ok !== true) return send({ error: "Slack rejected remote token revocation; local credentials were retained" }, 502);
        remoteRevoked = true;
      } else if (providerId === "microsoft-365") {
        if (!(connection.scopes || []).includes("User.RevokeSessions.All")) return send({ error: "Microsoft remote revocation requires the User.RevokeSessions.All permission. Grant it through the Microsoft admin consent flow first; local credentials were retained." }, 409);
        const response = await fetch("https://graph.microsoft.com/v1.0/me/revokeSignInSessions", { method: "POST", headers: { Authorization: `Bearer ${stored.access_token}`, "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(1e4), redirect: "error" });
        if (!response.ok) return send({ error: "Microsoft Graph rejected session revocation; local credentials were retained" }, 502);
        remoteRevoked = true;
        remoteDetail = "Microsoft notes revocation may take several minutes to propagate.";
      } else {
        return send({ error: "LinkedIn does not expose a verified remote revocation endpoint in this implementation. Revoke the app grant in LinkedIn account settings; local credentials were retained." }, 409);
      }
      const { error: saveError } = await db.from("jd_business_oauth_connections").update({ status: "revoked", encrypted_credentials: null, token_expires_at: null, key_version: null, last_error_code: null, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("school_id", school).eq("provider_id", providerId);
      if (saveError) throw saveError;
      await audit("business.oauth.disconnected", { provider_id: providerId, mode: "provider_revoked_then_local_erased" });
      return send({ provider_id: providerId, status: "revoked", provider_revoked: remoteRevoked, notice: remoteDetail || "Provider token revocation succeeded and the encrypted JD credential bundle was erased." });
    }
    if (b.action === "integration.catalog") {
      const [c, v, h, a] = await Promise.all([db.from("jd_business_integration_catalog").select("id,name,category,description,required_scopes,supported_capabilities").eq("enabled", true), db.from("jd_business_oauth_connections").select("provider_id,status,scopes,token_expires_at,last_checked_at,last_error_code").eq("school_id", school), db.from("jd_business_service_checks").select("provider_id,status,latency_ms,status_code,error_code,checked_at").eq("school_id", school).order("checked_at", { ascending: false }).limit(100), db.from("jd_business_service_alerts").select("id,provider_id,status,error_code,opened_at,resolved_at").eq("school_id", school).order("opened_at", { ascending: false }).limit(30)]);
      if (c.error || v.error || h.error || a.error) throw c.error || v.error || h.error || a.error;
      const latestChecks = Object.values((h.data || []).reduce((a2, x) => {
        if (!a2[x.provider_id]) a2[x.provider_id] = x;
        return a2;
      }, {}));
      return send({ integrations: (c.data || []).map((i) => ({ ...i, connection: v.data?.find((x) => x.provider_id === i.id) || { status: "not_connected" } })), service_checks: latestChecks, service_alerts: a.data || [] });
    }
    if (b.action === "contract.version.create") {
      const contractId = uuid(b.contractId) ? b.contractId : null, body = str(b.body, 5e4);
      if (!contractId || !body) return send({ error: "Contract ID and version content are required" }, 400);
      const { data: contract, error: contractError } = await db.from("jd_business_contracts").select("id,title,status").eq("id", contractId).eq("school_id", school).maybeSingle();
      if (contractError || !contract) return send({ error: "Contract not found in this workspace" }, 404);
      if (!["draft", "in_review"].includes(contract.status)) return send({ error: "Only draft or in-review contracts can receive a new version" }, 409);
      const { data: latest, error: latestError } = await db.from("jd_business_contract_versions").select("version_no").eq("school_id", school).eq("contract_id", contractId).order("version_no", { ascending: false }).limit(1).maybeSingle();
      if (latestError) throw latestError;
      const currentVersion = Number(latest?.version_no || 0), expected = num3(b.expectedVersion, 0, 1e5);
      if (expected === null || expected !== currentVersion) return send({ error: "Contract changed since it was loaded. Refresh versions and retry." }, 409);
      const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)), contentHash = Array.from(new Uint8Array(hash)).map((v) => v.toString(16).padStart(2, "0")).join("");
      const { data, error } = await db.from("jd_business_contract_versions").insert({ school_id: school, contract_id: contractId, version_no: currentVersion + 1, title: contract.title, body, content_hash: contentHash, created_by: actor }).select("id,version_no,title,content_hash,created_at").single();
      if (error) throw error;
      await db.from("jd_business_contracts").update({ updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", contractId).eq("school_id", school);
      await audit("business.contract.version_created", { contract_id: contractId, version_no: currentVersion + 1, content_hash: contentHash });
      return send({ version: data }, 201);
    }
    if (b.action === "contract.versions") {
      if (!uuid(b.contractId)) return send({ error: "Contract ID required" }, 400);
      const { data, error } = await db.from("jd_business_contract_versions").select("id,version_no,title,body,content_hash,created_at").eq("school_id", school).eq("contract_id", b.contractId).order("version_no", { ascending: false });
      if (error) throw error;
      return send({ versions: data || [] });
    }
    if (b.action === "activity.list") {
      let q = db.from("jd_business_activities").select("id,customer_id,opportunity_id,activity_type,title,body,created_at,created_by").eq("school_id", school);
      if (uuid(b.customerId)) q = q.eq("customer_id", b.customerId);
      if (uuid(b.opportunityId)) q = q.eq("opportunity_id", b.opportunityId);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return send({ activities: data || [] });
    }
    if (b.action === "activity.create") {
      const title = str(b.title, 180), body = str(b.body, 5e3), customerId = uuid(b.customerId) ? b.customerId : null, opportunityId = uuid(b.opportunityId) ? b.opportunityId : null;
      if (!title || !customerId && !opportunityId) return send({ error: "Activity title and a customer or opportunity are required" }, 400);
      const { data, error } = await db.from("jd_business_activities").insert({ school_id: school, customer_id: customerId, opportunity_id: opportunityId, activity_type: ["note", "call", "meeting", "email"].includes(b.activityType) ? b.activityType : "note", title, body, created_by: actor }).select("id,title,body,activity_type,created_at").single();
      if (error) throw error;
      await audit("business.activity.created", { activity_id: data.id });
      return send({ activity: data }, 201);
    }
    if (b.action === "support.note.create") {
      if (!uuid(b.caseId) || !str(b.body, 5e3)) return send({ error: "Case ID and note required" }, 400);
      const { data: caseRow, error: caseError } = await db.from("jd_business_support_cases").select("id").eq("id", b.caseId).eq("school_id", school).maybeSingle();
      if (caseError || !caseRow) return send({ error: "Support case not found in this workspace" }, 404);
      const { data, error } = await db.from("jd_business_support_notes").insert({ school_id: school, case_id: b.caseId, body: str(b.body, 5e3), is_internal: true, created_by: actor }).select("id,case_id,body,is_internal,created_at").single();
      if (error) throw error;
      return send({ note: data }, 201);
    }
    if (b.action === "cashflow.analytics") {
      const start = date(b.period_start) || new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10), end = date(b.period_end) || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const { data, error } = await db.from("jd_business_cash_transactions").select("direction,amount,currency,occurred_on,status,category").eq("school_id", school).gte("occurred_on", start).lte("occurred_on", end).order("occurred_on");
      if (error) throw error;
      const rows = data || [], currencies = [...new Set(rows.map((r) => r.currency))], summary = {};
      for (const currency of currencies) {
        const own = rows.filter((r) => r.currency === currency), clearedIn = own.filter((r) => r.direction === "inflow" && r.status === "cleared").reduce((n, r) => n + Number(r.amount), 0), clearedOut = own.filter((r) => r.direction === "outflow" && r.status === "cleared").reduce((n, r) => n + Number(r.amount), 0), pendingIn = own.filter((r) => r.direction === "inflow" && r.status === "pending").reduce((n, r) => n + Number(r.amount), 0), pendingOut = own.filter((r) => r.direction === "outflow" && r.status === "pending").reduce((n, r) => n + Number(r.amount), 0);
        summary[currency] = { cleared_inflows: clearedIn, cleared_outflows: clearedOut, net_cleared: clearedIn - clearedOut, pending_inflows: pendingIn, pending_outflows: pendingOut, transaction_count: own.length };
      }
      return send({ period: { start, end }, by_currency: summary, transactions: rows, caveat: "Cash flow is based only on manually recorded cleared/pending cash transactions. Sales opportunities and expenses are not treated as cash movements automatically." });
    }
    if (b.action === "performance.predict") {
      const rows = await list("opportunities"), expenses = await list("expenses"), byCurrency = {};
      const monthKey2 = (v) => v?.slice(0, 7);
      const ensure = (currency, month) => {
        byCurrency[currency] ??= {};
        byCurrency[currency][month] ??= { month, won_value: 0, won_count: 0, approved_spend: 0, expense_count: 0 };
        return byCurrency[currency][month];
      };
      for (const o of rows.filter((x) => x.stage === "won")) {
        const k = monthKey2(o.expected_close_date || o.updated_at || o.created_at);
        if (k) {
          const r = ensure(o.currency || "NGN", k);
          r.won_value += Number(o.amount);
          r.won_count++;
        }
      }
      for (const e of expenses.filter((x) => ["approved", "paid"].includes(x.status))) {
        const k = monthKey2(e.incurred_on);
        if (k) {
          const r = ensure(e.currency || "NGN", k);
          r.approved_spend += Number(e.amount);
          r.expense_count++;
        }
      }
      const seriesByCurrency = {};
      const forecastByCurrency = {};
      for (const [currency, months] of Object.entries(byCurrency)) {
        const series2 = Object.keys(months).sort().slice(-6).map((k) => ({ ...months[k], net_proxy: months[k].won_value - months[k].approved_spend }));
        seriesByCurrency[currency] = series2;
        if (series2.length >= 3) {
          const avg = (field) => series2.slice(-3).reduce((n, x) => n + Number(x[field] || 0), 0) / 3;
          forecastByCurrency[currency] = { next_period_won_value_run_rate: avg("won_value"), next_period_approved_spend_run_rate: avg("approved_spend"), next_period_net_proxy: avg("net_proxy"), method: "simple trailing-three-period average" };
        }
      }
      const evaluations = {};
      for (const [currency, months] of Object.entries(byCurrency)) {
        const keys = Object.keys(months).sort();
        if (keys.length < 2) continue;
        const start = /* @__PURE__ */ new Date(keys[0] + "-01T00:00:00Z"), end = /* @__PURE__ */ new Date(keys[keys.length - 1] + "-01T00:00:00Z"), dense = [];
        for (let cursor = new Date(start); cursor <= end; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
          const key2 = cursor.toISOString().slice(0, 7), entry = months[key2] || { month: key2, won_value: 0, approved_spend: 0 };
          dense.push({ month: key2, actual: Number(entry.won_value || 0) - Number(entry.approved_spend || 0) });
        }
        const evaluation = evaluateTrailingMean(dense, 3);
        if (evaluation.holdoutPeriods >= 3) {
          evaluations[currency] = evaluation;
          await db.from("jd_business_forecast_evaluations").insert({ school_id: school, currency, training_periods: evaluation.trainingPeriods, holdout_periods: evaluation.holdoutPeriods, mae: evaluation.mae, mape: evaluation.mape, baseline_method: evaluation.method, metrics: { predictions: evaluation.predictions }, limitations: ["Historical opportunity wins are not cash receipts.", "Approved expenses are not necessarily cash payments.", "A small holdout sample is not evidence of future performance."] });
        } else evaluations[currency] = { ...evaluation, validation_status: "insufficient_holdout" };
      }
      const currencyCount = Object.keys(byCurrency).length, one = currencyCount === 1 ? Object.keys(byCurrency)[0] : null, series = one ? seriesByCurrency[one] : [];
      const validated = one ? evaluations[one] : null;
      return send({ currency: one, series, series_by_currency: seriesByCurrency, forecast: one ? forecastByCurrency[one] || null : null, forecast_by_currency: forecastByCurrency, backtest_by_currency: evaluations, sample_periods: series.length, confidence: validated?.holdoutPeriods >= 3 ? "backtested_descriptive_baseline" : "insufficient_data", explanation: currencyCount > 1 ? "Metrics are separated by currency. Select a single currency before interpreting a forecast." : validated?.holdoutPeriods >= 3 ? "A trailing-mean baseline was evaluated against held-out historical months. Review MAE/MAPE and the small-sample limitations before using it." : "At least six distinct monthly periods are required: three training periods and at least three holdout periods.", sources: ["jd_business_opportunities", "jd_business_expenses"], limitations: ["Won opportunity value is not cash received.", "Expense approval is not necessarily a cash payment.", "Months with no saved records are zero-filled for the evaluation period.", "Backtesting is descriptive and does not establish predictive reliability."] });
    }
    if (b.action === "health.scorecard") {
      const [customers, opportunities, expenses, contracts, support, documents] = await Promise.all([list("customers"), list("opportunities"), list("expenses"), list("contracts"), list("support"), list("documents")]);
      const overdue = support.filter((x) => x.sla_due_at && new Date(x.sla_due_at) < /* @__PURE__ */ new Date() && !["resolved", "closed"].includes(x.status));
      const renewal = contracts.filter((x) => x.status === "active" && x.expires_on && new Date(x.expires_on).getTime() <= Date.now() + Number(x.renewal_notice_days) * 864e5);
      return send({ indicators: { customer_records: customers.length, open_opportunities: opportunities.filter((x) => !["won", "lost"].includes(x.stage)).length, overdue_support_cases: overdue.length, renewals_due: renewal.length, unreviewed_expenses: expenses.filter((x) => x.status === "submitted").length, documents_pending_extraction: documents.filter((x) => ["pending", "processing", "failed"].includes(x.extraction_status)).length }, grade: null, grade_note: "No single health grade is issued until business-specific thresholds and sufficient history are configured.", data_as_of: (/* @__PURE__ */ new Date()).toISOString() });
    }
    if (b.action === "document.upload.prepare") {
      const title = str(b.title, 180), mime = str(b.mimeType, 120).toLowerCase(), size = num3(b.byteSize, 1, 20 * 1024 * 1024);
      const allowed = { "application/pdf": "pdf", "text/plain": "txt", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx", "image/png": "png", "image/jpeg": "jpg", "image/tiff": "tiff" };
      if (!title || !allowed[mime] || size === null) return send({ error: "Use a titled PDF, DOCX, plain-text or scanned PNG/JPEG/TIFF file up to 20 MB" }, 400);
      const path = `${school}/${crypto.randomUUID()}.${allowed[mime]}`;
      const { data, error } = await db.storage.from("jd-business-documents").createSignedUploadUrl(path, { upsert: false });
      if (error || !data?.token) return send({ error: "Could not prepare secure upload" }, 500);
      return send({ path, token: data.token, bucket: "jd-business-documents", expires_in_seconds: 120 });
    }
    if (b.action === "document.upload.confirm") {
      const path = str(b.path, 500), title = str(b.title, 180), mime = str(b.mimeType, 120).toLowerCase();
      if (!path.startsWith(`${school}/`) || !title) return send({ error: "Invalid document upload reference" }, 400);
      const folder = school, file = path.slice(school.length + 1);
      const { data: objects, error: storageError } = await db.storage.from("jd-business-documents").list(folder, { search: file, limit: 20 });
      if (storageError) throw storageError;
      const object = (objects || []).find((x) => x.name === file);
      const actualSize = Number(object?.metadata?.size || 0), actualMime = str(object?.metadata?.mimetype, 120).toLowerCase();
      if (!object || actualSize < 1 || actualSize > 20 * 1024 * 1024 || actualMime !== mime) return send({ error: "Uploaded file could not be verified" }, 400);
      const { data: blob, error: downloadError } = await db.storage.from("jd-business-documents").download(path);
      if (downloadError || !blob) return send({ error: "Uploaded file could not be retrieved for security screening" }, 400);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const screen = screenDocument(bytes, mime);
      if (screen.verdict !== "pass") {
        await db.storage.from("jd-business-documents").remove([path]);
        await audit("business.document.rejected", { path, reason: screen.reason, detected_type: screen.detected_type, mime_type: mime, byte_size: actualSize });
        return send({ error: "The uploaded file failed security screening and was removed. " + (screen.reason || "") }, 400);
      }
      const { data, error } = await db.from("jd_business_documents").insert({ school_id: school, title, storage_path: path, mime_type: mime, byte_size: actualSize, extraction_status: "pending", source_metadata: { uploaded_at: (/* @__PURE__ */ new Date()).toISOString(), scan_status: "signature_screen_passed", scan_engine: "signature_screen_v1", scanned_at: (/* @__PURE__ */ new Date()).toISOString() }, created_by: actor }).select(columns.documents).single();
      if (error) throw error;
      const saved = data;
      await audit("business.document.uploaded", { document_id: saved.id, byte_size: actualSize, mime_type: mime });
      return send({ item: saved, extraction_status: "pending", notice: "Upload verified. Upload passed security screening. Text extraction remains pending for the document worker." }, 201);
    }
    if (b.action === "document.download.url") {
      if (!uuid(b.documentId)) return send({ error: "Document ID required" }, 400);
      const { data: doc, error } = await db.from("jd_business_documents").select("storage_path,title").eq("id", b.documentId).eq("school_id", school).maybeSingle();
      if (error || !doc) return send({ error: "Document not found" }, 404);
      const { data, error: signError } = await db.storage.from("jd-business-documents").createSignedUrl(doc.storage_path, 60);
      if (signError || !data?.signedUrl) return send({ error: "Could not create secure download link" }, 500);
      return send({ url: data.signedUrl, title: doc.title, expires_in_seconds: 60 });
    }
    if (b.action === "report.generate") {
      const start = date(b.period_start), end = date(b.period_end);
      if (!start || !end || end < start) return send({ error: "Valid report period required" }, 400);
      const [customers, opportunities, expenses, contracts, support] = await Promise.all([list("customers"), list("opportunities"), list("expenses"), list("contracts"), list("support")]);
      const inPeriod = (d) => d && d >= start && d <= end;
      const won = opportunities.filter((x) => x.stage === "won" && inPeriod((x.expected_close_date || x.updated_at || "").slice(0, 10)));
      const spend = expenses.filter((x) => ["approved", "paid"].includes(x.status) && inPeriod(x.incurred_on));
      const snapshot = { period: { start, end }, generated_at: (/* @__PURE__ */ new Date()).toISOString(), metrics: { customers_total: customers.length, opportunities_total: opportunities.length, won_opportunities: won.length, won_value_by_currency: Object.fromEntries([...new Set(won.map((x) => x.currency))].map((c) => [c, won.filter((x) => x.currency === c).reduce((n, x) => n + Number(x.amount), 0)])), approved_expenses_by_currency: Object.fromEntries([...new Set(spend.map((x) => x.currency))].map((c) => [c, spend.filter((x) => x.currency === c).reduce((n, x) => n + Number(x.amount), 0)])), open_support_cases: support.filter((x) => !["resolved", "closed"].includes(x.status)).length, active_contracts: contracts.filter((x) => x.status === "active").length }, sources: ["jd_business_customers", "jd_business_opportunities", "jd_business_expenses", "jd_business_contracts", "jd_business_support_cases"], limitations: ["Only saved JD Business Platform records are included.", "Opportunity wins are not cash receipts.", "Expenses must be approved/paid to be included.", "Amounts remain separated by currency."] };
      const { data, error } = await db.from("jd_business_reports").insert({ school_id: school, title: str(b.title, 180) || "Executive intelligence report", report_type: "executive", period_start: start, period_end: end, status: "draft", report_json: snapshot, source_metadata: { generated_at: snapshot.generated_at, sources: snapshot.sources }, created_by: actor }).select(columns.reports).single();
      if (error) throw error;
      await audit("business.report.generated", { report_id: data.id, period: { start, end } });
      return send({ report: data }, 201);
    }
    if (b.action === "cashflow.reconciliation.import") {
      const rows = Array.isArray(b.rows) ? b.rows.slice(0, 500) : [], fileName = str(b.fileName, 180) || "bank-statement.csv";
      if (!rows.length) return send({ error: "Provide at least one parsed statement row" }, 400);
      const { data: batch, error: batchError } = await db.from("jd_business_cash_statement_imports").insert({ school_id: school, file_name: fileName, currency: str(b.currency, 3).toUpperCase() || "NGN", row_count: rows.length, imported_by: actor }).select("id").single();
      if (batchError || !batch) return send({ error: "Could not create statement import" }, 500);
      const imported = [], rejected = [];
      for (let i = 0; i < rows.length; i++) {
        const x = rows[i] || {}, amount = num3(x.amount, 0.01), occurred = date(x.occurred_on), direction = x.direction, currency = str(x.currency || b.currency || "NGN", 3).toUpperCase();
        if (amount === null || !occurred || !["inflow", "outflow"].includes(direction) || !/^[A-Z]{3}$/.test(currency)) {
          rejected.push({ row: i + 1, reason: "Invalid date, direction, amount or currency" });
          continue;
        }
        const reference = str(x.reference, 180), description = str(x.description, 300);
        const canonical = [occurred, direction, amount.toFixed(2), currency, reference, description].join("|");
        const fingerprint = await sha256Hex(canonical);
        const { data: inserted, error } = await db.from("jd_business_cash_statement_rows").insert({ school_id: school, import_id: batch.id, occurred_on: occurred, direction, amount, currency, reference: reference || null, description, row_fingerprint: fingerprint }).select("id,occurred_on,direction,amount,currency,reference,description,reconciliation_status").single();
        if (error) {
          rejected.push({ row: i + 1, reason: "Duplicate or invalid statement row" });
          continue;
        }
        const dayBefore = new Date((/* @__PURE__ */ new Date(occurred + "T00:00:00Z")).getTime() - 3 * 864e5).toISOString().slice(0, 10), dayAfter = new Date((/* @__PURE__ */ new Date(occurred + "T00:00:00Z")).getTime() + 3 * 864e5).toISOString().slice(0, 10);
        const { data: candidates } = await db.from("jd_business_cash_transactions").select("id,occurred_on,direction,amount,currency,reference,description,status").eq("school_id", school).eq("currency", currency).eq("direction", direction).eq("amount", amount).gte("occurred_on", dayBefore).lte("occurred_on", dayAfter).in("status", ["pending", "cleared"]).limit(10);
        const exact = (candidates || []).filter((t) => !t.reference || !reference || t.reference === reference);
        if (exact.length === 1) await db.from("jd_business_cash_statement_rows").update({ reconciliation_status: "suggested" }).eq("id", inserted.id).eq("school_id", school);
        imported.push({ row: inserted, suggestions: exact });
      }
      await db.from("jd_business_cash_statement_imports").update({ row_count: imported.length }).eq("id", batch.id).eq("school_id", school);
      await audit("business.cashflow.statement_imported", { import_id: batch.id, accepted: imported.length, rejected: rejected.length });
      return send({ import_id: batch.id, imported: imported.length, rejected, rows: imported, notice: "Matches are suggestions only. Confirm each match to clear a cash transaction." }, 201);
    }
    if (b.action === "cashflow.reconciliation.list") {
      const { data, error } = await db.from("jd_business_cash_statement_rows").select("id,import_id,occurred_on,direction,amount,currency,reference,description,reconciliation_status,matched_transaction_id,matched_at,created_at").eq("school_id", school).order("occurred_on", { ascending: false }).limit(500);
      if (error) throw error;
      return send({ rows: data || [] });
    }
    if (b.action === "cashflow.reconciliation.match") {
      const rowId = uuid(b.statementRowId) ? b.statementRowId : null, transactionId = uuid(b.transactionId) ? b.transactionId : null;
      if (!rowId || !transactionId) return send({ error: "Statement row and cash transaction IDs are required" }, 400);
      const { error } = await db.rpc("jd_reconcile_business_cash_row", { p_school_id: school, p_actor_id: actor, p_statement_row_id: rowId, p_transaction_id: transactionId });
      if (error) return send({ error: "Reconciliation rejected", detail: error.message }, 409);
      await audit("business.cashflow.reconciled", { statement_row_id: rowId, transaction_id: transactionId });
      return send({ matched: true, statement_row_id: rowId, transaction_id: transactionId });
    }
    if (b.action === "cashflow.reconciliation.ignore") {
      const rowId = uuid(b.statementRowId) ? b.statementRowId : null;
      if (!rowId) return send({ error: "Statement row ID required" }, 400);
      const { data, error } = await db.from("jd_business_cash_statement_rows").update({ reconciliation_status: "ignored" }).eq("id", rowId).eq("school_id", school).neq("reconciliation_status", "matched").select("id").maybeSingle();
      if (error || !data) return send({ error: "Statement row could not be ignored" }, 409);
      await audit("business.cashflow.statement_row_ignored", { statement_row_id: rowId });
      return send({ ignored: true });
    }
    if (b.action === "report.share.create") {
      if (p.role !== "admin") return send({ error: "Only workspace administrators can create report share links" }, 403);
      const reportId = uuid(b.reportId) ? b.reportId : null, days = num3(b.expiresInDays ?? 7, 1, 30);
      if (!reportId || days === null) return send({ error: "Report ID and expiry between 1 and 30 days are required" }, 400);
      const { data: report, error: reportError } = await db.from("jd_business_reports").select("id,status").eq("id", reportId).eq("school_id", school).maybeSingle();
      if (reportError || !report) return send({ error: "Report not found" }, 404);
      if (!["approved", "shared"].includes(report.status)) return send({ error: "Approve the report before creating a public share link" }, 409);
      const token2 = base64Url(crypto.getRandomValues(new Uint8Array(32))), hash = await sha256Hex(token2), expiresAt = new Date(Date.now() + days * 864e5).toISOString();
      const { data: share, error } = await db.from("jd_business_report_shares").insert({ school_id: school, report_id: reportId, token_hash: hash, expires_at: expiresAt, created_by: actor }).select("id,expires_at").single();
      if (error) throw error;
      const base = Deno.env.get("JD_REPORT_SHARE_BASE_URL") || Deno.env.get("SUPABASE_URL");
      if (!base) return send({ error: "Share URL is not configured" }, 503);
      const shareUrl = `${base.replace(/\/$/, "")}/functions/v1/jd-business-report-share?token=${token2}`;
      await audit("business.report.share_created", { report_id: reportId, share_id: share.id, expires_at: expiresAt });
      return send({ share_id: share.id, share_url: shareUrl, expires_at: expiresAt });
    }
    if (b.action === "report.share.revoke") {
      if (p.role !== "admin") return send({ error: "Only workspace administrators can revoke report shares" }, 403);
      const shareId = uuid(b.shareId) ? b.shareId : null;
      if (!shareId) return send({ error: "Share ID required" }, 400);
      const { data, error } = await db.from("jd_business_report_shares").update({ revoked_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", shareId).eq("school_id", school).is("revoked_at", null).select("id").maybeSingle();
      if (error || !data) return send({ error: "Active report share not found" }, 404);
      await audit("business.report.share_revoked", { share_id: shareId });
      return send({ revoked: true, share_id: shareId });
    }
    if (b.action === "report.export.csv") {
      const reportId = uuid(b.reportId) ? b.reportId : null;
      if (!reportId) return send({ error: "Report ID required" }, 400);
      const { data, error } = await db.from("jd_business_reports").select("id,title,period_start,period_end,report_json,source_metadata").eq("id", reportId).eq("school_id", school).maybeSingle();
      if (error || !data) return send({ error: "Report not found" }, 404);
      const metrics = data.report_json?.metrics || {}, escapeCsv = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
      const csv = ["metric,value", ...Object.entries(metrics).flatMap(([key2, value]) => value && typeof value === "object" ? Object.entries(value).map(([currency, amount]) => [key2 + "_" + currency, amount].map(escapeCsv).join(",")) : [[key2, value].map(escapeCsv).join(",")])].join("\n");
      await audit("business.report.exported", { report_id: reportId, format: "csv" });
      return new Response(csv, { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="jd-executive-report.csv"', "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" } });
    }
    return send({ error: "Unsupported action" }, 400);
  } catch (e) {
    console.error("JD business platform", e);
    return send({ error: "Business platform request failed", detail: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
