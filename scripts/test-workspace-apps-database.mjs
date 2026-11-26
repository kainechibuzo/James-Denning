// Repository DDL/migration in local PGlite; no production/staging database.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),read=name=>readFileSync('supabase/migrations/'+name,'utf8');
const base=read('20261112073746_jd_business_platform.sql');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
before(async()=>{
 await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create table schools(id uuid primary key);create table profiles(id uuid primary key,school_id uuid,role text);');
 for(const table of ['jd_business_integration_catalog','jd_business_oauth_connections','jd_business_oauth_states']){
  const ddl=base.match(new RegExp(`create table if not exists public\\.${table} \\([\\s\\S]*?\\n\\);`,'i'));assert.ok(ddl);await db.exec(ddl[0]);
 }
 await db.exec(base.slice(base.indexOf('create or replace function public.jd_consume_business_oauth_state'),base.indexOf('grant execute on function public.jd_consume_business_oauth_state(text) to service_role;')+'grant execute on function public.jd_consume_business_oauth_state(text) to service_role;'.length));
 await db.exec("insert into jd_business_integration_catalog(id,name,category) values('google-workspace','Google','work'),('microsoft-365','Microsoft','work');");
 await db.query('insert into auth.users values($1),($2)',[id(1),id(2)]);await db.query('insert into schools values($1),($2)',[id(3),id(4)]);
 // Historical record predates the new migration: must receive zero enabled apps.
 await db.query("insert into jd_business_oauth_connections(school_id,provider_id,status,connected_by) values($1,'google-workspace','connected',$2)",[id(3),id(1)]);
 await db.exec(read('20261118105244_jd_workspace_read_services.sql'));
 await db.exec(read('20261118105315_jd_workspace_refresh_leases.sql'));
 await db.query("insert into profiles values($1,$2,'manager')",[id(1),id(3)]);
});
after(async()=>db.close());
test('old identity connections have empty app selection, never an implicit new grant',async()=>{
 const rows=(await db.query('select enabled_read_services from jd_business_oauth_connections')).rows;assert.deepEqual(rows[0].enabled_read_services,[]);
});
test('state consumption returns stored app selection once and rejects expired/replayed state',async()=>{
 await db.query("insert into jd_business_oauth_states(school_id,provider_id,actor_id,state_hash,pkce_verifier_encrypted,redirect_uri,expires_at,enabled_read_services) values($1,'google-workspace',$2,'synthetic-hash','\\x0123','https://callback.example.test',now()+interval '10 minutes',array['gmail']),($1,'google-workspace',$2,'expired-hash','\\x0123','https://callback.example.test',now()-interval '1 minute',array['google-drive'])",[id(3),id(1)]);
 await db.exec('set role service_role');try{
  const first=(await db.query("select * from jd_consume_business_oauth_state('synthetic-hash')")).rows;assert.equal(first.length,1);assert.equal(first[0].actor_id,id(1));assert.equal(first[0].school_id,id(3));assert.deepEqual(first[0].enabled_read_services,['gmail']);
  for(const hash of ['synthetic-hash','expired-hash','nonexistent'])assert.equal((await db.query('select * from jd_consume_business_oauth_state($1)',[hash])).rows.length,0);
 }finally{await db.exec('reset role');}
});
for(const role of ['anon','authenticated'])test(`${role}: new state RPC not executable by clients`,async()=>{
 await db.exec(`set role ${role}`);try{await assert.rejects(db.query("select * from jd_consume_business_oauth_state('synthetic-hash')"),/permission denied/);}finally{await db.exec('reset role');}
});
test('database blocks concurrent OAuth upsert from replacing another active account owner',async()=>{
 await assert.rejects(db.query("insert into jd_business_oauth_connections(school_id,provider_id,status,connected_by) values($1,'google-workspace','connected',$2) on conflict(school_id,provider_id) do update set connected_by=excluded.connected_by",[id(3),id(2)]),/Disconnect the existing/);
 assert.equal((await db.query('select connected_by from jd_business_oauth_connections where school_id=$1',[id(3)])).rows[0].connected_by,id(1));
 await db.query("insert into jd_business_oauth_connections(school_id,provider_id,status,connected_by) values($1,'google-workspace','connected',$2)",[id(4),id(2)]);
 await db.query("update jd_business_oauth_connections set enabled_read_services=array['gmail'] where school_id=$1",[id(3)]);
 assert.deepEqual((await db.query('select enabled_read_services from jd_business_oauth_connections where school_id=$1',[id(4)])).rows[0].enabled_read_services,[]);
});
test('explicit local disconnect allows a new owner, without inheriting previous app selection',async()=>{
 await db.query("update jd_business_oauth_connections set status='revoked',enabled_read_services='{}',encrypted_credentials=null where school_id=$1",[id(3)]);
 await db.query("update jd_business_oauth_connections set status='connected',connected_by=$2,enabled_read_services=array['google-drive'] where school_id=$1",[id(3),id(2)]);
 const r=(await db.query('select connected_by,enabled_read_services from jd_business_oauth_connections where school_id=$1',[id(3)])).rows[0];assert.equal(r.connected_by,id(2));assert.deepEqual(r.enabled_read_services,['google-drive']);
});

test('native refresh lease serializes rotation and cannot resurrect erased credentials',async()=>{
 await db.query("update jd_business_oauth_connections set status='revoked' where school_id=$1",[id(3)]);
 await db.query("update jd_business_oauth_connections set status='connected',connected_by=$2,encrypted_credentials=decode('abcd','hex') where school_id=$1",[id(3),id(1)]);
 const lease=id(20),otherLease=id(21);
 for(const [l,want] of [[lease,true],[otherLease,false]])assert.equal((await db.query("select jd_claim_workspace_refresh($1,$2,'google-workspace',decode('abcd','hex'),$3) as ok",[id(3),id(1),l])).rows[0].ok,want);
 await db.query("update jd_business_oauth_connections set status='revoked',encrypted_credentials=null where school_id=$1",[id(3)]);
 assert.equal((await db.query("select jd_save_workspace_refresh($1,$2,'google-workspace',decode('abcd','hex'),$3,decode('abce','hex'),now()+interval '1 hour',array['openid']) as ok",[id(3),id(1),lease])).rows[0].ok,false);
});
for(const role of ['anon','authenticated'])test(`${role}: native refresh RPC is service-only`,async()=>{await db.exec(`set role ${role}`);try{await assert.rejects(db.query("select jd_claim_workspace_refresh($1,$2,'google-workspace',null,$3)",[id(3),id(1),id(20)]),/permission denied/);}finally{await db.exec('reset role');}});
