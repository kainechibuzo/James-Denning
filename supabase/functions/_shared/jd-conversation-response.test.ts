import {runAgent} from './jd-agent-runtime.ts';
import {decodeResponse,streamText} from './jd-response.mjs';
function equal(actual:unknown,expected:unknown){if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);}
Deno.test('runtime supplies interaction instructions, streams safely and carries validated follow-up history',async()=>{
 const original=globalThis.fetch;
 const requests:any[]=[];
 const envelope={version:1,blocks:[{id:'name',type:'form',title:'Name your business',fields:[{id:'business_name',label:'Business name',type:'text',required:true}]}]};
 let round=0;
 globalThis.fetch=async(_url,init)=>{
  requests.push(JSON.parse(String(init?.body)));round++;
  const content=round===1?JSON.stringify(envelope):'Your chosen business name is Acme.';
  const pieces=[content.slice(0,12),content.slice(12)];
  const chunks=pieces.map(part=>'data: '+JSON.stringify({id:'test-response',choices:[{delta:{content:part},finish_reason:null}]})+'\n\n');
  chunks.push('data: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');
  return new Response(new ReadableStream({start(controller){for(const c of chunks)controller.enqueue(new TextEncoder().encode(c));controller.close();}}),{headers:{'Content-Type':'text/event-stream'}});
 };
 const admin={from(){const q:any={select(){return q;},eq(){return q;},order(){return q;},limit(){return Promise.resolve({data:[],error:null});}};return q;}};
 const run=(message:string,history:any[],onTextDelta?:(delta:string)=>void)=>runAgent({message,history,context:{admin,schoolId:'test-school',userId:'test-user',role:'owner'},apiKey:'synthetic',model:'gemini-3.1-flash-lite',baseUrl:'https://generativelanguage.googleapis.com/v1beta/openai',onTextDelta});
 try{
  let partial='';const result=await run('I want to start a business.',[],delta=>{partial+=delta;equal(streamText(partial),'');});
  equal(decodeResponse(result.text,{allowOperational:false}).response,envelope);
  const instructions=JSON.stringify(requests[0]);if(!instructions.includes('Response interface protocol v1')||!instructions.includes('Do not convert every question mark')||!instructions.includes('allowCustom:true')||!instructions.includes('recommend a small, relevant specialist team')||!instructions.includes('currently registered and role-available specialist catalogue'))throw Error('Missing intent and protocol instructions');
  const followup=await run('Name your business\nBusiness name: Acme',[{role:'assistant',content:'Name your business\n- Business name'}]);
  equal(followup.text,'Your chosen business name is Acme.');
  if(!JSON.stringify(requests[1]).includes('Business name: Acme'))throw Error('Follow-up context was lost');
 }finally{globalThis.fetch=original;}
});
