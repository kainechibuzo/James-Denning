// Client for the JD discovery agent and the workspace autonomy dial.
// Validates every read-back against the release contract before the UI trusts
// it: receipts never unlock hiring, execution or charging, billing summaries
// always report charging as disabled until the platform release flag flips,
// and discovery receipts carry bounded plans with allowlisted skills only.
import {stable} from './foundation-client.mjs';

const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const ROLES=['business_advisor','research_analyst','finance_analyst','operations_planner','product_designer','software_engineer','security_reviewer','quality_assurance'];
const ACTIONS=['autonomy.read','autonomy.set','discovery.start','discovery.decide','discovery.proceed','discovery.read','billing.summary'];
const flagsOk=r=>r&&r.hiring_enabled===false&&r.execution_enabled===false;

export async function discoveryRequest(client,role,body){
 if(!['owner','admin','manager'].includes(role))throw Error('Workspace membership required.');
 if(!ACTIONS.includes(body?.action))throw Error('Unsupported discovery action.');
 if((body.action==='discovery.decide'||body.action==='discovery.proceed')&&body.sessionId!=null&&!uuid(body.sessionId))throw Error('Invalid discovery session.');
 if(body.action!=='autonomy.read'&&body.action!=='discovery.read'&&body.action!=='billing.summary'){
  if(!uuid(body.requestId)||body.confirm!==true)throw Error('Invalid discovery submission.');
 }
 if(body.action==='autonomy.set'){
  if(!['assisted','autonomous'].includes(body.mode))throw Error('Choose an explicit autonomy mode.');
  if(!Number.isInteger(body.ceilingSeconds)||body.ceilingSeconds<60||body.ceilingSeconds>86400)throw Error('Spend ceiling must be between one minute and 24 hours of agent time.');
  if(!Number.isInteger(body.rateMinorPerHour)||body.rateMinorPerHour<100||body.rateMinorPerHour>100000000)throw Error('Rate out of bounds.');
 }
 if((body.action==='discovery.decide')&&(!['approve','decline'].includes(body.decision)||typeof body.note!=='string'||body.note.trim().length<10))throw Error('An explicit decision and a review note are required.');
 if(body.action==='discovery.start'&&(typeof body.idea!=='string'||body.idea.trim().length<10||body.idea.length>4000))throw Error('Describe the work in at least 10 characters.');
 let reply;
 try{reply=await client.functions.invoke('jd-automation',{body});}
 catch{throw Error('Discovery outcome uncertain. Reload records; keep the same request identifier when retrying.');}
 if(reply?.error||reply?.data?.error||!reply?.data)throw Error('Discovery operation not confirmed. Check the release flag, role and spend ceiling; reload before retrying.');
 const data=reply.data;
 if(data.autonomy){
  const a=data.autonomy;
  if(!['assisted','autonomous'].includes(a.mode)||!Number.isInteger(a.spend_ceiling_seconds)||!Number.isInteger(a.agentic_rate_minor_per_hour)||!flagsOk(a))throw Error('Autonomy read-back is incomplete.');
  return a;
 }
 if(data.billing){
  const b=data.billing;
  if(b.charging_enabled!==false||!Number.isInteger(b.actual_seconds)||!Number.isInteger(b.spend_ceiling_seconds)||!flagsOk(b))throw Error('Billing summary read-back is incomplete or violates the charging boundary.');
  return b;
 }
 if(data.discovery){
  const d=data.discovery;
  if(!uuid(d.session_id)||!['proposed','proceeding','completed'].includes(d.status)||!flagsOk(d))throw Error('Discovery read-back is incomplete.');
  if(d.plan&&(!Array.isArray(d.plan.skills)||!Array.isArray(d.plan.roles)||d.plan.roles.some(r=>!ROLES.includes(r))))throw Error('Discovery plan read-back violates the specialist contract.');
  return d;
 }
 if(data.sessions){
  const s=data.sessions;
  if(!Array.isArray(s.sessions)||!flagsOk(s))throw Error('Discovery session read-back is incomplete.');
  if(s.sessions.some(x=>!uuid(x.id)||typeof x.idea!=='string'||typeof x.status!=='string'))throw Error('Discovery session records are incomplete.');
  return s;
 }
 const {receipt}=data;
 if(!receipt||!flagsOk(receipt))throw Error('Discovery acknowledgement is incomplete.');
 if(body.action==='autonomy.set'&&!['assisted','autonomous'].includes(receipt.mode))throw Error('Autonomy receipt is invalid.');
 if(body.action==='discovery.decide'&&!['approved','declined'].includes(receipt.status))throw Error('Decision read-back is invalid.');
 if(body.action==='discovery.proceed'&&receipt.status!=='completed')throw Error('Proceed read-back is invalid; reload the session.');
 return receipt;
}

export {uuid,stable,ROLES};
