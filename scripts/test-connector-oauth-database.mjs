// Actual migration/RPCs in isolated local PostgreSQL, synthetic accounts only.
import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=id(1),manager=id(2),other=id(3),staff=id(4),school=id(10),elsewhere=id(11);
const sql=name=>readFileSync('supabase/migrations/'+name,'utf8');
before(async()=>{
 await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create table schools(id uuid primary key);create table profiles(id uuid primary key,school_id uuid,role text);');
 await db.query('insert into schools values($1),($2)',[school,elsewhere]);
 for(const [actor,tenant,role] of [[owner,school,'owner'],[manager,school,'manager'],[other,elsewhere,'owner'],[staff,school,'staff']]){await db.query('insert into auth.users values($1)',[actor]);await db.query('insert into profiles values($1,$2,$3)',[actor,tenant,role]);}
 await db.exec(sql('20261114091134_jd_connect_mcp_platform.sql'));
 await db.exec(sql('20261114094036_jd_connector_permission_grants.sql'));
 await db.exec(sql('20261118100000_jd_connector_oauth.sql'));
 await db.exec(sql('20261118120000_jd_connector_pasted_tokens.sql'));
});
beforeEach(async()=>{await db.exec('reset role;truncate jd_connector_servers cascade;');await db.query("update profiles set role='manager',school_id=$2 where id=$1",[manager,school]);});
after(()=>db.close());
async function begin(actor=manager,shared=false,hash='state-one'){
 const r=await db.query("select jd_begin_connector_oauth($1,'github','https://api.githubcopilot.com/mcp/','GitHub',$2,$3,'synthetic-encrypted-verifier','config-hash','https://jd.example.test/callback') as id",[actor,shared,hash]);return r.rows[0].id;
}
async function finish(server,actor=manager,generation=1){return (await db.query("select jd_finish_connector_oauth($1,$2,$3,'synthetic-encrypted-token',now()+interval '1 hour') as ok",[server,actor,generation])).rows[0].ok;}
async function discover(server,generation=1){return (await db.query("select jd_save_connector_oauth_discovery($1,$2,$3,$4,'2025-06-18','{}') as ok",[server,school,generation,JSON.stringify([{name:'lookup',description:'Synthetic',input_schema:{},annotations:{readOnlyHint:true},read_only:true}])])).rows[0].ok;}
test('default personal consent stores only hashed state, scopes tenant/actor and is one-time',async()=>{
 const server=await begin();const s=(await db.query('select * from jd_connector_servers where id=$1',[server])).rows[0];assert.equal(s.status,'disabled');assert.equal(s.school_id,school);assert.equal(s.access_owner_user_id,manager);
 for(const count of [1,0]){const r=await db.query("select * from jd_consume_connector_oauth('state-one')");assert.equal(r.rows.length,count);if(count)assert.equal(r.rows[0].generation,1);}
});
test('expired OAuth state cannot be consumed',async()=>{await begin();await db.exec("update jd_connector_oauth_states set expires_at=now()-interval '1 second'");assert.equal((await db.query("select * from jd_consume_connector_oauth('state-one')")).rows.length,0);});
test('OAuth credentials do not imply connected; discovery resets provider annotations to untrusted',async()=>{
 const server=await begin();assert.equal(await finish(server),true);assert.equal((await db.query('select status from jd_connector_servers where id=$1',[server])).rows[0].status,'error');assert.equal(await discover(server),true);
 const tools=(await db.query('select * from jd_connector_tools')).rows;assert.equal(tools.length,1);assert.equal(tools[0].read_only,false);assert.equal((await db.query('select status from jd_connector_servers')).rows[0].status,'connected');
});
test('manager cannot share; owner must explicitly choose organisation',async()=>{await assert.rejects(begin(manager,true),/owners\/admins/);const server=await begin(owner,true);assert.equal((await db.query('select access_owner_user_id from jd_connector_servers where id=$1',[server])).rows[0].access_owner_user_id,null);});
test('staff/missing actor cannot start a grant',async()=>{await assert.rejects(begin(staff),/permission/);await assert.rejects(begin(id(999)),/permission/);});
test('another actor cannot overwrite a connection slot, another tenant remains independent',async()=>{const server=await begin();await assert.rejects(begin(owner),/Another user/);const remote=await begin(other,false,"other-tenant-state");assert.notEqual(server,remote);assert.equal((await db.query('select count(*)::int as n from jd_connector_servers')).rows[0].n,2);});
for(const change of ["role='staff'",`school_id='${elsewhere}'`])test(`callback completion rechecks membership: ${change}`,async()=>{const server=await begin();await db.query(`update profiles set ${change} where id=$1`,[manager]);assert.equal(await finish(server),false);assert.equal((await db.query('select count(*)::int as n from jd_connector_oauth_tokens')).rows[0].n,0);});
test('disconnect blocks pending callbacks and stale discovery; credential deletion is atomic',async()=>{
 const server=await begin();assert.equal(await finish(server),true);assert.equal(await discover(server),true);
 assert.equal((await db.query('select jd_disconnect_connector_oauth($1,$2) as ok',[server,manager])).rows[0].ok,true);
 assert.equal(await finish(server),false);assert.equal(await discover(server),false);for(const table of ['jd_connector_oauth_tokens','jd_connector_tools','jd_connector_credentials'])assert.equal((await db.query(`select count(*)::int as n from ${table}`)).rows[0].n,0);
 assert.equal((await db.query("select * from jd_consume_connector_oauth('state-one')")).rows.length,0);
});
test('private account cannot be disconnected by another manager or tenant',async()=>{const server=await begin();for(const actor of [owner,other])assert.equal((await db.query('select jd_disconnect_connector_oauth($1,$2) as ok',[server,actor])).rows[0].ok,false);});
test('reconnect invalidates older state/generation and does not inherit grants',async()=>{const server=await begin();await finish(server);await discover(server);await db.query("insert into jd_connector_grants(server_id,school_id,access_level,granted_by) values($1,$2,'full_control',$3)",[server,school,owner]);assert.equal(await begin(manager,false,'state-two'),server);assert.equal(await finish(server,manager,1),false);assert.equal(await finish(server,manager,2),true);assert.equal((await db.query('select count(*)::int as n from jd_connector_grants')).rows[0].n,0);});
test('refresh lease serializes rotation and CAS cannot resurrect disconnected credentials',async()=>{
 const server=await begin();await finish(server);const lease=id(30),otherLease=id(31);
 for(const [l,want] of [[lease,true],[otherLease,false]])assert.equal((await db.query('select jd_claim_connector_refresh($1,$2,1,$3) as ok',[server,school,l])).rows[0].ok,want);
 assert.equal((await db.query("select jd_save_connector_refresh($1,$2,1,$3,'new-bundle',null) as ok",[server,school,otherLease])).rows[0].ok,false);
 await db.query('select jd_disconnect_connector_oauth($1,$2)',[server,manager]);assert.equal((await db.query("select jd_save_connector_refresh($1,$2,1,$3,'new-bundle',null) as ok",[server,school,lease])).rows[0].ok,false);
});
for(const role of ['anon','authenticated'])test(`${role} cannot read tokens/state or execute new OAuth RPCs`,async()=>{
 await begin();await db.exec(`set role ${role}`);try{for(const table of ['jd_connector_oauth_tokens','jd_connector_oauth_states'])await assert.rejects(db.query('select * from '+table),/permission denied/);await assert.rejects(db.query("select * from jd_consume_connector_oauth('state-one')"),/permission denied/);}finally{await db.exec('reset role');}
});

test("reconnect cannot expose private history by changing account sharing",async()=>{await begin(owner,false);await assert.rejects(begin(owner,true,"shared-state"),/Sharing scope cannot change/);assert.equal((await db.query("select access_owner_user_id from jd_connector_servers")).rows[0].access_owner_user_id,owner);});

async function paste(actor=manager,provider='github'){
 return (await db.query("select * from jd_save_connector_pasted_token($1,$2,'SYNTHETIC_ENCRYPTED_BUNDLE')",[actor,provider])).rows[0];
}
test('pasted token is private, generation-bound, encrypted storage only, not connected before discovery',async()=>{
 const r=await paste();const s=(await db.query('select * from jd_connector_servers where id=$1',[r.server_id])).rows[0];
 assert.equal(s.access_owner_user_id,manager);assert.equal(s.oauth_provider_id,'token:github');assert.equal(s.status,'error');assert.equal(s.oauth_generation,1);
 assert.equal((await db.query('select expires_at from jd_connector_oauth_tokens')).rows[0].expires_at,null);
 assert.equal(await discover(s.id),true);
});
test('token replacement resets grants, invalidates old discovery and pending OAuth state',async()=>{
 const server=await begin();await finish(server);await discover(server);
 await db.query("insert into jd_connector_grants(server_id,school_id,access_level,granted_by) values($1,$2,'full_control',$3)",[server,school,owner]);
 const r=await paste();assert.equal(r.server_id,server);assert.equal(r.generation,2);assert.equal(await finish(server),false);assert.equal(await discover(server,1),false);assert.equal(await discover(server,2),true);
 assert.equal((await db.query('select count(*)::int as n from jd_connector_grants')).rows[0].n,0);
 assert.equal((await db.query("select * from jd_consume_connector_oauth('state-one')")).rows.length,0);
});
test('token actor checks: another user/shared history cannot be overwritten; tenants remain isolated',async()=>{
 const own=await paste();await assert.rejects(paste(owner),/another user|shared history/);
 const otherTenant=await paste(other);assert.notEqual(own.server_id,otherTenant.server_id);
 await db.exec('truncate jd_connector_servers cascade;');await begin(owner,true);await assert.rejects(paste(owner),/shared history/);
});
test('staff, missing actor and unknown provider fail closed for pasted tokens',async()=>{
 await assert.rejects(paste(staff),/permission/);await assert.rejects(paste(id(999)),/permission/);await assert.rejects(paste(manager,'notion'),/Unsupported/);
 assert.equal((await db.query('select count(*)::int as n from jd_connector_servers')).rows[0].n,0);
});
test('token disconnect blocks stale discovery and removes encrypted credentials',async()=>{
 const r=await paste();await discover(r.server_id);assert.equal((await db.query('select jd_disconnect_connector_oauth($1,$2) as ok',[r.server_id,manager])).rows[0].ok,true);
 assert.equal(await discover(r.server_id,r.generation),false);assert.equal((await db.query('select count(*)::int as n from jd_connector_oauth_tokens')).rows[0].n,0);
});
for(const role of ['anon','authenticated'])test(`${role} cannot call pasted token persistence RPC`,async()=>{
 await db.exec('set role '+role);await assert.rejects(paste(),/permission denied/);await db.exec('reset role');
});
