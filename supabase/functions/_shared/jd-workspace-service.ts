import {refreshWorkspaceConnection} from "./jd-workspace-refresh.ts";
import {decryptSecret,importAesKey} from './jd-oauth-crypto.ts';
import {getJdSecret} from './jd-secrets.ts';
import {WORKSPACE_SERVICES,WORKSPACE_PROVIDERS,workspaceService,workspaceAccess,workspaceReadRequest,projectWorkspaceResponse} from './jd-workspace-connectors.mjs';
const fields='provider_id,status,scopes,connected_by,token_expires_at,enabled_read_services';
export type WorkspaceContext={admin:any;schoolId:string;userId:string;role:string};
function authorised(ctx:WorkspaceContext){if(!['owner','admin','manager'].includes(ctx.role)||!ctx.schoolId||!ctx.userId)throw Error('Workspace manager permission required.');}
export async function workspaceCatalog(ctx:WorkspaceContext,env=(key:string)=>Deno.env.get(key)){
 authorised(ctx);
 const {data,error}=await ctx.admin.from('jd_business_oauth_connections').select(fields).eq('school_id',ctx.schoolId).eq('connected_by',ctx.userId);
 if(error)throw Error('Workspace connection metadata unavailable. Apply the workspace read-services migration first.');
 return {providers:Object.entries(WORKSPACE_PROVIDERS).map(([id,p]:[string,any])=>({id,name:p.name,configured:Boolean(env(p.clientIdEnv)&&env(p.clientSecretEnv)&&env('JD_OAUTH_CALLBACK_URL')&&getJdSecret('JD_OAUTH_ENCRYPTION_KEY')),services:WORKSPACE_SERVICES.filter(s=>s.provider===id).map(s=>({...s,access:workspaceAccess(s,(data||[]).find((c:any)=>c.provider_id===id),ctx.userId)}))})),notice:'Read-only access belongs to the person who authorised the provider in this workspace. Identity-only OAuth is not app access. No sending, editing, sharing or deleting is implemented.'};
}
async function boundedJson(response:Response){
 const reader=response.body?.getReader();if(!reader)throw Error('Provider returned an empty response.');
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1024*1024){await reader.cancel();throw Error('Provider response too large. Use a smaller record or range.');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw Error('Provider returned invalid JSON.');}
}
export async function readWorkspaceApp(args:any,ctx:WorkspaceContext,dependencies:{fetch?:typeof fetch;key?:string;now?:number}={}){
 authorised(ctx);const service=workspaceService(args.service_id);if(!service)throw Error('Unsupported workspace app.');
 // Validate before touching credentials or the network; arbitrary URLs/actions fail.
 const request=workspaceReadRequest(service.id,args.arguments||{},new Date(dependencies.now??Date.now()));
 const {data:loadedConnection,error}=await ctx.admin.from('jd_business_oauth_connections').select(fields+',encrypted_credentials').eq('school_id',ctx.schoolId).eq('provider_id',service.provider).eq('connected_by',ctx.userId).maybeSingle();
 if(error)throw Error('Could not load workspace connection.');
 let connection=loadedConnection;
 const now=dependencies.now??Date.now();
 // Refresh only an explicitly selected/authorised app, never as a way to bypass
 // missing consent or a different account owner. Recheck scopes after rotation.
 const consent=workspaceAccess(service,{...connection,token_expires_at:new Date(now+3600000).toISOString()},ctx.userId,now);
 if(consent==='read_access'&&connection?.token_expires_at&&Date.parse(connection.token_expires_at)<=now+60000)connection=await refreshWorkspaceConnection(ctx,service.provider,dependencies);
 const access=workspaceAccess(service,connection,ctx.userId,now);
 if(access!=='read_access')throw Error('App read access unavailable: '+access+'. Select this app and reconnect in Connectors.');
 const key=dependencies.key??getJdSecret('JD_OAUTH_ENCRYPTION_KEY');if(!key)throw Error('Provider credential encryption is not configured.');
 let stored:any;try{stored=JSON.parse(await decryptSecret(connection.encrypted_credentials,await importAesKey(key)));}catch{throw Error('Stored provider credentials are unavailable. Reconnect.');}
 if(typeof stored.access_token!=='string'||!stored.access_token)throw Error('Stored provider access token is missing.');
 // Record intent before any external read. Audit records never contain query,
 // record IDs, credentials or returned email/document content.
 const audit=await ctx.admin.rpc('jd_business_audit',{p_school_id:ctx.schoolId,p_actor_id:ctx.userId,p_event_type:'workspace.read.requested',p_event:{service_id:service.id}});
 if(audit.error)throw Error('Could not record read audit. No provider request was made.');
 const response=await (dependencies.fetch||fetch)(request.url,{method:'GET',headers:{Authorization:'Bearer '+stored.access_token,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok){await response.body?.cancel();throw Error(response.status===401||response.status===403?'Provider rejected access. Reconnect with the required permissions.':'Provider read failed (HTTP '+response.status+').');}
 const result=projectWorkspaceResponse(service.id,request,await boundedJson(response));
 if(JSON.stringify(result).length>60000)throw Error('Result exceeds the read limit. Use a smaller range.');
 return {service_id:service.id,...result};
}
