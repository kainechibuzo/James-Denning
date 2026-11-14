import React, { useEffect, useMemo, useState } from "react";
import { ArrowUp, Plus, Sparkles, BarChart3, Users, ClipboardList, FileText, Menu, LoaderCircle, PanelLeftClose, Activity, Mail, CalendarDays, Wallet, ShieldCheck, Search, Paperclip, ChevronDown, Command } from "lucide-react";
import { supabase } from "../supabaseClient.js";
import { ReviewCentre } from "./ReviewCentre.jsx";
import { AgentUsage } from "./AgentUsage.jsx";
import { RunMonitor } from "./RunMonitor.jsx";
import { JDVisualWorkspace } from "./JDVisualWorkspace.jsx";

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

function renderInlineMarkdown(value, keyPrefix = "inline") {
  const tokenPattern = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|\x60[^\x60]+\x60|\[[^\]]+\]\(https:\/\/[^\s)]+\)|https:\/\/[^\s<>"')]+)/g;
  return String(value || "").split(tokenPattern).filter(Boolean).map((part, index) => {
    const key = keyPrefix + "-" + index;
    if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) return <em key={key}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`")) return <code className="jd-inline-code" key={key}>{part.slice(1, -1)}</code>;
    const markdownLink = part.match(/^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/);
    const href = markdownLink?.[2] || (/^https:\/\//i.test(part) ? part : null);
    if (href) return <a key={key} href={href} target="_blank" rel="noopener noreferrer">{markdownLink?.[1] || part}</a>;
    return part;
  });
}

function renderMessageContent(content) {
  const lines = String(content || "").replace(/\r\n?/g, "\n").split("\n");
  const nodes = [];
  let paragraph = [];
  const flushParagraph = () => {
    if (!paragraph.length) return;
    nodes.push(<p key={"p-" + nodes.length}>{renderInlineMarkdown(paragraph.join(" "), "p-" + nodes.length)}</p>);
    paragraph = [];
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) { flushParagraph(); continue; }
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const Tag = heading[1].length === 1 ? "h2" : heading[1].length === 2 ? "h3" : "h4";
      nodes.push(<Tag key={"h-" + index}>{renderInlineMarkdown(heading[2], "h-" + index)}</Tag>);
      continue;
    }
    const bullet = trimmed.match(/^[-*•]\s+(.+)$/);
    const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    const quote = trimmed.match(/^>\s?(.+)$/);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      const items = [];
      while (index < lines.length) {
        const candidate = lines[index].trim();
        const match = ordered ? candidate.match(/^\d+[.)]\s+(.+)$/) : candidate.match(/^[-*•]\s+(.+)$/);
        if (!match) break;
        items.push(match[1]);
        index += 1;
      }
      index -= 1;
      const ListTag = ordered ? "ol" : "ul";
      nodes.push(<ListTag key={"list-" + index}>{items.map((item, itemIndex) => <li key={itemIndex}>{renderInlineMarkdown(item, "li-" + index + "-" + itemIndex)}</li>)}</ListTag>);
      continue;
    }
    if (quote) {
      flushParagraph();
      nodes.push(<blockquote key={"q-" + index}>{renderInlineMarkdown(quote[1], "q-" + index)}</blockquote>);
      continue;
    }
    paragraph.push(trimmed);
  }
  flushParagraph();
  return <div className="jd-markdown">{nodes}</div>;
}

export function ChatHome({ user, organizationName = "Your organisation" }) {
  const [draft, setDraft] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 760);
  const [showReview, setShowReview] = useState(false);
  const [showUsage, setShowUsage] = useState(false);
  const [showRuns, setShowRuns] = useState(false);
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  }, []);
  const firstName = (user?.name || "").trim().split(/\s+/)[0];
  const backgroundWorking = messages.some((item) => item.role === "assistant" && ["queued", "running", "retry_wait", "planning"].includes(item.run?.status));

  useEffect(() => {
    let active = true;
    const loadHistory = async () => {
      setHistoryLoading(true);
      const { data } = await supabase.functions.invoke("jd-automation", { body: { action: "history.list" } });
      if (active) setConversations(data?.conversations || []);
      if (active) setHistoryLoading(false);
    };
    void loadHistory();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (backgroundWorking) return;
    let active = true;
    const checkApprovals = async () => {
      const { data } = await supabase.functions.invoke("jd-automation", { body: { action: "approvals.list" } });
      if (active && (data?.approvals || []).some((item) => item.status === "pending")) setShowReview(true);
    };
    void checkApprovals();
    return () => { active = false; };
  }, [backgroundWorking]);

  const loadConversation = async (id) => {
    if (!id || sending) return;
    setError("");
    const { data, error: loadError } = await supabase.functions.invoke("jd-automation", { body: { action: "history", conversationId: id } });
    if (loadError || !data) {
      setError("JD couldn't open that conversation. Please try again.");
      return;
    }
    setConversationId(id);
    setMessages((data.messages || []).map((item) => ({
      role: item.role, content: item.content || "",
      visualWorkspace: item.content_json?.visual_workspace || item.content_json?.ui || null,
      toolEvents: item.content_json?.toolEvents || [],
      run: item.content_json?.run || null
    })).filter((item) => item.role === "user" || item.role === "assistant"));
    setSidebarOpen(false);
    setShowReview(false);
  };

  // Poll only the specific active jobs in this conversation. The job-id key
  // stays stable while messages update, so renders do not restart the timer.
  const pendingJobKey = messages
    .filter((item) => item.role === "assistant" && item.jobId && item.run?.id && ["queued", "running", "retry_wait", "planning"].includes(item.run?.status))
    .map((item) => item.jobId)
    .filter(Boolean)
    .join(",");

  useEffect(() => {
    if (!pendingJobKey) return undefined;
    const jobIds = [...new Set(pendingJobKey.split(",").filter(Boolean))];
    let stopped = false;
    let inFlight = false;
    const poll = async () => {
      if (inFlight || stopped) return;
      inFlight = true;
      try {
        const results = await Promise.all(jobIds.map(async (jobId) => {
          const { data, error: pollError } = await supabase.functions.invoke("jd-automation", {
            body: { action: "execution.job.status", jobId },
          });
          if (pollError || !data?.run) return null;
          return { jobId, ...data };
        }));
        if (stopped) return;
        const updates = results.filter(Boolean);
        if (!updates.length) return;
        setMessages((currentMessages) => currentMessages.map((message) => {
          const update = updates.find((item) => item.jobId === message.jobId);
          if (!update) return message;
          const status = update.run.status || message.run?.status;
          const terminal = ["completed", "partially_completed", "failed", "cancelled"].includes(status);
          const finalMessage = update.assistantMessage;
          const fallback = status === "failed"
            ? "JD couldn't complete this request. Open Automation runs for the error details."
            : status === "cancelled"
              ? "This request was cancelled."
              : message.content;
          return {
            ...message,
            content: finalMessage?.content || (terminal ? fallback : message.content),
            streaming: finalMessage?.content_json?.streaming === true,
            toolEvents: update.steps?.length ? update.steps.map((step) => ({ name: step.tool_key, status: step.status, risk: step.risk_level, error: step.error_message })) : (finalMessage?.content_json?.toolEvents || message.toolEvents || []),
            visualWorkspace: finalMessage?.content_json?.visual_workspace || finalMessage?.content_json?.ui || (update.steps?.length ? { version: 1, blocks: [{ type: "timeline", title: "Verified execution activity", events: update.steps.slice(0, 30).map((step) => ({ title: String(step.tool_key || "Workspace task").replaceAll("_", " "), status: step.status, detail: step.error_message || (step.risk_level ? "Risk: " + step.risk_level : "") })) }] } : message.visualWorkspace || null),
            run: { ...message.run, ...update.run, status },
            jobStatus: update.job.status,
          };
        }));
      } finally {
        inFlight = false;
      }
    };
    void poll();
    const timer = setInterval(poll, 1200);
    return () => { stopped = true; clearInterval(timer); };
  }, [pendingJobKey]);

  const send = async (override, targetConversationId = null) => {
    const message = (override ?? draft).trim();
    if (!message || sending) return;
    setDraft("");
    setError("");
    setMessages((current) => [...current, { role: "user", content: message }]);
    setSending(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("jd-automation", {
        body: { action: "submit", message, conversationId: targetConversationId || conversationId },
      });
      if (invokeError) throw invokeError;
      if (!data) throw new Error("JD returned an empty response.");
      if (data.conversationId) setConversationId(data.conversationId);
      const { data: historyData } = await supabase.functions.invoke("jd-automation", { body: { action: "history.list" } });
      if (historyData?.conversations) setConversations(historyData.conversations);
      const queued = data.queued === true && Boolean(data.job?.id);
      setMessages((current) => [...current, { role: "assistant", content: queued ? "" : data.reply || data.message || "The request was recorded.", run: data.run, jobId: data.job?.id || null, toolEvents: data.toolEvents || [], visualWorkspace: data.visual_workspace || data.ui || data.assistantMessage?.content_json?.visual_workspace || null }]);
    } catch (err) {
      const status = err?.context?.status || err?.status;
      const rawMessage = err?.context?.body?.message || err?.context?.body?.error || err?.message || "";
      setError(status === 404 ? "JD Assistant's Edge Function is not deployed to this Supabase project yet." : status === 401 ? "Your session has expired. Sign in again, then retry." : status === 403 ? "Your account is not authorised for this organisation's JD workspace." : status === 503 ? "JD Assistant is deployed but its server configuration is incomplete. Check the Edge Function secrets." : status >= 500 ? "JD Assistant's server returned an error. Check the Edge Function logs." : rawMessage || "JD could not reach its service. Check your connection and try again.");
      setMessages((current) => current.filter((item) => !(item.role === "user" && item.content === message)));
      setDraft(message);
    } finally { setSending(false); }
  };

  const updateOperationalTask = async (taskId, status) => {
    if (!taskId || !["in_progress", "completed"].includes(status)) return;
    setError("");
    const { data, error: taskError } = await supabase.functions.invoke("jd-automation", {
      body: { action: "operations.task.transition", taskId, status },
    });
    if (taskError || !data?.task) {
      setError(data?.error || "JD could not update this task. Refresh the workspace and try again.");
      return;
    }
    setError(data.auditRecorded === false
      ? "Task status changed, but JD could not record its audit event. This transition needs administrator review."
      : "");
    const confirmedStatus = data.task.status || status;
    setMessages((current) => current.map((message) => {
      if (!message.visualWorkspace?.blocks) return message;
      return {
        ...message,
        visualWorkspace: {
          ...message.visualWorkspace,
          blocks: message.visualWorkspace.blocks.map((block) => block.type !== "checklist" ? block : ({
            ...block,
            items: (block.items || []).map((item) => item.id === taskId ? { ...item, status: confirmedStatus } : item),
          })),
        },
      };
    }));
  };

  const newConversation = () => {
    if (sending) return;
    setConversationId(null); setMessages([]); setDraft(""); setError(""); setSidebarOpen(false);
  };

  return (
    <div className="jd-command">
      <style>{`
        .jd-command{height:calc(100dvh - 57px);min-height:0;display:flex;background:#f7f8fa;color:#17191c;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}
        .jd-command *{box-sizing:border-box}
        .jd-history-scrim{display:none}\n        .jd-utility{position:absolute;z-index:4;top:9px;left:12px;right:12px;display:flex;align-items:center;justify-content:space-between;pointer-events:none}\n        .jd-utility button,.jd-utility-status{pointer-events:auto}\n        .jd-history-trigger{width:36px;height:36px;border:1px solid #e1e4e8;background:rgba(255,255,255,.94);border-radius:10px;color:#606873;display:grid;place-items:center;cursor:pointer}\n        .jd-utility-status{font-size:10px;color:#626975;background:rgba(255,255,255,.96);border:1px solid #e5e7eb;border-radius:20px;padding:7px 11px;box-shadow:0 2px 8px rgba(20,24,30,.04);display:inline-flex;align-items:center;gap:7px}
        .jd-utility-status.is-working{color:#343941;border-color:#dfe3e8}
        .jd-utility-status.is-working:before{content:"";width:7px;height:7px;border-radius:50%;background:#27966c;animation:jd-pulse 1.25s ease-in-out infinite}
        @keyframes jd-pulse{0%,100%{opacity:.45;transform:scale(.85)}50%{opacity:1;transform:scale(1.12)}}\n        .jd-rail{width:258px;flex:0 0 258px;background:#f0f1f3;border-right:1px solid #e2e4e8;padding:18px 13px;display:flex;flex-direction:column;gap:16px}
        .jd-brand{display:flex;align-items:center;gap:10px;padding:4px 7px 12px;font-size:14px;font-weight:700;letter-spacing:-.3px}
        .jd-brand-mark{width:32px;height:32px;border-radius:11px;background:#15171a;color:#fff;display:grid;place-items:center;font-size:12px;font-weight:800}
        .jd-new{width:100%;display:flex;align-items:center;justify-content:center;gap:9px;border:1px solid #d9dce1;background:#fff;border-radius:11px;padding:11px 12px;color:#202328;font-size:12px;font-weight:650;cursor:pointer}
        .jd-rail-label{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#92979f;font-weight:800;padding:0 9px;margin:4px 0}
        .jd-nav{display:grid;grid-template-columns:1fr 1fr;gap:5px}
        .jd-nav button{min-width:0;border:1px solid transparent;background:transparent;border-radius:9px;padding:10px 8px;display:flex;align-items:center;gap:8px;text-align:left;color:#5e646d;font-size:11px;cursor:pointer}
        .jd-nav button:hover{background:#fff;border-color:#e1e3e7;color:#202328}
        .jd-nav svg{flex:0 0 auto}
        .jd-history-list{min-height:0;flex:1;overflow:auto;border-top:1px solid #e0e2e6;padding-top:9px}
        .jd-history-empty{padding:8px 9px;color:#969ca5;font-size:10px;line-height:1.5}
        .jd-history-item{width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px;border:1px solid transparent;border-radius:9px;background:transparent;color:#555c66;text-align:left;font-size:10px;cursor:pointer}
        .jd-history-item span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
        .jd-history-item small{flex:0 0 auto;color:#969ca5;font-size:9px}
        .jd-history-item:hover,.jd-history-item.active{background:#fff;border-color:#e1e4e8;color:#202329}

        .jd-rail-foot{margin-top:auto;border-top:1px solid #dfe1e5;padding:13px 5px 0;display:flex;align-items:center;gap:9px;color:#555b64;font-size:11px}
        .jd-avatar{width:29px;height:29px;border-radius:9px;background:#22252a;color:#fff;display:grid;place-items:center;font-weight:700}
        .jd-main{min-width:0;min-height:0;flex:1;display:flex;flex-direction:column;position:relative}
        .jd-top{display:none}
        .jd-top-left{display:flex;align-items:center;gap:11px;min-width:0;flex:1}
        .jd-icon-btn{border:0;background:transparent;color:#707680;padding:7px;border-radius:8px;cursor:pointer}
        .jd-top-title{font-size:12px;font-weight:700;color:#25282d;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.jd-top-sub{font-size:10px;color:#969ba3;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .jd-status{display:flex;align-items:center;gap:7px;font-size:10px;color:#737982;flex-shrink:0;white-space:nowrap}
        .jd-dot{width:7px;height:7px;border-radius:50%;background:#28956b}
        .jd-scroll{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;align-items:center;padding:58px 20px 12px}
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
        .jd-markdown{font-size:14px;line-height:1.75;color:#292d33;overflow-wrap:anywhere}
        .jd-markdown>*:first-child{margin-top:0}
        .jd-markdown>*:last-child{margin-bottom:0}
        .jd-markdown p{margin:0 0 12px}
        .jd-markdown h2,.jd-markdown h3,.jd-markdown h4{font-weight:720;letter-spacing:-.35px;line-height:1.35;color:#20242a;margin:18px 0 8px}
        .jd-markdown h2{font-size:18px}.jd-markdown h3{font-size:16px}.jd-markdown h4{font-size:14px}
        .jd-markdown ul,.jd-markdown ol{margin:7px 0 14px;padding-left:22px}
        .jd-markdown li{padding-left:3px;margin:4px 0}
        .jd-markdown strong{font-weight:750;color:#20242a}
        .jd-markdown a{color:#245f9e;text-decoration:underline;text-underline-offset:2px;overflow-wrap:anywhere}
        .jd-markdown blockquote{margin:10px 0;padding:8px 12px;border-left:3px solid #cbd1d9;background:#f0f2f5;color:#626a75;border-radius:0 8px 8px 0}
        .jd-inline-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em;background:#eef0f3;border:1px solid #e2e5e9;border-radius:5px;padding:1px 5px}
        .jd-message-head{display:flex;align-items:center;gap:8px;margin-bottom:7px;font-size:10px;color:#818791;font-weight:650}
        .jd-mini-mark{width:20px;height:20px;border-radius:7px;background:#191b1f;color:white;display:grid;place-items:center;font-size:8px}
        .jd-tools{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
        .jd-tool{border:1px solid #e3e5e9;background:#fafbfc;border-radius:7px;padding:5px 8px;color:#737984;font-size:9px}
        .jd-run{font-size:10px;color:#858b94;margin-top:8px}
        .jd-activity{display:flex;flex-direction:column;gap:7px;margin:2px 0 3px;padding:10px 12px;border:1px solid #e8eaee;border-radius:12px;background:rgba(255,255,255,.72);max-width:100%}
        .jd-activity-title{display:flex;align-items:center;gap:8px;color:#424852;font-size:11px;font-weight:650}
        .jd-activity-dot{width:7px;height:7px;border-radius:50%;background:#27966c;animation:jd-pulse 1.25s ease-in-out infinite;flex:0 0 auto}
        .jd-activity-detail{font-size:10px;color:#818791;line-height:1.5;padding-left:15px}
        .jd-activity-steps{display:grid;gap:5px;padding-left:15px}
        .jd-activity-step{display:flex;align-items:center;gap:7px;font-size:10px;color:#747b85}
        .jd-activity-step.done{color:#5e786b}
        .jd-compose-wrap{width:min(780px,calc(100% - 40px));margin:0 auto calc(14px + env(safe-area-inset-bottom,0px))}
        .jd-compose{border:1px solid #dfe2e7;background:#fff;border-radius:18px;padding:12px 13px 10px;box-shadow:0 8px 30px rgba(22,26,32,.055)}
        .jd-compose textarea{width:100%;min-height:48px;max-height:180px;resize:vertical;border:0;outline:0;background:transparent;color:#202329;font:inherit;font-size:13px;line-height:1.65}
        .jd-compose-bottom{display:flex;align-items:center;justify-content:space-between}
        .jd-compose-hint{font-size:9px;color:#a0a5ad}
        .jd-send{width:34px;height:34px;border:0;border-radius:11px;background:#17191d;color:white;display:grid;place-items:center;cursor:pointer}
        .jd-send:disabled{opacity:.35;cursor:not-allowed}
        .jd-error{color:#b3261e;font-size:11px;margin:0 0 7px 5px}
        .jd-disclaimer{text-align:center;font-size:9px;color:#a0a5ad;margin-top:9px}
        @media(max-width:760px){
          .jd-command{height:calc(100dvh - 57px);min-height:0}
          .jd-rail{position:absolute;z-index:8;inset:0 auto 0 0;width:min(300px,86vw);max-width:86vw;box-shadow:16px 0 40px rgba(20,24,30,.16);overflow:auto}
          .jd-history-scrim{display:block;position:absolute;z-index:7;inset:0;background:rgba(18,22,28,.28);border:0;padding:0}
          .jd-scroll{padding:54px 14px 8px}
          .jd-welcome{width:100%;padding:8px 0 12px}
          .jd-spark{width:38px;height:38px;border-radius:12px;margin-bottom:14px}
          .jd-heading{font-size:25px;letter-spacing:-.9px;margin-bottom:7px}
          .jd-subtitle{font-size:12px;line-height:1.6;margin-bottom:18px}
          .jd-actions{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
          .jd-action{min-height:52px;padding:10px 9px;gap:9px}
          .jd-action span:last-child{font-size:11px}
          .jd-actions>.jd-action:last-child:nth-child(odd){grid-column:1/-1}
          .jd-compose-wrap{width:calc(100% - 24px);margin-bottom:calc(8px + env(safe-area-inset-bottom,0px))}
          .jd-compose{padding:10px 11px 8px;border-radius:16px}
          .jd-compose textarea{min-height:42px;max-height:140px}
          .jd-message.user{max-width:94%}
          .jd-status{font-size:10px;gap:5px}
          .jd-status .jd-dot{width:8px;height:8px}
        }
        @media(max-width:360px){
          .jd-actions{grid-template-columns:1fr 1fr}
          .jd-action{gap:7px;padding:9px 8px}
          .jd-action span:last-child{font-size:10px}
          .jd-heading{font-size:23px}
        }
      `}</style>
      {sidebarOpen && <><button className="jd-history-scrim" type="button" aria-label="Close chat history" onClick={()=>setSidebarOpen(false)}/><aside className="jd-rail">
        <div className="jd-brand"><span className="jd-brand-mark">JD</span><span>James-Denning</span></div>
        <button className="jd-new" type="button" onClick={newConversation}><Plus size={15}/> New conversation</button>
        <button className="jd-new" type="button" onClick={()=>{setShowReview(false);setShowUsage(false);}}><Plus size={15}/> Chat</button>
        <button className="jd-new" type="button" onClick={()=>{setShowReview(true);setShowUsage(false);}}><ShieldCheck size={15}/> Review Centre</button>
        <button className="jd-new" type="button" onClick={()=>{setShowUsage(true);setShowReview(false);setShowRuns(false);}}><Activity size={15}/> AI usage</button>
        <button className="jd-new" type="button" onClick={()=>{setShowRuns(true);setShowUsage(false);setShowReview(false);}}><Activity size={15}/> Automation runs</button>
        <div className="jd-history-list">
          <div className="jd-rail-label">Recent conversations</div>
          {historyLoading ? <div className="jd-history-empty">Loading chats…</div> : conversations.length === 0 ? <div className="jd-history-empty">Your saved chats will appear here.</div> : conversations.map((chat) => (
            <button type="button" key={chat.id} className={"jd-history-item" + (conversationId === chat.id ? " active" : "")} onClick={() => loadConversation(chat.id)}>
              <span>{chat.title || "New conversation"}</span>
              <small>{chat.updated_at ? new Date(chat.updated_at).toLocaleDateString() : ""}</small>
            </button>
          ))}
        </div>
        <div><div className="jd-rail-label">Ask JD to work with</div><div className="jd-nav">{actions.map(({icon:Icon,label,prompt})=><button key={label} type="button" onClick={()=>send(prompt)}><Icon size={14}/>{label}</button>)}</div></div>
        <div className="jd-rail-foot"><span className="jd-avatar">{(firstName||"U")[0].toUpperCase()}</span><span>{user?.name || "Workspace member"}</span></div>
      </aside></>}
      {showRuns ? <RunMonitor onClose={()=>setShowRuns(false)}/> : showUsage ? <AgentUsage onClose={()=>setShowUsage(false)}/> : showReview ? <ReviewCentre onClose={()=>setShowReview(false)}/> : <section className="jd-main">
        <header className="jd-top">
          <div className="jd-top-left">
            <button className="jd-icon-btn" type="button" aria-label="Toggle sidebar" onClick={()=>setSidebarOpen(v=>!v)}>{sidebarOpen?<PanelLeftClose size={17}/>:<Menu size={18}/>}</button>
            <div><div className="jd-top-title">JD Assistant</div><div className="jd-top-sub">{organizationName} · Command centre</div></div>
          </div>
          <div className="jd-status"><span className="jd-dot"/>{sending?"Working through your request":"Workspace connected"}</div>
        </header>
        <div className="jd-utility"><button className="jd-history-trigger" type="button" aria-label="Open chat history and JD tools" onClick={()=>setSidebarOpen(true)}><Menu size={18}/></button><span className={"jd-utility-status" + (sending || backgroundWorking ? " is-working" : "")}>{sending || backgroundWorking ? "JD is cooking…" : "Workspace connected"}</span></div><div className="jd-scroll">
          {messages.length===0 ? <div className="jd-welcome">
            <div className="jd-spark"><Sparkles size={20}/></div>
            <h1 className="jd-heading">{greeting}{firstName ? `, ${firstName}` : ""}.</h1>
            <p className="jd-subtitle">Your organisation, one conversation.<br/>Ask JD to inspect records, prepare work and manage workflows.</p>
            <div className="jd-actions">{actions.map(({icon:Icon,label,prompt})=><button className="jd-action" type="button" key={label} onClick={()=>setDraft(prompt)}><span className="jd-action-icon"><Icon size={15}/></span><span>{label}</span></button>)}</div>
          </div> : <div className="jd-thread">
            {messages.map((item,index)=><div className={`jd-message ${item.role}`} key={index}>
              {item.role==="assistant"&&<div className="jd-message-head"><span className="jd-mini-mark">JD</span> JD</div>}
              {item.content ? renderMessageContent(item.content) : null}
              {item.role === "assistant" && item.visualWorkspace && <JDVisualWorkspace ui={item.visualWorkspace} onAnswer={(answer) => send("For the decision above, I choose: " + answer + ". Continue using this choice.")} onTaskToggle={updateOperationalTask}/>}
              {item.role === "assistant" && !item.content && ["queued", "planning", "running", "retry_wait"].includes(item.run?.status) && (
                <div className="jd-activity" role="status" aria-live="polite">
                  <div className="jd-activity-title"><span className="jd-activity-dot"/>{item.run?.status === "queued" ? "Getting things ready" : item.run?.status === "retry_wait" ? "Picking up where I left off" : item.toolEvents?.length ? "Working through the details" : "Thinking through your request"}</div>
                  {item.toolEvents?.length ? <div className="jd-activity-steps">{item.toolEvents.slice(-4).map((event,i) => {
                    const label = String(event.name || "workspace task").replaceAll("_"," ").replace(/\b\w/g, (letter) => letter.toUpperCase());
                    const done = event.status === "completed";
                    return <div className={"jd-activity-step" + (done ? " done" : "")} key={String(event.name)+"-"+i}><span>{done ? "✓" : "·"}</span>{label}</div>;
                  })}</div> : <div className="jd-activity-detail">JD is organising the work and checking what it needs.</div>}
                </div>
              )}
              {item.streaming&&<div className="jd-run">JD is writing its response…</div>}
              {item.role === "assistant" && item.content && item.toolEvents?.length>0 && <div className="jd-tools">{item.toolEvents.slice(-4).map((event,i)=><span className="jd-tool" key={i}>{event.name?.replaceAll("_"," ")} · {event.status}</span>)}</div>}
            </div>)}
            {sending&&<div className="jd-message assistant"><div className="jd-activity" role="status" aria-live="polite"><div className="jd-activity-title"><span className="jd-activity-dot"/>JD is cooking…</div><div className="jd-activity-detail">Getting the request ready.</div></div></div>}
          </div>}
        </div>
        <div className="jd-compose-wrap">
          {error&&<div className="jd-error">{error}</div>}
          <div className="jd-compose">
            <textarea aria-label="Message JD" value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}} placeholder="Ask JD to do something in your organisation…" disabled={sending} rows={2}/>
            <div className="jd-compose-bottom"><span className="jd-compose-hint">Enter to send · Shift + Enter for a new line</span><button className="jd-send" type="button" disabled={!draft.trim()||sending} onClick={()=>send()} aria-label="Send message">{sending?<LoaderCircle size={16}/>:<ArrowUp size={17}/>}</button></div>
          </div>
          <div className="jd-disclaimer">Free model routing · JD verifies available records and reports what it could and could not complete.</div>
        </div>
      </section>}
    </div>
  );
}
