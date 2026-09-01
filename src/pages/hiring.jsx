/**
 * Hiring domain — Phase 1: org creation with business-type presets.
 *
 * Exports:
 *   OrgPresetSelectPage — admin page (nav route "org-create"): pick a preset.
 *   OrgCreatePage        — admin page (route "org-create-details"): org form
 *                          bound to the chosen preset (via ctx.pageParam).
 *   OrgSignupModal       — pre-auth modal used from the school-select screen;
 *                          same two-step flow, embedded in a modal.
 *
 * Phase 2+ will add job postings, auto-generated landing pages, applications,
 * chat, and quota tracking on top of the org_tools rows seeded here.
 */
import React, { useState, useEffect } from "react";
import {
  ArrowLeft, ArrowRight, Building2, Code2, Loader2, ShieldCheck, Sparkles, X, AlertTriangle,
} from "lucide-react";
import { db } from "../supabaseClient.js";
import { C } from "../config/theme.js";
import { Card, Btn, PageHeader, Spinner, EmptyState, TableSkeleton } from "../components/ui.jsx";
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
                {p.key === "dev_shop" ? <Code2 size={20} color={C.blue}/> : <Building2 size={20} color={C.blue}/>}
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
      setErr("Organization name, admin email, and password are required."); return;
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
        {preset?.key === "dev_shop"
          ? <Code2 size={16} color={C.blue}/>
          : <Building2 size={16} color={C.blue}/>}
        <div style={{ fontSize: 12.5, color: C.textSoft }}>
          <b style={{ color: C.text }}>{preset?.name || "General business"}</b>
          {" "}preset — tools will be enabled for this organization on creation.
        </div>
      </div>

      {err && <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", color: "#b91c1c",
        padding: "10px 14px", borderRadius: 8, fontSize: 12, marginBottom: 16, fontWeight: 600 }}>{err}</div>}

      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase",
        letterSpacing: .7, marginBottom: 10 }}>Organization Details</div>
      {inp("Organization Name", "name", { req: true, placeholder: "e.g. Acme Inc" })}
      {inp("Address", "address", { placeholder: "e.g. 12 Organization Road, Lagos" })}
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
        {saving ? <><Loader2 size={16} style={{ animation: "spin .7s linear infinite" }}/> Creating Organization…</>
          : <>Create Organization & Continue <ArrowRight size={15}/></>}
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
      <PageHeader icon="building" title="Register an Organization"
        subtitle="Choose a business-type preset — it decides which tools and defaults the new organization starts with."
        action={<Btn onClick={() => notify("Pick a preset to continue")} outline sm>Help</Btn>}/>
      {loading
        ? <TableSkeleton rows={4} cols={3}/>
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
                <ShieldCheck size={14}/> Creating an organization here registers a brand-new workspace with its own admin login.
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
    notify(`${school?.name || "Organization"} created successfully ✓`);
    // Hand off to the school-select screen: clear local session + school so the
    // new admin can sign in to their fresh organization.
    clearSession(); clearSelectedSchool();
    window.location.reload();
  };

  if (loading) return <div style={{ padding: 40 }}><Spinner text="Loading preset…"/></div>;

  if (!preset) {
    return (
      <div style={{ padding: "20px 24px", maxWidth: 900, margin: "0 auto" }}>
        <PageHeader icon="building" title="Register an Organization" subtitle="Pick a preset first."/>
        <EmptyState icon={<Building2 size={28} color={C.muted}/>}
          title="No preset selected"
          message="Choose a business-type preset before entering organization details."
          action={<Btn onClick={() => setPage("org-create")}><ArrowLeft size={14}/> Back to presets</Btn>}/>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 24px", maxWidth: 720, margin: "0 auto" }}>
      <PageHeader icon="building" title={`Create ${preset.name} Organization`}
        subtitle="The preset's tools are enabled automatically when the organization is created."/>
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
              {step === "preset" ? "Register Your Business" : `Create ${preset?.name || "Your"} Organization`}
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              {step === "preset"
                ? "Step 1 of 2 — choose your business type"
                : "Step 2 of 2 — organization details"}
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
