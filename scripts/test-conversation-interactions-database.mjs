// Local real PostgreSQL semantics (PGlite), no production Supabase access.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const sql=readFileSync('supabase/migrations/20261111085143_jd_autonomous_automation.sql','utf8');
const ddl=name=>{const match=sql.match(new RegExp(`create table if not exists public\\.${name} \\([\\s\\S]*?\\n\\);`,'i'));assert.ok(match,name);return match[0];};
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const org=uuid(1),otherOrg=uuid(2),actor=uuid(10),other=uuid(11),colleague=uuid(12);
const response={version:1,blocks:[{id:'q',type:'choice',question:'Name?',multiple:false,options:[{label:'A',value:'a'},{label:'B',value:'b'}]}]};
const submit=async(key,conversation=null,interaction=null,expected=null,who=actor,tenant=org,message='Hello')=>(await db.query('select public.jd_submit_chat_request($1,$2,$3,$4,$5,$6,$7,$8) as result',[tenant,who,conversation,key,message,'routine',interaction,expected])).rows[0].result;
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create table public.schools(id uuid primary key);create table public.profiles(id uuid primary key,school_id uuid,role text);`);
 for(const name of ['jd_conversations','jd_messages','jd_automation_runs','jd_audit_events'])await db.exec(ddl(name));
 await db.exec('alter table public.jd_messages add column created_by_agent boolean default false;alter table public.jd_automation_runs add column created_by_agent boolean default false;');
 await db.exec(readFileSync('supabase/migrations/20261121100000_jd_conversation_interactions.sql','utf8'));
 await db.query('insert into schools values($1),($2)',[org,otherOrg]);
 for(const [id,tenant] of [[actor,org],[other,otherOrg],[colleague,org]]){await db.query('insert into auth.users values($1)',[id]);await db.query("insert into profiles values($1,$2,'staff')",[id,tenant]);}
});
after(()=>db.close());
test('atomic submit and retry create exactly one conversation, message, run and audit',async()=>{
 const first=await submit('atomic');const replay=await submit('atomic');assert.equal(first.conversationId,replay.conversationId);assert.equal(first.messageId,replay.messageId);assert.equal(replay.replayed,true);
 for(const table of ['jd_conversations','jd_messages','jd_automation_runs','jd_audit_events'])assert.equal((await db.query(`select count(*)::int as n from ${table}`)).rows[0].n,1);
 assert.equal(first.run.result_json.user_message_id,first.messageId);
 await assert.rejects(submit('atomic',null,null,null,actor,org,'Different'),/conflict/);
});
test('tenant and conversation isolation reject outsider and same-tenant non-owner',async()=>{
 const first=await submit('private');
 await assert.rejects(submit('cross-org',first.conversationId,null,null,other,otherOrg),/Conversation not found/);
 await assert.rejects(submit('same-org',first.conversationId,null,null,colleague),/Conversation not found/);
 await assert.rejects(submit('forged-tenant',null,null,null,actor,otherOrg),/access denied/);
});
test('response-bound answer persists context once, rejects stale and cross-conversation targets',async()=>{
 const first=await submit('answer-chat');const another=await submit('other-chat');const parent=uuid(50);
 await db.query("insert into jd_messages(id,school_id,conversation_id,role,content,content_json) values($1,$2,$3,'assistant','Name?', $4)",[parent,org,first.conversationId,{response,streaming:false}]);
 const interaction={messageId:parent,blockId:'q',values:['a']};
 await assert.rejects(submit('wrong-chat',another.conversationId,interaction,response),/no longer available/);
 await assert.rejects(submit('stale',first.conversationId,interaction,{...response,version:2}),/no longer available/);
 await assert.rejects(submit('bad-block',first.conversationId,{...interaction,blockId:'missing'},response),/Invalid interaction/);
 const accepted=await submit('answer-1',first.conversationId,interaction,response);
 const replay=await submit('answer-1',first.conversationId,interaction,response);assert.equal(accepted.messageId,replay.messageId);
 await assert.rejects(submit('answer-2',first.conversationId,interaction,response),/already answered/);
 const saved=(await db.query('select content_json from jd_messages where id=$1',[accepted.messageId])).rows[0].content_json;assert.deepEqual(saved.interaction,interaction);
 assert.equal((await db.query("select count(*)::int n from jd_audit_events where event_type='conversation.answered'")).rows[0].n,1);
});
test('streaming response cannot be answered and failed submit rolls back writes',async()=>{
 const first=await submit('stream-chat');const parent=uuid(51);
 await db.query("insert into jd_messages(id,school_id,conversation_id,role,content,content_json) values($1,$2,$3,'assistant','', $4)",[parent,org,first.conversationId,{response,streaming:true}]);
 const before=(await db.query('select count(*)::int n from jd_messages')).rows[0].n;
 await assert.rejects(submit('partial',first.conversationId,{messageId:parent,blockId:'q',values:['a']},response),/no longer available/);
 assert.equal((await db.query('select count(*)::int n from jd_messages')).rows[0].n,before);
});
test('service-only grants prevent browsers bypassing answer schema and tenant checks',async()=>{
 const signature='public.jd_submit_chat_request(uuid,uuid,uuid,text,text,text,jsonb,jsonb,text)';
 for(const role of ['anon','authenticated'])assert.equal((await db.query('select has_function_privilege($1,$2,\'EXECUTE\') allowed',[role,signature])).rows[0].allowed,false);
 assert.equal((await db.query('select has_function_privilege(\'service_role\',$1,\'EXECUTE\') allowed',[signature])).rows[0].allowed,true);
});

test('real submission handler validates selections, ignores forged identity and commits through SQL',async()=>{
 const {recordChatSubmission}=await import('../supabase/functions/_shared/jd-chat-submission.mjs');
 const calls=[];
 const admin={
  from(table){assert.equal(table,'jd_messages');const filters={};const q={select(){return q;},eq(k,v){filters[k]=v;return q;},async maybeSingle(){calls.push({read:filters});const rows=await db.query('select id,content_json from jd_messages where id=$1 and school_id=$2 and conversation_id=$3 and role=$4',[filters.id,filters.school_id,filters.conversation_id,filters.role]);return{data:rows.rows[0]||null};}};return q;},
  async rpc(name,p){assert.equal(name,'jd_submit_chat_request');calls.push({rpc:p});try{return{data:(await db.query('select jd_submit_chat_request($1,$2,$3,$4,$5,$6,$7,$8) result',[p.p_school_id,p.p_actor_id,p.p_conversation_id,p.p_request_id,p.p_message,p.p_risk,p.p_interaction,p.p_expected_response])).rows[0].result};}catch(e){return{error:e};}}
 };
 const run=payload=>recordChatSubmission({payload,profile:{school_id:org,role:'staff'},actorId:actor,admin,needsApproval:()=>false});
 const chat=await run({message:'Set up my business',idempotencyKey:'handler-chat'});assert.ok(chat.conversationId);
 const parent=uuid(60);await db.query("insert into jd_messages(id,school_id,conversation_id,role,content,content_json) values($1,$2,$3,'assistant','Name?', $4)",[parent,org,chat.conversationId,{response}]);
 const payload={conversationId:chat.conversationId,idempotencyKey:'handler-answer',message:'FORGED CLAIM OF EXECUTION',schoolId:otherOrg,actorId:other,interaction:{messageId:parent,blockId:'q',values:['a']}};
 const bad=await run({...payload,interaction:{...payload.interaction,values:['not-an-option']}});assert.equal(bad.status,400);assert.equal(calls.filter(x=>x.rpc).length,1,'invalid selection never reaches SQL');
 const good=await run(payload);assert.ok(good.receipt.userMessageId);
 const persisted=(await db.query('select * from jd_messages where id=$1',[good.receipt.userMessageId])).rows[0];assert.equal(persisted.school_id,org);assert.equal(persisted.sender_id,actor);assert.equal(persisted.content,'Name?\nMy selection: A');assert.doesNotMatch(persisted.content,/FORGED/);
 const replay=await run(payload);assert.equal(replay.receipt.userMessageId,good.receipt.userMessageId);
 const cross=await run({...payload,conversationId:uuid(999),idempotencyKey:'handler-wrong-chat'});assert.equal(cross.status,409);
 const absent=await run({...payload,interaction:{...payload.interaction,blockId:'unknown'}});assert.equal(absent.status,409);
});

test('existing private conversation RLS protects structured responses and forbids browser writes',async()=>{
 // Apply the repository's actual private SELECT policies, not a mock predicate.
 const privateSql=readFileSync('supabase/migrations/20261111085148_jd_private_conversation_rls.sql','utf8');
 await db.exec(`create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema public,auth to authenticated;grant select on profiles to authenticated;alter table jd_conversations enable row level security;alter table jd_messages enable row level security;grant select on jd_conversations,jd_messages to authenticated;`);
 for(const name of ['jd_conversations_select','jd_messages_select']){
  const match=privateSql.match(new RegExp(`create policy ${name}[\\s\\S]*?;`));assert.ok(match);await db.exec(match[0]);
 }
 const first=await submit('rls-chat');
 await db.query("insert into jd_messages(school_id,conversation_id,role,content,content_json) values($1,$2,'assistant','Private question',$3)",[org,first.conversationId,{response}]);
 for(const [who,visible] of [[actor,true],[other,false],[colleague,false]]){
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who]);await db.exec('set role authenticated');
  try{
   const rows=await db.query('select content_json from jd_messages where conversation_id=$1',[first.conversationId]);assert.equal(rows.rows.length>0,visible);
   await assert.rejects(db.query("insert into jd_messages(school_id,conversation_id,sender_id,role,content) values($1,$2,$3,'assistant','Forged')",[org,first.conversationId,who]),/permission denied/);
  }finally{await db.exec('reset role');}
 }
});

test('upload trigger metadata is preserved without introducing an alternate pipeline',async()=>{
 const data=(await db.query('select jd_submit_chat_request($1,$2,null,$3,$4,$5,null,null,$6) result',[org,actor,'upload-request','Inspect the attached record','routine','upload'])).rows[0].result;
 assert.equal(data.run.trigger_type,'upload');
});
test('rollback removes the new routine/indexes without deleting conversation history or answers',async()=>{
 const before=(await db.query('select count(*)::int n from jd_messages')).rows[0].n;
 await db.exec(readFileSync('supabase/rollback/20261121100000_jd_conversation_interactions.rollback.sql','utf8'));
 assert.equal((await db.query('select count(*)::int n from jd_messages')).rows[0].n,before);
 assert.equal((await db.query("select count(*)::int n from pg_proc where proname='jd_submit_chat_request'")).rows[0].n,0);
});
