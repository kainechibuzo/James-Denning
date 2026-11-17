import React,{useEffect,useMemo,useState,useSyncExternalStore} from 'react';
import {canChangeExecution,createExecutionMonitorController} from './execution-monitor.mjs';
import {friendlyStatus,friendlyTool} from './run-history.mjs';
const fmt=value=>value?new Date(value).toLocaleString():'Not recorded';
export function JDExecutionMonitor({client,role,scopeKey,active=true}){
 const controller=useMemo(()=>createExecutionMonitorController(client,{role}),[client,role,scopeKey]);
 const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot);
 const [confirmation,setConfirmation]=useState(null);
 useEffect(()=>{setConfirmation(null);controller.activate();return()=>controller.deactivate();},[controller]);
 useEffect(()=>{if(active)void controller.refresh();else setConfirmation(null);},[controller,active]);
 const disabled=state.busy||state.phase!=='ready'||state.needsRefresh;
 const ask=(job,action)=>{if(!disabled&&canChangeExecution(role,job,action))setConfirmation({jobId:job.id,action});};
 const confirm=()=>{if(!confirmation)return;const {jobId,action}=confirmation;setConfirmation(null);void controller.change(jobId,action);};
 return <section aria-label="JD execution monitor" aria-busy={state.busy} style={{padding:18,border:'1px solid var(--jd-border)',borderRadius:14}}>
  <header><h2>JD execution monitor</h2><p>Persisted job and run records, not independently verified business outcomes. Up to 100 runs and 500 steps.</p><button type="button" disabled={state.busy} onClick={()=>{setConfirmation(null);void controller.refresh();}}>Refresh execution records</button></header>
  {state.error&&<p role="alert">{state.error}</p>}{state.notice&&<p role="status">{state.notice}</p>}
  {state.needsRefresh&&<p role="status">No further execution changes are allowed until records are refreshed. No write was automatically retried.</p>}
  {confirmation&&<section role="region" aria-label="Confirm execution change" style={{padding:14,border:'2px solid var(--jd-muted)',marginTop:12}}>
   <h3>{confirmation.action==='retry'?'Review before retrying':'Review before cancelling'}</h3>
   <p>{confirmation.action==='retry'?'Retrying can repeat external effects already performed. Inspect the earlier execution evidence and confirm that another attempt is authorised.':'Only queued or waiting jobs can be cancelled. Cancellation does not undo earlier external effects.'}</p>
   <button type="button" disabled={disabled} onClick={confirm}>{confirmation.action==='retry'?'Confirm retry':'Confirm cancellation'}</button>{' '}
   <button type="button" onClick={()=>setConfirmation(null)}>Keep unchanged</button>
  </section>}
  {state.phase==='loading'&&<p role="status">Refreshing execution records…</p>}
  {state.phase==='error'&&<p>Execution history unavailable. No current state has been confirmed.</p>}
  {state.phase==='ready'&&!state.runs.length&&<p>No runs returned in this workspace history sample.</p>}
  {state.runs.map(run=><article key={run.id} style={{borderTop:'1px solid var(--jd-border)',marginTop:14,paddingTop:12}}>
   <h3>{run.request_text||'Workspace execution'}</h3><p>Run record: {friendlyStatus(run.status)} · Created: {fmt(run.created_at)}</p>
   <p>Started: {fmt(run.started_at)} · Finished: {fmt(run.completed_at)}</p>
   <details><summary>Diagnostic record reference</summary><code>{run.id}</code></details>
   {state.jobs.filter(j=>j.run_id===run.id).map(job=><div key={job.id}>
    <p>Job record: {friendlyStatus(job.status)} · Attempt {job.attempt_count}/{job.max_attempts}</p>
    {job.status!==run.status&&<p role="status">Job and run states differ. These are separate recorded states; review before drawing a conclusion.</p>}
    {job.hasError&&<p>Execution error recorded. Ask an authorised administrator to review restricted diagnostics.</p>}
    {canChangeExecution(role,job,'retry',run)&&<button type="button" disabled={disabled} onClick={()=>ask(job,'retry')}>Review retry</button>}
    {canChangeExecution(role,job,'cancel')&&<button type="button" disabled={disabled} onClick={()=>ask(job,'cancel')}>Review cancellation</button>}
   </div>)}
   {!state.jobs.some(j=>j.run_id===run.id)&&<p>No job record returned for this run.</p>}
   <ul>{state.steps.filter(s=>s.run_id===run.id).map(step=><li key={step.id}>{friendlyTool(step.tool_key)} — {friendlyStatus(step.status)}{step.hasError?' · Restricted diagnostics require administrator review.':''}</li>)}</ul>
  </article>)}
 </section>;
}
