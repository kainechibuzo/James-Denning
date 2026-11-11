import {createClient} from "npm:@supabase/supabase-js@2";
const headers={"Content-Type":"application/json","Cache-Control":"no-store"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const probes:Record<string,{url:string;accepted:number[]}>={
 "google-workspace":{url:"https://www.googleapis.com/discovery/v1/apis",accepted:[200]},
 "microsoft-365":{url:"https://graph.microsoft.com/v1.0/$metadata",accepted:[200,401,403]},
 "linkedin":{url:"https://api.linkedin.com/v2",accepted:[200,401,403]},
 "slack":{url:"https://slack.com/api/api.test",accepted:[200]},
 "paystack":{url:"https://api.paystack.co",accepted:[200,401,403,404]}
};
const equalSecret=async(a:string,b:string)=>{const [x,y]=await Promise.all([crypto.subtle.digest("SHA-256",new TextEncoder().encode(a)),crypto.subtle.digest("SHA-256",new TextEncoder().encode(b))]);const aa=new Uint8Array(x),bb=new Uint8Array(y);let diff=0;for(let i=0;i<aa.length;i++)diff|=aa[i]^bb[i];return diff===0;};
Deno.serve(async req=>{
 if(req.method!=="POST")return reply({error:"Method not allowed"},405);
 const expected=Deno.env.get("JD_BUSINESS_MONITOR_WORKER_SECRET")||"",authorization=req.headers.get("Authorization")||"",auth=authorization.toLowerCase().startsWith("bearer ")?authorization.slice(7).trim():"";
 if(expected.length<32||!auth||!await equalSecret(auth,expected))return reply({error:"Unauthorized"},401);
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!key)return reply({error:"Worker is not configured"},503);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:connections,error}=await db.from("jd_business_oauth_connections").select("school_id,provider_id").eq("status","connected").limit(1000);
 if(error)return reply({error:"Could not load connected services"},500);
 const connectionRows=(connections||[]) as any[],pairs=connectionRows.filter((x:any)=>probes[x.provider_id]).slice(0,100);
 const results:any[]=[];
 for(let i=0;i<pairs.length;i+=10){
  const batch=await Promise.all(pairs.slice(i,i+10).map(async(pair:any)=>{
   const probe=probes[pair.provider_id],started=Date.now();let status="unknown",statusCode:number|null=null,errorCode:string|null=null;
   try{const response=await fetch(probe.url,{method:"GET",headers:{"Accept":"application/json"},signal:AbortSignal.timeout(6000),redirect:"error"});statusCode=response.status;status=probe.accepted.includes(response.status)?"healthy":response.status===429||response.status>=500?"degraded":"down";if(status!=="healthy")errorCode="HTTP_"+response.status;}catch(e){status="down";errorCode=e instanceof Error&&e.name==="TimeoutError"?"TIMEOUT":"NETWORK_ERROR";}
   const checkedAt=new Date().toISOString(),latency=Date.now()-started;
   const {error:insertError}=await db.from("jd_business_service_checks").insert({school_id:pair.school_id,provider_id:pair.provider_id,status,latency_ms:latency,status_code:statusCode,error_code:errorCode,checked_at:checkedAt});
   if(insertError)throw insertError;
   const {data:previousData}=await db.from("jd_business_service_states").select("status,status_changed_at").eq("school_id",pair.school_id).eq("provider_id",pair.provider_id).maybeSingle();const previous:any=previousData;
   const changed=previous?.status!==status;
   const {error:stateError}=await db.from("jd_business_service_states").upsert({school_id:pair.school_id,provider_id:pair.provider_id,status,last_error_code:errorCode,last_checked_at:checkedAt,status_changed_at:changed?checkedAt:previous?.status_changed_at||checkedAt},{onConflict:"school_id,provider_id"});
   if(stateError)throw stateError;
   if(changed){
    if(status==="healthy"&&previous&&previous.status!=="healthy"){
     await db.from("jd_business_service_alerts").insert({school_id:pair.school_id,provider_id:pair.provider_id,status:"recovered",error_code:previous.status,resolved_at:checkedAt});
     await db.from("jd_business_service_alerts").update({resolved_at:checkedAt}).eq("school_id",pair.school_id).eq("provider_id",pair.provider_id).is("resolved_at",null);
    }else if(status!=="healthy"){
     await db.from("jd_business_service_alerts").insert({school_id:pair.school_id,provider_id:pair.provider_id,status,error_code:errorCode});
    }
   }
   return {provider_id:pair.provider_id,school_id:pair.school_id,status,latency_ms:latency,status_changed:changed,error_code:errorCode};
  }));
  results.push(...batch);
 }
 return reply({checked:results.length,healthy:results.filter(x=>x.status==="healthy").length,degraded:results.filter(x=>x.status==="degraded").length,down:results.filter(x=>x.status==="down").length,transitions:results.filter(x=>x.status_changed),notice:"Checks are limited to fixed public provider endpoints. They test reachability, not OAuth validity or service-level agreement compliance."});
});
