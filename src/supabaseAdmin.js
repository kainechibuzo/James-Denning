// Legacy file — kept as empty re-export stub so stale imports don't crash the build.
// All DB operations should go through db.* in supabaseClient.js.
export { supabase, db as dbOps } from './supabaseClient.js'
export const supabaseAdmin = null
export const adminDb = null
