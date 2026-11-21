import {newRequestId} from "./conversation-state.mjs";
import { StructuredResponse } from "./StructuredResponse.jsx";
import { validateResponse, contextualWorkspace, streamText, answerText, decodeResponse } from "../../supabase/functions/_shared/jd-response.mjs";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import jsonLanguage from "highlight.js/lib/languages/json";
import sql from "highlight.js/lib/languages/sql";
import bash from "highlight.js/lib/languages/bash";
import xml from "highlight.js/lib/languages/xml";
import cssLanguage from "highlight.js/lib/languages/css";
for (const [name,language] of Object.entries({javascript,typescript,python,json:jsonLanguage,sql,bash,html:xml,css:cssLanguage})) hljs.registerLanguage(name,language);
import {ComposerTools} from "./ComposerTools.jsx";
import {ConnectorDirectory} from "../connectors/ConnectorDirectory.jsx";
import {ConversationHistory} from "./ConversationHistory.jsx";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, ArrowUp, Pause, Play, Plus, Sparkles, BarChart3, Users, ClipboardList, FileText, Menu, History, LoaderCircle, PanelLeftClose, Activity, Mail, CalendarDays, Wallet, ShieldCheck, Search, Paperclip, ChevronDown, Command, Building2 } from "lucide-react";
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

let katexAssets;
function loadKatexAssets() {
  if(!katexAssets)katexAssets=Promise.all([import("katex"),import("katex/dist/katex.min.css")]).then(([module])=>module.default).catch(error=>{katexAssets=null;throw error;});
  return katexAssets;
}
function MathBlock({value,display=false}) {
  const [renderer,setRenderer]=useState(null);
  useEffect(()=>{let active=true;loadKatexAssets().then(value=>{if(active)setRenderer(()=>value);}).catch(()=>{});return()=>{active=false;};},[]);
  const html=renderer?.renderToString(String(value||""),{throwOnError:false,strict:"ignore",trust:false,displayMode:display,maxExpand:200,maxSize:20});
  const Tag=display?"div":"span";
  return <Tag className={display?"jd-math-display":"jd-math-inline"} aria-label={"Mathematical expression: "+value}>{html?<span dangerouslySetInnerHTML={{__html:html}}/>:<code>{value}</code>}</Tag>;
}
function CodeBlock({code,language}) {
  const aliases={js:"javascript",ts:"typescript",py:"python",sh:"bash",jsx:"javascript",tsx:"typescript"};
  const lang=aliases[language]||language;
  const html=lang&&hljs.getLanguage(lang)?hljs.highlight(code,{language:lang,ignoreIllegals:true}).value:null;
  return <pre className="jd-code-block" tabIndex={0} aria-label={(language||"Plain text")+" code"}><code data-language={language||undefined}>{html?<span dangerouslySetInnerHTML={{__html:html}}/>:code}</code></pre>;
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
      nodes.push(<CodeBlock key={"code-"+index} language={fence[2]} code={codeLines.join("\n")}/>);
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

export function ChatHome({navigationRequest, user, organizationName = "Your organisation", organizationId = user?.school_id }) {
  const [draft, setDraft] = useState("");
  const [responseStyle, setResponseStyle] = useState("balanced");
  const responseStyles = { concise: "Respond concisely: lead with the answer, keep only essential context, and use short lists when helpful.", balanced: "Use a balanced response: answer directly, explain important context, and give practical next steps when useful.", detailed: "Give a detailed response: explain the reasoning, assumptions, trade-offs, and actionable next steps without unnecessary repetition." };
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [showUsage, setShowUsage] = useState(false);
  const [showRuns, setShowRuns] = useState(false);
  const [showDepartments, setShowDepartments] = useState(false);
  const [showConnectors,setShowConnectors] = useState(false);
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError,setHistoryError] = useState("");
  const [openingId,setOpeningId] = useState(null);
  const [historyCursor,setHistoryCursor]=useState(null);
  const [earlierLoading,setEarlierLoading]=useState(false);
  const historySequence = useRef(0), conversationSequence = useRef(0), historyAlive = useRef(false);
  const [conversationId, setConversationId] = useState(null);
  const [activeSends, setActiveSends] = useState(0);
  const [queuePaused, setQueuePaused] = useState(false);
  const conversationIdRef = useRef(null);
  const conversationCreationRef = useRef(null);
  const sending = activeSends > 0;
  const submissions=useRef(new Set());
  const resumeKey=JSON.stringify([organizationId,user?._authUserId||user?.id]);
  const pendingKey=(message,id)=>"jd:request:"+resumeKey+":"+(id||"new")+":"+message;
  const rememberConversation=id=>{try{if(id)sessionStorage.setItem("jd:active:"+resumeKey,id);else sessionStorage.removeItem("jd:active:"+resumeKey);}catch{}};
  const [error, setError] = useState("");
  const taskKey = savedTaskKey(messages);
  const taskScope = JSON.stringify([organizationId,user?._authUserId||user?.id,user?.role,conversationId]);
  const taskRecords = useOperationalTaskRecords({client:supabase,role:user?.role,scopeKey:taskScope,taskKey});
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  }, []);
  const firstName = (user?.name || "").trim().split(/\s+/)[0];
  const activeJobCount = messages.filter((item) => item.role === "assistant" && !item.pollUnavailable && item.jobId && ["queued", "running", "retry_wait", "planning"].includes(item.jobStatus || item.run?.status)).length;
  const backgroundWorking = activeJobCount > 0;
  const isWorking = sending || backgroundWorking;
  const visibleRequestCount = activeSends + activeJobCount;
  const waitingForAnswer=item=>!item.streaming&&validateResponse(item.response)?.blocks.some(b=>["choice","form"].includes(b.type)&&!messages.some(m=>m.role==="user"&&m.interaction?.messageId===item.id&&m.interaction?.blockId===b.id));

  const loadHistory = useCallback(async () => {
    const version=++historySequence.current;
    setHistoryLoading(true);setHistoryError("");
    try {
      const {data,error}=await supabase.functions.invoke("jd-automation",{body:{action:"history.list"}});
      if(error||data?.error||!Array.isArray(data?.conversations))throw Error("history unavailable");
      if(historyAlive.current&&historySequence.current===version)setConversations(data.conversations.filter(chat=>chat&&typeof chat.id==="string"));
    } catch {
      if(historyAlive.current&&historySequence.current===version){setConversations([]);setHistoryError("Conversation history could not be loaded. Please refresh to try again.");}
    } finally {if(historyAlive.current&&historySequence.current===version)setHistoryLoading(false);}
  },[]);
  useEffect(()=>{historyAlive.current=true;void loadHistory();return()=>{historyAlive.current=false;historySequence.current++;conversationSequence.current++;};},[loadHistory]);

  const loadConversation = async (id, before = null) => {
    if (!id || sending) return;
    setError("");
    const version=before?conversationSequence.current:++conversationSequence.current;
    if(before)setEarlierLoading(true);
    else setOpeningId(id);setHistoryError("");
    let data;
    try {
      const result=await supabase.functions.invoke("jd-automation",{body:{action:"history",conversationId:id,...(before?{before}:{})}});
      if(result.error||result.data?.error||!Array.isArray(result.data?.messages))throw Error("conversation unavailable");
      data=result.data;
    } catch {
      if(historyAlive.current&&conversationSequence.current===version){setHistoryError("This conversation could not be opened. Please try again.");setOpeningId(null);setEarlierLoading(false);if(before)setError("Earlier messages could not be loaded. Please try again.");}
      return;
    }
    if(!historyAlive.current||conversationSequence.current!==version)return;
    setOpeningId(null);setEarlierLoading(false);setHistoryCursor(data.nextCursor||null);
    if(!before)setDraft("");
    setConversationId(id);rememberConversation(id);
    conversationIdRef.current = id;
    const loadedMessages=(data.messages || []).map((item) => ({
      id:item.id, role: item.role, content: item.content || "",
      response:validateResponse(item.content_json?.response),
      interaction:item.content_json?.interaction||null,
      streaming:item.content_json?.streaming===true && !["completed","partially_completed","failed","cancelled"].includes(item.content_json?.job_status||item.content_json?.status),
      visualWorkspace: contextualWorkspace(item.content_json?.visual_workspace || item.content_json?.ui),
      toolEvents: item.content_json?.toolEvents || [],
      run: item.content_json?.run || (item.content_json?.run_id ? { id: item.content_json.run_id, status: item.content_json?.status } : null),
      jobId: item.content_json?.job_id || null,
      jobStatus: item.content_json?.job_status || item.content_json?.status || null,
      job: item.content_json?.job || null
    })).filter((item) => item.role === "user" || item.role === "assistant");
    setMessages(current=>before?[...loadedMessages.filter(m=>!current.some(existing=>existing.id===m.id)),...current]:loadedMessages);
    setHistoryOpen(false);
    setShowReview(false);
  };

  useEffect(()=>{let id;try{id=sessionStorage.getItem("jd:active:"+resumeKey);}catch{}if(id)void loadConversation(id);},[resumeKey]);

  // Poll durable jobs with bounded backoff. Job execution is server-side and
  // continues independently of this view; this loop only refreshes the UI.
  const pendingJobKey = messages
    .filter((item) => item.role === "assistant" && !item.pollUnavailable && item.jobId && item.run?.id && ["queued", "running", "retry_wait", "planning"].includes(item.jobStatus || item.run?.status))
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
    let failures = 0;
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
            streaming: !terminal && finalMessage?.content_json?.streaming === true,
            toolEvents: update.steps?.length ? update.steps.map((step) => ({ name: step.tool_key, status: step.status, risk: step.risk_level, error: step.error_message })) : (finalMessage?.content_json?.toolEvents || message.toolEvents || []),
            id: finalMessage?.id || message.id,
            response: validateResponse(finalMessage?.content_json?.response),
            visualWorkspace: contextualWorkspace(finalMessage?.content_json?.visual_workspace || finalMessage?.content_json?.ui),
            run: { ...message.run, ...update.run, status },
            jobStatus: update.job?.status || status,
            job: update.job,
          };
        }));
        delay = hadError ? Math.min(15000, Math.round(delay * 1.8)) : 2500;
      } catch { hadError=true;delay = Math.min(15000, Math.round(delay * 1.8)); } finally {
        inFlight = false;
        failures=hadError?failures+1:0;
        if(!stopped&&failures>=5){setMessages(current=>current.map(m=>jobIds.includes(m.jobId)?{...m,pollUnavailable:true}:m));}
        else if (!stopped) timer = setTimeout(poll, delay);
      }
    };
    void poll();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [pendingJobKey]);

  const send = async (override, targetConversationId = null, interaction = null, requestId = null) => {
    const message = (override ?? draft).trim();
    if (!message || queuePaused) return false;
    const storageKey=pendingKey(message,targetConversationId||conversationIdRef.current);
    if(submissions.current.has(storageKey))return false;
    submissions.current.add(storageKey);
    let previous;try{previous=sessionStorage.getItem(storageKey);}catch{}
    const idempotencyKey=requestId || previous || newRequestId();
    try{sessionStorage.setItem(storageKey,idempotencyKey);}catch{}
    const version=conversationSequence.current;
    const visible=()=>historyAlive.current&&conversationSequence.current===version;
    setDraft("");
    setError("");
    setMessages((current) => current.some(m=>m.clientRequestId===idempotencyKey)?current:[...current, { id:"user-"+idempotencyKey,clientRequestId:idempotencyKey, role: "user", content: message },{id:"request-"+idempotencyKey,clientRequestId:idempotencyKey,role:"assistant",content:"",submitting:true}]);
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
        body: { action: "submit", message, responseStyle, conversationId: requestConversationId || conversationIdRef.current || conversationId, idempotencyKey, ...(interaction?{interaction}:{}) },
      });
      if (invokeError) throw invokeError;
      if (!data || data.error) throw new Error(data?.error||"JD returned an empty response.");
      if(!visible())return true;
      if (data.conversationId) { conversationIdRef.current = data.conversationId; setConversationId(data.conversationId);rememberConversation(data.conversationId); }
      if (conversationCreationRef.current?.unlock) { conversationCreationRef.current.unlock(); conversationCreationRef.current = null; }
      const { data: historyData } = await supabase.functions.invoke("jd-automation", { body: { action: "history.list" } });
      if (historyData?.conversations) setConversations(historyData.conversations);
      const queued = data.queued === true && Boolean(data.job?.id);
      if(!visible())return true;
      setMessages((current) => current.map(m=>m.clientRequestId!==idempotencyKey?m:m.role==="user"?{...m,id:data.userMessageId||m.id,interaction}: { ...m, submitting:false,id:data.assistantMessage?.id||m.id, role: "assistant", content: queued ? "" : data.reply || data.message || "The request was recorded.", run: data.run, jobId: data.job?.id || null, jobStatus: data.job?.status || (queued ? "queued" : null), job: data.job || null, toolEvents: data.toolEvents || [], response:validateResponse(data.response||data.assistantMessage?.content_json?.response), visualWorkspace: contextualWorkspace(data.visual_workspace || data.ui || data.assistantMessage?.content_json?.visual_workspace) }));
      try{sessionStorage.removeItem(storageKey);}catch{}
      return true;
    } catch (err) {
      if(!visible())return false;
      const status = err?.context?.status || err?.status;
      setError(status === 404 ? "JD is temporarily unavailable. Please try again later." : status === 401 ? "Your session has expired. Sign in again, then retry." : status === 403 ? "Your account does not have permission to do that." : status === 503 ? "JD is not fully set up yet. Please contact your workspace administrator." : "JD could not confirm this request. Retry safely or check conversation history; work may already be queued.");
      setMessages((current) => current.filter((item) => item.clientRequestId!==idempotencyKey));
      if(!interaction)setDraft(message);
      return false;
    } finally {
      if (conversationCreationRef.current?.unlock) { conversationCreationRef.current.unlock(); conversationCreationRef.current = null; }
      submissions.current.delete(storageKey);
      setActiveSends((count) => Math.max(0, count - 1));
    }
  };


  const newConversation = () => {
    if (sending) return;
    conversationSequence.current++;setOpeningId(null);setHistoryError("");
    rememberConversation(null);setHistoryCursor(null);setEarlierLoading(false);
    setConversationId(null); conversationIdRef.current = null; conversationCreationRef.current = null; setMessages([]); setDraft(""); setError(""); setHistoryOpen(false);setShowConnectors(false);
  };
  const handledNavigation = useRef(null);
  useEffect(() => {
    if (!navigationRequest || handledNavigation.current === navigationRequest) return;
    handledNavigation.current = navigationRequest;
    const view = navigationRequest.view;
    setShowReview(view === "review"); setShowUsage(view === "usage");
    setShowRuns(view === "runs"); setShowDepartments(view === "departments");
    setShowConnectors(view === "connectors");
    conversationSequence.current++;setOpeningId(null);
    setHistoryOpen(view === "history");
    if(view === "history")void loadHistory();
    if (view === "new") newConversation();
  }, [navigationRequest]);


  return (
    <div className={`jd-command reference-command jd-conversation${messages.length===0 ? " is-empty" : ""}`}>
      <style>{`
        .jd-command{position:relative;height:calc(100dvh - 57px);min-height:0;display:flex;background:var(--jd-canvas);color:var(--jd-text);font-family:"JD Inter",Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}
        .jd-command *{box-sizing:border-box}
        .jd-history-scrim{display:none}\n        .jd-tool-overlay{position:absolute;z-index:12;inset:0;overflow:auto;background:rgba(20,24,30,.22);backdrop-filter:blur(3px);padding:14px}\n        .jd-tool-overlay>*{min-height:100%;max-width:100%;border-radius:16px;box-shadow:0 18px 60px rgba(20,24,30,.18)}\n        @media(max-width:760px){.jd-tool-overlay{padding:0}.jd-tool-overlay>*{border-radius:0}}\n        .jd-utility{position:relative;flex:0 0 auto;min-width:0;padding:9px 12px;display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--jd-canvas);border-bottom:1px solid var(--jd-border)}\n        .jd-utility button,.jd-utility-status{pointer-events:auto}\n        .jd-history-trigger{width:36px;height:36px;border:1px solid var(--jd-border);background:color-mix(in srgb, var(--jd-card) 94%, transparent);border-radius:10px;color:var(--jd-text-soft);display:grid;place-items:center;cursor:pointer}\n        .jd-utility-status{font-size:10px;color:var(--jd-text-soft);background:color-mix(in srgb, var(--jd-card) 96%, transparent);border:1px solid var(--jd-border);border-radius:20px;padding:7px 11px;box-shadow:0 2px 8px rgba(20,24,30,.04);display:inline-flex;align-items:center;gap:7px}
        .jd-utility-status.is-working{color:var(--jd-text-soft);border-color:var(--jd-border)}
        .jd-utility-status.is-working:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--jd-muted);animation:jd-pulse 1.25s ease-in-out infinite}
        @keyframes jd-pulse{0%,100%{opacity:.45;transform:scale(.85)}50%{opacity:1;transform:scale(1.12)}}\n        .jd-rail{width:258px;flex:0 0 258px;background:var(--jd-soft);border-right:1px solid var(--jd-border);padding:18px 13px;display:flex;flex-direction:column;gap:16px}
        .jd-brand{display:flex;align-items:center;gap:10px;padding:4px 7px 12px;font-size:14px;font-weight:700;letter-spacing:-.3px}
        .jd-brand-mark{width:32px;height:32px;border-radius:11px;background:var(--jd-text);color:var(--jd-card);display:grid;place-items:center;font-size:12px;font-weight:800}
        .jd-new{width:100%;display:flex;align-items:center;justify-content:center;gap:9px;border:1px solid var(--jd-border);background:var(--jd-card);border-radius:11px;padding:11px 12px;color:var(--jd-text);font-size:12px;font-weight:650;cursor:pointer}
        .jd-rail-label{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--jd-muted);font-weight:800;padding:0 9px;margin:4px 0}
        .jd-nav{display:grid;grid-template-columns:1fr 1fr;gap:5px}
        .jd-nav button{min-width:0;border:1px solid transparent;background:transparent;border-radius:9px;padding:10px 8px;display:flex;align-items:center;gap:8px;text-align:left;color:var(--jd-text-soft);font-size:11px;cursor:pointer}
        .jd-nav button:hover{background:var(--jd-card);border-color:var(--jd-border);color:var(--jd-text)}
        .jd-nav svg{flex:0 0 auto}
        .jd-history-list{min-height:0;flex:1;overflow:auto;border-top:1px solid var(--jd-border);padding-top:9px}
        .jd-history-empty{padding:8px 9px;color:var(--jd-muted);font-size:10px;line-height:1.5}
        .jd-history-item{width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px;border:1px solid transparent;border-radius:9px;background:transparent;color:var(--jd-text-soft);text-align:left;font-size:10px;cursor:pointer}
        .jd-history-item span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
        .jd-history-item small{flex:0 0 auto;color:var(--jd-muted);font-size:9px}
        .jd-history-item:hover,.jd-history-item.active{background:var(--jd-card);border-color:var(--jd-border);color:var(--jd-text)}

        .jd-rail-foot{margin-top:auto;border-top:1px solid var(--jd-border);padding:13px 5px 0;display:flex;align-items:center;gap:9px;color:var(--jd-text-soft);font-size:11px}
        .jd-avatar{width:29px;height:29px;border-radius:9px;background:var(--jd-text);color:var(--jd-card);display:grid;place-items:center;font-weight:700}
        .jd-main{min-width:0;min-height:0;flex:1;display:flex;flex-direction:column;position:relative}
        .jd-top{display:none}
        .jd-top-left{display:flex;align-items:center;gap:11px;min-width:0;flex:1}
        .jd-icon-btn{border:0;background:transparent;color:var(--jd-muted);padding:7px;border-radius:8px;cursor:pointer}
        .jd-top-title{font-size:12px;font-weight:700;color:var(--jd-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.jd-top-sub{font-size:10px;color:var(--jd-muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .jd-status{display:flex;align-items:center;gap:7px;font-size:10px;color:var(--jd-muted);flex-shrink:0;white-space:nowrap}
        .jd-dot{width:7px;height:7px;border-radius:50%;background:var(--jd-muted)}
        .jd-scroll{flex:1;min-width:0;min-height:0;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;align-items:center;padding:12px 20px}
        .jd-welcome{width:min(760px,100%);margin:auto 0;display:flex;flex-direction:column;align-items:center;padding:20px 0 28px}
        .jd-spark{width:42px;height:42px;border-radius:14px;background:var(--jd-text);color:var(--jd-card);display:grid;place-items:center;margin-bottom:20px}
        .jd-heading{font-size:clamp(25px,3.3vw,34px);font-weight:620;letter-spacing:-1.4px;margin:0 0 8px;text-align:center}
        .jd-subtitle{font-size:13px;line-height:1.65;color:var(--jd-muted);text-align:center;margin:0 0 25px}
        .jd-actions{width:min(690px,100%);display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
        .jd-action{border:1px solid var(--jd-border);background:var(--jd-card);border-radius:12px;padding:13px 12px;display:flex;align-items:center;gap:10px;text-align:left;min-height:59px;cursor:pointer;color:var(--jd-text-soft)}
        .jd-action:hover{border-color:var(--jd-muted);box-shadow:0 3px 12px rgba(20,24,30,.045)}
        .jd-action-icon{width:29px;height:29px;border-radius:9px;background:var(--jd-soft);display:grid;place-items:center;color:var(--jd-text-soft);flex:0 0 auto}
        .jd-action span:last-child{font-size:11px;font-weight:620}
        .jd-thread{width:min(760px,100%);min-width:0;flex:0 0 auto;display:flex;flex-direction:column;gap:22px;padding:12px 0 34px}
        .jd-message{font-size:13px;line-height:1.75;white-space:pre-wrap;overflow-wrap:anywhere}
        .jd-message.user{align-self:flex-end;max-width:85%;background:var(--jd-soft);border:1px solid var(--jd-border);border-radius:18px 18px 5px 18px;padding:11px 15px;color:var(--jd-text)}
        .jd-message.assistant{min-width:0;max-width:100%;align-self:stretch;color:var(--jd-text-soft);padding:2px 2px}
        .jd-markdown{min-width:0;max-width:100%;white-space:normal;font-size:14px;line-height:1.75;color:var(--jd-text-soft);overflow-wrap:anywhere}
        .jd-markdown>*:first-child{margin-top:0}
        .jd-markdown>*:last-child{margin-bottom:0}
        .jd-markdown p{margin:0 0 12px}
        .jd-markdown h2,.jd-markdown h3,.jd-markdown h4{font-weight:720;letter-spacing:-.35px;line-height:1.35;color:var(--jd-text);margin:18px 0 8px}
        .jd-markdown h2{font-size:18px}.jd-markdown h3{font-size:16px}.jd-markdown h4{font-size:14px}
        .jd-markdown ul,.jd-markdown ol{margin:7px 0 14px;padding-left:22px}
        .jd-markdown li{padding-left:3px;margin:4px 0}
        .jd-markdown strong{font-weight:750;color:var(--jd-text)}
        .jd-markdown a{color:var(--jd-text-soft);text-decoration:underline;text-underline-offset:2px;overflow-wrap:anywhere}
        .jd-markdown del{text-decoration:line-through;color:var(--jd-muted)}
        .jd-markdown hr{border:0;border-top:1px solid var(--jd-border);margin:16px 0}
        .jd-code-block{max-width:100%;overflow:auto;background:var(--jd-text);color:var(--jd-soft);border-radius:10px;padding:12px 14px;margin:10px 0 14px;font:11px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre}
        .jd-code-block code{font:inherit}
        .jd-table-block{min-width:0;max-width:100%;margin:12px 0 16px}.jd-table-hint{font-size:11px;line-height:1.5;color:var(--jd-text-soft)}.jd-table-wrap:focus-visible{outline:2px solid var(--jd-text-soft);outline-offset:2px}.jd-table-wrap{width:100%;max-width:100%;overflow-x:auto;overscroll-behavior-x:contain;border:1px solid var(--jd-border);border-radius:10px;background:var(--jd-card)}
        .jd-table{width:100%;border-collapse:separate;border-spacing:0;font-size:11px;line-height:1.5;min-width:420px}
        .jd-table th{background:var(--jd-soft);color:var(--jd-text-soft);font-weight:750;text-align:left}
        .jd-table th,.jd-table td{min-width:130px;overflow-wrap:break-word;padding:9px 11px;border-bottom:1px solid var(--jd-soft);border-right:1px solid var(--jd-soft);vertical-align:top}
        .jd-table tr:last-child td{border-bottom:0}.jd-table th:last-child,.jd-table td:last-child{border-right:0}
        .jd-table td{color:var(--jd-text-soft)}.jd-math-display{overflow-x:auto;text-align:center;margin:14px 0;padding:9px 4px}
        .jd-math-inline{white-space:normal}.jd-math-display .katex-display{margin:0}
        .jd-markdown blockquote{margin:10px 0;padding:8px 12px;border-left:3px solid var(--jd-border);background:var(--jd-soft);color:var(--jd-text-soft);border-radius:0 8px 8px 0}
        .jd-inline-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em;background:var(--jd-soft);border:1px solid var(--jd-border);border-radius:5px;padding:1px 5px}
        .jd-message-head{display:flex;align-items:center;gap:8px;margin-bottom:7px;font-size:10px;color:var(--jd-muted);font-weight:650}
        .jd-job-state{display:inline-flex;align-items:center;border:1px solid var(--jd-border);background:var(--jd-canvas);border-radius:999px;padding:2px 7px;font-size:9px;font-weight:700;color:var(--jd-muted)}
        .jd-job-state.queued{color:var(--jd-text-soft);background:var(--jd-soft);border-color:var(--jd-border)}
        .jd-job-state.running,.jd-job-state.planning{color:var(--jd-text-soft);background:var(--jd-soft);border-color:var(--jd-border)}
        .jd-job-state.retry_wait{color:var(--jd-text-soft);background:var(--jd-soft);border-color:var(--jd-border)}
        .jd-job-state.completed{color:var(--jd-text-soft);background:var(--jd-soft);border-color:var(--jd-border)}
        .jd-job-state.partially_completed{color:var(--jd-text-soft);background:var(--jd-soft);border-color:var(--jd-border)}
        .jd-job-state.failed{color:var(--jd-text-soft);background:var(--jd-soft);border-color:var(--jd-border)}
        .jd-job-state.cancelled{color:var(--jd-muted);background:var(--jd-soft);border-color:var(--jd-border)}
        .jd-mini-mark{width:20px;height:20px;border-radius:7px;background:var(--jd-text);color:var(--jd-card);display:grid;place-items:center;font-size:8px}
        .jd-tools{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
        .jd-tool{border:1px solid var(--jd-border);background:var(--jd-soft);border-radius:7px;padding:5px 8px;color:var(--jd-muted);font-size:9px}
        .jd-run{font-size:10px;color:var(--jd-muted);margin-top:8px}
        .jd-activity{display:flex;flex-direction:column;gap:7px;margin:2px 0 3px;padding:10px 12px;border:1px solid var(--jd-border);border-radius:12px;background:color-mix(in srgb, var(--jd-card) 72%, transparent);max-width:100%}
        .jd-activity-title{display:flex;align-items:center;gap:8px;color:var(--jd-text-soft);font-size:11px;font-weight:650}
        .jd-activity-dot{width:7px;height:7px;border-radius:50%;background:var(--jd-muted);animation:jd-pulse 1.25s ease-in-out infinite;flex:0 0 auto}
        .jd-activity-detail{font-size:10px;color:var(--jd-muted);line-height:1.5;padding-left:15px}
        .jd-activity-steps{display:grid;gap:5px;padding-left:15px}
        .jd-activity-step{display:flex;align-items:center;gap:7px;font-size:10px;color:var(--jd-muted)}
        .jd-activity-step.done{color:var(--jd-muted)}
        .jd-response-style{width:min(760px,100%);margin:0 auto 8px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}.jd-response-style>span{font-size:10px;color:var(--jd-muted);margin-right:3px}.jd-response-style button{border:1px solid var(--jd-border);background:var(--jd-card);color:var(--jd-text-soft);border-radius:999px;padding:6px 10px;font-size:10px;cursor:pointer}.jd-response-style button.active{background:var(--jd-text);color:var(--jd-card);border-color:var(--jd-text)}.jd-response-style button:focus-visible{outline:2px solid var(--jd-muted);outline-offset:2px}
        .jd-compose-wrap{flex:0 0 auto;width:min(780px,calc(100% - 40px));margin:0 auto calc(14px + env(safe-area-inset-bottom,0px))}
        .jd-compose{border:1px solid var(--jd-border);background:var(--jd-card);border-radius:18px;padding:12px 13px 10px;box-shadow:0 8px 30px rgba(22,26,32,.055)}
        .jd-compose textarea{width:100%;min-height:48px;max-height:180px;resize:vertical;border:0;outline:0;background:transparent;color:var(--jd-text);font:inherit;font-size:13px;line-height:1.65}
        .jd-queue-note{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 4px 2px;font-size:10px;color:var(--jd-muted)}
        .jd-queue-note strong{color:var(--jd-text-soft);font-weight:650}
        .jd-pause{border:1px solid var(--jd-border);background:var(--jd-soft);color:var(--jd-text-soft);border-radius:9px;padding:7px 10px;font-size:10px;font-weight:650;cursor:pointer}
        .jd-pause:disabled{opacity:.4;cursor:not-allowed}
        .jd-compose-bottom{display:flex;align-items:center;justify-content:space-between}
        .jd-compose-hint{font-size:9px;color:var(--jd-muted)}
        .jd-send{width:34px;height:34px;border:0;border-radius:11px;background:var(--jd-text);color:var(--jd-card);display:grid;place-items:center;cursor:pointer}
        .jd-send:disabled{opacity:.35;cursor:not-allowed}
        .jd-error{color:var(--jd-text-soft);font-size:11px;margin:0 0 7px 5px}
        .jd-disclaimer{text-align:center;font-size:9px;color:var(--jd-muted);margin-top:9px}
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
      {showConnectors ? <ConnectorDirectory organizationName={organizationName} role={user?.role} onBack={()=>setShowConnectors(false)}/> : historyOpen ? <ConversationHistory conversations={conversations} loading={historyLoading} error={historyError} openingId={openingId} currentId={conversationId}
        onOpen={loadConversation} onRefresh={loadHistory} onNew={newConversation} onBack={()=>{conversationSequence.current++;setOpeningId(null);setHistoryOpen(false);}}/> : (
      <section className="jd-main">
        <header className="jd-top">
          <div className="jd-top-left">
            <button className="jd-icon-btn" type="button" aria-label="Toggle sidebar" onClick={()=>setHistoryOpen(v=>!v)}>{historyOpen?<PanelLeftClose size={17}/>:<Menu size={18}/>}</button>
            <div><div className="jd-top-title">JD Assistant</div><div className="jd-top-sub">{organizationName} · Command centre</div></div>
          </div>
          <div className="jd-status"><span className="jd-dot"/>{sending?"Working through your request":"Workspace connected"}</div>
        </header>
        <div className="jd-utility">
          <button className="jd-history-trigger" type="button" aria-label="Open conversation history" title="Conversation history" onClick={()=>{setHistoryOpen(true);void loadHistory();}}><History size={18}/></button>
          <span className={"jd-utility-status" + (isWorking ? " is-working" : "")} role="status">{isWorking ? (activeJobCount > 0 ? `Working · ${activeJobCount} run${activeJobCount===1?"":"s"} active` : "Working on your request") : "Workspace Active"}</span>
        </div><div className="jd-scroll">
          {historyCursor&&<button className="jd-load-earlier" type="button" disabled={earlierLoading||sending} onClick={()=>loadConversation(conversationId,historyCursor)}>{earlierLoading?"Loading earlier messages…":"Load earlier messages"}</button>}
          {messages.length===0 ? <div className="jd-welcome">
            <h1 className="jd-heading"><span className="jd-script">{greeting}{firstName ? "," : ""}</span>{firstName ? ` ${firstName}` : ""}.</h1>
            <div style={{margin:"2px 0 16px"}}><span className="jd-rule" aria-hidden="true"><i/><i/><i/></span></div>
            <p className="jd-subtitle">Your organisation, one conversation.</p>
            <p className="jd-welcome-description">Ask James-Denning to inspect records, prepare work and manage workflows.</p>
          </div> : <div className="jd-thread">
            {messages.map((item,index)=><div className={`jd-message ${item.role}`} key={item.id||item.jobId||index}>
              {item.role==="assistant"&&<div className="jd-message-head"><span className="jd-mini-mark">JD</span> JD {item.pollUnavailable?<span className="jd-job-state is-unavailable">Status unavailable</span>:waitingForAnswer(item)?<span className="jd-job-state is-awaiting">Waiting for your answer</span>:item.jobId&&<span className={"jd-job-state "+String(item.jobStatus||item.run?.status||"queued")}>{({queued:"Queued",planning:"Preparing",running:"Running",retry_wait:"Retrying",completed:"Run complete",partially_completed:"Run complete with notes",failed:"Failed",cancelled:"Cancelled"})[item.jobStatus||item.run?.status]||"Queued"}</span>}</div>}
              {item.role==="assistant" && item.streaming ? <div className="jd-stream-text">{streamText(item.content)}</div> : item.role==="assistant"&&validateResponse(item.response) ? <StructuredResponse response={item.response} messageId={item.id} scope={taskScope} answers={messages.filter(m=>m.role==="user"&&m.interaction).map(m=>m.interaction)} disabled={sending||queuePaused} renderMarkdown={renderMessageContent} onReview={()=>setShowReview(true)} onAnswer={(interaction,requestId)=>{const block=item.response.blocks.find(b=>b.id===interaction.blockId);return send(answerText(block,interaction.values),conversationId,interaction,requestId);}}/> : item.content ? renderMessageContent(item.role==="assistant"?decodeResponse(item.content).content:item.content) : null}
              {item.role === "assistant" && !item.streaming && contextualWorkspace(item.visualWorkspace) && <JDVisualWorkspace key={taskScope+":"+index} ui={item.visualWorkspace} onAnswer={(answer) => send("For the decision above, I choose: " + answer + ". Continue using this choice.")} onTaskToggle={taskRecords.transition} taskRecords={taskRecords.state} taskRole={user?.role} onRefreshTasks={taskRecords.refresh} onViewRuns={()=>setShowRuns(true)} onTaskWork={task=>send(`Review saved operational task ${task.id} (${JSON.stringify(task.title)}). Check its current status, dependencies, inputs and required approvals. Work on the next supported, authorised step using the available tools; if blocked, explain exactly what is needed. Do not treat changing a checklist status as executing the task, do not bypass approval, and do not claim completion without evidence.`)}/>}
              {item.role === "assistant" && !item.pollUnavailable && !item.content && (item.submitting || ["queued", "planning", "running", "retry_wait"].includes(item.run?.status)) && (
                <div className="jd-activity" role="status" aria-live="polite">
                  <div className="jd-activity-title"><span className="jd-activity-dot"/>{item.run?.status === "queued" ? "Getting things ready" : item.run?.status === "retry_wait" ? "Picking up where I left off" : item.toolEvents?.length ? "Working through the details" : "Thinking through your request"}</div>
                  {item.toolEvents?.length ? <div className="jd-activity-steps">{item.toolEvents.slice(-4).map((event,i) => {
                    const label = friendlyActivityLabel(event.name);
                    const done = event.status === "completed";
                    return <div className={"jd-activity-step" + (done ? " done" : "")} key={String(event.name)+"-"+i}><span>{done ? "✓" : "·"}</span>{label}</div>;
                  })}</div> : <div className="jd-activity-detail">JD is organising the work and checking what it needs.</div>}
                </div>
              )}
              {item.pollUnavailable&&<div className="jd-response-result" role="status">Live status could not be refreshed. The job may still be running; no new execution was requested.<button type="button" onClick={()=>loadConversation(conversationId)}>Refresh conversation</button><button type="button" onClick={()=>setShowRuns(true)}>View execution runs</button></div>}
              {item.streaming&&!item.pollUnavailable&&<div className="jd-run">JD is writing its response…</div>}

            </div>)}

          </div>}
        </div>
        <div className="jd-compose-wrap">
          {error&&<div className="jd-error">{error}</div>}
          <div className="jd-response-style" role="group" aria-label="Preferred response style"><span>Response style</span>{[{value:"concise",label:"A · Concise"},{value:"balanced",label:"B · Balanced"},{value:"detailed",label:"C · Detailed"}].map(option=><button key={option.value} type="button" className={responseStyle===option.value?"active":""} aria-pressed={responseStyle===option.value} onClick={()=>setResponseStyle(option.value)}>{option.label}</button>)}</div>
          <div className="jd-compose">
            <ComposerTools draft={draft} setDraft={setDraft} onSend={()=>send()} isWorking={isWorking} role={user?.role} actions={actions}
              onNavigate={view=>{setShowConnectors(view==="connectors");setShowReview(view==="review");setShowRuns(view==="runs");setShowUsage(false);setShowDepartments(false);}}>
              <div style={{display:"flex",alignItems:"center",gap:7}}>{isWorking && draft.trim() && <button className="jd-pause" type="button" disabled={queuePaused} onClick={()=>send()}>Send alongside</button>}<button className="jd-send" type="button" disabled={isWorking ? false : (!draft.trim() || queuePaused)} onClick={()=>isWorking ? setQueuePaused(value=>!value) : send()} aria-label={isWorking ? (queuePaused ? "Resume new requests" : "Pause new requests") : "Send message"}>{isWorking ? (queuePaused ? <Play size={15}/> : <Pause size={15}/>) : <Send size={17}/>}</button></div>
            </ComposerTools>
          </div>
            <div className="jd-queue-note"><span><strong>{activeSends}</strong> request{activeSends===1?"":"s"} being submitted · {queuePaused ? "New requests paused" : "Multiple requests supported"}</span></div>
          <div className="jd-disclaimer">{queuePaused ? "New requests are paused. Already submitted jobs continue in the background." : "Submitted jobs continue in the background, even if you close this tab."}</div>
        </div>
      </section>)}
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
