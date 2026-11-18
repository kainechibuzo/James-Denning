// supabase/functions/jd-business-oauth-callback/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";

// supabase/functions/_shared/jd-oauth-crypto.ts
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

// supabase/functions/jd-business-oauth-callback/index.ts
var headers = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
var reply = (message, status = 400) => new Response(message, { status, headers });
var providers = {
  "google-workspace": { tokenUrl: "https://oauth2.googleapis.com/token", clientIdEnv: "JD_OAUTH_GOOGLE_CLIENT_ID", clientSecretEnv: "JD_OAUTH_GOOGLE_CLIENT_SECRET" },
  "microsoft-365": { tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token", clientIdEnv: "JD_OAUTH_MICROSOFT_CLIENT_ID", clientSecretEnv: "JD_OAUTH_MICROSOFT_CLIENT_SECRET" },
  "linkedin": { tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken", clientIdEnv: "JD_OAUTH_LINKEDIN_CLIENT_ID", clientSecretEnv: "JD_OAUTH_LINKEDIN_CLIENT_SECRET" },
  "slack": { tokenUrl: "https://slack.com/api/oauth.v2.access", clientIdEnv: "JD_OAUTH_SLACK_CLIENT_ID", clientSecretEnv: "JD_OAUTH_SLACK_CLIENT_SECRET" }
};
Deno.serve(async (req) => {
  if (req.method !== "GET") return reply("Method not allowed", 405);
  const incoming = new URL(req.url), state = incoming.searchParams.get("state") || "", code = incoming.searchParams.get("code") || "";
  if (state.length < 24 || state.length > 256) return reply("Invalid OAuth state", 400);
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), encoded = getJdSecret("JD_OAUTH_ENCRYPTION_KEY");
  if (!url || !key || !encoded) return reply("OAuth callback is not configured", 503);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const stateHash = await sha256Hex(state);
    const { data, error } = await db.rpc("jd_consume_business_oauth_state", { p_state_hash: stateHash });
    const row = (data || [])[0];
    if (error || !row) return reply("OAuth state expired, invalid or already used", 400);
    const { data: actor, error: actorError } = await db.from("profiles").select("school_id,role").eq("id", row.actor_id).maybeSingle();
    if (actorError || actor?.school_id !== row.school_id || !["owner", "admin", "manager"].includes(actor?.role)) return reply("Workspace permission changed. Start again with an authorised account.", 403);
    const provider = providers[row.provider_id];
    if (!provider) return reply("OAuth provider is not supported", 400);
    if (incoming.searchParams.get("error")) return reply("Provider authorization was not completed. Start the connection again.", 400);
    if (!code) return reply("Authorization code missing", 400);
    const clientId = Deno.env.get(provider.clientIdEnv), clientSecret = Deno.env.get(provider.clientSecretEnv);
    if (!clientId || !clientSecret) return reply("Provider credentials are not configured", 503);
    const aesKey = await importAesKey(encoded), verifier = await decryptSecret(row.pkce_verifier_encrypted, aesKey);
    const form = new URLSearchParams({ grant_type: "authorization_code", code, client_id: clientId, client_secret: clientSecret, redirect_uri: row.redirect_uri, code_verifier: verifier });
    const response = await fetch(provider.tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" }, body: form, signal: AbortSignal.timeout(1e4), redirect: "error" });
    const token = await response.json().catch(() => null);
    if (!response.ok || !token?.access_token || row.provider_id === "slack" && token.ok === false) return reply("Provider token exchange failed. Start a new connection and try again.", 502);
    const scopeValue = typeof token.scope === "string" ? token.scope : typeof token.authed_user?.scope === "string" ? token.authed_user.scope : "";
    const scopes = scopeValue ? scopeValue.split(/[ ,]+/).filter(Boolean) : [];
    const expires = Number(token.expires_in), expiresAt = Number.isFinite(expires) && expires > 0 ? new Date(Date.now() + expires * 1e3).toISOString() : null;
    const bundle = JSON.stringify({ access_token: token.access_token, refresh_token: token.refresh_token || null, token_type: token.token_type || "Bearer", scope: scopes, issued_at: (/* @__PURE__ */ new Date()).toISOString() });
    const encrypted = await encryptSecret(bundle, aesKey);
    const { error: saveError } = await db.from("jd_business_oauth_connections").upsert({ school_id: row.school_id, provider_id: row.provider_id, status: "connected", scopes, connected_by: row.actor_id, connected_at: (/* @__PURE__ */ new Date()).toISOString(), token_expires_at: expiresAt, encrypted_credentials: encrypted, enabled_read_services: row.enabled_read_services || [], key_version: "aes-gcm-v1", last_error_code: null, last_checked_at: (/* @__PURE__ */ new Date()).toISOString(), updated_at: (/* @__PURE__ */ new Date()).toISOString() }, { onConflict: "school_id,provider_id" });
    if (saveError) return reply("Connection could not be stored securely", 500);
    await db.rpc("jd_business_audit", { p_school_id: row.school_id, p_actor_id: row.actor_id, p_event_type: "business.oauth.connected", p_event: { provider_id: row.provider_id, scopes } });
    const destination = Deno.env.get("JD_OAUTH_SUCCESS_REDIRECT");
    if (destination) {
      const target = new URL(destination);
      if (target.protocol !== "https:" && target.hostname !== "localhost") return reply("OAuth success redirect must use HTTPS", 500);
      target.searchParams.set("integration", row.provider_id);
      target.searchParams.set("connected", "1");
      return new Response(null, { status: 303, headers: { Location: target.toString(), ...headers } });
    }
    return reply("Integration connected. You may return to James Denning.", 200);
  } catch {
    return reply("OAuth callback failed safely. Start a new connection and check provider configuration.", 500);
  }
});
