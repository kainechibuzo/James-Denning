import {base64Url,decryptSecret,encryptSecret,importAesKey,sha256Hex} from "../_shared/jd-oauth-crypto.ts";
import {createClient} from "npm:@supabase/supabase-js@2";
import {evaluateTrailingMean} from "../_shared/jd-business-forecast.ts";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
const send=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:cors});
const uuid=(v:unknown):v is string=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const str=(v:unknown,n=500)=>typeof v==="string"?v.trim().slice(0,n):"";
const num=(v:unknown,min=0,max=1e12)=>{const n=Number(v);return Number.isFinite(n)&&n>=min&&n<=max?n:null;};
const date=(v:unknown)=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;
const monthKey=(v:unknown)=>{if(typeof v!=="string")return null;const m=v.slice(0,7);return /^\d{4}-\d{2}$/.test(m)?m:null;};
const tables:Record<string,string>={customers:"jd_business_customers",opportunities:"jd_business_opportunities",expenses:"jd_business_expenses",contracts:"jd_business_contracts",documents:"jd_business_documents",support:"jd_business_support_cases",reports:"jd_business_reports",cashflow:"jd_business_cash_transactions",budgets:"jd_business_budgets"};
const columns:Record<string,string>={customers:"id,name,customer_type,email,phone,company,status,consent_status,consent_updated_at,consent_updated_by,consent_source,owner_id,created_at,updated_at",opportunities:"id,customer_id,title,stage,amount,currency,probability,expected_close_date,next_action,owner_id,created_at,updated_at",expenses:"id,category,description,amount,currency,incurred_on,status,vendor,reference,created_at,updated_at",contracts:"id,customer_id,title,contract_type,status,value,currency,starts_on,expires_on,renewal_notice_days,created_at,updated_at",documents:"id,title,mime_type,byte_size,extraction_status,summary,extracted_text,checksum_sha256,source_metadata,created_at,updated_at",support:"id,customer_id,title,description,status,priority,assigned_to,sla_due_at,first_response_at,resolved_at,resolution_note,created_at,updated_at",reports:"id,title,report_type,period_start,period_end,status,report_json,source_metadata,created_at,updated_at",cashflow:"id,direction,amount,currency,occurred_on,status,category,description,reference,customer_id,created_at,updated_at",budgets:"id,category,currency,period_start,period_end,budget_amount,alert_threshold_pct,status,created_at,updated_at"};
const stages=["lead","qualified","proposal","negotiation","won","lost"];
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return send({error:"Method not allowed"},405);
 const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");if(!token)return send({error:"Authentication required"},401);
 const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!anon||!key)return send({error:"Service not configured"},503);
 const auth=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:user,error:authErr}=await auth.auth.getUser(token);if(authErr||!user.user)return send({error:"Invalid session"},401);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:p,error:pe}=await db.from("profiles").select("id,school_id,role").eq("id",user.user.id).maybeSingle();
 if(pe||!p?.school_id)return send({error:"Workspace required"},403);if(!["admin","manager"].includes(p.role))return send({error:"Manager permission required"},403);
 let b:any;try{b=await req.json();}catch{return send({error:"Invalid JSON"},400);}const school=p.school_id,actor=user.user.id;
 const audit=async(type:string,meta:any)=>{await db.rpc("jd_business_audit",{p_school_id:school,p_actor_id:actor,p_event_type:type,p_event:meta});};
 const list=async(k:string)=>{if(!tables[k])throw new Error("Unsupported type");const {data,error}=await db.from(tables[k]).select(columns[k]).eq("school_id",school).order("created_at",{ascending:false}).limit(200);if(error)throw error;return (data||[]) as any[];};
 try{
  if(b.action==="overview"){
   const [customers,opportunities,expenses,contracts,support,documents,checks]=await Promise.all([list("customers"),list("opportunities"),list("expenses"),list("contracts"),list("support"),list("documents"),db.from("jd_business_service_checks").select("provider_id,status,latency_ms,checked_at").eq("school_id",school).order("checked_at",{ascending:false}).limit(100)]);
   if(checks.error)throw checks.error;const open=opportunities.filter((o:any)=>!["won","lost"].includes(o.stage));
   const sumByCurrency=(rows:any[],field:string)=>{const out:Record<string,number>={};for(const row of rows){const currency=row.currency||"NGN";out[currency]=(out[currency]||0)+Number(row[field]||0);}return out;};
   const won=opportunities.filter((o:any)=>o.stage==="won"),approved=expenses.filter((e:any)=>["approved","paid"].includes(e.status));
   const weightedByCurrency:Record<string,number>={};for(const o of open){const currency=o.currency||"NGN";weightedByCurrency[currency]=(weightedByCurrency[currency]||0)+Number(o.amount)*Number(o.probability)/100;}
   return send({counts:{customers:customers.length,opportunities:opportunities.length,won_opportunities:won.length,expenses:expenses.length,contracts:contracts.length,active_contracts:contracts.filter((c:any)=>c.status==="active").length,support:support.length,documents:documents.length},revenue_won_by_currency:sumByCurrency(won,"amount"),pipeline_by_currency:sumByCurrency(open,"amount"),weighted_pipeline_by_currency:weightedByCurrency,approved_expenses_by_currency:sumByCurrency(approved,"amount"),currency_note:"Every total is grouped by currency. Won opportunity value is not cash received; legacy school fee data is not presumed company revenue.",recent_opportunities:opportunities.slice(0,8),recent_support:support.slice(0,8),renewals:contracts.filter((c:any)=>c.status==="active"&&c.expires_on&&new Date(c.expires_on).getTime()<=Date.now()+Number(c.renewal_notice_days)*86400000),service_checks:checks.data||[]});
  }
  if(b.action==="list")return send({items:await list(str(b.kind,30))});
  if(b.action==="create"){
   const k=str(b.kind,30),x=b.record||{};if(!tables[k]||k==="documents")return send({error:"Unsupported create"},400);let row:any={school_id:school,created_by:actor};
   if(k==="customers"){row={...row,name:str(x.name,180),customer_type:["person","organisation"].includes(x.customer_type)?x.customer_type:"organisation",email:str(x.email,254)||null,phone:str(x.phone,40)||null,company:str(x.company,180)||null,status:"active",consent_status:["unknown","granted","withdrawn"].includes(x.consent_status)?x.consent_status:"unknown",owner_id:uuid(x.owner_id)?x.owner_id:null,notes:str(x.notes,5000)};if(!row.name)return send({error:"Customer name required"},400);}
   else if(k==="opportunities"){const a=num(x.amount);if(!str(x.title,180)||a===null)return send({error:"Title and valid amount required"},400);row={...row,customer_id:uuid(x.customer_id)?x.customer_id:null,title:str(x.title,180),stage:"lead",amount:a,currency:str(x.currency,3).toUpperCase()||"NGN",probability:num(x.probability??10,0,100),expected_close_date:date(x.expected_close_date),next_action:str(x.next_action,500)||null};}
   else if(k==="expenses"){const a=num(x.amount,0.01);if(a===null||!str(x.category,100)||!str(x.description,300)||!date(x.incurred_on))return send({error:"Category, description, amount and date required"},400);row={...row,category:str(x.category,100),description:str(x.description,300),amount:a,currency:str(x.currency,3).toUpperCase()||"NGN",incurred_on:date(x.incurred_on),status:"submitted",vendor:str(x.vendor,180)||null};}
   else if(k==="contracts"){if(!str(x.title,180))return send({error:"Contract title required"},400);row={...row,customer_id:uuid(x.customer_id)?x.customer_id:null,title:str(x.title,180),contract_type:str(x.contract_type,60)||"proposal",status:"draft",value:num(x.value,0),currency:str(x.currency,3).toUpperCase()||"NGN",starts_on:date(x.starts_on),expires_on:date(x.expires_on),renewal_notice_days:num(x.renewal_notice_days??30,0,365)};}
   else if(k==="support"){if(!str(x.title,180))return send({error:"Case title required"},400);row={...row,customer_id:uuid(x.customer_id)?x.customer_id:null,title:str(x.title,180),description:str(x.description,10000),status:"open",priority:["low","normal","high","urgent"].includes(x.priority)?x.priority:"normal",assigned_to:uuid(x.assigned_to)?x.assigned_to:null,sla_due_at:typeof x.sla_due_at==="string"?x.sla_due_at:null};}
   else if(k==="cashflow"){const amount=num(x.amount,0.01);if(!amount||!["inflow","outflow"].includes(x.direction)||!date(x.occurred_on)||!str(x.category,100)||!str(x.description,300))return send({error:"Direction, positive amount, date, category and description required"},400);row={...row,direction:x.direction,amount,currency:str(x.currency,3).toUpperCase()||"NGN",occurred_on:date(x.occurred_on),status:"pending",category:str(x.category,100),description:str(x.description,300),reference:str(x.reference,120)||null,customer_id:uuid(x.customer_id)?x.customer_id:null};}
   else if(k==="budgets"){const amount=num(x.budget_amount,0.01),start=date(x.period_start),end=date(x.period_end);if(!amount||!str(x.category,100)||!start||!end||end<start)return send({error:"Budget category, positive amount and valid period required"},400);row={...row,category:str(x.category,100),currency:str(x.currency,3).toUpperCase()||"NGN",period_start:start,period_end:end,budget_amount:amount,alert_threshold_pct:num(x.alert_threshold_pct??80,1,100),status:"active"};}
   else if(k==="reports"){const s=date(x.period_start),e=date(x.period_end);if(!str(x.title,180)||!s||!e||e<s)return send({error:"Report title and valid dates required"},400);row={...row,title:str(x.title,180),report_type:str(x.report_type,60)||"executive",period_start:s,period_end:e,status:"draft",report_json:x.report_json||{},source_metadata:x.source_metadata||{}};}
   if(row.customer_id){const {data:c}=await db.from("jd_business_customers").select("id").eq("id",row.customer_id).eq("school_id",school).maybeSingle();if(!c)return send({error:"Customer outside workspace"},400);}
   const {data:inserted,error}=await db.from(tables[k]).insert(row).select(columns[k]).single();if(error||!inserted)return send({error:"Could not create record",detail:error?.message||"No record returned"},400);const data:any=inserted;
   if(k==="contracts"&&str(x.body,50000)){const body=str(x.body,50000),hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(body)))).map(v=>v.toString(16).padStart(2,"0")).join("");const {error:ve}=await db.from("jd_business_contract_versions").insert({school_id:school,contract_id:data.id,version_no:1,title:data.title,body,content_hash:hash,created_by:actor});if(ve)return send({error:"Contract created but version save failed",record:data},500);}
   await audit(`business.${k}.created`,{record_id:data.id});return send({item:data},201);
  }
  if(b.action==="update"){
   const k=str(b.kind,30),id=uuid(b.id)?b.id:null,x=b.changes||{};if(!tables[k]||!id||k==="documents")return send({error:"Unsupported update"},400);let patch:any={updated_at:new Date().toISOString()};
   if(k==="customers"){for(const f of ["name","email","phone","company","notes"])if(f in x)patch[f]=str(x[f],f==="notes"?5000:254);if("consent_status" in x){if(!["unknown","granted","withdrawn"].includes(x.consent_status))return send({error:"Invalid consent"},400);const source=str(x.consent_source,500);if(x.consent_status!=="unknown"&&!source)return send({error:"Record the consent source or evidence before changing consent status"},400);patch.consent_status=x.consent_status;patch.consent_updated_at=new Date().toISOString();patch.consent_updated_by=actor;patch.consent_source=source;}}
   else if(k==="opportunities"){if("title" in x)patch.title=str(x.title,180);if("amount" in x){const a=num(x.amount);if(a===null)return send({error:"Invalid amount"},400);patch.amount=a;}if("probability" in x){const a=num(x.probability,0,100);if(a===null)return send({error:"Invalid probability"},400);patch.probability=a;}if("stage" in x){if(!stages.includes(x.stage))return send({error:"Invalid sales stage"},400);patch.stage=x.stage;}if("expected_close_date" in x)patch.expected_close_date=date(x.expected_close_date);if("next_action" in x)patch.next_action=str(x.next_action,500);}
   else if(k==="cashflow"){if(!["cleared","void"].includes(x.status))return send({error:"Cash transactions may only be cleared or voided"},400);patch.status=x.status;}
   else if(k==="expenses"){if(p.role!=="admin")return send({error:"Admin required for expense decisions"},403);if(!["approved","rejected"].includes(x.status))return send({error:"Only approve/reject decisions supported"},400);patch.status=x.status;patch.approved_by=actor;patch.approved_at=new Date().toISOString();}
   else if(k==="contracts"){if(!["draft","in_review","approved","active","expired","terminated"].includes(x.status))return send({error:"Invalid contract state"},400);if(["approved","active","terminated"].includes(x.status)&&p.role!=="admin")return send({error:"Admin approval required"},403);patch.status=x.status;}
   else if(k==="support"){if("status" in x){if(!["open","in_progress","waiting","resolved","closed"].includes(x.status))return send({error:"Invalid case status"},400);patch.status=x.status;if(x.status==="resolved")patch.resolved_at=new Date().toISOString();if(x.status==="in_progress")patch.first_response_at=new Date().toISOString();}if("priority" in x){if(!["low","normal","high","urgent"].includes(x.priority))return send({error:"Invalid priority"},400);patch.priority=x.priority;}if("resolution_note" in x)patch.resolution_note=str(x.resolution_note,5000);if("assigned_to" in x)patch.assigned_to=uuid(x.assigned_to)?x.assigned_to:null;}
   else if(k==="budgets"){if(!["active","archived"].includes(x.status))return send({error:"Invalid budget state"},400);patch.status=x.status;if("budget_amount" in x){const amount=num(x.budget_amount,0.01);if(!amount)return send({error:"Invalid budget amount"},400);patch.budget_amount=amount;}if("alert_threshold_pct" in x){const threshold=num(x.alert_threshold_pct,1,100);if(!threshold)return send({error:"Invalid alert threshold"},400);patch.alert_threshold_pct=threshold;}}
   else if(k==="reports"){if(!["in_review","approved","shared"].includes(x.status))return send({error:"Invalid report state"},400);if(x.status==="shared"&&p.role!=="admin")return send({error:"Admin required"},403);patch.status=x.status;}
   const {data:updated,error}=await db.from(tables[k]).update(patch).eq("id",id).eq("school_id",school).select(columns[k]).maybeSingle();if(error||!updated)return send({error:"Record not found or update rejected"},404);const data:any=updated;await audit(`business.${k}.updated`,{record_id:id,fields:Object.keys(patch)});return send({item:data});
  }

  if(b.action==="sla.policy.list"){
   const {data,error}=await db.from("jd_business_sla_policies").select("id,priority,first_response_minutes,resolution_minutes,escalation_after_minutes,notify_email,notify_phone,enabled,updated_at").eq("school_id",school).order("priority");
   if(error)throw error;return send({policies:data||[]});
  }
  if(b.action==="sla.policy.save"){
   if(p.role!=="admin")return send({error:"Only workspace administrators can change SLA policies"},403);
   const priority=str(b.priority,20),first=num(b.first_response_minutes,1,43200),resolution=num(b.resolution_minutes,1,129600),escalation=num(b.escalation_after_minutes,1,129600);
   if(!["low","normal","high","urgent"].includes(priority)||first===null||resolution===null||escalation===null||escalation<first)return send({error:"Valid priority and SLA minute thresholds are required"},400);
   const email=str(b.notify_email,254),phone=str(b.notify_phone,30);
   if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return send({error:"Notification email is invalid"},400);
   if(phone&&!/^\+[1-9]\d{7,14}$/.test(phone))return send({error:"SMS destination must be E.164 format"},400);
   const {data,error}=await db.from("jd_business_sla_policies").upsert({school_id:school,priority,first_response_minutes:first,resolution_minutes:resolution,escalation_after_minutes:escalation,notify_email:email||null,notify_phone:phone||null,enabled:b.enabled!==false,created_by:actor,updated_at:new Date().toISOString()},{onConflict:"school_id,priority"}).select("id,priority,first_response_minutes,resolution_minutes,escalation_after_minutes,notify_email,notify_phone,enabled").single();
   if(error)throw error;await audit("business.sla.policy_updated",{priority});return send({policy:data});
  }
  if(b.action==="revenue.analytics"){
   const start=date(b.period_start)||new Date(Date.now()-365*86400000).toISOString().slice(0,10),end=date(b.period_end)||new Date().toISOString().slice(0,10);
   const {data,error}=await db.from("jd_business_cash_transactions").select("customer_id,direction,amount,currency,occurred_on,status,category").eq("school_id",school).eq("direction","inflow").gte("occurred_on",start).lte("occurred_on",end).order("occurred_on");if(error)throw error;
   const rows=(data||[]) as any[],byCurrency:Record<string,any>={},customers:Record<string,any>={};
   for(const r of rows){const c=r.currency||"NGN";byCurrency[c]??={cleared_cash_received:0,pending_inflows:0,monthly:{},categories:{},transaction_count:0};byCurrency[c].transaction_count++;if(r.status==="cleared"){byCurrency[c].cleared_cash_received+=Number(r.amount);byCurrency[c].monthly[r.occurred_on.slice(0,7)]=(byCurrency[c].monthly[r.occurred_on.slice(0,7)]||0)+Number(r.amount);byCurrency[c].categories[r.category]=(byCurrency[c].categories[r.category]||0)+Number(r.amount);if(r.customer_id){customers[r.customer_id]??={customer_id:r.customer_id,currency:c,amount:0};customers[r.customer_id].amount+=Number(r.amount);}}else if(r.status==="pending")byCurrency[c].pending_inflows+=Number(r.amount);}
   const topCustomers=Object.values(customers).sort((a:any,b:any)=>b.amount-a.amount).slice(0,10);
   return send({period:{start,end},by_currency:byCurrency,top_customers:topCustomers,caveat:"Revenue intelligence uses only manually recorded cleared cash-in transactions. Pending inflows are not counted as received revenue; opportunity wins are not cash receipts."});
  }
  if(b.action==="budget.analytics"){
   const [budgets,expenses]=await Promise.all([list("budgets"),list("expenses")]);const now=new Date().toISOString().slice(0,10);
   const usage=budgets.filter((x:any)=>x.status==="active").map((budget:any)=>{const spend=expenses.filter((e:any)=>e.currency===budget.currency&&e.category===budget.category&&["approved","paid"].includes(e.status)&&e.incurred_on>=budget.period_start&&e.incurred_on<=budget.period_end).reduce((n:number,e:any)=>n+Number(e.amount),0);const pct=spend/Number(budget.budget_amount)*100;return {...budget,approved_spend:spend,remaining:Number(budget.budget_amount)-spend,utilisation_pct:pct,alert:pct>=100?"over_budget":pct>=Number(budget.alert_threshold_pct)?"threshold_reached":"normal",period_active:budget.period_start<=now&&budget.period_end>=now};});
   return send({budgets:usage,alerts:usage.filter((x:any)=>x.utilisation_pct>=Number(x.alert_threshold_pct)),caveat:"Only approved/paid expense records are counted. Variance is scoped to the exact category, currency and budget period."});
  }
  if(b.action==="pipeline.analytics"){const rows=await list("opportunities"),byCurrency:Record<string,any>={};for(const r of rows){const currency=r.currency||"NGN";byCurrency[currency]??={total:0,stages:{}};byCurrency[currency].total++;byCurrency[currency].stages[r.stage]??={count:0,amount:0,weighted:0};byCurrency[currency].stages[r.stage].count++;byCurrency[currency].stages[r.stage].amount+=Number(r.amount);byCurrency[currency].stages[r.stage].weighted+=Number(r.amount)*Number(r.probability)/100;}return send({by_currency:byCurrency,total:rows.length,caveat:"Pipeline values and weighted values are grouped by currency; do not add across currencies."});}
  if(b.action==="expense.analytics"){const {data:expenseRows,error}=await db.from("jd_business_expenses").select("category,amount,currency,status").eq("school_id",school).limit(200);if(error)throw error;const rows=(expenseRows||[]) as Array<{category:string;amount:number;currency:string;status:string}>;const approved=rows.filter(e=>["approved","paid"].includes(e.status)),byCategory:Record<string,number>={};for(const e of approved)byCategory[e.category]=(byCategory[e.category]||0)+Number(e.amount);const byCurrency:Record<string,number>={};for(const e of approved)byCurrency[e.currency]=(byCurrency[e.currency]||0)+Number(e.amount);return send({approved_total:approved.length===0?0:Object.keys(byCurrency).length===1?Object.values(byCurrency)[0]:null,byCurrency,byCategory,source_count:approved.length,caveat:"Approved and paid records only. Totals are split by currency; no mixed-currency sum is produced."});}
  if(b.action==="monitor.run"){
   if(!["admin","manager"].includes(p.role))return send({error:"Manager permission required to run external service checks"},403);
   const probes:Record<string,{url:string;accepted:number[]}>={
    "google-workspace":{url:"https://accounts.google.com/.well-known/openid-configuration",accepted:[200]},
    "microsoft-365":{url:"https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration",accepted:[200]},
    "linkedin":{url:"https://www.linkedin.com/oauth/.well-known/openid-configuration",accepted:[200]},
    "slack":{url:"https://slack.com/api/api.test",accepted:[200]},
    "paystack":{url:"https://api.paystack.co/bank",accepted:[200,401,403]}
   };
   const results:any[]=[];
   for(const [provider,probe] of Object.entries(probes)){
    const started=Date.now();let status="unknown",statusCode:number|null=null,errorCode:string|null=null;
    try{const response=await fetch(probe.url,{method:"GET",headers:{"Accept":"application/json"},signal:AbortSignal.timeout(6000),redirect:"error"});statusCode=response.status;status=probe.accepted.includes(response.status)?"healthy":response.status>=500?"down":"degraded";if(status!=="healthy")errorCode="unexpected_http_status";await response.body?.cancel();}
    catch(e){status="down";errorCode=e instanceof Error?(e.name==="TimeoutError"?"timeout":"connection_failed"):"connection_failed";}
    const result={provider_id:provider,status,latency_ms:Date.now()-started,status_code:statusCode,error_code:errorCode,checked_at:new Date().toISOString()};results.push(result);
    const {error}=await db.from("jd_business_service_checks").insert({school_id:school,...result});if(error)throw error;
   }
   await audit("business.monitor.completed",{providers:results.length,down:results.filter(x=>x.status==="down").length});
   return send({checks:results,notice:"Checks verify public endpoint reachability only; they do not prove that your OAuth credentials or business integration are connected."});
  }
  if(b.action==="oauth.start"){
   const providerId=str(b.providerId,60),providerConfig:Record<string,{authUrl:string;clientIdEnv:string}>={
    "google-workspace":{authUrl:"https://accounts.google.com/o/oauth2/v2/auth",clientIdEnv:"JD_OAUTH_GOOGLE_CLIENT_ID"},
    "microsoft-365":{authUrl:"https://login.microsoftonline.com/common/oauth2/v2.0/authorize",clientIdEnv:"JD_OAUTH_MICROSOFT_CLIENT_ID"},
    "linkedin":{authUrl:"https://www.linkedin.com/oauth/v2/authorization",clientIdEnv:"JD_OAUTH_LINKEDIN_CLIENT_ID"},
    "slack":{authUrl:"https://slack.com/oauth/v2/authorize",clientIdEnv:"JD_OAUTH_SLACK_CLIENT_ID"}
   };
   const config=providerConfig[providerId];if(!config)return send({error:"This provider requires a separate API-key or provider-specific connection flow"},400);
   const clientId=Deno.env.get(config.clientIdEnv),callback=Deno.env.get("JD_OAUTH_CALLBACK_URL"),encodedKey=Deno.env.get("JD_OAUTH_ENCRYPTION_KEY");
   if(!clientId||!callback||!encodedKey)return send({error:"OAuth provider credentials, callback URL or encryption key are not configured"},503);
   const callbackUrl=new URL(callback);if(callbackUrl.protocol!=="https:"&&callbackUrl.hostname!=="localhost")return send({error:"OAuth callback URL must use HTTPS"},503);
   const {data:catalog,error:catalogError}=await db.from("jd_business_integration_catalog").select("required_scopes").eq("id",providerId).eq("enabled",true).maybeSingle();if(catalogError||!catalog)return send({error:"Integration is unavailable"},404);
   const state=base64Url(crypto.getRandomValues(new Uint8Array(32))),verifier=base64Url(crypto.getRandomValues(new Uint8Array(32))),challenge=base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier))));
   const key=await importAesKey(encodedKey),encryptedVerifier=await encryptSecret(verifier,key),stateHash=await sha256Hex(state),expiresAt=new Date(Date.now()+10*60*1000).toISOString();
   const {error:stateError}=await db.from("jd_business_oauth_states").insert({school_id:school,provider_id:providerId,actor_id:actor,state_hash:stateHash,pkce_verifier_encrypted:encryptedVerifier,redirect_uri:callback,expires_at:expiresAt});if(stateError)throw stateError;
   const authUrl=new URL(config.authUrl);authUrl.searchParams.set("client_id",clientId);authUrl.searchParams.set("redirect_uri",callback);authUrl.searchParams.set("response_type","code");authUrl.searchParams.set("scope",(catalog.required_scopes||[]).join(" "));authUrl.searchParams.set("state",state);authUrl.searchParams.set("code_challenge",challenge);authUrl.searchParams.set("code_challenge_method","S256");
   if(providerId==="google-workspace"){authUrl.searchParams.set("access_type","offline");authUrl.searchParams.set("prompt","consent");}if(providerId==="slack"){authUrl.searchParams.set("scope",(catalog.required_scopes||[]).join(","));}
   await audit("business.oauth.started",{provider_id:providerId,expires_at:expiresAt});return send({authorization_url:authUrl.toString(),expires_at:expiresAt});
  }
  if(b.action==="oauth.refresh"){
   const providerId=str(b.providerId,60),config:Record<string,{tokenUrl:string;clientIdEnv:string;clientSecretEnv:string}>={
    "google-workspace":{tokenUrl:"https://oauth2.googleapis.com/token",clientIdEnv:"JD_OAUTH_GOOGLE_CLIENT_ID",clientSecretEnv:"JD_OAUTH_GOOGLE_CLIENT_SECRET"},
    "microsoft-365":{tokenUrl:"https://login.microsoftonline.com/common/oauth2/v2.0/token",clientIdEnv:"JD_OAUTH_MICROSOFT_CLIENT_ID",clientSecretEnv:"JD_OAUTH_MICROSOFT_CLIENT_SECRET"},
    "linkedin":{tokenUrl:"https://www.linkedin.com/oauth/v2/accessToken",clientIdEnv:"JD_OAUTH_LINKEDIN_CLIENT_ID",clientSecretEnv:"JD_OAUTH_LINKEDIN_CLIENT_SECRET"},
    "slack":{tokenUrl:"https://slack.com/api/oauth.v2.access",clientIdEnv:"JD_OAUTH_SLACK_CLIENT_ID",clientSecretEnv:"JD_OAUTH_SLACK_CLIENT_SECRET"}
   };
   const provider=config[providerId];if(!provider)return send({error:"Refresh is not supported for this provider"},400);
   const {data:connectionData,error:connectionError}=await db.from("jd_business_oauth_connections").select("encrypted_credentials,scopes").eq("school_id",school).eq("provider_id",providerId).eq("status","connected").maybeSingle();const connection:any=connectionData;
   if(connectionError||!connection?.encrypted_credentials)return send({error:"No active encrypted connection was found"},404);
   const encoded=Deno.env.get("JD_OAUTH_ENCRYPTION_KEY"),clientId=Deno.env.get(provider.clientIdEnv),clientSecret=Deno.env.get(provider.clientSecretEnv);if(!encoded||!clientId||!clientSecret)return send({error:"OAuth encryption key or provider credentials are not configured"},503);
   const key=await importAesKey(encoded),stored:any=JSON.parse(await decryptSecret(connection.encrypted_credentials,key));if(!stored.refresh_token)return send({error:"Provider did not issue a refresh token; reconnect with offline access"},409);
   const form=new URLSearchParams({grant_type:"refresh_token",refresh_token:stored.refresh_token,client_id:clientId,client_secret:clientSecret});
   const response=await fetch(provider.tokenUrl,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},body:form,signal:AbortSignal.timeout(10000),redirect:"error"});const token:any=await response.json().catch(()=>null);
   if(!response.ok||!token?.access_token)return send({error:"Provider token refresh failed; reconnect this integration"},502);
   const next={access_token:token.access_token,refresh_token:token.refresh_token||stored.refresh_token,token_type:token.token_type||stored.token_type||"Bearer",scope:connection.scopes,issued_at:new Date().toISOString()};
   const encrypted=await encryptSecret(JSON.stringify(next),key),expires=Number(token.expires_in),expiresAt=Number.isFinite(expires)&&expires>0?new Date(Date.now()+expires*1000).toISOString():null;
   const {error:saveError}=await db.from("jd_business_oauth_connections").update({encrypted_credentials:encrypted,token_expires_at:expiresAt,last_checked_at:new Date().toISOString(),last_error_code:null,key_version:"aes-gcm-v1",updated_at:new Date().toISOString()}).eq("school_id",school).eq("provider_id",providerId);if(saveError)throw saveError;
   await audit("business.oauth.refreshed",{provider_id:providerId});return send({provider_id:providerId,status:"connected",token_expires_at:expiresAt});
  }

  if(b.action==="oauth.verify"){
   const providerId=str(b.providerId,60),encoded=Deno.env.get("JD_OAUTH_ENCRYPTION_KEY");
   if(!encoded)return send({error:"OAuth encryption key is not configured"},503);
   const {data:connection,error}=await db.from("jd_business_oauth_connections").select("encrypted_credentials,scopes").eq("school_id",school).eq("provider_id",providerId).eq("status","connected").maybeSingle();
   if(error||!connection?.encrypted_credentials)return send({error:"No active connection found"},404);
   const stored:any=JSON.parse(await decryptSecret(connection.encrypted_credentials,await importAesKey(encoded)));
   const endpoints:Record<string,string>={"google-workspace":"https://openidconnect.googleapis.com/v1/userinfo","microsoft-365":"https://graph.microsoft.com/oidc/userinfo","linkedin":"https://api.linkedin.com/v2/userinfo","slack":"https://slack.com/api/auth.test"};
   const endpoint=endpoints[providerId];if(!endpoint)return send({error:"Live verification is not supported for this provider"},400);
   const response=await fetch(endpoint,{headers:{Authorization:`Bearer ${stored.access_token}`,Accept:"application/json"},signal:AbortSignal.timeout(10000),redirect:"error"});
   const payload:any=await response.json().catch(()=>null);
   if(!response.ok||(providerId==="slack"&&payload?.ok!==true)){await db.from("jd_business_oauth_connections").update({last_error_code:"provider_verification_failed",last_checked_at:new Date().toISOString()}).eq("school_id",school).eq("provider_id",providerId);return send({verified:false,provider_id:providerId,error:"Provider rejected the stored access token. Reconnect the integration."},502);}
   await db.from("jd_business_oauth_connections").update({last_checked_at:new Date().toISOString(),last_error_code:null}).eq("school_id",school).eq("provider_id",providerId);
   await audit("business.oauth.verified",{provider_id:providerId});
   const identity=providerId==="slack"?{team:payload.team,name:payload.user}:providerId==="microsoft-365"?{name:payload.name,account:payload.email||payload.preferred_username}:{name:payload.name,email:payload.email,sub:payload.sub};
   return send({verified:true,provider_id:providerId,identity});
  }
  if(b.action==="integration.save_paystack_key"){
   const apiKey=str(b.apiKey,200);if(!/^(sk_test_|sk_live_|rk_test_|rk_live_)[A-Za-z0-9_]+$/.test(apiKey))return send({error:"A valid Paystack test, live or restricted secret key is required"},400);
   const response=await fetch("https://api.paystack.co/balance",{headers:{Authorization:`Bearer ${apiKey}`,Accept:"application/json"},signal:AbortSignal.timeout(10000),redirect:"error"});
   const verification:any=await response.json().catch(()=>null);if(!response.ok||verification?.status!==true)return send({error:"Paystack rejected this API key"},401);
   const encoded=Deno.env.get("JD_OAUTH_ENCRYPTION_KEY");if(!encoded)return send({error:"Server encryption key is not configured"},503);
   const encrypted=await encryptSecret(JSON.stringify({secret_key:apiKey,issued_at:new Date().toISOString()}),await importAesKey(encoded));
   const {error}=await db.from("jd_business_oauth_connections").upsert({school_id:school,provider_id:"paystack",status:"connected",scopes:["transaction:read"],connected_by:actor,connected_at:new Date().toISOString(),encrypted_credentials:encrypted,key_version:"aes-gcm-v1",last_checked_at:new Date().toISOString(),last_error_code:null,updated_at:new Date().toISOString()},{onConflict:"school_id,provider_id"});
   if(error)throw error;await audit("business.paystack.connected",{mode:apiKey.startsWith("sk_test_")||apiKey.startsWith("rk_test_")?"test":"live"});return send({provider_id:"paystack",status:"connected",mode:apiKey.startsWith("sk_test_")||apiKey.startsWith("rk_test_")?"test":"live",verified:true});
  }
  if(b.action==="integration.disconnect_paystack"){
   const {data,error}=await db.from("jd_business_oauth_connections").update({status:"revoked",encrypted_credentials:null,key_version:null,last_error_code:"locally_disconnected",updated_at:new Date().toISOString()}).eq("school_id",school).eq("provider_id","paystack").select("provider_id").maybeSingle();
   if(error||!data)return send({error:"Paystack connection not found"},404);
   await audit("business.paystack.disconnected",{mode:"local_credential_erasure"});
   return send({provider_id:"paystack",status:"revoked",notice:"The encrypted Paystack key was erased from JD. Rotate/revoke the key in Paystack if it may have been exposed."});
  }
  if(b.action==="paystack.transactions.sync"){
   const encoded=Deno.env.get("JD_OAUTH_ENCRYPTION_KEY");if(!encoded)return send({error:"Server encryption key is not configured"},503);
   const {data:connection,error}=await db.from("jd_business_oauth_connections").select("encrypted_credentials").eq("school_id",school).eq("provider_id","paystack").eq("status","connected").maybeSingle();
   if(error||!connection?.encrypted_credentials)return send({error:"Paystack is not connected"},404);
   const stored:any=JSON.parse(await decryptSecret(connection.encrypted_credentials,await importAesKey(encoded))),from=date(b.from),to=date(b.to);
   const query=new URLSearchParams({perPage:"100",page:"1",status:"success"});if(from)query.set("from",from+"T00:00:00.000Z");if(to)query.set("to",to+"T23:59:59.999Z");
   const response=await fetch("https://api.paystack.co/transaction?"+query.toString(),{headers:{Authorization:`Bearer ${stored.secret_key}`,Accept:"application/json"},signal:AbortSignal.timeout(15000),redirect:"error"});
   const payload:any=await response.json().catch(()=>null);if(!response.ok||payload?.status!==true)return send({error:"Paystack transaction retrieval failed"},502);
   const transactions=Array.isArray(payload.data)?payload.data:[],currency=String(transactions[0]?.currency||"NGN").toUpperCase();
   const {data:batch,error:batchError}=await db.from("jd_business_cash_statement_imports").insert({school_id:school,file_name:"Paystack API import",currency,row_count:transactions.length,imported_by:actor}).select("id").single();if(batchError)throw batchError;
   const accepted=[];
   for(const tx of transactions){
    if(tx.status!=="success"||!tx.paid_at||!Number.isFinite(Number(tx.amount))||!tx.currency)continue;
    const ccy=String(tx.currency).toUpperCase(),decimals=["JPY","KRW"].includes(ccy)?0:2,amount=Number(tx.amount)/Math.pow(10,decimals),occurred=new Date(tx.paid_at).toISOString().slice(0,10),reference=str(tx.reference,180),description=str(tx.gateway_response||tx.channel||"Paystack transaction",300);
    if(amount<=0)continue;
    const fingerprint=await sha256Hex([occurred,"inflow",amount.toFixed(2),ccy,reference].join("|"));
    const {error}=await db.from("jd_business_cash_statement_rows").insert({school_id:school,import_id:batch.id,occurred_on:occurred,direction:"inflow",amount,currency:ccy,reference,description,row_fingerprint:fingerprint}).select("id").maybeSingle();
    if(!error)accepted.push(reference);
   }
   await audit("business.paystack.transactions_synced",{import_id:batch.id,received:transactions.length,imported:accepted.length});
   return send({import_id:batch.id,received:transactions.length,imported:accepted.length,notice:"Paystack transactions were imported as bank-statement rows. Reconcile them against cashflow records manually; no payment or refund action is exposed."});
  }
  if(b.action==="oauth.disconnect"){
   const providerId=str(b.providerId,60),encoded=Deno.env.get("JD_OAUTH_ENCRYPTION_KEY");
   if(!["google-workspace","microsoft-365","linkedin","slack"].includes(providerId))return send({error:"OAuth disconnect is not supported for this provider"},400);
   if(!encoded)return send({error:"OAuth encryption key is not configured"},503);
   const {data:connection,error}=await db.from("jd_business_oauth_connections").select("encrypted_credentials,scopes").eq("school_id",school).eq("provider_id",providerId).eq("status","connected").maybeSingle();
   if(error||!connection?.encrypted_credentials)return send({error:"Connected integration not found"},404);
   const stored:any=JSON.parse(await decryptSecret(connection.encrypted_credentials,await importAesKey(encoded)));
   let remoteRevoked=false,remoteDetail="";
   if(providerId==="google-workspace"){
    const token=stored.refresh_token||stored.access_token,form=new URLSearchParams({token});
    const response=await fetch("https://oauth2.googleapis.com/revoke",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:form,signal:AbortSignal.timeout(10000),redirect:"error"});
    if(!response.ok)return send({error:"Google rejected remote token revocation; local credentials were retained"},502);remoteRevoked=true;
   }else if(providerId==="slack"){
    const response=await fetch("https://slack.com/api/auth.revoke",{method:"POST",headers:{"Authorization":`Bearer ${stored.access_token}`,"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({test:"false"}),signal:AbortSignal.timeout(10000),redirect:"error"});
    const result:any=await response.json().catch(()=>null);if(!response.ok||result?.ok!==true)return send({error:"Slack rejected remote token revocation; local credentials were retained"},502);remoteRevoked=true;
   }else if(providerId==="microsoft-365"){
    if(!(connection.scopes||[]).includes("User.RevokeSessions.All"))return send({error:"Microsoft remote revocation requires the User.RevokeSessions.All permission. Grant it through the Microsoft admin consent flow first; local credentials were retained."},409);
    const response=await fetch("https://graph.microsoft.com/v1.0/me/revokeSignInSessions",{method:"POST",headers:{Authorization:`Bearer ${stored.access_token}`,"Content-Type":"application/json"},body:"{}",signal:AbortSignal.timeout(10000),redirect:"error"});
    if(!response.ok)return send({error:"Microsoft Graph rejected session revocation; local credentials were retained"},502);remoteRevoked=true;remoteDetail="Microsoft notes revocation may take several minutes to propagate.";
   }else{
    return send({error:"LinkedIn does not expose a verified remote revocation endpoint in this implementation. Revoke the app grant in LinkedIn account settings; local credentials were retained."},409);
   }
   const {error:saveError}=await db.from("jd_business_oauth_connections").update({status:"revoked",encrypted_credentials:null,token_expires_at:null,key_version:null,last_error_code:null,updated_at:new Date().toISOString()}).eq("school_id",school).eq("provider_id",providerId);
   if(saveError)throw saveError;await audit("business.oauth.disconnected",{provider_id:providerId,mode:"provider_revoked_then_local_erased"});
   return send({provider_id:providerId,status:"revoked",provider_revoked:remoteRevoked,notice:remoteDetail||"Provider token revocation succeeded and the encrypted JD credential bundle was erased."});
  }
  if(b.action==="integration.catalog"){const [c,v,h,a]=await Promise.all([db.from("jd_business_integration_catalog").select("id,name,category,description,required_scopes,supported_capabilities").eq("enabled",true),db.from("jd_business_oauth_connections").select("provider_id,status,scopes,token_expires_at,last_checked_at,last_error_code").eq("school_id",school),db.from("jd_business_service_checks").select("provider_id,status,latency_ms,status_code,error_code,checked_at").eq("school_id",school).order("checked_at",{ascending:false}).limit(100),db.from("jd_business_service_alerts").select("id,provider_id,status,error_code,opened_at,resolved_at").eq("school_id",school).order("opened_at",{ascending:false}).limit(30)]);if(c.error||v.error||h.error||a.error)throw c.error||v.error||h.error||a.error;const latestChecks=Object.values((h.data||[]).reduce((a:any,x:any)=>{if(!a[x.provider_id])a[x.provider_id]=x;return a;},{}));return send({integrations:(c.data||[]).map((i:any)=>({...i,connection:v.data?.find((x:any)=>x.provider_id===i.id)||{status:"not_connected"}})),service_checks:latestChecks,service_alerts:a.data||[]});}
  if(b.action==="contract.version.create"){
   const contractId=uuid(b.contractId)?b.contractId:null,body=str(b.body,50000);if(!contractId||!body)return send({error:"Contract ID and version content are required"},400);
   const {data:contract,error:contractError}=await db.from("jd_business_contracts").select("id,title,status").eq("id",contractId).eq("school_id",school).maybeSingle();
   if(contractError||!contract)return send({error:"Contract not found in this workspace"},404);if(!["draft","in_review"].includes(contract.status))return send({error:"Only draft or in-review contracts can receive a new version"},409);
   const {data:latest,error:latestError}=await db.from("jd_business_contract_versions").select("version_no").eq("school_id",school).eq("contract_id",contractId).order("version_no",{ascending:false}).limit(1).maybeSingle();
   if(latestError)throw latestError;const currentVersion=Number((latest as any)?.version_no||0),expected=num(b.expectedVersion,0,100000);
   if(expected===null||expected!==currentVersion)return send({error:"Contract changed since it was loaded. Refresh versions and retry."},409);
   const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(body)),contentHash=Array.from(new Uint8Array(hash)).map(v=>v.toString(16).padStart(2,"0")).join("");
   const {data,error}=await db.from("jd_business_contract_versions").insert({school_id:school,contract_id:contractId,version_no:currentVersion+1,title:contract.title,body,content_hash:contentHash,created_by:actor}).select("id,version_no,title,content_hash,created_at").single();
   if(error)throw error;await db.from("jd_business_contracts").update({updated_at:new Date().toISOString()}).eq("id",contractId).eq("school_id",school);await audit("business.contract.version_created",{contract_id:contractId,version_no:currentVersion+1,content_hash:contentHash});return send({version:data},201);
  }
  if(b.action==="contract.versions"){if(!uuid(b.contractId))return send({error:"Contract ID required"},400);const {data,error}=await db.from("jd_business_contract_versions").select("id,version_no,title,body,content_hash,created_at").eq("school_id",school).eq("contract_id",b.contractId).order("version_no",{ascending:false});if(error)throw error;return send({versions:data||[]});}
  if(b.action==="activity.list"){let q=db.from("jd_business_activities").select("id,customer_id,opportunity_id,activity_type,title,body,created_at,created_by").eq("school_id",school);if(uuid(b.customerId))q=q.eq("customer_id",b.customerId);if(uuid(b.opportunityId))q=q.eq("opportunity_id",b.opportunityId);const {data,error}=await q.order("created_at",{ascending:false}).limit(100);if(error)throw error;return send({activities:data||[]});}
  if(b.action==="activity.create"){const title=str(b.title,180),body=str(b.body,5000),customerId=uuid(b.customerId)?b.customerId:null,opportunityId=uuid(b.opportunityId)?b.opportunityId:null;if(!title||(!customerId&&!opportunityId))return send({error:"Activity title and a customer or opportunity are required"},400);const {data,error}=await db.from("jd_business_activities").insert({school_id:school,customer_id:customerId,opportunity_id:opportunityId,activity_type:["note","call","meeting","email"].includes(b.activityType)?b.activityType:"note",title,body,created_by:actor}).select("id,title,body,activity_type,created_at").single();if(error)throw error;await audit("business.activity.created",{activity_id:data.id});return send({activity:data},201);}
  if(b.action==="support.note.create"){if(!uuid(b.caseId)||!str(b.body,5000))return send({error:"Case ID and note required"},400);const {data:caseRow,error:caseError}=await db.from("jd_business_support_cases").select("id").eq("id",b.caseId).eq("school_id",school).maybeSingle();if(caseError||!caseRow)return send({error:"Support case not found in this workspace"},404);const {data,error}=await db.from("jd_business_support_notes").insert({school_id:school,case_id:b.caseId,body:str(b.body,5000),is_internal:true,created_by:actor}).select("id,case_id,body,is_internal,created_at").single();if(error)throw error;return send({note:data},201);}
  if(b.action==="cashflow.analytics"){
   const start=date(b.period_start)||new Date(Date.now()-90*86400000).toISOString().slice(0,10),end=date(b.period_end)||new Date().toISOString().slice(0,10);
   const {data,error}=await db.from("jd_business_cash_transactions").select("direction,amount,currency,occurred_on,status,category").eq("school_id",school).gte("occurred_on",start).lte("occurred_on",end).order("occurred_on");
   if(error)throw error;const rows=data||[],currencies=[...new Set(rows.map((r:any)=>r.currency))],summary:any={};
   for(const currency of currencies){const own=rows.filter((r:any)=>r.currency===currency),clearedIn=own.filter((r:any)=>r.direction==="inflow"&&r.status==="cleared").reduce((n:number,r:any)=>n+Number(r.amount),0),clearedOut=own.filter((r:any)=>r.direction==="outflow"&&r.status==="cleared").reduce((n:number,r:any)=>n+Number(r.amount),0),pendingIn=own.filter((r:any)=>r.direction==="inflow"&&r.status==="pending").reduce((n:number,r:any)=>n+Number(r.amount),0),pendingOut=own.filter((r:any)=>r.direction==="outflow"&&r.status==="pending").reduce((n:number,r:any)=>n+Number(r.amount),0);summary[currency]={cleared_inflows:clearedIn,cleared_outflows:clearedOut,net_cleared:clearedIn-clearedOut,pending_inflows:pendingIn,pending_outflows:pendingOut,transaction_count:own.length};}
   return send({period:{start,end},by_currency:summary,transactions:rows,caveat:"Cash flow is based only on manually recorded cleared/pending cash transactions. Sales opportunities and expenses are not treated as cash movements automatically."});
  }
  if(b.action==="performance.predict"){
   const rows:any[]=await list("opportunities"),expenses:any[]=await list("expenses"),byCurrency:Record<string,Record<string,any>>={};const monthKey=(v:string)=>v?.slice(0,7);
   const ensure=(currency:string,month:string)=>{byCurrency[currency]??={};byCurrency[currency][month]??={month,won_value:0,won_count:0,approved_spend:0,expense_count:0};return byCurrency[currency][month];};
   for(const o of rows.filter((x:any)=>x.stage==="won")){const k=monthKey(o.expected_close_date||o.updated_at||o.created_at);if(k){const r=ensure(o.currency||"NGN",k);r.won_value+=Number(o.amount);r.won_count++;}}
   for(const e of expenses.filter((x:any)=>["approved","paid"].includes(x.status))){const k=monthKey(e.incurred_on);if(k){const r=ensure(e.currency||"NGN",k);r.approved_spend+=Number(e.amount);r.expense_count++;}}
   const seriesByCurrency:Record<string,any[]>={};const forecastByCurrency:Record<string,any>={};
   for(const [currency,months] of Object.entries(byCurrency)){const series=Object.keys(months).sort().slice(-6).map(k=>({...months[k],net_proxy:months[k].won_value-months[k].approved_spend}));seriesByCurrency[currency]=series;if(series.length>=3){const avg=(field:string)=>series.slice(-3).reduce((n:any,x:any)=>n+Number(x[field]||0),0)/3;forecastByCurrency[currency]={next_period_won_value_run_rate:avg("won_value"),next_period_approved_spend_run_rate:avg("approved_spend"),next_period_net_proxy:avg("net_proxy"),method:"simple trailing-three-period average"};}}
   const evaluations:Record<string,any>={};
   for(const [currency,months] of Object.entries(byCurrency)){
    const keys=Object.keys(months).sort();if(keys.length<2)continue;
    const start=new Date(keys[0]+"-01T00:00:00Z"),end=new Date(keys[keys.length-1]+"-01T00:00:00Z"),dense:any[]=[];
    for(let cursor=new Date(start);cursor<=end;cursor.setUTCMonth(cursor.getUTCMonth()+1)){
     const key=cursor.toISOString().slice(0,7),entry=(months as any)[key]||{month:key,won_value:0,approved_spend:0};
     dense.push({month:key,actual:Number(entry.won_value||0)-Number(entry.approved_spend||0)});
    }
    const evaluation=evaluateTrailingMean(dense,3);
    if(evaluation.holdoutPeriods>=3){
     evaluations[currency]=evaluation;
     await db.from("jd_business_forecast_evaluations").insert({school_id:school,currency,training_periods:evaluation.trainingPeriods,holdout_periods:evaluation.holdoutPeriods,mae:evaluation.mae,mape:evaluation.mape,baseline_method:evaluation.method,metrics:{predictions:evaluation.predictions},limitations:["Historical opportunity wins are not cash receipts.","Approved expenses are not necessarily cash payments.","A small holdout sample is not evidence of future performance."]});
    }else evaluations[currency]={...evaluation,validation_status:"insufficient_holdout"};
   }
   const currencyCount=Object.keys(byCurrency).length,one=currencyCount===1?Object.keys(byCurrency)[0]:null,series=one?seriesByCurrency[one]:[];
   const validated=one?evaluations[one]:null;
   return send({currency:one,series,series_by_currency:seriesByCurrency,forecast:one?forecastByCurrency[one]||null:null,forecast_by_currency:forecastByCurrency,backtest_by_currency:evaluations,sample_periods:series.length,confidence:validated?.holdoutPeriods>=3?"backtested_descriptive_baseline":"insufficient_data",explanation:currencyCount>1?"Metrics are separated by currency. Select a single currency before interpreting a forecast.":validated?.holdoutPeriods>=3?"A trailing-mean baseline was evaluated against held-out historical months. Review MAE/MAPE and the small-sample limitations before using it.":"At least six distinct monthly periods are required: three training periods and at least three holdout periods.",sources:["jd_business_opportunities","jd_business_expenses"],limitations:["Won opportunity value is not cash received.","Expense approval is not necessarily a cash payment.","Months with no saved records are zero-filled for the evaluation period.","Backtesting is descriptive and does not establish predictive reliability."]});
  }
  if(b.action==="health.scorecard"){
   const [customers,opportunities,expenses,contracts,support,documents]=await Promise.all([list("customers"),list("opportunities"),list("expenses"),list("contracts"),list("support"),list("documents")]);
   const overdue=support.filter((x:any)=>x.sla_due_at&&new Date(x.sla_due_at)<new Date()&&!["resolved","closed"].includes(x.status));
   const renewal=contracts.filter((x:any)=>x.status==="active"&&x.expires_on&&new Date(x.expires_on).getTime()<=Date.now()+Number(x.renewal_notice_days)*86400000);
   return send({indicators:{customer_records:customers.length,open_opportunities:opportunities.filter((x:any)=>!["won","lost"].includes(x.stage)).length,overdue_support_cases:overdue.length,renewals_due:renewal.length,unreviewed_expenses:expenses.filter((x:any)=>x.status==="submitted").length,documents_pending_extraction:documents.filter((x:any)=>["pending","processing","failed"].includes(x.extraction_status)).length},grade:null,grade_note:"No single health grade is issued until business-specific thresholds and sufficient history are configured.",data_as_of:new Date().toISOString()});
  }
  if(b.action==="document.upload.prepare"){
   const title=str(b.title,180),mime=str(b.mimeType,120).toLowerCase(),size=num(b.byteSize,1,20*1024*1024);
   const allowed:Record<string,string>={"application/pdf":"pdf","text/plain":"txt","application/vnd.openxmlformats-officedocument.wordprocessingml.document":"docx","image/png":"png","image/jpeg":"jpg","image/tiff":"tiff"};
   if(!title||!allowed[mime]||size===null)return send({error:"Use a titled PDF, DOCX, plain-text or scanned PNG/JPEG/TIFF file up to 20 MB"},400);
   const path=`${school}/${crypto.randomUUID()}.${allowed[mime]}`;
   const {data,error}=await db.storage.from("jd-business-documents").createSignedUploadUrl(path,{upsert:false});
   if(error||!data?.token)return send({error:"Could not prepare secure upload"},500);
   return send({path,token:data.token,bucket:"jd-business-documents",expires_in_seconds:120});
  }
  if(b.action==="document.upload.confirm"){
   const path=str(b.path,500),title=str(b.title,180),mime=str(b.mimeType,120).toLowerCase();
   if(!path.startsWith(`${school}/`)||!title)return send({error:"Invalid document upload reference"},400);
   const folder=school,file=path.slice(school.length+1);
   const {data:objects,error:storageError}=await db.storage.from("jd-business-documents").list(folder,{search:file,limit:20});
   if(storageError)throw storageError;const object=(objects||[]).find((x:any)=>x.name===file);
   const actualSize=Number(object?.metadata?.size||0),actualMime=str(object?.metadata?.mimetype,120).toLowerCase();
   if(!object||actualSize<1||actualSize>20*1024*1024||actualMime!==mime)return send({error:"Uploaded file could not be verified"},400);
   const {data,error}=await db.from("jd_business_documents").insert({school_id:school,title,storage_path:path,mime_type:mime,byte_size:actualSize,extraction_status:"pending",source_metadata:{uploaded_at:new Date().toISOString(),scan_status:"pending"},created_by:actor}).select(columns.documents).single();
   if(error)throw error;const saved:any=data;await audit("business.document.uploaded",{document_id:saved.id,byte_size:actualSize,mime_type:mime});return send({item:saved,extraction_status:"pending",notice:"Upload verified. Text extraction remains pending until the document scanning/extraction worker is deployed."},201);
  }
  if(b.action==="document.download.url"){
   if(!uuid(b.documentId))return send({error:"Document ID required"},400);
   const {data:doc,error}=await db.from("jd_business_documents").select("storage_path,title").eq("id",b.documentId).eq("school_id",school).maybeSingle();
   if(error||!doc)return send({error:"Document not found"},404);
   const {data,error:signError}=await db.storage.from("jd-business-documents").createSignedUrl(doc.storage_path,60);
   if(signError||!data?.signedUrl)return send({error:"Could not create secure download link"},500);
   return send({url:data.signedUrl,title:doc.title,expires_in_seconds:60});
  }
  if(b.action==="report.generate"){
   const start=date(b.period_start),end=date(b.period_end);if(!start||!end||end<start)return send({error:"Valid report period required"},400);
   const [customers,opportunities,expenses,contracts,support]=await Promise.all([list("customers"),list("opportunities"),list("expenses"),list("contracts"),list("support")]);
   const inPeriod=(d:string)=>d&&d>=start&&d<=end;
   const won=opportunities.filter((x:any)=>x.stage==="won"&&inPeriod((x.expected_close_date||x.updated_at||"").slice(0,10)));
   const spend=expenses.filter((x:any)=>["approved","paid"].includes(x.status)&&inPeriod(x.incurred_on));
   const snapshot={period:{start,end},generated_at:new Date().toISOString(),metrics:{customers_total:customers.length,opportunities_total:opportunities.length,won_opportunities:won.length,won_value_by_currency:Object.fromEntries([...new Set(won.map((x:any)=>x.currency))].map(c=>[c,won.filter((x:any)=>x.currency===c).reduce((n:number,x:any)=>n+Number(x.amount),0)])),approved_expenses_by_currency:Object.fromEntries([...new Set(spend.map((x:any)=>x.currency))].map(c=>[c,spend.filter((x:any)=>x.currency===c).reduce((n:number,x:any)=>n+Number(x.amount),0)])),open_support_cases:support.filter((x:any)=>!["resolved","closed"].includes(x.status)).length,active_contracts:contracts.filter((x:any)=>x.status==="active").length},sources:["jd_business_customers","jd_business_opportunities","jd_business_expenses","jd_business_contracts","jd_business_support_cases"],limitations:["Only saved JD Business Platform records are included.","Opportunity wins are not cash receipts.","Expenses must be approved/paid to be included.","Amounts remain separated by currency."]};
   const {data,error}:any=await db.from("jd_business_reports").insert({school_id:school,title:str(b.title,180)||"Executive intelligence report",report_type:"executive",period_start:start,period_end:end,status:"draft",report_json:snapshot,source_metadata:{generated_at:snapshot.generated_at,sources:snapshot.sources},created_by:actor}).select(columns.reports).single();
   if(error)throw error;await audit("business.report.generated",{report_id:data.id,period:{start,end}});return send({report:data},201);
  }

  if(b.action==="cashflow.reconciliation.import"){
   const rows=Array.isArray(b.rows)?b.rows.slice(0,500):[],fileName=str(b.fileName,180)||"bank-statement.csv";
   if(!rows.length)return send({error:"Provide at least one parsed statement row"},400);
   const {data:batch,error:batchError}=await db.from("jd_business_cash_statement_imports").insert({school_id:school,file_name:fileName,currency:str(b.currency,3).toUpperCase()||"NGN",row_count:rows.length,imported_by:actor}).select("id").single();
   if(batchError||!batch)return send({error:"Could not create statement import"},500);
   const imported:any[]=[],rejected:any[]=[];
   for(let i=0;i<rows.length;i++){
    const x=rows[i]||{},amount=num(x.amount,0.01),occurred=date(x.occurred_on),direction=x.direction,currency=str(x.currency||b.currency||"NGN",3).toUpperCase();
    if(amount===null||!occurred||!["inflow","outflow"].includes(direction)||!/^[A-Z]{3}$/.test(currency)){rejected.push({row:i+1,reason:"Invalid date, direction, amount or currency"});continue;}
    const reference=str(x.reference,180),description=str(x.description,300);
    const canonical=[occurred,direction,amount.toFixed(2),currency,reference,description].join("|");
    const fingerprint=await sha256Hex(canonical);
    const {data:inserted,error}=await db.from("jd_business_cash_statement_rows").insert({school_id:school,import_id:batch.id,occurred_on:occurred,direction,amount,currency,reference:reference||null,description,row_fingerprint:fingerprint}).select("id,occurred_on,direction,amount,currency,reference,description,reconciliation_status").single();
    if(error){rejected.push({row:i+1,reason:"Duplicate or invalid statement row"});continue;}
    const dayBefore=new Date(new Date(occurred+"T00:00:00Z").getTime()-3*86400000).toISOString().slice(0,10),dayAfter=new Date(new Date(occurred+"T00:00:00Z").getTime()+3*86400000).toISOString().slice(0,10);
    const {data:candidates}=await db.from("jd_business_cash_transactions").select("id,occurred_on,direction,amount,currency,reference,description,status").eq("school_id",school).eq("currency",currency).eq("direction",direction).eq("amount",amount).gte("occurred_on",dayBefore).lte("occurred_on",dayAfter).in("status",["pending","cleared"]).limit(10);
    const exact=(candidates||[]).filter((t:any)=>!t.reference||!reference||t.reference===reference);
    if(exact.length===1)await db.from("jd_business_cash_statement_rows").update({reconciliation_status:"suggested"}).eq("id",inserted.id).eq("school_id",school);
    imported.push({row:inserted,suggestions:exact});
   }
   await db.from("jd_business_cash_statement_imports").update({row_count:imported.length}).eq("id",batch.id).eq("school_id",school);await audit("business.cashflow.statement_imported",{import_id:batch.id,accepted:imported.length,rejected:rejected.length});
   return send({import_id:batch.id,imported:imported.length,rejected,rows:imported,notice:"Matches are suggestions only. Confirm each match to clear a cash transaction."},201);
  }
  if(b.action==="cashflow.reconciliation.list"){
   const {data,error}=await db.from("jd_business_cash_statement_rows").select("id,import_id,occurred_on,direction,amount,currency,reference,description,reconciliation_status,matched_transaction_id,matched_at,created_at").eq("school_id",school).order("occurred_on",{ascending:false}).limit(500);
   if(error)throw error;return send({rows:data||[]});
  }
  if(b.action==="cashflow.reconciliation.match"){
   const rowId=uuid(b.statementRowId)?b.statementRowId:null,transactionId=uuid(b.transactionId)?b.transactionId:null;
   if(!rowId||!transactionId)return send({error:"Statement row and cash transaction IDs are required"},400);
   const {error}=await db.rpc("jd_reconcile_business_cash_row",{p_school_id:school,p_actor_id:actor,p_statement_row_id:rowId,p_transaction_id:transactionId});
   if(error)return send({error:"Reconciliation rejected",detail:error.message},409);
   await audit("business.cashflow.reconciled",{statement_row_id:rowId,transaction_id:transactionId});
   return send({matched:true,statement_row_id:rowId,transaction_id:transactionId});
  }
  if(b.action==="cashflow.reconciliation.ignore"){
   const rowId=uuid(b.statementRowId)?b.statementRowId:null;if(!rowId)return send({error:"Statement row ID required"},400);
   const {data,error}=await db.from("jd_business_cash_statement_rows").update({reconciliation_status:"ignored"}).eq("id",rowId).eq("school_id",school).neq("reconciliation_status","matched").select("id").maybeSingle();
   if(error||!data)return send({error:"Statement row could not be ignored"},409);await audit("business.cashflow.statement_row_ignored",{statement_row_id:rowId});return send({ignored:true});
  }
  if(b.action==="report.share.create"){
   if(p.role!=="admin")return send({error:"Only workspace administrators can create report share links"},403);
   const reportId=uuid(b.reportId)?b.reportId:null,days=num(b.expiresInDays??7,1,30);
   if(!reportId||days===null)return send({error:"Report ID and expiry between 1 and 30 days are required"},400);
   const {data:report,error:reportError}=await db.from("jd_business_reports").select("id,status").eq("id",reportId).eq("school_id",school).maybeSingle();
   if(reportError||!report)return send({error:"Report not found"},404);if(!["approved","shared"].includes(report.status))return send({error:"Approve the report before creating a public share link"},409);
   const token=base64Url(crypto.getRandomValues(new Uint8Array(32))),hash=await sha256Hex(token),expiresAt=new Date(Date.now()+days*86400000).toISOString();
   const {data:share,error}=await db.from("jd_business_report_shares").insert({school_id:school,report_id:reportId,token_hash:hash,expires_at:expiresAt,created_by:actor}).select("id,expires_at").single();
   if(error)throw error;const base=Deno.env.get("JD_REPORT_SHARE_BASE_URL")||Deno.env.get("SUPABASE_URL");
   if(!base)return send({error:"Share URL is not configured"},503);
   const shareUrl=`${base.replace(/\/$/,"")}/functions/v1/jd-business-report-share?token=${token}`;
   await audit("business.report.share_created",{report_id:reportId,share_id:share.id,expires_at:expiresAt});
   return send({share_id:share.id,share_url:shareUrl,expires_at:expiresAt});
  }
  if(b.action==="report.share.revoke"){
   if(p.role!=="admin")return send({error:"Only workspace administrators can revoke report shares"},403);
   const shareId=uuid(b.shareId)?b.shareId:null;if(!shareId)return send({error:"Share ID required"},400);
   const {data,error}=await db.from("jd_business_report_shares").update({revoked_at:new Date().toISOString()}).eq("id",shareId).eq("school_id",school).is("revoked_at",null).select("id").maybeSingle();
   if(error||!data)return send({error:"Active report share not found"},404);
   await audit("business.report.share_revoked",{share_id:shareId});return send({revoked:true,share_id:shareId});
  }
  if(b.action==="report.export.csv"){
   const reportId=uuid(b.reportId)?b.reportId:null;if(!reportId)return send({error:"Report ID required"},400);
   const {data,error}=await db.from("jd_business_reports").select("id,title,period_start,period_end,report_json,source_metadata").eq("id",reportId).eq("school_id",school).maybeSingle();
   if(error||!data)return send({error:"Report not found"},404);
   const metrics=(data.report_json as any)?.metrics||{},escapeCsv=(v:unknown)=>'"'+String(v??"").replace(/"/g,'""')+'"';
   const csv=["metric,value",...Object.entries(metrics).flatMap(([key,value]:[string,any])=>value&&typeof value==="object"?Object.entries(value).map(([currency,amount])=>[key+"_"+currency,amount].map(escapeCsv).join(",")):[[key,value].map(escapeCsv).join(",")])].join("\n");
   await audit("business.report.exported",{report_id:reportId,format:"csv"});
   return new Response(csv,{status:200,headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="jd-executive-report.csv"',"Cache-Control":"no-store","Access-Control-Allow-Origin":"*"}});
  }
  return send({error:"Unsupported action"},400);
 }catch(e){console.error("JD business platform",e);return send({error:"Business platform request failed",detail:e instanceof Error?e.message:"Unknown error"},500);}
});
