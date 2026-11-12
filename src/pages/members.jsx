/**
 * Members domain: MembersPage
 */
import React, { useState, useEffect, useMemo } from "react";
import {
  Check, ChevronDown, ChevronUp, Copy, Download, Edit, Phone,
  Save, School, Search, Send, Settings, Upload, User, BookOpen,
  CreditCard, Activity, X, ReceiptText, CheckCircle, Clock,
  XCircle, AlertCircle, ChevronRight, GraduationCap, Calendar,
} from "lucide-react";
import { db } from "../supabaseClient.js";
import { C } from "../config/theme.js";
import { useSection } from "../contexts/section.jsx";
import {
  Card, Btn, Badge, Inp, Sel, Modal, ClassMultiSelect, Spinner,
  AppIcon, ActionsMenu, TableSkeleton,
} from "../components/ui.jsx";
import { sendPortalEmail, buildStudentEmail, buildTeacherEmail, buildAlertEmail } from "../services/email/index.js";
import { fullName, fmt, getGrade, getRemark } from "../utils/grades.js";
import { OnboardingEmailModal, AutoBillModal, BulkUploadBillingModal } from "./students.jsx";
import { EmailProgressModal } from "./comms.jsx";

export function MembersPage({ctx}){
  const {notify,refreshKey,bumpRefresh,selectedSchool}=ctx; // intentionally NOT destructuring selectedSection — Members shows ALL
  const {schoolName:_membersSchoolName}=useSection();
  const _sn=_membersSchoolName||"Business Portal";

  // ── Data ──
  const [students,setStudents]=useState([]);
  const [teachers,setTeachers]=useState([]);
  const [classes,setClasses]=useState([]);
  const [sections,setSections]=useState([]);
  const [loading,setLoading]=useState(true);

  // ── UI state ──
  const [tab,setTab]=useState("all"); // all | students | educators
  const [search,setSearch]=useState("");
  const [statusFilter,setStatusFilter]=useState("active"); // default: show active members only
  const [selSection,setSelSection]=useState("");
  const [selClasses,setSelClasses]=useState(new Set());
  const [bannerDismissed,setBannerDismissed]=useState(false);
  const [page,setPage]=useState(1);
  const [sortBy,setSortBy]=useState("dateAdded"); // name|dateAdded|lastLogin|status|group|type
  const [sortDir,setSortDir]=useState("desc"); // asc|desc
  const PAGE_SIZE=parseInt(localStorage.getItem('rgs_rows_per_page')||'50',10);

  // ── Checkboxes ──
  const [selectedIds,setSelectedIds]=useState(new Set());
  const toggleSelect=id=>setSelectedIds(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  const clearSelection=()=>setSelectedIds(new Set());

  // ── Modals ──
  const [profileStudent,setProfileStudent]=useState(null); // open student profile
  const [addModal,setAddModal]=useState(null);
  const [editTarget,setEditTarget]=useState(null);
  const [statusModal,setStatusModal]=useState(null);
  const [roleChangeModal,setRoleChangeModal]=useState(null);
  const [credModal,setCredModal]=useState(null); // {m} — edit credentials for an educator
  const [bulkStatusModal,setBulkStatusModal]=useState(false);
  const [newStatus,setNewStatus]=useState("");
  const [saving,setSaving]=useState(false);
  const [bulkOpProgress,setBulkOpProgress]=useState({done:0,total:0,action:""});
  const [confirmDeleteModal,setConfirmDeleteModal]=useState(null); // {targets,warnings}
  const [membersEmailQueue,setMembersEmailQueue]=useState(null); // for EmailProgressModal

  // ── Bulk upload state ──
  const [totalStudentCount,setTotalStudentCount]=useState(null);
  const [bulkStuModal,setBulkStuModal]=useState(false);
  const [bulkTeaModal,setBulkTeaModal]=useState(false);
  const [bulkParsed,setBulkParsed]=useState([]);
  const [bulkSaving,setBulkSaving]=useState(false);
  const [bulkErrors,setBulkErrors]=useState([]);
  const [bulkFile,setBulkFile]=useState(null);
  const [bulkProgress,setBulkProgress]=useState({done:0,total:0});

  // ── Email consent state ──
  const [lastRegistered,setLastRegistered]=useState(null);
  const [showOnboarding,setShowOnboarding]=useState(false);
  const [lastRegisteredTeachers,setLastRegisteredTeachers]=useState(null);
  const [showTeacherOnboarding,setShowTeacherOnboarding]=useState(false);

  // ── Auto-bill prompt (shown after new student registration if a template is found) ──
  const [autoBillPrompt,setAutoBillPrompt]=useState(null); // {studentId,studentName,templates}
  // ── Post-bulk-upload billing prompt ──
  const [bulkBillPrompt,setBulkBillPrompt]=useState(null); // [{id,name,classId,className,classLevel,is_new_enrollee}]

  // ── Member form ──
  const blankStu=()=>({first_name:"",middle_name:"",last_name:"",email:"",gender:"Male",dob:"",age:"",useDob:true,class_id:"",admission_year:String(new Date().getFullYear()),status:"active"});
  const [stuForm,setStuForm]=useState(blankStu());
  const sf=p=>setStuForm(f=>({...f,...p}));

  // ── Staff form ──
  const blankTea=()=>({full_name:"",email:"",phone:"",gender:"Male",staff_id:"",date_joined:"",section_id:"",status:"active"});
  const [teaForm,setTeaForm]=useState(blankTea());
  const tf=p=>setTeaForm(f=>({...f,...p}));

  const load=()=>{
    setLoading(true);
    clearSelection();
    Promise.all([
      db.getStudents(),db.getTeachers(),db.getClasses(),db.getSections(true),db.countStudents(),
    ]).then(([s,t,cl,sec,sc])=>{
      setStudents(s.data||[]);setTeachers(t.data||[]);
      setClasses(cl.data||[]);setSections(sec.data||[]);
      setTotalStudentCount(sc.count);
      setLoading(false);
    });
  };
  useEffect(()=>{load();},[refreshKey]);

  // ── Normalise members ── (no section scoping — Members is global)
  const allMembers=useMemo(()=>{
    const stus=students.map(s=>({
      _type:"student",_id:s.id,
      fullName:fullName(s)||String(s.id),
      email:s.email||"",phone:"",
      status:s.status||"active",
      group:s.classes?.name||"—",
      dateAdded:s.created_at||"",
      lastLogin:s.last_login||"",
      _raw:s,
    }));
    const teas=teachers.map(t=>({
      _type:"educator",_id:t.staff_id||String(t.id),
      fullName:t.full_name||"",
      email:t.email||"",phone:t.phone||"",
      status:t.status||"active",
      group:sections.find(s=>s.id===t.section_id)?.name||"—",
      dateAdded:t.date_joined||t.created_at||"",
      lastLogin:t.last_login||"",
      teacherRole:t.role||"teacher",
      _raw:t,
    }));
    return[...stus,...teas]; // sort applied after filtering
  },[students,teachers,sections]);

  const stuTotal=totalStudentCount!==null?totalStudentCount:students.length;
  const TABS=[
    {id:"all",label:`All (${stuTotal+teachers.length})`,icon:"members"},
    {id:"students",label:`Members (${stuTotal})`,icon:"students"},
    {id:"educators",label:`Educators (${teachers.length})`,icon:"teachers"},
  ];

  // Cascading section → class helpers (students only — educators use sections directly)
  const classesBySection=useMemo(()=>
    selSection ? classes.filter(c=>String(c.section_id)===selSection) : classes
  ,[classes,selSection]);

  // Reset class selections when section changes; reset page on any filter/sort change
  useEffect(()=>{setSelClasses(new Set());setPage(1);},[selSection]);
  useEffect(()=>setPage(1),[tab,search,statusFilter,selSection,selClasses,sortBy,sortDir]);

  const tabMembers=useMemo(()=>{
    if(tab==="students")return allMembers.filter(m=>m._type==="student");
    if(tab==="educators")return allMembers.filter(m=>m._type==="educator");
    return allMembers;
  },[allMembers,tab]);

  const filtered=useMemo(()=>{
    const q=search.toLowerCase();
    return tabMembers.filter(m=>{
      if(statusFilter&&m.status!==statusFilter)return false;
      if(q&&!m.fullName.toLowerCase().includes(q)&&!String(m._id||"").toLowerCase().includes(q)&&
         !m.email.toLowerCase().includes(q)&&!String(m.phone||"").toLowerCase().includes(q))return false;
      // Section filter
      if(selSection){
        if(m._type==="student"){
          const stuSectionId=String(m._raw.classes?.section_id??"");
          if(stuSectionId!==selSection)return false;
        } else {
          if(String(m._raw.section_id??"")!==selSection)return false;
        }
      }
      // Multi-class filter (students only)
      if(selClasses.size>0&&m._type==="student"&&!selClasses.has(String(m._raw.class_id??"")))return false;
      return true;
    });
  },[tabMembers,search,statusFilter,selSection,selClasses]);

  const sortedFiltered=useMemo(()=>{
    const d=sortDir==="asc"?1:-1;
    return [...filtered].sort((a,b)=>{
      switch(sortBy){
        case"name":    return d*a.fullName.localeCompare(b.fullName);
        case"status":  return d*a.status.localeCompare(b.status);
        case"group":   return d*a.group.localeCompare(b.group);
        case"type":    return d*a._type.localeCompare(b._type);
        case"lastLogin":
          if(!a.lastLogin&&!b.lastLogin)return 0;
          if(!a.lastLogin)return 1;  // no login → pushed to end regardless of dir
          if(!b.lastLogin)return -1;
          return d*(new Date(a.lastLogin)-new Date(b.lastLogin));
        case"dateAdded":
        default:
          if(!a.dateAdded&&!b.dateAdded)return 0;
          if(!a.dateAdded)return 1;
          if(!b.dateAdded)return -1;
          return d*(new Date(a.dateAdded)-new Date(b.dateAdded));
      }
    });
  },[filtered,sortBy,sortDir]);

  const totalPages=Math.max(1,Math.ceil(sortedFiltered.length/PAGE_SIZE));
  const visibleRows=sortedFiltered.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);

  // ── Avatar ──
  const AVATAR_COLORS=["#1A4FA0","#E8560A","#1A8C3C","#7C3AED","#D97706","#DB2777","#0891B2"];
  const avatarColor=name=>{let h=0;for(let c of name)h=(h*31+c.charCodeAt(0))%AVATAR_COLORS.length;return AVATAR_COLORS[h];};
  const initials=m=>{
    const w=m.fullName.trim().split(/\s+/);
    return w.length>=2?w[0][0]+w[w.length-1][0]:w[0]?w[0].slice(0,2):"??";
  };

  // ── Status helpers ──
  const STATUS_OPTIONS=["active","inactive","suspended","graduated","withdrawn","left"];
  const statusDot=s=>({active:"#22c55e",inactive:"#94a3b8",suspended:"#ef4444",graduated:"#8b5cf6",withdrawn:"#f59e0b",left:"#6b7280"}[s]||"#94a3b8");
  const statusLabel=s=>s.charAt(0).toUpperCase()+s.slice(1);

  // ── Send login details (single member) ──
  const sendLoginDetails=async(m)=>{
    if(!m.email){notify(`${m.fullName} has no email address on file`,"error");return;}
    if(m._type==="student"){
      const cls=classes.find(c=>String(c.id)===String(m._raw.class_id));
      await sendPortalEmail({
        to:m.email,
        subject:`Your ${_sn} Portal Login Details`,
        html:buildStudentEmail({studentName:m.fullName,studentId:m._id,className:cls?.name||m.group||"",schoolName:_sn})
      });
    } else {
      await sendPortalEmail({
        to:m.email,
        subject:`Your ${_sn} Staff Portal Login Details`,
        html:buildTeacherEmail({teacherName:m.fullName,teacherEmail:m.email,schoolName:_sn})
      });
    }
    notify(`Login details sent to ${m.email} ✓`);
  };

  // ── Bulk send login details ──
  const bulkSendLoginDetails=()=>{
    if(!selectedIds.size){notify("Select members first","error");return;}
    const targets=allMembers.filter(m=>selectedIds.has(m._type+m._id));
    const withEmail=targets.filter(m=>m.email);
    const noEmail=targets.length-withEmail.length;
    if(!withEmail.length){notify("None of the selected members have an email address","error");return;}
    if(noEmail>0) notify(`${noEmail} member(s) skipped — no email address`,"warn");
    const emails=withEmail.map(m=>{
      if(m._type==="student"){
        const cls=classes.find(c=>String(c.id)===String(m._raw.class_id));
        return{to:m.email,subject:`Your ${_sn} Portal Login Details`,
          html:buildStudentEmail({studentName:m.fullName,studentId:m._id,className:cls?.name||m.group||"",schoolName:_sn})};
      }
      return{to:m.email,subject:`Your ${_sn} Staff Portal Login Details`,
        html:buildTeacherEmail({teacherName:m.fullName,teacherEmail:m.email,schoolName:_sn})};
    });
    setMembersEmailQueue(emails);
    clearSelection();
  };

  // ── Bulk export CSV ──
  const exportCSV=()=>{
    const hdrs=["Type","Name","ID","Email","Phone","Status","Group/Group","Date Added","Last Login"];
    const rows=filtered.map(m=>[m._type,m.fullName,m._id,m.email,m.phone,m.status,m.group,
      m.dateAdded?new Date(m.dateAdded).toLocaleDateString("en-NG"):"",
      m.lastLogin?new Date(m.lastLogin).toLocaleString("en-NG",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}):"Never"]);
    const csv=[hdrs,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const a=document.createElement("a");
    a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
    a.download="members.csv";a.click();
  };

  // ── Save student ──
  const saveStu=async()=>{
    if(saving)return; // guard: prevent double-click race before re-render disables button
    if(!stuForm.first_name.trim()||!stuForm.last_name.trim()){notify("First and last name are required","error");return;}
    setSaving(true);
    const payload={first_name:stuForm.first_name.trim(),middle_name:stuForm.middle_name.trim()||null,
      last_name:stuForm.last_name.trim(),email:stuForm.email||null,gender:stuForm.gender,
      class_id:stuForm.class_id||null,admission_year:stuForm.admission_year||null,
      status:stuForm.status||"active",
      ...(stuForm.useDob?{dob:stuForm.dob||null}:{dob:null,age:stuForm.age||null})};
    let err,newId;
    if(editTarget){
      ({error:err}=await db.upsertStudent(payload,editTarget._raw.id));
    } else {
      newId=await db.nextStudentId(db._studentIdPrefix||"RGS");
      ({error:err}=await db.upsertStudent({...payload,id:newId,admission_number:newId,password_hash:newId}));
    }
    setSaving(false);
    if(err){notify(err.message,"error");return;}
    if(!editTarget&&newId){
      const stuName=[payload.first_name,payload.middle_name,payload.last_name].filter(Boolean).join(" ");
      const cls=classes.find(c=>String(c.id)===String(payload.class_id));
      if(payload.email){
        setLastRegistered({count:1,entries:[{
          to:payload.email,
          subject:`Welcome to ${_sn} Portal`,
          html:buildStudentEmail({studentName:stuName,studentId:newId,className:cls?.name||"",schoolName:_sn})
        }]});
        setShowOnboarding(true); // auto-open modal so it's never missed on single registration
      }
      notify(`Member added — ID: ${newId} ✓`);
      // Check if any fee templates exist for this student's class level + active term
      if(cls){
        const {data:sessions}=await db.getSessions();
        const activeSess=sessions?.find(s=>s.is_active);
        if(activeSess){
          const {data:terms}=await db.getTerms(activeSess.id);
          const activeTerm=terms?.find(t=>t.is_active)||terms?.[0];
          if(activeTerm){
            const classLevel=cls.level||cls.name;
            const {data:tmpls}=await db.getTemplatesForLevel(classLevel,activeSess.name,activeTerm.name);
            if(tmpls&&tmpls.length) setAutoBillPrompt({studentId:newId,studentName:stuName,templates:tmpls});
          }
        }
      }
    } else {
      notify(editTarget?"Member updated":"Member added");
    }
    setAddModal(null);setEditTarget(null);load();
  };

  // ── Save teacher ──
  const saveTea=async()=>{
    if(saving)return; // guard: prevent double-click race before re-render disables button
    if(!teaForm.full_name.trim()||!teaForm.email.trim()){notify("Name and email are required","error");return;}
    setSaving(true);
    const email=teaForm.email.trim();
    const payload={full_name:teaForm.full_name.trim(),email,
      phone:teaForm.phone||null,gender:teaForm.gender,
      section_id:teaForm.section_id||null,date_joined:teaForm.date_joined||null,
      status:teaForm.status||"active"};
    let err;
    if(editTarget){
      ({error:err}=await db.upsertTeacher(payload,editTarget._raw.id));
    } else {
      ({error:err}=await db.upsertTeacher({...payload,staff_id:email,password_hash:email}));
    }
    setSaving(false);
    if(err){notify(err.message,"error");return;}
    if(!editTarget&&email){
      setLastRegisteredTeachers({count:1,entries:[{
        to:email,
        subject:`Welcome to ${_sn} Staff Portal`,
        html:buildTeacherEmail({teacherName:payload.full_name,teacherEmail:email,schoolName:_sn})
      }]});
      setShowTeacherOnboarding(true); // auto-open modal so it's never missed on single registration
      notify("Educator added ✓");
    } else {
      notify(editTarget?"Educator updated":"Educator added");
    }
    setAddModal(null);setEditTarget(null);load();
  };

  // ── Change status ──
  const applyStatus=async()=>{
    if(!newStatus||!statusModal)return;
    setSaving(true);
    const oldStatus=statusModal.status;
    let err;
    if(statusModal._type==="student"){
      ({error:err}=await db.upsertStudent({status:newStatus},statusModal._raw.id));
    } else {
      ({error:err}=await db.upsertTeacher({status:newStatus},statusModal._raw.id));
    }
    if(!err){
      await db.logAdminAction({
        action:'status_change',
        entity_type:statusModal._type,
        entity_id:String(statusModal._id),
        entity_name:statusModal.fullName,
        old_value:{status:oldStatus},
        new_value:{status:newStatus},
        performed_by:ctx.user?.name||'admin',
      });
    }
    setSaving(false);
    if(err){notify(err.message,"error");return;}
    notify(`Status changed to ${statusLabel(newStatus)}`);
    setStatusModal(null);load();
  };

  // ── Delete ──
  const deleteMember=async(m)=>{
    if(!window.confirm(`Delete ${m.fullName}? They will be moved to the Recycle Bin.`))return;
    const by=ctx.user?.name||'admin';
    let err;
    if(m._type==="student"){
      await db.cancelStudentBills(m._raw.id);
      ({error:err}=await db.softDelete('student',m._raw.id,by));
    } else ({error:err}=await db.softDelete('teacher',m._raw.id,by));
    if(!err){
      await db.logAdminAction({action:'delete',entity_type:m._type,entity_id:String(m._id),
        entity_name:m.fullName,old_value:{status:m.status},performed_by:by});
    }
    if(err){notify(err.message,"error");return;}
    notify(`${m.fullName} moved to Recycle Bin`,"warn");bumpRefresh();
  };

  // ── Change educator role (teacher ↔ manager) ──
  const changeTeacherRole=async(m,newRole)=>{
    setSaving(true);
    const{error}=await db.setTeacherRole(m._raw.id,newRole);
    setSaving(false);
    if(error){notify(error.message,"error");return;}
    await db.logAdminAction({action:'role_change',entity_type:'educator',entity_id:String(m._id),
      entity_name:m.fullName,old_value:{role:m.teacherRole},new_value:{role:newRole},
      performed_by:ctx.user?.name||'admin'});
    // Tier A alert — role change
    db.sendAdminAlert({
      subject:`[Alert] Role Changed — ${m.fullName}`,
      html:buildAlertEmail("Staff Role Changed",
        [`Staff: ${m.fullName}`,`Old Role: ${m.teacherRole||"teacher"}`,`New Role: ${newRole}`,
         `Changed by: ${ctx.user?.full_name||ctx.user?.name||"Admin"}`,
         `Organization: ${_sn}`,`Time: ${new Date().toLocaleString("en-NG")}`],
        "critical",_sn),
      eventKey:"role_change"
    });
    notify(`${m.fullName} is now a ${newRole==="manager"?"Manager":newRole==="bursar"?"Finance Manager":"Staff"}`);
    setRoleChangeModal(null);bumpRefresh();
  };

  // ── Open edit ──
  const openEdit=(m)=>{
    setEditTarget(m);
    if(m._type==="student"){
      const r=m._raw;
      setStuForm({first_name:r.first_name||"",middle_name:r.middle_name||"",last_name:r.last_name||"",
        email:r.email||"",gender:r.gender||"Male",dob:r.dob||"",age:r.age||"",
        useDob:!!r.dob,class_id:r.class_id||"",admission_year:r.admission_year||"",status:r.status||"active"});
      setAddModal("student");
    } else {
      const r=m._raw;
      setTeaForm({full_name:r.full_name||"",email:r.email||"",phone:r.phone||"",
        gender:r.gender||"Male",staff_id:r.staff_id||"",date_joined:r.date_joined||"",
        section_id:r.section_id||"",status:r.status||"active"});
      setAddModal("educator");
    }
  };

  const classMap_=useMemo(()=>{const m={};classes.forEach(c=>m[c.id]=c);return m;},[classes]);

  // ── Bulk actions ──
  // Phase 1: gather warnings and open confirmation modal (no window.confirm)
  const bulkDelete=async()=>{
    const targets=allMembers.filter(m=>selectedIds.has(m._type+m._id));
    if(!targets.length){notify("Select members first","error");return;}
    setConfirmDeleteModal({targets,warnings:[],checking:true});
    // Batch-check all IDs at once — 2 parallel queries per table instead of 2N sequential ones
    const stuIds=targets.filter(m=>m._type==="student").map(m=>String(m._raw.id));
    const teaIds=targets.filter(m=>m._type==="educator").map(m=>String(m._raw.id));
    const warnings=[];
    await Promise.all([
      stuIds.length&&db.batchCountLinked("portal_results","student_id",stuIds).then(c=>{if(c>0)warnings.push(`${c} result record(s) linked to selected students`);}),
      stuIds.length&&db.batchCountLinked("payments","student_id",stuIds).then(c=>{if(c>0)warnings.push(`${c} payment record(s) linked to selected students`);}),
      teaIds.length&&db.batchCountLinked("class_teachers","teacher_id",teaIds).then(c=>{if(c>0)warnings.push(`${c} class teacher assignment(s)`);}),
      teaIds.length&&db.batchCountLinked("teacher_subjects","teacher_id",teaIds).then(c=>{if(c>0)warnings.push(`${c} subject assignment(s)`);})
    ].filter(Boolean));
    setConfirmDeleteModal({targets,warnings,checking:false});
  };

  // Phase 2: actually delete (called from the modal's Confirm button)
  // Uses bulk IN() deletes — a few requests total regardless of selection size
  const executeBulkDelete=async(targets)=>{
    setConfirmDeleteModal(null);
    setSaving(true);
    setBulkOpProgress({done:0,total:targets.length,action:"Deleting"});
    const stuIds=targets.filter(m=>m._type==="student").map(m=>String(m._raw.id));
    const teaIds=targets.filter(m=>m._type==="educator").map(m=>String(m._raw.id));
    let deleted=0,failed=0;
    if(stuIds.length){
      const res=await db.bulkDeleteStudents(stuIds);
      deleted+=res.deleted; failed+=res.failed;
    }
    if(teaIds.length){
      const res=await db.bulkDeleteTeachers(teaIds);
      deleted+=res.deleted; failed+=res.failed;
    }
    // Single audit log entry for the whole operation
    await db.logAdminAction({action:'bulk_delete',entity_type:'member',entity_id:`${targets.length}`,
      entity_name:`${targets.length} member(s)`,performed_by:ctx.user?.name||'admin'});
    setBulkOpProgress({done:targets.length,total:targets.length,action:"Deleting"});
    setSaving(false);
    setBulkOpProgress({done:0,total:0,action:""});
    if(failed) notify(`${deleted} deleted, ${failed} failed`,"warn");
    else notify(`${deleted} member(s) deleted`);
    clearSelection();bumpRefresh();
  };

  const applyBulkStatus=async()=>{
    if(!newStatus)return;
    const targets=allMembers.filter(m=>selectedIds.has(m._type+m._id));
    setSaving(true);
    setBulkOpProgress({done:0,total:targets.length,action:"Updating"});
    const stuIds=targets.filter(m=>m._type==="student").map(m=>String(m._raw.id));
    const teaIds=targets.filter(m=>m._type==="educator").map(m=>String(m._raw.id));
    await Promise.all([
      stuIds.length&&db.bulkSetStudentStatus(stuIds,newStatus),
      teaIds.length&&db.bulkSetTeacherStatus(teaIds,newStatus),
    ].filter(Boolean));
    const actor=ctx.user?.name||'admin';
    const stuTargets=targets.filter(m=>m._type==="student");
    const teaTargets=targets.filter(m=>m._type==="educator");
    if(stuTargets.length){
      await db.logAdminActionBatch(stuTargets.map(m=>({
        action:'status_change',entity_type:'student',
        entity_id:String(m._raw.id),entity_name:m.fullName,
        old_value:{status:m.status},new_value:{status:newStatus},
        performed_by:actor,
      })));
    }
    if(teaTargets.length){
      await db.logAdminActionBatch(teaTargets.map(m=>({
        action:'status_change',entity_type:'teacher',
        entity_id:String(m._raw.id),entity_name:m.fullName,
        old_value:{status:m.status},new_value:{status:newStatus},
        performed_by:actor,
      })));
    }
    setBulkOpProgress({done:targets.length,total:targets.length,action:"Updating"});
    setSaving(false);
    setBulkOpProgress({done:0,total:0,action:""});
    notify(`${targets.length} member(s) updated to ${newStatus}`);
    setBulkStatusModal(false);clearSelection();load();
  };

  // ── Bulk student upload helpers ──
  const injectXLSX=(cb)=>{
    if(window.XLSX){cb();return;}
    const s=document.createElement("script");
    s.src="https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js";
    s.onload=cb;document.head.appendChild(s);
  };
  const downloadStuTemplate=()=>{
    const wb=XLSX.utils.book_new();
    // ── Shared styles ──
    const titleStyle={font:{bold:true,sz:16,color:{rgb:"FFFFFF"}},fill:{fgColor:{rgb:"1A4FA0"}},alignment:{horizontal:"center",vertical:"center"}};
    const subtitleStyle={font:{sz:11,color:{rgb:"1A4FA0"},italic:true},alignment:{horizontal:"center",wrapText:true}};
    const headerStyle={font:{bold:true,sz:11,color:{rgb:"FFFFFF"}},fill:{fgColor:{rgb:"E8560A"}},alignment:{horizontal:"center",vertical:"center",wrapText:true},border:{top:{style:"thin",color:{rgb:"FFFFFF"}},bottom:{style:"thin",color:{rgb:"FFFFFF"}},left:{style:"thin",color:{rgb:"FFFFFF"}},right:{style:"thin",color:{rgb:"FFFFFF"}}}};
    const reqStyle={font:{bold:true,sz:11,color:{rgb:"FFFFFF"}},fill:{fgColor:{rgb:"DC2626"}},alignment:{horizontal:"center",vertical:"center",wrapText:true},border:{top:{style:"thin",color:{rgb:"FFFFFF"}},bottom:{style:"thin",color:{rgb:"FFFFFF"}},left:{style:"thin",color:{rgb:"FFFFFF"}},right:{style:"thin",color:{rgb:"FFFFFF"}}}};
    const exampleStyle={font:{sz:10,color:{rgb:"6B7280"},italic:true},fill:{fgColor:{rgb:"FFF7ED"}},alignment:{horizontal:"left"},border:{bottom:{style:"thin",color:{rgb:"E5E7EB"}}}};
    const guideLabel={font:{bold:true,sz:10,color:{rgb:"1A4FA0"}},fill:{fgColor:{rgb:"EFF6FF"}},alignment:{vertical:"center"}};
    const guideVal={font:{sz:10,color:{rgb:"374151"}},fill:{fgColor:{rgb:"EFF6FF"}},alignment:{vertical:"center",wrapText:true}};
    const dataStyle={border:{bottom:{style:"thin",color:{rgb:"E5E7EB"}},right:{style:"thin",color:{rgb:"F3F4F6"}}},alignment:{vertical:"center"}};
    const refHeaderStyle={font:{bold:true,sz:11,color:{rgb:"FFFFFF"}},fill:{fgColor:{rgb:"1A8C3C"}},alignment:{horizontal:"center",vertical:"center"},border:{bottom:{style:"thin",color:{rgb:"FFFFFF"}}}};
    const refCellStyle={font:{sz:11,color:{rgb:"1A4FA0"},bold:true},fill:{fgColor:{rgb:"F0FDF4"}},alignment:{horizontal:"left",vertical:"center"},border:{bottom:{style:"thin",color:{rgb:"D1FAE5"}}}};
    const refWarnStyle={font:{sz:10,color:{rgb:"DC2626"},italic:true},fill:{fgColor:{rgb:"FEF2F2"}}};

    // Build class name list from state
    const classNames=classes.map(c=>c.name).sort();
    const sectionNames=[...new Set(sections.map(s=>s.name))].sort();
    const exClass1=classNames[0]||"JSS 1A";
    const exClass2=classNames[1]||"JSS 2B";

    // ── Data sheet ──
    const COLS=9;
    const headers=["First Name *","Middle Name","Last Name *","Gender","Date of Birth","Group","Email","Phone","New Intake (Yes/No)"];
    const ws=XLSX.utils.aoa_to_sheet([
      [(db._schoolName||"Organization")+" — Member Upload Template","","","","","","","",""],
      ["Fill in member details starting from Row 4. Do NOT modify the header row (Row 3). Fields marked * are required. See the 'Group & Section List' sheet for exact group names.","","","","","","","",""],
      headers,
      [],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],
    ]);
    ws["!merges"]=[{s:{r:0,c:0},e:{r:0,c:COLS-1}},{s:{r:1,c:0},e:{r:1,c:COLS-1}}];
    ws["!rows"]=[{hpt:36},{hpt:36},{hpt:28}];
    ws["!cols"]=[{wch:20},{wch:18},{wch:20},{wch:12},{wch:22},{wch:16},{wch:28},{wch:18},{wch:20}];
    ws["A1"].s=titleStyle; ws["A2"].s=subtitleStyle;
    const reqCols=[0,2];
    // New Intake column gets a distinct amber style
    const intakeStyle={font:{bold:true,sz:11,color:{rgb:"FFFFFF"}},fill:{fgColor:{rgb:"D97706"}},alignment:{horizontal:"center",vertical:"center",wrapText:true},border:{top:{style:"thin",color:{rgb:"FFFFFF"}},bottom:{style:"thin",color:{rgb:"FFFFFF"}},left:{style:"thin",color:{rgb:"FFFFFF"}},right:{style:"thin",color:{rgb:"FFFFFF"}}}};
    for(let c=0;c<COLS;c++){const a=XLSX.utils.encode_cell({r:2,c});if(ws[a])ws[a].s=c===8?intakeStyle:reqCols.includes(c)?reqStyle:headerStyle;}
    for(let r=3;r<23;r++){for(let c=0;c<COLS;c++){const a=XLSX.utils.encode_cell({r,c});if(!ws[a])ws[a]={v:"",t:"s"};ws[a].s=dataStyle;}}
    XLSX.utils.book_append_sheet(wb,ws,"Member Data");

    // ── Instructions sheet ──
    const instrRows=[
      ["STUDENT UPLOAD — INSTRUCTIONS",""],
      ["",""],
      ["COLUMN","GUIDE"],
      ["First Name *","Required. Member's first name."],
      ["Middle Name","Optional. Leave blank if none."],
      ["Last Name *","Required. Member's surname / family name."],
      ["Gender","Male or Female. Defaults to Male if left blank."],
      ["Date of Birth","Format: YYYY-MM-DD (e.g. 2015-03-14). Optional."],
      ["Group","Must match a group name EXACTLY as shown on the 'Group & Section List' sheet. Copy-paste to avoid typos. Optional — can be assigned later."],
      ["Email","Member or parent email. Optional."],
      ["Phone","Phone number (member/contact). Optional."],
      ["New Intake (Yes/No)","Enter Yes for first-time enrolees (admission billing apply) or No for returning members. Defaults to No if blank. This controls which billing template is applied when generating bills."],
      ["",""],
      ["IMPORTANT NOTES",""],
      ["1.","Do NOT rename or reorder the columns on the 'Member Data' sheet."],
      ["2.","Delete the two example rows (rows 4-5) before uploading your real data."],
      ["3.","Each member will be auto-assigned an ID (e.g. JD/01) and a default password."],
      ["4.","You can upload up to 200 members at a time."],
      ["5.","Duplicate entries may be created — double-check your data before uploading."],
      ["6.","Accepted file formats for re-upload: .xlsx, .xls, or .csv"],
      ["7.","Check the 'Group & Section List' sheet for the exact group names to use."],
    ];
    const instr=XLSX.utils.aoa_to_sheet(instrRows);
    instr["!merges"]=[{s:{r:0,c:0},e:{r:0,c:1}}];
    instr["!cols"]=[{wch:22},{wch:80}];
    instr["!rows"]=[{hpt:34},{hpt:10},{hpt:24}];
    instr["A1"].s=titleStyle;
    ["A3","B3"].forEach(a=>{if(instr[a])instr[a].s=headerStyle;});
    for(let r=3;r<=10;r++){const a1=XLSX.utils.encode_cell({r,c:0}),a2=XLSX.utils.encode_cell({r,c:1});if(instr[a1])instr[a1].s=guideLabel;if(instr[a2])instr[a2].s=guideVal;}
    const ntr=12;
    const ntAddr=XLSX.utils.encode_cell({r:ntr,c:0});
    if(instr[ntAddr])instr[ntAddr].s={font:{bold:true,sz:12,color:{rgb:"DC2626"}},fill:{fgColor:{rgb:"FEF2F2"}}};
    for(let r=ntr+1;r<instrRows.length;r++){
      const a1=XLSX.utils.encode_cell({r,c:0}),a2=XLSX.utils.encode_cell({r,c:1});
      if(instr[a1])instr[a1].s={font:{bold:true,sz:10,color:{rgb:"DC2626"}}};
      if(instr[a2])instr[a2].s={font:{sz:10,color:{rgb:"374151"}},alignment:{wrapText:true}};
    }
    XLSX.utils.book_append_sheet(wb,instr,"Instructions");

    // ── Group & Section Reference sheet ──
    const refRows=[
      ["CLASS & SECTION LIST — Copy these names exactly","",""],
      ["","",""],
      ["","",""],
      ["CLASSES ON THE PORTAL","","SECTIONS ON THE PORTAL"],
    ];
    const maxLen=Math.max(classNames.length,sectionNames.length);
    for(let i=0;i<maxLen;i++){
      refRows.push([classNames[i]||"","",sectionNames[i]||""]);
    }
    refRows.push(["","",""]);
    refRows.push(["Copy-paste group names into the 'Group' column on the Member Data sheet to avoid spelling errors.","",""]);
    const ref=XLSX.utils.aoa_to_sheet(refRows);
    ref["!merges"]=[{s:{r:0,c:0},e:{r:0,c:2}}];
    ref["!cols"]=[{wch:32},{wch:6},{wch:32}];
    ref["!rows"]=[{hpt:34},{hpt:8},{hpt:8},{hpt:26}];
    ref["A1"].s=titleStyle;
    // Headers
    const clsH=XLSX.utils.encode_cell({r:3,c:0}),secH=XLSX.utils.encode_cell({r:3,c:2});
    if(ref[clsH])ref[clsH].s=refHeaderStyle;
    if(ref[secH])ref[secH].s=refHeaderStyle;
    // Group & section cells
    for(let i=0;i<maxLen;i++){
      const r=4+i;
      const ac=XLSX.utils.encode_cell({r,c:0}),as=XLSX.utils.encode_cell({r,c:2});
      if(ref[ac]&&ref[ac].v)ref[ac].s=refCellStyle;
      if(ref[as]&&ref[as].v)ref[as].s=refCellStyle;
    }
    // Warning row
    const warnRow=4+maxLen+1;
    const warnAddr=XLSX.utils.encode_cell({r:warnRow,c:0});
    if(ref[warnAddr])ref[warnAddr].s=refWarnStyle;
    XLSX.utils.book_append_sheet(wb,ref,"Group & Section List");

    XLSX.writeFile(wb,"JD_Member_Upload_Template.xlsx");
  };
  const parseStuBulkFile=async(file)=>{
    setBulkFile(file);setBulkParsed([]);setBulkErrors([]);
    const reader=new FileReader();
    reader.onload=e=>{
      try{
        const wb=XLSX.read(e.target.result,{type:"array",cellDates:true});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const raw=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
        if(raw.length<2){setBulkErrors(["File is empty or missing data rows."]);return;}
        // Find header row — first row containing "first" (handles title/subtitle rows above)
        const headerRowIdx=raw.findIndex(r=>r.some(c=>String(c).toLowerCase().includes("first")));
        if(headerRowIdx<0){setBulkErrors(["Could not find header row. Make sure the template has a 'First Name' column."]);return;}
        const headers=raw[headerRowIdx].map(h=>String(h).trim().toLowerCase().replace(/[★\*\s]+/g," ").trim());
        const hmap={};
        headers.forEach((h,i)=>{
          if(h.includes("first"))hmap.first_name=i;
          else if(h.includes("middle"))hmap.middle_name=i;
          else if(h.includes("last"))hmap.last_name=i;
          else if(h.includes("gender"))hmap.gender=i;
          else if(h.includes("birth")||h.includes("dob"))hmap.dob=i;
          else if(h.includes("class"))hmap.class_name=i;
          else if(h.includes("email"))hmap.email=i;
          else if(h.includes("phone"))hmap.phone=i;
          else if(h.includes("year")||h.includes("admission"))hmap.admission_year=i;
          else if(h.includes("intake")||h.includes("new enrol")||h.includes("new intake"))hmap.is_new_enrollee=i;
        });
        const get=(row,k)=>hmap[k]!==undefined?String(row[hmap[k]]||"").trim():"";
        const rows=[];const errs=[];
        for(let i=headerRowIdx+1;i<raw.length;i++){
          const row=raw[i];
          if(row.every(c=>!String(c||"").trim()))continue;
          const fn=get(row,"first_name"),ln=get(row,"last_name");
          if(!fn||!ln){errs.push(`Row ${i+1}: First Name and Last Name are required.`);continue;}
          let dobVal=get(row,"dob");
          if(hmap.dob!==undefined&&row[hmap.dob] instanceof Date){const d=row[hmap.dob];dobVal=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
          const intakeRaw=get(row,"is_new_enrollee").toLowerCase();
          const isNewEnrollee=["yes","y","true","1"].includes(intakeRaw);
          rows.push({first_name:fn,middle_name:get(row,"middle_name"),last_name:ln,
            gender:get(row,"gender")||"Male",dob:dobVal,email:get(row,"email"),
            phone:get(row,"phone"),class_name:get(row,"class_name"),
            admission_year:get(row,"admission_year")||String(new Date().getFullYear()),
            is_new_enrollee:isNewEnrollee,_line:i+1});
        }
        setBulkParsed(rows);setBulkErrors(errs);
      }catch(err){setBulkErrors(["Failed to read file: "+err.message]);}
    };
    reader.readAsArrayBuffer(file);
  };
  const saveStuBulk=async()=>{
    if(!bulkParsed.length)return;
    const CHUNK=50;
    const total=bulkParsed.length;
    setBulkSaving(true);setBulkErrors([]);setBulkProgress({done:0,total});
    // Pre-generate all IDs in a single DB read
    const allIds=await db.nextStudentIds(db._studentIdPrefix||"RGS",total);
    let added=0;const errs=[];const emailEntries=[];
    const year=String(new Date().getFullYear());
    // Process in chunks
    for(let i=0;i<bulkParsed.length;i+=CHUNK){
      const chunk=bulkParsed.slice(i,i+CHUNK);
      const payloads=chunk.map((row,j)=>{
        const id=allIds[i+j];
        const cls=classes.find(c=>c.name.trim().toLowerCase()===row.class_name.trim().toLowerCase());
        const name=[row.first_name,row.middle_name,row.last_name].filter(Boolean).join(" ");
        return {id,admission_number:id,password_hash:id,name,
          first_name:row.first_name,middle_name:row.middle_name||null,last_name:row.last_name,
          gender:row.gender||"Male",dob:row.dob||null,email:row.email||null,
          phone:row.phone||null,class_id:cls?.id||null,
          admission_year:row.admission_year||year,status:"active",
          is_new_enrollee:row.is_new_enrollee===true};
      });
      const {error}=await db.insertStudentsBulk(payloads);
      if(error){
        // Chunk failed — record each row in chunk as error
        chunk.forEach(row=>errs.push(`Row ${row._line} (${row.first_name} ${row.last_name}): ${error.message}`));
      } else {
        added+=chunk.length;
        // Collect email entries for deferred consent-based sending
        for(const p of payloads){
          if(p.email){
            emailEntries.push({
              to:p.email,
              subject:`Welcome to ${_sn} Portal`,
              html:buildStudentEmail({studentName:p.name,studentId:p.id,
                className:classes.find(c=>c.id===p.class_id)?.name||"",schoolName:_sn})
            });
          }
        }
      }
      setBulkProgress({done:Math.min(i+CHUNK,total),total});
    }
    setBulkSaving(false);setBulkErrors(errs);
    if(added>0){
      notify(`${added} student(s) uploaded ✓`);
      load();
      if(emailEntries.length>0) setLastRegistered({count:added,entries:emailEntries});
      // Collect uploaded students for post-upload billing prompt
      const uploadedStudents=[];
      for(let i=0;i<bulkParsed.length;i++){
        const row=bulkParsed[i];
        const id=allIds[i];
        const cls=classes.find(c=>c.name.trim().toLowerCase()===row.class_name.trim().toLowerCase());
        if(cls) uploadedStudents.push({
          id,
          name:[row.first_name,row.middle_name,row.last_name].filter(Boolean).join(" "),
          classId:cls.id,className:cls.name,classLevel:cls.level||cls.name,
          is_new_enrollee:row.is_new_enrollee===true,
        });
      }
      if(uploadedStudents.length) setBulkBillPrompt(uploadedStudents);
    }
    if(errs.length===0){setBulkStuModal(false);setBulkParsed([]);setBulkFile(null);}
  };

  // ── Bulk teacher upload helpers ──
  const downloadTeaTemplate=()=>{
    const wb=XLSX.utils.book_new();
    const titleStyle={font:{bold:true,sz:16,color:{rgb:"FFFFFF"}},fill:{fgColor:{rgb:"1A4FA0"}},alignment:{horizontal:"center",vertical:"center"}};
    const subtitleStyle={font:{sz:11,color:{rgb:"1A4FA0"},italic:true},alignment:{horizontal:"center",wrapText:true}};
    const headerStyle={font:{bold:true,sz:11,color:{rgb:"FFFFFF"}},fill:{fgColor:{rgb:"E8560A"}},alignment:{horizontal:"center",vertical:"center",wrapText:true},border:{top:{style:"thin",color:{rgb:"FFFFFF"}},bottom:{style:"thin",color:{rgb:"FFFFFF"}},left:{style:"thin",color:{rgb:"FFFFFF"}},right:{style:"thin",color:{rgb:"FFFFFF"}}}};
    const reqStyle={font:{bold:true,sz:11,color:{rgb:"FFFFFF"}},fill:{fgColor:{rgb:"DC2626"}},alignment:{horizontal:"center",vertical:"center",wrapText:true},border:{top:{style:"thin",color:{rgb:"FFFFFF"}},bottom:{style:"thin",color:{rgb:"FFFFFF"}},left:{style:"thin",color:{rgb:"FFFFFF"}},right:{style:"thin",color:{rgb:"FFFFFF"}}}};
    const exampleStyle={font:{sz:10,color:{rgb:"6B7280"},italic:true},fill:{fgColor:{rgb:"FFF7ED"}},alignment:{horizontal:"left"},border:{bottom:{style:"thin",color:{rgb:"E5E7EB"}}}};
    const guideLabel={font:{bold:true,sz:10,color:{rgb:"1A4FA0"}},fill:{fgColor:{rgb:"EFF6FF"}},alignment:{vertical:"center"}};
    const guideVal={font:{sz:10,color:{rgb:"374151"}},fill:{fgColor:{rgb:"EFF6FF"}},alignment:{vertical:"center",wrapText:true}};
    const dataStyle={border:{bottom:{style:"thin",color:{rgb:"E5E7EB"}},right:{style:"thin",color:{rgb:"F3F4F6"}}},alignment:{vertical:"center"}};
    const refHeaderStyle={font:{bold:true,sz:11,color:{rgb:"FFFFFF"}},fill:{fgColor:{rgb:"1A8C3C"}},alignment:{horizontal:"center",vertical:"center"},border:{bottom:{style:"thin",color:{rgb:"FFFFFF"}}}};
    const refCellStyle={font:{sz:11,color:{rgb:"1A4FA0"},bold:true},fill:{fgColor:{rgb:"F0FDF4"}},alignment:{horizontal:"left",vertical:"center"},border:{bottom:{style:"thin",color:{rgb:"D1FAE5"}}}};
    const refWarnStyle={font:{sz:10,color:{rgb:"DC2626"},italic:true},fill:{fgColor:{rgb:"FEF2F2"}}};

    const sectionNames=[...new Set(sections.map(s=>s.name))].sort();
    const exSec1=sectionNames[0]||"Primary";
    const exSec2=sectionNames[1]||"Secondary";

    // ── Data sheet (no Category Specialisation) ──
    const COLS=5;
    const headers=["Full Name *","Email *","Phone","Gender","Section"];
    const ws=XLSX.utils.aoa_to_sheet([
      [(db._schoolName||"Organization")+" — Staff/Educator Upload Template","","","",""],
      ["Fill in educator details starting from Row 4. Do NOT modify the header row (Row 3). Fields marked * are required. See 'Section List' sheet for exact section names.","","","",""],
      headers,
      [],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],
    ]);
    ws["!merges"]=[{s:{r:0,c:0},e:{r:0,c:COLS-1}},{s:{r:1,c:0},e:{r:1,c:COLS-1}}];
    ws["!rows"]=[{hpt:36},{hpt:36},{hpt:28}];
    ws["!cols"]=[{wch:28},{wch:32},{wch:18},{wch:12},{wch:20}];
    ws["A1"].s=titleStyle; ws["A2"].s=subtitleStyle;
    const reqCols=[0,1];
    for(let c=0;c<COLS;c++){const a=XLSX.utils.encode_cell({r:2,c});if(ws[a])ws[a].s=reqCols.includes(c)?reqStyle:headerStyle;}
    for(let r=3;r<23;r++){for(let c=0;c<COLS;c++){const a=XLSX.utils.encode_cell({r,c});if(!ws[a])ws[a]={v:"",t:"s"};ws[a].s=dataStyle;}}
    XLSX.utils.book_append_sheet(wb,ws,"Staff Data");

    // ── Instructions sheet ──
    const instrRows=[
      ["TEACHER UPLOAD — INSTRUCTIONS",""],
      ["",""],
      ["COLUMN","GUIDE"],
      ["Full Name *","Required. Staff's full name including title (e.g. Mrs. Ada Obi)."],
      ["Email *","Required. This becomes the staff's login username AND default password."],
      ["Phone","Optional. Staff's phone number."],
      ["Gender","Male or Female. Defaults to Male if left blank."],
      ["Section","Optional. Must match a section name EXACTLY as shown on the 'Section List' sheet. Copy-paste to avoid typos."],
      ["",""],
      ["IMPORTANT NOTES",""],
      ["1.","Do NOT rename or reorder the columns on the 'Staff Data' sheet."],
      ["2.","Delete the two example rows (rows 4-5) before uploading your real data."],
      ["3.","The staff's EMAIL is used as both their Staff ID and default password."],
      ["4.","Staff should change their password after their first login."],
      ["5.","You can upload up to 100 educators at a time."],
      ["6.","If a staff with the same email already exists, the upload may fail for that row."],
      ["7.","Check the 'Section List' sheet for exact section names to use."],
    ];
    const instr=XLSX.utils.aoa_to_sheet(instrRows);
    instr["!merges"]=[{s:{r:0,c:0},e:{r:0,c:1}}];
    instr["!cols"]=[{wch:22},{wch:80}];
    instr["!rows"]=[{hpt:34},{hpt:10},{hpt:24}];
    instr["A1"].s=titleStyle;
    ["A3","B3"].forEach(a=>{if(instr[a])instr[a].s=headerStyle;});
    for(let r=3;r<=7;r++){const a1=XLSX.utils.encode_cell({r,c:0}),a2=XLSX.utils.encode_cell({r,c:1});if(instr[a1])instr[a1].s=guideLabel;if(instr[a2])instr[a2].s=guideVal;}
    const ntr=9;
    const ntAddr=XLSX.utils.encode_cell({r:ntr,c:0});
    if(instr[ntAddr])instr[ntAddr].s={font:{bold:true,sz:12,color:{rgb:"DC2626"}},fill:{fgColor:{rgb:"FEF2F2"}}};
    for(let r=ntr+1;r<instrRows.length;r++){
      const a1=XLSX.utils.encode_cell({r,c:0}),a2=XLSX.utils.encode_cell({r,c:1});
      if(instr[a1])instr[a1].s={font:{bold:true,sz:10,color:{rgb:"DC2626"}}};
      if(instr[a2])instr[a2].s={font:{sz:10,color:{rgb:"374151"}},alignment:{wrapText:true}};
    }
    XLSX.utils.book_append_sheet(wb,instr,"Instructions");

    // ── Section Reference sheet ──
    const refRows=[
      ["SECTION LIST — Copy these names exactly"],
      [""],
      [""],
      ["SECTIONS ON THE PORTAL"],
    ];
    sectionNames.forEach(s=>refRows.push([s]));
    refRows.push([""]);
    refRows.push(["Copy-paste section names into the 'Section' column on the Staff Data sheet to avoid spelling errors."]);
    const ref=XLSX.utils.aoa_to_sheet(refRows);
    ref["!cols"]=[{wch:50}];
    ref["!rows"]=[{hpt:34},{hpt:8},{hpt:8},{hpt:26}];
    ref["A1"].s=titleStyle;
    const shdr=XLSX.utils.encode_cell({r:3,c:0});
    if(ref[shdr])ref[shdr].s=refHeaderStyle;
    for(let i=0;i<sectionNames.length;i++){const a=XLSX.utils.encode_cell({r:4+i,c:0});if(ref[a]&&ref[a].v)ref[a].s=refCellStyle;}
    const warnRow=4+sectionNames.length+1;
    const warnAddr=XLSX.utils.encode_cell({r:warnRow,c:0});
    if(ref[warnAddr])ref[warnAddr].s=refWarnStyle;
    XLSX.utils.book_append_sheet(wb,ref,"Section List");

    XLSX.writeFile(wb,"JD_Staff_Upload_Template.xlsx");
  };
  const parseTeaBulkFile=async(file)=>{
    setBulkFile(file);setBulkParsed([]);setBulkErrors([]);
    const reader=new FileReader();
    reader.onload=e=>{
      try{
        const wb=XLSX.read(e.target.result,{type:"array"});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const raw=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
        if(raw.length<2){setBulkErrors(["File is empty or missing data rows."]);return;}
        // Find header row — first row containing "full" or "email" (handles title/subtitle rows above)
        const headerRowIdx=raw.findIndex(r=>r.some(c=>{const s=String(c).toLowerCase();return s.includes("full")||s.includes("email");}));
        if(headerRowIdx<0){setBulkErrors(["Could not find header row. Make sure the template has a 'Full Name' column."]);return;}
        const headers=raw[headerRowIdx].map(h=>String(h).trim().toLowerCase().replace(/[★\*\s]+/g," ").trim());
        const hmap={};
        headers.forEach((h,i)=>{
          if(h.includes("full")||h.includes("name"))hmap.full_name=i;
          if(h.includes("email"))hmap.email=i;
          if(h.includes("phone"))hmap.phone=i;
          if(h.includes("gender"))hmap.gender=i;
          if(h.includes("section"))hmap.section_name=i;
        });
        const get=(row,k)=>hmap[k]!==undefined?String(row[hmap[k]]||"").trim():"";
        const rows=[];const errs=[];
        for(let i=headerRowIdx+1;i<raw.length;i++){
          const row=raw[i];
          if(row.every(c=>!String(c||"").trim()))continue;
          const fn=get(row,"full_name"),em=get(row,"email");
          if(!fn){errs.push(`Row ${i+1}: Full Name is required.`);continue;}
          if(!em){errs.push(`Row ${i+1} (${fn}): Email is required.`);continue;}
          rows.push({full_name:fn,email:em,phone:get(row,"phone"),
            gender:get(row,"gender")||"Male",
            section_name:get(row,"section_name"),_line:i+1});
        }
        setBulkParsed(rows);setBulkErrors(errs);
      }catch(err){setBulkErrors(["Failed to read file: "+err.message]);}
    };
    reader.readAsArrayBuffer(file);
  };
  const saveTeaBulk=async()=>{
    if(!bulkParsed.length)return;
    setBulkSaving(true);
    let added=0;const errs=[];const emailEntries=[];
    for(const row of bulkParsed){
      const sec=sections.find(s=>s.name.trim().toLowerCase()===row.section_name.trim().toLowerCase());
      const payload={full_name:row.full_name,email:row.email,staff_id:row.email,
        password_hash:row.email,phone:row.phone||null,gender:row.gender||"Male",
        section_id:sec?.id||null,status:"active"};
      const {error}=await db.upsertTeacher(payload);
      if(error){errs.push(`Row ${row._line} (${row.full_name}): ${error.message}`);continue;}
      added++;
      if(row.email){
        emailEntries.push({
          to:row.email,
          subject:`Welcome to ${_sn} Staff Portal`,
          html:buildTeacherEmail({teacherName:row.full_name,teacherEmail:row.email,schoolName:_sn})
        });
      }
    }
    setBulkSaving(false);setBulkErrors(errs);
    if(added>0){notify(`${added} teacher(s) uploaded ✓`);load();if(emailEntries.length>0)setLastRegisteredTeachers({count:added,entries:emailEntries});}
    if(errs.length===0){setBulkTeaModal(false);setBulkParsed([]);setBulkFile(null);}
  };

  return(
    <div>
      {/* ── Header ── */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="members" size={20}/>Members</h2>
          <p style={{fontSize:12,color:C.muted}}>Manage all members and educators in one place</p>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <Btn onClick={load} color={C.blue} outline xs>Load Records</Btn>
          <select onChange={e=>{
              const v=e.target.value;e.target.value="";
              if(v==="csv")exportCSV();
              else if(v==="bulk-status"){if(!selectedIds.size){notify("Select members first","error");return;}setNewStatus("");setBulkStatusModal(true);}
              else if(v==="bulk-delete"){if(!selectedIds.size){notify("Select members first","error");return;}bulkDelete();}
              else if(v==="bulk-send-login")bulkSendLoginDetails();
            }}
            style={{padding:"7px 12px",border:`2px solid ${selectedIds.size>0?C.orange:C.border}`,borderRadius:8,fontSize:12,fontWeight:600,
              cursor:"pointer",background:selectedIds.size>0?C.orangePale:"#fff",color:C.text,outline:"none"}}>
            <option value="">{selectedIds.size>0?`${selectedIds.size} selected`:"Bulk Actions"}</option>
            <option value="bulk-status">Change Status (selected)</option>
            <option value="bulk-send-login">Send Login Details (selected)</option>
            <option value="bulk-delete">Delete Selected</option>
            <option value="csv">Export CSV (all filtered)</option>
          </select>
          <Btn onClick={()=>{setBulkParsed([]);setBulkErrors([]);setBulkFile(null);setBulkStuModal(true);}} color={C.green} outline>Bulk Members</Btn>
          <Btn onClick={()=>{setBulkParsed([]);setBulkErrors([]);setBulkFile(null);setBulkTeaModal(true);}} color={C.green} outline>Bulk Educators</Btn>
          <Btn onClick={()=>{setEditTarget(null);setStuForm(blankStu());setAddModal("student");}} color={C.orange}>Add Member</Btn>
          <Btn onClick={()=>{setEditTarget(null);setTeaForm(blankTea());setAddModal("educator");}} color={C.blue}>Add Educator</Btn>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div style={{display:"flex",gap:3,marginBottom:14,background:C.offWhite,borderRadius:10,padding:4,width:"fit-content"}}>
        {TABS.map(t=>{
          const cnt=t.id==="all"?allMembers.length:allMembers.filter(m=>m._type===(t.id==="educators"?"educator":t.id.slice(0,-1))).length;
          const isActive=tab===t.id;
          return(
            <button key={t.id} onClick={()=>{setTab(t.id);setSearch("");setStatusFilter("");}}
              style={{padding:"8px 16px",borderRadius:7,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,
                display:"flex",alignItems:"center",gap:6,
                background:isActive?C.blue:"transparent",color:isActive?"#fff":C.muted,transition:"all .15s"}}>
              <AppIcon name={t.icon} size={14} color={isActive?"#fff":C.muted}/>{t.label}
              <span style={{background:isActive?"rgba(255,255,255,.25)":"rgba(0,0,0,.08)",
                color:isActive?"#fff":C.muted,borderRadius:99,padding:"1px 7px",fontSize:11}}>{cnt}</span>
            </button>
          );
        })}
      </div>

      {/* ── Stats banner ── */}
      {!bannerDismissed&&(
        <div style={{background:C.bluePale,border:`1px solid ${C.blue}`,borderRadius:9,padding:"10px 16px",
          marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <div style={{fontSize:13,color:C.blue,fontWeight:600}}>
            <strong>{filtered.length}</strong> member{filtered.length!==1?"s":""} found
            {filtered.length>0&&<span style={{color:C.muted,fontWeight:400,marginLeft:8}}>
              · Showing {Math.min((page-1)*PAGE_SIZE+1,filtered.length)}–{Math.min(page*PAGE_SIZE,filtered.length)} of {filtered.length}
            </span>}
          </div>
          <div style={{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontSize:12,color:C.muted}}>
              {allMembers.filter(m=>m.status==="active").length} active ·
              {allMembers.filter(m=>m.status!=="active").length} inactive
            </span>
            <button onClick={()=>setBannerDismissed(true)}
              style={{background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:18,lineHeight:1,padding:0}}>×</button>
          </div>
        </div>
      )}

      {/* ── Search + filter bar ── */}
      <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap",alignItems:"center"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, ID, or email…"
          style={{flex:2,minWidth:180,padding:"9px 13px",border:`2px solid ${C.border}`,borderRadius:8,
            fontSize:13,outline:"none",transition:"border .15s"}}
          onFocus={e=>e.target.style.borderColor=C.blue} onBlur={e=>e.target.style.borderColor=C.border}/>
        <select value={selSection} onChange={e=>setSelSection(e.target.value)}
          style={{flex:1,minWidth:130,padding:"9px 10px",border:`2px solid ${selSection?C.blue:C.border}`,
            borderRadius:8,fontSize:13,background:selSection?C.bluePale:"#fff",color:C.text,fontWeight:selSection?700:400,cursor:"pointer"}}>
          <option value="">All Sections</option>
          {sections.map(s=><option key={s.id} value={String(s.id)}>{s.name}</option>)}
        </select>
        {/* Multi-class dropdown — only makes sense when filtering students */}
        {(tab==="students"||tab==="all")&&(
          <ClassMultiSelect
            classes={classesBySection}
            selClasses={selClasses}
            onToggle={id=>setSelClasses(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;})}
            onClear={()=>setSelClasses(new Set())}/>
        )}
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}
          style={{padding:"9px 12px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:12,outline:"none",background:C.white,color:C.text,cursor:"pointer"}}>
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map(s=><option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
        {/* Sort controls */}
        <select value={sortBy} onChange={e=>setSortBy(e.target.value)}
          style={{padding:"9px 12px",border:`2px solid ${sortBy!=="dateAdded"?C.orange:C.border}`,borderRadius:8,
            fontSize:12,outline:"none",background:sortBy!=="dateAdded"?C.orangePale:C.white,color:C.text,cursor:"pointer"}}>
          <option value="dateAdded">Sort: Last Added</option>
          <option value="name">Sort: Name</option>
          <option value="lastLogin">Sort: Last Login</option>
          <option value="status">Sort: Status</option>
          <option value="group">Sort: Group / Section</option>
          <option value="type">Sort: Type</option>
        </select>
        <button onClick={()=>setSortDir(d=>d==="asc"?"desc":"asc")}
          title={sortDir==="asc"?"Ascending — click for Descending":"Descending — click for Ascending"}
          style={{padding:"9px 11px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:12,
            background:C.white,cursor:"pointer",display:"flex",alignItems:"center",gap:3,color:C.muted,
            fontWeight:700,whiteSpace:"nowrap"}}>
          {sortDir==="asc"?<ChevronUp size={14}/>:<ChevronDown size={14}/>}
          {sortDir==="asc"?"A→Z":"Z→A"}
        </button>
        {(search||statusFilter||selSection||selClasses.size>0)&&(
          <button onClick={()=>{setSearch("");setStatusFilter("");setSelSection("");setSelClasses(new Set());}}
            style={{padding:"9px 12px",border:`2px solid ${C.red}33`,borderRadius:8,fontSize:12,
              background:C.redPale,color:C.red,cursor:"pointer",fontWeight:700,whiteSpace:"nowrap"}}>
            Clear
          </button>
        )}
      </div>
      <div style={{fontSize:11,color:C.muted,marginBottom:10}}>
        {filtered.length} member{filtered.length!==1?"s":""} matched
        {filtered.length>PAGE_SIZE?` · showing ${(page-1)*PAGE_SIZE+1}–${Math.min(page*PAGE_SIZE,filtered.length)}`:""}
      </div>

      {/* ── Selection action bar / progress bar ── */}
      {(selectedIds.size>0||saving)&&(
        <div style={{marginBottom:10,background:C.blue,borderRadius:10,color:"#fff",overflow:"hidden"}}>
          {saving&&bulkOpProgress.total>0?(
            /* Progress bar mode */
            <div style={{padding:"12px 16px"}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13,fontWeight:700,marginBottom:8}}>
                <span>⏳ {bulkOpProgress.action} members…</span>
                <span>{bulkOpProgress.done} / {bulkOpProgress.total}</span>
              </div>
              <div style={{background:"rgba(255,255,255,.2)",borderRadius:99,height:10,overflow:"hidden"}}>
                <div style={{height:"100%",borderRadius:99,
                  background:"linear-gradient(90deg,#22c55e,#86efac)",
                  width:`${bulkOpProgress.total?Math.round((bulkOpProgress.done/bulkOpProgress.total)*100):0}%`,
                  transition:"width .3s ease"}}/>
              </div>
              <div style={{fontSize:11,opacity:.8,marginTop:5,textAlign:"center"}}>
                {bulkOpProgress.total?Math.round((bulkOpProgress.done/bulkOpProgress.total)*100):0}% complete — please keep this window open
              </div>
            </div>
          ):(
            /* Normal selection bar */
            <div style={{display:"flex",alignItems:"center",gap:12,padding:"10px 16px",flexWrap:"wrap"}}>
              <span style={{fontWeight:700,fontSize:13}}>{selectedIds.size} member{selectedIds.size!==1?"s":""} selected</span>
              <div style={{flex:1}}/>
              <Btn xs onClick={()=>{setNewStatus("");setBulkStatusModal(true);}}
            style={{background:"rgba(255,255,255,.2)",border:"1px solid rgba(255,255,255,.4)",color:"#fff"}}>
            Change Status
          </Btn>
              <Btn xs onClick={bulkDelete} disabled={saving} style={{background:"rgba(239,68,68,.8)",border:"none",color:"#fff"}}>Delete</Btn>
              <Btn xs onClick={clearSelection} disabled={saving} style={{background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.3)",color:"#fff"}}>Clear</Btn>
            </div>
          )}
        </div>
      )}

      {(
        <Card style={{padding:0,overflow:"hidden"}}>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{background:C.offWhite,borderBottom:`2px solid ${C.border}`}}>
                  <th style={{padding:"12px 14px",width:40}}>
                    <input type="checkbox"
                      checked={visibleRows.length>0&&visibleRows.every(m=>selectedIds.has(m._type+m._id))}
                      ref={el=>{if(el)el.indeterminate=visibleRows.some(m=>selectedIds.has(m._type+m._id))&&!visibleRows.every(m=>selectedIds.has(m._type+m._id));}}
                      onChange={e=>{
                        if(e.target.checked)setSelectedIds(prev=>{const n=new Set(prev);visibleRows.forEach(m=>n.add(m._type+m._id));return n;});
                        else setSelectedIds(prev=>{const n=new Set(prev);visibleRows.forEach(m=>n.delete(m._type+m._id));return n;});
                      }}
                      style={{width:15,height:15,cursor:"pointer",accentColor:C.blue}}/>
                  </th>
                  <th style={{padding:"12px 16px",textAlign:"left",fontWeight:700,color:C.muted,fontSize:11,whiteSpace:"nowrap"}}>MEMBER</th>
                  <th style={{padding:"12px 10px",textAlign:"left",fontWeight:700,color:C.muted,fontSize:11}}>PHONE</th>
                  <th style={{padding:"12px 10px",textAlign:"left",fontWeight:700,color:C.muted,fontSize:11}}>EMAIL</th>
                  <th style={{padding:"12px 10px",textAlign:"center",fontWeight:700,color:C.muted,fontSize:11}}>STATUS</th>
                  <th style={{padding:"12px 10px",textAlign:"center",fontWeight:700,color:C.muted,fontSize:11}}>TYPE</th>
                  <th style={{padding:"12px 10px",textAlign:"left",fontWeight:700,color:C.muted,fontSize:11}}>GROUP / GROUP</th>
                  <th style={{padding:"12px 10px",textAlign:"left",fontWeight:700,color:C.muted,fontSize:11,whiteSpace:"nowrap"}}>DATE ADDED</th>
                  <th style={{padding:"12px 10px",textAlign:"left",fontWeight:700,color:C.muted,fontSize:11,whiteSpace:"nowrap"}}>LAST LOGIN</th>
                  <th style={{padding:"12px 10px",textAlign:"center",fontWeight:700,color:C.muted,fontSize:11}}></th>
                </tr>
              </thead>
              {loading?<TableSkeleton rows={8} cols={9}/>:(
              <tbody>
                {visibleRows.length===0?(
                  <tr><td colSpan={9} style={{textAlign:"center",padding:48,color:C.light}}>
                    <div style={{marginBottom:8}}><Search size={36} color={C.muted}/></div>
                    <div style={{fontWeight:700,color:C.blue}}>No members found</div>
                    <div style={{fontSize:12,marginTop:4}}>Try adjusting your search or filters</div>
                  </td></tr>
                ):visibleRows.map((m,i)=>{
                  const color=avatarColor(m.fullName);
                  const dot=statusDot(m.status);
                  const uid=m._type+m._id;
                  const isChecked=selectedIds.has(uid);
                  const isEven=i%2===0;
                  const dateFmt=m.dateAdded?new Date(m.dateAdded).toLocaleDateString("en-NG",{day:"2-digit",month:"short",year:"numeric"}):"—";
                  return(
                    <tr key={uid} style={{background:isChecked?C.bluePale:isEven?C.white:C.offWhite,
                      borderBottom:`1px solid ${C.border}`,transition:"background .1s"}}
                      onMouseEnter={e=>{if(!isChecked)e.currentTarget.style.background=C.bluePale;}}
                      onMouseLeave={e=>{if(!isChecked)e.currentTarget.style.background=isEven?C.white:C.offWhite;}}>
                      {/* Checkbox */}
                      <td style={{padding:"12px 14px"}} onClick={e=>e.stopPropagation()}>
                        <input type="checkbox" checked={isChecked} onChange={()=>toggleSelect(uid)}
                          style={{width:15,height:15,cursor:"pointer",accentColor:C.blue}}/>
                      </td>
                      {/* Avatar + Name + ID */}
                      <td style={{padding:"12px 16px",whiteSpace:"nowrap"}}>
                        <div style={{display:"flex",alignItems:"center",gap:11}}>
                          <div style={{width:38,height:38,borderRadius:"50%",background:color,flexShrink:0,
                            display:"flex",alignItems:"center",justifyContent:"center",
                            color:"#fff",fontWeight:800,fontSize:13,letterSpacing:.5}}>
                            {initials(m).toUpperCase()}
                          </div>
                          <div>
                            {m._type==="student"?(
                              <button onClick={()=>setProfileStudent(m)}
                                style={{background:"none",border:"none",padding:0,margin:0,
                                  fontWeight:700,fontSize:13,color:C.blue,cursor:"pointer",
                                  textDecoration:"underline",textUnderlineOffset:2,
                                  fontFamily:"inherit",textAlign:"left"}}>
                                {m.fullName}
                              </button>
                            ):(
                              <div style={{fontWeight:700,fontSize:13,color:C.text}}>{m.fullName}</div>
                            )}
                            <div style={{fontSize:11,color:C.muted,marginTop:1}}>{m._id}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{padding:"12px 10px",color:m.phone?C.text:C.light,fontSize:12}}>{m.phone||"—"}</td>
                      <td style={{padding:"12px 10px",color:m.email?C.blue:C.light,fontSize:12,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {m.email?<a href={`mailto:${m.email}`} style={{color:C.blue,textDecoration:"none"}}>{m.email}</a>:"—"}
                      </td>
                      {/* Status dot */}
                      <td style={{padding:"12px 10px",textAlign:"center"}}>
                        <div style={{display:"inline-flex",alignItems:"center",gap:5,background:`${dot}18`,
                          borderRadius:99,padding:"4px 10px"}}>
                          <div style={{width:7,height:7,borderRadius:"50%",background:dot,flexShrink:0}}/>
                          <span style={{fontSize:11,fontWeight:700,color:dot}}>{statusLabel(m.status)}</span>
                        </div>
                      </td>
                      {/* Type badge */}
                      <td style={{padding:"12px 10px",textAlign:"center"}}>
                        <Badge color={m._type==="student"?C.blue:C.orange}>
                          {m._type==="student"?"Member":"Educator"}
                        </Badge>
                      </td>
                      <td style={{padding:"12px 10px",color:C.text,fontSize:12}}>{m.group}</td>
                      <td style={{padding:"12px 10px",color:C.muted,fontSize:11,whiteSpace:"nowrap"}}>{dateFmt}</td>
                      <td style={{padding:"12px 10px",fontSize:11,whiteSpace:"nowrap"}}>
                        {m.lastLogin?(()=>{
                          const d=new Date(m.lastLogin);
                          const now=new Date();
                          const diffMs=now-d;
                          const diffMin=Math.floor(diffMs/60000);
                          const diffH=Math.floor(diffMin/60);
                          const diffD=Math.floor(diffH/24);
                          let rel;
                          if(diffMin<2) rel="Just now";
                          else if(diffMin<60) rel=`${diffMin}m ago`;
                          else if(diffH<24) rel=`${diffH}h ago`;
                          else if(diffD===1) rel="Yesterday";
                          else if(diffD<7) rel=`${diffD}d ago`;
                          else rel=d.toLocaleDateString("en-NG",{day:"2-digit",month:"short",year:"numeric"});
                          const full=d.toLocaleDateString("en-NG",{day:"2-digit",month:"short",year:"numeric"})+" "+d.toLocaleTimeString("en-NG",{hour:"2-digit",minute:"2-digit"});
                          return <span title={full} style={{color:C.text,cursor:"default"}}>{rel}</span>;
                        })():<span style={{color:C.light}}>Never</span>}
                      </td>
                      {/* Actions ⋮ */}
                      <td style={{padding:"12px 10px",textAlign:"center"}}>
                        <ActionsMenu items={[
                          ...(m._type==="student"?[{label:"View Profile",onClick:()=>setProfileStudent(m),icon:<User size={13}/>}]:[]),
                          {label:"Edit",onClick:()=>openEdit(m)},
                          {label:"Change Status",onClick:()=>{setStatusModal(m);setNewStatus(m.status);}},
                          ...(m._type==="educator"?[
                            {label:"Edit Credentials",onClick:()=>setCredModal({m,staffId:m._id||"",newPw:"",showPw:false})},
                            ...(m.teacherRole!=="teacher"?[{label:"Change to Staff",onClick:()=>setRoleChangeModal({m,newRole:"teacher"})}]:[]),
                            ...(m.teacherRole!=="manager"?[{label:"Change to Manager",onClick:()=>setRoleChangeModal({m,newRole:"manager"})}]:[]),
                            ...(m.teacherRole!=="bursar"?[{label:"Change to Finance Manager",onClick:()=>setRoleChangeModal({m,newRole:"bursar"})}]:[]),
                          ]:[]),
                          {label:"Send Login Details",onClick:()=>sendLoginDetails(m),disabled:!m.email},
                          {label:"Delete",onClick:()=>deleteMember(m),danger:true},
                        ]}/>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              )}
            </table>
          </div>

          {/* ── Pagination ── */}
          {totalPages>1&&(
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"12px 16px",borderTop:`1px solid ${C.border}`,background:C.offWhite}}>
              <div style={{fontSize:12,color:C.muted}}>
                Page {page} of {totalPages} · {filtered.length} total records
              </div>
              <div style={{display:"flex",gap:4}}>
                <Btn xs onClick={()=>setPage(1)} disabled={page===1} outline color={C.blue}>«</Btn>
                <Btn xs onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} outline color={C.blue}>‹ Prev</Btn>
                {Array.from({length:Math.min(5,totalPages)},(_,i)=>{
                  let p2;
                  if(totalPages<=5)p2=i+1;
                  else if(page<=3)p2=i+1;
                  else if(page>=totalPages-2)p2=totalPages-4+i;
                  else p2=page-2+i;
                  return(
                    <button key={p2} onClick={()=>setPage(p2)}
                      style={{width:32,height:32,borderRadius:6,border:`2px solid ${p2===page?C.blue:C.border}`,
                        background:p2===page?C.blue:"#fff",color:p2===page?"#fff":C.text,
                        fontWeight:700,fontSize:12,cursor:"pointer"}}>
                      {p2}
                    </button>
                  );
                })}
                <Btn xs onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages} outline color={C.blue}>Next ›</Btn>
                <Btn xs onClick={()=>setPage(totalPages)} disabled={page===totalPages} outline color={C.blue}>»</Btn>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ══ Member Profile Modal ══ */}
      {profileStudent&&(
        <StudentProfileModal
          student={profileStudent}
          classes={classes}
          sections={sections}
          onClose={()=>setProfileStudent(null)}
          notify={notify}
        />
      )}

      {/* ══ Change Status Modal ══ */}
      {statusModal&&(
        <Modal title="Change Member Status" onClose={()=>setStatusModal(null)} width={420}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,padding:14,
            background:C.offWhite,borderRadius:10}}>
            <div style={{width:44,height:44,borderRadius:"50%",background:avatarColor(statusModal.fullName),
              display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:15}}>
              {initials(statusModal).toUpperCase()}
            </div>
            <div>
              <div style={{fontWeight:800,color:C.blue,fontSize:15}}>{statusModal.fullName}</div>
              <div style={{fontSize:12,color:C.muted,marginTop:3}}>
                Current status:
                <span style={{marginLeft:6,padding:"2px 10px",borderRadius:99,fontSize:11,fontWeight:700,
                  background:`${statusDot(statusModal.status)}20`,color:statusDot(statusModal.status)}}>
                  {statusLabel(statusModal.status)}
                </span>
              </div>
            </div>
          </div>
          <div style={{fontWeight:700,color:C.text,marginBottom:10}}>Select new status:</div>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
            {STATUS_OPTIONS.map(s=>(
              <label key={s} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",
                borderRadius:8,border:`2px solid ${newStatus===s?statusDot(s):C.border}`,
                background:newStatus===s?`${statusDot(s)}10`:"#fff",cursor:"pointer",transition:"all .12s"}}>
                <input type="radio" name="status" value={s} checked={newStatus===s}
                  onChange={()=>setNewStatus(s)} style={{accentColor:statusDot(s)}}/>
                <div style={{width:8,height:8,borderRadius:"50%",background:statusDot(s),flexShrink:0}}/>
                <span style={{fontWeight:newStatus===s?700:500,color:newStatus===s?statusDot(s):C.text}}>
                  {statusLabel(s)}
                </span>
              </label>
            ))}
          </div>
          <div style={{display:"flex",gap:10}}>
            <Btn onClick={applyStatus} color={C.blue} style={{flex:1}} disabled={saving||newStatus===statusModal.status}>
              {saving?"Saving…":"✓ Confirm Change"}
            </Btn>
            <Btn onClick={()=>setStatusModal(null)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
          </div>
        </Modal>
      )}

      {/* ══ Role Change Modal ══ */}
      {roleChangeModal&&(()=>{
        const{m,newRole}=roleChangeModal;
        const roleMap={
          manager:{label:"Manager",color:"#7C3AED",desc:"This staff member will gain access to billing, billing, and payment management. Their permissions can be customised in Settings → Permissions."},
          bursar:{label:"Finance Manager",color:"#B45309",desc:"This staff member will be a dedicated finance officer with access to all billing-related pages. Their permissions can be customised in Settings → Permissions."},
          teacher:{label:"Staff",color:"#1A8C3C",desc:"This staff member will return to a teaching role with access to report cards, results, and attendance."},
        };
        const info=roleMap[newRole]||roleMap.teacher;
        const curInfo=roleMap[m.teacherRole]||roleMap.teacher;
        return(
          <Modal title="Change Staff Role" onClose={()=>setRoleChangeModal(null)} width={440}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,padding:14,background:C.offWhite,borderRadius:10}}>
              <div style={{width:44,height:44,borderRadius:"50%",background:avatarColor(m.fullName),
                display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:15}}>
                {initials(m).toUpperCase()}
              </div>
              <div>
                <div style={{fontWeight:800,color:C.blue,fontSize:15}}>{m.fullName}</div>
                <div style={{fontSize:12,color:C.muted,marginTop:3}}>
                  Current role:
                  <span style={{marginLeft:6,padding:"2px 10px",borderRadius:99,fontSize:11,fontWeight:700,
                    background:curInfo.color+"20",color:curInfo.color}}>
                    {curInfo.label}
                  </span>
                </div>
              </div>
            </div>
            <div style={{padding:"14px 16px",borderRadius:10,border:`2px solid ${info.color}30`,
              background:info.color+"08",marginBottom:20}}>
              <div style={{fontWeight:800,fontSize:13,color:info.color,marginBottom:6}}>
                New role: {info.label}
              </div>
              <div style={{fontSize:12,color:C.muted,lineHeight:1.6}}>{info.desc}</div>
            </div>
            <div style={{display:"flex",gap:10}}>
              <Btn onClick={()=>changeTeacherRole(m,newRole)}
                color={info.color} style={{flex:1}} disabled={saving}>
                {saving?"Saving…":`✓ Change to ${info.label}`}
              </Btn>
              <Btn onClick={()=>setRoleChangeModal(null)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
            </div>
          </Modal>
        );
      })()}

      {/* ══ Edit Credentials Modal ══ */}
      {credModal&&(()=>{
        const{m}=credModal;
        const saveCredentials=async()=>{
          if(!credModal.staffId.trim()){notify("Staff ID cannot be empty","error");return;}
          setSaving(true);
          const fields={staff_id:credModal.staffId.trim()};
          if(credModal.newPw.trim()){
            if(credModal.newPw.trim().length<4){notify("Password must be at least 4 characters","error");setSaving(false);return;}
            fields.password_hash=credModal.newPw.trim();
          }
          const{error}=await db.updateTeacherCredentials(m._raw?.id,fields);
          setSaving(false);
          if(error){notify("Failed: "+error.message,"error");return;}
          notify("Credentials updated ✓");
          setCredModal(null);
          load();
        };
        return(
          <Modal title="Edit Staff Credentials" onClose={()=>setCredModal(null)} width={420}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,padding:14,background:C.offWhite,borderRadius:10}}>
              <div style={{width:40,height:40,borderRadius:"50%",background:avatarColor(m.fullName),
                display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:14}}>
                {initials(m).toUpperCase()}
              </div>
              <div>
                <div style={{fontWeight:800,color:C.blue,fontSize:14}}>{m.fullName}</div>
                <div style={{fontSize:12,color:C.muted}}>{m.email||"No email"}</div>
              </div>
            </div>
            <div style={{marginBottom:14}}>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:5}}>Staff ID / Login Username</label>
              <input value={credModal.staffId} onChange={e=>setCredModal(p=>({...p,staffId:e.target.value}))}
                placeholder="Staff ID"
                style={{width:"100%",padding:"9px 12px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:13,outline:"none"}}
                onFocus={e=>e.target.style.borderColor=C.blue} onBlur={e=>e.target.style.borderColor=C.border}/>
            </div>
            <div style={{marginBottom:16}}>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:5}}>New Password <span style={{fontWeight:400}}>(leave blank to keep current)</span></label>
              <div style={{position:"relative"}}>
                <input type={credModal.showPw?"text":"password"} value={credModal.newPw}
                  onChange={e=>setCredModal(p=>({...p,newPw:e.target.value}))}
                  placeholder="Min. 4 characters"
                  style={{width:"100%",padding:"9px 40px 9px 12px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:13,outline:"none"}}
                  onFocus={e=>e.target.style.borderColor=C.blue} onBlur={e=>e.target.style.borderColor=C.border}/>
                <button onClick={()=>setCredModal(p=>({...p,showPw:!p.showPw}))}
                  style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:11,color:C.muted,fontWeight:700}}>
                  {credModal.showPw?"Hide":"Show"}
                </button>
              </div>
            </div>
            <div style={{background:C.amberPale,border:`1px solid ${C.amber}44`,borderRadius:8,padding:"8px 12px",marginBottom:16,fontSize:12,color:C.amber}}>
              Changing the Staff ID will change the login username. The staff member must use the new ID to sign in.
            </div>
            <div style={{display:"flex",gap:10}}>
              <Btn onClick={saveCredentials} color={C.blue} disabled={saving} style={{flex:1}}>
                {saving?"Saving…":"Save Credentials"}
              </Btn>
              <Btn onClick={()=>setCredModal(null)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
            </div>
          </Modal>
        );
      })()}

      {/* ══ Bulk Delete Confirm Modal ══ */}
      {membersEmailQueue&&<EmailProgressModal emails={membersEmailQueue} schoolId={selectedSchool?.id||""}
        onClose={()=>setMembersEmailQueue(null)}/>}

      {confirmDeleteModal&&(
        <Modal title="Confirm Bulk Delete" onClose={()=>!saving&&setConfirmDeleteModal(null)} width={480}>
          {confirmDeleteModal.checking?(
            <div style={{textAlign:"center",padding:"24px 0"}}>
              <Spinner/>
              <p style={{marginTop:12,color:C.muted,fontSize:13}}>Checking linked records…</p>
            </div>
          ):(
            <>
              <p style={{fontSize:14,fontWeight:700,color:C.red,marginBottom:12}}>
                Permanently delete {confirmDeleteModal.targets.length} member{confirmDeleteModal.targets.length!==1?"s":""}?
              </p>
              <p style={{fontSize:13,color:C.muted,marginBottom:confirmDeleteModal.warnings.length?12:20}}>
                This action <strong>cannot be undone</strong>. All linked results, bills, and records will also be removed.
              </p>
              {confirmDeleteModal.warnings.length>0&&(
                <div style={{background:C.amberPale,border:`1px solid ${C.amber}40`,borderRadius:8,padding:"10px 14px",marginBottom:16,maxHeight:180,overflowY:"auto"}}>
                  <div style={{fontWeight:700,fontSize:12,color:C.amber,marginBottom:6}}>Members with linked records:</div>
                  {confirmDeleteModal.warnings.map((w,i)=>(
                    <div key={i} style={{fontSize:12,color:C.amber,marginBottom:3}}>• {w}</div>
                  ))}
                </div>
              )}
              <div style={{display:"flex",gap:10}}>
                <Btn onClick={()=>executeBulkDelete(confirmDeleteModal.targets)}
                  style={{flex:1,background:C.red,border:"none",color:"#fff",fontWeight:800}}>
                  Yes, Delete {confirmDeleteModal.targets.length} Member{confirmDeleteModal.targets.length!==1?"s":""}
                </Btn>
                <Btn onClick={()=>setConfirmDeleteModal(null)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
              </div>
            </>
          )}
        </Modal>
      )}

      {/* ══ Bulk Status Modal ══ */}
      {bulkStatusModal&&(
        <Modal title={`Change Status for ${selectedIds.size} Member(s)`} onClose={()=>setBulkStatusModal(false)} width={400}>
          <p style={{fontSize:13,color:C.muted,marginBottom:16}}>Select the new status to apply to all {selectedIds.size} selected member(s):</p>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
            {STATUS_OPTIONS.map(s=>(
              <label key={s} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",
                borderRadius:8,border:`2px solid ${newStatus===s?statusDot(s):C.border}`,
                background:newStatus===s?`${statusDot(s)}10`:"#fff",cursor:"pointer"}}>
                <input type="radio" name="bstatus" value={s} checked={newStatus===s} onChange={()=>setNewStatus(s)} style={{accentColor:statusDot(s)}}/>
                <div style={{width:8,height:8,borderRadius:"50%",background:statusDot(s)}}/>
                <span style={{fontWeight:newStatus===s?700:500}}>{statusLabel(s)}</span>
              </label>
            ))}
          </div>
          <div style={{display:"flex",gap:10}}>
            <Btn onClick={applyBulkStatus} color={C.blue} style={{flex:1}} disabled={saving||!newStatus}>{saving?"Saving…":"✓ Apply to All"}</Btn>
            <Btn onClick={()=>setBulkStatusModal(false)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
          </div>
        </Modal>
      )}

      {/* ══ Add / Edit Member Modal ══ */}
      {addModal==="student"&&(
        <Modal title={editTarget?"Edit Member":"Add Member"} onClose={()=>{setAddModal(null);setEditTarget(null);}} width={520}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:4}}>
            <Inp label="First Name *" value={stuForm.first_name} onChange={v=>sf({first_name:v})}/>
            <Inp label="Middle Name" value={stuForm.middle_name} onChange={v=>sf({middle_name:v})}/>
            <Inp label="Last Name *" value={stuForm.last_name} onChange={v=>sf({last_name:v})}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:4}}>
            <Inp label="Email" value={stuForm.email} onChange={v=>sf({email:v})} type="email"/>
            <Sel label="Gender" value={stuForm.gender} onChange={v=>sf({gender:v})}
              options={[{value:"Male",label:"Male"},{value:"Female",label:"Female"}]}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:4}}>
            <div>
              <div style={{display:"flex",gap:10,marginBottom:6}}>
                <label style={{fontSize:12,display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}>
                  <input type="radio" checked={stuForm.useDob} onChange={()=>sf({useDob:true})}/> Date of Birth
                </label>
                <label style={{fontSize:12,display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}>
                  <input type="radio" checked={!stuForm.useDob} onChange={()=>sf({useDob:false})}/> Age
                </label>
              </div>
              {stuForm.useDob
                ?<Inp type="date" value={stuForm.dob} onChange={v=>sf({dob:v})}/>
                :<Inp type="number" placeholder="Age" value={stuForm.age} onChange={v=>sf({age:v})}/>}
            </div>
            <Inp label="Admission Year" value={stuForm.admission_year} onChange={v=>sf({admission_year:v})}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
            <Sel label="Group" value={stuForm.class_id} onChange={v=>sf({class_id:v})}
              options={[{value:"",label:"— Select Group —"},...classes.map(c=>({value:c.id,label:c.name}))]}/>
            <Sel label="Status" value={stuForm.status} onChange={v=>sf({status:v})}
              options={STATUS_OPTIONS.map(s=>({value:s,label:statusLabel(s)}))}/>
          </div>
          <div style={{display:"flex",gap:10}}>
            <Btn onClick={saveStu} color={C.blue} style={{flex:1}} disabled={saving}>{saving?"Saving…":"Save"}</Btn>
            <Btn onClick={()=>{setAddModal(null);setEditTarget(null);}} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
          </div>
        </Modal>
      )}

      {/* ══ Add / Edit Educator Modal ══ */}
      {addModal==="educator"&&(
        <Modal title={editTarget?"Edit Educator":"Add Educator"} onClose={()=>{setAddModal(null);setEditTarget(null);}} width={480}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:4}}>
            <Inp label="Full Name *" value={teaForm.full_name} onChange={v=>tf({full_name:v})}/>
            <Inp label="Email *" value={teaForm.email} onChange={v=>tf({email:v})} type="email"/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:4}}>
            <Inp label="Phone" value={teaForm.phone} onChange={v=>tf({phone:v})}/>
            <Sel label="Gender" value={teaForm.gender} onChange={v=>tf({gender:v})}
              options={[{value:"Male",label:"Male"},{value:"Female",label:"Female"}]}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
            <Sel label="Section" value={teaForm.section_id} onChange={v=>tf({section_id:v})}
              options={[{value:"",label:"— All Sections —"},...sections.map(s=>({value:s.id,label:s.name}))]}/>
            <Inp label="Date Joined" value={teaForm.date_joined} onChange={v=>tf({date_joined:v})} type="date"/>
          </div>
          <Sel label="Status" value={teaForm.status} onChange={v=>tf({status:v})}
            options={STATUS_OPTIONS.map(s=>({value:s,label:statusLabel(s)}))} style={{marginBottom:16}}/>
          <div style={{display:"flex",gap:10}}>
            <Btn onClick={saveTea} color={C.blue} style={{flex:1}} disabled={saving}>{saving?"Saving…":"Save"}</Btn>
            <Btn onClick={()=>{setAddModal(null);setEditTarget(null);}} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
          </div>
        </Modal>
      )}

      {/* ══ Bulk Member Upload Modal ══ */}
      {bulkStuModal&&(
        <Modal title="Bulk Member Upload" onClose={()=>setBulkStuModal(false)} width={660}>
          <div style={{marginBottom:14,padding:"10px 14px",background:C.bluePale,border:`1px solid ${C.blue}`,borderRadius:8,fontSize:13,color:C.blue}}>
            Download the template, fill in member data, then upload the file. Member IDs and passwords are auto-generated.
          </div>
          <div style={{marginBottom:14}}>
            <Btn onClick={downloadStuTemplate} color={C.blue} outline style={{marginRight:10}}>Download Template (.xlsx)</Btn>
            <label style={{display:"inline-block",cursor:"pointer"}}>
              <input type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}}
                onChange={e=>{if(e.target.files[0])parseStuBulkFile(e.target.files[0]);}}/>
              <span style={{padding:"8px 16px",borderRadius:8,border:`2px solid ${C.border}`,fontSize:13,fontWeight:600,background:C.white,cursor:"pointer",color:C.text}}>
                Choose File
              </span>
            </label>
            {bulkFile&&<span style={{marginLeft:10,fontSize:12,color:C.muted}}>{bulkFile.name}</span>}
          </div>
          {bulkErrors.length>0&&(
            <div style={{marginBottom:12,padding:"10px 14px",background:C.redPale,border:`1px solid ${C.red}40`,borderRadius:8}}>
              {bulkErrors.map((e,i)=><div key={i} style={{fontSize:12,color:C.red,marginBottom:3}}>⚠ {e}</div>)}
            </div>
          )}
          {bulkParsed.length>0&&(
            <>
              <div style={{fontWeight:700,color:C.blue,marginBottom:8,fontSize:13}}>{bulkParsed.length} member(s) ready to upload:</div>
              <div style={{maxHeight:240,overflowY:"auto",border:`1px solid ${C.border}`,borderRadius:8,marginBottom:14}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead><tr style={{background:C.offWhite}}>
                    {["#","First Name","Last Name","Gender","DOB","Group","Email","Phone"].map(h=>(
                      <th key={h} style={{padding:"7px 10px",textAlign:"left",fontWeight:700,color:C.muted,whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {bulkParsed.map((r,i)=>(
                      <tr key={i} style={{borderTop:`1px solid ${C.border}`,background:i%2===0?C.white:C.offWhite}}>
                        <td style={{padding:"6px 10px",color:C.muted}}>{r._line}</td>
                        <td style={{padding:"6px 10px"}}>{r.first_name}</td>
                        <td style={{padding:"6px 10px"}}>{r.last_name}</td>
                        <td style={{padding:"6px 10px"}}>{r.gender}</td>
                        <td style={{padding:"6px 10px",color:C.muted}}>{r.dob||"—"}</td>
                        <td style={{padding:"6px 10px"}}>{r.class_name||<span style={{color:C.light}}>—</span>}</td>
                        <td style={{padding:"6px 10px",color:C.muted,maxWidth:140,overflow:"hidden",textOverflow:"ellipsis"}}>{r.email||"—"}</td>
                        <td style={{padding:"6px 10px",color:C.muted}}>{r.phone||"—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {bulkSaving&&bulkProgress.total>0&&(
                <div style={{marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:C.text,marginBottom:5}}>
                    <span>⏳ Uploading members…</span>
                    <span style={{fontWeight:700,color:C.blue}}>{bulkProgress.done} / {bulkProgress.total}</span>
                  </div>
                  <div style={{background:C.border,borderRadius:99,height:10,overflow:"hidden"}}>
                    <div style={{height:"100%",borderRadius:99,background:`linear-gradient(90deg,${C.blue},${C.green})`,
                      width:`${Math.round((bulkProgress.done/bulkProgress.total)*100)}%`,
                      transition:"width 0.3s ease"}}/>
                  </div>
                  <div style={{fontSize:11,color:C.muted,marginTop:4,textAlign:"center"}}>
                    {Math.round((bulkProgress.done/bulkProgress.total)*100)}% complete — please keep this window open
                  </div>
                </div>
              )}
              <div style={{display:"flex",gap:10}}>
                <Btn onClick={saveStuBulk} color={C.green} style={{flex:2}} disabled={bulkSaving}>
                  {bulkSaving?`Uploading ${bulkProgress.done}/${bulkProgress.total}…`:`Upload ${bulkParsed.length} Members`}
                </Btn>
                <Btn onClick={()=>setBulkStuModal(false)} color={C.muted} outline style={{flex:1}} disabled={bulkSaving}>Cancel</Btn>
              </div>
            </>
          )}
          {!bulkParsed.length&&!bulkErrors.length&&(
            <div style={{textAlign:"center",padding:32,color:C.light,fontSize:13}}>
              Download the template, fill it in, then choose the file to upload
            </div>
          )}
        </Modal>
      )}

      {/* ══ Bulk Educator Upload Modal ══ */}
      {bulkTeaModal&&(
        <Modal title="Bulk Educator Upload" onClose={()=>setBulkTeaModal(false)} width={640}>
          <div style={{marginBottom:14,padding:"10px 14px",background:C.orangePale,border:`1px solid ${C.orange}`,borderRadius:8,fontSize:13,color:C.orange}}>
            Staff log in using their <strong>email address</strong> as both username and password. Ask them to change their password after first login.
          </div>
          <div style={{marginBottom:14}}>
            <Btn onClick={downloadTeaTemplate} color={C.blue} outline style={{marginRight:10}}>Download Template (.xlsx)</Btn>
            <label style={{display:"inline-block",cursor:"pointer"}}>
              <input type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}}
                onChange={e=>{if(e.target.files[0])parseTeaBulkFile(e.target.files[0]);}}/>
              <span style={{padding:"8px 16px",borderRadius:8,border:`2px solid ${C.border}`,fontSize:13,fontWeight:600,background:C.white,cursor:"pointer",color:C.text}}>
                Choose File
              </span>
            </label>
            {bulkFile&&<span style={{marginLeft:10,fontSize:12,color:C.muted}}>{bulkFile.name}</span>}
          </div>
          {bulkErrors.length>0&&(
            <div style={{marginBottom:12,padding:"10px 14px",background:C.redPale,border:`1px solid ${C.red}40`,borderRadius:8}}>
              {bulkErrors.map((e,i)=><div key={i} style={{fontSize:12,color:C.red,marginBottom:3}}>⚠ {e}</div>)}
            </div>
          )}
          {bulkParsed.length>0&&(
            <>
              <div style={{fontWeight:700,color:C.blue,marginBottom:8,fontSize:13}}>{bulkParsed.length} educator(s) ready to upload:</div>
              <div style={{maxHeight:240,overflowY:"auto",border:`1px solid ${C.border}`,borderRadius:8,marginBottom:14}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead><tr style={{background:C.offWhite}}>
                    {["#","Full Name","Email","Phone","Gender","Section"].map(h=>(
                      <th key={h} style={{padding:"7px 10px",textAlign:"left",fontWeight:700,color:C.muted,whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {bulkParsed.map((r,i)=>(
                      <tr key={i} style={{borderTop:`1px solid ${C.border}`,background:i%2===0?C.white:C.offWhite}}>
                        <td style={{padding:"6px 10px",color:C.muted}}>{r._line}</td>
                        <td style={{padding:"6px 10px",fontWeight:600}}>{r.full_name}</td>
                        <td style={{padding:"6px 10px",color:C.blue,fontSize:11}}>{r.email}</td>
                        <td style={{padding:"6px 10px",color:C.muted}}>{r.phone||"—"}</td>
                        <td style={{padding:"6px 10px"}}>{r.gender}</td>
                        <td style={{padding:"6px 10px",color:C.muted}}>{r.section_name||"—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{display:"flex",gap:10}}>
                <Btn onClick={saveTeaBulk} color={C.green} style={{flex:2}} disabled={bulkSaving}>
                  {bulkSaving?"Uploading…":`Upload ${bulkParsed.length} Educator${bulkParsed.length!==1?"s":""}`}
                </Btn>
                <Btn onClick={()=>setBulkTeaModal(false)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
              </div>
            </>
          )}
          {!bulkParsed.length&&!bulkErrors.length&&(
            <div style={{textAlign:"center",padding:32,color:C.light,fontSize:13}}>
              Download the template, fill it in, then choose the file to upload
            </div>
          )}
        </Modal>
      )}

      {/* ── Post-registration consent banners ── */}
      {lastRegistered&&(
        <div style={{marginTop:14,padding:"12px 16px",background:C.greenPale,border:`1px solid ${C.green}44`,borderRadius:10,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <span style={{flex:1,fontSize:13,color:C.green,fontWeight:700}}>
            {lastRegistered.count} member{lastRegistered.count!==1?"s":""} registered successfully.
          </span>
          {lastRegistered.entries?.filter(e=>e.to).length>0&&(
            <Btn onClick={()=>setShowOnboarding(true)} color={C.blue} xs>
              Send Onboarding Emails ({lastRegistered.entries.filter(e=>e.to).length})
            </Btn>
          )}
          <button onClick={()=>setLastRegistered(null)}
            style={{background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:18,lineHeight:1,padding:"0 4px"}}>✕</button>
        </div>
      )}
      {lastRegisteredTeachers&&(
        <div style={{marginTop:14,padding:"12px 16px",background:C.greenPale,border:`1px solid ${C.green}44`,borderRadius:10,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <span style={{flex:1,fontSize:13,color:C.green,fontWeight:700}}>
            {lastRegisteredTeachers.count} staff{lastRegisteredTeachers.count!==1?"s":""} registered successfully.
          </span>
          {lastRegisteredTeachers.entries?.filter(e=>e.to).length>0&&(
            <Btn onClick={()=>setShowTeacherOnboarding(true)} color={C.blue} xs>
              Send Onboarding Emails ({lastRegisteredTeachers.entries.filter(e=>e.to).length})
            </Btn>
          )}
          <button onClick={()=>setLastRegisteredTeachers(null)}
            style={{background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:18,lineHeight:1,padding:"0 4px"}}>✕</button>
        </div>
      )}
      {showOnboarding&&lastRegistered&&(
        <OnboardingEmailModal entries={lastRegistered.entries} onClose={()=>{setShowOnboarding(false);setLastRegistered(null);}} type="student"/>
      )}
      {showTeacherOnboarding&&lastRegisteredTeachers&&(
        <OnboardingEmailModal entries={lastRegisteredTeachers.entries} onClose={()=>{setShowTeacherOnboarding(false);setLastRegisteredTeachers(null);}} type="teacher"/>
      )}
      {bulkBillPrompt&&(
        <BulkUploadBillingModal
          students={bulkBillPrompt}
          onClose={()=>setBulkBillPrompt(null)}
          notify={notify}
        />
      )}
      {autoBillPrompt&&(()=>{
        const{studentId,studentName,templates}=autoBillPrompt;
        // Local state via a wrapper component so we can use useState inside the modal
        return(
          <AutoBillModal
            key={studentId}
            studentId={studentId}
            studentName={studentName}
            templates={templates}
            onClose={()=>setAutoBillPrompt(null)}
            onDone={(tmplName,total)=>{
              setAutoBillPrompt(null);
              notify(`Bill generated for ${studentName} — ${fmt(total)} ✓`);
            }}
            notify={notify}
          />
        );
      })()}
    </div>
  );
}

// ─── MEMBER PROFILE MODAL ────────────────────────────────────────────────────
function StudentProfileModal({student, classes, sections, onClose, notify}){
  const raw=student._raw;
  const [tab,setTab]=useState("overview");
  const [bills,setBills]=useState([]);
  const [results,setResults]=useState([]);
  const [auditLog,setAuditLog]=useState([]);
  const [adminLog,setAdminLog]=useState([]);
  const [sessions,setSessions]=useState([]);
  const [terms,setTerms]=useState([]);
  const [gradingSchema,setGradingSchema]=useState([]);
  const [loading,setLoading]=useState(true);
  const [expandedBill,setExpandedBill]=useState(null);

  const studentId=student._id;
  const cls=classes.find(c=>c.id===raw?.class_id);
  const sec=sections.find(s=>s.id===cls?.section_id);

  useEffect(()=>{
    setLoading(true);
    Promise.allSettled([
      db.getFeeBills({student_id:studentId}),
      db.getResults({student_id:studentId}),
      db.getFeeAuditLogByStudent(studentId),
      db.getAdminAuditLogByStudent(studentId),
      db.getSessions(),
      db.getTerms(),
      db.getGradingSchema(cls?.section_id||null,'grades'),
    ]).then(([b,r,al,adl,sess,trms,gs])=>{
      setBills(b.value?.data||[]);
      setResults(r.value?.data||[]);
      setAuditLog(al.value?.data||[]);
      setAdminLog(adl.value?.data||[]);
      setSessions(sess.value?.data||[]);
      setTerms(trms.value?.data||[]);
      setGradingSchema(gs.value?.data||[]);
      setLoading(false);
    });
  },[studentId]);

  // Billing calculations
  const activeBills=bills.filter(b=>!b.carried_forward);
  const totalBilled=activeBills.reduce((a,b)=>a+(+b.total_amount||0),0);
  const totalPaid=activeBills.reduce((a,b)=>a+(+b.amount_paid||0),0);
  const totalBalance=activeBills.reduce((a,b)=>a+(+b.balance||0),0);
  const paidBills=activeBills.filter(b=>b.status==="paid").length;
  const partialBills=activeBills.filter(b=>b.status==="partial").length;
  const unpaidBills=activeBills.filter(b=>b.status==="unpaid").length;

  // Results grouped by session → term → subjects
  const resultsByTerm=useMemo(()=>{
    const map={};
    results.forEach(r=>{
      const sessName=r.sessions?.name||r.academic_year||"";
      const termName=r.terms?.name||r.term||"";
      const key=`${sessName}__${termName}`;
      if(!map[key])map[key]={sessName,termName,rows:[]};
      map[key].rows.push(r);
    });
    return Object.values(map).sort((a,b)=>b.sessName.localeCompare(a.sessName)||b.termName.localeCompare(a.termName));
  },[results]);

  // Avatar
  const initials=(student.fullName||"?").split(" ").map(w=>w[0]||"").join("").slice(0,2).toUpperCase();
  const avatarBg=["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#ec4899"][student.fullName.charCodeAt(0)%6];

  const statusColor=s=>s==="active"?C.green:s==="suspended"?C.amber:s==="left"?C.red:C.muted;
  const billStatusColor=s=>s==="paid"?C.green:s==="partial"?C.amber:C.red;
  const billStatusIcon=s=>s==="paid"?<CheckCircle size={13}/>:s==="partial"?<Clock size={13}/>:<XCircle size={13}/>;

  const auditActionColor=a=>a==="payment_recorded"?C.green:a==="discount_applied"?C.purple:a==="refund_processed"?C.amber:a==="bill_generated"?C.blue:a==="discount_removed"?C.orange:C.muted;
  const auditActionLabel=a=>({
    bill_generated:"Bill Generated",payment_recorded:"Payment Recorded",
    discount_applied:"Discount Applied",discount_removed:"Discount Removed",
    refund_processed:"Refund Processed",item_added:"Item Added",item_removed:"Item Removed",
  }[a]||a);

  const TABS=[
    {id:"overview",label:"Overview",icon:<User size={14}/>},
    {id:"fees",label:`Billing (${activeBills.length})`,icon:<CreditCard size={14}/>},
    {id:"academic",label:`Performance (${results.length})`,icon:<BookOpen size={14}/>},
    {id:"activity",label:`Activity (${auditLog.length+adminLog.length})`,icon:<Activity size={14}/>},
  ];

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:1000,
      display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"20px 16px",overflowY:"auto"}}>
      <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:900,
        boxShadow:"0 25px 60px rgba(0,0,0,.25)",minHeight:0}}>

        {/* ── Header ── */}
        <div style={{background:`linear-gradient(135deg,${C.blue} 0%,#6366f1 100%)`,
          borderRadius:"16px 16px 0 0",padding:"24px 28px",color:"#fff",position:"relative"}}>
          <button onClick={onClose} style={{position:"absolute",top:16,right:16,
            background:"rgba(255,255,255,.15)",border:"none",borderRadius:8,
            width:32,height:32,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff"}}>
            <X size={18}/>
          </button>
          <div style={{display:"flex",alignItems:"center",gap:18}}>
            <div style={{width:72,height:72,borderRadius:"50%",background:avatarBg,
              border:"3px solid rgba(255,255,255,.4)",display:"flex",alignItems:"center",
              justifyContent:"center",fontSize:26,fontWeight:900,color:"#fff",flexShrink:0}}>
              {initials}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:22,fontWeight:900,marginBottom:4}}>{student.fullName}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center",fontSize:13,opacity:.9}}>
                <span style={{background:"rgba(255,255,255,.2)",borderRadius:6,padding:"2px 10px",
                  fontWeight:700}}>{String(studentId)}</span>
                {cls&&<span>{cls.name}</span>}
                {sec&&<span>· {sec.name}</span>}
                <span style={{background:statusColor(raw?.status||"active")+"33",border:`1px solid ${statusColor(raw?.status||"active")}66`,
                  borderRadius:6,padding:"2px 10px",fontWeight:700,fontSize:11,
                  color:"#fff",textTransform:"uppercase"}}>{raw?.status||"active"}</span>
              </div>
              {/* Quick fee stats in header */}
              <div style={{display:"flex",gap:20,marginTop:10,fontSize:12}}>
                <span>Total Billed: <strong>{fmt(totalBilled)}</strong></span>
                <span>Paid: <strong style={{color:"#86efac"}}>{fmt(totalPaid)}</strong></span>
                {totalBalance>0&&<span>Outstanding: <strong style={{color:"#fca5a5"}}>{fmt(totalBalance)}</strong></span>}
                {totalBalance<=0&&<span style={{color:"#86efac"}}>✓ No outstanding balance</span>}
              </div>
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={{display:"flex",borderBottom:`2px solid ${C.border}`,padding:"0 16px",background:C.offWhite}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{display:"flex",alignItems:"center",gap:6,padding:"13px 16px",border:"none",
                background:"none",cursor:"pointer",fontSize:13,fontWeight:tab===t.id?800:500,
                color:tab===t.id?C.blue:C.muted,
                borderBottom:tab===t.id?`3px solid ${C.blue}`:"3px solid transparent",
                marginBottom:-2,transition:"all .15s"}}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* ── Body ── */}
        <div style={{padding:24,maxHeight:"calc(100vh - 280px)",overflowY:"auto"}}>
          {loading?(
            <div style={{textAlign:"center",padding:48,color:C.muted}}>
              <div style={{fontSize:13}}>Loading member data…</div>
            </div>
          ):(
            <>
              {/* ══ OVERVIEW TAB ══ */}
              {tab==="overview"&&(
                <div data-jd-columns="2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                  {/* Personal Info */}
                  <div style={{background:C.offWhite,borderRadius:12,padding:18}}>
                    <div style={{fontWeight:800,color:C.blue,fontSize:12,textTransform:"uppercase",
                      letterSpacing:.5,marginBottom:14,display:"flex",alignItems:"center",gap:6}}>
                      <User size={13}/> Personal Information
                    </div>
                    {[
                      ["First Name",raw?.first_name||"—"],
                      ["Middle Name",raw?.middle_name||"—"],
                      ["Last Name",raw?.last_name||"—"],
                      ["Gender",raw?.gender||"—"],
                      ["Date of Birth",raw?.dob?new Date(raw.dob).toLocaleDateString("en-NG",{day:"numeric",month:"long",year:"numeric"}):"—"],
                      ["Age",raw?.age||"—"],
                      ["Phone",raw?.phone||student.phone||"—"],
                      ["Email",raw?.email||student.email||"—"],
                    ].map(([label,value])=>(
                      <div key={label} style={{display:"flex",justifyContent:"space-between",
                        padding:"7px 0",borderBottom:`1px solid ${C.border}`,fontSize:13}}>
                        <span style={{color:C.muted,fontWeight:500}}>{label}</span>
                        <span style={{fontWeight:600,color:C.text,textAlign:"right",maxWidth:"60%",
                          wordBreak:"break-word"}}>{value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Organization Info */}
                  <div>
                    <div style={{background:C.offWhite,borderRadius:12,padding:18,marginBottom:12}}>
                      <div style={{fontWeight:800,color:C.purple,fontSize:12,textTransform:"uppercase",
                        letterSpacing:.5,marginBottom:14,display:"flex",alignItems:"center",gap:6}}>
                        <GraduationCap size={13}/> Organization Information
                      </div>
                      {[
                        ["Member ID",String(studentId)],
                        ["Group",cls?.name||"—"],
                        ["Section / Arm",sec?.name||"—"],
                        ["Level",cls?.level||"—"],
                        ["Admission Year",raw?.admission_year||"—"],
                        ["Graduation Year",raw?.graduation_year||"—"],
                        ["Status",<span style={{color:statusColor(raw?.status||"active"),fontWeight:700,textTransform:"capitalize"}}>{raw?.status||"active"}</span>],
                        ["Last Login",raw?.last_login?new Date(raw.last_login).toLocaleString("en-NG",{dateStyle:"medium",timeStyle:"short"}):"Never"],
                        ["Date Added",raw?.created_at?new Date(raw.created_at).toLocaleDateString("en-NG",{dateStyle:"medium"}):"—"],
                      ].map(([label,value])=>(
                        <div key={label} style={{display:"flex",justifyContent:"space-between",
                          padding:"7px 0",borderBottom:`1px solid ${C.border}`,fontSize:13}}>
                          <span style={{color:C.muted,fontWeight:500}}>{label}</span>
                          <span style={{fontWeight:600,color:C.text}}>{value}</span>
                        </div>
                      ))}
                    </div>

                    {/* Billing snapshot */}
                    <div style={{background:C.offWhite,borderRadius:12,padding:18}}>
                      <div style={{fontWeight:800,color:C.green,fontSize:12,textTransform:"uppercase",
                        letterSpacing:.5,marginBottom:14,display:"flex",alignItems:"center",gap:6}}>
                        <CreditCard size={13}/> Billing Snapshot
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        {[
                          {label:"Total Billed",value:fmt(totalBilled),color:C.blue},
                          {label:"Total Paid",value:fmt(totalPaid),color:C.green},
                          {label:"Outstanding",value:fmt(Math.max(0,totalBalance)),color:totalBalance>0?C.red:C.green},
                          {label:"Bills",value:`${paidBills} paid · ${partialBills} partial · ${unpaidBills} unpaid`,color:C.muted},
                        ].map(({label,value,color})=>(
                          <div key={label} style={{background:"#fff",borderRadius:8,padding:"10px 12px",
                            border:`1px solid ${C.border}`}}>
                            <div style={{fontSize:11,color:C.muted,fontWeight:600,marginBottom:4}}>{label}</div>
                            <div style={{fontSize:14,fontWeight:800,color}}>{value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ══ FEES TAB ══ */}
              {tab==="fees"&&(
                <div>
                  {/* Summary bar */}
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
                    {[
                      {label:"Total Billed",value:fmt(totalBilled),color:C.blue,icon:<ReceiptText size={16}/>},
                      {label:"Total Paid",value:fmt(totalPaid),color:C.green,icon:<CheckCircle size={16}/>},
                      {label:"Outstanding",value:fmt(Math.max(0,totalBalance)),color:totalBalance>0?C.red:C.green,icon:<AlertCircle size={16}/>},
                    ].map(({label,value,color,icon})=>(
                      <div key={label} style={{background:color+"10",border:`1px solid ${color}30`,
                        borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"center",gap:10}}>
                        <div style={{color}}>{icon}</div>
                        <div>
                          <div style={{fontSize:11,color:C.muted,fontWeight:600}}>{label}</div>
                          <div style={{fontSize:16,fontWeight:900,color}}>{value}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {activeBills.length===0?(
                    <div style={{textAlign:"center",padding:40,color:C.muted,fontSize:13}}>No bills found for this member</div>
                  ):(
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {[...activeBills].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).map(bill=>{
                        const isExp=expandedBill===bill.id;
                        const items=bill.fee_bill_items||[];
                        const payments=bill.fee_payments||[];
                        const discounts=bill.fee_discounts||[];
                        const refunds=bill.fee_refunds||[];
                        return(
                          <div key={bill.id} style={{border:`1px solid ${isExp?C.blue:C.border}`,
                            borderRadius:10,overflow:"hidden",transition:"border-color .15s"}}>
                            {/* Bill row */}
                            <button onClick={()=>setExpandedBill(isExp?null:bill.id)}
                              style={{width:"100%",background:isExp?C.bluePale:"#fff",border:"none",
                                cursor:"pointer",padding:"12px 16px",display:"flex",
                                alignItems:"center",gap:12,textAlign:"left"}}>
                              <div style={{display:"flex",alignItems:"center",gap:6,
                                color:billStatusColor(bill.status)}}>
                                {billStatusIcon(bill.status)}
                                <span style={{fontSize:11,fontWeight:700,textTransform:"uppercase"}}>
                                  {bill.status}
                                </span>
                              </div>
                              <div style={{flex:1}}>
                                <div style={{fontWeight:700,fontSize:13,color:C.text}}>
                                  {bill.term} · {bill.academic_year}
                                </div>
                                <div style={{fontSize:11,color:C.muted,marginTop:2}}>
                                  {items.filter(i=>i.is_included).length} items
                                  {discounts.length>0&&` · ${discounts.length} discount${discounts.length!==1?"s":""}`}
                                  {payments.length>0&&` · ${payments.length} payment${payments.length!==1?"s":""}`}
                                </div>
                              </div>
                              <div style={{display:"grid",gridTemplateColumns:"repeat(3,100px)",gap:8,
                                textAlign:"right",fontSize:12}}>
                                <div>
                                  <div style={{color:C.muted,fontSize:10,fontWeight:600}}>BILLED</div>
                                  <div style={{fontWeight:700}}>{fmt(bill.total_amount)}</div>
                                </div>
                                <div>
                                  <div style={{color:C.muted,fontSize:10,fontWeight:600}}>PAID</div>
                                  <div style={{fontWeight:700,color:C.green}}>{fmt(bill.amount_paid)}</div>
                                </div>
                                <div>
                                  <div style={{color:C.muted,fontSize:10,fontWeight:600}}>BALANCE</div>
                                  <div style={{fontWeight:700,color:+bill.balance>0?C.red:C.green}}>
                                    {fmt(Math.max(0,+bill.balance))}
                                  </div>
                                </div>
                              </div>
                              <ChevronRight size={16} color={C.muted}
                                style={{transform:isExp?"rotate(90deg)":"none",transition:"transform .2s",flexShrink:0}}/>
                            </button>

                            {/* Expanded detail */}
                            {isExp&&(
                              <div style={{padding:"0 16px 16px",borderTop:`1px solid ${C.border}`,
                                background:C.offWhite}}>
                                {/* Items */}
                                {items.length>0&&(
                                  <div style={{marginTop:14}}>
                                    <div style={{fontSize:11,fontWeight:700,color:C.muted,
                                      textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>
                                      Billing Items
                                    </div>
                                    {items.map(item=>(
                                      <div key={item.id} style={{display:"flex",justifyContent:"space-between",
                                        padding:"6px 10px",background:item.is_included?"#fff":C.offWhite,
                                        borderRadius:6,marginBottom:4,fontSize:12,
                                        opacity:item.is_included?1:.6,
                                        border:`1px solid ${C.border}`}}>
                                        <span style={{color:C.text,fontWeight:500}}>
                                          {item.name}
                                          {item.is_optional&&<span style={{fontSize:10,color:C.muted,
                                            marginLeft:6}}>(optional)</span>}
                                          {item.is_carry_forward&&<span style={{fontSize:10,
                                            color:C.purple,marginLeft:6,fontWeight:700}}>CF</span>}
                                          {!item.is_included&&<span style={{fontSize:10,color:C.muted,
                                            marginLeft:6}}>[excluded]</span>}
                                        </span>
                                        <span style={{fontWeight:700}}>{fmt(item.amount)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Discounts */}
                                {discounts.length>0&&(
                                  <div style={{marginTop:12}}>
                                    <div style={{fontSize:11,fontWeight:700,color:C.green,
                                      textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>
                                      Discounts
                                    </div>
                                    {discounts.map(d=>(
                                      <div key={d.id} style={{display:"flex",justifyContent:"space-between",
                                        padding:"6px 10px",background:"#f0fdf4",borderRadius:6,
                                        marginBottom:4,fontSize:12,border:`1px solid #bbf7d0`}}>
                                        <span>{d.label}{d.discount_type==="percent"?` (${d.value}%)`:""}</span>
                                        <span style={{fontWeight:700,color:C.green}}>− {fmt(d.amount)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Payments */}
                                {payments.length>0&&(
                                  <div style={{marginTop:12}}>
                                    <div style={{fontSize:11,fontWeight:700,color:C.blue,
                                      textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>
                                      Payments
                                    </div>
                                    {[...payments].sort((a,b)=>new Date(a.payment_date||a.created_at)-new Date(b.payment_date||b.created_at)).map(p=>(
                                      <div key={p.id} style={{display:"flex",justifyContent:"space-between",
                                        alignItems:"center",padding:"6px 10px",background:"#eff6ff",
                                        borderRadius:6,marginBottom:4,fontSize:12,border:`1px solid #bfdbfe`}}>
                                        <div>
                                          <span style={{fontWeight:600}}>{p.payment_date?new Date(p.payment_date).toLocaleDateString("en-NG",{dateStyle:"medium"}):"—"}</span>
                                          <span style={{color:C.muted,marginLeft:8,textTransform:"capitalize"}}>
                                            {(p.payment_method||"").replace("_"," ")}
                                          </span>
                                          {p.bank_reference&&<span style={{color:C.muted,marginLeft:8,fontSize:11}}>Ref: {p.bank_reference}</span>}
                                          {p.notes&&<span style={{color:C.muted,marginLeft:8,fontSize:11}}>{p.notes}</span>}
                                        </div>
                                        <span style={{fontWeight:700,color:C.blue}}>{fmt(p.amount)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Refunds */}
                                {refunds.length>0&&(
                                  <div style={{marginTop:12}}>
                                    <div style={{fontSize:11,fontWeight:700,color:C.amber,
                                      textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>
                                      Refunds
                                    </div>
                                    {refunds.map(r=>(
                                      <div key={r.id} style={{display:"flex",justifyContent:"space-between",
                                        alignItems:"center",padding:"6px 10px",background:"#fffbeb",
                                        borderRadius:6,marginBottom:4,fontSize:12,border:`1px solid #fed7aa`}}>
                                        <span>{r.reason||"Refund"} · {r.created_at?new Date(r.created_at).toLocaleDateString("en-NG",{dateStyle:"medium"}):"—"}</span>
                                        <span style={{fontWeight:700,color:C.amber}}>− {fmt(r.amount)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ══ ACADEMIC TAB ══ */}
              {tab==="academic"&&(
                <div>
                  {resultsByTerm.length===0?(
                    <div style={{textAlign:"center",padding:40,color:C.muted,fontSize:13}}>
                      <BookOpen size={36} color={C.muted} style={{marginBottom:8,display:"block",margin:"0 auto 8px"}}/>
                      No performance results found for this member
                    </div>
                  ):resultsByTerm.map(group=>{
                    const avg=group.rows.length?Math.round(group.rows.reduce((a,r)=>a+(+r.total_score||0),0)/group.rows.length):0;
                    return(
                      <div key={group.sessName+group.termName} style={{marginBottom:20,
                        border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden"}}>
                        <div style={{background:`linear-gradient(90deg,${C.blue}15,${C.blue}05)`,
                          padding:"12px 16px",display:"flex",justifyContent:"space-between",
                          alignItems:"center",borderBottom:`1px solid ${C.border}`}}>
                          <div style={{fontWeight:800,color:C.blue,fontSize:14}}>
                            {group.termName} · {group.sessName}
                          </div>
                          <div style={{display:"flex",gap:16,fontSize:12,color:C.muted}}>
                            <span>{group.rows.length} category{group.rows.length!==1?"s":""}</span>
                            <span style={{fontWeight:700,color:avg>=50?C.green:C.red}}>Avg: {avg}%</span>
                          </div>
                        </div>
                        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                          <thead>
                            <tr style={{background:C.offWhite}}>
                              {["Category","CA Score","Exam Score","Total","Grade","Remark"].map(h=>(
                                <th key={h} style={{padding:"8px 12px",textAlign:"left",fontWeight:700,
                                  color:C.muted,fontSize:11,borderBottom:`1px solid ${C.border}`}}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {group.rows.map((r,i)=>{
                              const hasTotal=r.total_score!=null&&r.total_score!=="";
                              const total=+r.total_score||0;
                              const gradeColor=total>=70?C.green:total>=50?C.amber:C.red;
                              const grade=r.grade||(hasTotal?getGrade(total,gradingSchema):"—");
                              const remark=r.remark||(hasTotal?getRemark(total,gradingSchema):"—");
                              return(
                                <tr key={r.id} style={{borderBottom:`1px solid ${C.border}`,
                                  background:i%2===0?"#fff":C.offWhite}}>
                                  <td style={{padding:"9px 12px",fontWeight:600,color:C.text}}>
                                    {r.section_subjects?.name||r.subject_name||"—"}
                                  </td>
                                  <td style={{padding:"9px 12px",color:C.muted}}>{r.ca_score??r.ca1_score??"—"}</td>
                                  <td style={{padding:"9px 12px",color:C.muted}}>{r.exam_score??r.e_score??r.exam??"—"}</td>
                                  <td style={{padding:"9px 12px",fontWeight:800,color:gradeColor}}>{hasTotal?total:"—"}</td>
                                  <td style={{padding:"9px 12px"}}>
                                    <span style={{background:gradeColor+"15",color:gradeColor,
                                      fontWeight:700,padding:"2px 8px",borderRadius:6,fontSize:11}}>
                                      {grade}
                                    </span>
                                  </td>
                                  <td style={{padding:"9px 12px",color:C.muted,fontStyle:"italic",fontSize:11}}>
                                    {remark}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ══ ACTIVITY TAB ══ */}
              {tab==="activity"&&(()=>{
                // Merge fee log + admin log into one timeline sorted newest first
                const feeEntries=auditLog.map(e=>({...e,_source:"fee",_ts:e.created_at}));
                const adminEntries=adminLog.map(e=>({...e,_source:"admin",_ts:e.performed_at}));
                const merged=[...feeEntries,...adminEntries].sort((a,b)=>new Date(b._ts)-new Date(a._ts));

                const adminActionColor=a=>a==="status_change"?C.purple:a==="profile_edit"?C.blue:a==="class_change"?C.amber:C.muted;
                const adminActionLabel=a=>({
                  status_change:"Status Changed",profile_edit:"Profile Edited",
                  class_change:"Group Changed",approval:"Member Approved",
                  bulk_status_change:"Bulk Status Change",
                }[a]||a?.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())||"Action");

                return(
                  <div>
                    {merged.length===0?(
                      <div style={{textAlign:"center",padding:40,color:C.muted,fontSize:13}}>
                        <Activity size={36} color={C.muted} style={{display:"block",margin:"0 auto 8px"}}/>
                        No activity recorded for this member
                      </div>
                    ):(
                      <div style={{display:"flex",flexDirection:"column",gap:6}}>
                        {merged.map((entry,i)=>{
                          const isFee=entry._source==="fee";
                          const color=isFee?auditActionColor(entry.action):adminActionColor(entry.action);
                          const label=isFee?auditActionLabel(entry.action):adminActionLabel(entry.action);
                          const ts=entry._ts?new Date(entry._ts).toLocaleString("en-NG",{dateStyle:"medium",timeStyle:"short"}):"—";
                          const actor=entry.performed_by||(isFee?null:null);
                          return(
                            <div key={entry.id||i} style={{display:"flex",gap:12,alignItems:"flex-start",
                              padding:"10px 14px",background:i%2===0?"#fff":C.offWhite,
                              borderRadius:8,border:`1px solid ${C.border}`}}>
                              <div style={{width:8,height:8,borderRadius:"50%",background:color,
                                flexShrink:0,marginTop:5}}/>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{display:"flex",justifyContent:"space-between",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                                    <span style={{fontWeight:700,fontSize:13,color}}>{label}</span>
                                    <span style={{fontSize:10,padding:"1px 7px",borderRadius:99,
                                      background:isFee?`${C.green}18`:`${C.purple}18`,
                                      color:isFee?C.green:C.purple,fontWeight:700,textTransform:"uppercase",letterSpacing:.3}}>
                                      {isFee?"Billing":"Admin"}
                                    </span>
                                  </div>
                                  {isFee&&entry.amount>0&&<span style={{fontWeight:700,fontSize:13}}>{fmt(entry.amount)}</span>}
                                </div>
                                {/* Billing-specific details */}
                                {isFee&&entry.details&&(
                                  <div style={{fontSize:11,color:C.muted,marginTop:2}}>
                                    {entry.action==="bill_generated"&&`${entry.details.term} ${entry.details.year} — Template: ${entry.details.template}`}
                                    {entry.action==="payment_recorded"&&`${entry.details.method?.replace("_"," ")||""} · Paid: ${fmt(entry.details.new_paid)}`}
                                    {entry.action==="discount_applied"&&`"${entry.details.label}" — New total: ${fmt(entry.details.new_total)}`}
                                    {entry.action==="discount_removed"&&`"${entry.details.label}" removed`}
                                    {entry.action==="refund_processed"&&`Reason: ${entry.details.reason||"—"}`}
                                    {entry.action==="item_added"&&`"${entry.details.name}" added`}
                                    {entry.action==="item_removed"&&`"${entry.details.name}" removed`}
                                  </div>
                                )}
                                {/* Admin-specific details: status change */}
                                {!isFee&&entry.action==="status_change"&&(
                                  <div style={{fontSize:11,color:C.muted,marginTop:2,display:"flex",alignItems:"center",gap:5}}>
                                    <span style={{padding:"1px 8px",borderRadius:99,fontWeight:700,
                                      background:`${C.muted}15`,color:C.muted,textTransform:"capitalize"}}>
                                      {entry.old_value?.status||"—"}
                                    </span>
                                    <span style={{color:C.muted}}>→</span>
                                    <span style={{padding:"1px 8px",borderRadius:99,fontWeight:700,
                                      background:entry.new_value?.status==="active"?`${C.green}18`:entry.new_value?.status==="suspended"?`${C.amber}18`:`${C.red}18`,
                                      color:entry.new_value?.status==="active"?C.green:entry.new_value?.status==="suspended"?C.amber:C.red,
                                      textTransform:"capitalize"}}>
                                      {entry.new_value?.status||"—"}
                                    </span>
                                  </div>
                                )}
                                {/* Admin: other details / notes */}
                                {!isFee&&entry.action!=="status_change"&&entry.notes&&(
                                  <div style={{fontSize:11,color:C.muted,marginTop:2}}>{entry.notes}</div>
                                )}
                                <div style={{fontSize:11,color:C.light,marginTop:4,display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                                  <span><Calendar size={10} style={{verticalAlign:"middle",marginRight:3}}/>{ts}</span>
                                  {actor&&<span style={{color:C.muted}}>by <strong>{actor}</strong></span>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{padding:"14px 24px",borderTop:`1px solid ${C.border}`,
          display:"flex",justifyContent:"flex-end",background:C.offWhite,
          borderRadius:"0 0 16px 16px"}}>
          <Btn onClick={onClose} color={C.muted} outline>Close</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── BULK UPLOAD BILLING MODAL ────────────────────────────────────────────────
// Shown after a bulk student upload — admin picks a template per class then generates

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
