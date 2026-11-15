import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth:{persistSession:false} });
const cors = { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods":"POST, OPTIONS" };
const reply = (body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
async function limit(req:Request, action:string, max:number, seconds:number) {
 const ip=(req.headers.get("cf-connecting-ip")||req.headers.get("x-real-ip")||req.headers.get("x-forwarded-for")||"unknown").split(",")[0].trim().slice(0,80);
 const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(ip+"|careers|"+action));
 const key=Array.from(new Uint8Array(bytes)).map(x=>x.toString(16).padStart(2,"0")).join("");
 const {data,error}=await db.rpc("consume_public_endpoint_rate_limit",{p_bucket_key:key,p_limit:max,p_window_seconds:seconds});
 return !error && data===true;
}
const clean=(v:unknown,max:number)=>typeof v==="string"?v.trim().slice(0,max):"";
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return reply({ok:false,error:"method_not_allowed"},405);
 let b:Record<string,unknown>;try{b=await req.json()}catch{return reply({ok:false,error:"invalid_json"},400)}
 const action=b.action;
 if(!["role","submit","thread","message"].includes(String(action)))return reply({ok:false,error:"invalid_action"},400);
 const cfg=action==="submit"?[5,3600]:action==="message"?[12,3600]:[40,300];
 if(!await limit(req,String(action),cfg[0],cfg[1]))return reply({ok:false,error:"rate_limited"},429);
 if(action==="role"){
  const slug=clean(b.slug,120);if(!/^[a-z0-9][a-z0-9-]*$/.test(slug))return reply({ok:false,error:"not_found"},404);
  const {data:r,error}=await db.from("hiring_roles").select("id,title,summary,description,expectations,price_min,price_max,price_note,schools(name)").eq("slug",slug).eq("is_published",true).eq("status","active").maybeSingle();
  if(error)return reply({ok:false,error:"lookup_failed"},500);
  if(!r)return reply({ok:false,error:"not_found"},404);
  return reply({data:[{id:r.id,title:r.title,summary:r.summary,description:r.description,expectations:r.expectations,price_min:r.price_min,price_max:r.price_max,price_note:r.price_note,org_name:(r.schools as any)?.name||null}]});
 }
 if(action==="submit"){
  const slug=clean(b.slug,120),name=clean(b.name,160),email=clean(b.email,254).toLowerCase(),phone=clean(b.phone,50),qualifications=clean(b.qualifications,12000),priceNote=clean(b.price_note,500);
  const asking=b.asking_price===null||b.asking_price===undefined||b.asking_price===""?null:Number(b.asking_price);
  if(!/^[a-z0-9][a-z0-9-]*$/.test(slug)||!name||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!Number.isFinite(asking)&&asking!==null||asking!==null&&asking<0)return reply({ok:false,error:"Name and a valid email address are required."},400);
  const {data:role,error:re}=await db.from("hiring_roles").select("id,school_id,title").eq("slug",slug).eq("is_published",true).eq("status","active").maybeSingle();
  if(re)return reply({ok:false,error:"submission_failed"},500);
  if(!role)return reply({ok:false,error:"This role is not accepting applications right now."},404);
  const tokenBytes=crypto.getRandomValues(new Uint8Array(24));const token=Array.from(tokenBytes).map(x=>x.toString(16).padStart(2,"0")).join("");
  const {data:app,error:ae}=await db.from("hiring_applications").insert({school_id:role.school_id,role_id:role.id,applicant_name:name,applicant_email:email,applicant_phone:phone,qualifications,asking_price:asking,asking_price_note:priceNote,status:"new",access_token:token}).select("id").single();
  if(ae)return reply({ok:false,error:"submission_failed"},500);
  const {error:ne}=await db.from("notifications").insert({school_id:role.school_id,recipient_id:"admin",recipient_role:"admin",title:"New application",body:"New application for "+role.title+" from "+name,type:"info",event_type:"hiring_application",link_page:"hiring"});
  if(ne){await db.from("hiring_applications").delete().eq("id",app.id);return reply({ok:false,error:"submission_failed"},500)}
  return reply({ok:true,id:app.id,token});
 }
 const token=clean(b.token,128);if(token.length<32)return reply({ok:false,error:"not_found"},404);
 const {data:app,error:ae}=await db.from("hiring_applications").select("id,school_id,role_id,status,applicant_name,asking_price,asking_price_note").eq("access_token",token).maybeSingle();
 if(ae)return reply({ok:false,error:"request_failed"},500);if(!app)return reply({ok:false,error:"not_found"},404);
 if(action==="thread"){
  const [{data:role},{data:messages,error:me}]=await Promise.all([
   db.from("hiring_roles").select("title,slug").eq("id",app.role_id).maybeSingle(),
   db.from("hiring_messages").select("id,sender,sender_name,body,created_at").eq("application_id",app.id).order("id")
  ]);
  if(me)return reply({ok:false,error:"request_failed"},500);
  return reply({ok:true,application:{id:app.id,status:app.status,applicant_name:app.applicant_name,asking_price:app.asking_price,asking_price_note:app.asking_price_note},role:{title:role?.title,slug:role?.slug},messages:messages||[]});
 }
 const body=clean(b.body,5000),senderName=clean(b.sender_name,160);
 if(!body)return reply({ok:false,error:"Message cannot be empty."},400);
 const {data:msg,error:me}=await db.from("hiring_messages").insert({school_id:app.school_id,application_id:app.id,sender:"applicant",sender_name:senderName||app.applicant_name,body}).select("id,sender,sender_name,body,created_at").single();
 if(me)return reply({ok:false,error:"message_failed"},500);
 return reply({ok:true,message:msg});
});