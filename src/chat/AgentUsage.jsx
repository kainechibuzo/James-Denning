import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient.js";
import { Activity, RefreshCw, Cpu, Database, Gauge, ArrowLeft } from "lucide-react";

const number = (value) => new Intl.NumberFormat().format(Number(value)||0);

export function AgentUsage({ onClose }) {
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    const {data:result,error:invokeError}=await supabase.functions.invoke("jd-automation",{body:{action:"usage.summary"}});
    if(invokeError)setError(invokeError.message||"Could not load token usage.");
    else setData(result);
    setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);

  const s=data?.summary;
  return <section className="jd-usage">
    <header className="jd-usage-head">
      <div><div className="jd-usage-eyebrow"><Activity size={13}/> AGENT OBSERVABILITY</div><h2>AI usage</h2><p>Provider-reported token consumption across recent JD automation runs. Missing totals remain unknown; they are never inferred from input and output.</p></div>
      <div className="jd-usage-controls"><button onClick={load} type="button" aria-label="Refresh usage"><RefreshCw size={15}/></button>{onClose&&<button onClick={onClose} type="button"><ArrowLeft size={14}/> Back</button>}</div>
    </header>
    {error&&<div className="jd-usage-error">{error}</div>}
    {loading?<div className="jd-usage-empty">Loading usage data…</div>:!s?<div className="jd-usage-empty">No usage data available yet.</div>:<>
      <div className="jd-usage-grid">
        <article><span><Gauge size={14}/> Total tokens</span><strong>{s.total_tokens_reported_runs===s.reported_runs?number(s.total_tokens):"Partial / unknown"}</strong><small>{number(s.reported_runs)} runs with provider usage</small></article>
        <article><span><Cpu size={14}/> Input tokens</span><strong>{number(s.input_tokens)}</strong><small>Prompt and context tokens</small></article>
        <article><span><Activity size={14}/> Output tokens</span><strong>{number(s.output_tokens)}</strong><small>Generated response tokens</small></article>
        <article><span><Database size={14}/> Cached tokens</span><strong>{number(s.cached_input_tokens)}</strong><small>Reported cached input</small></article>
      </div>
      <div className="jd-usage-panel"><div className="jd-usage-panel-title">Usage by model</div>
        {data.byModel?.length?data.byModel.map(([model,stats])=><div className="jd-usage-row" key={model}><span>{model}</span><strong>{number(stats.tokens)}</strong><small>{stats.runs} runs</small></div>):<div className="jd-usage-empty compact">No model usage has been reported.</div>}
      </div>
      <div className="jd-usage-panel"><div className="jd-usage-panel-title">Recent daily usage</div>
        {data.byDay?.length?data.byDay.map(([day,stats])=><div className="jd-usage-row" key={day}><span>{day}</span><strong>{number(stats.tokens)}</strong><small>{stats.runs} runs</small></div>):<div className="jd-usage-empty compact">No daily usage has been reported.</div>}
      </div>
      <div className="jd-usage-foot">Showing up to 500 recent runs. {number(s.unreported_runs)} runs have no usage metadata. Complete totals are available for {number(s.total_tokens_reported_runs)} of {number(s.reported_runs)} runs with usage. Model and daily totals include only runs with provider-reported total tokens. Costs are not estimated.</div>
    </>}
    <style>{`
      .jd-usage{height:100%;min-height:0;overflow:auto;padding:28px clamp(16px,4vw,42px);background:#f7f8fa;color:#202329;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      .jd-usage-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;max-width:900px;margin:0 auto 22px}
      .jd-usage-eyebrow{display:flex;align-items:center;gap:7px;font-size:9px;letter-spacing:.14em;font-weight:800;color:#7a818b}
      .jd-usage-head h2{font-size:27px;letter-spacing:-1px;margin:10px 0 5px}.jd-usage-head p{font-size:12px;color:#7d838c;margin:0;line-height:1.6}
      .jd-usage-controls{display:flex;gap:7px}.jd-usage-controls button{display:flex;align-items:center;gap:6px;border:1px solid #dfe2e7;background:#fff;border-radius:9px;padding:8px 11px;font-size:11px;color:#4e555e;cursor:pointer}
      .jd-usage-grid{max-width:900px;margin:0 auto 14px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}
      .jd-usage-grid article{background:#fff;border:1px solid #e3e6ea;border-radius:12px;padding:14px;min-width:0}
      .jd-usage-grid article span{display:flex;align-items:center;gap:6px;color:#818791;font-size:10px}.jd-usage-grid strong{display:block;font-size:22px;letter-spacing:-.8px;margin:13px 0 4px;overflow-wrap:anywhere}.jd-usage-grid small{font-size:9px;color:#9a9fa7}
      .jd-usage-panel{max-width:900px;margin:0 auto 12px;background:#fff;border:1px solid #e3e6ea;border-radius:12px;padding:15px}
      .jd-usage-panel-title{font-size:12px;font-weight:700;margin-bottom:8px}.jd-usage-row{display:grid;grid-template-columns:minmax(0,1fr) auto 65px;align-items:center;gap:12px;padding:10px 0;border-top:1px solid #f0f1f3;font-size:11px}.jd-usage-row span{overflow-wrap:anywhere;color:#555c65}.jd-usage-row strong{font-variant-numeric:tabular-nums}.jd-usage-row small{text-align:right;color:#969ca5;font-size:9px}
      .jd-usage-foot{max-width:900px;margin:0 auto;color:#969ca5;font-size:9px;line-height:1.6}.jd-usage-empty{max-width:900px;margin:0 auto;background:#fff;border:1px dashed #dfe2e7;border-radius:12px;padding:38px 18px;text-align:center;color:#858b94;font-size:11px}.jd-usage-empty.compact{padding:16px;border:0}.jd-usage-error{max-width:900px;margin:0 auto 12px;background:#fff2f0;border:1px solid #f0d8d4;color:#9b3f36;border-radius:9px;padding:10px 12px;font-size:11px}
      @media(max-width:650px){.jd-usage-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.jd-usage-head h2{font-size:23px}.jd-usage{padding:20px 12px}}
    `}</style>
  </section>;
}
