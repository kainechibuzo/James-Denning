import React, { useMemo, useState } from "react";
import { ArrowUp, Plus, Search, PanelLeftClose, Sparkles, BarChart3, Users, ClipboardList, FileText, Menu, LoaderCircle } from "lucide-react";
import { supabase } from "../supabaseClient.js";

const suggestions = [
  { icon: BarChart3, title: "Business performance", prompt: "Give me a summary of my organisation's performance." },
  { icon: ClipboardList, title: "Operations", prompt: "What should I focus on today?" },
  { icon: Users, title: "People and teams", prompt: "Help me understand my team's activity." },
  { icon: FileText, title: "Reports", prompt: "Help me prepare an organisation report." },
];

export function ChatHome({ user, organizationName = "Your organisation" }) {
  const [draft, setDraft] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  }, []);
  const name = (user?.name || "").trim().split(/\s+/)[0];

  const send = async () => {
    const message = draft.trim();
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
      setMessages((current) => [...current, { role: "assistant", content: data.reply || data.message || "The request was recorded.", run: data.run }]);
    } catch (err) {
      setError(err?.message || "JD could not complete the request. Please try again.");
      setMessages((current) => current.filter((item, index) => !(item.role === "user" && index === current.length - 1)));
      setDraft(message);
    } finally {
      setSending(false);
    }
  };

  const newConversation = () => {
    if (sending) return;
    setConversationId(null);
    setMessages([]);
    setDraft("");
    setError("");
  };

  return (
    <div className="jd-chat-home">
      <style>{`
        .jd-chat-home{min-height:calc(100vh - 62px);height:100%;display:flex;background:#f8f9fa;color:#202124;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .jd-chat-sidebar{width:264px;flex:0 0 264px;background:#f1f3f4;border-right:1px solid #e5e7eb;padding:18px 14px;display:flex;flex-direction:column;gap:18px}
        .jd-chat-brand{display:flex;align-items:center;gap:10px;font-size:15px;font-weight:700;letter-spacing:-.3px;padding:2px 4px}
        .jd-chat-mark{width:31px;height:31px;border-radius:10px;background:#202124;color:white;display:grid;place-items:center;font-weight:800;font-size:12px}
        .jd-chat-new{display:flex;align-items:center;gap:9px;border:1px solid #dadce0;background:#fff;border-radius:999px;padding:11px 14px;color:#3c4043;font-size:13px;font-weight:600;cursor:pointer}
        .jd-chat-side-label{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#80868b;font-weight:700;padding:0 8px}
        .jd-chat-side-foot{margin-top:auto;border-top:1px solid #dadce0;padding:14px 7px 0;display:flex;align-items:center;gap:10px;font-size:12px;color:#5f6368}
        .jd-chat-main{min-width:0;flex:1;display:flex;flex-direction:column;position:relative;min-height:calc(100vh - 62px)}
        .jd-chat-top{height:60px;flex:0 0 60px;display:flex;align-items:center;justify-content:space-between;padding:0 26px;border-bottom:1px solid #eceff1;background:rgba(255,255,255,.72)}
        .jd-chat-top-title{font-size:13px;font-weight:650;color:#3c4043}.jd-chat-workspace{font-size:11px;color:#80868b;margin-top:3px}
        .jd-chat-content{width:min(820px,calc(100% - 44px));margin:0 auto;display:flex;flex-direction:column;align-items:center;padding:46px 0 28px;flex:1;overflow-y:auto}
        .jd-chat-welcome-mark{width:48px;height:48px;border-radius:16px;background:#202124;color:#fff;display:grid;place-items:center;box-shadow:0 6px 18px rgba(32,33,36,.12)}
        .jd-chat-heading{font-size:clamp(27px,4vw,38px);font-weight:550;letter-spacing:-1.7px;margin:23px 0 8px;text-align:center}
        .jd-chat-subtitle{font-size:14px;color:#70757a;text-align:center;line-height:1.65;margin:0 0 32px}
        .jd-chat-suggestions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;width:min(610px,100%)}
        .jd-chat-suggestion{border:1px solid #e1e4e7;background:#fff;border-radius:14px;padding:15px;text-align:left;display:flex;gap:12px;align-items:flex-start;cursor:pointer;min-height:76px}
        .jd-chat-suggestion:hover{border-color:#aeb4ba}.jd-chat-suggestion-icon{width:30px;height:30px;border-radius:10px;background:#f1f3f4;display:grid;place-items:center;color:#5f6368;flex:0 0 auto}
        .jd-chat-suggestion strong{display:block;font-size:12px;font-weight:650;color:#3c4043;margin:2px 0 5px}.jd-chat-suggestion span{display:block;font-size:11px;color:#80868b;line-height:1.45}
        .jd-chat-thread{width:100%;display:flex;flex-direction:column;gap:18px;padding:12px 0 28px}
        .jd-chat-message{max-width:88%;font-size:13px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere}
        .jd-chat-message.user{align-self:flex-end;background:#e8eaed;border-radius:18px 18px 4px 18px;padding:12px 15px}
        .jd-chat-message.assistant{align-self:flex-start;padding:5px 2px;color:#303134}
        .jd-chat-run{font-size:10px;color:#80868b;margin-top:7px}
        .jd-chat-composer-wrap{width:min(760px,calc(100% - 40px));margin:0 auto 18px}
        .jd-chat-composer{background:#fff;border:1px solid #dadce0;border-radius:18px;box-shadow:0 4px 18px rgba(60,64,67,.07);padding:12px 13px 10px}
        .jd-chat-composer textarea{width:100%;resize:vertical;min-height:50px;max-height:130px;border:0;outline:0;background:transparent;color:#202124;font:inherit;font-size:13px;line-height:1.6;box-sizing:border-box}
        .jd-chat-composer-bottom{display:flex;align-items:center;justify-content:space-between}
        .jd-chat-send{width:34px;height:34px;border:0;background:#202124;color:#fff;border-radius:50%;display:grid;place-items:center;cursor:pointer}
        .jd-chat-send:disabled{opacity:.35;cursor:not-allowed}.jd-chat-disclaimer{text-align:center;color:#9aa0a6;font-size:10px;margin-top:10px}
        .jd-chat-error{color:#b3261e;font-size:11px;margin:0 0 8px 4px}
        @media(max-width:760px){.jd-chat-sidebar{display:none}.jd-chat-top{padding:0 16px}.jd-chat-content{padding:38px 0 22px;width:calc(100% - 32px)}.jd-chat-suggestions{grid-template-columns:1fr}.jd-chat-composer-wrap{width:calc(100% - 28px);margin-bottom:12px}.jd-chat-heading{font-size:30px}.jd-chat-subtitle{font-size:13px;margin-bottom:25px}.jd-chat-message{max-width:94%}}
      `}</style>
      {sidebarOpen && <aside className="jd-chat-sidebar">
        <div className="jd-chat-brand"><span className="jd-chat-mark">JD</span><span>James-Denning</span></div>
        <button className="jd-chat-new" type="button" onClick={newConversation}><Plus size={16}/> New conversation</button>
        <div className="jd-chat-side-label">Workspace</div>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 9px",color:"#3c4043",fontSize:12}}><Sparkles size={15}/> JD Assistant</div>
        <div className="jd-chat-side-foot"><span className="jd-chat-mark" style={{width:27,height:27,borderRadius:9}}>{(name||"U")[0].toUpperCase()}</span><span>{user?.name || "Workspace member"}</span></div>
      </aside>}
      <section className="jd-chat-main">
        <header className="jd-chat-top">
          <div style={{display:"flex",alignItems:"center",gap:11}}>
            <button type="button" aria-label="Toggle conversation sidebar" onClick={() => setSidebarOpen(v=>!v)} style={{border:0,background:"transparent",color:"#5f6368",padding:5,cursor:"pointer"}}>{sidebarOpen?<PanelLeftClose size={17}/>:<Menu size={18}/>}</button>
            <div><div className="jd-chat-top-title">JD Assistant</div><div className="jd-chat-workspace">{organizationName}</div></div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:7,color:"#5f6368",fontSize:11}}><span style={{width:7,height:7,borderRadius:9,background:sending?"#1a73e8":"#188038"}}/>{sending?"Working on your request":"Autonomous assistant"}</div>
        </header>
        <div className="jd-chat-content">
          {messages.length===0 ? <>
            <div className="jd-chat-welcome-mark"><Sparkles size={23}/></div>
            <h1 className="jd-chat-heading">{greeting}{name ? `, ${name}` : ""}.</h1>
            <p className="jd-chat-subtitle">I'm JD. Tell me what needs to get done.<br/>I'll inspect the workspace, use available tools and report back.</p>
            <div className="jd-chat-suggestions">
              {suggestions.map(({icon:Icon,title,prompt})=><button type="button" className="jd-chat-suggestion" key={title} onClick={()=>setDraft(prompt)}><span className="jd-chat-suggestion-icon"><Icon size={16}/></span><span><strong>{title}</strong><span>{prompt}</span></span></button>)}
            </div>
          </> : <div className="jd-chat-thread">
            {messages.map((item,index)=><div className={`jd-chat-message ${item.role}`} key={index}>{item.content}{item.run?.status&&<div className="jd-chat-run">Run status: {item.run.status}</div>}</div>)}
            {sending&&<div className="jd-chat-message assistant" style={{color:"#80868b"}}><LoaderCircle size={15} style={{verticalAlign:"middle",marginRight:8}}/>JD is working through your request…</div>}
          </div>}
        </div>
        <div className="jd-chat-composer-wrap">
          {error&&<div className="jd-chat-error">{error}</div>}
          <div className="jd-chat-composer">
            <textarea aria-label="Message JD" value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}} placeholder="Message JD…" disabled={sending} rows={2}/>
            <div className="jd-chat-composer-bottom"><span style={{fontSize:10,color:"#9aa0a6"}}>Enter to send · Shift + Enter for a new line</span><button type="button" className="jd-chat-send" disabled={!draft.trim()||sending} onClick={send} aria-label="Send message">{sending?<LoaderCircle size={17}/>:<ArrowUp size={17}/>}</button></div>
          </div>
          <div className="jd-chat-disclaimer">JD can make mistakes. High-impact actions require approval.</div>
        </div>
      </section>
    </div>
  );
}
