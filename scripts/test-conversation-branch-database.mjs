// Proves the conversation-branch copy against real Postgres constraints:
// replaying a user message that still carries its client_request_id collides
// with the jd_messages_client_request unique index whenever the actor
// branches a conversation they authored (school_id + sender_id + client id
// are identical to the source row) — that is the production 500. The shipped
// buildConversationBranchMessages strip makes the same copy succeed. Real
// table and index SQL from the repo migrations, isolated PGlite.
import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {buildConversationBranchMessages} from '../supabase/functions/_shared/jd-conversation-branch.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),school=id(2),sourceConv=id(3),branchConv=id(4);
const db=new PGlite();
const read=p=>readFileSync(p,'utf8');
const extract=(source,pattern)=>{const match=source.match(pattern);assert.ok(match,`migration snippet not found: ${pattern}`);return match[0];};
async function initialise(){
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table schools(id uuid primary key);");
 const base=read('supabase/migrations/20261111085143_jd_autonomous_automation.sql');
 for(const table of ['jd_conversations','jd_messages','jd_automation_runs','jd_audit_events'])await db.exec(extract(base,new RegExp(`create table if not exists public\\.${table} \\([\\s\\S]*?\\n\\);`)));
 await db.exec(extract(read('supabase/migrations/20261114223357_jd_agent_provenance_records.sql'),/alter table public\.jd_messages add column if not exists created_by_agent[^;]*;/));
 await db.exec(extract(read('supabase/migrations/20261121100000_jd_conversation_interactions.sql'),/create unique index if not exists jd_messages_client_request[\s\S]*?;/));
 await db.exec(extract(read('supabase/migrations/20261121100000_jd_conversation_interactions.sql'),/create unique index if not exists jd_messages_interaction_answer[\s\S]*?;/));
 // PGlite lacks the Supabase default grants; mirror them for service_role.
 await db.exec('grant usage on schema public to service_role;grant all privileges on all tables in schema public to service_role;');
 await db.query('insert into schools values($1)',[school]);
 await db.query('insert into auth.users values($1)',[actor]);
}
before(initialise);
 beforeEach(async()=>{
 await db.exec('truncate jd_conversations cascade');
 await db.query("insert into jd_conversations(id,school_id,created_by,title) values($1,$2,$3,'Quarterly plan')",[sourceConv,school,actor]);
 await db.query("insert into jd_conversations(id,school_id,created_by,title) values($1,$2,$3,'Quarterly plan · Branch')",[branchConv,school,actor]);
 await db.query("insert into jd_messages(school_id,conversation_id,sender_id,role,content,content_json,created_by_agent) values($1,$2,$3,'user','Summarise the Q3 numbers',$4,false)",[school,sourceConv,actor,JSON.stringify({client_request_id:'crid-live-1',job_id:id(30),interaction:{messageId:'m',blockId:'b'}})]);
 await db.query("insert into jd_messages(school_id,conversation_id,sender_id,role,content,content_json,created_by_agent) values($1,$2,null,'assistant','Q3 revenue rose 12 percent.',$3,true)",[school,sourceConv,JSON.stringify({run_id:id(31),status:'completed'})]);
});
after(()=>db.close());
test('the client_request unique index bites an unstripped self-branch copy (production 500)',async()=>{
 await assert.rejects(
  db.query(`insert into jd_messages(school_id,conversation_id,sender_id,role,content,content_json,created_by_agent)
    select school_id,$2,sender_id,role,content,content_json,true from jd_messages where conversation_id=$1 and role='user'`,[sourceConv,branchConv]),
  error=>error.code==='23505'
 );
});
test('interaction answers replay into a new conversation without colliding',async()=>{
 await db.query(`insert into jd_messages(school_id,conversation_id,sender_id,role,content,content_json,created_by_agent)
   values($1,$2,$3,'user','answer',$4,false)`,[school,branchConv,actor,JSON.stringify({interaction:{messageId:'m',blockId:'b'}})]);
});
test('shipped branch copy strips request identity and inserts cleanly with the audit event',async()=>{
 const {rows:source}=await db.query('select role,content,content_json,sender_id from jd_messages where conversation_id=$1 order by created_at asc',[sourceConv]);
 const copied=buildConversationBranchMessages({schoolId:school,branchConversationId:branchConv,actorId:actor,sourceConversationId:sourceConv,messages:source});
 assert.equal(copied.length,2);
 for(const row of copied)assert.deepEqual(Object.keys(row.content_json).filter(k=>['client_request_id','interaction','job_id','run_id','status'].includes(k)),[]);
 assert.equal(copied[0].content_json.branched_from,sourceConv);
 await db.exec('set role service_role');
 try{
  const {flat,placeholders}=copied.reduce((acc,row)=>{
   const values=[row.school_id,row.conversation_id,row.sender_id,row.role,row.content,JSON.stringify(row.content_json),row.created_by_agent];
   acc.placeholders.push(`(${values.map((_,i)=>'$'+(acc.offset+i+1)).join(',')})`);
   acc.flat.push(...values);
   acc.offset+=values.length;
   return acc;
  },{offset:0,flat:[],placeholders:[]});
  await db.query(`insert into jd_messages(school_id,conversation_id,sender_id,role,content,content_json,created_by_agent) values ${placeholders.join(',')}`,flat);
 }finally{await db.exec('reset role');}
 const {rows:branchRows}=await db.query('select role,sender_id,content_json,created_by_agent from jd_messages where conversation_id=$1',[branchConv]);
 assert.equal(branchRows.length,2);
 assert.equal(branchRows.find(row=>row.role==='user').content_json.branched_from,sourceConv);
 await db.query(`insert into jd_audit_events(school_id,actor_id,event_type,event_json) values($1,$2,'conversation.branched',$3)`,[school,actor,JSON.stringify({source_conversation_id:sourceConv,new_conversation_id:branchConv,copied_messages:copied.length})]);
 const {rows:audits}=await db.query("select event_json from jd_audit_events where event_type='conversation.branched'");
 assert.equal(audits.length,1);
});
