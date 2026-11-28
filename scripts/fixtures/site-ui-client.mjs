import {MCP_OAUTH_PROVIDERS} from '../../supabase/functions/_shared/jd-connector-oauth-policy.mjs';
import {WORKSPACE_SERVICES,WORKSPACE_PROVIDERS} from '../../supabase/functions/_shared/jd-workspace-connectors.mjs';
import {populatedAutomation,populatedBusiness} from "./populated-theme.mjs";
import {conversationTasks,conversationHistory} from "./conversation-records.mjs";
// Local rendering fixture only. Unknown calls fail closed; the populated-chat
// test can explicitly enable a synthetic submit acknowledgement (never a real job).
// No credentials, external endpoints or production records.
export const user={id:'ui-admin',_authUserId:'ui-admin',role:'admin',name:'Kaine Denning',email:'owner@example.test',school_id:'ui-workspace'};
export const school={id:'ui-workspace',name:'Reference workspace',plan:'free',student_id_prefix:'JD'};
const settings={school_name:school.name,workspace_type:'business',inactivity_timeout_minutes:'0',name_order:'FML',name_case:'title'};
const record=(kind,name,args)=>{window.__siteCalls??=[];window.__siteCalls.push({kind,name,args});};
const fail=name=>{window.__siteUnexpected??=[];window.__siteUnexpected.push(name);return{error:{message:'UI fixture does not implement '+name}};};
// RPC is deliberately stubbed, never faked as success: the workspace shell
// records route telemetry with supabase.rpc(...), and the admin dashboard reads
// its intelligence snapshot. A fixture without it crashes the whole shell with
// "supabase.rpc is not a function", which is what CI hit. Reads that render a
// page therefore answer with an explicit "not implemented" error the UI must
// surface; the fire-and-forget telemetry call is recorded and ignored like the
// real client does when the call fails.
const rpcResponses={
 jd_admin_intelligence_snapshot:()=>({error:{message:'UI fixture does not implement rpc.jd_admin_intelligence_snapshot'}}),
};
export const rpcCalls=[];
const rpc=(name,args={})=>{rpcCalls.push({name,args});window.__siteRpcCalls=rpcCalls;return Promise.resolve(rpcResponses[name]?rpcResponses[name](args):{data:null,error:null});};
const emptyReads=['getAdminNotifications','getNotifications','getRolePermissions','getUserPermissions','getPermissionAuditLog','getEmailBatches','getHiringRolesWithCounts','getHiringApplications','getHires','getOrgTools','getAdminAuditLog'];
const reads={
 getSettings:()=>({data:Object.entries(settings).map(([key,value])=>({key,value}))}),
 getSchool:()=>({data:school}),
 getNotifConfig:()=>({data:null}),getDigestConfig:()=>({data:null}),
 getEmailLogs:()=>({data:[{id:'sample-log',subject:'Sample delivery record',status:'sent',recipient_count:1,delivered_count:1,failed_count:0,sent_at:'2026-11-16T12:00:00Z',created_at:'2026-11-16T12:00:00Z',recipient_email:'recipient@example.test',body:'Synthetic delivery log. Not an actual email.'}]}),
 getOrgPresets:()=>({data:[{key:'business',name:'General business',label:'General business',description:'Synthetic preset for local layout testing.',tools:['core']}]}),
 publicGetRoleBySlug:()=>({data:{id:'sample-role',title:'Sample operations role',org_name:school.name,summary:'Synthetic public application layout.',description:'Review the role and submit the application form. This is a local UI fixture, not an advertised vacancy.',expectations:'Example responsibilities',status:'published'}}),
};
for(const name of emptyReads)reads[name]=()=>({data:[]});
export const db=new Proxy({setSchool:()=>{}},{get(target,name){if(name in target)return target[name];return async(...args)=>{record('db',name,args);return name in reads?reads[name](...args):fail('db.'+name);};}});
const automation={
 'history.list':{conversations:[]},'projects.list':{projects:[]},'approvals.list':{approvals:[]},'operations.task.list':{tasks:[]},'operations.team.list':{members:[]},
 'intelligence.snapshot':{},'capabilities.report':{capabilities:[]},'organisation.blueprints.list':{blueprints:[]},'hiring.pipeline.list':{requisitions:[],candidates:[]},
 'workflow.draft.list':{workflows:[]},'workflows.list':{workflows:[]},'workflow.list':{workflows:[]},'operations.schedule.list':{schedules:[]},'operations.assignment.member.list':{members:[]},
 'execution.monitor.list':{runs:[],jobs:[],steps:[]},'runs.list':{runs:[]},'usage.summary':{summary:null},'organisation.departments.list':{departments:[]},
 'foundation.list':{documents:[]},'foundation.research.status':{configured:false,releaseEnabled:false,lastSuccessfulTest:null,attempts:[]},'registry.list':{definitions:[]},
};
const business={overview:{counts:{},pipeline_by_currency:[],revenue_won_by_currency:[],approved_expenses_by_currency:[],weighted_pipeline_by_currency:[],renewals:[],data_notice:'Synthetic empty records, not live metrics.'},list:{items:[]},'health.scorecard':{},'performance.predict':{},'cashflow.analytics':{transactions:[]},'cashflow.reconciliation.list':{rows:[]},'sla.policy.list':{policies:[]},'revenue.analytics':{},'budget.analytics':{budgets:[]},'kpi.trends':{months:[],movement:{},series:{new_opportunities:[],won_opportunities_created:[],resolved_support_cases:[],new_customers:[]},limitations:['Synthetic empty KPI fixture.']},'integration.catalog':{integrations:[],service_checks:[],service_alerts:[]}};
export const supabase={
 auth:{
  getSession:async()=>({data:{session:{user}}}),
  signInWithPassword:async()=>({error:{message:'Synthetic sign-in failure — no live account was contacted.'}}),
  resetPasswordForEmail:async()=>({data:{}}),
  updateUser:async()=>fail('auth.updateUser'),
  signOut:async()=>fail('auth.signOut'),
  oauth:{getAuthorizationDetails:async()=>({data:{client_name:'Synthetic client',scope:'openid profile'}}),approveAuthorization:async()=>fail('oauth.approve'),denyAuthorization:async()=>fail('oauth.deny')},
 },
 functions:{invoke:async(name,{body})=>{
  record('edge',name,body);
  if(name==='jd-connect'&&body.action==='servers.token_setup')return window.__tokenSetupFailure?{error:{message:'synthetic failure'}}:{data:{ready:true,providerId:body.providerId}};
  if(name==='jd-connect'&&body.action==='servers.token_connect'){
   if(window.__holdTokenRequest)await new Promise(resolve=>{window.__releaseTokenRequest=resolve;});
   if(!window.__tokenSuccess)return{error:{message:'Untrusted reflection '+body.bearerToken}};
   window.__sampleServers=[{id:'token-server',name:'GitHub',host:'api.githubcopilot.com',endpoint_url:'https://api.githubcopilot.com/mcp/',status:'connected',oauth_provider_id:'token:github',access_owner_user_id:'synthetic-owner'}];
   return{data:{server:window.__sampleServers[0],tools:[]}};
  }
  if(name==='jd-connect-oauth'){
   if(body.action==='providers')return window.__oauthBackendError?{error:{name:'FunctionsFetchError',message:'Failed to send a request to the Edge Function'}}:{data:{providers:Object.entries(MCP_OAUTH_PROVIDERS).map(([id,p])=>({id,name:p.name,configured:Boolean(window.__oauthConfigured),scopes:['synthetic:read']}))}};
   if(body.action==='start')return window.__oauthSuccess?{data:{authorization_url:'https://github.com/login/oauth/authorize?state=synthetic&code_challenge_method=S256',authorization_origin:'https://github.com'}}:{error:{message:'Synthetic provider sign-in failure; no provider contacted'}};
  }
  if(name==='jd-business-platform'&&body.action==='workspace.catalog')return window.__workspaceFailure?{error:{message:'Synthetic workspace backend unavailable'}}:{data:{providers:Object.entries(WORKSPACE_PROVIDERS).map(([id,p])=>({id,name:p.name,configured:Boolean(window.__workspaceConfigured),services:WORKSPACE_SERVICES.filter(s=>s.provider===id).map(s=>({...s,access:'not_connected'}))}))}};
  if(name==='jd-business-platform'&&body.action==='oauth.start')return{error:{message:'Synthetic OAuth setup failure; no provider contacted'}};
  if(name==='jd-connect'&&window.__connectorFixture){
   if(window.__connectorFailure)return{error:{message:'Synthetic connector unavailable'}};
   if(body.action==='servers.public_connect')return{error:{message:'Synthetic public service allowlist failure'}};
   if(body.action==='servers.list')return{data:{servers:window.__sampleServers||[{id:'sample-server',name:'Sample business',host:'mcp.example.test',status:'connected',grant:{access_level:'read_only'}},{id:'disabled-server',name:'Disabled service',host:'disabled.example.test',status:'disabled'}]}};
   if(body.action==='tools.list')return{data:{tools:[{id:'sample-tool',server_id:'sample-server',name:'lookup_customer',description:'Synthetic lookup',input_schema:{type:'object'},read_only:true},{id:'disabled-tool',server_id:'disabled-server',name:'disabled_tool',read_only:true}]}};
   if(body.action==='servers.register'&&window.__connectorRegisterFailure)return{data:{error:'Synthetic registration rejected by host allowlist'}};
   if(body.action==='servers.register'&&window.__allowConnectorRegister){window.__sampleServers=[{id:'new-sample-server',name:body.name,host:new URL(body.endpoint).host,status:'connected',grant:{access_level:'read_only'}}];return{data:{server:window.__sampleServers[0],tools:[],notice:'Synthetic server connected. No external service contacted.'}};}
  }
  if(window.__historyFailure&&['history','history.list'].includes(body.action))return{error:{message:'Synthetic history unavailable'}};
  if(window.__holdHistory&&body.action==='history')await new Promise(resolve=>{window.__releaseHistory=resolve;});
  if(window.__pendingReview&&body.action==='approvals.list')return{data:{approvals:populatedAutomation['approvals.list'].approvals.map(a=>({...a,status:'pending'}))}};
  if(window.__populatedThemeFixture){
   const populated=name==='jd-automation'?populatedAutomation:name==='jd-business-platform'?populatedBusiness:{};
   if(Object.hasOwn(populated,body.action))return{data:structuredClone(populated[body.action])};
  }
  if(name==='jd-automation'&&window.__conversationFixture){
   if(body.action==='submit'&&window.__allowTaskRequest&&body.message.startsWith('Review saved operational task '))return{data:{conversationId:'synthetic-conversation',reply:'Synthetic work request received. No real job was executed.'}};
   if(body.action==='history.list')return{data:{conversations:[{id:'synthetic-conversation',title:'Saved operations conversation'}]}};
   if(body.action==='history')return{data:conversationHistory()};
   if(body.action==='operations.task.list')return{data:{tasks:conversationTasks()}};
  }
  const map=name==='jd-automation'?automation:name==='jd-business-platform'?business:name==='jd-connect'?{'servers.list':{servers:[]},'tools.list':{tools:[]},'approvals.list':{approvals:[]},'executions.list':{executions:[]}}:{};
  return Object.hasOwn(map,body.action)?{data:structuredClone(map[body.action])}:fail(name+':'+body.action);
 }},
 from:()=>({select:()=>({eq:()=>({single:async()=>({data:user})})})}),
 rpc,
 // Anything that would leave the browser is a fixture gap, not a silent pass.
 storage:{from:()=>fail('storage.from')},
 supabaseUrl:'https://synthetic.supabase.test',
};
