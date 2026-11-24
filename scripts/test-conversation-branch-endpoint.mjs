// Drives the real jd-automation edge handler (source-transpiled, synthetic
// clients) to lock two production incidents:
// 1. usage.summary must reach its own admin summary handler — the shadow
//    usage service route used to swallow every action starting with
//    "usage.", making the workspace AI-usage page fail for admins.
// 2. conversation.branch must copy history without the source conversation's
//    request-idempotency keys (jd_messages_client_request unique index on
//    school_id + sender_id + client_request_id) and job/run bookkeeping, and
//    must record the conversation.branched audit event.
// Synthetic in-memory tables; this is not live Postgres/RLS proof — the real
// unique-index behaviour is proven in test-conversation-branch-database.mjs.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {transformWithOxc} from 'vite';
import {buildConversationBranchMessages} from '../supabase/functions/_shared/jd-conversation-branch.ts';
const cache=resolve('node_modules/.cache');mkdirSync(cache,{recursive:true});const temp=mkdtempSync(`${cache}/jd-conversation-branch-`);after(()=>rmSync(temp,{recursive:true,force:true}));
const source=readFileSync('supabase/functions/jd-automation/index.ts','utf8').replace(/^import .*;\n/gm,'');
const wrapped=`export function makeHandler(createClient,handleUsage,buildConversationBranchMessages){let handler;const Deno={env:{get:key=>key},serve:fn=>{handler=fn;}};${source}\nreturn handler;}`;
writeFileSync(`${temp}/handler.mjs`,(await transformWithOxc(wrapped,'handler.ts')).code);const {makeHandler}=await import(pathToFileURL(`${temp}/handler.mjs`));
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),staffActor=id(6),adminActor=id(7),school=id(2),otherSchool=id(3),sourceConv=id(4),otherOwnerConv=id(5);
const uuid=()=>globalThis.crypto.randomUUID();
function makeAdmin(tables,{failInsertFor=null}={}){
 const ops=[];
 const admin={from(table){
  let mode='read',patch=null,filters=[],orderKey=null,orderAsc=true,limitCount=null;
  const exec=async()=>{
   if(mode==='insert'){
    if(table===failInsertFor)return{data:null,error:{code:'23505',message:'duplicate key value violates unique constraint'}};
    const rows=(Array.isArray(patch)?patch:[patch]).map(row=>({id:row.id||uuid(),...row}));
    for(const row of rows)tables[table].push(row);
    ops.push({table,op:'insert',rows:structuredClone(rows)});
    return{data:structuredClone(rows),error:null};
   }
   if(mode==='delete'){
    const before=tables[table].length;
    tables[table]=tables[table].filter(row=>!filters.every(f=>f(row)));
    ops.push({table,op:'delete',filters:filters.map(f=>f.toString()),removed:before-tables[table].length});
    return{data:null,error:null};
   }
   let data=tables[table].filter(row=>filters.every(f=>f(row)));
   if(orderKey)data=[...data].sort((a,b)=>((a[orderKey]<b[orderKey])===orderAsc?-1:1));
   if(limitCount!=null)data=data.slice(0,limitCount);
   return{data:structuredClone(data),error:null};
  };
  const query={
   select(fields){ops.push({table,op:'select',fields});return query;},
   eq(key,value){filters.push(row=>row[key]===value);return query;},
   in(key,values){filters.push(row=>values.includes(row[key]));return query;},
   order(key,options){orderKey=key;orderAsc=options?.ascending!==false;return query;},
   limit(count){limitCount=count;return query;},
   insert(value){mode='insert';patch=value;return query;},
   delete(){mode='delete';return query;},
   update(value){mode='update';patch=value;return query;},
   async maybeSingle(){const result=await exec();return{...result,data:result.data?.[0]??null};},
   async single(){const result=await exec();if(!result.data?.length)return{data:null,error:{message:'no rows'}};return{data:result.data[0],error:null};},
   then(yes,no){return exec().then(yes,no);},
  };
  return query;
 }};
 return{admin,ops};
}
function setup({role='owner',failInsertFor=null,schoolId=school,tablesOverrides={}}={}){
 const tables={
  profiles:[
   {id:actor,school_id:school,role:'owner',full_name:'Owner'},
   {id:staffActor,school_id:school,role:'staff',full_name:'Staff'},
   {id:adminActor,school_id:school,role:'admin',full_name:'Admin'},
  ],
  jd_conversations:[
   {id:sourceConv,school_id:school,created_by:actor,title:'Quarterly plan',status:'active',created_at:'2026-11-20T09:00:00Z',updated_at:'2026-11-20T09:00:00Z'},
   {id:otherOwnerConv,school_id:school,created_by:staffActor,title:'Staff plan',status:'active',created_at:'2026-11-20T09:05:00Z',updated_at:'2026-11-20T09:05:00Z'},
  ],
  jd_messages:[
   {id:id(11),school_id:school,conversation_id:sourceConv,sender_id:actor,role:'user',content:'Summarise the Q3 numbers',content_json:{client_request_id:'crid-source-1',job_id:id(30),interaction:{messageId:'m',blockId:'b'}},created_by_agent:false},
   {id:id(12),school_id:school,conversation_id:sourceConv,sender_id:null,role:'assistant',content:'Q3 revenue rose 12 percent.',content_json:{run_id:id(31),status:'completed'},created_by_agent:true},
  ],
  jd_audit_events:[],
  jd_automation_runs:[
   {id:id(20),school_id:school,status:'completed',created_at:'2026-11-20T10:00:00Z',result_json:{tokenUsage:{input_tokens:100,output_tokens:50,total_tokens:150,cached_input_tokens:10,reasoning_tokens:20,model_requests:2,total_tokens_reported_requests:2,usage_reported_requests:2},model:'google/gemini-3.1-flash-lite'}},
   {id:id(21),school_id:school,status:'completed',created_at:'2026-11-19T10:00:00Z',result_json:{}},
   {id:id(22),school_id:school,status:'failed',created_at:'2026-11-18T10:00:00Z',result_json:{tokenUsage:{input_tokens:0,output_tokens:0,model_requests:1,usage_reported_requests:0}}},
  ],
  ...tablesOverrides,
 };
 const {admin,ops}=makeAdmin(tables,{failInsertFor});
 const actorId=role==='staff'?staffActor:role==='admin'?adminActor:actor;
 const auth={auth:{getUser:async()=>({data:{user:{id:actorId}},error:null})}};
 const usageServiceCalls=[];
 const handleUsage=(args)=>{usageServiceCalls.push({action:args.payload.action,enabled:args.enabled});return args.json({usageService:true,action:args.payload.action},409);};
 const handler=makeHandler((url,key)=>key==='SUPABASE_ANON_KEY'?auth:admin,handleUsage,buildConversationBranchMessages);
 const send=async(body,token='test-token')=>{
  const response=await handler(new Request('https://example.invalid',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)}));
  return{status:response.status,body:await response.json()};
 };
 return{tables,ops,usageServiceCalls,send};
}
const sentUser=keys=>keys.filter(k=>k==='client_request_id'||k==='interaction'||k==='job_id'||k==='run_id'||k==='status');

test('usage.summary reaches the admin summary handler with tenant-scoped aggregation',async()=>{
 const f=setup();const result=await f.send({action:'usage.summary'});
 assert.equal(result.status,200);
 assert.equal(f.usageServiceCalls.length,0,'usage.summary must not enter the shadow usage service');
 assert.deepEqual(result.body.summary,{runs:3,input_tokens:100,output_tokens:50,total_tokens:150,total_tokens_reported_runs:1,cached_input_tokens:10,reasoning_tokens:20,reported_runs:1,unreported_runs:2});
 assert.deepEqual(result.body.byDay[0],['2026-11-20',{runs:1,tokens:150,reported_runs:1}]);
 assert.deepEqual(result.body.byModel[0],['google/gemini-3.1-flash-lite',{runs:1,tokens:150,reported_runs:1}]);
 assert.ok(String(result.body.note).includes('Costs are not estimated'));
 assert.ok(f.ops.some(op=>op.table==='jd_automation_runs'&&op.op==='select'),'summary reads the run table');
});
test('usage.summary is denied to non-admins by its own handler, not the shadow route',async()=>{
 const f=setup({role:'staff'});const result=await f.send({action:'usage.summary'});
 assert.equal(result.status,403);
 assert.equal(result.body.usageService,undefined,'staff requests must fall through to the summary gate, not the shadow service');
 assert.equal(result.body.error,'Only workspace admins can view agent usage');
});
test('other usage.* actions still route to the shadow usage service',async()=>{
 const f=setup();const result=await f.send({action:'usage.snapshot'});
 assert.equal(result.status,409);
 assert.deepEqual(f.usageServiceCalls,[{action:'usage.snapshot',enabled:false}]);
});
test('owner branching their own conversation strips replay-hostile metadata and writes the audit event',async()=>{
 const f=setup();const result=await f.send({action:'conversation.branch',conversationId:sourceConv});
 assert.equal(result.status,200);
 assert.ok(result.body.conversationId,'branch id is returned');
 assert.equal(result.body.copiedMessages,2);
 const branch=f.tables.jd_conversations.find(row=>row.id===result.body.conversationId);
 assert.equal(branch.created_by,actor);
 assert.equal(branch.title,'Quarterly plan · Branch');
 const copied=f.tables.jd_messages.filter(row=>row.conversation_id===result.body.conversationId);
 assert.equal(copied.length,2);
 for(const row of copied){
  assert.deepEqual(sentUser(Object.keys(row.content_json||{})),[],`copied row must not replay ${sentUser(Object.keys(row.content_json||{}))}`);
  assert.equal(row.content_json.branched_from,sourceConv);
 }
 const userRow=copied.find(row=>row.role==='user');
 assert.equal(userRow.sender_id,actor);
 assert.equal(userRow.content,'Summarise the Q3 numbers');
 assert.equal(userRow.created_by_agent,false);
 const assistantRow=copied.find(row=>row.role==='assistant');
 assert.equal(assistantRow.sender_id,null);
 assert.equal(assistantRow.created_by_agent,true);
 const audit=f.tables.jd_audit_events.find(row=>row.event_type==='conversation.branched');
 assert.ok(audit,'conversation.branched audit event written');
 assert.equal(audit.actor_id,actor);
 assert.equal(audit.school_id,school);
 assert.equal(audit.event_json.source_conversation_id,sourceConv);
 assert.equal(audit.event_json.new_conversation_id,result.body.conversationId);
 assert.equal(audit.event_json.copied_messages,2);
});
test('staff cannot branch a conversation they did not create',async()=>{
 const f=setup({role:'staff'});const result=await f.send({action:'conversation.branch',conversationId:sourceConv});
 assert.equal(result.status,404);
 assert.equal(f.ops.some(op=>op.op==='insert'),false,'no writes for denied branch requests');
});
test('admins may branch another member\u2019s conversation but a client-supplied tenant never grants access',async()=>{
 const f=setup({role:'admin'});const result=await f.send({action:'conversation.branch',conversationId:otherOwnerConv});
 assert.equal(result.status,200);
 assert.equal(result.body.copiedMessages,0);
 const branch=f.tables.jd_conversations.find(row=>row.id===result.body.conversationId);
 assert.ok(branch,'branch conversation still created with empty history');
});
test('invalid and cross-tenant conversation ids are rejected before any write',async()=>{
 const f=setup();assert.equal((await f.send({action:'conversation.branch',conversationId:'not-a-uuid'})).status,400);
 const other=setup();assert.equal((await other.send({action:'conversation.branch',conversationId:sourceConv,schoolId:otherSchool})).status,200,'server-side tenant wins over a forged schoolId');
 const cross=setup({tablesOverrides:{jd_conversations:[{id:sourceConv,school_id:otherSchool,created_by:actor,title:'Elsewhere',status:'active'}]}});
 assert.equal((await cross.send({action:'conversation.branch',conversationId:sourceConv})).status,404);
 assert.equal(f.ops.some(op=>op.op==='insert'),false,'no writes for rejected branch requests');
});
test('copy failure cleans up the created branch and reports a copy error',async()=>{
 const f=setup({failInsertFor:'jd_messages'});
 const result=await f.send({action:'conversation.branch',conversationId:sourceConv});
 assert.equal(result.status,500);
 assert.equal(result.body.error,'Could not copy conversation context into the branch');
 const deletes=f.ops.filter(op=>op.op==='delete'&&op.table==='jd_conversations');
 assert.equal(deletes.length,1,'the half-created branch conversation is removed');
 assert.ok(!f.tables.jd_audit_events.some(row=>row.event_type==='conversation.branched'),'failed branch writes no audit event');
});
