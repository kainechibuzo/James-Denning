import React, { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Activity, Layers3, Menu, X, Play, ShieldCheck } from "lucide-react";
import { ReferenceBrand } from "../components/reference-brand.jsx";
import "../styles/reference-design.css";

export function PublicLanding({ onSignIn, onGetStarted }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = event => {
      if (event.key === "Escape") { setMenuOpen(false); menuRef.current?.focus(); }
    };
    document.addEventListener("keydown", dismiss);
    return () => document.removeEventListener("keydown", dismiss);
  }, [menuOpen]);
  return <main className="reference-landing">
    <header className="reference-site-header">
      <a href="#top" aria-label="James-Denning home"><ReferenceBrand divided /></a>
      <div className="reference-header-actions">
        <button className="reference-primary" onClick={onGetStarted}>Get started <ArrowUpRight aria-hidden="true" /></button>
        <button ref={menuRef} className="reference-menu-button" type="button" aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={menuOpen} aria-controls="jd-primary-navigation" onClick={() => setMenuOpen(value => !value)}>{menuOpen ? <X/> : <Menu/>}</button>
      </div>
      {menuOpen && <nav id="jd-primary-navigation" className="reference-site-menu" aria-label="Primary navigation">
        <a href="#product" onClick={() => setMenuOpen(false)}>Explore the platform</a>
        <button onClick={() => { setMenuOpen(false); onSignIn?.(); }}>Sign in</button>
        <button onClick={() => { setMenuOpen(false); onGetStarted?.(); }}>Get started</button>
      </nav>}
    </header>
    <div className="reference-landing-body">
      <section className="reference-hero" id="top">
        <div className="reference-hero-copy">
          <h1>Run. Monitor. <em>Grow.</em></h1>
          <p className="reference-lead">Meet James-Denning, your AI-powered operations assistant. Monitor business activity, coordinate teams and workflows, and make clearer decisions — all from one workspace.</p>
          <div className="reference-hero-actions">
            <button className="reference-primary" onClick={onGetStarted}>Get started <ArrowUpRight aria-hidden="true" /></button>
            <a className="reference-explore" href="#product"><span><Play fill="currentColor" aria-hidden="true" /></span>Explore the platform</a>
          </div>
          <p className="reference-proof"><ShieldCheck aria-hidden="true"/><span>James-Denning brings your organisation’s activity into focus.</span></p>
        </div>
        <picture className="reference-laptop">
          <source media="(max-width: 760px)" srcSet="/design/dashboard-laptop-front.webp"/>
          <img src="/design/dashboard-laptop.webp" width="1672" height="941" alt="Illustrative James-Denning dashboard on a laptop, showing revenue, expenses and business performance. These are sample figures, not live workspace records." fetchPriority="high"/>
        </picture>
      </section>
      <section className="reference-features" id="product" aria-label="Explore the platform">
        <article><span className="reference-feature-icon"><Activity aria-hidden="true"/></span><h2>Monitor</h2><p>See performance, finances and organisational activity in one view.</p></article>
        <article><span className="reference-feature-icon"><Layers3 aria-hidden="true"/></span><h2>Workflows</h2><p>Keep everyday operations, approvals and team workflows moving with less friction.</p></article>
      </section>
    </div>
  </main>;
}
