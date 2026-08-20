/**
 * Analytics domain: AcademicSummaryPage
 *
 * Organization-wide, section-wide, or per-class academic performance breakdown.
 * Aggregates portal_results data client-side into:
 *   - Top performers leaderboard (podium + ranked list)
 *   - Needs-improvement list with per-subject breakdown
 *   - Group rankings with visual bars + pass rates
 *   - Category rankings with highest/lowest/pass-rate
 *   - Grade distribution chart
 */
import React, { useState, useEffect, useMemo } from "react";
import {
  Award, BarChart2, BookOpen, ChevronDown, ChevronUp,
  Star, Target, TrendingDown, TrendingUp, Users,
} from "lucide-react";
import { db } from "../supabaseClient.js";
import { C } from "../config/theme.js";
import { useSection } from "../contexts/section.jsx";
import { Card, Btn, Spinner, Badge } from "../components/ui.jsx";

// ── Score helpers ─────────────────────────────────────────────────────────────
const scoreColor = s =>
  s >= 70 ? "#16a34a" : s >= 60 ? "#65a30d" : s >= 50 ? "#d97706" : s >= 40 ? "#ea580c" : "#dc2626";
const scoreBg = s =>
  s >= 70 ? "#f0fdf4" : s >= 60 ? "#f7fee7" : s >= 50 ? "#fffbeb" : s >= 40 ? "#fff7ed" : "#fef2f2";
const scoreGrade = s =>
  s >= 70 ? "A" : s >= 60 ? "B" : s >= 50 ? "C" : s >= 40 ? "D" : "F";
const GRADE_LABELS = {
  A: "Excellent  (70–100)",
  B: "Very Good  (60–69)",
  C: "Good  (50–59)",
  D: "Pass  (40–49)",
  F: "Fail  (< 40)",
};
const GRADE_COLORS = { A:"#16a34a", B:"#65a30d", C:"#d97706", D:"#ea580c", F:"#dc2626" };
const MEDAL_COLOR  = ["#f59e0b","#94a3b8","#cd7f32"];
const MEDAL_EMOJI  = ["🥇","🥈","🥉"];

// Horizontal progress bar
function ScoreBar({ score, max = 100 }) {
  return (
    <div style={{ flex:1, height:9, background:C.offWhite, borderRadius:999, overflow:"hidden", minWidth:60 }}>
      <div style={{
        height:"100%", width:`${Math.min(100,(score/max)*100)}%`,
        background:scoreColor(score), borderRadius:999, transition:"width .7s ease",
      }}/>
    </div>
  );
}

// Initials avatar
function Avatar({ name, size = 44, color = C.blue }) {
  const initials = name.split(" ").map(w => w[0] || "").join("").slice(0,2).toUpperCase();
  return (
    <div style={{
      width:size, height:size, borderRadius:"50%", flexShrink:0,
      background:`linear-gradient(135deg,${color}22,${color}11)`,
      border:`2.5px solid ${color}`,
      display:"flex", alignItems:"center", justifyContent:"center",
      fontSize:size*0.36, fontWeight:900, color, userSelect:"none",
    }}>{initials}</div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function AcademicSummaryPage({ ctx }) {
  const { notify } = ctx;
  const { schoolName } = useSection();

  const [sessions,   setSessions]   = useState([]);
  const [terms,      setTerms]      = useState([]);
  const [classes,    setClasses]    = useState([]);
  const [sections,   setSections]   = useState([]);
  const [selSession, setSelSession] = useState("");
  const [selTerm,    setSelTerm]    = useState("");
  const [scope,      setScope]      = useState("school"); // school | section | class
  const [selSection, setSelSection] = useState("");
  const [selClass,   setSelClass]   = useState("");
  const [rawData,    setRawData]    = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [view,       setView]       = useState("top");
  const [expandedStudents, setExpandedStudents] = useState({});

  // ── Bootstrap filters ──────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([db.getSessions(), db.getTerms(), db.getClasses(), db.getSections(false)])
      .then(([s, t, c, sec]) => {
        const sess = s.data || [];
        const trms = t.data || [];
        setSessions(sess);
        setTerms(trms);
        setClasses(c.data || []);
        setSections(sec.data || []);
        const active = sess.find(x => x.is_active);
        const activeTerm = trms.find(x => x.is_active);
        if (active)     setSelSession(String(active.id));
        if (activeTerm) setSelTerm(String(activeTerm.id));
      });
  }, []);

  const filteredTerms   = useMemo(() => selSession ? terms.filter(t => String(t.session_id) === selSession) : terms, [terms, selSession]);
  const sectionClasses  = useMemo(() => selSection  ? classes.filter(c => String(c.section_id) === selSection)  : [], [classes, selSection]);

  // ── Load data ──────────────────────────────────────────────────────────────
  const load = async () => {
    if (!selSession || !selTerm) { notify("Select cycle and period first", "error"); return; }
    setLoading(true);
    setRawData(null);
    let classIds = null;
    if (scope === "section" && selSection) {
      classIds = sectionClasses.map(c => c.id);
      if (!classIds.length) { notify("No groups in this section", "error"); setLoading(false); return; }
    } else if (scope === "class" && selClass) {
      classIds = [+selClass];
    }
    const { data, error } = await db.getAcademicSummaryData({ sessionId:+selSession, termId:+selTerm, classIds });
    setLoading(false);
    if (error) { notify(error.message, "error"); return; }
    setRawData(data || []);
    setView("top");
  };

  // ── Aggregation ─────────────────────────────────────────────────────────────
  const computed = useMemo(() => {
    if (!rawData || rawData.length === 0) return null;

    // ── Per student ──
    const byStudent = {};
    rawData.forEach(r => {
      const sid = r.student_id;
      if (!byStudent[sid]) {
        const fn = r.students ? [r.students.last_name, r.students.first_name, r.students.middle_name].filter(Boolean).join(" ") : String(sid);
        byStudent[sid] = {
          student_id: sid,
          name: fn,
          class_id: r.class_id,
          class_name: r.classes?.name || "—",
          section_name: r.classes?.sections?.name || "",
          section_color: r.classes?.sections?.color || C.blue,
          scores: [], subjects: [],
        };
      }
      const s = +r.total_score;
      byStudent[sid].scores.push(s);
      byStudent[sid].subjects.push({ name: r.section_subjects?.name || "?", score: s, ca: +r.ca_score||0, exam: +r.exam_score||0 });
    });

    const studentStats = Object.values(byStudent).map(s => {
      const avg  = s.scores.reduce((a,b)=>a+b,0)/s.scores.length;
      const best  = [...s.subjects].sort((a,b)=>b.score-a.score)[0];
      const worst = [...s.subjects].sort((a,b)=>a.score-b.score)[0];
      const passing = s.scores.filter(x=>x>=40).length;
      return { ...s, avg:Math.round(avg*10)/10, subjectCount:s.scores.length, best, worst, passing };
    }).sort((a,b) => b.avg-a.avg);

    // ── Per class ──
    const byClass = {};
    rawData.forEach(r => {
      if (!r.classes) return;
      const cid = r.class_id;
      if (!byClass[cid]) byClass[cid] = {
        class_id:cid, name:r.classes.name,
        section_name:r.classes.sections?.name||"",
        section_color:r.classes.sections?.color||C.blue,
        scores:[], studentIds:new Set(),
      };
      if (r.total_score !== null) {
        byClass[cid].scores.push(+r.total_score);
        byClass[cid].studentIds.add(r.student_id);
      }
    });
    const classStats = Object.values(byClass).map(c => {
      const avg  = c.scores.reduce((a,b)=>a+b,0)/c.scores.length;
      const pass = c.scores.filter(x=>x>=40).length;
      return { ...c, avg:Math.round(avg*10)/10, studentCount:c.studentIds.size,
        highest:Math.max(...c.scores), lowest:Math.min(...c.scores),
        passRate:Math.round(pass/c.scores.length*100) };
    }).sort((a,b) => b.avg-a.avg);

    // ── Per subject ──
    const bySubject = {};
    rawData.forEach(r => {
      if (r.total_score===null) return;
      const key = r.subject_id;
      if (!bySubject[key]) bySubject[key] = { subject_id:key, name:r.section_subjects?.name||"Unknown", scores:[] };
      bySubject[key].scores.push(+r.total_score);
    });
    const subjectStats = Object.values(bySubject).map(s => {
      const sorted  = [...s.scores].sort((a,b)=>a-b);
      const avg      = s.scores.reduce((a,b)=>a+b,0)/s.scores.length;
      const passRate = Math.round(s.scores.filter(x=>x>=40).length/s.scores.length*100);
      const median   = sorted[Math.floor(sorted.length/2)];
      return { ...s, avg:Math.round(avg*10)/10, highest:sorted[sorted.length-1],
        lowest:sorted[0], passRate, median, count:s.scores.length };
    }).sort((a,b)=>b.avg-a.avg);

    // ── Grade distribution ──
    const gradeDist = { A:0, B:0, C:0, D:0, F:0 };
    rawData.forEach(r => {
      if (r.total_score===null) return;
      const s = +r.total_score;
      if (s>=70)gradeDist.A++;
      else if(s>=60)gradeDist.B++;
      else if(s>=50)gradeDist.C++;
      else if(s>=40)gradeDist.D++;
      else gradeDist.F++;
    });
    const totalScores = Object.values(gradeDist).reduce((a,b)=>a+b,0);

    const allScores   = rawData.filter(r=>r.total_score!==null).map(r=>+r.total_score);
    const overallAvg  = allScores.reduce((a,b)=>a+b,0)/allScores.length;
    const passRate    = allScores.filter(x=>x>=40).length/allScores.length*100;
    const highest     = Math.max(...allScores);
    const lowest      = Math.min(...allScores);

    return {
      studentStats,
      topStudents:    studentStats.slice(0,10),
      bottomStudents: [...studentStats].reverse().slice(0,10),
      classStats, subjectStats, gradeDist, totalScores,
      totalStudents: studentStats.length,
      overallAvg:   Math.round(overallAvg*10)/10,
      passRate:     Math.round(passRate),
      highest, lowest,
    };
  }, [rawData]);

  // ── Label helpers ──────────────────────────────────────────────────────────
  const selSession_ = sessions.find(s=>String(s.id)===selSession);
  const selTerm_    = filteredTerms.find(t=>String(t.id)===selTerm);
  const scopeLabel  = scope==="school" ? "Organization-Wide"
    : scope==="section" ? (sections.find(s=>String(s.id)===selSection)?.name||"Section")
    : (classes.find(c=>String(c.id)===selClass)?.name||"Group");

  const toggleExpand = id => setExpandedStudents(p => ({...p,[id]:!p[id]}));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{padding:"0 0 60px"}}>

      {/* ── Header ── */}
      <div style={{background:`linear-gradient(135deg,${C.blue},#0c1f52)`,padding:"22px 24px 18px",marginBottom:24}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:4}}>
          <BarChart2 size={22} color="#fff"/>
          <span style={{fontSize:21,fontWeight:900,color:"#fff",letterSpacing:-.3}}>Performance Summary</span>
          {computed && (
            <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:999,
              background:"rgba(255,255,255,.18)",color:"#fff",marginLeft:4}}>
              {computed.totalStudents} members · {rawData.length.toLocaleString()} records
            </span>
          )}
        </div>
        <div style={{fontSize:12,color:"rgba(255,255,255,.65)"}}>
          {computed
            ? `${scopeLabel} · ${selTerm_?.name||"—"} · ${selSession_?.name||"—"}`
            : "Select filters and click Load Data to generate the report"}
        </div>
      </div>

      <div style={{padding:"0 18px",maxWidth:1060,margin:"0 auto"}}>

        {/* ── Filters ── */}
        <Card style={{marginBottom:20}}>
          <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-end"}}>

            {/* Cycle */}
            <div style={{flex:"1 1 130px",minWidth:120}}>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,marginBottom:4,
                textTransform:"uppercase",letterSpacing:.5}}>Cycle</label>
              <select value={selSession} onChange={e=>{setSelSession(e.target.value);setSelTerm("");setRawData(null);}}
                style={{width:"100%",padding:"8px 10px",border:`2px solid ${C.border}`,borderRadius:8,
                  fontSize:13,background:C.white,outline:"none",cursor:"pointer"}}>
                <option value="">Select…</option>
                {sessions.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            {/* Period */}
            <div style={{flex:"1 1 130px",minWidth:120}}>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,marginBottom:4,
                textTransform:"uppercase",letterSpacing:.5}}>Period</label>
              <select value={selTerm} onChange={e=>{setSelTerm(e.target.value);setRawData(null);}}
                style={{width:"100%",padding:"8px 10px",border:`2px solid ${C.border}`,borderRadius:8,
                  fontSize:13,background:C.white,outline:"none",cursor:"pointer"}}>
                <option value="">Select…</option>
                {filteredTerms.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            {/* Scope toggle */}
            <div style={{flex:"1 1 200px"}}>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,marginBottom:4,
                textTransform:"uppercase",letterSpacing:.5}}>Scope</label>
              <div style={{display:"flex",border:`2px solid ${C.border}`,borderRadius:8,overflow:"hidden"}}>
                {[["school","🏫 Organization"],["section","📂 Section"],["class","📋 Group"]].map(([v,l])=>(
                  <button key={v} onClick={()=>{setScope(v);setRawData(null);}}
                    style={{flex:1,padding:"7px 6px",border:"none",cursor:"pointer",fontSize:12,fontWeight:700,
                      background:scope===v?C.blue:"transparent",
                      color:scope===v?"#fff":C.muted,transition:"all .15s"}}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Section picker */}
            {scope==="section"&&(
              <div style={{flex:"1 1 130px"}}>
                <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,marginBottom:4,
                  textTransform:"uppercase",letterSpacing:.5}}>Section</label>
                <select value={selSection} onChange={e=>{setSelSection(e.target.value);setRawData(null);}}
                  style={{width:"100%",padding:"8px 10px",border:`2px solid ${C.border}`,borderRadius:8,
                    fontSize:13,background:C.white,outline:"none",cursor:"pointer"}}>
                  <option value="">All sections</option>
                  {sections.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}

            {/* Group picker */}
            {scope==="class"&&(
              <div style={{flex:"1 1 130px"}}>
                <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,marginBottom:4,
                  textTransform:"uppercase",letterSpacing:.5}}>Group</label>
                <select value={selClass} onChange={e=>{setSelClass(e.target.value);setRawData(null);}}
                  style={{width:"100%",padding:"8px 10px",border:`2px solid ${C.border}`,borderRadius:8,
                    fontSize:13,background:C.white,outline:"none",cursor:"pointer"}}>
                  <option value="">Select group</option>
                  {classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}

            <Btn onClick={load} color={C.orange}
              disabled={loading||!selSession||!selTerm}
              style={{minWidth:100,height:38,alignSelf:"flex-end",flexShrink:0}}>
              {loading ? <Spinner small/> : "Load Data"}
            </Btn>
          </div>
        </Card>

        {/* ── Empty state ── */}
        {!rawData && !loading && (
          <div style={{textAlign:"center",padding:"70px 20px",color:C.muted}}>
            <BarChart2 size={52} color={C.light} style={{marginBottom:14}}/>
            <div style={{fontSize:16,fontWeight:800,color:C.blue,marginBottom:6}}>No Data Loaded</div>
            <div style={{fontSize:13}}>Select a cycle and period above, then click <strong>Load Data</strong>.</div>
          </div>
        )}

        {loading && (
          <div style={{textAlign:"center",padding:70}}><Spinner/></div>
        )}

        {rawData && rawData.length === 0 && (
          <div style={{textAlign:"center",padding:70,color:C.muted}}>
            <div style={{fontSize:16,fontWeight:800,marginBottom:6}}>No results found</div>
            <div style={{fontSize:13}}>No score data exists for the selected filters. Upload results first.</div>
          </div>
        )}

        {/* ── Main content ── */}
        {computed && (
          <>
            {/* ── Summary stat cards ── */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(175px,1fr))",gap:12,marginBottom:20}}>
              {[
                { label:"Overall Average", value:`${computed.overallAvg}%`, sub:scoreGrade(computed.overallAvg)+" Grade",
                  icon:<Target size={17}/>, color:scoreColor(computed.overallAvg) },
                { label:"Pass Rate", value:`${computed.passRate}%`, sub:`Score ≥ 40`,
                  icon:<TrendingUp size={17}/>, color:computed.passRate>=60?C.green:computed.passRate>=40?"#d97706":C.red },
                { label:"Top Score", value:`${computed.highest}%`, sub:computed.topStudents[0]?.name||"",
                  icon:<Award size={17}/>, color:"#f59e0b" },
                { label:"Members", value:computed.totalStudents, sub:`${computed.classStats.length} class${computed.classStats.length!==1?"es":""}`,
                  icon:<Users size={17}/>, color:C.blue },
                { label:"Categories", value:computed.subjectStats.length, sub:`${rawData.length.toLocaleString()} total scores`,
                  icon:<BookOpen size={17}/>, color:"#7c3aed" },
                { label:"Lowest Score", value:`${computed.lowest}%`, sub:scoreGrade(computed.lowest)+" Grade",
                  icon:<TrendingDown size={17}/>, color:scoreColor(computed.lowest) },
              ].map(({label,value,sub,icon,color})=>(
                <Card key={label} style={{padding:"14px 16px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:8}}>
                    <span style={{color,opacity:.8}}>{icon}</span>
                    <span style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5}}>{label}</span>
                  </div>
                  <div style={{fontSize:26,fontWeight:900,color,marginBottom:1,lineHeight:1}}>{value}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sub}</div>
                </Card>
              ))}
            </div>

            {/* ── View tabs ── */}
            <div style={{display:"flex",gap:0,marginBottom:16,background:C.white,borderRadius:10,
              border:`1px solid ${C.border}`,overflow:"hidden",flexWrap:"wrap"}}>
              {[
                ["top",      "🏆 Top Performers"],
                ["bottom",   "📈 Needs Improvement"],
                ["classes",  "🏫 Group Rankings"],
                ["subjects", "📚 Category Rankings"],
                ["grades",   "🎯 Grade Distribution"],
              ].map(([v,l])=>(
                <button key={v} onClick={()=>setView(v)}
                  style={{padding:"10px 16px",border:"none",cursor:"pointer",fontSize:13,fontWeight:700,
                    background:view===v?C.blue:"transparent",
                    color:view===v?"#fff":C.muted,
                    borderRight:`1px solid ${C.border}`,transition:"all .15s",whiteSpace:"nowrap"}}>
                  {l}
                </button>
              ))}
            </div>

            {/* ════════════════════════════════ TOP PERFORMERS ════════════════════════════════ */}
            {view==="top" && (
              <div style={{display:"flex",flexDirection:"column",gap:16}}>

                {/* Podium */}
                {computed.topStudents.length >= 3 && (
                  <Card style={{background:"linear-gradient(160deg,#fefce8 0%,#fff 60%)",
                    border:`1.5px solid #fde68a`}}>
                    <div style={{textAlign:"center",marginBottom:24}}>
                      <div style={{fontSize:15,fontWeight:900,color:C.blue}}>🏆 Podium — Top 3</div>
                      <div style={{fontSize:12,color:C.muted,marginTop:2}}>
                        {scopeLabel} · {selTerm_?.name} · {selSession_?.name}
                      </div>
                    </div>

                    {/* 2nd / 1st / 3rd layout */}
                    <div style={{display:"flex",alignItems:"flex-end",justifyContent:"center",gap:12,padding:"0 16px 8px"}}>
                      {[1,0,2].map(i => {
                        const s = computed.topStudents[i];
                        const heights = [130,170,110]; // podium block heights
                        const avatarSizes = [56,70,50];
                        const mc = MEDAL_COLOR[i];
                        return (
                          <div key={i} style={{flex:1,maxWidth:220,display:"flex",flexDirection:"column",alignItems:"center"}}>
                            <div style={{fontSize:i===0?32:24,marginBottom:4}}>{MEDAL_EMOJI[i]}</div>
                            <Avatar name={s.name} size={avatarSizes[i]} color={mc}/>
                            <div style={{fontWeight:900,fontSize:i===0?14:12,color:C.text,textAlign:"center",
                              marginTop:8,marginBottom:2,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                              {s.name}
                            </div>
                            <div style={{fontSize:11,color:C.muted,marginBottom:6,textAlign:"center"}}>{s.class_name}</div>
                            <div style={{fontSize:i===0?30:22,fontWeight:900,color:mc,marginBottom:8,lineHeight:1}}>
                              {s.avg}%
                            </div>
                            <div style={{display:"flex",gap:6,marginBottom:8}}>
                              <span style={{fontSize:10,padding:"2px 8px",borderRadius:999,background:scoreBg(s.avg),
                                color:scoreColor(s.avg),fontWeight:700}}>{scoreGrade(s.avg)} Grade</span>
                              <span style={{fontSize:10,padding:"2px 8px",borderRadius:999,
                                background:C.offWhite,color:C.muted,fontWeight:600}}>{s.subjectCount} subj</span>
                            </div>
                            {/* Podium block */}
                            <div style={{width:"100%",height:heights[i],
                              background:i===0?`linear-gradient(180deg,#fde68a,#f59e0b)`
                                :i===1?`linear-gradient(180deg,#e2e8f0,#94a3b8)`
                                :`linear-gradient(180deg,#fde68a88,#cd7f32)`,
                              borderRadius:"8px 8px 0 0",
                              display:"flex",alignItems:"center",justifyContent:"center",
                              fontSize:20,fontWeight:900,color:"#fff",
                              boxShadow:"0 -2px 8px rgba(0,0,0,.1)"}}>
                              #{i+1}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                )}

                {/* Ranks 4–10 */}
                <Card>
                  <div style={{fontWeight:900,color:C.blue,fontSize:14,marginBottom:12}}>
                    Full Leaderboard — Top {Math.min(computed.topStudents.length,10)}
                  </div>
                  {computed.topStudents.map((s, i) => (
                    <div key={s.student_id}>
                      <div style={{display:"flex",alignItems:"center",gap:12,
                        padding:"10px 0",borderBottom:`1px solid ${C.border}`,
                        cursor:"pointer"}}
                        onClick={()=>toggleExpand(s.student_id)}>
                        {/* Rank badge */}
                        <div style={{width:30,height:30,borderRadius:"50%",flexShrink:0,
                          background:i<3?MEDAL_COLOR[i]+"22":C.offWhite,
                          border:i<3?`2px solid ${MEDAL_COLOR[i]}`:"none",
                          display:"flex",alignItems:"center",justifyContent:"center",
                          fontSize:13,fontWeight:900,color:i<3?MEDAL_COLOR[i]:C.muted}}>
                          {i<3?MEDAL_EMOJI[i]:i+1}
                        </div>
                        <Avatar name={s.name} size={34} color={s.section_color}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:700,fontSize:13,color:C.text,
                            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</div>
                          <div style={{fontSize:11,color:C.muted}}>
                            {s.class_name}{s.section_name?` · ${s.section_name}`:""} · {s.subjectCount} categories
                          </div>
                        </div>
                        <ScoreBar score={s.avg}/>
                        <div style={{width:44,fontSize:16,fontWeight:900,color:scoreColor(s.avg),
                          textAlign:"right",flexShrink:0}}>{s.avg}%</div>
                        <div style={{width:26,height:26,borderRadius:6,background:scoreBg(s.avg),
                          display:"flex",alignItems:"center",justifyContent:"center",
                          fontSize:12,fontWeight:900,color:scoreColor(s.avg),flexShrink:0}}>
                          {scoreGrade(s.avg)}
                        </div>
                        <div style={{color:C.muted,flexShrink:0}}>
                          {expandedStudents[s.student_id]?<ChevronUp size={14}/>:<ChevronDown size={14}/>}
                        </div>
                      </div>
                      {/* Expanded subject breakdown */}
                      {expandedStudents[s.student_id] && (
                        <div style={{padding:"12px 16px 12px 56px",background:C.offWhite,
                          borderBottom:`1px solid ${C.border}`,borderLeft:`3px solid ${scoreColor(s.avg)}`}}>
                          <div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>
                            Category Breakdown
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:6}}>
                            {[...s.subjects].sort((a,b)=>b.score-a.score).map(sub=>(
                              <div key={sub.name} style={{display:"flex",alignItems:"center",gap:8}}>
                                <div style={{width:90,fontSize:11,color:C.muted,flexShrink:0,
                                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sub.name}</div>
                                <div style={{flex:1,height:7,background:"#e2e8f0",borderRadius:999,overflow:"hidden"}}>
                                  <div style={{height:"100%",width:`${sub.score}%`,background:scoreColor(sub.score),borderRadius:999}}/>
                                </div>
                                <div style={{width:28,fontSize:11,fontWeight:800,color:scoreColor(sub.score),
                                  textAlign:"right",flexShrink:0}}>{sub.score}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </Card>
              </div>
            )}

            {/* ════════════════════════════════ NEEDS IMPROVEMENT ════════════════════════════════ */}
            {view==="bottom" && (
              <Card>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                  <TrendingDown size={16} color={C.red}/>
                  <div style={{fontWeight:900,color:C.blue,fontSize:14}}>Members Needing Support</div>
                  <span style={{fontSize:12,color:C.muted,marginLeft:4}}>
                    Bottom {computed.bottomStudents.length} · ranked lowest average first
                  </span>
                </div>
                {computed.bottomStudents.map((s, i) => (
                  <div key={s.student_id}>
                    <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",
                      borderBottom:`1px solid ${C.border}`,cursor:"pointer"}}
                      onClick={()=>toggleExpand("b_"+s.student_id)}>
                      <div style={{width:30,height:30,borderRadius:"50%",flexShrink:0,background:"#fef2f2",
                        border:`2px solid ${C.red}44`,display:"flex",alignItems:"center",
                        justifyContent:"center",fontSize:12,fontWeight:900,color:C.red}}>
                        {computed.bottomStudents.length-i}
                      </div>
                      <Avatar name={s.name} size={34} color={C.red}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,fontSize:13,color:C.text}}>{s.name}</div>
                        <div style={{fontSize:11,color:C.muted}}>
                          {s.class_name}{s.section_name?` · ${s.section_name}`:""} · {s.passing}/{s.subjectCount} categories passing
                        </div>
                      </div>
                      <ScoreBar score={s.avg}/>
                      <div style={{width:44,fontSize:16,fontWeight:900,color:scoreColor(s.avg),
                        textAlign:"right",flexShrink:0}}>{s.avg}%</div>
                      <div style={{width:26,height:26,borderRadius:6,background:scoreBg(s.avg),
                        display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:12,fontWeight:900,color:scoreColor(s.avg),flexShrink:0}}>
                        {scoreGrade(s.avg)}
                      </div>
                      <div style={{color:C.muted,flexShrink:0}}>
                        {expandedStudents["b_"+s.student_id]?<ChevronUp size={14}/>:<ChevronDown size={14}/>}
                      </div>
                    </div>

                    {expandedStudents["b_"+s.student_id] && (
                      <div style={{padding:"12px 16px 12px 56px",background:"#fef2f2",
                        borderBottom:`1px solid ${C.border}`,borderLeft:`3px solid ${C.red}`}}>
                        <div style={{fontSize:11,fontWeight:700,color:C.red,marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>
                          All Categories — Sorted Weakest First
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:6}}>
                          {[...s.subjects].sort((a,b)=>a.score-b.score).map(sub=>(
                            <div key={sub.name} style={{display:"flex",alignItems:"center",gap:8}}>
                              <div style={{width:90,fontSize:11,color:C.muted,flexShrink:0,
                                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sub.name}</div>
                              <div style={{flex:1,height:7,background:"#e2e8f0",borderRadius:999,overflow:"hidden"}}>
                                <div style={{height:"100%",width:`${sub.score}%`,background:scoreColor(sub.score),borderRadius:999}}/>
                              </div>
                              <div style={{width:28,fontSize:11,fontWeight:800,color:scoreColor(sub.score),
                                textAlign:"right",flexShrink:0}}>{sub.score}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </Card>
            )}

            {/* ════════════════════════════════ CLASS RANKINGS ════════════════════════════════ */}
            {view==="classes" && (
              <Card>
                <div style={{fontWeight:900,color:C.blue,fontSize:14,marginBottom:16}}>
                  Group Performance Rankings
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {computed.classStats.map((cls, i) => {
                    const isTop = i===0;
                    return (
                      <div key={cls.class_id} style={{padding:"14px 16px",borderRadius:10,
                        background:isTop?"linear-gradient(135deg,#fffbeb,#fff)":"#f8fafc",
                        border:`1.5px solid ${isTop?"#fde68a":C.border}`}}>
                        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
                          {/* Rank circle */}
                          <div style={{width:36,height:36,borderRadius:"50%",flexShrink:0,
                            background:isTop?"#f59e0b":cls.section_color,
                            display:"flex",alignItems:"center",justifyContent:"center",
                            fontSize:isTop?18:14,fontWeight:900,color:"#fff"}}>
                            {isTop?"★":i+1}
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontWeight:900,fontSize:15,color:C.text}}>{cls.name}</div>
                            <div style={{fontSize:11,color:C.muted,display:"flex",gap:12,marginTop:2}}>
                              {cls.section_name&&<span>{cls.section_name}</span>}
                              <span>{cls.studentCount} members</span>
                              <span>Hi: {cls.highest}  Lo: {cls.lowest}</span>
                            </div>
                          </div>
                          <div style={{textAlign:"right",flexShrink:0}}>
                            <div style={{fontSize:24,fontWeight:900,color:scoreColor(cls.avg),lineHeight:1}}>
                              {cls.avg}%
                            </div>
                            <div style={{fontSize:11,color:C.muted,marginTop:2}}>avg</div>
                          </div>
                        </div>
                        {/* Bar */}
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <div style={{flex:1,height:12,background:"#e2e8f0",borderRadius:999,overflow:"hidden"}}>
                            <div style={{height:"100%",width:`${cls.avg}%`,borderRadius:999,
                              background:`linear-gradient(90deg,${scoreColor(cls.avg)},${scoreColor(cls.avg)}99)`,
                              transition:"width .8s ease"}}/>
                          </div>
                          <div style={{fontSize:12,color:C.muted,flexShrink:0,minWidth:100,textAlign:"right"}}>
                            Pass rate: <strong style={{color:cls.passRate>=50?C.green:C.red}}>
                              {cls.passRate}%
                            </strong>
                          </div>
                          <div style={{width:28,height:28,borderRadius:6,background:scoreBg(cls.avg),
                            display:"flex",alignItems:"center",justifyContent:"center",
                            fontSize:12,fontWeight:900,color:scoreColor(cls.avg),flexShrink:0}}>
                            {scoreGrade(cls.avg)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* ════════════════════════════════ SUBJECT RANKINGS ════════════════════════════════ */}
            {view==="subjects" && (
              <Card>
                <div style={{fontWeight:900,color:C.blue,fontSize:14,marginBottom:16}}>
                  Category Performance Rankings
                </div>
                {/* Header row */}
                <div style={{display:"flex",alignItems:"center",gap:12,padding:"0 0 8px",
                  borderBottom:`2px solid ${C.border}`,marginBottom:4}}>
                  <div style={{width:30,flexShrink:0}}/>
                  <div style={{flex:"0 0 150px",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5}}>Category</div>
                  <div style={{flex:1,fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5}}>Average</div>
                  <div style={{width:50,fontSize:11,fontWeight:700,color:C.muted,textAlign:"right",flexShrink:0}}>Avg</div>
                  <div style={{width:70,fontSize:11,fontWeight:700,color:C.muted,textAlign:"right",flexShrink:0}}>Pass%</div>
                  <div style={{width:80,fontSize:11,fontWeight:700,color:C.muted,textAlign:"right",flexShrink:0}}>Hi / Lo</div>
                  <div style={{width:60,fontSize:11,fontWeight:700,color:C.muted,textAlign:"right",flexShrink:0}}>Scores</div>
                </div>
                {computed.subjectStats.map((sub, i) => (
                  <div key={sub.subject_id} style={{display:"flex",alignItems:"center",gap:12,
                    padding:"9px 0",borderBottom:`1px solid ${C.border}`}}>
                    <div style={{width:30,height:28,borderRadius:6,flexShrink:0,
                      background:i===0?"#fef9c3":i===1?"#f1f5f9":i===2?"#fff7ed":C.offWhite,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:12,fontWeight:900,
                      color:i===0?"#b45309":i===1?"#64748b":i===2?"#c2410c":C.muted}}>
                      {i+1}
                    </div>
                    <div style={{flex:"0 0 150px",fontSize:13,fontWeight:700,color:C.text,
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sub.name}</div>
                    <div style={{flex:1}}>
                      <div style={{height:9,background:C.offWhite,borderRadius:999,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${sub.avg}%`,background:scoreColor(sub.avg),borderRadius:999}}/>
                      </div>
                    </div>
                    <div style={{width:50,fontSize:15,fontWeight:900,color:scoreColor(sub.avg),
                      textAlign:"right",flexShrink:0}}>{sub.avg}%</div>
                    <div style={{width:70,fontSize:12,textAlign:"right",flexShrink:0}}>
                      <span style={{fontWeight:700,color:sub.passRate>=50?C.green:C.red}}>{sub.passRate}%</span>
                    </div>
                    <div style={{width:80,fontSize:11,color:C.muted,textAlign:"right",flexShrink:0}}>
                      {sub.highest} / {sub.lowest}
                    </div>
                    <div style={{width:60,fontSize:11,color:C.muted,textAlign:"right",flexShrink:0}}>
                      {sub.count.toLocaleString()}
                    </div>
                  </div>
                ))}
              </Card>
            )}

            {/* ════════════════════════════════ GRADE DISTRIBUTION ════════════════════════════════ */}
            {view==="grades" && (
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>

                {/* Visual bars */}
                <Card>
                  <div style={{fontWeight:900,color:C.blue,fontSize:14,marginBottom:16}}>
                    Grade Distribution — All Scores
                  </div>
                  {Object.entries(computed.gradeDist).map(([grade, count]) => {
                    const pct  = computed.totalScores > 0 ? Math.round(count/computed.totalScores*100) : 0;
                    const color = GRADE_COLORS[grade];
                    return (
                      <div key={grade} style={{marginBottom:14}}>
                        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                          <div style={{width:30,height:30,borderRadius:8,background:color+"1a",
                            display:"flex",alignItems:"center",justifyContent:"center",
                            fontSize:16,fontWeight:900,color,flexShrink:0}}>
                            {grade}
                          </div>
                          <div style={{flex:1}}>
                            <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                              <span style={{fontSize:12,color:C.muted}}>{GRADE_LABELS[grade]}</span>
                              <span style={{fontSize:13,fontWeight:800,color}}>{count.toLocaleString()} <span style={{fontWeight:600,color:C.muted,fontSize:11}}>({pct}%)</span></span>
                            </div>
                            <div style={{height:12,background:C.offWhite,borderRadius:999,overflow:"hidden"}}>
                              <div style={{height:"100%",width:`${pct}%`,background:color,
                                borderRadius:999,transition:"width .8s ease"}}/>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div style={{marginTop:8,paddingTop:12,borderTop:`1px solid ${C.border}`,
                    display:"flex",justifyContent:"space-between",fontSize:12,color:C.muted}}>
                    <span>Total scores: <strong style={{color:C.text}}>{computed.totalScores.toLocaleString()}</strong></span>
                    <span>Members: <strong style={{color:C.text}}>{computed.totalStudents}</strong></span>
                  </div>
                </Card>

                {/* Grade tiles */}
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                    {Object.entries(computed.gradeDist).map(([grade, count]) => {
                      const pct  = computed.totalScores>0?Math.round(count/computed.totalScores*100):0;
                      const color = GRADE_COLORS[grade];
                      return (
                        <div key={grade} style={{padding:"16px",borderRadius:12,
                          background:`linear-gradient(135deg,${color}12,${color}06)`,
                          border:`1.5px solid ${color}33`,textAlign:"center"}}>
                          <div style={{fontSize:32,fontWeight:900,color,lineHeight:1}}>{grade}</div>
                          <div style={{fontSize:22,fontWeight:800,color:C.text,margin:"6px 0 2px",lineHeight:1}}>
                            {count.toLocaleString()}
                          </div>
                          <div style={{fontSize:12,color:C.muted}}>{pct}% of scores</div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Quick insight card */}
                  <Card style={{background:"linear-gradient(135deg,#eff6ff,#fff)",border:`1.5px solid #bfdbfe`}}>
                    <div style={{fontWeight:900,fontSize:13,color:C.blue,marginBottom:10}}>📊 Quick Insights</div>
                    {[
                      ["Pass Rate", `${computed.passRate}% of students scored ≥ 40`],
                      ["A-Grade Rate", `${computed.totalScores>0?Math.round((computed.gradeDist.A||0)/computed.totalScores*100):0}% scored ≥ 70`],
                      ["Fail Rate", `${computed.totalScores>0?Math.round((computed.gradeDist.F||0)/computed.totalScores*100):0}% scored below 40`],
                      ["Overall Average", `${computed.overallAvg}% (${scoreGrade(computed.overallAvg)} Grade)`],
                    ].map(([k,v])=>(
                      <div key={k} style={{display:"flex",justifyContent:"space-between",
                        padding:"6px 0",borderBottom:`1px solid ${C.border}`,fontSize:12}}>
                        <span style={{color:C.muted}}>{k}</span>
                        <span style={{fontWeight:700,color:C.text}}>{v}</span>
                      </div>
                    ))}
                    <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",fontSize:12}}>
                      <span style={{color:C.muted}}>Best Category</span>
                      <span style={{fontWeight:700,color:C.green}}>{computed.subjectStats[0]?.name} ({computed.subjectStats[0]?.avg}%)</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",fontSize:12}}>
                      <span style={{color:C.muted}}>Weakest Category</span>
                      <span style={{fontWeight:700,color:C.red}}>
                        {computed.subjectStats[computed.subjectStats.length-1]?.name} ({computed.subjectStats[computed.subjectStats.length-1]?.avg}%)
                      </span>
                    </div>
                  </Card>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
