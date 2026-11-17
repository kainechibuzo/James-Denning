import React, { useCallback, useEffect, useState } from "react";
import { Building2, RefreshCw, Sparkles, Users, Workflow, Target, ArrowLeft } from "lucide-react";
import { supabase } from "../supabaseClient.js";

export function JDDepartments({ onClose }) {
  const [departments,setDepartments]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const load=useCallback(async()=>{
    setLoading(true);setError("");
    const {data,error:invokeError}=await supabase.functions.invoke("jd-automation",{body:{action:"organisation.departments.list"}});
    if(invokeError)setError("JD couldn't load the department directory. Please refresh and try again.");
    else setDepartments(data?.departments||[]);
    setLoading(false);
  },[]);
  useEffect(()=>{void load();},[load]);
  return <section className="jd-departments">
    <header className="jd-departments-head">
      <div><div className="jd-departments-eyebrow"><Building2 size={13}/> ORGANISATION</div><h2>Departments & positions</h2><p>Your organisation structure, including the teams and job positions JD has created.</p></div>
      <div className="jd-departments-actions"><button type="button" onClick={load} aria-label="Refresh departments"><RefreshCw size={15}/></button>{onClose&&<button type="button" onClick={onClose}><ArrowLeft size={14}/> Back to JD</button>}</div>
    </header>
    <div className="jd-departments-summary"><strong>{departments.length}</strong><span>active departments</span><span className="jd-departments-count">{departments.reduce((n,d)=>n+(d.positions?.length||d.roles?.length||0),0)} positions</span></div>
    {error&&<div className="jd-departments-error">{error}</div>}
    {loading?<div className="jd-departments-empty">Loading your organisation structure…</div>:departments.length===0?<div className="jd-departments-empty"><Building2 size={26}/><strong>No departments created yet</strong><span>Tell JD what kind of business you want to build. It can prepare the departments and send them to you for approval.</span></div>:<div className="jd-departments-grid">
      {departments.map((department)=><article className="jd-department-card" key={department.id}>
        <div className="jd-department-top"><div className="jd-department-icon"><Building2 size={16}/></div>{department.created_by_agent&&<span className="jd-created-tag"><Sparkles size={11}/> Created by JD</span>}</div>
        <h3>{department.name}</h3><p>{department.purpose}</p>
        <div className="jd-department-section"><div><Users size={12}/> Positions</div><ul>{(department.positions?.length?department.positions.map(p=>p.title):department.roles||[]).map((role,index)=><li key={index}>{role}{department.created_by_agent&&<span className="jd-role-tag">JD</span>}</li>)}</ul></div>
        {department.workflows?.length>0&&<div className="jd-department-section"><div><Workflow size={12}/> Main responsibilities</div><ul>{department.workflows.map((item,index)=><li key={index}>{item}</li>)}</ul></div>}
        {department.kpis?.length>0&&<div className="jd-department-section"><div><Target size={12}/> Measures of success</div><ul>{department.kpis.map((item,index)=><li key={index}>{item}</li>)}</ul></div>}
      </article>)}
    </div>}
    <style>{`
      .jd-departments{height:100%;min-height:0;overflow:auto;padding:28px clamp(16px,4vw,42px);background:#f7f8fa;color:#202329;font-family:"JD Inter",Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      .jd-departments-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;max-width:1000px;margin:0 auto 20px}
      .jd-departments-eyebrow{display:flex;align-items:center;gap:7px;color:#60616b;font-size:9px;letter-spacing:.14em;font-weight:800}
      .jd-departments-head h2{font-size:25px;letter-spacing:-.8px;margin:9px 0 5px}.jd-departments-head p{font-size:12px;line-height:1.55;color:#60616b;margin:0}
      .jd-departments-actions{display:flex;gap:7px}.jd-departments-actions button{display:flex;align-items:center;gap:6px;border:1px solid #dfe3e8;background:#fff;border-radius:9px;padding:8px 10px;color:#34353b;font-size:10px;cursor:pointer}
      .jd-departments-summary{max-width:1000px;margin:0 auto 14px;padding:13px 16px;background:#fff;border:1px solid #e5e8ec;border-radius:12px;display:flex;align-items:center;gap:8px;color:#60616b;font-size:11px}
      .jd-departments-summary strong{font-size:20px;color:#252a31}.jd-departments-count{margin-left:auto}
      .jd-departments-grid{max-width:1000px;margin:0 auto;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .jd-department-card{background:#fff;border:1px solid #e3e6eb;border-radius:14px;padding:16px;min-width:0}
      .jd-department-top{display:flex;justify-content:space-between;align-items:center;gap:8px}
      .jd-department-icon{width:31px;height:31px;border-radius:9px;background:#f0f2f5;color:#60616b;display:grid;place-items:center}
      .jd-created-tag{display:inline-flex;align-items:center;gap:4px;background:#eff7f1;border:1px solid #dedfe4;color:#34353b;border-radius:20px;padding:5px 8px;font-size:9px;font-weight:700}
      .jd-department-card h3{font-size:15px;letter-spacing:-.25px;margin:12px 0 5px}.jd-department-card>p{font-size:11px;line-height:1.55;color:#60616b;margin:0 0 12px}
      .jd-department-section{border-top:1px solid #edf0f3;padding-top:9px;margin-top:9px}
      .jd-department-section>div{display:flex;align-items:center;gap:6px;color:#60616b;font-size:10px;font-weight:700}
      .jd-department-section ul{margin:6px 0 0;padding-left:18px;color:#34353b;font-size:10px;line-height:1.55}
      .jd-department-section li{margin:3px 0}.jd-role-tag{margin-left:6px;color:#34353b;background:#eff7f1;border-radius:4px;padding:1px 4px;font-size:8px;font-weight:800}
      .jd-departments-empty{max-width:1000px;margin:0 auto;background:#fff;border:1px dashed #dfe3e8;border-radius:13px;padding:42px 18px;display:flex;flex-direction:column;align-items:center;gap:9px;color:#60616b;text-align:center;font-size:11px}
      .jd-departments-empty strong{font-size:13px;color:#34353b}.jd-departments-error{max-width:1000px;margin:0 auto 12px;background:#f1f2f5;border:1px solid #dedfe4;border-radius:9px;padding:10px 12px;color:#34353b;font-size:11px}
      @media(max-width:650px){.jd-departments-grid{grid-template-columns:1fr}.jd-departments{padding:20px 12px}.jd-departments-head h2{font-size:21px}}
    `}</style>
  </section>;
}
