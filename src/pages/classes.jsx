/**
 * Groups domain: ClassesPage, AssignmentsPage
 */
import React, { useState, useEffect } from "react";
import {
  BarChart3, BookOpen, CheckCircle, Edit, FileText, Filter,
  Loader2, Pencil, Save, Search, Trash2, Users,
} from "lucide-react";
import { db } from "../supabaseClient.js";
import { C } from "../config/theme.js";
import { useConfirm } from "../contexts/confirm.jsx";
import {
  Card, Btn, Badge, Inp, Sel, Modal, StatCard, Th, TRow, Spinner, AppIcon,
} from "../components/ui.jsx";
import { fullName } from "../utils/grades.js";

export function ClassesPage({ctx}){
  const {notify,selectedSection,setPage}=ctx;
  const [classes,setClasses]=useState([]);
  const [sections,setSections]=useState([]);
  const [students,setStudents]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modal,setModal]=useState(false);
  const [editId,setEditId]=useState(null);
  const [detailClass,setDetailClass]=useState(null); // class being viewed
  const [detailStudents,setDetailStudents]=useState([]);
  const [detailResults,setDetailResults]=useState([]);
  const [detailSubjects,setDetailSubjects]=useState([]);
  const [detailLoading,setDetailLoading]=useState(false);
  const blank={name:"",level:"",section_id:""};
  const [form,setForm]=useState(blank);
  const f=v=>setForm(p=>({...p,...v}));

  const load=()=>{
    setLoading(true);
    Promise.all([
      db.getClasses(selectedSection?.id),
      db.getSections(true),
      db.getStudents()
    ]).then(([c,s,st])=>{
      setClasses(c.data||[]);
      setSections(s.data||[]);
      setStudents(st.data||[]);
      setLoading(false);
    });
  };
  useEffect(load,[selectedSection]);

  const save=async()=>{
    if(!form.name){notify("Group name required","error");return;}
    const payload={...form,section_id:form.section_id?+form.section_id:null};
    const {error}=await db.upsertClass(payload,editId);
    if(error)notify(error.message,"error");
    else{notify(editId?"Group updated ✓":"Group added ✓");setModal(false);load();}
  };
  const del=async(id,name,e)=>{
    e.stopPropagation();
    // ── Interlock checks ─────────────────────────────────────────────────────
    const[{data:stuData},{count:resCount},{data:pubData}]=await Promise.all([
      db.getStudents(null,{class_id:id}),
      db.countResultsByClass(id),
      db.getReportPublish({class_id:id}),
    ]);
    const stuCount=(stuData||[]).filter(s=>(s.status||"active")==="active").length;
    if(stuCount>0){
      notify(`🔒 Interlock — Cannot delete "${name}"\nReason: ${stuCount} student(s) are currently enrolled.\nFix: Re-assign or graduate all students from this class first.`,"error");
      return;
    }
    if(resCount>0){
      notify(`🔒 Interlock — Cannot delete "${name}"\nReason: ${resCount} result record(s) exist for this class.\nFix: Go to the Results page and clear all results for this class first.`,"error");
      return;
    }
    const publishedCount=(pubData||[]).filter(p=>p.is_published).length;
    if(publishedCount>0){
      notify(`🔒 Interlock — Cannot delete "${name}"\nReason: Report cards are published for ${publishedCount} term(s).\nFix: Unpublish all report cards on the Reports page first.`,"error");
      return;
    }
    // ── Safe to proceed ──────────────────────────────────────────────────────
    const __ok=await confirm({title:"Delete Group?",
      message:`Delete "${name}"? Category assignments and teacher assignments for this class will also be removed. This cannot be undone.`,
      confirmLabel:"Delete",danger:true,typeToConfirm:"DELETE"});
    if(!__ok)return;
    const {error}=await db.softDelete('class',id,ctx.user?.name||'admin');
    if(error)notify(error.message,"error");
    else{notify(`"${name}" moved to Recycle Bin`,"warn");load();}
  };

  const getLevels=()=>{
    const sec=sections.find(s=>s.id===+form.section_id);
    return(sec?.levels||[]);
  };

  const openDetail=async(cls)=>{
    setDetailClass(cls);
    setDetailLoading(true);
    const [stu,res,subj]=await Promise.all([
      db.getStudents(),
      db.getResults({class_id:cls.id}),
      db.getClassSubjects(cls.id),
    ]);
    const classStudents=(stu.data||[]).filter(s=>s.class_id===cls.id&&(s.status||"active")==="active");
    setDetailStudents(classStudents);
    setDetailResults(res.data||[]);
    setDetailSubjects(subj.data||[]);
    setDetailLoading(false);
  };

  // ── Detail View ─────────────────────────────────────────────────────────────
  if(detailClass){
    const sec=sections.find(s=>s.id===detailClass.section_id);
    const color=sec?.color||C.blue;

    // Stats
    const totalResults=detailResults.length;
    const uniqueStudentsWithResults=[...new Set(detailResults.map(r=>r.student_id))].length;
    const reportReady=detailStudents.length>0&&uniqueStudentsWithResults===detailStudents.length;
    const avgScore=detailResults.length
      ?detailResults.reduce((a,b)=>a+(b.total_score||0),0)/detailResults.length
      :null;

    // (local fullName shadow removed — use module-level fullName which honours name_order/name_case)

    return(
      <div>
        {/* Back button */}
        <button onClick={()=>setDetailClass(null)}
          style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",
            cursor:"pointer",color:C.blue,fontWeight:700,fontSize:13,marginBottom:16,padding:0}}>
          ← Back to Groups
        </button>

        {/* Header */}
        <div style={{background:`linear-gradient(135deg,${color},${color}cc)`,borderRadius:16,
          padding:"22px 28px",marginBottom:20,color:"#fff",position:"relative",overflow:"hidden"}}>
          
          <div style={{fontSize:24,fontWeight:900,marginBottom:4}}>{detailClass.name}</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            <span style={{background:"rgba(255,255,255,.25)",padding:"3px 12px",borderRadius:12,fontSize:12,fontWeight:700}}>{detailClass.level}</span>
            {sec&&<span style={{background:"rgba(255,255,255,.25)",padding:"3px 12px",borderRadius:12,fontSize:12,fontWeight:700}}>{sec.name}</span>}
          </div>
        </div>

        {/* Stats row */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:13,marginBottom:20}}>
          <StatCard label="Members Enrolled" value={detailStudents.length} icon={<Users size={18} color={C.blue}/>} color={C.blue}/>
          <StatCard label="Categories Assigned" value={detailSubjects.length} icon={<BookOpen size={18} color={C.purple}/>} color={C.purple}/>
          <StatCard label="Result Entries" value={totalResults} icon={<FileText size={18} color={C.orange}/>} color={C.orange}/>
          <StatCard label="Avg Score" value={avgScore!=null?avgScore.toFixed(1)+"%" :"—"} icon={<BarChart3 size={18} color={C.green}/>} color={C.green}/>
          <div style={{background:reportReady?C.greenPale:C.orangePale,borderRadius:14,padding:"18px 20px",
            borderTop:`4px solid ${reportReady?C.green:C.orange}`,border:`1px solid ${reportReady?C.green:C.orange}20`}}>
            <div style={{marginBottom:7}}>{reportReady?<CheckCircle size={26} color={C.green}/>:<Loader2 size={26} color={C.muted}/>}</div>
            <div style={{fontSize:13,fontWeight:900,color:reportReady?C.green:C.orange,lineHeight:1,marginBottom:4}}>
              {reportReady?"Reports Ready":"Reports Pending"}
            </div>
            <div style={{fontSize:11,color:C.muted}}>{uniqueStudentsWithResults}/{detailStudents.length} members have results</div>
          </div>
        </div>

        {detailLoading?<Spinner/>:(
          <div data-jd-columns="2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            {/* Members list */}
            <Card>
              <div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:12}}>Members ({detailStudents.length})</div>
              {detailStudents.length===0
                ?<div style={{color:C.light,fontSize:13,textAlign:"center",padding:20}}>No members enrolled</div>
                :<div style={{maxHeight:380,overflowY:"auto"}}>
                  {detailStudents.map((s,i)=>{
                    const hasResults=detailResults.some(r=>r.student_id===s.id);
                    const stuAvg=detailResults.filter(r=>r.student_id===s.id);
                    const avg=stuAvg.length?stuAvg.reduce((a,b)=>a+(b.total_score||0),0)/stuAvg.length:null;
                    return(
                      <div key={s.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                        padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                        <div>
                          <div style={{fontWeight:700,fontSize:13}}>{fullName(s)}</div>
                          <div style={{fontSize:11,color:C.muted}}>{s.id}</div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          {avg!=null&&<Badge color={C.green}>{avg.toFixed(0)}%</Badge>}
                          {!hasResults&&<Badge color={C.amber}>No results</Badge>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              }
            </Card>

            {/* Categories list */}
            <Card>
              <div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:12}}>Categories ({detailSubjects.length})</div>
              {detailSubjects.length===0
                ?<div style={{color:C.light,fontSize:13,textAlign:"center",padding:20}}>No categories assigned — go to Assignments to add</div>
                :<div>
                  {detailSubjects.map((s,i)=>(
                    <div key={s.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                      padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                      <div style={{fontWeight:600,fontSize:13}}>{s.section_subjects?.name||"—"}</div>
                      <Badge color={C.muted}>{s.section_subjects?.code||""}</Badge>
                    </div>
                  ))}
                </div>
              }
              <div style={{marginTop:14}}>
                <Btn sm onClick={()=>ctx.setPage("assignments")} color={C.blue} outline>Manage Assignments</Btn>
              </div>
            </Card>
          </div>
        )}
      </div>
    );
  }

  // ── List View ──────────────────────────────────────────────────────────────
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="classes" size={20}/>Groups</h2>
          <p style={{color:C.muted,fontSize:12}}>Click a group card to view full details</p>
        </div>
        <Btn onClick={()=>{setForm(blank);setEditId(null);setModal(true);}} color={C.orange}>Add Group</Btn>
      </div>
      {loading?<Spinner/>:(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))",gap:13}}>
          {classes.map(c=>{
            const sec=c.sections||sections.find(s=>s.id===c.section_id);
            const stuCount=students.filter(s=>s.class_id===c.id&&(s.status||"active")==="active").length;
            return(
              <Card key={c.id} onClick={()=>openDetail(c)}
                style={{borderTop:`4px solid ${sec?.color||C.blue}`,cursor:"pointer",
                  transition:"box-shadow .15s,transform .15s"}}
                onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 8px 24px rgba(0,0,0,.12)";e.currentTarget.style.transform="translateY(-2px)"}}
                onMouseLeave={e=>{e.currentTarget.style.boxShadow="";e.currentTarget.style.transform=""}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                  <div>
                    <div style={{fontWeight:900,fontSize:15,color:C.blue}}>{c.name}</div>
                    <div style={{display:"flex",gap:6,marginTop:4}}>
                      <Badge color={C.orange}>{c.level}</Badge>
                      {sec&&<Badge color={sec.color||C.blue}>{sec.code}</Badge>}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:4}} onClick={e=>e.stopPropagation()}>
                    <Btn xs onClick={e=>{e.stopPropagation();setForm({name:c.name,level:c.level,section_id:c.section_id||""});setEditId(c.id);setModal(true);}} color={C.blue} outline><Pencil size={13}/></Btn>
                    <Btn xs onClick={e=>del(c.id,c.name,e)} color={C.red} outline><Trash2 size={13}/></Btn>
                  </div>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontSize:12,color:C.muted}}>{stuCount} members</div>
                  <span style={{fontSize:11,color:C.blue,fontWeight:600}}>View details →</span>
                </div>
              </Card>
            );
          })}
          {!classes.length&&<div style={{color:C.light,padding:32,textAlign:"center"}}>No groups found</div>}
        </div>
      )}

      {modal&&(
        <Modal title={editId?"Edit Group":"New Group"} onClose={()=>setModal(false)}>
          <Sel label="Section *" value={form.section_id||""} onChange={v=>f({section_id:v,level:""})}
            options={[{value:"",label:"— Select Section —"},...sections.map(s=>({value:s.id,label:s.name}))]}/>
          <Inp label="Group Name *" value={form.name} onChange={v=>f({name:v})} placeholder="e.g. JSS 1A"/>
          <Sel label="Level *" value={form.level||""} onChange={v=>f({level:v})}
            options={[
              {value:"",label:getLevels().length?"— Select Level —":"— Select section first —"},
              ...getLevels().map(l=>({value:l,label:l}))
            ]}/>
          {form.section_id&&getLevels().length===0&&(
            <p style={{color:C.amber,fontSize:12,marginTop:-8,marginBottom:10}}>
              No levels defined for this section yet. Add them in the Sections page.
            </p>
          )}
          <div style={{display:"flex",gap:10,marginTop:6}}>
            <Btn onClick={save} color={C.orange} style={{flex:1}}>Save</Btn>
            <Btn onClick={()=>setModal(false)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}


// ─── ASSIGNMENTS PAGE ────────────────────────────────────────────────────────
// Three-tab page: Group→Category mapping | Form Staff | Category Staff
export function AssignmentsPage({ctx}){
  const {notify,selectedSection}=ctx;
  const [tab,setTab]=useState("class-subjects"); // class-subjects | form-teachers | subject-teachers
  const [classes,setClasses]=useState([]);
  const [teachers,setTeachers]=useState([]);
  const [sectionSubjects,setSectionSubjects]=useState([]);
  const [classSubjects,setClassSubjects]=useState([]);   // all class_subjects rows
  const [formTeachers,setFormTeachers]=useState([]);     // all form teacher rows
  const [teacherSubjects,setTeacherSubjects]=useState([]); // all teacher_subjects rows
  const [loading,setLoading]=useState(true);

  // Group-subject assignment state
  const [selClass,setSelClass]=useState("");
  const [csLoading,setCsLoading]=useState(false);
  const [classSubjectRows,setClassSubjectRows]=useState([]);

  // Form teacher assignment state
  const [ftClass,setFtClass]=useState("");
  const [ftTeacher,setFtTeacher]=useState("");
  const [ftSaving,setFtSaving]=useState(false);

  // Category teacher assignment state
  const [stTeacher,setStTeacher]=useState("");
  const [stClass,setStClass]=useState("");
  const [stSubject,setStSubject]=useState("");
  const [stSaving,setStSaving]=useState(false);
  const [stSearch,setStSearch]=useState(""); // search in subject-teachers summary panel
  const [stSubjectOptions,setStSubjectOptions]=useState([]);

  const load=()=>{
    setLoading(true);
    Promise.all([
      db.getClasses(selectedSection?.id),
      db.getTeachers(),
      db.getSectionSubjects(selectedSection?.id),
      db.getAllFormTeachers(),
      db.getTeacherSubjects(),
    ]).then(([cl,te,ss,ft,ts])=>{
      setClasses(cl.data||[]);
      setTeachers(te.data||[]);
      setSectionSubjects(ss.data||[]);
      setFormTeachers(ft.data||[]);
      setTeacherSubjects(ts.data||[]);
      setLoading(false);
    });
  };
  useEffect(load,[selectedSection]);

  // Load subjects for the Group-Categories tab only (never touches stSubjectOptions)
  const loadClassSubjects=async(classId)=>{
    if(!classId){setClassSubjectRows([]);return;}
    setCsLoading(true);
    const {data:cs}=await db.getClassSubjects(+classId);
    setClassSubjectRows(cs||[]);
    setCsLoading(false);
  };
  useEffect(()=>{loadClassSubjects(selClass);},[selClass,classes]);

  // When stClass changes (Category Staff tab), reload subject options for that class only
  useEffect(()=>{
    if(!stClass){setStSubjectOptions([]);return;}
    db.getClassSubjects(+stClass).then(({data})=>{
      setStSubjectOptions((data||[]).map(r=>r.section_subjects).filter(Boolean));
    });
  },[stClass]);

  const toggleSubjectForClass=async(sectionSubjectId,isAssigned,csRowId)=>{
    if(isAssigned){
      // ── Interlock: block removal if results exist for this subject in this class ──
      const{count}=await db.countResultsBySubjectClass(+selClass,sectionSubjectId);
      if(count>0){
        const subjName=classSubjectRows.find(r=>r.section_subject_id===sectionSubjectId)?.section_subjects?.name||"this category";
        notify(`🔒 Interlock — Cannot unassign "${subjName.trim()}"\nReason: ${count} result record(s) exist for this subject in this class.\nFix: Clear the results for this class on the Results page, then unassign the subject.`,"error");
        return;
      }
      const {error}=await db.removeSubjectFromClass(+selClass,sectionSubjectId);
      if(error)notify(error.message,"error");
      else{notify("Category removed from group","warn");loadClassSubjects(selClass);}
    } else {
      const {error}=await db.assignSubjectToClass(+selClass,sectionSubjectId);
      if(error){
        if(error.code==="23505")notify("Already assigned","warn");
        else notify(error.message,"error");
      } else {notify("Category assigned ✓");loadClassSubjects(selClass);}
    }
  };

  const addFormTeacherToClass=async()=>{
    if(!ftClass||!ftTeacher){notify("Select a group and a staff","error");return;}
    setFtSaving(true);
    const {error}=await db.addFormTeacher(+ftClass,+ftTeacher);
    setFtSaving(false);
    if(error){
      if(error.code==="23505")notify("Already a form staff for this group","warn");
      else notify(error.message,"error");
    } else {notify("Form staff added ✓");setFtTeacher("");load();}
  };
  const removeFormTeacherFromClass=async(classId,teacherId)=>{
    const {error}=await db.removeFormTeacher(+classId,+teacherId);
    if(error)notify(error.message,"error");
    else{notify("Form staff removed","warn");load();}
  };

  const addTeacherSubject=async()=>{
    if(!stTeacher||!stClass||!stSubject){notify("Select staff, group, and category","error");return;}
    setStSaving(true);
    const {error}=await db.assignTeacherSubject(+stTeacher,+stClass,+stSubject);
    setStSaving(false);
    if(error){
      if(error.code==="23505")notify("Already assigned","warn");
      else notify(error.message,"error");
    } else {notify("Category staff assigned ✓");load();}
  };

  const removeTeacherSubject=async(id)=>{
    const {error}=await db.removeTeacherSubject(id);
    if(error)notify(error.message,"error");
    else{notify("Assignment removed","warn");load();}
  };

  // Get current form teacher for selected class
  // currentFT removed — multiple form teachers now supported per class

  // Get class label
  const classLabel=id=>{
    const c=classes.find(x=>x.id===+id);
    return c?c.name:"—";
  };

  const tabs=[
    {id:"class-subjects",label:"Categories per Group"},
    {id:"form-teachers", label:"Form Staff"},
    {id:"subject-teachers",label:"Category Staff"},
  ];

  return(
    <div>
      <div style={{marginBottom:18}}>
        <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="assignments" size={20}/>Assignments</h2>
        <p style={{color:C.muted,fontSize:12}}>Map categories to groups, assign form staff, and assign category staff</p>
      </div>

      <div style={{marginBottom:16,padding:"10px 14px",background:C.bluePale,border:`1px solid ${C.blueLight}`,borderRadius:8,fontSize:12,color:C.blue,display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:16}}>💡</span>
        <span>
          <strong>Tip:</strong> To assign multiple categories to a staff across many groups at once, go to the <strong>Staff</strong> page and click the <strong>book icon</strong> on any staff row — it opens a Bulk Assign & Matrix tool that's much faster than doing it one by one here.
        </span>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:0,marginBottom:20,background:C.white,borderRadius:10,
        border:`1px solid ${C.border}`,overflow:"hidden",width:"fit-content"}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"10px 18px",border:"none",cursor:"pointer",fontSize:13,fontWeight:700,
              background:tab===t.id?C.blue:"transparent",
              color:tab===t.id?"#fff":C.muted,
              borderRight:`1px solid ${C.border}`,transition:"all .15s"}}>
            {t.label}
          </button>
        ))}
      </div>

      {loading?<Spinner/>:(<>

        {/* ── TAB 1: Group → Categories ─────────────────────────────────── */}
        {tab==="class-subjects"&&(
          <div style={{display:"grid",gridTemplateColumns:"320px 1fr",gap:16,alignItems:"start"}}>
            <Card>
              <h3 style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:12}}>Select a Group</h3>
              <select value={selClass} onChange={e=>setSelClass(e.target.value)}
                style={{width:"100%",padding:"9px 12px",border:`2px solid ${C.border}`,
                  borderRadius:8,fontSize:13,marginBottom:12,background:C.white,color:C.text}}>
                <option value="">— Pick a group —</option>
                {classes.map(c=><option key={c.id} value={c.id}>{c.name} ({c.sections?.code||""})</option>)}
              </select>
              {selClass&&(
                <div style={{fontSize:12,color:C.muted}}>
                  {classSubjectRows.length} category{classSubjectRows.length!==1?"s":""} assigned
                </div>
              )}
            </Card>

            <Card>
              <h3 style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:12}}>
                {selClass?`Categories for ${classLabel(selClass)}`:"Select a group to assign categories"}
              </h3>
              {!selClass&&<p style={{color:C.light,fontSize:12}}>Pick a group on the left first.</p>}
              {selClass&&csLoading&&<Spinner/>}
              {selClass&&!csLoading&&(()=>{
                const cl=classes.find(c=>c.id===+selClass);
                const secId=cl?.section_id;
                const available=sectionSubjects.filter(ss=>ss.section_id===secId||!secId);
                const assignedCount=available.filter(ss=>classSubjectRows.some(r=>r.section_subject_id===ss.id)).length;
                const allAssigned=available.length>0&&assignedCount===available.length;
                const noneAssigned=assignedCount===0;

                const selectAll=async()=>{
                  for(const ss of available){
                    if(!classSubjectRows.some(r=>r.section_subject_id===ss.id))
                      await db.assignSubjectToClass(+selClass,ss.id);
                  }
                  notify("All categories assigned ✓");
                  loadClassSubjects(selClass);
                };
                const deselectAll=async()=>{
                  // Interlock: block if ANY assigned subject has results for this class
                  const{count:totalRes}=await db.countResultsByClass(+selClass);
                  if(totalRes>0){
                    notify(`🔒 Interlock — Cannot remove all subjects\nReason: ${totalRes} result record(s) exist for this class.\nFix: Clear all results on the Results page first, then unassign subjects.`,"error");
                    return;
                  }
                  for(const ss of available){
                    if(classSubjectRows.some(r=>r.section_subject_id===ss.id))
                      await db.removeSubjectFromClass(+selClass,ss.id);
                  }
                  notify("All categories removed","warn");
                  loadClassSubjects(selClass);
                };

                return(
                  <div>
                    {available.length===0&&(
                      <p style={{color:C.amber,fontSize:12}}>No categories defined for this section yet. Add them in the Categories page.</p>
                    )}
                    {available.length>0&&(
                      <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center",
                        padding:"9px 12px",background:C.offWhite,borderRadius:8,border:`1px solid ${C.border}`}}>
                        <span style={{fontSize:12,color:C.muted,fontWeight:600,flex:1}}>
                          {assignedCount} / {available.length} assigned
                        </span>
                        <Btn xs onClick={selectAll} color={C.green} disabled={allAssigned}>
                          Select All
                        </Btn>
                        <Btn xs onClick={deselectAll} color={C.red} outline disabled={noneAssigned}>
                          Remove All
                        </Btn>
                      </div>
                    )}
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {available.map(ss=>{
                        const assigned=classSubjectRows.some(r=>r.section_subject_id===ss.id);
                        return(
                          <div key={ss.id} onClick={()=>toggleSubjectForClass(ss.id,assigned)}
                            style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                            padding:"9px 14px",borderRadius:8,border:`2px solid ${assigned?C.green:C.border}`,
                            background:assigned?C.greenPale:C.white,transition:"all .15s",cursor:"pointer"}}>
                            <div style={{display:"flex",alignItems:"center",gap:8}}>
                              <span style={{width:10,height:10,borderRadius:"50%",
                                background:assigned?C.green:C.light,flexShrink:0,display:"inline-block"}}/>
                              <span style={{fontWeight:assigned?700:400,fontSize:13,color:assigned?C.green:C.text}}>{ss.name}</span>
                              {ss.code&&<Badge color={C.muted}>{ss.code}</Badge>}
                            </div>
                            <Btn xs onClick={(e)=>{e.stopPropagation();toggleSubjectForClass(ss.id,assigned);}}
                              color={assigned?C.red:C.green} outline={!assigned}>
                              {assigned?"✕ Remove":"+ Assign"}
                            </Btn>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </Card>
          </div>
        )}

        {/* ── TAB 2: Form Staff (multiple per class supported) ──────── */}
        {tab==="form-teachers"&&(()=>{
          // Group form teachers by class for display
          const ftByClass={};
          formTeachers.forEach(ft=>{
            const cid=ft.class_id;
            if(!ftByClass[cid])ftByClass[cid]={cls:ft.classes,teachers:[]};
            ftByClass[cid].teachers.push(ft);
          });
          // Filter teachers already assigned as form teacher for selected class
          const alreadyFT=new Set(formTeachers.filter(ft=>ft.class_id===+ftClass).map(ft=>ft.teacher_id));
          const availableTeachers=teachers.filter(t=>!alreadyFT.has(t.id));
          return(
          <div style={{display:"grid",gridTemplateColumns:"360px 1fr",gap:16,alignItems:"start"}}>
            <Card>
              <h3 style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:14}}>Add Form Staff</h3>
              <p style={{color:C.muted,fontSize:12,marginBottom:10}}>A group can have multiple form staff.</p>
              <select value={ftClass} onChange={e=>{setFtClass(e.target.value);setFtTeacher("");}}
                style={{width:"100%",padding:"9px 12px",border:`2px solid ${C.border}`,background:"inherit",color:C.text,
                  borderRadius:8,fontSize:13,marginBottom:10}}>
                <option value="">— Select Group —</option>
                {classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {ftClass&&alreadyFT.size>0&&(
                <div style={{background:C.bluePale,borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:12}}>
                  <span style={{color:C.muted}}>Current form staff: </span>
                  {formTeachers.filter(ft=>ft.class_id===+ftClass).map(ft=>(
                    <span key={ft.id} style={{display:"inline-flex",alignItems:"center",gap:4,
                      background:"#fff",border:`1px solid ${C.border}`,borderRadius:6,
                      padding:"2px 8px",margin:"2px 2px",fontSize:12}}>
                      <strong style={{color:C.blue}}>{ft.teachers?.full_name}</strong>
                      <button onClick={()=>removeFormTeacherFromClass(ft.class_id,ft.teacher_id)}
                        style={{background:"none",border:"none",cursor:"pointer",color:C.muted,
                          padding:0,lineHeight:1,fontSize:13}}>×</button>
                    </span>
                  ))}
                </div>
              )}
              <select value={ftTeacher} onChange={e=>setFtTeacher(e.target.value)}
                disabled={!ftClass}
                style={{width:"100%",padding:"9px 12px",border:`2px solid ${C.border}`,background:"inherit",color:C.text,
                  borderRadius:8,fontSize:13,marginBottom:12,opacity:ftClass?1:.5}}>
                <option value="">— Select staff to add —</option>
                {availableTeachers.map(t=><option key={t.id} value={t.id}>{t.full_name} ({t.staff_id||"—"})</option>)}
              </select>
              <Btn onClick={addFormTeacherToClass} color={C.orange}
                disabled={!ftClass||!ftTeacher||ftSaving} style={{width:"100%"}}>
                {ftSaving?"Saving…":"Add Form Staff"}
              </Btn>
            </Card>

            <Card>
              <h3 style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:12}}>All Form Staff Assignments</h3>
              {formTeachers.length===0&&<p style={{color:C.light,fontSize:12}}>No form staff assigned yet.</p>}
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                  {formTeachers.length>0&&<Th cols={["Group","Section","Form Staff","Staff ID",""]}/>}
                  <tbody>
                    {formTeachers.map((ft,i)=>(
                      <TRow key={ft.id} i={i} cells={[
                        <strong>{ft.classes?.name||"—"}</strong>,
                        ft.classes?.sections?<Badge color={C.blue}>{ft.classes.sections.code}</Badge>:<span>—</span>,
                        <span>{ft.teachers?.full_name||"—"}</span>,
                        <Badge color={C.muted}>{ft.teachers?.staff_id||"—"}</Badge>,
                        <button onClick={()=>removeFormTeacherFromClass(ft.class_id,ft.teacher_id)}
                          style={{background:"none",border:"none",cursor:"pointer",
                            color:C.muted,fontSize:12,padding:"2px 6px"}}
                          title="Remove">✕</button>,
                      ]}/>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
          );
        })()}

        {/* ── TAB 3: Category Staff ─────────────────────────────────── */}
        {tab==="subject-teachers"&&(()=>{
          // ── Inline assignment panel state (handled via stTeacher/stClass) ──
          const existing=teacherSubjects.filter(ts=>ts.teacher_id===+stTeacher&&ts.class_id===+stClass).map(ts=>ts.subject_id);
          const allChecked=stSubjectOptions.length>0&&stSubjectOptions.every(s=>existing.includes(s.id));

          const toggleSubject=async(subjId)=>{
            if(!stTeacher||!stClass)return;
            setStSaving(true);
            const isAssigned=existing.includes(subjId);
            if(isAssigned){
              const row=teacherSubjects.find(ts=>ts.teacher_id===+stTeacher&&ts.class_id===+stClass&&ts.subject_id===subjId);
              if(row){const {error}=await db.removeTeacherSubject(row.id);if(error)notify(error.message,"error");}
            } else {
              const {error}=await db.assignTeacherSubject(+stTeacher,+stClass,subjId);
              if(error&&error.code!=="23505")notify(error.message,"error");
            }
            setStSaving(false);
            load();
          };
          const toggleAll=async()=>{
            if(!stTeacher||!stClass)return;
            setStSaving(true);
            if(allChecked){
              for(const s of stSubjectOptions){
                const row=teacherSubjects.find(ts=>ts.teacher_id===+stTeacher&&ts.class_id===+stClass&&ts.subject_id===s.id);
                if(row)await db.removeTeacherSubject(row.id);
              }
              notify("All categories removed","warn");
            } else {
              for(const s of stSubjectOptions){
                if(!existing.includes(s.id))await db.assignTeacherSubject(+stTeacher,+stClass,s.id);
              }
              notify("All categories assigned ✓");
            }
            setStSaving(false);
            load();
          };

          // ── Group for summary: teacherId → {teacher, classes:{classId→{cls,subjects:[]}}} ──
          const grouped={};
          teacherSubjects.forEach(ts=>{
            const key=ts.teacher_id;
            if(!grouped[key])grouped[key]={teacher:ts.teachers,classes:{}};
            if(!grouped[key].classes[ts.class_id])grouped[key].classes[ts.class_id]={cls:ts.classes,subjects:[]};
            grouped[key].classes[ts.class_id].subjects.push(ts);
          });

          // Search / filter teacher in summary view
          const visibleGroups=Object.values(grouped).filter(g=>
            !stSearch||g.teacher?.full_name?.toLowerCase().includes(stSearch.toLowerCase())||
            g.teacher?.staff_id?.toLowerCase().includes(stSearch.toLowerCase())
          );

          return(
            <div data-jd-columns="2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,alignItems:"start"}}>

              {/* ── Left: Assignment Panel ──────────────────────────────── */}
              <Card>
                <h3 style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:6}}>Assign Category Staff</h3>
                <p style={{fontSize:12,color:C.muted,marginBottom:12}}>
                  Select a staff + group, then tick which categories they teach.
                </p>

                <label style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,display:"block",marginBottom:4}}>Staff</label>
                <select value={stTeacher} onChange={e=>{setStTeacher(e.target.value);setStClass("");}}
                  style={{width:"100%",padding:"9px 12px",border:`2px solid ${stTeacher?C.blue:C.border}`,
                    background:"inherit",color:C.text,borderRadius:8,fontSize:13,marginBottom:10}}>
                  <option value="">— Select Staff —</option>
                  {teachers.map(t=>{
                    const tSubjCount=teacherSubjects.filter(ts=>ts.teacher_id===t.id).length;
                    return<option key={t.id} value={t.id}>{t.full_name} ({t.staff_id||"—"}){tSubjCount>0?` · ${tSubjCount} subj`:""}</option>;
                  })}
                </select>

                <label style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,display:"block",marginBottom:4}}>Group</label>
                <select value={stClass} onChange={e=>setStClass(e.target.value)} disabled={!stTeacher}
                  style={{width:"100%",padding:"9px 12px",border:`2px solid ${stClass?C.blue:C.border}`,
                    background:"inherit",color:C.text,borderRadius:8,fontSize:13,marginBottom:12,
                    opacity:stTeacher?1:.5}}>
                  <option value="">— Select Group —</option>
                  {classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </select>

                {stTeacher&&stClass&&(
                  <>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                      <span style={{fontSize:12,fontWeight:700,color:C.text}}>
                        Categories for {classes.find(c=>c.id===+stClass)?.name||"this group"}
                      </span>
                      {stSubjectOptions.length>0&&(
                        <Btn xs onClick={toggleAll} color={allChecked?C.red:C.blue} outline={!allChecked} disabled={stSaving}>
                          {allChecked?"Deselect All":"Select All"}
                        </Btn>
                      )}
                    </div>
                    {stSubjectOptions.length===0?(
                      <div style={{padding:"12px",background:C.orangePale,borderRadius:8,fontSize:12,color:C.orange}}>
                        No categories assigned to this group yet — add categories in the "Categories per Group" tab first.
                      </div>
                    ):(
                      <div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:300,overflowY:"auto",
                        border:`1px solid ${C.border}`,borderRadius:8,padding:4}}>
                        {stSubjectOptions.map(s=>{
                          const checked=existing.includes(s.id);
                          return(
                            <div key={s.id} onClick={()=>!stSaving&&toggleSubject(s.id)}
                              style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",
                                borderRadius:7,background:checked?C.bluePale:"transparent",
                                cursor:stSaving?"not-allowed":"pointer",transition:"background .12s"}}>
                              <div style={{width:17,height:17,borderRadius:4,flexShrink:0,transition:"all .12s",
                                border:`2px solid ${checked?C.blue:C.border}`,background:checked?C.blue:"transparent",
                                display:"flex",alignItems:"center",justifyContent:"center"}}>
                                {checked&&<span style={{color:"#fff",fontSize:10,fontWeight:900,lineHeight:1}}>✓</span>}
                              </div>
                              <span style={{fontSize:13,flex:1,fontWeight:checked?700:400,
                                color:checked?C.blue:C.text}}>{s.name}</span>
                              {s.code&&<span style={{fontSize:10,color:C.muted,background:C.offWhite,
                                padding:"1px 6px",borderRadius:4}}>{s.code}</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {existing.length>0&&(
                      <div style={{marginTop:8,fontSize:12,color:C.blue,fontWeight:700}}>
                        ✓ {existing.length} category{existing.length!==1?"s":""} assigned to this staff for this group
                      </div>
                    )}
                  </>
                )}
                {(!stTeacher||!stClass)&&(
                  <div style={{textAlign:"center",padding:"20px 0",color:C.muted,fontSize:12}}>
                    Select a staff and group above to manage their category assignments
                  </div>
                )}
              </Card>

              {/* ── Right: Visual Summary ────────────────────────────────── */}
              <div>
                {/* Search */}
                <div style={{marginBottom:10,position:"relative"}}>
                  <Search size={14} style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.muted}}/>
                  <input placeholder="Search staff by name or staff ID…"
                    value={stSearch} onChange={e=>setStSearch(e.target.value)}
                    style={{width:"100%",padding:"9px 12px 9px 32px",border:`2px solid ${C.border}`,
                      borderRadius:8,fontSize:13,outline:"none",background:"inherit",color:C.text,
                      boxSizing:"border-box"}}/>
                  {stSearch&&<button onClick={()=>setStSearch("")}
                    style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",
                      background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:16}}>×</button>}
                </div>

                {visibleGroups.length===0&&(
                  <Card>
                    <p style={{color:C.muted,fontSize:13,textAlign:"center",padding:"20px 0"}}>
                      {stSearch?"No staff match your search.":"No category staff assignments yet."}
                    </p>
                  </Card>
                )}

                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {visibleGroups.map((g,gi)=>{
                    const isSelected=g.teacher?.id===+stTeacher;
                    const totalSubj=Object.values(g.classes).reduce((a,cc)=>a+cc.subjects.length,0);
                    return(
                      <div key={gi} style={{border:`2px solid ${isSelected?C.blue:C.border}`,
                        borderRadius:10,overflow:"hidden",transition:"border-color .15s",
                        boxShadow:isSelected?`0 0 0 3px ${C.blue}22`:"none"}}>
                        {/* Staff header */}
                        <div style={{background:isSelected?C.blue:C.bluePale,padding:"10px 14px",
                          display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}
                          onClick={()=>{setStTeacher(String(g.teacher?.id||""));setStClass("");}}>
                          <div style={{width:32,height:32,borderRadius:"50%",background:isSelected?"rgba(255,255,255,.25)":C.blue,
                            display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                            <span style={{color:"#fff",fontWeight:900,fontSize:12}}>
                              {(g.teacher?.full_name||"?")[0]}
                            </span>
                          </div>
                          <div style={{flex:1}}>
                            <div style={{fontWeight:800,fontSize:13,color:isSelected?"#fff":C.blue}}>
                              {g.teacher?.full_name||"—"}
                            </div>
                            <div style={{fontSize:11,color:isSelected?"rgba(255,255,255,.7)":C.muted}}>
                              {g.teacher?.staff_id||"—"} · {Object.keys(g.classes).length} group{Object.keys(g.classes).length!==1?"es":""} · {totalSubj} category{totalSubj!==1?"s":""}
                            </div>
                          </div>
                          {isSelected&&<Badge color="rgba(255,255,255,.25)" style={{color:"#fff",fontSize:10}}>Editing</Badge>}
                        </div>
                        {/* Group-subject rows */}
                        {Object.values(g.classes).map((cc,ci)=>(
                          <div key={ci} style={{padding:"8px 14px",
                            borderTop:`1px solid ${isSelected?C.blue+"33":C.border}`,
                            display:"flex",alignItems:"flex-start",gap:10,
                            background:isSelected&&stClass===String(cc.cls?.id)?C.bluePale:"inherit"}}>
                            <button onClick={()=>{setStTeacher(String(g.teacher?.id||""));setStClass(String(cc.cls?.id||""));}}
                              style={{fontSize:12,fontWeight:700,color:C.text,minWidth:90,textAlign:"left",
                                background:"none",border:"none",cursor:"pointer",padding:0,paddingTop:2,
                                whiteSpace:"nowrap",textDecoration:"underline dotted"}}>
                              {cc.cls?.name||"—"}
                            </button>
                            <div style={{display:"flex",flexWrap:"wrap",gap:4,flex:1}}>
                              {cc.subjects.map(ts=>(
                                <span key={ts.id} style={{display:"inline-flex",alignItems:"center",gap:3,
                                  background:C.bluePale,color:C.blue,padding:"2px 8px",borderRadius:12,
                                  fontSize:11,fontWeight:600,border:`1px solid ${C.blue}22`}}>
                                  {ts.section_subjects?.name||"—"}
                                  <button onClick={e=>{e.stopPropagation();removeTeacherSubject(ts.id);}}
                                    style={{background:"none",border:"none",cursor:"pointer",color:C.red,
                                      fontSize:12,padding:0,lineHeight:1,fontWeight:900,marginLeft:2}}>×</button>
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

      </>)}
    </div>
  );
}

// ─── SECTIONS PAGE ───────────────────────────────────────────────────────────
export function SectionsPage({ctx}){
  const {notify}=ctx;
  const [sections,setSections]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modal,setModal]=useState(false);
  const [levelsModal,setLevelsModal]=useState(null);
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
    const warnings=await db.checkDeleteSection(id);
    let message=`Delete the "${name}" section?`;
    if(warnings.length)message+=` This section has ${warnings.join(" and ")}. Removing it may affect linked records.`;
    const ok=await confirm({title:"Delete Section?",message,confirmLabel:"Delete",danger:true,
      typeToConfirm:warnings.length?name:null});
    if(!ok)return;
    try{
      const {error}=await db.softDelete('section',id,ctx.user?.name||'admin');
      if(error)notify(error.message,"error");
      else{notify(`"${name}" moved to Recycle Bin`,"warn");load();}
    }catch(e){notify("Delete failed: "+e.message,"error");}
  };
  const toggle=async(s)=>{await db.upsertSection({is_active:!s.is_active},s.id);load();};

  const openLevels=(s)=>{setEditLevels([...(s.levels||[])]);setNewLevel("");setLevelsModal(s);};
  const addLevel=()=>{
    const v=newLevel.trim();
    if(!v)return;
    if(editLevels.includes(v)){notify("Level already exists","error");return;}
    setEditLevels(p=>[...p,v]);setNewLevel("");
  };
  const removeLevel=(l)=>setEditLevels(p=>p.filter(x=>x!==l));
  const moveLevel=(i,dir)=>{
    const arr=[...editLevels];const j=i+dir;
    if(j<0||j>=arr.length)return;
    [arr[i],arr[j]]=[arr[j],arr[i]];setEditLevels(arr);
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
          <p style={{color:C.muted,fontSize:12}}>Manage organization sections and their levels</p>
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
      {levelsModal&&(
        <Modal title={`Levels — ${levelsModal.name}`} onClose={()=>setLevelsModal(null)} width={480}>
          <p style={{color:C.muted,fontSize:12,marginBottom:14}}>Add, remove, or reorder the levels for this section. These appear as options when creating groups.</p>
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            <input value={newLevel} onChange={e=>setNewLevel(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&addLevel()}
              placeholder="e.g. NUR 1 or PRY 2"
              style={{flex:1,padding:"9px 12px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:13,outline:"none"}}/>
            <Btn onClick={addLevel} color={C.orange}>Add</Btn>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:320,overflowY:"auto"}}>
            {editLevels.map((l,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,background:C.offWhite,borderRadius:8,padding:"8px 12px",border:`1px solid ${C.border}`}}>
                <div style={{display:"flex",flexDirection:"column",gap:2}}>
                  <button onClick={()=>moveLevel(i,-1)} disabled={i===0} style={{background:"none",border:"none",cursor:i===0?"not-allowed":"pointer",color:C.muted,fontSize:12,lineHeight:1,padding:0,opacity:i===0?.3:1}}>▲</button>
                  <button onClick={()=>moveLevel(i,1)} disabled={i===editLevels.length-1} style={{background:"none",border:"none",cursor:i===editLevels.length-1?"not-allowed":"pointer",color:C.muted,fontSize:12,lineHeight:1,padding:0,opacity:i===editLevels.length-1?.3:1}}>▼</button>
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
