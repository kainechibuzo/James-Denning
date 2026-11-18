import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshWorkspaceConnection} from '../supabase/functions/_shared/jd-workspace-refresh.ts';
import {readWorkspaceApp} from '../supabase/functions/_shared/jd-workspace-service.ts';
import {encryptSecret,importAesKey} from '../supabase/functions/_shared/jd-oauth-crypto.ts';
const key=Buffer.alloc(32,4).toString('base64'),now=Date.parse('2026-11-18T10:00:00Z'),gmail='https://www.googleapis.com/auth/gmail.readonly';
async function fixture({claim=true,save=true,owner='actor',status='connected',scope=gmail,providerStatus=200}={}){
 const calls=[];const row={provider_id:'google-workspace',status,connected_by:owner,scopes:[gmail],enabled_read_services:['gmail'],token_expires_at:new Date(now-1000).toISOString(),encrypted_credentials:await encryptSecret(JSON.stringify({access_token:'old',refresh_token:'synthetic-old-refresh'}),await importAesKey(key))};
 const q={select(){return q;},eq(k,v){calls.push(['eq',k,v]);return q;},async maybeSingle(){return{data:row};}};
 const ctx={role:'manager',schoolId:'workspace',userId:'actor',admin:{from(){return q;},async rpc(name,args){calls.push(['rpc',name,args]);return{data:name==='jd_claim_workspace_refresh'?claim:save};}}};
 const deps={key,now,env:()=> 'synthetic-app-value',fetch:async(url,req)=>{calls.push(['fetch',url,req]);return new Response(JSON.stringify(url.includes('/token')?{access_token:'new',refresh_token:'rotated',expires_in:3600,scope}:{messages:[{id:'example'}]}),{status:providerStatus});}};
 return {calls,ctx,deps,run:()=>refreshWorkspaceConnection(ctx,'google-workspace',deps)};
}
test('native refresh securely rotates tokens and keeps personal selected-app consent',async()=>{const f=await fixture(),row=await f.run();assert.deepEqual(row.enabled_read_services,['gmail']);assert.equal(row.connected_by,'actor');assert.equal(row.token_expires_at,new Date(now+3600000).toISOString());assert.doesNotMatch(row.encrypted_credentials,/rotated/);assert.equal(f.calls.find(c=>c[1]==='jd_save_workspace_refresh')[2].p_actor,'actor');});
for(const options of [{claim:false},{save:false},{owner:'other'},{status:'revoked'},{providerStatus:401}])test(`native refresh fails closed: ${JSON.stringify(options)}`,async()=>{const f=await fixture(options);await assert.rejects(f.run());if(options.claim===false||options.owner||options.status)assert.equal(f.calls.some(c=>c[0]==='fetch'),false);});
test('authorised read automatically refreshes expired credentials then uses new access token',async()=>{const f=await fixture();const result=await readWorkspaceApp({service_id:'gmail',arguments:{}},f.ctx,f.deps);assert.equal(result.messages[0].id,'example');const read=f.calls.find(c=>c[0]==='fetch'&&c[1].includes('gmail.googleapis.com'));assert.equal(read[2].headers.Authorization,'Bearer new');});
test('narrower refreshed scopes block content read',async()=>{const f=await fixture({scope:'openid email'});await assert.rejects(readWorkspaceApp({service_id:'gmail',arguments:{}},f.ctx,f.deps),/permission_required/);assert.equal(f.calls.some(c=>c[0]==='fetch'&&c[1].includes('gmail.googleapis.com')),false);});
