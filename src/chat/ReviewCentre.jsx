import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient.js";
import { RefreshCw, ShieldCheck, Check, X, Clock3, AlertTriangle } from "lucide-react";

export function ReviewCentre({ onClose, onDecision }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [decisionNote, setDecisionNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const { data, error: invokeError } = await supabase.functions.invoke("jd-automation", {
      body: { action: "approvals.list" },
    });
    if (invokeError) setError(invokeError.message || "Could not load approval requests.");
    else setItems(data?.approvals || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (item, decision) => {
    if (busyId) return;
    setBusyId(item.id); setError(""); setNotice("");
    const { data, error: invokeError } = await supabase.functions.invoke("jd-automation", {
      body: { action: "approvals.decide", approvalId: item.id, decision, note: decisionNote },
    });
    if (invokeError) setError(invokeError.message || "Could not record your decision.");
    else {
      setNotice(data?.execution?.message || "Decision recorded.");
      await load();
      onDecision?.(decision, item, data);
    }
    setBusyId("");
  };

  const pending = items.filter((item) => item.status === "pending");
  return (
    <div className="jd-review-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose?.();}}>
    <section className="jd-review">
      <header className="jd-review-head">
        <div><div className="jd-review-eyebrow"><ShieldCheck size={13}/> GOVERNANCE</div><h2>Review Centre</h2><p>Review consequential requests before any external action is considered.</p></div>
        <div className="jd-review-controls"><button type="button" onClick={load} aria-label="Refresh approvals"><RefreshCw size={15}/></button>{onClose&&<button type="button" onClick={onClose}>Back to JD</button>}</div>
      </header>
      {error&&<div className="jd-review-alert error"><AlertTriangle size={14}/>{error}</div>}
      {notice&&<div className="jd-review-alert">{notice}</div>}
      <div className="jd-review-summary"><strong>{pending.length}</strong><span>pending review</span><span className="jd-review-total">{items.length} total requests</span></div>
      {loading?<div className="jd-review-empty">Loading review requests…</div>:items.length===0?<div className="jd-review-empty"><ShieldCheck size={25}/><strong>Nothing to review</strong><span>New high-impact requests from JD will appear here.</span></div>:<div className="jd-review-list">
        {items.map((item)=>(
          <article className="jd-review-card" key={item.id}>
            <div className="jd-review-card-top"><span className={"jd-review-status "+item.status}>{item.status.replaceAll("_"," ")}</span><span className="jd-review-date"><Clock3 size={12}/>{new Date(item.created_at).toLocaleString()}</span></div>
            <h3>{item.title||"JD action request"}</h3>
            {item.action_key==="organisation.provision_departments"&&<div className="jd-review-jd-tag">✦ Prepared by JD · {item.proposal_json?.blueprint?.departments?.length||0} proposed departments</div> }
            <p>{item.reason}</p>
            <div className="jd-review-request">{item.proposal_json?.request_text||"Request details unavailable."}</div>
            {Array.isArray(item.proposal_json?.blueprint?.departments)&&<div className="jd-review-blueprint">
              <div className="jd-review-blueprint-head">
                <strong>{item.proposal_json.blueprint.name||"Proposed organisation"}</strong>
                <span>{item.proposal_json.blueprint.industry||"Business"} · {item.proposal_json.blueprint.departments.length} departments</span>
              </div>
              <p>{item.proposal_json.blueprint.businessModel}</p>
              {item.proposal_json.blueprint.departments.map((department,index)=>(
                <div className="jd-review-department" key={department.name||index}>
                  <strong>{department.name}</strong>
                  <p>{department.purpose}</p>
                  {Array.isArray(department.roles)&&<div><small>Positions</small><span>{department.roles.join(" · ")}</span></div>}
                  {Array.isArray(department.workflows)&&<div><small>Daily work</small><span>{department.workflows.join(" · ")}</span></div>}
                  {Array.isArray(department.kpis)&&<div><small>How success is measured</small><span>{department.kpis.join(" · ")}</span></div>}
                </div>
              ))}
            </div>}
            <div className="jd-review-meta"><span>Risk: {item.risk_level}</span><span>Execution: {item.execution_status?.replaceAll("_"," ")||"not executed"}</span></div>
            {item.status==="pending"&&<><label className="jd-review-note-label" htmlFor={"decision-note-"+item.id}>Message to JD (optional)</label><textarea id={"decision-note-"+item.id} className="jd-review-note" value={decisionNote} onChange={(event)=>setDecisionNote(event.target.value)} placeholder="Tell JD what to change or consider…" rows={2}/><div className="jd-review-actions"><button type="button" disabled={!!busyId} onClick={()=>decide(item,"reject")}><X size={14}/> Reject</button><button type="button" disabled={!!busyId} onClick={()=>decide(item,"approve")}><Check size={14}/> Accept</button></div></>}
            {item.status==="approved"&&<div className="jd-review-safe-note">Approved decision recorded. No action has been executed.</div>}
          </article>
        ))}
      </div>}
      <style>{`
        .jd-review-backdrop{position:fixed;inset:0;z-index:60;background:rgba(18,22,28,.42);display:flex;align-items:center;justify-content:center;padding:18px}
        .jd-review{width:min(900px,100%);max-height:min(90dvh,900px);min-height:0;overflow:auto;padding:24px clamp(14px,3vw,32px);background:#f7f8fa;color:#202329;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;border:1px solid rgba(255,255,255,.6);border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.24)}
        .jd-review-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;max-width:900px;margin:0 auto 22px}
        .jd-review-eyebrow{display:flex;align-items:center;gap:7px;font-size:9px;letter-spacing:.14em;font-weight:800;color:#7a818b}
        .jd-review-head h2{font-size:27px;letter-spacing:-1px;margin:10px 0 5px}.jd-review-head p{font-size:12px;color:#7d838c;margin:0;line-height:1.6}
        .jd-review-controls{display:flex;gap:7px}.jd-review-controls button{border:1px solid #dfe2e7;background:#fff;border-radius:9px;padding:8px 11px;font-size:11px;color:#4e555e;cursor:pointer}
        .jd-review-summary{max-width:900px;margin:0 auto 14px;padding:14px 16px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;display:flex;align-items:center;gap:8px;font-size:11px;color:#727984}.jd-review-summary strong{font-size:20px;color:#202329}.jd-review-total{margin-left:auto}
        .jd-review-list{max-width:900px;margin:0 auto;display:grid;gap:10px}.jd-review-card{background:#fff;border:1px solid #e3e6ea;border-radius:13px;padding:16px}
        .jd-review-card-top{display:flex;align-items:center;justify-content:space-between;gap:10px}.jd-review-status{font-size:9px;text-transform:uppercase;letter-spacing:.08em;font-weight:800;color:#737982}.jd-review-status.pending{color:#9a6715}.jd-review-status.approved{color:#267653}.jd-review-status.rejected,.jd-review-status.expired{color:#a34444}
        .jd-review-date{display:flex;align-items:center;gap:5px;color:#989ea7;font-size:9px}
        .jd-review-jd-tag{display:inline-flex;margin:2px 0 10px;padding:5px 8px;border:1px solid #dce8e1;border-radius:20px;background:#f0f7f2;color:#367451;font-size:9px;font-weight:700}
        .jd-review-blueprint{margin-top:12px;padding:13px;background:#fff;border:1px solid #e6e8ec;border-radius:12px}
        .jd-review-blueprint-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
        .jd-review-blueprint-head strong{font-size:13px;color:#242a31}
        .jd-review-blueprint-head span{font-size:10px;color:#828994}
        .jd-review-blueprint>p{font-size:11px;color:#747c86;line-height:1.5;margin:7px 0 12px}
        .jd-review-department{padding:10px 0;border-top:1px solid #edf0f3}
        .jd-review-department>strong{font-size:11px;color:#333a43}
        .jd-review-department p{font-size:10px;color:#747c86;margin:4px 0 7px}
        .jd-review-department div{display:grid;grid-template-columns:110px 1fr;gap:8px;margin:4px 0;font-size:9px;line-height:1.45}
        .jd-review-department small{color:#9299a2}.jd-review-department span{color:#5f6772}

        .jd-review-note-label{display:block;margin-top:12px;color:#6d747e;font-size:10px;font-weight:650}
        .jd-review-note{width:100%;margin-top:6px;resize:vertical;border:1px solid #dfe3e8;border-radius:9px;padding:9px 10px;background:#fff;color:#303640;font:inherit;font-size:11px;line-height:1.5;outline:none}
        .jd-review-note:focus{border-color:#aeb8c4;box-shadow:0 0 0 3px rgba(120,140,160,.12)}
.jd-review-card h3{font-size:14px;margin:12px 0 5px}.jd-review-card p{font-size:11px;color:#707782;margin:0 0 10px;line-height:1.5}
        .jd-review-request{background:#f7f8fa;border:1px solid #eceef1;border-radius:9px;padding:11px;font-size:12px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}
        .jd-review-meta{display:flex;gap:14px;margin-top:10px;color:#858b94;font-size:9px}.jd-review-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.jd-review-actions button{display:flex;align-items:center;gap:6px;border:1px solid #dfe2e7;background:#fff;border-radius:8px;padding:8px 11px;font-size:10px;cursor:pointer;color:#4f5660}.jd-review-actions button:last-child{background:#202329;color:#fff;border-color:#202329}.jd-review-actions button:disabled{opacity:.45;cursor:wait}
        .jd-review-safe-note{font-size:10px;color:#6d7770;margin-top:12px}.jd-review-empty{max-width:900px;margin:0 auto;background:#fff;border:1px dashed #dfe2e7;border-radius:13px;padding:42px 18px;display:flex;flex-direction:column;align-items:center;gap:8px;color:#818791;font-size:11px}.jd-review-empty strong{color:#363b43;font-size:13px}
        .jd-review-alert{max-width:900px;margin:0 auto 10px;background:#edf6f1;border:1px solid #d8e9df;color:#356b4e;border-radius:9px;padding:10px 12px;font-size:11px}.jd-review-alert.error{background:#fff2f0;border-color:#f0d8d4;color:#9b3f36}
        @media(max-width:520px){.jd-review{padding:20px 12px}.jd-review-head h2{font-size:23px}.jd-review-date{font-size:8px}.jd-review-card{padding:13px}.jd-review-meta{flex-wrap:wrap}}
      `}</style>
    </section>
    </div>
  );
}
