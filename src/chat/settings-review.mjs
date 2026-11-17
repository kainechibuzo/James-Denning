const supported=new Set(['workspace_type','education_module_enabled','school_name','school_address','school_phone','school_motto','inactivity_timeout_minutes','login_students_disabled','login_teachers_disabled','block_reports_if_owing']);
const id=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function settingsDiff(item){
 const changes=item?.proposal_json?.changes;
 if(item?.action_key!=='settings.apply'||!id(item.id)||!Array.isArray(changes)||changes.length<1||changes.length>20)return null;
 const seen=new Set(),rows=[];
 for(const [index,c] of changes.entries()){
  if(!supported.has(c?.key)||seen.has(c.key)||!['proposed','no_change'].includes(c.status)||!['string','number','boolean'].includes(typeof c.after)||(c.before!==null&&!['string','number','boolean'].includes(typeof c.before))||String(c.after).length>500||(c.before!==null&&String(c.before).length>500)||(c.status==='proposed'&&c.approval_required!==true))return null;
  seen.add(c.key);rows.push({key:c.key,label:typeof c.label==='string'?c.label.slice(0,120):c.key,before:c.before,after:c.after,index,changed:c.status==='proposed'});
 }
 return rows;
}
async function invoke(client,body){
 let response;try{response=await client.functions.invoke('jd-automation',{body});}catch{throw Error('Response lost. Refresh Review Centre before any further action; no request was retried.');}
 if(response?.error||response?.data?.error||!response?.data)throw Error('The settings action was not confirmed. Some steps may have been saved. Refresh and inspect the records before retrying.');
 return response.data;
}
export async function applyReviewedSettings(client,item){
 const rows=settingsDiff(item),changes=rows?.filter(c=>c.changed);
 if(!changes?.length||item.status!=='approved'||item.execution_status==='completed'||!['not_executed','running'].includes(item.execution_status))throw Error('Only an approved, valid and unfinished settings proposal can be applied.');
 const data=await invoke(client,{action:'settings.proposal.execute',approvalId:item.id});
 if(data.approvalId!==item.id||data.execution_status!=='completed'||data.partial!==false||!Array.isArray(data.results)||data.results.length!==changes.length||!Array.isArray(data.settings)||data.settings.length!==changes.length)throw Error('Settings execution acknowledgement was incomplete. Refresh before another action.');
 for(const c of changes){
  const step=data.results.find(s=>s.step_index===c.index&&s.key===c.key);
  if(!step||!['completed','step_completed','already_completed'].includes(step.status)||!(step.verified===true||(step.status==='already_completed'&&Number.isFinite(Date.parse(step.verified_at))))||data.settings.filter(s=>s.key===c.key&&s.value===String(c.after)).length!==1)throw Error('A settings write or read-back could not be confirmed. Refresh and request administrator review.');
 }
 const readback=await invoke(client,{action:'approvals.list'});
 const saved=Array.isArray(readback.approvals)&&readback.approvals.find(a=>a.id===item.id);
 if(!saved||saved.status!=='approved'||saved.execution_status!=='completed'||JSON.stringify(settingsDiff(saved))!==JSON.stringify(rows))throw Error('Approval read-back did not match the executed proposal. Refresh and inspect the records.');
 return {message:'Approved settings applied and read back. Reload the workspace to refresh navigation and cached organisation details. This does not verify any business outcome.'};
}
