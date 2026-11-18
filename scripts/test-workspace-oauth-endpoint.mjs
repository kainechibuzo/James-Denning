// Actual transformed Edge handlers with synthetic DB/auth/provider transports.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {transformWithOxc} from 'vite';
import * as cryptoHelpers from '../supabase/functions/_shared/jd-oauth-crypto.ts';
import * as contract from '../supabase/functions/_shared/jd-workspace-connectors.mjs';
const key=Buffer.alloc(32,5).toString('base64');
mkdirSync('node_modules/.cache',{recursive:true});const temp=mkdtempSync(resolve('node_modules/.cache/workspace-http-'));
async function factory(name){
 const source=readFileSync(`supabase/functions/${name}/index.ts`,'utf8').replace(/^import .*;\n/gm,'');
 const args=['createClient','getJdSecret','fetch','env','workspaceCatalog','readWorkspaceApp',...Object.keys(cryptoHelpers),...Object.keys(contract)];
 const code=`export function make({${args.join(',')}}){let handler;const Deno={env:{get:k=>env[k]},serve:fn=>handler=fn};${source}\nreturn handler;}`;
 const file=`${temp}/${name}.mjs`;writeFileSync(file,(await transformWithOxc(code,'handler.ts')).code);return (await import(pathToFileURL(file))).make;
}
const platform=await factory('jd-business-platform'),callback=await factory('jd-business-oauth-callback');
after(()=>rmSync(temp,{recursive:true,force:true}));
function fixture({role='manager',school='workspace',user='actor',state=null,existing=null,configured=true,providerResponse=null,deny=false}={}){
 const calls=[];const db={from(table){let filters=[];let operation='select';const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},insert(row){calls.push(['insert',table,row]);return Promise.resolve({});},upsert(row){calls.push(['upsert',table,row]);return Promise.resolve({});},update(row){operation='update';calls.push(['update',table,row]);return q;},then(resolve){calls.push([operation,table,filters]);return Promise.resolve({data:[]}).then(resolve);},async maybeSingle(){calls.push(['read',table,filters]);return {data:table==='profiles'?{school_id:school,role}:table==='jd_business_integration_catalog'?{required_scopes:['openid','email','profile']}:existing};}};return q;},async rpc(name,args){calls.push(['rpc',name,args]);return name==='jd_consume_business_oauth_state'?{data:state?[state]:[]}:{data:null};}};
 const env={SUPABASE_URL:'https://supabase.example.test',SUPABASE_SERVICE_ROLE_KEY:'service',SUPABASE_ANON_KEY:'anon',JD_OAUTH_GOOGLE_CLIENT_ID:'synthetic-id',JD_OAUTH_GOOGLE_CLIENT_SECRET:configured?'synthetic-secret':'',JD_OAUTH_CALLBACK_URL:'https://supabase.example.test/functions/v1/jd-business-oauth-callback'};
 const dependencies={...cryptoHelpers,...contract,createClient:(_url,k)=>k==='anon'?{auth:{getUser:async()=>deny?{data:{user:null},error:{}}:{data:{user:{id:user}}}}}:db,getJdSecret:()=>key,env,workspaceCatalog:async ctx=>{calls.push(['workspaceCatalog',ctx.schoolId,ctx.userId]);return {providers:[]};},readWorkspaceApp:async(args,ctx)=>{calls.push(['readWorkspaceApp',ctx.schoolId,ctx.userId,args]);return {ok:true};},fetch:async(url,options)=>{calls.push(['fetch',url,options]);return new Response(JSON.stringify(providerResponse||{access_token:'PRIVATE_TOKEN',scope:'openid email profile https://www.googleapis.com/auth/gmail.readonly',expires_in:3600}),{status:200});}};
 return {calls,dependencies,post:async body=>platform(dependencies)(new Request('https://jd.example.test',{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify(body)})),get:async query=>callback(dependencies)(new Request('https://jd.example.test/callback?'+query))};
}
test('OAuth start stores encrypted PKCE and selected apps server-side; no token or code-verifier in response',async()=>{
 const f=fixture(),response=await f.post({action:'oauth.start',providerId:'google-workspace',services:['gmail'],school_id:'attacker',actor:'attacker'});assert.equal(response.status,200);
 const body=await response.json(),url=new URL(body.authorization_url);assert.equal(url.origin,'https://accounts.google.com');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.match(url.searchParams.get('scope'),/gmail.readonly/);assert.doesNotMatch(url.searchParams.get('scope'),/drive|calendar|send/);
 const state=f.calls.find(c=>c[0]==='insert'&&c[1]==='jd_business_oauth_states')[2];assert.equal(state.school_id,'workspace');assert.equal(state.actor_id,'actor');assert.deepEqual(state.enabled_read_services,['gmail']);assert.notEqual(state.state_hash,url.searchParams.get('state'));assert.notEqual(state.pkce_verifier_encrypted,url.searchParams.get('code_challenge'));assert.doesNotMatch(JSON.stringify(body),/PRIVATE_TOKEN|code_verifier|synthetic-secret/);assert.equal(f.calls.some(c=>c[0]==='fetch'),false);
});
for(const services of [undefined,[],['outlook'],['send'],['__proto__']])test(`invalid selection ${JSON.stringify(services)} never issues OAuth state`,async()=>{
 const f=fixture();assert.equal((await f.post({action:'oauth.start',providerId:'google-workspace',services})).status,400);assert.equal(f.calls.some(c=>c[0]==='insert'),false);
});
test('missing provider secret and another active account owner block new OAuth state',async()=>{
 for(const [options,status] of [[{configured:false},503],[{existing:{status:'connected',connected_by:'someone-else'}},409]]){const f=fixture(options);assert.equal((await f.post({action:'oauth.start',providerId:'google-workspace',services:['gmail']})).status,status);assert.equal(f.calls.some(c=>c[0]==='insert'),false);}
});
for(const role of ['staff','viewer','contractor'])test(`${role}: handler fails before service or OAuth calls`,async()=>{
 const f=fixture({role});for(const action of ['workspace.read','workspace.catalog','workspace.disconnect','oauth.start'])assert.equal((await f.post({action,providerId:'google-workspace',services:['gmail']})).status,403);
 assert.equal(f.calls.some(c=>['workspaceCatalog','readWorkspaceApp','insert','update','fetch'].includes(c[0])),false);
});
test('invalid JWT cannot load workspace provider metadata',async()=>{const f=fixture({deny:true});assert.equal((await f.post({action:'workspace.catalog'})).status,401);assert.deepEqual(f.calls,[]);});
test('owner workspace actions retain verified actor and tenant, without widening unrelated business APIs',async()=>{
 const f=fixture({role:'owner'});assert.equal((await f.post({action:'workspace.catalog',schoolId:'other',userId:'other'})).status,200);assert.deepEqual(f.calls.find(c=>c[0]==='workspaceCatalog'),['workspaceCatalog','workspace','actor']);assert.equal((await f.post({action:'create',kind:'customers'})).status,403);
});
test('legacy refresh/verify/disconnect cannot manage another person’s Google account',async()=>{
 for(const action of ['oauth.refresh','oauth.verify','oauth.disconnect']){const f=fixture({existing:{connected_by:'someone-else'}});assert.equal((await f.post({action,providerId:'google-workspace'})).status,403);assert.equal(f.calls.some(c=>c[0]==='fetch'||c[0]==='update'),false);}
});
test('local disconnect erases selection and credentials only for current workspace and actor',async()=>{
 const f=fixture();const response=await f.post({action:'workspace.disconnect',providerId:'google-workspace'});assert.equal(response.status,200);const patch=f.calls.find(c=>c[0]==='update'&&c[2]?.status)[2];assert.equal(patch.encrypted_credentials,null);assert.deepEqual(patch.enabled_read_services,[]);
 const filters=f.calls.find(c=>c[0]==='update'&&Array.isArray(c[2]))[2];assert.deepEqual(filters,[['school_id','workspace'],['provider_id','google-workspace'],['connected_by','actor']]);assert.equal(f.calls.some(c=>c[0]==='fetch'),false);
});
const state={id:'state-id',school_id:'workspace',actor_id:'actor',provider_id:'google-workspace',redirect_uri:'https://supabase.example.test/functions/v1/jd-business-oauth-callback',enabled_read_services:['gmail'],pkce_verifier_encrypted:await cryptoHelpers.encryptSecret('synthetic-verifier',await cryptoHelpers.importAesKey(key))};
const query='state=synthetic-state-abcdefghijklmnopqrstuvwxyz&code=synthetic-code';
test('callback rechecks membership then persists encrypted credentials with stored, not URL-supplied, apps',async()=>{
 const f=fixture({state});const response=await f.get(query+'&services=google-drive');assert.equal(response.status,200);const row=f.calls.find(c=>c[0]==='upsert')[2];assert.equal(row.school_id,'workspace');assert.equal(row.connected_by,'actor');assert.deepEqual(row.enabled_read_services,['gmail']);assert.ok(row.scopes.includes('https://www.googleapis.com/auth/gmail.readonly'));assert.doesNotMatch(row.encrypted_credentials,/PRIVATE_TOKEN/);assert.doesNotMatch(await response.text(),/PRIVATE_TOKEN/);
});
for(const opts of [{state:null},{state,school:'moved-workspace'},{state,role:'viewer'}])test(`callback invalid state or changed membership rejects before token exchange: ${JSON.stringify(opts)}`,async()=>{
 const f=fixture(opts);assert.ok((await f.get(query)).status>=400);assert.equal(f.calls.some(c=>c[0]==='fetch'||c[0]==='upsert'),false);
});
test('provider denial consumes state but never stores credentials',async()=>{
 const f=fixture({state});assert.equal((await f.get('state=synthetic-state-abcdefghijklmnopqrstuvwxyz&error=access_denied')).status,400);assert.equal(f.calls.filter(c=>c[0]==='rpc').length,1);assert.equal(f.calls.some(c=>c[0]==='fetch'||c[0]==='upsert'),false);
});
