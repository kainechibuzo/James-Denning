import {createClient} from "npm:@supabase/supabase-js@2";
import {nextScheduleAt,type LocalSchedule} from "../_shared/jd-scheduler.ts";
import {getJdSecret} from "../_shared/jd-secrets.ts";
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
function secretMatches(provided:string,expected:string){if(!provided||!expected||provided.length!==expected.length)return false;let diff=0;for(let i=0;i<expected.length;i++)diff|=provided.charCodeAt(i)^expected.charCodeAt(i);return diff===0;}
Deno.serve(async(req)=>{
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const expected=getJdSecret("JD_WORKER_SECRET"),provided=(req.headers.get("x-jd-worker-secret")||"").trim();
 if(!secretMatches(provided,expected))return json({error:"Unauthorized"},401);
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!key)return json({error:"Scheduler is not configured"},503);
 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const now=new Date();
 const {data:schedules,error}=await admin.from("jd_task_schedules")
  .select("id,school_id,frequency,local_time,timezone,weekdays,next_run_at")
  .eq("active",true).lte("next_run_at",now.toISOString()).order("next_run_at",{ascending:true}).limit(50);
 if(error)return json({error:"Could not read due recurring schedules"},503);
 const outcomes=[];
 for(const schedule of schedules||[]){
  try{
   const next=nextScheduleAt(now,{frequency:schedule.frequency,localTime:String(schedule.local_time).slice(0,5),timezone:schedule.timezone,weekdays:Array.isArray(schedule.weekdays)?schedule.weekdays.map((day:unknown)=>Number(day)).filter((day:number)=>Number.isInteger(day)):[]} as LocalSchedule);
   const {data,error:dispatchError}=await admin.rpc("jd_dispatch_task_schedule",{
    p_schedule_id:schedule.id,p_expected_run_at:schedule.next_run_at,p_next_run_at:next.toISOString()
   });
   if(dispatchError)throw new Error("Schedule dispatch RPC failed");
   outcomes.push(data||{dispatched:false});
  }catch{
   // Keep the due row for retry; do not leak tenant or database details.
   outcomes.push({schedule_id:schedule.id,status:"dispatch_error"});
  }
 }
 return json({checked:(schedules||[]).length,dispatched:outcomes.filter(x=>x?.dispatched).length,outcomes});
});
