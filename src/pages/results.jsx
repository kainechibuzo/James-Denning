/**
 * Results domain: ResultsAdminPage, ResultsTeachPage, MyResultsPage, MyClassesPage
 */
import React, { useState, useEffect, useMemo } from "react";
import {
  Award, BarChart3, BookOpen, Check, ClipboardList, Download, Edit, FileText,
  Filter, History, Lock, Phone, Save, School, Search, Settings,
  Target, Upload, X,
  ShieldCheck, BarChart2, CheckCircle2, Clock, AlertCircle, MinusCircle, ChevronDown,
} from "lucide-react";
import { db } from "../supabaseClient.js";
import { evaluateArithmeticExpression } from "../utils/arithmetic.js";
import { C } from "../config/theme.js";
import { useSection } from "../contexts/section.jsx";
import { useConfirm } from "../contexts/confirm.jsx";
import {
  Card, Btn, Badge, Inp, Sel, Modal, StatCard, Th, TRow, Spinner, AppIcon,
} from "../components/ui.jsx";
import {
  fullName, fmt, getGrade, getRemark, gradeCol as _gradeColPure,
} from "../utils/grades.js";
import { downloadPDF, openHtmlDoc, pdfName } from "../services/pdf/capture.js";
import { openReportCardPrintWindow } from "../services/reportCards/generator.js";

const gradeCol = g => _gradeColPure(g, C);

export function ResultsAdminPage({ctx}){
  const {notify,selectedSection}=ctx;
  const [classes,setClasses]=useState([]);
  const [subjects,setSubjects]=useState([]);
  const [sessions,setSessions]=useState([]);
  const [terms,setTerms]=useState([]);
  const [students,setStudents]=useState([]);
  const [selClass,setSelClass]=useState("");
  const [selStu,setSelStu]=useState("");
  const [selSession,setSelSession]=useState("");
  const [selTerm,setSelTerm]=useState("");
  const [stuSearch,setStuSearch]=useState("");
  const [scores,setScores]=useState({});
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);
  const [settings,setSettings]=useState({});

  useEffect(()=>{
    Promise.all([
      db.getClasses(selectedSection?.id),
      db.getSessions(),
      db.getTerms(),
      db.getSettings(),
    ]).then(([c,s,t,st])=>{
      const m={};(st.data||[]).forEach(r=>{m[r.key]=r.value;});
      setSettings(m);
      setClasses(c.data||[]);
      const ss=s.data||[];
      const ts=t.data||[];
      setSessions(ss);
      setTerms(ts);
      const activeSes=ss.find(s=>s.is_active)||ss[0];
      const activeTer=ts.find(t=>t.is_active&&t.session_id===activeSes?.id)||ts.filter(t=>t.session_id===activeSes?.id)[0];
      if(activeSes)setSelSession(String(activeSes.id));
      if(activeTer)setSelTerm(String(activeTer.id));
    });
  },[selectedSection]);

  useEffect(()=>{
    if(!selClass)return;
    let cancelled=false;
    db.getStudents().then(({data})=>{
      if(!cancelled)setStudents((data||[]).filter(s=>s.class_id===+selClass&&(s.status||"active")==="active"));
    }).catch(err=>console.error('[ResultsAdmin] getStudents failed:',err));
    db.getClassSubjects(+selClass).then(({data})=>{
      if(!cancelled)setSubjects((data||[]).map(cs=>cs.section_subjects).filter(Boolean));
    }).catch(err=>console.error('[ResultsAdmin] getClassSubjects failed:',err));
    return()=>{cancelled=true;};
  },[selClass,classes]);

  useEffect(()=>{
    if(!selStu||!selClass||!selTerm||!selSession)return;
    let cancelled=false;
    db.getResults({student_id:selStu,class_id:+selClass,term_id:+selTerm,session_id:+selSession}).then(({data})=>{
      if(!cancelled){
        const m={};
        (data||[]).forEach(r=>{m[r.subject_id]={ca:r.ca_score??'',exam:r.exam_score??'',id:r.id};});
        setScores(m); setSaved(false);
      }
    }).catch(err=>console.error('[ResultsAdmin] getResults failed:',err));
    return()=>{cancelled=true;};
  },[selStu,selClass,selTerm,selSession]);

  const upd=(sid,field,val)=>{setScores(p=>({...p,[sid]:{...p[sid],[field]:val}}));setSaved(false);};

  const save=async()=>{
    if(!selStu||!selClass||!selTerm||!selSession){notify("Select group, member, cycle, and period","error");return;}
    setSaving(true);
    const records=subjects.map(s=>{
      const r=scores[s.id]||{};
      return{
        student_id:selStu,class_id:+selClass,subject_id:s.id,
        term_id:+selTerm,session_id:+selSession,
        ca_score:r.ca!==''?+r.ca:null,
        exam_score:r.exam!==''?+r.exam:null,
        total_score:(r.ca!==''&&r.exam!=='')?+r.ca+ +r.exam:null,
      };
    }).filter(r=>r.ca_score!==null||r.exam_score!==null)
      .filter(r=>r.subject_id!=null&&!Number.isNaN(+r.subject_id)); // drop any row with unresolved subject_id (DB NOT NULL guard)
    const {error}=await db.upsertResult(records);
    setSaving(false);
    if(error)notify(error.message,"error");
    else{notify("Results saved ✓");setSaved(true);}
  };

  const curStu=students.find(s=>s.id===selStu);
  const filterTerms=terms.filter(t=>t.session_id===+selSession);

  return(
    <div>
      <div style={{marginBottom:18}}>
        <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="results" size={20}/>Result Management</h2>
        <p style={{color:C.muted,fontSize:12}}>Enter CA and Exam scores per member</p>
      </div>
      <Card style={{marginBottom:16}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:14}}>
          <Sel label="Cycle" value={selSession} onChange={v=>{setSelSession(v);setSelTerm("");}}
            options={[{value:"",label:"Select cycle…"},...sessions.map(s=>({value:s.id,label:s.name}))]}/>
          <Sel label="Period" value={selTerm} onChange={setSelTerm} disabled={!selSession}
            options={[{value:"",label:"Select period…"},...filterTerms.map(t=>({value:t.id,label:t.name}))]}/>
          <Sel label="Group" value={selClass} onChange={v=>{setSelClass(v);setSelStu("");setScores({});setStuSearch("");}}
            options={[{value:"",label:"Select group…"},...classes.map(c=>({value:c.id,label:c.name}))]}/>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:4}}>Member</div>
            <div style={{position:"relative",marginBottom:4}}>
              <Search size={12} style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",color:C.muted,pointerEvents:"none"}}/>
              <input value={stuSearch} onChange={e=>setStuSearch(e.target.value)} placeholder="Search member…" disabled={!selClass}
                style={{width:"100%",boxSizing:"border-box",paddingLeft:26,paddingRight:8,paddingTop:6,paddingBottom:6,
                  borderRadius:8,border:`1px solid ${C.border}`,fontSize:12,color:C.text,background:!selClass?C.offWhite:"#fff",
                  outline:"none"}}/>
            </div>
            <select value={selStu} onChange={e=>setSelStu(e.target.value)} disabled={!selClass}
              style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,
                fontSize:12,color:selStu?C.text:C.muted,background:!selClass?C.offWhite:"#fff",cursor:"pointer"}}>
              <option value="">Select member…</option>
              {students.filter(s=>{const q=stuSearch.toLowerCase();return!q||fullName(s).toLowerCase().includes(q)||String(s.id).toLowerCase().includes(q);})
                .map(s=><option key={s.id} value={s.id}>{fullName(s)} ({s.id})</option>)}
            </select>
          </div>
        </div>
      </Card>

      {selStu?(
        <Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
            marginBottom:14,paddingBottom:12,borderBottom:`2px solid ${C.border}`}}>
            <div>
              <div style={{fontWeight:900,fontSize:15,color:C.blue}}>{curStu?fullName(curStu):""}</div>
              <div style={{fontSize:11,color:C.muted}}>{curStu?.id}</div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              {saved&&<span style={{fontSize:12,color:C.green,fontWeight:700}}>Saved</span>}
              <Btn onClick={save} color={C.green} disabled={saving}>{saving?"Saving…":"Save Results"}</Btn>
            </div>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              {(()=>{const caM=+(settings.result_ca_max||40);const exM=+(settings.result_exam_max||60);return(
              <Th cols={["#","Category",`CA (max ${caM})`,`Exam (max ${exM})`,`Total (${caM+exM})`,"Grade","Remark"]}/>
              );})()}
              <tbody>
                {(()=>{const caM=+(settings.result_ca_max||40);const exM=+(settings.result_exam_max||60);return subjects.map((subj,i)=>{
                  const r=scores[subj.id]||{ca:"",exam:""};
                  const tot=r.ca!==''&&r.exam!==''?+r.ca+ +r.exam:'';
                  const g=getGrade(tot); const gc=gradeCol(g);
                  return(
                    <TRow key={subj.id} i={i} cells={[
                      <span style={{color:C.light,fontSize:11}}>{i+1}</span>,
                      <strong>{subj.name}</strong>,
                      <input type="number" min="0" max={caM} value={r.ca??""} onChange={e=>upd(subj.id,"ca",e.target.value)}
                        style={{width:78,padding:"6px 9px",border:`2px solid ${r.ca!==''?C.orange:C.border}`,
                          borderRadius:7,fontSize:13,textAlign:"center",outline:"none"}} placeholder="CA"/>,
                      <input type="number" min="0" max={exM} value={r.exam??""} onChange={e=>upd(subj.id,"exam",e.target.value)}
                        style={{width:78,padding:"6px 9px",border:`2px solid ${r.exam!==''?C.blue:C.border}`,
                          borderRadius:7,fontSize:13,textAlign:"center",outline:"none"}} placeholder="Exam"/>,
                      tot!==''?<span style={{fontWeight:900,fontSize:14}}>{tot}</span>:"—",
                      <Badge color={gc}>{g}</Badge>,
                      <span style={{color:gc,fontWeight:600,fontSize:12}}>{getRemark(tot)}</span>,
                    ]}/>
                  );
                });})()}
              </tbody>
            </table>
          </div>
        </Card>
      ):(
        <Card style={{textAlign:"center",padding:48}}>
          <div style={{marginBottom:10}}><FileText size={44} color={C.muted}/></div>
          <div style={{fontWeight:800,color:C.blue,fontSize:16,marginBottom:5}}>Select Filters Above</div>
          <div style={{color:C.muted,fontSize:13}}>Choose cycle, period, group and member to enter results</div>
        </Card>
      )}
    </div>
  );
}

// ─── RESULTS TEACHER ─────────────────────────────────────────────────────────
// CAE-aware: dynamically builds score inputs from the section's cae_structure
export function ResultsTeachPage({ctx}){
  const {notify,user,canAccess}=ctx;
  const confirm=useConfirm();
  // "by-subject" = all students for one subject | "by-student" = all subjects for one student
  const [inputMode,setInputMode]=useState("by-subject");

  // Shared selectors
  const [classes,setClasses]=useState([]);
  const [subjects,setSubjects]=useState([]);
  const [sessions,setSessions]=useState([]);
  const [terms,setTerms]=useState([]);
  const [students,setStudents]=useState([]);
  const [selClass,setSelClass]=useState("");
  const [selSession,setSelSession]=useState("");
  const [selTerm,setSelTerm]=useState("");
  const [teacherAssignments,setTeacherAssignments]=useState([]);
  const [caeStructure,setCaeStructure]=useState(null);
  const [caeComponents,setCaeComponents]=useState([]);
  const [settings,setSettings]=useState({});
  const [saving,setSaving]=useState(false);
  const [approval,setApproval]=useState(null);
  const [approvingEA,setApprovingEA]=useState(false);
  const [downloadingPDF,setDownloadingPDF]=useState(false);

  // By-subject mode
  const [selSubj,setSelSubj]=useState("");
  const [scores,setScores]=useState({});   // {stuId:{compName:val}}

  // By-student mode
  const [selStudent,setSelStudent]=useState("");
  const [studentScores,setStudentScores]=useState({}); // {subjId:{compName:val}}
  const [stuSearch,setStuSearch]=useState("");

  // Category completion matrix
  const [subjDone,setSubjDone]=useState({}); // {subjectId: countOfStudentsWithResults}

  // Section clear
  const [selClearSection,setSelClearSection]=useState("");
  // Category clear
  const [selClearSubjClass,setSelClearSubjClass]=useState("");
  const [selClearSubjId,setSelClearSubjId]=useState("");
  const [clearSubjOptions,setClearSubjOptions]=useState([]);

  // Bulk result upload
  const [bulkResModal,setBulkResModal]=useState(false);
  const [bulkResFile,setBulkResFile]=useState(null);
  const [bulkResParsed,setBulkResParsed]=useState([]); // [{classId,className,sectionId,rows:[{stuId,subjectName,scoreMap,_line}]}]
  const [bulkResErrors,setBulkResErrors]=useState([]);
  const [bulkResWarnings,setBulkResWarnings]=useState([]);
  const [bulkResSaving,setBulkResSaving]=useState(false);
  const [bulkResProgress,setBulkResProgress]=useState({done:0,total:0,failed:0,merged:0,isDone:false});

  // ── Load sessions/terms/assignments on mount ─────────────────────────────
  useEffect(()=>{
    const {user}=ctx;
    Promise.all([
      db.getSessions(),db.getTerms(),
      user.teacher_db_id?db.getTeacherSubjects(user.teacher_db_id):Promise.resolve({data:[]}),
      db.getSettings(),
    ]).then(([s,t,ts,st])=>{
      const sm={};(st.data||[]).forEach(r=>{sm[r.key]=r.value;});setSettings(sm);
      const ss=s.data||[]; const tsData=t.data||[];
      setSessions(ss); setTerms(tsData);
      const aSes=ss.find(x=>x.is_active)||ss[0];
      const aTer=tsData.find(x=>x.is_active&&x.session_id===aSes?.id)||tsData.filter(x=>x.session_id===aSes?.id)[0];
      if(aSes)setSelSession(String(aSes.id));
      if(aTer)setSelTerm(String(aTer.id));
      const assignments=ts.data||[];
      setTeacherAssignments(assignments);
      db.getClasses().then(({data:cls})=>{
        if(ctx.role==="admin"){
          setClasses(cls||[]);
        } else {
          const classIds=[...new Set(assignments.map(a=>a.class_id))];
          setClasses((cls||[]).filter(c=>classIds.includes(c.id)));
        }
      });
    });
  },[]);

  // ── Load students + subjects when class changes ──────────────────────────
  useEffect(()=>{
    if(!selClass)return;
    const cls=classes.find(c=>c.id===+selClass);
    if(!cls)return;
    let cancelled=false;
    db.getStudents().then(({data})=>{
      if(!cancelled)setStudents((data||[]).filter(s=>s.class_id===+selClass&&(s.status||"active")==="active"));
    });
    if(cls.section_id){
      db.getClassSubjects(+selClass).then(({data})=>{
        if(cancelled)return;
        let filtered=(data||[]).map(cs=>cs.section_subjects).filter(Boolean);
        if(ctx.role!=="admin"){
          const allowedIds=new Set(teacherAssignments.filter(a=>a.class_id===+selClass).map(a=>a.subject_id));
          filtered=filtered.filter(s=>allowedIds.has(s.id));
        }
        setSubjects(filtered);
        if(filtered[0])setSelSubj(String(filtered[0].id));
        else setSelSubj("");
      });
      db.getCaeStructureBySectionId(cls.section_id).then(({data})=>{
        if(cancelled)return;
        if(data){
          setCaeStructure(data);
          db.getCaeComponents(data.id).then(({data:comps})=>{if(!cancelled)setCaeComponents(comps||[]);});
        } else { setCaeStructure(null); setCaeComponents([]); }
      });
    }
    setSelStudent(""); setScores({}); setStudentScores({});
    return()=>{cancelled=true;};
  },[selClass,classes]);

  // ── Load subject completion matrix when class+term+session change ────────
  useEffect(()=>{
    if(!selClass||!selTerm||!selSession){setSubjDone({});return;}
    db.getResultsCompleteness(+selClass,+selTerm,+selSession).then(({data})=>{
      const m={};
      (data||[]).forEach(r=>{m[r.subject_id]=(m[r.subject_id]||0)+1;});
      setSubjDone(m);
    });
  },[selClass,selTerm,selSession]);

  // ── Load approval state when context changes ─────────────────────────────
  useEffect(()=>{
    if(!selClass||!selTerm||!selSession)return;
    let cancelled=false;
    db.getResultApproval(+selClass,+selTerm,+selSession).then(({data})=>{
      if(!cancelled)setApproval(data||null);
    });
    return()=>{cancelled=true;};
  },[selClass,selTerm,selSession]);

  // ── EA Approve / Revoke ───────────────────────────────────────────────────
  const handleEA=async()=>{
    if(!selClass||!selTerm||!selSession)return;
    const isApproved=approval?.ea_status==="approved";
    if(!isApproved){
      // Block approval if results are not complete
      setApprovingEA(true);
      const [cmpRes,subRes]=await Promise.all([
        db.getResultsCompleteness(+selClass,+selTerm,+selSession),
        db.getClassSubjectIds(+selClass),
      ]);
      const expectedSubjectIds=(subRes.data||[]).map(cs=>cs.section_subject_id);
      if(!expectedSubjectIds.length){
        notify("No categories assigned to this group. Cannot approve.","error");
        setApprovingEA(false);return;
      }
      const resultRows=cmpRes.data||[];
      const byStudent={};
      resultRows.forEach(r=>{
        if(+r.total_score > 0){
          if(!byStudent[r.student_id])byStudent[r.student_id]=new Set();
          byStudent[r.student_id].add(r.subject_id);
        }
      });
      const incomplete=students.filter(s=>(s.status||"active")==="active").some(stu=>{
        const done=byStudent[stu.id]||new Set();
        return expectedSubjectIds.some(sid=>!done.has(sid));
      });
      if(incomplete){
        notify("Results must be complete before approval. Some members have missing scores.","error");
        setApprovingEA(false);return;
      }
      await db.approveEA(+selClass,+selTerm,+selSession,ctx.user?.supabase_uid||null);
      notify("✅ Educator Approval granted");
    } else {
      setApprovingEA(true);
      await db.revokeEA(+selClass,+selTerm,+selSession);
      notify("EA revoked — staff can edit again","warn");
    }
    const {data}=await db.getResultApproval(+selClass,+selTerm,+selSession);
    setApproval(data||null);
    setApprovingEA(false);
  };

  // ── Download PDF (by-student mode) ──────────────────────────────────────
  const downloadTeacherPDF=async()=>{
    if(!selStudent||!selClass||!selTerm||!selSession){notify("Select cycle, period, group and member first","error");return;}
    const stu=students.find(s=>s.id===selStudent);
    if(!stu){notify("Member not found","error");return;}
    setDownloadingPDF(true);
    try{
      const cls=classes.find(c=>c.id===+selClass);
      const term=terms.find(t=>t.id===+selTerm);
      const session=sessions.find(s=>s.id===+selSession);
      const [rRes,caeRes,traitsRes,ratingsRes,pubRes,gsRes]=await Promise.all([
        db.getResults({student_id:stu.id,class_id:+selClass,term_id:+selTerm,session_id:+selSession}),
        db.getCaeResults({student_id:stu.id,class_id:+selClass,term_id:+selTerm,session_id:+selSession}),
        db.getCaeTraits(),
        db.getCaeRatings(),
        db.getReportPublish({class_id:+selClass,term_id:+selTerm,session_id:+selSession}),
        cls?.section_id?db.getGradingSchema(cls.section_id,"grades"):Promise.resolve({data:[]}),
      ]);
      const pubInfo=(pubRes.data||[])[0]||null;
      const gs=gsRes.data||[];
      const effectiveSettings={...settings};
      if(cls?.section_id){
        const {data:caeStr}=await db.getCaeStructureBySectionId(cls.section_id);
        if(caeStr){
          const {data:comps}=await db.getCaeComponents(caeStr.id);
          const lit=(comps||[]).filter(c=>!c.is_total_score&&c.mode==='literal');
          if(lit.length>=2){
            const eMax=parseFloat(lit[lit.length-1].value_or_formula)||0;
            const cMax=lit.slice(0,-1).reduce((s,c)=>s+(parseFloat(c.value_or_formula)||0),0);
            effectiveSettings.result_ca_max=String(cMax);
            effectiveSettings.result_exam_max=String(eMax);
            effectiveSettings._caeComps=lit;
          }
        }
      }
      const {data:tmplData}=await db.getReportTemplates();
      const defTmpl=(tmplData||[]).find(t=>t.is_default)||(tmplData||[])[0]||{};
      const resolvedOpts=pubInfo?{
        show_cae:pubInfo.show_cae!==false,
        show_teacher_comment:pubInfo.show_teacher_comment!==false,
        show_principal_comment:pubInfo.show_principal_comment!==false,
        show_parent_ack:pubInfo.show_parent_ack!==false,
        show_position:pubInfo.show_position!==false,
        show_next_term:pubInfo.show_next_term!==false,
        show_attendance:pubInfo.show_attendance!==false,
        card_design:pubInfo.card_design||"classic",
        card_spacing:pubInfo.card_spacing||"normal",
      }:{
        show_cae:defTmpl.show_cae!==false,
        show_teacher_comment:defTmpl.show_teacher_comment!==false,
        show_principal_comment:defTmpl.show_principal_comment!==false,
        show_parent_ack:defTmpl.show_parent_ack!==false,
        show_position:defTmpl.show_position!==false,
        show_next_term:defTmpl.show_next_term!==false,
        show_attendance:defTmpl.show_attendance!==false,
        card_design:defTmpl.card_design||"classic",
        card_spacing:defTmpl.card_spacing||"normal",
      };
      const allData={[stu.id]:{results:rRes.data||[],caeResults:caeRes.data||[]}};
      const rcHtml=openReportCardPrintWindow(
        [stu],allData,cls,term,session,
        gs,traitsRes.data||[],ratingsRes.data||[],
        pubInfo,effectiveSettings,
        settings.portal_logo_base64||null,
        pubInfo?.class_teacher_comment||"",
        pubInfo?.principal_comment||"",
        pubInfo?.next_term_begins||"",
        resolvedOpts,null,null,
        null,true,true);
      const stuName=fullName(stu);
      const filename=pdfName(stuName,"REPORT",term?.name||"",session?.name||"");
      notify("Generating PDF…","success");
      openHtmlDoc(rcHtml,{title:filename,showPDF:ctx.showPDF});
    }catch(e){console.error("[downloadTeacherPDF]",e);notify("Failed to generate PDF: "+e.message,"error");}
    setDownloadingPDF(false);
  };

  // ── Load saved scores — BY SUBJECT mode ─────────────────────────────────
  useEffect(()=>{
    if(inputMode!=="by-subject"||!selClass||!selSubj||!selTerm||!selSession)return;
    db.getResults({class_id:+selClass,term_id:+selTerm,session_id:+selSession}).then(({data})=>{
      const m={};
      (data||[]).filter(r=>r.subject_id===+selSubj).forEach(r=>{
        const bd=r.component_scores?JSON.parse(r.component_scores):null;
        m[r.student_id]=bd||{_ca:r.ca_score??'',_exam:r.exam_score??''};
      });
      setScores(m);
    });
  },[inputMode,selClass,selSubj,selTerm,selSession]);

  // ── Load saved scores — BY MEMBER mode ─────────────────────────────────
  useEffect(()=>{
    if(inputMode!=="by-student"||!selClass||!selStudent||!selTerm||!selSession)return;
    db.getResults({class_id:+selClass,term_id:+selTerm,session_id:+selSession}).then(({data})=>{
      const m={};
      (data||[]).filter(r=>r.student_id===selStudent).forEach(r=>{
        const bd=r.component_scores?JSON.parse(r.component_scores):null;
        m[r.subject_id]=bd||{_ca:r.ca_score??'',_exam:r.exam_score??''};
      });
      setStudentScores(m);
    });
  },[inputMode,selClass,selStudent,selTerm,selSession]);

  // ── Download result template (class or section) ───────────────────────────
  const downloadResultTemplate=async(scope='class')=>{
    if(!selClass||!selTerm||!selSession){notify("Select cycle, period and group first","error");return;}
    const cls=classes.find(c=>c.id===+selClass);
    const term=terms.find(t=>t.id===+selTerm);
    const session=sessions.find(s=>s.id===+selSession);
    notify(`Generating ${scope==='section'?'section':'class'} template…`);
    const wb=XLSX.utils.book_new();
    // Shared styles
    const titleSty={font:{bold:true,sz:14,color:{rgb:"FFFFFF"}},fill:{fgColor:{rgb:"1A4FA0"}},alignment:{horizontal:"center",vertical:"center"}};
    const metaSty={font:{bold:true,sz:10,color:{rgb:"1A4FA0"}},fill:{fgColor:{rgb:"EFF6FF"}}};
    const hdrSty={font:{bold:true,sz:10,color:{rgb:"FFFFFF"}},fill:{fgColor:{rgb:"E8560A"}},alignment:{horizontal:"center",vertical:"center",wrapText:true}};
    const fixedSty={font:{sz:10,color:{rgb:"374151"}},fill:{fgColor:{rgb:"F8FAFC"}}};
    const inputSty={fill:{fgColor:{rgb:"FFFBEB"}},alignment:{horizontal:"center"}};

    const buildSheet=(wsData,compCount,sheetType)=>{
      // sheetType: 'subject' (no Category col) | 'class' (has Category col at index 2)
      const NCOLS=wsData[2].length;
      const ws=XLSX.utils.aoa_to_sheet(wsData);
      ws["!merges"]=[{s:{r:0,c:0},e:{r:0,c:NCOLS-1}}];
      ws["!rows"]=[{hpt:28},{hpt:20},{hpt:30}];
      if(ws["A1"])ws["A1"].s=titleSty;
      for(let col=0;col<NCOLS;col++){
        const m=XLSX.utils.encode_cell({r:1,c:col}); if(ws[m])ws[m].s=metaSty;
        const h=XLSX.utils.encode_cell({r:2,c:col}); if(ws[h])ws[h].s=hdrSty;
      }
      const fixedCount=sheetType==='subject'?2:3; // ID+Name | ID+Name+Category
      for(let r=3;r<wsData.length;r++){
        for(let col=0;col<NCOLS;col++){
          const a=XLSX.utils.encode_cell({r,c:col});
          if(!ws[a])ws[a]={v:"",t:"s"};
          ws[a].s=(col>=fixedCount&&col<fixedCount+compCount)?inputSty:fixedSty;
        }
      }
      return ws;
    };

    const safeName=(n)=>n.replace(/[\/\\?*\[\]:]/g,"").substring(0,31);

    // Fetch shared data for selected class's section (students filtered to this class only)
    const [stuRes,subjRes,caeStrRes]=await Promise.all([
      db.getStudents(null,{class_id:cls.id}),
      db.getClassSubjects(cls.id),
      db.getCaeStructureBySectionId(cls.section_id),
    ]);
    let litComps=[];
    if(caeStrRes.data){
      const {data:comps}=await db.getCaeComponents(caeStrRes.data.id);
      litComps=(comps||[]).filter(c=>!c.is_total_score&&c.mode==='literal');
    }
    const compHdrs=litComps.length>=2
      ? litComps.map(c=>`${c.component_name} (max ${c.value_or_formula})`)
      : [`CA (max ${settings.result_ca_max||40})`,`Exam (max ${settings.result_exam_max||60})`];

    // Locked-total cell style (blue tint, bold — signals non-editable)
    const totalSty={font:{bold:true,sz:10,color:{rgb:"1A4FA0"}},fill:{fgColor:{rgb:"DBEAFE"}},alignment:{horizontal:"center"}};

    // Helper: add data-validation (0..max) + SUM formula + locked style for a sheet
    const applyValidationAndFormulas=(ws,scoreStartCol,compCount,dataRowStart,dataRowEnd)=>{
      // SUM formula in Total column (scoreStartCol+compCount)
      const totalColIdx=scoreStartCol+compCount;
      const firstScoreColLetter=XLSX.utils.encode_col(scoreStartCol);
      const lastScoreColLetter=XLSX.utils.encode_col(scoreStartCol+compCount-1);
      for(let r=dataRowStart;r<=dataRowEnd;r++){
        const cellAddr=XLSX.utils.encode_cell({r,c:totalColIdx});
        ws[cellAddr]={f:`SUM(${firstScoreColLetter}${r+1}:${lastScoreColLetter}${r+1})`,t:"n",s:totalSty};
      }
      // Note: xlsx-js-style does not emit dataValidations to the file.
      // Score range enforcement is handled server-side in saveBulkResults.
    };

    if(scope==='class'){
      // ── CLASS: one sheet per subject ────────────────────────────────────────
      const classStudents=(stuRes.data||[])
        .filter(s=>(s.status||"active")==="active")
        .sort((a,b)=>([a.last_name,a.first_name].join(" ")).localeCompare([b.last_name,b.first_name].join(" ")));
      const classSubjects=(subjRes.data||[]).map(cs=>cs.section_subjects).filter(Boolean);
      if(!classSubjects.length){notify("No categories assigned to this group","error");return;}
      for(const subj of classSubjects){
        const NCOLS=2+compHdrs.length+1; // ID, Name, comps, Total
        const titleRow=[`${db._schoolName||"Organization"} — ${cls.name} Result Template`,...Array(NCOLS-1).fill("")];
        const metaRow=[`Group: ${cls.name}`,`Cycle: ${session?.name}`,`Period: ${term?.name}`,`Category: ${subj.name}`,...Array(Math.max(0,NCOLS-4)).fill("")];
        const hdrRow=["Member ID","Member Name",...compHdrs,"Total"];
        const dataRows=classStudents.map(stu=>{
          const nm=fullName(stu);
          return[stu.id,nm,...Array(compHdrs.length).fill(""),0];
        });
        const wsData=[titleRow,metaRow,hdrRow,...dataRows];
        const ws=buildSheet(wsData,compHdrs.length,'subject');
        ws["!cols"]=[{wch:13},{wch:26},...compHdrs.map(()=>({wch:22})),{wch:9}];
        // Scores start at col 2; data rows are 3..wsData.length-1
        applyValidationAndFormulas(ws,2,compHdrs.length,3,wsData.length-1);
        XLSX.utils.book_append_sheet(wb,ws,safeName(subj.name));
      }
    } else {
      // ── SECTION: one sheet per class (rows = student × subject) ────────────
      const targetClasses=classes.filter(c=>c.section_id===cls.section_id);
      for(const c of targetClasses){
        const [cStuRes,cSubjRes]=await Promise.all([db.getStudents(null,{class_id:c.id}),db.getClassSubjects(c.id)]);
        const classStudents=(cStuRes.data||[])
          .filter(s=>(s.status||"active")==="active")
          .sort((a,b)=>([a.last_name,a.first_name].join(" ")).localeCompare([b.last_name,b.first_name].join(" ")));
        const classSubjects=(cSubjRes.data||[]).map(cs=>cs.section_subjects).filter(Boolean);
        if(!classSubjects.length){notify(`No subjects assigned to ${c.name} — skipped in template`,"warn");continue;}
        const NCOLS=3+compHdrs.length+1; // ID, Name, Category, comps, Total
        const titleRow=[`${db._schoolName||"Organization"} — ${c.name} Result Template`,...Array(NCOLS-1).fill("")];
        const metaRow=[`Group: ${c.name}`,`Cycle: ${session?.name}`,`Period: ${term?.name}`,...Array(NCOLS-3).fill("")];
        const hdrRow=["Member ID","Member Name","Category",...compHdrs,"Total"];
        const dataRows=[];
        for(const stu of classStudents){
          const nm=fullName(stu);
          for(const subj of classSubjects)
            dataRows.push([stu.id,nm,subj.name,...Array(compHdrs.length).fill(""),0]);
        }
        const wsData=[titleRow,metaRow,hdrRow,...dataRows];
        const ws=buildSheet(wsData,compHdrs.length,'class');
        ws["!cols"]=[{wch:13},{wch:26},{wch:28},...compHdrs.map(()=>({wch:22})),{wch:9}];
        // Scores start at col 3; data rows are 3..wsData.length-1
        applyValidationAndFormulas(ws,3,compHdrs.length,3,wsData.length-1);
        XLSX.utils.book_append_sheet(wb,ws,safeName(c.name));
      }
    }
    const fname=`Results_${scope==='section'?(cls.sections?.name||cls.name):cls.name}_${session?.name}_${term?.name}`.replace(/[\s/\\]/g,"-")+".xlsx";
    XLSX.writeFile(wb,fname);
    notify("Template downloaded ✓");
  };

  // ── Parse uploaded Excel result file ─────────────────────────────────────
  const parseBulkResultFile=async(file)=>{
    setBulkResFile(file);setBulkResErrors([]);setBulkResWarnings([]);setBulkResParsed([]);
    try{
      const ab=await file.arrayBuffer();
      const wb=XLSX.read(ab,{type:"array"});
      const allParsed=[];const errors=[];
      for(const sheetName of wb.SheetNames){
        const ws=wb.Sheets[sheetName];
        const raw=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
        if(raw.length<4){errors.push(`Sheet "${sheetName}": too few rows, skipped`);continue;}
        // Row 1 meta: ["Group: PRIMARY 1", "Cycle: ...", "Period: ...", optional "Category: ..."]
        const className=String(raw[1][0]||"").replace(/^class:\s*/i,"").trim();
        const matchedCls=classes.find(c=>c.name.toLowerCase()===className.toLowerCase())
          ||classes.find(c=>c.name.toLowerCase()===sheetName.toLowerCase());
        if(!matchedCls){errors.push(`Sheet "${sheetName}": class "${className||sheetName}" not found — skipped`);continue;}
        // Detect format: class template has "Category: ..." at meta col 3; section template does not
        const metaCol3=String(raw[1][3]||"").trim();
        const isPerSubjectFmt=/^subject:\s*/i.test(metaCol3);
        // Row 2 headers — extract component names (strip "(max X)")
        const hdrRow=raw[2].map(h=>String(h||""));
        // Score cols: start at 2 for per-subject (ID, Name, [scores]) or 3 for per-class (ID, Name, Category, [scores])
        const scoreColStart=isPerSubjectFmt?2:3;
        const compCols=[];
        for(let i=scoreColStart;i<hdrRow.length-1;i++){
          const h=hdrRow[i].trim();
          if(!h)continue;
          compCols.push({idx:i,compName:h.replace(/\s*\(max\s*[\d.]+\)\s*$/i,"").trim()});
        }
        // Data rows from index 3
        const rows=[];
        if(isPerSubjectFmt){
          // Group template — each sheet = one subject, each row = one student
          const subjectName=metaCol3.replace(/^subject:\s*/i,"").trim();
          if(!subjectName){errors.push(`Sheet "${sheetName}": no subject in meta row — skipped`);continue;}
          for(let i=3;i<raw.length;i++){
            const row=raw[i];
            const stuId=String(row[0]||"").trim();
            if(!stuId)continue;
            const scoreMap={};
            for(const{idx,compName}of compCols){
              const v=row[idx];
              if(v!==""&&v!=null)scoreMap[compName]=Number(v)||0;
            }
            if(!Object.keys(scoreMap).length)continue;
            rows.push({stuId,subjectName,scoreMap,_line:i+1});
          }
        } else {
          // Section template — each sheet = one class, each row = student × subject
          for(let i=3;i<raw.length;i++){
            const row=raw[i];
            const stuId=String(row[0]||"").trim();
            const subjectName=String(row[2]||"").trim();
            if(!stuId||!subjectName)continue;
            const scoreMap={};
            for(const{idx,compName}of compCols){
              const v=row[idx];
              if(v!==""&&v!=null)scoreMap[compName]=Number(v)||0;
            }
            if(!Object.keys(scoreMap).length)continue;
            rows.push({stuId,subjectName,scoreMap,_line:i+1});
          }
        }
        if(!rows.length){errors.push(`Sheet "${sheetName}": no score data found`);continue;}
        allParsed.push({classId:matchedCls.id,className:matchedCls.name,sectionId:matchedCls.section_id,rows});
      }
      setBulkResParsed(allParsed);setBulkResErrors(errors);
    }catch(e){setBulkResErrors([`Parse error: ${e.message}`]);}
  };

  // ── Save bulk results to DB ───────────────────────────────────────────────
  const saveBulkResults=async()=>{
    if(!selTerm||!selSession){notify("Select cycle and period first","error");return;}
    if(isLocked){notify("Results are fully locked (MA approved). Cannot edit.","error");return;}
    if(isTeacherLocked&&ctx.role==="teacher"){notify("Results are locked pending Manager Approval. Contact admin.","error");return;}
    setBulkResSaving(true);
    setBulkResProgress({done:0,total:0,failed:0,merged:0,isDone:false});
    const errors=[];const warnings=[];let totalDone=0,totalFailed=0,totalMerged=0;
    for(const sheet of bulkResParsed){
      // Fetch only students enrolled in this specific class (not all-school).
      // String() on both sides of the comparison guards against number vs string mismatches
      // that occur when Excel reads back an integer ID as a number type.
      const {data:sheetStudentData}=await db.getStudents(null,{class_id:sheet.classId});
      const classStudents=(sheetStudentData||[]).filter(s=>(s.status||"active")==="active");
      const [subjRes,caeStrRes]=await Promise.all([
        db.getClassSubjects(sheet.classId),
        db.getCaeStructureBySectionId(sheet.sectionId),
      ]);
      const sheetSubjects=(subjRes.data||[]).map(cs=>cs.section_subjects).filter(Boolean);
      if(!sheetSubjects.length){
        const skipped=sheet.rows.length;
        errors.push(`Group "${sheet.className}": no subjects assigned to this class — ${skipped} row(s) blocked`);
        totalFailed+=skipped;
        continue;
      }
      let litComps=[];
      if(caeStrRes.data){
        const {data:comps}=await db.getCaeComponents(caeStrRes.data.id);
        litComps=(comps||[]).filter(c=>!c.is_total_score&&c.mode==='literal');
      }
      const records=[];
      for(const row of sheet.rows){
        const student=classStudents.find(s=>String(s.id)===String(row.stuId));
        if(!student){errors.push(`Row ${row._line} [${sheet.className}]: student "${row.stuId}" not found in ${sheet.className}`);totalFailed++;continue;}
        const subj=sheetSubjects.find(s=>s.name.trim().toLowerCase()===row.subjectName.toLowerCase());
        if(!subj){errors.push(`Row ${row._line} [${sheet.className}]: subject "${row.subjectName}" not found`);totalFailed++;continue;}
        // ── Validate each score against its component max ──────────────────
        let scoreRangeError=false;
        for(const comp of litComps){
          const raw=row.scoreMap[comp.component_name];
          if(raw===undefined||raw==="")continue;
          const score=parseFloat(raw);
          const max=parseFloat(comp.value_or_formula)||100;
          if(isNaN(score)||score<0||score>max){
            errors.push(`Row ${row._line} [${sheet.className}] ${row.subjectName} — ${student.first_name} ${student.last_name}: "${comp.component_name}" score ${raw} is out of range (0–${max}) — row skipped`);
            scoreRangeError=true;break;
          }
        }
        if(scoreRangeError){totalFailed++;continue;}
        let caScore=null,examScore=null,totalScore=null;
        if(litComps.length>=2){
          const last=litComps[litComps.length-1];
          // Use ?? 0 so a legitimate score of 0 is preserved (||0 would coerce NaN→0 only)
          examScore=isNaN(parseFloat(row.scoreMap[last.component_name]))?0:parseFloat(row.scoreMap[last.component_name]);
          caScore=litComps.slice(0,-1).reduce((acc,c)=>{const v=parseFloat(row.scoreMap[c.component_name]);return acc+(isNaN(v)?0:v);},0);
          totalScore=caScore+examScore;
        } else {
          // parseFloat("0")||null would wrongly return null — use explicit undefined check
          const rawCA=row.scoreMap["CA"];const rawEx=row.scoreMap["Exam"];
          caScore=rawCA!==undefined&&rawCA!==""?parseFloat(rawCA):null;
          examScore=rawEx!==undefined&&rawEx!==""?parseFloat(rawEx):null;
          totalScore=(caScore??0)+(examScore??0);
        }
        // Never silently skip a row — even a zero total is a valid saved result.
        // Rows with no scores at all are already filtered out by the parser.
        records.push({
          student_id:student.id,class_id:sheet.classId,subject_id:subj.id,
          term_id:+selTerm,session_id:+selSession,
          ca_score:caScore,exam_score:examScore,total_score:totalScore,
          component_scores:JSON.stringify(row.scoreMap),
        });
      }
      if(records.length){
        // Guard: drop any record where subject_id failed to resolve (ghost class_subjects,
        // stray template column, etc.). DB-level NOT NULL would otherwise reject the whole
        // batch. Surface it as a warning instead.
        const beforeNull=records.length;
        const filteredNulls=records.filter(r=>r.subject_id!=null&&!Number.isNaN(+r.subject_id));
        if(filteredNulls.length<beforeNull){
          const dropped=beforeNull-filteredNulls.length;
          warnings.push(`Group "${sheet.className}": ${dropped} row(s) skipped — unresolved subject (ghost class-subject or unmatched template column)`);
          totalFailed+=dropped;
        }
        records.length=0;records.push(...filteredNulls);
        if(!records.length){setBulkResProgress(p=>({...p,done:totalDone,failed:totalFailed}));continue;}
        // Deduplicate: same student+subject can appear more than once in the XLS.
        // Postgres rejects a batch where two rows share the same conflict key.
        // Keep the last occurrence so the most-recently-seen score wins.
        const seen={};
        for(const r of records){seen[`${r.student_id}|${r.subject_id}`]=r;}
        const deduped=Object.values(seen);
        const dupeCount=records.length-deduped.length;
        if(dupeCount>0){
          warnings.push(`Group "${sheet.className}": ${dupeCount} duplicate row(s) — merged (last value kept)`);
          totalMerged+=dupeCount;
        }
        const{error}=await db.upsertResult(deduped);
        if(error){errors.push(`Group "${sheet.className}": ${error.message}`);totalFailed+=deduped.length;}
        else totalDone+=deduped.length;
      }
      setBulkResProgress(p=>({...p,done:totalDone,failed:totalFailed}));
    }
    setBulkResSaving(false);
    setBulkResErrors(errors);
    setBulkResWarnings(warnings);
    setBulkResProgress(p=>({...p,merged:totalMerged,isDone:true}));
    const mergedNote=totalMerged?` (${totalMerged} duplicate${totalMerged!==1?"s":""} merged)`:"";
    if(errors.length&&totalDone>0) notify(`Partial: ${totalDone} saved, ${totalFailed} failed${mergedNote}. Review below.`,"warn");
    else if(errors.length) notify(`Upload failed: ${totalFailed} failed${mergedNote}. Review below.`,"error");
    else if(totalDone>0) notify(`${totalDone} result(s) saved ✓${mergedNote}`);
    if(!errors.length&&totalDone>0)setTimeout(()=>setBulkResModal(false),1500);
  };

  // ── Formula engine ────────────────────────────────────────────────────────
  const evalFormula=(formula,values)=>{
    const names=Object.keys(values).sort((a,b)=>b.length-a.length);
    let expr=formula;
    names.forEach(name=>{
      const v=parseFloat(values[name])||0;
      const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      expr=expr.replace(new RegExp(escaped,'gi'),String(v));
    });
    try{
      if(!/^[\d\s+\-*/().]+$/.test(expr))return null;
      return evaluateArithmeticExpression(expr);
    }catch{return null;}
  };

  const computeTotals=(scoreMap)=>{
    const literalComps=caeComponents.filter(c=>!c.is_total_score&&c.mode==='literal');
    const formulaComps=caeComponents.filter(c=>!c.is_total_score&&c.mode==='formula');
    const totalComp=caeComponents.find(c=>c.is_total_score);
    const vals={};
    literalComps.forEach(c=>{vals[c.component_name]=parseFloat(scoreMap[c.component_name])||0;});
    formulaComps.forEach(c=>{
      const r=evalFormula(c.value_or_formula,vals);
      vals[c.component_name]=r!==null?r:0;
    });
    let total=null;
    if(totalComp) total=evalFormula(totalComp.value_or_formula,vals);
    else total=literalComps.reduce((acc,c)=>acc+(parseFloat(scoreMap[c.component_name])||0),0);
    return{vals,total};
  };

  const buildRecord=(stuId,subjId,scoreMap)=>{
    const {vals,total}=computeTotals(scoreMap);
    const literalComps=caeComponents.filter(c=>!c.is_total_score&&c.mode==='literal');
    const lastLiteral=literalComps[literalComps.length-1];
    const examScore=lastLiteral?(parseFloat(vals[lastLiteral.component_name])||0):null;
    const caScore=total!==null&&examScore!==null?Math.max(0,(total||0)-examScore):null;
    return{
      student_id:stuId,class_id:+selClass,subject_id:+subjId,
      term_id:+selTerm,session_id:+selSession,
      ca_score:caScore,exam_score:examScore,total_score:total,
      component_scores:JSON.stringify(scoreMap||{}),
    };
  };

  // ── Save — by subject ─────────────────────────────────────────────────────
  const saveBySubject=async()=>{
    if(isLocked){notify("Results are fully locked (MA approved). Cannot edit.","error");return;}
    if(isTeacherLocked&&ctx.role==="teacher"){notify("Results are locked pending Manager Approval.","error");return;}
    setSaving(true);
    const records=students
      .map(s=>buildRecord(s.id,selSubj,scores[s.id]||{}))
      .filter(r=>r.total_score!==null);
    const {error}=await db.upsertResult(records);
    setSaving(false);
    if(error)notify(error.message,"error");
    else notify("Results saved ✓");
  };

  // ── Save — by student (save all subjects for this student) ────────────────
  const saveByStudent=async()=>{
    if(isLocked){notify("Results are fully locked (MA approved). Cannot edit.","error");return;}
    if(isTeacherLocked&&ctx.role==="teacher"){notify("Results are locked pending Manager Approval.","error");return;}
    setSaving(true);
    const records=subjects
      .map(subj=>buildRecord(selStudent,subj.id,studentScores[subj.id]||{}))
      .filter(r=>r.total_score!==null);
    if(!records.length){notify("No scores entered yet","error");setSaving(false);return;}
    const {error}=await db.upsertResult(records);
    setSaving(false);
    if(error)notify(error.message,"error");
    else notify(`Saved ${records.length} subject result(s) ✓`);
  };

  const getMax=(compName)=>{
    const c=caeComponents.find(x=>x.component_name===compName&&!x.is_total_score&&x.mode==='literal');
    return c?parseFloat(c.value_or_formula):null;
  };
  const updBySubj =(stuId,comp,val)=>{
    const clamped=clamp(val,getMax(comp));
    setScores(p=>({...p,[stuId]:{...p[stuId],[comp]:clamped}}));
  };
  const updByStud =(subjId,comp,val)=>{
    const clamped=clamp(val,getMax(comp));
    setStudentScores(p=>({...p,[subjId]:{...p[subjId],[comp]:clamped}}));
  };

  const filterTerms=terms.filter(t=>t.session_id===+selSession);
  const inputComps=caeComponents.filter(c=>!c.is_total_score&&c.mode==='literal');
  const hasCae=caeComponents.length>0;

  // Approval lock logic
  const isEAApproved=approval?.ea_status==="approved";
  const isMAApproved=approval?.ma_status==="approved";
  const isLocked=isMAApproved; // MA = full lock
  const isTeacherLocked=isEAApproved; // EA = teacher can't edit but admin can
  const locked=isLocked||(isTeacherLocked&&ctx.role==="teacher");

  // Clamp a numeric input value to [0, max]
  const clamp=(val,max)=>{
    if(val===''||val===null||val===undefined)return val;
    const n=parseFloat(val);
    if(isNaN(n))return '';
    if(n<0)return '0';
    if(max!=null&&n>max)return String(max);
    return String(n);
  };
  const inputStyle=(val,max,isExam)=>({
    width:76,padding:"6px",textAlign:"center",fontSize:13,borderRadius:7,outline:"none",
    border:`2px solid ${locked?C.border:val!==''&&val!=null?(parseFloat(val)>=(max||999)?isExam?C.blue:C.orange:(isExam?C.blue+'88':C.orange+'88')):C.border}`,
    background:locked?C.offWhite:"#fff",
    color:locked?C.muted:C.text,
    cursor:locked?"not-allowed":"text",
  });

  // ── Clear all results for the currently selected section ──────────────────
  const clearSectionResults=async()=>{
    if(!selClearSection){notify("Choose a section to clear","error");return;}
    if(!selTerm||!selSession){notify("Select cycle and period first","error");return;}
    const uniqueSections=[];
    const seen=new Set();
    for(const c of classes){if(c.sections&&!seen.has(c.sections.id)){seen.add(c.sections.id);uniqueSections.push(c.sections);}}
    const sec=uniqueSections.find(s=>String(s.id)===String(selClearSection));
    if(!sec){notify("Section not found","error");return;}
    const termName=terms.find(t=>t.id===+selTerm)?.name||"selected period";
    const sesName=sessions.find(s=>s.id===+selSession)?.name||"selected cycle";
    const ok=await confirm({
      title:"Clear Section Results?",
      message:`Permanently delete ALL results for every class in "${sec.name}" for ${termName}, ${sesName}. This cannot be undone.`,
      confirmLabel:"Clear Section",danger:true,typeToConfirm:"DELETE"
    });
    if(!ok)return;
    const{error}=await db.clearSectionResults(sec.id,+selTerm,+selSession);
    if(error){notify(error.message,"error");return;}
    notify(`All results for ${sec.name} cleared`,"warn");
    setScores({});setStudentScores({});
  };

  // Load subjects for the "clear by subject" picker whenever the class changes
  useEffect(()=>{
    if(!selClearSubjClass){setClearSubjOptions([]);setSelClearSubjId("");return;}
    db.getClassSubjects(+selClearSubjClass).then(({data})=>{
      const opts=(data||[]).map(cs=>cs.section_subjects).filter(Boolean);
      setClearSubjOptions(opts);
      setSelClearSubjId(opts[0]?String(opts[0].id):"");
    });
  },[selClearSubjClass]);

  // ── Clear results for one subject in one class ────────────────────────────
  const clearSubjectResults=async()=>{
    if(!selClearSubjClass||!selClearSubjId){notify("Choose a group and category to clear","error");return;}
    if(!selTerm||!selSession){notify("Select cycle and period first","error");return;}
    const cls=classes.find(c=>String(c.id)===String(selClearSubjClass));
    const subj=clearSubjOptions.find(s=>String(s.id)===String(selClearSubjId));
    if(!cls||!subj){notify("Group or category not found","error");return;}
    const termName=terms.find(t=>t.id===+selTerm)?.name||"selected period";
    const sesName=sessions.find(s=>s.id===+selSession)?.name||"selected cycle";
    const ok=await confirm({
      title:"Clear Category Results?",
      message:`Permanently delete all results for "${subj.name}" in "${cls.name}" for ${termName}, ${sesName}.\n\nThis will lift any subject-assignment interlock. Cannot be undone.`,
      confirmLabel:"Clear Category",danger:true,typeToConfirm:"DELETE"
    });
    if(!ok)return;
    const{error}=await db.clearSubjectResults(+selClearSubjClass,+selClearSubjId,+selTerm,+selSession);
    if(error){notify(error.message,"error");return;}
    notify(`Results for "${subj.name}" in "${cls.name}" cleared`,"warn");
    // Reset score state if this matches the active selection
    if(String(selClass)===String(selClearSubjClass)&&String(selSubj)===String(selClearSubjId)){
      setScores({});setStudentScores({});
    }
  };

  // ── Shared filter card ────────────────────────────────────────────────────
  const FilterCard=(
    <Card style={{marginBottom:16}}>
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:14,flexWrap:"wrap"}}>
        <span style={{fontWeight:700,color:C.blue,fontSize:13}}>Input mode:</span>
        {[{id:"by-subject",label:"By Category",desc:"All members · one category"},
          {id:"by-student",label:"By Member",desc:"All categories · one member"}].map(m=>(
          <button key={m.id} onClick={()=>setInputMode(m.id)}
            style={{padding:"7px 16px",borderRadius:8,border:`2px solid ${inputMode===m.id?C.blue:C.border}`,
              background:inputMode===m.id?C.blue:"transparent",color:inputMode===m.id?"#fff":C.muted,
              cursor:"pointer",fontSize:12,fontWeight:700,transition:"all .15s"}}>
            {m.label}
            <div style={{fontSize:10,fontWeight:400,opacity:.8}}>{m.desc}</div>
          </button>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:14}}>
        <Sel label="Cycle" value={selSession} onChange={v=>{setSelSession(v);setSelTerm("");}}
          options={[{value:"",label:"Select…"},...sessions.map(s=>({value:s.id,label:s.name}))]}/>
        <Sel label="Period" value={selTerm} onChange={setSelTerm} disabled={!selSession}
          options={[{value:"",label:"Select…"},...filterTerms.map(t=>({value:t.id,label:t.name}))]}/>
        <Sel label="Group" value={selClass} onChange={v=>{setSelClass(v);setSelSubj("");setSelStudent("");setStuSearch("");}}
          options={[{value:"",label:"Select…"},...classes.map(c=>({value:c.id,label:c.name}))]}/>
        {inputMode==="by-subject"&&(
          <Sel label="Category" value={selSubj} onChange={setSelSubj} disabled={!selClass}
            options={[{value:"",label:"Select…"},...subjects.map(s=>({value:s.id,label:s.name}))]}/>
        )}
        {inputMode==="by-student"&&(
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:4}}>Member</div>
            <div style={{position:"relative",marginBottom:4}}>
              <Search size={12} style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",color:C.muted,pointerEvents:"none"}}/>
              <input value={stuSearch} onChange={e=>setStuSearch(e.target.value)} placeholder="Search member…" disabled={!selClass}
                style={{width:"100%",boxSizing:"border-box",paddingLeft:26,paddingRight:8,paddingTop:6,paddingBottom:6,
                  borderRadius:8,border:`1px solid ${C.border}`,fontSize:12,color:C.text,background:!selClass?C.offWhite:"#fff",
                  outline:"none"}}/>
            </div>
            <select value={selStudent} onChange={e=>setSelStudent(e.target.value)} disabled={!selClass}
              style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,
                fontSize:12,color:selStudent?C.text:C.muted,background:!selClass?C.offWhite:"#fff",cursor:"pointer"}}>
              <option value="">Select…</option>
              {students.filter(s=>{const q=stuSearch.toLowerCase();return!q||fullName(s).toLowerCase().includes(q)||String(s.id).toLowerCase().includes(q);})
                .map(s=><option key={s.id} value={s.id}>{fullName(s)}</option>)}
            </select>
          </div>
        )}
      </div>
      {!hasCae&&selClass&&(
        <div style={{marginTop:10,padding:"8px 14px",borderRadius:7,
          background:C.orangePale,border:`1px solid ${C.orange}40`,fontSize:12,color:C.orange,fontWeight:600}}>
          No CAE structure found for this section. Using standard CA / Exam mode.
        </div>
      )}
      {selClass&&selTerm&&selSession&&(
        <div style={{marginTop:10,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          {/* Approval status badges */}
          <div style={{display:"flex",gap:8,alignItems:"center",flex:1,flexWrap:"wrap"}}>
            <span style={{fontSize:11,fontWeight:700,color:C.muted}}>Approval Status:</span>
            <span style={{padding:"3px 11px",borderRadius:20,fontSize:11,fontWeight:700,
              background:isEAApproved?C.greenPale:C.orangePale,
              color:isEAApproved?C.green:C.orange,border:`1px solid ${isEAApproved?C.green:C.orange}40`}}>
              EA: {isEAApproved?"Approved":"Pending"}
            </span>
            <span style={{padding:"3px 11px",borderRadius:20,fontSize:11,fontWeight:700,
              background:isMAApproved?C.greenPale:C.orangePale,
              color:isMAApproved?C.green:C.orange,border:`1px solid ${isMAApproved?C.green:C.orange}40`}}>
              MA: {isMAApproved?"Approved":"Pending"}
            </span>
            {isMAApproved&&<span style={{fontSize:11,color:C.red,fontWeight:700,display:"flex",alignItems:"center",gap:3}}><Lock size={11}/>Fully Locked</span>}
            {isEAApproved&&!isMAApproved&&<span style={{fontSize:11,color:C.orange,fontWeight:700,display:"flex",alignItems:"center",gap:3}}><Lock size={11}/>Awaiting Manager Approval</span>}
          </div>
          {/* EA button — visible to form teachers and admins */}
          {!isMAApproved&&(
            <Btn onClick={handleEA} color={isEAApproved?C.red:C.green} disabled={approvingEA} outline={isEAApproved}>
              {approvingEA?"Revoking…":isEAApproved?"Revoke EA":"Give Educator Approval (EA)"}
            </Btn>
          )}
          {ctx.role==="admin"&&!isEAApproved&&!isMAApproved&&(
            <Btn onClick={async()=>{
              const ok=await confirm({title:"Clear All Results?",
                message:"Permanently delete ALL results for this group, period and cycle. Cannot be undone.",
                confirmLabel:"Clear Results",danger:true,typeToConfirm:"DELETE"});
              if(!ok)return;
              const{error}=await db.clearClassResults(+selClass,+selTerm,+selSession);
              if(error)notify(error.message,"error");
              else{notify("All results cleared","warn");setScores({});setStudentScores({});}
            }} color={C.red} outline>Clear Group Results</Btn>
          )}
        </div>
      )}
      {ctx.role==="admin"&&selTerm&&selSession&&(()=>{
        const uniqueSections=[];const seen=new Set();
        for(const c of classes){if(c.sections&&!seen.has(c.sections.id)){seen.add(c.sections.id);uniqueSections.push(c.sections);}}
        if(!uniqueSections.length)return null;
        return(
          <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`,
            display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span style={{fontSize:12,color:C.muted,fontWeight:700,whiteSpace:"nowrap"}}>Clear by section:</span>
            <select value={selClearSection} onChange={e=>setSelClearSection(e.target.value)}
              style={{flex:1,minWidth:160,padding:"6px 10px",borderRadius:8,border:`1px solid ${C.border}`,
                fontSize:12,color:C.text,background:"#fff",cursor:"pointer"}}>
              <option value="">Select section…</option>
              {uniqueSections.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <Btn onClick={clearSectionResults} color={C.red} outline disabled={!selClearSection}>
              Clear Section Results
            </Btn>
          </div>
        );
      })()}
      {ctx.role==="admin"&&selTerm&&selSession&&(
        <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`,
          display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span style={{fontSize:12,color:C.muted,fontWeight:700,whiteSpace:"nowrap"}}>Clear by category:</span>
          <select value={selClearSubjClass} onChange={e=>{setSelClearSubjClass(e.target.value);setSelClearSubjId("");}}
            style={{flex:1,minWidth:160,padding:"6px 10px",borderRadius:8,border:`1px solid ${C.border}`,
              fontSize:12,color:C.text,background:"#fff",cursor:"pointer"}}>
            <option value="">Select group…</option>
            {classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={selClearSubjId} onChange={e=>setSelClearSubjId(e.target.value)}
            disabled={!selClearSubjClass||!clearSubjOptions.length}
            style={{flex:1,minWidth:160,padding:"6px 10px",borderRadius:8,border:`1px solid ${C.border}`,
              fontSize:12,color:C.text,background:"#fff",cursor:"pointer",
              opacity:(!selClearSubjClass||!clearSubjOptions.length)?0.5:1}}>
            <option value="">Select category…</option>
            {clearSubjOptions.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <Btn onClick={clearSubjectResults} color={C.red} outline disabled={!selClearSubjClass||!selClearSubjId}>
            Clear Category Results
          </Btn>
        </div>
      )}
    </Card>
  );

  // ── No assignments empty state ────────────────────────────────────────────
  if(ctx.role!=="admin"&&classes.length===0&&teacherAssignments.length===0) return(
    <div>
      <h2 style={{fontSize:20,fontWeight:900,color:C.blue,marginBottom:18,display:"flex",alignItems:"center",gap:8}}><AppIcon name="upload-results" size={20}/>Upload Results</h2>
      <Card style={{textAlign:"center",padding:44}}>
        <div style={{marginBottom:10}}><FileText size={40} color={C.muted}/></div>
        <div style={{fontWeight:800,color:C.blue,fontSize:15}}>No Category Assignments</div>
        <div style={{color:C.muted,fontSize:13,marginTop:6,lineHeight:1.6}}>
          You haven't been assigned as category staff for any group yet.<br/>
          Ask the admin to assign you on the <b>Assignments → Category Staff</b> page.
        </div>
      </Card>
    </div>
  );

  // ── Header chip ───────────────────────────────────────────────────────────
  const caeChips=hasCae&&inputComps.map(c=>(
    <span key={c.id} style={{background:C.bluePale,color:C.blue,
      padding:"2px 9px",borderRadius:12,fontSize:10,fontWeight:700}}>
      {c.component_name}: /{c.value_or_formula}
    </span>
  ));

  // ══════════════════════════════════════════════════════════════════════════
  // MODE A: BY SUBJECT — all students, one subject
  // ══════════════════════════════════════════════════════════════════════════
  const BySubjectView=(
    <>
      {FilterCard}
      {students.length>0&&selSubj&&(
        <Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14,gap:10,flexWrap:"wrap"}}>
            <div>
              <span style={{fontWeight:700,color:C.blue,fontSize:13}}>
                {students.length} members — {subjects.find(s=>s.id===+selSubj)?.name}
              </span>
              {hasCae&&<div style={{marginTop:4,display:"flex",gap:6,flexWrap:"wrap"}}>{caeChips}</div>}
            </div>
            <Btn onClick={saveBySubject} color={isLocked||(isTeacherLocked&&ctx.role==="teacher")?C.muted:C.green}
              disabled={saving||isLocked||(isTeacherLocked&&ctx.role==="teacher")}>
              {saving?"Saving…":isLocked?"Locked":isTeacherLocked&&ctx.role==="teacher"?"EA Approved":"Save All"}
            </Btn>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{background:C.blue}}>
                  <th style={{padding:"9px 13px",color:"#fff",textAlign:"left",fontWeight:700,fontSize:11}}>#</th>
                  <th style={{padding:"9px 13px",color:"#fff",textAlign:"left",fontWeight:700,fontSize:11}}>Member</th>
                  <th style={{padding:"9px 13px",color:"#fff",textAlign:"left",fontWeight:700,fontSize:11}}>ID</th>
                  {hasCae?inputComps.map(c=>(
                    <th key={c.id} style={{padding:"9px 13px",color:"#fff",textAlign:"center",fontWeight:700,fontSize:11,whiteSpace:"nowrap"}}>
                      {c.component_name}<br/><span style={{fontWeight:400,fontSize:9,opacity:.8}}>(max {c.value_or_formula})</span>
                    </th>
                  )):(
                    <>
                      <th style={{padding:"9px 13px",color:"#fff",textAlign:"center",fontWeight:700,fontSize:11}}>CA ({+(settings.result_ca_max||40)})</th>
                      <th style={{padding:"9px 13px",color:"#fff",textAlign:"center",fontWeight:700,fontSize:11}}>Exam ({+(settings.result_exam_max||60)})</th>
                    </>
                  )}
                  <th style={{padding:"9px 13px",color:"#fff",textAlign:"center",fontWeight:700,fontSize:11}}>Total</th>
                  <th style={{padding:"9px 13px",color:"#fff",textAlign:"center",fontWeight:700,fontSize:11}}>Grade</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s,i)=>{
                  const {vals,total}=computeTotals(scores[s.id]||{});
                  const g=getGrade(total); const gc=gradeCol(g);
                  const isOver=caeStructure&&total>caeStructure.maximum_score;
                  return(
                    <tr key={s.id} style={{background:i%2===0?C.white:C.offWhite,borderBottom:`1px solid ${C.border}`}}>
                      <td style={{padding:"9px 13px",color:C.light,fontSize:11}}>{i+1}</td>
                      <td style={{padding:"9px 13px"}}><strong>{fullName(s)}</strong></td>
                      <td style={{padding:"9px 13px",color:C.muted,fontSize:12}}>{s.id}</td>
                      {hasCae?inputComps.map(c=>{
                        const max=parseFloat(c.value_or_formula)||0;
                        const val=scores[s.id]?.[c.component_name]??'';
                        return(
                          <td key={c.id} style={{padding:"9px 8px",textAlign:"center"}}>
                            <input type="number" min="0" max={max} value={val}
                              onChange={e=>updBySubj(s.id,c.component_name,clamp(e.target.value,max))}
                              style={inputStyle(val,max,false)} placeholder={String(max)}
                              disabled={locked}/>
                          </td>
                        );
                      }):(
                        <>
                          <td style={{padding:"9px 8px",textAlign:"center"}}>
                            <input type="number" min="0" max="40"
                              value={scores[s.id]?.['_ca']??''}
                              onChange={e=>updBySubj(s.id,'_ca',clamp(e.target.value,40))}
                              style={inputStyle(scores[s.id]?.['_ca'],40,false)} placeholder="0-40"
                              disabled={locked}/>
                          </td>
                          <td style={{padding:"9px 8px",textAlign:"center"}}>
                            <input type="number" min="0" max="60"
                              value={scores[s.id]?.['_exam']??''}
                              onChange={e=>updBySubj(s.id,'_exam',clamp(e.target.value,60))}
                              style={inputStyle(scores[s.id]?.['_exam'],60,true)} placeholder="0-60"
                              disabled={locked}/>
                          </td>
                        </>
                      )}
                      <td style={{padding:"9px 13px",textAlign:"center",fontWeight:900,
                        color:isOver?C.red:total!==null?C.text:C.light,fontSize:14}}>
                        {total!==null?total.toFixed(0):"—"}
                        {isOver&&<div style={{fontSize:9,color:C.red}}>exceeds max</div>}
                      </td>
                      <td style={{padding:"9px 13px",textAlign:"center"}}>
                        <Badge color={gc}>{g}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // MODE B: BY STUDENT — all subjects, one student
  // ══════════════════════════════════════════════════════════════════════════
  const stu=students.find(s=>s.id===selStudent);
  const ByStudentView=(
    <>
      {FilterCard}
      {stu&&subjects.length>0&&(
        <Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
            <div>
              <span style={{fontWeight:800,color:C.blue,fontSize:14}}>{fullName(stu)}</span>
              <span style={{color:C.muted,fontSize:12,marginLeft:8}}>{stu.id}</span>
              {hasCae&&<div style={{marginTop:4,display:"flex",gap:6,flexWrap:"wrap"}}>{caeChips}</div>}
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {canAccess("action:download_reports")&&(
                <Btn onClick={downloadTeacherPDF} color={C.purple} disabled={downloadingPDF}>
                  {downloadingPDF?"Generating…":"⬇ Download PDF"}
                </Btn>
              )}
              <Btn onClick={saveByStudent} color={C.green} disabled={saving}>
                {saving?"Saving…":"Save All Categories"}
              </Btn>
            </div>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{background:C.blue}}>
                  <th style={{padding:"9px 13px",color:"#fff",textAlign:"left",fontWeight:700,fontSize:11}}>Category</th>
                  {hasCae?inputComps.map(c=>(
                    <th key={c.id} style={{padding:"9px 13px",color:"#fff",textAlign:"center",fontWeight:700,fontSize:11,whiteSpace:"nowrap"}}>
                      {c.component_name}<br/><span style={{fontWeight:400,fontSize:9,opacity:.8}}>(max {c.value_or_formula})</span>
                    </th>
                  )):(
                    <>
                      <th style={{padding:"9px 13px",color:"#fff",textAlign:"center",fontWeight:700,fontSize:11}}>CA ({+(settings.result_ca_max||40)})</th>
                      <th style={{padding:"9px 13px",color:"#fff",textAlign:"center",fontWeight:700,fontSize:11}}>Exam ({+(settings.result_exam_max||60)})</th>
                    </>
                  )}
                  <th style={{padding:"9px 13px",color:"#fff",textAlign:"center",fontWeight:700,fontSize:11}}>Total</th>
                  <th style={{padding:"9px 13px",color:"#fff",textAlign:"center",fontWeight:700,fontSize:11}}>Grade</th>
                  <th style={{padding:"9px 13px",color:"#fff",textAlign:"center",fontWeight:700,fontSize:11}}>Status</th>
                </tr>
              </thead>
              <tbody>
                {subjects.map((subj,i)=>{
                  const sm=studentScores[subj.id]||{};
                  const {vals,total}=computeTotals(sm);
                  const g=getGrade(total); const gc=gradeCol(g);
                  const isOver=caeStructure&&total>caeStructure.maximum_score;
                  const hasAnyEntry=hasCae
                    ?inputComps.some(c=>sm[c.component_name]!==''&&sm[c.component_name]!=null)
                    :(sm['_ca']!==''&&sm['_ca']!=null)||(sm['_exam']!==''&&sm['_exam']!=null);
                  return(
                    <tr key={subj.id} style={{background:i%2===0?C.white:C.offWhite,borderBottom:`1px solid ${C.border}`}}>
                      <td style={{padding:"9px 13px",fontWeight:700,color:C.blue}}>{subj.name}</td>
                      {hasCae?inputComps.map(c=>{
                        const max=parseFloat(c.value_or_formula)||0;
                        const val=sm[c.component_name]??'';
                        return(
                          <td key={c.id} style={{padding:"9px 8px",textAlign:"center"}}>
                            <input type="number" min="0" max={max} value={val}
                              onChange={e=>updByStud(subj.id,c.component_name,clamp(e.target.value,max))}
                              style={inputStyle(val,max,false)} placeholder={String(max)}
                              disabled={locked}/>
                          </td>
                        );
                      }):(
                        <>
                          <td style={{padding:"9px 8px",textAlign:"center"}}>
                            <input type="number" min="0" max="40"
                              value={sm['_ca']??''}
                              onChange={e=>updByStud(subj.id,'_ca',clamp(e.target.value,40))}
                              style={inputStyle(sm['_ca'],40,false)} placeholder="0-40"
                              disabled={locked}/>
                          </td>
                          <td style={{padding:"9px 8px",textAlign:"center"}}>
                            <input type="number" min="0" max="60"
                              value={sm['_exam']??''}
                              onChange={e=>updByStud(subj.id,'_exam',clamp(e.target.value,60))}
                              style={inputStyle(sm['_exam'],60,true)} placeholder="0-60"
                              disabled={locked}/>
                          </td>
                        </>
                      )}
                      <td style={{padding:"9px 13px",textAlign:"center",fontWeight:900,
                        color:isOver?C.red:total!==null?C.text:C.light,fontSize:14}}>
                        {total!==null?total.toFixed(0):"—"}
                        {isOver&&<div style={{fontSize:9,color:C.red}}>exceeds max</div>}
                      </td>
                      <td style={{padding:"9px 13px",textAlign:"center"}}>
                        {total!==null?<Badge color={gc}>{g}</Badge>:<span style={{color:C.light}}>—</span>}
                      </td>
                      <td style={{padding:"9px 13px",textAlign:"center"}}>
                        {hasAnyEntry
                          ?<Badge color={C.green}>Entered</Badge>
                          :<Badge color={C.light}>Pending</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Progress summary */}
          <div style={{marginTop:12,padding:"9px 14px",background:C.offWhite,borderRadius:8,
            display:"flex",gap:16,flexWrap:"wrap",fontSize:12}}>
            <span style={{color:C.muted}}>
              <strong style={{color:C.blue}}>{Object.keys(studentScores).length}</strong> / {subjects.length} categories entered
            </span>
            {caeStructure&&<span style={{color:C.muted}}>Max score: <strong>{caeStructure.maximum_score}</strong></span>}
          </div>
        </Card>
      )}
      {stu&&subjects.length===0&&(
        <Card style={{textAlign:"center",padding:32,color:C.muted}}>
          No categories assigned to this group yet.
        </Card>
      )}
    </>
  );

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18,flexWrap:"wrap",gap:10}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="upload-results" size={20}/>Upload Results</h2>
          {caeStructure&&<p style={{fontSize:12,color:C.muted,marginTop:4}}>
            Using <b style={{color:C.orange}}>{caeStructure.name}</b> — Max Score: <b>{caeStructure.maximum_score}</b>
          </p>}
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {canAccess("action:download_result_template")&&(
            <>
              <Btn onClick={()=>downloadResultTemplate('class')} color={C.blue} outline
                disabled={!selClass||!selTerm||!selSession}
                title={!selClass||!selTerm||!selSession?"Select cycle, period and group first":""}>
                Group Template
              </Btn>
              <Btn onClick={()=>downloadResultTemplate('section')} color={C.blue} outline
                disabled={!selClass||!selTerm||!selSession}>
                Section Template
              </Btn>
            </>
          )}
          <Btn onClick={()=>{setBulkResModal(true);setBulkResParsed([]);setBulkResErrors([]);setBulkResWarnings([]);setBulkResFile(null);setBulkResProgress({done:0,total:0,failed:0,merged:0,isDone:false});}} color={C.green}>
            Bulk Upload
          </Btn>
        </div>
      </div>
      {/* ── Category Completion Matrix ── */}
      {selClass&&selTerm&&selSession&&subjects.length>0&&(
        <div style={{marginBottom:16,padding:"12px 16px",background:C.white,border:`1px solid ${C.border}`,
          borderRadius:10,display:"flex",flexWrap:"wrap",gap:8,alignItems:"center"}}>
          <span style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginRight:4,whiteSpace:"nowrap"}}>
            Category Coverage:
          </span>
          {subjects.map(s=>{
            const count=subjDone[s.id]||0;
            const total=students.length;
            const done=count>0&&count>=total;
            const partial=count>0&&count<total;
            const color=done?C.green:partial?C.orange:C.muted;
            const bg=done?"#f0fdf4":partial?"#fff7ed":"#f8fafc";
            return(
              <span key={s.id} style={{fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:20,
                background:bg,color,border:`1px solid ${color}40`,whiteSpace:"nowrap"}}>
                {done?"✓ ":partial?"◑ ":"○ "}{s.name}
                {count>0&&<span style={{fontWeight:400,opacity:.8}}> {count}/{total}</span>}
              </span>
            );
          })}
        </div>
      )}
      {inputMode==="by-subject"?BySubjectView:ByStudentView}

      {/* ── Bulk Result Upload Modal ── */}
      {bulkResModal&&(
        <Modal title="Bulk Upload Results" onClose={()=>setBulkResModal(false)} width={720}>
          {/* Instructions */}
          <div style={{fontSize:12,color:C.blue,marginBottom:14,padding:"10px 14px",background:C.bluePale,borderRadius:8,border:`1px solid ${C.blue}22`,lineHeight:1.6}}>
            <b>How to use:</b> {canAccess("action:download_result_template")?<>Click <b>Group Template</b> or <b>Section Template</b> above to download an Excel file pre-filled with your members and categories.</>:<>Ask your admin to download the Group Template for your group.</>} Fill in scores in the <span style={{background:C.amberPale,padding:"1px 5px",borderRadius:3}}>yellow cells</span>, then upload the file here.
          </div>
          {/* Cycle/Period reminder */}
          {selTerm&&selSession&&(
            <div style={{fontSize:11,color:C.muted,marginBottom:14,padding:"7px 12px",background:C.offWhite,borderRadius:6,border:`1px solid ${C.border}`}}>
              Importing into: <b style={{color:C.text}}>{sessions.find(s=>s.id===+selSession)?.name}</b> · <b style={{color:C.text}}>{terms.find(t=>t.id===+selTerm)?.name}</b> — make sure your template was downloaded for the same period.
            </div>
          )}
          {/* File picker */}
          <div style={{marginBottom:16}}>
            <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>
              Select Excel File (.xlsx)
            </label>
            <input type="file" accept=".xlsx,.xls"
              onChange={e=>{if(e.target.files[0])parseBulkResultFile(e.target.files[0]);}}
              style={{display:"block",fontSize:13,color:C.text}}/>
          </div>

          {/* Warnings (duplicates merged) */}
          {bulkResWarnings.length>0&&(
            <div style={{marginBottom:8,padding:"8px 14px",background:C.amberPale,borderRadius:8,border:`1px solid ${C.amber}44`,maxHeight:100,overflowY:"auto"}}>
              <div style={{fontWeight:700,color:C.amber,fontSize:12,marginBottom:4}}>Notices:</div>
              {bulkResWarnings.map((w,i)=><div key={i} style={{fontSize:11,color:C.amber,marginBottom:2}}>• {w}</div>)}
            </div>
          )}
          {/* Errors */}
          {bulkResErrors.length>0&&(
            <div style={{marginBottom:12,padding:"10px 14px",background:C.redPale,borderRadius:8,border:`1px solid ${C.red}33`,maxHeight:120,overflowY:"auto"}}>
              <div style={{fontWeight:700,color:C.red,fontSize:12,marginBottom:5}}>Issues:</div>
              {bulkResErrors.map((e,i)=><div key={i} style={{fontSize:11,color:C.red,marginBottom:2}}>• {e}</div>)}
            </div>
          )}

          {/* Preview table */}
          {bulkResParsed.length>0&&(
            <>
              <div style={{fontWeight:700,fontSize:13,color:C.blue,marginBottom:8}}>
                Preview — {bulkResParsed.reduce((a,s)=>a+s.rows.length,0)} record(s) across {bulkResParsed.length} group(es)
              </div>
              <div style={{maxHeight:280,overflowY:"auto",border:`1px solid ${C.border}`,borderRadius:8,marginBottom:14}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead>
                    <tr style={{background:C.blue,position:"sticky",top:0}}>
                      {["Group","Member ID","Category","Scores"].map(h=>(
                        <th key={h} style={{padding:"7px 10px",color:"#fff",textAlign:"left",fontWeight:700,fontSize:11}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bulkResParsed.flatMap((sheet,si)=>
                      sheet.rows.slice(0,100).map((row,ri)=>(
                        <tr key={`${si}-${ri}`} style={{background:(si+ri)%2===0?"#fff":C.offWhite,borderBottom:`1px solid ${C.border}22`}}>
                          <td style={{padding:"5px 10px",color:C.muted,fontSize:11,whiteSpace:"nowrap"}}>{sheet.className}</td>
                          <td style={{padding:"5px 10px",fontWeight:600,fontFamily:"monospace"}}>{row.stuId}</td>
                          <td style={{padding:"5px 10px"}}>{row.subjectName}</td>
                          <td style={{padding:"5px 10px",color:C.muted,fontSize:11}}>
                            {Object.entries(row.scoreMap).map(([k,v])=>`${k}: ${v}`).join(" · ")}
                          </td>
                        </tr>
                      ))
                    )}
                    {bulkResParsed.reduce((a,s)=>a+s.rows.length,0)>100&&(
                      <tr><td colSpan={4} style={{padding:"7px 10px",color:C.muted,fontSize:11,textAlign:"center",fontStyle:"italic"}}>
                        … and {bulkResParsed.reduce((a,s)=>a+s.rows.length,0)-100} more rows
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Progress */}
              {(bulkResSaving||bulkResProgress.isDone)&&(
                <div style={{marginBottom:12,padding:"10px 14px",borderRadius:8,
                  background:bulkResProgress.isDone?C.greenPale:C.bluePale,
                  border:`1px solid ${bulkResProgress.isDone?C.green:C.blue}33`}}>
                  <div style={{fontSize:13,fontWeight:700,color:bulkResProgress.isDone?C.green:C.blue}}>
                    {bulkResProgress.isDone?"Done!":"Saving…"}{" "}
                    {bulkResProgress.done} saved{bulkResProgress.failed>0?`, ${bulkResProgress.failed} failed`:""}{bulkResProgress.merged>0?`, ${bulkResProgress.merged} duplicates merged`:""}
                  </div>
                </div>
              )}
              {!bulkResSaving&&!bulkResProgress.isDone&&(
                <Btn onClick={saveBulkResults} color={C.green} style={{width:"100%",justifyContent:"center"}}
                  disabled={bulkResSaving}>
                  Save {bulkResParsed.reduce((a,s)=>a+s.rows.length,0)} Result Record(s)
                </Btn>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

// ─── MY RESULTS (Member) ─────────────────────────────────────────────────────
export function MyResultsPage({ctx}){
  const {user,notify,canAccess,setPage}=ctx;
  if(!canAccess("page:my-results"))return(
    <div style={{padding:40,textAlign:"center"}}>
      <Lock size={40} color={C.muted} style={{marginBottom:12}}/>
      <div style={{fontWeight:800,fontSize:16,color:C.blue,marginBottom:6}}>Access Restricted</div>
      <div style={{color:C.muted,fontSize:13}}>You do not have permission to view report cards. Contact your administrator.</div>
    </div>
  );
  const [results,setResults]=useState([]);
  const [sessions,setSessions]=useState([]);
  const [terms,setTerms]=useState([]);
  const [selSession,setSelSession]=useState("");
  const [selTerm,setSelTerm]=useState("");
  const [gradingSchema,setGradingSchema]=useState([]);
  const [stuCaeComps,setStuCaeComps]=useState([]); // literal CAE components for this student's section
  const [loading,setLoading]=useState(true);
  const [publishInfo,setPublishInfo]=useState(null);
  const [downloading,setDownloading]=useState(false);
  const [feesBlocked,setFeesBlocked]=useState(false);   // true when block_reports_if_owing is on AND student owes
  const [outstandingBalance,setOutstandingBalance]=useState(0);

  useEffect(()=>{
    // Check block_reports_if_owing setting + student balance
    if(user.student_id){
      Promise.all([db.getSettings(),db.getStudentOutstandingBalance(user.student_id)]).then(([settingsRes,balRes])=>{
        const m={};(settingsRes.data||[]).forEach(r=>{m[r.key]=r.value;});
        const blockEnabled=m.block_reports_if_owing==="true";
        const bal=balRes.balance||0;
        setOutstandingBalance(bal);
        setFeesBlocked(blockEnabled&&bal>0);
      });
    }
    // Load CAE components for student's section
    if(user.class_id){
      db.getClasses().then(({data:cls})=>{
        const c=(cls||[]).find(x=>x.id===+user.class_id);
        if(c?.section_id){
          db.getCaeStructureBySectionId(c.section_id).then(({data:str})=>{
            if(!str)return;
            db.getCaeComponents(str.id).then(({data:comps})=>{
              setStuCaeComps((comps||[]).filter(x=>!x.is_total_score&&x.mode==='literal'));
            }).catch(err=>console.error('[MyResults] cae components failed:',err));
          }).catch(err=>console.error('[MyResults] cae structure failed:',err));
        }
      }).catch(err=>console.error('[MyResults] getClasses failed:',err));
    }
    Promise.all([db.getSessions(),db.getTerms(),db.getGradingSchema()]).then(([s,t,g])=>{
      const ss=s.data||[];
      const ts=t.data||[];
      setSessions(ss);setTerms(ts);setGradingSchema(g.data||[]);
      const aSes=ss.find(s=>s.is_active)||ss[0];
      const aTer=ts.find(t=>t.is_active&&t.session_id===aSes?.id)||ts.filter(t=>t.session_id===aSes?.id)[0];
      if(aSes)setSelSession(String(aSes.id));
      if(aTer)setSelTerm(String(aTer.id));
    }).catch(err=>console.error('[MyResults] cycles/periods load failed:',err));
  },[]);

  useEffect(()=>{
    if(!selTerm||!selSession||!user.student_id)return;
    setLoading(true);
    setPublishInfo(null);
    Promise.all([
      // Filter by student's current class_id so stale rows from a previous class
      // (e.g. the student was moved mid-session) don't render as duplicate subjects.
      db.getResults({student_id:user.student_id,term_id:+selTerm,session_id:+selSession,...(user.class_id?{class_id:+user.class_id}:{})}),
      user.class_id?db.getReportPublish({class_id:+user.class_id,term_id:+selTerm,session_id:+selSession}):Promise.resolve({data:[]})
    ]).then(([r,pub])=>{
      setResults(r.data||[]);
      setPublishInfo((pub.data||[])[0]||null);
      setLoading(false);
    }).catch(err=>{console.error('[MyResults] results load failed:',err);setLoading(false);});
  },[selTerm,selSession,user.student_id]);

  const downloadReportCard=async()=>{
    if(!publishInfo?.is_published||!user.class_id)return;
    setDownloading(true);
    try{
      const [caeRes,traits,ratings,settingsRes,clsList,stuRes,ftRes]=await Promise.all([
        db.getCaeResults({student_id:user.student_id,class_id:+user.class_id,term_id:+selTerm,session_id:+selSession}),
        db.getCaeTraits(),
        db.getCaeRatings(),
        db.getSettings(),
        db.getClasses(),
        db.getStudentById(user.student_id),
        db.getFormTeacherForClass(user.class_id),
      ]);
      const cls=(clsList.data||[]).find(c=>c.id===+user.class_id);
      const term=terms.find(t=>t.id===+selTerm);
      const session=sessions.find(s=>s.id===+selSession);
      const stu=stuRes.data||{id:user.student_id,name:user.name,first_name:"",last_name:user.name,gender:"",admission_number:user.student_id};
      const settingsMap={};(settingsRes.data||[]).forEach(s=>{settingsMap[s.key]=s.value;});
      settingsMap._formTeacherName=ftRes.data?.[0]?.teachers?.full_name||"";
      // Override CA/Exam maxima + pass CAE components from section's CAE structure
      if(cls?.section_id){
        const {data:caeStr}=await db.getCaeStructureBySectionId(cls.section_id);
        if(caeStr){
          const {data:comps}=await db.getCaeComponents(caeStr.id);
          const lit=(comps||[]).filter(c=>!c.is_total_score&&c.mode==='literal');
          if(lit.length>=2){
            const eMax=parseFloat(lit[lit.length-1].value_or_formula)||0;
            const cMax=lit.slice(0,-1).reduce((s,c)=>s+(parseFloat(c.value_or_formula)||0),0);
            settingsMap.result_ca_max=String(cMax);
            settingsMap.result_exam_max=String(eMax);
            settingsMap._caeComps=lit;
          }
        }
      }
      // Load global report card settings (default template) for layout options
      const {data:tmplData}=await db.getReportTemplates();
      const defTmpl=(tmplData||[]).find(t=>t.is_default)||(tmplData||[])[0]||{};
      // Signatures are now stored as base64 in school_settings (principal_signature_base64)
      // and resolved inside openReportCardPrintWindow via the settingsMap — no DB lookup needed
      const teacherSig=null;
      const principalSig=null;
      // Layout from global template; show_* from global template since publishInfo may be stale
      const pubOptions={
        show_cae:defTmpl.show_cae!==false,
        show_teacher_comment:defTmpl.show_teacher_comment!==false,
        show_principal_comment:defTmpl.show_principal_comment!==false,
        show_parent_ack:defTmpl.show_parent_ack!==false,
        show_position:defTmpl.show_position!==false,
        show_next_term:defTmpl.show_next_term!==false,
        card_spacing:defTmpl.card_spacing||"normal",
      };
      const allData={[stu.id]:{results,caeResults:caeRes.data||[]}};
      const rcHtml=openReportCardPrintWindow(
        [stu],allData,cls,term,session,
        gradingSchema,traits.data||[],ratings.data||[],
        publishInfo,settingsMap,settingsMap.portal_logo_base64||null,
        publishInfo.class_teacher_comment||"",
        publishInfo.principal_comment||"",
        publishInfo.next_term_begins||"",
        pubOptions,teacherSig,principalSig,
        null,true,true);
      const stuName=fullName(stu)||user.name||"Member";
      const filename=pdfName(stuName,"REPORT",term?.name||"",session?.name||"");
      notify("Generating PDF…","success");
      openHtmlDoc(rcHtml,{title:filename,showPDF:ctx.showPDF});
    }catch(e){console.error("[downloadReportCard]",e);notify("Failed to generate report card: "+e.message,"error");}
    setDownloading(false);
  };

  const total=results.reduce((a,b)=>a+(b.total_score||0),0);
  const avg=results.length?total/results.length:0;

  const filterTerms=terms.filter(t=>t.session_id===+selSession);

  // Billing-owing block screen — shown when admin has enabled the strict block setting
  if(feesBlocked){
    return(
      <div>
        <div style={{marginBottom:18}}>
          <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="my-results" size={20}/>My Report</h2>
          <p style={{color:C.muted,fontSize:12}}>{user.name}</p>
        </div>
        <Card style={{textAlign:"center",padding:"48px 32px",border:`2px solid ${C.red}`}}>
          <Lock size={44} color={C.red} style={{marginBottom:16}}/>
          <div style={{fontWeight:900,fontSize:18,color:C.red,marginBottom:8}}>Report Access Restricted</div>
          <div style={{color:C.muted,fontSize:13,lineHeight:1.8,maxWidth:460,margin:"0 auto",marginBottom:20}}>
            Your report card is currently <strong>unavailable</strong> because you have an outstanding billing balance of{" "}
            <strong style={{color:C.red}}>{fmt(outstandingBalance)}</strong>.
            <br/>Please visit the organization finance office to clear your balance, then try again.
          </div>
          <div style={{display:"flex",justifyContent:"center",gap:12,flexWrap:"wrap"}}>
            <Btn onClick={()=>setPage("my-bill")} color={C.orange}>View My Bill</Btn>
            <Btn onClick={()=>setPage("my-payments")} color={C.blue} outline>Payment History</Btn>
          </div>
        </Card>
      </div>
    );
  }

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="my-results" size={20}/>My Report</h2>
          <p style={{color:C.muted,fontSize:12}}>{user.name}</p>
        </div>
        {publishInfo?.is_published&&results.length>0&&canAccess("action:download_reports")&&(
          <Btn onClick={downloadReportCard} color={C.orange} disabled={downloading}>
            {downloading?"Generating…":"Download Report"}
          </Btn>
        )}
      </div>
      <Card style={{marginBottom:16}}>
        <div data-jd-columns="2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <Sel label="Cycle" value={selSession} onChange={v=>{setSelSession(v);setSelTerm("");}}
            options={sessions.map(s=>({value:s.id,label:s.name}))}/>
          <Sel label="Period" value={selTerm} onChange={setSelTerm} disabled={!selSession}
            options={filterTerms.map(t=>({value:t.id,label:t.name}))}/>
        </div>
      </Card>
      {loading?<Spinner/>:!publishInfo?.is_published?(
        <Card style={{textAlign:"center",padding:44}}>
          <div style={{fontSize:44,marginBottom:10}}><Lock size={34} color={C.orange}/></div>
          <div style={{fontWeight:800,color:C.blue,fontSize:15}}>Results Not Yet Available</div>
          <div style={{color:C.muted,fontSize:13,marginTop:6,lineHeight:1.6}}>
            Report cards for this period have not been published yet.<br/>
            Please check back later or contact the organization office.
          </div>
        </Card>
      ):results.length>0?(
        <>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:13,marginBottom:16}}>
            <StatCard label="Categories"     value={results.length}     icon={<BookOpen size={18} color={C.blue}/>} color={C.blue}/>
            <StatCard label="Total Score"  value={total.toFixed(0)}   icon={<Award size={18} color={C.orange}/>} color={C.orange}/>
            <StatCard label="Average"      value={avg.toFixed(1)}     icon={<BarChart3 size={18} color={C.green}/>} color={C.green}/>
            <StatCard label="Overall Grade"value={getGrade(avg,gradingSchema)} icon={<Target size={18}/>} color={gradeCol(getGrade(avg,gradingSchema))}/>
          </div>
          <Card>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <Th cols={stuCaeComps.length>=2?["Category",...stuCaeComps.map(c=>c.component_name+` (${c.value_or_formula})`),"Total","Grade","Remark"]:["Category","CA","Exam","Total","Grade","Remark"]}/>
                <tbody>
                  {results.map((r,i)=>{
                    const g=getGrade(r.total_score,gradingSchema); const gc=gradeCol(g);
                    const cs=(()=>{try{return r.component_scores?JSON.parse(r.component_scores):{};}catch{return{};}})();
                    return(
                      <TRow key={i} i={i} cells={[
                        <strong>{r.section_subjects?.name||"—"}</strong>,
                        ...(stuCaeComps.length>=2?stuCaeComps.map(c=><span key={c.id} style={{color:C.muted}}>{cs[c.component_name]??"—"}</span>):[
                          <span style={{color:C.muted}}>{r.ca_score??"-"}</span>,
                          <span style={{color:C.muted}}>{r.exam_score??"-"}</span>,
                        ]),
                        <strong style={{fontSize:14}}>{r.total_score??"-"}</strong>,
                        <Badge color={gc}>{g}</Badge>,
                        <span style={{color:gc,fontWeight:600,fontSize:12}}>{getRemark(r.total_score,gradingSchema)}</span>,
                      ]}/>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ):(
        <Card style={{textAlign:"center",padding:44}}>
          <div style={{marginBottom:10}}><ClipboardList size={44} color={C.muted}/></div>
          <div style={{fontWeight:800,color:C.blue,fontSize:15}}>No Results Yet</div>
          <div style={{color:C.muted,fontSize:13}}>No results found for the selected cycle/period.</div>
        </Card>
      )}
    </div>
  );
}

// ─── MY GROUPS (Staff) ─────────────────────────────────────────────────────
export function MyClassesPage({ctx}){
  const {user,notify,canAccess}=ctx;
  // Prefer the My-Groups-scoped permission so admins can grant edit-in-own-class without granting
  // the broader admin-level Edit Member Profiles right. Fall back to the legacy perm for compat.
  const rbacCanEdit=canAccess("action:edit_my_class_students")||canAccess("action:edit_students");
  const [classes,setClasses]=useState([]);
  const [students,setStudents]=useState([]);
  const [selClass,setSelClass]=useState(null);
  const [loading,setLoading]=useState(true);
  const [editModal,setEditModal]=useState(false);
  const [editStu,setEditStu]=useState(null);
  const [stuForm,setStuForm]=useState({});
  const [saving,setSaving]=useState(false);
  // Portal-settings-driven restriction panel (Settings → Permissions → Behaviour Restrictions):
  //   teacher_my_classes_restrict                 (master)   — lock down to form-only + view-only
  //   teacher_my_classes_allow_subject_access     (sub-perm) — re-enable subject-teacher classes
  //   teacher_my_classes_allow_edit_students      (sub-perm) — re-enable Edit on form-class students
  const [restrictMaster,setRestrictMaster]=useState(false);
  const [allowSubjectAccess,setAllowSubjectAccess]=useState(false);
  const [allowEditSub,setAllowEditSub]=useState(false);
  const confirm=useConfirm();

  // Track which classes the teacher is a form teacher for (vs subject teacher only).
  // Used to tag each class card with the correct badge and to gate edit actions (subject-only
  // teachers get view-only access to their subject classes).
  const [formClassIds,setFormClassIds]=useState(new Set());

  useEffect(()=>{
    if(!user.teacher_db_id){setLoading(false);return;}
    const tid=String(user.teacher_db_id);
    // Fetch BOTH form-teacher and subject-teacher assignments so subject teachers can access
    // their class(es) too — not just form teachers. Also load portal settings so we can apply
    // the Behaviour Restrictions master + sub-permissions.
    Promise.all([
      db.getAllFormTeachers(),
      db.getTeacherSubjects(user.teacher_db_id),
      db.getClasses(),
      db.getSettings(),
    ]).then(([ftRes,subjRes,clsRes,setRes])=>{
      const settings={};(setRes.data||[]).forEach(r=>{settings[r.key]=r.value;});
      const master=settings.teacher_my_classes_restrict==="true";
      const subjectSub=settings.teacher_my_classes_allow_subject_access==="true";
      const editSub=settings.teacher_my_classes_allow_edit_students==="true";
      setRestrictMaster(master);
      setAllowSubjectAccess(subjectSub);
      setAllowEditSub(editSub);
      const formIds=new Set((ftRes.data||[])
        .filter(r=>String(r.teacher_id)===tid)
        .map(r=>+r.class_id));
      const subjIds=new Set((subjRes.data||[]).map(r=>+r.class_id));
      // Restricted mode locks subject-teacher classes off unless the sub-permission re-enables them.
      const includeSubject = !master || subjectSub;
      const allowed = includeSubject ? new Set([...formIds,...subjIds]) : formIds;
      const myCls=(clsRes.data||[]).filter(c=>allowed.has(+c.id));
      setFormClassIds(formIds);
      setClasses(myCls);
      if(myCls.length===1)setSelClass(myCls[0]);
      setLoading(false);
    });
  },[user.teacher_db_id]);

  // Effective edit flag: RBAC perm AND (unrestricted OR edit sub-perm on).
  const canEditStudents = rbacCanEdit && (!restrictMaster || allowEditSub);

  useEffect(()=>{
    if(!selClass)return;
    db.getStudents().then(({data})=>{
      setStudents((data||[]).filter(s=>s.class_id===selClass.id));
    });
  },[selClass]);

  const openEdit=(stu)=>{
    setStuForm({
      first_name:stu.first_name||"",
      middle_name:stu.middle_name||"",
      last_name:stu.last_name||"",
      email:stu.email||"",
      phone:stu.phone||"",
      dob:stu.dob||"",
    });
    setEditStu(stu);
    setEditModal(true);
  };

  const saveStudent=async()=>{
    setSaving(true);
    const name=[stuForm.first_name,stuForm.middle_name,stuForm.last_name].filter(Boolean).join(" ");
    const payload={
      name,
      first_name:stuForm.first_name||null,
      middle_name:stuForm.middle_name||null,
      last_name:stuForm.last_name||null,
      email:stuForm.email||null,
      phone:stuForm.phone||null,
      dob:stuForm.dob||null,
    };
    const {error}=await db.upsertStudent(payload,editStu.id);
    setSaving(false);
    if(error)notify(error.message,"error");
    else{
      notify("Member updated ✓");
      setEditModal(false);
      db.getStudents().then(({data})=>setStudents((data||[]).filter(s=>s.class_id===selClass.id)));
    }
  };

  return(
    <div>
      <div style={{marginBottom:18}}>
        <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="my-classes" size={20}/>My Assigned Groups</h2>
        <p style={{color:C.muted,fontSize:12}}>Groups where you are a form staff or category staff</p>
      </div>
      {loading?<Spinner/>:classes.length===0?(
        <Card style={{textAlign:"center",padding:44}}>
          <div style={{marginBottom:10}}><School size={40} color={C.muted}/></div>
          <div style={{fontWeight:800,color:C.blue,fontSize:15}}>No Groups Assigned</div>
          <div style={{color:C.muted,fontSize:13,marginTop:6}}>Ask the admin to assign you as a form staff or category staff to at least one group.</div>
        </Card>
      ):(
        <>
          {/* Group cards */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:14,marginBottom:20}}>
            {classes.map(c=>(
              <Card key={c.id} onClick={()=>setSelClass(c)}
                style={{borderTop:`4px solid ${c.sections?.color||C.blue}`,cursor:"pointer",
                  border:selClass?.id===c.id?`2px solid ${C.blue}`:`1px solid ${C.border}`,
                  background:selClass?.id===c.id?C.bluePale:C.white}}>
                <div style={{fontWeight:900,fontSize:15,color:C.blue,marginBottom:6}}>{c.name}</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <Badge color={C.orange}>{c.level}</Badge>
                  {c.sections&&<Badge color={c.sections.color||C.blue}>{c.sections.code}</Badge>}
                  {formClassIds.has(+c.id)
                    ?<Badge color={C.green}>Form Staff</Badge>
                    :<Badge color={C.blue}>Category Staff</Badge>}
                </div>
              </Card>
            ))}
          </div>

          {/* Members in selected class */}
          {selClass&&(
            <Card>
              <div style={{fontWeight:900,color:C.blue,fontSize:14,marginBottom:14}}>
                Members — {selClass.name}
                <span style={{fontSize:12,fontWeight:400,color:C.muted,marginLeft:8}}>{students.length} member{students.length!==1?"s":""}</span>
              </div>
              {students.length===0?(
                <div style={{textAlign:"center",padding:32,color:C.light,fontSize:13}}>No members in this group yet.</div>
              ):(
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                    <thead>
                      <tr style={{background:C.blue}}>
                        {["#","Member Name","ID","Email","DOB","Actions"].map(h=>(
                          <th key={h} style={{padding:"9px 12px",color:"#fff",textAlign:"left",fontSize:11,fontWeight:700}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((s,i)=>(
                        <tr key={s.id} style={{background:i%2===0?C.white:C.offWhite,borderBottom:`1px solid ${C.border}`}}>
                          <td style={{padding:"9px 12px",color:C.light,fontSize:11}}>{i+1}</td>
                          <td style={{padding:"9px 12px",fontWeight:700,color:C.text}}>
                            {fullName(s)}
                          </td>
                          <td style={{padding:"9px 12px",color:C.muted}}>{s.id}</td>
                          <td style={{padding:"9px 12px",color:C.muted,fontSize:12}}>{s.email||"—"}</td>
                          <td style={{padding:"9px 12px",color:C.muted,fontSize:12}}>{s.dob||"—"}</td>
                          <td style={{padding:"9px 12px"}}>
                            {canEditStudents&&formClassIds.has(+selClass.id)?(
                              <Btn xs onClick={()=>openEdit(s)} color={C.blue} outline>Edit</Btn>
                            ):(
                              <span style={{fontSize:10,color:C.light,fontStyle:"italic"}}>
                                {formClassIds.has(+selClass.id)?"No edit access":"View only (category staff)"}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {/* Edit student modal */}
      {editModal&&editStu&&(
        <Modal title={`Edit Member — ${editStu.id}`} onClose={()=>setEditModal(false)} width={440}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <Inp label="First Name *" value={stuForm.first_name} onChange={v=>setStuForm(p=>({...p,first_name:v}))} required/>
            <Inp label="Middle Name" value={stuForm.middle_name} onChange={v=>setStuForm(p=>({...p,middle_name:v}))}/>
            <Inp label="Last Name *" value={stuForm.last_name} onChange={v=>setStuForm(p=>({...p,last_name:v}))} required style={{gridColumn:"1/-1"}}/>
            <Inp label="Email" type="email" value={stuForm.email} onChange={v=>setStuForm(p=>({...p,email:v}))} style={{gridColumn:"1/-1"}}/>
            <Inp label="Date of Birth" type="date" value={stuForm.dob} onChange={v=>setStuForm(p=>({...p,dob:v}))}/>
            <Inp label="Phone" value={stuForm.phone} onChange={v=>setStuForm(p=>({...p,phone:v}))}/>
          </div>
          <div style={{marginTop:4,padding:"10px 14px",background:C.orangePale,borderRadius:8,
            fontSize:11,color:C.orange,border:`1px solid ${C.orange}40`}}>
            You can edit name, email, DOB and phone. To change group or admission details, contact the admin.
          </div>
          <div style={{display:"flex",gap:10,marginTop:16}}>
            <Btn onClick={saveStudent} color={C.orange} disabled={saving} style={{flex:1}}>
              {saving?"Saving…":"Save Changes"}
            </Btn>
            <Btn onClick={()=>setEditModal(false)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── RESULT APPROVALS PAGE ───────────────────────────────────────────────────
export function ResultApprovalsPage({ctx}){
  const {notify,role,user,canAccess}=ctx;
  const canMA=role==="admin"||canAccess("action:approve_ma");
  const canEA=role==="admin"||role==="teacher"||canAccess("action:approve_ea");
  const [tab,setTab]=useState("approvals");
  const [sessions,setSessions]=useState([]);
  const [terms,setTerms]=useState([]);
  const [classes,setClasses]=useState([]);
  const [selSession,setSelSession]=useState("");
  const [selTerm,setSelTerm]=useState("");
  const [approvals,setApprovals]=useState([]);
  const [students,setStudents]=useState([]);
  const [completeness,setCompleteness]=useState({});
  const [loading,setLoading]=useState(false);
  const [acting,setActing]=useState("");
  const [expandedClass,setExpandedClass]=useState(null);
  const [progressLoading,setProgressLoading]=useState(false);
  const [progressData,setProgressData]=useState(null);
  const [expandedProgress,setExpandedProgress]=useState(null);

  useEffect(()=>{
    Promise.all([db.getSessions(),db.getClasses()]).then(([s,c])=>{
      setSessions(s.data||[]);setClasses(c.data||[]);
      const active=s.data?.find(x=>x.is_active);
      if(active){
        setSelSession(String(active.id));
        db.getTerms(active.id).then(({data})=>{
          setTerms(data||[]);
          const at=data?.find(x=>x.is_active);
          if(at)setSelTerm(String(at.id));
        });
      }
    });
    db.getStudents().then(({data})=>setStudents(data||[]));
  },[]);

  const visibleClasses=useMemo(()=>classes,[classes]);

  const load=async()=>{
    if(!selSession||!selTerm)return;
    setLoading(true);
    const {data}=await db.getResultApprovals({term_id:+selTerm,session_id:+selSession});
    const approvalMap={};(data||[]).forEach(a=>{approvalMap[a.class_id]=a;});
    const cmpMap={};
    await Promise.all(visibleClasses.map(async cls=>{
      const [resCmp,clsSubs]=await Promise.all([
        db.getResultsCompleteness(cls.id,+selTerm,+selSession),
        db.getClassSubjectIds(cls.id),
      ]);
      const expectedIds=(clsSubs.data||[]).map(cs=>cs.section_subject_id);
      const subjectNames=(clsSubs.data||[]).reduce((m,cs)=>{if(cs.section_subjects)m[cs.section_subject_id]=cs.section_subjects.name;return m;},{});
      const byStudent={};
      (resCmp.data||[]).forEach(r=>{if(!byStudent[r.student_id])byStudent[r.student_id]=new Set();byStudent[r.student_id].add(r.subject_id);});
      const stuInClass=students.filter(s=>s.class_id===cls.id);
      if(!expectedIds.length||!stuInClass.length){
        cmpMap[cls.id]={complete:false,noSetup:true,studentsWithMissing:0,total:stuInClass.length,expected:expectedIds.length,studentSummary:[]};return;
      }
      let missingCount=0;
      const studentSummary=stuInClass.map(s=>{
        const done=byStudent[s.id]||new Set();
        const missing=expectedIds.filter(id=>!done.has(id)).map(id=>subjectNames[id]||`Category ${id}`);
        if(missing.length)missingCount++;
        return{id:s.id,name:s.name||s.id,missing};
      });
      cmpMap[cls.id]={complete:missingCount===0,noSetup:false,studentsWithMissing:missingCount,total:stuInClass.length,expected:expectedIds.length,studentSummary};
    }));
    setCompleteness(cmpMap);setApprovals(approvalMap);setLoading(false);
  };

  useEffect(()=>{if(selSession&&selTerm)load();},[selSession,selTerm,students]);
  useEffect(()=>{if(selSession&&selTerm&&tab==="progress")loadProgress();},[tab,selSession,selTerm,students]);
  useEffect(()=>{if(!selSession)return;db.getTerms(+selSession).then(({data})=>{setTerms(data||[]);setSelTerm("");});},[selSession]);

  const loadProgress=async()=>{
    if(!selSession||!selTerm)return;
    setProgressLoading(true);
    const[overviewRes,allSubjRes,ftRes]=await Promise.all([db.getResultsOverview(+selTerm,+selSession),db.getAllClassSubjects(),db.getAllFormTeachers()]);
    const resultsMap={};
    (overviewRes.data||[]).forEach(r=>{if(!resultsMap[r.class_id])resultsMap[r.class_id]={};if(!resultsMap[r.class_id][r.section_subject_id])resultsMap[r.class_id][r.section_subject_id]=new Set();resultsMap[r.class_id][r.section_subject_id].add(r.student_id);});
    const classSubjects={};
    (allSubjRes.data||[]).forEach(cs=>{if(!classSubjects[cs.class_id])classSubjects[cs.class_id]=[];classSubjects[cs.class_id].push({subject_id:cs.section_subject_id,name:cs.section_subjects?.name||'Unknown',code:cs.section_subjects?.code||''});});
    const formTeachers={};
    (ftRes.data||[]).forEach(ft=>{if(ft.class_id&&ft.teachers)formTeachers[ft.class_id]=ft.teachers.full_name||ft.teachers.staff_id||'—';});
    setProgressData({resultsMap,classSubjects,formTeachers});setProgressLoading(false);
  };

  const approveEA=async(cls)=>{
    setActing(`ea-${cls.id}`);
    const appr=approvals[cls.id];const isApproved=appr?.ea_status==="approved";
    if(isApproved){await db.revokeEA(cls.id,+selTerm,+selSession);notify("EA revoked for "+cls.name,"warn");}
    else{
      const cmp=completeness[cls.id];
      if(!cmp?.complete){notify("Results must be complete before approval — some members have missing scores","error");setActing("");return;}
      await db.approveEA(cls.id,+selTerm,+selSession,user?.supabase_uid||null);notify(`EA approved for ${cls.name}`);
    }
    setActing("");load();
  };

  const approveMA=async(cls)=>{
    if(!canMA){notify("You don't have permission to give Manager Approval","error");return;}
    const appr=approvals[cls.id];
    if(appr?.ea_status!=="approved"){notify("EA must be approved first","error");return;}
    setActing(`ma-${cls.id}`);
    const isApproved=appr?.ma_status==="approved";
    if(isApproved){await db.revokeMA(cls.id,+selTerm,+selSession);notify("MA revoked for "+cls.name,"warn");}
    else{
      const cmp=completeness[cls.id];
      if(!cmp?.complete){notify("Results must be complete before approval — some members have missing scores","error");setActing("");return;}
      await db.approveMA(cls.id,+selTerm,+selSession,user?.supabase_uid||null);notify(`MA approved for ${cls.name} — results fully locked`);
    }
    setActing("");load();
  };

  const filterTerms=terms.filter(t=>t.session_id===+selSession);
  const statusBadge=(status,type)=>{
    const ok=status==="approved";
    return(<span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:ok?C.greenPale:C.orangePale,color:ok?C.green:C.orange,border:`1px solid ${ok?C.green:C.orange}30`}}>{type}: {ok?"Approved":"Pending"}</span>);
  };

  const buildClassProgress=(cls)=>{
    if(!progressData)return null;
    const{resultsMap,classSubjects}=progressData;
    const subjects=classSubjects[cls.id]||[];
    const stuInClass=students.filter(s=>s.class_id===cls.id);
    const total=stuInClass.length;
    const stuIds=new Set(stuInClass.map(s=>String(s.id)));
    if(!subjects.length||!total)return{subjects:[],total,complete:0,partial:0,missing:0,noSetup:true};
    const clsResults=resultsMap[cls.id]||{};
    let complete=0,partial=0,missing=0;
    const subjectRows=subjects.map(subj=>{
      const uploaded=clsResults[subj.subject_id]||new Set();
      const count=[...stuIds].filter(id=>uploaded.has(id)||uploaded.has(+id)).length;
      const pct=total?Math.round((count/total)*100):0;
      const status=count===0?'missing':count<total?'partial':'complete';
      if(status==='complete')complete++;else if(status==='partial')partial++;else missing++;
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
      <div style={{display:"flex",gap:0,marginBottom:16,background:C.offWhite,borderRadius:10,padding:4,width:"fit-content",border:`1px solid ${C.border}`}}>
        {[{id:"approvals",label:"Approvals",icon:<ShieldCheck size={14}/>},{id:"progress",label:"Upload Progress",icon:<BarChart2 size={14}/>}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{display:"flex",alignItems:"center",gap:6,padding:"7px 16px",borderRadius:7,border:"none",
              background:tab===t.id?C.white:"transparent",color:tab===t.id?C.blue:C.muted,
              fontWeight:tab===t.id?800:500,fontSize:13,cursor:"pointer",
              boxShadow:tab===t.id?"0 1px 4px rgba(0,0,0,.1)":"none",transition:"all .15s"}}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>
      <Card style={{marginBottom:16}}>
        <div data-jd-columns="2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Sel label="Cycle" value={selSession} onChange={setSelSession} options={[{value:"",label:"— Select Cycle —"},...sessions.map(s=>({value:String(s.id),label:s.name}))]}/>
          <Sel label="Period" value={selTerm} onChange={setSelTerm} options={[{value:"",label:"— Select Period —"},...filterTerms.map(t=>({value:String(t.id),label:t.name}))]}/>
        </div>
      </Card>

      {tab==="progress"&&(!selSession||!selTerm?(
        <Card style={{textAlign:"center",padding:52}}><BarChart2 size={44} color={C.muted} style={{marginBottom:12}}/><div style={{fontWeight:800,color:C.blue,fontSize:16}}>Select Cycle and Period</div><div style={{color:C.muted,fontSize:13,marginTop:6}}>Choose a cycle and period to view upload progress</div></Card>
      ):progressLoading?<Spinner/>:(()=>{
        let totalClasses=0,doneClasses=0,partialClasses=0,notStartedClasses=0,noSetupClasses=0;
        const progressBySection={};
        visibleClasses.forEach(cls=>{
          const p=buildClassProgress(cls);if(!p)return;totalClasses++;
          if(p.noSetup){noSetupClasses++;return;}
          const allDone=p.complete===p.totalSubjects&&p.totalSubjects>0;
          const noneStarted=p.complete===0&&p.partial===0;
          if(allDone)doneClasses++;else if(noneStarted)notStartedClasses++;else partialClasses++;
          const secName=cls.sections?.name||'Other';
          if(!progressBySection[secName])progressBySection[secName]=[];
          progressBySection[secName].push({cls,p});
        });
        return(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:18}}>
              {[{label:"Fully Uploaded",value:doneClasses,color:C.green,bg:C.greenPale,icon:<CheckCircle2 size={18}/>},{label:"In Progress",value:partialClasses,color:C.orange,bg:C.orangePale,icon:<Clock size={18}/>},{label:"Not Started",value:notStartedClasses,color:C.red,bg:C.redPale,icon:<AlertCircle size={18}/>},{label:"Not Set Up",value:noSetupClasses,color:C.muted,bg:C.offWhite,icon:<MinusCircle size={18}/>}].map(s=>(
                <div key={s.label} style={{background:s.bg,border:`1px solid ${s.color}20`,borderRadius:10,padding:"12px 14px",display:"flex",alignItems:"center",gap:10}}>
                  <div style={{color:s.color}}>{s.icon}</div>
                  <div><div style={{fontSize:22,fontWeight:900,color:s.color,lineHeight:1}}>{s.value}</div><div style={{fontSize:11,color:s.color,fontWeight:600,marginTop:2}}>{s.label}</div></div>
                </div>
              ))}
            </div>
            {Object.entries(progressBySection).map(([secName,rows])=>(
              <div key={secName} style={{marginBottom:20}}>
                <div style={{fontWeight:800,fontSize:12,color:C.muted,textTransform:"uppercase",letterSpacing:.6,marginBottom:8,paddingLeft:2}}>{secName}</div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {rows.map(({cls,p})=>{
                    const allDone=p.complete===p.totalSubjects&&p.totalSubjects>0;
                    const noneStarted=p.complete===0&&p.partial===0&&p.totalSubjects>0;
                    const statusColor=allDone?C.green:noneStarted?C.red:C.orange;
                    const statusLabel=allDone?"Complete":noneStarted?"Not started":`${p.complete}/${p.totalSubjects} subjects done`;
                    const formTeacher=progressData?.formTeachers?.[cls.id];
                    const isOpen=expandedProgress===cls.id;
                    return(
                      <div key={cls.id} style={{background:C.white,border:`1.5px solid ${isOpen?statusColor:C.border}`,borderRadius:12,overflow:"hidden"}}>
                        <button onClick={()=>setExpandedProgress(isOpen?null:cls.id)}
                          style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"13px 16px",background:"transparent",border:"none",cursor:"pointer",textAlign:"left"}}>
                          <div style={{width:10,height:10,borderRadius:"50%",background:statusColor,flexShrink:0}}/>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontWeight:800,fontSize:14,color:C.text}}>{cls.name}</div>
                            <div style={{fontSize:11,color:C.muted,marginTop:1}}>{p.total} member{p.total!==1?"s":""}{formTeacher?<span> · <span style={{color:C.blue}}>Form staff: {formTeacher}</span></span>:null}</div>
                          </div>
                          <div style={{width:140,flexShrink:0}}>
                            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:10,fontWeight:700,color:statusColor}}>{statusLabel}</span></div>
                            <div style={{height:6,borderRadius:3,background:C.border,overflow:"hidden"}}><div style={{height:"100%",borderRadius:3,background:statusColor,width:`${p.totalSubjects?Math.round((p.complete/p.totalSubjects)*100):0}%`}}/></div>
                          </div>
                          <ChevronDown size={16} color={C.muted} style={{transform:isOpen?"rotate(180deg)":"none",flexShrink:0}}/>
                        </button>
                        {isOpen&&(
                          <div style={{borderTop:`1px solid ${C.border}`,background:C.offWhite}}>
                            <div style={{display:"flex",gap:14,padding:"8px 16px",borderBottom:`1px solid ${C.border}`}}>
                              {[["#22c55e","Complete"],["#f97316","Partial"],["#ef4444","Not started"]].map(([col,lbl])=>(
                                <div key={lbl} style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:C.muted}}><div style={{width:8,height:8,borderRadius:2,background:col,flexShrink:0}}/>{lbl}</div>
                              ))}
                            </div>
                            {p.subjects.map((subj,i)=>{
                              const sc={complete:"#22c55e",partial:"#f97316",missing:"#ef4444"}[subj.status];
                              const sbg={complete:"#f0fdf4",partial:"#fff7ed",missing:"#fef2f2"}[subj.status];
                              return(
                                <div key={subj.subject_id||`s-${i}`} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 16px",background:i%2===0?C.white:"transparent",borderBottom:i<p.subjects.length-1?`1px solid ${C.border}40`:"none"}}>
                                  <div style={{width:7,height:7,borderRadius:"50%",background:sc,flexShrink:0}}/>
                                  <div style={{flex:1,fontWeight:600,fontSize:13,color:C.text}}>{subj.name}</div>
                                  <div style={{width:120,flexShrink:0}}><div style={{height:5,borderRadius:3,background:C.border,overflow:"hidden"}}><div style={{height:"100%",borderRadius:3,background:sc,width:`${subj.pct}%`}}/></div></div>
                                  <div style={{fontSize:12,fontWeight:700,color:sc,width:60,textAlign:"right",flexShrink:0}}>{subj.count}/{subj.total}</div>
                                  <div style={{background:sbg,color:sc,border:`1px solid ${sc}30`,borderRadius:6,padding:"3px 10px",fontSize:10,fontWeight:700,width:90,textAlign:"center",flexShrink:0}}>{subj.status==="complete"?"Complete":subj.status==="partial"?`${subj.total-subj.count} missing`:"Not started"}</div>
                                </div>
                              );
                            })}
                            {p.subjects.length===0&&<div style={{padding:"14px 16px",fontSize:12,color:C.muted}}>No categories assigned.</div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {Object.keys(progressBySection).length===0&&<Card style={{textAlign:"center",padding:40}}><div style={{color:C.muted,fontSize:13}}>No groups found.</div></Card>}
          </div>
        );
      })())}

      {tab==="approvals"&&(loading?<Spinner/>:selSession&&selTerm?(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {visibleClasses.map(cls=>{
            const appr=approvals[cls.id]||{};const cmp=completeness[cls.id]||{};
            const eaOk=appr.ea_status==="approved";const maOk=appr.ma_status==="approved";
            const isExpanded=expandedClass===cls.id;
            const stuInClass=students.filter(s=>s.class_id===cls.id);
            return(
              <Card key={cls.id} style={{border:`2px solid ${maOk?C.green:eaOk?C.purple:C.border}`}}>
                <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                  <div style={{flex:1,minWidth:120}}>
                    <div style={{fontWeight:800,fontSize:14,color:C.blue}}>{cls.name}</div>
                    <div style={{fontSize:11,color:C.muted}}>{stuInClass.length} members</div>
                  </div>
                  <div style={{textAlign:"center"}}>
                    <div style={{fontSize:11,color:C.muted,marginBottom:3}}>Results</div>
                    <span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:cmp.noSetup?C.offWhite:cmp.complete?C.greenPale:C.redPale,color:cmp.noSetup?C.muted:cmp.complete?C.green:C.red,border:`1px solid ${cmp.noSetup?C.border:cmp.complete?C.green:C.red}30`}}>
                      {cmp.noSetup?"— Not set up":cmp.complete?"Complete":cmp.studentsWithMissing>0?`${cmp.studentsWithMissing} student${cmp.studentsWithMissing>1?"s":""} missing`:"—"}
                    </span>
                  </div>
                  <div style={{display:"flex",gap:6}}>{statusBadge(appr.ea_status||"pending","EA")}{statusBadge(appr.ma_status||"pending","MA")}</div>
                  <div style={{display:"flex",gap:6}}>
                    {canEA&&!maOk&&(<Btn xs onClick={()=>approveEA(cls)} color={eaOk?C.red:C.green} outline={eaOk} disabled={acting===`ea-${cls.id}`}>{acting===`ea-${cls.id}`?"…":eaOk?"Revoke EA":"Approve EA"}</Btn>)}
                    {canMA&&(<Btn xs onClick={()=>approveMA(cls)} color={maOk?C.red:C.purple} outline={maOk} disabled={acting===`ma-${cls.id}`||(!eaOk&&!maOk)}>{acting===`ma-${cls.id}`?"…":maOk?"Revoke MA":"Approve MA"}</Btn>)}
                    <Btn xs onClick={()=>setExpandedClass(isExpanded?null:cls.id)} color={C.blue} outline>{isExpanded?"Less":"Details"}</Btn>
                  </div>
                </div>
                {isExpanded&&(
                  <div style={{marginTop:14,paddingTop:14,borderTop:`1px solid ${C.border}`}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                      <div style={{background:C.offWhite,borderRadius:8,padding:"10px 14px"}}><div style={{fontSize:11,fontWeight:700,color:C.blue,marginBottom:4}}>EA Details</div><div style={{fontSize:12,color:C.text}}>{eaOk?`Approved by ${appr.ea_approver?.full_name||"Admin"} on ${new Date(appr.ea_approved_at).toLocaleDateString("en-NG")}`:"Not yet approved"}</div>{appr.ea_notes&&<div style={{fontSize:11,color:C.muted,marginTop:3,fontStyle:"italic"}}>{appr.ea_notes}</div>}</div>
                      <div style={{background:C.offWhite,borderRadius:8,padding:"10px 14px"}}><div style={{fontSize:11,fontWeight:700,color:C.purple,marginBottom:4}}>MA Details</div><div style={{fontSize:12,color:C.text}}>{maOk?`Approved by ${appr.ma_approver?.full_name||"Admin"} on ${new Date(appr.ma_approved_at).toLocaleDateString("en-NG")}`:"Not yet approved"}</div>{appr.ma_notes&&<div style={{fontSize:11,color:C.muted,marginTop:3,fontStyle:"italic"}}>{appr.ma_notes}</div>}</div>
                    </div>
                    {cmp.noSetup&&<div style={{background:C.offWhite,borderRadius:8,padding:"10px 14px",fontSize:12,color:C.muted}}>No categories or members assigned yet.</div>}
                    {!cmp.noSetup&&!cmp.complete&&cmp.studentsWithMissing>0&&(
                      <div style={{background:C.redPale,borderRadius:8,padding:"10px 14px",fontSize:12}}>
                        <div style={{fontWeight:700,color:C.red,marginBottom:8}}>Missing Results ({cmp.studentsWithMissing} member{cmp.studentsWithMissing>1?"s":""})</div>
                        <div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:180,overflowY:"auto"}}>
                          {(cmp.studentSummary||[]).filter(s=>s.missing.length>0).map(s=>(
                            <div key={s.id} style={{background:"rgba(255,255,255,.6)",borderRadius:6,padding:"6px 10px"}}><div style={{fontWeight:700,fontSize:12,color:C.text,marginBottom:3}}>{s.name}</div><div style={{fontSize:11,color:C.red}}>{s.missing.join(" · ")}</div></div>
                          ))}
                        </div>
                      </div>
                    )}
                    {!cmp.noSetup&&cmp.complete&&<div style={{background:C.greenPale,borderRadius:8,padding:"10px 14px",fontSize:12,color:C.green,fontWeight:600}}>All {cmp.total} members have results for all {cmp.expected} categories.</div>}
                  </div>
                )}
              </Card>
            );
          })}
          {visibleClasses.length===0&&<Card style={{textAlign:"center",padding:40}}><div style={{marginBottom:10}}><Lock size={40} color={C.muted}/></div><div style={{fontWeight:800,color:C.blue}}>No Groups Found</div></Card>}
        </div>
      ):(
        <Card style={{textAlign:"center",padding:52}}><div style={{marginBottom:10}}><ShieldCheck size={44} color={C.muted}/></div><div style={{fontWeight:800,color:C.blue,fontSize:16}}>Select Cycle and Period</div><div style={{color:C.muted,fontSize:13,marginTop:6}}>Choose a cycle and period to manage result approvals</div></Card>
      ))}
    </div>
  );
}

// ─── RESULTS HUB PAGE (admin only) ────────────────────────────────────────────
export function ResultsHubPage({ctx}){
  const [tab,setTab]=useState("results");
  const TABS=[
    {id:"results",   label:"Manage Results"},
    {id:"approvals", label:"Result Approvals"},
  ];
  return(
    <div>
      {/* Tab bar */}
      <div style={{display:"flex",gap:2,marginBottom:20,borderBottom:`2px solid ${C.border}`,paddingBottom:0}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"9px 20px",border:"none",background:"transparent",cursor:"pointer",
              fontWeight:700,fontSize:13,color:tab===t.id?C.blue:C.muted,position:"relative",
              borderBottom:tab===t.id?`2px solid ${C.blue}`:"2px solid transparent",
              marginBottom:-2,transition:"all .15s"}}>
            {t.label}
          </button>
        ))}
      </div>
      {tab==="results"   && <ResultsTeachPage ctx={ctx}/>}
      {tab==="approvals" && <ResultApprovalsPage ctx={ctx}/>}
    </div>
  );
}

// ─── GRADING PAGE ─────────────────────────────────────────────────────────────
