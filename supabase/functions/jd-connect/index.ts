import {tokenConnector,tokenEndpoint,validateConnectorToken} from "../_shared/jd-connector-token-policy.mjs";
import {connectorOAuthToken,connectorOAuthKey,prepareConnectorRevocation} from "../_shared/jd-connector-oauth.ts";
import {canUseConnector,MCP_OAUTH_PROVIDERS} from "../_shared/jd-connector-oauth-policy.mjs";
import { createClient } from "npm:@supabase/supabase-js@2";
import { decryptSecret, encryptSecret, importAesKey } from "../_shared/jd-oauth-crypto.ts";
import { hasExplicitMcpFailure, hasMeaningfulMcpResult, isReadOnlyTool, parseMcpPayload, validateMcpEndpoint, validateToolName } from "../_shared/jd-mcp-core.ts";

const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
const send=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const safeError=(e:unknown)=>e instanceof Error?e.message:"Connector operation failed";
const asObject=(v:unknown)=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,any>:{};
const clip=(v:unknown,n=4000)=>typeof v==="string"?v.trim().slice(0,n):"";
const MAX_RESULT=90000;

Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return send({error:"Method not allowed"},405);
 const bearer=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
 if(!bearer)return send({error:"Authentication required"},401);
 const declaredLength=Number(req.headers.get("Content-Length")||0);if(declaredLength>120000)return send({error:"Request body exceeds the 120 KB limit"},413);
 let body:any;try{body=await req.json();}catch{return send({error:"Invalid JSON"},400);}if(JSON.stringify(body).length>120000)return send({error:"Request body exceeds the 120 KB limit"},413);
 const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!anon||!service)return send({error:"JD Connect is not configured"},503);
 const internal=bearer===service;
 let actorId="";
 if(internal){actorId=clip(body.internalActorId,64);if(!actorId)return send({error:"Internal actor context is required"},401);}
 else{
  const auth=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${bearer}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:authData,error:authError}=await auth.auth.getUser(bearer);
  if(authError||!authData.user)return send({error:"Invalid session"},401);
  actorId=authData.user.id;
 }
 const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:profile,error:profileError}=await db.from("profiles").select("id,school_id,role").eq("id",actorId).maybeSingle();
 if(profileError||!profile?.school_id)return send({error:"Workspace membership required"},403);
 if(!["owner","admin","manager"].includes(String(profile.role)))return send({error:"Manager permission required for JD Connect"},403);
 const school=profile.school_id,actor=actorId;
 const allowed=(Deno.env.get("JD_MCP_ALLOWED_HOSTS")||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
 const encoded=connectorOAuthKey();
 const key=encoded?await importAesKey(encoded).catch(()=>null):null;
 const requireEncryptionKey=()=>{if(!key)throw new Error("JD_OAUTH_ENCRYPTION_KEY is missing or invalid; configure the 32-byte base64 encryption key before storing credentials or approving write-capable connector calls");return key;};
 const audit=async(type:string,meta:Record<string,unknown>)=>await db.rpc("jd_business_audit",{p_school_id:school,p_actor_id:actor,p_event_type:type,p_event:meta});
 const getServer=async(id:string)=>{
  const {data,error}=await db.from("jd_connector_servers").select("id,school_id,name,endpoint_url,host,status,protocol_version,server_info,oauth_provider_id,access_owner_user_id,oauth_actor_id,oauth_generation,updated_at").eq("id",id).eq("school_id",school).maybeSingle();
  if(error||!data||!canUseConnector(data,actor))throw new Error("Connector not found or not shared with you");return data as any;
 };
 const visibleServerIds=async()=>{
  const {data,error}=await db.from("jd_connector_servers").select("id,access_owner_user_id").eq("school_id",school);
  if(error)throw new Error("Could not check connector visibility");return (data||[]).filter((s:any)=>canUseConnector(s,actor)).map((s:any)=>s.id);
 };
 const getToken=async(id:string,expectedGeneration?:number)=>{
  const server=await getServer(id);
  if(server.oauth_provider_id){if(expectedGeneration!==undefined&&server.oauth_generation!==expectedGeneration)throw new Error("Connection changed before execution. Request approval again.");return connectorOAuthToken(db,server);}
  const {data,error}=await db.from("jd_connector_credentials").select("encrypted_bearer_token").eq("server_id",id).eq("school_id",school).maybeSingle();
  if(error)throw new Error("Could not load connector credentials");
  return data?.encrypted_bearer_token?await decryptSecret(data.encrypted_bearer_token,requireEncryptionKey()):"";
 };
 const rpc=async(endpoint:string,token:string,method:string,params:Record<string,unknown>={},sessionId?:string,onResponse?:(response:Response)=>void,onDispatch?:()=>void)=>{
  // Fixed reviewed token endpoints do not require arbitrary-host setup.
  validateMcpEndpoint(endpoint,tokenEndpoint(endpoint)?[new URL(endpoint).hostname]:allowed);
  const id=crypto.randomUUID(),notification=method.startsWith("notifications/");
  const headers:Record<string,string>={"Content-Type":"application/json","Accept":"application/json, text/event-stream","MCP-Protocol-Version":"2025-06-18"};
  if(token)headers.Authorization=`Bearer ${token}`;if(sessionId)headers["Mcp-Session-Id"]=sessionId;
  onDispatch?.();
  const response=await fetch(endpoint,{method:"POST",headers,redirect:"error",signal:AbortSignal.timeout(15000),body:JSON.stringify(notification?{jsonrpc:"2.0",method,params}:{jsonrpc:"2.0",id,method,params})});
  onResponse?.(response);
  const newSession=response.headers.get("Mcp-Session-Id")||sessionId||"";
  if(response.status===202)return {result:{},sessionId:newSession};
  const raw=await response.text();if(!response.ok)throw new Error(`MCP server returned HTTP ${response.status}`);if(notification)return {result:{},sessionId:newSession};
  const payload=parseMcpPayload(raw,response.headers.get("Content-Type")||"application/json");
  if(payload.error)throw new Error(clip(payload.error.message,300)||"MCP protocol error");
  if(!("result" in payload))throw new Error("MCP server omitted the JSON-RPC result");
  return {result:payload.result,sessionId:newSession};
 };
 const connect=async(server:any,token:string)=>{
  const init=await rpc(server.endpoint_url,token,"initialize",{protocolVersion:"2025-06-18",capabilities:{},clientInfo:{name:"jd-connect",version:"1.0.0"}});
  await rpc(server.endpoint_url,token,"notifications/initialized",{},init.sessionId||undefined).catch(()=>({result:{},sessionId:init.sessionId}));
  return {protocolVersion:clip(init.result.protocolVersion,40)||"2025-06-18",serverInfo:asObject(init.result.serverInfo),sessionId:init.sessionId};
 };
 const refreshTools=async(server:any,token:string)=>{
  const session=await connect(server,token);
  const listed=await rpc(server.endpoint_url,token,"tools/list",{},session.sessionId||undefined);
  if(!Array.isArray(listed.result.tools))throw new Error("MCP server omitted the tool catalogue");
  const raw=listed.result.tools;
  if(raw.length>250)throw new Error("MCP server exposes too many tools (maximum 250)");
  const seenNames=new Set<string>();
  const tools=raw.map((t:any)=>{
   const name=validateToolName(t?.name),schema=asObject(t?.inputSchema),annotations=asObject(t?.annotations);
   if(seenNames.has(name))throw new Error("MCP server returned duplicate tool names");
   if(!Object.keys(schema).length||schema.type!=="object")throw new Error(`MCP tool ${name} has no valid object input schema`);
   seenNames.add(name);
   return {school_id:school,server_id:server.id,name,description:clip(t?.description,4000),input_schema:schema,annotations,read_only:isReadOnlyTool({name,annotations},server.oauth_provider_id)};
  });
  if(server.oauth_provider_id){
   const {data:saved,error}=await db.rpc("jd_save_connector_oauth_discovery",{p_server:server.id,p_school:school,p_generation:server.oauth_generation,p_tools:tools,p_protocol:session.protocolVersion,p_info:session.serverInfo});
   if(error||saved!==true)throw new Error("Connection changed during discovery. Refresh connections.");return tools;
  }
  const {error:deleteError}=await db.from("jd_connector_tools").delete().eq("server_id",server.id).eq("school_id",school);
  if(deleteError)throw new Error("Could not replace connector tool catalogue");
  if(tools.length){const {error}=await db.from("jd_connector_tools").insert(tools);if(error)throw new Error("Could not save discovered MCP tools");}
  const {error:serverUpdateError}=await db.from("jd_connector_servers").update({status:"connected",protocol_version:session.protocolVersion,server_info:session.serverInfo,last_connected_at:new Date().toISOString(),last_error_code:null,updated_at:new Date().toISOString()}).eq("id",server.id).eq("school_id",school);
  if(serverUpdateError)throw new Error("Tools were discovered but connector health could not be persisted");
  return tools;
 };
 const execute=async(server:any,toolName:string,args:Record<string,unknown>,approvalId:string|null)=>{
  const started=Date.now();
  const {data:run,error:insertError}=await db.from("jd_connector_executions").insert({school_id:school,server_id:server.id,approval_id:approvalId,requested_by:actor,tool_name:toolName,status:"running"}).select("id").single();
  if(insertError||!run)throw new Error("Could not create connector execution record");
  let remoteResult:unknown=null;
  let remoteRequestDispatched=false;
  let remoteResponseReceived=false;
  let remoteResultReceived=false;
  let remoteToolRejected=false;
  try{
   const token=await getToken(server.id,server.oauth_generation),session=await connect(server,token);
   const response=await rpc(server.endpoint_url,token,"tools/call",{name:toolName,arguments:args},session.sessionId||undefined,()=>{remoteResponseReceived=true;},()=>{remoteRequestDispatched=true;});
   remoteResultReceived=true;
   remoteResult=response.result;
   const resultObject=asObject(remoteResult);
   if(hasExplicitMcpFailure(remoteResult)){
    remoteToolRejected=true;
    const content=Array.isArray(resultObject.content)?resultObject.content:[];
    const detail=content.map((item:any)=>clip(item?.text,500)).filter(Boolean).join("\\n");
    const remoteFailure=new Error(detail||"Remote MCP tool explicitly reported failure");
    (remoteFailure as Error & {code?:string}).code="MCP_TOOL_ERROR";
    throw remoteFailure;
   }
   if(!hasMeaningfulMcpResult(remoteResult)){
    const missingEvidence=new Error("Provider returned no meaningful result; action is not verified");
    (missingEvidence as Error & {code?:string}).code="MISSING_RESULT_EVIDENCE";
    throw missingEvidence;
   }
   const serialized=JSON.stringify(remoteResult);
   if(serialized.length>MAX_RESULT)throw new Error("Connector result exceeds the 90 KB limit");
   const {error:updateError}=await db.from("jd_connector_executions").update({status:"succeeded",result_json:remoteResult,error_code:null,duration_ms:Date.now()-started,completed_at:new Date().toISOString()}).eq("id",run.id).eq("school_id",school);
   if(updateError)throw new Error("Remote tool returned success, but execution evidence could not be persisted");
   const warnings:string[]=[];
   let approvalStatusPersisted=true;
   if(approvalId){
    const {error:approvalUpdateError}=await db.from("jd_connector_approvals").update({status:"executed",execution_id:run.id}).eq("id",approvalId).eq("school_id",school);
    if(approvalUpdateError){approvalStatusPersisted=false;warnings.push("Execution succeeded and evidence was saved, but approval status could not be updated.");}
   }
   let auditError:unknown=null;
   try{const auditResult=await audit("connector.tool.executed",{server_id:server.id,tool_name:toolName,execution_id:run.id,approval_id:approvalId});auditError=auditResult.error;}
   catch(error){auditError=error;}
   if(auditError)warnings.push("Execution succeeded and evidence was saved, but the audit event could not be recorded.");
   return {executionId:run.id,result:remoteResult,evidence:{persisted:true,source:"jd_connector_executions",audit_recorded:!auditError,approval_status_persisted:approvalStatusPersisted},warnings};
  }catch(e){
   if(/HTTP (401|403)/.test(safeError(e)))await db.from("jd_connector_servers").update({status:"error",last_error_code:server.oauth_provider_id?"OAUTH_RECONNECT_REQUIRED":"CONNECTOR_AUTH_OR_PERMISSION_FAILED",updated_at:new Date().toISOString()}).eq("id",server.id).eq("school_id",school).eq("oauth_generation",server.oauth_generation);
   const code=clip((e as Error & {code?:string})?.code,80)||"MCP_CALL_FAILED";
   const failureMessage=e instanceof Error?e.message:"Connector operation failed";
   // A timeout, dropped connection, empty provider result, or failed evidence write
   // cannot prove that the remote side effect did not happen. Never label it a
   // clean failure that a caller might safely retry.
   const providerRejected=remoteResponseReceived&&!remoteResultReceived&&/MCP server returned HTTP 4\d\d|MCP protocol error/.test(failureMessage);
   const outcomeUnknown=remoteRequestDispatched&&!remoteToolRejected&&!providerRejected;
   const terminalStatus=outcomeUnknown?"outcome_unknown":"failed";
   const outcomeMessage=outcomeUnknown?"The provider may have performed the action, but JD could not verify and save its result. Do not retry automatically; inspect the provider and execution history first.":failureMessage;
   const {error:failureUpdateError}=await db.from("jd_connector_executions").update({status:terminalStatus,result_json:remoteResult,error_code:outcomeUnknown?"REMOTE_OUTCOME_UNCONFIRMED":code,duration_ms:Date.now()-started,completed_at:new Date().toISOString()}).eq("id",run.id).eq("school_id",school);
   if(failureUpdateError)throw new Error(outcomeMessage+"; failed execution evidence could not be persisted");
   if(approvalId){
    const {error:approvalFailureError}=await db.from("jd_connector_approvals").update({status:outcomeUnknown?"outcome_unknown":"failed",execution_id:run.id}).eq("id",approvalId).eq("school_id",school);
    if(approvalFailureError)throw new Error(outcomeMessage+"; approval failure status could not be persisted");
   }
   const {error:auditFailureError}=await audit(outcomeUnknown?"connector.tool.outcome_unknown":"connector.tool.failed",{server_id:server.id,tool_name:toolName,execution_id:run.id,error_code:outcomeUnknown?"REMOTE_OUTCOME_UNCONFIRMED":code});
   if(auditFailureError)throw new Error(outcomeMessage+"; failure audit event could not be persisted");
   if(outcomeUnknown)throw new Error(outcomeMessage);
   throw e;
  }
 };
 try{
  if(body.action==="catalog")return send({protocol:"MCP Streamable HTTP",transport:"HTTPS",approvalPolicy:"OAuth connections require human approval for every untrusted or write-capable tool. Legacy/custom grants retain their existing separate policy.",providers:Object.values(MCP_OAUTH_PROVIDERS).map(p=>p.name),nativeApps:["Google Workspace","Microsoft 365"],hostAllowlistConfigured:allowed.length>0});
  if(body.action==="servers.list"){
   const {data,error}=await db.from("jd_connector_servers").select("id,name,host,endpoint_url,status,protocol_version,server_info,last_connected_at,last_error_code,created_at,oauth_provider_id,access_owner_user_id,oauth_actor_id").eq("school_id",school).order("created_at",{ascending:false});
   if(error)throw error;
   const visible=(data||[]).filter((s:any)=>canUseConnector(s,actor)),ids=visible.map((s:any)=>s.id);
   const {data:grants, error:grantError}=ids.length?await db.from("jd_connector_grants").select("server_id,access_level,granted_by,granted_at,expires_at").eq("school_id",school).in("server_id",ids):{data:[],error:null};
   if(grantError)throw grantError;
   const byServer=new Map((grants||[]).map((g:any)=>[g.server_id,g]));
   return send({servers:visible.map((server:any)=>({...server,grant:byServer.get(server.id)||{access_level:"read_only",granted_at:null,expires_at:null}}))});
  }
  if(body.action==="grants.set"){
   // Connector permissions are a human decision: never from the agent runtime (service-key calls) and only owners/admins may widen access.
   if(internal)return send({error:"Connector permissions must be changed by a signed-in person"},403);
   if(!["owner","admin"].includes(String(profile.role)))return send({error:"Only an owner or admin can change connector permissions"},403);
   const server=await getServer(clip(body.serverId,64));
   if(server.oauth_provider_id&&body.accessLevel!=="read_only")return send({error:"OAuth write actions require per-action human approval"},400);
   const level=body.accessLevel;
   if(!["read_only","read_write","full_control"].includes(level))return send({error:"Access level must be read_only, read_write or full_control"},400);
   const expiresAt=body.expiresAt?new Date(body.expiresAt):null;
   if(expiresAt&&(!Number.isFinite(expiresAt.getTime())||expiresAt.getTime()<=Date.now()))return send({error:"Grant expiry must be a future date"},400);
   const {data:grant,error}=await db.from("jd_connector_grants").upsert({school_id:school,server_id:server.id,access_level:level,granted_by:actor,granted_at:new Date().toISOString(),expires_at:expiresAt?.toISOString()||null},{onConflict:"server_id"}).select("server_id,access_level,granted_by,granted_at,expires_at").single();
   if(error||!grant)throw new Error("Could not persist connector permissions");
   const auditResult=await audit("connector.permissions.granted",{server_id:server.id,access_level:level,expires_at:grant.expires_at});
   if(auditResult.error)throw new Error("Permission was saved but its audit event could not be recorded");
   return send({grant});
  }
  if(body.action==="grants.revoke"){
   const server=await getServer(clip(body.serverId,64));
   const {error}=await db.from("jd_connector_grants").delete().eq("server_id",server.id).eq("school_id",school);
   if(error)throw new Error("Could not revoke connector permissions");
   const auditResult=await audit("connector.permissions.revoked",{server_id:server.id});
   if(auditResult.error)throw new Error("Permission was revoked but its audit event could not be recorded");
   return send({revoked:true,serverId:server.id});
  }
  if(body.action==="servers.public_connect"){
   if(internal||body.confirm!==true)return send({error:"Confirm public access as a signed-in person"},403);
   const presets:Record<string,{name:string;endpoint:string}>={exa:{name:"Exa",endpoint:"https://mcp.exa.ai/mcp"},firecrawl:{name:"Firecrawl",endpoint:"https://mcp.firecrawl.dev/v2/mcp"}};
   if(!Object.hasOwn(presets,body.providerId))return send({error:"No keyless access configured for this provider"},400);
   const preset=presets[body.providerId],endpoint=validateMcpEndpoint(preset.endpoint,allowed);
   const {data:server,error}=await db.from("jd_connector_servers").insert({school_id:school,name:preset.name,endpoint_url:endpoint.toString(),host:endpoint.hostname,status:"error",created_by:actor,access_owner_user_id:actor}).select("id,name,endpoint_url,host").single();
   if(error||!server)throw new Error("Could not register public access; inspect existing connections before retrying");
   try{const tools=await refreshTools(server,"");await audit("connector.public.connected",{server_id:server.id,provider_id:body.providerId});return send({server,tools});}
   catch{throw new Error("Public tool discovery failed. No working connection confirmed. Inspect My connections.");}
  }
  if(body.action==="servers.token_setup"){
   const preset=tokenConnector(body.providerId);
   if(!preset)return send({error:"Token setup is not supported for this service"},400);
   return send({ready:Boolean(key),providerId:body.providerId,error:key?null:"Secure token storage needs operator configuration. Do not paste a token yet."});
  }
  if(body.action==="servers.token_connect"){
   if(internal||body.confirm!==true)return send({error:"Confirm token access as a signed-in person"},403);
   const preset=tokenConnector(body.providerId);
   if(!preset)return send({error:"Token setup is not supported for this service"},400);
   let token:string;try{token=validateConnectorToken(body.bearerToken);}catch{return send({error:"Paste only a valid provider token, without a Bearer prefix or URL."},400);}
   if(!key)return send({error:"Secure token storage is not configured. Contact your workspace operator."},503);
   // Ciphertext only crosses the DB boundary. No plaintext in audit/errors.
   const encrypted=await encryptSecret(JSON.stringify({access_token:token,refresh_token:null,expires_at:null}),key);
   const {data:saved,error:saveError}=await db.rpc("jd_save_connector_pasted_token",{p_actor:actor,p_provider:body.providerId,p_bundle:encrypted});
   if(saveError||!saved?.[0]?.server_id)return send({error:"Could not save this private connection. The endpoint may already belong to another user or shared connection. Check My connections or ask your operator to verify the token backend deployment."},409);
   const id=saved[0].server_id,generation=saved[0].generation;
   try{
    const server=await getServer(id);
    if(server.oauth_generation!==generation)throw Error("Connection changed");
    const tools=await refreshTools(server,token);
    await audit("connector.token.connected",{server_id:id,provider_id:body.providerId,tool_count:tools.length});
    return send({server:{id,name:preset.name,status:"connected"},tools,notice:"Token saved securely and tools discovered."},201);
   }catch{
    // Failed/abandoned discovery never retains this generation's credential or
    // erases a replacement token. Returning a fixed error prevents token echo.
    await db.from("jd_connector_oauth_tokens").delete().eq("server_id",id).eq("school_id",school).eq("generation",generation);
    await db.from("jd_connector_servers").update({status:"error",last_error_code:"TOKEN_DISCOVERY_FAILED"}).eq("id",id).eq("school_id",school).eq("oauth_generation",generation);
    return send({error:"Connection not confirmed. Check the token, its expiry, permissions and organisation approval, then try again. Provider availability may also be the cause."},502);
   }
  }
  if(body.action==="servers.register"){
   if(internal||!["owner","admin"].includes(String(profile.role))||Deno.env.get("JD_MCP_ALLOW_CUSTOM_SETUP")!=="true")return send({error:"Custom credential setup is operator-only. Use provider sign-in in the directory."},403);
   if(!allowed.length)return send({error:"No MCP hosts are enabled. Configure JD_MCP_ALLOWED_HOSTS before registering a server."},503);
   const endpoint=validateMcpEndpoint(body.endpoint,allowed),name=clip(body.name,100);
   if(!name)return send({error:"Connector name is required"},400);
   const token=clip(body.bearerToken,8000);
   if(token&&token.length<12)return send({error:"Bearer token is too short"},400);
   const {data:server,error}=await db.from("jd_connector_servers").insert({school_id:school,name,endpoint_url:endpoint.toString(),host:endpoint.hostname,status:"connected",created_by:actor}).select("id,name,endpoint_url,host").single();
   if(error||!server)throw new Error("Could not register MCP server");
   if(token){const encrypted=await encryptSecret(token,requireEncryptionKey());const {error:credentialError}=await db.from("jd_connector_credentials").insert({server_id:server.id,school_id:school,encrypted_bearer_token:encrypted,key_version:"aes-gcm-v1"});if(credentialError)throw new Error("Could not securely store connector credentials");}
   try{const tools=await refreshTools(server,token);await audit("connector.server.registered",{server_id:server.id,host:endpoint.hostname,tool_count:tools.length});return send({server,tools,notice:"MCP server connected and tools discovered"},201);}
   catch(e){await db.from("jd_connector_servers").update({status:"error",last_error_code:"INITIALIZATION_FAILED"}).eq("id",server.id);throw e;}
  }
  if(body.action==="servers.disconnect"){
   const id=clip(body.serverId,64);const server=await getServer(id);
   if(internal)return send({error:"Disconnect must be requested by a signed-in person"},403);
   if(server.oauth_provider_id){
    const pasted=server.oauth_provider_id.startsWith("token:");
    const revocation=pasted?null:await prepareConnectorRevocation(db,server);
    const {data:done,error}=await db.rpc("jd_disconnect_connector_oauth",{p_server:id,p_actor:actor});
    if(error||done!==true)throw new Error("Could not disconnect safely");
    let revocationAccepted=false;
    if(revocation)try{const response=await fetch(revocation.url,revocation.request);revocationAccepted=response.ok;await response.body?.cancel();}catch{/* Local deletion must never depend on provider availability. */}
    await audit("connector.oauth.disconnected",{server_id:id,local_credentials_erased:true,provider_revocation_accepted:revocationAccepted});
    return send({disconnected:true,providerRevocationAccepted:revocationAccepted,notice:pasted?"Token removed from JD. Revoke it on the provider’s token page too. In-flight requests may still finish.":revocationAccepted?"JD credentials removed. Provider accepted the token revocation request; review its authorised apps to confirm any remaining grants. In-flight requests may still finish.":"JD access and stored credentials removed. Provider revocation was unavailable or unconfirmed; remove JD in the provider’s authorised apps too. In-flight requests may still finish."});
   }
   const [{error:credentialError},{error:toolError},{error:approvalError},{error:serverError}]=await Promise.all([
    db.from("jd_connector_credentials").delete().eq("server_id",id).eq("school_id",school),
    db.from("jd_connector_tools").delete().eq("server_id",id).eq("school_id",school),
    db.from("jd_connector_approvals").update({status:"expired"}).eq("server_id",id).eq("school_id",school).eq("status","pending"),
    db.from("jd_connector_servers").update({status:"disabled",last_error_code:null,updated_at:new Date().toISOString()}).eq("id",id).eq("school_id",school)
   ]);
   if(credentialError||toolError||approvalError||serverError)throw new Error("Could not disconnect MCP server safely");
   await audit("connector.server.disconnected",{server_id:id,host:server.host,credentials_deleted:true});return send({disconnected:true,history_preserved:true});
  }
  if(body.action==="servers.reconnect"){
   if(internal||!["owner","admin"].includes(String(profile.role))||Deno.env.get("JD_MCP_ALLOW_CUSTOM_SETUP")!=="true")return send({error:"Use provider sign-in to reconnect. Custom token setup is operator-only."},403);
   const id=clip(body.serverId,64),token=clip(body.bearerToken,8000);if(token&&token.length<12)return send({error:"Bearer token is too short"},400);
   const server=await getServer(id);
   if(server.oauth_provider_id)return send({error:"Reconnect this provider with OAuth from the directory"},400);
   const credentialResult=token
    ?await db.from("jd_connector_credentials").upsert({server_id:id,school_id:school,encrypted_bearer_token:await encryptSecret(token,requireEncryptionKey()),key_version:"aes-gcm-v1",updated_at:new Date().toISOString()},{onConflict:"server_id"})
    :await db.from("jd_connector_credentials").delete().eq("server_id",id).eq("school_id",school);
   const credentialError=credentialResult.error;
   if(credentialError)throw new Error("Could not securely update connector credentials");
   await db.from("jd_connector_servers").update({status:"connected",last_error_code:null,updated_at:new Date().toISOString()}).eq("id",id).eq("school_id",school);
   const tools=await refreshTools(server,token);await audit("connector.server.reconnected",{server_id:id,host:server.host,tool_count:tools.length});return send({reconnected:true,tools});
  }
  if(body.action==="tools.refresh"){
   const server=await getServer(clip(body.serverId,64)),token=await getToken(server.id,server.oauth_generation);
   try{const tools=await refreshTools(server,token);await audit("connector.tools.refreshed",{server_id:server.id,tool_count:tools.length});return send({tools});}
   catch(e){if(server.oauth_provider_id)await db.from("jd_connector_servers").update({status:"error",last_error_code:/HTTP (401|403)/.test(safeError(e))?"OAUTH_RECONNECT_REQUIRED":"DISCOVERY_FAILED"}).eq("id",server.id).eq("school_id",school).eq("oauth_generation",server.oauth_generation);throw e;}
  }
  if(body.action==="tools.set_read_only"){
   const id=clip(body.toolId,64),enabled=body.enabled===true;
   const {data:tool,error}=await db.from("jd_connector_tools").select("id,server_id,name,annotations").eq("id",id).eq("school_id",school).maybeSingle();
   if(error||!tool)return send({error:"MCP tool not found"},404);
   await getServer(tool.server_id);
   if(internal)return send({error:"Tool trust requires a signed-in person"},403);
   if(enabled&&!isReadOnlyTool({name:tool.name,annotations:asObject(tool.annotations)}))return send({error:"This MCP tool is not explicitly annotated as read-only and cannot be trusted for automatic execution"},400);
   const {error:updateError}=await db.from("jd_connector_tools").update({read_only:enabled}).eq("id",id).eq("school_id",school);
   if(updateError)throw new Error("Could not update tool permission");
   await audit("connector.tool.permission_changed",{tool_id:id,tool_name:tool.name,automatic_read_only:enabled});
   return send({toolId:id,automaticReadOnly:enabled});
  }
  if(body.action==="tools.list"){
   const ids=await visibleServerIds();if(!ids.length)return send({tools:[]});
   const query=db.from("jd_connector_tools").select("id,server_id,name,description,input_schema,annotations,read_only,discovered_at").eq("school_id",school).in("server_id",ids).order("name");
   const serverId=clip(body.serverId,64);if(serverId)query.eq("server_id",serverId);
   const {data,error}=await query;if(error)throw error;return send({tools:data||[]});
  }
  if(body.action==="tools.call"){
   const toolId=clip(body.toolId,64),args=asObject(body.arguments);
   const {data:tool,error}=await db.from("jd_connector_tools").select("id,server_id,name,read_only,annotations,input_schema").eq("id",toolId).eq("school_id",school).maybeSingle();
   if(error||!tool)return send({error:"MCP tool not found"},404);
   const server=await getServer(tool.server_id);
   if(server.status!=="connected")return send({error:"Provider is not connected. Sign in or refresh tools first."},409);
   const {data:grant,error:grantError}=await db.from("jd_connector_grants").select("access_level,expires_at").eq("server_id",server.id).eq("school_id",school).maybeSingle();
   if(grantError)throw new Error("Could not verify connector permissions");
   const activeGrant=grant&&(!grant.expires_at||new Date(grant.expires_at).getTime()>Date.now())?grant:null;
   const level=activeGrant?.access_level||"read_only";
   const readOnly=isReadOnlyTool({name:tool.name,annotations:asObject(tool.annotations)});
   const elevated=level==="read_write"||level==="full_control";
   const unrestricted=level==="full_control";
   const legacyRequiresApproval=!readOnly&&(!elevated||(!unrestricted&&(asObject(tool.annotations).destructiveHint===true||asObject(tool.annotations).openWorldHint===true)));
   const requiresApproval=server.oauth_provider_id?(!readOnly||tool.read_only!==true):legacyRequiresApproval;
   if(requiresApproval){
    const serializedArgs=JSON.stringify({arguments:args,tool_schema:tool.input_schema,server_updated_at:server.updated_at||null,server_endpoint:server.endpoint_url,oauth_generation:server.oauth_generation??null});if(serializedArgs.length>40000)return send({error:"Tool approval details exceed the 40 KB limit"},413);const encrypted=await encryptSecret(serializedArgs,requireEncryptionKey());
    const {data:approval,error:approvalError}=await db.from("jd_connector_approvals").insert({school_id:school,server_id:server.id,requested_by:actor,tool_name:tool.name,arguments_ciphertext:encrypted}).select("id,status,expires_at").single();
    if(approvalError||!approval)return send({error:"Could not create approval request"},500);
    await audit("connector.approval.requested",{server_id:server.id,tool_name:tool.name,approval_id:approval.id});
    return send({requiresApproval:true,approval});
   }
   const result=await execute(server,tool.name,args,null);return send({requiresApproval:false,permissionLevel:level,...result});
  }
  if(body.action==="approvals.list"){
   const ids=await visibleServerIds();if(!ids.length)return send({approvals:[]});
   const {data,error}=await db.from("jd_connector_approvals").select("id,server_id,requested_by,tool_name,arguments_ciphertext,status,resolved_by,resolved_at,expires_at,created_at").eq("school_id",school).in("server_id",ids).eq("status","pending").order("created_at",{ascending:false}).limit(100);
   if(error)throw error;
   const approvals=await Promise.all((data||[]).map(async(row:any)=>({id:row.id,server_id:row.server_id,requested_by:row.requested_by,tool_name:row.tool_name,status:row.status,resolved_by:row.resolved_by,resolved_at:row.resolved_at,expires_at:row.expires_at,created_at:row.created_at,arguments:asObject(asObject(JSON.parse(await decryptSecret(row.arguments_ciphertext,requireEncryptionKey()))).arguments)})));
   return send({approvals});
  }
  if(body.action==="approvals.get"){
   const id=clip(body.approvalId,64);
   if(!id)return send({error:"approvalId is required"},400);
   const {data:approval,error}=await db.from("jd_connector_approvals")
    .select("id,server_id,requested_by,tool_name,status,resolved_by,resolved_at,expires_at,execution_id,created_at")
    .eq("id",id).eq("school_id",school).maybeSingle();
   if(error||!approval)return send({error:"Approval request not found"},404);
   await getServer(approval.server_id);
   let execution=null;
   if(approval.execution_id){
    const {data,error:executionError}=await db.from("jd_connector_executions")
     .select("id,tool_name,status,result_json,error_code,duration_ms,created_at,completed_at")
     .eq("id",approval.execution_id).eq("school_id",school).maybeSingle();
    if(executionError)return send({error:"Approval status was found but execution evidence could not be loaded"},500);
    execution=data||null;
   }
   return send({approval,execution,evidence:{persisted:!!execution,source:"jd_connector_executions"}});
  }
  if(body.action==="approvals.resolve"){
   // Approvals are the human-in-the-loop gate: the agent runtime (service-key calls) must never resolve its own requests.
   if(internal)return send({error:"Approvals must be resolved by a signed-in person"},403);
   const id=clip(body.approvalId,64),decision=body.decision==="approve"?"approved":body.decision==="deny"?"denied":"";
   if(!decision)return send({error:"Decision must be approve or deny"},400);
   const {data:approval,error}=await db.from("jd_connector_approvals").select("*").eq("id",id).eq("school_id",school).eq("status","pending").maybeSingle();
   if(error||!approval)return send({error:"Pending approval not found"},404);
   const approvalServer=await getServer(approval.server_id);
   if(approvalServer.status!=="connected")return send({error:"Provider is no longer connected"},409);
   if(new Date(approval.expires_at).getTime()<Date.now()){await db.from("jd_connector_approvals").update({status:"expired"}).eq("id",id);return send({error:"Approval expired"},410);}
   const {data:claimed,error:claimError}=await db.from("jd_connector_approvals").update({status:decision,resolved_by:actor,resolved_at:new Date().toISOString()}).eq("id",id).eq("school_id",school).eq("status","pending").select("id").maybeSingle();
   if(claimError||!claimed)return send({error:"Approval was already resolved"},409);
   if(decision==="denied"){await audit("connector.approval.denied",{approval_id:id,tool_name:approval.tool_name});return send({approved:false,denied:true});}
   try{
    const server=await getServer(approval.server_id);
    if(server.status!=="connected"||(server.oauth_provider_id&&server.oauth_generation!==approvalServer.oauth_generation))throw new Error("Connection changed after approval. Request approval again.");
    const {data:currentTool,error:currentToolError}=await db.from("jd_connector_tools").select("id,input_schema").eq("school_id",school).eq("server_id",server.id).eq("name",approval.tool_name).maybeSingle();
    if(currentToolError||!currentTool)throw new Error("The approved tool is no longer available on this connection. Refresh tools and request approval again.");
    const raw=asObject(JSON.parse(await decryptSecret(approval.arguments_ciphertext,requireEncryptionKey())));
    if(!raw.arguments||JSON.stringify(raw.tool_schema)!==JSON.stringify(currentTool.input_schema)||raw.server_endpoint!==server.endpoint_url||raw.server_updated_at!==(server.updated_at||null)||raw.oauth_generation!==(server.oauth_generation??null))throw new Error("The connector, permissions or tool definition changed after approval. Request approval again.");
    const args=asObject(raw.arguments);
    const result=await execute(server,approval.tool_name,args,id);return send({approved:true,...result});
   }catch(e){
    // execute() records a confirmed failure or outcome_unknown itself. Only
    // mark failures that happened before an execution record was created.
    await db.from("jd_connector_approvals").update({status:"failed"}).eq("id",id).eq("school_id",school).eq("status","approved");
    throw e;
   }
  }
  if(body.action==="executions.list"){
   const ids=await visibleServerIds();if(!ids.length)return send({executions:[]});
   const {data,error}=await db.from("jd_connector_executions").select("id,server_id,approval_id,requested_by,tool_name,status,result_json,error_code,duration_ms,created_at,completed_at").eq("school_id",school).in("server_id",ids).order("created_at",{ascending:false}).limit(100);
   if(error)throw error;return send({executions:data||[]});
  }
  return send({error:"Unknown JD Connect action"},400);
 }catch(e){
  const message=safeError(e);
  if(message.includes("allowlist")||message.includes("HTTPS")||message.includes("Private,"))return send({error:message},400);
  return send({error:message},500);
 }
});
