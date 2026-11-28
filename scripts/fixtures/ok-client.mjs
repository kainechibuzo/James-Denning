// Healthy synthetic client: same data as site-ui-client plus the rpc helper a
// real supabase-js client always has.
import {supabase as real, db, user, school} from './site-ui-client.mjs';
export {db, user, school};
export const supabase = {...real, rpc: async () => ({data: null, error: null})};
