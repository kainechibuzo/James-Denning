import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const migration=read("supabase/migrations/20261124110000_jd_workforce_control_centre.sql");
const service=read("supabase/functions/_shared/jd-workforce-control-service.ts");
const endpoint=read("supabase/functions/jd-automation/index.ts");
const ui=read("src/chat/WorkforceControlCentre.jsx");
const chat=read("src/chat/ChatHome.jsx");
const nav=read("src/config/assistant-navigation.mjs");
test("workforce identity and control records are tenant-scoped and service-only",()=>{
 for(const table of ["jd_workforce_employees","jd_workforce_teams","jd_workforce_team_members","jd_workforce_agent_threads","jd_workforce_agent_messages","jd_workforce_control_events"])assert.ok(migration.includes("alter table public."+table+" enable row level security"));
 assert.ok(migration.includes("revoke all on public.jd_workforce_employees"));
 assert.ok(migration.includes("from anon,authenticated"));
 assert.ok(migration.includes("foreign key(school_id,employee_id) references public.jd_workforce_employees(school_id,id)"));
 assert.ok(migration.includes("foreign key(school_id,team_id) references public.jd_workforce_teams(school_id,id)"));
});
test("workforce controls derive tenant and actor from authenticated profile and audit transitions",()=>{
 assert.ok(service.includes("profile?.id!==actorId"));
 assert.ok(service.includes("profile.school_id"));
 assert.ok(service.includes("jd_workforce_control"));
 assert.ok(migration.includes("insert into public.jd_audit_events"));
 assert.ok(migration.includes("jd_workforce_control_events_immutable"));
});
test("HTTP exposes workforce control only after authenticated profile resolution",()=>{
 assert.ok(endpoint.includes("handleWorkforceControl({payload,admin,profile,actorId:authData.user.id,json})"));
});
test("control centre never claims in-flight cancellation or payable billing",()=>{
 assert.ok(ui.includes("does not cancel or resume an in-flight assignment"));
 assert.ok(ui.includes("not payable"));
 assert.ok(service.includes("agentChatEnabled:false"));
});
test("workforce control centre is reachable from the chat tool surface",()=>{
 assert.ok(nav.includes("id:'workforce',label:'Workforce control centre'"));
 assert.ok(chat.includes("WorkforceControlCentre"));
 assert.ok(chat.includes('setShowWorkforce(view==="workforce")'));
});
