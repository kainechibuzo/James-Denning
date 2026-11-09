/**
 * Hiring domain — org creation presets (Phase 1) + job postings, auto-generated
 * public landing pages, applications & negotiation threads, hires and
 * owner-defined quota tracking (Phases 2–3).
 *
 * Exports:
 *   OrgPresetSelectPage — admin page (nav route "org-create"): pick a preset.
 *   OrgCreatePage        — admin page (route "org-create-details"): org form
 *                          bound to the chosen preset (via ctx.pageParam).
 *   OrgSignupModal       — pre-auth modal used from the school-select screen.
 *   PublicHireLanding    — mobile-first public landing page for a role,
 *                          served at /apply/<slug> (ad destination). Renders
 *                          inside the SPA shell (App.jsx path check) AND as a
 *                          standalone lightweight entry (apply.html).
 *   HiringPage           — admin page (nav route "hiring"): tabs for roles,
 *                          applications (inquiry/negotiation), hires & quota.
 *
 * Public access model: anon never touches tables directly — all public reads
 * and writes go through narrow SECURITY DEFINER RPCs (017_hiring_roles.sql),
 * the same pattern as the login_lookup_* functions.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Building2, Briefcase, CheckCircle2, Clipboard,
  Code2, Copy, ExternalLink, Eye, EyeOff, FileText, Loader2, MessageSquare, Pencil,
  Plus, Send, ShieldCheck, Sparkles, Tag, Trash2, Users, X,
} from "lucide-react";
import { db } from "../supabaseClient.js";
import { C } from "../config/theme.js";
import { useConfirm } from "../contexts/confirm.jsx";
import { Card, Btn, Badge, Modal, Inp, Sel, Spinner, EmptyState, PageHeader } from "../components/ui.jsx";
import { buildAlertEmail, buildNeutralEmailHtml, sendPortalEmail } from "../services/email/index.js";
import { clearSession, clearSelectedSchool } from "../utils/session.js";

// ── Tool labels (presentation layer — the DB stores tool keys) ───────────────
const TOOL_LABELS = {
  core: "Core workspace",
  people: "People & teams",
  billing: "Billing & payments",
  comms: "Communication",
  performance: "Performance records",
  hiring: "Hiring & application pages",
  quotas: "Quota tracking",
  education: "Education module",
};

const toolLabel = (key) => TOOL_LABELS[key] || key;

// ── Preset card grid (shared by the page + the modal) ────────────────────────
function PresetGrid({ presets, onSelect, compact }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: compact ? "1fr" : "repeat(auto-fill,minmax(300px,1fr))",
      gap: 14, width: "100%",
    }}>
      {presets.map(p => {
        const tools = Object.entries(p.modules_json || {})
          .filter(([, v]) => v === true)
          .map(([k]) => k);
        return (
          <div key={p.key} style={{
            background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 16,
            padding: 20, display: "flex", flexDirection: "column", gap: 12,
            boxShadow: C.shadow, transition: "all .18s",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                background: C.bluePale, border: `1px solid ${C.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {p.key === "school_management" ? <Code2 size={20} color={C.blue}/> : <Building2 size={20} color={C.blue}/>}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{p.name}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Business type preset</div>
              </div>
            </div>
            <div style={{ fontSize: 12.5, color: C.textSoft, lineHeight: 1.55 }}>{p.description}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {tools.map(t => (
                <span key={t} style={{
                  fontSize: 10.5, fontWeight: 700, color: C.blue,
                  background: C.bluePale, border: `1px solid ${C.borderLight}`,
                  borderRadius: 20, padding: "3px 10px", whiteSpace: "nowrap",
                }}>{toolLabel(t)}</span>
              ))}
            </div>
            <Btn onClick={() => onSelect(p)} color="#111827" style={{ marginTop: "auto" }}>
              Continue with {p.name} <ArrowRight size={14}/>
            </Btn>
          </div>
        );
      })}
    </div>
  );
}

// ── Org details form (shared by page + modal) ────────────────────────────────
function OrgDetailsForm({ preset, onDone }) {
  const [form, setForm] = useState({
    name: "", admin_name: "", admin_email: "", admin_password: "",
    student_id_prefix: "", address: "", contact_phone: "", state: "",
  });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const inp = (label, key, opts = {}) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.muted,
        textTransform: "uppercase", letterSpacing: .7, marginBottom: 5 }}>
        {label}{opts.req && <span style={{ color: C.red }}> *</span>}
      </label>
      <input type={opts.type || "text"} value={form[key]} onChange={e => sf(key, e.target.value)}
        placeholder={opts.placeholder || ""}
        style={{ width: "100%", padding: "10px 12px", border: `1.5px solid ${C.border}`, borderRadius: 9,
          fontSize: 13, background: C.white, color: C.text, outline: "none", boxSizing: "border-box" }}/>
    </div>
  );

  const submit = async () => {
    if (!form.name.trim() || !form.admin_email.trim() || !form.admin_password.trim()) {
      setErr("School name, admin email, and password are required."); return;
    }
    setSaving(true); setErr("");
    const pfx = (form.student_id_prefix || form.name.slice(0, 4).replace(/\s+/g, "")).toUpperCase();
    const { data, error } = await db.createSchoolSignup({
      ...form, student_id_prefix: pfx, preset_key: preset?.key || null,
    });
    setSaving(false);
    if (error) { setErr(error.message || "Registration failed."); return; }
    onDone(data);
  };

  return (
    <div style={{ width: "100%" }}>
      {/* Chosen preset summary */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
        background: C.bluePale, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 16,
      }}>
        {preset?.key === "school_management"
          ? <Code2 size={16} color={C.blue}/>
          : <Building2 size={16} color={C.blue}/>}
        <div style={{ fontSize: 12.5, color: C.textSoft }}>
          <b style={{ color: C.text }}>{preset?.name || "School management"}</b>
          {" "}preset — tools will be enabled for this school on creation.
        </div>
      </div>

      {err && <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", color: "#b91c1c",
        padding: "10px 14px", borderRadius: 8, fontSize: 12, marginBottom: 16, fontWeight: 600 }}>{err}</div>}

      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase",
        letterSpacing: .7, marginBottom: 10 }}>School Details</div>
      {inp("School Name", "name", { req: true, placeholder: "e.g. Acme Inc" })}
      {inp("Address", "address", { placeholder: "e.g. 12 School Road, Lagos" })}
      {inp("State", "state", { placeholder: "e.g. Lagos" })}
      {inp("Phone", "contact_phone", { placeholder: "e.g. +2348000000000" })}
      {inp("Member ID Prefix", "student_id_prefix", { placeholder: "e.g. ACM (auto-generated if blank)" })}

      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase",
        letterSpacing: .7, margin: "16px 0 10px" }}>Admin Account</div>
      {inp("Admin Full Name", "admin_name", { placeholder: "e.g. Business Administrator" })}
      {inp("Admin Email", "admin_email", { req: true, type: "email", placeholder: "admin@yourbusiness.com" })}
      {inp("Password", "admin_password", { req: true, type: "password", placeholder: "Set a strong password" })}

      <button onClick={submit} disabled={saving}
        style={{ width: "100%", background: saving ? "#CBD5E1" : "linear-gradient(135deg,#111827,#374151)",
          color: "#fff", border: "none", padding: "13px", borderRadius: 12, fontSize: 14, fontWeight: 800,
          cursor: saving ? "not-allowed" : "pointer", marginTop: 8, display: "flex", alignItems: "center",
          justifyContent: "center", gap: 8 }}>
        {saving ? <><Loader2 size={16} style={{ animation: "spin .7s linear infinite" }}/> Creating School…</>
          : <>Create School & Continue <ArrowRight size={15}/></>}
      </button>
    </div>
  );
}

// ── Step 1: preset selection (full page, nav route "org-create") ────────────
export function OrgPresetSelectPage({ ctx }) {
  const { notify, setPage, setPageParam } = ctx;
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true); setError(null);
    db.getOrgPresets().then(({ data, error }) => {
      if (error) { setError(error.message); }
      else setPresets(data || []);
      setLoading(false);
    });
  }, []);

  const choose = (p) => {
    setPageParam({ presetKey: p.key });
    setPage("org-create-details");
  };

  return (
    <div style={{ padding: "20px 24px", maxWidth: 900, margin: "0 auto" }}>
      <PageHeader icon="building" title="Register a School"
        subtitle="Choose a school preset — it decides which tools and defaults the new school starts with."
        action={<Btn onClick={() => notify("Pick a preset to continue")} outline sm>Help</Btn>}/>
      {loading
        ? <div style={{ padding: 48, textAlign: "center" }}><Spinner text="Loading…"/></div>
        : error
          ? <EmptyState icon={<AlertTriangle size={28} color={C.red}/>} title="Could not load presets"
              message={error} action={<Btn onClick={() => { setLoading(true); setError(null);
                db.getOrgPresets().then(({ data, error }) => { if (error) setError(error.message); else setPresets(data || []); setLoading(false); }); }}>Retry</Btn>}/>
          : <>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>
                <Sparkles size={13} style={{ verticalAlign: "-2px", marginRight: 4 }}/>
                Presets are the starting toolset — you can change settings after creation.
              </div>
              <PresetGrid presets={presets} onSelect={choose}/>
              <div style={{ marginTop: 16, fontSize: 12, color: C.light, display: "flex", alignItems: "center", gap: 6 }}>
                <ShieldCheck size={14}/> Creating an school here registers a brand-new workspace with its own admin login.
              </div>
            </>
      }
    </div>
  );
}

// ── Step 2: org creation form (nav route "org-create-details") ──────────────
export function OrgCreatePage({ ctx }) {
  const { notify, setPage, pageParam, setPageParam } = ctx;
  const [preset, setPreset] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const presetKey = pageParam?.presetKey;
    if (!presetKey) { setLoading(false); return; }
    db.getOrgPresets().then(({ data }) => {
      setPreset((data || []).find(p => p.key === presetKey) || null);
      setLoading(false);
    });
    setPageParam(null); // one-shot channel — cleared after reading
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const done = (school) => {
    notify(`${school?.name || "School"} created successfully ✓`);
    // Hand off to the school-select screen: clear local session + school so the
    // new admin can sign in to their fresh school.
    clearSession(); clearSelectedSchool();
    window.location.reload();
  };

  if (loading) return <div style={{ padding: 40 }}><Spinner text="Loading preset…"/></div>;

  if (!preset) {
    return (
      <div style={{ padding: "20px 24px", maxWidth: 900, margin: "0 auto" }}>
        <PageHeader icon="building" title="Register a School" subtitle="Pick a preset first."/>
        <EmptyState icon={<Building2 size={28} color={C.muted}/>}
          title="No preset selected"
          message="Choose a school preset before entering school details."
          action={<Btn onClick={() => setPage("org-create")}><ArrowLeft size={14}/> Back to presets</Btn>}/>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 24px", maxWidth: 720, margin: "0 auto" }}>
      <PageHeader icon="building" title={`Create ${preset.name} School`}
        subtitle="The preset's tools are enabled automatically when the school is created."/>
      <Card style={{ padding: 22 }}>
        <OrgDetailsForm preset={preset} onDone={done}/>
        <button onClick={() => setPage("org-create")}
          style={{ marginTop: 14, background: "none", border: "none", color: C.muted,
            cursor: "pointer", fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
          <ArrowLeft size={13}/> Change preset
        </button>
      </Card>
    </div>
  );
}

// ── Pre-auth signup modal (replaces the old SchoolSignupModal) ───────────────
export function OrgSignupModal({ onClose, onSuccess }) {
  const [step, setStep] = useState("preset"); // "preset" | "details"
  const [preset, setPreset] = useState(null);
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    db.getOrgPresets().then(({ data }) => {
      setPresets(data || []);
      setLoading(false);
    });
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 9000, padding: 16 }}>
      <div style={{ background: C.white, borderRadius: 20, width: "100%", maxWidth: 520, maxHeight: "90vh",
        overflow: "auto", boxShadow: "0 32px 80px rgba(0,0,0,.4)" }}>
        <div style={{ padding: "24px 24px 0", borderBottom: `1px solid ${C.border}`, paddingBottom: 16,
          display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: C.text }}>
              {step === "preset" ? "Register Your Business" : `Create ${preset?.name || "Your"} School`}
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              {step === "preset"
                ? "Step 1 of 2 — choose your business type"
                : "Step 2 of 2 — school details"}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted }}>
            <X size={20}/>
          </button>
        </div>
        <div style={{ padding: 24 }}>
          {step === "preset" ? (
            loading
              ? <div style={{ padding: 20 }}><Spinner text="Loading presets…"/></div>
              : <>
                  <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 12, lineHeight: 1.5 }}>
                    Your business type decides which tools your workspace starts with.
                  </div>
                  <PresetGrid presets={presets} compact onSelect={(p) => { setPreset(p); setStep("details"); }}/>
                </>
          ) : (
            <>
              <button onClick={() => setStep("preset")}
                style={{ background: "none", border: "none", color: C.muted, cursor: "pointer",
                  fontSize: 12, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 4 }}>
                <ArrowLeft size={13}/> Change business type
              </button>
              <OrgDetailsForm preset={preset} onDone={(school) => { onSuccess?.(school); }}/>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASES 2 & 3 — roles, landing pages, applications, hires & quota
// ═════════════════════════════════════════════════════════════════════════════

const HIRING_APP_STATUS = {
  new: "New", reviewing: "Reviewing", negotiating: "Negotiating",
  hired: "Hired", rejected: "Rejected", closed: "Closed",
};
const HIRING_PERIODS = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "custom", label: "Custom dates" },
];

const slugify = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "role";

const fmtNum = (n) => (n === null || n === undefined || n === "") ? "—" : Number(n).toLocaleString();

const copyText = async (txt) => {
  try { await navigator.clipboard.writeText(txt); return true; } catch { return false; }
};

const statusBadge = (s) => {
  const color = s === "hired" ? C.green : s === "rejected" || s === "closed" ? C.red : s === "negotiating" ? C.amber : C.blue;
  return <Badge color={color}>{HIRING_APP_STATUS[s] || s}</Badge>;
};

// ── Shared thread renderer (negotiation pre-hire; internal chat once hired) ──
function ThreadView({ messages, onSend, sending, reply, setReply, ownerName, placeholder }) {
  const canSend = reply.trim().length > 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto", paddingRight: 4 }}>
        {(!messages || messages.length === 0) && (
          <div style={{ fontSize: 12.5, color: C.light, textAlign: "center", padding: "18px 0" }}>
            No messages yet — start the conversation.
          </div>
        )}
        {messages.map(m => {
          const mine = m.sender === "owner";
          return (
            <div key={m.id} style={{
              alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "82%",
              background: mine ? C.blue : C.offWhite,
              color: mine ? "#fff" : C.text,
              borderRadius: 14, padding: "9px 13px",
              borderTopRightRadius: mine ? 4 : 14, borderTopLeftRadius: mine ? 14 : 4,
            }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, opacity: .75, marginBottom: 3 }}>
                {mine ? (ownerName || "You") : (m.sender_name || "Applicant")}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</div>
              <div style={{ fontSize: 10, opacity: .6, marginTop: 4 }}>
                {new Date(m.created_at).toLocaleString("en-NG", { dateStyle: "short", timeStyle: "short" })}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <textarea value={reply} onChange={e => setReply(e.target.value)} rows={2}
          placeholder={placeholder || "Write a message…"}
          style={{ flex: 1, padding: "9px 12px", border: `1.5px solid ${C.border}`, borderRadius: 10,
            fontSize: 13, background: C.white, color: C.text, outline: "none", resize: "none",
            fontFamily: "inherit" }}/>
        <button onClick={onSend} disabled={!canSend || sending}
          style={{ background: canSend && !sending ? C.blue : C.light, color: "#fff", border: "none",
            borderRadius: 10, padding: "9px 14px", cursor: canSend && !sending ? "pointer" : "not-allowed",
            display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, flexShrink: 0 }}>
          {sending ? <Loader2 size={14} style={{ animation: "spin .7s linear infinite" }}/> : <Send size={14}/>}
          Send
        </button>
      </div>
    </div>
  );
}

// ── PUBLIC LANDING PAGE — /apply/<slug> (the differentiator) ────────────────
// Mobile-first, standalone, no portal chrome. Works as an ad-click destination.
// With ?t=<token> it becomes the applicant's private thread view.
export function PublicHireLanding() {
  const [slug] = useState(() => {
    const m = window.location.pathname.match(/^\/apply\/([a-zA-Z0-9-]+)/);
    return m ? m[1] : null;
  });
  const [token] = useState(() => new URLSearchParams(window.location.search).get("t"));
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", qualifications: "", asking_price: "", price_note: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [applied, setApplied] = useState(null); // { link }
  const [thread, setThread] = useState(null);
  const [reply, setReply] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadRole = useCallback(() => {
    if (!slug) { setError("This application link is not valid."); setLoading(false); return; }
    db.publicGetRoleBySlug(slug).then(({ data, error }) => {
      if (error) setError("Could not load this role right now. Please try again.");
      else if (!data) setError("This role is no longer accepting applications.");
      else setRole(data);
      setLoading(false);
    });
  }, [slug]);

  const loadThread = useCallback(() => {
    if (!token) return;
    db.publicGetThread(token).then(({ data, error }) => {
      if (error || !data || data.ok === false) {
        setError("This application link is not valid. If you believe this is a mistake, contact the school.");
        setLoading(false); return;
      }
      setThread(data);
      setLoading(false);
    });
  }, [token]);

  useEffect(() => { if (token) loadThread(); else loadRole(); }, [token, loadThread, loadRole]);
  // Live-ish applicant view: poll the thread every 15s
  useEffect(() => {
    if (!token) return;
    const t = setInterval(loadThread, 15000);
    return () => clearInterval(t);
  }, [token, loadThread]);

  const submit = async () => {
    if (!form.name.trim() || !form.email.trim()) { setSubmitError("Name and a valid email are required."); return; }
    setSubmitting(true); setSubmitError("");
    const { data, error } = await db.publicSubmitApplication({
      slug, name: form.name, email: form.email, phone: form.phone,
      qualifications: form.qualifications,
      askingPrice: form.asking_price ? parseFloat(form.asking_price) : null,
      priceNote: form.price_note,
    });
    setSubmitting(false);
    if (error || !data || data.ok === false) {
      setSubmitError((data?.error) || error?.message || "Could not submit your application. Please try again.");
      return;
    }
    const link = `${window.location.origin}/apply/${slug}?t=${data.token}`;
    setApplied({ link });
    // Confirmation email to the applicant via the existing email path (fire-and-forget)
    if (form.email.includes("@")) {
      sendPortalEmail({
        to: form.email,
        subject: `Application received — ${role?.title || "Role"}`,
        html: buildNeutralEmailHtml(`Application received — ${role?.title || "Role"}`,
          `Thank you for applying to ${role?.title || "this role"} at ${role?.org_name || "the school"}.\n\nYour application has been sent. Track it and chat with the school using your private link:\n${link}\n\nKeep this link safe — it is your personal application thread.`,
          role?.org_name || "Business Portal"),
      });
    }
  };

  const sendReply = async () => {
    if (!reply.trim() || !token) return;
    setSendingReply(true);
    const { data, error } = await db.publicPostMessage(token, form.name || thread?.application?.applicant_name, reply.trim());
    setSendingReply(false);
    if (error || !data || data.ok === false) { setError("Could not send your message. Please try again."); return; }
    setReply("");
    loadThread();
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F7F7F5" }}>
        <Spinner text="Loading…"/>
      </div>
    );
  }

  // ── Applicant thread view (?t=token) ───────────────────────────────────────
  if (thread) {
    const app = thread.application;
    return (
      <div style={{ minHeight: "100vh", background: "#F7F7F5", fontFamily: "'Segoe UI',system-ui,sans-serif" }}>
        <div style={{ maxWidth: 620, margin: "0 auto", padding: "24px 16px 48px" }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: "#9CA3AF", textTransform: "uppercase", marginBottom: 6 }}>
              {thread.role?.title || "Application"}
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#111827" }}>Application thread</div>
            <div style={{ marginTop: 8 }}>{statusBadge(app.status)}</div>
          </div>
          <Card style={{ padding: 18, marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 10, lineHeight: 1.6 }}>
              This is your private conversation with the school. They can see your qualifications and asking price
              {app.asking_price != null ? <> — <b style={{ color: C.text }}>{fmtNum(app.asking_price)}</b>{app.asking_price_note ? ` (${app.asking_price_note})` : ""}</> : ""}.
            </div>
            <ThreadView messages={thread.messages} onSend={sendReply} sending={sendingReply}
              reply={reply} setReply={setReply} ownerName="School"
              placeholder="Reply to the school…"/>
          </Card>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F7F7F5", padding: 24, fontFamily: "'Segoe UI',system-ui,sans-serif" }}>
        <Card style={{ padding: 32, maxWidth: 420, textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 8 }}>Application link</div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>{error}</div>
        </Card>
      </div>
    );
  }

  if (!role) return null;

  // ── Role landing page (ad destination) ─────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#F7F7F5", fontFamily: "'Segoe UI',system-ui,sans-serif", WebkitTapHighlightColor: "transparent" }}>
      <div style={{ maxWidth: 620, margin: "0 auto", padding: "28px 16px 64px" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.4, color: "#9CA3AF", textTransform: "uppercase", marginBottom: 8 }}>
            {role.org_name} is hiring
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#111827", lineHeight: 1.2, letterSpacing: "-.02em" }}>{role.title}</div>
          {role.summary && <div style={{ fontSize: 14.5, color: "#374151", marginTop: 10, lineHeight: 1.6 }}>{role.summary}</div>}
        </div>

        {/* Key facts */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 20 }}>
          {(role.price_min != null || role.price_max != null) && (
            <span style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 20, padding: "6px 14px",
              fontSize: 12.5, fontWeight: 700, color: "#111827", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Tag size={13} color="#6B7280"/>
              {role.price_min != null && role.price_max != null ? `${fmtNum(role.price_min)} – ${fmtNum(role.price_max)}`
                : role.price_min != null ? `From ${fmtNum(role.price_min)}` : `Up to ${fmtNum(role.price_max)}`}
              {role.price_note ? ` ${role.price_note}` : ""}
            </span>
          )}
          {role.expectations && (
            <span style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 20, padding: "6px 14px",
              fontSize: 12.5, fontWeight: 700, color: "#111827" }}>Goals & expectations included</span>
          )}
        </div>

        {/* Description */}
        <Card style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: .8, marginBottom: 10 }}>About the role</div>
          <div style={{ fontSize: 14, color: C.textSoft, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {role.description || "No description provided."}
          </div>
        </Card>

        {role.expectations && (
          <Card style={{ padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: .8, marginBottom: 10 }}>Goals & expectations</div>
            <div style={{ fontSize: 14, color: C.textSoft, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{role.expectations}</div>
          </Card>
        )}

        {/* Apply / success */}
        {applied ? (
          <Card style={{ padding: 24, textAlign: "center" }}>
            <CheckCircle2 size={36} color={C.green} style={{ margin: "0 auto 12px" }}/>
            <div style={{ fontSize: 17, fontWeight: 900, color: C.text, marginBottom: 6 }}>Application sent ✓</div>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 16 }}>
              The school will review your application and reach out through your private thread.
            </div>
            <div style={{ background: C.offWhite, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px",
              fontSize: 12, color: C.textSoft, wordBreak: "break-all", marginBottom: 10, textAlign: "left", lineHeight: 1.5 }}>
              <b>Your private link (save it):</b><br/>{applied.link}
            </div>
            <Btn onClick={async () => { const ok = await copyText(applied.link); setCopied(ok); setTimeout(() => setCopied(false), 2000); }}>
              <Copy size={14}/> {copied ? "Copied ✓" : "Copy my link"}
            </Btn>
          </Card>
        ) : (
          <Card style={{ padding: 22 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: C.text, marginBottom: 4 }}>Apply now</div>
            <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16 }}>Tell the school about yourself and your asking price.</div>
            {submitError && <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", color: "#b91c1c",
              padding: "10px 14px", borderRadius: 8, fontSize: 12, marginBottom: 14, fontWeight: 600 }}>{submitError}</div>}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: .7, marginBottom: 5 }}>Full name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Your name"
                style={{ width: "100%", padding: "11px 13px", border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 14, background: C.white, color: C.text, outline: "none", boxSizing: "border-box" }}/>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: .7, marginBottom: 5 }}>Email *</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="you@example.com"
                style={{ width: "100%", padding: "11px 13px", border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 14, background: C.white, color: C.text, outline: "none", boxSizing: "border-box" }}/>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: .7, marginBottom: 5 }}>Phone</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+234…"
                style={{ width: "100%", padding: "11px 13px", border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 14, background: C.white, color: C.text, outline: "none", boxSizing: "border-box" }}/>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: .7, marginBottom: 5 }}>Qualifications & experience</label>
              <textarea rows={4} value={form.qualifications} onChange={e => setForm(f => ({ ...f, qualifications: e.target.value }))}
                placeholder="Relevant experience, skills, links, portfolio…"
                style={{ width: "100%", padding: "11px 13px", border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 14, background: C.white, color: C.text, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }}/>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 140px", marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: .7, marginBottom: 5 }}>Asking price</label>
                <input inputMode="numeric" value={form.asking_price} onChange={e => setForm(f => ({ ...f, asking_price: e.target.value }))} placeholder="e.g. 150000"
                  style={{ width: "100%", padding: "11px 13px", border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 14, background: C.white, color: C.text, outline: "none", boxSizing: "border-box" }}/>
              </div>
              <div style={{ flex: "2 1 200px", marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: .7, marginBottom: 5 }}>Price note</label>
                <input value={form.price_note} onChange={e => setForm(f => ({ ...f, price_note: e.target.value }))} placeholder="e.g. per month"
                  style={{ width: "100%", padding: "11px 13px", border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 14, background: C.white, color: C.text, outline: "none", boxSizing: "border-box" }}/>
              </div>
            </div>
            <button onClick={submit} disabled={submitting}
              style={{ width: "100%", background: submitting ? "#CBD5E1" : "#111827", color: "#fff", border: "none",
                padding: "14px", borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: submitting ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {submitting ? <><Loader2 size={16} style={{ animation: "spin .7s linear infinite" }}/> Sending…</> : <>Submit application</>}
            </button>
          </Card>
        )}

        <div style={{ textAlign: "center", marginTop: 18, fontSize: 11.5, color: "#9CA3AF" }}>
          Powered by JAMES-DENNING — {role.org_name}'s business workspace
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN HIRING PAGE — Roles | Applications | Hires & Quota
// ═════════════════════════════════════════════════════════════════════════════
export function HiringPage({ ctx }) {
  const { notify, user, selectedSchool } = ctx;
  const confirm = useConfirm();
  const [tab, setTab] = useState("roles"); // roles | applications | hires
  const [tools, setTools] = useState(null);

  // Roles
  const [roles, setRoles] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [roleModal, setRoleModal] = useState(null); // null | {edit:null|role}
  const blankRole = { title: "", summary: "", description: "", expectations: "", price_min: "", price_max: "", price_note: "", is_published: false };
  const [roleForm, setRoleForm] = useState(blankRole);
  const [roleSaving, setRoleSaving] = useState(false);

  // Applications
  const [apps, setApps] = useState([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [appDetail, setAppDetail] = useState(null);
  const [appMsgs, setAppMsgs] = useState([]);
  const [msgText, setMsgText] = useState("");
  const [msgSending, setMsgSending] = useState(false);

  // Hire (quota definition)
  const [hireTarget, setHireTarget] = useState(null); // application being hired
  const blankHire = { metric: "", unit: "", target: "", period: "monthly", measureMethod: "", start: "", end: "" };
  const [hireForm, setHireForm] = useState(blankHire);
  const [hireSaving, setHireSaving] = useState(false);

  // Hires & quota
  const [hires, setHires] = useState([]);
  const [hiresLoading, setHiresLoading] = useState(true);
  const [hireDetail, setHireDetail] = useState(null);
  const [hireEntries, setHireEntries] = useState([]);
  const [hireMsgs, setHireMsgs] = useState([]);
  const [hireMsgText, setHireMsgText] = useState("");
  const [hireMsgSending, setHireMsgSending] = useState(false);
  const [quotaVal, setQuotaVal] = useState("");
  const [quotaNote, setQuotaNote] = useState("");
  const [quotaSaving, setQuotaSaving] = useState(false);

  const loadRoles = () => { setRolesLoading(true); db.getHiringRolesWithCounts().then(({ data }) => { setRoles(data || []); setRolesLoading(false); }); };
  const loadApps = () => { setAppsLoading(true); db.getHiringApplications().then(({ data }) => { setApps(data || []); setAppsLoading(false); }); };
  const loadHires = () => {
    setHiresLoading(true);
    db.getHires().then(async ({ data }) => {
      const rows = data || [];
      const withProgress = await Promise.all(rows.map(async (h) => {
        const { data: entries } = await db.getHireQuotaEntries(h.id);
        const total = (entries || []).reduce((a, e) => a + (parseFloat(e.value) || 0), 0);
        const target = parseFloat(h.quota_target) || 0;
        return { ...h, _logged: total, _pct: target > 0 ? Math.min(100, Math.round((total / target) * 100)) : 0 };
      }));
      setHires(withProgress);
      setHiresLoading(false);
    });
  };

  useEffect(() => {
    db.getOrgTools().then(({ data }) => setTools(data || []));
    loadRoles(); loadApps(); loadHires();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshAppDetail = useCallback((id) => {
    if (!id) return;
    db.getHiringApplication(id).then(({ data }) => { if (data) setAppDetail(data); });
    db.getHiringMessages(id).then(({ data }) => setAppMsgs(data || []));
  }, []);

  const hireMsgFor = (hireId) => {
    const h = hires.find(x => x.id === hireId) || hireDetail;
    return h?.application_id || null;
  };

  const refreshHire = useCallback((id) => {
    if (!id) return;
    db.getHire(id).then(({ data }) => { if (data) setHireDetail(data); });
    db.getHireQuotaEntries(id).then(({ data }) => setHireEntries(data || []));
    db.getHiringMessages(hireMsgFor(id)).then(({ data }) => setHireMsgs(data || []));
  }, [hireMsgFor]); // eslint-disable-line react-hooks/exhaustive-deps

  // Email alert for brand-new applications — reuses the existing sendAdminAlert
  // path (ZeptoMail/SES edge function via db.sendAdminAlert). Runs once per new
  // batch; high-water mark persisted in school_settings.
  useEffect(() => {
    if (!apps.length) return;
    db.getSettings().then(({ data }) => {
      const m = {}; (data || []).forEach(r => { m[r.key] = r.value; });
      const last = parseInt(m.hiring_alerted_upto || "0", 10);
      const fresh = apps.filter(a => a.id > last);
      if (!fresh.length) return;
      const newest = fresh.reduce((mx, a) => Math.max(mx, a.id), 0);
      const rows = [];
      fresh.slice(0, 6).forEach(a => {
        rows.push(`Role: ${a.hiring_roles?.title || "—"}`);
        rows.push(`Applicant: ${a.applicant_name}`);
        rows.push(`Asking price: ${a.asking_price != null ? fmtNum(a.asking_price) : (a.asking_price_note || "—")}`);
      });
      db.sendAdminAlert({
        subject: `[Alert] ${fresh.length} New Application${fresh.length > 1 ? "s" : ""} — ${selectedSchool?.name || "Portal"}`,
        html: buildAlertEmail(`New Hiring Application${fresh.length > 1 ? "s" : ""}`, rows, "info", selectedSchool?.name || "Business Portal"),
        eventKey: "hiring_application",
      });
      db.setSetting("hiring_alerted_upto", String(newest)).catch(() => {});
    }).catch(() => {});
  }, [apps]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live-ish refresh: hires/quota + open threads poll every 30s
  useEffect(() => {
    const t = setInterval(() => {
      if (tab === "hires") loadHires();
      if (appDetail) refreshAppDetail(appDetail.id);
      if (hireDetail) refreshHire(hireDetail.id);
    }, 30000);
    return () => clearInterval(t);
  }, [tab, appDetail?.id, hireDetail?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const hiringTool = (tools || []).find(t => t.tool_key === "hiring");
  const hiringDisabled = hiringTool && !hiringTool.is_enabled;

  // ── Role CRUD ──────────────────────────────────────────────────────────────
  const saveRole = async () => {
    if (!roleForm.title.trim()) { notify("Role title is required", "error"); return; }
    setRoleSaving(true);
    const payload = {
      ...roleForm,
      price_min: roleForm.price_min ? parseFloat(roleForm.price_min) : null,
      price_max: roleForm.price_max ? parseFloat(roleForm.price_max) : null,
    };
    if (!roleModal?.edit) {
      let base = slugify(roleForm.title);
      let slug = base; let n = 2;
      const existing = new Set(roles.map(r => r.slug));
      while (existing.has(slug)) slug = `${base}-${n++}`;
      payload.slug = slug; payload.status = "active";
      payload.created_by = user?.teacher_db_id || null;
    }
    const { data, error } = await db.upsertHiringRole(payload, roleModal?.edit?.id || null);
    setRoleSaving(false);
    if (error) { notify(error.message, "error"); return; }
    notify(roleModal?.edit ? "Role updated ✓" : "Role created ✓ — landing page ready to publish");
    setRoleModal(null); setRoleForm(blankRole); loadRoles();
  };

  const togglePublish = async (r) => {
    const { error } = await db.upsertHiringRole({ is_published: !r.is_published }, r.id);
    if (error) { notify(error.message, "error"); return; }
    notify(r.is_published ? "Landing page unpublished" : "Landing page is live ✓");
    loadRoles();
  };

  const delRole = async (r) => {
    if (r.application_count > 0) {
      notify(`🔒 Interlock — Cannot delete "${r.title}"\nReason: ${r.application_count} application(s) exist for this role.\nFix: Close the role instead — application history must be preserved.`, "error");
      return;
    }
    const __ok = await confirm({ title: "Delete Role?", message: `Delete "${r.title}"? This cannot be undone.`, confirmLabel: "Delete", danger: true, typeToConfirm: "DELETE" });
    if (!__ok) return;
    const { error } = await db.deleteHiringRole(r.id);
    if (error) notify(error.message, "error");
    else { notify("Role deleted", "warn"); loadRoles(); }
  };

  // ── Application actions ────────────────────────────────────────────────────
  const setAppStatus = async (id, status) => {
    const { error } = await db.setHiringApplicationStatus(id, status);
    if (error) { notify(error.message, "error"); return; }
    notify(`Application marked ${(HIRING_APP_STATUS[status] || status).toLowerCase()}`);
    refreshAppDetail(id); loadApps();
  };

  const sendOwnerMsg = async (id) => {
    if (!msgText.trim()) return;
    setMsgSending(true);
    const { data, error } = await db.addHiringMessage(id, "owner", user?.full_name || user?.name || "Owner", msgText.trim());
    setMsgSending(false);
    if (error) { notify(error.message, "error"); return; }
    setMsgText(""); refreshAppDetail(id);
  };

  const sendHireMsg = async () => {
    const appId = hireMsgFor(hireDetail?.id);
    if (!hireMsgText.trim() || !appId) return;
    setHireMsgSending(true);
    const { data, error } = await db.addHiringMessage(appId, "owner", user?.full_name || user?.name || "Owner", hireMsgText.trim());
    setHireMsgSending(false);
    if (error) { notify(error.message, "error"); return; }
    setHireMsgText(""); refreshHire(hireDetail.id);
  };

  const createHire = async () => {
    const f = hireForm;
    if (!f.metric.trim() || !f.target) { notify("Metric name and target are required to start quota tracking", "error"); return; }
    setHireSaving(true);
    const { data, error } = await db.createHire({
      applicationId: hireTarget.id, roleId: hireTarget.role_id,
      hireName: hireTarget.applicant_name, contactEmail: hireTarget.applicant_email,
      quota: {
        metric: f.metric.trim(), unit: f.unit.trim(), target: parseFloat(f.target) || 0,
        period: f.period, measureMethod: f.measureMethod.trim(),
        start: f.period === "custom" && f.start ? f.start : null,
        end: f.period === "custom" && f.end ? f.end : null,
      },
    });
    setHireSaving(false);
    if (error) { notify(error.message, "error"); return; }
    notify(`Hired ${hireTarget.applicant_name} — quota tracking started ✓`);
    setHireTarget(null); setHireForm(blankHire);
    if (appDetail) refreshAppDetail(appDetail.id);
    loadApps(); loadHires();
    setTab("hires");
  };

  const logQuota = async () => {
    if (quotaVal === "" || isNaN(parseFloat(quotaVal))) { notify("Enter a value to log", "error"); return; }
    setQuotaSaving(true);
    const { data, error } = await db.addHireQuotaEntry(hireDetail.id, parseFloat(quotaVal), quotaNote.trim(), user?.full_name || user?.name || "admin");
    setQuotaSaving(false);
    if (error) { notify(error.message, "error"); return; }
    setQuotaVal(""); setQuotaNote("");
    notify("Quota entry logged ✓");
    refreshHire(hireDetail.id);
  };

  const endHire = async () => {
    const __ok = await confirm({ title: "End this hire?", message: `End the engagement with ${hireDetail.hire_name}? Quota history is kept.`, confirmLabel: "End hire", danger: true });
    if (!__ok) return;
    const { error } = await db.updateHire(hireDetail.id, { status: "ended" });
    if (error) { notify(error.message, "error"); return; }
    notify("Hire ended");
    setHireDetail(null); loadHires();
  };

  const quotaProgress = (hire, entries) => {
    const total = (entries || []).reduce((a, e) => a + (parseFloat(e.value) || 0), 0);
    const target = parseFloat(hire?.quota_target) || 0;
    const pct = target > 0 ? Math.min(100, Math.round((total / target) * 100)) : 0;
    return { total, target, pct };
  };

  const landingUrl = (slug) => `${window.location.origin}/apply/${slug}`;

  const TABS = [
    { id: "roles", label: "Roles" },
    { id: "applications", label: "Applications", badge: apps.filter(a => a.status === "new").length },
    { id: "hires", label: "Hires & Quota" },
  ];

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1000, margin: "0 auto" }}>
      <PageHeader icon={<Briefcase/>} title="Hiring"
        subtitle="Post roles with auto-generated landing pages, review applications, negotiate, and track owner-defined quotas."
        action={<Btn onClick={() => setRoleModal({ edit: null })}><Plus size={14}/> New Role</Btn>}/>

      {hiringDisabled && (
        <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", color: "#b91c1c",
          padding: "12px 16px", borderRadius: 10, fontSize: 12.5, marginBottom: 16, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
          <span>The hiring tool is currently disabled for this school (set by its school preset).</span>
          <Btn sm color="#111827" onClick={async () => {
            const { error } = await db.setOrgTool("hiring", true);
            if (error) notify(error.message, "error"); else { notify("Hiring tool enabled ✓"); db.getOrgTools().then(({ data }) => setTools(data || [])); }
          }}>Enable hiring</Btn>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18, borderBottom: `1px solid ${C.border}`, paddingBottom: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ background: tab === t.id ? C.blue : "none", color: tab === t.id ? "#fff" : C.muted,
              border: "none", padding: "9px 18px", borderRadius: "10px 10px 0 0", cursor: "pointer",
              fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6,
              borderBottom: tab === t.id ? "none" : `1px solid ${C.border}` }}>
            {t.label}
            {!!t.badge && <span style={{ background: C.red, color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 10.5 }}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* ── ROLES TAB ─────────────────────────────────────────────────────── */}
      {tab === "roles" && (
        rolesLoading
          ? <div style={{ padding: 48, textAlign: "center" }}><Spinner text="Loading…"/></div>
          : roles.length === 0
            ? <EmptyState icon={<Briefcase size={28} color={C.muted}/>} title="No roles yet"
                message="Post your first role — JAMES-DENNING generates a shareable landing page you can point ads at."
                action={<Btn onClick={() => setRoleModal({ edit: null })}><Plus size={14}/> Post a role</Btn>}/>
            : <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {roles.map(r => (
                  <Card key={r.id} style={{ padding: 18 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{r.title}</span>
                          <Badge color={r.is_published ? C.green : C.muted}>{r.is_published ? "Live" : "Draft"}</Badge>
                          <Badge color={r.status === "closed" ? C.red : r.status === "paused" ? C.amber : C.blue}>{r.status}</Badge>
                        </div>
                        <div style={{ fontSize: 12, color: C.muted, marginTop: 5, display: "flex", gap: 14, flexWrap: "wrap" }}>
                          <span>{(r.price_min != null || r.price_max != null)
                            ? `${r.price_min != null ? fmtNum(r.price_min) : "—"} – ${r.price_max != null ? fmtNum(r.price_max) : "—"}${r.price_note ? ` ${r.price_note}` : ""}`
                            : "No price range"}</span>
                          <span>{r.application_count} application{r.application_count === 1 ? "" : "s"}</span>
                          <span style={{ color: C.light }}>/apply/{r.slug}</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>
                        <Btn xs outline onClick={() => { setRoleModal({ edit: r }); setRoleForm({ ...blankRole, ...r, price_min: r.price_min ?? "", price_max: r.price_max ?? "" }); }}>
                          <Pencil size={12}/> Edit
                        </Btn>
                        <Btn xs outline color={C.blue} onClick={async () => { const ok = await copyText(landingUrl(r.slug)); notify(ok ? "Landing page link copied ✓" : "Could not copy — copy manually", ok ? "success" : "warn"); }}>
                          <Copy size={12}/> Copy link
                        </Btn>
                        <Btn xs outline onClick={() => window.open(landingUrl(r.slug), "_blank")}>
                          <ExternalLink size={12}/> View
                        </Btn>
                        <Btn xs outline onClick={() => togglePublish(r)}>
                          {r.is_published ? <><EyeOff size={12}/> Unpublish</> : <><Eye size={12}/> Publish</>}
                        </Btn>
                        {r.status !== "closed" && (
                          <Btn xs outline color={C.red} onClick={async () => {
                            const { error } = await db.upsertHiringRole({ status: "closed" }, r.id);
                            if (error) notify(error.message, "error"); else { notify(`"${r.title}" closed — landing page offline`); loadRoles(); }
                          }}>Close</Btn>
                        )}
                        <Btn xs outline color={C.red} onClick={() => delRole(r)}><Trash2 size={12}/></Btn>
                      </div>
                    </div>
                    {r.summary && <div style={{ fontSize: 12.5, color: C.textSoft, marginTop: 8, lineHeight: 1.5 }}>{r.summary}</div>}
                  </Card>
                ))}
              </div>
      )}

      {/* ── APPLICATIONS TAB ──────────────────────────────────────────────── */}
      {tab === "applications" && (
        appsLoading
          ? <div style={{ padding: 48, textAlign: "center" }}><Spinner text="Loading…"/></div>
          : apps.length === 0
            ? <EmptyState icon={<Users size={28} color={C.muted}/>} title="No applications yet"
                message="Applications from your published landing pages will appear here."/>
            : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {apps.map(a => (
                  <button key={a.id} onClick={() => { setAppDetail(a); setAppMsgs([]); refreshAppDetail(a.id); }}
                    style={{ background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: "14px 18px",
                      cursor: "pointer", textAlign: "left", width: "100%", display: "flex", justifyContent: "space-between",
                      gap: 12, alignItems: "center", transition: "all .15s" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = C.blue; e.currentTarget.style.boxShadow = C.shadowMd; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.boxShadow = "none"; }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{a.applicant_name}</div>
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
                        {a.hiring_roles?.title || "Role"} · {new Date(a.created_at).toLocaleString("en-NG", { dateStyle: "medium" })}
                        {a.asking_price != null && <> · Asking {fmtNum(a.asking_price)}{a.asking_price_note ? ` ${a.asking_price_note}` : ""}</>}
                      </div>
                    </div>
                    {statusBadge(a.status)}
                  </button>
                ))}
              </div>
      )}

      {/* ── HIRES & QUOTA TAB ─────────────────────────────────────────────── */}
      {tab === "hires" && (
        hiresLoading
          ? <div style={{ padding: 48, textAlign: "center" }}><Spinner text="Loading…"/></div>
          : hires.length === 0
            ? <EmptyState icon={<CheckCircle2 size={28} color={C.muted}/>} title="No hires yet"
                message="When you hire from an application, define the quota metric here and start tracking."/>
            : <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {hires.map(h => {
                  const total = h._logged || 0;
                  const target = parseFloat(h.quota_target) || 0;
                  const pct = h._pct || 0;
                  return (
                    <Card key={h.id} style={{ padding: 18 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{h.hire_name}</span>
                            <Badge color={h.status === "active" ? C.green : C.muted}>{h.status}</Badge>
                          </div>
                          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
                            {h.hiring_roles?.title || "Role"} · {h.quota_metric} · {h.quota_period}
                          </div>
                        </div>
                        <Btn xs outline onClick={() => { setHireDetail(h); refreshHire(h.id); }}>Open</Btn>
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, fontWeight: 700, color: C.muted, marginBottom: 5 }}>
                          <span>Quota progress</span>
                        </div>
                        <div style={{ background: C.offWhite, borderRadius: 8, height: 10, overflow: "hidden", border: `1px solid ${C.border}` }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: pct >= 100 ? C.green : C.blue, borderRadius: 8, transition: "width .4s" }}/>
                        </div>
                        <div style={{ fontSize: 12, color: C.textSoft, marginTop: 6 }}>
                          At <b style={{ color: C.text }}>{pct}%</b> of quota
                          {target > 0 ? <> — logged so far: {fmtNum(total)} of {fmtNum(target)} {h.quota_unit || "units"}</> : ""}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
      )}

      {/* ── ROLE MODAL (create/edit) ─────────────────────────────────────── */}
      {roleModal && (
        <Modal title={roleModal.edit ? "Edit Role" : "Post a New Role"} onClose={() => { setRoleModal(null); setRoleForm(blankRole); }} width={620}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Inp label="Role title *" value={roleForm.title} onChange={v => setRoleForm(f => ({ ...f, title: v }))} placeholder="e.g. Senior Frontend Developer"/>
            <Inp label="Short pitch (landing page hero)" value={roleForm.summary} onChange={v => setRoleForm(f => ({ ...f, summary: v }))} placeholder="One or two lines shown at the top of the landing page"/>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: .7, marginBottom: 5 }}>Full description</label>
              <textarea rows={6} value={roleForm.description} onChange={e => setRoleForm(f => ({ ...f, description: e.target.value }))}
                placeholder="What the role involves…"
                style={{ width: "100%", padding: "10px 12px", border: `1.5px solid ${C.border}`, borderRadius: 9, fontSize: 13,
                  background: C.white, color: C.text, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }}/>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: .7, marginBottom: 5 }}>Quota / goal expectations</label>
              <textarea rows={3} value={roleForm.expectations} onChange={e => setRoleForm(f => ({ ...f, expectations: e.target.value }))}
                placeholder="e.g. Complete 40 support tickets per month; quality bar = 4.5+ rating"
                style={{ width: "100%", padding: "10px 12px", border: `1.5px solid ${C.border}`, borderRadius: 9, fontSize: 13,
                  background: C.white, color: C.text, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }}/>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 120px" }}>
                <Inp label="Price from" type="number" value={roleForm.price_min} onChange={v => setRoleForm(f => ({ ...f, price_min: v }))} placeholder="e.g. 100000"/>
              </div>
              <div style={{ flex: "1 1 120px" }}>
                <Inp label="Price to" type="number" value={roleForm.price_max} onChange={v => setRoleForm(f => ({ ...f, price_max: v }))} placeholder="e.g. 150000"/>
              </div>
              <div style={{ flex: "1 1 160px" }}>
                <Inp label="Price note" value={roleForm.price_note} onChange={v => setRoleForm(f => ({ ...f, price_note: v }))} placeholder="e.g. per month"/>
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.textSoft, cursor: "pointer" }}>
              <input type="checkbox" checked={!!roleForm.is_published} onChange={e => setRoleForm(f => ({ ...f, is_published: e.target.checked }))}/>
              Publish landing page immediately
            </label>
            {roleModal.edit && (
              <div style={{ fontSize: 12, color: C.light }}>
                Landing page: <b style={{ color: C.muted }}>{landingUrl(roleModal.edit.slug)}</b>
              </div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
              <Btn outline onClick={() => { setRoleModal(null); setRoleForm(blankRole); }}>Cancel</Btn>
              <Btn color="#111827" onClick={saveRole} disabled={roleSaving}>{roleSaving ? "Saving…" : roleModal.edit ? "Save changes" : "Create role"}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* ── APPLICATION DETAIL MODAL ─────────────────────────────────────── */}
      {appDetail && (
        <Modal title={appDetail.applicant_name} onClose={() => setAppDetail(null)} width={640}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {statusBadge(appDetail.status)}
              <span style={{ fontSize: 12.5, color: C.muted }}>{appDetail.hiring_roles?.title} · {new Date(appDetail.created_at).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ background: C.offWhite, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: .6 }}>Email</div>
                <div style={{ fontSize: 13, color: C.text, fontWeight: 600, marginTop: 3, wordBreak: "break-all" }}>{appDetail.applicant_email}</div>
              </div>
              <div style={{ background: C.offWhite, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: .6 }}>Phone</div>
                <div style={{ fontSize: 13, color: C.text, fontWeight: 600, marginTop: 3 }}>{appDetail.applicant_phone || "—"}</div>
              </div>
              <div style={{ background: C.offWhite, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: .6 }}>Asking price</div>
                <div style={{ fontSize: 13, color: C.text, fontWeight: 600, marginTop: 3 }}>
                  {appDetail.asking_price != null ? fmtNum(appDetail.asking_price) : "—"}
                  {appDetail.asking_price_note ? ` ${appDetail.asking_price_note}` : ""}
                </div>
              </div>
            </div>

            {appDetail.qualifications && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: .7, marginBottom: 5 }}>Qualifications</div>
                <div style={{ fontSize: 13, color: C.textSoft, lineHeight: 1.6, whiteSpace: "pre-wrap", background: C.offWhite, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>{appDetail.qualifications}</div>
              </div>
            )}

            {/* Status actions */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {appDetail.status === "new" && <Btn sm outline onClick={() => setAppStatus(appDetail.id, "reviewing")}>Start reviewing</Btn>}
              {(appDetail.status === "new" || appDetail.status === "reviewing") && <Btn sm outline color={C.blue} onClick={() => setAppStatus(appDetail.id, "negotiating")}>Start negotiation</Btn>}
              {(appDetail.status === "negotiating" || appDetail.status === "reviewing" || appDetail.status === "new") && (
                <Btn sm color={C.green} onClick={() => { setHireTarget(appDetail); setHireForm(blankHire); }}><CheckCircle2 size={13}/> Hire…</Btn>
              )}
              {appDetail.status !== "rejected" && appDetail.status !== "closed" && <Btn sm outline color={C.red} onClick={() => setAppStatus(appDetail.id, "rejected")}>Reject</Btn>}
              {appDetail.status !== "closed" && appDetail.status !== "hired" && <Btn sm outline color={C.red} onClick={() => setAppStatus(appDetail.id, "closed")}>Close</Btn>}
            </div>

            {/* Negotiation thread */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: .7, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <MessageSquare size={13}/> Negotiation thread
              </div>
              <ThreadView messages={appMsgs} onSend={() => sendOwnerMsg(appDetail.id)} sending={msgSending}
                reply={msgText} setReply={setMsgText} ownerName={user?.full_name || user?.name || "You"}/>
            </div>
          </div>
        </Modal>
      )}

      {/* ── HIRE MODAL (quota definition — owner sets metric + measurement) ── */}
      {hireTarget && (
        <Modal title={`Hire ${hireTarget.applicant_name}`} onClose={() => setHireTarget(null)} width={560}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>
              Define the quota/goal this hire will be tracked against. <b style={{ color: C.text }}>You set the metric and how it is measured</b> —
              JAMES-DENNING only records and displays progress; it never calculates pay.
            </div>
            <Inp label="Quota metric *" value={hireForm.metric} onChange={v => setHireForm(f => ({ ...f, metric: v }))} placeholder="e.g. Deliverables completed"/>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 130px" }}>
                <Inp label="Unit" value={hireForm.unit} onChange={v => setHireForm(f => ({ ...f, unit: v }))} placeholder="e.g. tickets"/>
              </div>
              <div style={{ flex: "1 1 130px" }}>
                <Inp label="Target *" type="number" value={hireForm.target} onChange={v => setHireForm(f => ({ ...f, target: v }))} placeholder="e.g. 40"/>
              </div>
              <div style={{ flex: "1 1 160px" }}>
                <Sel label="Period" value={hireForm.period} onChange={v => setHireForm(f => ({ ...f, period: v }))} options={HIRING_PERIODS}/>
              </div>
            </div>
            {hireForm.period === "custom" && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 140px" }}>
                  <Inp label="Start date" type="date" value={hireForm.start} onChange={v => setHireForm(f => ({ ...f, start: v }))}/>
                </div>
                <div style={{ flex: "1 1 140px" }}>
                  <Inp label="End date" type="date" value={hireForm.end} onChange={v => setHireForm(f => ({ ...f, end: v }))}/>
                </div>
              </div>
            )}
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: .7, marginBottom: 5 }}>How is it measured?</label>
              <textarea rows={3} value={hireForm.measureMethod} onChange={e => setHireForm(f => ({ ...f, measureMethod: e.target.value }))}
                placeholder="e.g. Count of tickets marked done in the team board each week"
                style={{ width: "100%", padding: "10px 12px", border: `1.5px solid ${C.border}`, borderRadius: 9, fontSize: 13,
                  background: C.white, color: C.text, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }}/>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
              <Btn outline onClick={() => setHireTarget(null)}>Cancel</Btn>
              <Btn color={C.green} onClick={createHire} disabled={hireSaving}>{hireSaving ? "Hiring…" : "Hire & start quota tracking"}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* ── HIRE DETAIL MODAL (quota dashboard + internal chat) ───────────── */}
      {hireDetail && (
        <Modal title={hireDetail.hire_name} onClose={() => setHireDetail(null)} width={640}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Badge color={hireDetail.status === "active" ? C.green : C.muted}>{hireDetail.status}</Badge>
              <span style={{ fontSize: 12.5, color: C.muted }}>{hireDetail.hiring_roles?.title} · {hireDetail.contact_email || "—"}</span>
            </div>

            {/* Quota definition (owner-set) */}
            <div style={{ background: C.offWhite, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: .7, marginBottom: 8 }}>Quota definition</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12.5 }}>
                <div><span style={{ color: C.muted }}>Metric:</span> <b style={{ color: C.text }}>{hireDetail.quota_metric}</b></div>
                <div><span style={{ color: C.muted }}>Target:</span> <b style={{ color: C.text }}>{fmtNum(hireDetail.quota_target)} {hireDetail.quota_unit}</b> / {hireDetail.quota_period}</div>
                {hireDetail.quota_period === "custom" && hireDetail.quota_start && (
                  <div><span style={{ color: C.muted }}>Period:</span> <b style={{ color: C.text }}>{hireDetail.quota_start} → {hireDetail.quota_end || "open"}</b></div>
                )}
                {hireDetail.quota_measure_method && (
                  <div style={{ gridColumn: "1 / -1" }}><span style={{ color: C.muted }}>How it's measured:</span> <b style={{ color: C.text }}>{hireDetail.quota_measure_method}</b></div>
                )}
              </div>
            </div>

            {/* Progress — descriptive only, never prescriptive */}
            {(() => {
              const { total, target, pct } = quotaProgress(hireDetail, hireEntries);
              return (
                <div>
                  <div style={{ background: C.offWhite, borderRadius: 8, height: 12, overflow: "hidden", border: `1px solid ${C.border}` }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: pct >= 100 ? C.green : C.blue, borderRadius: 8, transition: "width .4s" }}/>
                  </div>
                  <div style={{ fontSize: 12.5, color: C.textSoft, marginTop: 7, lineHeight: 1.5 }}>
                    At <b style={{ color: C.text }}>{pct}%</b> of quota
                    {target > 0 ? <> — <b style={{ color: C.text }}>{fmtNum(total)}</b> of {fmtNum(target)} {hireDetail.quota_unit || "units"} logged</> : ""}.
                    JAMES-DENNING records and displays this data; it does not calculate or guarantee any pay amount.
                  </div>
                </div>
              );
            })()}

            {/* Log quota entry */}
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: .7, marginBottom: 8 }}>Log progress</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input inputMode="numeric" value={quotaVal} onChange={e => setQuotaVal(e.target.value)} placeholder={`Value (${hireDetail.quota_unit || "units"})`}
                  style={{ flex: "1 1 120px", padding: "9px 12px", border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 13, background: C.white, color: C.text, outline: "none" }}/>
                <input value={quotaNote} onChange={e => setQuotaNote(e.target.value)} placeholder="Note (optional)"
                  style={{ flex: "2 1 180px", padding: "9px 12px", border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 13, background: C.white, color: C.text, outline: "none" }}/>
                <Btn color="#111827" onClick={logQuota} disabled={quotaSaving}>{quotaSaving ? <Loader2 size={14} style={{ animation: "spin .7s linear infinite" }}/> : "Log"}</Btn>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10, maxHeight: 160, overflowY: "auto" }}>
                {hireEntries.length === 0 && <div style={{ fontSize: 12, color: C.light }}>No progress logged yet.</div>}
                {hireEntries.map(e => (
                  <div key={e.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5,
                    background: C.white, border: `1px solid ${C.borderLight}`, borderRadius: 8, padding: "7px 12px" }}>
                    <span style={{ color: C.textSoft }}><b style={{ color: C.text }}>{fmtNum(e.value)}</b> {hireDetail.quota_unit}{e.note ? ` — ${e.note}` : ""}</span>
                    <span style={{ color: C.light, whiteSpace: "nowrap" }}>
                      {new Date(e.recorded_at).toLocaleString("en-NG", { dateStyle: "short", timeStyle: "short" })} · {e.recorded_by}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Internal chat (continues the negotiation thread once hired) */}
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: .7, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <MessageSquare size={13}/> Chat with {hireDetail.hire_name}
              </div>
              <ThreadView messages={hireMsgs} onSend={sendHireMsg} sending={hireMsgSending}
                reply={hireMsgText} setReply={setHireMsgText} ownerName={user?.full_name || user?.name || "You"}/>
            </div>

            {hireDetail.status === "active" && (
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Btn outline color={C.red} onClick={endHire}>End hire</Btn>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
