import {assertEquals} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {screenDocument,sniffType,findEmbeddedExecutable,DOCUMENT_MAX_BYTES} from "./jd-document-security.ts";

const bytesOf=(values:number[])=>new Uint8Array(values);
const ascii=(text:string)=>new TextEncoder().encode(text);
const concat=(...parts:Uint8Array[])=>{const total=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(total);let offset=0;for(const part of parts){out.set(part,offset);offset+=part.length;}return out;};
// Minimal but structurally valid PE: "MZ" + e_lfanew pointing at "PE\0\0".
const peBytes=()=>{const b=new Uint8Array(0x90);b[0]=0x4d;b[1]=0x5a;b[0x3c]=0x80;b.set([0x50,0x45,0x00,0x00],0x80);return b;};
const docxBytes=(extra="")=>concat(bytesOf([0x50,0x4b,0x03,0x04]),ascii("fake-docx-body word/document.xml "+extra));
const pdfBytes=()=>concat(ascii("%PDF-1.7\n"),ascii("1 0 obj\n<<>>\nendobj\n"),ascii("%%EOF"));

Deno.test("sniffs the supported document families",()=>{
 assertEquals(sniffType(pdfBytes()),"pdf");
 assertEquals(sniffType(bytesOf([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00,0x01])),"png");
 assertEquals(sniffType(bytesOf([0xff,0xd8,0xff,0xe0,0x00,0x10])),"jpeg");
 assertEquals(sniffType(bytesOf([0x49,0x49,0x2a,0x00,0x08])),"tiff");
 assertEquals(sniffType(bytesOf([0x4d,0x4d,0x00,0x2a,0x00])),"tiff");
 assertEquals(sniffType(docxBytes()),"docx");
 assertEquals(sniffType(ascii("reference,amount\n1,2\n")),"text");
});

Deno.test("passes documents whose content matches the declared MIME type",()=>{
 assertEquals(screenDocument(pdfBytes(),"application/pdf").verdict,"pass");
 assertEquals(screenDocument(bytesOf([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),"image/png").verdict,"pass");
 assertEquals(screenDocument(docxBytes(),"application/vnd.openxmlformats-officedocument.wordprocessingml.document").verdict,"pass");
 assertEquals(screenDocument(ascii("hello, world\n"),"text/plain").verdict,"pass");
 const passed=screenDocument(pdfBytes(),"application/pdf");
 assertEquals(passed.scan_status,"signature_screen_passed");
});

Deno.test("rejects content that does not match the declared MIME type",()=>{
 const result=screenDocument(bytesOf([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),"application/pdf");
 assertEquals(result.verdict,"reject");
 assertEquals(result.scan_status,"signature_screen_rejected");
});

Deno.test("rejects executables, scripts and legacy OLE containers outright",()=>{
 assertEquals(sniffType(peBytes()),"executable");
 assertEquals(screenDocument(peBytes(),"application/pdf").verdict,"reject");
 assertEquals(screenDocument(bytesOf([0x7f,0x45,0x4c,0x46,0x02,0x01]),"application/pdf").verdict,"reject");
 assertEquals(screenDocument(bytesOf([0x23,0x21,0x62,0x69,0x6e,0x2f,0x73,0x68]),"text/plain").verdict,"reject"); // #!/bin/sh
 assertEquals(screenDocument(bytesOf([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]),"application/pdf").verdict,"reject");
 assertEquals(screenDocument(bytesOf([0xfe,0xed,0xfa,0xcf,0x00,0x01]),"application/pdf").verdict,"reject");
});

Deno.test("rejects macro-enabled OOXML even with a Word MIME declaration",()=>{
 const result=screenDocument(docxBytes("vbaProject.bin"),"application/vnd.openxmlformats-officedocument.wordprocessingml.document");
 assertEquals(result.verdict,"reject");
});

Deno.test("detects executables embedded after a document header (polyglot)",()=>{
 const embedded=concat(pdfBytes(),ascii("stream\n"),peBytes());
 const found=findEmbeddedExecutable(embedded);
 assertEquals(found?.kind,"embedded Windows PE payload");
 const result=screenDocument(embedded,"application/pdf");
 assertEquals(result.verdict,"reject");
});

Deno.test("plain-text with NUL bytes is not accepted as text",()=>{
 const result=screenDocument(bytesOf([0x68,0x69,0x00,0x21]),"text/plain");
 assertEquals(result.verdict,"reject");
});

Deno.test("rejects ZIP containers, empty files, oversize files and unknown MIME types",()=>{
 assertEquals(screenDocument(bytesOf([0x50,0x4b,0x03,0x04,0x01]),"application/vnd.openxmlformats-officedocument.wordprocessingml.document").verdict,"reject");
 assertEquals(screenDocument(bytesOf([]),"application/pdf").verdict,"reject");
 assertEquals(screenDocument(new Uint8Array(DOCUMENT_MAX_BYTES+1),"application/pdf").verdict,"reject");
 assertEquals(screenDocument(pdfBytes(),"application/x-msdownload").verdict,"reject");
});
