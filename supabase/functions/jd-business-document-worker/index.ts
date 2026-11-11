import {createClient} from "npm:@supabase/supabase-js@2";
import {extractDocumentText,extractiveSummary} from "../_shared/jd-document-intelligence.ts";
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const equalSecret=async(a:string,b:string)=>{const [x,y]=await Promise.all([crypto.subtle.digest("SHA-256",new TextEncoder().encode(a)),crypto.subtle.digest("SHA-256",new TextEncoder().encode(b))]);const aa=new Uint8Array(x),bb=new Uint8Array(y);let d=0;for(let i=0;i<aa.length;i++)d|=aa[i]^bb[i];return d===0;};
const toBase64=(bytes:Uint8Array)=>{let binary="";for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));return btoa(binary);};
async function runOcr(bytes:Uint8Array,mime:string){
 const apiKey=Deno.env.get("JD_OCR_SPACE_API_KEY")||"";
 if(!apiKey||Deno.env.get("JD_OCR_ALLOW_EXTERNAL_PROCESSING")!=="true")return null;
 const form=new FormData();form.set("apikey",apiKey);form.set("base64Image",`data:${mime};base64,${toBase64(bytes)}`);form.set("language","eng");form.set("isOverlayRequired","false");form.set("detectOrientation","true");form.set("scale","true");form.set("OCREngine","2");
 const response=await fetch("https://api.ocr.space/parse/image",{method:"POST",body:form,signal:AbortSignal.timeout(60000),redirect:"error"});
 if(!response.ok)throw new Error("OCR provider request failed");
 const payload:any=await response.json();if(payload.IsErroredOnProcessing)throw new Error("OCR provider could not process the document");
 const text=(payload.ParsedResults||[]).map((x:any)=>String(x.ParsedText||"")).filter(Boolean).join("\\n").trim();
 return text?{text,parser:"ocr-space",pages:(payload.ParsedResults||[]).length}:null;
}
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
   const {data:file,error:downloadError}=await db.storage.from("jd-business-documents").download(doc.storage_path);
   if(downloadError||!file)throw new Error("Private source file could not be downloaded");
   if(file.size<1||file.size>20*1024*1024)throw new Error("Source file size is outside the supported range");
   const bytes=new Uint8Array(await file.arrayBuffer());
   let parsed=await extractDocumentText(doc.mime_type,bytes);
   let ocrUsed=false;
   if(!parsed.text&&["application/pdf","image/png","image/jpeg","image/tiff"].includes(doc.mime_type)){
    const ocr=await runOcr(bytes,doc.mime_type);
    if(ocr){parsed=ocr;ocrUsed=true;}
   }
   const text=parsed.text;
   if(!text)throw new Error(["pdfjs-text","image-no-text"].includes(parsed.parser)?"No embedded text found; OCR is not configured or returned no text":"No readable text was found");
   const checksum=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text)))).map(x=>x.toString(16).padStart(2,"0")).join("");
   const summary=extractiveSummary(text);
   const {error:saveError}=await db.from("jd_business_documents").update({extracted_text:text.slice(0,100000),summary,checksum_sha256:checksum,extraction_status:"completed",source_metadata:{worker:"jd-document-worker",extraction:parsed.parser,pages:parsed.pages,processed_at:new Date().toISOString(),truncated:text.length>100000,original_characters:text.length,ocr:ocrUsed?"external_ocr_space":"not_used"}}).eq("id",doc.id).eq("school_id",doc.school_id);
   if(saveError)throw saveError;
   results.push({id:doc.id,status:"completed",parser:parsed.parser,characters:Math.min(text.length,100000),ocr:ocrUsed});
  }catch(e){
   const message=e instanceof Error?e.message:"Extraction failed";
   const code=message.includes("OCR is not configured")||message.includes("OCR provider")||message.includes("OCR is not configured or returned no text")?"ocr_required":"extraction_failed";
   await db.from("jd_business_documents").update({extraction_status:"failed",source_metadata:{worker:"jd-document-worker",error_code:code,processed_at:new Date().toISOString()}}).eq("id",doc.id).eq("school_id",doc.school_id);
   results.push({id:doc.id,status:"failed",error_code:code});
  }
 }
 return reply({processed:results.length,completed:results.filter(x=>x.status==="completed").length,failed:results.filter(x=>x.status==="failed").length,results,ocr_enabled:!!Deno.env.get("JD_OCR_SPACE_API_KEY")&&Deno.env.get("JD_OCR_ALLOW_EXTERNAL_PROCESSING")==="true",notice:"OCR sends uploaded documents to OCR.space only when the API key is configured and JD_OCR_ALLOW_EXTERNAL_PROCESSING=true. Configure only after approving this third-party data-processing flow."});
});
