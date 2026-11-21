import React, { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Activity, Layers3, Menu, X, Play, ShieldCheck, ArrowRight, Check, MessageSquare, ClipboardCheck } from "lucide-react";
import { HeritageTile, HeritageWordmark, HeritageRule } from "../components/reference-brand.jsx";
import "../styles/reference-design.css";
import "../styles/landing-growth.css";
import "../styles/landing-heritage.css";

function LandingBrand(){return <span className="landing-brand"><HeritageTile size={38}/><span><HeritageWordmark/><HeritageRule compact/></span></span>;}

export function PublicLanding({ onSignIn, onGetStarted }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scenario,setScenario] = useState(0);
  const scenarios = [
    {name:"Business owners",question:"What needs my attention this week?",answer:"Bring overdue tasks, recorded activity and decisions waiting for you into one conversation.",outcome:"A clearer next step, without chasing every update."},
    {name:"Operations teams",question:"Turn our launch plan into accountable work.",answer:"Prepare tasks, propose responsibilities and review the approvals needed before work moves forward.",outcome:"Less scattered follow-up. More visible ownership."},
    {name:"Founders",question:"Help me plan the business before we build.",answer:"Develop a business brief, review assumptions and shape workflows around the way your organisation works.",outcome:"Start with a plan you can inspect and improve."},
  ];
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
      <a href="#top" aria-label="James-Denning home"><LandingBrand/></a>
      <div className="reference-header-actions">
        <button className="landing-signin" aria-label="Sign in to your workspace" onClick={onSignIn}>Sign in</button>
        <button className="reference-primary" onClick={onGetStarted}>Get started <ArrowUpRight aria-hidden="true" /></button>
        <button ref={menuRef} className="reference-menu-button" type="button" aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={menuOpen} aria-controls="jd-primary-navigation" onClick={() => setMenuOpen(value => !value)}>{menuOpen ? <X/> : <Menu/>}</button>
      </div>
      {menuOpen && <nav id="jd-primary-navigation" className="reference-site-menu" aria-label="Primary navigation">
        <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
        <a href="#questions" onClick={() => setMenuOpen(false)}>Questions, answered</a>
        <a href="#product" onClick={() => setMenuOpen(false)}>Explore the platform</a>
        <button onClick={() => { setMenuOpen(false); onSignIn?.(); }}>Sign in</button>
        <button onClick={() => { setMenuOpen(false); onGetStarted?.(); }}>Get started</button>
      </nav>}
    </header>
    <div className="reference-landing-body">
      <section className="reference-hero" id="top">
        <div className="reference-hero-copy">
          <p className="landing-eyebrow">YOUR BUSINESS. LESS BUSYWORK.</p>
          <h1>Run. Monitor.<br/><em>Grow.</em></h1>
          <HeritageRule/>
          <p className="reference-lead">Meet James-Denning, your AI-powered operations assistant. Bring scattered tasks, business records and decisions into one conversation. Know what needs attention. Prepare the next step. Keep control of what happens next.</p>
          <div className="reference-hero-actions">
            <button className="reference-primary" onClick={onGetStarted}>Get started <ArrowUpRight aria-hidden="true" /></button>
            <a className="reference-explore" href="#product"><span><Play fill="currentColor" aria-hidden="true" /></span>Explore the platform</a>
          </div>
          <p className="reference-proof"><ShieldCheck aria-hidden="true"/><span>Your workspace. Your permissions. Your approval when it matters.</span></p>
        </div>
        <picture className="reference-laptop">
          <source media="(max-width: 760px)" srcSet="/design/dashboard-laptop-front.webp"/>
          <img src="/design/dashboard-laptop.webp" width="1672" height="941" alt="Illustrative James-Denning dashboard displayed on a laptop. Figures shown are sample data, not live workspace records." fetchPriority="high"/>
        </picture>
      </section>
      <section className="reference-features" id="product" aria-label="Explore the platform">
        <article><span className="reference-feature-icon"><Activity aria-hidden="true"/></span><h2>Monitor</h2><p>See performance, finances and organisational activity in one view.</p></article>
        <article><span className="reference-feature-icon"><Layers3 aria-hidden="true"/></span><h2>Workflows</h2><p>Keep everyday operations, approvals and team workflows moving with less friction.</p></article>
      </section>
      <section className="landing-use-cases" aria-labelledby="use-cases-title">
        <div className="landing-section-heading"><p className="landing-eyebrow">BUILT AROUND YOUR WORK</p><h2 id="use-cases-title">A clearer day starts<br/>with a better question.</h2><p>You don’t need another dashboard to watch. You need a way to turn what you know into what you do next.</p></div>
        <div className="landing-scenario">
          <div className="landing-scenario-tabs" aria-label="Explore use cases">{scenarios.map((item,index)=><button key={item.name} type="button" aria-pressed={scenario===index} onClick={()=>setScenario(index)}>{item.name}</button>)}</div>
          <div className="landing-demo" aria-live="polite"><small>ILLUSTRATIVE CONVERSATION · NOT LIVE DATA</small><p className="landing-demo-question"><MessageSquare size={18} aria-hidden="true"/>{scenarios[scenario].question}</p><div className="landing-demo-answer"><HeritageTile size={36}/><div><strong>James-Denning</strong><p>{scenarios[scenario].answer}</p></div></div><p className="landing-demo-outcome"><Check size={16} aria-hidden="true"/>{scenarios[scenario].outcome}</p></div>
        </div>
      </section>
      <section id="how-it-works" className="landing-how" aria-labelledby="how-title">
        <div className="landing-section-heading"><p className="landing-eyebrow">FROM A QUESTION TO A NEXT STEP</p><h2 id="how-title">One conversation.<br/>A more organised business.</h2></div>
        <div className="landing-steps">{[
          [MessageSquare,"01","Tell JD what matters","Ask a question, describe a goal or bring the records you want to work with."],
          [ClipboardCheck,"02","Review the plan","Inspect proposed tasks, changes and decisions. Keep approval in the hands of the right people."],
          [Activity,"03","Follow the actual work","Track recorded tasks and authorised runs. See what finished, what failed and what still needs attention."],
        ].map(([Icon,num,title,copy])=><article key={num}><div><span>{num}</span><Icon size={22} aria-hidden="true"/></div><h3>{title}</h3><p>{copy}</p></article>)}</div>
      </section>
      <section className="landing-faq" id="questions" aria-labelledby="faq-title"><div className="landing-section-heading"><p className="landing-eyebrow">BEFORE YOU GET STARTED</p><h2 id="faq-title">Good questions.</h2></div><div>{[
        ["What can I use JD for?","Use JD to inspect workspace records, prepare business plans and tasks, review proposed changes and follow authorised workflow execution. What it can execute depends on the tools, permissions and services available in your workspace."],
        ["Will JD complete every task automatically?","No. A checklist is a set of records, not a promise of autonomous completion. JD can work through authorised jobs using available tools. Missing information, approvals and work outside those tools may require a person."],
        ["Do I need a fixed department structure?","No. Start with the way your business works. Review proposed roles and workspace changes before adopting them; you don’t need to invent departments just to use JD."],
        ["How does billing work?","The platform has its own billing. AI employee usage is additional and separate. Review the applicable plan and usage terms before enabling paid work; this page does not quote a price or promise free usage."],
      ].map(([question,answer])=><details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>
      <section className="landing-final-cta"><p className="landing-eyebrow">MAKE ROOM FOR THE WORK THAT MATTERS</p><h2>Less chasing.<br/><em>More moving forward.</em></h2><p>Bring your next business question to James-Denning.</p><button className="reference-primary" onClick={onGetStarted}>Start your workspace <ArrowRight size={18} aria-hidden="true"/></button><button className="landing-signin" onClick={onSignIn}>Already have an account? Sign in</button></section>
      <footer className="landing-footer"><LandingBrand/><span>Your organisation, one conversation.</span><a href="#top">Back to top ↑</a></footer>
    </div>
  </main>;
}
