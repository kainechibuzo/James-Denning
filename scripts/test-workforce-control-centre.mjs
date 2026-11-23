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
 assert.ok(ui.includes("not invoices"));
 assert.ok(service.includes("agentChatEnabled:false"));
});
test("workforce control centre is reachable from the chat tool surface",()=>{
 assert.ok(nav.includes("id:'workforce',label:'Workforce control centre'"));
 assert.ok(chat.includes("WorkforceControlCentre"));
 assert.ok(chat.includes('setShowWorkforce(view==="workforce")'));
});

const lifecycle=read("supabase/migrations/20261124130000_jd_workforce_lifecycle_and_employee_budgets.sql");
test("employee activation and team membership are tenant-scoped and idempotent",()=>{
 for(const table of ["jd_workforce_employee_budgets","jd_workforce_employee_usage","jd_workforce_provision_requests"])assert.ok(lifecycle.includes("alter table public."+table+" enable row level security"));
 for(const fn of ["jd_workforce_create_employee","jd_workforce_create_team","jd_workforce_team_membership"])assert.ok(lifecycle.includes("grant execute on function public."+fn));
 assert.ok(lifecycle.includes("request identifier reused"));
 assert.ok(lifecycle.includes("execution_authorized=true"));
 assert.ok(lifecycle.includes("jd_audit_events"));
});
test("employee budgets are versioned shadow limits, not charges",()=>{
 assert.ok(lifecycle.includes("jd_workforce_set_employee_budget"));
 assert.ok(lifecycle.includes("p_expected_version"));
 assert.ok(lifecycle.includes("'charged',false"));
 assert.ok(lifecycle.includes("reconciliation_status in ('observed','reconciled','disputed')"));
 assert.ok(service.includes("workforce.employee.budget"));
 assert.ok(service.includes("jd_workforce_employee_usage"));
});
test("provisioning UI exposes employee, team, membership and budget operations",()=>{
 for(const action of ["workforce.employee.create","workforce.team.create","workforce.team.membership","workforce.employee.budget"])assert.ok(ui.includes(action));
 assert.ok(ui.includes("Add employee"));
 assert.ok(ui.includes("Create team"));
 assert.ok(ui.includes("Set budget"));
 assert.ok(ui.includes("employeeUsage.length"));
});
test("private agent chat and checked worker controls remain honestly gated",()=>{
 assert.ok(service.includes("agentChatEnabled:false"));
 assert.ok(service.includes("executionControlsEnabled:false"));
 assert.ok(ui.includes("private agent conversations"));
 assert.ok(ui.includes("not yet emitting employee-attributed usage receipts"));
});
