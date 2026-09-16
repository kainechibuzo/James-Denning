/**
 * Grading domain: GradingPage, CaeStructurePanel
 */
import React, { useState, useEffect, useMemo } from "react";
import {
  Activity, Boxes, Calendar, Copy, DollarSign, Download,
  Edit, Pencil, Save, Send, Settings, Trash2, Upload,
} from "lucide-react";
import { db } from "../supabaseClient.js";
import { C } from "../config/theme.js";
import {
  Card, Btn, Badge, Inp, Sel, Modal, Spinner, AppIcon,
} from "../components/ui.jsx";
import { gradeCol as _gradeColPure } from "../utils/grades.js";

const gradeCol = g => _gradeColPure(g, C);
const uid = () => Math.random().toString(36).slice(2);

export function GradingPage({ctx}){
  const {notify,selectedSection}=ctx;
  const [sections,setSections]=useState([]);
  const [selSecId,setSelSecId]=useState(null); // null = global
  const [tab,setTab]=useState("grades"); // grades | cae
  // grades
  const [grading,setGrading]=useState([]);
  const [gLoading,setGLoading]=useState(true);
  const [gModal,setGModal]=useState(false);
  const [editGId,setEditGId]=useState(null);
  const [gForm,setGForm]=useState({min_score:0,max_score:100,grade:"",remark:"",section_id:null,schema_type:"grades"});
  const gf=v=>setGForm(p=>({...p,...v}));
  // cae traits
  const [traits,setTraits]=useState([]);
  const [ratings,setRatings]=useState([]);
  const [tLoading,setTLoading]=useState(false);
  const [tModal,setTModal]=useState(false);
  const [editTId,setEditTId]=useState(null);
  const [tForm,setTForm]=useState({category:"",description:"",sort_order:0,section_id:null});
  const tf=v=>setTForm(p=>({...p,...v}));
  const [rModal,setRModal]=useState(false);
  const [editRId,setEditRId]=useState(null);
  const [rForm,setRForm]=useState({label:"",symbol:"",sort_order:0,section_id:null});
  const rf=v=>setRForm(p=>({...p,...v}));

  useEffect(()=>{
    db.getSections(false).then(({data})=>setSections(data||[]));
  },[]);

  useEffect(()=>{
    setGLoading(true);
    db.getGradingSchema(selSecId,"grades").then(({data})=>{setGrading(data||[]);setGLoading(false);});
  },[selSecId]);

  useEffect(()=>{
    if(tab!=="cae")return;
    setTLoading(true);
    Promise.all([
      db.getCaeTraits(selSecId),
      db.getCaeRatings(selSecId),
    ]).then(([t,r])=>{
      setTraits(t.data||[]);
      setRatings(r.data||[]);
      setTLoading(false);
    });
  },[tab,selSecId]);

  const saveGrade=async()=>{
    if(!gForm.grade||!gForm.remark){notify("Grade and remark required","error");return;}
    const payload={...gForm,section_id:selSecId,schema_type:"grades"};
    const {error}=await db.upsertGrade(payload,editGId);
    if(error)notify(error.message,"error");
    else{notify(editGId?"Grade updated ✓":"Grade added ✓");setGModal(false);
      db.getGradingSchema(selSecId,"grades").then(({data})=>setGrading(data||[]));
    }
  };
  const delGrade=async(id)=>{
    const __ok=await confirm({title:"Delete Grade Band?",
        message:"Remove this grade band? Students whose scores fall in this range will no longer have a grade.",
        confirmLabel:"Delete",danger:true});
    if(!__ok)return;
    await db.deleteGrade(id);notify("Deleted","warn");
    db.getGradingSchema(selSecId,"grades").then(({data})=>setGrading(data||[]));
  };
  const saveTrait=async()=>{
    if(!tForm.category){notify("Category name required","error");return;}
    const payload={...tForm,section_id:selSecId};
    const {error}=await db.upsertCaeTrait(payload,editTId);
    if(error)notify(error.message,"error");
    else{notify(editTId?"Trait updated ✓":"Trait added ✓");setTModal(false);
      db.getCaeTraits(selSecId).then(({data})=>setTraits(data||[]));
    }
  };
  const delTrait=async(id)=>{
    const __ok=await confirm({title:"Delete Trait?",
        message:"Remove this assessment trait? Any ratings already given for this trait will be lost.",
        confirmLabel:"Delete",danger:true});
    if(!__ok)return;
    await db.deleteCaeTrait(id);notify("Deleted","warn");
    db.getCaeTraits(selSecId).then(({data})=>setTraits(data||[]));
  };
  const saveRating=async()=>{
    if(!rForm.label){notify("Label required","error");return;}
    const payload={...rForm,section_id:selSecId};
    const {error}=await db.upsertCaeRating(payload,editRId);
    if(error)notify(error.message,"error");
    else{notify(editRId?"Rating updated ✓":"Rating added ✓");setRModal(false);
      db.getCaeRatings(selSecId).then(({data})=>setRatings(data||[]));
    }
  };
  const delRating=async(id)=>{
    const __ok=await confirm({title:"Delete Rating?",
        message:"Remove this rating option? Existing CAE results using this rating will be affected.",
        confirmLabel:"Delete",danger:true});
    if(!__ok)return;
    await db.deleteCaeRating(id);notify("Deleted","warn");
    db.getCaeRatings(selSecId).then(({data})=>setRatings(data||[]));
  };

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:10}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="grading" size={20}/>Grading & CAE Schema</h2>
          <p style={{color:C.muted,fontSize:12}}>Configure grades and character assessment per section</p>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <select value={selSecId??""} onChange={e=>setSelSecId(e.target.value?+e.target.value:null)}
            style={{padding:"7px 12px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:12,fontWeight:700,color:C.blue}}>
            <option value="">Global (all sections)</option>
            {sections.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:0,marginBottom:18,background:C.white,borderRadius:10,
        border:`1px solid ${C.border}`,overflow:"hidden",width:"fit-content"}}>
        {[{id:"grades",label:"Grade Bands"},{id:"cae",label:"CAE Traits"},{id:"score-structure",label:"Score Structure"}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"10px 22px",border:"none",cursor:"pointer",fontSize:13,fontWeight:700,
              background:tab===t.id?C.blue:"transparent",color:tab===t.id?"#fff":C.muted,
              borderRight:`1px solid ${C.border}`,transition:"all .15s"}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── GRADE BANDS ── */}
      {tab==="grades"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
            <div style={{fontSize:13,color:C.muted}}>
              {selSecId?"Showing grade bands for selected section":"Showing global grades (used when no section-level override exists)"}
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {selSecId&&sections.filter(s=>s.id!==selSecId).length>0&&(
                <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",
                  background:C.bluePale,borderRadius:8,border:`1px solid ${C.blue}22`}}>
                  <span style={{fontSize:11,fontWeight:700,color:C.blue}}>Copy from:</span>
                  <select onChange={async e=>{
                    const srcId = e.target.value;
                    if(!srcId) return;
                    const {data:srcGrades} = await db.getGradingSchema(srcId==="global"?null:+srcId,"grades");
                    const filtered = (srcGrades||[]).filter(g=>srcId==="global"?!g.section_id:g.section_id===+srcId);
                    if(!filtered.length){notify("No grade bands found in source","warn");e.target.value="";return;}
                    const __ok=await confirm({title:"Copy Grade Bands?",
        message:`Copy ${filtered.length} grade band(s) from ${sections.find(s=>s.id===+srcId)?.name||"global"} to this section? Existing bands in this section will not be deleted.`,
        confirmLabel:"Copy Bands"});
    if(!__ok){e.target.value="";return;}
                    let ok=0;
                    for(const g of filtered){
                      const {error}=await db.upsertGrade({min_score:g.min_score,max_score:g.max_score,grade:g.grade,remark:g.remark,section_id:selSecId,schema_type:"grades"});
                      if(!error) ok++;
                    }
                    notify(`Copied ${ok} grade band(s) ✓`);
                    db.getGradingSchema(selSecId,"grades").then(({data})=>setGrading(data||[]));
                    e.target.value="";
                  }}
                  style={{padding:"4px 8px",border:`1px solid ${C.blue}40`,borderRadius:6,fontSize:11,
                    color:C.blue,background:"#fff",cursor:"pointer"}}>
                    <option value="">Select source…</option>
                    <option value="global">Global grades</option>
                    {sections.filter(s=>s.id!==selSecId).map(s=>(
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <Btn onClick={()=>{setGForm({min_score:0,max_score:100,grade:"",remark:"",section_id:selSecId,schema_type:"grades"});setEditGId(null);setGModal(true);}} color={C.orange}>Add Grade Band</Btn>
            </div>
          </div>
          {gLoading?<Spinner/>:(
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
              {grading.map(g=>(
                <div key={g.id} style={{background:gradeCol(g.grade)+"0d",borderRadius:14,padding:"16px 18px",
                  border:`2px solid ${gradeCol(g.grade)}40`,position:"relative"}}>
                  {g.section_id&&<div style={{position:"absolute",top:8,right:8}}><Badge color={sections.find(s=>s.id===g.section_id)?.color||C.blue}>{sections.find(s=>s.id===g.section_id)?.code||"SEC"}</Badge></div>}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                    <div style={{fontSize:44,fontWeight:900,color:gradeCol(g.grade),lineHeight:1}}>{g.grade}</div>
                    <div style={{display:"flex",gap:4,marginTop:4}}>
                      <Btn xs onClick={()=>{setGForm(g);setEditGId(g.id);setGModal(true);}} color={C.blue} outline><Pencil size={13}/></Btn>
                      <Btn xs onClick={()=>delGrade(g.id)} color={C.red} outline><Trash2 size={13}/></Btn>
                    </div>
                  </div>
                  <div style={{fontSize:14,fontWeight:800,color:gradeCol(g.grade),marginBottom:3}}>{g.remark}</div>
                  <div style={{fontSize:12,color:C.muted}}>{g.min_score} – {g.max_score} marks</div>
                  <div style={{marginTop:8,height:5,borderRadius:3,
                    background:`linear-gradient(90deg,${gradeCol(g.grade)}80,${gradeCol(g.grade)})`}}/>
                </div>
              ))}
              {!grading.length&&<div style={{gridColumn:"1/-1",textAlign:"center",padding:40,color:C.light}}>No grade bands yet. Add one above.</div>}
            </div>
          )}
          {gModal&&(
            <Modal title={editGId?"Edit Grade Band":"New Grade Band"} onClose={()=>setGModal(false)}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <Inp label="Min Score" type="number" value={gForm.min_score} onChange={v=>gf({min_score:+v})}/>
                <Inp label="Max Score" type="number" value={gForm.max_score} onChange={v=>gf({max_score:+v})}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <Inp label="Grade Letter (e.g. A)" value={gForm.grade} onChange={v=>gf({grade:v})} placeholder="A"/>
                <Inp label="Remark" value={gForm.remark} onChange={v=>gf({remark:v})} placeholder="Excellent"/>
              </div>
              <Sel label="Apply to Section" value={gForm.section_id??""} onChange={v=>gf({section_id:v?+v:null})}
                options={[{value:"",label:"Global (all sections)"},...sections.map(s=>({value:s.id,label:s.name}))]}/>
              <div style={{display:"flex",gap:10,marginTop:6}}>
                <Btn onClick={saveGrade} color={C.orange} style={{flex:1}}>Save</Btn>
                <Btn onClick={()=>setGModal(false)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
              </div>
            </Modal>
          )}
        </div>
      )}

      {/* ── CAE SCHEMA ── */}
      {tab==="cae"&&(
        <div>
          {tLoading?<Spinner/>:(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              {/* Traits */}
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{fontWeight:800,color:C.blue,fontSize:14}}>Assessment Traits</div>
                  <Btn sm onClick={()=>{setTForm({category:"",description:"",sort_order:traits.length,section_id:selSecId});setEditTId(null);setTModal(true);}} color={C.orange}>➕ Trait</Btn>
                </div>
                {traits.map((t,i)=>(
                  <div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                    padding:"10px 14px",background:i%2===0?C.white:C.offWhite,
                    borderRadius:8,marginBottom:5,border:`1px solid ${C.border}`}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:13,color:C.text}}>{t.category}</div>
                      {t.description&&<div style={{fontSize:11,color:C.muted}}>{t.description}</div>}
                    </div>
                    <div style={{display:"flex",gap:4}}>
                      <Btn xs onClick={()=>{setTForm(t);setEditTId(t.id);setTModal(true);}} color={C.blue} outline><Pencil size={13}/></Btn>
                      <Btn xs onClick={()=>delTrait(t.id)} color={C.red} outline><Trash2 size={13}/></Btn>
                    </div>
                  </div>
                ))}
                {!traits.length&&<div style={{textAlign:"center",padding:30,color:C.light,fontSize:12}}>No traits yet</div>}
              </div>
              {/* Ratings */}
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{fontWeight:800,color:C.blue,fontSize:14}}>Rating Scale</div>
                  <Btn sm onClick={()=>{setRForm({label:"",symbol:"",sort_order:ratings.length,section_id:selSecId});setEditRId(null);setRModal(true);}} color={C.green}>➕ Rating</Btn>
                </div>
                {ratings.map((r,i)=>(
                  <div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                    padding:"10px 14px",background:i%2===0?C.white:C.offWhite,
                    borderRadius:8,marginBottom:5,border:`1px solid ${C.border}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:34,height:34,borderRadius:8,background:C.blue,
                        color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",
                        fontWeight:900,fontSize:14}}>{r.symbol||r.label[0]}</div>
                      <div style={{fontWeight:700,fontSize:13}}>{r.label}</div>
                    </div>
                    <div style={{display:"flex",gap:4}}>
                      <Btn xs onClick={()=>{setRForm(r);setEditRId(r.id);setRModal(true);}} color={C.blue} outline><Pencil size={13}/></Btn>
                      <Btn xs onClick={()=>delRating(r.id)} color={C.red} outline><Trash2 size={13}/></Btn>
                    </div>
                  </div>
                ))}
                {!ratings.length&&<div style={{textAlign:"center",padding:30,color:C.light,fontSize:12}}>No ratings yet</div>}
              </div>
            </div>
          )}
          {tModal&&(
            <Modal title={editTId?"Edit Trait":"New Assessment Trait"} onClose={()=>setTModal(false)}>
              <Inp label="Trait / Category *" value={tForm.category} onChange={v=>tf({category:v})} placeholder="e.g. Punctuality"/>
              <Inp label="Description" value={tForm.description||""} onChange={v=>tf({description:v})} placeholder="Brief description of this trait"/>
              <Inp label="Sort Order" type="number" value={tForm.sort_order} onChange={v=>tf({sort_order:+v})}/>
              <Sel label="Section" value={tForm.section_id??""} onChange={v=>tf({section_id:v?+v:null})}
                options={[{value:"",label:"Global"},...sections.map(s=>({value:s.id,label:s.name}))]}/>
              <div style={{display:"flex",gap:10,marginTop:6}}>
                <Btn onClick={saveTrait} color={C.orange} style={{flex:1}}>Save</Btn>
                <Btn onClick={()=>setTModal(false)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
              </div>
            </Modal>
          )}
          {rModal&&(
            <Modal title={editRId?"Edit Rating":"New Rating"} onClose={()=>setRModal(false)}>
              <Inp label="Rating Label *" value={rForm.label} onChange={v=>rf({label:v})} placeholder="e.g. Excellent"/>
              <Inp label="Symbol" value={rForm.symbol||""} onChange={v=>rf({symbol:v})} placeholder="e.g. A or 5"/>
              <Inp label="Sort Order" type="number" value={rForm.sort_order} onChange={v=>rf({sort_order:+v})}/>
              <Sel label="Section" value={rForm.section_id??""} onChange={v=>rf({section_id:v?+v:null})}
                options={[{value:"",label:"Global"},...sections.map(s=>({value:s.id,label:s.name}))]}/>
              <div style={{display:"flex",gap:10,marginTop:6}}>
                <Btn onClick={saveRating} color={C.green} style={{flex:1}}>Save</Btn>
                <Btn onClick={()=>setRModal(false)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
              </div>
            </Modal>
          )}
        </div>
      )}

      {/* ── SCORE STRUCTURE (embedded CaeStructurePage) ── */}
      {tab==="score-structure"&&(
        <CaeStructurePanel notify={notify} sections={sections}/>
      )}
    </div>
  );
}

// ─── CAE STRUCTURE PANEL (embedded inside GradingPage tab) ──────────────────
export function CaeStructurePanel({notify,sections}){
  const [selSecId,setSelSecId]   = useState(sections[0]?.id||null);
  const [structure,setStructure] = useState(null);
  const [components,setComponents] = useState([]);
  const [sName,setSName]         = useState("");
  const [sMax,setSMax]           = useState(100);
  const [loading,setLoading]     = useState(false);
  const [saving,setSaving]       = useState(false);
  const [dirty,setDirty]         = useState(false);

  useEffect(()=>{
    if(!selSecId) return;
    setLoading(true);
    db.getCaeStructureBySectionId(selSecId).then(({data:str})=>{
      if(str){
        setStructure(str); setSName(str.name); setSMax(str.maximum_score);
        db.getCaeComponents(str.id).then(({data:comps})=>{
          setComponents((comps||[]).map(c=>({...c,_uid:uid()})));
          setLoading(false); setDirty(false);
        });
      } else {
        setStructure(null); setSName(""); setSMax(100); setComponents([]);
        setLoading(false); setDirty(false);
      }
    });
  },[selSecId]);

  const evalFormula=(formula,nameValueMap)=>{
    const names=Object.keys(nameValueMap).sort((a,b)=>b.length-a.length);
    let expr=formula;
    names.forEach(name=>{
      const v=parseFloat(nameValueMap[name])||0;
      const esc=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      expr=expr.replace(new RegExp(esc,'gi'),String(v));
    });
    try{ if(!/^[\d\s+\-*/().]+$/.test(expr))return null;
      return Function('"use strict";return('+expr+')')(); }catch{return null;}
  };

  const previewValues=useMemo(()=>{
    const m={};
    components.filter(c=>!c.is_total_score&&c.mode==="literal").forEach(c=>{m[c.component_name]=parseFloat(c.value_or_formula)||0;});
    return m;
  },[components]);

  const previewTotal=useMemo(()=>{
    const tot=components.find(c=>c.is_total_score);
    if(tot) return evalFormula(tot.value_or_formula,previewValues);
    return Object.values(previewValues).reduce((a,b)=>a+b,0);
  },[components,previewValues]);

  const literalSum=useMemo(()=>Object.values(previewValues).reduce((a,b)=>a+b,0),[previewValues]);
  const totalOk   = previewTotal!==null&&Math.abs(previewTotal-sMax)<0.001;
  const totalOver = previewTotal!==null&&previewTotal>sMax;

  const validate=()=>{
    if(!sName.trim()){notify("Structure name required","error");return false;}
    const names=components.map(c=>c.component_name.trim().toUpperCase());
    if(names.some(n=>!n)){notify("All components need a name","error");return false;}
    if(new Set(names).size<names.length){notify("Component names must be unique","error");return false;}
    if(components.filter(c=>c.is_total_score).length>1){notify("Only one Total Score row allowed","error");return false;}
    for(const c of components.filter(c=>c.mode==="formula")){
      if(c.value_or_formula.toUpperCase().includes(c.component_name.toUpperCase())){
        notify(`"${c.component_name}" references itself`,"error");return false;
      }
    }
    return true;
  };

  const addComponent=()=>{setComponents(p=>[...p,{_uid:uid(),component_name:"",value_or_formula:"0",mode:"literal",is_total_score:false,display_order:p.length}]);setDirty(true);};
  const updateComp=(uId,field,val)=>{setComponents(p=>p.map(c=>c._uid===uId?{...c,[field]:val}:c));setDirty(true);};
  const deleteComp=(uId)=>{setComponents(p=>p.filter(c=>c._uid!==uId));setDirty(true);};
  const moveComp=(uId,dir)=>{
    setComponents(p=>{
      const idx=p.findIndex(c=>c._uid===uId); if(idx<0)return p;
      const next=[...p]; const swap=idx+dir;
      if(swap<0||swap>=next.length)return p;
      [next[idx],next[swap]]=[next[swap],next[idx]]; return next;
    }); setDirty(true);
  };
  const setTotalRow=(uId)=>{setComponents(p=>p.map(c=>({...c,is_total_score:c._uid===uId})));setDirty(true);};

  const save=async()=>{
    if(!validate()) return;
    setSaving(true);
    let strId=structure?.id;
    const strData={name:sName.trim(),section_id:selSecId,maximum_score:+sMax};
    if(strId){ await db.upsertCaeStructure(strData,strId); }
    else{ const {data}=await db.upsertCaeStructure(strData); strId=data?.id; }
    if(!strId){notify("Failed to save structure","error");setSaving(false);return;}
    const compsPayload=components.map(c=>({component_name:c.component_name.trim(),value_or_formula:c.value_or_formula.trim(),mode:c.mode,is_total_score:!!c.is_total_score}));
    await db.replaceCaeComponents(strId,compsPayload);
    const {data:reloaded}=await db.getCaeStructureBySectionId(selSecId);
    setStructure(reloaded);
    const {data:rc}=await db.getCaeComponents(strId);
    setComponents((rc||[]).map(c=>({...c,_uid:uid()})));
    setDirty(false); setSaving(false); notify("Score structure saved ✓");
  };

  const del=async()=>{
    if(!structure)return;
    const __ok=await confirm({title:"Delete Score Structure?",
        message:`Delete "${structure.name}"? The components will be removed. Saved result records will not be affected.`,
        confirmLabel:"Delete",danger:true});
    if(!__ok)return;
    await db.deleteCaeStructure(structure.id);
    setStructure(null);setSName("");setSMax(100);setComponents([]);setDirty(false);
    notify("Structure deleted","warn");
  };

  const selectedSec=sections.find(s=>s.id===selSecId);

  return(
    <div style={{display:"grid",gridTemplateColumns:"220px 1fr",gap:14,alignItems:"start"}}>
      {/* Section list */}
      <div>
        <Card style={{padding:"12px 10px"}}>
          <div style={{fontWeight:800,color:C.blue,fontSize:12,marginBottom:8}}>Sections</div>
          {sections.map(s=>{
            const act=s.id===selSecId;
            return(
              <button key={s.id} onClick={()=>setSelSecId(s.id)}
                style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"8px 10px",
                  borderRadius:8,border:`2px solid ${act?s.color||C.blue:"transparent"}`,
                  background:act?(s.color||C.blue)+"12":"transparent",cursor:"pointer",
                  marginBottom:4,textAlign:"left",transition:"all .13s"}}>
                <div style={{width:9,height:9,borderRadius:"50%",background:s.color||C.blue,flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:12,color:act?s.color||C.blue:C.text}}>{s.name}</div>
                  <div style={{fontSize:10,color:C.light}}>{s.code}</div>
                </div>
              </button>
            );
          })}
        </Card>
        {structure&&(
          <Card style={{marginTop:10,padding:"12px 14px"}}>
            <div style={{fontWeight:800,color:C.blue,fontSize:11,marginBottom:8}}>Preview</div>
            {components.filter(c=>!c.is_total_score&&c.mode==="literal").map(c=>(
              <div key={c._uid||c.id} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",borderBottom:`1px solid ${C.border}`,fontSize:11}}>
                <span style={{color:C.muted}}>{c.component_name||"—"}</span>
                <span style={{fontWeight:700,color:C.blue}}>{c.value_or_formula}</span>
              </div>
            ))}
            <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",fontSize:12,fontWeight:900,
              color:totalOver?C.red:totalOk?C.green:C.amber}}>
              <span>Total</span><span>{previewTotal!==null?previewTotal:"—"}/{sMax}</span>
            </div>
            <div style={{height:5,borderRadius:3,background:C.border,overflow:"hidden"}}>
              <div style={{height:"100%",borderRadius:3,background:totalOver?C.red:totalOk?C.green:C.amber,
                width:`${Math.min(100,(previewTotal||0)/sMax*100)}%`,transition:"width .3s"}}/>
            </div>
          </Card>
        )}
      </div>

      {/* Builder */}
      <div>
        {loading?<Spinner/>:(
          <>
            <Card style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14,flexWrap:"wrap",gap:8}}>
                <div>
                  <div style={{fontWeight:800,color:C.blue,fontSize:15}}>{selectedSec?.name||"Section"} Score Structure</div>
                  {dirty&&<span style={{fontSize:11,color:C.amber,fontWeight:700}}>● Unsaved changes</span>}
                </div>
                <div style={{display:"flex",gap:7}}>
                  {structure&&<Btn onClick={del} color={C.red} outline sm disabled={saving}><Trash2 size={13}/></Btn>}
                  <Btn onClick={save} color={C.orange} disabled={saving} sm>{saving?"Saving…":"Save"}</Btn>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 120px",gap:12}}>
                <Inp label="Structure Name *" value={sName} onChange={v=>{setSName(v);setDirty(true);}}
                  placeholder={`e.g. ${selectedSec?.code||"SECTION"} CAE`}/>
                <div>
                  <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>Max Score</label>
                  <input type="number" value={sMax} min="1" onChange={e=>{setSMax(+e.target.value);setDirty(true);}}
                    style={{display:"block",width:"100%",padding:"9px 12px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:13,outline:"none"}}
                    onFocus={e=>e.target.style.borderColor=C.orange} onBlur={e=>e.target.style.borderColor=C.border}/>
                </div>
              </div>
            </Card>

            <Card>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div>
                  <div style={{fontWeight:800,color:C.blue,fontSize:14}}>Components</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:2}}>Add rows — Σ button marks total row, formula mode calculates automatically</div>
                </div>
                <Btn onClick={addComponent} color={C.orange} sm>Add Row</Btn>
              </div>

              {components.length>0&&(
                <div style={{display:"grid",gridTemplateColumns:"38px 1fr 150px 120px 60px 36px",gap:7,
                  marginBottom:6,padding:"0 4px"}}>
                  {["Σ","Name","Score / Formula","Mode","Order",""].map((h,i)=>(
                    <div key={i} style={{fontSize:9,fontWeight:800,color:C.muted,textTransform:"uppercase",
                      letterSpacing:.5,textAlign:i===0||i>=4?"center":"left"}}>{h}</div>
                  ))}
                </div>
              )}

              {components.length===0?(
                <div style={{textAlign:"center",padding:"28px 16px",color:C.light,fontSize:13}}>
                  <div style={{marginBottom:6}}><Boxes size={28} color={C.muted}/></div>No components yet. Click <b>Add Row</b>.
                </div>
              ):components.map((c,i)=>{
                const isT=c.is_total_score;
                return(
                  <div key={c._uid||c.id} style={{display:"grid",
                    gridTemplateColumns:"38px 1fr 150px 120px 60px 36px",
                    gap:7,padding:"8px 4px",marginBottom:5,borderRadius:9,
                    background:isT?C.orangePale:i%2===0?C.white:C.offWhite,
                    border:`1px solid ${isT?C.orange+"40":C.border}`,alignItems:"center"}}>
                    <div style={{display:"flex",justifyContent:"center"}}>
                      <button onClick={()=>setTotalRow(c._uid)} title="Mark as Total"
                        style={{width:32,height:32,borderRadius:7,border:"none",cursor:"pointer",
                          background:isT?C.orange:C.border,color:isT?"#fff":C.muted,
                          fontSize:14,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center"}}>
                        {isT?"Σ":"○"}
                      </button>
                    </div>
                    <input value={c.component_name} onChange={e=>updateComp(c._uid,"component_name",e.target.value)}
                      placeholder="e.g. Mid Term Test"
                      style={{padding:"7px 9px",border:`2px solid ${C.border}`,borderRadius:7,fontSize:12,
                        fontWeight:isT?700:400,width:"100%",outline:"none"}}
                      onFocus={e=>e.target.style.borderColor=C.orange} onBlur={e=>e.target.style.borderColor=C.border}/>
                    <input value={c.value_or_formula} onChange={e=>updateComp(c._uid,"value_or_formula",e.target.value)}
                      placeholder={c.mode==="formula"?"A + B + C":"25"}
                      style={{padding:"7px 9px",border:`2px solid ${C.border}`,borderRadius:7,fontSize:12,
                        fontFamily:c.mode==="formula"?"monospace":"inherit",width:"100%",outline:"none"}}
                      onFocus={e=>e.target.style.borderColor=C.blue} onBlur={e=>e.target.style.borderColor=C.border}/>
                    <select value={c.mode} onChange={e=>updateComp(c._uid,"mode",e.target.value)}
                      style={{padding:"7px 9px",border:`2px solid ${C.border}`,borderRadius:7,fontSize:11,
                        fontWeight:700,background:c.mode==="formula"?C.bluePale:"#fff",
                        color:c.mode==="formula"?C.blue:C.text,cursor:"pointer",width:"100%"}}>
                      <option value="literal">Literal</option>
                      <option value="formula">Formula</option>
                    </select>
                    <div style={{display:"flex",flexDirection:"column",gap:1,alignItems:"center"}}>
                      <button onClick={()=>moveComp(c._uid,-1)} disabled={i===0}
                        style={{background:"none",border:"none",cursor:i===0?"not-allowed":"pointer",
                          fontSize:13,opacity:i===0?.3:1,lineHeight:1,padding:"1px 4px"}}>▲</button>
                      <button onClick={()=>moveComp(c._uid,1)} disabled={i===components.length-1}
                        style={{background:"none",border:"none",cursor:i===components.length-1?"not-allowed":"pointer",
                          fontSize:13,opacity:i===components.length-1?.3:1,lineHeight:1,padding:"1px 4px"}}>▼</button>
                    </div>
                    <button onClick={()=>deleteComp(c._uid)}
                      style={{width:30,height:30,borderRadius:6,border:`1px solid ${C.red}30`,
                        background:C.redPale,color:C.red,cursor:"pointer",
                        fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                  </div>
                );
              })}

              {components.length>0&&(
                <div style={{marginTop:10,padding:"10px 12px",borderRadius:8,
                  background:totalOk?C.greenPale:totalOver?C.redPale:C.orangePale,
                  border:`1px solid ${totalOk?C.green:totalOver?C.red:C.orange}30`,
                  display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <span style={{fontWeight:800,fontSize:12,color:totalOk?C.green:totalOver?C.red:C.amber}}>
                      {totalOk?"Valid":totalOver?"Exceeds max":"Unaccounted marks"}
                    </span>
                    <div style={{fontSize:10,color:C.muted,marginTop:1}}>
                      Literal: <b>{literalSum}</b> · Formula total: <b>{previewTotal!==null?previewTotal:"—"}</b> · Max: <b>{sMax}</b>
                    </div>
                  </div>
                  <div style={{fontSize:20,fontWeight:900,color:totalOk?C.green:totalOver?C.red:C.amber}}>
                    {previewTotal!==null?`${previewTotal}/${sMax}`:"—"}
                  </div>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

// ─── MANAGER DASHBOARD ────────────────────────────────────────────────────────
