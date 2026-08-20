/**
 * Staff domain: TeachersPage
 */
import React, { useState, useEffect } from "react";
import { BookOpen, Check, Download, Edit, Pencil, Phone, Save, Send, Trash2, Upload } from "lucide-react";
import { db } from "../supabaseClient.js";
import { C } from "../config/theme.js";
import { useSection } from "../contexts/section.jsx";
import { useConfirm } from "../contexts/confirm.jsx";
import {
  Card, Btn, Badge, Inp, Sel, Modal, Th, TRow, Spinner, AppIcon, TableSkeleton, EmptyState,
} from "../components/ui.jsx";
import { buildEmailHtml } from "../services/email/index.js";
import { OnboardingEmailModal } from "./students.jsx";

export function TeachersPage({ctx}){
  const {notify,selectedSection,bumpRefresh}=ctx;
  const [teachers,setTeachers]=useState([]);
  const [sections,setSections]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modal,setModal]=useState(false);
  const [editId,setEditId]=useState(null);
  const blank={full_name:"",email:"",phone:"",gender:"Male",staff_id:"",date_joined:"",section_id:""};
  const [form,setForm]=useState(blank);
  const f=v=>setForm(p=>({...p,...v}));
  const [bulkModal,setBulkModal]=useState(false);
  const [bulkParsed,setBulkParsed]=useState([]);
  const [bulkSaving,setBulkSaving]=useState(false);
  const [bulkErrors,setBulkErrors]=useState([]);
  const [lastRegisteredTeachers,setLastRegisteredTeachers]=useState(null);
  const [showTeacherOnboarding,setShowTeacherOnboarding]=useState(false);
  const [assignSubjectTeacher,setAssignSubjectTeacher]=useState(null);

  const load=()=>{
    setLoading(true);
    Promise.all([db.getTeachers(selectedSection?.id),db.getSections(true)]).then(([t,s])=>{
      setTeachers(t.data||[]);
      setSections(s.data||[]);
      setLoading(false);
    });
  };
  useEffect(load,[selectedSection]);

  const save=async()=>{
    if(!form.full_name){notify("Full name required","error");return;}
    if(!editId&&!form.email){notify("Email is required for new staff","error");return;}
    const payload={...form,section_id:form.section_id?+form.section_id:null};
    // staff_id always equals email
    payload.staff_id=payload.email||payload.staff_id||"";
    // Default password = email for new teachers
    if(!editId){payload.password_hash=payload.email||"";}
    const {error}=await db.upsertTeacher(payload,editId);
    if(error){console.error("[upsertTeacher]",error);notify(error.message||error.details||"Failed to save staff","error");}
    else{
      notify(editId?"Staff updated ✓":"Staff added ✓");
      if(!editId){
        setLastRegisteredTeachers({count:1,entries:[{
          to:payload.email||null,
          subject:`Welcome to ${_taSN} Staff Portal`,
          html:buildEmailHtml("Welcome to the Staff Portal",[
            `This communication is regarding:`,
            `${payload.full_name} · Staff ID: ${payload.staff_id} · Role: Staff`,``,
            `Dear ${payload.full_name},`,``,
            `Your staff portal account has been created successfully.`,``,
            `YOUR LOGIN DETAILS`,
            `──────────────────────────────────────`,
            `Portal:   ${window.location.origin}`,
            `Username: ${payload.email}`,
            `Password: ${payload.email}`,
            `Role:     Staff`,
            `──────────────────────────────────────`,``,
            `Please log in using your email address as both your`,
            `username and default password.`,``,
            `We strongly recommend changing your password after`,
            `your first login for security.`,``,
            `For assistance, contact the organization administration.`,
          ].join("\n")),
        }]});
      }
      setModal(false);load();
    }
  };
  const confirm=useConfirm();
  const del=async(id,name)=>{
    const warnings=await db.checkDeleteTeacher(id);
    let message=`Delete teacher ${name}?`;
    if(warnings.length) message+=` They are ${warnings.join(" and ")}.`;
    const ok=await confirm({title:"Delete Staff?",message,confirmLabel:"Delete",danger:true,
      typeToConfirm:warnings.length?name:null});
    if(!ok)return;
    try{
      const {error}=await db.softDelete('teacher',id,ctx.user?.name||'admin');
      if(error)notify(error.message,"error");
      else{notify(`${name} moved to Recycle Bin`,"warn");load();bumpRefresh();}
    }catch(e){notify("Delete failed: "+e.message,"error");}
  };

  const getSection=id=>sections.find(s=>s.id===id);

  const downloadTeacherTemplate=()=>{
    const XLSX=window.XLSX;
    if(!XLSX){notify("Template loading — please wait a moment and try again","warn");return;}
    const wb=XLSX.utils.book_new();
    const wsData=[
      ["Full Name ★","Email ★ (used as login)","Phone","Category Specialisation"],
      ["Adaeze Okonkwo","adaeze@rgs.edu.ng","08012345678","Mathematics"],
    ];
    const ws=XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"]=[{wch:24},{wch:30},{wch:16},{wch:24}];
    XLSX.utils.book_append_sheet(wb,ws,"Staff Data");
    XLSX.writeFile(wb,"JD_Staff_Upload_Template.xlsx");
  };

  const parseTeacherBulkFile=async(file)=>{
    setBulkErrors([]);setBulkParsed([]);
    try{
      const XLSX=window.XLSX;
      if(!XLSX){setBulkErrors(["SheetJS not loaded yet — please wait a moment and try again."]);return;}
      const ab=await file.arrayBuffer();
      const wb=XLSX.read(ab,{type:"array",cellDates:true});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const raw=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
      if(raw.length<1){setBulkErrors(["File appears empty or invalid."]);return;}
      const headerRowIdx=raw.findIndex(r=>r.some(c=>String(c).toLowerCase().includes("full")||String(c).toLowerCase().includes("name")));
      if(headerRowIdx<0){setBulkErrors(["Could not find header row. Ensure a row contains 'Full Name' and 'Email'."]);return;}
      const headers=raw[headerRowIdx].map(h=>String(h).toLowerCase().replace(/[★\s]+/g,"_").trim());
      const hmap={};
      headers.forEach((h,i)=>{
        if(h.includes("full")||h==="name")hmap.full_name=i;
        else if(h.includes("email"))hmap.email=i;
        else if(h.includes("phone"))hmap.phone=i;
        else if(h.includes("subject")||h.includes("special"))hmap.subject=i;
      });
      const get=(row,key)=>{
        const idx=hmap[key];if(idx===undefined)return"";
        const v=row[idx];if(v==null||v==="")return"";
        return String(v).trim();
      };
      const rows=[];
      for(let i=headerRowIdx+2;i<raw.length;i++){
        const row=raw[i];
        const fn=get(row,"full_name"),em=get(row,"email");
        if(!fn&&!em)continue;
        rows.push({full_name:fn,email:em,phone:get(row,"phone"),subject:get(row,"subject"),_line:i+1});
      }
      if(rows.length===0){setBulkErrors(["No valid staff rows found. Check the file format."]);return;}
      setBulkParsed(rows);
    }catch(err){setBulkErrors(["Failed to parse file: "+err.message]);}
  };

  const saveTeacherBulk=async()=>{
    if(!bulkParsed.length){notify("No data to upload","error");return;}
    setBulkSaving(true);
    const errs=[];let added=0;
    const emailEntries=[];
    for(const row of bulkParsed){
      if(!row.full_name){errs.push(`Row ${row._line}: Full Name is required`);continue;}
      if(!row.email){errs.push(`Row ${row._line} (${row.full_name}): Email is required`);continue;}
      const payload={full_name:row.full_name,email:row.email,staff_id:row.email,password_hash:row.email,phone:row.phone||null};
      const {error}=await db.upsertTeacher(payload);
      if(error){console.error("[bulkTeacher]",error);errs.push(`Row ${row._line} (${row.full_name}): ${error.message||error.details||"Insert failed"}`);}
      else{
        added++;
        emailEntries.push({
          to:row.email||null,
          subject:`Welcome to ${_taSN} Staff Portal`,
          html:buildEmailHtml("Welcome to the Staff Portal",[
            `This communication is regarding:`,
            `${row.full_name} · Staff ID: ${row.email} · Role: Staff`,``,
            `Dear ${row.full_name},`,``,
            `Your staff portal account has been created successfully.`,``,
            `YOUR LOGIN DETAILS`,
            `──────────────────────────────────────`,
            `Portal:   ${window.location.origin}`,
            `Username: ${row.email}`,
            `Password: ${row.email}`,
            `Role:     Staff`,
            `──────────────────────────────────────`,``,
            `Please log in using your email address as both your`,
            `username and default password.`,``,
            `We strongly recommend changing your password after`,
            `your first login for security.`,``,
            `For assistance, contact the organization administration.`,
          ].join("\n")),
        });
      }
    }
    setBulkSaving(false);setBulkErrors(errs);
    if(added>0){notify(`${added} teacher(s) uploaded ✓`);load();setLastRegisteredTeachers({count:added,entries:emailEntries});}
    if(errs.length===0){setBulkModal(false);setBulkParsed([]);}
  };

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="teachers" size={20}/>Staff</h2>
          <div style={{color:C.muted,fontSize:12}}>{teachers.length} staff members{selectedSection?` · ${selectedSection.name}`:""}</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <Btn onClick={()=>{setBulkParsed([]);setBulkErrors([]);setBulkModal(true);}} color={C.green} outline>Bulk Upload</Btn>
          <Btn onClick={()=>{setForm(blank);setEditId(null);setModal(true);}} color={C.orange}>Add Staff</Btn>
        </div>
      </div>
      {/* ── Post-registration banner ── */}
      {lastRegisteredTeachers&&(
        <div style={{marginBottom:16,padding:"12px 16px",background:C.greenPale,border:`1px solid ${C.green}44`,borderRadius:10,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <span style={{flex:1,fontSize:13,color:C.green,fontWeight:700}}>
            {lastRegisteredTeachers.count} staff{lastRegisteredTeachers.count!==1?"s":""} registered successfully.
          </span>
          <Btn onClick={()=>setShowTeacherOnboarding(true)} color={C.blue} outline style={{fontSize:12}}>
            Send Onboarding Emails
          </Btn>
          <button onClick={()=>setLastRegisteredTeachers(null)}
            style={{background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:18,lineHeight:1,padding:"0 4px"}}>✕</button>
        </div>
      )}
      <Card>
        {!loading&&!teachers.length?(
          <EmptyState icon={<AppIcon name="teachers" size={28} color={C.muted}/>}
            title="No staff yet"
            message={selectedSection?`No staff in ${selectedSection.name}. Add your first teacher or clear the section filter.`:"Add your first staff to get started."}
            action={<Btn onClick={()=>{setForm(blank);setEditId(null);setModal(true);}} color={C.orange}>Add Staff</Btn>}/>
        ):(
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <Th cols={["Staff ID","Full Name","Email","Phone","Gender","Section","Joined","Actions"]}/>
              {loading?<TableSkeleton rows={6} cols={8}/>:(
              <tbody>
                {teachers.map((t,i)=>{
                  const sec=t.sections||getSection(t.section_id);
                  return(
                    <TRow key={t.id} i={i} cells={[
                      <Badge color={C.blue}>{t.staff_id||"—"}</Badge>,
                      <strong>{t.full_name}</strong>,
                      <span style={{color:C.muted}}>{t.email||"—"}</span>,
                      <span style={{color:C.muted}}>{t.phone||"—"}</span>,
                      <Badge color={t.gender==="Female"?"#9d174d":C.blue}>{t.gender||"—"}</Badge>,
                      sec?<Badge color={sec.color||C.blue}>{sec.code}</Badge>:<span style={{color:C.light}}>—</span>,
                      <span style={{color:C.muted}}>{t.date_joined||"—"}</span>,
                      <div style={{display:"flex",gap:5}}>
                        <Btn xs onClick={()=>setAssignSubjectTeacher(t)} color={C.green} outline title="Assign Categories"><BookOpen size={13}/></Btn>
                        <Btn xs onClick={()=>{setForm({full_name:t.full_name||"",email:t.email||"",phone:t.phone||"",gender:t.gender||"Male",staff_id:t.staff_id||"",date_joined:t.date_joined||"",section_id:t.section_id||""});setEditId(t.id);setModal(true);}} color={C.blue} outline><Pencil size={13}/></Btn>
                        <Btn xs onClick={()=>del(t.id,t.full_name)} color={C.red} outline><Trash2 size={13}/></Btn>
                      </div>
                    ]}/>
                  );
                })}
              </tbody>
              )}
            </table>
          </div>
        )}
      </Card>

      {modal&&(
        <Modal title={editId?"Edit Staff":"New Staff"} onClose={()=>setModal(false)}>
          <Inp label="Full Name *" value={form.full_name} onChange={v=>f({full_name:v})}/>
          <Inp label="Email * (used as login username)" type="email" value={form.email||""} onChange={v=>f({email:v,staff_id:v})}/>
          <div style={{marginBottom:13,padding:"8px 12px",background:C.bluePale,border:`1px solid ${C.blueLight}`,borderRadius:8,fontSize:12,color:C.blue}}>
            Staff logs in using their email address. Staff ID is set automatically.
          </div>
          <div style={{marginBottom:13}}>
            <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>Staff ID (auto-set from email)</label>
            <div style={{padding:"9px 12px",background:C.offWhite,borderRadius:8,fontSize:13,border:`2px solid ${C.border}`,color:C.muted}}>{form.staff_id||form.email||"— enter email above —"}</div>
          </div>
          <Sel label="Gender" value={form.gender||"Male"} onChange={v=>f({gender:v})} options={["Male","Female"]}/>
          <Inp label="Phone" value={form.phone||""} onChange={v=>f({phone:v})}/>
          <Sel label="Section" value={form.section_id||""} onChange={v=>f({section_id:v})}
            options={[{value:"",label:"— Select Section —"},...sections.map(s=>({value:s.id,label:s.name}))]}/>
          <Inp label="Date Joined" type="date" value={form.date_joined||""} onChange={v=>f({date_joined:v})}/>
          <div style={{display:"flex",gap:10,marginTop:6}}>
            <Btn onClick={save} color={C.orange} style={{flex:1}}>Save</Btn>
            <Btn onClick={()=>setModal(false)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
          </div>
        </Modal>
      )}

      {/* ── TEACHER BULK UPLOAD MODAL ── */}
      {bulkModal&&(
        <Modal title="Bulk Staff Upload" onClose={()=>setBulkModal(false)} width={640}>
          {typeof window!=="undefined"&&!window.XLSX&&(()=>{
            const s=document.createElement("script");
            s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
            document.head.appendChild(s);return null;
          })()}
          <div style={{background:C.bluePale,border:`1px solid ${C.blue}22`,borderRadius:10,padding:"13px 16px",marginBottom:16,fontSize:12,color:C.blue,lineHeight:1.8}}>
            <div style={{fontWeight:800,marginBottom:4}}>Instructions</div>
            <div>1. Download the <strong>Excel template</strong> and fill in staff details</div>
            <div>2. <strong>Full Name</strong> and <strong>Email</strong> are required (★ columns)</div>
            <div>3. Email becomes the staff's <strong>Staff ID and login username</strong></div>
            <div>4. Default password = Email — staff should change after first login</div>
            <div>5. Save as .xlsx and upload below</div>
          </div>
          <div style={{background:C.amberPale,border:`1px solid ${C.amber}44`,borderRadius:8,padding:"9px 13px",marginBottom:14,fontSize:12,color:C.amber}}>
            Staff log in using their email address as both username and password. Ask them to change their password after first login.
          </div>
          <div style={{display:"flex",gap:10,marginBottom:16}}>
            <Btn onClick={downloadTeacherTemplate} color={C.blue}>Download Excel Template (.xlsx)</Btn>
          </div>
          <div style={{marginBottom:14}}>
            <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>Upload Filled Excel File (.xlsx)</label>
            <input type="file" accept=".xlsx,.xls" onChange={e=>e.target.files[0]&&parseTeacherBulkFile(e.target.files[0])}
              style={{display:"block",width:"100%",padding:"9px 12px",border:`2px dashed ${C.border}`,borderRadius:8,fontSize:13,cursor:"pointer",background:C.offWhite}}/>
          </div>
          {bulkParsed.length>0&&(
            <div style={{marginBottom:14}}>
              <div style={{fontWeight:700,color:C.green,fontSize:13,marginBottom:8}}>{bulkParsed.length} rows parsed — preview:</div>
              <div style={{overflowX:"auto",maxHeight:220,overflowY:"auto",border:`1px solid ${C.border}`,borderRadius:8}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead>
                    <tr style={{background:C.blue}}>
                      {["#","Full Name","Email","Phone","Category"].map((h,i)=>(
                        <th key={i} style={{padding:"6px 10px",color:"#fff",textAlign:"left",fontWeight:700,whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bulkParsed.slice(0,8).map((r,i)=>(
                      <tr key={i} style={{background:i%2===0?C.white:C.offWhite}}>
                        <td style={{padding:"5px 10px",color:C.light}}>{r._line}</td>
                        <td style={{padding:"5px 10px",fontWeight:600}}>{r.full_name}</td>
                        <td style={{padding:"5px 10px",color:C.muted,fontSize:11}}>{r.email||<span style={{color:C.red}}>MISSING</span>}</td>
                        <td style={{padding:"5px 10px",color:C.muted}}>{r.phone||"—"}</td>
                        <td style={{padding:"5px 10px",color:C.muted}}>{r.subject||"—"}</td>
                      </tr>
                    ))}
                    {bulkParsed.length>8&&<tr><td colSpan={5} style={{padding:"6px 10px",color:C.muted,fontSize:11}}>…and {bulkParsed.length-8} more rows</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {bulkErrors.length>0&&(
            <div style={{background:C.redPale,border:`1px solid ${C.red}22`,borderRadius:8,padding:"10px 14px",marginBottom:14}}>
              {bulkErrors.map((e,i)=><div key={i} style={{fontSize:12,color:C.red,marginBottom:2}}>{e}</div>)}
            </div>
          )}
          <div style={{display:"flex",gap:10,marginTop:4}}>
            <Btn onClick={saveTeacherBulk} color={C.orange} disabled={bulkSaving||!bulkParsed.length} style={{flex:1}}>
              {bulkSaving?"Uploading…":`Upload ${bulkParsed.length} Staff${bulkParsed.length!==1?"s":""}`}
            </Btn>
            <Btn onClick={()=>setBulkModal(false)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
          </div>
        </Modal>
      )}
      {showTeacherOnboarding&&lastRegisteredTeachers&&(
        <OnboardingEmailModal entries={lastRegisteredTeachers.entries} onClose={()=>{setShowTeacherOnboarding(false);setLastRegisteredTeachers(null);}} type="teacher"/>
      )}
      {assignSubjectTeacher&&(
        <TeacherSubjectAssignModal teacher={assignSubjectTeacher} onClose={()=>setAssignSubjectTeacher(null)} notify={notify}/>
      )}
    </div>
  );
}

// ─── STAFF SUBJECT ASSIGN MODAL ────────────────────────────────────────────

function TeacherSubjectAssignModal({teacher,onClose,notify}){
  const [tab,setTab]=useState("bulk");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [sections,setSections]=useState([]);
  const [allClasses,setAllClasses]=useState([]);
  const [allSubjects,setAllSubjects]=useState([]);
  const [existingRows,setExistingRows]=useState([]);
  const [checked,setChecked]=useState({});
  const [original,setOriginal]=useState({});
  const [activeSection,setActiveSection]=useState(null);
  const [bulkSelSubjects,setBulkSelSubjects]=useState(new Set());
  const [bulkSelClasses,setBulkSelClasses]=useState(new Set());

  useEffect(()=>{
    Promise.allSettled([
      db.getSections(true),
      db.getClasses(),
      db.getSectionSubjects(),
      db.getTeacherSubjects(teacher.id),
    ]).then(([s,c,sub,ts])=>{
      const secs=s.value?.data||[];
      const cls=c.value?.data||[];
      const subs=sub.value?.data||[];
      const rows=ts.value?.data||[];
      setSections(secs);setAllClasses(cls);setAllSubjects(subs);setExistingRows(rows);
      if(secs.length) setActiveSection(secs[0].id);
      const ch={};
      rows.forEach(r=>{ch[`${r.class_id}_${r.subject_id}`]=true;});
      setChecked({...ch});setOriginal({...ch});
      setLoading(false);
    });
  },[teacher.id]);

  useEffect(()=>{setBulkSelSubjects(new Set());setBulkSelClasses(new Set());},[activeSection]);

  const sectionClasses=allClasses.filter(c=>c.section_id===activeSection);
  const sectionSubjects=allSubjects.filter(s=>s.section_id===activeSection);

  const toggle=(classId,subjectId)=>{
    const key=`${classId}_${subjectId}`;
    setChecked(p=>({...p,[key]:!p[key]}));
  };

  const applyBulk=()=>{
    const n={...checked};
    bulkSelSubjects.forEach(subId=>{bulkSelClasses.forEach(clsId=>{n[`${clsId}_${subId}`]=true;});});
    setChecked(n);
    setTab("matrix");
  };

  const save=async()=>{
    setSaving(true);
    const toInsert=[];const toDelete=[];
    const allKeys=new Set([...Object.keys(original),...Object.keys(checked)]);
    allKeys.forEach(key=>{
      const was=!!original[key],is=!!checked[key];
      if(is&&!was){const [ci,si]=key.split('_').map(Number);toInsert.push({class_id:ci,subject_id:si});}
      else if(!is&&was){const row=existingRows.find(r=>`${r.class_id}_${r.subject_id}`===key);if(row)toDelete.push(row.id);}
    });
    await Promise.allSettled([
      toInsert.length&&db.assignTeacherSubjectBulk(teacher.id,toInsert),
      toDelete.length&&db.removeTeacherSubjectBulk(toDelete),
    ].filter(Boolean));
    setSaving(false);
    notify(`${toInsert.length+toDelete.length} subject assignment(s) saved ✓`);
    onClose();
  };

  const pending=(()=>{
    const allKeys=new Set([...Object.keys(original),...Object.keys(checked)]);
    let n=0;allKeys.forEach(k=>{if(!!original[k]!==!!checked[k])n++;});return n;
  })();

  const tabBtn=(id,label)=>(
    <button key={id} onClick={()=>setTab(id)}
      style={{padding:"9px 20px",border:"none",background:"none",cursor:"pointer",fontWeight:tab===id?800:500,
        fontSize:13,color:tab===id?C.blue:C.muted,
        borderBottom:tab===id?`3px solid ${C.blue}`:"3px solid transparent",marginBottom:-2}}>
      {label}
    </button>
  );

  return(
    <Modal title={`Assign Categories — ${teacher.full_name}`} onClose={onClose} width={900}>
      {loading?<div style={{padding:40,textAlign:"center"}}><Spinner/></div>:(
        <>
          {/* Section switcher */}
          <div style={{display:"flex",gap:6,marginBottom:18,flexWrap:"wrap"}}>
            {sections.map(s=>(
              <button key={s.id} onClick={()=>setActiveSection(s.id)}
                style={{padding:"5px 16px",borderRadius:99,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,
                  background:activeSection===s.id?(s.color||C.blue):C.offWhite,
                  color:activeSection===s.id?"#fff":C.muted}}>
                {s.name}
              </button>
            ))}
          </div>

          {/* View tabs */}
          <div style={{display:"flex",borderBottom:`2px solid ${C.border}`,marginBottom:20}}>
            {tabBtn("bulk","Bulk Assign")}
            {tabBtn("matrix","Matrix View")}
          </div>

          {/* ── BULK ASSIGN ── */}
          {tab==="bulk"&&(
            <>
              {!sectionSubjects.length&&!sectionClasses.length?(
                <div style={{textAlign:"center",padding:40,color:C.muted,fontSize:13}}>No categories or groups configured for this section.</div>
              ):(
                <>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                    {/* Categories column */}
                    <div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                        <span style={{fontWeight:800,fontSize:12,color:C.blue,textTransform:"uppercase",letterSpacing:.5}}>
                          Categories ({sectionSubjects.length})
                        </span>
                        <button onClick={()=>setBulkSelSubjects(bulkSelSubjects.size===sectionSubjects.length?new Set():new Set(sectionSubjects.map(s=>s.id)))}
                          style={{fontSize:11,color:C.blue,background:"none",border:"none",cursor:"pointer",fontWeight:700}}>
                          {bulkSelSubjects.size===sectionSubjects.length?"Clear All":"Select All"}
                        </button>
                      </div>
                      <div style={{maxHeight:300,overflowY:"auto",display:"flex",flexDirection:"column",gap:3}}>
                        {sectionSubjects.map(s=>{
                          const sel=bulkSelSubjects.has(s.id);
                          const assignedCount=sectionClasses.filter(c=>checked[`${c.id}_${s.id}`]).length;
                          return(
                            <label key={s.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",
                              borderRadius:7,border:`1.5px solid ${sel?C.blue:C.border}`,
                              background:sel?`${C.blue}0d`:"#fff",cursor:"pointer",userSelect:"none"}}>
                              <input type="checkbox" checked={sel}
                                onChange={()=>{const n=new Set(bulkSelSubjects);n.has(s.id)?n.delete(s.id):n.add(s.id);setBulkSelSubjects(n);}}
                                style={{accentColor:C.blue,width:14,height:14}}/>
                              <span style={{flex:1,fontSize:13,fontWeight:600}}>{s.name}</span>
                              {assignedCount>0&&<span style={{fontSize:10,color:C.green,fontWeight:700,background:`${C.green}18`,padding:"1px 6px",borderRadius:99}}>{assignedCount}/{sectionClasses.length}</span>}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    {/* Groups column */}
                    <div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                        <span style={{fontWeight:800,fontSize:12,color:C.purple,textTransform:"uppercase",letterSpacing:.5}}>
                          Groups ({sectionClasses.length})
                        </span>
                        <button onClick={()=>setBulkSelClasses(bulkSelClasses.size===sectionClasses.length?new Set():new Set(sectionClasses.map(c=>c.id)))}
                          style={{fontSize:11,color:C.purple,background:"none",border:"none",cursor:"pointer",fontWeight:700}}>
                          {bulkSelClasses.size===sectionClasses.length?"Clear All":"Select All"}
                        </button>
                      </div>
                      <div style={{maxHeight:300,overflowY:"auto",display:"flex",flexDirection:"column",gap:3}}>
                        {sectionClasses.map(c=>{
                          const sel=bulkSelClasses.has(c.id);
                          return(
                            <label key={c.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",
                              borderRadius:7,border:`1.5px solid ${sel?C.purple:C.border}`,
                              background:sel?`${C.purple}0d`:"#fff",cursor:"pointer",userSelect:"none"}}>
                              <input type="checkbox" checked={sel}
                                onChange={()=>{const n=new Set(bulkSelClasses);n.has(c.id)?n.delete(c.id):n.add(c.id);setBulkSelClasses(n);}}
                                style={{accentColor:C.purple,width:14,height:14}}/>
                              <span style={{fontSize:13,fontWeight:600}}>{c.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  {/* Combination preview */}
                  {bulkSelSubjects.size>0&&bulkSelClasses.size>0&&(
                    <div style={{marginTop:14,padding:"12px 16px",background:`${C.blue}08`,
                      border:`1.5px solid ${C.blue}33`,borderRadius:10,display:"flex",alignItems:"center",gap:12}}>
                      <span style={{flex:1,fontSize:13,color:C.blue}}>
                        <strong>{bulkSelSubjects.size}</strong> category{bulkSelSubjects.size!==1?"s":""} × <strong>{bulkSelClasses.size}</strong> group{bulkSelClasses.size!==1?"es":""} = <strong>{bulkSelSubjects.size*bulkSelClasses.size}</strong> combination{bulkSelSubjects.size*bulkSelClasses.size!==1?"s":""}
                      </span>
                      <Btn onClick={applyBulk} color={C.blue}>Apply &amp; View Matrix →</Btn>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ── MATRIX VIEW ── */}
          {tab==="matrix"&&(
            <div style={{overflowX:"auto"}}>
              {!sectionSubjects.length?(
                <div style={{textAlign:"center",padding:40,color:C.muted,fontSize:13}}>No categories configured for this section.</div>
              ):(
                <table style={{borderCollapse:"collapse",fontSize:12,minWidth:"100%"}}>
                  <thead>
                    <tr>
                      <th style={{textAlign:"left",padding:"8px 12px",background:C.offWhite,borderBottom:`2px solid ${C.border}`,fontWeight:800,color:C.muted,minWidth:190,position:"sticky",left:0,zIndex:1}}>
                        Category
                      </th>
                      {sectionClasses.map(c=>(
                        <th key={c.id} style={{padding:"8px 10px",textAlign:"center",background:C.offWhite,borderBottom:`2px solid ${C.border}`,fontWeight:800,color:C.blue,whiteSpace:"nowrap",minWidth:64}}>
                          {c.name}
                        </th>
                      ))}
                      <th style={{padding:"8px 10px",textAlign:"center",background:C.offWhite,borderBottom:`2px solid ${C.border}`,fontWeight:800,color:C.purple,minWidth:56}}>
                        All
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectionSubjects.map((s,si)=>{
                      const allRowChecked=sectionClasses.length>0&&sectionClasses.every(c=>!!checked[`${c.id}_${s.id}`]);
                      const someRowChecked=sectionClasses.some(c=>!!checked[`${c.id}_${s.id}`]);
                      return(
                        <tr key={s.id} style={{background:si%2===0?"#fff":C.offWhite}}>
                          <td style={{padding:"8px 12px",fontWeight:600,borderBottom:`1px solid ${C.border}`,position:"sticky",left:0,background:si%2===0?"#fff":C.offWhite,zIndex:1}}>
                            {s.name}
                          </td>
                          {sectionClasses.map(c=>{
                            const key=`${c.id}_${s.id}`;
                            const isChk=!!checked[key];
                            const wasChk=!!original[key];
                            return(
                              <td key={c.id} style={{textAlign:"center",borderBottom:`1px solid ${C.border}`,
                                background:isChk!==wasChk?(isChk?`${C.green}18`:`${C.red}12`):"transparent"}}>
                                <input type="checkbox" checked={isChk} onChange={()=>toggle(c.id,s.id)}
                                  style={{width:16,height:16,accentColor:C.green,cursor:"pointer"}}/>
                              </td>
                            );
                          })}
                          <td style={{textAlign:"center",borderBottom:`1px solid ${C.border}`}}>
                            <input type="checkbox" checked={allRowChecked}
                              ref={el=>{if(el)el.indeterminate=!allRowChecked&&someRowChecked;}}
                              onChange={()=>{
                                const n={...checked};
                                sectionClasses.forEach(c=>{n[`${c.id}_${s.id}`]=!allRowChecked;});
                                setChecked(n);
                              }}
                              style={{width:16,height:16,accentColor:C.purple,cursor:"pointer"}}/>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Footer */}
          <div style={{display:"flex",gap:12,marginTop:20,paddingTop:16,borderTop:`1px solid ${C.border}`,alignItems:"center"}}>
            {pending>0&&(
              <span style={{fontSize:11,color:C.muted,flex:1}}>
                {pending} pending change{pending!==1?"s":""} · <span style={{color:C.green}}>green = adding</span> · <span style={{color:C.red}}>red = removing</span>
              </span>
            )}
            <div style={{display:"flex",gap:10,marginLeft:"auto"}}>
              <Btn onClick={onClose} color={C.muted} outline>Cancel</Btn>
              <Btn onClick={save} color={C.green} disabled={saving||pending===0}>
                {saving?"Saving…":pending>0?`Save ${pending} Change${pending!==1?"s":""}`:"No Changes"}
              </Btn>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

// ─── CLASSES PAGE ─────────────────────────────────────────────────────────────
