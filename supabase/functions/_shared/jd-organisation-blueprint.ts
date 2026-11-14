export type BlueprintDepartment={name:string;purpose:string;roles:string[];workflows:string[];kpis:string[]};
export type OrganisationBlueprint={name:string;industry:string;businessModel:string;departments:BlueprintDepartment[];integrations:string[];risks:string[];gaps:string[]};
const text=(v:unknown,max:number)=>typeof v==="string"?v.trim().slice(0,max):"";

const clothingDepartments:BlueprintDepartment[]=[
 {name:"Store Operations",purpose:"Run daily store activity, opening and closing, service standards and sales-floor execution.",roles:["Store Manager","Assistant Store Manager","Sales Associate"],workflows:["Daily opening and closing checklist","Store-floor coverage and shift handover","Returns and customer issue handling"],kpis:["Daily sales","Conversion rate","Average transaction value","Customer satisfaction"]},
 {name:"Merchandising & Inventory",purpose:"Keep the right products, sizes and styles available while controlling stock accuracy.",roles:["Merchandising Lead","Inventory Coordinator","Stock Associate"],workflows:["Purchase and receiving","Stock counts and replenishment","Product and size performance review"],kpis:["Inventory accuracy","Sell-through rate","Stockout rate","Gross margin"]},
 {name:"Sales & Customer Experience",purpose:"Help customers choose products and deliver a consistent shopping experience.",roles:["Sales Lead","Customer Experience Associate"],workflows:["Customer assistance","Order and exchange resolution","Customer feedback review"],kpis:["Sales per associate","Repeat-customer rate","Return rate","Customer satisfaction"]},
 {name:"Marketing & E-commerce",purpose:"Attract customers through campaigns, social channels and online sales.",roles:["Marketing Lead","Content & Social Media Coordinator","E-commerce Coordinator"],workflows:["Campaign planning and approval","Product photography and listing","Online order fulfilment coordination"],kpis:["Campaign conversion","Online revenue","Customer acquisition cost","Website conversion rate"]},
 {name:"Finance & Administration",purpose:"Control cash, expenses, supplier payments and business records.",roles:["Finance Officer","Administrator"],workflows:["Daily sales reconciliation","Expense and supplier invoice review","Weekly cash-flow review"],kpis:["Gross profit margin","Operating expenses","Cash-flow position","Reconciliation completion"]},
 {name:"People & HR",purpose:"Recruit, onboard, schedule and support store employees.",roles:["People Operations Lead","Recruitment & Training Coordinator"],workflows:["Hiring and onboarding","Staff scheduling","Training and performance reviews"],kpis:["Time to hire","Staff attendance","Training completion","Employee retention"]}
];
const truckingDepartments:BlueprintDepartment[]=[
 {name:"Fleet Operations",purpose:"Coordinate vehicles, capacity, routes and day-to-day fleet utilisation.",roles:["Fleet Operations Manager","Fleet Coordinator"],workflows:["Daily vehicle allocation","Trip planning and dispatch handover","Vehicle utilisation review"],kpis:["Fleet utilisation","On-time delivery rate","Cost per kilometre","Trips completed"]},
 {name:"Dispatch & Logistics",purpose:"Plan loads, assign drivers, track journeys and manage delivery exceptions.",roles:["Dispatch Manager","Dispatcher","Route Planner"],workflows:["Order intake and load planning","Driver and route assignment","Proof-of-delivery and exception handling"],kpis:["On-time pickup rate","On-time delivery rate","Load utilisation","Delivery exception rate"]},
 {name:"Drivers & Safety",purpose:"Ensure drivers are qualified, briefed and operating under safety procedures.",roles:["Driver Supervisor","Truck Driver","Safety Officer"],workflows:["Driver onboarding and licence checks","Pre-trip inspection checklist","Incident reporting and review"],kpis:["Safety incidents","Inspection completion","Driver compliance","Hours-of-service exceptions"]},
 {name:"Vehicle Maintenance",purpose:"Keep trucks roadworthy through planned servicing and repair control.",roles:["Maintenance Manager","Mechanic","Maintenance Coordinator"],workflows:["Preventive maintenance scheduling","Defect reporting and repair approval","Vehicle return-to-service checks"],kpis:["Vehicle downtime","Preventive maintenance completion","Maintenance cost per vehicle","Repeat defect rate"]},
 {name:"Sales & Customer Relations",purpose:"Win transport contracts, manage customer accounts and maintain service quality.",roles:["Sales Manager","Account Manager","Customer Support Officer"],workflows:["Lead and quotation management","Contract and rate review","Customer delivery issue resolution"],kpis:["Revenue by customer","Quote win rate","Customer retention","Complaint resolution time"]},
 {name:"Finance & Administration",purpose:"Manage invoicing, fuel and operating costs, payroll inputs and financial controls.",roles:["Finance Officer","Accounts Assistant","Administrator"],workflows:["Trip-cost and fuel reconciliation","Customer invoicing and collections","Supplier and expense review"],kpis:["Operating margin","Fuel cost per kilometre","Days sales outstanding","Invoice accuracy"]},
 {name:"People & HR",purpose:"Recruit, onboard and support drivers and office staff.",roles:["HR Officer","Recruitment Coordinator","Training Coordinator"],workflows:["Driver recruitment and verification","Staff onboarding","Training and performance reviews"],kpis:["Time to hire","Driver retention","Training completion","Staff attendance"]}
];
const generalDepartments:BlueprintDepartment[]=[
 {name:"Operations",purpose:"Deliver the core product or service and coordinate daily execution.",roles:["Operations Manager","Operations Coordinator","Team Member"],workflows:["Daily operating plan","Work allocation and handover","Quality and issue review"],kpis:["Output per day","On-time completion","Operating cost","Quality rate"]},
 {name:"Sales & Marketing",purpose:"Generate demand, convert prospects and maintain customer relationships.",roles:["Sales Lead","Marketing Coordinator","Account Executive"],workflows:["Lead capture and qualification","Sales follow-up","Campaign planning and review"],kpis:["New customers","Lead conversion","Revenue","Customer acquisition cost"]},
 {name:"Customer Service",purpose:"Resolve customer questions, complaints and service requests.",roles:["Customer Service Lead","Support Associate"],workflows:["Customer enquiry handling","Complaint escalation","Feedback review"],kpis:["Response time","Resolution time","Customer satisfaction","Repeat-customer rate"]},
 {name:"Finance & Administration",purpose:"Maintain financial controls, records, payments and reporting.",roles:["Finance Officer","Administrator"],workflows:["Income and expense recording","Invoice and payment review","Monthly financial close"],kpis:["Gross margin","Cash-flow position","Expense variance","Reconciliation completion"]},
 {name:"People & HR",purpose:"Recruit, onboard, schedule and develop employees.",roles:["HR Officer","Recruitment Coordinator"],workflows:["Hiring and onboarding","Staff scheduling","Training and performance reviews"],kpis:["Time to hire","Staff retention","Attendance","Training completion"]}
];

export function buildOrganisationBlueprintDraft(input: { businessIdea: string; name?: string; businessModel?: string }) {
 const idea=text(input.businessIdea,500);
 const lower=idea.toLowerCase();
 const isClothing=/\b(clothing|fashion|apparel|garment|boutique|cloth(?:es|ing)? store)\b/.test(lower);
 const isTrucking=/\b(truck(?:ing)?|haulage|freight|logistics|transport(?:ation)? company|fleet)\b/.test(lower);
 const industry=isClothing?"Clothing retail":isTrucking?"Trucking and logistics":"Business operations";
 const cloneDepartments=(source:BlueprintDepartment[])=>source.map((d)=>({...d,roles:[...d.roles],workflows:[...d.workflows],kpis:[...d.kpis]}));
 const departments=cloneDepartments(isClothing?clothingDepartments:isTrucking?truckingDepartments:generalDepartments);
 const defaultName=isClothing?"New Clothing Store":isTrucking?"New Trucking Company":"New Business";
 const model=text(input.businessModel,500)|| (isClothing?"Retail sales of clothing and accessories through a physical store and, where appropriate, online channels.":isTrucking?"Commercial transport and haulage services for business and individual customers, with fleet, dispatch and delivery operations.":"A customer-focused business delivering products or services through coordinated operations, sales and support.");
 const name=text(input.name,160)||defaultName;
 return {
  name,industry,businessModel:model,departments,
  integrations:isClothing?["Point-of-sale system","Inventory and stock management","E-commerce storefront","Accounting software"]:isTrucking?["Fleet tracking and telematics","Route planning and dispatch","Fuel and expense management","Accounting and invoicing"]:["Accounting software","Customer relationship management","Team communication and task management"],
  risks:isClothing?["Unsold or slow-moving inventory","Seasonal demand changes","Theft, shrinkage and stock-count errors","Supplier delays and cash-flow pressure"]:isTrucking?["Fuel-price volatility","Vehicle breakdowns and downtime","Road safety and regulatory compliance","Late deliveries and customer claims","Customer payment delays"]:["Unclear demand or positioning","Cash-flow pressure","Operational quality and delivery risks","Customer acquisition and retention"],
  gaps:["Confirm local legal, tax, licensing and insurance requirements","Set an initial budget, pricing and cash-flow forecast","Confirm staffing levels, suppliers and operating location","Choose software providers and document access permissions"]
 };
}

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
