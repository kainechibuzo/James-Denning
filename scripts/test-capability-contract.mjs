// Actual runtime registry/handlers, synthetic clients/provider. No live JWT,
// deployment verification, real provider response or production mutation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {transformWithOxc} from 'vite';
import {CAPABILITY_INTERPRETATION,capabilityEffect} from '../supabase/functions/_shared/jd-capability-contract.ts';
import {buildCapabilityReport,buildCapabilityAssessment,classifyCapability} from '../supabase/functions/_shared/jd-capability-intelligence.ts';
import {executeJdMcpTool,getJdMcpToolDefinitions,runAgent} from '../supabase/functions/_shared/jd-agent-runtime.ts';
const context=role=>({role,userId:'synthetic-actor',schoolId:'synthetic-workspace',admin:{from(table){if(table==='jd_audit_events')return{insert:async()=>({error:null})};assert.fail('inventory must not read or mutate business records');}}});
for(const role of ['owner','admin','manager','staff','contractor','viewer','finance','hr'])test(`${role}: reported callable tools match actual server definitions without writes`,async()=>{
 const ctx=context(role);const inventory=await executeJdMcpTool('get_jd_capability_inventory',{},ctx);
 assert.equal(inventory.report_kind,'runtime_tool_availability');
 const expected=getJdMcpToolDefinitions(ctx).filter(t=>t.name!=='get_jd_capability_inventory').map(t=>t.name);
 assert.deepEqual(inventory.tools.filter(t=>t.callable_by_assistant).map(t=>t.name),expected);
 assert.equal(inventory.callable_by_assistant,expected.length);
 for(const tool of inventory.tools){assert.equal(tool.live_verification,'not_assessed');assert.notEqual(tool.effect,'not_classified');assert.equal(tool.availability,tool.callable_by_assistant?'callable_for_current_role':'role_restricted');}
});
for(const role of ['teacher','student','unknown'])test(`${role}: inventory remains role restricted`,async()=>{
 await assert.rejects(executeJdMcpTool('get_jd_capability_inventory',{},context(role)),/not available/);
});
test('saved tasks and memory are not falsely called unsaved previews or approval-pending drafts',()=>{
 for(const name of ['create_operational_setup_tasks','remember_business_fact'])assert.equal(capabilityEffect(name).effect,'saved_internal_record');
 assert.equal(capabilityEffect('submit_organisation_blueprint_for_review').effect,'approval_request');
 assert.equal(capabilityEffect('create_business_document_draft').effect,'private_document_draft');
 assert.equal(capabilityEffect('call_connected_mcp_tool').effect,'connector_dependent');
 assert.equal(capabilityEffect('preview_hiring_vacancy').effect,'preview_only');
 for(const name of ['get_new_unreviewed_tool','constructor','__proto__'])assert.equal(capabilityEffect(name).effect,'not_classified');
});
test('a callable read can return scoped persisted data while independent verification is unknown',async()=>{
 const calls=[];const query={select(){return query;},eq(k,v){calls.push([k,v]);return query;},async limit(){return{data:[{status:'completed',priority:'normal'},{status:'queued',priority:'high'}]};}};
 const result=await executeJdMcpTool('get_operations_intelligence',{}, {...context('owner'),admin:{from(name){if(name==='jd_audit_events')return{insert:async()=>({error:null})};calls.push(name);return query;}}});
 assert.ok(result);assert.ok(calls.some(c=>Array.isArray(c)&&c[0]==='school_id'&&c[1]==='synthetic-workspace'));
 assert.equal(buildCapabilityAssessment({}).capabilities.every(c=>c.state==='unverified'),true);
});
test('runtime errors remain errors, never converted to evidence of success',async()=>{
 const q={select(){return q;},eq(){return q;},async limit(){return{data:null,error:{message:'synthetic failure'}};}};
 await assert.rejects(executeJdMcpTool('get_operations_intelligence',{}, {...context('owner'),admin:{from(table){if(table==='jd_audit_events')return{insert:async()=>({error:null})};return q;}}}),/Could not read/);
});
test('unverified inventory never grants a restricted role access to a callable owner tool',async()=>{
 await assert.rejects(executeJdMcpTool('create_operational_setup_tasks',{role:'owner'},context('viewer')),/not available/);
 await assert.rejects(executeJdMcpTool('unknown_tool',{},context('owner')),/not registered/);
});
const keys=['code','migration','deployment','configuration','smokeTest'];
for(let mask=0;mask<32;mask++)test(`verification requires all five explicit positive evidence fields: ${mask}`,()=>{
 const evidence=Object.fromEntries(keys.map((key,i)=>[key,Boolean(mask&(1<<i))]));
 const report=buildCapabilityReport({'execution.dispatcher':evidence})[0];
 assert.equal(report.state==='deployed',mask===31);
 assert.equal(report.gaps.length,keys.filter(k=>!evidence[k]).length);
});
for(const value of ['true',1,{},[],null])test(`truthy or malformed evidence ${JSON.stringify(value)} cannot verify or clear gaps`,()=>{
 const report=buildCapabilityReport({'execution.dispatcher':Object.fromEntries(keys.map(k=>[k,value]))})[0];
 assert.equal(report.state,'unverified');assert.equal(report.gaps.length,5);
});
test('absence of evidence is unknown, not disabled or failed',()=>{
 const report=buildCapabilityAssessment({});assert.equal(report.execution_availability,'not_assessed');assert.equal(report.report_kind,'capability_verification_evidence');
 assert.ok(report.capabilities.every(c=>c.state==='unverified'&&c.gaps.length===5));
 assert.match(report.interpretation,/does not mean unavailable, disabled, failed/);
 assert.equal(classifyCapability({deployment:true}),'unverified');
});
test('current agent prompt receives the interpretation and retains approval gates',async()=>{
 const oldFetch=globalThis.fetch,oldDeno=globalThis.Deno;let captured;
 globalThis.Deno={env:{get:()=>undefined}};
 globalThis.fetch=async(_url,request)=>{
  captured=JSON.parse(request.body);
  const response={id:'synthetic-response',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'Synthetic provider result; not a real-model acceptance test.'}]}]};
  return new Response('data: '+JSON.stringify({type:'response.completed',response})+'\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
 };
 try{
  await runAgent({message:'What can you do?',history:[],context:context('owner'),apiKey:'synthetic',model:'synthetic-model',baseUrl:'https://example.invalid'});
  assert.ok(captured.instructions.includes(CAPABILITY_INTERPRETATION));
  assert.match(captured.instructions,/No vehicle purchases, hiring decisions/);
  assert.match(captured.instructions,/without explicit owner approval/);
  assert.match(captured.instructions,/Do not describe every saved record as a draft/);
  assert.match(captured.instructions,/1–3 short sentences/);
  assert.match(captured.instructions,/raw tool names, UUIDs, event logs/);
  assert.match(captured.instructions,/Never hide a real failure/);
  assert.ok(captured.tools.some(t=>t.name==='get_jd_capability_inventory'));
 }finally{globalThis.fetch=oldFetch;if(oldDeno===undefined)delete globalThis.Deno;else globalThis.Deno=oldDeno;}
});

// Execute the actual capability HTTP route with an injected authenticated client.
const cache=resolve('node_modules/.cache');mkdirSync(cache,{recursive:true});
const temp=mkdtempSync(`${cache}/capability-handler-`);
const source=readFileSync('supabase/functions/jd-automation/index.ts','utf8').replace(/^import .*;\n/gm,'');
writeFileSync(`${temp}/handler.mjs`,(await transformWithOxc(`export function makeHandler(createClient,buildCapabilityAssessment){let handler;const Deno={env:{get:key=>key},serve:fn=>handler=fn};${source}\nreturn handler;}`,'handler.ts')).code);
const {makeHandler}=await import(pathToFileURL(`${temp}/handler.mjs`));rmSync(temp,{recursive:true,force:true});
for(const role of ['owner','admin','manager','viewer'])test(`${role}: evidence HTTP route ignores caller-supplied verification and role claims`,async()=>{
 let reads=0;const query={select(){return query;},eq(){return query;},async maybeSingle(){return{data:{id:'actor',school_id:'workspace',role}};}};
 const admin={from(table){assert.equal(table,'profiles');reads++;return query;}};
 const auth={auth:{getUser:async()=>({data:{user:{id:'actor'}}})}};
 const handler=makeHandler((_url,key)=>key==='SUPABASE_ANON_KEY'?auth:admin,buildCapabilityAssessment);
 const response=await handler(new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify({action:'capabilities.report',role:'owner',evidence:{'execution.dispatcher':Object.fromEntries(keys.map(k=>[k,true]))}})}));
 assert.equal(response.status,['owner','admin'].includes(role)?200:403);assert.equal(reads,1);
 if(response.status===200){const body=await response.json();assert.equal(body.execution_availability,'not_assessed');assert.ok(body.capabilities.every(c=>c.state==='unverified'));}
});
