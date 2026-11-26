// Synthetic transport only. Exercises the production ChatHome pipeline and
// survives browser reload, but cannot read or mutate any real workspace.
const parent='00000000-0000-4000-8000-000000000001';
const options=[{label:'Flat',value:'flat',description:'Fewer layers',recommended:true,highlights:['Faster decisions','Direct ownership']},{label:'Functional',value:'functional',description:'Grouped teams'}];
const response={version:1,blocks:[
 {id:'intro',type:'message',content:'# Business setup\n\n**Plan** with *care*.\n\n| Area | State |\n|---|---|\n| Finance | Draft |\n\n```js\nconst answer = "safe";\n```\n\nInline $x^2$ and display:\n\n$$\n\\frac{1}{2}\n$$\n\n> A draft is not execution.\n\n- One\n- Two\n\n[Example](https://example.com) and `inline`.'},
 {id:'structure',type:'choice',question:'Which structure?',subtitle:'Select the model that fits your team best.',multiple:false,options},
 {id:'channels',type:'choice',question:'Which channels?',multiple:true,options:[{label:'Email',value:'email'},{label:'Phone',value:'phone'}]},
 {id:'region',type:'choice',question:'Choose your region',multiple:false,presentation:'dropdown',options:[{label:'Lagos',value:'lagos'},{label:'Abuja',value:'abuja'}]},
 {id:'identity',type:'form',title:'Name your business',fields:[{id:'name',label:'Business name',type:'text',required:true},{id:'budget',label:'Budget',type:'number',required:true,min:1,max:1000},{id:'notes',label:'Notes',type:'textarea',required:false},{id:'date',label:'Launch date',type:'date',required:true},{id:'structure',label:'Preferred structure',type:'select',required:true,options}]},
 {id:'connect-github',type:'connector_prompt',connectorId:'github',reason:'Connect GitHub if you want JD to inspect repository files during build planning.',capabilities:['Read repository files','Search repository code']},
]};
const legacy={version:1,source:'persisted_workspace_records',blocks:[{type:'departments',title:'Department workload',items:[{name:'Unrelated finance'}]},{type:'checklist',title:'Operational tasks',items:[]}]};
function initial(){return {a:[{id:parent,role:'assistant',content:'Business setup',content_json:{response}}],b:[{id:'ordinary',role:'assistant',content:'Your business currently has eight departments. What a useful starting point?\n\n'+('A long response stays inside the reading surface. '.repeat(100)),content_json:{visual_workspace:legacy}}],c:[{id:'context',role:'assistant',content:'Requested department summary.',content_json:{response:{version:1,blocks:[{id:'approval',type:'approval',actionId:'synthetic-approval',description:'Review a recorded proposal. No execution is claimed.'},{id:'metrics',type:'operational_result',title:'Recorded workforce',source:'persisted_records',status:'completed',data:{Members:8}}]},visual_workspace:{...legacy,contextual:true}}}],d:[{id:'user-spec',role:'user',content:'Implement frontend and backend architecture for our SaaS website'},{id:'assist-spec',role:'assistant',content:'Here is how we can coordinate your software build.',content_json:{job_id:'job-spec',job_status:'completed',run:{id:'run-spec',status:'completed'},toolEvents:[{name:'get_workspace_overview',status:'completed'}]}}],requests:[],receipts:{},jobs:{}};}
const read=()=>JSON.parse(sessionStorage.getItem('engine-db')||'null')||initial();
const save=db=>sessionStorage.setItem('engine-db',JSON.stringify(db));
export const supabase={functions:{invoke:async(_name,{body})=>{
 let db=read();db.requests.push(body);save(db);
 if(body.action==='history.list')return{data:{conversations:[{id:'a',title:'Setup conversation'},{id:'b',title:'Ordinary conversation'},{id:'c',title:'Requested operations'},{id:'d',title:'Specialist planning'}]}};
 if(body.action==='history')return{data:{messages:db[body.conversationId]||[]}};
 if(body.action==='approvals.list')return{data:{approvals:[]}};
 if(body.action==='operations.task.list')return{data:{tasks:[]}};
 if(body.action==='agent.proposal.create')return{data:{proposal:{proposal_id:'00000000-0000-4000-8000-000000000099',role:body.specialist,allocated_seconds:body.seconds,spend_cap_seconds:body.spendCapSeconds,rate_minor_per_hour:100,estimated_amount_minor:Math.round((body.seconds/3600)*100),currency:'USD',subscription_status:'trialing',status:'awaiting_approval'}}};
 if(body.action==='submit'){
  await new Promise(r=>setTimeout(r,80));db=read();
  if(window.__failAnswer){window.__failAnswer=false;return{error:{message:'Synthetic transport failure'}};}
  if(db.receipts[body.idempotencyKey])return{data:db.receipts[body.idempotencyKey]};
  const id=body.conversationId||'a',jobId='job-'+body.idempotencyKey;
  const user={id:'user-'+body.idempotencyKey,role:'user',content:body.message,content_json:{interaction:body.interaction}};
  const assistant={id:'reply-'+body.idempotencyKey,role:'assistant',content:'',content_json:{job_id:jobId,job_status:'queued',run:{id:jobId,status:'queued'}}};
  db[id].push(user,assistant);db.jobs[jobId]={id,assistant,polls:0};
  const receipt={conversationId:id,userMessageId:user.id,queued:true,job:{id:jobId,status:'queued'},run:{id:jobId,status:'queued'}};db.receipts[body.idempotencyKey]=receipt;save(db);return{data:receipt};
 }
 if(body.action==='execution.job.status'){
  if(window.__pollFailure)return{error:{message:'Synthetic status outage'}};
  const job=db.jobs[body.jobId];if(!job)throw Error('Unknown synthetic job');job.polls++;
  const streaming=job.polls===1;
  const followup={version:1,blocks:[
   {id:'next',type:'choice',question:'Continue to the plan?',multiple:false,options:[{label:'Review plan',value:'review'},{label:'Pause here',value:'pause'}]},
   {id:'channels',type:'choice',question:'Which channels?',multiple:true,options:[{label:'Email',value:'email'},{label:'Phone',value:'phone'}]},
   {id:'region',type:'choice',question:'Choose your region',multiple:false,presentation:'dropdown',options:[{label:'Lagos',value:'lagos'},{label:'Abuja',value:'abuja'}]},
   {id:'identity',type:'form',title:'Name your business',fields:[{id:'name',label:'Business name',type:'text',required:true},{id:'budget',label:'Budget',type:'number',required:true,min:1,max:1000},{id:'notes',label:'Notes',type:'textarea',required:false},{id:'date',label:'Launch date',type:'date',required:true},{id:'structure',label:'Preferred structure',type:'select',required:true,options}]}
  ]};
  const assistant={...job.assistant,content:streaming?'{"version":1,"blocks":[':'Continue to the plan?',content_json:{...job.assistant.content_json,streaming,job_status:streaming?'running':'completed',response:streaming?null:followup}};
  db[job.id]=db[job.id].map(m=>m.id===assistant.id?assistant:m);save(db);
  return{data:{job:{id:body.jobId,status:streaming?'running':'completed'},run:{id:body.jobId,status:streaming?'running':'completed'},assistantMessage:assistant,steps:[]}};
 }
 throw Error('Unexpected synthetic action: '+body.action);
}}};
