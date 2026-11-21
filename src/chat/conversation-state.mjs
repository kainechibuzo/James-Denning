/** Request IDs are transport identities, never authorization tokens. randomUUID
 * requires a secure context; getRandomValues also works in local HTTP tests. */
export function newRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return [...globalThis.crypto.getRandomValues(new Uint8Array(16))].map(v=>v.toString(16).padStart(2,'0')).join('');
}
