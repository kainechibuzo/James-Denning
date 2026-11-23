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
 for(const table of ["jd_workforce_employees","jd_workforce_teams","jd_workforce_team_members","jd_workforce_agent_threads","jd_workforce_agent_messages","jd_workforce_control_events"])assert.match(migration,new RegExp("alter table public\\."+table+" enable row level security"));
 assert.match(migration,/revoke all on public\\.jd_workforce_employees[\\s\\S]*from anon,authenticated/);
 assert.match(migration,/foreign key\\(school_id,employee_id\\) references public\\.jd_workforce_employees\\(school_id,id\\)/);
 assert.match(migration,/foreign key\\(school_id,team_id\\) references public\\.jd_workforce_teams\\(school_id,id\\)/);
});
test("workforce controls derive tenant and actor from authenticated profile and audit transitions",()=>{
 assert.match(service,/profile\\?\\.id!==actorId/);
 assert.match(service,/profile\\.school_id/);
 assert.match(service,/jd_workforce_control/);
 assert.match(migration,/insert into public\\.jd_audit_events/);
 assert.match(migration,/jd_workforce_control_events_immutable/);
});
test("HTTP exposes workforce control only after authenticated profile resolution",()=>{
 assert.match(endpoint,/handleWorkforceControl\\(\\{payload,admin,profile,actorId:authData\\.user\\.id,json\\}\\)/);
});
test("control centre never claims in-flight cancellation or payable billing",()=>{
 assert.match(ui,/does not cancel or resume an in-flight assignment/);
 assert.match(ui,/not payable/);
 assert.match(ui,/agentChatEnabled:false/);
});
test("workforce control centre is reachable from the chat tool surface",()=>{
 assert.match(nav,/id:'workforce',label:'Workforce control centre'/);
 assert.match(chat,/WorkforceControlCentre/);
 assert.match(chat,/setShowWorkforce\\(view==="workforce"\\)/);
});
