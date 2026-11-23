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
const privateChat=read("supabase/migrations/20261124180000_jd_workforce_private_chat.sql");
const assignmentAttribution=read("supabase/migrations/20261124190000_jd_employee_assignment_attribution.sql");
const shadowUsage=read("supabase/migrations/20261124200000_jd_workforce_shadow_usage.sql");
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
 assert.ok(ui.includes("does not stop or resume an in-flight assignment"));
 assert.ok(ui.includes("not invoices"));
 assert.ok(service.includes('agentChatEnabled:Deno.env.get("JD_WORKFORCE_PRIVATE_CHAT_ENABLED")==="true"'));
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
 assert.match(lifecycle,/request identifier reused/i);
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
test("workforce UI exposes only approved activation outcomes plus membership and budget controls",()=>{
 assert.ok(service.includes("workforce.proposal.activate"));
 assert.ok(service.includes("workforce.team.membership"));
 assert.ok(service.includes("workforce.employee.budget"));
 assert.ok(ui.includes("Add member"));
 assert.ok(ui.includes("Set budget"));
 assert.ok(ui.includes("Access requested (not granted)"));
 assert.ok(service.includes("role_title,purpose,responsibilities,requested_access"));
 assert.ok(ui.includes("employeeUsage.length"));
 assert.doesNotMatch(ui,/Add employee|Create team|workforce\.employee\.create|workforce\.team\.create/);
});
test("private agent chat and checked worker controls remain honestly gated",()=>{
 assert.ok(service.includes('agentChatEnabled:Deno.env.get("JD_WORKFORCE_PRIVATE_CHAT_ENABLED")==="true"'));
 assert.ok(service.includes("executionControlsEnabled:false"));
 assert.ok(ui.includes("private agent conversations"));
 assert.ok(service.includes("workforce.agent.message.send"));
 assert.ok(service.includes("workforce.agent.thread.open"));
 assert.ok(service.includes("runPrivateSpecialistReply"));
 assert.ok(ui.includes("Private chat"));
 assert.ok(ui.includes("Reasoning only"));
 assert.ok(ui.includes("Shadow usage ledger"));
 assert.ok(ui.includes("not invoices"));
 assert.ok(ui.includes("Assignment "));
 assert.ok(service.includes("specialistInstructions"));
 assert.doesNotMatch(service,/Private chat is currently available for built-in specialist employees only/);
});

test("private specialist chat is append-only, tenant-scoped and release-gated",()=>{
 assert.ok(privateChat.includes("add column status text not null default 'active'"));
 assert.ok(privateChat.includes("add column request_id uuid"));
 assert.ok(privateChat.includes("add column reply_to_message_id uuid"));
 assert.ok(privateChat.includes("jd_workforce_agent_user_request_once"));
 assert.ok(privateChat.includes("jd_workforce_agent_reply_once"));
 assert.ok(privateChat.includes("jd_workforce_agent_messages_immutable"));
 assert.ok(service.includes("JD_WORKFORCE_PRIVATE_CHAT_ENABLED"));
 assert.ok(service.includes("workforce.agent.message.sent"));
 assert.ok(service.includes("workforce.agent.message.replied"));
});

test("workforce assignment records retain employee and team attribution",()=>{
 assert.ok(assignmentAttribution.includes("add column employee_id uuid"));
 assert.ok(assignmentAttribution.includes("add column team_id uuid"));
 assert.ok(service.includes("employee_id,team_id,task,status"));
 assert.ok(ui.includes("Employee: "));
});

test("employee execution time is recorded as idempotent shadow usage only",()=>{
 assert.ok(shadowUsage.includes("jd_workforce_record_employee_usage"));
 assert.ok(shadowUsage.includes("p_source_event<>p_assignment"));
 assert.ok(shadowUsage.includes("'observed'"));
 assert.ok(shadowUsage.includes("'disputed'"));
 assert.ok(shadowUsage.includes("'shadow_only'"));
 assert.ok(shadowUsage.includes("'charged',false"));
 assert.ok(ui.includes("shadow"));
});

test("shadow usage ledger links observed employee time to immutable assignment evidence",()=>{
 assert.ok(shadowUsage.includes("jd_workforce_record_employee_usage"));
 assert.ok(shadowUsage.includes("source_event_id=p_source_event"));
 assert.ok(shadowUsage.includes("v_assignment.employee_id"));
 assert.ok(shadowUsage.includes("billing_mode','shadow_only"));
 assert.ok(shadowUsage.includes("charged',false"));
 assert.ok(ui.includes("Shadow usage ledger"));
 assert.ok(ui.includes("Assignment "));
 assert.ok(ui.includes("shadow estimate"));
});
