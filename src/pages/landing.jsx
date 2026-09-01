/**
 * Public landing page (Phase 6) — served at "/" when no session exists.
 * Business-neutral JAMES-DENNING marketing page: hero, features, how-it-works,
 * and CTAs into the app (/app). No portal chrome, no auth.
 */
import React, { useState, useEffect } from "react";
import {
  ArrowRight, Briefcase, Building2, CheckCircle2, CreditCard,
  Layers, Lock, Megaphone, MessageSquare, PieChart, Rocket, Users,
} from "lucide-react";
import { C } from "../config/theme.js";
import { loadSelectedSchool, loadSession } from "../utils/session.js";

const FEATURES = [
  {
    icon: <Layers size={22}/>,
    title: "One calm workspace",
    text: "Overview, team, people, billing, communication and reporting in a single dashboard built for any business type.",
  },
  {
    icon: <Users size={22}/>,
    title: "Customers & CRM",
    text: "Keep contacts, companies, leads and notes in one list — searchable and always at hand.",
  },
  {
    icon: <CheckCircle2 size={22}/>,
    title: "Projects & tasks",
    text: "Plan projects, break them into tasks, and track progress from to-do to done.",
  },
  {
    icon: <CreditCard size={22}/>,
    title: "Invoices & billing",
    text: "Create numbered invoices with line items and move them from draft to paid.",
  },
  {
    icon: <Briefcase size={22}/>,
    title: "Hiring with landing pages",
    text: "Post a role and get a ready-made, mobile-first application page you can point ads at — applicants apply in minutes.",
  },
  {
    icon: <PieChart size={22}/>,
    title: "Quota & goal tracking",
    text: "Define your own metrics when you hire, log progress, and see where things stand — no pay math, ever.",
  },
  {
    icon: <Megaphone size={22}/>,
    title: "Communication",
    text: "Notices, email, and in-app notifications keep everyone in the loop without a second system.",
  },
  {
    icon: <Building2 size={22}/>,
    title: "Multiple businesses",
    text: "One email, many organizations. Log in once and switch between the businesses you manage.",
  },
];

const STEPS = [
  { n: "1", title: "Log in with your email", text: "No separate accounts per business — one email and password." },
  { n: "2", title: "Choose a business", text: "See every organization you can manage and pick one." },
  { n: "3", title: "Run your operations", text: "People, billing, projects, invoices, hiring — all in one calm workspace." },
];

export function LandingPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  useEffect(() => {
    try { setLoggedIn(!!loadSession() || !!loadSelectedSchool()); } catch { setLoggedIn(false); }
  }, []);

  return (
    <div style={{ background: "#fff", color: C.text, fontFamily: "'Segoe UI',system-ui,sans-serif", minHeight: "100vh" }}>
      {/* ── Nav ── */}
      <header style={{ position: "sticky", top: 0, background: "rgba(255,255,255,.92)", backdropFilter: "blur(8px)",
        borderBottom: `1px solid ${C.borderLight}`, zIndex: 10 }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <svg width="30" height="30" viewBox="0 0 48 48" role="img" aria-label="JAMES-DENNING">
              <rect width="48" height="48" rx="13" fill="#111827"/>
              <path d="M13 13h5v22h-5zM18 13h7.5c5.5 0 8.5 2.7 8.5 7.1 0 2.7-1.4 4.8-3.9 5.9L35 35h-6.2l-5.1-7.5H18V35h-5V13h5Zm0 9.8h7c2.4 0 3.7-.9 3.7-2.7s-1.3-2.7-3.7-2.7h-7v5.4Z" fill="#fff"/>
            </svg>
            <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-.01em" }}>JAMES-DENNING</span>
          </div>
          <nav style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <a href="#features" style={{ fontSize: 13, color: C.muted, textDecoration: "none", fontWeight: 600 }}>Features</a>
            <a href="#how" style={{ fontSize: 13, color: C.muted, textDecoration: "none", fontWeight: 600 }}>How it works</a>
            <a href="/app" style={{ fontSize: 13, fontWeight: 700, color: "#fff", background: "#111827",
              padding: "9px 18px", borderRadius: 10, textDecoration: "none" }}>
              {loggedIn ? "Open my workspace" : "Log in"}
            </a>
          </nav>
        </div>
      </header>

      {/* ── Hero ── */}
      <section style={{ maxWidth: 1080, margin: "0 auto", padding: "72px 20px 56px", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#F3F4F6", border: `1px solid ${C.borderLight}`,
          borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 22 }}>
          <Lock size={12}/> Log in once · manage every business you run
        </div>
        <h1 style={{ fontSize: "clamp(30px,5vw,52px)", fontWeight: 900, lineHeight: 1.12, letterSpacing: "-.02em", margin: "0 auto 18px", maxWidth: 760 }}>
          One calm workspace for running your organization
        </h1>
        <p style={{ fontSize: "clamp(15px,2vw,18px)", color: C.muted, lineHeight: 1.65, maxWidth: 620, margin: "0 auto 32px" }}>
          JAMES-DENNING brings your people, billing, projects, customers, invoices and hiring into
          one business dashboard — with ready-made landing pages you can point your ads at.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <a href="/app" style={{ background: "#111827", color: "#fff", fontWeight: 800, fontSize: 15,
            padding: "14px 28px", borderRadius: 12, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8 }}>
            Get started <ArrowRight size={16}/>
          </a>
          <a href="#features" style={{ background: "#fff", color: C.text, fontWeight: 800, fontSize: 15,
            padding: "14px 28px", borderRadius: 12, textDecoration: "none", border: `1.5px solid ${C.border}` }}>
            See features
          </a>
        </div>
        <div style={{ marginTop: 40, display: "flex", gap: 28, justifyContent: "center", flexWrap: "wrap", fontSize: 12.5, color: C.muted, fontWeight: 600 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><CheckCircle2 size={14} color={C.green}/> Business-first dashboard</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><CheckCircle2 size={14} color={C.green}/> Ad-ready hiring pages</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><CheckCircle2 size={14} color={C.green}/> Owner-defined quota tracking</span>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" style={{ background: "#F7F7F5", padding: "64px 20px" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <h2 style={{ fontSize: 26, fontWeight: 900, textAlign: "center", margin: "0 0 8px" }}>Everything your business needs</h2>
          <p style={{ fontSize: 14, color: C.muted, textAlign: "center", margin: "0 auto 36px", maxWidth: 520, lineHeight: 1.6 }}>
            General-purpose by default — built for service firms, shops, agencies, and every business in between.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{ background: "#fff", border: `1px solid ${C.borderLight}`, borderRadius: 16, padding: 22 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: "#111827", color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>{f.icon}</div>
                <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>{f.title}</div>
                <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>{f.text}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how" style={{ maxWidth: 1080, margin: "0 auto", padding: "64px 20px" }}>
        <h2 style={{ fontSize: 26, fontWeight: 900, textAlign: "center", margin: "0 0 36px" }}>How it works</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 16 }}>
          {STEPS.map(s => (
            <div key={s.n} style={{ border: `1px solid ${C.borderLight}`, borderRadius: 16, padding: 24, position: "relative" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#111827", color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 14, marginBottom: 12 }}>{s.n}</div>
              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>{s.title}</div>
              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>{s.text}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA band ── */}
      <section style={{ background: "#111827", padding: "56px 20px", textAlign: "center" }}>
        <div style={{ maxWidth: 620, margin: "0 auto" }}>
          <Rocket size={30} color="#fff" style={{ marginBottom: 14 }}/>
          <h2 style={{ color: "#fff", fontSize: 26, fontWeight: 900, margin: "0 0 10px" }}>Ready to run your business in one place?</h2>
          <p style={{ color: "rgba(255,255,255,.72)", fontSize: 14, lineHeight: 1.6, margin: "0 0 26px" }}>
            Log in with your email and see every business you manage.
          </p>
          <a href="/app" style={{ background: "#fff", color: "#111827", fontWeight: 800, fontSize: 15,
            padding: "14px 32px", borderRadius: 12, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8 }}>
            {loggedIn ? "Open my workspace" : "Log in now"} <ArrowRight size={16}/>
          </a>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ background: "#F7F7F5", padding: "32px 20px" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 800 }}>
            <MessageSquare size={14}/> JAMES-DENNING
          </div>
          <div style={{ fontSize: 12, color: C.light }}>
            © {new Date().getFullYear()} JAMES-DENNING — One calm workspace for running your organization.
          </div>
        </div>
      </footer>
    </div>
  );
}
