/**
 * Email login + business picker (Phase 6).
 *
 * Flow: user enters one email + password → login_lookup_by_email RPC returns
 * every business (school/org) that email belongs to (admin / staff / member)
 * → we authenticate against Supabase Auth using each identity's deterministic
 * synthetic email (same password) → the user picks which business to open →
 * the app enters that workspace.
 *
 * The classic "pick organization → ID + password" flow stays available via
 * onClassic() for education/student users.
 */
import React, { useState, useRef, useEffect } from "react";
import { ArrowLeft, ArrowRight, Briefcase, Building2, Loader2, Lock, Mail, ShieldCheck, Users } from "lucide-react";
import { supabase, db } from "../supabaseClient.js";
import { C } from "../config/theme.js";
import { PRODUCT } from "../config/product.js";

const roleMeta = {
  admin:   { label: "Admin",      icon: <ShieldCheck size={14}/>, color: "#111827" },
  teacher: { label: "Staff",      icon: <Users size={14}/>,       color: C.blue },
  student: { label: "Member",     icon: <Briefcase size={14}/>,   color: C.amber },
};

const studentStatusMsg = {
  inactive:  "Your account is currently inactive. Please contact the organization office.",
  suspended: "Your account has been suspended. Please contact the organization administration.",
  graduated: "This account belongs to a graduated member and is no longer active.",
  withdrawn: "This account has been withdrawn and is no longer active.",
  left:      "This account is no longer active. Please contact the organization office.",
};

export function EmailAuthPage({ onLoginSuccess, onClassic, onRegister, notify }) {
  const [step, setStep] = useState("login"); // 'login' | 'picking'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [activeEmail, setActiveEmail] = useState(null); // auth email with live session
  const passwordRef = useRef("");
  const [enteringId, setEnteringId] = useState(null);

  const reset = () => {
    setStep("login"); setErr(""); setCandidates([]); setActiveEmail(null);
    setPassword(""); passwordRef.current = "";
    supabase.auth.signOut().catch(() => {});
  };

  const submit = async () => {
    const em = email.trim().toLowerCase();
    const pw = password.trim();
    if (!em || !pw) { setErr("Enter your email and password."); return; }
    setLoading(true); setErr("");

    const { data, error } = await db.loginLookupByEmail(em);
    if (error) {
      setLoading(false);
      const isMissing = /PGRST202|could not find the function|function .* does not exist/i.test(error?.message || "");
      setErr(isMissing
        ? "Email login isn't enabled on this database yet — the login_lookup_by_email function (migration 019) hasn't been applied. Use the organization + ID login below for now."
        : "Email login isn't available for this site yet — use the organization + ID login below.");
      return;
    }
    if (!data || data.length === 0) {
      setLoading(false);
      setErr("No account found for this email. If you log in with a Staff/Member ID, use the organization login below.");
      return;
    }

    // Dedupe per business, priority admin > teacher > student
    const rank = { admin: 3, teacher: 2, student: 1 };
    const bySchool = new Map();
    data.forEach(r => {
      const cur = bySchool.get(r.school_id);
      if (!cur || rank[r.role] > rank[cur.role]) bySchool.set(r.school_id, r);
    });
    const list = Array.from(bySchool.values());

    // Try to authenticate each identity (same password) until one works
    passwordRef.current = pw;
    let authed = null;
    for (const c of list) {
      try {
        const { error: ae } = await supabase.auth.signInWithPassword({ email: c.auth_email, password: pw });
        if (!ae) { authed = c; break; }
      } catch { /* try next */ }
    }
    if (!authed) {
      setLoading(false);
      setErr("Wrong email or password — or no login account exists for this email yet. If your organization was created before email login, use the organization + ID login below.");
      return;
    }
    setActiveEmail(authed.auth_email);
    setCandidates(list);
    setLoading(false);
    if (list.length === 1) {
      await enterBusiness(list[0]);
    } else {
      setStep("picking");
    }
  };

  const enterBusiness = async (c) => {
    setEnteringId(c.school_id);
    setErr("");
    try {
      // Ensure the live session belongs to this business's identity
      let authUser = null;
      if (c.auth_email !== activeEmail) {
        const { data, error } = await supabase.auth.signInWithPassword({ email: c.auth_email, password: passwordRef.current });
        if (error) throw new Error("Could not open that business with this password.");
        authUser = data?.user || null;
      } else {
        const { data } = await supabase.auth.getUser();
        authUser = data?.user || null;
      }

      const school = { id: c.school_id, name: c.school_name };

      if (c.role === "teacher") {
        const { data: t, error: te } = await db.loginFindTeacher(c.local_id, c.school_id);
        if (te) throw te;
        if (!t) throw new Error("Account not found in this business.");
        const access = await db.getLoginAccessSettings(c.school_id);
        if (access?.login_teachers_disabled === "true") throw new Error("Staff logins are currently disabled. Please contact the organization office.");
        db.recordLogin("teacher", t.id);
        onLoginSuccess({
          id: String(t.id), role: t.role || "teacher", name: t.display_name || t.full_name,
          staff_id: t.staff_id, teacher_db_id: t.id, email: t.email,
          school_id: c.school_id, _authUserId: authUser?.id, _userType: "teacher",
        }, school);
        return;
      }

      if (c.role === "student") {
        const { data: st, error: se } = await db.loginFindStudent(c.local_id, c.school_id);
        if (se) throw se;
        if (!st) throw new Error("Account not found in this business.");
        if (st.status && st.status !== "active") throw new Error(studentStatusMsg[st.status] || "Your account is not active. Please contact the organization office.");
        const access = await db.getLoginAccessSettings(c.school_id);
        if (access?.login_students_disabled === "true") throw new Error("Member logins are currently disabled. Please contact the organization office.");
        db.recordLogin("student", st.id);
        onLoginSuccess({
          id: st.id, role: "student", name: st.display_name || st.name || "Member",
          student_id: st.id, class_id: st.class_id || null, email: st.email,
          school_id: c.school_id, _authUserId: authUser?.id, _userType: "student",
        }, school);
        return;
      }

      // admin
      const { data: sa, error: sae } = await db.loginGetSchoolAdmin(c.school_id);
      if (sae) throw sae;
      onLoginSuccess({
        id: "admin", role: "admin", name: sa?.admin_name || "Administrator",
        email: c.auth_email, is_admin: true,
        school_id: c.school_id, _authUserId: authUser?.id,
      }, school);
    } catch (e) {
      setEnteringId(null);
      setErr(e?.message || "Could not open that business. Please try again.");
    }
  };

  // ── Picking screen ────────────────────────────────────────────────────────
  if (step === "picking") {
    return (
      <AuthShell>
        <button onClick={reset} style={linkBtnStyle}>
          <ArrowLeft size={14}/> Use a different account
        </button>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", marginBottom: 6 }}>Choose a business</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,.55)", marginBottom: 20, lineHeight: 1.5 }}>
          You can manage {candidates.length} business{candidates.length > 1 ? "es" : ""} with <b style={{ color: "#fff" }}>{email.trim().toLowerCase()}</b>.
        </div>
        {err && <ErrorBox msg={err}/>}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {candidates.map(c => {
            const meta = roleMeta[c.role] || roleMeta.student;
            return (
              <button key={c.school_id + c.role} onClick={() => enterBusiness(c)} disabled={!!enteringId}
                style={{ background: "rgba(255,255,255,.05)", border: "1.5px solid rgba(255,255,255,.12)", borderRadius: 14, padding: "14px 18px",
                  cursor: enteringId ? "wait" : "pointer", textAlign: "left", width: "100%",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                  transition: "all .15s", fontFamily: "inherit" }}
                onMouseEnter={e => { if (!enteringId) { e.currentTarget.style.borderColor = C.blue; e.currentTarget.style.boxShadow = C.shadowMd; } }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.boxShadow = "none"; }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.14)",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#fff" }}>
                    <Building2 size={18}/>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 800, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.school_name}</div>
                    <div style={{ marginTop: 3, display: "inline-flex", alignItems: "center", gap: 5, background: `${meta.color}14`,
                      color: meta.color, fontSize: 11, fontWeight: 800, padding: "2px 9px", borderRadius: 10 }}>
                      {meta.icon} {meta.label}
                    </div>
                  </div>
                </div>
                {enteringId === c.school_id
                  ? <Loader2 size={18} style={{ animation: "spin .7s linear infinite", color: C.blue, flexShrink: 0 }}/>
                  : <ArrowRight size={18} color={C.light} style={{ flexShrink: 0 }}/>}
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={onRegister} style={linkBtnStyle}><Building2 size={14}/> Register a new organization</button>
          <button onClick={onClassic} style={linkBtnStyle}><Lock size={14}/> Use organization + ID login</button>
        </div>
      </AuthShell>
    );
  }

  // ── Login screen ──────────────────────────────────────────────────────────
  return (
    <AuthShell>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 21, fontWeight: 900, color: "#fff", letterSpacing: "-.01em" }}>{PRODUCT.title.replace(" — Business Operations Platform", "")}</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,.55)", marginTop: 4 }}>Log in with your email</div>
      </div>

      {err && <ErrorBox msg={err}/>}

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Email</label>
        <div style={{ position: "relative" }}>
          <Mail size={15} color={C.muted} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }}/>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
            autoComplete="email"
            style={{ width: "100%", padding: "12px 13px 12px 38px", border: "1.5px solid rgba(255,255,255,.14)", borderRadius: 11,
              fontSize: 14, background: "rgba(255,255,255,.06)", color: "#fff", outline: "none", boxSizing: "border-box",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,.04)" }}/>
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={labelStyle}>Password</label>
        <div style={{ position: "relative" }}>
          <Lock size={15} color={C.muted} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }}/>
          <input type={showPass ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") submit(); }}
            placeholder="••••••••" autoComplete="current-password"
            style={{ width: "100%", padding: "12px 13px 12px 38px", border: "1.5px solid rgba(255,255,255,.14)", borderRadius: 11,
              fontSize: 14, background: "rgba(255,255,255,.06)", color: "#fff", outline: "none", boxSizing: "border-box",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,.04)" }}/>
          <button type="button" onClick={() => setShowPass(s => !s)}
            style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none",
              border: "none", fontSize: 11.5, fontWeight: 700, color: C.muted, cursor: "pointer" }}>
            {showPass ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      <button onClick={submit} disabled={loading}
        style={{ width: "100%", background: loading ? "rgba(255,255,255,.25)" : "#fff", color: "#0B0F17", border: "none",
          padding: "14px", borderRadius: 12, fontSize: 15, fontWeight: 800,
          boxShadow: "0 10px 30px -10px rgba(255,255,255,.35)",
          cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {loading ? <><Loader2 size={16} style={{ animation: "spin .7s linear infinite" }}/> Logging in…</> : <>Log in</>}
      </button>

      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 8 }}>
        <button onClick={onClassic} style={linkBtnStyle}><Lock size={14}/> Use organization + ID login</button>
        <button onClick={onRegister} style={linkBtnStyle}><Building2 size={14}/> Register a new organization</button>
      </div>
    </AuthShell>
  );
}

// ── Shared shell ────────────────────────────────────────────────────────────
function AuthShell({ children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "radial-gradient(900px 500px at 50% -10%, rgba(255,255,255,.06), transparent 60%), linear-gradient(160deg,#0B0F17 0%,#121826 55%,#0B0F17 100%)",
      padding: 24, fontFamily: "'Segoe UI',system-ui,sans-serif", position: "relative", overflow: "hidden" }}>
      {/* subtle grid */}
      <div style={{ position: "absolute", inset: 0, backgroundImage:
        "linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)",
        backgroundSize: "44px 44px", maskImage: "radial-gradient(720px 420px at 50% 0%, #000 30%, transparent 75%)", pointerEvents: "none" }}/>
      {/* brand */}
      <div style={{ position: "absolute", top: 26, left: 0, right: 0, textAlign: "center", pointerEvents: "none" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
          <svg width="30" height="30" viewBox="0 0 48 48"><rect width="48" height="48" rx="13" fill="#fff"/><path d="M13 13h5v22h-5zM18 13h7.5c5.5 0 8.5 2.7 8.5 7.1 0 2.7-1.4 4.8-3.9 5.9L35 35h-6.2l-5.1-7.5H18V35h-5V13h5Zm0 9.8h7c2.4 0 3.7-.9 3.7-2.7s-1.3-2.7-3.7-2.7h-7v5.4Z" fill="#0B0F17"/></svg>
          <span style={{ color: "#fff", fontWeight: 900, fontSize: 15, letterSpacing: "-.01em" }}>JAMES-DENNING</span>
        </div>
      </div>
      <div style={{ width: "100%", maxWidth: 420, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)",
        borderRadius: 22, padding: "34px 30px", boxShadow: "0 30px 70px -24px rgba(0,0,0,.75), inset 0 1px 0 rgba(255,255,255,.07)",
        backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", position: "relative" }}>
        {children}
      </div>
    </div>
  );
}

const labelStyle = { display: "block", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.5)", textTransform: "uppercase", letterSpacing: .7, marginBottom: 6 };
const linkBtnStyle = { background: "none", border: "none", padding: "4px 0", fontSize: 13, fontWeight: 700,
  color: "rgba(255,255,255,.6)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "inherit", transition: "color .15s" };

function ErrorBox({ msg }) {
  return (
    <div style={{ background: "rgba(254,242,242,.08)", border: "1.5px solid rgba(252,165,165,.4)", color: "#FCA5A5",
      padding: "11px 14px", borderRadius: 10, fontSize: 12.5, marginBottom: 16, fontWeight: 600, lineHeight: 1.5 }}>{msg}</div>
  );
}
