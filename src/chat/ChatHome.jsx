import React, { useMemo, useState } from "react";
import { ArrowUp, Plus, Sparkles, BarChart3, Users, ClipboardList, FileText, Menu, LoaderCircle, PanelLeftClose, Activity, Mail, CalendarDays, Wallet, ShieldCheck, Search, Paperclip, ChevronDown, Command } from "lucide-react";
import { supabase } from "../supabaseClient.js";
import { ReviewCentre } from "./ReviewCentre.jsx";

const actions = [
  { icon: BarChart3, label: "Performance", prompt: "Review organisation performance and highlight what needs attention." },
  { icon: Users, label: "People", prompt: "Give me an overview of people, teams and outstanding people-related work." },
  { icon: CalendarDays, label: "Schedule", prompt: "Review today's schedule and identify conflicts or missing items." },
  { icon: ClipboardList, label: "Attendance", prompt: "Review recent attendance and identify exceptions that need attention." },
  { icon: Wallet, label: "Billing", prompt: "Summarise billing, payments and outstanding balances." },
  { icon: Mail, label: "Email", prompt: "Help me draft a clear professional email. Ask for any missing details." },
  { icon: FileText, label: "Reports", prompt: "Prepare an organisation report using the latest available records." },
  { icon: Activity, label: "Logs", prompt: "Inspect recent activity and audit logs. Highlight failures and unusual activity." },
  { icon: ShieldCheck, label: "Permissions", prompt: "Review organisation permissions and identify access concerns. Do not change access without approval." },
];

export function ChatHome({ user, organizationName = "Your organisation" }) {
  const [draft, setDraft] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showReview, setShowReview] = useState(false);
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  }, []);
  const firstName = (user?.name || "").trim().split(/\s+/)[0];

  const send = async (override) => {
    const message = (override ?? draft).trim();
    if (!message || sending) return;
    setDraft("");
    setError("");
    setMessages((current) => [...current, { role: "user", content: message }]);
    setSending(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("jd-automation", {
        body: { action: "submit", message, conversationId },
      });
      if (invokeError) throw invokeError;
      if (!data) throw new Error("JD returned an empty response.");
      if (data.conversationId) setConversationId(data.conversationId);
      setMessages((current) => [...current, { role: "assistant", content: data.reply || data.message || "The request was recorded.", run: data.run, toolEvents: data.toolEvents || [] }]);
    } catch (err) {
      setError(err?.message || "JD could not complete the request. Please try again.");
      setMessages((current) => current.filter((item) => !(item.role === "user" && item.content === message)));
      setDraft(message);
    } finally { setSending(false); }
  };

  const newConversation = () => {
    if (sending) return;
    setConversationId(null); setMessages([]); setDraft(""); setError("");
  };

  return (
    <div className="jd-command">
      <style>{`
        .jd-command{height:calc(100dvh - 62px);min-height:520px;display:flex;background:#f7f8fa;color:#17191c;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}
        .jd-command *{box-sizing:border-box}
        .jd-rail{width:258px;flex:0 0 258px;background:#f0f1f3;border-right:1px solid #e2e4e8;padding:18px 13px;display:flex;flex-direction:column;gap:16px}
        .jd-brand{display:flex;align-items:center;gap:10px;padding:4px 7px 12px;font-size:14px;font-weight:700;letter-spacing:-.3px}
        .jd-brand-mark{width:32px;height:32px;border-radius:11px;background:#15171a;color:#fff;display:grid;place-items:center;font-size:12px;font-weight:800}
        .jd-new{width:100%;display:flex;align-items:center;justify-content:center;gap:9px;border:1px solid #d9dce1;background:#fff;border-radius:11px;padding:11px 12px;color:#202328;font-size:12px;font-weight:650;cursor:pointer}
        .jd-rail-label{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#92979f;font-weight:800;padding:0 9px;margin:4px 0}
        .jd-nav{display:grid;grid-template-columns:1fr 1fr;gap:5px}
        .jd-nav button{min-width:0;border:1px solid transparent;background:transparent;border-radius:9px;padding:10px 8px;display:flex;align-items:center;gap:8px;text-align:left;color:#5e646d;font-size:11px;cursor:pointer}
        .jd-nav button:hover{background:#fff;border-color:#e1e3e7;color:#202328}
        .jd-nav svg{flex:0 0 auto}
        .jd-rail-foot{margin-top:auto;border-top:1px solid #dfe1e5;padding:13px 5px 0;display:flex;align-items:center;gap:9px;color:#555b64;font-size:11px}
        .jd-avatar{width:29px;height:29px;border-radius:9px;background:#22252a;color:#fff;display:grid;place-items:center;font-weight:700}
        .jd-main{min-width:0;flex:1;display:flex;flex-direction:column;position:relative}
        .jd-top{height:57px;flex:0 0 57px;border-bottom:1px solid #e8eaed;background:rgba(255,255,255,.84);display:flex;align-items:center;justify-content:space-between;padding:0 24px}
        .jd-top-left{display:flex;align-items:center;gap:11px;min-width:0}
        .jd-icon-btn{border:0;background:transparent;color:#707680;padding:7px;border-radius:8px;cursor:pointer}
        .jd-top-title{font-size:12px;font-weight:700;color:#25282d}.jd-top-sub{font-size:10px;color:#969ba3;margin-top:2px}
        .jd-status{display:flex;align-items:center;gap:7px;font-size:10px;color:#737982}
        .jd-dot{width:7px;height:7px;border-radius:50%;background:#28956b}
        .jd-scroll{flex:1;overflow:auto;display:flex;flex-direction:column;align-items:center;padding:30px 20px 18px}
        .jd-welcome{width:min(760px,100%);margin:auto 0;display:flex;flex-direction:column;align-items:center;padding:20px 0 28px}
        .jd-spark{width:42px;height:42px;border-radius:14px;background:#17191d;color:#fff;display:grid;place-items:center;margin-bottom:20px}
        .jd-heading{font-size:clamp(25px,3.3vw,34px);font-weight:620;letter-spacing:-1.4px;margin:0 0 8px;text-align:center}
        .jd-subtitle{font-size:13px;line-height:1.65;color:#777e87;text-align:center;margin:0 0 25px}
        .jd-actions{width:min(690px,100%);display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
        .jd-action{border:1px solid #e1e4e8;background:#fff;border-radius:12px;padding:13px 12px;display:flex;align-items:center;gap:10px;text-align:left;min-height:59px;cursor:pointer;color:#333840}
        .jd-action:hover{border-color:#bfc4cc;box-shadow:0 3px 12px rgba(20,24,30,.045)}
        .jd-action-icon{width:29px;height:29px;border-radius:9px;background:#f1f2f4;display:grid;place-items:center;color:#656c75;flex:0 0 auto}
        .jd-action span:last-child{font-size:11px;font-weight:620}
        .jd-thread{width:min(760px,100%);display:flex;flex-direction:column;gap:22px;padding:12px 0 34px}
        .jd-message{font-size:13px;line-height:1.75;white-space:pre-wrap;overflow-wrap:anywhere}
        .jd-message.user{align-self:flex-end;max-width:85%;background:#e9ebef;border:1px solid #e2e4e8;border-radius:18px 18px 5px 18px;padding:11px 15px;color:#202329}
        .jd-message.assistant{align-self:stretch;color:#292d33;padding:2px 2px}
        .jd-message-head{display:flex;align-items:center;gap:8px;margin-bottom:7px;font-size:10px;color:#818791;font-weight:650}
        .jd-mini-mark{width:20px;height:20px;border-radius:7px;background:#191b1f;color:white;display:grid;place-items:center;font-size:8px}
        .jd-tools{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
        .jd-tool{border:1px solid #e3e5e9;background:#fafbfc;border-radius:7px;padding:5px 8px;color:#737984;font-size:9px}
        .jd-run{font-size:10px;color:#858b94;margin-top:8px}
        .jd-compose-wrap{width:min(780px,calc(100% - 40px));margin:0 auto 16px}
        .jd-compose{border:1px solid #dfe2e7;background:#fff;border-radius:18px;padding:12px 13px 10px;box-shadow:0 8px 30px rgba(22,26,32,.055)}
        .jd-compose textarea{width:100%;min-height:48px;max-height:180px;resize:vertical;border:0;outline:0;background:transparent;color:#202329;font:inherit;font-size:13px;line-height:1.65}
        .jd-compose-bottom{display:flex;align-items:center;justify-content:space-between}
        .jd-compose-hint{font-size:9px;color:#a0a5ad}
        .jd-send{width:34px;height:34px;border:0;border-radius:11px;background:#17191d;color:white;display:grid;place-items:center;cursor:pointer}
        .jd-send:disabled{opacity:.35;cursor:not-allowed}
        .jd-error{color:#b3261e;font-size:11px;margin:0 0 7px 5px}
        .jd-disclaimer{text-align:center;font-size:9px;color:#a0a5ad;margin-top:9px}
        @media(max-width:760px){.jd-command{height:calc(100dvh - 62px);min-height:480px}.jd-rail{display:none}.jd-top{padding:0 13px}.jd-scroll{padding:20px 14px 10px}.jd-welcome{padding:12px 0 18px}.jd-heading{font-size:27px}.jd-subtitle{font-size:12px;margin-bottom:20px}.jd-actions{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.jd-action{min-height:53px;padding:10px 9px}.jd-action span:last-child{font-size:10px}.jd-compose-wrap{width:calc(100% - 24px);margin-bottom:10px}.jd-message.user{max-width:94%}.jd-status{font-size:0}.jd-status .jd-dot{width:8px;height:8px}}
        @media(max-width:360px){.jd-actions{grid-template-columns:1fr 1fr}.jd-action{gap:7px}}
      `}</style>
      {sidebarOpen && <aside className="jd-rail">
        <div className="jd-brand"><span className="jd-brand-mark">JD</span><span>James-Denning</span></div>
        <button className="jd-new" type="button" onClick={newConversation}><Plus size={15}/> New conversation</button>
        <button className="jd-new" type="button" onClick={()=>setShowReview(true)}><ShieldCheck size={15}/> Review Centre</button>
        <div><div className="jd-rail-label">Ask JD to work with</div><div className="jd-nav">{actions.map(({icon:Icon,label,prompt})=><button key={label} type="button" onClick={()=>send(prompt)}><Icon size={14}/>{label}</button>)}</div></div>
        <div className="jd-rail-foot"><span className="jd-avatar">{(firstName||"U")[0].toUpperCase()}</span><span>{user?.name || "Workspace member"}</span></div>
      </aside>}
      {showReview ? <ReviewCentre onClose={()=>setShowReview(false)}/> : <section className="jd-main">
        <header className="jd-top">
          <div className="jd-top-left">
            <button className="jd-icon-btn" type="button" aria-label="Toggle sidebar" onClick={()=>setSidebarOpen(v=>!v)}>{sidebarOpen?<PanelLeftClose size={17}/>:<Menu size={18}/>}</button>
            <div><div className="jd-top-title">JD Assistant</div><div className="jd-top-sub">{organizationName} · Command centre</div></div>
          </div>
          <div className="jd-status"><span className="jd-dot"/>{sending?"Working through your request":"Workspace connected"}</div>
        </header>
        <div className="jd-scroll">
          {messages.length===0 ? <div className="jd-welcome">
            <div className="jd-spark"><Sparkles size={20}/></div>
            <h1 className="jd-heading">{greeting}{firstName ? `, ${firstName}` : ""}.</h1>
            <p className="jd-subtitle">Your organisation, one conversation.<br/>Ask JD to inspect records, prepare work and manage workflows.</p>
            <div className="jd-actions">{actions.map(({icon:Icon,label,prompt})=><button className="jd-action" type="button" key={label} onClick={()=>setDraft(prompt)}><span className="jd-action-icon"><Icon size={15}/></span><span>{label}</span></button>)}</div>
          </div> : <div className="jd-thread">
            {messages.map((item,index)=><div className={`jd-message ${item.role}`} key={index}>
              {item.role==="assistant"&&<div className="jd-message-head"><span className="jd-mini-mark">JD</span> JD</div>}
              {item.content}
              {item.toolEvents?.length>0&&<div className="jd-tools">{item.toolEvents.map((event,i)=><span className="jd-tool" key={i}>{event.name?.replaceAll("_"," ")} · {event.status}</span>)}</div>}
              {item.run?.status&&<div className="jd-run">Run · {item.run.status}</div>}
            </div>)}
            {sending&&<div className="jd-message assistant"><div className="jd-message-head"><span className="jd-mini-mark">JD</span> JD is working</div><LoaderCircle size={15}/></div>}
          </div>}
        </div>
        <div className="jd-compose-wrap">
          {error&&<div className="jd-error">{error}</div>}
          <div className="jd-compose">
            <textarea aria-label="Message JD" value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}} placeholder="Ask JD to do something in your organisation…" disabled={sending} rows={2}/>
            <div className="jd-compose-bottom"><span className="jd-compose-hint">Enter to send · Shift + Enter for a new line</span><button className="jd-send" type="button" disabled={!draft.trim()||sending} onClick={()=>send()} aria-label="Send message">{sending?<LoaderCircle size={16}/>:<ArrowUp size={17}/>}</button></div>
          </div>
          <div className="jd-disclaimer">JD verifies available records and reports what it could and could not complete.</div>
        </div>
      </section>}
    </div>
  );
}
