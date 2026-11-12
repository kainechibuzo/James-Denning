/**
 * Reads the single JD_SECRETS_JSON Edge Function secret.
 * Individual secret values must never be committed to source control.
 */
export type JdSecretName =
  | "JD_WORKER_SECRET"
  | "JD_BUSINESS_MONITOR_WORKER_SECRET"
  | "JD_DOCUMENT_WORKER_SECRET"
  | "JD_BUSINESS_OPS_WORKER_SECRET"
  | "JD_OAUTH_ENCRYPTION_KEY";

let cachedRaw: string | null = null;
let cachedBundle: Record<string, unknown> = {};

function readBundle(): Record<string, unknown> {
  const raw = Deno.env.get("JD_SECRETS_JSON") || "";
  if (!raw) return {};
  if (raw === cachedRaw) return cachedBundle;
  cachedRaw = raw;
  try {
    const parsed: unknown = JSON.parse(raw);
    cachedBundle = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    cachedBundle = {};
  }
  return cachedBundle;
}

/** Returns an empty string for missing, malformed, or undersized secrets. */
export function getJdSecret(name: JdSecretName): string {
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
