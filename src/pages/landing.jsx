/**
 * Public landing page (Phase 7 redesign) — served at "/".
 * Premium, dark-hero, JAMES-DENNING monochrome with a restrained warm accent.
 * Self-contained: no external assets, CSS keyframes + IntersectionObserver
 * reveals, and a pure-CSS app mockup as the hero visual.
 */
import React, { useState, useEffect, useRef } from "react";
import {
  ArrowRight, ArrowUpRight, Briefcase, Building2, CheckCircle2, CreditCard,
  Layers, Lock, Megaphone, PieChart, Rocket, Users, Zap,
} from "lucide-react";
import { C } from "../config/theme.js";
import { loadSelectedSchool, loadSession } from "../utils/session.js";

// ── Reveal-on-scroll hook ─────────────────────────────────────────────────────
function useReveal() {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setSeen(true); obs.disconnect(); }
    }, { threshold: 0.15 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, seen };
}
const Reveal = ({ children, delay = 0, style = {} }) => {
  const { ref, seen } = useReveal();
  return (
    <div ref={ref} style={{
      opacity: seen ? 1 : 0, transform: seen ? "translateY(0)" : "translateY(26px)",
      transition: `opacity .7s cubic-bezier(.16,1,.3,1) ${delay}ms, transform .7s cubic-bezier(.16,1,.3,1) ${delay}ms`,
      ...style,
    }}>{children}</div>
  );
};

const FEATURES = [
  { icon: <Layers size={20}/>, title: "One calm workspace", text: "Overview, team, people, billing, communication and reporting in a single dashboard for any business type." },
  { icon: <Users size={20}/>, title: "Customers & CRM", text: "Contacts, companies, leads and notes in one searchable list — always at hand." },
  { icon: <CheckCircle2 size={20}/>, title: "Projects & tasks", text: "Plan projects, break them into tasks, and track progress from to-do to done." },
  { icon: <CreditCard size={20}/>, title: "Invoices & billing", text: "Numbered invoices with line items — move them from draft to paid in one click." },
  { icon: <Briefcase size={20}/>, title: "Hiring with landing pages", text: "Post a role, get a ready-made mobile application page, and point your ads at it." },
  { icon: <PieChart size={20}/>, title: "Quota & goal tracking", text: "Define your own metrics at hire time, log progress, see where things stand." },
  { icon: <Megaphone size={20}/>, title: "Communication", text: "Notices, email and in-app notifications — one loop, no second system." },
  { icon: <Building2 size={20}/>, title: "Multiple businesses", text: "One email, many organizations. Log in once, switch between everything you manage." },
];

const STATS = [
  { n: "1", label: "login email, every business" },
  { n: "8+", label: "modules out of the box" },
  { n: "0", label: "school-shaped friction" },
  { n: "24h", label: "from ad click to application" },
];

const STEPS = [
  { n: "01", title: "Log in with your email", text: "The email you set when you register your organization is your login. One account, every business you manage." },
  { n: "02", title: "Choose a business", text: "Land on a clean picker with every organization you can access — admin, staff or member." },
  { n: "03", title: "Run your operations", text: "People, billing, projects, invoices, hiring, quota tracking — one calm workspace." },
];

// ── Pure-CSS app mockup for the hero ──────────────────────────────────────────
function AppMockup() {
  const bars = [42, 68, 54, 88, 62, 95, 74];
  return (
    <div style={{
      borderRadius: 18, overflow: "hidden", border: "1px solid rgba(255,255,255,.09)",
      boxShadow: "0 40px 90px -30px rgba(0,0,0,.7), 0 0 0 1px rgba(0,0,0,.4), 0 24px 48px -24px rgba(0,0,0,.6)",
      background: "#0D1220", textAlign: "left", position: "relative",
    }}>
      {/* window chrome */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", background: "rgba(255,255,255,.04)", borderBottom: "1px solid rgba(255,255,255,.07)" }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#3A4356" }}/>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#3A4356" }}/>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#3A4356" }}/>
        <span style={{ marginLeft: 10, fontSize: 10, color: "rgba(255,255,255,.35)", letterSpacing: ".02em" }}>app · Overview</span>
      </div>
      <div style={{ display: "flex" }}>
        {/* mini sidebar */}
        <div style={{ width: 34, padding: "10px 7px", background: "rgba(255,255,255,.03)", display: "flex", flexDirection: "column", gap: 6, borderRight: "1px solid rgba(255,255,255,.06)" }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ height: 7, borderRadius: 4, background: i === 0 ? "#E4E9EF" : "rgba(255,255,255,.12)" }}/>
          ))}
        </div>
        {/* main panel */}
        <div style={{ flex: 1, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ height: 9, width: 90, borderRadius: 5, background: "rgba(255,255,255,.7)" }}/>
            <div style={{ height: 16, width: 52, borderRadius: 8, background: "#E4E9EF", opacity: .95 }}/>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 12 }}>
            {[["Revenue", "₦2.4m", "#E4E9EF"], ["Customers", "148", "#C8CFD9"], ["Projects", "12", "#9AA4B2"], ["Hires", "4", "#6B7280"]].map(([l, v, col]) => (
              <div key={l} style={{ background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 10, padding: "9px 10px" }}>
                <div style={{ fontSize: 7.5, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>{l}</div>
                <div style={{ fontSize: 13, fontWeight: 900, color: "#fff" }}>{v}</div>
                <div style={{ height: 3, width: "100%", borderRadius: 2, background: `${col}66`, marginTop: 5, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: "70%", background: col, borderRadius: 2 }}/>
                </div>
              </div>
            ))}
          </div>
          <div style={{ background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 7.5, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Quota progress · this month</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 42 }}>
              {bars.map((h, i) => (
                <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: "4px 4px 2px 2px",
                  background: i === bars.length - 1 ? "#E4E9EF" : "rgba(255,255,255,.14)" }}/>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 8, color: "rgba(255,255,255,.45)" }}>At 74% of quota — 37 of 50 deliverables logged</div>
          </div>
        </div>
      </div>
      {/* glow */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(420px 200px at 20% 0%, rgba(255,255,255,.06), transparent 60%)" }}/>
    </div>
  );
}

// ── Mini /apply mockup (the differentiator) ───────────────────────────────────
function ApplyMockup() {
  return (
    <div style={{ maxWidth: 380, margin: "0 auto", borderRadius: 18, overflow: "hidden",
      border: "1px solid rgba(255,255,255,.09)", boxShadow: "0 40px 90px -30px rgba(0,0,0,.7)",
      background: "#F7F7F5", textAlign: "left" }}>
      <div style={{ padding: "18px 18px 6px", textAlign: "center" }}>
        <div style={{ fontSize: 8.5, fontWeight: 800, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: ".14em", marginBottom: 6 }}>Nova Studio is hiring</div>
        <div style={{ fontSize: 17, fontWeight: 900, color: "#111827", letterSpacing: "-.02em" }}>Senior Product Designer</div>
        <div style={{ marginTop: 8 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#fff", border: "1px solid #E5E7EB",
            borderRadius: 20, padding: "4px 12px", fontSize: 10.5, fontWeight: 800, color: "#111827" }}>
            <Zap size={11} color="#6B7280"/> ₦400k – ₦600k / month
          </span>
        </div>
      </div>
      <div style={{ padding: "12px 18px" }}>
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#111827", marginBottom: 8 }}>Apply now</div>
          {["Full name", "Email", "Asking price"].map((ph, i) => (
            <div key={ph} style={{ height: 22, borderRadius: 7, border: "1px solid #E5E7EB", marginBottom: 7,
              padding: "0 9px", display: "flex", alignItems: "center", fontSize: 8.5, color: "#9CA3AF" }}>
              {i === 2 ? "₦ 450,000" : ph}
            </div>
          ))}
          <div style={{ height: 30, borderRadius: 9, background: "#111827", color: "#fff", fontSize: 10, fontWeight: 800,
            display: "flex", alignItems: "center", justifyContent: "center" }}>
            Submit application
          </div>
        </div>
        <div style={{ textAlign: "center", fontSize: 8, color: "#9CA3AF", marginTop: 10, letterSpacing: ".02em" }}>
          Powered by JAMES-DENNING
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  useEffect(() => {
    try { setLoggedIn(!!loadSession() || !!loadSelectedSchool()); } catch { setLoggedIn(false); }
  }, []);

  return (
    <div style={{ background: "#fff", color: C.text, fontFamily: "'Segoe UI',system-ui,sans-serif", minHeight: "100vh", WebkitTapHighlightColor: "transparent" }}>
      <style>{`
        @keyframes jdFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
        @keyframes jdPulse { 0%,100%{opacity:.55} 50%{opacity:1} }
        @keyframes jdShimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        .jd-grid { background-image: linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px); background-size: 44px 44px; mask-image: radial-gradient(720px 420px at 50% 0%, #000 30%, transparent 75%); }
      `}</style>

      {/* ── NAV ── */}
      <header style={{ position: "sticky", top: 0, zIndex: 20,
        background: "rgba(11,15,23,.72)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
        borderBottom: "1px solid rgba(255,255,255,.06)" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "13px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <svg width="30" height="30" viewBox="0 0 48 48" role="img" aria-label="JAMES-DENNING">
              <rect width="48" height="48" rx="13" fill="#fff"/>
              <path d="M13 13h5v22h-5zM18 13h7.5c5.5 0 8.5 2.7 8.5 7.1 0 2.7-1.4 4.8-3.9 5.9L35 35h-6.2l-5.1-7.5H18V35h-5V13h5Zm0 9.8h7c2.4 0 3.7-.9 3.7-2.7s-1.3-2.7-3.7-2.7h-7v5.4Z" fill="#0B0F17"/>
            </svg>
            <span style={{ fontSize: 16, fontWeight: 900, color: "#fff", letterSpacing: "-.01em" }}>JAMES-DENNING</span>
          </div>
          <nav style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <a href="#features" style={{ fontSize: 13, color: "rgba(255,255,255,.62)", textDecoration: "none", fontWeight: 600, transition: "color .15s" }}
              onMouseEnter={e => e.currentTarget.style.color = "#fff"} onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,.62)"}>Features</a>
            <a href="#how" style={{ fontSize: 13, color: "rgba(255,255,255,.62)", textDecoration: "none", fontWeight: 600, transition: "color .15s" }}
              onMouseEnter={e => e.currentTarget.style.color = "#fff"} onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,.62)"}>How it works</a>
            <a href="/app" style={{ fontSize: 13, fontWeight: 800, color: "#0B0F17", background: "#fff",
              padding: "9px 20px", borderRadius: 10, textDecoration: "none", boxShadow: "0 4px 16px rgba(255,255,255,.15)",
              transition: "transform .15s, box-shadow .15s" }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(255,255,255,.22)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(255,255,255,.15)"; }}>
              {loggedIn ? "Open my workspace" : "Log in"}
            </a>
          </nav>
        </div>
      </header>

      {/* ── HERO ── */}
      <section style={{ position: "relative", background: C.heroGrad, color: "#fff", overflow: "hidden" }}>
        <div className="jd-grid" style={{ position: "absolute", inset: 0 }}/>
        <div style={{ position: "absolute", width: 640, height: 640, borderRadius: "50%", left: "50%", top: -260, transform: "translateX(-50%)",
          background: "radial-gradient(circle, rgba(255,255,255,.07), transparent 65%)", pointerEvents: "none" }}/>
        <div style={{ position: "relative", maxWidth: 1120, margin: "0 auto", padding: "84px 22px 60px", textAlign: "center" }}>
          <Reveal>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,.06)",
              border: "1px solid rgba(255,255,255,.12)", borderRadius: 20, padding: "7px 15px", fontSize: 12, fontWeight: 700,
              color: "rgba(255,255,255,.75)", marginBottom: 26, backdropFilter: "blur(6px)" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#E4E9EF", animation: "jdPulse 2.2s ease-in-out infinite" }}/>
              Log in once · manage every business you run
            </div>
          </Reveal>
          <Reveal delay={90}>
            <h1 style={{ fontSize: "clamp(34px,6vw,64px)", fontWeight: 900, lineHeight: 1.06, letterSpacing: "-.03em",
              margin: "0 auto 22px", maxWidth: 820, color: "#fff" }}>
              One calm workspace for running{" "}
              <span style={{ background: "linear-gradient(100deg,#FFFFFF 10%,#C8CFD9 55%,#9AA4B2 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>your organization</span>
            </h1>
          </Reveal>
          <Reveal delay={180}>
            <p style={{ fontSize: "clamp(15px,2vw,18px)", color: "rgba(255,255,255,.62)", lineHeight: 1.7, maxWidth: 640, margin: "0 auto 34px" }}>
              People, billing, projects, customers, invoices and hiring — in one business dashboard.
              Post a role, get a ready-made application page, and run ads straight at it.
            </p>
          </Reveal>
          <Reveal delay={260}>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <a href="/app" style={{ background: "#fff", color: "#0B0F17", fontWeight: 800, fontSize: 15,
                padding: "15px 30px", borderRadius: 13, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8,
                boxShadow: "0 10px 34px -8px rgba(255,255,255,.35)", transition: "transform .15s, boxShadow .15s" }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 16px 44px -8px rgba(255,255,255,.45)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 10px 34px -8px rgba(255,255,255,.35)"; }}>
                {loggedIn ? "Open my workspace" : "Get started"} <ArrowRight size={16}/>
              </a>
              <a href="#features" style={{ background: "rgba(255,255,255,.06)", color: "#fff", fontWeight: 800, fontSize: 15,
                padding: "15px 30px", borderRadius: 13, textDecoration: "none", border: "1px solid rgba(255,255,255,.14)",
                backdropFilter: "blur(6px)", transition: "background .15s" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,.1)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,.06)"}>
                See features
              </a>
            </div>
          </Reveal>

          {/* Hero visual */}
          <Reveal delay={340}>
            <div style={{ maxWidth: 760, margin: "58px auto 0", animation: "jdFloat 7s ease-in-out infinite" }}>
              <AppMockup/>
              <div style={{ marginTop: 14, fontSize: 11.5, color: "rgba(255,255,255,.35)", letterSpacing: ".04em" }}>
                A live preview of your workspace — Overview, customers, invoices, quota tracking.
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── STATS BAND ── */}
      <section style={{ background: "#080B11", borderTop: "1px solid rgba(255,255,255,.05)" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "34px 22px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 20 }}>
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * 70} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 30, fontWeight: 900, color: "#fff", letterSpacing: "-.02em" }}>
                {s.n}
                <span style={{ color: "#C8CFD9" }}>.</span>
              </div>
              <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.45)", marginTop: 4, fontWeight: 600 }}>{s.label}</div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" style={{ background: "#F7F7F5", padding: "84px 22px" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <Reveal style={{ textAlign: "center", marginBottom: 46 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: ".18em", marginBottom: 12 }}>Everything you need</div>
            <h2 style={{ fontSize: "clamp(26px,4vw,40px)", fontWeight: 900, letterSpacing: "-.02em", margin: "0 0 12px" }}>Built for every kind of business</h2>
            <p style={{ fontSize: 14.5, color: C.muted, maxWidth: 540, margin: "0 auto", lineHeight: 1.65 }}>
              General-purpose by default — service firms, shops, agencies, studios, and everything in between.
            </p>
          </Reveal>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 80}>
                <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 18, padding: 24, height: "100%",
                  transition: "transform .2s, box-shadow .2s, border-color .2s", position: "relative", overflow: "hidden" }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 24px 48px -20px rgba(17,24,39,.18)"; e.currentTarget.style.borderColor = "#D1D5DB"; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = "#E5E7EB"; }}>
                  <div style={{ width: 44, height: 44, borderRadius: 13, background: "linear-gradient(135deg,#111827,#1F2937)",
                    color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16,
                    boxShadow: "0 8px 20px -6px rgba(17,24,39,.35)" }}>{f.icon}</div>
                  <div style={{ fontSize: 15.5, fontWeight: 800, marginBottom: 7 }}>{f.title}</div>
                  <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.65 }}>{f.text}</div>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2,
                    background: "linear-gradient(90deg,transparent,rgba(17,24,39,.16),transparent)", opacity: 0, transition: "opacity .2s" }}
                    onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0}/>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── HIRING SHOWCASE (the differentiator) ── */}
      <section style={{ position: "relative", background: "linear-gradient(180deg,#0B0F17 0%,#0E1420 100%)", color: "#fff", overflow: "hidden", padding: "90px 22px" }}>
        <div className="jd-grid" style={{ position: "absolute", inset: 0, opacity: .6 }}/>
        <div style={{ position: "relative", maxWidth: 1120, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 56, alignItems: "center" }}>
          <Reveal>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#C8CFD9", textTransform: "uppercase", letterSpacing: ".18em", marginBottom: 14 }}>
              <Briefcase size={13} style={{ verticalAlign: "-2px", marginRight: 6 }}/> The hiring differentiator
            </div>
            <h2 style={{ fontSize: "clamp(26px,4vw,40px)", fontWeight: 900, letterSpacing: "-.02em", lineHeight: 1.15, margin: "0 0 16px", color: "#fff" }}>
              Post a role. Get an ad-ready landing page. Instantly.
            </h2>
            <p style={{ fontSize: 15, color: "rgba(255,255,255,.6)", lineHeight: 1.7, marginBottom: 26, maxWidth: 480 }}>
              Every role you post becomes a mobile-first application page at <b style={{ color: "#fff" }}>/apply/your-role</b>.
              Applicants state their qualifications and asking price; you negotiate over a private thread,
              hire, and track an owner-defined quota. You run your own ads — we host the destination.
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {["Private application thread with live chat", "Quota tracking you define — metric, target, period", "No page builder, no ad platform — just the page"].map(t => (
                <li key={t} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13.5, color: "rgba(255,255,255,.72)" }}>
                  <CheckCircle2 size={15} color="#C8CFD9" style={{ flexShrink: 0 }}/> {t}
                </li>
              ))}
            </ul>
            <a href="#how" style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 28, fontSize: 14, fontWeight: 800, color: "#fff", textDecoration: "none", borderBottom: `2px solid ${C.accent}`, paddingBottom: 3 }}>
              See how it works <ArrowUpRight size={15}/>
            </a>
          </Reveal>
          <Reveal delay={140} style={{ position: "relative" }}>
            <div style={{ position: "absolute", inset: -30, background: "radial-gradient(340px 260px at 50% 40%, rgba(255,255,255,.05), transparent 70%)", pointerEvents: "none" }}/>
            <ApplyMockup/>
          </Reveal>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" style={{ background: "#fff", padding: "84px 22px" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <Reveal style={{ textAlign: "center", marginBottom: 46 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: ".18em", marginBottom: 12 }}>How it works</div>
            <h2 style={{ fontSize: "clamp(26px,4vw,40px)", fontWeight: 900, letterSpacing: "-.02em", margin: 0 }}>Up and running in three steps</h2>
          </Reveal>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 100}>
                <div style={{ border: "1px solid #E5E7EB", borderRadius: 18, padding: 28, position: "relative", background: "#FCFCFB", height: "100%" }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: "#6B7280", letterSpacing: ".06em", marginBottom: 14 }}>{s.n}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>{s.title}</div>
                  <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.65 }}>{s.text}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ position: "relative", background: C.heroGrad, color: "#fff", padding: "76px 22px", textAlign: "center", overflow: "hidden" }}>
        <div className="jd-grid" style={{ position: "absolute", inset: 0, opacity: .5 }}/>
        <div style={{ position: "relative", maxWidth: 640, margin: "0 auto" }}>
          <Reveal>
            <div style={{ width: 58, height: 58, borderRadius: 18, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.14)",
              display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 22px", color: "#C8CFD9" }}>
              <Rocket size={26}/>
            </div>
            <h2 style={{ fontSize: "clamp(26px,4vw,38px)", fontWeight: 900, letterSpacing: "-.02em", margin: "0 0 12px", color: "#fff" }}>
              Ready to run your business in one place?
            </h2>
            <p style={{ color: "rgba(255,255,255,.6)", fontSize: 15, lineHeight: 1.65, margin: "0 auto 30px", maxWidth: 440 }}>
              The email you register with is your login. One email — every business you manage.
            </p>
            <a href="/app" style={{ background: "#fff", color: "#0B0F17", fontWeight: 800, fontSize: 15,
              padding: "15px 34px", borderRadius: 13, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8,
              boxShadow: "0 12px 38px -8px rgba(255,255,255,.35)", transition: "transform .15s, box-shadow .15s" }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 18px 48px -8px rgba(255,255,255,.45)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 12px 38px -8px rgba(255,255,255,.35)"; }}>
              {loggedIn ? "Open my workspace" : "Log in with your email"} <ArrowRight size={16}/>
            </a>
            <div style={{ marginTop: 20, fontSize: 12, color: "rgba(255,255,255,.4)" }}>
              <Lock size={11} style={{ verticalAlign: "-1px", marginRight: 5 }}/> Registering an organization sets your login email — no separate setup.
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: "#080B11", padding: "36px 22px" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, color: "#fff", fontSize: 13.5, fontWeight: 800 }}>
            <svg width="22" height="22" viewBox="0 0 48 48"><rect width="48" height="48" rx="13" fill="#fff"/><path d="M13 13h5v22h-5zM18 13h7.5c5.5 0 8.5 2.7 8.5 7.1 0 2.7-1.4 4.8-3.9 5.9L35 35h-6.2l-5.1-7.5H18V35h-5V13h5Zm0 9.8h7c2.4 0 3.7-.9 3.7-2.7s-1.3-2.7-3.7-2.7h-7v5.4Z" fill="#0B0F17"/></svg>
            JAMES-DENNING
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.4)" }}>
            © {new Date().getFullYear()} JAMES-DENNING — One calm workspace for running your organization.
          </div>
        </div>
      </footer>
    </div>
  );
}
