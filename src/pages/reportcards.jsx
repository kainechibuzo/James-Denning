/**
 * Reports domain: ReportCardsPage, ResultApprovalsPage, SignaturesPage,
 * ReportCardSettingsPage, ReportTemplatesPage
 */
import React, { useState, useEffect, useMemo, useContext } from "react";
import {
  AlertCircle, BarChart2, Building, CheckCircle2, ChevronDown, ClipboardList,
  Clock, Download, Edit, Eye, FileStack, Lock, MinusCircle, Pencil, Save,
  School, Search, Send, Settings, ShieldCheck, Trash2, Upload, X,
} from "lucide-react";
import { db, supabase } from "../supabaseClient.js";
import { C } from "../config/theme.js";
import { SectionCtx, useSection } from "../contexts/section.jsx";
import {
  Card, Btn, Badge, Inp, Sel, Modal, Spinner, AppIcon,
} from "../components/ui.jsx";
import { buildEmailHtml, sendPortalEmail, buildAlertEmail } from "../services/email/index.js";
import {
  fullName, getGrade, getRemark, gradeCol as _gradeColPure,
} from "../utils/grades.js";
import {
  downloadPDF, shareFilePDF, htmlToPdfBase64, pdfName,
} from "../services/pdf/capture.js";
import { shareOrDownload } from "../utils/platform.js";
import { openReportCardPrintWindow } from "../services/reportCards/generator.js";
import { BulkReportEmailModal } from "./students.jsx";
import { generateStampSvg, SettingRow, SettingInput, SettingToggle, STAMP_TEMPLATES } from "./settings.jsx";

const gradeCol = g => _gradeColPure(g, C);

export function ReportCardsPage({ctx}){
  const {notify,role,user,selectedSection,canAccess,setPage}=ctx;
  const canPublish=role==="admin"||canAccess("action:publish_results");
  const canMA=role==="admin"||canAccess("action:approve_ma");
  const sectionCtx=useContext(SectionCtx);
  const [sessions,setSessions]=useState([]);
  const [terms,setTerms]=useState([]);
  const [classes,setClasses]=useState([]);
  const [students,setStudents]=useState([]);
  const [selSession,setSelSession]=useState("");
  const [selTerm,setSelTerm]=useState("");
  const [selClass,setSelClass]=useState("");
  const [selStudent,setSelStudent]=useState(null);
  const [results,setResults]=useState([]);
  const [caeResults,setCaeResults]=useState([]);
  const [caeTraits,setCaeTraits]=useState([]);
  const [caeRatings,setCaeRatings]=useState([]);
  const [gradingSchema,setGradingSchema]=useState([]);
  const [publishInfo,setPublishInfo]=useState(null);
  const [settings,setSettings]=useState({});
  const [stuSearch,setStuSearch]=useState("");
  // When teacher_report_card_view_only is ON, admin actions are hidden; Share is always available.
  // Sub-permissions independently re-enable Print/Download/Email/Export in restricted mode.
  const teacherViewOnly=role==="teacher"&&settings.teacher_report_card_view_only==="true";
  const rcAllowPrint   =!teacherViewOnly||settings.teacher_rc_allow_print==="true";
  const rcAllowDownload=!teacherViewOnly||settings.teacher_rc_allow_download==="true";
  const rcAllowEmail   =!teacherViewOnly||settings.teacher_rc_allow_email==="true";
  const rcAllowExport  =!teacherViewOnly||settings.teacher_rc_allow_export==="true";
  const [sectionScoreOverride,setSectionScoreOverride]=useState(null); // {caMax,examMax} from section CAE structure
  const [rcCaeComps,setRcCaeComps]=useState([]); // literal CAE components for preview table columns
  const [loading,setLoading]=useState(false);
  const [publishing,setPublishing]=useState(false);
  const [generating,setGenerating]=useState(false);
  const [emailSendMode,setEmailSendMode]=useState("attachment"); // "link" | "attachment"
  const [sectionBulkEmail,setSectionBulkEmail]=useState(null); // null | {students,publishInfoMap}
  const [editComments,setEditComments]=useState(false);
  const [classTeacherComment,setClassTeacherComment]=useState("");
  const [principalComment,setPrincipalComment]=useState("");
  const [nextTermBegins,setNextTermBegins]=useState("");
  const [previewMode,setPreviewMode]=useState(false);
  const [allStudentResults,setAllStudentResults]=useState({});
  // New publish customization state
  const [showPublishModal,setShowPublishModal]=useState(false);
  const [pubOptions,setPubOptions]=useState({
    show_cae:true,show_teacher_comment:true,show_principal_comment:true,
    show_parent_ack:false,show_position:true,show_next_term:true,show_attendance:false,
    card_design:"classic",
  });
  const [signatures,setSignatures]=useState([]);
  const [teacherSigId,setTeacherSigId]=useState("");
  const [principalSigId,setPrincipalSigId]=useState("");
  const [templates,setTemplates]=useState([]);
  const [selTemplate,setSelTemplate]=useState("");
  const [approval,setApproval]=useState(null);
  const [completeness,setCompleteness]=useState(null); // {complete,missing:[],studentSummary:[]}
  const [approvingMA,setApprovingMA]=useState(false);
  const [zipGenerating,setZipGenerating]=useState(false);
  const [zipProgress,setZipProgress]=useState({current:0,total:0,cls:"",student:""});

  // load lookups on mount
  useEffect(()=>{
    Promise.all([
      db.getSessions(),
      db.getSettings(),
      db.getSignatures(),
      db.getReportTemplates(),
    ]).then(([s,st,sig,tmpl])=>{
      setSessions(s.data||[]);
      const m={};(st.data||[]).forEach(r=>{m[r.key]=r.value;});
      setSettings(m);
      setSignatures(sig.data||[]);
      setTemplates(tmpl.data||[]);
      // Auto-apply the default template settings on load
      const defTmpl=(tmpl.data||[]).find(t=>t.is_default)||(tmpl.data||[])[0];
      if(defTmpl){
        setPubOptions({
          show_cae:defTmpl.show_cae!==false,
          show_teacher_comment:defTmpl.show_teacher_comment!==false,
          show_principal_comment:defTmpl.show_principal_comment!==false,
          show_parent_ack:defTmpl.show_parent_ack!==false,
          show_position:defTmpl.show_position!==false,
          show_next_term:defTmpl.show_next_term!==false,
          card_design:defTmpl.card_design||"classic",
          card_spacing:defTmpl.card_spacing||"normal",
        });
        if(defTmpl.teacher_signature_id)setTeacherSigId(String(defTmpl.teacher_signature_id));
        if(defTmpl.principal_signature_id)setPrincipalSigId(String(defTmpl.principal_signature_id));
        if(defTmpl.default_teacher_comment)setClassTeacherComment(defTmpl.default_teacher_comment);
        if(defTmpl.default_principal_comment)setPrincipalComment(defTmpl.default_principal_comment);
        if(defTmpl.default_next_term_date)setNextTermBegins(defTmpl.default_next_term_date);
      }
      const active=s.data?.find(x=>x.is_active);
      if(active){setSelSession(String(active.id));
        db.getTerms(active.id).then(({data})=>{
          setTerms(data||[]);
          const at=data?.find(x=>x.is_active);
          if(at)setSelTerm(String(at.id));
        });
      }
      // Load classes — after settings so we can read teacher_subject_class_report_cards flag.
      // The setting is "Restrict to Form Group Only": ON ("true") → form only; OFF/default → union of form+subject.
      // subjectClassAccess = true means subject-teacher classes are ALSO allowed (the OFF/default behaviour).
      const subjectClassAccess=m.teacher_subject_class_report_cards!=="true";
      if(role==="teacher" && user.teacher_db_id){
        // Fetch both subject-teacher and form-teacher assignments in parallel.
        // Use +id coercion everywhere so integer IDs compare correctly regardless of source type.
        const tid=String(user.teacher_db_id);
        Promise.all([
          db.getTeacherSubjects(user.teacher_db_id), // same proven call as ResultsTeachPage
          db.getAllFormTeachers(),
        ]).then(([subjRes,ftRes])=>{
          const subjClassIds=new Set((subjRes.data||[]).map(r=>+r.class_id));
          const formClassIds=new Set((ftRes.data||[])
            .filter(r=>String(r.teacher_id)===tid)
            .map(r=>+r.class_id));
          // When restricted: form-teacher classes only. Otherwise: union of both.
          const allowed=subjectClassAccess
            ?new Set([...subjClassIds,...formClassIds])
            :formClassIds;
          db.getClasses().then(({data:cls})=>{
            setClasses((cls||[]).filter(c=>allowed.has(+c.id)));
          });
        });
      } else {
        db.getClasses(selectedSection?.id).then(({data})=>setClasses(data||[]));
      }
    });
  },[selectedSection,role,user]);

  // For teachers: when section tab changes, clear selected class if it belongs to a different section
  useEffect(()=>{
    if(role!=="teacher"||!selClass)return;
    const cls=classes.find(c=>c.id===+selClass);
    if(selectedSection&&cls&&cls.section_id!==selectedSection.id){
      setSelClass("");setSelStudent(null);setResults([]);
    }
  },[selectedSection]);

  // load terms when session changes
  useEffect(()=>{
    if(!selSession)return;
    db.getTerms(+selSession).then(({data})=>setTerms(data||[]));
    setSelTerm("");setSelClass("");setSelStudent(null);setResults([]);
  },[selSession]);

  // load students + publish info + grading when class+term selected
  useEffect(()=>{
    if(!selClass||!selTerm||!selSession)return;
    setLoading(true);
    const cls=classes.find(c=>c.id===+selClass);
    const secId=cls?.section_id;
    Promise.all([
      db.getStudents(),
      db.getReportPublish({class_id:+selClass,term_id:+selTerm,session_id:+selSession}),
      db.getGradingSchema(secId,"grades"),
      db.getCaeTraits(secId),
      db.getCaeRatings(secId),
      db.getResultApproval(+selClass,+selTerm,+selSession),
      db.getResultsCompleteness(+selClass,+selTerm,+selSession),
      db.getClassSubjectIds(+selClass),
      secId?db.getCaeStructureBySectionId(secId):Promise.resolve({data:null}),
    ]).then(async([s,pub,gs,ct,cr,appr,resCmp,clsSubs,caeStrRes])=>{
      // ── Derive section-specific CA/Exam maxima from CAE structure ──
      if(caeStrRes.data){
        const {data:comps}=await db.getCaeComponents(caeStrRes.data.id);
        const lit=(comps||[]).filter(c=>!c.is_total_score&&c.mode==='literal');
        setRcCaeComps(lit);
        if(lit.length>=2){
          const eMax=parseFloat(lit[lit.length-1].value_or_formula)||0;
          const cMax=lit.slice(0,-1).reduce((acc,c)=>acc+(parseFloat(c.value_or_formula)||0),0);
          setSectionScoreOverride({caMax:cMax,examMax:eMax});
        } else { setSectionScoreOverride(null); }
      } else { setSectionScoreOverride(null); setRcCaeComps([]); }
      const stus=(s.data||[]).filter(x=>x.class_id===+selClass&&(x.status||"active")==="active");
      setStudents(stus);
      const p=pub.data?.[0]||null;
      setPublishInfo(p);
      // Only load per-class content from publishInfo. Layout/visibility always
      // comes from the global Report Settings page (default template),
      // loaded at page init. We never let publishInfo overwrite pubOptions.
      setClassTeacherComment(p?.class_teacher_comment||"");
      setPrincipalComment(p?.principal_comment||"");
      setNextTermBegins(p?.next_term_begins||"");
      if(p){
        // Signature overrides: use publishInfo value only when it has one
        if(p.teacher_signature_id)setTeacherSigId(String(p.teacher_signature_id));
        if(p.principal_signature_id)setPrincipalSigId(String(p.principal_signature_id));
      }
      setGradingSchema(gs.data||[]);
      setCaeTraits(ct.data||[]);
      setCaeRatings(cr.data||[]);
      setApproval(appr.data||null);

      // ── Completeness check ──
      const expectedSubjectIds=(clsSubs.data||[]).map(cs=>cs.section_subject_id);
      const resultRows=resCmp.data||[];
      const byStudent={};
      resultRows.forEach(r=>{
        if(!byStudent[r.student_id])byStudent[r.student_id]=new Set();
        byStudent[r.student_id].add(r.subject_id);
      });
      const allSubjNames=(clsSubs.data||[]).reduce((m,cs)=>{
        if(cs.section_subjects)m[cs.section_subject_id]=cs.section_subjects.name;
        return m;},{});
      // If no subjects assigned to class yet, mark as not set up (not complete)
      if(!expectedSubjectIds.length){
        setCompleteness({complete:false,noSetup:true,totalSubjects:0,studentSummary:[]});
      } else {
        let allComplete=true;
        const studentSummary=stus.map(stu=>{
          const done=byStudent[stu.id]||new Set();
          const missing=expectedSubjectIds.filter(sid=>!done.has(sid)).map(sid=>allSubjNames[sid]||`Category ${sid}`);
          if(missing.length)allComplete=false;
          return{id:stu.id,name:fullName(stu),missing};
        });
        setCompleteness({complete:allComplete,noSetup:false,totalSubjects:expectedSubjectIds.length,studentSummary});
      }

      setLoading(false);
    });
  },[selClass,selTerm,selSession,classes]);

  // load results when student selected
  useEffect(()=>{
    if(!selStudent||!selTerm||!selSession)return;
    Promise.all([
      db.getResults({student_id:selStudent.id,class_id:+selClass,term_id:+selTerm,session_id:+selSession}),
      db.getCaeResults({student_id:selStudent.id,class_id:+selClass,term_id:+selTerm,session_id:+selSession}),
    ]).then(([r,c])=>{
      setResults(r.data||[]);
      setCaeResults(c.data||[]);
    });
  },[selStudent,selTerm,selSession,selClass]);

  const savePublishInfo=async()=>{
    if(!selClass||!selTerm||!selSession){notify("Select group, period and cycle first","error");return;}
    setPublishing(true);
    const payload={
      class_id:+selClass,term_id:+selTerm,session_id:+selSession,
      is_published:publishInfo?.is_published||false,
      class_teacher_comment:classTeacherComment,
      principal_comment:principalComment,
      next_term_begins:nextTermBegins||null,
      show_cae:!!pubOptions.show_cae,
      show_teacher_comment:!!pubOptions.show_teacher_comment,
      show_principal_comment:!!pubOptions.show_principal_comment,
      show_parent_ack:!!pubOptions.show_parent_ack,
      show_position:!!pubOptions.show_position,
      show_next_term:!!pubOptions.show_next_term,
      show_attendance:!!pubOptions.show_attendance,
      teacher_signature_id:teacherSigId?+teacherSigId:null,
      principal_signature_id:principalSigId?+principalSigId:null,
      template_id:(()=>{const t=parseInt(settings.report_card_template_id||"",10);return Number.isFinite(t)&&t>=1&&t<=11?t:11;})(),
    };
    const {data,error}=await db.upsertReportPublish(payload);
    if(error)notify(`${error.message}${error.details?' — '+error.details:''}${error.hint?' ('+error.hint+')':''}`, "error");
    else{setPublishInfo(data);notify("Saved ✓");setEditComments(false);}
    setPublishing(false);
  };

  const applyTemplate=(tmpl)=>{
    if(!tmpl)return;
    setPubOptions({
      show_cae:tmpl.show_cae!==false,
      show_teacher_comment:tmpl.show_teacher_comment!==false,
      show_principal_comment:tmpl.show_principal_comment!==false,
      show_parent_ack:tmpl.show_parent_ack!==false,
      show_position:tmpl.show_position!==false,
      show_next_term:tmpl.show_next_term!==false,
      card_design:tmpl.card_design||"classic",
      card_spacing:tmpl.card_spacing||"normal",
    });
    if(tmpl.default_teacher_comment)setClassTeacherComment(tmpl.default_teacher_comment);
    if(tmpl.default_principal_comment)setPrincipalComment(tmpl.default_principal_comment);
    if(tmpl.default_next_term_date)setNextTermBegins(tmpl.default_next_term_date);
    if(tmpl.teacher_signature_id)setTeacherSigId(String(tmpl.teacher_signature_id));
    if(tmpl.principal_signature_id)setPrincipalSigId(String(tmpl.principal_signature_id));
    notify("Settings applied ✓");
  };

  const handleMA=async()=>{
    if(!canMA){notify("You don't have permission to give Manager Approval","error");return;}
    if(!selClass||!selTerm||!selSession)return;
    setApprovingMA(true);
    const isApproved=approval?.ma_status==="approved";
    if(isApproved){
      await db.revokeMA(+selClass,+selTerm,+selSession);
      notify("MA revoked","warn");
    } else {
      if(approval?.ea_status!=="approved"){
        notify("EA must be approved before MA","error");
        setApprovingMA(false);return;
      }
      if(completeness&&!completeness.complete&&!completeness.noSetup){
        notify("Results must be complete before approval. Some members have missing scores.","error");
        setApprovingMA(false);return;
      }
      await db.approveMA(+selClass,+selTerm,+selSession,user?.supabase_uid||null);
      notify("✅ Manager Approval granted — results fully locked");
    }
    const {data}=await db.getResultApproval(+selClass,+selTerm,+selSession);
    setApproval(data||null);
    setApprovingMA(false);
  };

  const publishCards=async()=>{
    if(!selClass||!selTerm||!selSession){notify("Select group, period and cycle first","error");return;}
    // Hard block: EA must be approved
    if(approval?.ea_status!=="approved"){
      notify("Cannot publish — Educator Approval (EA) has not been given for this group.","error");
      return;
    }
    // Hard block: MA must be approved
    if(approval?.ma_status!=="approved"){
      notify("Cannot publish — Manager Approval (MA) has not been given for this group. EA must be followed by MA before publishing.","error");
      return;
    }
    // Hard block: all results must be complete
    if(completeness&&!completeness.complete&&!completeness.noSetup){
      notify("Cannot publish — some members have missing category scores. Upload all results first.","error");
      return;
    }
    setShowPublishModal(true);
  };

  const doPublish=async()=>{
    setPublishing(true);
    console.log("[doPublish v2] Building payload — no spread");
    const payload={
      class_id:+selClass,term_id:+selTerm,session_id:+selSession,
      is_published:true,published_at:new Date().toISOString(),
      published_by:user?.id||null,
      class_teacher_comment:classTeacherComment,
      principal_comment:principalComment,
      next_term_begins:nextTermBegins||null,
      show_cae:!!pubOptions.show_cae,
      show_teacher_comment:!!pubOptions.show_teacher_comment,
      show_principal_comment:!!pubOptions.show_principal_comment,
      show_parent_ack:!!pubOptions.show_parent_ack,
      show_position:!!pubOptions.show_position,
      show_next_term:!!pubOptions.show_next_term,
      show_attendance:!!pubOptions.show_attendance,
      teacher_signature_id:teacherSigId?+teacherSigId:null,
      principal_signature_id:principalSigId?+principalSigId:null,
      template_id:(()=>{const t=parseInt(settings.report_card_template_id||"",10);return Number.isFinite(t)&&t>=1&&t<=11?t:11;})(),
    };
    console.log("[doPublish v2] payload keys:", Object.keys(payload), payload);
    const {data,error}=await db.upsertReportPublish(payload);
    if(error){console.error("[doPublish v2] error:", error);notify(`${error.message}${error.details?' — '+error.details:''}${error.hint?' ('+error.hint+')':''}`, "error");}
    else{
      setPublishInfo(data);notify("✅ Report cards published — members can now view them");setShowPublishModal(false);
      // Tier A alert — report published
      const cls=classes?.find(c=>String(c.id)===String(selClass));
      const trm=terms?.find(t=>String(t.id)===String(selTerm));
      const ses=sessions?.find(s=>String(s.id)===String(selSession));
      db.sendAdminAlert({
        subject:`[Alert] Reports Published — ${cls?.name||"Group"}`,
        html:buildAlertEmail("Reports Published",
          [`Group: ${cls?.name||selClass}`,`Period: ${trm?.name||selTerm}`,`Cycle: ${ses?.name||selSession}`,
           `Published by: ${user?.full_name||user?.name||"Admin"}`,
           `Time: ${new Date().toLocaleString("en-NG")}`],
          "info",sectionCtx?.schoolName||settings?.school_name||"Business Portal"),
        eventKey:"report_published"
      });
    }
    setPublishing(false);
  };

  const unpublishCards=async()=>{
    const __ok=await confirm({title:"Unpublish Reports?",
      message:"This will immediately hide report cards from members and contacts.",
      confirmLabel:"Unpublish",danger:true});
    if(!__ok)return;
    setPublishing(true);
    const {data,error}=await db.upsertReportPublish({
      class_id:+selClass,term_id:+selTerm,session_id:+selSession,
      is_published:false,unpublished_at:new Date().toISOString(),
    });
    if(error)notify(error.message,"error");
    else{setPublishInfo(data);notify("Report cards unpublished","warn");}
    setPublishing(false);
  };

  // Load ALL results for bulk PDF
  const loadAllResults=async()=>{
    const map={};
    for(const stu of students){
      const [r,c]=await Promise.all([
        db.getResults({student_id:stu.id,class_id:+selClass,term_id:+selTerm,session_id:+selSession}),
        db.getCaeResults({student_id:stu.id,class_id:+selClass,term_id:+selTerm,session_id:+selSession}),
      ]);
      map[stu.id]={results:r.data||[],caeResults:c.data||[]};
    }
    return map;
  };

  // Prefetch full-class results so single-student print/download has accurate
  // class ranking AND the click handler can stay synchronous (popup blocker).
  useEffect(()=>{
    if(!selClass||!selTerm||!selSession||!students||!students.length)return;
    let cancelled=false;
    (async()=>{
      try{
        const map=await loadAllResults();
        if(!cancelled)setAllStudentResults(map);
      }catch(_){/* ignore — buttons fall back to single-student data */}
    })();
    return()=>{cancelled=true;};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[selClass,selTerm,selSession,students.length]);

  const clearClassResults=async()=>{
    const ok=await confirm({
      title:"Clear All Results?",
      message:`This will permanently delete ALL results for ${cls?.name} — ${term?.name} — ${session?.name}. This cannot be undone.`,
      confirmLabel:"Clear Results",danger:true,typeToConfirm:"DELETE",
    });
    if(!ok)return;
    const{error}=await db.clearClassResults(+selClass,+selTerm,+selSession);
    if(error)notify(error.message,"error");
    else{notify("All results cleared","warn");setResults([]);setAllStudentResults({});}
  };

  // Merge section-specific CA/Exam maxima + CAE components into settings for report card generation
  const [formTeacherName,setFormTeacherName]=useState("");
  // Fetch form teacher name when class changes
  useEffect(()=>{
    if(!selClass){setFormTeacherName("");return;}
    db.getFormTeacherForClass(selClass).then(({data})=>setFormTeacherName(data?.[0]?.teachers?.full_name||""));
  },[selClass]);

  const effectiveSettings={
    ...settings,
    ...(sectionScoreOverride?{result_ca_max:String(sectionScoreOverride.caMax),result_exam_max:String(sectionScoreOverride.examMax)}:{}),
    _caeComps:rcCaeComps,
    _formTeacherName:formTeacherName,
  };

  const generateAllPDFs=async()=>{
    if(!students.length){notify("No members in this group","error");return;}
    setGenerating(true);
    notify("Loading all results…","success");
    const allData=await loadAllResults();
    setAllStudentResults(allData);
    // trigger print of all cards
    const cls=classes.find(c=>c.id===+selClass);
    const term=terms.find(t=>t.id===+selTerm);
    const session=sessions.find(s=>s.id===+selSession);
    openReportCardPrintWindow(students,allData,cls,term,session,
      gradingSchema,caeTraits,caeRatings,publishInfo,effectiveSettings,
      sectionCtx?.schoolLogo,classTeacherComment,principalComment,nextTermBegins,
      pubOptions,
      signatures.find(s=>s.id===+teacherSigId)||null,
      signatures.find(s=>s.id===+principalSigId)||null);
    setGenerating(false);
  };

  const generateOnePDF=(stu)=>{
    const cls=classes.find(c=>c.id===+selClass);
    const term=terms.find(t=>t.id===+selTerm);
    const session=sessions.find(s=>s.id===+selSession);
    // Use prefetched class results when available (for accurate ranking).
    // IMPORTANT: stay synchronous so the popup is opened inside the user
    // gesture — awaiting before window.open() trips the popup blocker.
    let data=allStudentResults&&Object.keys(allStudentResults).length
      ?{...allStudentResults}:{};
    data[stu.id]={results,caeResults};
    // show_position is a live visibility control (not frozen at publish time)
    // so a settings-page toggle takes effect immediately for existing cards.
    const _liveShowPos=pubOptions.show_position!==false;
    const resolvedOpts=publishInfo?{
      show_cae:publishInfo.show_cae!==false,
      show_teacher_comment:publishInfo.show_teacher_comment!==false,
      show_principal_comment:publishInfo.show_principal_comment!==false,
      show_parent_ack:publishInfo.show_parent_ack!==false,
      show_position:_liveShowPos,
      show_next_term:publishInfo.show_next_term!==false,
      show_attendance:publishInfo.show_attendance!==false,
      card_design:publishInfo.card_design||"classic",
      card_spacing:publishInfo.card_spacing||"normal",
    }:pubOptions;
    openReportCardPrintWindow([stu],data,cls,term,session,
      gradingSchema,caeTraits,caeRatings,publishInfo,effectiveSettings,
      sectionCtx?.schoolLogo,classTeacherComment,principalComment,nextTermBegins,
      resolvedOpts,
      signatures.find(s=>s.id===+teacherSigId)||null,
      signatures.find(s=>s.id===+principalSigId)||null);
  };

  const downloadOnePDF=async(stu)=>{
    const cls=classes.find(c=>c.id===+selClass);
    const term=terms.find(t=>t.id===+selTerm);
    const session=sessions.find(s=>s.id===+selSession);
    // Use prefetched class results when available (for accurate ranking).
    let data=allStudentResults&&Object.keys(allStudentResults).length
      ?{...allStudentResults}:{};
    data[stu.id]={results,caeResults};
    const _liveShowPos=pubOptions.show_position!==false;
    const resolvedOpts=publishInfo?{
      show_cae:publishInfo.show_cae!==false,
      show_teacher_comment:publishInfo.show_teacher_comment!==false,
      show_principal_comment:publishInfo.show_principal_comment!==false,
      show_parent_ack:publishInfo.show_parent_ack!==false,
      show_position:_liveShowPos,
      show_next_term:publishInfo.show_next_term!==false,
      show_attendance:publishInfo.show_attendance!==false,
      card_design:publishInfo.card_design||"classic",
      card_spacing:publishInfo.card_spacing||"normal",
    }:pubOptions;
    const rcHtml=openReportCardPrintWindow([stu],data,cls,term,session,
      gradingSchema,caeTraits,caeRatings,publishInfo,effectiveSettings,
      sectionCtx?.schoolLogo,classTeacherComment,principalComment,nextTermBegins,
      resolvedOpts,
      signatures.find(s=>s.id===+teacherSigId)||null,
      signatures.find(s=>s.id===+principalSigId)||null,
      null,true,true);
    const stuName=fullName(stu);
    const filename=pdfName(stuName,"REPORT",term?.name||"",session?.name||"");
    notify("Generating PDF…","success");
    await downloadPDF(rcHtml,filename,{scale:3,usePt:false,autoHeight:true});
  };

  // ── Shared ZIP helper: batch-load results then render PDFs N at a time ────────
  const _runZipBatch=async(zip,folderPath,classStudents,cls,term,session,clsGS,clsTr,clsRt,clsPubInfo,clsEffSettings,tSig,pSig,resolvedOpts,progressRef)=>{
    // Load all results for this class in one parallel batch
    setZipProgress(p=>({...p,cls:cls.name,student:"Loading results…"}));
    const studentResults=await Promise.all(classStudents.map(async stu=>{
      try{
        const[rRes,cRes]=await Promise.all([
          db.getResults({student_id:stu.id,class_id:cls.id,term_id:+selTerm,session_id:+selSession}),
          db.getCaeResults({student_id:stu.id,class_id:cls.id,term_id:+selTerm,session_id:+selSession}),
        ]);
        return{stu,results:rRes.data||[],caeResults:cRes.data||[],ok:true};
      }catch(err){
        console.error(`[zip] Results load failed for ${stu.id}:`,err);
        return{stu,results:[],caeResults:[],ok:false};
      }
    }));
    // Render PDFs 5 at a time
    const BATCH=5;
    for(let bi=0;bi<studentResults.length;bi+=BATCH){
      await Promise.all(studentResults.slice(bi,bi+BATCH).map(async({stu,results,caeResults,ok})=>{
        const stuName=fullName(stu);
        if(!ok){progressRef.skipped++;progressRef.done++;return;}
        try{
          const stuData={[stu.id]:{results,caeResults}};
          const rcHtml=openReportCardPrintWindow(
            [stu],stuData,cls,term,session,
            clsGS,clsTr,clsRt,clsPubInfo,clsEffSettings,
            sectionCtx?.schoolLogo,
            clsPubInfo?.class_teacher_comment||"",
            clsPubInfo?.principal_comment||"",
            clsPubInfo?.next_term_begins||"",
            resolvedOpts,tSig,pSig,
            null,true,true
          );
          const base64=await htmlToPdfBase64(rcHtml,{scale:3,usePt:false,autoHeight:true}); // full quality
          zip.folder(folderPath).file(pdfName(stuName,"REPORT",term.name,session.name),base64,{base64:true});
        }catch(err){
          console.error(`[zip] PDF failed for ${stuName}:`,err);
          progressRef.skipped++;
        }finally{
          progressRef.done++;
          setZipProgress(p=>({...p,current:progressRef.done,cls:cls.name,student:stuName}));
        }
      }));
    }
  };

  const _resolveOpts=(pubInfo)=>pubInfo?{
    show_cae:pubInfo.show_cae!==false,
    show_teacher_comment:pubInfo.show_teacher_comment!==false,
    show_principal_comment:pubInfo.show_principal_comment!==false,
    show_parent_ack:pubInfo.show_parent_ack!==false,
    show_position:pubInfo.show_position!==false,
    show_next_term:pubInfo.show_next_term!==false,
    show_attendance:pubInfo.show_attendance!==false,
    card_design:pubInfo.card_design||"classic",
    card_spacing:pubInfo.card_spacing||"normal",
  }:pubOptions;

  // ── Download ZIP for the currently selected class ────────────────────────────
  // Reuses all state already loaded for the class — very fast setup.
  const downloadClassZip=async()=>{
    if(!selClass||!selTerm||!selSession){notify("Select group, period and cycle first","error");return;}
    if(!students.length){notify("No active members in this group","error");return;}
    if(!publishInfo?.is_published){
      notify("🔒 Report cards for this group must be published before downloading the ZIP.\nPublish them first using the \"Publish Cards\" button.","error");
      return;
    }
    if(!window.JSZip) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js");
    const zip=new window.JSZip();
    const cls=classes.find(c=>c.id===+selClass);
    const term=terms.find(t=>t.id===+selTerm);
    const session=sessions.find(s=>s.id===+selSession);
    if(!term||!session){notify("Period or cycle not found","error");return;}
    const secName=selectedSection?.name||cls?.sections?.name||"GROUP";
    const folderPath=`${pdfName(secName)}/${pdfName(cls?.name||"")}`;
    const resolvedOpts=_resolveOpts(publishInfo);
    const tSig=publishInfo?.teacher_signature_id
      ?signatures.find(s=>s.id===publishInfo.teacher_signature_id)||null
      :signatures.find(s=>s.id===+teacherSigId)||null;
    const pSig=publishInfo?.principal_signature_id
      ?signatures.find(s=>s.id===publishInfo.principal_signature_id)||null
      :signatures.find(s=>s.id===+principalSigId)||null;
    const sortedStudents=[...students].sort((a,b)=>`${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`));
    setZipGenerating(true);
    setZipProgress({current:0,total:sortedStudents.length,cls:cls?.name||"",student:""});
    const ref={done:0,skipped:0};
    try{
      await _runZipBatch(zip,folderPath,sortedStudents,cls,term,session,
        gradingSchema,caeTraits,caeRatings,publishInfo,effectiveSettings,tSig,pSig,resolvedOpts,ref);
      const zipBlob=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6}});
      shareOrDownload(pdfName(cls?.name||"GROUP","REPORTS",term.name,session.name)+".zip",zipBlob,"application/zip");
      notify(ref.skipped>0
        ?`✅ ZIP downloaded — ${ref.done-ref.skipped} reports (${ref.skipped} skipped)`
        :`✅ ZIP downloaded — ${ref.done} report${ref.done!==1?"s":""}`,
        "success");
    }catch(err){
      console.error("[downloadClassZip]",err);
      notify("ZIP generation failed: "+err.message,"error");
    }finally{
      setZipGenerating(false);
    }
  };

  // ── Download ZIP for the entire section (all classes in sidebar selection) ───
  // Loads students + form teachers once; reuses section-level grading/CAE from state.
  const downloadSectionZip=async()=>{
    if(!selTerm||!selSession){notify("Select a period and cycle first","error");return;}
    if(!classes.length){notify("No groups loaded — select a cycle and section first","error");return;}
    if(!window.JSZip) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js");
    const zip=new window.JSZip();
    const term=terms.find(t=>t.id===+selTerm);
    const session=sessions.find(s=>s.id===+selSession);
    if(!term||!session){notify("Period or cycle not found","error");return;}
    const secName=selectedSection?.name||classes[0]?.sections?.name||"SECTION";
    // Fetch all students + all form teachers in one go
    const[{data:allStudentsData},{data:allFTData}]=await Promise.all([
      db.getStudents(),
      db.getAllFormTeachers(),
    ]);
    const allStudentsList=allStudentsData||[];
    const formTeacherMap={};
    (allFTData||[]).forEach(ft=>{formTeacherMap[ft.class_id]=ft.teachers?.full_name||"";});
    const sortedClasses=[...classes].sort((a,b)=>a.name.localeCompare(b.name));
    const totalStudents=allStudentsList.filter(s=>
      sortedClasses.some(c=>c.id===s.class_id)&&(s.status||"active")==="active"
    ).length;
    if(!totalStudents){notify("No active members found in this section","error");return;}
    setZipGenerating(true);
    setZipProgress({current:0,total:totalStudents,cls:"",student:""});
    const ref={done:0,skipped:0};
    const unpublishedClasses=[];
    try{
      for(const cls of sortedClasses){
        const classStudents=allStudentsList
          .filter(s=>s.class_id===cls.id&&(s.status||"active")==="active")
          .sort((a,b)=>`${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`));
        if(!classStudents.length)continue;
        const folderPath=`${pdfName(secName)}/${pdfName(cls.name)}`;
        // Per-class publish info
        const{data:pubArr}=await db.getReportPublish({class_id:cls.id,term_id:+selTerm,session_id:+selSession});
        const clsPubInfo=pubArr?.[0]||null;
        // Skip unpublished classes — report cards must be published before download
        if(!clsPubInfo?.is_published){
          unpublishedClasses.push(cls.name);
          ref.done+=classStudents.length;
          ref.skipped+=classStudents.length;
          setZipProgress(p=>({...p,current:ref.done,cls:cls.name,student:"Skipped — not published"}));
          continue;
        }
        const resolvedOpts=_resolveOpts(clsPubInfo);
        // Reuse section-level grading/CAE from state (all classes here share the same section)
        // Override _formTeacherName per class
        const clsEffSettings={
          ...effectiveSettings,
          _formTeacherName:formTeacherMap[cls.id]||"",
        };
        const tSig=clsPubInfo?.teacher_signature_id
          ?signatures.find(s=>s.id===clsPubInfo.teacher_signature_id)||null
          :signatures.find(s=>s.id===+teacherSigId)||null;
        const pSig=clsPubInfo?.principal_signature_id
          ?signatures.find(s=>s.id===clsPubInfo.principal_signature_id)||null
          :signatures.find(s=>s.id===+principalSigId)||null;
        await _runZipBatch(zip,folderPath,classStudents,cls,term,session,
          gradingSchema,caeTraits,caeRatings,clsPubInfo,clsEffSettings,tSig,pSig,resolvedOpts,ref);
      }
      const zipBlob=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6}});
      const downloaded=ref.done-ref.skipped;
      if(!downloaded){
        notify(`No reports downloaded — all classes in this section are unpublished: ${unpublishedClasses.join(", ")}. Publish report cards first.`,"error");
        return;
      }
      shareOrDownload(pdfName(secName,"REPORTS",term.name,session.name)+".zip",zipBlob,"application/zip");
      if(unpublishedClasses.length){
        notify(`✅ ZIP downloaded — ${downloaded} report${downloaded!==1?"s":""}. Skipped unpublished: ${unpublishedClasses.join(", ")}`,unpublishedClasses.length?"warn":"success");
      } else {
        notify(`✅ ZIP downloaded — ${downloaded} report${downloaded!==1?"s":""}`, "success");
      }
    }catch(err){
      console.error("[downloadSectionZip]",err);
      notify("ZIP generation failed: "+err.message,"error");
    }finally{
      setZipGenerating(false);
    }
  };

  const emailReportCard=async(stu)=>{
    if(!stu.email){notify("No email on file for this member","error");return;}
    notify("Generating report card PDF\u2026","success");
    try{
      const cls=classes.find(c=>c.id===+selClass);
      const term=terms.find(t=>t.id===+selTerm);
      const session=sessions.find(s=>s.id===+selSession);
      const stuName=fullName(stu);
      const termName=term?.name||"";
      const sessionName=session?.name||"";
      const data={[stu.id]:{results,caeResults}};
      const rcHtml=openReportCardPrintWindow([stu],data,cls,term,session,
        gradingSchema,caeTraits,caeRatings,publishInfo,effectiveSettings,
        sectionCtx?.schoolLogo,classTeacherComment,principalComment,nextTermBegins,
        pubOptions,
        signatures.find(s=>s.id===+teacherSigId)||null,
        signatures.find(s=>s.id===+principalSigId)||null,
        null,true,true);
      const b64=await htmlToPdfBase64(rcHtml,{scale:3,quality:1.0,usePt:false,autoHeight:true});
      const binary=atob(b64);
      const bytes=new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
      const blob=new Blob([bytes],{type:"application/pdf"});
      // Always upload so the file exists in storage
      const safeTerm=(termName+"-"+sessionName).replace(/[^a-zA-Z0-9-_]/g,"-");
      const filePath=`${stu.student_id||stu.id}/${safeTerm}.pdf`;
      const{error:upErr}=await supabase.storage.from("report-cards").upload(filePath,blob,{upsert:true,contentType:"application/pdf"});
      if(upErr)throw upErr;
      const portalUrl=window.location.origin;
      let emailHtml,emailPayload;
      if(emailSendMode==="attachment"){
        // Attach PDF directly — no storage link in body
        emailHtml=buildEmailHtml(`Report \u2014 ${termName} ${sessionName}`,[
          `This communication is regarding:`,
          `${stuName} \u00b7 Member ID: ${stu.student_id||stu.id} \u00b7 Group: ${cls?.name||"\u2014"}`,``,
          `Dear Member/Contact,`,``,
          `Please find attached the term report card for ${stuName} (${termName} ${sessionName}).`,``,
          `You can also access all report cards at any time by logging into the Business Portal:`,``,
          `  Portal  : ${portalUrl}`,
          `  Login ID: ${stu.student_id||stu.id}`,
          `  Password: (your registered portal password)`,``,
          `If you have any questions, please contact the organization office.`,
          `For assistance, contact the organization administration.`,
        ].join("\n"));
        emailPayload={
          to:stu.email,
          subject:`Report \u2014 ${stuName} \u2014 ${termName} ${sessionName}`,
          html:emailHtml,
          attachments:[{name:`ReportCard-${stuName.replace(/\s+/g,"-")}-${safeTerm}.pdf`,content:b64,mimeType:"application/pdf"}],
        };
      } else {
        // Send signed storage link (expires in 7 days)
        const{data:signedData,error:signErr}=await supabase.storage.from("report-cards").createSignedUrl(filePath,604800);
        if(signErr)throw signErr;
        const pdfUrl=signedData.signedUrl;
        emailHtml=buildEmailHtml(`Report \u2014 ${termName} ${sessionName}`,[
          `This communication is regarding:`,
          `${stuName} \u00b7 Member ID: ${stu.student_id||stu.id} \u00b7 Group: ${cls?.name||"\u2014"}`,``,
          `Dear Member/Contact,`,``,
          `The term report card for ${stuName} (${termName} ${sessionName}) is ready.`,``,
          `\u{1F4C4} View Report (link valid for 7 days):`,
          `${pdfUrl}`,``,
          `You can also access this and all future report cards at any time`,
          `by logging into the Business Portal:`,``,
          `  Portal  : ${portalUrl}`,
          `  Login ID: ${stu.student_id||stu.id}`,
          `  Password: (your registered portal password)`,``,
          `If you have any questions, please contact the organization office.`,
          `For assistance, contact the organization administration.`,
        ].join("\n"));
        emailPayload={
          to:stu.email,
          subject:`Report \u2014 ${stuName} \u2014 ${termName} ${sessionName}`,
          html:emailHtml,
        };
      }
      const res=await sendPortalEmail(emailPayload);
      if(res.ok)notify(`Report card emailed to ${stu.email} \u2713`);
      else notify("Failed to send report card email","error");
    }catch(e){
      console.error("[emailReportCard]",e);
      notify(`Failed to send report card: ${e.message||e}`,"error");
    }
  };

  const openSectionBulkEmail=async()=>{
    if(!selTerm||!selSession){notify("Select a period and cycle first","error");return;}
    if(!classes.length){notify("No groups in this section","error");return;}
    setGenerating(true);
    notify("Loading section data\u2026","success");
    try{
      const stuRes=await db.getStudents();
      const allStu=stuRes.data||[];
      const allStudents=[];
      const publishInfoMap={};
      for(const cls2 of classes){
        const clsStu=allStu.filter(s=>s.class_id===cls2.id&&(s.status||"active")==="active");
        allStudents.push(...clsStu);
        const pubRes=await db.getReportPublish({class_id:cls2.id,term_id:+selTerm,session_id:+selSession});
        publishInfoMap[cls2.id]=pubRes.data?.[0]||null;
      }
      if(!allStudents.length){notify("No active members in this section","error");setGenerating(false);return;}
      setSectionBulkEmail({students:allStudents,publishInfoMap});
    }catch(e){
      notify("Failed to load section data: "+e.message,"error");
    }
    setGenerating(false);
  };

  const cls=classes.find(c=>c.id===+selClass);
  const term=terms.find(t=>t.id===+selTerm);
  const session=sessions.find(s=>s.id===+selSession);

  const totalSubjects=results.length;
  const totalScore=results.reduce((a,b)=>a+(b.total_score||0),0);
  const avg=totalSubjects?totalScore/totalSubjects:0;
  const overallGrade=getGrade(avg,gradingSchema);

  return(
    <div>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="report-cards" size={20}/>Reports</h2>
          <p style={{color:C.muted,fontSize:12}}>Generate, review, approve and publish period-end report cards</p>
        </div>
        {selClass&&selTerm&&selSession&&(
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {/* Settings — admin only, opens dedicated Report Settings page */}
            {role==="admin"&&setPage&&(
              <Btn onClick={()=>setPage("report-card-settings")} color={C.muted} outline title="Report Settings — templates, signatures, defaults">
                <Settings size={14} style={{marginRight:4,verticalAlign:"-2px"}}/>Settings
              </Btn>
            )}
            {/* Customise — hidden for view-only teachers */}
            {!teacherViewOnly&&(
              <Btn onClick={()=>setEditComments(true)} color={C.blue} outline>Customise</Btn>
            )}
            {/* Publish/Unpublish — hidden for view-only teachers */}
            {!teacherViewOnly&&canPublish&&!publishInfo?.is_published&&(
              <Btn onClick={publishCards} color={C.orange} disabled={publishing}>
                {publishing?"…":"Publish Cards"}
              </Btn>
            )}
            {!teacherViewOnly&&canPublish&&publishInfo?.is_published&&(
              <>
                <span style={{padding:"8px 14px",background:C.greenPale,color:C.green,
                  borderRadius:8,fontSize:13,fontWeight:700,border:`1px solid ${C.green}40`,display:"flex",alignItems:"center",gap:5}}>
                  Published
                </span>
                <Btn onClick={unpublishCards} color={C.red} outline disabled={publishing}>
                  {publishing?"…":"Unpublish"}
                </Btn>
              </>
            )}
            {/* MA Approval — hidden for view-only teachers */}
            {!teacherViewOnly&&canMA&&selClass&&selTerm&&selSession&&(
              <Btn onClick={handleMA} color={approval?.ma_status==="approved"?C.red:C.purple}
                outline={approval?.ma_status==="approved"} disabled={approvingMA}>
                {approvingMA?"Revoking…":approval?.ma_status==="approved"?"Revoke MA":"Give Manager Approval (MA)"}
              </Btn>
            )}
            {/* Export All PDFs — sub-permission controlled */}
            {rcAllowExport&&students.length>0&&(
              <Btn onClick={generateAllPDFs} color={C.purple} disabled={generating}>
                {generating?"Loading…":"Export All PDFs"}
              </Btn>
            )}
            {/* ⬇ Group ZIP — when a class is selected */}
            {role==="admin"&&selClass&&students.length>0&&(
              <Btn onClick={downloadClassZip} color={C.blue} outline disabled={zipGenerating||generating}
                title={`Download all report cards for this class as a ZIP file`}>
                {zipGenerating?"Building ZIP…":"⬇ Group ZIP"}
              </Btn>
            )}
            {/* ⬇ Section ZIP — when term + session selected (uses all classes in sidebar section) */}
            {role==="admin"&&selTerm&&selSession&&classes.length>0&&(
              <Btn onClick={downloadSectionZip} color={C.purple} outline disabled={zipGenerating||generating}
                title={`Download all report cards for every class in this section as a ZIP file`}>
                {zipGenerating?"Building ZIP…":"⬇ Section ZIP"}
              </Btn>
            )}
            {/* ZIP progress overlay — renders at document.body level via portal */}
            {zipGenerating&&ReactDOM.createPortal(
              <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.78)",
                zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
                <div style={{background:C.white,borderRadius:18,padding:"36px 40px",maxWidth:420,
                  width:"100%",boxShadow:"0 24px 64px rgba(0,0,0,.4)",textAlign:"center"}}>
                  <div style={{fontSize:38,marginBottom:14}}>📦</div>
                  <div style={{fontWeight:900,fontSize:18,color:C.text,marginBottom:8}}>
                    Building ZIP
                  </div>
                  <div style={{fontSize:13,color:C.muted,marginBottom:18,lineHeight:1.6}}>
                    Generating PDFs at full quality and packaging…<br/>
                    <b>Please keep this tab open.</b>
                  </div>
                  <div style={{height:10,background:C.offWhite,borderRadius:5,overflow:"hidden",
                    marginBottom:10,border:`1px solid ${C.border}`}}>
                    <div style={{height:"100%",borderRadius:5,
                      background:`linear-gradient(90deg,${C.blue},#3b82f6)`,
                      transition:"width .4s ease",
                      width:zipProgress.total?`${Math.round(zipProgress.current/zipProgress.total*100)}%`:"2%"}}/>
                  </div>
                  <div style={{fontSize:14,fontWeight:800,color:C.blue,marginBottom:8}}>
                    {zipProgress.current} / {zipProgress.total} PDFs
                    {zipProgress.total>0&&<span style={{fontWeight:400,color:C.muted,fontSize:12}}>
                      {" "}({Math.round(zipProgress.current/zipProgress.total*100)}%)
                    </span>}
                  </div>
                  {zipProgress.cls&&(
                    <div style={{fontSize:12,padding:"6px 14px",background:C.offWhite,
                      borderRadius:8,display:"inline-block",color:C.text,fontWeight:600}}>
                      {zipProgress.cls}
                      {zipProgress.student&&<span style={{color:C.muted,fontWeight:400}}> · {zipProgress.student}</span>}
                    </div>
                  )}
                </div>
              </div>,
              document.body
            )}
            {/* Clear Results — hidden for view-only teachers */}
            {!teacherViewOnly&&selClass&&selTerm&&selSession&&
              approval?.ea_status!=="approved"&&approval?.ma_status!=="approved"&&(
              <Btn onClick={clearClassResults} color={C.red} outline>
                Clear Results
              </Btn>
            )}
            {/* Email Section — hidden for view-only teachers */}
            {!teacherViewOnly&&selTerm&&selSession&&classes.length>0&&(
              <div style={{display:"flex",alignItems:"center",gap:0}}>
                <div style={{display:"flex",alignItems:"center",gap:0,borderRadius:"8px 0 0 8px",overflow:"hidden",border:`1.5px solid ${C.blue}`,borderRight:"none",height:34}}>
                  <button onClick={()=>setEmailSendMode("attachment")}
                    style={{padding:"0 8px",height:"100%",background:emailSendMode==="attachment"?C.blue:"transparent",
                      color:emailSendMode==="attachment"?"#fff":C.blue,border:"none",cursor:"pointer",fontSize:10,fontWeight:700,
                      borderRight:`1px solid ${C.blue}40`,whiteSpace:"nowrap"}}
                    title="Attach PDF to email">PDF</button>
                  <button onClick={()=>setEmailSendMode("link")}
                    style={{padding:"0 8px",height:"100%",background:emailSendMode==="link"?C.blue:"transparent",
                      color:emailSendMode==="link"?"#fff":C.blue,border:"none",cursor:"pointer",fontSize:10,fontWeight:700,
                      whiteSpace:"nowrap"}}
                    title="Send as 7-day link">Link</button>
                </div>
                <Btn onClick={openSectionBulkEmail} color={C.blue} disabled={generating}
                  style={{borderRadius:"0 8px 8px 0"}}
                  title={`Email all students in ${selectedSection?.name||"this section"} for the selected term`}>
                  {generating?"…":"Email Section"}
                </Btn>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filters row */}
      <Card style={{marginBottom:16}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
          <Sel label="Cycle" value={selSession} onChange={setSelSession}
            options={[{value:"",label:"— Select Cycle —"},...sessions.map(s=>({value:String(s.id),label:s.name}))]}/>
          <Sel label="Period" value={selTerm} onChange={setSelTerm}
            options={[{value:"",label:"— Select Period —"},...terms.map(t=>({value:String(t.id),label:t.name}))]}/>
          <div>
            <Sel label="Group" value={selClass} onChange={v=>{setSelClass(v);setSelStudent(null);setResults([]);setStuSearch("");}}
              options={[{value:"",label:"— Select Group —"},
                // Staff: show every class already pre-filtered to their allowed set; do NOT further restrict by
                // selectedSection (teachers have no section selector UI, and the localStorage value can be stale).
                // Admins: keep the section-selector scoping only when one is actively chosen.
                ...(role==="admin"&&selectedSection
                  ?classes.filter(c=>c.section_id===selectedSection.id)
                  :classes
                ).map(c=>({value:String(c.id),label:`${c.name}${c.sections?" ("+c.sections.code+")":""}`}))]}/>
            {role==="teacher"&&classes.length===0&&(
              <div style={{marginTop:6,fontSize:11,color:C.muted,lineHeight:1.35}}>
                No groups assigned. Ask an admin to add you as a form staff or category staff for at least one group.
              </div>
            )}
          </div>
        </div>
        {publishInfo&&(
          <div style={{marginTop:12,padding:"8px 14px",borderRadius:8,
            background:publishInfo.is_published?C.greenPale:C.orangePale,
            border:`1px solid ${publishInfo.is_published?C.green:C.orange}40`,
            display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12,flexWrap:"wrap",gap:8}}>
            <span style={{fontWeight:700,color:publishInfo.is_published?C.green:C.orange}}>
              {publishInfo.is_published?`Published ${new Date(publishInfo.published_at).toLocaleDateString("en-NG")}`:"Draft — not yet published"}
            </span>
            {nextTermBegins&&<span style={{color:C.muted}}>Next period begins: <b>{new Date(nextTermBegins).toLocaleDateString("en-NG",{day:"numeric",month:"long",year:"numeric"})}</b></span>}
          </div>
        )}
        {/* Approval badges */}
        {selClass&&selTerm&&selSession&&(
          <div style={{marginTop:10,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            <span style={{fontSize:11,fontWeight:700,color:C.muted}}>Approvals:</span>
            <span style={{padding:"3px 11px",borderRadius:20,fontSize:11,fontWeight:700,
              background:approval?.ea_status==="approved"?C.greenPale:C.orangePale,
              color:approval?.ea_status==="approved"?C.green:C.orange,
              border:`1px solid ${approval?.ea_status==="approved"?C.green:C.orange}40`}}>
              EA: {approval?.ea_status==="approved"?"Approved":"Pending"}
            </span>
            <span style={{padding:"3px 11px",borderRadius:20,fontSize:11,fontWeight:700,
              background:approval?.ma_status==="approved"?C.greenPale:C.orangePale,
              color:approval?.ma_status==="approved"?C.green:C.orange,
              border:`1px solid ${approval?.ma_status==="approved"?C.green:C.orange}40`}}>
              MA: {approval?.ma_status==="approved"?"Approved":"Pending"}
            </span>
            {completeness&&(
              <span style={{padding:"3px 11px",borderRadius:20,fontSize:11,fontWeight:700,
                background:completeness.noSetup?C.offWhite:completeness.complete?C.greenPale:C.redPale,
                color:completeness.noSetup?C.muted:completeness.complete?C.green:C.red,
                border:`1px solid ${completeness.noSetup?C.border:completeness.complete?C.green:C.red}40`}}>
                {completeness.noSetup?"— No categories assigned":completeness.complete?"Results Complete":"Incomplete Results"}
              </span>
            )}
          </div>
        )}
        {/* Completeness detail */}
        {completeness&&!completeness.complete&&(
          <div style={{marginTop:10,padding:"10px 14px",borderRadius:8,
            background:C.redPale,border:`1px solid ${C.red}30`,fontSize:12}}>
            <div style={{fontWeight:700,color:C.red,marginBottom:6}}>Incomplete Results Detected</div>
            <div style={{display:"flex",flexDirection:"column",gap:3,maxHeight:120,overflowY:"auto"}}>
              {completeness.studentSummary.filter(s=>s.missing.length>0).map(s=>(
                <div key={s.id} style={{color:C.text}}>
                  <b>{s.name}</b>: missing <span style={{color:C.red}}>{s.missing.join(", ")}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Main content */}
      {loading?<Spinner/>:selClass&&selTerm&&selSession?(
        <div style={{display:"grid",gridTemplateColumns:"220px 1fr",gap:16}}>
          {/* Member list */}
          <Card style={{alignSelf:"start"}}>
            <div style={{fontWeight:800,color:C.blue,fontSize:13,marginBottom:8}}>
              {students.length} Member{students.length!==1?"s":""}
            </div>
            {/* Search box */}
            {students.length>0&&(
              <div style={{position:"relative",marginBottom:8}}>
                <Search size={12} style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",color:C.muted,pointerEvents:"none"}}/>
                <input value={stuSearch} onChange={e=>setStuSearch(e.target.value)}
                  placeholder="Search member…"
                  style={{width:"100%",boxSizing:"border-box",paddingLeft:26,paddingRight:8,paddingTop:6,paddingBottom:6,
                    borderRadius:8,border:`1px solid ${C.border}`,fontSize:12,color:C.text,background:"#fff",outline:"none"}}/>
              </div>
            )}
            {(()=>{
              const filtered=students.filter(s=>{
                const q=stuSearch.toLowerCase();
                return!q||[s.first_name,s.last_name,s.name,String(s.id)].some(v=>(v||"").toLowerCase().includes(q));
              });
              if(students.length===0) return <div style={{textAlign:"center",padding:24,color:C.light,fontSize:12}}>No members in this group</div>;
              if(filtered.length===0) return <div style={{textAlign:"center",padding:12,color:C.muted,fontSize:12}}>No match for "{stuSearch}"</div>;
              return filtered.map(s=>(
                <div key={s.id} onClick={()=>setSelStudent(s)}
                  style={{padding:"9px 11px",borderRadius:8,cursor:"pointer",marginBottom:4,
                    background:selStudent?.id===s.id?C.bluePale:C.offWhite,
                    border:`2px solid ${selStudent?.id===s.id?C.blue:"transparent"}`,transition:"all .1s"}}>
                  <div style={{fontWeight:700,fontSize:12,color:selStudent?.id===s.id?C.blue:C.text}}>
                    {[s.first_name,s.last_name].filter(Boolean).join(" ")||s.name}
                  </div>
                  <div style={{fontSize:10,color:C.light}}>{s.id}</div>
                </div>
              ));
            })()}
          </Card>

          {/* Report card preview */}
          <div>
            {!selStudent?(
              <Card style={{textAlign:"center",padding:52}}>
                <div style={{marginBottom:10}}><ClipboardList size={44} color={C.muted}/></div>
                <div style={{fontWeight:800,color:C.blue,fontSize:16}}>Select a member</div>
                <div style={{color:C.muted,fontSize:13,marginTop:6}}>Click a member to preview their report card</div>
              </Card>
            ):(
              <Card>
                {/* Member info bar */}
                <div style={{background:`linear-gradient(135deg,${C.blue},${C.blueDark})`,
                  margin:"-22px -22px 18px",padding:"16px 22px",borderRadius:"13px 13px 0 0",color:"#fff",
                  display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontWeight:900,fontSize:16}}>{fullName(selStudent)}</div>
                    <div style={{fontSize:11,color:"#9ec8f5",marginTop:3}}>
                      ID: {selStudent.id} · {selStudent.gender||"—"} · {cls?.name} · {term?.name} · {session?.name}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <div style={{textAlign:"center",background:"rgba(255,255,255,.15)",padding:"8px 16px",borderRadius:10}}>
                      <div style={{fontSize:22,fontWeight:900}}>{overallGrade}</div>
                      <div style={{fontSize:10,color:"#9ec8f5"}}>Overall</div>
                    </div>
                    <div style={{textAlign:"center",background:"rgba(255,255,255,.15)",padding:"8px 16px",borderRadius:10}}>
                      <div style={{fontSize:22,fontWeight:900}}>{avg.toFixed(1)}</div>
                      <div style={{fontSize:10,color:"#9ec8f5"}}>Avg %</div>
                    </div>
                    {(()=>{
                      // Calculate position from all students results (using allStudentResults if loaded)
                      const avgs=students.map(s=>{
                        const r=allStudentResults[s.id]?.results||[];
                        const tot=r.reduce((a,b)=>a+(+b.total_score||0),0);
                        return{id:s.id,avg:r.length?tot/r.length:null};
                      }).filter(x=>x.avg!==null).sort((a,b)=>b.avg-a.avg);
                      const pos=avgs.findIndex(x=>x.id===selStudent.id);
                      if(pos<0)return null;
                      return(
                        <div style={{textAlign:"center",background:"rgba(255,255,255,.15)",padding:"8px 16px",borderRadius:10}}>
                          <div style={{fontSize:20,fontWeight:900}}>{pos+1}/{students.length}</div>
                          <div style={{fontSize:10,color:"#9ec8f5"}}>Position</div>
                        </div>
                      );
                    })()}
                    {/* Print / Download / Email — sub-permission controlled */}
                    {rcAllowPrint&&<Btn onClick={()=>generateOnePDF(selStudent)} color={C.orange}>Print PDF</Btn>}
                    {rcAllowDownload&&<Btn onClick={()=>downloadOnePDF(selStudent)} color={C.purple}>⬇ Download PDF</Btn>}
                    {rcAllowEmail&&(
                      <>
                        <div style={{display:"flex",alignItems:"center",gap:0,borderRadius:8,overflow:"hidden",border:`1.5px solid ${C.blue}`,height:34}}>
                          <button onClick={()=>setEmailSendMode("attachment")}
                            style={{padding:"0 10px",height:"100%",background:emailSendMode==="attachment"?C.blue:"transparent",
                              color:emailSendMode==="attachment"?"#fff":C.blue,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
                              borderRight:`1px solid ${C.blue}40`,whiteSpace:"nowrap"}}
                            title="Attach PDF directly to email">Attach</button>
                          <button onClick={()=>setEmailSendMode("link")}
                            style={{padding:"0 10px",height:"100%",background:emailSendMode==="link"?C.blue:"transparent",
                              color:emailSendMode==="link"?"#fff":C.blue,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
                              whiteSpace:"nowrap"}}
                            title="Send a secure link valid for 7 days">Link</button>
                        </div>
                        <Btn onClick={()=>emailReportCard(selStudent)} color={C.blue} disabled={!selStudent?.email} title={selStudent?.email?`Email report card (${emailSendMode==="link"?"storage link":"PDF attachment"})`:"No email on file"}>Email</Btn>
                      </>
                    )}
                    <Btn onClick={async()=>{
                      if(!selStudent)return;
                      const stu=selStudent;
                      const cls=classes.find(c=>c.id===+selClass);
                      const term=terms.find(t=>t.id===+selTerm);
                      const session=sessions.find(s=>s.id===+selSession);
                      const stuName=fullName(stu);
                      const termName=term?.name||"";
                      const sessionName=session?.name||"";
                      notify("Generating PDF for sharing…","success");
                      try{
                        const data={[stu.id]:{results,caeResults}};
                        const rcHtml=openReportCardPrintWindow([stu],data,cls,term,session,
                          gradingSchema,caeTraits,caeRatings,publishInfo,effectiveSettings,
                          sectionCtx?.schoolLogo,classTeacherComment,principalComment,nextTermBegins,
                          pubOptions,
                          signatures.find(s=>s.id===+teacherSigId)||null,
                          signatures.find(s=>s.id===+principalSigId)||null,
                          null,true,true);
                        const b64=await htmlToPdfBase64(rcHtml,{scale:3,quality:1.0,usePt:false,autoHeight:true});
                        const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
                        const blob=new Blob([bytes],{type:"application/pdf"});
                        const safeTerm=(termName+"-"+sessionName).replace(/[^a-zA-Z0-9-_]/g,"-");
                        const filename=`ReportCard-${stuName.replace(/\s+/g,"-")}-${safeTerm}.pdf`;
                        await shareFilePDF(blob,filename,`Report — ${stuName}`,`${stuName} · ${cls?.name||""} · ${termName} ${sessionName}`);
                      }catch(e){
                        notify("Share failed: "+(e.message||e),"error");
                      }
                    }} color={C.blue} title="Share report card PDF" disabled={!selStudent}>
                      Share
                    </Btn>
                  </div>
                </div>

                {/* Results table */}
                {results.length===0?(
                  <div style={{textAlign:"center",padding:32,color:C.light}}>No results uploaded for this member yet.</div>
                ):(
                  <div style={{overflowX:"auto",marginBottom:16}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                      <thead>
                        <tr style={{background:C.blue}}>
                          <th style={{padding:"8px 12px",color:"#fff",textAlign:"left",fontWeight:700,fontSize:11}}>Category</th>
                          {rcCaeComps.length>=2?rcCaeComps.map(c=>(
                            <th key={c.id} style={{padding:"8px 12px",color:"#fff",textAlign:"center",fontWeight:700,fontSize:11,whiteSpace:"nowrap"}}>
                              {c.component_name}<br/><span style={{fontWeight:400,fontSize:9,opacity:.8}}>(max {c.value_or_formula})</span>
                            </th>
                          )):(
                            <>
                              <th style={{padding:"8px 12px",color:"#fff",textAlign:"center",fontWeight:700,fontSize:11}}>CA ({+(effectiveSettings.result_ca_max||40)})</th>
                              <th style={{padding:"8px 12px",color:"#fff",textAlign:"center",fontWeight:700,fontSize:11}}>Exam ({+(effectiveSettings.result_exam_max||60)})</th>
                            </>
                          )}
                          {["Total","Grade","Remark"].map((h,i)=>(
                            <th key={h} style={{padding:"8px 12px",color:"#fff",textAlign:"center",fontWeight:700,fontSize:11}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((r,i)=>{
                          const g=getGrade(r.total_score,gradingSchema);
                          const gc=gradeCol(g);
                          const cs=r.component_scores?(() => { try { return JSON.parse(r.component_scores); } catch { return {}; } })():{};
                          return(
                            <tr key={r.id} style={{background:i%2===0?C.white:C.offWhite,borderBottom:`1px solid ${C.border}`}}>
                              <td style={{padding:"8px 12px",fontWeight:600}}>{r.section_subjects?.name||"—"}</td>
                              {rcCaeComps.length>=2?rcCaeComps.map(c=>(
                                <td key={c.id} style={{padding:"8px 12px",textAlign:"center",color:C.muted}}>{cs[c.component_name]??"—"}</td>
                              )):(
                                <>
                                  <td style={{padding:"8px 12px",textAlign:"center",color:C.muted}}>{r.ca_score??"—"}</td>
                                  <td style={{padding:"8px 12px",textAlign:"center",color:C.muted}}>{r.exam_score??"—"}</td>
                                </>
                              )}
                              <td style={{padding:"8px 12px",textAlign:"center",fontWeight:900}}>{r.total_score??"—"}</td>
                              <td style={{padding:"8px 12px",textAlign:"center"}}><Badge color={gc}>{g}</Badge></td>
                              <td style={{padding:"8px 12px",color:gc,fontWeight:600,fontSize:11}}>{getRemark(r.total_score,gradingSchema)}</td>
                            </tr>
                          );
                        })}
                        <tr style={{background:C.orangePale,borderTop:`2px solid ${C.orange}`}}>
                          <td style={{padding:"8px 12px",fontWeight:800,color:C.orange}} colSpan={rcCaeComps.length>=2?rcCaeComps.length+1:3}>Average / Overall</td>
                          <td style={{padding:"8px 12px",textAlign:"center",fontWeight:900,color:C.orange}}>{avg.toFixed(1)}</td>
                          <td style={{padding:"8px 12px",textAlign:"center"}}><Badge color={gradeCol(overallGrade)}>{overallGrade}</Badge></td>
                          <td style={{padding:"8px 12px",color:gradeCol(overallGrade),fontWeight:700,fontSize:11}}>{getRemark(avg,gradingSchema)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {/* CAE section */}
                {caeTraits.length>0&&(
                  <div style={{marginBottom:16}}>
                    <div style={{fontWeight:800,color:C.blue,fontSize:13,marginBottom:8}}>Character Assessment</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:8}}>
                      {caeTraits.map(trait=>{
                        const caeR=caeResults.find(c=>c.trait_id===trait.id);
                        const rating=caeR?caeRatings.find(r=>r.id===caeR.rating_id):null;
                        return(
                          <div key={trait.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                            padding:"8px 12px",background:C.offWhite,borderRadius:8,border:`1px solid ${C.border}`}}>
                            <span style={{fontSize:12,fontWeight:600,color:C.text}}>{trait.category}</span>
                            <span style={{fontSize:11,fontWeight:700,
                              color:rating?C.green:C.light,
                              background:rating?C.greenPale:"transparent",
                              padding:"2px 8px",borderRadius:5}}>
                              {rating?`${rating.symbol||""} ${rating.label}`:"—"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Comments */}
                {(classTeacherComment||principalComment)&&(
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:8}}>
                    <div style={{padding:"12px 14px",background:C.bluePale,borderRadius:8,border:`1px solid ${C.blue}22`}}>
                      <div style={{fontSize:10,fontWeight:700,color:C.blue,textTransform:"uppercase",letterSpacing:.5,marginBottom:5}}>
                        {settings.report_class_teacher_title||"Group Staff's Comment"}
                      </div>
                      <div style={{fontSize:12,color:C.text,fontStyle:"italic"}}>{classTeacherComment||"—"}</div>
                    </div>
                    <div style={{padding:"12px 14px",background:C.orangePale,borderRadius:8,border:`1px solid ${C.orange}22`}}>
                      <div style={{fontSize:10,fontWeight:700,color:C.orange,textTransform:"uppercase",letterSpacing:.5,marginBottom:5}}>
                        {settings.report_principal_title||"Principal's Comment"}
                      </div>
                      <div style={{fontSize:12,color:C.text,fontStyle:"italic"}}>{principalComment||"—"}</div>
                    </div>
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
      ):(
        <Card style={{textAlign:"center",padding:52}}>
          <div style={{marginBottom:10}}><ClipboardList size={44} color={C.muted}/></div>
          <div style={{fontWeight:800,color:C.blue,fontSize:16}}>Select Cycle, Period and Group</div>
          <div style={{color:C.muted,fontSize:13,marginTop:6}}>Choose filters above to view and generate report cards</div>
        </Card>
      )}

      {/* Bulk Report Email Modal */}
      {sectionBulkEmail&&(
        <BulkReportEmailModal
          students={sectionBulkEmail.students}
          classes={classes}
          notifyEmail={user?.email||null}
          loadStudentData={async(stu)=>{
            const [r,c]=await Promise.all([
              db.getResults({student_id:stu.id,class_id:stu.class_id,term_id:+selTerm,session_id:+selSession}),
              db.getCaeResults({student_id:stu.id,class_id:stu.class_id,term_id:+selTerm,session_id:+selSession}),
            ]);
            return{results:r.data||[],caeResults:c.data||[]};
          }}
          buildEmailPayload={async(stu,stuData)=>{
            const stuCls=classes.find(c=>c.id===stu.class_id);
            const term2=terms.find(t=>t.id===+selTerm);
            const session2=sessions.find(s=>s.id===+selSession);
            const stuPubInfo=sectionBulkEmail.publishInfoMap[stu.class_id]||null;
            const stuName=fullName(stu);
            const termName=term2?.name||"";
            const sessionName=session2?.name||"";
            const stuPubOptions=stuPubInfo?{
              show_cae:stuPubInfo.show_cae!==false,
              show_teacher_comment:stuPubInfo.show_teacher_comment!==false,
              show_principal_comment:stuPubInfo.show_principal_comment!==false,
              show_parent_ack:false,
              show_position:stuPubInfo.show_position!==false,
              show_next_term:stuPubInfo.show_next_term!==false,
              card_design:stuPubInfo.card_design||"classic",
            }:pubOptions;
            const data={[stu.id]:stuData};
            const rcHtml=openReportCardPrintWindow([stu],data,stuCls,term2,session2,
              gradingSchema,caeTraits,caeRatings,stuPubInfo,effectiveSettings,
              sectionCtx?.schoolLogo,
              stuPubInfo?.class_teacher_comment||"",
              stuPubInfo?.principal_comment||"",
              stuPubInfo?.next_term_begins||"",
              stuPubOptions,
              signatures.find(s=>s.id===(stuPubInfo?.teacher_signature_id))||null,
              signatures.find(s=>s.id===(stuPubInfo?.principal_signature_id))||null,
              null,true,true);
            // Bulk email path: scale=2 (144 DPI, still crisp), waitMs=300 (fonts cached after first render),
            // jpeg=true (3-5× faster canvas encode), compress=true — visually lossless for email delivery
            const b64=await htmlToPdfBase64(rcHtml,{scale:2,waitMs:300,jpeg:true,usePt:false,autoHeight:true});
            const binary=atob(b64);
            const bytes=new Uint8Array(binary.length);
            for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
            const blob=new Blob([bytes],{type:"application/pdf"});
            const safeTerm=(termName+"-"+sessionName).replace(/[^a-zA-Z0-9-_]/g,"-");
            const filePath=`${stu.student_id||stu.id}/${safeTerm}.pdf`;
            await supabase.storage.from("report-cards").upload(filePath,blob,{upsert:true,contentType:"application/pdf"});
            const portalUrl=window.location.origin;
            if(emailSendMode==="attachment"){
              const emailHtml=buildEmailHtml(`Report \u2014 ${termName} ${sessionName}`,[
                `Dear Member/Contact,`,``,
                `Please find attached the term report card for ${stuName} (${termName} ${sessionName}).`,``,
                `You can also access all report cards at any time by logging into the Business Portal:`,``,
                `  Portal  : ${portalUrl}`,
                `  Login ID: ${stu.student_id||stu.id}`,
                `  Password: (your registered portal password)`,``,
                `If you have any questions, please contact the organization office.`,
                `For assistance, contact the organization administration.`,
              ].join("\n"));
              return{to:stu.email,subject:`Report \u2014 ${stuName} \u2014 ${termName} ${sessionName}`,html:emailHtml,
                attachments:[{name:`ReportCard-${stuName.replace(/\s+/g,"-")}-${safeTerm}.pdf`,content:b64,mimeType:"application/pdf"}]};
            }else{
              const{data:signedData}=await supabase.storage.from("report-cards").createSignedUrl(filePath,604800);
              const pdfUrl=signedData?.signedUrl||"";
              const emailHtml=buildEmailHtml(`Report \u2014 ${termName} ${sessionName}`,[
                `Dear Member/Contact,`,``,
                `The term report card for ${stuName} (${termName} ${sessionName}) is ready.`,``,
                `\u{1F4C4} View Report (link valid for 7 days):`,
                `${pdfUrl}`,``,
                `You can also log in to the Business Portal for all future report cards:`,``,
                `  Portal  : ${portalUrl}`,
                `  Login ID: ${stu.student_id||stu.id}`,
                `  Password: (your registered portal password)`,``,
                `If you have any questions, please contact the organization office.`,
                `For assistance, contact the organization administration.`,
              ].join("\n"));
              return{to:stu.email,subject:`Report \u2014 ${stuName} \u2014 ${termName} ${sessionName}`,html:emailHtml};
            }
          }}
          onClose={()=>setSectionBulkEmail(null)}
        />
      )}

      {/* Customise / Edit Comments Modal */}
      {editComments&&(
        <Modal title="Customise Report" onClose={()=>setEditComments(false)} width={620}>
          <div style={{background:C.bluePale,border:`1px solid ${C.blue}22`,borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:12,color:C.blue}}>
            Settings apply to all report cards for <b>{cls?.name}</b> — <b>{term?.name}</b>
          </div>

          {/* Layout info note */}
          <div style={{background:C.bluePale,border:`1px solid ${C.blue}33`,borderRadius:8,padding:"9px 14px",marginBottom:16,display:"flex",alignItems:"center",gap:10,fontSize:12,color:C.blue}}>
            
            <span>Section visibility, signatures and spacing are configured globally in <b>Report Settings</b>.</span>
          </div>

          {/* Comments */}
          <div style={{marginBottom:12}}>
            <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>
              {settings.report_class_teacher_title||"Group Staff's Comment"}
            </label>
            <textarea value={classTeacherComment} onChange={e=>setClassTeacherComment(e.target.value)}
              rows={2} placeholder="e.g. A hardworking set of members. Keep it up!"
              style={{width:"100%",padding:"9px 12px",border:`2px solid ${C.border}`,background:C.white,color:C.text,borderRadius:8,fontSize:13,resize:"vertical",fontFamily:"inherit",outline:"none"}}/>
          </div>
          <div style={{marginBottom:12}}>
            <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>
              {settings.report_principal_title||"Principal's Comment"}
            </label>
            <textarea value={principalComment} onChange={e=>setPrincipalComment(e.target.value)}
              rows={2} placeholder="e.g. Excellent performance this period. Aim higher!"
              style={{width:"100%",padding:"9px 12px",border:`2px solid ${C.border}`,background:C.white,color:C.text,borderRadius:8,fontSize:13,resize:"vertical",fontFamily:"inherit",outline:"none"}}/>
          </div>

          {/* Next Period Date */}
          {pubOptions.show_next_term&&(
            <Inp label="Next Period Begins (date)" type="date" value={nextTermBegins||""} onChange={setNextTermBegins}/>
          )}

          {/* Signatures */}
          {signatures.length>0&&(
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>
                Signatures
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>
                  <label style={{display:"block",fontSize:11,fontWeight:600,color:C.muted,marginBottom:5}}>Group Staff Signature</label>
                  <select value={teacherSigId} onChange={e=>setTeacherSigId(e.target.value)}
                    style={{width:"100%",padding:"9px 10px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:12,background:C.white,color:C.text,outline:"none"}}>
                    <option value="">— None —</option>
                    {signatures.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  {teacherSigId&&(()=>{const sig=signatures.find(x=>x.id===+teacherSigId);return sig?<img src={sig.image_url} alt={sig.name} style={{height:48,marginTop:6,objectFit:"contain",border:`1px solid ${C.border}`,borderRadius:6,padding:3}}/>:null;})()}
                </div>
                <div>
                  <label style={{display:"block",fontSize:11,fontWeight:600,color:C.muted,marginBottom:5}}>Principal Signature</label>
                  <select value={principalSigId} onChange={e=>setPrincipalSigId(e.target.value)}
                    style={{width:"100%",padding:"9px 10px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:12,background:C.white,color:C.text,outline:"none"}}>
                    <option value="">— None —</option>
                    {signatures.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  {principalSigId&&(()=>{const sig=signatures.find(x=>x.id===+principalSigId);return sig?<img src={sig.image_url} alt={sig.name} style={{height:48,marginTop:6,objectFit:"contain",border:`1px solid ${C.border}`,borderRadius:6,padding:3}}/>:null;})()}
                </div>
              </div>
            </div>
          )}

          <div style={{display:"flex",gap:10,marginTop:8}}>
            <Btn onClick={savePublishInfo} color={C.orange} disabled={publishing} style={{flex:1}}>
              {publishing?"Saving…":"Save Settings"}
            </Btn>
            <Btn onClick={()=>setEditComments(false)} color={C.muted} outline style={{flex:1}}>Close</Btn>
          </div>
        </Modal>
      )}

      {/* Publish Confirmation Modal */}
      {showPublishModal&&(
        <Modal title="Publish Reports" onClose={()=>setShowPublishModal(false)} width={520}>
          <div style={{textAlign:"center",marginBottom:20}}>
            <div style={{marginBottom:10}}><ClipboardList size={48} color={C.blue}/></div>
            <div style={{fontWeight:900,fontSize:16,color:C.blue,marginBottom:6}}>Ready to Publish?</div>
            <div style={{fontSize:13,color:C.muted,lineHeight:1.6}}>
              Report cards for <b>{cls?.name}</b> — <b>{term?.name}</b> — <b>{session?.name}</b><br/>
              will be visible to <b>{students.length} member{students.length!==1?"s":""}</b> and their contacts.
            </div>
          </div>
          {/* Summary of what's enabled */}
          <div style={{background:C.offWhite,borderRadius:8,padding:"12px 14px",marginBottom:16,fontSize:12}}>
            <div style={{fontWeight:700,color:C.blue,marginBottom:8}}>Report will include:</div>
            {Object.entries({
              "Character & Affective Evaluation":pubOptions.show_cae,
              "Group Staff's Comment":pubOptions.show_teacher_comment,
              "Principal's Comment":pubOptions.show_principal_comment,
              "Member Position":pubOptions.show_position,
              "Next Period Date":pubOptions.show_next_term,
            }).map(([label,on])=>(
              <div key={label} style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                <span style={{color:on?C.green:C.light,fontWeight:700,fontSize:14}}>{on?"Yes":"No"}</span>
                <span style={{color:on?C.text:C.light}}>{label}</span>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:10}}>
            <Btn onClick={doPublish} color={C.orange} disabled={publishing} style={{flex:1}}>
              {publishing?"Publishing…":"Confirm & Publish"}
            </Btn>
            <Btn onClick={()=>setShowPublishModal(false)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── RESULT APPROVALS PAGE ────────────────────────────────────────────────────
export function ResultApprovalsPage({ctx}){
  const {notify,role,user,canAccess}=ctx;
  const canMA=role==="admin"||canAccess("action:approve_ma");
  const canEA=role==="admin"||role==="teacher"||canAccess("action:approve_ea");
  const [tab,setTab]=useState("approvals"); // "approvals" | "progress"
  const [sessions,setSessions]=useState([]);
  const [terms,setTerms]=useState([]);
  const [classes,setClasses]=useState([]);
  const [selSession,setSelSession]=useState("");
  const [selTerm,setSelTerm]=useState("");
  const [approvals,setApprovals]=useState([]);
  const [students,setStudents]=useState([]);
  const [results,setResults]=useState([]);
  const [completeness,setCompleteness]=useState({});
  const [loading,setLoading]=useState(false);
  const [acting,setActing]=useState("");
  const [expandedClass,setExpandedClass]=useState(null);
  const [changingStatus,setChangingStatus]=useState({}); // {studentId: true} while saving
  // Progress tab state
  const [progressLoading,setProgressLoading]=useState(false);
  const [progressData,setProgressData]=useState(null); // {classSubjects, resultsMap, formTeachers}
  const [expandedProgress,setExpandedProgress]=useState(null);

  useEffect(()=>{
    Promise.all([db.getSessions(),db.getClasses()]).then(([s,c])=>{
      setSessions(s.data||[]);
      setClasses(c.data||[]);
      const active=s.data?.find(x=>x.is_active);
      if(active){
        setSelSession(String(active.id));
        db.getTerms(active.id).then(({data})=>{
          setTerms(data||[]);
          const at=data?.find(x=>x.is_active);
          if(at)setSelTerm(String(at.id));
        }).catch(err=>console.error('[ResultApprovals] getTerms failed:',err));
      }
    }).catch(err=>console.error('[ResultApprovals] initial load failed:',err));
    db.getStudents().then(({data})=>setStudents(data||[]))
      .catch(err=>console.error('[ResultApprovals] getStudents failed:',err));
  },[]);

  // filter classes by role (teacher sees only their form classes)
  const visibleClasses=useMemo(()=>{
    if(role!=="teacher"||!user.teacher_db_id)return classes;
    return classes; // teacher sees all for now; filtered via db
  },[classes,role,user]);

  const handleStatusChange=async(studentId,newStatus)=>{
    setChangingStatus(p=>({...p,[studentId]:true}));
    const{error}=await db.upsertStudent({status:newStatus},studentId);
    if(error){
      notify(error.message,"error");
    } else {
      // Update local students list so completeness re-renders immediately
      setStudents(prev=>prev.map(s=>String(s.id)===String(studentId)?{...s,status:newStatus}:s));
      notify(`Member status updated to "${newStatus}"`,"success");
    }
    setChangingStatus(p=>{const n={...p};delete n[studentId];return n;});
  };

  const load=async()=>{
    if(!selSession||!selTerm)return;
    setLoading(true);
    const {data}=await db.getResultApprovals({term_id:+selTerm,session_id:+selSession});
    const approvalMap={};(data||[]).forEach(a=>{approvalMap[a.class_id]=a;});

    // Build completeness per class
    const cmpMap={};
    await Promise.all(visibleClasses.map(async cls=>{
      const [resCmp,clsSubs]=await Promise.all([
        db.getResultsCompleteness(cls.id,+selTerm,+selSession),
        db.getClassSubjectIds(cls.id),
      ]);
      const expectedIds=(clsSubs.data||[]).map(cs=>cs.section_subject_id);
      const subjectNames=(clsSubs.data||[]).reduce((m,cs)=>{
        if(cs.section_subjects)m[cs.section_subject_id]=cs.section_subjects.name;
        return m;
      },{});
      const byStudent={};
      (resCmp.data||[]).forEach(r=>{
        // Only count rows where total_score is genuinely > 0.
        // null means no row at all; "0" (string zero) means uploaded but empty — both are incomplete.
        if(!(+r.total_score > 0)) return;
        if(!byStudent[r.student_id])byStudent[r.student_id]=new Set();
        byStudent[r.student_id].add(r.subject_id);
      });
      // Only active students count toward completeness — inactive/left/etc. are excluded
      const stuInClass=(students).filter(s=>s.class_id===cls.id&&(s.status||"active")==="active");
      // If no subjects assigned OR no active students — mark as "not set up"
      if(!expectedIds.length||!stuInClass.length){
        cmpMap[cls.id]={complete:false,noSetup:true,studentsWithMissing:0,total:stuInClass.length,expected:expectedIds.length,studentSummary:[]};
        return;
      }
      let missingCount=0;
      const studentSummary=stuInClass.map(s=>{
        const done=byStudent[s.id]||new Set();
        const missing=expectedIds.filter(id=>!done.has(id)).map(id=>subjectNames[id]||`Category ${id}`);
        if(missing.length)missingCount++;
        return{id:s.id,name:s.name||s.id,missing,status:s.status||"active"};
      });
      cmpMap[cls.id]={complete:missingCount===0,noSetup:false,studentsWithMissing:missingCount,total:stuInClass.length,expected:expectedIds.length,studentSummary};
    }));
    setCompleteness(cmpMap);

    // Merge approval data
    setApprovals(approvalMap);
    setLoading(false);
  };

  useEffect(()=>{if(selSession&&selTerm)load();},[selSession,selTerm]);
  useEffect(()=>{if(selSession&&selTerm&&tab==="progress")loadProgress();},[tab,selSession,selTerm]);
  useEffect(()=>{
    if(!selSession)return;
    db.getTerms(+selSession).then(({data})=>{setTerms(data||[]);setSelTerm("");});
  },[selSession]);

  const loadProgress=async()=>{
    if(!selSession||!selTerm)return;
    setProgressLoading(true);
    const[overviewRes,allSubjRes,ftRes]=await Promise.all([
      db.getResultsOverview(+selTerm,+selSession),
      db.getAllClassSubjects(),
      db.getAllFormTeachers(),
    ]);
    // Build results map: {classId: {subjectId: Set(studentIds)}}
    // Only include rows where total_score > 0.
    // null = no row at all; "0" = uploaded but empty — both are incomplete.
    const resultsMap={};
    (overviewRes.data||[]).forEach(r=>{
      if(!(+r.total_score > 0)) return;
      if(!resultsMap[r.class_id])resultsMap[r.class_id]={};
      if(!resultsMap[r.class_id][r.subject_id])resultsMap[r.class_id][r.subject_id]=new Set();
      resultsMap[r.class_id][r.subject_id].add(r.student_id);
    });
    // Build classSubjects map: {classId: [{subject_id, name, code}]}
    // subject_id must be section_subjects.id to match portal_results.subject_id
    const classSubjects={};
    (allSubjRes.data||[]).forEach(cs=>{
      const sid=cs.section_subjects?.id||cs.section_subject_id;
      if(!sid)return;
      if(!classSubjects[cs.class_id])classSubjects[cs.class_id]=[];
      classSubjects[cs.class_id].push({subject_id:sid,name:cs.section_subjects?.name||'Unknown',code:cs.section_subjects?.code||''});
    });
    // Build form teacher map: {classId: teacherName}
    const formTeachers={};
    (ftRes.data||[]).forEach(ft=>{
      if(ft.class_id&&ft.teachers)formTeachers[ft.class_id]=ft.teachers.full_name||ft.teachers.staff_id||'—';
    });
    setProgressData({resultsMap,classSubjects,formTeachers});
    setProgressLoading(false);
  };

  // Patch a single class approval in state without triggering a full reload
  const patchApproval=async(classId)=>{
    const{data}=await db.getResultApproval(classId,+selTerm,+selSession);
    if(data) setApprovals(prev=>({...prev,[classId]:data}));
  };

  const approveEA=async(cls)=>{
    setActing(`ea-${cls.id}`);
    const appr=approvals[cls.id];
    const isApproved=appr?.ea_status==="approved";
    if(isApproved){
      await db.revokeEA(cls.id,+selTerm,+selSession);
      notify("EA revoked for "+cls.name,"warn");
    } else {
      const cmp=completeness[cls.id];
      if(!cmp?.complete){
        notify("Results must be complete before approval — some members have missing scores","error");
        setActing("");return;
      }
      await db.approveEA(cls.id,+selTerm,+selSession,user?.supabase_uid||null);
      notify(`✅ EA approved for ${cls.name}`);
    }
    await patchApproval(cls.id);
    setActing("");
  };

  const approveMA=async(cls)=>{
    if(!canMA){notify("You don't have permission to give Manager Approval","error");return;}
    const appr=approvals[cls.id];
    if(appr?.ea_status!=="approved"){notify("EA must be approved first","error");return;}
    setActing(`ma-${cls.id}`);
    const isApproved=appr?.ma_status==="approved";
    if(isApproved){
      await db.revokeMA(cls.id,+selTerm,+selSession);
      notify("MA revoked for "+cls.name,"warn");
    } else {
      const cmp=completeness[cls.id];
      if(!cmp?.complete){
        notify("Results must be complete before approval — some members have missing scores","error");
        setActing("");return;
      }
      await db.approveMA(cls.id,+selTerm,+selSession,user?.supabase_uid||null);
      notify(`✅ MA approved for ${cls.name} — results fully locked`);
    }
    await patchApproval(cls.id);
    setActing("");
  };

  const filterTerms=terms.filter(t=>t.session_id===+selSession);

  const statusBadge=(status,type)=>{
    const ok=status==="approved";
    return(
      <span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,
        background:ok?C.greenPale:C.orangePale,color:ok?C.green:C.orange,
        border:`1px solid ${ok?C.green:C.orange}30`}}>
        {type}: {ok?"Approved":"Pending"}
      </span>
    );
  };

  // Build per-class progress summary for the progress tab
  const buildClassProgress=(cls)=>{
    if(!progressData)return null;
    const{resultsMap,classSubjects}=progressData;
    const subjects=classSubjects[cls.id]||[];
    const stuInClass=students.filter(s=>s.class_id===cls.id&&(s.status||"active")==="active");
    const total=stuInClass.length;
    const stuIds=new Set(stuInClass.map(s=>String(s.id)));
    if(!subjects.length||!total)return{subjects:[],total,complete:0,partial:0,missing:0,noSetup:true};
    const clsResults=resultsMap[cls.id]||{};
    let complete=0,partial=0,missing=0;
    const subjectRows=subjects.map(subj=>{
      const uploaded=clsResults[subj.subject_id]||new Set();
      // count students in class who have a result entry
      const count=[...stuIds].filter(id=>uploaded.has(id)||uploaded.has(+id)).length;
      const pct=total?Math.round((count/total)*100):0;
      const status=count===0?'missing':count<total?'partial':'complete';
      if(status==='complete')complete++;
      else if(status==='partial')partial++;
      else missing++;
      return{...subj,count,total,pct,status};
    });
    return{subjects:subjectRows,total,complete,partial,missing,noSetup:false,totalSubjects:subjects.length};
  };

  return(
    <div>
      <div style={{marginBottom:18}}>
        <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="result-approvals" size={20}/>Result Approvals</h2>
        <p style={{color:C.muted,fontSize:12}}>Manage EA/MA approvals and track result upload progress across all groups.</p>
      </div>

      {/* Tab toggle */}
      <div style={{display:"flex",gap:0,marginBottom:16,background:C.offWhite,borderRadius:10,padding:4,width:"fit-content",border:`1px solid ${C.border}`}}>
        {[{id:"approvals",label:"Approvals",icon:<ShieldCheck size={14}/>},{id:"progress",label:"Upload Progress",icon:<BarChart2 size={14}/>}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{display:"flex",alignItems:"center",gap:6,padding:"7px 16px",borderRadius:7,border:"none",
              background:tab===t.id?C.white:"transparent",
              color:tab===t.id?C.blue:C.muted,
              fontWeight:tab===t.id?800:500,fontSize:13,cursor:"pointer",
              boxShadow:tab===t.id?"0 1px 4px rgba(0,0,0,.1)":"none",transition:"all .15s"}}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <Card style={{marginBottom:16}}>
        <div data-jd-columns="2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Sel label="Cycle" value={selSession} onChange={setSelSession}
            options={[{value:"",label:"— Select Cycle —"},...sessions.map(s=>({value:String(s.id),label:s.name}))]}/>
          <Sel label="Period" value={selTerm} onChange={setSelTerm}
            options={[{value:"",label:"— Select Period —"},...filterTerms.map(t=>({value:String(t.id),label:t.name}))]}/>
        </div>
      </Card>

      {/* ── UPLOAD PROGRESS TAB ────────────────────────────────────────────── */}
      {tab==="progress"&&(
        !selSession||!selTerm?(
          <Card style={{textAlign:"center",padding:52}}>
            <BarChart2 size={44} color={C.muted} style={{marginBottom:12}}/>
            <div style={{fontWeight:800,color:C.blue,fontSize:16}}>Select Cycle and Period</div>
            <div style={{color:C.muted,fontSize:13,marginTop:6}}>Choose a cycle and period to view upload progress</div>
          </Card>
        ):progressLoading?(
          <Spinner/>
        ):(()=>{
          // Summary stats
          let totalClasses=0,doneClasses=0,partialClasses=0,notStartedClasses=0,noSetupClasses=0;
          const progressBySection={};
          visibleClasses.forEach(cls=>{
            const p=buildClassProgress(cls);
            if(!p)return;
            totalClasses++;
            if(p.noSetup){noSetupClasses++;return;}
            const allDone=p.complete===p.totalSubjects&&p.totalSubjects>0;
            const noneStarted=p.complete===0&&p.partial===0;
            if(allDone)doneClasses++;
            else if(noneStarted)notStartedClasses++;
            else partialClasses++;
            const secName=cls.sections?.name||'Other';
            if(!progressBySection[secName])progressBySection[secName]=[];
            progressBySection[secName].push({cls,p});
          });
          return(
            <div>
              {/* Summary bar */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:18}}>
                {[
                  {label:"Fully Uploaded",value:doneClasses,color:C.green,bg:C.greenPale,icon:<CheckCircle2 size={18}/>},
                  {label:"In Progress",value:partialClasses,color:C.orange,bg:C.orangePale,icon:<Clock size={18}/>},
                  {label:"Not Started",value:notStartedClasses,color:C.red,bg:C.redPale,icon:<AlertCircle size={18}/>},
                  {label:"Not Set Up",value:noSetupClasses,color:C.muted,bg:C.offWhite,icon:<MinusCircle size={18}/>},
                ].map(s=>(
                  <div key={s.label} style={{background:s.bg,border:`1px solid ${s.color}20`,borderRadius:10,padding:"12px 14px",display:"flex",alignItems:"center",gap:10}}>
                    <div style={{color:s.color}}>{s.icon}</div>
                    <div>
                      <div style={{fontSize:22,fontWeight:900,color:s.color,lineHeight:1}}>{s.value}</div>
                      <div style={{fontSize:11,color:s.color,fontWeight:600,marginTop:2}}>{s.label}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Groups grouped by section */}
              {Object.entries(progressBySection).map(([secName,rows])=>(
                <div key={secName} style={{marginBottom:20}}>
                  <div style={{fontWeight:800,fontSize:12,color:C.muted,textTransform:"uppercase",letterSpacing:.6,marginBottom:8,paddingLeft:2}}>{secName}</div>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {rows.map(({cls,p})=>{
                      const allDone=p.complete===p.totalSubjects&&p.totalSubjects>0;
                      const noneStarted=p.complete===0&&p.partial===0&&p.totalSubjects>0;
                      const statusColor=allDone?C.green:noneStarted?C.red:C.orange;
                      const statusLabel=allDone?"✓ Complete":noneStarted?"Not started":`${p.complete}/${p.totalSubjects} subjects done`;
                      const formTeacher=progressData?.formTeachers?.[cls.id];
                      const isOpen=expandedProgress===cls.id;
                      return(
                        <div key={cls.id} style={{background:C.white,border:`1.5px solid ${isOpen?statusColor:C.border}`,borderRadius:12,overflow:"hidden",transition:"border-color .2s"}}>
                          {/* Group header row */}
                          <button onClick={()=>setExpandedProgress(isOpen?null:cls.id)}
                            style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"13px 16px",
                              background:"transparent",border:"none",cursor:"pointer",textAlign:"left"}}>
                            {/* Status dot */}
                            <div style={{width:10,height:10,borderRadius:"50%",background:statusColor,flexShrink:0}}/>
                            {/* Group name */}
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontWeight:800,fontSize:14,color:C.text}}>{cls.name}</div>
                              <div style={{fontSize:11,color:C.muted,marginTop:1}}>
                                {p.total} member{p.total!==1?"s":""}
                                {formTeacher?<span> · <span style={{color:C.blue}}>Form staff: {formTeacher}</span></span>:null}
                              </div>
                            </div>
                            {/* Progress bar */}
                            <div style={{width:140,flexShrink:0}}>
                              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                                <span style={{fontSize:10,fontWeight:700,color:statusColor}}>{statusLabel}</span>
                              </div>
                              <div style={{height:6,borderRadius:3,background:C.border,overflow:"hidden"}}>
                                <div style={{height:"100%",borderRadius:3,background:statusColor,
                                  width:`${p.totalSubjects?Math.round((p.complete/p.totalSubjects)*100):0}%`,transition:"width .4s"}}/>
                              </div>
                            </div>
                            {/* Expand chevron */}
                            <ChevronDown size={16} color={C.muted} style={{transform:isOpen?"rotate(180deg)":"none",transition:"transform .2s",flexShrink:0}}/>
                          </button>

                          {/* Expanded: per-subject table */}
                          {isOpen&&(
                            <div style={{borderTop:`1px solid ${C.border}`,background:C.offWhite}}>
                              {/* Legend */}
                              <div style={{display:"flex",gap:14,padding:"8px 16px",borderBottom:`1px solid ${C.border}`}}>
                                {[["#22c55e","Complete — all members have scores"],["#f97316","Partial — some members missing"],["#ef4444","Not started — no scores at all"]].map(([col,lbl])=>(
                                  <div key={lbl} style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:C.muted}}>
                                    <div style={{width:8,height:8,borderRadius:2,background:col,flexShrink:0}}/>
                                    {lbl}
                                  </div>
                                ))}
                              </div>
                              {/* Category rows */}
                              {p.subjects.map((subj,i)=>{
                                const sc={complete:"#22c55e",partial:"#f97316",missing:"#ef4444"}[subj.status];
                                const sbg={complete:"#f0fdf4",partial:"#fff7ed",missing:"#fef2f2"}[subj.status];
                                const missing=subj.total-subj.count;
                                return(
                                  <div key={subj.subject_id} style={{display:"flex",alignItems:"center",gap:12,
                                    padding:"10px 16px",background:i%2===0?C.white:"transparent",
                                    borderBottom:i<p.subjects.length-1?`1px solid ${C.border}40`:"none"}}>
                                    {/* Status badge */}
                                    <div style={{width:7,height:7,borderRadius:"50%",background:sc,flexShrink:0}}/>
                                    {/* Category name */}
                                    <div style={{flex:1,fontWeight:600,fontSize:13,color:C.text}}>{subj.name}</div>
                                    {/* Mini bar */}
                                    <div style={{width:120,flexShrink:0}}>
                                      <div style={{height:5,borderRadius:3,background:C.border,overflow:"hidden"}}>
                                        <div style={{height:"100%",borderRadius:3,background:sc,width:`${subj.pct}%`}}/>
                                      </div>
                                    </div>
                                    {/* Count */}
                                    <div style={{fontSize:12,fontWeight:700,color:sc,width:60,textAlign:"right",flexShrink:0}}>
                                      {subj.count}/{subj.total}
                                    </div>
                                    {/* Status label */}
                                    <div style={{background:sbg,color:sc,border:`1px solid ${sc}30`,
                                      borderRadius:6,padding:"3px 10px",fontSize:10,fontWeight:700,width:90,textAlign:"center",flexShrink:0}}>
                                      {subj.status==="complete"?"Complete":subj.status==="partial"?`${missing} missing`:"Not started"}
                                    </div>
                                  </div>
                                );
                              })}
                              {p.subjects.length===0&&(
                                <div style={{padding:"14px 16px",fontSize:12,color:C.muted}}>No categories assigned to this group.</div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {Object.keys(progressBySection).length===0&&(
                <Card style={{textAlign:"center",padding:40}}>
                  <div style={{color:C.muted,fontSize:13}}>No groups found. Make sure groups have categories assigned and members enrolled.</div>
                </Card>
              )}
            </div>
          );
        })()
      )}

      {/* ── APPROVALS TAB ───────────────────────────────────────────────────── */}
      {tab==="approvals"&&(loading?<Spinner/>:selSession&&selTerm?(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {visibleClasses.map(cls=>{
            const appr=approvals[cls.id]||{};
            const cmp=completeness[cls.id]||{};
            const eaOk=appr.ea_status==="approved";
            const maOk=appr.ma_status==="approved";
            const isExpanded=expandedClass===cls.id;
            const stuInClass=students.filter(s=>s.class_id===cls.id&&(s.status||"active")==="active");
            return(
              <Card key={cls.id} style={{border:`2px solid ${maOk?C.green:eaOk?C.purple:C.border}`}}>
                <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                  {/* Group info */}
                  <div style={{flex:1,minWidth:120}}>
                    <div style={{fontWeight:800,fontSize:14,color:C.blue}}>{cls.name}</div>
                    <div style={{fontSize:11,color:C.muted}}>{stuInClass.length} members</div>
                  </div>

                  {/* Completeness */}
                  <div style={{textAlign:"center"}}>
                    <div style={{fontSize:11,color:C.muted,marginBottom:3}}>Results</div>
                    <span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,
                      background:cmp.noSetup?C.offWhite:cmp.complete?C.greenPale:C.redPale,
                      color:cmp.noSetup?C.muted:cmp.complete?C.green:C.red,
                      border:`1px solid ${cmp.noSetup?C.border:cmp.complete?C.green:C.red}30`}}>
                      {cmp.noSetup?"— Not set up":cmp.complete?"Complete":cmp.studentsWithMissing>0?`${cmp.studentsWithMissing} student${cmp.studentsWithMissing>1?"s":""} missing`:"—"}
                    </span>
                  </div>

                  {/* EA + MA badges */}
                  <div style={{display:"flex",gap:6}}>
                    {statusBadge(appr.ea_status||"pending","EA")}
                    {statusBadge(appr.ma_status||"pending","MA")}
                  </div>

                  {/* Action buttons */}
                  <div style={{display:"flex",gap:6}}>
                    {canEA&&!maOk&&(
                      <Btn xs onClick={()=>approveEA(cls)} color={eaOk?C.red:C.green}
                        outline={eaOk} disabled={acting===`ea-${cls.id}`}>
                        {acting===`ea-${cls.id}`?"…":eaOk?"Revoke EA":"Approve EA"}
                      </Btn>
                    )}
                    {canMA&&(
                      <Btn xs onClick={()=>approveMA(cls)} color={maOk?C.red:C.purple}
                        outline={maOk} disabled={acting===`ma-${cls.id}`||(!eaOk&&!maOk)}>
                        {acting===`ma-${cls.id}`?"…":maOk?"Revoke MA":"Approve MA"}
                      </Btn>
                    )}
                    <Btn xs onClick={()=>setExpandedClass(isExpanded?null:cls.id)} color={C.blue} outline>
                      {isExpanded?"Less":"Details"}
                    </Btn>
                  </div>
                </div>

                {/* Expanded detail: approval info + incomplete students */}
                {isExpanded&&(
                  <div style={{marginTop:14,paddingTop:14,borderTop:`1px solid ${C.border}`}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                      <div style={{background:C.offWhite,borderRadius:8,padding:"10px 14px"}}>
                        <div style={{fontSize:11,fontWeight:700,color:C.blue,marginBottom:4}}>EA Details</div>
                        <div style={{fontSize:12,color:C.text}}>{eaOk?`Approved by ${appr.ea_approver?.full_name||"Admin"} on ${new Date(appr.ea_approved_at).toLocaleDateString("en-NG")}`:"Not yet approved"}</div>
                        {appr.ea_notes&&<div style={{fontSize:11,color:C.muted,marginTop:3,fontStyle:"italic"}}>{appr.ea_notes}</div>}
                      </div>
                      <div style={{background:C.offWhite,borderRadius:8,padding:"10px 14px"}}>
                        <div style={{fontSize:11,fontWeight:700,color:C.purple,marginBottom:4}}>MA Details</div>
                        <div style={{fontSize:12,color:C.text}}>{maOk?`Approved by ${appr.ma_approver?.full_name||"Admin"} on ${new Date(appr.ma_approved_at).toLocaleDateString("en-NG")}`:"Not yet approved"}</div>
                        {appr.ma_notes&&<div style={{fontSize:11,color:C.muted,marginTop:3,fontStyle:"italic"}}>{appr.ma_notes}</div>}
                      </div>
                    </div>
                    {cmp.noSetup&&(
                      <div style={{background:C.offWhite,borderRadius:8,padding:"10px 14px",fontSize:12,color:C.muted}}>
                        ℹ️ No categories or members are assigned to this group yet.
                      </div>
                    )}
                    {!cmp.noSetup&&!cmp.complete&&cmp.studentsWithMissing>0&&(
                      <div style={{background:C.redPale,borderRadius:8,padding:"10px 14px",fontSize:12}}>
                        <div style={{fontWeight:700,color:C.red,marginBottom:8}}>Missing Results ({cmp.studentsWithMissing} member{cmp.studentsWithMissing>1?"s":""})</div>
                        <div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:180,overflowY:"auto"}}>
                          {(cmp.studentSummary||[]).filter(s=>s.missing.length>0).map(s=>(
                            <div key={s.id} style={{background:"rgba(255,255,255,.6)",borderRadius:6,padding:"6px 10px"}}>
                              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3,flexWrap:"wrap"}}>
                                <span style={{fontWeight:700,fontSize:12,color:C.text,flex:1,minWidth:120}}>{s.name}</span>
                                {role==="admin"&&(
                                  <select
                                    value={s.status}
                                    disabled={!!changingStatus[s.id]}
                                    onChange={e=>handleStatusChange(s.id,e.target.value)}
                                    style={{padding:"2px 8px",borderRadius:6,fontSize:11,fontWeight:700,cursor:"pointer",
                                      border:`1px solid ${s.status==="active"?C.green:s.status==="suspended"?C.orange:C.red}`,
                                      background:s.status==="active"?C.greenPale:s.status==="suspended"?C.orangePale:C.redPale,
                                      color:s.status==="active"?C.green:s.status==="suspended"?C.orange:C.red,
                                      opacity:changingStatus[s.id]?.5:1}}>
                                    {["active","inactive","suspended","graduated","withdrawn","left"].map(st=>(
                                      <option key={st} value={st}>{st.charAt(0).toUpperCase()+st.slice(1)}</option>
                                    ))}
                                  </select>
                                )}
                              </div>
                              <div style={{fontSize:11,color:C.red}}>{s.missing.join(" · ")}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {!cmp.noSetup&&cmp.complete&&(
                      <div style={{background:C.greenPale,borderRadius:8,padding:"10px 14px",fontSize:12,color:C.green,fontWeight:600}}>
                        All {cmp.total} members have results for all {cmp.expected} categories.
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
          {visibleClasses.length===0&&(
            <Card style={{textAlign:"center",padding:40}}>
              <div style={{marginBottom:10}}><Lock size={40} color={C.muted}/></div>
              <div style={{fontWeight:800,color:C.blue}}>No Groups Found</div>
            </Card>
          )}
        </div>
      ):(
        <Card style={{textAlign:"center",padding:52}}>
          <div style={{marginBottom:10}}><ShieldCheck size={44} color={C.muted}/></div>
          <div style={{fontWeight:800,color:C.blue,fontSize:16}}>Select Cycle and Period</div>
          <div style={{color:C.muted,fontSize:13,marginTop:6}}>Choose a cycle and period to manage result approvals</div>
        </Card>
      ))}
    </div>
  );
}


// ─── REPORT CARD SETTINGS PAGE ────────────────────────────────────────────────
// ── Report Template Catalog (T1–T11) ─────────────────────────────────
// T11 is the current "Classic — Current" renderer. T1–T10 are new designs whose
// renderers ship in subsequent phases (v32.45+). Storing template_id only —
// dispatch happens inside openReportCardPrintWindow.
const REPORT_TEMPLATE_CATALOG=[
  {id:1, name:"Classic Mono",     accent:"#1e3a5f", desc:"Bold navy header, traditional layout with category grid"},
  {id:2, name:"Modern Minimal",   accent:"#0f172a", desc:"Clean type, generous whitespace, monochrome accents"},
  {id:3, name:"Emerald Prestige", accent:"#047857", desc:"Premium emerald & gold, refined serif typography"},
  {id:4, name:"Bold Blue",        accent:"#1d4ed8", desc:"Strong blue blocks, high-contrast metric tiles"},
  {id:5, name:"Sunrise",          accent:"#ea580c", desc:"Warm sunrise gradient, playful for primary years"},
  {id:6, name:"Royal Crimson",    accent:"#9f1239", desc:"Crimson & cream, classical academy feel"},
  {id:7, name:"Split Layout",     accent:"#0891b2", desc:"Two-column split — member profile sidebar + results"},
  {id:8, name:"Dark Premium",     accent:"#1f2937", desc:"Dark header, light body, executive look"},
  {id:9, name:"Nigerian Heritage",accent:"#166534", desc:"Green & white motif celebrating local heritage"},
  {id:10,name:"Geometric Modern", accent:"#7c3aed", desc:"Geometric shapes, contemporary editorial style"},
  {id:11,name:"Classic — Current",accent:"#1A4FA0", desc:"The current report card design (default)"},
];

export function ReportCardSettingsPage({ctx}){
  const {notify}=ctx;
  const {schoolName:_schoolName}=useSection();
  const [signatures,setSignatures]=useState([]);
  const [saving,setSaving]=useState(false);
  const [loading,setLoading]=useState(true);
  const [savedId,setSavedId]=useState(null);
  const [templateId,setTemplateId]=useState(11);
  const [previewId,setPreviewId]=useState(null);
  const [rcSet,setRcSet]=useState({
    report_class_teacher_title:"",
    report_principal_title:"",
    term_closing_date:"",
    term_opening_date:"",
    principal_signature_base64:"",
    principal_stamp_base64:"",
    report_card_font_family:"'Times New Roman',Georgia,serif",
    report_card_font_size:105,
    report_footer_text:"",
  });
  const rs=(k,v)=>setRcSet(p=>({...p,[k]:v}));

  const blank={
    name:"__default__",
    show_cae:true,show_teacher_comment:true,show_principal_comment:true,
    show_parent_ack:false,show_position:true,show_next_term:true,
    teacher_signature_id:"",principal_signature_id:"",
    default_teacher_comment:"",default_principal_comment:"",
    default_next_term_date:"",
    card_spacing:"normal",
    is_default:true,card_design:"classic",
  };
  const [form,setForm]=useState(blank);
  const f=v=>setForm(p=>({...p,...v}));

  useEffect(()=>{
    Promise.all([db.getReportTemplates(),db.getSignatures(),db.getSettings()]).then(([t,s,allSet])=>{
      setSignatures(s.data||[]);
      const allRows=allSet?.data||[];
      const gv=k=>(allRows.find(r=>r.key===k)||{}).value||"";
      const row=allRows.find(r=>r.key==='report_card_template_id');
      const tidVal=parseInt(row?.value||"11",10);
      setTemplateId(Number.isFinite(tidVal)&&tidVal>=1&&tidVal<=11?tidVal:11);
      setRcSet({
        report_class_teacher_title:gv("report_class_teacher_title"),
        report_principal_title:gv("report_principal_title"),
        term_closing_date:gv("term_closing_date"),
        term_opening_date:gv("term_opening_date"),
        principal_signature_base64:gv("principal_signature_base64"),
        principal_stamp_base64:gv("principal_stamp_base64"),
        report_card_font_family:gv("report_card_font_family")||"'Times New Roman',Georgia,serif",
        report_card_font_size:parseInt(gv("report_card_font_size")||"105",10),
        report_footer_text:gv("report_footer_text"),
      });
      const def=(t.data||[]).find(x=>x.is_default)||(t.data||[])[0];
      if(def){
        setSavedId(def.id);
        setForm({
          name:"__default__",
          show_cae:def.show_cae!==false,
          show_teacher_comment:def.show_teacher_comment!==false,
          show_principal_comment:def.show_principal_comment!==false,
          show_parent_ack:def.show_parent_ack!==false,
          show_position:def.show_position!==false,
          show_next_term:def.show_next_term!==false,
          teacher_signature_id:def.teacher_signature_id||"",
          principal_signature_id:def.principal_signature_id||"",
          default_teacher_comment:def.default_teacher_comment||"",
          default_principal_comment:def.default_principal_comment||"",
          default_next_term_date:def.default_next_term_date||"",
          card_spacing:def.card_spacing||"normal",
          is_default:true,card_design:def.card_design||"classic",
        });
      }
      setLoading(false);
    });
  },[]);

  const save=async()=>{
    setSaving(true);
    const payload={
      ...form,
      is_default:true,
      name:"__default__",
      teacher_signature_id:form.teacher_signature_id||null,
      principal_signature_id:form.principal_signature_id||null,
      default_next_term_date:form.default_next_term_date||null,
    };
    const {error}=await db.upsertReportTemplate(payload,savedId||null);
    // Persist selected template_id + school-settings keys
    const rcKeys=[
      ['report_card_template_id',String(templateId||11)],
      ['report_class_teacher_title',rcSet.report_class_teacher_title||""],
      ['report_principal_title',rcSet.report_principal_title||""],
      ['term_closing_date',rcSet.term_closing_date||""],
      ['term_opening_date',rcSet.term_opening_date||""],
      ['principal_signature_base64',rcSet.principal_signature_base64||""],
      ['principal_stamp_base64',rcSet.principal_stamp_base64||""],
      ['report_card_font_family',rcSet.report_card_font_family||"'Times New Roman',Georgia,serif"],
      ['report_card_font_size',String(rcSet.report_card_font_size||105)],
      ['report_footer_text',rcSet.report_footer_text||""],
    ];
    try{ await Promise.all(rcKeys.map(([k,v])=>db.setSetting(k,v))); }catch(e){ console.warn('[rc-settings] settings save failed',e); }
    setSaving(false);
    if(error)notify(error.message,"error");
    else{
      notify("Report card settings saved ✓");
      // refresh to get the saved ID
      db.getReportTemplates().then(({data})=>{
        const def=(data||[]).find(x=>x.is_default)||(data||[])[0];
        if(def)setSavedId(def.id);
      });
    }
  };

  const SPACINGS=[
    {key:"compact",label:"Compact",icon:"□",desc:"Minimal spacing — fits most content on one page"},
    {key:"normal", label:"Normal", icon:"▣",desc:"Balanced spacing — recommended"},
    {key:"spacious",label:"Spacious",icon:"■",desc:"Extra breathing room between sections"},
  ];

  const TOGGLES=[
    {key:"show_cae",         label:"Affective Domain / CAE",    desc:"Character & Affective Evaluation table"},
    {key:"show_teacher_comment",label:"Group Staff's Comment", desc:"Staff's remarks and signature"},
    {key:"show_principal_comment",label:"Principal's Comment",   desc:"Principal's remarks and signature"},
    {key:"show_position",    label:"Member Position",           desc:"Show rank/position in group"},
    {key:"show_next_term",   label:"Resumption Date",            desc:"Next period closing & resumption dates"},
  ];

  if(loading)return <Spinner/>;

  return(
    <div style={{maxWidth:780,margin:"0 auto"}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
        <div>
          <h2 style={{fontSize:22,fontWeight:900,color:C.blue,margin:0,display:"flex",alignItems:"center",gap:8}}><AppIcon name="report-settings" size={20}/>Report Settings</h2>
          <p style={{color:C.muted,fontSize:13,marginTop:4}}>Configure the default layout and content of all report cards</p>
        </div>
        <Btn onClick={save} color={C.orange} disabled={saving} style={{minWidth:140}}>
          {saving?"Saving…":"Save Settings"}
        </Btn>
      </div>

      <div style={{display:"grid",gap:16}}>

        {/* ── 0. Template Picker ── */}
        <Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4,flexWrap:"wrap",gap:8}}>
            <div>
              <div style={{fontWeight:800,fontSize:15,color:C.blue}}>Report Template</div>
              <p style={{color:C.muted,fontSize:12,margin:"4px 0 0"}}>
                Choose the visual design used when generating report cards. Template 11 is the current classic design.
                Templates 1–10 are new designs being rolled out — selecting one currently still renders the classic until its
                renderer ships.
              </p>
            </div>
            <span style={{padding:"4px 10px",borderRadius:14,fontSize:11,fontWeight:800,
              background:C.bluePale,color:C.blue,border:`1px solid ${C.blue}40`,whiteSpace:"nowrap"}}>
              Selected: T{templateId}
            </span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginTop:12}}>
            {REPORT_TEMPLATE_CATALOG.map(tpl=>{
              const sel=templateId===tpl.id;
              const isCurrent=tpl.id===11;
              const comingSoon=false;
              return(
                <div key={tpl.id} onClick={()=>setTemplateId(tpl.id)}
                  style={{padding:"12px 12px 14px",borderRadius:10,cursor:"pointer",position:"relative",
                    background:sel?C.bluePale:C.offWhite,
                    border:`2px solid ${sel?C.blue:C.border}`,transition:"all .15s"}}>
                  <div style={{height:6,borderRadius:3,background:tpl.accent,marginBottom:8}}/>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:6}}>
                    <div style={{fontSize:11,fontWeight:800,color:C.muted,letterSpacing:.5}}>T{tpl.id}</div>
                    {isCurrent&&<span style={{fontSize:9,fontWeight:800,padding:"2px 6px",borderRadius:8,
                      background:C.greenPale,color:C.green,border:`1px solid ${C.green}40`}}>CURRENT</span>}
                    {comingSoon&&<span style={{fontSize:9,fontWeight:800,padding:"2px 6px",borderRadius:8,
                      background:C.orangePale,color:C.orange,border:`1px solid ${C.orange}40`}}>SOON</span>}
                  </div>
                  <div style={{fontSize:13,fontWeight:800,color:sel?C.blue:C.text,marginTop:4,lineHeight:1.25}}>{tpl.name}</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:4,lineHeight:1.4,minHeight:28}}>{tpl.desc}</div>
                  <button onClick={e=>{e.stopPropagation();setPreviewId(tpl.id);}}
                    style={{marginTop:8,width:"100%",padding:"6px 8px",borderRadius:6,border:`1px solid ${C.blue}`,
                      background:"#fff",color:C.blue,fontSize:11,fontWeight:700,cursor:"pointer",
                      display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                    <Eye size={12}/> Preview
                  </button>
                  {sel&&<div style={{position:"absolute",top:8,right:8,width:18,height:18,borderRadius:"50%",
                    background:C.blue,color:"#fff",fontSize:11,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center"}}>✓</div>}
                </div>
              );
            })}
          </div>
        </Card>

        {previewId!=null&&(()=>{
          const sStu={id:"PREVIEW-001",first_name:"Sample",last_name:"Member",gender:"Male",class_id:1,dob:"2010-05-15",position:1};
          const sCls={id:1,name:"JSS 2A"};
          const sTerm={id:1,name:"2nd Period"};
          const sSess={id:1,name:"2025/2026"};
          const sGS=[
            {grade:"A",min_score:75,max_score:100,remark:"Excellent"},
            {grade:"B",min_score:60,max_score:74,remark:"Very Good"},
            {grade:"C",min_score:50,max_score:59,remark:"Good"},
            {grade:"D",min_score:40,max_score:49,remark:"Pass"},
            {grade:"F",min_score:0,max_score:39,remark:"Fail"},
          ];
          const subs=["Mathematics","English Language","Basic Science","Social Studies","Civic Education","Computer Studies","French","Agricultural Science"];
          const totals=[85,78,72,65,90,88,55,70];
          const sRes=subs.map((name,i)=>{
            const total=totals[i];const ca=Math.round(total*0.4);
            return{subject_id:i+1,class_id:1,ca_score:ca,exam_score:total-ca,total_score:total,
              section_subjects:{name},component_scores:null};
          });
          const sCAET=[
            {id:1,category:"Punctuality"},{id:2,category:"Neatness"},{id:3,category:"Honesty"},
            {id:4,category:"Cooperation"},{id:5,category:"Leadership"},{id:6,category:"Attentiveness"},
          ];
          const sCAER=[
            {id:1,label:"Excellent",symbol:"A",numeric_value:5},
            {id:2,label:"Very Good",symbol:"B",numeric_value:4},
            {id:3,label:"Good",symbol:"C",numeric_value:3},
            {id:4,label:"Fair",symbol:"D",numeric_value:2},
          ];
          const sCAEResults=sCAET.map((t,i)=>({trait_id:t.id,rating_id:[1,2,1,3,2,1][i]}));
          const sPub={template_id:previewId,is_published:true,
            show_cae:true,show_teacher_comment:true,show_principal_comment:true,
            show_position:true,show_next_term:true,show_parent_ack:false};
          const sSet={
            school_name:_schoolName||"Sample Academy",
            school_motto:"Excellence Through Discipline",
            school_address:"123 Education Avenue, Lagos, Nigeria",
            school_email:"info@sample-academy.edu.ng",
            school_phone:"+234 800 000 0000",
            result_ca_max:40,result_exam_max:60,
            principal_signature_base64:rcSet.principal_signature_base64||"",
            principal_stamp_base64:rcSet.principal_stamp_base64||"",
            report_class_teacher_title:rcSet.report_class_teacher_title||"Group Staff",
            report_principal_title:rcSet.report_principal_title||"Principal",
            report_card_template_id:String(previewId),
          };
          let html="";
          try{
            html=openReportCardPrintWindow(
              [sStu],{[sStu.id]:{results:sRes,caeResults:sCAEResults}},
              sCls,sTerm,sSess,sGS,sCAET,sCAER,sPub,sSet,null,
              "A diligent member showing remarkable improvement this period. Keep it up!",
              "Excellent performance overall. Continue to strive for greater heights.",
              "2026-01-08",sPub,null,null,null,true,false
            );
          }catch(e){html=`<div style="padding:40px;text-align:center;color:#dc2626;">Preview error: ${e.message}</div>`;}
          return(
            <div className="jd-report-preview-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",zIndex:9999,
              display:"flex",alignItems:"center",justifyContent:"center",padding:"clamp(6px,2vw,20px)"}}
              onClick={()=>setPreviewId(null)}>
              <div className="jd-report-preview-panel" style={{background:"#fff",borderRadius:12,width:"min(1100px,100%)",height:"min(96dvh,1200px)",
                display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}
                onClick={e=>e.stopPropagation()}>
                <div style={{padding:"12px 18px",borderBottom:`1px solid ${C.border}`,
                  display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
                  <div>
                    <div style={{fontSize:15,fontWeight:800,color:C.blue}}>
                      Preview · T{previewId} {REPORT_TEMPLATE_CATALOG.find(t=>t.id===previewId)?.name||""}
                    </div>
                    <div style={{fontSize:11,color:C.muted,marginTop:2}}>Sample data — actual reports use member data</div>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <Btn onClick={()=>{setTemplateId(previewId);setPreviewId(null);notify(`Selected T${previewId}`,"success");}}
                      color={C.green} style={{minWidth:120}}>Use This Template</Btn>
                    <button onClick={()=>setPreviewId(null)} style={{padding:"8px 12px",border:`1px solid ${C.border}`,
                      borderRadius:8,background:"#fff",cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                      <X size={14}/> Close
                    </button>
                  </div>
                </div>
                <iframe srcDoc={html} title="Template preview"
                  style={{flex:1,width:"100%",border:"none",background:"#e5e7eb"}}/>
              </div>
            </div>
          );
        })()}

        {/* ── 1. Section Visibility ── */}
        <Card>
          <div style={{fontWeight:800,fontSize:15,color:C.blue,marginBottom:4}}>Section Visibility</div>
          <p style={{color:C.muted,fontSize:12,marginTop:0,marginBottom:14}}>Choose which sections appear on the printed report card</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {TOGGLES.map(({key,label,desc})=>(
              <div key={key} onClick={()=>f({[key]:!form[key]})}
                style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 12px",borderRadius:10,cursor:"pointer",
                  background:form[key]?C.greenPale:C.offWhite,border:`2px solid ${form[key]?C.green:C.border}`,transition:"all .15s"}}>
                <div style={{width:20,height:20,borderRadius:5,background:form[key]?C.green:"#cbd5e1",
                  display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
                  {form[key]&&<span style={{color:"#fff",fontSize:12,fontWeight:900,lineHeight:1}}>✓</span>}
                </div>
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:form[key]?C.green:C.text}}>{label}</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:1}}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* ── 2. Section Spacing ── */}
        <Card>
          <div style={{fontWeight:800,fontSize:15,color:C.blue,marginBottom:4}}>Section Spacing</div>
          <p style={{color:C.muted,fontSize:12,marginTop:0,marginBottom:14}}>
            Control the vertical space between sections. Compact fits more on one page; Spacious adds breathing room.
          </p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            {SPACINGS.map(({key,label,icon,desc})=>(
              <div key={key} onClick={()=>f({card_spacing:key})}
                style={{padding:"14px 12px",borderRadius:10,cursor:"pointer",textAlign:"center",
                  background:form.card_spacing===key?C.bluePale:C.offWhite,
                  border:`2px solid ${form.card_spacing===key?C.blue:C.border}`,transition:"all .15s"}}>
                <div style={{fontSize:24,marginBottom:6}}>{icon}</div>
                <div style={{fontSize:13,fontWeight:800,color:form.card_spacing===key?C.blue:C.text}}>{label}</div>
                <div style={{fontSize:10,color:C.muted,marginTop:4,lineHeight:1.4}}>{desc}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* ── 4. Default Content ── */}
        <Card>
          <div style={{fontWeight:800,fontSize:15,color:C.blue,marginBottom:4}}>Default Comments</div>
          <p style={{color:C.muted,fontSize:12,marginTop:0,marginBottom:14}}>
            Pre-fill comment fields each time you generate a report card. You can still edit them before printing.
          </p>
          <div style={{marginBottom:12}}>
            <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>
              Default Group Staff Comment
            </label>
            <textarea value={form.default_teacher_comment} onChange={e=>f({default_teacher_comment:e.target.value})}
              rows={2} placeholder="e.g. A diligent member who demonstrates excellent commitment…"
              style={{width:"100%",boxSizing:"border-box",padding:"9px 12px",border:`2px solid ${C.border}`,background:C.white,color:C.text,
                borderRadius:8,fontSize:13,resize:"vertical",fontFamily:"inherit",outline:"none"}}/>
          </div>
          <div style={{marginBottom:12}}>
            <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>
              Default Principal's Comment
            </label>
            <textarea value={form.default_principal_comment} onChange={e=>f({default_principal_comment:e.target.value})}
              rows={2} placeholder="e.g. Keep up the excellent work and strive for greater heights…"
              style={{width:"100%",boxSizing:"border-box",padding:"9px 12px",border:`2px solid ${C.border}`,background:C.white,color:C.text,
                borderRadius:8,fontSize:13,resize:"vertical",fontFamily:"inherit",outline:"none"}}/>
          </div>
          <Inp label="Default Next Period / Resumption Date" type="date"
            value={form.default_next_term_date||""} onChange={v=>f({default_next_term_date:v})}/>
        </Card>

        {/* ── 5. Labels ── */}
        <Card>
          <div style={{fontWeight:800,fontSize:15,color:C.blue,marginBottom:4}}>Comment Labels</div>
          <p style={{color:C.muted,fontSize:12,marginTop:0,marginBottom:14}}>Heading text shown above each comment block on the printed report card.</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:5}}>Group Staff Label</label>
              <input value={rcSet.report_class_teacher_title} onChange={e=>rs("report_class_teacher_title",e.target.value)}
                placeholder="Group Staff's Comment"
                style={{width:"100%",boxSizing:"border-box",padding:"9px 12px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:13,outline:"none",background:C.white,color:C.text}}
                onFocus={e=>e.target.style.borderColor=C.orange} onBlur={e=>e.target.style.borderColor=C.border}/>
            </div>
            <div>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:5}}>Principal Label</label>
              <input value={rcSet.report_principal_title} onChange={e=>rs("report_principal_title",e.target.value)}
                placeholder="Organization Principal"
                style={{width:"100%",boxSizing:"border-box",padding:"9px 12px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:13,outline:"none",background:C.white,color:C.text}}
                onFocus={e=>e.target.style.borderColor=C.orange} onBlur={e=>e.target.style.borderColor=C.border}/>
            </div>
          </div>
        </Card>

        {/* ── 6. Period Dates ── */}
        <Card>
          <div style={{fontWeight:800,fontSize:15,color:C.blue,marginBottom:4}}>Period Dates</div>
          <p style={{color:C.muted,fontSize:12,marginTop:0,marginBottom:14}}>Printed on every report card as the official period closing and next resumption dates.</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:5}}>Period Closing Date</label>
              <input type="date" value={rcSet.term_closing_date||""} onChange={e=>rs("term_closing_date",e.target.value)}
                style={{width:"100%",boxSizing:"border-box",padding:"9px 12px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:13,outline:"none",background:C.white,color:C.text}}/>
            </div>
            <div>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:5}}>Next Period Opening Date</label>
              <input type="date" value={rcSet.term_opening_date||""} onChange={e=>rs("term_opening_date",e.target.value)}
                style={{width:"100%",boxSizing:"border-box",padding:"9px 12px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:13,outline:"none",background:C.white,color:C.text}}/>
            </div>
          </div>
        </Card>

        {/* ── 7. Appearance ── */}
        <Card>
          <div style={{fontWeight:800,fontSize:15,color:C.blue,marginBottom:4}}>Appearance</div>
          <p style={{color:C.muted,fontSize:12,marginTop:0,marginBottom:14}}>Font family, size, and footer text applied to all printed report cards.</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:12,alignItems:"end",marginBottom:14}}>
            <div>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:5}}>Report Font</label>
              <select value={rcSet.report_card_font_family} onChange={e=>rs("report_card_font_family",e.target.value)}
                style={{width:"100%",padding:"9px 12px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:13,outline:"none",background:"#fff",color:C.text}}>
                <option value="'Times New Roman',Georgia,serif">Times New Roman (classic)</option>
                <option value="Georgia,serif">Georgia</option>
                <option value="Arial,Helvetica,sans-serif">Arial</option>
                <option value="Verdana,Geneva,sans-serif">Verdana</option>
                <option value="'Trebuchet MS',sans-serif">Trebuchet MS</option>
                <option value="Cambria,Georgia,serif">Cambria</option>
              </select>
            </div>
            <div>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:5}}>Font Size %</label>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <input type="number" min={70} max={150} step={1} value={rcSet.report_card_font_size}
                  onChange={e=>rs("report_card_font_size",+e.target.value)}
                  style={{width:80,padding:"9px 10px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:13,outline:"none"}}/>
                <span style={{fontSize:11,color:C.muted,whiteSpace:"nowrap"}}>70–150</span>
              </div>
            </div>
          </div>
          <div>
            <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:5}}>Footer Text</label>
            <input value={rcSet.report_footer_text} onChange={e=>rs("report_footer_text",e.target.value)}
              placeholder="This report card is computer-generated."
              style={{width:"100%",boxSizing:"border-box",padding:"9px 12px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:13,outline:"none",background:C.white,color:C.text}}
              onFocus={e=>e.target.style.borderColor=C.orange} onBlur={e=>e.target.style.borderColor=C.border}/>
          </div>
        </Card>

        {/* ── 8. Principal Signature ── */}
        <Card>
          <div style={{fontWeight:800,fontSize:15,color:C.blue,marginBottom:4}}>Principal Signature</div>
          <p style={{color:C.muted,fontSize:12,marginTop:0,marginBottom:14}}>Upload the principal's signature image (PNG or JPG, max 300 KB). Printed on all report cards.</p>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {rcSet.principal_signature_base64&&(
              <img src={rcSet.principal_signature_base64} alt="Principal Signature"
                style={{height:56,objectFit:"contain",border:`1px solid ${C.border}`,borderRadius:6,padding:6,background:"#fff",alignSelf:"flex-start"}}/>
            )}
            <input type="file" accept="image/png,image/jpeg,image/jpg" onChange={e=>{
              const f=e.target.files?.[0]; if(!f)return;
              if(f.size>300*1024){notify("Signature image must be under 300 KB","error");return;}
              const r=new FileReader(); r.onload=ev=>rs("principal_signature_base64",ev.target.result); r.readAsDataURL(f);
            }} style={{fontSize:12,color:C.muted}}/>
            {rcSet.principal_signature_base64&&(
              <button onClick={()=>rs("principal_signature_base64","")}
                style={{fontSize:11,color:C.red,background:"none",border:"none",cursor:"pointer",textAlign:"left",padding:0,width:"fit-content"}}>
                ✕ Remove signature
              </button>
            )}
          </div>
        </Card>

        {/* ── 9. Official Stamp ── */}
        <Card>
          <div style={{fontWeight:800,fontSize:15,color:C.blue,marginBottom:4}}>Official Stamp</div>
          <p style={{color:C.muted,fontSize:12,marginTop:0,marginBottom:14}}>Choose a template or upload your own stamp. Overlaid on the principal's signature on printed cards.</p>
          {rcSet.principal_stamp_base64&&(
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
              <img src={rcSet.principal_stamp_base64} alt="Stamp"
                style={{height:72,width:72,objectFit:"contain",border:`1px solid ${C.border}`,borderRadius:8,padding:4,background:"#fff"}}/>
              <span style={{fontSize:11,color:C.muted}}>Current stamp</span>
            </div>
          )}
          <div style={{marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>Choose a template</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
              {STAMP_TEMPLATES.map(t=>{
                const previewSrc=generateStampSvg(_schoolName||"YOUR SCHOOL",t.style);
                const isActive=rcSet.principal_stamp_base64===previewSrc;
                return(
                  <div key={t.id} onClick={()=>rs("principal_stamp_base64",previewSrc)} title={t.label}
                    style={{cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4,
                      border:`2px solid ${isActive?C.orange:C.border}`,borderRadius:10,padding:6,
                      background:isActive?"#fff7f0":"#fafafa",transition:"border-color .15s,background .15s"}}>
                    <img src={previewSrc} alt={t.label} style={{width:54,height:54,objectFit:"contain"}}/>
                    <span style={{fontSize:10,fontWeight:600,color:isActive?C.orange:C.muted,whiteSpace:"nowrap"}}>{t.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>Or upload your own</div>
            <input type="file" accept="image/png,image/jpeg,image/jpg,image/svg+xml" onChange={e=>{
              const f=e.target.files?.[0]; if(!f)return;
              if(f.size>500*1024){notify("Stamp image must be under 500 KB","error");return;}
              const r=new FileReader(); r.onload=ev=>rs("principal_stamp_base64",ev.target.result); r.readAsDataURL(f);
            }} style={{fontSize:12,color:C.muted}}/>
          </div>
          {rcSet.principal_stamp_base64&&(
            <button onClick={()=>rs("principal_stamp_base64","")}
              style={{fontSize:11,color:C.red,background:"none",border:"none",cursor:"pointer",padding:"8px 0 0",display:"block"}}>
              ✕ Remove stamp
            </button>
          )}
        </Card>

      </div>

      {/* Save button at bottom too */}
      <div style={{marginTop:20,display:"flex",justifyContent:"flex-end"}}>
        <Btn onClick={save} color={C.orange} disabled={saving} style={{minWidth:180}}>
          {saving?"Saving…":"Save Settings"}
        </Btn>
      </div>
    </div>
  );
}

// ─── REPORT TEMPLATES PAGE ────────────────────────────────────────────────────
export function ReportTemplatesPage({ctx}){
  const {notify}=ctx;
  const [templates,setTemplates]=useState([]);
  const [signatures,setSignatures]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modal,setModal]=useState(false);
  const [editId,setEditId]=useState(null);
  const [saving,setSaving]=useState(false);
  const blank={
    name:"",description:"",
    show_cae:true,show_teacher_comment:true,show_principal_comment:true,
    show_parent_ack:false,show_position:true,show_next_term:true,
    default_teacher_comment:"",default_principal_comment:"",
    default_next_term_date:"",
    teacher_signature_id:"",principal_signature_id:"",
    is_default:false,card_design:"classic",
  };
  const [form,setForm]=useState(blank);
  const f=v=>setForm(p=>({...p,...v}));

  const load=()=>{
    setLoading(true);
    Promise.all([db.getReportTemplates(),db.getSignatures()]).then(([t,s])=>{
      setTemplates(t.data||[]);
      setSignatures(s.data||[]);
      setLoading(false);
    });
  };
  useEffect(load,[]);

  const openModal=(tmpl=null)=>{
    setEditId(tmpl?.id||null);
    setForm(tmpl?{
      name:tmpl.name||"",description:tmpl.description||"",
      show_cae:tmpl.show_cae!==false,show_teacher_comment:tmpl.show_teacher_comment!==false,
      show_principal_comment:tmpl.show_principal_comment!==false,
      show_parent_ack:tmpl.show_parent_ack!==false,
      show_position:tmpl.show_position!==false,show_next_term:tmpl.show_next_term!==false,
      default_teacher_comment:tmpl.default_teacher_comment||"",
      default_principal_comment:tmpl.default_principal_comment||"",
      default_next_term_date:tmpl.default_next_term_date||"",
      teacher_signature_id:tmpl.teacher_signature_id||"",
      principal_signature_id:tmpl.principal_signature_id||"",
      is_default:tmpl.is_default||false,
    }:blank);
    setModal(true);
  };

  const save=async()=>{
    if(!form.name){notify("Template name required","error");return;}
    setSaving(true);
    const payload={
      ...form,
      teacher_signature_id:form.teacher_signature_id||null,
      principal_signature_id:form.principal_signature_id||null,
      default_next_term_date:form.default_next_term_date||null,
    };
    const {error}=await db.upsertReportTemplate(payload,editId);
    setSaving(false);
    if(error)notify(error.message,"error");
    else{notify(editId?"Template updated ✓":"Template created ✓");setModal(false);load();}
  };

  const del=async(tmpl)=>{
    // Interlock: cannot delete the active default template
    if(tmpl.is_default){
      notify(`🔒 Interlock — Cannot delete "${tmpl.name}"\nReason: This is the current default report template. Deleting it would leave no template for report generation.\nFix: Set another template as default first, then delete this one.`,"error");
      return;
    }
    const __ok=await confirm({title:"Delete Template?",
      message:`Remove "${tmpl.name}"? This cannot be undone.`,confirmLabel:"Delete",danger:true});
    if(!__ok)return;
    await db.deleteReportTemplate(tmpl.id);
    notify("Deleted","warn");load();
  };

  const setDefault=async(tmpl)=>{
    await db.setDefaultTemplate(tmpl.id);
    notify(`"${tmpl.name}" set as default ✓`);load();
  };

  const SECTION_LABELS={
    show_cae:"CAE",show_teacher_comment:"Staff Comment",
    show_principal_comment:"Principal Comment",show_parent_ack:"Contact Ack",
    show_position:"Position",show_next_term:"Next Period Date",
  };

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="report-cards" size={20}/>Report Templates</h2>
          <p style={{color:C.muted,fontSize:12}}>Save and reuse report card configurations each period</p>
        </div>
        <Btn onClick={()=>openModal()} color={C.orange}>New Template</Btn>
      </div>

      {loading?<Spinner/>:(
        templates.length===0?(
          <Card style={{textAlign:"center",padding:52}}>
            <div style={{marginBottom:10}}><FileStack size={44} color={C.muted}/></div>
            <div style={{fontWeight:800,color:C.blue,fontSize:16}}>No Templates Yet</div>
            <div style={{color:C.muted,fontSize:13,marginTop:6,lineHeight:1.6}}>
              Save your report card settings as a template to reuse every period.
            </div>
            <div style={{marginTop:16}}><Btn onClick={()=>openModal()} color={C.orange}>Create First Template</Btn></div>
          </Card>
        ):(
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:14}}>
            {templates.map(tmpl=>(
              <Card key={tmpl.id} style={{border:`2px solid ${tmpl.is_default?C.orange:C.border}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:14,color:C.blue}}>{tmpl.name}</div>
                    {tmpl.description&&<div style={{fontSize:11,color:C.muted,marginTop:2}}>{tmpl.description}</div>}
                  </div>
                  {tmpl.is_default&&<Badge color={C.orange}>Default</Badge>}
                </div>

                {/* Section toggles summary */}
                <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:10}}>
                  {Object.entries(SECTION_LABELS).map(([key,label])=>(
                    <span key={key} style={{padding:"2px 8px",borderRadius:10,fontSize:10,fontWeight:700,
                      background:tmpl[key]!==false?C.greenPale:C.redPale,
                      color:tmpl[key]!==false?C.green:C.red}}>
                      {tmpl[key]!==false?"✓":"✗"} {label}
                    </span>
                  ))}
                </div>

                {/* Signatures */}
                {(tmpl.teacher_sig||tmpl.principal_sig)&&(
                  <div style={{fontSize:11,color:C.muted,marginBottom:10}}>
                    {tmpl.teacher_sig&&<div>Staff sig: <b>{tmpl.teacher_sig.name}</b></div>}
                    {tmpl.principal_sig&&<div>Principal sig: <b>{tmpl.principal_sig.name}</b></div>}
                  </div>
                )}

                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <Btn xs onClick={()=>openModal(tmpl)} color={C.blue} outline>Edit</Btn>
                  {!tmpl.is_default&&<Btn xs onClick={()=>setDefault(tmpl)} color={C.orange} outline>Set Default</Btn>}
                  <Btn xs onClick={()=>del(tmpl)} color={C.red} outline><Trash2 size={13}/></Btn>
                </div>
              </Card>
            ))}
          </div>
        )
      )}

      {modal&&(
        <Modal title={editId?"Edit Template":"New Report Template"} onClose={()=>setModal(false)} width={580}>
          <Inp label="Template Name *" value={form.name} onChange={v=>f({name:v})} placeholder="e.g. Standard Period Report"/>
          <Inp label="Description" value={form.description} onChange={v=>f({description:v})} placeholder="Optional description"/>


          {/* Section toggles */}
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>
              Section Visibility
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[
                {key:"show_cae",label:"Character & Affective Evaluation"},
                {key:"show_teacher_comment",label:"Group Staff's Comment"},
                {key:"show_principal_comment",label:"Principal's Comment"},
                {key:"show_position",label:"Member Position"},
                {key:"show_next_term",label:"Next Period Date"},
              ].map(({key,label})=>(
                <div key={key} onClick={()=>f({[key]:!form[key]})}
                  style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:8,cursor:"pointer",
                    background:form[key]?C.greenPale:C.offWhite,border:`2px solid ${form[key]?C.green:C.border}`,transition:"all .15s"}}>
                  <div style={{width:18,height:18,borderRadius:3,background:form[key]?C.green:"#cbd5e1",
                    display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    {form[key]&&<span style={{color:"#fff",fontSize:11,fontWeight:900}}>✓</span>}
                  </div>
                  <span style={{fontSize:11,fontWeight:600,color:form[key]?C.green:C.muted}}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Default comments */}
          <div style={{marginBottom:12}}>
            <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>
              Default Staff Comment
            </label>
            <textarea value={form.default_teacher_comment} onChange={e=>f({default_teacher_comment:e.target.value})}
              rows={2} placeholder="Leave blank if you want to fill in each period"
              style={{width:"100%",padding:"9px 12px",border:`2px solid ${C.border}`,background:C.white,color:C.text,borderRadius:8,fontSize:13,resize:"vertical",fontFamily:"inherit",outline:"none"}}/>
          </div>
          <div style={{marginBottom:12}}>
            <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>
              Default Principal Comment
            </label>
            <textarea value={form.default_principal_comment} onChange={e=>f({default_principal_comment:e.target.value})}
              rows={2} placeholder="Leave blank if you want to fill in each period"
              style={{width:"100%",padding:"9px 12px",border:`2px solid ${C.border}`,background:C.white,color:C.text,borderRadius:8,fontSize:13,resize:"vertical",fontFamily:"inherit",outline:"none"}}/>
          </div>

          <Inp label="Default Next Period Date" type="date" value={form.default_next_term_date||""} onChange={v=>f({default_next_term_date:v})}/>

          {/* Signatures */}
          {signatures.length>0&&(
            <div style={{marginBottom:12}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <Sel label="Staff Signature" value={form.teacher_signature_id||""} onChange={v=>f({teacher_signature_id:v})}
                  options={[{value:"",label:"— None —"},...signatures.map(s=>({value:s.id,label:s.name}))]}/>
                <Sel label="Principal Signature" value={form.principal_signature_id||""} onChange={v=>f({principal_signature_id:v})}
                  options={[{value:"",label:"— None —"},...signatures.map(s=>({value:s.id,label:s.name}))]}/>
              </div>
            </div>
          )}

          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
            <label style={{fontSize:13,fontWeight:600,color:C.text}}>Set as Default Template</label>
            <button onClick={()=>f({is_default:!form.is_default})}
              style={{width:48,height:26,borderRadius:13,border:"none",cursor:"pointer",
                background:form.is_default?C.orange:"#cbd5e1",position:"relative",transition:"all .2s"}}>
              <div style={{position:"absolute",top:3,left:form.is_default?24:3,width:20,height:20,
                borderRadius:"50%",background:"#fff",transition:"all .2s",boxShadow:"0 1px 4px rgba(0,0,0,.2)"}}/>
            </button>
          </div>

          <div style={{display:"flex",gap:10}}>
            <Btn onClick={save} color={C.orange} disabled={saving} style={{flex:1}}>
              {saving?"Saving…":"Save Template"}
            </Btn>
            <Btn onClick={()=>setModal(false)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─ openReportCardPrintWindow moved to services/reportCards/generator.js

// AttendancePage -> src/pages/schedule.jsx

// MailComposePage -> src/pages/comms.jsx
// RecycleBinPage -> src/pages/tools.jsx

// ─── NOTIFICATION BELL ────────────────────────────────────────────────────────
