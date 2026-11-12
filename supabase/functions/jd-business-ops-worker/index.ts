import {createClient} from "npm:@supabase/supabase-js@2";
import {getJdSecret} from "../_shared/jd-secrets.ts";
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const secretMatch=async(a:string,b:string)=>{const [x,y]=await Promise.all([crypto.subtle.digest("SHA-256",new TextEncoder().encode(a)),crypto.subtle.digest("SHA-256",new TextEncoder().encode(b))]);const aa=new Uint8Array(x),bb=new Uint8Array(y);let d=0;for(let i=0;i<aa.length;i++)d|=aa[i]^bb[i];return d===0;};
async function sendEmail(row:any){const key=Deno.env.get("RESEND_API_KEY"),from=Deno.env.get("JD_ALERT_EMAIL_FROM");if(!key||!from)throw new Error("Email delivery is not configured");const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[row.recipient],subject:row.subject,text:row.body}),signal:AbortSignal.timeout(12000),redirect:"error"});if(!response.ok)throw new Error("Email provider rejected notification");return await response.json();}
async function sendSms(row:any){const sid=Deno.env.get("JD_TWILIO_ACCOUNT_SID"),token=Deno.env.get("JD_TWILIO_AUTH_TOKEN"),from=Deno.env.get("JD_TWILIO_FROM_NUMBER");if(!sid||!token||!from)throw new Error("SMS delivery is not configured");const body=new URLSearchParams({To:row.recipient,From:from,Body:row.body});const auth=btoa(`${sid}:${token}`);const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,{method:"POST",headers:{"Authorization":`Basic ${auth}`,"Content-Type":"application/x-www-form-urlencoded"},body,signal:AbortSignal.timeout(12000),redirect:"error"});if(!response.ok)throw new Error("SMS provider rejected notification");return await response.json();}
Deno.serve(async req=>{
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const expected=getJdSecret("JD_BUSINESS_OPS_WORKER_SECRET"),auth=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
 if(expected.length<32||!auth||!await secretMatch(auth,expected))return json({error:"Unauthorized"},401);
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!key)return json({error:"Worker not configured"},503);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),now=new Date();
 const {data:policies,error:policyError}=await db.from("jd_business_sla_policies").select("*").eq("enabled",true).limit(1000);
 if(policyError)return json({error:"Could not load SLA policies"},500);
 let created=0;
 for(const policy of policies||[]){
  const {data:cases,error}=await db.from("jd_business_support_cases").select("id,school_id,title,priority,status,created_at,sla_due_at,first_response_at,assigned_to").eq("school_id",policy.school_id).eq("priority",policy.priority).not("status","in",'("resolved","closed")').limit(500);
  if(error)continue;
  for(const c of cases||[]){
   const createdAt=new Date(c.created_at).getTime(),events:any[]=[];
   if(!c.first_response_at&&createdAt+policy.first_response_minutes*60000<=now.getTime())events.push({type:"first_response_due",due:new Date(createdAt+policy.first_response_minutes*60000)});
   const resolutionDue=c.sla_due_at?new Date(c.sla_due_at).getTime():createdAt+policy.resolution_minutes*60000;if(resolutionDue<=now.getTime())events.push({type:"resolution_due",due:new Date(resolutionDue)});
   if(createdAt+policy.escalation_after_minutes*60000<=now.getTime())events.push({type:"escalation",due:new Date(createdAt+policy.escalation_after_minutes*60000)});
   for(const event of events){
    const {data:inserted,error:insertError}=await db.from("jd_business_sla_events").upsert({school_id:c.school_id,case_id:c.id,event_type:event.type,due_at:event.due.toISOString()},{onConflict:"case_id,event_type",ignoreDuplicates:true}).select("id");
    if(insertError)continue;
    const eventKey=`sla:${c.id}:${event.type}`,subject=`JD support SLA: ${event.type.replaceAll("_"," ")}`;
    const body=`Support case "${c.title}" (${c.priority}) has reached its ${event.type.replaceAll("_"," ")} threshold. Case ID: ${c.id}. Please review the case in James Denning.`;
    for(const [channel,recipient] of [["email",policy.notify_email],["sms",policy.notify_phone]] as const){
     if(!recipient)continue;
     const {error:queueError}=await db.from("jd_business_notification_outbox").upsert({school_id:c.school_id,event_key:eventKey,channel,recipient,subject,body,payload:{case_id:c.id,event_type:event.type,priority:c.priority}},{onConflict:"school_id,event_key,channel,recipient",ignoreDuplicates:true});
     if(!queueError)created++;
    }
   }
  }
 }
 const emailReady=!!Deno.env.get("RESEND_API_KEY")&&!!Deno.env.get("JD_ALERT_EMAIL_FROM");
 const smsReady=!!Deno.env.get("JD_TWILIO_ACCOUNT_SID")&&!!Deno.env.get("JD_TWILIO_AUTH_TOKEN")&&!!Deno.env.get("JD_TWILIO_FROM_NUMBER");
 const {data:queued,error:queueError}=await db.rpc("jd_claim_business_notification_batch",{p_limit:50});
 if(queueError)return json({error:"Could not claim notification batch"},500);
 let sent=0,failed=0,waiting=0;
 for(const row of queued||[]){
  if((row.channel==="email"&&!emailReady)||(row.channel==="sms"&&!smsReady)){waiting++;await db.from("jd_business_notification_outbox").update({status:"queued",locked_at:null,attempts:Math.max(0,Number(row.attempts||1)-1),next_attempt_at:new Date(Date.now()+15*60000).toISOString()}).eq("id",row.id);continue;}
  try{
   const providerResult=row.channel==="email"?await sendEmail(row):await sendSms(row);
   const {error}=await db.from("jd_business_notification_outbox").update({status:"sent",locked_at:null,sent_at:new Date().toISOString(),last_error:null,payload:{...row.payload,provider_id:providerResult?.id||providerResult?.sid||null}}).eq("id",row.id);
   if(error)throw error;sent++;
  }catch(e){
   failed++;const attempts=Number(row.attempts||1),delay=Math.min(360,Math.pow(2,Math.min(attempts,8)));
   await db.from("jd_business_notification_outbox").update({status:"failed",locked_at:null,last_error:e instanceof Error?e.message:"Delivery failed",next_attempt_at:new Date(Date.now()+delay*60000).toISOString()}).eq("id",row.id);
  }
 }
 return json({policies:policies?.length||0,notifications_queued:created,sent,failed,waiting_for_provider_configuration:waiting,delivery:{email_configured:emailReady,sms_configured:smsReady}});
});
