import {isTaskId,readOperationalTasks} from "./operational-task-records.mjs";
import {transitionOperationalTask} from "./operational-task-client.mjs";

// Release switch, not an authorisation boundary. Keep the deployed PR #89
// contract until isolated staging and the new backend release are approved.
// Change only in a reviewed release; never infer availability from a failed write.
export const TASK_ASSIGNMENT_RELEASE = "legacy";

export const canManageTasks = role => ["owner","admin","manager"].includes(role);
const statuses = new Set(["queued","in_progress","blocked","completed","cancelled"]);
const priorities = new Set(["low","normal","high","urgent"]);
export const blankTask = () => ({title:"",description:"",department:"",priority:"normal",dueAt:""});
export function normaliseTaskDraft(input) {
  const result={};
  for(const [field,max] of [["title",180],["description",5000],["department",120]]) {
    if(typeof input?.[field]!=="string") throw new Error("Enter valid task details.");
    result[field]=input[field].trim();
    if(result[field].length>max) throw new Error(`Task ${field} must be at most ${max} characters.`);
  }
  if(!result.title) throw new Error("Give the task a title.");
  if(!priorities.has(input.priority)) throw new Error("Choose a valid task priority.");
  result.priority=input.priority;
  if(input.dueAt!=null&&typeof input.dueAt!=="string") throw new Error("Choose a valid due date.");
  const due=input.dueAt?.trim();
  if(due&&Number.isNaN(new Date(due).getTime())) throw new Error("Choose a valid due date.");
  result.dueAt=due?new Date(due).toISOString():null;
  return result;
}
function fail(message) {throw new Error(message);}
async function invokeWrite(client,body) {
  let result;
  try {result=await client.functions.invoke("jd-automation",{body});}
  catch {fail("The response was lost. The change may have been saved; reconcile before making another request.");}
  if(result?.error||result?.data?.error||!result?.data) {
    const status=result?.error?.context?.status||result?.error?.status;
    fail(status===401?"Sign in again, then recover the request.":status===403?"Your account does not have permission for this request.":"JD could not confirm the change. It may have been saved; reconcile before making another request.");
  }
  return result.data;
}
export async function createOperationalTask(client,{role,schoolId,actorId,attempt}) {
  if(!canManageTasks(role)||!isTaskId(schoolId)||!isTaskId(actorId)) fail("A signed-in workspace manager is required.");
  if(!isTaskId(attempt?.id)) fail("A valid recovery ID is required.");
  const task=normaliseTaskDraft(attempt.task);
  const data=await invokeWrite(client,{action:"operations.task.create",task,idempotencyId:attempt.id});
  const saved=data.task;
  const sameDate=(a,b)=>a==null&&b==null||typeof a==="string"&&typeof b==="string"&&new Date(a).getTime()===new Date(b).getTime();
  if(!isTaskId(saved?.id)||saved.school_id!==schoolId||saved.created_by!==actorId||saved.idempotency_key!==`${schoolId}:task.create:${attempt.id}`||
     saved.title!==task.title||saved.description!==task.description||(saved.department??"")!==task.department||saved.priority!==task.priority||!sameDate(saved.due_at,task.dueAt)||
     !statuses.has(saved.status)||typeof data.reused!=="boolean"||(!data.reused&&saved.status!=="queued")||data.auditRecorded!==true||!isTaskId(data.auditId)) {
    fail("Task creation and audit evidence were not confirmed. Recover the same request; do not create a duplicate.");
  }
  return data;
}
export async function readAssignedTask(client,{role,taskId}) {
  if(!canManageTasks(role)||!isTaskId(taskId)) fail("Manager access and a valid task are required.");
  let result;
  try {result=await client.functions.invoke("jd-automation",{body:{action:"operations.task.get",taskId}});}
  catch {fail("Assignment read-back failed. Refresh task records before trying again.");}
  const saved=result?.data?.task;
  if(result?.error||result?.data?.error||saved?.id!==taskId||!statuses.has(saved.status)||typeof saved.title!=="string"||!(saved.assigned_to===null||isTaskId(saved.assigned_to))||typeof saved.updated_at!=="string"||!Number.isFinite(Date.parse(saved.updated_at))) {
    fail("Assignment read-back was incomplete. Refresh task records before trying again.");
  }
  return saved;
}
export async function assignOperationalTask(client,{role,taskId,assigneeId,auto=false,expectedTask}) {
  if(!canManageTasks(role)) fail("Manager access is required to assign tasks.");
  if(!isTaskId(taskId)||(!auto&&!isTaskId(assigneeId))) fail("Choose a valid task and assignee.");
  if(!auto&&(expectedTask?.id!==taskId||!(expectedTask.assigned_to===null||isTaskId(expectedTask.assigned_to))||typeof expectedTask.updated_at!=="string"||!Number.isFinite(Date.parse(expectedTask.updated_at)))) fail("Refresh task records to obtain the assignment version before assigning.");
  // A new action is intentional: an older server must fail closed, not silently
  // accept a request while ignoring its expected version.
  const data=await invokeWrite(client,auto?{action:"operations.task.auto_assign",taskId}:{action:"operations.task.assign_checked",taskId,assigneeId,expectedAssigneeId:expectedTask.assigned_to,expectedUpdatedAt:expectedTask.updated_at});
  if(auto) {
    if(data.assignment?.assigned===false&&data.assignment.reason==="No active department member has available capacity") return {assigned:false};
    if(data.assignment?.assigned!==true||data.assignment.task_id!==taskId||!isTaskId(data.assignment.assignee_id)) fail("Auto-assignment was not confirmed. Refresh task records before trying again.");
    assigneeId=data.assignment.assignee_id;
  } else if(data.task?.id!==taskId||data.task.assigned_to!==assigneeId||!statuses.has(data.task.status)||data.auditRecorded!==true||!isTaskId(data.auditId)||typeof data.task.updated_at!=="string"||data.task.updated_at===expectedTask.updated_at||!Number.isFinite(Date.parse(data.task.updated_at))) {
    fail("Assignment and audit were not confirmed. Refresh task records before trying again.");
  }
  const saved=await readAssignedTask(client,{role,taskId});
  // Preserve PostgreSQL's microsecond timestamp rather than Date round-tripping.
  if(saved.assigned_to!==assigneeId||(!auto&&saved.updated_at!==data.task.updated_at)) fail("Assignment read-back did not match. Refresh task records before trying again.");
  return {assigned:true,task:saved,auditId:auto?null:data.auditId};
}

// Deliberate compatibility mode preserves the already-deployed PR #89 path.
// Its existing limits (bounded read, no audit acknowledgement or CAS) remain
// explicit. This is NOT a fallback after any checked request was attempted.
export async function assignReleasedOperationalTask(client,options) {
  const mode=options.assignmentMode??TASK_ASSIGNMENT_RELEASE;
  if(mode==="checked") return assignOperationalTask(client,options);
  if(mode!=="legacy") fail("Assignment release configuration is invalid. No request was sent.");
  const {role,taskId,auto=false}=options;
  let {assigneeId}=options;
  if(!canManageTasks(role)) fail("Manager access is required to assign tasks.");
  if(!isTaskId(taskId)||(!auto&&!isTaskId(assigneeId))) fail("Choose a valid task and assignee.");
  const data=await invokeWrite(client,auto?{action:"operations.task.auto_assign",taskId}:{action:"operations.task.assign",taskId,assigneeId});
  if(auto) {
    if(data.assignment?.assigned===false&&data.assignment.reason==="No active department member has available capacity") return {assigned:false};
    if(data.assignment?.assigned!==true||data.assignment.task_id!==taskId||!isTaskId(data.assignment.assignee_id)) fail("Auto-assignment was not confirmed. Refresh task records before trying again.");
    assigneeId=data.assignment.assignee_id;
  } else if(data.task?.id!==taskId||data.task.assigned_to!==assigneeId||!statuses.has(data.task.status)) {
    fail("Assignment was not confirmed. Refresh task records before trying again.");
  }
  const tasks=await readOperationalTasks(client,role);
  const saved=tasks.find(task=>task.id===taskId);
  if(!saved||saved.assigned_to!==assigneeId) fail("Assignment read-back did not match. Refresh task records before trying again.");
  return {assigned:true,task:saved,tasks,auditId:null};
}

// Per-tab journal: no credentials; scoped by authenticated actor and organisation.
// Persist BEFORE the first request. Never rotate the identity of an unresolved request.
export function createTaskWriteController(client,{role,schoolId,actorId,storage,assignmentMode=TASK_ASSIGNMENT_RELEASE,randomUUID=()=>crypto.randomUUID()}) {
  const validScope=isTaskId(schoolId)&&isTaskId(actorId);
  const key=`jd.task-create.v1:${schoolId}:${actorId}`;
  const listeners=new Set();
  let active=false,generation=0;
  let state={busy:false,loading:false,ready:false,tasks:[],team:[],attempt:null,fatal:false,recoveryError:"",error:"",notice:"",needsRefresh:[],created:0};
  const emit=patch=>{state={...state,...patch};listeners.forEach(fn=>fn());};
  const valid=()=>active&&canManageTasks(role)&&validScope;
  function readJournal(){
    const raw=storage.getItem(key);
    if(raw===null) return null;
    const attempt=JSON.parse(raw);
    if(attempt?.version!==1||!isTaskId(attempt.id)||JSON.stringify(normaliseTaskDraft(attempt.task))!==JSON.stringify(attempt.task)) throw Error("Invalid journal");
    return attempt;
  }
  function persist(attempt){
    const raw=JSON.stringify(attempt);storage.setItem(key,raw);
    if(storage.getItem(key)!==raw) throw Error("Journal write failed");
  }
  const api={
    getSnapshot:()=>state,
    subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},
    activate(){
      active=true;generation++;
      emit({busy:false,loading:false,ready:false,tasks:[],team:[],needsRefresh:[],notice:"",error:"",attempt:null,fatal:false,recoveryError:"",created:0});
      if(!valid()){emit({fatal:true,recoveryError:"A signed-in workspace manager is required."});return;}
      try{emit({attempt:readJournal()});}
      catch{emit({fatal:true,recoveryError:"Task recovery storage is unavailable or invalid. No creation request will be sent. Ask an administrator to reconcile any previous request before clearing this tab's recovery data."});}
    },
    deactivate(){active=false;generation++;},
    async refresh(){
      if(!valid()||state.busy) return;
      const current=generation;emit({busy:true,loading:true,ready:false,error:""});
      try {
        const [tasks,teamResult]=await Promise.all([readOperationalTasks(client,role),client.functions.invoke("jd-automation",{body:{action:"operations.team.list"}})]);
        if(teamResult?.error||teamResult?.data?.error||!Array.isArray(teamResult?.data?.members)||teamResult.data.members.some(m=>!isTaskId(m?.id)||typeof m.role!=="string")) fail("Could not confirm the workspace team. Refresh before assigning tasks.");
        if(active&&current===generation) emit({tasks,team:teamResult.data.members,ready:true,needsRefresh:[]});
      }catch{if(active&&current===generation) emit({error:"Task or team records could not be refreshed. Queue actions remain disabled; no write was retried."});}
      finally{if(active&&current===generation) emit({busy:false,loading:false});}
    },
    async create(draft){
      if(!valid()||state.busy||state.fatal) return;
      const current=generation;emit({busy:true,error:"",notice:""});
      try {
        // Re-read shared tab storage on every explicit submission, including remounts.
        let attempt;
        try {attempt=readJournal();} catch {emit({fatal:true,recoveryError:"Recovery data cannot be read safely. No request was sent."});fail("Recovery data cannot be read safely. No request was sent.");}
        if(state.attempt&&JSON.stringify(attempt)!==JSON.stringify(state.attempt)) {
          emit({fatal:true,recoveryError:"Recovery data changed while a request was unresolved. Reconcile the saved task before clearing recovery data. No new request was sent."});
          return;
        }
        if(!attempt) {
          const task=normaliseTaskDraft(draft);
          attempt={version:1,id:randomUUID(),task};
          if(!isTaskId(attempt.id)) fail("A secure recovery ID could not be generated.");
          try{persist(attempt);}catch{fail("Recovery data could not be saved in this tab. No request was sent.");}
        }
        emit({attempt});
        const result=await createOperationalTask(client,{role,schoolId,actorId,attempt});
        if(!active||generation!==current) return;
        try {
          // Do not erase a different request written by another mounted instance.
          if(readJournal()?.id!==attempt.id) throw Error("Recovery changed");
          storage.removeItem(key);if(storage.getItem(key)!==null) throw Error("Recovery not cleared");
        } catch {fail("The task was confirmed, but recovery data could not be cleared. Recover this same request again; do not recreate it.");}
        emit({attempt:null,created:state.created+1,tasks:[result.task,...state.tasks.filter(t=>t.id!==result.task.id)],notice:result.reused?"Existing task recovered with its original audit evidence. No duplicate created.":"Task saved with audit evidence."});
      }catch(error){if(active&&generation===current) emit({error:error.message});}
      finally{if(active&&generation===current) emit({busy:false});}
    },
    async assign(taskId,assigneeId,auto=false){
      return api.mutate(taskId,async()=>{
        const result=await assignReleasedOperationalTask(client,{role,taskId,assigneeId,auto,assignmentMode,expectedTask:state.tasks.find(t=>t.id===taskId)});
        return result.assigned?{tasks:result.tasks||state.tasks.map(t=>t.id===taskId?result.task:t),notice:result.auditId?"Assignment saved with audit evidence and confirmed by record read-back.":"Assignment confirmed by record read-back. Audit evidence is not verified by this response."}:{notice:"No assignment made: no active department member has available capacity."};
      });
    },
    async transition(taskId,status){
      const task=state.tasks.find(t=>t.id===taskId);
      const next=task?.status==="queued"?"in_progress":task?.status==="in_progress"?"completed":task?.status==="blocked"?"queued":null;
      if(!next||next!==status)return;
      return api.mutate(taskId,async()=>{
        const result=await transitionOperationalTask(client,{role,taskId,status});
        return {tasks:state.tasks.map(t=>t.id===taskId?{...t,...result.task}:t),notice:"Task status saved with audit evidence. This is not proof of external execution."};
      });
    },
    async mutate(taskId,perform){
      if(!valid()||state.busy||!state.ready||state.needsRefresh.includes(taskId)||!state.tasks.some(t=>t.id===taskId)) return;
      const current=generation;emit({busy:true,error:"",notice:""});
      try {const patch=await perform();if(active&&generation===current) emit(patch);}
      catch(error){if(active&&generation===current) emit({error:error.message,needsRefresh:[...new Set([...state.needsRefresh,taskId])]});}
      finally{if(active&&generation===current) emit({busy:false});}
    },
  };
  return api;
}
