// Synthetic encrypted credentials and provider responses; no live accounts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {WORKSPACE_SERVICES,workspaceScopes,selectedWorkspaceServices,workspaceAccess,workspaceReadRequest,projectWorkspaceResponse,validateWorkspaceRedirect} from '../supabase/functions/_shared/jd-workspace-connectors.mjs';
import {readWorkspaceApp,workspaceCatalog} from '../supabase/functions/_shared/jd-workspace-service.ts';
import {encryptSecret,importAesKey} from '../supabase/functions/_shared/jd-oauth-crypto.ts';
import {executeJdMcpTool,getJdMcpToolDefinitions} from '../supabase/functions/_shared/jd-agent-runtime.ts';
import {CONNECTOR_CATALOGUE,PRIORITY_CONNECTOR_IDS} from '../src/connectors/catalogue.mjs';
const now=Date.parse('2026-11-18T10:00:00Z'),key=Buffer.alloc(32,7).toString('base64');
const encrypted=await encryptSecret(JSON.stringify({access_token:'SYNTHETIC_PRIVATE_TOKEN'}),await importAesKey(key));
function fixture({service=WORKSPACE_SERVICES[0],patch={},role='manager',auditError=false,providerStatus=200,payload={messages:[{id:'synthetic-message'}]}}={}){
 const calls=[];const connection={provider_id:service.provider,status:'connected',scopes:service.scopes,connected_by:'actor',enabled_read_services:[service.id],token_expires_at:new Date(now+3600000).toISOString(),encrypted_credentials:encrypted,...patch};
 const q={select(v){calls.push(['select',v]);return q;},eq(k,v){calls.push(['eq',k,v]);return q;},async maybeSingle(){return {data:connection};},then(resolve){return Promise.resolve({data:[connection]}).then(resolve);}};
 const ctx={schoolId:'workspace',userId:'actor',role,admin:{from(t){calls.push(['from',t]);return q;},async rpc(name,args){calls.push(['rpc',name,args]);return {error:auditError?{}:null};}}};
 const dependencies={key,now,fetch:async(url,options)=>{calls.push(['fetch',url,options]);return new Response(JSON.stringify(payload),{status:providerStatus});}};
 return {calls,ctx,dependencies,connection,run:(args={})=>readWorkspaceApp({service_id:service.id,arguments:args},ctx,dependencies)};
}
test('shortlist has every agreed app once, and no duplicate legacy Gmail/Teams entries',()=>{
 assert.equal(PRIORITY_CONNECTOR_IDS.length,22);assert.equal(new Set(PRIORITY_CONNECTOR_IDS).size,22);
 for(const id of PRIORITY_CONNECTOR_IDS)assert.equal(CONNECTOR_CATALOGUE.filter(s=>s.id===id).length,1);
 assert.equal(WORKSPACE_SERVICES.length,11);
});
for(const provider of ['google-workspace','microsoft-365'])test(`${provider}: least-privilege selected scopes only, no write scopes`,()=>{
 const services=WORKSPACE_SERVICES.filter(s=>s.provider===provider);
 for(const s of services){const scopes=workspaceScopes(provider,[s.id]);assert.ok(s.scopes.every(v=>scopes.includes(v)));assert.doesNotMatch(scopes.join(' '),/ReadWrite|\.send|\.compose|chat:write/);assert.deepEqual(selectedWorkspaceServices(provider,[s.id,s.id]),[s.id]);}
 for(const bad of [[],null,['__proto__'],['send'],[WORKSPACE_SERVICES.find(s=>s.provider!==provider).id]])assert.throws(()=>workspaceScopes(provider,bad));
});
for(const service of WORKSPACE_SERVICES)test(`${service.id}: fixed HTTPS GET endpoint and consent/owner/expiry gates`,()=>{
 const request=workspaceReadRequest(service.id,{query:"test')/evil?secret=x"},new Date(now));
 assert.equal(request.method,'GET');const url=new URL(request.url);assert.equal(url.protocol,'https:');assert.ok(['gmail.googleapis.com','www.googleapis.com','sheets.googleapis.com','docs.googleapis.com','graph.microsoft.com'].includes(url.hostname));assert.equal(url.username,'');
 const f=fixture({service});assert.equal(workspaceAccess(service,f.connection,'actor',now),'read_access');
 assert.equal(workspaceAccess(service,f.connection,'other',now),'different_account_owner');
 for(const [patch,expected] of [[{status:'revoked'},'not_connected'],[{enabled_read_services:[]},'not_selected'],[{scopes:[]},'permission_required'],[{token_expires_at:null},'reconnect_required'],[{token_expires_at:new Date(now-1).toISOString()},'reconnect_required']])assert.equal(workspaceAccess(service,{...f.connection,...patch},'actor',now),expected);
});
for(const args of [{url:'https://evil.test'},{method:'POST'},{action:'send'},{resourceId:'../other'},{resourceId:'a/b'},{resourceId:'a?token=x'},{resourceId:'..'}])test(`untrusted route arguments fail before DB/network: ${JSON.stringify(args)}`,async()=>{
 const f=fixture();await assert.rejects(f.run(args));assert.equal(f.calls.length,0);
});
for(const role of ['staff','viewer','contractor','finance','unknown'])test(`${role}: API and actual runtime reject reads before credential lookup`,async()=>{
 const f=fixture({role});await assert.rejects(f.run(),/permission/);assert.equal(f.calls.length,0);
 await assert.rejects(executeJdMcpTool('read_workspace_app',{service_id:'gmail',arguments:{}},f.ctx),/not available/);assert.equal(f.calls.length,0);
});
for(const patch of [{connected_by:'other'},{scopes:[]},{enabled_read_services:[]},{status:'revoked'},{token_expires_at:null}])test(`no provider call with absent permission: ${JSON.stringify(patch)}`,async()=>{
 const f=fixture({patch});await assert.rejects(f.run(),/unavailable/);assert.equal(f.calls.some(c=>c[0]==='fetch'),false);
});
test('actual adapter decrypts only server-side, scopes tenant and owner, audits before bounded GET',async()=>{
 const f=fixture(),result=await f.run();assert.deepEqual(result.messages,[{id:'synthetic-message'}]);assert.equal(result.external_content_is_untrusted,true);
 for(const pair of [['school_id','workspace'],['provider_id','google-workspace'],['connected_by','actor']])assert.ok(f.calls.some(c=>c[0]==='eq'&&c[1]===pair[0]&&c[2]===pair[1]));
 const request=f.calls.find(c=>c[0]==='fetch');assert.equal(request[2].headers.Authorization,'Bearer SYNTHETIC_PRIVATE_TOKEN');assert.equal(request[2].redirect,'error');assert.equal(request[2].method,'GET');assert.ok(f.calls.findIndex(c=>c[0]==='rpc')<f.calls.indexOf(request));
 assert.doesNotMatch(JSON.stringify(result)+JSON.stringify(f.calls.find(c=>c[0]==='rpc')),/SYNTHETIC_PRIVATE_TOKEN|encrypted_credentials/);
});
test('audit failure means no external request',async()=>{const f=fixture({auditError:true});await assert.rejects(f.run(),/audit/);assert.equal(f.calls.some(c=>c[0]==='fetch'),false);});
for(const status of [401,403,429,500])test(`HTTP ${status} remains failure without provider error/secret leakage`,async()=>{const f=fixture({providerStatus:status,payload:{error:'PRIVATE_PROVIDER_DETAILS'}});await assert.rejects(f.run(),e=>!e.message.includes('PRIVATE_PROVIDER_DETAILS'));});
test('provider response body limit enforced',async()=>{const f=fixture({payload:{data:'x'.repeat(1024*1024)}});await assert.rejects(f.run(),/too large/);});
test('Gmail projection excludes raw body, attachments and provider error fields',()=>{
 const request=workspaceReadRequest('gmail',{resourceId:'123'});const result=projectWorkspaceResponse('gmail',request,{id:'123',raw:'PRIVATE',snippet:'Preview',payload:{body:{data:'PRIVATE'},headers:[{name:'Subject',value:'Example'},{name:'Authentication-Results',value:'PRIVATE'}]}});assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);assert.equal(result.headers.length,1);
});
test('Sheets output is row/column/cell bounded, Docs output is text only',()=>{
 const r=projectWorkspaceResponse('google-sheets',{resource:true},{values:Array.from({length:100},()=>Array(40).fill('x'.repeat(2000)))});assert.equal(r.values.length,50);assert.equal(r.values[0].length,26);assert.equal(r.values[0][0].length,1000);
 const d=projectWorkspaceResponse('google-docs',{resource:true},{title:'Example',body:{content:[{paragraph:{elements:[{textRun:{content:'Hello'}}]}}]},secret:'PRIVATE'});assert.equal(d.text,'Hello');assert.doesNotMatch(JSON.stringify(d),/PRIVATE/);
});
test('provider redirect allowlist blocks arbitrary destinations and missing PKCE/state',()=>{
 const good='https://accounts.google.com/o/oauth2/v2/auth?state=synthetic&code_challenge_method=S256';assert.equal(validateWorkspaceRedirect('google-workspace',good),good);
 for(const url of ['https://evil.test','javascript:alert(1)','https://accounts.google.com/evil?state=a&code_challenge_method=S256',good.replace('accounts.google.com','accounts.google.com.evil.test'),good.replace('state=synthetic&','')])assert.throws(()=>validateWorkspaceRedirect('google-workspace',url));
});
test('runtime inventory exposes both read tools, catalog contains no credential columns',async()=>{
 const f=fixture();assert.ok(getJdMcpToolDefinitions(f.ctx).some(t=>t.name==='read_workspace_app'));
 const old=globalThis.Deno;globalThis.Deno={env:{get:()=>''}};try{const result=await workspaceCatalog(f.ctx,()=> '');assert.equal(result.providers.length,2);assert.equal(result.providers[0].configured,false);assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_PRIVATE_TOKEN|encrypted_credentials/);assert.ok(f.calls.filter(c=>c[0]==='select').every(c=>!c[1].includes('encrypted_credentials')));}finally{globalThis.Deno=old;}
});
