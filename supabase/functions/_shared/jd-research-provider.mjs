import {safeText} from './jd-business-foundation.mjs';
export function validateResearchRequest(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['query','country','language','limit'].includes(k)))throw Error('Invalid research request');
 const query=safeText(input.query,'Search query',2,400);
 if(!/^[a-z]{2}$/.test(input.country)||!/^[a-z]{2}$/.test(input.language)||!Number.isInteger(input.limit)||input.limit<1||input.limit>10)throw Error('Invalid research locale or result count');
 return {query,country:input.country,language:input.language,limit:input.limit};
}
export function validResearchKey(key){return typeof key==='string'&&/^[A-Za-z0-9_-]{20,256}$/.test(key);}
async function boundedBody(response,maxBytes){
 const reader=response.body?.getReader();if(!reader)throw Error('Invalid response');
 let chunks=[],total=0;try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>maxBytes)throw Error('Response too large');chunks.push(value);}const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return new TextDecoder().decode(bytes);}finally{await reader.cancel().catch(()=>{});}
}
// Fixed provider endpoint, no arbitrary URL fetches, redirects, logs or automatic retry charges.
export async function searchSerpApi({request,key,fetchImpl=fetch,now=()=>new Date().toISOString(),timeoutMs=10000}){
 const input=validateResearchRequest(request);
 const base={provider:'serpapi',query:input.query,country:input.country,language:input.language,retrievedAt:null,sources:[],researchPerformed:false,attempts:0,providerCost:null,cache:'not_used'};
 if(!validResearchKey(key))return {...base,status:'missing_credentials'};
 const url=new URL('https://serpapi.com/search.json');for(const [k,v] of Object.entries({engine:'google',q:input.query,gl:input.country,hl:input.language,num:input.limit,api_key:key}))url.searchParams.set(k,String(v));
 const controller=new AbortController();let timer;const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('deadline'));},timeoutMs);});
 const scrub=value=>String(value||'').split(key).join('[redacted]').replace(/\b(?:sk_live_|sk-proj-|ghp_|github_pat_)\S+/gi,'[redacted]');
 try{
  return await Promise.race([timeout,(async()=>{
   const response=await fetchImpl(url.toString(),{method:'GET',signal:controller.signal,redirect:'error',headers:{Accept:'application/json'}});
   const attempted={...base,attempts:1};
   if(response.status===401||response.status===403)return {...attempted,status:'invalid_credentials'};
   if(response.status===429)return {...attempted,status:'rate_limited'};
   if(!response.ok)return {...attempted,status:'provider_error'};
   let body;try{body=JSON.parse(await boundedBody(response,1024*1024));}catch{return {...attempted,status:'invalid_response'};}
   if(body?.error){const e=String(body.error);return {...attempted,status:/quota|credit|run out|limit/i.test(e)?'quota_exhausted':/key|auth/i.test(e)?'invalid_credentials':'provider_error'};}
   if(!body||!Array.isArray(body.organic_results))return {...attempted,status:'invalid_response'};
   const retrievedAt=now(),sources=[];
   for(const item of body.organic_results.slice(0,input.limit)){
    if(!item||typeof item.link!=='string'||typeof item.title!=='string')continue;
    try{const target=new URL(item.link);if(target.protocol!=='https:'||target.username||target.password||target.href.includes(key)||/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(target.hostname))continue;
     for(const param of [...target.searchParams.keys()])if(/key|token|secret|password|credential/i.test(param))target.searchParams.delete(param);
     if(sources.some(s=>s.url===target.href))continue;
     sources.push({title:scrub(item.title).slice(0,300),url:target.href,snippet:scrub(item.snippet).slice(0,1600),provider:'serpapi',query:input.query,retrievedAt,trust:'untrusted_source_not_instruction',pageFetched:false,factVerified:false});
    }catch{/* Invalid provider URLs are not evidence. */}
   }
   return {...attempted,status:sources.length?'success':'empty',retrievedAt,sources,researchPerformed:true};
  })()]);
 }catch{return {...base,attempts:1,status:controller.signal.aborted?'timeout':'network_error'};}finally{clearTimeout(timer);}
}
