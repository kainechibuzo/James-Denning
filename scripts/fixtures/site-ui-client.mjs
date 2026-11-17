import {conversationTasks,conversationHistory} from "./conversation-records.mjs";
// Local rendering fixture only. Unknown calls fail closed; the populated-chat
// test can explicitly enable a synthetic submit acknowledgement (never a real job).
// No credentials, external endpoints or production records.
export const user={id:'ui-admin',_authUserId:'ui-admin',role:'admin',name:'Kaine Denning',email:'owner@example.test',school_id:'ui-workspace'};
export const school={id:'ui-workspace',name:'Reference workspace',plan:'free',student_id_prefix:'JD'};
const settings={school_name:school.name,workspace_type:'business',inactivity_timeout_minutes:'0',name_order:'FML',name_case:'title'};
const record=(kind,name,args)=>{window.__siteCalls??=[];window.__siteCalls.push({kind,name,args});};
const fail=name=>{window.__siteUnexpected??=[];window.__siteUnexpected.push(name);return{error:{message:'UI fixture does not implement '+name}};};
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
 'history.list':{conversations:[]},'approvals.list':{approvals:[]},'operations.task.list':{tasks:[]},'operations.team.list':{members:[]},
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
};
