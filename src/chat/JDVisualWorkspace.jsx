import React, { useMemo, useState } from "react";
import { CheckCircle2, Circle, Clock3, AlertCircle, GitBranch, ClipboardList, MessageSquare, Building2, FileCheck2, ChevronDown, ChevronUp, ArrowRight, Activity } from "lucide-react";

import {isSavedTaskCard,nextChecklistTaskStatus} from "./operational-task-records.mjs";
import {taskTransitionAction} from "./operational-task-client.mjs";

const text = (value, fallback = "") => typeof value === "string" ? value.slice(0, 500) : fallback;
const list = (value, max = 30) => Array.isArray(value) ? value.slice(0, max) : [];
const statusLabel = (status) => ({ completed: "Complete", running: "In progress", in_progress: "In progress", blocked: "Blocked", failed: "Failed", pending: "Not started", queued: "Queued", awaiting_approval: "Awaiting approval", cancelled: "Cancelled" }[status] || "Pending");

function Status({ value }) {
  const status = String(value || "pending");
  const tone = status === "completed" ? "good" : ["failed", "blocked"].includes(status) ? "bad" : ["running", "in_progress", "awaiting_approval"].includes(status) ? "active" : "muted";
  return <span className={"jd-viz-status " + tone}>{statusLabel(status)}</span>;
}

function Panel({ title, icon: Icon, children, aside, collapsible = false }) {
  if (collapsible) return <details className="jd-viz-panel jd-task-disclosure"><summary className="jd-viz-panel-head"><span className="jd-viz-panel-title"><Icon size={14}/>{title}</span>{aside}<ChevronDown className="jd-disclosure-chevron" size={16} aria-hidden="true"/></summary><div className="jd-task-details">{children}</div></details>;
  return <section className="jd-viz-panel"><header className="jd-viz-panel-head"><span className="jd-viz-panel-title"><Icon size={14}/>{title}</span>{aside}</header>{children}</section>;
}

/**
 * Safe renderer for the structured assistant UI contract.
 * Supported blocks: checklist, workflow, question, timeline, departments, evidence.
 * Draft ticks remain local. Saved-task controls require separate authenticated
 * read/acknowledgement state; a model-supplied ID alone never makes a record writable.
 */
export function JDVisualWorkspace({ ui, onAnswer, onTaskToggle, taskRecords, taskRole, onRefreshTasks, onViewRuns, onTaskWork }) {
  const [checked, setChecked] = useState({});
  const [expanded, setExpanded] = useState({});
  const blocks = useMemo(() => list(ui?.blocks, 12).filter((block) =>
    block && typeof block === "object" && ["checklist", "workflow", "question", "timeline", "departments", "evidence"].includes(block.type)
  ), [ui]);
  if (!blocks.length) return null;

  const toggle = (key) => setExpanded((current) => ({ ...current, [key]: !current[key] }));
  return <div className="jd-visual-workspace" aria-label="JD interactive workspace">
    <style>{`
      .jd-visual-workspace{display:grid;gap:10px;margin:14px 0 4px;min-width:0}
      .jd-viz-panel{min-width:0;border:1px solid var(--jd-border);background:var(--jd-card);border-radius:14px;padding:13px 14px;box-shadow:0 4px 16px rgba(20,24,30,.035)}
      .jd-viz-panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:11px}
      .jd-viz-panel-title{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:750;color:var(--jd-text)}
      .jd-viz-panel-title svg{color:var(--jd-muted)}
      .jd-viz-status{display:inline-flex;align-items:center;border-radius:999px;padding:4px 7px;font-size:9px;font-weight:700;white-space:nowrap;background:var(--jd-soft);color:var(--jd-muted)}
      .jd-viz-status.good{background:var(--jd-soft);color:var(--jd-text)}.jd-viz-status.bad{background:var(--jd-soft);color:var(--jd-text)}.jd-viz-status.active{background:var(--jd-soft);color:var(--jd-text)}
      .jd-viz-row{display:flex;align-items:flex-start;gap:9px;padding:9px 0;border-top:1px solid var(--jd-border);min-width:0}
      .jd-viz-row:first-child{border-top:0;padding-top:0}
      .jd-viz-copy{flex:1;min-width:0}.jd-viz-copy strong{display:block;font-size:11px;color:var(--jd-text);font-weight:650;overflow-wrap:anywhere}.jd-viz-copy small{display:block;color:var(--jd-muted);font-size:10px;line-height:1.5;margin-top:3px;overflow-wrap:anywhere}
      .jd-viz-check{border:0;background:transparent;color:var(--jd-muted);padding:1px;display:grid;place-items:center;cursor:pointer}.jd-viz-check[aria-pressed=true]{color:var(--jd-text)}
      .jd-viz-progress{height:6px;background:var(--jd-soft);border-radius:99px;overflow:hidden;margin:7px 0 10px}.jd-viz-progress>span{display:block;height:100%;background:var(--jd-muted);border-radius:99px}
      .jd-viz-flow{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,145px),1fr));gap:8px}
      .jd-viz-node{min-width:0;border:1px solid var(--jd-border);border-radius:10px;padding:10px;background:var(--jd-soft);position:relative}
      .jd-viz-node strong{display:block;font-size:10px;color:var(--jd-text);overflow-wrap:anywhere}.jd-viz-node small{display:block;color:var(--jd-muted);font-size:9px;line-height:1.45;margin-top:4px}
      .jd-viz-question{background:var(--jd-soft);border:1px solid var(--jd-border);border-radius:11px;padding:12px}
      .jd-viz-question p{font-size:12px;font-weight:650;color:var(--jd-text);margin:0 0 10px;line-height:1.5}
      .jd-viz-options{display:flex;flex-wrap:wrap;gap:7px}
      .jd-viz-option{border:1px solid var(--jd-border);background:var(--jd-card);border-radius:9px;padding:8px 10px;font-size:10px;color:var(--jd-text);cursor:pointer}
      .jd-viz-option:hover{border-color:var(--jd-border);background:var(--jd-soft)}
      .jd-viz-timeline{display:grid;gap:0}.jd-viz-event{display:grid;grid-template-columns:17px 1fr auto;gap:8px;align-items:start;padding:7px 0}.jd-viz-event>span:first-child{color:var(--jd-muted);padding-top:1px}.jd-viz-event strong{font-size:10px;color:var(--jd-text)}.jd-viz-event small{display:block;font-size:9px;color:var(--jd-muted);margin-top:3px;line-height:1.45}
      .jd-viz-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:7px}.jd-viz-metric{border:1px solid var(--jd-border);background:var(--jd-card);border-radius:10px;padding:11px;min-width:0}.jd-viz-metric small{display:block;font-size:9px;color:var(--jd-muted)}.jd-viz-metric strong{display:block;font-size:18px;letter-spacing:-.6px;color:var(--jd-text);margin-top:4px}.jd-viz-department-detail{display:-webkit-box!important;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.45;margin-top:5px}
      .jd-viz-evidence{display:flex;flex-wrap:wrap;gap:7px}.jd-viz-evidence-item{display:flex;flex-direction:column;gap:4px;border:1px solid var(--jd-border);border-radius:8px;padding:7px 9px;font-size:9px;color:var(--jd-text);background:var(--jd-soft);overflow-wrap:anywhere;min-width:0}.jd-viz-evidence-item small{font-size:9px;line-height:1.45;color:var(--jd-muted)}
      .jd-viz-expand{border:0;background:transparent;color:var(--jd-muted);font-size:10px;display:flex;align-items:center;gap:5px;cursor:pointer;padding:4px 0}
      @media(max-width:420px){.jd-viz-panel{padding:11px}.jd-viz-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `}</style>
    {blocks.map((block, index) => {
      const key = String(block.id || block.type + "-" + index);
      if (block.type === "checklist") {
        const items = list(block.items, 40);
        const saved = ui?.source === "persisted_workspace_records";
        const records = taskRecords?.records || {};
        const localKey = (item,i) => key + "-" + i + "-" + JSON.stringify(item);
        const statusConfirmed = saved && items.length>0 && items.every(item=>isSavedTaskCard(ui,item)&&records[item.id]);
        const done = saved ? items.filter(item=>isSavedTaskCard(ui,item) && records[item.id]?.status === "completed").length : 0;
        const localTicks = saved ? 0 : items.filter((item,i)=>checked[localKey(item,i)]).length;
        const pct = items.length ? Math.round((saved?done:localTicks) / items.length * 100) : 0;
        return <Panel collapsible key={key} title={text(block.title, "Task checklist")} icon={ClipboardList} aside={<span className="jd-viz-status">{saved ? statusConfirmed ? `${done}/${items.length} records complete` : "Status not confirmed" : `${localTicks}/${items.length} local ticks`}</span>}>
          <p className="jd-task-explanation">{saved ? "Track work across your organisation. Ask JD to work on a task when you want it to take the next authorised step." : "This is a draft checklist, not an active job. Local ticks do not perform work or save progress."}</p>
          {saved && <div className="jd-task-actions">
            {onRefreshTasks && <button type="button" onClick={onRefreshTasks} disabled={taskRecords?.phase==="loading"||Boolean(taskRecords?.pending?.length)}>{taskRecords?.phase==="loading"?"Refreshing task records…":"Refresh task records"}</button>}
            {onViewRuns && <button type="button" onClick={onViewRuns}>View JD execution runs</button>}
          </div>}
          {saved && <p className="jd-task-explanation">Task statuses refresh automatically while this conversation is open. Refreshing checks records; it does not start work.</p>}
          {saved && taskRecords?.error && <p role="alert">{taskRecords.error}</p>}
          <div className="jd-viz-progress" aria-label={saved?"Refreshed record completion":"Local draft ticks only"}><span style={{ width: pct + "%" }}/></div>
          {items.map((item, i) => {
            const record = isSavedTaskCard(ui,item) ? records[item.id] : null;
            const localChecked = !saved && Boolean(checked[localKey(item,i)]);
            const isDone = saved ? record?.status === "completed" : localChecked;
            const taskAction = record ? nextChecklistTaskStatus(record.status) : null;
            const isPending = saved && Boolean(taskRecords?.pending?.includes(item?.id));
            const needsRefresh = saved && Boolean(taskRecords?.needsRefresh?.includes(item?.id));
            const canPersist = saved && Boolean(record) && taskRecords?.phase === "ready" && Boolean(taskTransitionAction(taskRole)) && typeof onTaskToggle === "function" && !needsRefresh;
            const title = text(record?.title,text(item?.title,"Untitled task"));
            const actionLabel = saved ? (taskAction === "completed" ? "Mark record complete: " : "Start task record: ") + title : (localChecked ? "Uncheck local draft: " : "Check local draft: ") + title;
            const description = record ? record.description : item?.description;
            return <div className="jd-viz-row" key={localKey(item,i)}>
              <button className="jd-viz-check" type="button" aria-label={actionLabel} aria-pressed={isDone} aria-busy={isPending}
                disabled={saved && (!canPersist || !taskAction || isPending)}
                onClick={()=>saved ? onTaskToggle?.(item.id,taskAction) : setChecked(current=>({...current,[localKey(item,i)]:!current[localKey(item,i)]}))}>
                {isDone?<CheckCircle2 size={17}/>:<Circle size={17}/>}
              </button>
              <div className="jd-viz-copy"><strong>{title}</strong>{description&&<small>{text(description)}</small>}
                <small>{saved ? record ? "Saved record — refreshed from workspace" : "Saved snapshot — current record not confirmed" : "Local checklist — no saved record confirmed. Ticks stay only in this view."}</small>
                {saved&&!record&&<small>Refresh task records to check status. Missing records may be outside the returned list or no longer accessible.</small>}
                {saved&&record&&!taskTransitionAction(taskRole)&&<small>Read-only for your role.</small>}
                {isPending&&<small role="status">Saving record status…</small>}
                {needsRefresh&&<small role="status">Update not confirmed. Refresh task records before trying again.</small>}
                {taskRecords?.audits?.[item?.id]&&saved&&<small>Status saved with audit evidence.</small>}
                {saved && record && canPersist && taskAction && onTaskWork && <button className="jd-task-work" type="button" disabled={isPending} onClick={()=>onTaskWork(record)}>Ask JD to work on this</button>}
                <small>Planned owner role: {text(item?.owner,"Unassigned")}</small>
                {list(item?.dependencies,8).length>0&&<small>Depends on: {list(item.dependencies,8).map(dependency=>text(dependency)).join(", ")}</small>}
                {item?.approval_required&&<small style={{color:"var(--jd-text-soft)"}}>Owner approval required before action: {text(item.approval_reason,"Approval required")}</small>}
              </div>
              {record ? record.status === "completed" ? <span className="jd-viz-status good">Complete</span> : <Status value={record.status}/> : <span className="jd-viz-status">{saved?"Not confirmed":localChecked?"Locally checked":"Draft"}</span>}
            </div>;
          })}
          {block.sample_truncated&&<small style={{color:"var(--jd-text-soft)",fontSize:9}}>Only a sample of tasks is shown.</small>}
          <small style={{color:"var(--jd-muted)",fontSize:10}}>{saved ? "Task status shows recorded progress. It does not independently verify an external business outcome." : "Local ticks do not save tasks."}</small>
        </Panel>;
      }
      if (block.type === "workflow") return <Panel key={key} title={text(block.title, "Workflow")} icon={GitBranch} aside={<Status value={block.status}/>}>
        {block.description && <p style={{ fontSize: 10, color: "var(--jd-muted)", margin: "0 0 10px", lineHeight: 1.5 }}>{text(block.description)}</p>}
        <div className="jd-viz-flow">{list(block.steps, 24).map((step, i) => <div className="jd-viz-node" key={String(step?.id || i)}><div style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "center" }}><strong>{text(step?.title, "Workflow step")}</strong><Status value={step?.status}/></div>{step?.description && <small>{text(step.description)}</small>}{step?.owner && <small>Owner: {text(step.owner)}</small>}</div>)}</div>
      </Panel>;
      if (block.type === "question") return <Panel key={key} title={text(block.title, "Decision required")} icon={MessageSquare}>
        <div className="jd-viz-question"><p>{text(block.prompt, "JD needs a decision before continuing.")}</p><div className="jd-viz-options">{list(block.options, 8).map((option, i) => <button className="jd-viz-option" type="button" key={i} onClick={() => onAnswer?.(text(option?.value, text(option?.label))) }>{text(option?.label, "Choose option")}</button>)}</div></div>
      </Panel>;
      if (block.type === "timeline") return <Panel collapsible key={key} title="Activity details" icon={Activity}>
        <div className="jd-viz-timeline">{!list(block.events, 30).length&&<p className="jd-viz-empty">No activity details were included in this snapshot.</p>}{list(block.events, 30).map((event, i) => <div className="jd-viz-event" key={i}><span>{event?.status === "completed" ? <CheckCircle2 size={14}/> : event?.status === "failed" ? <AlertCircle size={14}/> : event?.status === "running" ? <Activity size={14}/> : <Clock3 size={14}/>}</span><div><strong>{text(event?.title, "Activity")}</strong>{event?.detail && <small>{text(event.detail)}</small>}</div><Status value={event?.status}/></div>)}</div>
      </Panel>;
      if (block.type === "departments") return <Panel key={key} title={text(block.title, "Departments")} icon={Building2}>
        <div className="jd-viz-metrics jd-viz-departments">{list(block.items, 20).map((item, i) => <div className="jd-viz-metric" key={i}><small>{text(item?.name, "Department")}</small><strong>{text(item?.metric, "—")}</strong>{item?.detail && <small className="jd-viz-department-detail">{text(item.detail)}</small>}{Number(item?.total ?? item?.total_tasks ?? item?.task_count ?? (String(item?.detail || "").match(/(\d+) total/i)?.[1])) === 0 ? <span className="jd-viz-status">No tasks assigned</span> : <Status value={item?.status}/>}</div>)}</div>
      </Panel>;
      const evidence = list(block.items, 30);
      return <Panel collapsible key={key} title="Execution records" icon={FileCheck2} aside={<Status value={block.status}/>}>
        <div className="jd-viz-evidence">{evidence.map((item, i) => <span className="jd-viz-evidence-item" key={i}><span>{text(item?.label, "Evidence")}</span>{item?.detail && <small>{text(item.detail)}</small>}</span>)}</div>
        {block.summary && <p style={{ fontSize: 10, lineHeight: 1.55, color: "var(--jd-muted)", margin: "9px 0 0" }}>{text(block.summary)}</p>}
        {(list(block.details, 12).length > 0 || evidence.some(item=>item?.reference)) && <><button type="button" className="jd-viz-expand" onClick={() => toggle(key)}>{expanded[key] ? <ChevronUp size={13}/> : <ChevronDown size={13}/>} {expanded[key] ? "Hide details" : "Show details"}<ArrowRight size={11}/></button>{expanded[key] && <ul style={{ margin: "4px 0 0", paddingLeft: 18, color: "var(--jd-muted)", fontSize: 10, lineHeight: 1.7 }}>{list(block.details, 12).map((detail, i) => <li key={i}>{text(detail)}</li>)}{evidence.filter(item=>item?.reference).map((item,i)=><li key={"ref-"+i}>{text(item.label,"Evidence")} — reference: {text(item.reference)}</li>)}</ul>}</>}
      </Panel>;
    })}
  </div>;
}
