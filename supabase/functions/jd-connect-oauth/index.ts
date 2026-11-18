import {createClient} from 'npm:@supabase/supabase-js@2';
import {base64Url,sha256Hex,encryptSecret,decryptSecret,importAesKey} from '../_shared/jd-oauth-crypto.ts';
import {connectorOAuthKey,connectorOAuthConfig} from '../_shared/jd-connector-oauth.ts';
import {MCP_OAUTH_PROVIDERS,authorizationUrl,publicHttps,tokenRequest,providerTokenBundle,oauthJson} from '../_shared/jd-connector-oauth-policy.mjs';
const headers={'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
const send=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers});
const page=(message:string,status=200)=>new Response('<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>JD connection</title></head><body><h1>JD Connect</h1><p>'+message+'</p><p>You can close this tab and return to JD. Refresh connections to see the latest status.</p></body></html>',{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",'X-Content-Type-Options':'nosniff'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(!['GET','POST'].includes(req.method))return send({error:'Method not allowed'},405);
 const base=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),anon=Deno.env.get('SUPABASE_ANON_KEY');
 if(!base||!service||!anon)return send({error:'Connector sign-in service is not configured'},503);
 const db=createClient(base,service,{auth:{persistSession:false,autoRefreshToken:false}});
 if(req.method==='GET'){
  try{
   const u=new URL(req.url),state=u.searchParams.get('state')||'';
   if(state.length<32||state.length>128)return page('Invalid sign-in state. Start again in JD.',400);
   const {data,error}=await db.rpc('jd_consume_connector_oauth',{p_state_hash:await sha256Hex(state)}),row=data?.[0];
   if(error||!row)return page('This sign-in expired or was already used. Start again in JD.',400);
   if(u.searchParams.has('error'))return page('You did not approve access. Nothing was connected.',400);
   const code=u.searchParams.get('code');if(!code||code.length>4096)return page('Missing or invalid provider code.',400);
   const {data:profile,error:profileError}=await db.from('profiles').select('school_id,role').eq('id',row.actor_id).maybeSingle();
   if(profileError||profile?.school_id!==row.school_id||!['owner','admin','manager'].includes(profile?.role))return page('Workspace permission changed. Start again with an authorised account.',403);
   const config=connectorOAuthConfig(row.provider_id);
   if(await sha256Hex(JSON.stringify(config))!==row.config_hash)return page('Operator configuration changed. Start sign-in again.',409);
   const key=await importAesKey(connectorOAuthKey()),verifier=await decryptSecret(row.verifier_ciphertext,key);
   const response=await fetch(config.token_endpoint,tokenRequest(config,{grant_type:'authorization_code',code,code_verifier:verifier,redirect_uri:row.redirect_uri}));
   const bundle=providerTokenBundle(row.provider_id,await oauthJson(response));
   const {data:saved,error:saveError}=await db.rpc('jd_finish_connector_oauth',{p_server:row.server_id,p_actor:row.actor_id,p_generation:row.generation,p_bundle:await encryptSecret(JSON.stringify(bundle),key),p_expiry:bundle.expires_at});
   if(saveError||saved!==true)return page('Connection changed or was disconnected. No usable connection was saved. Start again if you still want access.',409);
   // Discovery goes through the same tenant/actor gateway as every other call.
   // Credentials alone are never reported as a working MCP connection.
   const discovery=await fetch(base.replace(/\/$/,'')+'/functions/v1/jd-connect',{method:'POST',headers:{Authorization:'Bearer '+service,'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(45000),body:JSON.stringify({action:'tools.refresh',serverId:row.server_id,internalActorId:row.actor_id})});
   const result=await discovery.json().catch(()=>null);
   if(!discovery.ok||!Array.isArray(result?.tools))return page('Sign-in was saved, but MCP tool discovery failed. No working connection is confirmed. Return to JD to retry discovery or disconnect.',502);
   const {error:auditError}=await db.rpc('jd_business_audit',{p_school_id:row.school_id,p_actor_id:row.actor_id,p_event_type:'connector.oauth.connected',p_event:{server_id:row.server_id,provider_id:row.provider_id,tool_count:result.tools.length}});
   return page(auditError?'Provider connected and tools discovered, but the audit event could not be recorded. Ask your operator to review.':'Provider connected and tools discovered. Tool permissions and human approval still apply.');
  }catch{return page('Sign-in could not be completed safely. Return to JD and reconnect or contact your operator.',502);}
 }
 const bearer=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
 if(!bearer||bearer===service)return send({error:'Sign in as a person to connect an account'},401);
 const auth=createClient(base,anon,{global:{headers:{Authorization:'Bearer '+bearer}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:authData,error:authError}=await auth.auth.getUser(bearer);if(authError||!authData.user)return send({error:'Invalid session'},401);
 const actor=authData.user.id,{data:profile,error:profileError}=await db.from('profiles').select('school_id,role').eq('id',actor).maybeSingle();
 if(profileError||!profile?.school_id||!['owner','admin','manager'].includes(profile.role))return send({error:'Workspace manager permission required'},403);
 try{
  const raw=await req.text();if(raw.length>4000)return send({error:'Request too large'},413);const b=JSON.parse(raw);
  if(b.action==='providers'){
   const providers=Object.entries(MCP_OAUTH_PROVIDERS).map(([id,p])=>{try{const c=connectorOAuthConfig(id);publicHttps(Deno.env.get('JD_MCP_OAUTH_CALLBACK_URL'));if(!connectorOAuthKey())throw Error();return {id,name:p.name,configured:true,scopes:c.scopes};}catch{return {id,name:p.name,configured:false,scopes:[]};}});
   return send({providers});
  }
  if(b.action!=='start')return send({error:'Unknown sign-in action'},400);
  if(b.confirm!==true)return send({error:'Review and confirm the requested connection first'},400);
  if(b.sharing!=='personal'&&b.sharing!=='organisation')return send({error:'Choose personal or organisation access'},400);
  if(b.sharing==='organisation'&&!['owner','admin'].includes(profile.role))return send({error:'Only owners/admins may share an account with the organisation'},403);
  const config=connectorOAuthConfig(b.providerId),redirect=publicHttps(Deno.env.get('JD_MCP_OAUTH_CALLBACK_URL')).toString();
  const key=await importAesKey(connectorOAuthKey()),state=base64Url(crypto.getRandomValues(new Uint8Array(32))),verifier=base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge=base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
  const {error:auditError}=await db.rpc('jd_business_audit',{p_school_id:profile.school_id,p_actor_id:actor,p_event_type:'connector.oauth.requested',p_event:{provider_id:b.providerId,sharing:b.sharing}});
  if(auditError)return send({error:'Could not record connection consent. Nothing was started.'},500);
  const {error}=await db.rpc('jd_begin_connector_oauth',{p_actor:actor,p_provider:b.providerId,p_endpoint:config.endpoint,p_name:MCP_OAUTH_PROVIDERS[b.providerId as keyof typeof MCP_OAUTH_PROVIDERS].name,p_shared:b.sharing==='organisation',p_state_hash:await sha256Hex(state),p_verifier:await encryptSecret(verifier,key),p_config_hash:await sha256Hex(JSON.stringify(config)),p_redirect:redirect});
  if(error)return send({error:'Could not start sign-in. The workspace slot may belong to another account, or the OAuth migration is missing.'},409);
  return send({authorization_url:authorizationUrl(config,{state,challenge,redirect}),authorization_origin:new URL(config.authorization_endpoint).origin});
 }catch{return send({error:'Provider sign-in needs operator configuration. You do not need to find an API key.'},503);}
});
