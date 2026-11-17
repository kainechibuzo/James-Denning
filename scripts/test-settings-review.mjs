import test from 'node:test';
import assert from 'node:assert/strict';
import {executeJdMcpTool,getJdMcpToolDefinitions} from '../supabase/functions/_shared/jd-agent-runtime.ts';
import {buildSettingsCatalogue} from '../supabase/functions/_shared/jd-settings-catalogue.ts';
import {applyReviewedSettings,settingsDiff} from '../src/chat/settings-review.mjs';
import {configuredProjectLabel} from '../src/config/settings-presentation.mjs';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),school=id(2),approvalId=id(3),run=id(4);
const changes=[{key:'school_name',value:'Synthetic Logistics Ltd'},{key:'workspace_type',value:'business'},{key:'education_module_enabled',value:false}];
function context({role='owner',profileRole=role,profileSchool=school,error=null,receipt={id:approvalId,status:'pending',proposal_hash:'a'.repeat(64)}}={}){
 const calls=[];const ctx={userId:actor,schoolId:school,role,admin:{from(table){calls.push({table});const q={select(){return q;},eq(key,value){calls.push({table,key,value});return q;},in(){return q;},async maybeSingle(){return{data:{id:actor,school_id:profileSchool,role:profileRole}};},async limit(){return{data:[{key:'school_name',value:'Old synthetic name'}]};}};return q;},async rpc(name,args){calls.push({name,args});return error?{error:{message:'PRIVATE_DIAGNOSTIC'}}:{data:receipt};}}};return{ctx,calls};
}
for(const role of ['owner','admin'])test(`${role}: actual JD tool saves review request, never applies settings`,async()=>{
 const f=context({role});assert.ok(getJdMcpToolDefinitions(f.ctx).some(t=>t.name==='submit_workspace_settings_for_review'));
 const r=await executeJdMcpTool('submit_workspace_settings_for_review',{title:'Confirmed identity',changes,actorId:id(8),schoolId:id(9)},f.ctx);
 assert.equal(r.persisted,true);assert.equal(r.execution.performed,false);assert.equal(r.status,'pending');
 const calls=f.calls.filter(c=>c.name);assert.equal(calls.length,1);assert.equal(calls[0].name,'jd_submit_settings_proposal');assert.equal(calls[0].args.p_actor_id,actor);assert.equal(calls[0].args.p_proposal_json.changes[0].before,'Old synthetic name');assert.ok(f.calls.some(c=>c.table==='school_settings'&&c.key==='school_id'&&c.value===school));
});
for(const role of ['manager','staff','viewer','finance','hr','contractor','teacher','student'])test(`${role}: cannot submit a settings proposal`,async()=>{
 const f=context({role});await assert.rejects(executeJdMcpTool('submit_workspace_settings_for_review',{changes,role:'owner'},f.ctx));assert.equal(f.calls.length,0);
});
for(const patch of [{profileRole:'staff'},{profileSchool:id(8)}])test(`server rechecks profile ${JSON.stringify(patch)}`,async()=>{
 const f=context(patch);await assert.rejects(executeJdMcpTool('submit_workspace_settings_for_review',{changes},f.ctx));assert.equal(f.calls.some(c=>c.name),false);
});
for(const requested of [[],Array(21).fill(changes[0]),[{key:'smtp_password',value:'private'}],[...changes,changes[0]],[{key:'school_phone',value:''}],[{key:'recycle_bin_retention_days',value:30}],[{key:'education_module_enabled',value:'sometimes'}]])test(`invalid/unsupported proposal ${JSON.stringify(requested).slice(0,80)} never saves`,async()=>{
 const f=context();await assert.rejects(executeJdMcpTool('submit_workspace_settings_for_review',{changes:requested},f.ctx));assert.equal(f.calls.some(c=>c.name),false);
});
test('unchanged settings return no-change without persisting duplicate requests',async()=>{
 const f=context();const r=await executeJdMcpTool('submit_workspace_settings_for_review',{changes:[{key:'school_name',value:'Old synthetic name'}]},f.ctx);assert.equal(r.status,'no_change');assert.equal(r.persisted,false);assert.equal(f.calls.some(c=>c.name),false);
});
for(const patch of [{error:true},{receipt:{}},{receipt:{id:approvalId,status:'completed',proposal_hash:'a'.repeat(64)}}])test(`missing or invalid backend receipt fails closed ${JSON.stringify(patch)}`,async()=>{
 const f=context(patch);await assert.rejects(executeJdMcpTool('submit_workspace_settings_for_review',{changes},f.ctx),e=>!e.message.includes('PRIVATE_DIAGNOSTIC'));assert.equal(f.calls.filter(c=>c.name).length,1);
});
test('catalogue distinguishes stored academic settings from business applicability',()=>{
 const rows=[{key:'workspace_type',value:'business'},{key:'education_module_enabled',value:'true'},{key:'result_ca_max',value:'40'},{key:'smtp_password',value:'PRIVATE_DIAGNOSTIC'}];const r=buildSettingsCatalogue(rows);assert.equal(r.workspace_context.education_surfaces_active,false);assert.equal(r.settings.find(s=>s.key==='result_ca_max').applies_to_current_workspace,false);assert.equal(r.settings.find(s=>s.key==='school_name').review_proposal_supported,true);assert.doesNotMatch(JSON.stringify(r),/PRIVATE_DIAGNOSTIC/);
});
test('configured project info is derived, not hard-coded legacy metadata',()=>{
 assert.equal(configuredProjectLabel('https://abcdefghijklmnopqrst.supabase.co'),'abcdefghijklmnopqrst');assert.equal(configuredProjectLabel(undefined),'Not available');assert.equal(configuredProjectLabel('https://example.com'),'Custom or local endpoint');assert.equal(configuredProjectLabel('https://user:secret@abcdefghijklmnopqrst.supabase.co'),'Custom or local endpoint');
});
const item=()=>({id:approvalId,status:'approved',action_key:'settings.apply',execution_status:'not_executed',proposal_json:{changes:[{key:'school_name',label:'Organisation name',before:'Old',after:'Synthetic Ltd',status:'proposed',approval_required:true}]}});
function clientFixture(transform=x=>x){const calls=[];return{calls,client:{functions:{invoke:async(_,request)=>{calls.push(request.body);return{data:request.body.action==='approvals.list'?{approvals:[{...item(),execution_status:'completed'}]}:transform({approvalId,execution_status:'completed',partial:false,results:[{status:'completed',step_index:0,key:'school_name',verified:true}],settings:[{key:'school_name',value:'Synthetic Ltd'}]})};}}}};}
test('apply client requires explicit approved diff, execution receipt and persisted read-back',async()=>{
 const f=clientFixture();const r=await applyReviewedSettings(f.client,item());assert.match(r.message,/applied and read back/);assert.deepEqual(f.calls.map(c=>c.action),['settings.proposal.execute','approvals.list']);
});
for(const patch of [{status:'pending'},{status:'rejected'},{execution_status:'failed'},{execution_status:'completed'},{proposal_json:{changes:[]}}])test(`client cannot apply ${JSON.stringify(patch)}`,async()=>{
 const f=clientFixture();await assert.rejects(applyReviewedSettings(f.client,{...item(),...patch}));assert.equal(f.calls.length,0);
});
for(const transform of [r=>({...r,partial:true}),r=>({...r,settings:[]}),r=>({...r,settings:[{key:'school_name',value:'different'}]}),r=>({...r,results:[{status:'completed',step_index:0,key:'school_name'}]}),r=>({...r,approvalId:id(9)})])test('incomplete execution acknowledgement cannot claim settings changed',async()=>{const f=clientFixture(transform);await assert.rejects(applyReviewedSettings(f.client,item()));assert.equal(f.calls.length,1);});
test('lost execution acknowledgement is not retried automatically',async()=>{let calls=0;await assert.rejects(applyReviewedSettings({functions:{invoke:async()=>{calls++;throw Error('private');}}},item()),/Response lost/);assert.equal(calls,1);});
test('malformed or secret-key diffs are not displayed or approved',()=>{
 const i=item();i.proposal_json.changes[0].key='smtp_password';assert.equal(settingsDiff(i),null);
});
