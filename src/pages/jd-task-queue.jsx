import React,{useEffect,useMemo,useState,useSyncExternalStore} from "react";
import {blankTask,createTaskWriteController,canManageTasks} from "../chat/operational-task-writes.mjs";

const tabStorage={getItem:key=>window.sessionStorage.getItem(key),setItem:(key,value)=>window.sessionStorage.setItem(key,value),removeItem:key=>window.sessionStorage.removeItem(key)};
const card={background:"var(--jd-card,#fff)",border:"1px solid var(--jd-border,#e7e9ed)",borderRadius:14,padding:18};
const input={width:"100%",boxSizing:"border-box",padding:"9px 10px",border:"1px solid #dfe2e7",borderRadius:8,background:"var(--jd-input,#fff)",color:"inherit",fontSize:13};
const button={padding:"10px 13px",border:"1px solid #dfe2e7",borderRadius:8,background:"var(--jd-card,#fff)",color:"inherit",cursor:"pointer",fontSize:12,fontWeight:650};

export function JDTaskQueue({client,role,schoolId,actorId,storage=tabStorage,onTasksChanged,active=true}) {
  const controller=useMemo(()=>createTaskWriteController(client,{role,schoolId,actorId,storage}),[client,role,schoolId,actorId,storage]);
  const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot);
  const [draft,setDraft]=useState(blankTask);
  useEffect(()=>{setDraft(blankTask());controller.activate();return()=>controller.deactivate();},[controller]);
  useEffect(()=>{if(active)void controller.refresh();},[controller,active]);
  useEffect(()=>{if(state.created)setDraft(blankTask());},[state.created]);
  useEffect(()=>{if(state.ready)onTasksChanged?.(state.tasks);},[state.ready,state.tasks,onTasksChanged]);
  const canManage=canManageTasks(role),locked=state.busy||!canManage;
  const update=(field,value)=>setDraft(old=>({...old,[field]:value}));
  return <div style={{display:"grid",gap:14}} aria-label="Operational task queue">
    {state.recoveryError&&<p role="alert" style={{padding:12,background:"#fff0ef",color:"#a52b27",borderRadius:9}}>{state.recoveryError}</p>}
    {state.error&&<p role="alert" style={{padding:12,background:"#fff0ef",color:"#a52b27",borderRadius:9}}>{state.error}</p>}
    {state.notice&&<p role="status" style={{padding:12,background:"#eaf7f0",color:"#176b49",borderRadius:9}}>{state.notice}</p>}
    <section style={card}><h2 style={{fontSize:17,margin:"0 0 12px"}}>Create operational task</h2>
      {state.attempt?<div>
        <h3 style={{fontSize:14}}>Unresolved creation request: {state.attempt.task.title}</h3>
        <p style={{fontSize:12,lineHeight:1.7}}>The original details and recovery ID are retained in this browser tab. Recovery resubmits the same idempotent request, not a new task. Do not start a replacement in another tab while this outcome is uncertain.</p>
        <dl style={{fontSize:12,overflowWrap:"anywhere"}}><dt>Description</dt><dd>{state.attempt.task.description||"None"}</dd><dt>Department / priority</dt><dd>{state.attempt.task.department||"General"} / {state.attempt.task.priority}</dd><dt>Due date</dt><dd>{state.attempt.task.dueAt||"No due date"}</dd></dl>
        <button type="button" style={button} disabled={locked||state.fatal} onClick={()=>controller.create()}>{state.busy?"Confirming request…":"Recover same request"}</button>
      </div>:<form onSubmit={event=>{event.preventDefault();void controller.create(draft);}}>
        <fieldset disabled={locked||state.fatal} style={{border:0,padding:0,margin:0,display:"grid",gap:10,gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))"}}>
          <label>Task title<input style={input} value={draft.title} maxLength={180} required onChange={e=>update("title",e.target.value)}/></label>
          <label>Department<input style={input} value={draft.department} maxLength={120} onChange={e=>update("department",e.target.value)}/></label>
          <label>Priority<select style={input} value={draft.priority} onChange={e=>update("priority",e.target.value)}>{["low","normal","high","urgent"].map(p=><option key={p}>{p}</option>)}</select></label>
          <label>Due date<input type="datetime-local" style={input} value={draft.dueAt} onChange={e=>update("dueAt",e.target.value)}/></label>
          <label style={{gridColumn:"1/-1"}}>Description<textarea style={input} rows={3} maxLength={5000} value={draft.description} onChange={e=>update("description",e.target.value)}/></label>
          <button type="submit" style={button}>Add task</button>
        </fieldset>
        <small>Submitted details are retained in this tab until creation and audit evidence are confirmed. A local recovery record is not proof that a task was saved.</small>
      </form>}
    </section>
    <section style={card} aria-busy={state.busy}>
      <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}><h2 style={{fontSize:17}}>Task queue</h2><button type="button" style={button} disabled={locked} onClick={controller.refresh}>{state.loading?"Refreshing…":"Refresh task records"}</button></div>
      {!state.ready&&<p role="status">Task and team records are not confirmed. Refresh is required before queue actions.</p>}
      <small>Latest returned task sample only. Completion records progress, not an external business outcome. Assignment confirmation does not verify audit evidence.</small>
      {state.tasks.map(task=>{
        const next=task.status==="queued"?"in_progress":task.status==="in_progress"?"completed":task.status==="blocked"?"queued":null;
        const uncertain=state.needsRefresh.includes(task.id);
        const disabled=locked||!state.ready||uncertain;
        const member=state.team.find(m=>m.id===task.assigned_to);
        return <article key={task.id} style={{borderTop:"1px solid #e7e9ed",padding:"14px 0",marginTop:10}}>
          <strong>{task.title}</strong><p style={{fontSize:12,overflowWrap:"anywhere"}}>{task.description||"No description"} · {task.department||"General"} · {task.priority} · {task.due_at?"Due "+new Date(task.due_at).toLocaleString():"No due date"}</p>
          <p style={{fontSize:12}}>{task.status.replaceAll("_"," ")} · {member?.full_name|| (task.assigned_to?"Assigned member (not in returned team list)":"Unassigned")}</p>
          {uncertain&&<p role="status">Update not confirmed. Refresh task records before another change.</p>}
          {canManage&&<div style={{display:"flex",gap:9,flexWrap:"wrap",alignItems:"center"}}>
            <select aria-label={"Assign "+task.title} style={{...input,width:190}} disabled={disabled} value={task.assigned_to||""} onChange={e=>{if(e.target.value)void controller.assign(task.id,e.target.value);}}>
              <option value="" disabled>Unassigned</option>
              {task.assigned_to&&!member&&<option value={task.assigned_to} disabled>Assigned member</option>}
              {state.team.map(m=><option key={m.id} value={m.id}>{m.full_name||m.role}</option>)}
            </select>
            <button type="button" style={button} disabled={disabled||!task.department||["completed","cancelled"].includes(task.status)} onClick={()=>controller.assign(task.id,null,true)}>Auto assign</button>
            {next&&<button type="button" style={button} disabled={disabled} onClick={()=>controller.transition(task.id,next)}>{next==="completed"?"Complete record":next==="in_progress"?"Start":"Requeue"}</button>}
          </div>}
        </article>;
      })}
      {state.ready&&!state.tasks.length&&<p>No tasks in the returned sample.</p>}
    </section>
  </div>;
}
