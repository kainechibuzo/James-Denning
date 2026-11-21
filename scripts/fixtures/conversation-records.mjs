// Synthetic presentation data only; deliberately no real tenant/job IDs.
export const conversationTasks=()=>Array.from({length:30},(_,i)=>({
 id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,
 title:i===0?'Build a working-capital and cash-flow forecast':i===1?'Review the first-hire plan and vacancy drafts':`Review operational task ${i+1}`,
 description:'Use verified inputs and review the proposed work. A saved status is not proof of external execution.',
 status:i===0?(window.__fixtureTaskCompleted?'completed':'in_progress'):i<20?'completed':'queued',
 owner_role:'Operations lead',dependencies:[],approval_required:i===1,
}));
export const conversationHistory=()=>({messages:[
 {role:'user',content:'What should we work on next?'},
 {role:'assistant',content:'Here is what needs your attention before the next step.\n\n## Start with verified inputs\n\nYour **cash-flow forecast** is still in progress. Review the assumptions before committing funds.\n\n1. Confirm the expected costs.\n2. Review the recorded approvals.\n3. Check the evidence for completed work.\n\n> A complete task record is not independent verification of the business outcome.\n\n| Area | Status | Next step |\n| --- | --- | --- |\n| Finance | In progress | Review verified inputs |\n\nUse `task records` to inspect saved progress. [Review your workspace](https://example.test/workspace).',content_json:{job_id:'synthetic-completed-job',job_status:'completed',run:{status:'completed'},visual_workspace:{version:1,contextual:true,source:'persisted_workspace_records',blocks:[{type:'checklist',title:'Operational tasks',items:conversationTasks()},...(window.__mobilePolishFixture?[{type:'departments',title:'Department workload',items:['Operations & Fleet Management','Commercial & Business Development','Finance & Administration','Compliance & Regulatory Affairs','Health, Safety & Environment','Maintenance & Workshop','Human Resources & Training','Warehousing & Distribution','Engineering'].map(name=>({name,metric:'1 open',detail:'Review responsibilities, recorded tasks and verified inputs before taking action. 2 total · 1 completed · 0 blocked',status:'running'}))},{type:'timeline',title:'Persisted execution activity',events:[]}]:[])]}}},
]});
