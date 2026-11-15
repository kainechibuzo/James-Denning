import React, { useMemo, useState } from "react";
import { CheckCircle2, Circle, Clock3, AlertCircle, GitBranch, ClipboardList, MessageSquare, Building2, FileCheck2, ChevronDown, ChevronUp, ArrowRight, Activity } from "lucide-react";

const text = (value, fallback = "") => typeof value === "string" ? value.slice(0, 500) : fallback;
const list = (value, max = 30) => Array.isArray(value) ? value.slice(0, max) : [];
const statusLabel = (status) => ({ completed: "Complete", running: "Running", in_progress: "In progress", blocked: "Blocked", failed: "Failed", pending: "Not started", awaiting_approval: "Awaiting approval", queued: "Queued" }[status] || "Pending");

function Status({ value }) {
  const status = String(value || "pending");
  const tone = status === "completed" ? "good" : ["failed", "blocked"].includes(status) ? "bad" : ["running", "in_progress", "awaiting_approval"].includes(status) ? "active" : "muted";
  return <span className={"jd-viz-status " + tone}>{statusLabel(status)}</span>;
}

function Panel({ title, icon: Icon, children, aside }) {
  return <section className="jd-viz-panel"><header className="jd-viz-panel-head"><span className="jd-viz-panel-title"><Icon size={14}/>{title}</span>{aside}</header>{children}</section>;
}

/**
 * Safe renderer for the structured assistant UI contract.
 * Supported blocks: checklist, workflow, question, timeline, departments, evidence.
 * The UI is advisory: check states are local until a real backend action persists them.
 */
export function JDVisualWorkspace({ ui, onAnswer, onTaskToggle }) {
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
      .jd-viz-panel{min-width:0;border:1px solid #e4e7eb;background:#fff;border-radius:14px;padding:13px 14px;box-shadow:0 4px 16px rgba(20,24,30,.035)}
      .jd-viz-panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:11px}
      .jd-viz-panel-title{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:750;color:#303640}
      .jd-viz-panel-title svg{color:#6b7480}
      .jd-viz-status{display:inline-flex;align-items:center;border-radius:999px;padding:4px 7px;font-size:9px;font-weight:700;white-space:nowrap;background:#f1f3f5;color:#737b86}
      .jd-viz-status.good{background:#edf7f0;color:#287548}.jd-viz-status.bad{background:#fff0ef;color:#a33b35}.jd-viz-status.active{background:#eef4fb;color:#315d88}
      .jd-viz-row{display:flex;align-items:flex-start;gap:9px;padding:9px 0;border-top:1px solid #f0f1f3;min-width:0}
      .jd-viz-row:first-child{border-top:0;padding-top:0}
      .jd-viz-copy{flex:1;min-width:0}.jd-viz-copy strong{display:block;font-size:11px;color:#333943;font-weight:650;overflow-wrap:anywhere}.jd-viz-copy small{display:block;color:#818894;font-size:10px;line-height:1.5;margin-top:3px;overflow-wrap:anywhere}
      .jd-viz-check{border:0;background:transparent;color:#69727e;padding:1px;display:grid;place-items:center;cursor:pointer}.jd-viz-check[aria-pressed=true]{color:#23814d}
      .jd-viz-progress{height:6px;background:#edf0f2;border-radius:99px;overflow:hidden;margin:7px 0 10px}.jd-viz-progress>span{display:block;height:100%;background:#36845b;border-radius:99px}
      .jd-viz-flow{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,145px),1fr));gap:8px}
      .jd-viz-node{min-width:0;border:1px solid #e8eaed;border-radius:10px;padding:10px;background:#fafbfc;position:relative}
      .jd-viz-node strong{display:block;font-size:10px;color:#343a43;overflow-wrap:anywhere}.jd-viz-node small{display:block;color:#858c96;font-size:9px;line-height:1.45;margin-top:4px}
      .jd-viz-question{background:#f8f9fb;border:1px solid #e9ebef;border-radius:11px;padding:12px}
      .jd-viz-question p{font-size:12px;font-weight:650;color:#303640;margin:0 0 10px;line-height:1.5}
      .jd-viz-options{display:flex;flex-wrap:wrap;gap:7px}
      .jd-viz-option{border:1px solid #dfe3e8;background:#fff;border-radius:9px;padding:8px 10px;font-size:10px;color:#424a55;cursor:pointer}
      .jd-viz-option:hover{border-color:#aeb7c2;background:#f5f7f9}
      .jd-viz-timeline{display:grid;gap:0}.jd-viz-event{display:grid;grid-template-columns:17px 1fr auto;gap:8px;align-items:start;padding:7px 0}.jd-viz-event>span:first-child{color:#7d8792;padding-top:1px}.jd-viz-event strong{font-size:10px;color:#414852}.jd-viz-event small{display:block;font-size:9px;color:#858d97;margin-top:3px;line-height:1.45}
      .jd-viz-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:7px}.jd-viz-metric{border:1px solid #eceef0;background:#fafbfc;border-radius:10px;padding:10px}.jd-viz-metric small{display:block;font-size:9px;color:#838b96}.jd-viz-metric strong{display:block;font-size:18px;letter-spacing:-.6px;color:#303640;margin-top:4px}
      .jd-viz-evidence{display:flex;flex-wrap:wrap;gap:7px}.jd-viz-evidence-item{border:1px solid #e6e9ed;border-radius:8px;padding:7px 9px;font-size:9px;color:#626c78;background:#fafbfc;overflow-wrap:anywhere}
      .jd-viz-expand{border:0;background:transparent;color:#68727e;font-size:10px;display:flex;align-items:center;gap:5px;cursor:pointer;padding:4px 0}
      @media(max-width:420px){.jd-viz-panel{padding:11px}.jd-viz-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `}</style>
    {blocks.map((block, index) => {
      const key = String(block.id || block.type + "-" + index);
      if (block.type === "checklist") {
        const items = list(block.items, 40);
        const done = items.filter((item, i) => item?.status === "completed" || checked[key + "-" + i]).length;
        const pct = items.length ? Math.round(done / items.length * 100) : 0;
        return <Panel key={key} title={text(block.title, "Task checklist")} icon={ClipboardList} aside={<span className="jd-viz-status">{done}/{items.length} done</span>}>
          <div className="jd-viz-progress"><span style={{ width: pct + "%" }}/></div>
          {items.map((item, i) => {
            const isDone = item?.status === "completed" || Boolean(checked[key + "-" + i]);
            const taskStatus = item?.status || "pending";
            const canPersist = typeof item?.id === "string" && typeof onTaskToggle === "function";
            const taskAction = taskStatus === "queued" || taskStatus === "pending" || taskStatus === "blocked" ? "in_progress" : taskStatus === "in_progress" ? "completed" : null;
            return <div className="jd-viz-row" key={i}><button className="jd-viz-check" type="button" aria-label={(taskStatus === "in_progress" ? "Complete " : "Start ") + text(item?.title, "task")} aria-pressed={isDone} disabled={canPersist ? !taskAction : false} onClick={() => canPersist ? onTaskToggle(item.id, taskAction) : setChecked((current) => ({ ...current, [key + "-" + i]: !current[key + "-" + i] }))}>{isDone ? <CheckCircle2 size={17}/> : <Circle size={17}/>}</button><div className="jd-viz-copy"><strong>{text(item?.title, "Untitled task")}</strong>{item?.description && <small>{text(item.description)}</small>}</div><Status value={isDone ? "completed" : item?.status}/></div>;
          })}
          {block.sample_truncated && <small style={{ color: "#8a5d18", fontSize: 9 }}>Showing the latest 30 tasks; the department summary may be sampled if the workspace has more than 5,000 tasks.</small>}<small style={{ color: "#8a919a", fontSize: 9 }}>Tasks with IDs update through the authenticated JD task endpoint. Queued tasks start first; in-progress tasks can then be completed.</small>
        </Panel>;
      }
      if (block.type === "workflow") return <Panel key={key} title={text(block.title, "Workflow")} icon={GitBranch} aside={<Status value={block.status}/>}>
        {block.description && <p style={{ fontSize: 10, color: "#7b838d", margin: "0 0 10px", lineHeight: 1.5 }}>{text(block.description)}</p>}
        <div className="jd-viz-flow">{list(block.steps, 24).map((step, i) => <div className="jd-viz-node" key={String(step?.id || i)}><div style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "center" }}><strong>{text(step?.title, "Workflow step")}</strong><Status value={step?.status}/></div>{step?.description && <small>{text(step.description)}</small>}{step?.owner && <small>Owner: {text(step.owner)}</small>}</div>)}</div>
      </Panel>;
      if (block.type === "question") return <Panel key={key} title={text(block.title, "Decision required")} icon={MessageSquare}>
        <div className="jd-viz-question"><p>{text(block.prompt, "JD needs a decision before continuing.")}</p><div className="jd-viz-options">{list(block.options, 8).map((option, i) => <button className="jd-viz-option" type="button" key={i} onClick={() => onAnswer?.(text(option?.value, text(option?.label))) }>{text(option?.label, "Choose option")}</button>)}</div></div>
      </Panel>;
      if (block.type === "timeline") return <Panel key={key} title={text(block.title, "Execution timeline")} icon={Activity}>
        <div className="jd-viz-timeline">{list(block.events, 30).map((event, i) => <div className="jd-viz-event" key={i}><span>{event?.status === "completed" ? <CheckCircle2 size={14}/> : event?.status === "failed" ? <AlertCircle size={14}/> : event?.status === "running" ? <Activity size={14}/> : <Clock3 size={14}/>}</span><div><strong>{text(event?.title, "Activity")}</strong>{event?.detail && <small>{text(event.detail)}</small>}</div><Status value={event?.status}/></div>)}</div>
      </Panel>;
      if (block.type === "departments") return <Panel key={key} title={text(block.title, "Departments")} icon={Building2}>
        <div className="jd-viz-metrics">{list(block.items, 20).map((item, i) => <div className="jd-viz-metric" key={i}><small>{text(item?.name, "Department")}</small><strong>{text(item?.metric, "—")}</strong>{item?.detail && <small>{text(item.detail)}</small>}{Number(item?.total ?? item?.total_tasks ?? item?.task_count ?? (String(item?.detail || "").match(/(\d+) total/i)?.[1])) === 0 ? <span className="jd-viz-status">No tasks assigned</span> : <Status value={item?.status}/>}</div>)}</div>
      </Panel>;
      const evidence = list(block.items, 30);
      return <Panel key={key} title={text(block.title, "Evidence and verification")} icon={FileCheck2} aside={<Status value={block.status}/>}>
        <div className="jd-viz-evidence">{evidence.map((item, i) => <span className="jd-viz-evidence-item" key={i}>{text(item?.label, "Evidence")}{item?.reference ? " · " + text(item.reference, "") : ""}</span>)}</div>
        {block.summary && <p style={{ fontSize: 10, lineHeight: 1.55, color: "#77808b", margin: "9px 0 0" }}>{text(block.summary)}</p>}
        {list(block.details, 12).length > 0 && <><button type="button" className="jd-viz-expand" onClick={() => toggle(key)}>{expanded[key] ? <ChevronUp size={13}/> : <ChevronDown size={13}/>} {expanded[key] ? "Hide details" : "Show details"}<ArrowRight size={11}/></button>{expanded[key] && <ul style={{ margin: "4px 0 0", paddingLeft: 18, color: "#737d88", fontSize: 10, lineHeight: 1.7 }}>{list(block.details, 12).map((detail, i) => <li key={i}>{text(detail)}</li>)}</ul>}</>}
      </Panel>;
    })}
  </div>;
}
