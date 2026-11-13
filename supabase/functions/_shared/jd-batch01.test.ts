import {assertEquals,assertThrows} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {buildCapabilityReport,JD_BATCH_01_CAPABILITY_KEYS} from "./jd-capability-intelligence.ts";
import {validateOrganisationBlueprint} from "./jd-organisation-blueprint.ts";
import {canTransitionTask,makeIdempotencyKey,normaliseTaskInput} from "./jd-operations.ts";
import {candidateStageTransition,validateVacancy} from "./jd-hiring.ts";
Deno.test("batch 01 registry enumerates all twenty upgrade capabilities",()=>assertEquals(JD_BATCH_01_CAPABILITY_KEYS.length,20));
Deno.test("capability report does not claim deployment without evidence",()=>assertEquals(buildCapabilityReport({"execution.dispatcher":{code:true,migration:true}})[0].state,"implemented"));
Deno.test("deployment requires smoke test and configuration",()=>assertEquals(buildCapabilityReport({"execution.dispatcher":{code:true,migration:true,deployment:true,configuration:true}})[0].state,"configured"));
Deno.test("blueprint validation rejects duplicate departments",()=>{const r=validateOrganisationBlueprint({name:"Fleet",industry:"Transport",businessModel:"B2B",departments:[{name:"Ops",purpose:"Fleet"},{name:"ops",purpose:"Dispatch"}]});assertEquals(r.ok,false);});
Deno.test("blueprint accepts bounded, reviewable structure",()=>{const r=validateOrganisationBlueprint({name:"Fleet",industry:"Transport",businessModel:"B2B",departments:[{name:"Operations",purpose:"Fleet",roles:["Dispatcher"]}]});assertEquals(r.ok,true);});
Deno.test("task state machine blocks invalid terminal transitions",()=>assertEquals(canTransitionTask("completed","queued"),false));
Deno.test("idempotency keys require stable operation identity",()=>assertEquals(makeIdempotencyKey("org","create","abc"),"org:create:abc"));
Deno.test("hiring stage machine validates allowed progression",()=>{candidateStageTransition("applied","screening");assertThrows(()=>candidateStageTransition("applied","hired"));});
Deno.test("vacancy generator creates drafts, never published vacancies",()=>assertEquals(validateVacancy({title:"Dispatcher",department:"Operations",description:"Manage fleet"}).status,"draft"));

const schema = await Deno.readTextFile(new URL("../../migrations/20261112084532_jd_batch01_organisation_operations_hiring.sql", import.meta.url));
Deno.test("batch 01 schema is tenant-scoped and browser-inaccessible",()=>{
 for(const table of ["jd_organisation_blueprints","jd_operational_tasks","jd_hiring_requisitions","jd_hiring_candidates"]) {
  assertEquals(schema.includes(`alter table public.${table} enable row level security`),true);
  assertEquals(schema.includes(`revoke all on public.${table} from anon, authenticated`),true);
 }
});
Deno.test("organisation blueprint persistence is admin-derived and service-role only",()=>{
 assertEquals(schema.includes("where id=p_actor_id and role='admin'"),true);
 assertEquals(schema.includes("grant execute on function public.jd_create_organisation_blueprint"),true);
});

Deno.test("task input preserves department and ISO due date",()=>{const r=normaliseTaskInput({title:"Dispatch audit",department:"Operations",dueAt:"2026-11-12T09:00:00.000Z"});assertEquals(r.department,"Operations");assertEquals(r.due_at,"2026-11-12T09:00:00.000Z");});
