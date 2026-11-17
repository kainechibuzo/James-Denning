import React, { useCallback, useEffect, useState, useRef } from "react";
import { supabase } from "../supabaseClient.js";
import { RefreshCw, ShieldCheck, Check, X, Clock3, AlertTriangle } from "lucide-react";

import { settingsDiff, applyReviewedSettings } from "./settings-review.mjs";

export function ReviewCentre({ onClose, onDecision, client=supabase }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [confirmApply,setConfirmApply]=useState("");
  const [needsRefresh,setNeedsRefresh]=useState(false);
  const lock=useRef(false);
  const alive=useRef(true);

  const load = useCallback(async () => {
    setLoading(true); setError("");setConfirmApply("");
    try {
      const {data,error:invokeError}=await client.functions.invoke("jd-automation",{body:{action:"approvals.list"}});
      if(invokeError||data?.error||!Array.isArray(data?.approvals))throw Error();
      if(alive.current){setItems(data.approvals);setNeedsRefresh(false);}return true;
    }catch{if(alive.current){setItems([]);setNeedsRefresh(true);setError("Could not confirm approval records. Refresh before making changes.");}return false;}
    finally{if(alive.current)setLoading(false);}
  }, [client]);

  useEffect(() => { alive.current=true;load();return()=>{alive.current=false;}; }, [load]);

  const decide = async (item, decision) => {
    if(lock.current||loading||needsRefresh)return;
    if(decision==='approve'&&item.action_key==='settings.apply'&&!settingsDiff(item)){setError('This settings diff is invalid. Do not approve it; ask JD to prepare a new proposal.');return;}
    lock.current=true;setBusyId(item.id);setError("");setNotice("");
    try{
      const {data,error:invokeError}=await client.functions.invoke("jd-automation",{body:{action:"approvals.decide",approvalId:item.id,decision,note:decisionNote}});
      if(invokeError||data?.error||data?.approval?.id!==item.id||data.approval.status!==(decision==='approve'?'approved':'rejected'))throw Error();
      if(!alive.current)return;
      setNotice(item.action_key==='settings.apply'?'Decision saved. Approval alone does not change settings; apply the approved diff separately.':data?.execution?.message||'Decision recorded.');
      if(await load()){onDecision?.(decision,item,data,decisionNote);setDecisionNote('');}
    }catch{if(alive.current){setError('Decision was not confirmed. Refresh before another action; no request was retried.');setNeedsRefresh(true);}}
    finally{lock.current=false;if(alive.current)setBusyId('');}
  };
  const apply = async item=>{
    if(lock.current||loading||needsRefresh||confirmApply!==item.id)return;
    lock.current=true;setBusyId(item.id);setNotice('');setError('');
    try{
      const result=await applyReviewedSettings(client,item);
      if(!alive.current)return;
      if(await load())setNotice(result.message);
    }catch(error){if(alive.current){setError(error.message);setNeedsRefresh(true);}}
    finally{lock.current=false;if(alive.current){setBusyId('');setConfirmApply('');}}
  };

  const pending = items.filter((item) => item.status === "pending");
  return (
    <div className="jd-review-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose?.();}}>
    <section className="jd-review">
      <header className="jd-review-head">
        <div><div className="jd-review-eyebrow"><ShieldCheck size={13}/> GOVERNANCE</div><h2>Review Centre</h2><p>Review consequential requests before any external action is considered.</p></div>
        <div className="jd-review-controls"><button type="button" onClick={load} disabled={!!busyId||loading} aria-label="Refresh approvals"><RefreshCw size={15}/></button>{onClose&&<button type="button" onClick={onClose}>Back to JD</button>}</div>
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
            {item.action_key!=="settings.apply"&&<div className="jd-review-request">{item.proposal_json?.request_text||"Request details unavailable."}</div>}
            {item.action_key==="settings.apply"&&(settingsDiff(item)?<section aria-label="Proposed settings changes" className="jd-settings-diff">
              <p>Review each exact value. JD has not applied these settings. Missing contact details must be supplied, not guessed.</p>
              {settingsDiff(item).map(change=><div className="jd-settings-diff-row" key={change.key}><strong>{change.label}</strong><div><small>Current at proposal</small><span>{change.before===null?'Not configured':String(change.before)}</span></div><div><small>Proposed</small><span>{String(change.after)}</span></div>{!change.changed&&<small>No change</small>}</div>)}
            </section>:<div role="alert">Invalid or unsupported settings diff. Reject this request and ask JD to prepare a supported proposal.</div>)}
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
            {item.status==="pending"&&<><label className="jd-review-note-label" htmlFor={"decision-note-"+item.id}>Message to JD (optional)</label><textarea id={"decision-note-"+item.id} className="jd-review-note" value={decisionNote} onChange={(event)=>setDecisionNote(event.target.value)} placeholder="Tell JD what to change or consider…" rows={2}/><div className="jd-review-actions"><button type="button" disabled={!!busyId||loading||needsRefresh} onClick={()=>decide(item,"reject")}><X size={14}/> Reject</button><button type="button" disabled={!!busyId||loading||needsRefresh} onClick={()=>decide(item,"approve")}><Check size={14}/> Accept</button></div></>}
            {item.action_key==="settings.apply"&&item.status==="approved"&&settingsDiff(item)&&['not_executed','running'].includes(item.execution_status)&&<div className="jd-review-actions">
              {confirmApply===item.id?<><span>Apply only the approved values above? Earlier completed steps will not be repeated.</span><button type="button" disabled={!!busyId||needsRefresh} onClick={()=>setConfirmApply('')}>Keep unchanged</button><button type="button" disabled={!!busyId||needsRefresh} onClick={()=>apply(item)}>Confirm apply settings</button></>:<button type="button" disabled={!!busyId||needsRefresh||loading} onClick={()=>setConfirmApply(item.id)}>Apply approved settings</button>}
            </div>}
            {item.status==="approved"&&item.action_key==="settings.apply"&&<div className="jd-review-safe-note">{item.execution_status==='completed'?'The execution record reports completed. This is not independent verification of a business outcome.':item.execution_status==='failed'?'Execution needs administrator review. Some steps may already have been saved; do not resubmit blindly.':'Approval recorded. No settings change is confirmed until application and read-back succeed.'}</div>}
            {item.status==="approved"&&item.action_key!=="settings.apply"&&<div className="jd-review-safe-note">{item.execution_status==="completed"?"JD completed the approved setup. Created items are tagged as created by JD.":item.execution_status==="failed"?"Your approval was recorded, but JD could not complete the setup. Ask JD to review the issue before retrying.":"Your approval was recorded. The requested change has not been confirmed as complete."}</div>}
          </article>
        ))}
      </div>}
      <style>{`
        .jd-settings-diff{margin:12px 0;border:1px solid #dfe3e8;border-radius:10px;padding:12px}
        .jd-settings-diff-row{border-top:1px solid #edf0f3;padding:10px 0;overflow-wrap:anywhere;font-size:12px}
        .jd-settings-diff-row>div{display:grid;grid-template-columns:minmax(100px,1fr) minmax(0,2fr);gap:8px;margin-top:6px}.jd-settings-diff-row small{color:#60616b}
        .jd-review-actions{flex-wrap:wrap}
        .jd-review-backdrop{position:fixed;inset:0;z-index:60;background:rgba(18,22,28,.42);display:flex;align-items:center;justify-content:center;padding:18px}
        .jd-review{width:min(900px,100%);max-height:min(90dvh,900px);min-height:0;overflow:auto;padding:24px clamp(14px,3vw,32px);background:#f7f8fa;color:#202329;font-family:"JD Inter",Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;border:1px solid rgba(255,255,255,.6);border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.24)}
        .jd-review-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;max-width:900px;margin:0 auto 22px}
        .jd-review-eyebrow{display:flex;align-items:center;gap:7px;font-size:9px;letter-spacing:.14em;font-weight:800;color:#60616b}
        .jd-review-head h2{font-size:27px;letter-spacing:-1px;margin:10px 0 5px}.jd-review-head p{font-size:12px;color:#60616b;margin:0;line-height:1.6}
        .jd-review-controls{display:flex;gap:7px}.jd-review-controls button{border:1px solid #dfe2e7;background:#fff;border-radius:9px;padding:8px 11px;font-size:11px;color:#34353b;cursor:pointer}
        .jd-review-summary{max-width:900px;margin:0 auto 14px;padding:14px 16px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;display:flex;align-items:center;gap:8px;font-size:11px;color:#60616b}.jd-review-summary strong{font-size:20px;color:#202329}.jd-review-total{margin-left:auto}
        .jd-review-list{max-width:900px;margin:0 auto;display:grid;gap:10px}.jd-review-card{background:#fff;border:1px solid #e3e6ea;border-radius:13px;padding:16px}
        .jd-review-card-top{display:flex;align-items:center;justify-content:space-between;gap:10px}.jd-review-status{font-size:9px;text-transform:uppercase;letter-spacing:.08em;font-weight:800;color:#60616b}.jd-review-status.pending{color:#34353b}.jd-review-status.approved{color:#34353b}.jd-review-status.rejected,.jd-review-status.expired{color:#34353b}
        .jd-review-date{display:flex;align-items:center;gap:5px;color:#60616b;font-size:9px}
        .jd-review-jd-tag{display:inline-flex;margin:2px 0 10px;padding:5px 8px;border:1px solid #dce8e1;border-radius:20px;background:#f0f7f2;color:#34353b;font-size:9px;font-weight:700}
        .jd-review-blueprint{margin-top:12px;padding:13px;background:#fff;border:1px solid #e6e8ec;border-radius:12px}
        .jd-review-blueprint-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
        .jd-review-blueprint-head strong{font-size:13px;color:#17191c}
        .jd-review-blueprint-head span{font-size:10px;color:#60616b}
        .jd-review-blueprint>p{font-size:11px;color:#60616b;line-height:1.5;margin:7px 0 12px}
        .jd-review-department{padding:10px 0;border-top:1px solid #edf0f3}
        .jd-review-department>strong{font-size:11px;color:#34353b}
        .jd-review-department p{font-size:10px;color:#60616b;margin:4px 0 7px}
        .jd-review-department div{display:grid;grid-template-columns:110px 1fr;gap:8px;margin:4px 0;font-size:9px;line-height:1.45}
        .jd-review-department small{color:#60616b}.jd-review-department span{color:#34353b}

        .jd-review-note-label{display:block;margin-top:12px;color:#60616b;font-size:10px;font-weight:650}
        .jd-review-note{width:100%;margin-top:6px;resize:vertical;border:1px solid #dfe3e8;border-radius:9px;padding:9px 10px;background:#fff;color:#17191c;font:inherit;font-size:11px;line-height:1.5;outline:none}
        .jd-review-note:focus{border-color:#a3a4ad;box-shadow:0 0 0 3px rgba(137,137,137,.12)}
.jd-review-card h3{font-size:14px;margin:12px 0 5px}.jd-review-card p{font-size:11px;color:#60616b;margin:0 0 10px;line-height:1.5}
        .jd-review-request{background:#f7f8fa;border:1px solid #eceef1;border-radius:9px;padding:11px;font-size:12px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}
        .jd-review-meta{display:flex;gap:14px;margin-top:10px;color:#60616b;font-size:9px}.jd-review-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.jd-review-actions button{display:flex;align-items:center;gap:6px;border:1px solid #dfe2e7;background:#fff;border-radius:8px;padding:8px 11px;font-size:10px;cursor:pointer;color:#34353b}.jd-review-actions button:last-child{background:#202329;color:#fff;border-color:#202329}.jd-review-actions button:disabled{opacity:.45;cursor:wait}
        .jd-review-safe-note{font-size:10px;color:#6d7770;margin-top:12px}.jd-review-empty{max-width:900px;margin:0 auto;background:#fff;border:1px dashed #dfe2e7;border-radius:13px;padding:42px 18px;display:flex;flex-direction:column;align-items:center;gap:8px;color:#60616b;font-size:11px}.jd-review-empty strong{color:#34353b;font-size:13px}
        .jd-review-alert{max-width:900px;margin:0 auto 10px;background:#edf6f1;border:1px solid #dedfe4;color:#34353b;border-radius:9px;padding:10px 12px;font-size:11px}.jd-review-alert.error{background:#f1f2f5;border-color:#dedfe4;color:#34353b}
        @media(max-width:520px){.jd-review{padding:20px 12px}.jd-review-head h2{font-size:23px}.jd-review-date{font-size:8px}.jd-review-card{padding:13px}.jd-review-meta{flex-wrap:wrap}}
      `}</style>
    </section>
    </div>
  );
}
