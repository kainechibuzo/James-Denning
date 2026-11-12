import {createClient} from "npm:@supabase/supabase-js@2";
import {sha256Hex} from "../_shared/jd-oauth-crypto.ts";
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","Access-Control-Allow-Origin":"*"}});
Deno.serve(async req=>{
 if(req.method!=="GET")return reply({error:"Method not allowed"},405);
 const token=new URL(req.url).searchParams.get("token")||"";
 if(token.length<40||token.length>128)return reply({error:"Invalid or expired share link"},404);
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!key)return reply({error:"Share service not configured"},503);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const hash=await sha256Hex(token),{data:share,error}=await db.from("jd_business_report_shares").select("school_id,report_id,expires_at,revoked_at").eq("token_hash",hash).is("revoked_at",null).gt("expires_at",new Date().toISOString()).maybeSingle();
 if(error||!share)return reply({error:"Invalid or expired share link"},404);
 const {data:report,error:reportError}=await db.from("jd_business_reports").select("title,period_start,period_end,report_json,source_metadata,created_at,status").eq("id",share.report_id).eq("school_id",share.school_id).maybeSingle();
 if(reportError||!report||!["approved","shared"].includes(report.status))return reply({error:"Shared report is unavailable"},404);
 return reply({report:{title:report.title,period_start:report.period_start,period_end:report.period_end,report_json:report.report_json,source_metadata:report.source_metadata,created_at:report.created_at},expires_at:share.expires_at,read_only:true});
});
