const required=["SUPABASE_URL","SUPABASE_ANON_KEY","JD_E2E_TENANT_A_EMAIL","JD_E2E_TENANT_A_PASSWORD","JD_E2E_TENANT_B_EMAIL","JD_E2E_TENANT_B_PASSWORD","JD_E2E_CROSS_TENANT_CUSTOMER_ID"];
for(const key of required)if(!process.env[key])throw new Error("Missing required staging secret: "+key);
const base=process.env.SUPABASE_URL.replace(/\\/$/,""),anon=process.env.SUPABASE_ANON_KEY;
async function signIn(email,password){
 const r=await fetch(base+"/auth/v1/token?grant_type=password",{method:"POST",headers:{"apikey":anon,"Content-Type":"application/json"},body:JSON.stringify({email,password})});
 if(!r.ok)throw new Error("Staging authentication failed ("+r.status+")");
 const d=await r.json();if(!d.access_token)throw new Error("Staging authentication returned no access token");return d.access_token;
}
async function invoke(token,body){
 const r=await fetch(base+"/functions/v1/jd-business-platform",{method:"POST",headers:{"apikey":anon,"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(body)});
 const text=await r.text();let d;try{d=JSON.parse(text);}catch{d={raw:text};}
 return {status:r.status,data:d};
}
const a=await signIn(process.env.JD_E2E_TENANT_A_EMAIL,process.env.JD_E2E_TENANT_A_PASSWORD);
const b=await signIn(process.env.JD_E2E_TENANT_B_EMAIL,process.env.JD_E2E_TENANT_B_PASSWORD);
const actions=["overview","cashflow.analytics","performance.predict","sla.policy.list","integration.catalog"];
for(const action of actions){const r=await invoke(a,{action});if(r.status!==200)throw new Error("Tenant A "+action+" failed: "+r.status+" "+JSON.stringify(r.data));}
const listB=await invoke(b,{action:"list",kind:"customers"});
if(listB.status!==200)throw new Error("Tenant B customer list failed: "+listB.status);
if((listB.data.items||[]).some(x=>x.id===process.env.JD_E2E_CROSS_TENANT_CUSTOMER_ID))throw new Error("Tenant isolation failure: tenant B can read tenant A fixture");
const writeB=await invoke(b,{action:"update",kind:"customers",id:process.env.JD_E2E_CROSS_TENANT_CUSTOMER_ID,changes:{notes:"cross-tenant-staging-test"}});
if(writeB.status!==404)throw new Error("Tenant isolation failure: cross-tenant update returned "+writeB.status);
console.log(JSON.stringify({ok:true,tenantA:"authenticated",tenantB:"authenticated",checked:actions,tenantIsolation:"read and write denied"}));
