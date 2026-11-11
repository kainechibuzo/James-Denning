import {createClient} from "npm:@supabase/supabase-js@2";
import {extractiveSummary,normaliseDocumentText} from "../_shared/jd-document-intelligence.ts";
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const equalSecret=async(a:string,b:string)=>{const [x,y]=await Promise.all([crypto.subtle.digest("SHA-256",new TextEncoder().encode(a)),crypto.subtle.digest("SHA-256",new TextEncoder().encode(b))]);const aa=new Uint8Array(x),bb=new Uint8Array(y);let d=0;for(let i=0;i<aa.length;i++)d|=aa[i]^bb[i];return d===0;};
Deno.serve(async req=>{
 if(req.method!=="POST")return reply({error:"Method not allowed"},405);
 const expected=Deno.env.get("JD_DOCUMENT_WORKER_SECRET")||"",authorization=req.headers.get("Authorization")||"",auth=authorization.toLowerCase().startsWith("bearer ")?authorization.slice(7).trim():"";
 if(expected.length<32||!auth||!await equalSecret(auth,expected))return reply({error:"Unauthorized"},401);
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!key)return reply({error:"Worker not configured"},503);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const limit=Math.max(1,Math.min(25,Number((await req.json().catch(()=>({})))?.limit)||10));
 const {data:pending,error}=await db.from("jd_business_documents").select("id,school_id,title,storage_path,mime_type,byte_size,extraction_status").eq("extraction_status","pending").order("created_at",{ascending:true}).limit(limit);
 if(error)return reply({error:"Could not load pending documents"},500);
 const results=[];
 for(const doc of pending||[]){
  const {data:claimed,error:claimError}=await db.from("jd_business_documents").update({extraction_status:"processing",updated_at:new Date().toISOString()}).eq("id",doc.id).eq("school_id",doc.school_id).eq("extraction_status","pending").select("id").maybeSingle();
  if(claimError||!claimed)continue;
  try{
   if(doc.mime_type!=="text/plain"){await db.from("jd_business_documents").update({extraction_status:"unsupported",source_metadata:{worker:"jd-document-worker",reason:"PDF and DOCX extraction require the separately approved parser runtime",processed_at:new Date().toISOString()}}).eq("id",doc.id).eq("school_id",doc.school_id);results.push({id:doc.id,status:"unsupported"});continue;}
   const {data:file,error:downloadError}=await db.storage.from("jd-business-documents").download(doc.storage_path);
   if(downloadError||!file)throw new Error("Private source file could not be downloaded");
   if(file.size<1||file.size>20*1024*1024)throw new Error("Source file size is outside the supported range");
   const raw=await file.text(),text=normaliseDocumentText(raw);
   if(!text)throw new Error("No readable text was found");
   const checksum=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text)))).map(x=>x.toString(16).padStart(2,"0")).join("");
   const summary=extractiveSummary(text);
   const {error:saveError}=await db.from("jd_business_documents").update({extracted_text:text.slice(0,100000),summary,checksum_sha256:checksum,extraction_status:"completed",source_metadata:{worker:"jd-document-worker",extraction:"plain-text",processed_at:new Date().toISOString(),truncated:text.length>100000,original_characters:text.length}}).eq("id",doc.id).eq("school_id",doc.school_id);
   if(saveError)throw saveError;
   results.push({id:doc.id,status:"completed",characters:Math.min(text.length,100000)});
  }catch(e){await db.from("jd_business_documents").update({extraction_status:"failed",source_metadata:{worker:"jd-document-worker",error_code:"extraction_failed",processed_at:new Date().toISOString()}}).eq("id",doc.id).eq("school_id",doc.school_id);results.push({id:doc.id,status:"failed"});}
 }
 return reply({processed:results.length,completed:results.filter(x=>x.status==="completed").length,unsupported:results.filter(x=>x.status==="unsupported").length,failed:results.filter(x=>x.status==="failed").length,results,notice:"Plain-text extraction only. PDF/DOCX records are marked unsupported rather than falsely reported as processed."});
});
