import React, { useCallback, useEffect, useState } from "react";
import { MessageSquare, Send, RefreshCw } from "lucide-react";
import { supabase } from "../supabaseClient.js";

const card = { background: "var(--jd-card,#fff)", border: "1px solid var(--jd-border,#e7e9ed)", borderRadius: 14, padding: 16 };
const field = { width: "100%", boxSizing: "border-box", border: "1px solid var(--jd-border,#dfe2e7)", borderRadius: 9, padding: "10px 12px", fontSize: 12, background: "var(--jd-input,#fff)", color: "inherit" };
const button = { border: 0, borderRadius: 9, padding: "10px 13px", background: "var(--jd-text)", color: "var(--jd-card)", fontSize: 12, fontWeight: 700, cursor: "pointer" };

export function JDDepartmentCollaboration({ tasks = [], team = [] }) {
  const [taskId, setTaskId] = useState("");
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const selected = tasks.find((task) => task.id === taskId);

  const invoke = useCallback(async (payload) => {
    const { data, error: invokeError } = await supabase.functions.invoke("jd-task-collaboration", { body: payload });
    if (invokeError) throw new Error(invokeError.message || "Collaboration request failed");
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  const refresh = useCallback(async () => {
    if (!taskId) { setComments([]); return; }
    const result = await invoke({ action: "comments.list", taskId });
    setComments(result.comments || []);
  }, [invoke, taskId]);

  useEffect(() => { refresh().catch((e) => setError(e.message)); }, [refresh]);

  const send = async () => {
    if (!taskId || !body.trim()) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await invoke({ action: "comments.create", taskId, body: body.trim(), mentions });
      setBody(""); setMentions([]);
      await refresh();
      setNotice("Comment added to the task discussion.");
    } catch (e) { setError(e.message || "Could not add comment"); }
    finally { setBusy(false); }
  };

  return <section style={card}>
    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
      <MessageSquare size={17} />
      <div><h2 style={{ fontSize: 16, margin: 0 }}>Department collaboration</h2><p style={{ fontSize: 11, color: "var(--jd-muted,#60616b)", margin: "4px 0 0" }}>Internal task discussions and member mentions. No external notifications are sent.</p></div>
    </div>
    <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 650 }}>Operational task
      <select value={taskId} onChange={(e) => setTaskId(e.target.value)} style={field}>
        <option value="">Choose a task</option>
        {tasks.map((task) => <option key={task.id} value={task.id}>{task.title} · {task.department || "General"}</option>)}
      </select>
    </label>
    {selected && <>
      <div style={{ display: "grid", gap: 9, marginTop: 14, maxHeight: 360, overflowY: "auto" }}>
        {comments.map((comment) => <article key={comment.id} style={{ borderTop: "1px solid var(--jd-border,#eee)", paddingTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b style={{ fontSize: 12 }}>{comment.author_name}</b><time style={{ fontSize: 10, color: "var(--jd-muted,#60616b)" }}>{new Date(comment.created_at).toLocaleString()}</time></div>
          <p style={{ fontSize: 12, lineHeight: 1.55, whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: "6px 0" }}>{comment.body}</p>
          {!!comment.mention_names?.length && <div style={{ fontSize: 10, color: "var(--jd-muted,#60616b)" }}>Mentioned: {comment.mention_names.join(", ")}</div>}
        </article>)}
        {!comments.length && <p style={{ fontSize: 12, color: "var(--jd-muted,#60616b)" }}>No discussion yet. Start the task conversation.</p>}
      </div>
      <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
        <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 650 }}>Add a comment
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={3} placeholder="Share an update, decision or blocker…" style={{ ...field, resize: "vertical" }} />
        </label>
        <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 650 }}>Mention team members
          <select multiple value={mentions} onChange={(e) => setMentions(Array.from(e.target.selectedOptions, (option) => option.value).slice(0, 10))} style={{ ...field, minHeight: 90 }}>
            {team.map((member) => <option key={member.id} value={member.id}>{member.full_name || member.role}</option>)}
          </select>
        </label>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: "var(--jd-muted,#60616b)" }}>{body.length}/2,000 characters</span>
          <button type="button" disabled={busy || !body.trim()} onClick={send} style={{ ...button, opacity: busy || !body.trim() ? 0.55 : 1 }}><Send size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />{busy ? "Posting…" : "Post comment"}</button>
        </div>
      </div>
    </>}
    {error && <p role="alert" style={{ color: "var(--jd-text-soft)", fontSize: 11 }}>{error}</p>}
    {notice && <p role="status" style={{ color: "var(--jd-text-soft)", fontSize: 11 }}>{notice}</p>}
    {!tasks.length && <p style={{ fontSize: 12, color: "var(--jd-muted,#60616b)" }}>Create an operational task before starting a discussion.</p>}
    <button type="button" onClick={() => refresh().catch((e) => setError(e.message))} disabled={!taskId || busy} style={{ marginTop: 10, background: "transparent", border: 0, color: "inherit", fontSize: 11, cursor: "pointer" }}><RefreshCw size={12} style={{ verticalAlign: "-2px", marginRight: 5 }} />Refresh discussion</button>
  </section>;
}
