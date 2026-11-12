import {Buffer} from "node:buffer";
import mammoth from "npm:mammoth@1.9.0";
import * as pdfjs from "npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs";

export function normaliseDocumentText(input:string){
 return input.replace(/\u0000/g,"").replace(/\r\n?/g,"\n").replace(/[\t ]+\n/g,"\n").replace(/\n{4,}/g,"\n\n\n").trim();
}
export function extractiveSummary(input:string,maxSentences=5){
 const sentences=input.replace(/\s+/g," ").match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[];
 const cleaned=sentences.map(x=>x.trim()).filter(x=>x.length>35);
 if(!cleaned.length)return input.slice(0,500);
 const chosen=cleaned.slice(0,Math.max(1,Math.min(8,maxSentences)));
 return chosen.join(" ").slice(0,2000);
}
export async function extractDocumentText(mimeType:string,bytes:Uint8Array){
 if(bytes.byteLength<1||bytes.byteLength>20*1024*1024)throw new Error("Source file size is outside the supported range");
 if(mimeType==="text/plain")return {text:normaliseDocumentText(new TextDecoder("utf-8",{fatal:true}).decode(bytes)),parser:"plain-text",pages:null};
 if(mimeType==="application/vnd.openxmlformats-officedocument.wordprocessingml.document"){
  const result=await mammoth.extractRawText({buffer:Buffer.from(bytes)});
  return {text:normaliseDocumentText(result.value),parser:"mammoth-docx",pages:null};
 }
 if(mimeType==="application/pdf"){
  const task=pdfjs.getDocument({data:bytes,isEvalSupported:false,disableFontFace:true,useSystemFonts:true});
  const pdf=await task.promise;
  try{
   if(pdf.numPages>200)throw new Error("PDF exceeds the 200-page extraction limit");
   const pages:string[]=[];
   for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
    const page=await pdf.getPage(pageNo);
    const content=await page.getTextContent();
    pages.push(content.items.map((item:any)=>typeof item.str==="string"?item.str:"").filter(Boolean).join(" "));
    if(pages.join("\n").length>500000)break;
   }
   return {text:normaliseDocumentText(pages.join("\n")),parser:"pdfjs-text",pages:pdf.numPages};
  }finally{await pdf.destroy();}
 }
 throw new Error("Unsupported document MIME type");
}
