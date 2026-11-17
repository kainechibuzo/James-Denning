import {buildSettingsChangePlan} from './jd-settings-change-planner.ts';

// Persist review requests only. Never call the approval or execution RPC here.
export async function submitSettingsForReview(args:Record<string,unknown>,ctx:{admin:any;userId:string;schoolId:string;role:string}) {
 if(!['owner','admin'].includes(ctx.role))throw Error('Workspace administrator required');
 const requested=args.changes;
 if(!Array.isArray(requested)||requested.length<1||requested.length>20||requested.some(c=>!c||typeof c.key!=='string'||!['string','boolean','number'].includes(typeof c.value)))throw Error('Provide between 1 and 20 explicit setting values');
 const {data:profile,error:profileError}=await ctx.admin.from('profiles').select('id,school_id,role').eq('id',ctx.userId).maybeSingle();
 if(profileError||profile?.id!==ctx.userId||profile.school_id!==ctx.schoolId||!['owner','admin'].includes(profile.role))throw Error('Workspace authority could not be confirmed');
 const keys=[...new Set(requested.map(c=>c.key))];
 const {data:current,error}=await ctx.admin.from('school_settings').select('key,value').eq('school_id',ctx.schoolId).in('key',keys).limit(100);
 if(error||!Array.isArray(current))throw Error('Could not read current organisation settings');
 const plan=buildSettingsChangePlan(requested,current);
 const actionable=plan.changes.filter(c=>c.status==='proposed');
 if(plan.rejected.length||plan.status!=='ready_for_review')throw Error('Settings proposal failed validation; no request was saved');
 if(!actionable.length)return{status:'no_change',persisted:false,plan,execution:{performed:false,status:'not_executed'}};
 if(actionable.some(c=>c.approval_required!==true))throw Error('This review path supports identity, workspace, security and billing settings only. Change other preferences in Organisation Settings.');
 const {data:proposal,error:saveError}=await ctx.admin.rpc('jd_submit_settings_proposal',{
  p_actor_id:ctx.userId,p_title:typeof args.title==='string'?args.title.trim().slice(0,160)||'Organisation settings change':'Organisation settings change',p_proposal_json:plan,
 });
 if(saveError)throw Error('Settings review request was not confirmed. Refresh Review Centre before submitting again; no direct settings write was attempted.');
 if(!proposal||typeof proposal.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(proposal.id)||!['pending','approved','rejected','expired'].includes(proposal.status)||typeof proposal.proposal_hash!=='string'||!/^[0-9a-f]{64}$/i.test(proposal.proposal_hash))throw Error('Settings review acknowledgement was incomplete. Refresh Review Centre before submitting again.');
 return{status:proposal.status,persisted:true,proposal,plan,execution:{performed:false,status:'not_executed'},next_action:proposal.status==='pending'?'Review the exact before-and-after changes in Review Centre, approve, then explicitly apply them.':'An identical proposal already exists. Open Review Centre to inspect its decision and execution records; submission did not apply settings.'};
}
