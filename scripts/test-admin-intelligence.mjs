import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const dashboard=readFileSync(new URL("../src/pages/admin-dashboard.jsx",import.meta.url),"utf8");
const migration=readFileSync(new URL("../supabase/migrations/20261127230000_jd_admin_intelligence_snapshot.sql",import.meta.url),"utf8");
test("admin intelligence UI calls the workspace-scoped snapshot RPC",()=>{
 assert.match(dashboard,/supabase\.rpc\("jd_admin_intelligence_snapshot"/);
 assert.match(dashboard,/user\?\.role==="admin"/);
 assert.match(dashboard,/All captured requests/);
 assert.match(dashboard,/Workspace logs & execution events/);
 assert.match(dashboard,/Most used connector tools/);
 assert.match(dashboard,/Most opened workspace features/);
 const shell=readFileSync(new URL("../src/AppDemo.jsx",import.meta.url),"utf8");
 assert.match(shell,/jd_record_feature_usage/);
 assert.match(dashboard,/Most frequent event types/);
});
test("snapshot is restricted to authenticated workspace administrators",()=>{
 assert.match(migration,/auth\.uid\(\)/);
 assert.match(migration,/p\.role='admin'/);
 assert.match(migration,/Workspace administrator required/);
 assert.match(migration,/grant execute on function public\.jd_admin_intelligence_snapshot\(integer\) to authenticated, service_role/i);
 assert.match(migration,/revoke all on function public\.jd_admin_intelligence_snapshot\(integer\) from public, anon/i);
});
test("request and event payload values are not returned by the snapshot",()=>{
 assert.match(migration,/request_fields/);
 assert.match(migration,/detail_fields/);
 assert.doesNotMatch(migration,/jsonb_build_object\([^;]*'request',\s*request/s);
 assert.doesNotMatch(migration,/jsonb_build_object\([^;]*'receipt',\s*receipt/s);
});
test("usage ranking is based on recorded feature routes and connector executions",()=>{
 assert.match(migration,/jd_feature_usage_events/);
 assert.match(migration,/most_used_features/);
 assert.match(migration,/jd_record_feature_usage/);
 assert.match(dashboard,/Most opened workspace features/);
});
