import {decryptSecret,encryptSecret,importAesKey} from './jd-oauth-crypto.ts';
import {getJdSecret} from './jd-secrets.ts';
import {oauthConfig,tokenRequest,providerTokenBundle,oauthJson} from './jd-connector-oauth-policy.mjs';
export const connectorOAuthKey=()=>Deno.env.get('JD_OAUTH_ENCRYPTION_KEY')||getJdSecret('JD_OAUTH_ENCRYPTION_KEY');
export const connectorOAuthConfig=(id:string)=>oauthConfig(id,Deno.env.get('JD_MCP_OAUTH_CLIENTS_JSON')||'',Deno.env.get('JD_MCP_ALLOWED_HOSTS')||'');
export async function connectorOAuthToken(db:any,server:any,dependencies:any={}){
 const {data:row,error}=await db.from('jd_connector_oauth_tokens').select('bundle_ciphertext,expires_at,generation').eq('server_id',server.id).eq('school_id',server.school_id).eq('generation',server.oauth_generation).maybeSingle();
 if(error||!row)throw Error('Provider sign-in required. Connect again from the directory.');
 const key=await importAesKey(dependencies.key||connectorOAuthKey());
 let stored:any;try{stored=JSON.parse(await decryptSecret(row.bundle_ciphertext,key));}catch{throw Error('Provider credentials could not be read. Reconnect.');}
 const now=dependencies.now??Date.now();
 if(!row.expires_at||Date.parse(row.expires_at)>now+60000)return stored.access_token;
 if(!stored.refresh_token)throw Error('Provider access expired. Sign in again; no API key is needed.');
 const config=(dependencies.config||connectorOAuthConfig)(server.oauth_provider_id),lease=crypto.randomUUID();
 const {data:claimed,error:claimError}=await db.rpc('jd_claim_connector_refresh',{p_server:server.id,p_school:server.school_id,p_generation:server.oauth_generation,p_lease:lease});
 if(claimError||claimed!==true)throw Error('Provider credentials are refreshing or disconnected. Try again shortly.');
 try{
  const response=await (dependencies.fetch||fetch)(config.token_endpoint,tokenRequest(config,{grant_type:'refresh_token',refresh_token:stored.refresh_token}));
  const bundle=providerTokenBundle(server.oauth_provider_id,await oauthJson(response),stored,now);
  const {data:saved,error:saveError}=await db.rpc('jd_save_connector_refresh',{p_server:server.id,p_school:server.school_id,p_generation:server.oauth_generation,p_lease:lease,p_bundle:await encryptSecret(JSON.stringify(bundle),key),p_expiry:bundle.expires_at});
  if(saveError||saved!==true)throw Error('Connection changed during refresh. Sign in again.');
  return bundle.access_token;
 }catch{
  // Failed rotation can have an indeterminate provider outcome. Do not retry the
  // old refresh token automatically or overwrite a newer connection.
  await db.from('jd_connector_servers').update({status:'error',last_error_code:'OAUTH_RECONNECT_REQUIRED'}).eq('id',server.id).eq('school_id',server.school_id).eq('oauth_generation',server.oauth_generation);
  throw Error('Provider refresh could not be confirmed. Sign in again from the directory.');
 }
}

// Prepare before local deletion; never return this object to a browser or log it.
export async function prepareConnectorRevocation(db:any,server:any){
 try{
  const config=connectorOAuthConfig(server.oauth_provider_id);if(!config.revocation_endpoint)return null;
  const {data,error}=await db.from('jd_connector_oauth_tokens').select('bundle_ciphertext').eq('server_id',server.id).eq('school_id',server.school_id).eq('generation',server.oauth_generation).maybeSingle();
  if(error||!data)return null;
  const stored=JSON.parse(await decryptSecret(data.bundle_ciphertext,await importAesKey(connectorOAuthKey())));
  return {url:config.revocation_endpoint,request:tokenRequest(config,{token:stored.refresh_token||stored.access_token,token_type_hint:stored.refresh_token?'refresh_token':'access_token'})};
 }catch{return null;}
}
