/**
 * Curriculum domain: SubjectsPage, SessionsPage
 */
import React, { useState, useEffect } from "react";
import { Edit, Pencil, Save, Trash2 } from "lucide-react";
import { db } from "../supabaseClient.js";
import { C } from "../config/theme.js";
import { useConfirm } from "../contexts/confirm.jsx";
import {
  Card, Btn, Badge, Inp, Sel, Modal, Spinner, AppIcon,
} from "../components/ui.jsx";

export function SubjectsPage({ctx}){
  const {notify,selectedSection}=ctx;
  const [subjects,setSubjects]=useState([]);
  const [sections,setSections]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modal,setModal]=useState(false);
  const [editId,setEditId]=useState(null);
  const [tab,setTab]=useState("section"); // "section" | "global"
  const blank={name:"",code:"",section_id:""};
  const [form,setForm]=useState(blank);
  const f=v=>setForm(p=>({...p,...v}));

  const load=()=>{
    setLoading(true);
    Promise.all([
      tab==="section"?db.getSectionSubjects(selectedSection?.id):db.getSubjects(),
      db.getSections(true)
    ]).then(([s,sec])=>{
      setSubjects(s.data||[]);
      setSections(sec.data||[]);
      setLoading(false);
    });
  };
  useEffect(load,[selectedSection,tab]);

  const save=async()=>{
    if(!form.name){notify("Name required","error");return;}
    let error;
    if(tab==="section"){
      const payload={...form,section_id:form.section_id?+form.section_id:null};
      ({error}=await db.upsertSectionSubject(payload,editId));
    } else {
      ({error}=await db.upsertSubject({name:form.name,code:form.code},editId));
    }
    if(error)notify(error.message,"error");
    else{notify(editId?"Updated ✓":"Added ✓");setModal(false);load();}
  };
  const del=async(id,name)=>{
    const __ok=await confirm({title:"Delete Subject?",
        message:`Delete subject "${name}"? Any class assignments using this subject will be affected.`,
        confirmLabel:"Delete",danger:true});
    if(!__ok)return;
    const {error}=await db.softDelete('subject',id,ctx.user?.name||'admin');
    if(error)notify(error.message,"error");
    else{notify(`"${name}" moved to Recycle Bin`,"warn");load();}
  };

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="subjects" size={20}/>Subjects</h2>
          <div style={{color:C.muted,fontSize:12}}>{subjects.length} subjects</div>
        </div>
        <Btn onClick={()=>{setForm(blank);setEditId(null);setModal(true);}} color={C.orange}>Add Subject</Btn>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:14}}>
        {["section","global"].map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{padding:"6px 16px",borderRadius:20,border:`2px solid ${tab===t?C.blue:C.border}`,
              background:tab===t?C.blue:"transparent",color:tab===t?"#fff":C.muted,
              fontSize:12,fontWeight:700,cursor:"pointer"}}>
            {t==="section"?"Section Subjects":"Global Subjects"}
          </button>
        ))}
      </div>

      <Card>
        {loading?<Spinner/>:(
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10}}>
            {subjects.map(s=>{
              const sec=tab==="section"?(s.sections||sections.find(x=>x.id===s.section_id)):null;
              return(
                <div key={s.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                  background:C.offWhite,padding:"10px 13px",borderRadius:9,border:`1px solid ${C.border}`}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:13}}>{s.name}</div>
                    <div style={{display:"flex",gap:5,marginTop:3}}>
                      <Badge color={C.blue}>{s.code}</Badge>
                      {sec&&<Badge color={sec.color||C.blue}>{sec.code}</Badge>}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:5}}>
                    <Btn xs onClick={()=>{setForm({name:s.name,code:s.code||"",section_id:s.section_id||""});setEditId(s.id);setModal(true);}} color={C.blue} outline><Pencil size={13}/></Btn>
                    <Btn xs onClick={()=>del(s.id,s.name)} color={C.red} outline><Trash2 size={13}/></Btn>
                  </div>
                </div>
              );
            })}
            {!subjects.length&&<div style={{color:C.light,padding:24,gridColumn:"1/-1",textAlign:"center"}}>No subjects yet</div>}
          </div>
        )}
      </Card>

      {modal&&(
        <Modal title={editId?"Edit Subject":"New Subject"} onClose={()=>setModal(false)}>
          <Inp label="Subject Name *" value={form.name} onChange={v=>f({name:v})} placeholder="e.g. Mathematics"/>
          <Inp label="Code" value={form.code||""} onChange={v=>f({code:v.toUpperCase()})} placeholder="e.g. MTH"/>
          {tab==="section"&&(
            <Sel label="Section" value={form.section_id||""} onChange={v=>f({section_id:v})}
              options={[{value:"",label:"— No specific section —"},...sections.map(s=>({value:s.id,label:s.name}))]}/>
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

// ─── SESSIONS & TERMS ─────────────────────────────────────────────────────────
export function SessionsPage({ctx}){
  const {notify}=ctx;
  const confirm=useConfirm();
  const [sessions,setSessions]=useState([]);
  const [terms,setTerms]=useState([]);
  const [loading,setLoading]=useState(true);
  const [sessModal,setSessModal]=useState(false);
  const [termModal,setTermModal]=useState(false);
  const [editSessId,setEditSessId]=useState(null);
  const [editTermId,setEditTermId]=useState(null);
  const [selectedSessId,setSelectedSessId]=useState(null);
  const [sessForm,setSessForm]=useState({name:"",is_active:false});
  const [termForm,setTermForm]=useState({name:"",session_id:"",is_active:false,start_date:"",end_date:""});

  const load=()=>{
    setLoading(true);
    Promise.all([db.getSessions(),db.getTerms()]).then(([s,t])=>{
      setSessions(s.data||[]);
      setTerms(t.data||[]);
      setLoading(false);
    });
  };
  useEffect(load,[]);

  const saveSession=async()=>{
    if(!sessForm.name){notify("Session name required","error");return;}
    const {error}=await db.upsertSession(sessForm,editSessId);
    if(error)notify(error.message,"error");
    else{notify(editSessId?"Session updated ✓":"Session added ✓");setSessModal(false);load();}
  };
  const saveTerm=async()=>{
    if(!termForm.name||!termForm.session_id){notify("Name and session required","error");return;}
    const {error}=await db.upsertTerm({...termForm,session_id:+termForm.session_id},editTermId);
    if(error)notify(error.message,"error");
    else{notify(editTermId?"Term updated ✓":"Term added ✓");setTermModal(false);load();}
  };
  const activateSession=async(s)=>{
    const current=sessions.find(x=>x.is_active);
    if(current&&current.id!==s.id){
      const ok=await confirm({title:"Change Active Session?",
        message:`"${current.name}" is currently active. Switch to "${s.name}"? The previous session will be deactivated.`,
        confirmLabel:"Switch Session"});
      if(!ok)return;
    }
    const {error}=await db.setActiveSession(s.id);
    if(error){notify(error.message,"error");return;}
    notify(`Active session changed to "${s.name}"`);load();
  };
  const activateTerm=async(t)=>{
    const current=terms.find(x=>x.is_active);
    if(current&&current.id!==t.id){
      const ok=await confirm({title:"Change Active Term?",
        message:`"${current.name}" is currently active. Switch to "${t.name}"? The previous term will be deactivated.`,
        confirmLabel:"Switch Term"});
      if(!ok)return;
    }
    const {error}=await db.setActiveTerm(t.id,t.session_id);
    if(error){notify(error.message,"error");return;}
    // New term started — no student is a "new enrolee" anymore
    await db.clearNewEnrolleeOnTermChange();
    notify(`Active term changed to "${t.name}"`);load();
  };
  const delTerm=async(id,name)=>{
    const __ok=await confirm({title:"Delete Term?",
        message:`Delete term "${name}"? Results and report cards for this term will also be removed.`,
        confirmLabel:"Delete Term",danger:true,typeToConfirm:name});
    if(!__ok)return;
    await db.deleteTerm(id);notify(`${name} deleted`,"warn");load();
  };

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="calendar" size={20}/>Sessions & Terms</h2>
        <div style={{display:"flex",gap:8}}>
          <Btn sm onClick={()=>{setTermForm({name:"",session_id:sessions[0]?.id||"",is_active:false});setEditTermId(null);setTermModal(true);}} color={C.green} outline>+ Term</Btn>
          <Btn onClick={()=>{setSessForm({name:"",is_active:false});setEditSessId(null);setSessModal(true);}} color={C.orange}>+ Session</Btn>
        </div>
      </div>

      {loading?<Spinner/>:sessions.map(s=>{
        const sTerms=terms.filter(t=>t.session_id===s.id);
        return(
          <Card key={s.id} style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{fontWeight:900,fontSize:15,color:C.blue}}>{s.name}</div>
                {s.is_active&&<Badge color={C.green}>ACTIVE</Badge>}
              </div>
              <div style={{display:"flex",gap:6}}>
                {!s.is_active&&<Btn sm onClick={()=>activateSession(s)} color={C.green} outline>Set Active</Btn>}
                <Btn sm onClick={()=>{setSessForm({name:s.name,is_active:s.is_active});setEditSessId(s.id);setSessModal(true);}} color={C.blue} outline><Pencil size={13}/></Btn>
                <Btn sm onClick={async()=>{const __ok=await confirm({title:"Delete Session?",
        message:`Delete session "${s.name}"? This will permanently delete all its terms, results, and report data.`,
        confirmLabel:"Delete Session",danger:true,typeToConfirm:s.name});
    if(!__ok)return;await db.deleteSession(s.id);notify(s.name+" deleted","warn");load();}} color={C.red} outline><Trash2 size={13}/></Btn>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
              {sTerms.map(t=>(
                <div key={t.id} style={{background:t.is_active?C.greenPale:C.offWhite,borderRadius:9,
                  padding:"11px",border:`2px solid ${t.is_active?C.green:C.border}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <div style={{fontWeight:700,color:t.is_active?C.green:C.text}}>{t.name}</div>
                    <div style={{display:"flex",gap:4}}>
                      <Btn xs onClick={()=>{setTermForm({name:t.name,session_id:t.session_id,is_active:t.is_active});setEditTermId(t.id);setTermModal(true);}} color={C.blue} outline><Pencil size={13}/></Btn>
                      <Btn xs onClick={()=>delTerm(t.id,t.name)} color={C.red} outline><Trash2 size={13}/></Btn>
                    </div>
                  </div>
                  {t.is_active
                    ?<Badge color={C.green}>Currently Active</Badge>
                    :<Btn xs onClick={()=>activateTerm(t)} color={C.orange} style={{marginTop:6}}>Set Active</Btn>}
                </div>
              ))}
              {!sTerms.length&&<div style={{color:C.light,fontSize:12,gridColumn:"1/-1"}}>No terms added yet</div>}
            </div>
          </Card>
        );
      })}

      {sessModal&&(
        <Modal title={editSessId?"Edit Session":"New Session"} onClose={()=>setSessModal(false)}>
          <Inp label="Session Name *" value={sessForm.name} onChange={v=>setSessForm(p=>({...p,name:v}))} placeholder="e.g. 2025/2026"/>
          <div style={{display:"flex",gap:10,marginTop:6}}>
            <Btn onClick={saveSession} color={C.orange} style={{flex:1}}>Save</Btn>
            <Btn onClick={()=>setSessModal(false)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
          </div>
        </Modal>
      )}
      {termModal&&(
        <Modal title={editTermId?"Edit Term":"New Term"} onClose={()=>setTermModal(false)}>
          <Sel label="Session *" value={termForm.session_id||""} onChange={v=>setTermForm(p=>({...p,session_id:v}))}
            options={sessions.map(s=>({value:s.id,label:s.name}))}/>
          <Inp label="Term Name *" value={termForm.name} onChange={v=>setTermForm(p=>({...p,name:v}))} placeholder="e.g. 1st Term"/>
          <div style={{display:"flex",gap:10,marginTop:6}}>
            <Btn onClick={saveTerm} color={C.orange} style={{flex:1}}>Save</Btn>
            <Btn onClick={()=>setTermModal(false)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── RESULTS ADMIN ────────────────────────────────────────────────────────────
