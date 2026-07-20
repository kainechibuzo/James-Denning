/**
 * Transcript domain: TranscriptPage
 */
import React, { useState, useEffect, useMemo } from "react";
import {
  Calendar, CheckCircle2, ChevronRight, Edit, FileText, Inbox, Mail, Save, Search, Trash2, X,
} from "lucide-react";
import { db } from "../supabaseClient.js";
import { C } from "../config/theme.js";
import { useSection } from "../contexts/section.jsx";
import {
  Card, Btn, Badge, Inp, Sel, Modal, Spinner, AppIcon,
} from "../components/ui.jsx";
import {
  fullName, getGrade, gradeCol as _gradeColPure,
} from "../utils/grades.js";
import {
  buildMultiPeriodTranscriptHTML, buildMultiSessionTranscriptHTML, buildTranscriptHTML, openTranscriptPDF,
} from "../services/pdf/transcript.js";
import { htmlToPdfBase64 } from "../services/pdf/capture.js";
import { sendPortalEmail, buildEmailHtml } from "../services/email/index.js";

const gradeCol = g => _gradeColPure(g, C);

export function TranscriptPage({ctx}){
  const {user,role,selectedSection,notify}=ctx;
  const {schoolLogo:logoBase64}=useSection();
  const [tab,setTab]=useState("portal");          // "portal" | "manual"
  const [students,setStudents]=useState([]);
  const [sessions,setSessions]=useState([]);
  const [gradingSchema,setGradingSchema]=useState([]);
  const [settings,setSettings]=useState({});
  const [selClass,setSelClass]=useState("");
  const [search,setSearch]=useState("");
  const [searchOpen,setSearchOpen]=useState(false);

  // Portal tab state
  const [selStu,setSelStu]=useState(null);
  const [selSessions,setSelSessions]=useState([]);   // array of session IDs (strings)
  const [portalResults,setPortalResults]=useState([]);
  const [portalResultsMap,setPortalResultsMap]=useState({}); // {[sessionId]: result[]}
  const [loadingPortal,setLoadingPortal]=useState(false);
  const [editMode,setEditMode]=useState(false);
  const [scoreOverrides,setScoreOverrides]=useState({});

  // Draft / history state
  const [drafts,setDrafts]=useState([]);
  const [draftId,setDraftId]=useState(null);
  const [draftNote,setDraftNote]=useState("");
  const [savingDraft,setSavingDraft]=useState(false);
  const [showDrafts,setShowDrafts]=useState(true);
  const [history,setHistory]=useState([]);
  const [showHistory,setShowHistory]=useState(false);
  const [sendingEmail,setSendingEmail]=useState(false);

  // Manual tab state
  const [manualList,setManualList]=useState([]);
  const [loadingManual,setLoadingManual]=useState(false);
  const [manualModal,setManualModal]=useState(null);
  const [saving,setSaving]=useState(false);

  // transcript_type: "multi_period" (new default) | "legacy"
  const [transcriptType,setTranscriptType]=useState("multi_period");

  // Multi-period state
  const blankPeriod=()=>({class_name:"",academic_year:""});
  const blankMPSubj=(numPeriods)=>({name:"",periods:Array.from({length:numPeriods},()=>({t1:"",t2:"",t3:""}))});
  const [classPeriods,setClassPeriods]=useState([blankPeriod()]);
  const addClassPeriod=()=>{
    setClassPeriods(p=>[...p,blankPeriod()]);
    setSubjects(s=>s.map(r=>({...r,periods:[...r.periods,{t1:"",t2:"",t3:""}]})));
  };
  const removeClassPeriod=(i)=>{
    setClassPeriods(p=>p.filter((_,j)=>j!==i));
    setSubjects(s=>s.map(r=>({...r,periods:r.periods.filter((_,j)=>j!==i)})));
  };
  const updateClassPeriod=(i,p)=>setClassPeriods(periods=>periods.map((cp,j)=>j===i?{...cp,...p}:cp));

  // Legacy / score-structure state
  const [caeStructures,setCaeStructures]=useState([]);
  const [structComps,setStructComps]=useState([]);
  const [loadingComps,setLoadingComps]=useState(false);
  const LEGACY_COLS=["T1 CA","T1 Exam","T1 Total","T2 CA","T2 Exam","T2 Total","T3 CA","T3 Exam","T3 Total"];
  const blankScores=(cols)=>cols.reduce((acc,c)=>({...acc,[c]:""}),{});
  const blankLegacySubj=(cols)=>({name:"",scores:blankScores(cols)});
  const displayCols=structComps.length>0?structComps.map(c=>c.component_name):LEGACY_COLS;

  const blankForm=()=>({student_id:"",student_name:"",student_number:"",class_name:"",section_name:"",gender:"",dob:"",academic_year:"",notes:"",structure_id:null,structure_name:""});
  const [mForm,setMForm]=useState(blankForm());
  const mf=p=>setMForm(f=>({...f,...p}));

  // Unified subjects state (format differs by transcriptType)
  const [subjects,setSubjects]=useState([blankMPSubj(1)]);
  const updateSubj=(i,p)=>setSubjects(s=>s.map((r,j)=>j===i?{...r,...p}:r));
  const addSubj=()=>setSubjects(s=>[...s,transcriptType==="multi_period"?blankMPSubj(classPeriods.length):blankLegacySubj(displayCols)]);
  const removeSubj=i=>setSubjects(s=>s.filter((_,j)=>j!==i));

  const switchType=(t)=>{
    setTranscriptType(t);
    if(t==="multi_period"){ setClassPeriods([blankPeriod()]); setSubjects([blankMPSubj(1)]); }
    else { setStructComps([]); setSubjects([blankLegacySubj(LEGACY_COLS)]); }
  };

  const onStructureChange=async(structId)=>{
    const id=structId?+structId:null;
    const found=id?caeStructures.find(s=>s.id===id):null;
    mf({structure_id:id,structure_name:found?.name||""});
    if(!id){ setStructComps([]); setSubjects([blankLegacySubj(LEGACY_COLS)]); return; }
    setLoadingComps(true);
    const {data}=await db.getCaeComponents(id);
    const comps=(data||[]).sort((a,b)=>a.display_order-b.display_order);
    setStructComps(comps);
    setSubjects([blankLegacySubj(comps.map(c=>c.component_name))]);
    setLoadingComps(false);
  };

  // Per-period average helper (used in modal table and PDF)
  const periodAvg=(period)=>{
    const vals=[period.t1,period.t2,period.t3].filter(v=>v!==""&&v!==null&&v!==undefined&&!isNaN(+v)).map(Number);
    return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
  };

  const today=new Date().toLocaleDateString("en-NG",{day:"numeric",month:"long",year:"numeric"});

  const loadDrafts=()=>{
    db.getTranscriptDrafts('draft').then(({data})=>setDrafts(data||[]));
    db.getTranscriptDrafts('generated').then(({data})=>setHistory(data||[]));
  };

  useEffect(()=>{
    Promise.all([
      db.getGradingSchema(),
      db.getSessions(),
      db.getSettings(),
      db.getCaeStructures(),
    ]).then(([g,s,st,cs])=>{
      setGradingSchema(g.data||[]);
      setSessions(s.data||[]);
      const m={};(st.data||[]).forEach(r=>{m[r.key]=r.value;});setSettings(m);
      setCaeStructures(cs.data||[]);
    });
    if(role==="student"){
      setSelStu({id:user.student_id,name:user.name,first_name:user.first_name,last_name:user.last_name});
      db.getResults({student_id:user.student_id}).then(({data})=>setPortalResults(data||[]));
    } else {
      db.getStudents().then(({data})=>{
        let stus=data||[];
        if(selectedSection)stus=stus.filter(st=>st.classes?.section_id===selectedSection.id);
        setStudents(stus);
      });
      loadManual();
      loadDrafts();
    }
  },[role,selectedSection]);

  const loadManual=()=>{
    setLoadingManual(true);
    db.getManualTranscripts().then(({data})=>{setManualList(data||[]);setLoadingManual(false);});
  };

  const selectStudent=async(s)=>{
    setSelStu(s);setSelSessions([]);setPortalResults([]);setPortalResultsMap({});setScoreOverrides({});setEditMode(false);setDraftId(null);setDraftNote("");
  };

  // Which Term-Total fields are still null across the currently loaded subjects/sessions.
  const computeMissingFields=()=>{
    const missing=[];
    const TERMS=[["t1_total","T1"],["t2_total","T2"],["t3_total","T3"]];
    if(selSessions.length<=1){
      portalSubjectRows.forEach(s=>{
        TERMS.forEach(([f,label])=>{ if(s[f]==null)missing.push(`${s.name} — ${label}`); });
      });
    } else {
      portalSubjectRows.forEach(s=>{
        (s.sessions||[]).forEach(sess=>{
          const sessName=sessions.find(x=>String(x.id)===sess.sessionId)?.name||sess.sessionId;
          TERMS.forEach(([f,label])=>{ if(sess[f]==null)missing.push(`${s.name} (${sessName}) — ${label}`); });
        });
      });
    }
    return missing;
  };

  const loadPortalResults=async(stuOverride=null,sessOverride=null)=>{
    const stu=stuOverride||selStu;
    const sess=sessOverride||selSessions;
    if(!stu||!sess.length)return;
    setLoadingPortal(true);
    const pairs=await Promise.all(
      sess.map(sid=>db.getResults({student_id:stu.id,session_id:sid})
        .then(({data,error})=>{
          if(error)notify(`Session ${sid} load error: ${error.message}`,"error");
          return[sid,data||[]];
        })
      )
    );
    const map=Object.fromEntries(pairs);
    setPortalResultsMap(map);
    setPortalResults(pairs.flatMap(([,d])=>d));
    setLoadingPortal(false);
  };

  const saveDraft=async()=>{
    if(!selStu){notify("Select a student first","error");return;}
    setSavingDraft(true);
    const byName=user?.name||user?.email||"";
    const {data:saved,error}=await db.saveTranscriptDraft(draftId||null,{
      student_id:selStu.id,
      student_name:fullName(selStu)||selStu?.name||"",
      class_name:selStu?.classes?.name||"",
      session_ids:selSessions,
      score_overrides:scoreOverrides,
      missing_fields:computeMissingFields(),
      status:'draft',
      note:draftNote,
      updated_by_name:byName,
      created_by_name:byName,
    });
    setSavingDraft(false);
    if(error){notify("Save failed: "+error.message,"error");return;}
    if(!draftId)setDraftId(saved.id);
    loadDrafts();
    notify("Draft saved — any user with transcript access can resume this","success");
  };

  const resumeDraft=async(draft)=>{
    const stu=students.find(s=>String(s.id)===String(draft.student_id))
      ||{id:draft.student_id,name:draft.student_name,
         first_name:(draft.student_name||"").split(" ")[0],
         last_name:(draft.student_name||"").split(" ").slice(1).join(" ")};
    setSelStu(stu);
    setSelClass(String(stu.classes?.id||""));
    setSelSessions(draft.session_ids||[]);
    setScoreOverrides(draft.score_overrides||{});
    setEditMode(true);
    setDraftId(draft.id);
    setDraftNote(draft.note||"");
    setPortalResults([]);setPortalResultsMap({});
    if(draft.session_ids?.length){
      await loadPortalResults(stu,draft.session_ids);
    }
  };

  const deleteDraft=async(id)=>{
    if(!window.confirm("Delete this draft? It cannot be recovered."))return;
    await db.deleteTranscriptDraft(id);
    if(draftId===id){setDraftId(null);}
    loadDrafts();
  };

  const logTranscriptGenerated=async()=>{
    const byName=user?.name||user?.email||"";
    await db.saveTranscriptDraft(draftId||null,{
      student_id:selStu.id,
      student_name:fullName(selStu)||selStu?.name||"",
      class_name:selStu?.classes?.name||"",
      session_ids:selSessions,
      score_overrides:scoreOverrides,
      status:'generated',
      generated_at:new Date().toISOString(),
      updated_by_name:byName,
      created_by_name:byName,
    });
    setDraftId(null);
    loadDrafts();
  };

  // Build subject rows from portal results.
  // Single session: flat {name, t1_ca, t1_exam, t1_total, ...} with scoreOverrides applied.
  // Multi-session:  {name, sessions:[{sessionId,t1_total,t2_total,t3_total},...]} with overrides.
  const portalSubjectRows=useMemo(()=>{
    if(!portalResults.length)return[];

    // Fallback only — for any legacy term row missing term_order.
    const termPosByName=(name)=>{
      const n=(name||"").toLowerCase();
      if(n.includes("first")||n.includes("1st")||/\bterm.?1\b/.test(n))return 1;
      if(n.includes("second")||n.includes("2nd")||/\bterm.?2\b/.test(n))return 2;
      if(n.includes("third")||n.includes("3rd")||/\bterm.?3\b/.test(n))return 3;
      return null;
    };
    // Map term_id → position, preferring the stable terms.term_order over name-guessing.
    const buildTCM=(results)=>{
      const m={};
      results.forEach(r=>{
        if(r.term_id==null)return;
        m[r.term_id]=r.terms?.term_order ?? termPosByName(r.terms?.name||"");
      });
      return m;
    };
    const ov=(sid,name,f)=>{
      const key=`${sid}-${name}-${f}`;
      if(!scoreOverrides.hasOwnProperty(key))return undefined;
      const v=scoreOverrides[key];return(v===""||v==null)?null:(isNaN(+v)?null:+v);
    };
    const withOv=(dbVal,sid,name,f)=>{
      const o=ov(sid,name,f);return o!==undefined?o:dbVal;
    };

    if(selSessions.length<=1){
      const sid=selSessions[0]||"";
      const tcm=buildTCM(portalResults);
      const subjMap={};
      portalResults.forEach(r=>{
        const name=r.section_subjects?.name||"—";
        if(!subjMap[name])subjMap[name]={name,t1_ca:null,t1_exam:null,t1_total:null,t2_ca:null,t2_exam:null,t2_total:null,t3_ca:null,t3_exam:null,t3_total:null};
        const pos=tcm[r.term_id];
        if(pos===1){subjMap[name].t1_ca=r.ca_score;subjMap[name].t1_exam=r.exam_score;subjMap[name].t1_total=r.total_score;}
        else if(pos===2){subjMap[name].t2_ca=r.ca_score;subjMap[name].t2_exam=r.exam_score;subjMap[name].t2_total=r.total_score;}
        else if(pos===3){subjMap[name].t3_ca=r.ca_score;subjMap[name].t3_exam=r.exam_score;subjMap[name].t3_total=r.total_score;}
      });
      return Object.values(subjMap).map(row=>({
        ...row,
        t1_ca:withOv(row.t1_ca,sid,row.name,"t1_ca"),t1_exam:withOv(row.t1_exam,sid,row.name,"t1_exam"),t1_total:withOv(row.t1_total,sid,row.name,"t1_total"),
        t2_ca:withOv(row.t2_ca,sid,row.name,"t2_ca"),t2_exam:withOv(row.t2_exam,sid,row.name,"t2_exam"),t2_total:withOv(row.t2_total,sid,row.name,"t2_total"),
        t3_ca:withOv(row.t3_ca,sid,row.name,"t3_ca"),t3_exam:withOv(row.t3_exam,sid,row.name,"t3_exam"),t3_total:withOv(row.t3_total,sid,row.name,"t3_total"),
      }));
    }

    // Multi-session: union of all subjects across sessions
    const allSubjects=new Set();
    const sesSubjMap={};
    selSessions.forEach(sid=>{
      const results=portalResultsMap[sid]||[];
      const tcm=buildTCM(results);
      sesSubjMap[sid]={};
      results.forEach(r=>{
        const name=r.section_subjects?.name||"—";
        allSubjects.add(name);
        if(!sesSubjMap[sid][name])sesSubjMap[sid][name]={t1_ca:null,t1_exam:null,t1_total:null,t2_ca:null,t2_exam:null,t2_total:null,t3_ca:null,t3_exam:null,t3_total:null};
        const pos=tcm[r.term_id];
        if(pos===1){sesSubjMap[sid][name].t1_ca=r.ca_score;sesSubjMap[sid][name].t1_exam=r.exam_score;sesSubjMap[sid][name].t1_total=r.total_score;}
        else if(pos===2){sesSubjMap[sid][name].t2_ca=r.ca_score;sesSubjMap[sid][name].t2_exam=r.exam_score;sesSubjMap[sid][name].t2_total=r.total_score;}
        else if(pos===3){sesSubjMap[sid][name].t3_ca=r.ca_score;sesSubjMap[sid][name].t3_exam=r.exam_score;sesSubjMap[sid][name].t3_total=r.total_score;}
      });
    });
    return Array.from(allSubjects).sort().map(name=>({
      name,
      sessions:selSessions.map(sid=>{
        const base=sesSubjMap[sid]?.[name]||{t1_ca:null,t1_exam:null,t1_total:null,t2_ca:null,t2_exam:null,t2_total:null,t3_ca:null,t3_exam:null,t3_total:null};
        return{sessionId:sid,
          t1_ca:withOv(base.t1_ca,sid,name,"t1_ca"),t1_exam:withOv(base.t1_exam,sid,name,"t1_exam"),t1_total:withOv(base.t1_total,sid,name,"t1_total"),
          t2_ca:withOv(base.t2_ca,sid,name,"t2_ca"),t2_exam:withOv(base.t2_exam,sid,name,"t2_exam"),t2_total:withOv(base.t2_total,sid,name,"t2_total"),
          t3_ca:withOv(base.t3_ca,sid,name,"t3_ca"),t3_exam:withOv(base.t3_exam,sid,name,"t3_exam"),t3_total:withOv(base.t3_total,sid,name,"t3_total"),
        };
      }),
    }));
  },[portalResults,portalResultsMap,selSessions,scoreOverrides]);

  const classes=useMemo(()=>{
    const seen=new Set();
    return students
      .filter(s=>s.classes?.id)
      .map(s=>({id:s.classes.id,name:s.classes.name}))
      .filter(c=>{if(seen.has(c.id))return false;seen.add(c.id);return true;})
      .sort((a,b)=>(a.name||"").localeCompare(b.name||""));
  },[students]);

  const filtered=useMemo(()=>students.filter(s=>{
    if(selClass&&String(s.classes?.id)!==String(selClass))return false;
    if(!search.trim())return true;
    const q=search.toLowerCase();
    return (s.first_name+" "+s.last_name).toLowerCase().includes(q)||
      String(s.id||"").toLowerCase().includes(q);
  }),[students,selClass,search]);

  // Builds the transcript HTML + metadata shared by "open PDF" and "email PDF".
  const buildPortalTranscriptHTML=()=>{
    const studentName=fullName(selStu)||selStu?.name||"";
    const className=portalResults[0]?.classes?.name||"";
    const sectionName=selStu?.classes?.sections?.name||portalResults[0]?.classes?.sections?.name||"";

    if(selSessions.length>1){
      const pdfSessions=selSessions.map(sid=>{
        const sessName=sessions.find(s=>String(s.id)===sid)?.name||sid;
        // Class the student was actually in that session — taken from that session's
        // result rows, not the current class, so promotions across years show correctly.
        const sessResults=portalResultsMap[sid]||[];
        const sessClassName=sessResults[0]?.classes?.name||"";
        const sessSectionName=sessResults[0]?.classes?.sections?.name||"";
        const subjects=portalSubjectRows.map(s=>{
          const d=s.sessions.find(ss=>ss.sessionId===sid)||{};
          return{name:s.name,scores:{"T1 CA":d.t1_ca,"T1 Exam":d.t1_exam,"T1 Total":d.t1_total,"T2 CA":d.t2_ca,"T2 Exam":d.t2_exam,"T2 Total":d.t2_total,"T3 CA":d.t3_ca,"T3 Exam":d.t3_exam,"T3 Total":d.t3_total}};
        });
        return{academicYear:sessName,subjects,className:sessClassName,sectionName:sessSectionName};
      });
      const yearLabel=pdfSessions.map(s=>s.academicYear).join(" / ");
      const html=buildMultiSessionTranscriptHTML({
        studentName,studentId:selStu?.id||"",className,sectionName,
        gender:selStu?.gender||"",dob:selStu?.date_of_birth||"",
        sessions:pdfSessions,gradingSchema,settings,today,logoBase64,
      });
      return{html,studentName,yearLabel};
    }
    const sess=sessions.find(s=>String(s.id)===String(selSessions[0]));
    const pdfSubjects=portalSubjectRows.map(s=>({
      name:s.name,
      scores:{"T1 CA":s.t1_ca,"T1 Exam":s.t1_exam,"T1 Total":s.t1_total,
              "T2 CA":s.t2_ca,"T2 Exam":s.t2_exam,"T2 Total":s.t2_total,
              "T3 CA":s.t3_ca,"T3 Exam":s.t3_exam,"T3 Total":s.t3_total},
    }));
    const html=buildTranscriptHTML({
      studentName,studentId:selStu?.id||"",className,sectionName,
      gender:selStu?.gender||"",dob:selStu?.date_of_birth||"",
      academicYear:sess?.name||"",subjects:pdfSubjects,
      gradingSchema,settings,today,logoBase64,
    });
    return{html,studentName,yearLabel:sess?.name||""};
  };

  const genPortalPDF=()=>{
    if(!portalSubjectRows.length){alert("Load results first.");return;}
    const{html,studentName,yearLabel}=buildPortalTranscriptHTML();
    openTranscriptPDF(html,ctx.showPDF,studentName,yearLabel);
    logTranscriptGenerated();
  };

  const emailTranscript=async()=>{
    if(!portalSubjectRows.length){notify("Load results first","error");return;}
    if(!selStu?.email){notify("No email on file for this student","error");return;}
    setSendingEmail(true);
    try{
      const{html,studentName,yearLabel}=buildPortalTranscriptHTML();
      const b64=await htmlToPdfBase64(html,{scale:3,usePt:false});
      const schoolName=settings?.school_name||"School Portal";
      const emailHtml=buildEmailHtml(`Academic Transcript — ${yearLabel}`,[
        `Dear Parent/Guardian,`,``,
        `Please find attached the academic transcript for:`,``,
        `${studentName} · Member ID: ${selStu.id}`,
        `Academic Year(s): ${yearLabel}`,``,
        `If you have any questions, please contact the school administration office.`,
      ].join("\n"),schoolName);
      const res=await sendPortalEmail({
        to:selStu.email,subject:`Academic Transcript — ${studentName} — ${yearLabel}`,html:emailHtml,
        attachments:[{name:`Transcript-${studentName.replace(/\s+/g,"-")}.pdf`,content:b64,mimeType:"application/pdf"}],
      });
      if(res.ok){notify(`Transcript emailed to ${selStu.email} ✓`,"success");logTranscriptGenerated();}
      else notify("Email failed to send — see Mail Logs for details","error");
    }catch(e){notify("Email failed: "+(e.message||e),"error");}
    setSendingEmail(false);
  };

  const openManualModal=async(rec)=>{
    if(rec==="new"){
      setMForm(blankForm());
      setTranscriptType("multi_period");
      setClassPeriods([blankPeriod()]);
      setSubjects([blankMPSubj(1)]);
      setStructComps([]);
    } else {
      setMForm({student_id:rec.student_id||"",student_name:rec.student_name||"",student_number:rec.student_number||"",
        class_name:rec.class_name||"",section_name:rec.section_name||"",gender:rec.gender||"",
        dob:rec.dob||"",academic_year:rec.academic_year||"",notes:rec.notes||"",
        structure_id:rec.structure_id||null,structure_name:rec.structure_name||""});
      const type=rec.transcript_type||"legacy";
      setTranscriptType(type);
      if(type==="multi_period"){
        const periods=rec.class_periods
          ?(typeof rec.class_periods==="string"?JSON.parse(rec.class_periods):rec.class_periods)
          :[blankPeriod()];
        setClassPeriods(periods);
        setStructComps([]);
        setSubjects((rec.manual_transcript_subjects||[]).sort((a,b)=>a.display_order-b.display_order).map(s=>{
          const cs=s.component_scores?(typeof s.component_scores==="string"?JSON.parse(s.component_scores):s.component_scores):{};
          const periodsData=cs.periods||periods.map(()=>({t1:"",t2:"",t3:""}));
          return {name:s.subject_name,periods:periodsData};
        }));
      } else {
        setClassPeriods([blankPeriod()]);
        let comps=[];
        if(rec.structure_id){
          setLoadingComps(true);
          const {data}=await db.getCaeComponents(rec.structure_id);
          comps=(data||[]).sort((a,b)=>a.display_order-b.display_order);
          setStructComps(comps);
          setLoadingComps(false);
        } else { setStructComps([]); }
        const cols=comps.length>0?comps.map(c=>c.component_name):LEGACY_COLS;
        setSubjects((rec.manual_transcript_subjects||[]).sort((a,b)=>a.display_order-b.display_order).map(s=>{
          let scores;
          if(s.component_scores){scores=typeof s.component_scores==="string"?JSON.parse(s.component_scores):s.component_scores;}
          else{scores={"T1 CA":s.t1_ca??"","T1 Exam":s.t1_exam??"","T1 Total":s.t1_total??"",
            "T2 CA":s.t2_ca??"","T2 Exam":s.t2_exam??"","T2 Total":s.t2_total??"",
            "T3 CA":s.t3_ca??"","T3 Exam":s.t3_exam??"","T3 Total":s.t3_total??""
          };}
          return {name:s.subject_name,scores};
        }));
      }
    }
    setManualModal(rec);
  };

  const saveManual=async()=>{
    if(!mForm.student_name.trim()){alert("Member name is required.");return;}
    if(!subjects.some(s=>s.name.trim())){alert("Add at least one subject.");return;}
    if(transcriptType==="multi_period"&&!classPeriods.some(p=>p.class_name.trim()||p.academic_year.trim())){
      alert("Add at least one class period.");return;
    }
    if(transcriptType==="legacy"&&!mForm.academic_year.trim()){alert("Academic year is required.");return;}
    setSaving(true);
    const toNum=v=>(v===""||v==null)?null:+v;
    let validSubjects,payload;
    if(transcriptType==="multi_period"){
      validSubjects=subjects.filter(s=>s.name.trim()).map(s=>({
        subject_name:s.name,
        component_scores:JSON.stringify({type:"multi_period",periods:s.periods}),
        t1_ca:null,t1_exam:null,t1_total:null,t2_ca:null,t2_exam:null,t2_total:null,t3_ca:null,t3_exam:null,t3_total:null,
      }));
      // derive a display academic_year from the periods range
      const years=classPeriods.map(p=>p.academic_year).filter(Boolean);
      const yearRange=years.length?years[0]+(years.length>1?" – "+years[years.length-1]:""):"";
      payload={student_id:mForm.student_id||null,student_name:mForm.student_name.trim(),
        student_number:mForm.student_number||null,class_name:mForm.class_name||null,
        section_name:mForm.section_name||null,gender:mForm.gender||null,dob:mForm.dob||null,
        academic_year:yearRange,notes:mForm.notes||null,
        structure_id:null,structure_name:null,
        transcript_type:"multi_period",class_periods:JSON.stringify(classPeriods)};
    } else {
      const usingStructure=!!(mForm.structure_id&&structComps.length>0);
      validSubjects=subjects.filter(s=>s.name.trim()).map(s=>{
        if(usingStructure){
          return{subject_name:s.name,component_scores:JSON.stringify(s.scores||{}),
            t1_ca:null,t1_exam:null,t1_total:null,t2_ca:null,t2_exam:null,t2_total:null,t3_ca:null,t3_exam:null,t3_total:null};
        }
        const sc=s.scores||{};
        return{subject_name:s.name,component_scores:null,
          t1_ca:toNum(sc["T1 CA"]),t1_exam:toNum(sc["T1 Exam"]),t1_total:toNum(sc["T1 Total"]),
          t2_ca:toNum(sc["T2 CA"]),t2_exam:toNum(sc["T2 Exam"]),t2_total:toNum(sc["T2 Total"]),
          t3_ca:toNum(sc["T3 CA"]),t3_exam:toNum(sc["T3 Exam"]),t3_total:toNum(sc["T3 Total"])};
      });
      payload={student_id:mForm.student_id||null,student_name:mForm.student_name.trim(),
        student_number:mForm.student_number||null,class_name:mForm.class_name||null,
        section_name:mForm.section_name||null,gender:mForm.gender||null,dob:mForm.dob||null,
        academic_year:mForm.academic_year.trim(),notes:mForm.notes||null,
        structure_id:mForm.structure_id||null,structure_name:mForm.structure_name||null,
        transcript_type:"legacy",class_periods:null};
    }
    let err;
    if(manualModal==="new"){({error:err}=await db.saveManualTranscript(payload,validSubjects));}
    else{({error:err}=await db.updateManualTranscript(manualModal.id,payload,validSubjects));}
    setSaving(false);
    if(err){alert("Save failed: "+err.message);return;}
    setManualModal(null);loadManual();
  };

  const deleteManual=async(id)=>{
    if(!window.confirm("Delete this manual transcript? This cannot be undone."))return;
    await db.deleteManualTranscript(id);loadManual();
  };

  const genManualPDF=async(rec)=>{
    const type=rec.transcript_type||"legacy";
    const base={studentName:rec.student_name,studentId:rec.student_number||rec.student_id||"",
      className:rec.class_name||"",sectionName:rec.section_name||"",
      gender:rec.gender||"",dob:rec.dob||"",academicYear:rec.academic_year,
      gradingSchema,settings,today,logoBase64};
    let html;
    if(type==="multi_period"){
      const periods=rec.class_periods
        ?(typeof rec.class_periods==="string"?JSON.parse(rec.class_periods):rec.class_periods)
        :[];
      const subs=(rec.manual_transcript_subjects||[]).sort((a,b)=>a.display_order-b.display_order).map(s=>{
        const cs=s.component_scores?(typeof s.component_scores==="string"?JSON.parse(s.component_scores):s.component_scores):{};
        return {name:s.subject_name, periods:cs.periods||periods.map(()=>({t1:null,t2:null,t3:null}))};
      });
      html=buildMultiPeriodTranscriptHTML({...base,subjects:subs,classPeriods:periods});
    } else {
      let cols=null;
      if(rec.structure_id){
        const {data}=await db.getCaeComponents(rec.structure_id);
        cols=(data||[]).sort((a,b)=>a.display_order-b.display_order).map(c=>c.component_name);
      }
      const subs=(rec.manual_transcript_subjects||[]).sort((a,b)=>a.display_order-b.display_order).map(s=>{
        let scores;
        if(s.component_scores){scores=typeof s.component_scores==="string"?JSON.parse(s.component_scores):s.component_scores;}
        else{scores={"T1 CA":s.t1_ca,"T1 Exam":s.t1_exam,"T1 Total":s.t1_total,
          "T2 CA":s.t2_ca,"T2 Exam":s.t2_exam,"T2 Total":s.t2_total,
          "T3 CA":s.t3_ca,"T3 Exam":s.t3_exam,"T3 Total":s.t3_total};}
        return {name:s.subject_name,scores};
      });
      html=buildTranscriptHTML({...base,subjects:subs,columns:cols,structureName:rec.structure_name||null,logoBase64});
    }
    openTranscriptPDF(html, ctx.showPDF, rec.student_name, rec.academic_year);
  };

  const TABS=[{id:"portal",label:"From Portal Records"},{id:"manual",label:"Manual Transcripts"}];

  return(
    <div>
      <div style={{marginBottom:18}}>
        <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="transcript" size={20}/>Transcript System</h2>
        <p style={{color:C.muted,fontSize:12}}>Generate transcripts from portal records or enter historical data manually</p>
      </div>

      {role!=="student"&&(
        <div style={{display:"flex",gap:4,marginBottom:18,background:C.offWhite,borderRadius:10,padding:4,width:"fit-content"}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{padding:"8px 18px",borderRadius:7,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,
                background:tab===t.id?C.blue:"transparent",color:tab===t.id?"#fff":C.muted,transition:"all .15s"}}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ══ PORTAL RECORDS TAB ══ */}
      {(tab==="portal"||role==="student")&&(
        <div>
          {role!=="student"&&(
            <Card style={{marginBottom:14}}>
              <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-end"}}>

                {/* Group filter (optional) */}
                <div style={{flex:"1 1 160px",minWidth:0}}>
                  <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.6,marginBottom:6}}>Filter by Group</div>
                  <select value={selClass} onChange={e=>{setSelClass(e.target.value);setSelStu(null);setSearch("");setSearchOpen(false);setSelSessions([]);setPortalResults([]);setPortalResultsMap({});setScoreOverrides({});setEditMode(false);setDraftId(null);setDraftNote("");}}
                    style={{width:"100%",padding:"9px 10px",border:`1.5px solid ${selClass?C.blue:C.border}`,
                      borderRadius:8,fontSize:13,outline:"none",background:C.white,color:selClass?C.text:C.muted}}>
                    <option value="">— All Groups —</option>
                    {classes.map(c=><option key={c.id} value={String(c.id)}>{c.name}</option>)}
                  </select>
                </div>

                {/* Member search — always visible */}
                <div style={{flex:"2 1 240px",minWidth:0}}>
                  <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.6,marginBottom:6}}>Member</div>
                  {!selStu?(
                    <div style={{position:"relative"}}>
                      <Search size={14} color={C.muted} style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}}/>
                      <input value={search} onChange={e=>setSearch(e.target.value)}
                        onFocus={e=>{setSearchOpen(true);e.target.style.borderColor=C.blue;}}
                        onBlur={e=>{setTimeout(()=>setSearchOpen(false),150);e.target.style.borderColor=C.border;}}
                        placeholder="Search by name or admission ID…"
                        style={{width:"100%",padding:"9px 11px 9px 32px",border:`1.5px solid ${C.border}`,
                          borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box",color:C.text}}
                      />
                      {searchOpen&&search.trim()&&filtered.length>0&&(
                        <div style={{position:"absolute",zIndex:200,left:0,right:0,top:"calc(100% + 4px)",
                          background:C.white,border:`1.5px solid ${C.blue}`,borderRadius:9,
                          boxShadow:C.shadowMd,maxHeight:260,overflowY:"auto"}}>
                          {filtered.slice(0,15).map(s=>(
                            <div key={s.id} onMouseDown={()=>selectStudent(s)}
                              style={{padding:"9px 13px",cursor:"pointer",borderBottom:`1px solid ${C.border}`,transition:"background .1s"}}
                              onMouseEnter={e=>e.currentTarget.style.background=C.bluePale}
                              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                              <div style={{fontWeight:700,fontSize:13,color:C.text}}>{fullName(s)}</div>
                              <div style={{fontSize:11,color:C.muted}}>{s.id}{s.classes?.name?" · "+s.classes.name:""}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ):(
                    <div style={{display:"flex",alignItems:"center",gap:10,padding:"9px 13px",
                      background:C.bluePale,borderRadius:8,border:`1.5px solid ${C.blue}`}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:800,fontSize:13,color:C.blue,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{fullName(selStu)||selStu.name}</div>
                        <div style={{fontSize:11,color:C.muted}}>{selStu.id}{selStu.classes?.name?" · "+selStu.classes.name:""}</div>
                      </div>
                      <button onClick={()=>{setSelStu(null);setSearch("");setSearchOpen(false);setSelSessions([]);setPortalResults([]);setPortalResultsMap({});setScoreOverrides({});setEditMode(false);setDraftId(null);setDraftNote("");}}
                        style={{background:"none",border:"none",cursor:"pointer",color:C.muted,padding:2,display:"flex",flexShrink:0}}>
                        <X size={15}/>
                      </button>
                    </div>
                  )}
                </div>

                {/* Academic year(s) + Load (appears after student chosen) */}
                {selStu&&(
                  <div style={{flex:"2 1 260px",minWidth:0}}>
                    <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.6,marginBottom:6}}>Academic Year(s) — select one or more</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                      {sessions.map(s=>{
                        const active=selSessions.includes(String(s.id));
                        return(
                          <button key={s.id}
                            onClick={()=>{
                              const id=String(s.id);
                              setSelSessions(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
                              setPortalResults([]);setPortalResultsMap({});setScoreOverrides({});setEditMode(false);
                            }}
                            style={{padding:"6px 14px",borderRadius:20,border:`1.5px solid ${active?C.blue:C.border}`,
                              background:active?C.blue:"transparent",color:active?"#fff":C.muted,
                              fontWeight:700,fontSize:12,cursor:"pointer",transition:"all .15s"}}>
                            {s.name}{s.is_active?" ●":""}
                          </button>
                        );
                      })}
                    </div>
                    <Btn onClick={()=>loadPortalResults()} color={C.blue} disabled={!selSessions.length||loadingPortal}>
                      {loadingPortal?"…":"Load Results"}
                    </Btn>
                  </div>
                )}

              </div>
            </Card>
          )}

          {/* ── In Progress Drafts ── */}
          {role!=="student"&&drafts.length>0&&(
            <Card style={{marginBottom:14,border:`1.5px solid ${C.orange}20`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}
                onClick={()=>setShowDrafts(x=>!x)}>
                <div style={{fontWeight:800,color:C.orange,fontSize:13,display:"flex",alignItems:"center",gap:8}}>
                  <Save size={14}/>In Progress
                  <span style={{background:C.orange,color:"#fff",borderRadius:10,padding:"1px 8px",fontSize:11}}>{drafts.length}</span>
                  {draftId&&<span style={{fontSize:11,color:C.muted,fontWeight:400}}>· editing draft</span>}
                </div>
                <span style={{fontSize:11,color:C.muted}}>{showDrafts?"▲ Hide":"▼ Show"}</span>
              </div>
              {showDrafts&&(
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:10,marginTop:12}}>
                  {drafts.map(d=>{
                    const sessLabels=(d.session_ids||[]).map(id=>sessions.find(s=>String(s.id)===id)?.name||id);
                    const ovCount=Object.keys(d.score_overrides||{}).length;
                    const missing=d.missing_fields||[];
                    const isActive=draftId===d.id;
                    return(
                      <div key={d.id} style={{border:`1.5px solid ${isActive?C.orange:C.border}`,borderRadius:8,padding:11,
                        background:isActive?`${C.orange}08`:C.white,position:"relative"}}>
                        {isActive&&<div style={{position:"absolute",top:8,right:8,fontSize:9,fontWeight:800,color:C.orange,textTransform:"uppercase",letterSpacing:.6}}>Active</div>}
                        <div style={{fontWeight:800,color:C.blue,fontSize:13,paddingRight:40,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.student_name}</div>
                        <div style={{fontSize:11,color:C.muted,marginTop:1}}>{d.student_id}</div>
                        {sessLabels.length>0&&<div style={{fontSize:11,color:C.muted,marginTop:4}}>{sessLabels.join(" · ")}</div>}
                        {ovCount>0&&<div style={{fontSize:10,color:C.orange,fontWeight:700,marginTop:3}}>{ovCount} score override{ovCount!==1?"s":""}</div>}
                        {missing.length>0&&(
                          <div style={{fontSize:10,color:C.red,marginTop:4,lineHeight:1.5}}>
                            <span style={{fontWeight:700}}>Missing:</span> {missing.slice(0,4).join(", ")}{missing.length>4?` +${missing.length-4} more`:""}
                          </div>
                        )}
                        {d.note&&<div style={{fontSize:11,color:C.text,fontStyle:"italic",marginTop:5,background:C.offWhite,padding:"5px 7px",borderRadius:5}}>{d.note}</div>}
                        <div style={{fontSize:10,color:C.light,marginTop:5}}>
                          Saved by {d.updated_by_name||"—"} · {new Date(d.updated_at).toLocaleDateString("en-NG",{day:"2-digit",month:"short",year:"numeric"})}
                        </div>
                        <div style={{display:"flex",gap:6,marginTop:8}}>
                          <Btn xs onClick={()=>resumeDraft(d)} color={C.blue} style={{flex:1}}>Resume</Btn>
                          <Btn xs onClick={()=>deleteDraft(d.id)} color={C.red} outline><Trash2 size={13}/></Btn>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          )}

          <div>
            {!selStu&&role!=="student"?(
              selClass?(
                <Card>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
                    <div style={{fontWeight:800,color:C.blue,fontSize:14}}>
                      {classes.find(c=>String(c.id)===String(selClass))?.name||"Group"} · <span style={{color:C.muted,fontWeight:600}}>{filtered.length} student{filtered.length!==1?"s":""}</span>
                    </div>
                    <div style={{fontSize:12,color:C.muted}}>Select a member to build their transcript</div>
                  </div>
                  {filtered.length===0?(
                    <div style={{textAlign:"center",padding:32,color:C.muted,fontSize:13}}>No students in this class{search.trim()?" match your search":""}.</div>
                  ):(
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:8}}>
                      {filtered.map(s=>(
                        <button key={s.id} onClick={()=>selectStudent(s)}
                          style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",textAlign:"left",
                            border:`1.5px solid ${C.border}`,borderRadius:9,background:C.white,cursor:"pointer",transition:"all .12s"}}
                          onMouseEnter={e=>{e.currentTarget.style.borderColor=C.blue;e.currentTarget.style.background=C.bluePale;}}
                          onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.background=C.white;}}>
                          <div style={{width:34,height:34,borderRadius:"50%",background:C.blue+"18",color:C.blue,
                            display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:12,flexShrink:0}}>
                            {(fullName(s)||s.name||"?").split(" ").map(w=>w[0]||"").join("").slice(0,2).toUpperCase()}
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontWeight:700,fontSize:13,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{fullName(s)||s.name}</div>
                            <div style={{fontSize:11,color:C.muted}}>{s.id}{s.gender?" · "+s.gender:""}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </Card>
              ):(
                <Card style={{textAlign:"center",padding:48}}>
                  <div style={{marginBottom:10}}><Search size={44} color={C.muted}/></div>
                  <div style={{fontWeight:800,color:C.blue,fontSize:16}}>Find a Member</div>
                  <div style={{color:C.muted,fontSize:13}}>Search by name or admission ID above, or select a group to see its members</div>
                </Card>
              )
            ):loadingPortal?<Spinner/>:(
              <>
                {selStu&&(
                  <Card style={{marginBottom:14}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10}}>
                      <div>
                        <div style={{fontWeight:900,fontSize:17,color:C.blue}}>{fullName(selStu)||selStu.name}</div>
                        <div style={{fontSize:12,color:C.muted}}>ID: {selStu.id}{selStu.gender?" · "+selStu.gender:""}{selStu.email?" · "+selStu.email:""}</div>
                      </div>
                      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                        {draftId&&<span style={{fontSize:10,color:C.orange,fontWeight:700}}>● Draft saved</span>}
                        <Btn onClick={saveDraft} color={C.muted} outline disabled={savingDraft}>
                          <Save size={12} style={{marginRight:4}}/>{savingDraft?"Saving…":"Save Draft"}
                        </Btn>
                        {portalSubjectRows.length>0&&(
                          <>
                            <Btn onClick={emailTranscript} color={C.green} outline disabled={sendingEmail||!selStu?.email} title={selStu?.email?"Email transcript PDF to "+selStu.email:"No email on file for this student"}>
                              <Mail size={12} style={{marginRight:4}}/>{sendingEmail?"Sending…":"Email Transcript"}
                            </Btn>
                            <Btn onClick={genPortalPDF} color={C.orange}>Generate Transcript PDF</Btn>
                          </>
                        )}
                      </div>
                    </div>
                    {selStu&&(
                      <div style={{marginTop:10}}>
                        <input value={draftNote} onChange={e=>setDraftNote(e.target.value)}
                          placeholder="Note for whoever resumes this draft (e.g. 'T3 Maths still pending HOD')…"
                          style={{width:"100%",padding:"7px 10px",border:`1.5px solid ${C.border}`,
                            borderRadius:7,fontSize:12,outline:"none",boxSizing:"border-box",color:C.text}}/>
                      </div>
                    )}
                  </Card>
                )}
                {portalResults.length>0?(
                  <Card>
                    {/* Card header */}
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
                      <div style={{fontWeight:800,color:C.blue,fontSize:13}}>
                        Results — {selSessions.length===1
                          ?sessions.find(s=>String(s.id)===selSessions[0])?.name||""
                          :`${selSessions.length} sessions`}
                        <Badge color={C.green} style={{marginLeft:8}}>{portalSubjectRows.length} subjects</Badge>
                        {Object.keys(scoreOverrides).length>0&&(
                          <Badge color={C.orange} style={{marginLeft:6}}>{Object.keys(scoreOverrides).length} edited</Badge>
                        )}
                      </div>
                      <button onClick={()=>{setEditMode(e=>!e);}}
                        style={{padding:"5px 13px",borderRadius:6,border:`1.5px solid ${editMode?C.orange:C.border}`,
                          background:editMode?`${C.orange}18`:"transparent",color:editMode?C.orange:C.muted,
                          fontWeight:700,fontSize:11,cursor:"pointer"}}>
                        {editMode?"✓ Done Editing":"✎ Edit Scores"}
                      </button>
                    </div>

                    <div style={{overflowX:"auto"}}>
                      {selSessions.length<=1?(
                        /* ── Single-session flat table ── */
                        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:700}}>
                          <thead>
                            <tr style={{background:C.blue,color:"#fff"}}>
                              <th style={{padding:"8px 10px",textAlign:"left",fontWeight:700,fontSize:11}} rowSpan={2}>Subject</th>
                              <th style={{padding:"8px",textAlign:"center",fontSize:10,borderLeft:`1px solid rgba(255,255,255,.2)`}} colSpan={3}>First Term</th>
                              <th style={{padding:"8px",textAlign:"center",fontSize:10,borderLeft:`1px solid rgba(255,255,255,.2)`}} colSpan={3}>Second Term</th>
                              <th style={{padding:"8px",textAlign:"center",fontSize:10,borderLeft:`1px solid rgba(255,255,255,.2)`}} colSpan={3}>Third Term</th>
                              <th style={{padding:"8px",textAlign:"center",fontSize:10,borderLeft:`1px solid rgba(255,255,255,.2)`}} rowSpan={2}>Avg</th>
                              <th style={{padding:"8px",textAlign:"center",fontSize:10}} rowSpan={2}>Grade</th>
                            </tr>
                            <tr style={{background:"#1e3a8a",color:"#bfdbfe"}}>
                              {["CA","Exam","Total","CA","Exam","Total","CA","Exam","Total"].map((h,i)=>(
                                <th key={i} style={{padding:"5px 6px",textAlign:"center",fontSize:10,fontWeight:600,borderLeft:i%3===0?`1px solid rgba(255,255,255,.15)`:"none"}}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(()=>{
                              const sid=selSessions[0]||"";
                              const scoreCell=(val,field,isBold,hasBorderL)=>{
                                const key=`${sid}-${null}-${field}`;
                                const isEdited=scoreOverrides.hasOwnProperty(`${sid}-PLACEHOLDER-${field}`);
                                if(editMode){
                                  return null; // handled per-row below
                                }
                                return(
                                  <td style={{padding:"6px",textAlign:"center",fontWeight:isBold?700:"normal",
                                    color:isBold?C.text:C.muted,borderLeft:hasBorderL?`1px solid ${C.border}`:"none"}}>
                                    {val??"-"}
                                  </td>
                                );
                              };
                              return portalSubjectRows.map((s,i)=>{
                                const totals=[s.t1_total,s.t2_total,s.t3_total].filter(v=>v!=null).map(Number);
                                const avg=totals.length?totals.reduce((a,b)=>a+b,0)/totals.length:null;
                                const grade=getGrade(avg,gradingSchema);
                                const inp=(field,val,hasBorderL,isBold)=>{
                                  if(!editMode)return(
                                    <td style={{padding:"6px",textAlign:"center",fontWeight:isBold?700:"normal",
                                      color:isBold?C.text:C.muted,borderLeft:hasBorderL?`1px solid ${C.border}`:"none",
                                      background:val==null?`${C.orange}10`:"inherit"}}>
                                      {val??"-"}
                                    </td>
                                  );
                                  const k=`${sid}-${s.name}-${field}`;
                                  const cur=scoreOverrides.hasOwnProperty(k)?scoreOverrides[k]:(val??'');
                                  return(
                                    <td style={{padding:"3px",borderLeft:hasBorderL?`1px solid ${C.border}`:"none"}}>
                                      <input type="number" min="0" max="100" value={cur}
                                        onChange={e=>setScoreOverrides(p=>({...p,[k]:e.target.value}))}
                                        placeholder={val!=null?String(val):""}
                                        style={{width:50,padding:"4px 3px",border:`1.5px solid ${scoreOverrides.hasOwnProperty(k)?C.orange:C.border}`,
                                          borderRadius:4,fontSize:11,textAlign:"center",outline:"none",background:C.white}}/>
                                    </td>
                                  );
                                };
                                return(
                                  <tr key={i} style={{background:i%2===0?C.white:C.offWhite,borderBottom:`1px solid ${C.border}`}}>
                                    <td style={{padding:"7px 10px",fontWeight:600,fontSize:12}}>{s.name}</td>
                                    {inp("t1_ca",s.t1_ca,true,false)}
                                    {inp("t1_exam",s.t1_exam,false,false)}
                                    {inp("t1_total",s.t1_total,true,false)}
                                    {inp("t2_ca",s.t2_ca,false,true)}
                                    {inp("t2_exam",s.t2_exam,false,false)}
                                    {inp("t2_total",s.t2_total,true,false)}
                                    {inp("t3_ca",s.t3_ca,false,true)}
                                    {inp("t3_exam",s.t3_exam,false,false)}
                                    {inp("t3_total",s.t3_total,true,false)}
                                    <td style={{padding:"6px",textAlign:"center",fontWeight:800,color:C.blue,borderLeft:`1px solid ${C.border}`}}>{avg!=null?avg.toFixed(1):"—"}</td>
                                    <td style={{padding:"6px",textAlign:"center"}}><Badge color={gradeCol(grade)}>{grade}</Badge></td>
                                  </tr>
                                );
                              });
                            })()}
                          </tbody>
                        </table>
                      ):(
                        /* ── Multi-session grouped table ── */
                        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:selSessions.length*220+160}}>
                          <thead>
                            <tr style={{background:C.blue,color:"#fff"}}>
                              <th style={{padding:"8px 10px",textAlign:"left",fontWeight:700,fontSize:11}} rowSpan={2}>Subject</th>
                              {selSessions.map((sid,si)=>(
                                <th key={sid} colSpan={5} style={{padding:"7px 8px",textAlign:"center",fontSize:10,fontWeight:700,
                                  borderLeft:`2px solid rgba(255,255,255,.3)`}}>
                                  {sessions.find(s=>String(s.id)===sid)?.name||sid}
                                </th>
                              ))}
                              <th style={{padding:"8px",textAlign:"center",fontSize:10,borderLeft:`2px solid rgba(255,255,255,.3)`}} rowSpan={2}>Overall Avg</th>
                              <th style={{padding:"8px",textAlign:"center",fontSize:10}} rowSpan={2}>Grade</th>
                            </tr>
                            <tr style={{background:"#1e3a8a",color:"#bfdbfe"}}>
                              {selSessions.map((sid,si)=>(
                                ["T1","T2","T3","Avg","Grd"].map((h,hi)=>(
                                  <th key={sid+h} style={{padding:"5px 5px",textAlign:"center",fontSize:10,fontWeight:600,
                                    borderLeft:hi===0?`2px solid rgba(255,255,255,.15)`:"none",minWidth:hi<3?54:44}}>{h}</th>
                                ))
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {portalSubjectRows.map((s,ri)=>{
                              const allTotals=s.sessions.flatMap(sess=>[sess.t1_total,sess.t2_total,sess.t3_total].filter(v=>v!=null)).map(Number);
                              const overallAvg=allTotals.length?allTotals.reduce((a,b)=>a+b,0)/allTotals.length:null;
                              const overallGrade=getGrade(overallAvg,gradingSchema);
                              return(
                                <tr key={ri} style={{background:ri%2===0?C.white:C.offWhite,borderBottom:`1px solid ${C.border}`}}>
                                  <td style={{padding:"7px 10px",fontWeight:600,fontSize:12}}>{s.name}</td>
                                  {s.sessions.map((sess,si)=>{
                                    const totals=[sess.t1_total,sess.t2_total,sess.t3_total].filter(v=>v!=null).map(Number);
                                    const sessAvg=totals.length?totals.reduce((a,b)=>a+b,0)/totals.length:null;
                                    const sessGrade=getGrade(sessAvg,gradingSchema);
                                    const inp=(field,val)=>{
                                      if(!editMode)return(
                                        <td style={{padding:"6px",textAlign:"center",fontWeight:700,
                                          borderLeft:field==="t1_total"?`2px solid ${C.border}`:"none",
                                          background:val==null?`${C.orange}10`:"inherit"}}>
                                          {val??"-"}
                                        </td>
                                      );
                                      const k=`${sess.sessionId}-${s.name}-${field}`;
                                      const cur=scoreOverrides.hasOwnProperty(k)?scoreOverrides[k]:(val??'');
                                      return(
                                        <td style={{padding:"3px",borderLeft:field==="t1_total"?`2px solid ${C.border}`:"none"}}>
                                          <input type="number" min="0" max="100" value={cur}
                                            onChange={e=>setScoreOverrides(p=>({...p,[k]:e.target.value}))}
                                            placeholder={val!=null?String(val):""}
                                            style={{width:50,padding:"4px 3px",border:`1.5px solid ${scoreOverrides.hasOwnProperty(k)?C.orange:C.border}`,
                                              borderRadius:4,fontSize:11,textAlign:"center",outline:"none",background:C.white}}/>
                                        </td>
                                      );
                                    };
                                    return(
                                      <React.Fragment key={sess.sessionId}>
                                        {inp("t1_total",sess.t1_total)}
                                        {inp("t2_total",sess.t2_total)}
                                        {inp("t3_total",sess.t3_total)}
                                        <td style={{padding:"6px",textAlign:"center",fontWeight:700,color:C.blue}}>{sessAvg!=null?sessAvg.toFixed(1):"—"}</td>
                                        <td style={{padding:"6px",textAlign:"center"}}><Badge color={gradeCol(sessGrade)}>{sessGrade}</Badge></td>
                                      </React.Fragment>
                                    );
                                  })}
                                  <td style={{padding:"6px",textAlign:"center",fontWeight:800,color:C.blue,borderLeft:`2px solid ${C.border}`}}>{overallAvg!=null?overallAvg.toFixed(1):"—"}</td>
                                  <td style={{padding:"6px",textAlign:"center"}}><Badge color={gradeCol(overallGrade)}>{overallGrade}</Badge></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </Card>
                ):selStu&&selSessions.length&&!loadingPortal?(
                  <Card style={{textAlign:"center",padding:40}}>
                    <div style={{marginBottom:8}}><Inbox size={36} color={C.muted}/></div>
                    <div style={{fontWeight:700,color:C.blue,fontSize:14}}>No Results Found</div>
                    <div style={{color:C.muted,fontSize:12,marginTop:4}}>
                      No portal records for <strong>{selStu.id}</strong> in the selected session(s).
                    </div>
                    <div style={{marginTop:12,color:C.muted,fontSize:12}}>For historical data, use the <strong>Manual Transcripts</strong> tab.</div>
                  </Card>
                ):selStu&&!selSessions.length?(
                  <Card style={{textAlign:"center",padding:40,color:C.light}}>
                    <div style={{marginBottom:8}}><Calendar size={32} color={C.muted}/></div>
                    <div>Select one or more academic years above, then click "Load Results"</div>
                  </Card>
                ):null}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Transcript History (all staff) ── */}
      {role!=="student"&&history.length>0&&(
        <Card style={{marginTop:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}
            onClick={()=>setShowHistory(x=>!x)}>
            <div style={{fontWeight:800,color:C.blue,fontSize:13,display:"flex",alignItems:"center",gap:8}}>
              <FileText size={14}/>Transcript History
              <span style={{background:C.green,color:"#fff",borderRadius:10,padding:"1px 8px",fontSize:11}}>{history.length}</span>
            </div>
            <span style={{fontSize:11,color:C.muted}}>{showHistory?"▲ Hide":"▼ Show"}</span>
          </div>
          {showHistory&&(
            <div style={{overflowX:"auto",marginTop:12}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr style={{background:C.blue,color:"#fff"}}>
                    <th style={{padding:"8px 10px",textAlign:"left",fontWeight:700,fontSize:11}}>Member</th>
                    <th style={{padding:"8px 10px",textAlign:"left",fontWeight:700,fontSize:11}}>Session(s)</th>
                    <th style={{padding:"8px 10px",textAlign:"left",fontWeight:700,fontSize:11}}>Generated By</th>
                    <th style={{padding:"8px 10px",textAlign:"left",fontWeight:700,fontSize:11}}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h,i)=>{
                    const sessLabels=(h.session_ids||[]).map(id=>sessions.find(s=>String(s.id)===id)?.name||id);
                    return(
                      <tr key={h.id} style={{background:i%2===0?C.white:C.offWhite,borderBottom:`1px solid ${C.border}`}}>
                        <td style={{padding:"7px 10px"}}>
                          <div style={{fontWeight:700}}>{h.student_name}</div>
                          <div style={{fontSize:11,color:C.muted}}>{h.student_id}</div>
                        </td>
                        <td style={{padding:"7px 10px",color:C.muted,fontSize:11}}>{sessLabels.join(" · ")||"—"}</td>
                        <td style={{padding:"7px 10px",color:C.muted,fontSize:11}}>{h.updated_by_name||"—"}</td>
                        <td style={{padding:"7px 10px",color:C.muted,fontSize:11}}>
                          {new Date(h.generated_at||h.updated_at).toLocaleDateString("en-NG",{day:"2-digit",month:"short",year:"numeric"})}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ══ MANUAL TRANSCRIPTS TAB ══ */}
      {tab==="manual"&&role!=="student"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:13,color:C.muted}}>
              {manualList.length} saved manual transcript{manualList.length!==1?"s":""}
            </div>
            <Btn onClick={()=>openManualModal("new")} color={C.orange}>Create Manual Transcript</Btn>
          </div>

          {loadingManual?<Spinner/>:manualList.length===0?(
            <Card style={{textAlign:"center",padding:48}}>
              <div style={{marginBottom:10}}><FileText size={44} color={C.muted}/></div>
              <div style={{fontWeight:800,color:C.blue,fontSize:16}}>No Manual Transcripts Yet</div>
              <div style={{color:C.muted,fontSize:13,marginTop:4}}>Create one for members with historical records not in the portal.</div>
              <Btn onClick={()=>openManualModal("new")} color={C.orange} style={{marginTop:16}}>Create First Transcript</Btn>
            </Card>
          ):(
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
              {manualList.map(rec=>(
                <Card key={rec.id}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                    <div>
                      <div style={{fontWeight:800,fontSize:14,color:C.blue}}>{rec.student_name}</div>
                      <div style={{fontSize:11,color:C.muted}}>{rec.student_number||rec.student_id||"No ID"} · {rec.class_name||"—"}</div>
                      <div style={{marginTop:4}}><Badge color={C.orange}>{rec.academic_year}</Badge></div>
                    </div>
                    <Badge color={C.green}>{(rec.manual_transcript_subjects||[]).length} subjects</Badge>
                  </div>
                  {rec.notes&&<div style={{fontSize:11,color:C.muted,marginBottom:10,fontStyle:"italic"}}>{rec.notes}</div>}
                  <div style={{fontSize:10,color:C.light,marginBottom:10}}>
                    Created: {new Date(rec.created_at).toLocaleDateString("en-NG",{day:"2-digit",month:"short",year:"numeric"})}
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <Btn xs onClick={()=>genManualPDF(rec)} color={C.orange} style={{flex:1}}>PDF</Btn>
                    <Btn xs onClick={()=>openManualModal(rec)} color={C.blue} outline style={{flex:1}}>Edit</Btn>
                    <Btn xs onClick={()=>deleteManual(rec.id)} color={C.red} outline><Trash2 size={13}/></Btn>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* ── Manual Transcript Form Modal ─── */}
          {manualModal&&(
            <Modal title={manualModal==="new"?"Create Manual Transcript":"Edit Manual Transcript"}
              onClose={()=>setManualModal(null)} width={960}>

              {/* Transcript type toggle */}
              <div style={{display:"flex",gap:4,marginBottom:16,background:C.offWhite,borderRadius:9,padding:4,width:"fit-content"}}>
                {[{id:"multi_period",label:"Multi-Period (Group Progress)"},{id:"legacy",label:"Single Year / Custom Structure"}].map(t=>(
                  <button key={t.id} onClick={()=>switchType(t.id)}
                    style={{padding:"7px 16px",borderRadius:6,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,
                      background:transcriptType===t.id?C.blue:"transparent",
                      color:transcriptType===t.id?"#fff":C.muted,transition:"all .15s"}}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Student info */}
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:10,marginBottom:10}}>
                <Inp label="Member Full Name *" value={mForm.student_name} onChange={v=>mf({student_name:v})} placeholder="e.g. John Doe Okafor"/>
                <Inp label="Member ID / Admission No." value={mForm.student_number} onChange={v=>mf({student_number:v})} placeholder="e.g. RGS/001"/>
                <Sel label="Gender" value={mForm.gender} onChange={v=>mf({gender:v})} options={[{value:"",label:"—"},{value:"Male",label:"Male"},{value:"Female",label:"Female"}]}/>
                <Inp label="Date of Birth" value={mForm.dob} onChange={v=>mf({dob:v})} placeholder="e.g. 01 Jan 2010"/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr"+(transcriptType==="legacy"?" 1fr":""),gap:10,marginBottom:16}}>
                <Inp label="Current Group" value={mForm.class_name} onChange={v=>mf({class_name:v})} placeholder="e.g. SS3"/>
                <Inp label="Section / Dept." value={mForm.section_name} onChange={v=>mf({section_name:v})} placeholder="e.g. Senior Secondary"/>
                {transcriptType==="legacy"&&<Inp label="Academic Year *" value={mForm.academic_year} onChange={v=>mf({academic_year:v})} placeholder="e.g. 2021/2022"/>}
              </div>

              {/* ── MULTI-PERIOD: Class Periods section ── */}
              {transcriptType==="multi_period"&&(
                <div style={{marginBottom:16,background:C.offWhite,borderRadius:10,padding:12,border:`1px solid ${C.border}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div style={{fontWeight:800,color:C.blue,fontSize:13}}>Class Periods
                      <span style={{fontWeight:400,color:C.muted,fontSize:11,marginLeft:6}}>— one column group per group/year</span>
                    </div>
                    <Btn xs onClick={addClassPeriod} color={C.orange} outline>+ Add Period</Btn>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {classPeriods.map((cp,i)=>(
                      <div key={i} style={{display:"grid",gridTemplateColumns:"28px 1fr 1fr auto",gap:8,alignItems:"center",
                        background:C.white,borderRadius:8,padding:"8px 10px",border:`1px solid ${C.border}`}}>
                        <div style={{fontWeight:800,fontSize:12,textAlign:"center",
                          width:24,height:24,borderRadius:"50%",background:C.bluePale,color:C.blue,
                          display:"flex",alignItems:"center",justifyContent:"center"}}>{i+1}</div>
                        <input placeholder="Group (e.g. SS1, JSS3)" value={cp.class_name}
                          onChange={e=>updateClassPeriod(i,{class_name:e.target.value})}
                          style={{padding:"7px 10px",border:`1px solid ${C.border}`,borderRadius:7,fontSize:12,outline:"none",width:"100%"}}/>
                        <input placeholder="Academic Year (e.g. 2021/2022)" value={cp.academic_year}
                          onChange={e=>updateClassPeriod(i,{academic_year:e.target.value})}
                          style={{padding:"7px 10px",border:`1px solid ${C.border}`,borderRadius:7,fontSize:12,outline:"none",width:"100%"}}/>
                        <button onClick={()=>removeClassPeriod(i)} disabled={classPeriods.length===1}
                          style={{border:"none",background:"none",cursor:classPeriods.length===1?"not-allowed":"pointer",
                            color:classPeriods.length===1?C.light:C.red,padding:4,borderRadius:6,display:"flex",alignItems:"center"}}>
                          <X size={14}/>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── LEGACY: Score structure selector ── */}
              {transcriptType==="legacy"&&(
                <div style={{marginBottom:14}}>
                  <div style={{fontWeight:700,fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:".05em",marginBottom:5}}>Score Structure</div>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <select value={mForm.structure_id||""} onChange={e=>onStructureChange(e.target.value)}
                      style={{flex:1,padding:"8px 10px",border:`2px solid ${mForm.structure_id?C.blue:C.border}`,
                        borderRadius:8,fontSize:12,outline:"none",background:C.white,color:C.text}}>
                      <option value="">— Legacy (T1 CA / Exam / Total × 3 Terms) —</option>
                      {caeStructures.map(s=><option key={s.id} value={s.id}>{s.name}{s.maximum_score?` (max ${s.maximum_score})`:""}</option>)}
                    </select>
                    {mForm.structure_id&&<div style={{fontSize:11,color:C.green,fontWeight:700,display:"flex",alignItems:"center",gap:4,whiteSpace:"nowrap"}}><CheckCircle2 size={13}/>{structComps.length} cols</div>}
                  </div>
                </div>
              )}

              {/* Subject Scores table */}
              <div style={{fontWeight:800,color:C.blue,fontSize:13,marginBottom:8}}>Subject Scores</div>
              {loadingComps?<div style={{padding:"20px 0",textAlign:"center"}}><Spinner/></div>:(
              <div style={{overflowX:"auto",marginBottom:12}}>
                {transcriptType==="multi_period"?(
                  // ── Multi-period tables, chunked to max 3 periods per table ──
                  (()=>{
                    const MP_CHUNK=3;
                    const mpChunks=[];
                    for(let i=0;i<classPeriods.length;i+=MP_CHUNK) mpChunks.push({periods:classPeriods.slice(i,i+MP_CHUNK),start:i});
                    return mpChunks.map((chunk,chunkIdx)=>(
                      <div key={chunkIdx} style={{marginBottom:chunkIdx<mpChunks.length-1?16:0}}>
                        {chunkIdx>0&&(
                          <div style={{fontSize:11,color:C.muted,fontWeight:600,marginBottom:6,
                            padding:"5px 10px",background:C.offWhite,borderRadius:6,border:`1px solid ${C.border}`}}>
                            ↓ Continued — Periods {chunk.start+1}–{chunk.start+chunk.periods.length}
                          </div>
                        )}
                        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                          <thead>
                            <tr style={{background:C.blue,color:"#fff"}}>
                              <th style={{padding:"7px 10px",textAlign:"left",minWidth:150}} rowSpan={3}>SUBJECTS</th>
                              {chunk.periods.map((cp,i)=>(
                                <th key={i} colSpan={5} style={{padding:"6px 4px",textAlign:"center",fontSize:11,fontWeight:900,
                                  borderLeft:`1px solid rgba(255,255,255,.25)`,textDecoration:"underline"}}>
                                  {cp.class_name||`Period ${chunk.start+i+1}`}
                                </th>
                              ))}
                              <th rowSpan={3} style={{width:32}}/>
                            </tr>
                            <tr style={{background:"#1e3a8a",color:"#bfdbfe"}}>
                              {chunk.periods.map((cp,i)=>(
                                <th key={i} colSpan={5} style={{padding:"5px 4px",textAlign:"center",fontSize:10,fontWeight:700,
                                  borderLeft:`1px solid rgba(255,255,255,.15)`}}>
                                  {cp.academic_year||"—"}
                                </th>
                              ))}
                            </tr>
                            <tr style={{background:"#1e3a8a",color:"#93c5fd"}}>
                              {chunk.periods.map((_,ci)=>(
                                ["1st Term","2nd Term","3rd Term","Avg","Grade"].map((h,hi)=>(
                                  <th key={ci+"-"+hi} style={{padding:"5px 4px",textAlign:"center",fontSize:10,fontWeight:600,
                                    minWidth:hi<3?62:50,borderLeft:hi===0?`1px solid rgba(255,255,255,.15)`:"none"}}>{h}</th>
                                ))
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {subjects.map((s,si)=>(
                              <tr key={si} style={{background:si%2===0?C.white:C.offWhite,borderBottom:`1px solid ${C.border}`}}>
                                <td style={{padding:"4px 6px"}}>
                                  <input value={s.name} onChange={e=>updateSubj(si,{name:e.target.value})} placeholder={`Subject ${si+1}`}
                                    style={{width:"100%",padding:"5px 8px",border:`1px solid ${C.border}`,borderRadius:5,fontSize:12,outline:"none"}}/>
                                </td>
                                {chunk.periods.map((_,ci)=>{
                                  const pi=chunk.start+ci;
                                  const p=(s.periods||[])[pi]||{t1:"",t2:"",t3:""};
                                  const avg=periodAvg(p);
                                  const gc=avg==null?C.muted:avg>=70?C.green:avg>=50?C.blue:C.red;
                                  return(
                                    <React.Fragment key={ci}>
                                      {["t1","t2","t3"].map((k,ki)=>(
                                        <td key={k} style={{padding:"3px 2px",borderLeft:ki===0?`1px solid ${C.border}`:"none"}}>
                                          <input type="number" min="0" max="100" value={p[k]||""}
                                            onChange={e=>{
                                              const np=(s.periods||[]).map((pp,ppi)=>ppi===pi?{...pp,[k]:e.target.value}:pp);
                                              updateSubj(si,{periods:np});
                                            }}
                                            style={{width:58,padding:"5px 3px",border:`1px solid ${C.border}`,borderRadius:5,fontSize:12,textAlign:"center",outline:"none"}}/>
                                        </td>
                                      ))}
                                      <td style={{padding:"3px 4px",textAlign:"center",fontWeight:800,fontSize:12,color:avg!=null?C.blue:C.light,minWidth:46}}>
                                        {avg!=null?avg.toFixed(1):"—"}
                                      </td>
                                      <td style={{padding:"3px 4px",textAlign:"center",minWidth:40}}>
                                        {avg!=null&&<span style={{fontWeight:800,fontSize:11,color:gc}}>{avg>=70?"A":avg>=60?"B":avg>=50?"C":avg>=45?"D":avg>=40?"E":"F"}</span>}
                                      </td>
                                    </React.Fragment>
                                  );
                                })}
                                {/* Delete button only on last chunk */}
                                {chunkIdx===mpChunks.length-1&&(
                                  <td style={{padding:"4px 3px",textAlign:"center"}}>
                                    <button onClick={()=>removeSubj(si)} style={{border:"none",background:"none",cursor:"pointer",color:C.red,fontSize:16,padding:2}}>×</button>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ));
                  })()
                ):(
                  // ── Legacy / score-structure table ──
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:600}}>
                    <thead>
                      <tr style={{background:C.blue,color:"#fff"}}>
                        <th style={{padding:"7px 10px",textAlign:"left",minWidth:140}}>Subject</th>
                        {displayCols.map((h,i)=>(
                          <th key={i} style={{padding:"7px 6px",textAlign:"center",fontSize:10,minWidth:55,
                            borderLeft:(!mForm.structure_id&&i%3===0)?`1px solid rgba(255,255,255,.25)`:"none"}}>{h}</th>
                        ))}
                        <th style={{padding:"7px 6px",width:36}}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {subjects.map((s,i)=>(
                        <tr key={i} style={{background:i%2===0?C.white:C.offWhite,borderBottom:`1px solid ${C.border}`}}>
                          <td style={{padding:"4px 6px"}}>
                            <input value={s.name} onChange={e=>updateSubj(i,{name:e.target.value})} placeholder={`Subject ${i+1}`}
                              style={{width:"100%",padding:"5px 8px",border:`1px solid ${C.border}`,borderRadius:5,fontSize:12,outline:"none"}}/>
                          </td>
                          {displayCols.map((col,ci)=>(
                            <td key={col} style={{padding:"4px 3px",borderLeft:(!mForm.structure_id&&ci%3===0)?`1px solid ${C.border}`:"none"}}>
                              <input type="number" min="0" max="9999" value={(s.scores||{})[col]||""}
                                onChange={e=>updateSubj(i,{scores:{...(s.scores||{}),[col]:e.target.value}})}
                                style={{width:"100%",padding:"5px 4px",border:`1px solid ${C.border}`,borderRadius:5,fontSize:12,textAlign:"center",outline:"none"}}/>
                            </td>
                          ))}
                          <td style={{padding:"4px 3px",textAlign:"center"}}>
                            <button onClick={()=>removeSubj(i)} style={{border:"none",background:"none",cursor:"pointer",color:C.red,fontSize:16,padding:2}}>×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              )}
              <Btn xs onClick={addSubj} color={C.blue} outline style={{marginBottom:14}}>+ Add Subject Row</Btn>

              <Inp label="Notes (optional)" value={mForm.notes} onChange={v=>mf({notes:v})} placeholder="Any additional remarks…"/>

              <div style={{display:"flex",gap:10,marginTop:8}}>
                <Btn onClick={saveManual} color={C.green} style={{flex:1}} disabled={saving}>{saving?"Saving…":"Save Transcript"}</Btn>
                <Btn onClick={()=>setManualModal(null)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
              </div>
            </Modal>
          )}
        </div>
      )}
    </div>
  );
}



// ─── STAMP TEMPLATE GENERATOR ────────────────────────────────────────────────
