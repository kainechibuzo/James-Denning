/**
 * Dashboard domain: DashboardPage, StudentDashboard, MyProfilePage,
 * TeacherDashboard, SectionsPage, ManagerDashboard, BursarDashboard
 */
import React, { useState, useEffect, useContext } from "react";
import {
  Activity, AlertTriangle, BookUser, Check, CheckCircle, ChevronRight,
  ClipboardCheck, ClipboardList, Dot, DollarSign,
  Edit, GraduationCap, Info, Lock, Megaphone, Pencil, Save, School,
  Settings, ShieldCheck, Trash2, Upload, Users, XCircle, Zap,
} from "lucide-react";
import { db } from "../supabaseClient.js";
import { C } from "../config/theme.js";
import { SectionCtx, useSection } from "../contexts/section.jsx";
import { useConfirm } from "../contexts/confirm.jsx";
import {
  Logo, Card, Btn, Badge, Inp, Modal, StatCard, Spinner, AppIcon,
} from "../components/ui.jsx";
import { fmt } from "../utils/grades.js";

function getGreeting(name){
  const h=new Date().getHours();
  const n=(name||"").split(" ")[0]||"there";
  if(h>=5&&h<12) return `Good morning, ${n}.`;
  if(h>=12&&h<17) return `Good afternoon, ${n}.`;
  return `Good evening, ${n}.`;
}

export function DashboardPage({ctx}){
  const {user,role,notify,setPage,setPageParam,selectedSection,pendingApprovals,refreshKey}=ctx;
  const sectionCtx=useContext(SectionCtx);
  const [stats,setStats]=useState({students:0,teachers:0,classes:0,results:0});
  const [announcements,setAnnouncements]=useState([]);
  const [feeStats,setFeeStats]=useState({totalBilled:0,totalPaid:0,totalBalance:0,paidCount:0,partialCount:0,unpaidCount:0});
  const [recentActivity,setRecentActivity]=useState([]);
  const [termChecklist,setTermChecklist]=useState(null); // {term,year,sections:[{id,name,classes:[{id,name,total,billed}]}]}
  const [checklistHideComplete,setChecklistHideComplete]=useState(false);
  const [healthChecks,setHealthChecks]=useState(null); // array of {id,severity,title,detail,page,ok}
  const [healthHideOk,setHealthHideOk]=useState(false);
  const [classStatusGrid,setClassStatusGrid]=useState(null); // {term,year,sections:[{id,name,classes:[{id,name,hasResults,ea,ma,published}]}]}
  const [classStatusHideDone,setClassStatusHideDone]=useState(false);

  useEffect(()=>{
    // Dashboard always shows school-wide totals — no section filtering
    Promise.all([
      db.countStudents(),
      db.getTeachers(),
      db.getClasses(),
      db.countEAApprovedActive(),
      db.getAnnouncements(),
      db.getFeeBills(),
      db.getAdminAuditLog({limit:8}),
      db.getSessions(),
    ]).then(async([sc,t,c,ea,a,bills,audit,sess])=>{
      setStats({
        students:sc.count,
        teachers:(t.data||[]).length,
        classes:(c.data||[]).length,
        results:ea.count,
      });
      setAnnouncements((a.data||[]).slice(0,4));
      // Fee analytics
      const bs=bills.data||[];
      const money_=v=>parseFloat(v)||0;
      let totalBilled=0,totalPaid=0,paidCount=0,partialCount=0,unpaidCount=0;
      bs.forEach(b=>{
        // Compute live totals — don't trust stale DB bill.total_amount / bill.status
        const _sub=(b.fee_bill_items||[]).filter(x=>x.is_included).reduce((a,x)=>a+money_(x.amount),0);
        const _disc=(b.fee_discounts||[]).reduce((a,d)=>a+money_(d.amount),0);
        const _tot=Math.max(0,_sub-_disc);
        const _pd=money_(b.amount_paid);
        const _stat=_pd<=0?'unpaid':Math.max(0,_tot-_pd)<=0?'paid':'partial';
        totalBilled+=_tot;
        totalPaid+=_pd;
        if(_stat==='paid')paidCount++;
        else if(_stat==='partial')partialCount++;
        else unpaidCount++;
      });
      setFeeStats({totalBilled,totalPaid,totalBalance:totalBilled-totalPaid,paidCount,partialCount,unpaidCount});
      setRecentActivity(audit.data||[]);
      // ── Shared data fetch (term checklist + portal health) ──
      const[
        {data:stuData},
        {data:sectData},
        {data:formTeachersData},
        {data:classSubjData},
        {data:gradingData},
        {data:reportTmplData},
      ]=await Promise.all([
        db.getStudents(),
        db.getSections(false),
        db.getAllFormTeachers(),
        db.getAllClassSubjects(),
        db.getGradingSchema(),
        db.getReportTemplates(),
      ]);
      // ── Term-start bill checklist ──
      const activeSess=(sess.data||[]).find(s=>s.is_active);
      let activeTermObj=null;
      if(activeSess){
        const{data:terms}=await db.getTerms(activeSess.id);
        activeTermObj=terms?.find(t=>t.is_active)||null;
        if(activeTermObj){
          // Fetch billing, approvals, publish status and result presence all in parallel
          const[
            {data:billedData},
            {data:approvalsData},
            {data:publishesData},
            {data:resultCidsData},
          ]=await Promise.all([
            db.getBilledStudentIdsForTerm(activeSess.name,activeTermObj.name),
            db.getAllResultApprovalsForTerm(activeTermObj.id,activeSess.id),
            db.getAllReportPublishesForTerm(activeTermObj.id,activeSess.id),
            db.getResultClassIds(activeTermObj.id,activeSess.id),
          ]);
          // ── Term-start bill checklist ──
          const billedSet=new Set((billedData||[]).map(b=>b.student_id));
          const allClasses=c.data||[];
          const allStudents=stuData||[];
          const classRows=allClasses.map(cls=>{
            const clsStudents=allStudents.filter(s=>s.class_id===cls.id&&(s.status||"active")==="active");
            const billedCount=clsStudents.filter(s=>billedSet.has(s.id)).length;
            return{id:cls.id,name:cls.name,section_id:cls.section_id,
              total:clsStudents.length,billed:billedCount,
              complete:clsStudents.length>0&&billedCount>=clsStudents.length,
              partial:billedCount>0&&billedCount<clsStudents.length,
            };
          }).filter(r=>r.total>0);
          const sectionMap={};
          classRows.forEach(r=>{
            const key=r.section_id??0;
            if(!sectionMap[key])sectionMap[key]={
              id:key,
              name:(sectData||[]).find(s=>s.id===r.section_id)?.name||"Ungrouped",
              classes:[],
            };
            sectionMap[key].classes.push(r);
          });
          const sections=Object.values(sectionMap).sort((a,b)=>a.name.localeCompare(b.name));
          setTermChecklist({term:activeTermObj.name,year:activeSess.name,sections});
          // ── Group status grid (Results / EA / MA / Published) ──
          {
            const approvalMap={};
            (approvalsData||[]).forEach(a=>{approvalMap[a.class_id]=a;});
            const publishMap={};
            (publishesData||[]).forEach(p=>{publishMap[p.class_id]=p.is_published;});
            const resultCidSet=new Set(resultCidsData||[]);
            const gridRows=allClasses
              .filter(cls=>allStudents.some(s=>s.class_id===cls.id&&(s.status||"active")==="active"))
              .map(cls=>{
                const appr=approvalMap[cls.id];
                return{
                  id:cls.id,name:cls.name,section_id:cls.section_id,
                  hasResults:resultCidSet.has(cls.id),
                  ea:appr?.ea_status==="approved",
                  ma:appr?.ma_status==="approved",
                  published:!!publishMap[cls.id],
                };
              });
            const gridSecMap={};
            gridRows.forEach(r=>{
              const key=r.section_id??0;
              if(!gridSecMap[key])gridSecMap[key]={
                id:key,
                name:(sectData||[]).find(s=>s.id===r.section_id)?.name||"Ungrouped",
                classes:[],
              };
              gridSecMap[key].classes.push(r);
            });
            const gridSections=Object.values(gridSecMap).sort((a,b)=>a.name.localeCompare(b.name));
            setClassStatusGrid({term:activeTermObj.name,year:activeSess.name,sections:gridSections});
          }
        }
      }
      // ── Portal health checks ──
      {
        const allC=c.data||[];
        const allS=stuData||[];
        const formTeacherClassIds=new Set((formTeachersData||[]).map(ft=>ft.class_id));
        const classSubjClassIds=new Set((classSubjData||[]).map(cs=>cs.class_id));
        // Only check classes that actually have active students (no point flagging empty placeholder classes)
        const activeClasses=allC.filter(cls=>allS.some(s=>s.class_id===cls.id&&(s.status||"active")==="active"));
        const noFormTeacher=activeClasses.filter(cls=>!formTeacherClassIds.has(cls.id));
        const noSubjects=activeClasses.filter(cls=>!classSubjClassIds.has(cls.id));
        const hasGrading=(gradingData||[]).length>0;
        const hasReportTemplates=(reportTmplData||[]).length>0;
        const hasDefaultReportTmpl=(reportTmplData||[]).some(t=>t.is_default);
        const studentsNoEmail=allS.filter(s=>(s.status||"active")==="active"&&!s.email);
        const fmt=(n,singular,plural)=>`${n} ${n===1?singular:plural}`;
        const listNames=(arr,max=5)=>arr.slice(0,max).map(x=>x.name).join(", ")+(arr.length>max?` and ${arr.length-max} more`:"");
        const checks=[
          {
            id:"active_session",
            severity:"critical",
            title:activeSess?"Active session is set":"No active session set",
            detail:activeSess?`Current session: ${activeSess.name}`:"An active academic session is required for results, fees, and report cards to function.",
            page:"settings",
            ok:!!activeSess,
          },
          {
            id:"active_term",
            severity:"critical",
            title:activeTermObj?"Active term is set":"No active term set",
            detail:activeTermObj?`Current term: ${activeTermObj.name} · ${activeSess?.name||""}`:"An active term must be set within the active session. Go to Settings → Sessions & Terms.",
            page:"settings",
            ok:!!activeTermObj,
          },
          {
            id:"grading_schema",
            severity:"warning",
            title:hasGrading?"Grading schema is configured":"No grading schema configured",
            detail:hasGrading?"Grade boundaries and descriptions are defined.":"A grading schema (A, B, C grades + score ranges) is required to generate report cards. Set it up in the Grading page.",
            page:"grading",
            ok:hasGrading,
          },
          {
            id:"classes_no_form_teacher",
            severity:"warning",
            title:activeClasses.length===0
              ?"No classes set up yet"
              :noFormTeacher.length===0
                ?"All active classes have a form teacher"
                :fmt(noFormTeacher.length,"active class has","active classes have")+" no form teacher assigned",
            detail:activeClasses.length===0
              ?"Add classes and enrol students before assigning form teachers."
              :noFormTeacher.length===0
                ?"Every class with enrolled students has a form teacher."
                :listNames(noFormTeacher),
            page:"teachers",
            ok:activeClasses.length>0&&noFormTeacher.length===0,
          },
          {
            id:"classes_no_subjects",
            severity:"warning",
            title:activeClasses.length===0
              ?"No classes set up yet"
              :noSubjects.length===0
                ?"All active classes have subjects assigned"
                :fmt(noSubjects.length,"active class has","active classes have")+" no subjects assigned",
            detail:activeClasses.length===0
              ?"Add classes and enrol students before assigning subjects."
              :noSubjects.length===0
                ?"Every class with enrolled students has subjects linked."
                :"Without subjects, teachers cannot enter results and report cards cannot be generated. "+listNames(noSubjects),
            page:"settings",
            ok:activeClasses.length>0&&noSubjects.length===0,
          },
          {
            id:"report_template",
            severity:"info",
            title:!hasReportTemplates
              ?"No report card template created"
              :hasDefaultReportTmpl?"A default report card template is set":"No default report card template set",
            detail:!hasReportTemplates
              ?"A report card template defines the layout of student report cards."
              :hasDefaultReportTmpl
                ?"Report cards will use the default template."
                :"Set a default report card template in Settings → Academic.",
            page:"settings",
            ok:hasDefaultReportTmpl,
          },
          {
            id:"students_no_email",
            severity:"info",
            title:allS.filter(s=>(s.status||"active")==="active").length===0
              ?"No active students enrolled yet"
              :studentsNoEmail.length===0
                ?"All active students have email addresses"
                :fmt(studentsNoEmail.length,"active student has","active students have")+" no email address",
            detail:allS.filter(s=>(s.status||"active")==="active").length===0
              ?"Enrol students to track email coverage."
              :studentsNoEmail.length===0
                ?"Every active student can receive emails for report cards and fee reminders."
                :"These students cannot receive report cards, fee reminders, or login links by email.",
            page:"students",
            param:{filter:"no_email"},
            ok:allS.filter(s=>(s.status||"active")==="active").length>0&&studentsNoEmail.length===0,
          },
        ];
        setHealthChecks(checks);
      }
    }).catch(err=>console.error('[Dashboard] load failed:',err));
  },[refreshKey]);

  return(
    <div>
      <div style={{background:`linear-gradient(135deg,${C.blueDark} 0%,${C.blue} 60%,#1e6bb8 100%)`,
        borderRadius:20,padding:"24px 28px",marginBottom:20,color:"#fff",position:"relative",overflow:"hidden",
        boxShadow:`0 8px 32px ${C.blue}40`}}>
        {/* Decorative orbs */}
        <div style={{position:"absolute",right:-30,top:-30,width:160,height:160,borderRadius:"50%",
          background:"rgba(255,255,255,.05)",pointerEvents:"none"}}/>
        <div style={{position:"absolute",right:60,bottom:-40,width:120,height:120,borderRadius:"50%",
          background:"rgba(232,86,10,.1)",pointerEvents:"none"}}/>
        <div style={{position:"absolute",right:20,top:"50%",transform:"translateY(-50%)",opacity:.06,pointerEvents:"none"}}>
          <Logo size={140}/>
        </div>
        <div style={{position:"absolute",bottom:0,left:0,right:0,height:3,
          background:`linear-gradient(90deg,${C.orange},#FF7A35,${C.green})`,borderRadius:"0 0 20px 20px"}}/>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
          <div>
            <div style={{fontSize:11,color:"rgba(147,197,253,.9)",fontWeight:700,textTransform:"uppercase",
              letterSpacing:1.6,marginBottom:6,display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:C.orange,
                boxShadow:`0 0 8px ${C.orange}`}}/>
              {sectionCtx?.schoolName||"Your School"}
            </div>
            <div style={{fontSize:24,fontWeight:900,marginBottom:5,letterSpacing:"-.02em"}}>{getGreeting(user.name)}</div>
            <div style={{fontSize:12,color:"rgba(147,197,253,.8)",display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}}>
              <span>{new Date().toLocaleDateString("en-NG",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</span>
              <span style={{opacity:.5}}>·</span>
              <span>{new Date().toLocaleTimeString("en-NG",{hour:"2-digit",minute:"2-digit"})}</span>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,flexShrink:0}}>
            <div style={{background:"rgba(255,255,255,.12)",backdropFilter:"blur(8px)",
              border:"1px solid rgba(255,255,255,.2)",borderRadius:10,padding:"5px 12px",
              fontSize:11,fontWeight:700,color:"#fff",textTransform:"uppercase",letterSpacing:.6}}>
              {role==="admin"?"Administrator":role==="teacher"?"Staff":role==="manager"?"Manager":role==="bursar"?"Bursar":"Member"}
            </div>
            {user.staff_id&&<div style={{fontSize:11,color:"rgba(255,255,255,.5)"}}>Staff ID: {user.staff_id}</div>}
            {user.student_id&&<div style={{fontSize:11,color:"rgba(255,255,255,.5)"}}>Member ID: {user.student_id}</div>}
          </div>
        </div>
      </div>

      {role==="admin"&&(
        <>
          <div className="stat-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:13,marginBottom:20}}>
            <StatCard label="Members"      value={stats.students}  icon={<Users size={18} color={C.blue}/>} color={C.blue}/>
            <StatCard label="Staff"      value={stats.teachers}  icon={<BookUser size={18} color={C.green}/>} color={C.green}/>
            <StatCard label="Groups"       value={stats.classes}   icon={<School size={18} color={C.orange}/>} color={C.orange}/>
            <StatCard label="EA Approved"   value={stats.results}   icon={<CheckCircle size={18} color={C.purple}/>} color={C.purple}/>
          </div>
          {/* Fee analytics bar */}
          {(feeStats.totalBilled>0)&&(
            <Card style={{marginBottom:16,padding:"18px 22px"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:8}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:32,height:32,borderRadius:9,background:C.blue+"14",
                    display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <AppIcon name="fee-tracker" size={15} color={C.blue}/>
                  </div>
                  <div style={{fontWeight:800,color:C.text,fontSize:14}}>Fee Collection Overview</div>
                </div>
                {feeStats.totalBilled>0&&(
                  <div style={{background:C.greenPale,border:`1px solid ${C.green}30`,borderRadius:20,
                    padding:"4px 12px",fontSize:12,fontWeight:700,color:C.green}}>
                    {Math.round(feeStats.totalPaid/feeStats.totalBilled*100)}% collected
                  </div>
                )}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:14}}>
                {[
                  {label:"Total Billed",value:"₦"+feeStats.totalBilled.toLocaleString("en-NG"),color:C.blue,bg:C.bluePale},
                  {label:"Collected",value:"₦"+feeStats.totalPaid.toLocaleString("en-NG"),color:C.green,bg:C.greenPale},
                  {label:"Outstanding",value:"₦"+feeStats.totalBalance.toLocaleString("en-NG"),color:C.red,bg:C.redPale},
                  {label:"Fully Paid",value:feeStats.paidCount+" bills",color:C.green,bg:C.greenPale},
                  {label:"Partial",value:feeStats.partialCount+" bills",color:C.amber,bg:C.amberPale},
                  {label:"Unpaid",value:feeStats.unpaidCount+" bills",color:C.red,bg:C.redPale},
                ].map(s=>(
                  <div key={s.label} style={{background:s.bg,borderRadius:10,padding:"10px 12px",
                    border:`1px solid ${s.color}18`}}>
                    <div style={{fontSize:10.5,color:C.muted,fontWeight:700,marginBottom:4,textTransform:"uppercase",letterSpacing:.6}}>{s.label}</div>
                    <div style={{fontSize:15,fontWeight:900,color:s.color}}>{s.value}</div>
                  </div>
                ))}
              </div>
              {feeStats.totalBilled>0&&(
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.muted,marginBottom:5}}>
                    <span style={{fontWeight:600}}>Collection Progress</span>
                    <span style={{fontWeight:800,color:C.green}}>{Math.round(feeStats.totalPaid/feeStats.totalBilled*100)}%</span>
                  </div>
                  <div style={{height:8,borderRadius:4,background:C.border,overflow:"hidden"}}>
                    <div style={{height:"100%",borderRadius:4,
                      background:`linear-gradient(90deg,${C.green},#22c55e)`,
                      width:`${Math.min(100,feeStats.totalPaid/feeStats.totalBilled*100)}%`,
                      transition:"width .6s cubic-bezier(.4,0,.2,1)"}}/>
                  </div>
                </div>
              )}
            </Card>
          )}
          {pendingApprovals>0&&(
            <div onClick={()=>setPage("approvals")}
              style={{background:`linear-gradient(135deg,${C.orange},#f97316)`,borderRadius:12,
                padding:"14px 20px",marginBottom:16,cursor:"pointer",
                display:"flex",alignItems:"center",gap:14,color:"#fff",
                boxShadow:`0 4px 18px ${C.orange}55`}}>
              <span style={{fontSize:28}}>⏳</span>
              <div style={{flex:1}}>
                <div style={{fontWeight:900,fontSize:15}}>
                  {pendingApprovals} Member Request{pendingApprovals>1?"s":""} Awaiting Approval
                </div>
                <div style={{fontSize:12,opacity:.85,marginTop:2}}>
                  Staff-submitted student additions are pending your review — click to review now
                </div>
              </div>
              <span style={{fontSize:20,opacity:.7}}>›</span>
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:"3fr 2fr",gap:16,marginBottom:16}}>
            <Card>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                <div style={{width:30,height:30,borderRadius:8,background:C.blue+"12",
                  display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <Zap size={14} color={C.blue}/>
                </div>
                <div style={{fontWeight:800,color:C.text,fontSize:14}}>Quick Actions</div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {[
                  {l:"Members",          i:"members",p:"members",   color:C.blue},
                  {l:"Enter Results",    i:"results",p:"results-admin",color:C.purple},
                  {l:"Payment Tracker",  i:"fee-tracker",p:"fee-tracker",color:C.green},
                  {l:"Promotions",       i:"bulk-promote",p:"bulk-promote",color:C.orange},
                  {l:"Announcements",    i:"announce",p:"announce",  color:C.teal},
                  {l:"Transcript",       i:"transcript",p:"transcript",color:C.amber},
                ].map(a=>(
                  <button key={a.l} onClick={()=>setPage(a.p)}
                    style={{display:"flex",alignItems:"center",gap:8,background:a.color+"0e",
                      border:`1px solid ${a.color}18`,color:a.color,padding:"10px 12px",
                      borderRadius:10,cursor:"pointer",fontSize:12,fontWeight:700,textAlign:"left",
                      transition:"all .15s"}}
                    onMouseEnter={e=>{e.currentTarget.style.background=a.color+"1e";e.currentTarget.style.borderColor=a.color+"40";e.currentTarget.style.transform="translateY(-1px)";}}
                    onMouseLeave={e=>{e.currentTarget.style.background=a.color+"0e";e.currentTarget.style.borderColor=a.color+"18";e.currentTarget.style.transform="none";}}>
                    <div style={{width:24,height:24,borderRadius:6,background:a.color+"18",
                      display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <AppIcon name={a.i} size={13} color={a.color}/>
                    </div>
                    {a.l}
                  </button>
                ))}
              </div>
            </Card>
            <Card>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                <div style={{width:30,height:30,borderRadius:8,background:C.orange+"12",
                  display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <Megaphone size={14} color={C.orange}/>
                </div>
                <div style={{fontWeight:800,color:C.text,fontSize:14}}>Announcements</div>
              </div>
              {announcements.length===0&&(
                <div style={{color:C.light,fontSize:12,textAlign:"center",padding:"16px 8px",
                  background:C.offWhite,borderRadius:10,border:`1px dashed ${C.border}`}}>
                  No announcements yet
                </div>
              )}
              {announcements.map((a,i)=>(
                <div key={a.id} style={{padding:"9px 0",
                  borderBottom:i<announcements.length-1?`1px solid ${C.border}`:"none"}}>
                  <div style={{fontWeight:700,color:C.text,fontSize:12,lineHeight:1.3}}>{a.title}</div>
                  <div style={{color:C.muted,marginTop:3,fontSize:11.5,lineHeight:1.4}}>
                    {a.body?.slice(0,65)}{a.body?.length>65?"…":""}
                  </div>
                </div>
              ))}
            </Card>
          </div>
          {/* ── Portal health checklist ── */}
          {healthChecks!==null&&(()=>{
            const issues=healthChecks.filter(h=>!h.ok);
            const allGood=issues.length===0;
            const criticals=issues.filter(h=>h.severity==="critical");
            const warnings=issues.filter(h=>h.severity==="warning");
            const infos=issues.filter(h=>h.severity==="info");
            const borderColor=allGood?C.green:criticals.length>0?C.red:warnings.length>0?C.amber:"#3b82f6";
            const visible=healthHideOk?healthChecks.filter(h=>!h.ok):healthChecks;
            const pct=Math.round(healthChecks.filter(h=>h.ok).length/healthChecks.length*100);
            const sevColor=s=>s==="critical"?C.red:s==="warning"?C.amber:"#3b82f6";
            const sevBg=s=>s==="critical"?C.redPale:s==="warning"?C.orangePale:C.bluePale;
            return(
              <Card style={{marginBottom:16,border:`2px solid ${borderColor}`}}>
                {/* Header */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <ShieldCheck size={17} color={borderColor}/>
                    <span style={{fontWeight:800,color:borderColor,fontSize:14}}>Portal Setup Health</span>
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                    {allGood?(
                      <span style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:C.greenPale,color:C.green,fontWeight:700}}>
                        ✓ All checks passed
                      </span>
                    ):(
                      <>
                        {criticals.length>0&&<span style={{fontSize:11,padding:"3px 9px",borderRadius:20,background:C.redPale,color:C.red,fontWeight:700}}>
                          ✕ {criticals.length} critical
                        </span>}
                        {warnings.length>0&&<span style={{fontSize:11,padding:"3px 9px",borderRadius:20,background:C.orangePale,color:C.amber,fontWeight:700}}>
                          ⚠ {warnings.length} warning{warnings.length!==1?"s":""}
                        </span>}
                        {infos.length>0&&<span style={{fontSize:11,padding:"3px 9px",borderRadius:20,background:C.bluePale,color:C.blue,fontWeight:700}}>
                          ℹ {infos.length} note{infos.length!==1?"s":""}
                        </span>}
                      </>
                    )}
                    {!allGood&&<button onClick={()=>setHealthHideOk(p=>!p)}
                      style={{fontSize:11,padding:"3px 9px",borderRadius:20,cursor:"pointer",fontWeight:600,
                        border:`1px solid ${C.border}`,background:C.white,color:C.muted}}>
                      {healthHideOk?"Show all":"Hide resolved"}
                    </button>}
                  </div>
                </div>
                {/* Progress bar */}
                <div style={{height:6,background:C.offWhite,borderRadius:3,overflow:"hidden",marginBottom:12,border:`1px solid ${C.border}`}}>
                  <div style={{height:"100%",width:`${pct}%`,
                    background:allGood?C.green:pct>=75?C.amber:C.red,
                    borderRadius:3,transition:"width .3s"}}/>
                </div>
                {/* Check items */}
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  {visible.map(h=>{
                    const col=h.ok?C.green:sevColor(h.severity);
                    const bg=h.ok?C.greenPale:sevBg(h.severity);
                    const ItemIcon=h.ok
                      ?<CheckCircle size={14} color={C.green}/>
                      :h.severity==="critical"
                        ?<XCircle size={14} color={C.red}/>
                        :h.severity==="warning"
                          ?<AlertTriangle size={14} color={C.amber}/>
                          :<Info size={14} color="#3b82f6"/>;
                    return(
                      <div key={h.id} style={{display:"flex",alignItems:"flex-start",gap:9,
                        padding:"9px 11px",background:bg,borderRadius:8,border:`1px solid ${col}33`}}>
                        <span style={{flexShrink:0,marginTop:1}}>{ItemIcon}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:12,fontWeight:700,color:h.ok?C.green:col,lineHeight:1.3}}>
                            {h.title}
                          </div>
                          <div style={{fontSize:11,color:C.muted,marginTop:2,lineHeight:1.4}}>
                            {h.detail}
                          </div>
                        </div>
                        {!h.ok&&(
                          <button onClick={()=>{if(h.param)setPageParam(h.param);setPage(h.page);}}
                            style={{flexShrink:0,fontSize:11,fontWeight:700,padding:"4px 10px",
                              borderRadius:6,cursor:"pointer",border:`1px solid ${col}`,
                              background:C.white,color:col,whiteSpace:"nowrap"}}>
                            Fix →
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })()}
          {/* ── Group status grid (Results / EA / MA / Published) ── */}
          {classStatusGrid&&(()=>{
            const allCls=classStatusGrid.sections.flatMap(s=>s.classes);
            const fullyDone=allCls.filter(r=>r.hasResults&&r.ea&&r.ma&&r.published).length;
            const total=allCls.length;
            const allGood=fullyDone===total;
            const pct=total>0?Math.round(fullyDone/total*100):0;
            const borderColor=allGood?C.green:pct>=50?C.amber:C.red;
            // Status badge helper
            const Dot=({ok,label})=>(
              <span style={{fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:4,
                background:ok?C.greenPale:C.redPale,
                color:ok?C.green:C.red,border:`1px solid ${ok?C.green:C.red}33`,
                whiteSpace:"nowrap"}}>
                {ok?"✓":"✕"} {label}
              </span>
            );
            return(
              <Card style={{marginBottom:16,border:`2px solid ${borderColor}`}}>
                {/* Header */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <ClipboardCheck size={17} color={borderColor}/>
                    <span style={{fontWeight:800,color:borderColor,fontSize:14}}>
                      Group Report Status — {classStatusGrid.term} · {classStatusGrid.year}
                    </span>
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                    <span style={{fontSize:11,padding:"3px 9px",borderRadius:20,
                      background:C.greenPale,color:C.green,fontWeight:700}}>
                      ✓ {fullyDone} ready
                    </span>
                    {fullyDone<total&&<span style={{fontSize:11,padding:"3px 9px",borderRadius:20,
                      background:C.redPale,color:C.red,fontWeight:700}}>
                      ✕ {total-fullyDone} incomplete
                    </span>}
                    <button onClick={()=>setClassStatusHideDone(p=>!p)}
                      style={{fontSize:11,padding:"3px 9px",borderRadius:20,cursor:"pointer",fontWeight:600,
                        border:`1px solid ${C.border}`,background:C.white,color:C.muted}}>
                      {classStatusHideDone?"Show all":"Hide complete"}
                    </button>
                  </div>
                </div>
                {/* Progress bar */}
                <div style={{height:6,background:C.offWhite,borderRadius:3,overflow:"hidden",marginBottom:14,border:`1px solid ${C.border}`}}>
                  <div style={{height:"100%",width:`${pct}%`,
                    background:allGood?C.green:pct>=50?C.amber:C.red,
                    borderRadius:3,transition:"width .3s"}}/>
                </div>
                {/* Legend */}
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                  {[{label:"Results",color:C.blue},{label:"EA",color:C.purple},{label:"MA",color:C.orange},{label:"Published",color:C.green}].map(l=>(
                    <span key={l.label} style={{fontSize:10,color:C.muted,padding:"2px 8px",
                      borderRadius:4,background:C.offWhite,border:`1px solid ${C.border}`,fontWeight:600}}>
                      {l.label}
                    </span>
                  ))}
                  <span style={{fontSize:10,color:C.muted,marginLeft:4,alignSelf:"center"}}>← status per group</span>
                </div>
                {/* Sections + classes */}
                <div style={{display:"flex",flexDirection:"column",gap:14,maxHeight:480,overflowY:"auto"}}>
                  {classStatusGrid.sections.map(sec=>{
                    const visible=classStatusHideDone
                      ?sec.classes.filter(r=>!(r.hasResults&&r.ea&&r.ma&&r.published))
                      :sec.classes;
                    if(!visible.length)return null;
                    const secDone=sec.classes.filter(r=>r.hasResults&&r.ea&&r.ma&&r.published).length;
                    return(
                      <div key={sec.id}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                          marginBottom:6,padding:"4px 8px",background:C.offWhite,borderRadius:6}}>
                          <span style={{fontSize:11,fontWeight:800,color:C.muted,textTransform:"uppercase",letterSpacing:.7}}>
                            {sec.name}
                          </span>
                          <span style={{fontSize:11,color:C.muted,fontWeight:600}}>{secDone}/{sec.classes.length} complete</span>
                        </div>
                        <div style={{display:"flex",flexDirection:"column",gap:5}}>
                          {visible.map(r=>{
                            const done=r.hasResults&&r.ea&&r.ma&&r.published;
                            return(
                              <div key={r.id} style={{display:"flex",alignItems:"center",gap:8,
                                padding:"7px 10px",borderRadius:7,
                                background:done?C.greenPale:C.offWhite,
                                border:`1px solid ${done?C.green:C.border}`}}>
                                <div style={{fontWeight:700,fontSize:12,color:C.text,minWidth:120,flex:"0 0 auto"}}>
                                  {r.name}
                                </div>
                                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                                  <Dot ok={r.hasResults} label="Results"/>
                                  <Dot ok={r.ea} label="EA"/>
                                  <Dot ok={r.ma} label="MA"/>
                                  <Dot ok={r.published} label="Published"/>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {!allGood&&(
                  <div style={{marginTop:12,display:"flex",justifyContent:"flex-end"}}>
                    <Btn xs color={C.blue} onClick={()=>setPage("report-cards")}>
                      Go to Report Cards →
                    </Btn>
                  </div>
                )}
              </Card>
            );
          })()}
          {/* ── Term-start bill checklist ── */}
          {termChecklist&&(()=>{
            const allClasses=termChecklist.sections.flatMap(s=>s.classes);
            const doneCnt=allClasses.filter(r=>r.complete).length;
            const partialCnt=allClasses.filter(r=>r.partial).length;
            const pendingCnt=allClasses.filter(r=>!r.complete&&!r.partial).length;
            const total=allClasses.length;
            const allDone=doneCnt===total;
            const pct=total>0?Math.round(doneCnt/total*100):0;
            const borderColor=allDone?C.green:pendingCnt>0?C.amber:C.orange;
            return(
              <Card style={{marginBottom:16,border:`2px solid ${borderColor}`}}>
                {/* Header */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <ClipboardList size={17} color={borderColor}/>
                    <span style={{fontWeight:800,color:borderColor,fontSize:14}}>
                      Term-Start Billing — {termChecklist.term} · {termChecklist.year}
                    </span>
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                    {/* Summary pills */}
                    <span style={{fontSize:11,padding:"3px 8px",borderRadius:20,background:C.greenPale,color:C.green,fontWeight:700}}>
                      ✓ {doneCnt} complete
                    </span>
                    {partialCnt>0&&(
                      <span style={{fontSize:11,padding:"3px 8px",borderRadius:20,background:C.orangePale,color:C.orange,fontWeight:700}}>
                        ◑ {partialCnt} partial
                      </span>
                    )}
                    {pendingCnt>0&&(
                      <span style={{fontSize:11,padding:"3px 8px",borderRadius:20,background:C.redPale,color:C.red,fontWeight:700}}>
                        ○ {pendingCnt} pending
                      </span>
                    )}
                    {/* Toggle */}
                    <button onClick={()=>setChecklistHideComplete(p=>!p)}
                      style={{fontSize:11,padding:"3px 9px",borderRadius:20,cursor:"pointer",fontWeight:600,
                        border:`1px solid ${C.border}`,background:C.white,color:C.muted}}>
                      {checklistHideComplete?"Show all":"Hide completed"}
                    </button>
                  </div>
                </div>

                {/* Overall progress bar */}
                <div style={{height:6,background:C.offWhite,borderRadius:3,overflow:"hidden",marginBottom:14,border:`1px solid ${C.border}`}}>
                  <div style={{height:"100%",width:`${pct}%`,background:allDone?C.green:C.amber,borderRadius:3,transition:"width .3s"}}/>
                </div>

                {/* Sections + classes */}
                <div style={{display:"flex",flexDirection:"column",gap:14,maxHeight:420,overflowY:"auto"}}>
                  {termChecklist.sections.map(sec=>{
                    const visible=checklistHideComplete?sec.classes.filter(r=>!r.complete):sec.classes;
                    if(visible.length===0)return null;
                    const secDone=sec.classes.filter(r=>r.complete).length;
                    const secTotal=sec.classes.length;
                    const secPct=secTotal>0?Math.round(secDone/secTotal*100):0;
                    return(
                      <div key={sec.id}>
                        {/* Section header */}
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                          marginBottom:6,padding:"4px 8px",background:C.offWhite,borderRadius:6}}>
                          <span style={{fontSize:11,fontWeight:800,color:C.muted,textTransform:"uppercase",letterSpacing:.7}}>
                            {sec.name}
                          </span>
                          <span style={{fontSize:11,color:C.muted,fontWeight:600}}>{secDone}/{secTotal} · {secPct}%</span>
                        </div>
                        {/* Group rows */}
                        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:6}}>
                          {visible.map(r=>{
                            const state=r.complete?"done":r.partial?"partial":"pending";
                            const dotColor=state==="done"?C.green:state==="partial"?C.orange:C.red;
                            const bg=state==="done"?C.greenPale:state==="partial"?C.orangePale:C.redPale;
                            const symbol=state==="done"?"✓":state==="partial"?"◑":"○";
                            return(
                              <div key={r.id} onClick={()=>state!=="done"&&setPage("fee-generate")}
                                style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",
                                  background:bg,borderRadius:7,
                                  border:`1px solid ${dotColor}44`,
                                  cursor:state!=="done"?"pointer":"default",
                                  transition:"opacity .1s"}}>
                                <span style={{fontSize:14,color:dotColor,fontWeight:900,flexShrink:0}}>{symbol}</span>
                                <div style={{flex:1,minWidth:0}}>
                                  <div style={{fontSize:12,fontWeight:700,color:C.text,
                                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div>
                                  <div style={{fontSize:10,color:C.muted,marginTop:1}}>
                                    {r.billed}/{r.total} billed
                                    {r.partial&&<span style={{color:C.orange}}> · {r.total-r.billed} remaining</span>}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {!allDone&&(
                  <div style={{marginTop:12,display:"flex",justifyContent:"flex-end"}}>
                    <Btn xs color={C.orange} onClick={()=>setPage("fee-generate")}>
                      Go to Bill Generation →
                    </Btn>
                  </div>
                )}
              </Card>
            );
          })()}
          {/* Recent audit activity */}
          {recentActivity.length>0&&(
            <Card>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{fontWeight:800,color:C.blue,fontSize:14}}>Recent Admin Activity</div>
                <Btn xs outline color={C.blue} onClick={()=>setPage("audit-log")}>View All</Btn>
              </div>
              {recentActivity.slice(0,5).map(a=>(
                <div key={a.id} style={{padding:"7px 0",borderBottom:`1px solid ${C.border}`,fontSize:12,
                  display:"flex",gap:10,alignItems:"flex-start"}}>
                  <span style={{fontSize:14,flexShrink:0}}>
                    {a.action==="status_change"?"↻":a.action==="delete"?"✕":a.action==="edit"?"✎":"•"}
                  </span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {a.entity_name||a.entity_id}
                    </div>
                    <div style={{color:C.muted}}>
                      {a.action==="status_change"?`Status → ${a.new_value?.status}`:
                       a.action==="delete"?"Deleted":a.action}
                      {" · "}{a.performed_by}
                    </div>
                  </div>
                  <div style={{fontSize:11,color:C.light,flexShrink:0}}>
                    {new Date(a.performed_at).toLocaleDateString("en-NG",{day:"numeric",month:"short"})}
                  </div>
                </div>
              ))}
            </Card>
          )}
        </>
      )}

      {role==="teacher"&&(
        <TeacherDashboard ctx={ctx} announcements={announcements}/>
      )}

      {role==="student"&&(
        <StudentDashboard ctx={ctx} announcements={announcements}/>
      )}
      {role==="manager"&&<ManagerDashboard ctx={ctx}/>}
      {role==="bursar"&&<BursarDashboard ctx={ctx}/>}
    </div>
  );
}

// ─── MEMBER DASHBOARD ───────────────────────────────────────────────────────
export function StudentDashboard({ctx,announcements}){
  const {user,setPage}=ctx;
  const [stuRecord,setStuRecord]=useState(null);
  useEffect(()=>{
    if(!user.student_id)return;
    db.getStudentById(user.student_id).then(({data})=>setStuRecord(data||null));
  },[user.student_id]);
  const className=stuRecord?.classes?.name||"—";
  const sectionName=stuRecord?.classes?.sections?.name||"";
  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* Group + ID banner */}
      <div style={{background:`linear-gradient(135deg,${C.orange}ee,${C.orangeDark||"#b84500"}cc)`,
        borderRadius:14,padding:"18px 22px",color:"#fff",display:"flex",alignItems:"center",gap:18,flexWrap:"wrap"}}>
        <div><GraduationCap size={38} color={C.muted}/></div>
        <div style={{flex:1}}>
          <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1.2,opacity:.8,marginBottom:3}}>
            Your Group
          </div>
          <div style={{fontSize:22,fontWeight:900,letterSpacing:"-.01em"}}>
            {className}{sectionName?` · ${sectionName}`:""}
          </div>
          <div style={{fontSize:12,opacity:.85,marginTop:4}}>
            Member ID: <span style={{fontWeight:800,letterSpacing:.5}}>{user.student_id||"—"}</span>
          </div>
        </div>
      </div>
      {/* Quick links */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:13}}>
        {[
          {l:"My Report Card",i:"my-results",p:"my-results",c:C.blue},
          {l:"Fee Payments",  i:"my-payments",p:"my-payments",c:C.green},
          {l:"Transcript",    i:"transcript",p:"transcript", c:C.orange},
        ].map(a=>(
          <Card key={a.l} style={{textAlign:"center",padding:22,cursor:"pointer"}} onClick={()=>setPage(a.p)}>
            <div style={{display:"flex",justifyContent:"center",marginBottom:6}}>
              <AppIcon name={a.i} size={30} color={a.c}/>
            </div>
            <div style={{fontWeight:800,color:a.c,fontSize:13}}>{a.l}</div>
          </Card>
        ))}
      </div>
      {/* Announcements */}
      <Card>
        <div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:10}}>School Announcements</div>
        {(announcements||[]).length===0&&<div style={{color:C.light,fontSize:13,textAlign:"center",padding:14}}>No announcements</div>}
        {(announcements||[]).map(a=>(
          <div key={a.id} style={{padding:"9px 0",borderBottom:`1px solid ${C.border}`,fontSize:13}}>
            <div style={{fontWeight:700}}>{a.title}</div>
            <div style={{color:C.muted,fontSize:12,marginTop:2,lineHeight:1.5}}>{a.body}</div>
            <div style={{color:C.light,fontSize:11,marginTop:3}}>{new Date(a.created_at).toLocaleDateString("en-NG",{day:"numeric",month:"long"})}</div>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ─── STAFF DASHBOARD WIDGET ────────────────────────────────────────────────
// ─── MY PROFILE PAGE (teacher quick-action "My Profile") ─────────────────────
export function MyProfilePage({ctx}){
  const {user,notify,setPage,bumpRefresh}=ctx;
  const [name,setName]=useState(user.name||"");
  const [bio,setBio]=useState(user.bio||"");
  const [pw,setPw]=useState("");
  const [pw2,setPw2]=useState("");
  const [saving,setSaving]=useState(false);

  const save=async()=>{
    if(pw&&pw.length<4){notify("Password must be at least 4 characters","error");return;}
    if(pw&&pw!==pw2){notify("Passwords do not match","error");return;}
    setSaving(true);
    const upd={display_name:name,bio,profile_updated_at:new Date().toISOString()};
    if(pw)upd.password_hash=pw;
    await db.upsertTeacher(upd,user.teacher_db_id);
    setSaving(false);
    notify("Profile updated ✓");
    bumpRefresh();
  };

  return(
    <div style={{maxWidth:520,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <Btn onClick={()=>setPage("dashboard")} color={C.muted} outline>← Back</Btn>
        <h2 style={{fontSize:20,fontWeight:900,color:C.blue,margin:0,display:"flex",alignItems:"center",gap:8}}><AppIcon name="user" size={20}/>My Profile</h2>
      </div>
      <Card>
        <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:20,
          padding:"14px 16px",background:C.bluePale,borderRadius:10}}>
          <div style={{width:56,height:56,borderRadius:"50%",background:C.blue,
            color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:22,fontWeight:900,flexShrink:0}}>
            {(name||"?")[0].toUpperCase()}
          </div>
          <div>
            <div style={{fontWeight:800,color:C.blue,fontSize:14}}>{name||"—"}</div>
            <Badge color={C.green}>STAFF</Badge>
            {user.staff_id&&<div style={{fontSize:11,color:C.muted,marginTop:3}}>Staff ID: {user.staff_id}</div>}
          </div>
        </div>
        <Inp label="Display Name" value={name} onChange={setName} placeholder="Your full name"/>
        <Inp label="Bio / Notes (optional)" value={bio} onChange={setBio} placeholder="Brief description…"/>
        <div style={{borderTop:`1px solid ${C.border}`,marginTop:4,paddingTop:14}}>
          <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>Change Password</div>
          <Inp label="New Password" type="password" value={pw} onChange={setPw} placeholder="Leave blank to keep current"/>
          {pw&&<Inp label="Confirm Password" type="password" value={pw2} onChange={setPw2} placeholder="Repeat new password"/>}
        </div>
        <div style={{display:"flex",gap:10,marginTop:14}}>
          <Btn onClick={save} color={C.orange} disabled={saving} style={{flex:1}}>{saving?"Saving…":"Save Profile"}</Btn>
          <Btn onClick={()=>setPage("dashboard")} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
        </div>
      </Card>
    </div>
  );
}

export function TeacherDashboard({ctx,announcements}){
  const {user,setPage,notify}=ctx;
  const [formClasses,setFormClasses]=useState([]);
  const [assignments,setAssignments]=useState([]); // {class,subject}
  const [pendingReqs,setPendingReqs]=useState(0);
  const [publishedCards,setPublishedCards]=useState([]); // [{class_name, session, term}]
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    if(!user.teacher_db_id){setLoading(false);return;}
    Promise.all([
      db.getAllFormTeachers(),
      db.getTeacherSubjects(user.teacher_db_id),
      db.getStudentRequests('pending'),
    ]).then(([ft,ts,reqs])=>{
      const myFC=(ft.data||[]).filter(r=>r.teacher_id===user.teacher_db_id);
      setFormClasses(myFC);
      setAssignments(ts.data||[]);
      setPendingReqs((reqs.data||[]).length);
      setLoading(false);
    });
  },[user.teacher_db_id]);

  // Group assignments by class
  const byClass={};
  assignments.forEach(a=>{
    const key=a.class_id;
    if(!byClass[key])byClass[key]={cls:a.classes,subjects:[]};
    byClass[key].subjects.push(a.section_subjects?.name||"—");
  });
  const classGroups=Object.values(byClass);

  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* Quick actions */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:13}}>
        {[
          {l:"My Groups",    i:"my-classes",p:"my-classes",    c:C.blue},
          {l:"Upload Results",i:"upload-results",p:"results-teach", c:C.green},
          {l:"Attendance",i:"attendance",p:"attendance", c:C.purple},
          {l:"Add Members",  i:"add-students",p:"add-students",  c:C.orange},
          {l:"My Profile",    i:"user",p:"my-profile",    c:C.purple},
        ].map(a=>(
          <Card key={a.l} style={{textAlign:"center",padding:"20px 12px",cursor:"pointer"}} onClick={()=>setPage(a.p)}>
            <div style={{display:"flex",justifyContent:"center",marginBottom:7}}>
              <AppIcon name={a.i} size={30} color={a.c}/>
            </div>
            <div style={{fontWeight:800,color:a.c,fontSize:13}}>{a.l}</div>
          </Card>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        {/* Form Groups */}
        <Card>
          <div style={{fontWeight:800,color:C.blue,fontSize:13,marginBottom:10}}>My Form Group{formClasses.length!==1?"es":""}</div>
          {loading&&<Spinner/>}
          {!loading&&formClasses.length===0&&(
            <div style={{color:C.light,fontSize:12,textAlign:"center",padding:"14px 0"}}>
              Not assigned as form teacher yet
            </div>
          )}
          {!loading&&formClasses.map((fc,i)=>(
            <div key={i} style={{padding:"10px 12px",borderRadius:9,
              background:C.bluePale,border:`1.5px solid ${C.blue}33`,marginBottom:8}}>
              <div style={{fontWeight:800,color:C.blue,fontSize:14}}>{fc.classes?.name||"—"}</div>
              {fc.classes?.sections&&(
                <Badge color={fc.classes.sections.color||C.blue} style={{marginTop:4}}>
                  {fc.classes.sections.code} · {fc.classes.sections.name}
                </Badge>
              )}
            </div>
          ))}
        </Card>

        {/* Subject Assignments */}
        <Card>
          <div style={{fontWeight:800,color:C.green,fontSize:13,marginBottom:10}}>
            My Subject Assignments
            {assignments.length>0&&(
              <span style={{marginLeft:6,background:C.greenPale,color:C.green,
                padding:"1px 7px",borderRadius:10,fontSize:11,fontWeight:700}}>
                {assignments.length}
              </span>
            )}
          </div>
          {loading&&<Spinner/>}
          {!loading&&classGroups.length===0&&(
            <div style={{color:C.light,fontSize:12,textAlign:"center",padding:"14px 0"}}>
              No subject assignments yet.<br/>
              <span style={{fontSize:11}}>Ask admin to assign subjects to you.</span>
            </div>
          )}
          {!loading&&classGroups.map((g,i)=>(
            <div key={i} style={{marginBottom:10}}>
              <div style={{fontWeight:700,fontSize:12,color:C.text,marginBottom:5,
                display:"flex",alignItems:"center",gap:6}}>
                <span style={{background:C.blue,color:"#fff",padding:"1px 7px",
                  borderRadius:8,fontSize:11}}>{g.cls?.name||"—"}</span>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {g.subjects.map((s,j)=>(
                  <span key={j} style={{background:C.greenPale,color:C.green,
                    padding:"3px 9px",borderRadius:12,fontSize:11,fontWeight:700,
                    border:`1px solid ${C.green}33`}}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </Card>
      </div>

      {/* ── Action Tasks ───────────────────────────────────────── */}
      {!loading&&(()=>{
        // Build a task list from available data
        const tasks=[];

        // 1. Upload reminder: one item per distinct class they teach
        const uniqueClassIds=new Set(assignments.map(a=>a.class_id));
        uniqueClassIds.forEach(cid=>{
          const cls=assignments.find(a=>a.class_id===cid)?.classes;
          tasks.push({
            key:`upload-${cid}`,
            icon:"upload-results",
            color:C.green,
            label:`Upload results — ${cls?.name||"Group"}`,
            sub:"Upload your subject scores for this class",
            page:"results-teach",
            priority:"normal",
          });
        });

        // 2. Pending access requests
        if(pendingReqs>0){
          tasks.push({
            key:"pending-reqs",
            icon:"add-students",
            color:C.orange,
            label:`${pendingReqs} pending student request${pendingReqs!==1?"s":""}`,
            sub:"New student enrolment requests need review",
            page:"add-students",
            priority:"high",
          });
        }

        // 3. No assignments fallback
        if(assignments.length===0){
          tasks.push({
            key:"no-assign",
            icon:"calendar",
            color:C.muted,
            label:"No subject assignments yet",
            sub:"Contact your admin to be assigned subjects and classes",
            page:null,
            priority:"low",
          });
        }

        if(tasks.length===0) return null;

        return(
          <Card style={{padding:0,overflow:"hidden"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"12px 16px",
              borderBottom:`1px solid ${C.border}`}}>
              <ClipboardList size={16} color={C.orange}/>
              <span style={{fontWeight:800,fontSize:13,color:C.text}}>Action Items</span>
              <span style={{marginLeft:"auto",background:C.amberPale,color:C.amber,
                padding:"1px 8px",borderRadius:10,fontSize:11,fontWeight:700}}>
                {tasks.length}
              </span>
            </div>
            {tasks.map((t,i)=>(
              <div key={t.key}
                onClick={t.page?()=>setPage(t.page):undefined}
                style={{display:"flex",alignItems:"center",gap:12,
                  padding:"11px 16px",
                  borderBottom:i<tasks.length-1?`1px solid ${C.border}`:"none",
                  cursor:t.page?"pointer":"default",
                  transition:"background .15s"}}
                onMouseEnter={e=>{if(t.page)e.currentTarget.style.background=C.offWhite;}}
                onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>
                <div style={{width:34,height:34,borderRadius:10,flexShrink:0,
                  background:t.color+"1A",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <AppIcon name={t.icon} size={16} color={t.color}/>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:12,color:C.text,
                    whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.label}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:1}}>{t.sub}</div>
                </div>
                {t.page&&<ChevronRight size={14} color={C.light}/>}
                {t.priority==="high"&&(
                  <div style={{width:7,height:7,borderRadius:"50%",background:C.orange,flexShrink:0}}/>
                )}
              </div>
            ))}
          </Card>
        );
      })()}

      {/* Announcements */}
      {announcements.length>0&&(
        <Card>
          <div style={{fontWeight:800,color:C.blue,fontSize:13,marginBottom:10}}>Announcements</div>
          {announcements.map(a=>(
            <div key={a.id} style={{padding:"8px 0",borderBottom:`1px solid ${C.border}`,fontSize:12}}>
              <div style={{fontWeight:700,color:C.text}}>{a.title}</div>
              <div style={{color:C.muted,marginTop:2,lineHeight:1.5}}>{a.body?.slice(0,80)}{a.body?.length>80?"…":""}</div>
              <div style={{color:C.light,fontSize:11,marginTop:3}}>
                {new Date(a.created_at).toLocaleDateString("en-NG",{day:"numeric",month:"long"})}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}


// ─── SECTIONS PAGE ────────────────────────────────────────────────────────────
export function SectionsPage({ctx}){
  const {notify}=ctx;
  const [sections,setSections]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modal,setModal]=useState(false);
  const [levelsModal,setLevelsModal]=useState(null); // section obj
  const [editId,setEditId]=useState(null);
  const blank={name:"",code:"",description:"",color:"#3b82f6",sort_order:0,is_active:true,levels:[]};
  const [form,setForm]=useState(blank);
  const f=v=>setForm(p=>({...p,...v}));
  const [newLevel,setNewLevel]=useState("");
  const [editLevels,setEditLevels]=useState([]);

  const load=()=>{
    setLoading(true);
    db.getSections(false).then(({data,error})=>{
      if(error)notify("Error loading sections: "+error.message,"error");
      else setSections(data||[]);
      setLoading(false);
    });
  };
  useEffect(load,[]);

  const save=async()=>{
    if(!form.name||!form.code){notify("Name and Code required","error");return;}
    const {error}=await db.upsertSection(form,editId);
    if(error)notify(error.message,"error");
    else{notify(editId?"Section updated ✓":"Section created ✓");setModal(false);load();}
  };
  const confirm=useConfirm();
  const del=async(id,name)=>{
    const warnings = await db.checkDeleteSection(id);
    let message = `Delete the "${name}" section?`;
    if(warnings.length) message+=` This section has ${warnings.join(" and ")}. Removing it may affect linked records.`;
    const ok=await confirm({title:"Delete Section?",message,confirmLabel:"Delete",danger:true,
      typeToConfirm:warnings.length?name:null});
    if(!ok)return;
    try{
      const {error}=await db.softDelete('section',id,ctx.user?.name||'admin');
      if(error)notify(error.message,"error");
      else{notify(`"${name}" moved to Recycle Bin`,"warn");load();}
    }catch(e){notify("Delete failed: "+e.message,"error");}
  };
  const toggle=async(s)=>{
    await db.upsertSection({is_active:!s.is_active},s.id);
    load();
  };

  const openLevels=(s)=>{
    setEditLevels([...(s.levels||[])]);
    setNewLevel("");
    setLevelsModal(s);
  };
  const addLevel=()=>{
    const v=newLevel.trim();
    if(!v)return;
    if(editLevels.includes(v)){notify("Level already exists","error");return;}
    setEditLevels(p=>[...p,v]);
    setNewLevel("");
  };
  const removeLevel=(l)=>setEditLevels(p=>p.filter(x=>x!==l));
  const moveLevel=(i,dir)=>{
    const arr=[...editLevels];
    const j=i+dir;
    if(j<0||j>=arr.length)return;
    [arr[i],arr[j]]=[arr[j],arr[i]];
    setEditLevels(arr);
  };
  const saveLevels=async()=>{
    const {error}=await db.upsertSection({levels:editLevels},levelsModal.id);
    if(error)notify(error.message,"error");
    else{notify("Levels saved ✓");setLevelsModal(null);load();}
  };

  const sectionColors=["#3b82f6","#10b981","#8b5cf6","#ef4444","#f59e0b","#06b6d4","#ec4899","#14b8a6"];

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="sections" size={20}/>Sections</h2>
          <p style={{color:C.muted,fontSize:12}}>Manage school sections and their levels</p>
        </div>
        <Btn onClick={()=>{setForm(blank);setEditId(null);setModal(true);}} color={C.orange}>Add Section</Btn>
      </div>

      {loading?<Spinner/>:(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
          {sections.map(s=>(
            <Card key={s.id} style={{borderTop:`4px solid ${s.color||C.blue}`,opacity:s.is_active?1:.65}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <div style={{width:12,height:12,borderRadius:"50%",background:s.color||C.blue}}/>
                    <div style={{fontWeight:900,fontSize:16,color:C.blue}}>{s.name}</div>
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    <Badge color={s.color||C.blue}>{s.code}</Badge>
                    {!s.is_active&&<Badge color={C.red}>INACTIVE</Badge>}
                    <Badge color={C.muted}>{(s.levels||[]).length} levels</Badge>
                  </div>
                </div>
                <div style={{display:"flex",gap:5,flexWrap:"wrap",justifyContent:"flex-end"}}>
                  <Btn xs onClick={()=>{setForm({name:s.name,code:s.code,description:s.description||"",color:s.color||"#3b82f6",sort_order:s.sort_order||0,is_active:s.is_active,levels:s.levels||[]});setEditId(s.id);setModal(true);}} color={C.blue} outline><Pencil size={13}/></Btn>
                  <Btn xs onClick={()=>openLevels(s)} color={C.purple} outline>Levels</Btn>
                  <Btn xs onClick={()=>toggle(s)} color={s.is_active?C.amber:C.green} outline>{s.is_active?"Pause":"Resume"}</Btn>
                  <Btn xs onClick={()=>del(s.id,s.name)} color={C.red} outline><Trash2 size={13}/></Btn>
                </div>
              </div>
              {s.description&&<p style={{fontSize:12,color:C.muted,marginBottom:8}}>{s.description}</p>}
              {(s.levels||[]).length>0&&(
                <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:8}}>
                  {(s.levels||[]).map(l=>(
                    <span key={l} style={{background:(s.color||C.blue)+"18",color:s.color||C.blue,
                      padding:"2px 8px",borderRadius:10,fontSize:11,fontWeight:600,
                      border:`1px solid ${(s.color||C.blue)}33`}}>{l}</span>
                  ))}
                </div>
              )}
            </Card>
          ))}
          {!sections.length&&<div style={{color:C.light,padding:32,textAlign:"center"}}>No sections yet</div>}
        </div>
      )}

      {/* Section edit modal */}
      {modal&&(
        <Modal title={editId?"Edit Section":"New Section"} onClose={()=>setModal(false)}>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:12}}>
            <Inp label="Section Name *" value={form.name} onChange={v=>f({name:v})} placeholder="e.g. Nursery"/>
            <Inp label="Code *" value={form.code} onChange={v=>f({code:v.toUpperCase()})} placeholder="NUR"/>
          </div>
          <Inp label="Description" value={form.description} onChange={v=>f({description:v})} placeholder="Brief description…"/>
          <div style={{marginBottom:13}}>
            <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>Section Color</label>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {sectionColors.map(col=>(
                <button key={col} onClick={()=>f({color:col})}
                  style={{width:30,height:30,borderRadius:"50%",background:col,border:form.color===col?"3px solid #333":"3px solid transparent",cursor:"pointer"}}/>
              ))}
            </div>
          </div>
          <Inp label="Sort Order" type="number" value={form.sort_order} onChange={v=>f({sort_order:+v})}/>
          <div style={{display:"flex",gap:10,marginTop:6}}>
            <Btn onClick={save} color={C.orange} style={{flex:1}}>Save</Btn>
            <Btn onClick={()=>setModal(false)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
          </div>
        </Modal>
      )}

      {/* Levels editor modal */}
      {levelsModal&&(
        <Modal title={`Levels — ${levelsModal.name}`} onClose={()=>setLevelsModal(null)} width={480}>
          <p style={{color:C.muted,fontSize:12,marginBottom:14}}>
            Add, remove, or reorder the levels for this section. These appear as options when creating classes.
          </p>
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            <input value={newLevel} onChange={e=>setNewLevel(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&addLevel()}
              placeholder="e.g. NUR 1 or PRY 2"
              style={{flex:1,padding:"9px 12px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:13,outline:"none"}}/>
            <Btn onClick={addLevel} color={C.orange}>Add</Btn>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:320,overflowY:"auto"}}>
            {editLevels.map((l,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,
                background:C.offWhite,borderRadius:8,padding:"8px 12px",
                border:`1px solid ${C.border}`}}>
                <div style={{display:"flex",flexDirection:"column",gap:2}}>
                  <button onClick={()=>moveLevel(i,-1)} disabled={i===0}
                    style={{background:"none",border:"none",cursor:i===0?"not-allowed":"pointer",
                      color:C.muted,fontSize:12,lineHeight:1,padding:0,opacity:i===0?.3:1}}>▲</button>
                  <button onClick={()=>moveLevel(i,1)} disabled={i===editLevels.length-1}
                    style={{background:"none",border:"none",cursor:i===editLevels.length-1?"not-allowed":"pointer",
                      color:C.muted,fontSize:12,lineHeight:1,padding:0,opacity:i===editLevels.length-1?.3:1}}>▼</button>
                </div>
                <span style={{flex:1,fontWeight:600,fontSize:13,color:C.text}}>{l}</span>
                <span style={{color:C.light,fontSize:11,fontWeight:600}}>#{i+1}</span>
                <Btn xs onClick={()=>removeLevel(l)} color={C.red} outline><Trash2 size={13}/></Btn>
              </div>
            ))}
            {!editLevels.length&&<div style={{textAlign:"center",color:C.light,padding:24,fontSize:12}}>No levels yet. Add one above.</div>}
          </div>
          <div style={{display:"flex",gap:10,marginTop:16}}>
            <Btn onClick={saveLevels} color={C.orange} style={{flex:1}}>Save Levels</Btn>
            <Btn onClick={()=>setLevelsModal(null)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── ACCESS DENIED (shared by page guards) ────────────────────────────────────
export function ManagerDashboard({ctx}){
  const{setPage}=ctx;
  return(
    <div style={{padding:"24px 16px",maxWidth:900,margin:"0 auto"}}>
      <div style={{background:"linear-gradient(135deg,#6d28d9,#7C3AED)",color:"#fff",borderRadius:16,padding:"24px 28px",marginBottom:20,display:"flex",alignItems:"center",gap:16}}>
        <DollarSign size={36} color="#fff" style={{opacity:.85}}/>
        <div>
          <div style={{fontWeight:900,fontSize:20}}>Finance Overview</div>
          <div style={{fontSize:13,opacity:.8,marginTop:2}}>Manage school fees, payments and financial records</div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
        {[
          {label:"Payment Tracker",page:"fee-tracker",bg:"#7C3AED",desc:"Record & track payments"},
          {label:"Fee Items",      page:"fee-items",  bg:"#6d28d9",desc:"Manage fee categories"},
          {label:"Fee Templates",  page:"fee-templates",bg:"#5b21b6",desc:"Create fee bundles"},
          {label:"Generate Bills", page:"fee-generate",bg:"#4c1d95",desc:"Bill students"},
          {label:"Statistics",     page:"fee-stats",  bg:"#3b0764",desc:"Revenue reports"},
          {label:"Announcements",  page:"announce",   bg:"#1A4FA0",desc:"Post announcements"},
        ].map(q=>(
          <button key={q.page} onClick={()=>setPage(q.page)}
            style={{padding:"16px",borderRadius:12,border:"none",background:q.bg,color:"#fff",cursor:"pointer",textAlign:"left",transition:"transform .15s",boxShadow:"0 2px 8px rgba(0,0,0,.15)"}}>
            <div style={{fontWeight:800,fontSize:13,marginBottom:4}}>{q.label}</div>
            <div style={{fontSize:10,opacity:.8}}>{q.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
// ─── BURSAR DASHBOARD ─────────────────────────────────────────────────────────
export function BursarDashboard({ctx}){
  const{setPage}=ctx;
  return(
    <div style={{padding:"24px 16px",maxWidth:900,margin:"0 auto"}}>
      <div style={{background:"linear-gradient(135deg,#92400e,#B45309)",color:"#fff",borderRadius:16,padding:"24px 28px",marginBottom:20,display:"flex",alignItems:"center",gap:16}}>
        <DollarSign size={36} color="#fff" style={{opacity:.85}}/>
        <div>
          <div style={{fontWeight:900,fontSize:20}}>Bursar — Finance Overview</div>
          <div style={{fontSize:13,opacity:.8,marginTop:2}}>Manage school fees, payments and financial records</div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
        {[
          {label:"Payment Tracker",page:"fee-tracker",  bg:"#B45309",desc:"Record & track payments"},
          {label:"Fee Items",      page:"fee-items",    bg:"#92400e",desc:"Manage fee categories"},
          {label:"Fee Templates",  page:"fee-templates",bg:"#78350f",desc:"Create fee bundles"},
          {label:"Generate Bills", page:"fee-generate", bg:"#6b2d09",desc:"Bill students"},
          {label:"Statistics",     page:"fee-stats",    bg:"#5c2508",desc:"Revenue reports"},
          {label:"Announcements",  page:"announce",     bg:"#1A4FA0",desc:"Post announcements"},
        ].map(q=>(
          <button key={q.page} onClick={()=>setPage(q.page)}
            style={{padding:"16px",borderRadius:12,border:"none",background:q.bg,color:"#fff",cursor:"pointer",textAlign:"left",transition:"transform .15s",boxShadow:"0 2px 8px rgba(0,0,0,.15)"}}>
            <div style={{fontWeight:800,fontSize:13,marginBottom:4}}>{q.label}</div>
            <div style={{fontSize:10,opacity:.8}}>{q.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
// PERM_GROUPS, RBAC_ROLES, PERM_ROLE_DEFAULTS → now in AppDemo.jsx (main bundle).
// Imported by permissions.jsx. Not used directly in dashboard.jsx.
