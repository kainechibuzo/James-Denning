import {decryptSecret,encryptSecret,importAesKey} from './jd-oauth-crypto.ts';
import {getJdSecret} from './jd-secrets.ts';
import {WORKSPACE_PROVIDERS} from './jd-workspace-connectors.mjs';
import {oauthJson,tokenBundle,tokenRequest} from './jd-connector-oauth-policy.mjs';
export async function refreshWorkspaceConnection(ctx:any,providerId:string,dependencies:any={}){
 if(!['owner','admin','manager'].includes(ctx.role)||!Object.hasOwn(WORKSPACE_PROVIDERS,providerId))throw Error('Workspace refresh is not authorised.');
 const {data:row,error}=await ctx.admin.from('jd_business_oauth_connections').select('provider_id,status,scopes,connected_by,enabled_read_services,token_expires_at,encrypted_credentials').eq('school_id',ctx.schoolId).eq('provider_id',providerId).eq('connected_by',ctx.userId).maybeSingle();
 if(error||row?.status!=='connected'||row.connected_by!==ctx.userId||!row.encrypted_credentials)throw Error('No active personal connection to refresh.');
 const key=await importAesKey(dependencies.key||getJdSecret('JD_OAUTH_ENCRYPTION_KEY'));
 const stored=JSON.parse(await decryptSecret(row.encrypted_credentials,key));if(!stored.refresh_token)throw Error('Provider did not issue offline access. Sign in again.');
 const env=dependencies.env||((k:string)=>Deno.env.get(k));
 const provider=WORKSPACE_PROVIDERS[providerId as keyof typeof WORKSPACE_PROVIDERS],client=env(provider.clientIdEnv),secret=env(provider.clientSecretEnv);
 if(!client||!secret)throw Error('Operator provider configuration is missing.');
 const {error:auditError}=await ctx.admin.rpc('jd_business_audit',{p_school_id:ctx.schoolId,p_actor_id:ctx.userId,p_event_type:'workspace.oauth.refresh_requested',p_event:{provider_id:providerId}});
 if(auditError)throw Error('Could not record refresh audit.');
 const lease=crypto.randomUUID(),base={p_school:ctx.schoolId,p_actor:ctx.userId,p_provider:providerId,p_previous:row.encrypted_credentials,p_lease:lease};
 const {data:claimed,error:claimError}=await ctx.admin.rpc('jd_claim_workspace_refresh',base);
 if(claimError||claimed!==true)throw Error('Connection is refreshing or changed. Try again shortly.');
 try{
  const config={client_id:client,client_secret:secret,token_endpoint_auth_method:'client_secret_post'};
  const endpoint=providerId==='google-workspace'?'https://oauth2.googleapis.com/token':'https://login.microsoftonline.com/common/oauth2/v2.0/token';
  const payload=await oauthJson(await (dependencies.fetch||fetch)(endpoint,tokenRequest(config,{grant_type:'refresh_token',refresh_token:stored.refresh_token})));
  const bundle=tokenBundle(payload,{...stored,scope:(row.scopes||[]).join(' ')},dependencies.now??Date.now());
  if(!bundle.expires_at)throw Error('Missing provider expiry.');
  const scopes=bundle.scope.split(/[ ,]+/).filter(Boolean),encrypted=await encryptSecret(JSON.stringify(bundle),key);
  const {data:saved,error:saveError}=await ctx.admin.rpc('jd_save_workspace_refresh',{...base,p_bundle:encrypted,p_expiry:bundle.expires_at,p_scopes:scopes});
  if(saveError||saved!==true)throw Error('Connection changed during refresh.');
  return {...row,encrypted_credentials:encrypted,token_expires_at:bundle.expires_at,scopes};
 }catch{throw Error('Provider refresh could not be confirmed. Sign in again.');}
}
