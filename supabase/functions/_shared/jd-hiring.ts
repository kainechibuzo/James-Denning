export type HiringStage="applied"|"screening"|"interview"|"assessment"|"offer"|"hired"|"rejected"|"withdrawn";
const allowed:Record<HiringStage,HiringStage[]>={applied:["screening","rejected","withdrawn"],screening:["interview","rejected","withdrawn"],interview:["assessment","offer","rejected","withdrawn"],assessment:["offer","rejected","withdrawn"],offer:["hired","rejected","withdrawn"],hired:[],rejected:[],withdrawn:[]};
export function canMoveCandidate(from:HiringStage,to:HiringStage){return allowed[from]?.includes(to)??false;}
export function candidateStageTransition(from:HiringStage,to:HiringStage){if(!canMoveCandidate(from,to))throw new Error("Invalid recruitment stage transition");return {from,to};}
export function validateVacancy(input:Record<string,unknown>){
 const title=typeof input.title==="string"?input.title.trim().slice(0,160):"";
 const department=typeof input.department==="string"?input.department.trim().slice(0,120):"";
 const description=typeof input.description==="string"?input.description.trim().slice(0,8000):"";
 const requirements=Array.isArray(input.requirements)?input.requirements.filter((x)=>typeof x==="string").map((x)=>String(x).trim()).filter(Boolean).slice(0,40):[];
 if(!title||!department||!description) throw new Error("Vacancy title, department and description are required");
 return {title,department,description,requirements,status:"draft" as const};
}
