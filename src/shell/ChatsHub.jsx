import React, { useState } from "react";
import { ArrowRight, CalendarClock, MessageSquare, Plus, RefreshCw, Search } from "lucide-react";
import { CHAT_FILTERS, filterConversations } from "./shell-state.mjs";

export function ChatsHub({
  conversations = [],
  scheduled = [],
  projects = [],
  loading = false,
  error = "",
  filter = "all",
  onFilterChange,
  onRefresh,
  onOpenChat,
  onNewChat,
}) {
  const [query, setQuery] = useState("");
  const projectMap = new Map((projects || []).map((p) => [p.id, p]));
  const visible = filterConversations(conversations, { query, filter });

  return (
    <section className="jd-hub" aria-labelledby="jd-chats-hub-title">
      <div className="jd-hub-inner">
        <header className="jd-hub-header">
          <div>
            <p className="jd-hub-eyebrow">CONVERSATIONS</p>
            <h1 className="jd-hub-title" id="jd-chats-hub-title">Chats</h1>
          </div>
          <div className="jd-hub-actions">
            <button type="button" className="jd-icon-circle" aria-label="Refresh chats" onClick={onRefresh} disabled={loading}>
              <RefreshCw size={17} />
            </button>
            <button type="button" className="jd-hub-primary-btn" onClick={onNewChat}>
              <Plus size={15} /> New chat
            </button>
          </div>
        </header>

        <div className="jd-hub-toolbar">
          <label className="jd-hub-search">
            <Search size={16} />
            <input type="search" aria-label="Search chats" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search conversations..." />
          </label>
          <div className="jd-filter-chips" role="group" aria-label="Filter conversations">
            {CHAT_FILTERS.map((f) => (
              <button key={f.id} type="button" className={`jd-chip${filter === f.id ? " is-active" : ""}`}
                aria-pressed={filter === f.id} onClick={() => onFilterChange?.(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p role="alert" style={{ fontSize: 12, color: "var(--jd-red, #8d2f26)", margin: 0 }}>{error}</p>}

        {filter === "scheduled" ? (
          !scheduled.length ? (
            <div className="jd-hub-empty">
              <CalendarClock size={28} />
              <h2>No scheduled runs yet</h2>
              <p>Recurring operational tasks and scheduled automations will appear here once configured.</p>
            </div>
          ) : (
            <div className="jd-chat-list">
              {scheduled.map((item) => (
                <div key={item.id} className="jd-project-card">
                  <div className="jd-project-thumb"><CalendarClock size={18} /></div>
                  <div className="jd-project-main" style={{ cursor: "default" }}>
                    <div className="jd-project-title-row">
                      <span className="jd-project-name">{item.title}</span>
                      <span className="jd-project-tag">{item.cron_expression || "Scheduled"}</span>
                    </div>
                    <div className="jd-project-meta">
                      Next run: {item.next_run_at ? new Date(item.next_run_at).toLocaleString() : "Pending schedule"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : loading && !conversations.length ? (
          <div className="jd-hub-empty"><p>Loading conversations...</p></div>
        ) : !visible.length ? (
          <div className="jd-hub-empty">
            <MessageSquare size={28} />
            <h2>{query ? "No matching chats" : "No chats yet"}</h2>
            <p>{query ? "Try another search query." : "Ask JD anything from Home or start a new conversation right here."}</p>
            <button type="button" className="jd-hub-primary-btn" onClick={onNewChat}>
              <Plus size={15} /> New chat
            </button>
          </div>
        ) : (
          <div className="jd-chat-list">
            {visible.map((chat) => {
              const linkedProject = chat.project_id ? projectMap.get(chat.project_id) : null;
              const date = chat.updated_at ? new Date(chat.updated_at) : null;
              const dateLabel = date && !Number.isNaN(date.getTime())
                ? date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                : "Saved chat";
              return (
                <button key={chat.id} type="button" className="jd-project-card" style={{ width: "100%", textAlign: "left", cursor: "pointer" }}
                  onClick={() => onOpenChat?.(chat)}>
                  <div className="jd-project-thumb"><MessageSquare size={18} /></div>
                  <div className="jd-project-main">
                    <div className="jd-project-title-row">
                      <span className="jd-project-name">{chat.title || "New conversation"}</span>
                      {linkedProject && <span className="jd-project-tag">{linkedProject.name}</span>}
                    </div>
                    <div className="jd-project-meta">{dateLabel}</div>
                  </div>
                  <ArrowRight size={16} style={{ color: "var(--jd-muted)", flexShrink: 0 }} />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
