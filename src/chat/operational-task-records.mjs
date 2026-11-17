import {taskTransitionAction, transitionOperationalTask} from "./operational-task-client.mjs";

export const isTaskId = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const statuses = new Set(["queued","in_progress","blocked","completed","cancelled"]);
export const isSavedTaskCard = (ui,item) => ui?.source === "persisted_workspace_records" && isTaskId(item?.id);
export const nextChecklistTaskStatus = status => ["queued","blocked"].includes(status) ? "in_progress" : status === "in_progress" ? "completed" : null;
export function taskReadAction(role) {
  if (["owner","admin","manager"].includes(role)) return "operations.task.list";
  if (["staff","contractor"].includes(role)) return "operations.task.list_mine";
  if (role === "viewer") return "operations.task.list_readonly";
  return null;
}
export function savedTaskKey(messages) {
  const ids = new Set();
  for (const message of messages || []) {
    if (message.role !== "assistant") continue;
    const ui = message.visualWorkspace;
    for (const block of Array.isArray(ui?.blocks) ? ui.blocks : []) {
      if (block?.type !== "checklist") continue;
      for (const item of Array.isArray(block.items) ? block.items : []) if (isSavedTaskCard(ui,item)) ids.add(item.id);
    }
  }
  return [...ids].sort().join(",");
}
export async function readOperationalTasks(client,role) {
  const action = taskReadAction(role);
  if (!action) throw new Error("Your role cannot refresh operational task records.");
  let result;
  try {result = await client.functions.invoke("jd-automation",{body:{action,limit:250}});}
  catch {throw new Error("Task records could not be refreshed. No current status has been confirmed.");}
  if (result?.error || result?.data?.error || !Array.isArray(result?.data?.tasks)) {
    const status = result?.error?.context?.status || result?.error?.status;
    throw new Error(status === 401 ? "Sign in again before refreshing task records." : status === 403 ? "Your account cannot read these task records." : "Task records could not be refreshed. No current status has been confirmed.");
  }
  const seen = new Set();
  for (const task of result.data.tasks) {
    if (!isTaskId(task?.id) || !statuses.has(task?.status) || typeof task?.title !== "string" || seen.has(task.id)) {
      throw new Error("The task service returned incomplete records. Refresh before making changes.");
    }
    seen.add(task.id);
  }
  return result.data.tasks;
}

// UI coordination only, not an authority boundary. Every read/write still uses
// the authenticated endpoint and its tenant/assignment checks. No automatic retry.
export function createTaskRecordController(client,{role,taskIds=[]}) {
  let wanted = new Set(taskIds), refreshAfterWrites = false;
  const listeners = new Set();
  let active = false, generation = 0, readVersion = 0;
  let state = {phase:"idle",records:{},pending:[],needsRefresh:[],error:"",audits:{}};
  const emit = patch => {state={...state,...patch};for(const listener of listeners) listener();};
  const controller = {
    getSnapshot:()=>state,
    subscribe:listener=>{listeners.add(listener);return ()=>listeners.delete(listener);},
    activate(){active=true;generation++;emit({phase:"idle",records:{},pending:[],needsRefresh:[],error:"",audits:{}});},
    deactivate(){active=false;generation++;readVersion++;refreshAfterWrites=false;},
    setTaskIds(ids){
      wanted=new Set(ids);
      if(state.pending.length){refreshAfterWrites=true;return;}
      return controller.refresh();
    },
    async refresh({background=false}={}){
      if (!active || state.pending.length) return;
      const current = generation, version = ++readVersion;
      if (!wanted.size) {emit({phase:"idle",records:{},needsRefresh:[],error:"",audits:{}});return;}
      emit({phase:"loading",records:background?state.records:{},error:"",audits:{}});
      try {
        const tasks = await readOperationalTasks(client,role);
        if (!active || generation!==current || readVersion!==version) return;
        emit({phase:"ready",records:Object.fromEntries(tasks.filter(task=>wanted.has(task.id)).map(task=>[task.id,task])),needsRefresh:[]});
      } catch(error) {
        if (active && generation===current && readVersion===version) emit({phase:"error",records:{},error:error.message});
      }
    },
    async transition(taskId,status){
      if (!active || state.phase!=="ready" || !wanted.has(taskId) || !taskTransitionAction(role) || !state.records[taskId] || state.pending.includes(taskId) || state.needsRefresh.includes(taskId)) return;
      if (nextChecklistTaskStatus(state.records[taskId].status)!==status) return;
      const current = generation;
      emit({pending:[...state.pending,taskId],error:""});
      try {
        const result = await transitionOperationalTask(client,{taskId,status,role});
        if (!active || generation!==current) return;
        emit({records:{...state.records,[taskId]:{...state.records[taskId],...result.task}},audits:{...state.audits,[taskId]:result.auditId}});
      } catch(error) {
        if (active && generation===current) emit({needsRefresh:[...new Set([...state.needsRefresh,taskId])],error:error.message});
      } finally {
        if (active && generation===current) {
          emit({pending:state.pending.filter(id=>id!==taskId)});
          if(!state.pending.length&&refreshAfterWrites){refreshAfterWrites=false;void controller.refresh();}
        }
      }
    },
  };
  return controller;
}
