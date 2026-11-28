// A client where every data read fails the way a dropped connection or a 502 does.
// Used by scripts/test-workspace-robustness.mjs.
import {supabase as real, user, school} from './site-ui-client.mjs';
export {user, school};
const fail = () => Promise.reject(new Error('network down'));
// Synchronous setters are not network calls; keep them working.
const SYNC = new Set(['setSchool', 'setSchoolId']);
const rejectAll = new Proxy({}, {get: (_t, prop) => {
  if (prop === 'then') return undefined;
  if (SYNC.has(prop)) return () => {};
  return fail;
}});
export const supabase = {
  ...real,
  rpc: fail,
  from: () => { const q = new Proxy({}, {get: (_t, p) => p === 'then' ? undefined : () => q}); return q; },
  storage: {from: () => ({uploadToSignedUrl: fail})},
};
export const db = rejectAll;
