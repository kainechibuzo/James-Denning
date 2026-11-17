// Shortcuts into the existing JD chat tools, not new routes or permission grants.
// A user must already have the authorised jd-chat entry before seeing these.
export const JD_ASSISTANT_TOOLS = Object.freeze([
  {id:'new',label:'New conversation',icon:'add'},
  {id:'history',label:'Conversation history',icon:'audit-log'},
  {id:'review',label:'Review Centre',icon:'shield'},
  {id:'departments',label:'Departments',icon:'building'},
  {id:'usage',label:'AI usage',icon:'activity'},
  {id:'runs',label:'Automation runs',icon:'activity'},
].map(Object.freeze));
export function assistantNavigation(authorisedNavigation,query=''){
  if(!authorisedNavigation.some(entry=>entry.id==='jd-chat'&&!entry.group))return [];
  const terms=String(query).trim().toLowerCase().split(/\s+/).filter(Boolean);
  return JD_ASSISTANT_TOOLS.filter(entry=>terms.every(term=>('jd ai assistant '+entry.label).toLowerCase().includes(term)));
}
