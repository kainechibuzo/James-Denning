import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MCP_OAUTH_PROVIDERS,oauthProviderId,oauthConfig,authorizationUrl,tokenRequest,tokenBundle,providerTokenBundle,oauthJson,publicHttps,canUseConnector} from '../supabase/functions/_shared/jd-connector-oauth-policy.mjs';
import {connectorOAuthToken} from '../supabase/functions/_shared/jd-connector-oauth.ts';
import {encryptSecret,importAesKey} from '../supabase/functions/_shared/jd-oauth-crypto.ts';
import logos from '../src/connectors/logos.json' with {type:'json'};
import {PRIORITY_CONNECTOR_IDS} from '../src/connectors/catalogue.mjs';
const hosts='github.com,api.githubcopilot.com';
const registration={client_id:'synthetic-client',authorization_endpoint:'https://github.com/login/oauth/authorize',token_endpoint:'https://github.com/login/oauth/access_token',client_secret:'SYNTHETIC_SECRET',scopes:['repo'],token_endpoint_auth_method:'client_secret_post'};
const config=oauthConfig('github',JSON.stringify({github:registration}),hosts);
test('all agreed OAuth providers are explicit, Jira/Confluence share one provider',()=>{assert.equal(Object.keys(MCP_OAUTH_PROVIDERS).length,13);for(const id of ['github','slack','notion','vercel','airtable','supabase','cloudflare','linear'])assert.equal(oauthProviderId(id),id);assert.equal(oauthProviderId('jira'),'atlassian');assert.equal(oauthProviderId('confluence'),'atlassian');for(const id of ['resend','constructor','__proto__'])assert.equal(oauthProviderId(id),null);});
for(const url of ['http://github.com/auth','https://user:pass@github.com/auth','https://127.0.0.1/auth','https://[::1]/','https://localhost','https://service.internal','https://service.local','https://github.com:8443/auth','https://github.com/auth#x'])test(`reject unsafe OAuth URL ${url}`,()=>assert.throws(()=>publicHttps(url)));
for(const patch of [{token_endpoint:'https://evil.test/token'},{authorization_endpoint:'https://github.com/login?secret=x'},{resource:'https://other.test/mcp'},{authorization_parameters:{redirect_uri:'https://evil.test'}},{scopes:['repo send']},{token_endpoint_auth_method:'client_secret_jwt'},{client_secret:''}])test(`operator config fails closed ${JSON.stringify(patch)}`,()=>assert.throws(()=>oauthConfig('github',JSON.stringify({github:{...registration,...patch}}),hosts)));
test('OAuth unavailable rather than a token fallback when app registration is missing',()=>assert.throws(()=>oauthConfig('github','{}',hosts),/No API key/));
test('PKCE/state/resource and reviewed scopes are used, secrets never enter browser authorization URL',()=>{
 const url=new URL(authorizationUrl(config,{state:'random-state',challenge:'pkce-hash',redirect:'https://jd.example.test/callback'}));assert.equal(url.searchParams.get('state'),'random-state');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('scope'),'repo');assert.doesNotMatch(url.toString(),/SYNTHETIC_SECRET|client_secret|code_verifier/);
 const req=tokenRequest(config,{grant_type:'authorization_code',code:'code',code_verifier:'verifier'});assert.equal(req.redirect,'error');assert.equal(req.body.get('client_secret'),'SYNTHETIC_SECRET');assert.equal(req.body.get('code_verifier'),'verifier');
});
for(const method of ['none','client_secret_post','client_secret_basic'])test(`OAuth token client authentication: ${method}`,()=>{
 const req=tokenRequest({...config,token_endpoint_auth_method:method},{grant_type:'refresh_token',refresh_token:'synthetic-refresh'});assert.equal(Boolean(req.headers.Authorization),method==='client_secret_basic');assert.equal(req.body.has('client_secret'),method==='client_secret_post');
});
test('expiry and rotation validated; omitted new refresh token preserves existing token',()=>{
 assert.equal(tokenBundle({access_token:'fresh',expires_in:60},{refresh_token:'previous'},0).refresh_token,'previous');assert.equal(tokenBundle({access_token:'fresh',expires_in:60},null,0).expires_at,'1970-01-01T00:01:00.000Z');assert.equal(tokenBundle({access_token:'non-expiring'}).expires_at,null);
 for(const p of [{},{error:'private_error'},{access_token:'bad\r\nheader'},{access_token:'ok',token_type:'MAC'},{access_token:'ok',expires_in:-1},{access_token:'ok',expires_in:'bad'}])assert.throws(()=>tokenBundle(p));
});
test('OAuth errors are sanitized and JSON responses bounded',async()=>{
 await assert.rejects(oauthJson(new Response('PRIVATE_TOKEN',{status:400})),e=>!e.message.includes('PRIVATE_TOKEN'));
 await assert.rejects(oauthJson(new Response('x'.repeat(65537))),/limit/);
 await assert.rejects(oauthJson(new Response('not json')),/invalid/);
});
test('private/shared access check never shares a private account with another manager',()=>{assert.equal(canUseConnector({access_owner_user_id:'a'},'a'),true);assert.equal(canUseConnector({access_owner_user_id:'a'},'b'),false);assert.equal(canUseConnector({access_owner_user_id:null},'b'),true);assert.equal(canUseConnector(null,'b'),false);});
test('every priority service has a real sourced local logo, not generated initials',()=>{
 for(const id of PRIORITY_CONNECTOR_IDS){assert.ok(logos[id],id);const svg=readFileSync('public'+logos[id].file,'utf8');assert.match(svg,/<svg/);assert.doesNotMatch(svg,/<script|<foreignObject|href=/i);assert.ok(logos[id].source);}
 assert.equal(logos.github.file,'/connectors/github.svg');
});
const key=Buffer.alloc(32,9).toString('base64'),now=Date.parse('2026-11-18T10:00:00Z');
async function refreshFixture({claim=true,save=true,expiry=new Date(now-1000).toISOString(),refresh='old-refresh',status=200}={}){
 const calls=[],cipher=await encryptSecret(JSON.stringify({access_token:'old-access',refresh_token:refresh}),await importAesKey(key));
 const q={select(){return q;},eq(k,v){calls.push(['eq',k,v]);return q;},update(v){calls.push(['update',v]);return q;},async maybeSingle(){return{data:{bundle_ciphertext:cipher,expires_at:expiry,generation:2}};},then(resolve){return Promise.resolve({}).then(resolve);}};
 const db={from(){return q;},async rpc(name,args){calls.push(['rpc',name,args]);return{data:name==='jd_claim_connector_refresh'?claim:save};}};
 const server={id:'server',school_id:'workspace',oauth_generation:2,oauth_provider_id:'github'};
 return{calls,run:()=>connectorOAuthToken(db,server,{key,now,config:()=>config,fetch:async(url,req)=>{calls.push(['fetch',url,req]);return new Response(JSON.stringify({access_token:'new-access',refresh_token:'rotated-refresh',expires_in:3600}),{status});}})};
}
test('expired token refreshes once, stores encrypted rotated credentials with generation/lease CAS',async()=>{const f=await refreshFixture();assert.equal(await f.run(),'new-access');assert.equal(f.calls.filter(c=>c[0]==='fetch').length,1);const saved=f.calls.find(c=>c[1]==='jd_save_connector_refresh')[2];assert.equal(saved.p_generation,2);assert.doesNotMatch(saved.p_bundle,/new-access|rotated-refresh/);assert.ok(saved.p_lease);});
for(const options of [{claim:false},{refresh:null},{save:false},{status:401}])test(`failed/contended refresh is not a connection success ${JSON.stringify(options)}`,async()=>{const f=await refreshFixture(options);await assert.rejects(f.run());if(options.claim===false||options.refresh===null)assert.equal(f.calls.some(c=>c[0]==='fetch'),false);});
test('unexpired access token needs no refresh request',async()=>{const f=await refreshFixture({expiry:new Date(now+3600000).toISOString()});assert.equal(await f.run(),'old-access');assert.equal(f.calls.some(c=>c[0]==='fetch'),false);});

test('Slack uses documented confidential user OAuth, not legacy bot-token endpoints',()=>{
 const slack={...registration,authorization_endpoint:'https://slack.com/oauth/v2_user/authorize',token_endpoint:'https://slack.com/api/oauth.v2.user.access',scopes:['channels:history'],scope_separator:','};
 assert.equal(oauthConfig('slack',JSON.stringify({slack}),'slack.com,mcp.slack.com').token_endpoint,slack.token_endpoint);
 assert.throws(()=>oauthConfig('slack',JSON.stringify({slack:{...slack,token_endpoint:'https://slack.com/api/oauth.v2.access'}}),'slack.com,mcp.slack.com'),/user-token/);
 assert.throws(()=>oauthConfig('slack',JSON.stringify({slack:{...slack,token_endpoint_auth_method:'none'}}),'slack.com,mcp.slack.com'),/confidential/);
 const payload={ok:true,access_token:'synthetic-user-token',token_type:'user',authed_user:{scope:'channels:history,users:read'}};
 assert.equal(providerTokenBundle('slack',payload).token_type,'Bearer');assert.equal(providerTokenBundle('slack',payload).scope,'channels:history,users:read');assert.throws(()=>providerTokenBundle('github',payload),/unsupported token type/);
});

test("GitHub remote OAuth requires operator-registered confidential credentials, never a public-client fallback",()=>{assert.throws(()=>oauthConfig("github",JSON.stringify({github:{...registration,token_endpoint_auth_method:"none"}}),hosts),/registered confidential/);});
