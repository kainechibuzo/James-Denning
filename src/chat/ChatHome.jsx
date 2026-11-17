import React, { useEffect, useMemo, useRef, useState } from "react";
import { Send, ArrowUp, Pause, Play, Plus, Sparkles, BarChart3, Users, ClipboardList, FileText, Menu, LoaderCircle, PanelLeftClose, Activity, Mail, CalendarDays, Wallet, ShieldCheck, Search, Paperclip, ChevronDown, Command, Building2 } from "lucide-react";
import "../styles/reference-design.css";
import { supabase } from "../supabaseClient.js";
import { ReviewCentre } from "./ReviewCentre.jsx";
import { AgentUsage } from "./AgentUsage.jsx";
import { RunMonitor } from "./RunMonitor.jsx";
import { JDVisualWorkspace } from "./JDVisualWorkspace.jsx";
import { JDDepartments } from "./JDDepartments.jsx";
import {savedTaskKey} from "./operational-task-records.mjs";
import {useOperationalTaskRecords} from "./use-operational-task-records.jsx";

const actions = [
  { icon: BarChart3, label: "Performance", prompt: "Review organisation performance and highlight what needs attention." },
  { icon: Users, label: "People", prompt: "Give me an overview of people, teams and outstanding people-related work." },
  { icon: CalendarDays, label: "Schedule", prompt: "Review today's schedule and identify conflicts or missing items." },
  { icon: ClipboardList, label: "Attendance", prompt: "Review recent attendance and identify exceptions that need attention." },
  { icon: Wallet, label: "Billing", prompt: "Summarise billing, payments and outstanding balances." },
  { icon: Mail, label: "Email", prompt: "Help me draft a clear professional email. Ask for any missing details." },
  { icon: FileText, label: "Reports", prompt: "Prepare an organisation report using the latest available records." },
  { icon: Command, label: "Capabilities", prompt: "Show me what you can currently do in this workspace. Check the registered tools available to my role. Separate callable actions, approval requirements and independent live verification. Missing verification is not proof that a tool is unavailable. Do not execute writes just to demonstrate a capability." },
  { icon: Activity, label: "Logs", prompt: "Inspect recent activity and audit logs. Highlight failures and unusual activity." },
  { icon: ShieldCheck, label: "Permissions", prompt: "Review organisation permissions and identify access concerns. Do not change access without approval." },
];

function renderInlineMarkdown(value, keyPrefix = "inline") {
  const tokenPattern = /(\$\$[\s\S]+?\$\$|\$[^$\n]+\$|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|~~[^~]+~~|\x60[^\x60]+\x60|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<>"')]+)/g;
  return String(value || "").split(tokenPattern).filter(Boolean).map((part, index) => {
    const key = keyPrefix + "-" + index;
    if (part.startsWith("$$") && part.endsWith("$$")) return <MathBlock key={key} display value={part.slice(2, -2)} />;
    if (part.startsWith("$") && part.endsWith("$") && part.length > 2) return <MathBlock key={key} value={part.slice(1, -1)} />;
    if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) return <em key={key}>{part.slice(1, -1)}</em>;
    if (part.startsWith("~~") && part.endsWith("~~")) return <del key={key}>{part.slice(2, -2)}</del>;
    if (part.charCodeAt(0) === 96 && part.charCodeAt(part.length - 1) === 96) return <code key={key} className="jd-inline-code">{part.slice(1, -1)}</code>;
    const markdownLink = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    const href = markdownLink?.[2] || (/^https?:\/\//i.test(part) ? part : null);
    if (href) return <a key={key} href={href} target="_blank" rel="noopener noreferrer">{markdownLink?.[1] || part}</a>;
    return part;
  });
}

function MathBlock({ value, display = false }) {
  const rendered = typeof window !== "undefined" && window.katex
    ? window.katex.renderToString(String(value || ""), { throwOnError: false, strict: "ignore", trust: false, displayMode: display })
    : null;
  const content = rendered ? <span dangerouslySetInnerHTML={{ __html: rendered }} /> : <code>{value}</code>;
  return display ? <div className="jd-math-display" aria-label={"Mathematical expression: " + value}>{content}</div> : <span className="jd-math-inline" aria-label={"Mathematical expression: " + value}>{content}</span>;
}

function splitTableRow(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((cell) => cell.replace(/\\\|/g, "|").trim());
}
function isTableDivider(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function renderMessageContent(content) {
  const normalized = String(content || "").replace(/\r\n?/g, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/\u00a0/g, " ");
  const lines = normalized.replace(/\|\|\s*(?=\|?\s*:?-{3,})/g, "|\n|").split("\n");
  const nodes = [];
  let paragraph = [];
  const flushParagraph = () => {
    if (!paragraph.length) return;
    nodes.push(<p key={"p-" + nodes.length}>{renderInlineMarkdown(paragraph.join(" "), "p-" + nodes.length)}</p>);
    paragraph = [];
  };
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed) { flushParagraph(); continue; }
    const fence = trimmed.match(/^(\x60{3,}|~~~)\s*([\w.+-]*)\s*$/);
    if (fence) {
      flushParagraph();
      const codeLines = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith(fence[1])) codeLines.push(lines[index++]);
      nodes.push(<pre className="jd-code-block" key={"code-" + index}><code data-language={fence[2] || undefined}>{codeLines.join("\n")}</code></pre>);
      continue;
    }
    if (trimmed === "$$") {
      flushParagraph();
      const mathLines = [];
      index += 1;
      while (index < lines.length && lines[index].trim() !== "$$") mathLines.push(lines[index++]);
      nodes.push(<MathBlock key={"math-" + index} display value={mathLines.join("\n")} />);
      continue;
    }
    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const Tag = heading[1].length <= 2 ? "h2" : heading[1].length <= 4 ? "h3" : "h4";
      nodes.push(<Tag key={"h-" + index}>{renderInlineMarkdown(heading[2], "h-" + index)}</Tag>);
      continue;
    }
    if (/^\s*\|?.+\|.+\|?\s*$/.test(trimmed) && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      flushParagraph();
      const headers = splitTableRow(trimmed);
      const rows = [];
      index += 2;
      while (index < lines.length && lines[index].trim().includes("|") && lines[index].trim()) rows.push(splitTableRow(lines[index++]));
      index -= 1;
      nodes.push(<div className="jd-table-block" key={"table-" + index}><p className="jd-table-hint">More columns may be off-screen. Swipe the table sideways, or focus it and use the arrow keys.</p><div className="jd-table-wrap" role="region" aria-label="Message table — scroll horizontally for more columns" tabIndex={0}><table className="jd-table"><thead><tr>{headers.map((cell, i) => <th scope="col" key={i}>{renderInlineMarkdown(cell, "th-" + index + "-" + i)}</th>)}</tr></thead><tbody>{rows.map((row, ri) => <tr key={ri}>{headers.map((_, ci) => <td key={ci}>{renderInlineMarkdown(row[ci] || "", "td-" + index + "-" + ri + "-" + ci)}</td>)}</tr>)}</tbody></table></div></div>);
      continue;
    }
    const bullet = trimmed.match(/^[-*+•]\s+(.+)$/);
    const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    const quote = trimmed.match(/^>\s?(.+)$/);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered), items = [];
      while (index < lines.length) {
        const candidate = lines[index].trim();
        const match = ordered ? candidate.match(/^\d+[.)]\s+(.+)$/) : candidate.match(/^[-*+•]\s+(.+)$/);
        if (!match) break;
        items.push(match[1]); index += 1;
      }
      index -= 1;
      const ListTag = ordered ? "ol" : "ul";
      nodes.push(<ListTag key={"list-" + index}>{items.map((item, itemIndex) => <li key={itemIndex}>{renderInlineMarkdown(item, "li-" + index + "-" + itemIndex)}</li>)}</ListTag>);
      continue;
    }
    if (quote) { flushParagraph(); nodes.push(<blockquote key={"q-" + index}>{renderInlineMarkdown(quote[1], "q-" + index)}</blockquote>); continue; }
    if (/^---+$|^\*\*\*+$|^___+$/.test(trimmed)) { flushParagraph(); nodes.push(<hr key={"hr-" + index}/>); continue; }
    paragraph.push(trimmed);
  }
  flushParagraph();
  return <div className="jd-markdown">{nodes}</div>;
}

function friendlyActivityLabel(name) {
  const labels = {
    get_workspace_overview: "Checking your organisation",
    get_organisation_departments: "Checking your departments",
    get_business_memory: "Checking what JD remembers",
    remember_business_fact: "Remembering a business decision",
    preview_organisation_blueprint: "Designing your business structure",
    submit_organisation_blueprint_for_review: "Sending the business plan for your approval",
    submit_workspace_settings_for_review: "Sending settings changes for your review",
    get_approved_business_context: "Reading approved business context and retained evidence",
    get_ai_workforce_catalogue: "Inspecting draft AI employee definitions",
    preview_business_workspace: "Preparing an industry-specific workspace blueprint",
    preview_saas_agent_team: "Designing a proposed software agent team",
    preview_hiring_vacancy: "Preparing a hiring plan",
    get_people_intelligence: "Reviewing team information",
    get_operations_intelligence: "Reviewing daily operations",
    get_hiring_pipeline: "Checking recruitment progress",
    create_operational_setup_tasks: "Saving your business launch checklist",
    get_billing_snapshot: "Checking billing records",
    get_business_expense_anomalies: "Reviewing recorded business costs",
    get_recent_activity_logs: "Checking recent workspace activity",
    create_business_document_draft: "Preparing your document"
  };
  return labels[String(name || "")] || "Working on your request";
}

export function ChatHome({ user, organizationName = "Your organisation", organizationId = user?.school_id }) {
  const [draft, setDraft] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 760);
  const [showReview, setShowReview] = useState(false);
  const [showUsage, setShowUsage] = useState(false);
  const [showRuns, setShowRuns] = useState(false);
  const [showDepartments, setShowDepartments] = useState(false);
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [activeSends, setActiveSends] = useState(0);
  const [queuePaused, setQueuePaused] = useState(false);
  const conversationIdRef = useRef(null);
  const conversationCreationRef = useRef(null);
  const sending = activeSends > 0;
  const [error, setError] = useState("");
  const taskKey = savedTaskKey(messages);
  const taskScope = JSON.stringify([organizationId,user?._authUserId||user?.id,user?.role,conversationId]);
  const taskRecords = useOperationalTaskRecords({client:supabase,role:user?.role,scopeKey:taskScope,taskKey});
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  }, []);
  const firstName = (user?.name || "").trim().split(/\s+/)[0];
  const activeJobCount = messages.filter((item) => item.role === "assistant" && item.jobId && ["queued", "running", "retry_wait", "planning"].includes(item.jobStatus || item.run?.status)).length;
  const backgroundWorking = activeJobCount > 0;
  const isWorking = sending || backgroundWorking;
  const visibleRequestCount = activeSends + activeJobCount;

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
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role !== "assistant" && messages.length > 0) return;
    let active = true;
    const checkApprovals = async () => {
      const { data } = await supabase.functions.invoke("jd-automation", { body: { action: "approvals.list" } });
      if (active && (data?.approvals || []).some((item) => item.status === "pending")) setShowReview(true);
    };
    void checkApprovals();
    return () => { active = false; };
  }, [backgroundWorking, messages.length]);

  const loadConversation = async (id) => {
    if (!id || sending) return;
    setError("");
    const { data, error: loadError } = await supabase.functions.invoke("jd-automation", { body: { action: "history", conversationId: id } });
    if (loadError || !data) {
      setError("JD couldn't open that conversation. Please try again.");
      return;
    }
    setConversationId(id);
    conversationIdRef.current = id;
    setMessages((data.messages || []).map((item) => ({
      role: item.role, content: item.content || "",
      visualWorkspace: item.content_json?.visual_workspace || item.content_json?.ui || null,
      toolEvents: item.content_json?.toolEvents || [],
      run: item.content_json?.run || (item.content_json?.run_id ? { id: item.content_json.run_id, status: item.content_json?.status } : null),
      jobId: item.content_json?.job_id || null,
      jobStatus: item.content_json?.job_status || item.content_json?.status || null,
      job: item.content_json?.job || null
    })).filter((item) => item.role === "user" || item.role === "assistant"));
    setSidebarOpen(false);
    setShowReview(false);
  };

  // Poll durable jobs with bounded backoff. Job execution is server-side and
  // continues independently of this view; this loop only refreshes the UI.
  const pendingJobKey = messages
    .filter((item) => item.role === "assistant" && item.jobId && item.run?.id && ["queued", "running", "retry_wait", "planning"].includes(item.jobStatus || item.run?.status))
    .map((item) => item.jobId)
    .filter(Boolean)
    .join(",");

  useEffect(() => {
    if (!pendingJobKey) return undefined;
    const jobIds = [...new Set(pendingJobKey.split(",").filter(Boolean))];
    let stopped = false;
    let timer = null;
    let inFlight = false;
    let delay = 2500;
    const poll = async () => {
      if (stopped || inFlight) return;
      if (document.visibilityState === "hidden") {
        timer = setTimeout(poll, 8000);
        return;
      }
      inFlight = true;
      let hadError = false;
      try {
        const results = await Promise.all(jobIds.map(async (jobId) => {
          const { data, error: pollError } = await supabase.functions.invoke("jd-automation", {
            body: { action: "execution.job.status", jobId },
          });
          if (pollError || !data?.run) { hadError = true; return null; }
          return { jobId, ...data };
        }));
        if (stopped) return;
        const updates = results.filter(Boolean);
        if (!updates.length) hadError = true;
        setMessages((currentMessages) => currentMessages.map((message) => {
          const update = updates.find((item) => item.jobId === message.jobId);
          if (!update) return message;
          const status = update.job?.status || update.run.status || message.jobStatus || message.run?.status;
          const terminal = ["completed", "partially_completed", "failed", "cancelled"].includes(status);
          const finalMessage = update.assistantMessage;
          const fallback = status === "failed"
            ? "JD couldn't complete this request. Open Automation runs for the error details."
            : status === "cancelled" ? "This request was cancelled." : message.content;
          return {
            ...message,
            content: finalMessage?.content || (terminal ? fallback : message.content),
            streaming: finalMessage?.content_json?.streaming === true,
            toolEvents: update.steps?.length ? update.steps.map((step) => ({ name: step.tool_key, status: step.status, risk: step.risk_level, error: step.error_message })) : (finalMessage?.content_json?.toolEvents || message.toolEvents || []),
            visualWorkspace: finalMessage?.content_json?.visual_workspace || finalMessage?.content_json?.ui || (update.steps?.length ? { version: 1, blocks: [{ type: "timeline", title: "Recorded execution activity", events: update.steps.slice(0, 30).map((step) => ({ title: friendlyActivityLabel(step.tool_key), status: step.status, detail: step.error_message ? "Needs administrator review" : "" })) }] } : message.visualWorkspace || null),
            run: { ...message.run, ...update.run, status },
            jobStatus: update.job.status,
            job: update.job,
          };
        }));
        delay = hadError ? Math.min(15000, Math.round(delay * 1.8)) : 2500;
      } finally {
        inFlight = false;
        if (!stopped) timer = setTimeout(poll, delay);
      }
    };
    void poll();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [pendingJobKey]);

  const send = async (override, targetConversationId = null) => {
    const message = (override ?? draft).trim();
    if (!message || queuePaused) return;
    setDraft("");
    setError("");
    setMessages((current) => [...current, { role: "user", content: message }]);
    setActiveSends((count) => count + 1);
    try {
      let requestConversationId = targetConversationId || conversationIdRef.current || conversationId;
      if (!requestConversationId && conversationCreationRef.current) {
        await conversationCreationRef.current;
        requestConversationId = conversationIdRef.current;
      }
      if (!requestConversationId && !targetConversationId) {
        let unlock;
        conversationCreationRef.current = new Promise((resolve) => { unlock = resolve; });
        conversationCreationRef.current.unlock = unlock;
      }
      const { data, error: invokeError } = await supabase.functions.invoke("jd-automation", {
        body: { action: "submit", message, conversationId: requestConversationId || conversationIdRef.current || conversationId },
      });
      if (invokeError) throw invokeError;
      if (!data) throw new Error("JD returned an empty response.");
      if (data.conversationId) { conversationIdRef.current = data.conversationId; setConversationId(data.conversationId); }
      if (conversationCreationRef.current?.unlock) { conversationCreationRef.current.unlock(); conversationCreationRef.current = null; }
      const { data: historyData } = await supabase.functions.invoke("jd-automation", { body: { action: "history.list" } });
      if (historyData?.conversations) setConversations(historyData.conversations);
      const queued = data.queued === true && Boolean(data.job?.id);
      setMessages((current) => [...current, { role: "assistant", content: queued ? "" : data.reply || data.message || "The request was recorded.", run: data.run, jobId: data.job?.id || null, jobStatus: data.job?.status || (queued ? "queued" : null), job: data.job || null, toolEvents: data.toolEvents || [], visualWorkspace: data.visual_workspace || data.ui || data.assistantMessage?.content_json?.visual_workspace || null }]);
    } catch (err) {
      const status = err?.context?.status || err?.status;
      setError(status === 404 ? "JD is temporarily unavailable. Please try again later." : status === 401 ? "Your session has expired. Sign in again, then retry." : status === 403 ? "Your account does not have permission to do that." : status === 503 ? "JD is not fully set up yet. Please contact your workspace administrator." : "JD could not complete that request. Please try again in a moment.");
      setMessages((current) => current.filter((item) => !(item.role === "user" && item.content === message)));
      setDraft(message);
    } finally {
      if (conversationCreationRef.current?.unlock) { conversationCreationRef.current.unlock(); conversationCreationRef.current = null; }
      setActiveSends((count) => Math.max(0, count - 1));
    }
  };


  const newConversation = () => {
    if (sending) return;
    setConversationId(null); conversationIdRef.current = null; conversationCreationRef.current = null; setMessages([]); setDraft(""); setError(""); setSidebarOpen(false);
  };

  return (
    <div className={`jd-command reference-command${messages.length===0 ? " is-empty" : ""}`}>
      <style>{`
        .jd-command{position:relative;height:calc(100dvh - 57px);min-height:0;display:flex;background:#f7f8fa;color:#17191c;font-family:"JD Inter",Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}
        .jd-command *{box-sizing:border-box}
        .jd-history-scrim{display:none}\n        .jd-tool-overlay{position:absolute;z-index:12;inset:0;overflow:auto;background:rgba(20,24,30,.22);backdrop-filter:blur(3px);padding:14px}\n        .jd-tool-overlay>*{min-height:100%;max-width:100%;border-radius:16px;box-shadow:0 18px 60px rgba(20,24,30,.18)}\n        @media(max-width:760px){.jd-tool-overlay{padding:0}.jd-tool-overlay>*{border-radius:0}}\n        .jd-utility{position:relative;flex:0 0 auto;min-width:0;padding:9px 12px;display:flex;align-items:center;justify-content:space-between;gap:12px;background:#f7f8fa;border-bottom:1px solid #e8eaee}\n        .jd-utility button,.jd-utility-status{pointer-events:auto}\n        .jd-history-trigger{width:36px;height:36px;border:1px solid #e1e4e8;background:rgba(255,255,255,.94);border-radius:10px;color:#34353b;display:grid;place-items:center;cursor:pointer}\n        .jd-utility-status{font-size:10px;color:#34353b;background:rgba(255,255,255,.96);border:1px solid #e5e7eb;border-radius:20px;padding:7px 11px;box-shadow:0 2px 8px rgba(20,24,30,.04);display:inline-flex;align-items:center;gap:7px}
        .jd-utility-status.is-working{color:#34353b;border-color:#dfe3e8}
        .jd-utility-status.is-working:before{content:"";width:7px;height:7px;border-radius:50%;background:#60616b;animation:jd-pulse 1.25s ease-in-out infinite}
        @keyframes jd-pulse{0%,100%{opacity:.45;transform:scale(.85)}50%{opacity:1;transform:scale(1.12)}}\n        .jd-rail{width:258px;flex:0 0 258px;background:#f0f1f3;border-right:1px solid #e2e4e8;padding:18px 13px;display:flex;flex-direction:column;gap:16px}
        .jd-brand{display:flex;align-items:center;gap:10px;padding:4px 7px 12px;font-size:14px;font-weight:700;letter-spacing:-.3px}
        .jd-brand-mark{width:32px;height:32px;border-radius:11px;background:#15171a;color:#fff;display:grid;place-items:center;font-size:12px;font-weight:800}
        .jd-new{width:100%;display:flex;align-items:center;justify-content:center;gap:9px;border:1px solid #d9dce1;background:#fff;border-radius:11px;padding:11px 12px;color:#202328;font-size:12px;font-weight:650;cursor:pointer}
        .jd-rail-label{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#60616b;font-weight:800;padding:0 9px;margin:4px 0}
        .jd-nav{display:grid;grid-template-columns:1fr 1fr;gap:5px}
        .jd-nav button{min-width:0;border:1px solid transparent;background:transparent;border-radius:9px;padding:10px 8px;display:flex;align-items:center;gap:8px;text-align:left;color:#34353b;font-size:11px;cursor:pointer}
        .jd-nav button:hover{background:#fff;border-color:#e1e3e7;color:#202328}
        .jd-nav svg{flex:0 0 auto}
        .jd-history-list{min-height:0;flex:1;overflow:auto;border-top:1px solid #e0e2e6;padding-top:9px}
        .jd-history-empty{padding:8px 9px;color:#60616b;font-size:10px;line-height:1.5}
        .jd-history-item{width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px;border:1px solid transparent;border-radius:9px;background:transparent;color:#34353b;text-align:left;font-size:10px;cursor:pointer}
        .jd-history-item span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
        .jd-history-item small{flex:0 0 auto;color:#60616b;font-size:9px}
        .jd-history-item:hover,.jd-history-item.active{background:#fff;border-color:#e1e4e8;color:#202329}

        .jd-rail-foot{margin-top:auto;border-top:1px solid #dfe1e5;padding:13px 5px 0;display:flex;align-items:center;gap:9px;color:#34353b;font-size:11px}
        .jd-avatar{width:29px;height:29px;border-radius:9px;background:#22252a;color:#fff;display:grid;place-items:center;font-weight:700}
        .jd-main{min-width:0;min-height:0;flex:1;display:flex;flex-direction:column;position:relative}
        .jd-top{display:none}
        .jd-top-left{display:flex;align-items:center;gap:11px;min-width:0;flex:1}
        .jd-icon-btn{border:0;background:transparent;color:#60616b;padding:7px;border-radius:8px;cursor:pointer}
        .jd-top-title{font-size:12px;font-weight:700;color:#25282d;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.jd-top-sub{font-size:10px;color:#60616b;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .jd-status{display:flex;align-items:center;gap:7px;font-size:10px;color:#60616b;flex-shrink:0;white-space:nowrap}
        .jd-dot{width:7px;height:7px;border-radius:50%;background:#60616b}
        .jd-scroll{flex:1;min-width:0;min-height:0;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;align-items:center;padding:12px 20px}
        .jd-welcome{width:min(760px,100%);margin:auto 0;display:flex;flex-direction:column;align-items:center;padding:20px 0 28px}
        .jd-spark{width:42px;height:42px;border-radius:14px;background:#17191d;color:#fff;display:grid;place-items:center;margin-bottom:20px}
        .jd-heading{font-size:clamp(25px,3.3vw,34px);font-weight:620;letter-spacing:-1.4px;margin:0 0 8px;text-align:center}
        .jd-subtitle{font-size:13px;line-height:1.65;color:#60616b;text-align:center;margin:0 0 25px}
        .jd-actions{width:min(690px,100%);display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
        .jd-action{border:1px solid #e1e4e8;background:#fff;border-radius:12px;padding:13px 12px;display:flex;align-items:center;gap:10px;text-align:left;min-height:59px;cursor:pointer;color:#34353b}
        .jd-action:hover{border-color:#a3a4ad;box-shadow:0 3px 12px rgba(20,24,30,.045)}
        .jd-action-icon{width:29px;height:29px;border-radius:9px;background:#f1f2f4;display:grid;place-items:center;color:#34353b;flex:0 0 auto}
        .jd-action span:last-child{font-size:11px;font-weight:620}
        .jd-thread{width:min(760px,100%);min-width:0;flex:0 0 auto;display:flex;flex-direction:column;gap:22px;padding:12px 0 34px}
        .jd-message{font-size:13px;line-height:1.75;white-space:pre-wrap;overflow-wrap:anywhere}
        .jd-message.user{align-self:flex-end;max-width:85%;background:#e9ebef;border:1px solid #e2e4e8;border-radius:18px 18px 5px 18px;padding:11px 15px;color:#202329}
        .jd-message.assistant{min-width:0;max-width:100%;align-self:stretch;color:#292d33;padding:2px 2px}
        .jd-markdown{min-width:0;max-width:100%;white-space:normal;font-size:14px;line-height:1.75;color:#292d33;overflow-wrap:anywhere}
        .jd-markdown>*:first-child{margin-top:0}
        .jd-markdown>*:last-child{margin-bottom:0}
        .jd-markdown p{margin:0 0 12px}
        .jd-markdown h2,.jd-markdown h3,.jd-markdown h4{font-weight:720;letter-spacing:-.35px;line-height:1.35;color:#20242a;margin:18px 0 8px}
        .jd-markdown h2{font-size:18px}.jd-markdown h3{font-size:16px}.jd-markdown h4{font-size:14px}
        .jd-markdown ul,.jd-markdown ol{margin:7px 0 14px;padding-left:22px}
        .jd-markdown li{padding-left:3px;margin:4px 0}
        .jd-markdown strong{font-weight:750;color:#20242a}
        .jd-markdown a{color:#34353b;text-decoration:underline;text-underline-offset:2px;overflow-wrap:anywhere}
        .jd-markdown del{text-decoration:line-through;color:#60616b}
        .jd-markdown hr{border:0;border-top:1px solid #e5e8ec;margin:16px 0}
        .jd-code-block{max-width:100%;overflow:auto;background:#171a20;color:#edf0f4;border-radius:10px;padding:12px 14px;margin:10px 0 14px;font:11px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre}
        .jd-code-block code{font:inherit}
        .jd-table-block{min-width:0;max-width:100%;margin:12px 0 16px}.jd-table-hint{font-size:11px;line-height:1.5;color:#34353b}.jd-table-wrap:focus-visible{outline:2px solid #34353b;outline-offset:2px}.jd-table-wrap{width:100%;max-width:100%;overflow-x:auto;overscroll-behavior-x:contain;border:1px solid #e1e5ea;border-radius:10px;background:#fff}
        .jd-table{width:100%;border-collapse:separate;border-spacing:0;font-size:11px;line-height:1.5;min-width:420px}
        .jd-table th{background:#f1f3f6;color:#34353b;font-weight:750;text-align:left}
        .jd-table th,.jd-table td{min-width:130px;overflow-wrap:break-word;padding:9px 11px;border-bottom:1px solid #edf0f3;border-right:1px solid #edf0f3;vertical-align:top}
        .jd-table tr:last-child td{border-bottom:0}.jd-table th:last-child,.jd-table td:last-child{border-right:0}
        .jd-table td{color:#34353b}.jd-math-display{overflow-x:auto;text-align:center;margin:14px 0;padding:9px 4px}
        .jd-math-inline{white-space:normal}.jd-math-display .katex-display{margin:0}
        .jd-markdown blockquote{margin:10px 0;padding:8px 12px;border-left:3px solid #dedfe4;background:#f0f2f5;color:#34353b;border-radius:0 8px 8px 0}
        .jd-inline-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em;background:#eef0f3;border:1px solid #e2e5e9;border-radius:5px;padding:1px 5px}
        .jd-message-head{display:flex;align-items:center;gap:8px;margin-bottom:7px;font-size:10px;color:#60616b;font-weight:650}
        .jd-job-state{display:inline-flex;align-items:center;border:1px solid #e1e4e8;background:#f7f8fa;border-radius:999px;padding:2px 7px;font-size:9px;font-weight:700;color:#60616b}
        .jd-job-state.queued{color:#34353b;background:#f1f2f5;border-color:#dedfe4}
        .jd-job-state.running,.jd-job-state.planning{color:#34353b;background:#f0f8f4;border-color:#dedfe4}
        .jd-job-state.retry_wait{color:#34353b;background:#f1f2f5;border-color:#dedfe4}
        .jd-job-state.completed{color:#34353b;background:#f0f8f4;border-color:#dedfe4}
        .jd-job-state.partially_completed{color:#34353b;background:#f1f2f5;border-color:#dedfe4}
        .jd-job-state.failed{color:#34353b;background:#fff3f3;border-color:#dedfe4}
        .jd-job-state.cancelled{color:#60616b;background:#f4f5f6;border-color:#e2e4e7}
        .jd-mini-mark{width:20px;height:20px;border-radius:7px;background:#191b1f;color:white;display:grid;place-items:center;font-size:8px}
        .jd-tools{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
        .jd-tool{border:1px solid #e3e5e9;background:#fafbfc;border-radius:7px;padding:5px 8px;color:#60616b;font-size:9px}
        .jd-run{font-size:10px;color:#60616b;margin-top:8px}
        .jd-activity{display:flex;flex-direction:column;gap:7px;margin:2px 0 3px;padding:10px 12px;border:1px solid #e8eaee;border-radius:12px;background:rgba(255,255,255,.72);max-width:100%}
        .jd-activity-title{display:flex;align-items:center;gap:8px;color:#34353b;font-size:11px;font-weight:650}
        .jd-activity-dot{width:7px;height:7px;border-radius:50%;background:#60616b;animation:jd-pulse 1.25s ease-in-out infinite;flex:0 0 auto}
        .jd-activity-detail{font-size:10px;color:#60616b;line-height:1.5;padding-left:15px}
        .jd-activity-steps{display:grid;gap:5px;padding-left:15px}
        .jd-activity-step{display:flex;align-items:center;gap:7px;font-size:10px;color:#60616b}
        .jd-activity-step.done{color:#60616b}
        .jd-compose-wrap{flex:0 0 auto;width:min(780px,calc(100% - 40px));margin:0 auto calc(14px + env(safe-area-inset-bottom,0px))}
        .jd-compose{border:1px solid #dfe2e7;background:#fff;border-radius:18px;padding:12px 13px 10px;box-shadow:0 8px 30px rgba(22,26,32,.055)}
        .jd-compose textarea{width:100%;min-height:48px;max-height:180px;resize:vertical;border:0;outline:0;background:transparent;color:#202329;font:inherit;font-size:13px;line-height:1.65}
        .jd-queue-note{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 4px 2px;font-size:10px;color:#60616b}
        .jd-queue-note strong{color:#34353b;font-weight:650}
        .jd-pause{border:1px solid #e0e3e8;background:#f5f6f8;color:#34353b;border-radius:9px;padding:7px 10px;font-size:10px;font-weight:650;cursor:pointer}
        .jd-pause:disabled{opacity:.4;cursor:not-allowed}
        .jd-compose-bottom{display:flex;align-items:center;justify-content:space-between}
        .jd-compose-hint{font-size:9px;color:#60616b}
        .jd-send{width:34px;height:34px;border:0;border-radius:11px;background:#17191d;color:white;display:grid;place-items:center;cursor:pointer}
        .jd-send:disabled{opacity:.35;cursor:not-allowed}
        .jd-error{color:#34353b;font-size:11px;margin:0 0 7px 5px}
        .jd-disclaimer{text-align:center;font-size:9px;color:#60616b;margin-top:9px}
        @media(max-width:760px){
          .jd-command{height:calc(100dvh - 57px);min-height:0}
          .jd-rail{position:absolute;z-index:8;inset:0 auto 0 0;width:min(300px,86vw);max-width:86vw;box-shadow:16px 0 40px rgba(20,24,30,.16);overflow:auto}
          .jd-history-scrim{display:block;position:absolute;z-index:7;inset:0;background:rgba(18,22,28,.28);border:0;padding:0}
          .jd-scroll{padding:12px 14px 8px}
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
        <button className="jd-new" type="button" onClick={()=>{newConversation();setShowDepartments(false);setShowRuns(false);setShowUsage(false);setShowReview(false);}}><Plus size={15}/> New conversation</button>
        <button className="jd-new" type="button" onClick={()=>{setShowReview(false);setShowUsage(false);setShowDepartments(false);setShowRuns(false);}}><Plus size={15}/> Chat</button>
        <button className="jd-new" type="button" onClick={()=>{setShowReview(true);setShowUsage(false);setShowDepartments(false);setShowRuns(false);}}><ShieldCheck size={15}/> Review Centre</button>
        <button className="jd-new" type="button" onClick={()=>{setShowDepartments(true);setShowUsage(false);setShowRuns(false);setShowReview(false);}}><Building2 size={15}/> Departments</button>
        <button className="jd-new" type="button" onClick={()=>{setShowUsage(true);setShowReview(false);setShowRuns(false);setShowDepartments(false);}}><Activity size={15}/> AI usage</button>
        <button className="jd-new" type="button" onClick={()=>{setShowRuns(true);setShowUsage(false);setShowReview(false);setShowDepartments(false);}}><Activity size={15}/> Automation runs</button>
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
      <section className="jd-main">
        <header className="jd-top">
          <div className="jd-top-left">
            <button className="jd-icon-btn" type="button" aria-label="Toggle sidebar" onClick={()=>setSidebarOpen(v=>!v)}>{sidebarOpen?<PanelLeftClose size={17}/>:<Menu size={18}/>}</button>
            <div><div className="jd-top-title">JD Assistant</div><div className="jd-top-sub">{organizationName} · Command centre</div></div>
          </div>
          <div className="jd-status"><span className="jd-dot"/>{sending?"Working through your request":"Workspace connected"}</div>
        </header>
        <div className="jd-utility">{messages.length>0 && <button className="jd-history-trigger" type="button" aria-label="Open chat history and JD tools" onClick={()=>setSidebarOpen(true)}><Menu size={18}/></button>}<button type="button" className={"jd-utility-status" + (sending || backgroundWorking ? " is-working" : "")} aria-label={messages.length===0 ? "Open chat history and JD tools" : "Workspace status and chat tools"} title="Open chat history and JD tools" onClick={()=>setSidebarOpen(true)}>{isWorking ? `JD is cooking · ${activeJobCount} active` : "Workspace Active"}</button></div><div className="jd-scroll">
          {messages.length===0 ? <div className="jd-welcome">
            <div className="jd-spark"><img src="/design/jd-tile.png" alt="James-Denning" width="108" height="108"/></div>
            <h1 className="jd-heading"><span className="jd-script">{greeting}{firstName ? "," : ""}</span>{firstName ? ` ${firstName}` : ""}.</h1>
            <div className="jd-welcome-divider" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C14 8 16 10 24 12C16 14 14 16 12 24C10 16 8 14 0 12C8 10 10 8 12 0Z"/></svg></div>
            <p className="jd-subtitle">Your organisation, one conversation.</p>
            <p className="jd-welcome-description">Ask James-Denning to inspect records, prepare work and manage workflows.</p>
          </div> : <div className="jd-thread">
            {messages.map((item,index)=><div className={`jd-message ${item.role}`} key={index}>
              {item.role==="assistant"&&<div className="jd-message-head"><span className="jd-mini-mark">JD</span> JD {item.jobId&&<span className={"jd-job-state "+String(item.jobStatus||item.run?.status||"queued")}>{({queued:"Queued",planning:"Preparing",running:"Running",retry_wait:"Retrying",completed:"Completed",partially_completed:"Completed with notes",failed:"Failed",cancelled:"Cancelled"})[item.jobStatus||item.run?.status]||"Queued"}</span>}</div>}
              {item.content ? renderMessageContent(item.content) : null}
              {item.role === "assistant" && item.visualWorkspace?.source === "persisted_workspace_records" && Array.isArray(item.visualWorkspace?.blocks) && item.visualWorkspace.blocks.some(block=>block?.type==="checklist") && <div style={{marginTop:12,fontSize:12}}>
                <button type="button" onClick={taskRecords.refresh} disabled={taskRecords.state.phase==="loading"||taskRecords.state.pending.length>0}
                  style={{padding:"8px 12px",border:"1px solid #dfe3e8",borderRadius:8,background:"#fff",color:"#34353b",fontSize:11,cursor:"pointer"}}>{taskRecords.state.phase==="loading"?"Refreshing task records…":"Refresh task records"}</button>
                {taskRecords.state.error&&<p role="alert">{taskRecords.state.error}</p>}
                <p style={{fontSize:11,color:"#60616b",lineHeight:1.6}}>Refresh reads task records only; it never retries a write. Department summaries and execution evidence remain conversation snapshots.</p>
              </div>}
              {item.role === "assistant" && item.visualWorkspace && <JDVisualWorkspace key={taskScope+":"+index} ui={item.visualWorkspace} onAnswer={(answer) => send("For the decision above, I choose: " + answer + ". Continue using this choice.")} onTaskToggle={taskRecords.transition} taskRecords={taskRecords.state} taskRole={user?.role}/>}
              {item.role === "assistant" && !item.content && ["queued", "planning", "running", "retry_wait"].includes(item.run?.status) && (
                <div className="jd-activity" role="status" aria-live="polite">
                  <div className="jd-activity-title"><span className="jd-activity-dot"/>{item.run?.status === "queued" ? "Getting things ready" : item.run?.status === "retry_wait" ? "Picking up where I left off" : item.toolEvents?.length ? "Working through the details" : "Thinking through your request"}</div>
                  {item.toolEvents?.length ? <div className="jd-activity-steps">{item.toolEvents.slice(-4).map((event,i) => {
                    const label = friendlyActivityLabel(event.name);
                    const done = event.status === "completed";
                    return <div className={"jd-activity-step" + (done ? " done" : "")} key={String(event.name)+"-"+i}><span>{done ? "✓" : "·"}</span>{label}</div>;
                  })}</div> : <div className="jd-activity-detail">JD is organising the work and checking what it needs.</div>}
                </div>
              )}
              {item.streaming&&<div className="jd-run">JD is writing its response…</div>}

            </div>)}
            {isWorking&&<div className="jd-message assistant"><div className="jd-activity" role="status" aria-live="polite"><div className="jd-activity-title"><span className="jd-activity-dot"/>JD is cooking…</div><div className="jd-activity-detail">Getting the request ready.</div></div></div>}
          </div>}
        </div>
        <div className="jd-compose-wrap">
          {error&&<div className="jd-error">{error}</div>}
          <div className="jd-compose">
            <textarea aria-label="Message JD" value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}} placeholder={isWorking ? "Send another request while JD works…" : "Ask James-Denning to do something..."} rows={2}/>
            <div className="jd-compose-bottom"><span className="jd-compose-hint">Enter to send · Shift + Enter for a new line</span><div style={{display:"flex",alignItems:"center",gap:7}}>{isWorking && draft.trim() && <button className="jd-pause" type="button" disabled={queuePaused} onClick={()=>send()}>Send alongside</button>}<button className="jd-send" type="button" disabled={isWorking ? false : (!draft.trim() || queuePaused)} onClick={()=>isWorking ? setQueuePaused(value=>!value) : send()} aria-label={isWorking ? (queuePaused ? "Resume new requests" : "Pause new requests") : "Send message"}>{isWorking ? (queuePaused ? <Play size={15}/> : <Pause size={15}/>) : <Send size={17}/>}</button></div></div>
          </div>
            <div className="jd-queue-note"><span><strong>{activeSends}</strong> request{activeSends===1?"":"s"} being submitted · {queuePaused ? "New requests paused" : "Multiple requests supported"}</span></div>
          <div className="jd-disclaimer">{queuePaused ? "New requests are paused. Already submitted jobs continue in the background." : "Free model routing · Submitted jobs continue in the background, even if you close this tab."}</div>
        </div>
      </section>
      {showRuns && <div className="jd-tool-overlay" role="dialog" aria-modal="true" aria-label="Automation runs"><RunMonitor onClose={()=>setShowRuns(false)}/></div>}
      {showUsage && <div className="jd-tool-overlay" role="dialog" aria-modal="true" aria-label="AI usage"><AgentUsage onClose={()=>setShowUsage(false)}/></div>}
      {showDepartments && <div className="jd-tool-overlay" role="dialog" aria-modal="true" aria-label="Departments"><JDDepartments onClose={()=>setShowDepartments(false)}/></div>}
      {showReview && <ReviewCentre onClose={()=>setShowReview(false)} onDecision={(decision,item,data,note)=>{
        if(item.action_key==="settings.apply"&&decision==="approve")return; // Keep the reviewed diff and explicit Apply action visible.
        setShowReview(false);
        const targetConversationId=data?.conversationId||conversationId;
        if(targetConversationId){
          setConversationId(targetConversationId);
          const feedback=note?.trim()? " My feedback: "+note.trim() : "";
          const followup=decision==="approve"
            ? data?.execution?.status==="completed"
              ? "I accepted the proposed business departments and JD completed the approved setup. Please check what now exists and explain the result in plain English."
              : "I accepted this request, but the system has not confirmed that the change was completed. Check what is available and tell me honestly what happened. Do not claim anything changed without confirmation."
            : "I rejected the proposed change."+feedback+" Please respond to my feedback, revise the proposal if appropriate, and send the revised version for review.";
          void send(followup,targetConversationId);
        }
      }}/>}
    </div>
  );
}
