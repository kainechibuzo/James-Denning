export type CapabilityState = "implemented" | "deployed" | "configured" | "partial" | "missing" | "unverified";
export type CapabilityEvidence = { code?: boolean; migration?: boolean; deployment?: boolean; configuration?: boolean; smokeTest?: boolean };
export type Capability = { key:string; label:string; area:string; evidence:CapabilityEvidence; state:CapabilityState; gaps:string[] };
const catalog = [
 ["execution.dispatcher","Execution dispatcher","runtime"],["execution.recovery","Lease recovery","runtime"],["execution.idempotency","Idempotent tool execution","runtime"],["execution.monitor","Live execution monitor","runtime"],["execution.controls","Execution controls","runtime"],
 ["org.scanner","Organisation scanner","organisation"],["org.capabilities","Capability intelligence","organisation"],["org.blueprint","Business blueprint generator","organisation"],["org.departments","Division and department builder","organisation"],["org.provisioning","Organisation provisioning","organisation"],
 ["people.intelligence","People intelligence","people"],["operations.intelligence","Operations intelligence","operations"],["performance.intelligence","Performance intelligence","performance"],["finance.intelligence","Finance intelligence","finance"],["communications.intelligence","Communications intelligence","communications"],
 ["hiring.planner","Workforce planner","hiring"],["hiring.vacancies","Vacancy generator","hiring"],["hiring.pipeline","Recruitment pipeline","hiring"],["hiring.assistant","Recruitment assistant","hiring"],["hiring.campaigns","Hiring campaign manager","hiring"],
] as const;
export function classifyCapability(e:CapabilityEvidence):CapabilityState {
 if(e.smokeTest && e.deployment && e.configuration) return "deployed";
 if(e.deployment && e.configuration) return "configured";
 if(e.code && e.migration) return "implemented";
 if(e.code || e.migration) return "partial";
 if(Object.keys(e).length===0) return "unverified";
 return "missing";
}
export function buildCapabilityReport(evidence:Record<string,CapabilityEvidence>):Capability[] {
 return catalog.map(([key,label,area])=>{
  const e=evidence[key]||{};
  const state=classifyCapability(e);
  const gaps:string[]=[];
  if(!e.code) gaps.push("implementation evidence");
  if(!e.migration) gaps.push("database migration evidence");
  if(!e.deployment) gaps.push("deployment evidence");
  if(!e.configuration) gaps.push("configuration evidence");
  if(!e.smokeTest) gaps.push("authenticated smoke-test evidence");
  return {key,label,area,evidence:e,state,gaps};
 });
}
export const JD_BATCH_01_CAPABILITY_KEYS = catalog.map(([key])=>key);
