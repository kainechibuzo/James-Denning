import React, { useMemo, useState } from "react";
import { ArrowUp, Plus, Search, PanelLeftClose, Sparkles, BarChart3, Users, ClipboardList, FileText, Menu } from "lucide-react";

const suggestions = [
  { icon: BarChart3, title: "Business performance", prompt: "Give me a summary of my organisation's performance." },
  { icon: ClipboardList, title: "Operations", prompt: "What should I focus on today?" },
  { icon: Users, title: "People and teams", prompt: "Help me understand my team's activity." },
  { icon: FileText, title: "Reports", prompt: "Help me prepare an organisation report." },
];

export function ChatHome({ user, organizationName = "Your organisation" }) {
  const [draft, setDraft] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showNotice, setShowNotice] = useState(true);
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }, []);
  const name = (user?.name || "").trim().split(/\s+/)[0];
  const usePrompt = (prompt) => setDraft(prompt);

  return (
    <div className="jd-chat-home">
      <style>{`
        .jd-chat-home{min-height:calc(100vh - 62px);height:100%;display:flex;background:#f8f9fa;color:#202124;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .jd-chat-sidebar{width:264px;flex:0 0 264px;background:#f1f3f4;border-right:1px solid #e5e7eb;padding:18px 14px;display:flex;flex-direction:column;gap:18px}
        .jd-chat-brand{display:flex;align-items:center;gap:10px;font-size:15px;font-weight:700;letter-spacing:-.3px;padding:2px 4px}
        .jd-chat-mark{width:31px;height:31px;border-radius:10px;background:#202124;color:white;display:grid;place-items:center;font-weight:800;font-size:12px}
        .jd-chat-new{display:flex;align-items:center;gap:9px;border:1px solid #dadce0;background:#fff;border-radius:999px;padding:11px 14px;color:#3c4043;font-size:13px;font-weight:600;cursor:pointer}
        .jd-chat-side-label{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#80868b;font-weight:700;padding:0 8px}
        .jd-chat-side-item{display:flex;align-items:center;gap:10px;padding:10px 9px;border-radius:10px;color:#5f6368;font-size:12px}
        .jd-chat-side-foot{margin-top:auto;border-top:1px solid #dadce0;padding:14px 7px 0;display:flex;align-items:center;gap:10px;font-size:12px;color:#5f6368}
        .jd-chat-main{min-width:0;flex:1;display:flex;flex-direction:column;position:relative}
        .jd-chat-top{height:60px;display:flex;align-items:center;justify-content:space-between;padding:0 26px;border-bottom:1px solid #eceff1;background:rgba(255,255,255,.72)}
        .jd-chat-top-title{font-size:13px;font-weight:650;color:#3c4043}
        .jd-chat-workspace{font-size:11px;color:#80868b;margin-top:3px}
        .jd-chat-content{width:min(820px,calc(100% - 44px));margin:auto;display:flex;flex-direction:column;align-items:center;padding:60px 0 36px;flex:1}
        .jd-chat-welcome-mark{width:48px;height:48px;border-radius:16px;background:#202124;color:#fff;display:grid;place-items:center;box-shadow:0 6px 18px rgba(32,33,36,.12)}
        .jd-chat-heading{font-size:clamp(27px,4vw,38px);font-weight:550;letter-spacing:-1.7px;margin:23px 0 8px;text-align:center}
        .jd-chat-subtitle{font-size:14px;color:#70757a;text-align:center;line-height:1.65;margin:0 0 32px}
        .jd-chat-suggestions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;width:min(610px,100%)}
        .jd-chat-suggestion{border:1px solid #e1e4e7;background:#fff;border-radius:14px;padding:15px;text-align:left;display:flex;gap:12px;align-items:flex-start;cursor:pointer;transition:border-color .15s,transform .15s;min-height:76px}
        .jd-chat-suggestion:hover{border-color:#aeb4ba;transform:translateY(-1px)}
        .jd-chat-suggestion-icon{width:30px;height:30px;border-radius:10px;background:#f1f3f4;display:grid;place-items:center;color:#5f6368;flex:0 0 auto}
        .jd-chat-suggestion strong{display:block;font-size:12px;font-weight:650;color:#3c4043;margin:2px 0 5px}
        .jd-chat-suggestion span{display:block;font-size:11px;color:#80868b;line-height:1.45}
        .jd-chat-composer-wrap{width:min(760px,calc(100% - 40px));margin:0 auto 18px}
        .jd-chat-notice{display:flex;align-items:flex-start;gap:9px;background:#fff8e1;border:1px solid #f3e5b2;color:#765b13;border-radius:10px;padding:10px 12px;font-size:11px;line-height:1.5;margin-bottom:12px}
        .jd-chat-composer{background:#fff;border:1px solid #dadce0;border-radius:18px;box-shadow:0 4px 18px rgba(60,64,67,.07);padding:12px 13px 10px}
        .jd-chat-composer textarea{width:100%;resize:vertical;min-height:50px;max-height:130px;border:0;outline:0;background:transparent;color:#202124;font:inherit;font-size:13px;line-height:1.6;box-sizing:border-box}
        .jd-chat-composer-bottom{display:flex;align-items:center;justify-content:space-between}
        .jd-chat-attach{width:31px;height:31px;border:0;background:transparent;color:#70757a;display:grid;place-items:center;border-radius:50%}
        .jd-chat-send{width:34px;height:34px;border:0;background:#202124;color:#fff;border-radius:50%;display:grid;place-items:center;opacity:.35;cursor:not-allowed}
        .jd-chat-disclaimer{text-align:center;color:#9aa0a6;font-size:10px;margin-top:10px}
        @media(max-width:760px){.jd-chat-sidebar{display:none}.jd-chat-top{padding:0 16px}.jd-chat-content{padding:54px 0 28px;width:calc(100% - 32px)}.jd-chat-suggestions{grid-template-columns:1fr}.jd-chat-composer-wrap{width:calc(100% - 28px);margin-bottom:12px}.jd-chat-heading{font-size:30px}.jd-chat-subtitle{font-size:13px;margin-bottom:25px}}
      `}</style>
      {sidebarOpen && <aside className="jd-chat-sidebar">
        <div className="jd-chat-brand"><span className="jd-chat-mark">JD</span><span>James-Denning</span></div>
        <button className="jd-chat-new" type="button" onClick={() => setDraft("")}><Plus size={16}/> New conversation</button>
        <div className="jd-chat-side-label">Workspace</div>
        <div className="jd-chat-side-item"><Sparkles size={15}/> JD Assistant</div>
        <div className="jd-chat-side-item"><Search size={15}/> Search conversations</div>
        <div className="jd-chat-side-foot"><span className="jd-chat-mark" style={{width:27,height:27,borderRadius:9}}>{(name||"U")[0].toUpperCase()}</span><span>{user?.name || "Workspace member"}</span></div>
      </aside>}
      <section className="jd-chat-main">
        <header className="jd-chat-top">
          <div style={{display:"flex",alignItems:"center",gap:11}}>
            <button type="button" aria-label="Toggle conversation sidebar" onClick={() => setSidebarOpen(v=>!v)} style={{border:0,background:"transparent",color:"#5f6368",padding:5,cursor:"pointer"}}>{sidebarOpen?<PanelLeftClose size={17}/>:<Menu size={18}/>}</button>
            <div><div className="jd-chat-top-title">JD Assistant</div><div className="jd-chat-workspace">{organizationName}</div></div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:7,color:"#5f6368",fontSize:11}}><span style={{width:7,height:7,borderRadius:9,background:"#9aa0a6"}}/> Setup in progress</div>
        </header>
        <div className="jd-chat-content">
          <div className="jd-chat-welcome-mark"><Sparkles size={23}/></div>
          <h1 className="jd-chat-heading">{greeting}{name ? `, ${name}` : ""}.</h1>
          <p className="jd-chat-subtitle">I'm JD. Your organisation's work, information and workflows<br className="desktop-break"/> will come together here.</p>
          <div className="jd-chat-suggestions">
            {suggestions.map(({icon:Icon,title,prompt})=><button type="button" className="jd-chat-suggestion" key={title} onClick={()=>usePrompt(prompt)}><span className="jd-chat-suggestion-icon"><Icon size={16}/></span><span><strong>{title}</strong><span>{prompt}</span></span></button>)}
          </div>
        </div>
        <div className="jd-chat-composer-wrap">
          {showNotice && <div className="jd-chat-notice"><Sparkles size={14} style={{flex:"0 0 auto",marginTop:1}}/><span>The interface is ready. Secure conversation history and the AI connection will be enabled after the backend foundation is in place.</span><button type="button" aria-label="Dismiss setup notice" onClick={()=>setShowNotice(false)} style={{marginLeft:"auto",border:0,background:"transparent",color:"inherit",cursor:"pointer"}}>×</button></div>}
          <div className="jd-chat-composer">
            <textarea aria-label="Message JD" value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Message JD…" disabled rows={2}/>
            <div className="jd-chat-composer-bottom"><button type="button" className="jd-chat-attach" disabled aria-label="Attach a file"><Plus size={18}/></button><button type="button" className="jd-chat-send" disabled aria-label="Send message"><ArrowUp size={17}/></button></div>
          </div>
          <div className="jd-chat-disclaimer">JD can make mistakes. Verify important organisation decisions and records.</div>
        </div>
      </section>
    </div>
  );
}
