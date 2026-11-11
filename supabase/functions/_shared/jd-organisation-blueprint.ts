export type BlueprintDepartment={name:string;purpose:string;roles:string[];workflows:string[];kpis:string[]};
export type OrganisationBlueprint={name:string;industry:string;businessModel:string;departments:BlueprintDepartment[];integrations:string[];risks:string[];gaps:string[]};
const text=(v:unknown,max:number)=>typeof v==="string"?v.trim().slice(0,max):"";
export function validateOrganisationBlueprint(input:unknown):{ok:true;blueprint:OrganisationBlueprint}|{ok:false;errors:string[]} {
 const x=(input&&typeof input==="object"?input:{}) as Record<string,unknown>;
 const errors:string[]=[];
 const name=text(x.name,160), industry=text(x.industry,80), businessModel=text(x.businessModel,500);
 if(!name) errors.push("name is required");
 if(!industry) errors.push("industry is required");
 if(!businessModel) errors.push("businessModel is required");
 const raw=Array.isArray(x.departments)?x.departments:[];
 if(raw.length<1||raw.length>30) errors.push("departments must contain 1 to 30 entries");
 const departments:BlueprintDepartment[]=raw.slice(0,30).map((d:unknown)=>{
  const v=(d&&typeof d==="object"?d:{}) as Record<string,unknown>;
  return {name:text(v.name,120),purpose:text(v.purpose,500),roles:Array.isArray(v.roles)?v.roles.map((r)=>text(r,120)).filter(Boolean).slice(0,30):[],workflows:Array.isArray(v.workflows)?v.workflows.map((r)=>text(r,160)).filter(Boolean).slice(0,30):[],kpis:Array.isArray(v.kpis)?v.kpis.map((r)=>text(r,120)).filter(Boolean).slice(0,30):[]};
 });
 if(departments.some(d=>!d.name||!d.purpose)) errors.push("every department needs a name and purpose");
 if(new Set(departments.map(d=>d.name.toLowerCase())).size!==departments.length) errors.push("department names must be unique");
 const list=(v:unknown)=>Array.isArray(v)?v.map((a)=>text(a,240)).filter(Boolean).slice(0,40):[];
 const blueprint={name,industry,businessModel,departments,integrations:list(x.integrations),risks:list(x.risks),gaps:list(x.gaps)};
 return errors.length?{ok:false,errors}:{ok:true,blueprint};
}
export function blueprintProvisioningPlan(blueprint:OrganisationBlueprint,capabilities:Record<string,string>) {
 return blueprint.departments.map((department)=>({department:department.name,roles:department.roles,workflows:department.workflows,kpis:department.kpis,status:"requires_review",unsupported:department.workflows.filter((w)=>!Object.values(capabilities).some((v)=>v==="deployed"||v==="configured"||v==="implemented"))}));
}
