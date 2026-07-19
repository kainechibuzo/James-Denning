/**
 * Students domain: StudentsPage, TeacherAddStudentsPage, StudentApprovalsPage,
 * BulkUploadBillingModal, AutoBillModal, BulkProgressModal,
 * OnboardingEmailModal, BulkReportEmailModal, checkStudentDuplicate
 */
import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Check, CheckCircle, Download, Edit, Filter, Info, Pencil, Phone,
  Save, School, Search, Send, Trash2, Upload,
} from "lucide-react";
import { db } from "../supabaseClient.js";
import { C } from "../config/theme.js";
import { useSection } from "../contexts/section.jsx";
import { useConfirm } from "../contexts/confirm.jsx";
import { useIsMobile } from "../utils/hooks.js";
import {
  Card, Btn, Badge, Inp, Sel, Modal, Th, TRow, ClassMultiSelect, Spinner, AppIcon, TableSkeleton, EmptyState,
} from "../components/ui.jsx";
import { buildEmailHtml, buildAlertEmail, sendPortalEmail, sendEmailBatchBackground } from "../services/email/index.js";
import { fullName, fmt } from "../utils/grades.js";
import { safe } from "../utils/platform.js";

export function BulkUploadBillingModal({students,onClose,notify}){
  const [templates,setTemplates]=useState([]);
  const [loading,setLoading]=useState(true);
  // {classId: templateId|"skip"}
  const [selections,setSelections]=useState({});
  const [progress,setProgress]=useState(null); // {current,total,failed,done}

  useEffect(()=>{
    db.getFeeTemplates().then(({data})=>{
      setTemplates(data||[]);
      setLoading(false);
    });
  },[]);

  // Group students by class
  const byClass=useMemo(()=>{
    const map={};
    students.forEach(s=>{
      if(!map[s.classId]) map[s.classId]={classId:s.classId,className:s.className,classLevel:s.classLevel,students:[]};
      map[s.classId].students.push(s);
    });
    return Object.values(map).sort((a,b)=>a.className.localeCompare(b.className));
  },[students]);

  const sel=(classId,tmplId)=>setSelections(p=>({...p,[classId]:tmplId}));

  const generate=async()=>{
    const toRun=byClass.filter(g=>selections[g.classId]&&selections[g.classId]!=="skip");
    if(!toRun.length){notify("Select at least one template to generate","error");return;}
    const allStudents=toRun.flatMap(g=>g.students.map(s=>({...s,templateId:selections[g.classId]})));
    const total=allStudents.length;
    setProgress({current:0,total,failed:0,done:false});
    let created=0,errors=0;
    const auditEntries=[];
    const BATCH=10;
    for(let i=0;i<allStudents.length;i+=BATCH){
      const batch=allStudents.slice(i,i+BATCH);
      const billResults=await Promise.all(batch.map(async s=>{
        try{
          const tmpl=templates.find(t=>String(t.id)===String(s.templateId));
          if(!tmpl) return{ok:false};
          const items=tmpl.fee_template_items||[];
          const totalAmt=items.reduce((a,b)=>a+(+b.amount||0),0);
          // Skip if already billed for this term/year
          const{data:existing}=await db.checkExistingBill(s.id,tmpl.academic_year,tmpl.term);
          if(existing) return{ok:false,skipped:true};
          const{data:bill,error:bErr}=await db.upsertFeeBill({
            student_id:s.id,template_id:tmpl.id,
            academic_year:tmpl.academic_year,term:tmpl.term,
            total_amount:totalAmt,amount_paid:0,status:"unpaid",
          });
          if(bErr||!bill) return{ok:false};
          return{ok:true,bill,student:s,tmpl,items,totalAmt};
        }catch(e){return{ok:false};}
      }));
      const batchItems=[];const batchBillIds=[];
      for(const r of billResults){
        if(!r.ok){if(!r.skipped)errors++;continue;}
        if(r.skipped)continue;
        batchBillIds.push(r.bill.id);
        batchItems.push(...r.items.map(item=>({
          bill_id:r.bill.id,fee_item_id:item.fee_item_id,
          name:item.fee_items?.name||"Fee",amount:+item.amount,
          is_optional:item.is_optional,is_included:true,
        })));
        auditEntries.push({bill_id:r.bill.id,student_id:r.student.id,
          action:"bill_generated",amount:r.totalAmt,
          details:{template:r.tmpl.name,term:r.tmpl.term,year:r.tmpl.academic_year,bulk_upload:true}});
        created++;
      }
      if(batchItems.length){
        const{error:iErr}=await db.insertFeeBillItems(batchItems);
        if(iErr){await db.deleteFeeBills(batchBillIds);created-=batchBillIds.length;errors+=batchBillIds.length;}
      }
      setProgress(p=>({...p,current:Math.min(i+BATCH,total),failed:errors}));
    }
    if(auditEntries.length) await db.logFeeActionBatch(auditEntries);
    setProgress(p=>({...p,current:total,done:true}));
    notify(`Done — ${created} bill(s) generated, ${errors} failed`);
  };

  if(progress) return(
    <BulkProgressModal
      title="Generating Bills for Uploaded Students"
      total={progress.total} current={progress.current}
      failed={progress.failed} isDone={progress.done}
      canClose={true} onClose={onClose}
    />
  );

  return(
    <Modal title="Generate Bills for Uploaded Students" onClose={onClose} width={560}>
      <div style={{fontSize:12,color:C.muted,marginBottom:14}}>
        {students.length} student{students.length!==1?"s":""} uploaded across {byClass.length} class{byClass.length!==1?"es":""}. Pick a fee template for each class or skip it.
      </div>
      {loading?<Spinner/>:(
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16,maxHeight:380,overflowY:"auto"}}>
          {byClass.map(g=>{
            const newCount=g.students.filter(s=>s.is_new_enrollee).length;
            const retCount=g.students.length-newCount;
            const classTemplates=templates.filter(t=>!t.class_level||(t.class_level||"").toLowerCase()===(g.classLevel||"").toLowerCase());
            return(
              <div key={g.classId} style={{padding:"12px 14px",border:`1px solid ${C.border}`,
                borderRadius:10,background:C.white}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div>
                    <span style={{fontWeight:700,fontSize:13,color:C.text}}>{g.className}</span>
                    <span style={{fontSize:11,color:C.muted,marginLeft:8}}>
                      {g.students.length} student{g.students.length!==1?"s":""}
                      {newCount>0&&<span style={{color:C.green,marginLeft:6}}>· {newCount} new intake</span>}
                      {retCount>0&&<span style={{color:C.muted,marginLeft:6}}>· {retCount} returning</span>}
                    </span>
                  </div>
                </div>
                <Sel label="" value={selections[g.classId]||""}
                  onChange={v=>sel(g.classId,v)}
                  options={[
                    {value:"",label:"— Select template —"},
                    {value:"skip",label:"Skip this class"},
                    ...classTemplates.map(t=>({
                      value:String(t.id),
                      label:`${t.name} (${t.template_type==="new_student"?"New Enrolee":"Returning"}) — ${fmt((t.fee_template_items||[]).reduce((a,b)=>a+(+b.amount||0),0))}`
                    }))
                  ]}
                />
              </div>
            );
          })}
        </div>
      )}
      <div style={{display:"flex",gap:10}}>
        <Btn color={C.orange} style={{flex:1}}
          disabled={loading||!byClass.some(g=>selections[g.classId]&&selections[g.classId]!=="skip")}
          onClick={generate}>
          Generate Bills
        </Btn>
        <Btn color={C.muted} outline style={{flex:1}} onClick={onClose}>Skip for Now</Btn>
      </div>
    </Modal>
  );
}

// ─── AUTO BILL MODAL ──────────────────────────────────────────────────────────
// Shown after new student registration — admin picks which template to apply
export function AutoBillModal({studentId,studentName,templates,onClose,onDone,notify}){
  const [isNewIntake,setIsNewIntake]=useState(null); // null=not asked yet, true/false=answered
  // Pre-select best matching template based on intake answer
  const defaultId=(intake)=>{
    if(intake===true){
      const ns=templates.find(t=>t.template_type==="new_student");
      return String((ns||templates[0])?.id||"");
    }
    const std=templates.find(t=>t.template_type==="standard");
    return String((std||templates[0])?.id||"");
  };
  const [selectedId,setSelectedId]=useState("");
  const [saving,setSaving]=useState(false);
  const selected=templates.find(t=>String(t.id)===selectedId);
  const total=(selected?.fee_template_items||[]).reduce((a,b)=>a+(+b.amount||0),0);

  const pickIntake=(val)=>{
    setIsNewIntake(val);
    setSelectedId(defaultId(val));
  };

  const generate=async()=>{
    if(!selected){notify("Select a template","error");return;}
    setSaving(true);
    const items=selected.fee_template_items||[];
    const{data:bill,error:bErr}=await db.upsertFeeBill({
      student_id:studentId,template_id:selected.id,
      academic_year:selected.academic_year,term:selected.term,
      total_amount:total,amount_paid:0,status:"unpaid",
    });
    if(bErr||!bill){notify("Bill generation failed: "+(bErr?.message||"no data"),"error");setSaving(false);return;}
    const{error:iErr}=await db.insertFeeBillItems(items.map(i=>({
      bill_id:bill.id,fee_item_id:i.fee_item_id,
      name:i.fee_items?.name||"Fee",amount:+i.amount,
      is_optional:i.is_optional,is_included:true,
    })));
    if(iErr){await db.deleteFeeBill(bill.id);notify("Bill items failed: "+iErr.message,"error");setSaving(false);return;}
    await Promise.all([
      // Persist the intake answer on the student record (registration-time only — never changed again)
      isNewIntake===false?db.upsertStudent({is_new_enrollee:false},studentId):Promise.resolve(),
      db.logFeeAction({bill_id:bill.id,student_id:studentId,action:"bill_generated",amount:total,
        details:{template:selected.name,term:selected.term,year:selected.academic_year,
          auto:true,new_intake:isNewIntake}}),
    ]);
    onDone(selected.name,total);
  };

  return(
    <Modal title={`Generate Bill — ${studentName}`} onClose={onClose} width={460}>
      {/* Step 1 — intake question */}
      <div style={{marginBottom:16,padding:"12px 14px",background:C.offWhite,
        borderRadius:10,border:`1px solid ${C.border}`}}>
        <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:10}}>
          Is <strong>{studentName}</strong> a new intake?
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>pickIntake(true)}
            style={{flex:1,padding:"9px 0",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:700,
              border:`2px solid ${isNewIntake===true?C.green:C.border}`,
              background:isNewIntake===true?C.greenPale:C.white,
              color:isNewIntake===true?C.green:C.muted,transition:"all .15s"}}>
            Yes — New Intake
          </button>
          <button onClick={()=>pickIntake(false)}
            style={{flex:1,padding:"9px 0",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:700,
              border:`2px solid ${isNewIntake===false?C.blue:C.border}`,
              background:isNewIntake===false?C.bluePale:C.white,
              color:isNewIntake===false?C.blue:C.muted,transition:"all .15s"}}>
            No — Returning Student
          </button>
        </div>
      </div>

      {/* Step 2 — template picker (shown only after intake is answered) */}
      {isNewIntake!==null&&(
      <>
      <div style={{fontSize:12,color:C.muted,marginBottom:8}}>
        Select the fee template to apply:
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
        {templates.map(t=>{
          const amt=(t.fee_template_items||[]).reduce((a,b)=>a+(+b.amount||0),0);
          const isNew=t.template_type==="new_student";
          const picked=String(t.id)===selectedId;
          return(
            <div key={t.id} onClick={()=>setSelectedId(String(t.id))}
              style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",
                borderRadius:10,cursor:"pointer",
                border:`2px solid ${picked?C.orange:C.border}`,
                background:picked?C.orange+"0d":C.white,
                transition:"border .15s,background .15s"}}>
              <div style={{width:18,height:18,borderRadius:"50%",border:`2px solid ${picked?C.orange:C.border}`,
                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {picked&&<div style={{width:8,height:8,borderRadius:"50%",background:C.orange}}/>}
              </div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:13,color:C.text}}>{t.name}</div>
                <div style={{fontSize:11,color:C.muted,marginTop:2}}>
                  {t.term} · {t.academic_year} · {(t.fee_template_items||[]).length} items
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                <Badge color={isNew?C.green:C.muted}>{isNew?"New Enrolee":"Returning"}</Badge>
                <strong style={{fontSize:13,color:C.green}}>{fmt(amt)}</strong>
              </div>
            </div>
          );
        })}
      </div>
      {selected&&(
        <div style={{background:C.offWhite,borderRadius:8,padding:"10px 12px",marginBottom:14,
          border:`1px solid ${C.border}`}}>
          <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",
            letterSpacing:.5,marginBottom:6}}>Line Items</div>
          {(selected.fee_template_items||[]).map(i=>(
            <div key={i.id} style={{display:"flex",justifyContent:"space-between",
              fontSize:12,padding:"3px 0",borderBottom:`1px solid ${C.border}`}}>
              <span style={{color:C.text}}>{i.fee_items?.name||i.name||"—"}</span>
              <strong style={{color:C.green}}>{fmt(i.amount)}</strong>
            </div>
          ))}
          <div style={{display:"flex",justifyContent:"space-between",paddingTop:6,
            fontSize:13,fontWeight:800}}>
            <span style={{color:C.blue}}>Total</span>
            <span style={{color:C.green}}>{fmt(total)}</span>
          </div>
        </div>
      )}
      <div style={{display:"flex",gap:10}}>
        <Btn color={C.orange} style={{flex:1}} onClick={generate} disabled={saving||!selected}>
          {saving?"Generating…":"Generate Bill"}
        </Btn>
        <Btn color={C.muted} outline style={{flex:1}} onClick={onClose}>Skip for Now</Btn>
      </div>
      </>
      )}
      {isNewIntake===null&&(
        <Btn color={C.muted} outline style={{width:"100%"}} onClick={onClose}>Skip for Now</Btn>
      )}
    </Modal>
  );
}

// ─── DUPLICATE STUDENT CHECK ──────────────────────────────────────────────────
// Returns "exact" (4/4 fields match), "possible" (3/4 fields match), or null
export function checkStudentDuplicate(candidate,existing){
  const m=(a,b)=>(a||"").trim().toLowerCase()===(b||"").trim().toLowerCase();
  const matches=[
    m(candidate.first_name,existing.first_name),
    m(candidate.middle_name||"",existing.middle_name||""),
    m(candidate.last_name,existing.last_name),
    !!(candidate.class_id&&existing.class_id&&String(candidate.class_id)===String(existing.class_id)),
  ];
  const count=matches.filter(Boolean).length;
  return count>=4?"exact":count>=3?"possible":null;
}

// ─── BULK PROGRESS MODAL ─────────────────────────────────────────────────────
// Generic display for any bulk operation (delete, upload, etc.)
export function BulkProgressModal({title,total,current,currentLabel,failed,isDone,onClose,canClose}){
  const pct=total>0?Math.round((current+failed)/total*100):0;
  const remaining=Math.max(0,total-current-failed);
  return(
    <Modal title={title} onClose={isDone&&canClose?onClose:null} width={480}>
      <div style={{height:12,background:C.offWhite,borderRadius:6,overflow:"hidden",marginBottom:14,border:`1px solid ${C.border}`}}>
        <div style={{height:"100%",width:`${pct}%`,background:isDone?C.green:C.blue,borderRadius:6,transition:"width .3s ease"}}/>
      </div>
      <div style={{display:"flex",gap:16,justifyContent:"center",marginBottom:12,fontSize:13}}>
        <span><strong style={{color:C.green}}>{current}</strong> done</span>
        <span><strong style={{color:C.red}}>{failed}</strong> failed</span>
        <span>⏳ <strong style={{color:C.muted}}>{remaining}</strong> remaining</span>
      </div>
      {!isDone&&currentLabel&&(
        <div style={{fontSize:12,color:C.muted,textAlign:"center",marginBottom:14}}>{currentLabel}</div>
      )}
      {isDone&&(
        <>
          <div style={{background:C.greenPale,border:`1px solid ${C.green}40`,borderRadius:10,padding:"14px 18px",textAlign:"center",marginBottom:12}}>
            <div style={{marginBottom:6}}><CheckCircle size={22} color={C.green}/></div>
            <div style={{fontWeight:800,color:C.green,fontSize:15,marginBottom:4}}>Complete!</div>
            <div style={{fontSize:13,color:C.text}}>{current} succeeded{failed>0?`, ${failed} failed`:""}.</div>
          </div>
          {failed>0&&(
            <div style={{background:C.amberPale,border:`1px solid ${C.amber}44`,borderRadius:8,padding:"9px 13px",marginBottom:12,fontSize:12,color:C.amber}}>
              {failed} item{failed!==1?"s":""} failed.
            </div>
          )}
          <Btn onClick={onClose} color={C.blue} style={{width:"100%",justifyContent:"center"}}>Close</Btn>
        </>
      )}
    </Modal>
  );
}

// ─── ONBOARDING EMAIL MODAL ───────────────────────────────────────────────────
// Uses background queue — sending continues even if user closes the modal.
export function OnboardingEmailModal({entries,onClose,type="student",schoolId=""}){
  const isMobile=useIsMobile();
  const [rate,setRate]=useState(10);
  const [phase,setPhase]=useState("confirm"); // confirm | queuing | running | done
  const [confirmText,setConfirmText]=useState("");
  const [batchId,setBatchId]=useState(null);
  const [prog,setProg]=useState({sent:0,failed:0,pending:0,total:0,failedRecipients:[],done:false});
  const pollerRef=useRef(null);
  const withEmail=entries.filter(r=>r.to);
  const total=withEmail.length;

  const start=async()=>{
    setPhase("queuing");
    const{batchId:bid,error}=await sendEmailBatchBackground(withEmail,schoolId,rate);
    if(error){setPhase("confirm");return;}
    setBatchId(bid);
    setPhase("running");
    pollerRef.current=setInterval(async()=>{
      const{data}=await db.getEmailQueueStatus(bid);
      if(!data)return;
      setProg(data);
      if(data.done){
        clearInterval(pollerRef.current);
        setPhase("done");
        db.logEmail({subject:`Onboarding Emails — ${type}`,body:"",recipient_count:data.total,
          delivered_count:data.sent,failed_count:data.failed,failed_recipients:data.failedRecipients,
          status:data.failed===0?"sent":data.sent===0?"failed":"partial",
          metadata:JSON.stringify({batch_id:bid,type})});
      }
    },4000);
  };
  useEffect(()=>()=>{if(pollerRef.current)clearInterval(pollerRef.current);},[]);

  const pct=prog.total>0?Math.round((prog.sent+prog.failed)/prog.total*100):0;

  return(
    <Modal title={phase==="done"?"Sending Complete":phase==="running"||phase==="queuing"?"Sending in Background…":"Send Onboarding Emails"} onClose={phase==="confirm"||phase==="done"?onClose:null} width={500}>
      {phase==="confirm"&&(
        <>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:isMobile?6:10,marginBottom:16}}>
            {[{n:entries.length,label:"Just Registered",bg:C.greenPale,col:C.green},
              {n:total,label:"Have Email",bg:C.bluePale,col:C.blue},
              {n:entries.length-total,label:"Will Be Skipped",bg:C.offWhite,col:C.muted}].map(x=>(
              <div key={x.label} style={{textAlign:"center",background:x.bg,borderRadius:10,padding:isMobile?"10px 4px":"12px 8px",minWidth:0}}>
                <div style={{fontSize:isMobile?18:22,fontWeight:900,color:x.col}}>{x.n}</div>
                <div style={{fontSize:isMobile?10:11,color:C.muted,lineHeight:1.2}}>{x.label}</div>
              </div>
            ))}
          </div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>Sending Speed</div>
            {[{r:10,label:"Safe — 10/min",desc:"Recommended — avoids spam filters"},{r:20,label:"Fast — 20/min",desc:"Faster, may trigger spam filters"}].map(o=>(
              <label key={o.r} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",
                border:`2px solid ${rate===o.r?C.blue:C.border}`,borderRadius:8,cursor:"pointer",marginBottom:8,background:rate===o.r?C.bluePale:"#fff"}}>
                <input type="radio" checked={rate===o.r} onChange={()=>setRate(o.r)} style={{accentColor:C.blue}}/>
                <div>
                  <div style={{fontWeight:700,fontSize:13}}>{o.label}</div>
                  <div style={{fontSize:11,color:C.muted}}>{o.desc} — Est. {Math.ceil(total/o.r)} min{Math.ceil(total/o.r)!==1?"s":""}</div>
                </div>
              </label>
            ))}
          </div>
          <div style={{background:C.greenPale,border:`1px solid ${C.green}44`,borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:12,color:C.green}}>
            Sending happens server-side — <strong>you can close this dialog and navigate away.</strong> Sending will continue in the background.
          </div>
          <div style={{marginBottom:16}}>
            <label style={{display:"block",fontSize:12,fontWeight:700,color:C.text,marginBottom:6}}>
              Type <strong style={{fontFamily:"monospace",color:C.blue}}>SEND</strong> to confirm:
            </label>
            <input value={confirmText} onChange={e=>setConfirmText(e.target.value.toUpperCase())} placeholder="SEND"
              style={{width:"100%",padding:"9px 12px",border:`2px solid ${confirmText==="SEND"?C.green:C.border}`,
                borderRadius:8,fontSize:15,fontWeight:700,letterSpacing:3,outline:"none",fontFamily:"monospace"}}/>
          </div>
          <div style={{display:"flex",flexDirection:isMobile?"column-reverse":"row",gap:10}}>
            <Btn onClick={start} color={C.blue} disabled={confirmText!=="SEND"||total===0} style={{flex:1,justifyContent:"center"}}>
              Queue {total} Email{total!==1?"s":""}
            </Btn>
            <Btn onClick={onClose} color={C.muted} outline style={{flex:1,justifyContent:"center"}}>Cancel</Btn>
          </div>
        </>
      )}
      {phase==="queuing"&&<div style={{textAlign:"center",padding:"32px 0"}}><Spinner/><p style={{marginTop:12,color:C.muted,fontSize:13}}>Queuing emails…</p></div>}
      {phase==="running"&&(
        <>
          <div style={{background:C.greenPale,border:`1px solid ${C.green}40`,borderRadius:8,padding:"8px 14px",marginBottom:14,fontSize:12,color:C.green}}>
            Sending in background — safe to close this modal
          </div>
          <div style={{height:12,background:C.offWhite,borderRadius:6,overflow:"hidden",marginBottom:14,border:`1px solid ${C.border}`}}>
            <div style={{height:"100%",width:`${pct}%`,background:C.blue,borderRadius:6,transition:"width .6s ease"}}/>
          </div>
          <div style={{display:"flex",gap:isMobile?8:16,justifyContent:"center",flexWrap:"wrap",marginBottom:8,fontSize:isMobile?12:13}}>
            <span><strong style={{color:C.green}}>{prog.sent}</strong> sent</span>
            <span><strong style={{color:C.red}}>{prog.failed}</strong> failed</span>
            <span>⏳ <strong style={{color:C.muted}}>{prog.pending}</strong> remaining</span>
          </div>
          <div style={{fontSize:11,color:C.light,textAlign:"center",marginBottom:14}}>
            {prog.total>0?`${prog.sent+prog.failed} / ${prog.total} processed`:""}{" "}
            {prog.pending>0&&rate>0?`— ~${Math.ceil(prog.pending/rate)} min remaining`:""}
          </div>
          <Btn onClick={onClose} color={C.muted} outline style={{width:"100%",justifyContent:"center"}}>
            {isMobile?"Close":"Close (sending continues in background)"}
          </Btn>
        </>
      )}
      {phase==="done"&&(
        <>
          <div style={{background:C.greenPale,border:`1px solid ${C.green}40`,borderRadius:10,padding:"14px 18px",textAlign:"center",marginBottom:12}}>
            <div style={{marginBottom:6}}><CheckCircle size={22} color={C.green}/></div>
            <div style={{fontWeight:800,color:C.green,fontSize:15,marginBottom:4}}>Complete!</div>
            <div style={{fontSize:13,color:C.text}}>{prog.sent} email{prog.sent!==1?"s":""} sent{prog.failed>0?`, ${prog.failed} failed`:""}.</div>
          </div>
          {prog.failed>0&&(
            <div style={{background:C.amberPale,border:`1px solid ${C.amber}44`,borderRadius:8,padding:"9px 13px",marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:12,color:C.amber,marginBottom:6}}>{prog.failed} failed recipients:</div>
              <div style={{maxHeight:100,overflowY:"auto"}}>
                {(prog.failedRecipients||[]).map((r,i)=>(
                  <div key={i} style={{fontSize:11,color:C.amber,marginBottom:2}}>• {r.email}</div>
                ))}
              </div>
            </div>
          )}
          <Btn onClick={onClose} color={C.blue} style={{width:"100%",justifyContent:"center"}}>Close</Btn>
        </>
      )}
    </Modal>
  );
}

// EmailProgressModal -> src/pages/comms.jsx

// ─── BULK REPORT CARD EMAIL MODAL ─────────────────────────────────────────────
export function BulkReportEmailModal({students,classes=[],loadStudentData,buildEmailPayload,onClose,notifyEmail=null}){
  const [rate,setRate]=useState(10);
  // phases: idle → preparing (PDF gen) → queueing (inserting to DB) → queued (server sending) → done
  const [phase,setPhase]=useState("idle");
  const [prep,setPrep]=useState({done:0,total:0,failed:0,current:""}); // PDF prep progress
  const [queueErr,setQueueErr]=useState("");
  const [batchId,setBatchId]=useState(null);
  const [poll,setPoll]=useState({sent:0,failed:0,pending:0,total:0}); // server-side progress
  const pollRef=useRef(null);

  // Class selection — all ticked by default
  const classIds=[...new Set(students.map(s=>s.class_id).filter(Boolean))];
  const classMap={};classes.forEach(c=>{classMap[c.id]=c;});
  const [checkedClasses,setCheckedClasses]=useState(()=>new Set(classIds));
  const toggleClass=(id)=>setCheckedClasses(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  const toggleAll=(on)=>setCheckedClasses(on?new Set(classIds):new Set());

  const eligible=students.filter(s=>checkedClasses.has(s.class_id));
  const withEmail=eligible.filter(s=>s.email);
  const noEmail=eligible.length-withEmail.length;

  // Stop polling when unmounted or done
  useEffect(()=>()=>{if(pollRef.current)clearInterval(pollRef.current);},[]);

  const startPoll=(bid,total)=>{
    if(pollRef.current)clearInterval(pollRef.current);
    pollRef.current=setInterval(async()=>{
      const{data,error}=await db.getEmailBatchProgress(bid);
      if(error)return;
      setPoll({...data,total});
      if(data.pending===0){
        clearInterval(pollRef.current);
        pollRef.current=null;
        setPhase("done");
      }
    },5000);
  };

  const start=async()=>{
    const total=withEmail.length;
    setPrep({done:0,total,failed:0,current:""});
    setPhase("preparing");
    const bid=crypto.randomUUID();
    setBatchId(bid);
    const payloads=[];
    let prepFailed=0;
    for(let i=0;i<withEmail.length;i++){
      const stu=withEmail[i];
      const label=fullName(stu)||String(stu.id);
      setPrep(p=>({...p,current:label}));
      try{
        const stuData=await loadStudentData(stu);
        const payload=await buildEmailPayload(stu,stuData);
        payloads.push(payload);
      }catch(e){
        console.error("[BulkReportEmail prep]",stu.id,e);
        prepFailed++;
      }
      setPrep(p=>({...p,done:i+1,failed:prepFailed}));
    }
    if(!payloads.length){
      setQueueErr("All PDF generations failed — nothing to send.");
      setPhase("idle");
      return;
    }
    // Queue payloads into email_queue in chunks, then hand off to server
    setPhase("queueing");
    setQueueErr("");
    const{error}=await db.queueEmailBatch(bid,payloads,db._schoolId);
    if(error){
      console.error("[BulkReportEmail queue]",error);
      setQueueErr(`Failed to queue emails: ${error.message||"database error"}. Please try again.`);
      setPhase("idle");
      return;
    }
    // Trigger edge function — it uses waitUntil so it keeps running after response
    try{
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email-batch`,{
        method:"POST",
        headers:{"Content-Type":"application/json","Authorization":`Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`},
        body:JSON.stringify({
          batch_id:bid,
          rate_per_min:rate,
          // Send completion email to admin when batch > 20
          ...(notifyEmail&&payloads.length>20?{notify_email:notifyEmail,total_count:payloads.length}:{}),
        }),
      });
    }catch(e){console.warn("[BulkReportEmail trigger]",e);}
    // Transition to "queued" phase and start polling
    setPoll({sent:0,failed:0,pending:payloads.length,total:payloads.length});
    setPhase("queued");
    startPoll(bid,payloads.length);
  };

  const prepPct=prep.total>0?Math.round((prep.done/prep.total)*100):0;
  const pollPct=poll.total>0?Math.round(((poll.sent+poll.failed)/poll.total)*100):0;

  return(
    <Modal title="Email Report Cards — Bulk Send" onClose={phase==="idle"||phase==="queued"||phase==="done"?onClose:null} width={520}>
      {phase==="idle"&&(
        <>
          {/* Class selection checkboxes */}
          {classIds.length>1&&(
            <div style={{marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5}}>Classes to include</div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>toggleAll(true)} style={{fontSize:11,fontWeight:700,color:C.blue,background:"none",border:"none",cursor:"pointer",padding:"2px 6px"}}>All</button>
                  <button onClick={()=>toggleAll(false)} style={{fontSize:11,fontWeight:700,color:C.muted,background:"none",border:"none",cursor:"pointer",padding:"2px 6px"}}>None</button>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:180,overflowY:"auto",
                border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px"}}>
                {classIds.map(id=>{
                  const cls=classMap[id];
                  const clsStudents=students.filter(s=>s.class_id===id);
                  const clsWithEmail=clsStudents.filter(s=>s.email).length;
                  const checked=checkedClasses.has(id);
                  return(
                    <label key={id} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",
                      padding:"6px 8px",borderRadius:6,background:checked?C.bluePale:"transparent",
                      border:`1px solid ${checked?C.blue+"44":"transparent"}`,transition:"all .12s"}}>
                      <input type="checkbox" checked={checked} onChange={()=>toggleClass(id)}
                        style={{accentColor:C.blue,width:14,height:14,cursor:"pointer"}}/>
                      <div style={{flex:1}}>
                        <span style={{fontWeight:700,fontSize:13,color:checked?C.blue:C.text}}>{cls?.name||`Class ${id}`}</span>
                        <span style={{fontSize:11,color:C.muted,marginLeft:8}}>{clsStudents.length} student{clsStudents.length!==1?"s":""}{clsWithEmail<clsStudents.length?` · ${clsStudents.length-clsWithEmail} no email`:""}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          <div style={{marginBottom:16,padding:"12px 16px",background:C.bluePale,borderRadius:10,fontSize:13,color:C.blue}}>
            <strong>{withEmail.length}</strong> student{withEmail.length!==1?"s":""} with email addresses will receive their report card.
            {noEmail>0&&<div style={{marginTop:4,color:C.amber}}>{noEmail} student{noEmail!==1?"s":""} skipped — no email on file.</div>}
            {checkedClasses.size===0&&<div style={{marginTop:4,color:C.red,fontWeight:700}}>No classes selected — nothing to send.</div>}
          </div>
          {queueErr&&(
            <div style={{marginBottom:14,padding:"10px 14px",background:C.redPale,border:`1px solid ${C.red}44`,
              borderRadius:8,fontSize:12,color:C.red,fontWeight:600}}>{queueErr}</div>
          )}
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>Sending Speed</div>
            {[{rate:10,label:"Safe — 10/min",desc:"Recommended — avoids spam filters"},{rate:20,label:"Fast — 20/min",desc:""}].map(o=>(
              <label key={o.rate} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",border:`2px solid ${rate===o.rate?C.blue:C.border}`,
                borderRadius:8,cursor:"pointer",marginBottom:8,background:rate===o.rate?C.bluePale:"#fff"}}>
                <input type="radio" checked={rate===o.rate} onChange={()=>setRate(o.rate)} style={{accentColor:C.blue}}/>
                <div>
                  <div style={{fontWeight:700,fontSize:13,color:C.text}}>{o.label}</div>
                  <div style={{fontSize:11,color:C.muted}}>Est. {Math.ceil(withEmail.length/o.rate)} min{Math.ceil(withEmail.length/o.rate)!==1?"s":""} server-side</div>
                </div>
              </label>
            ))}
          </div>
          {/* Key info: two phases explained */}
          <div style={{background:C.bluePale,border:`1px solid ${C.blue}33`,borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:12,color:C.blue}}>
            <div style={{fontWeight:700,marginBottom:4}}>How it works</div>
            <div style={{display:"flex",flexDirection:"column",gap:3}}>
              <div>① <strong>PDF generation</strong> — happens in your browser. Keep this page open.</div>
              <div>② <strong>Email sending</strong> — handed off to the server. <strong>You can close your PC.</strong></div>
            </div>
          </div>
          <div style={{display:"flex",gap:10}}>
            <Btn onClick={start} color={C.blue} style={{flex:1}} disabled={withEmail.length===0}>Start</Btn>
            <Btn onClick={onClose} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
          </div>
        </>
      )}

      {phase==="preparing"&&(
        <>
          <div style={{marginBottom:8,fontSize:13,fontWeight:700,color:C.blue}}>
            Step 1 of 2 — Generating PDFs ({prep.done}/{prep.total})
          </div>
          <div style={{height:10,background:C.offWhite,borderRadius:6,overflow:"hidden",marginBottom:10,border:`1px solid ${C.border}`}}>
            <div style={{height:"100%",width:`${prepPct}%`,background:C.blue,borderRadius:6,transition:"width .3s ease"}}/>
          </div>
          {prep.current&&(
            <div style={{fontSize:12,color:C.muted,marginBottom:8,textAlign:"center"}}>
              Processing <strong>{prep.current}</strong>…
            </div>
          )}
          <div style={{background:C.amberPale,border:`1px solid ${C.amber}44`,borderRadius:8,padding:"9px 13px",fontSize:12,color:C.amber}}>
            <strong>Keep this page open</strong> while PDFs are being generated. You can close it once Step 2 begins.
          </div>
        </>
      )}

      {phase==="queueing"&&(
        <div style={{textAlign:"center",padding:"32px 16px"}}>
          <Spinner/>
          <div style={{fontWeight:700,color:C.blue,fontSize:14,marginTop:16}}>Saving to queue…</div>
          <div style={{fontSize:12,color:C.muted,marginTop:6}}>
            Storing {prep.done} email{prep.done!==1?"s":""} in the server queue. Almost done.
          </div>
        </div>
      )}

      {(phase==="queued"||phase==="done")&&(
        <>
          {/* Safe to close banner */}
          {phase==="queued"&&(
            <div style={{background:C.greenPale,border:`1px solid ${C.green}44`,borderRadius:10,padding:"12px 16px",
              marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
              <CheckCircle size={20} color={C.green}/>
              <div>
                <div style={{fontWeight:800,color:C.green,fontSize:13}}>Safe to close — server is sending</div>
                <div style={{fontSize:12,color:C.text,marginTop:2}}>PDFs are queued. Emails are being sent by Supabase servers. You can shut down your PC.</div>
              </div>
            </div>
          )}
          {phase==="done"&&(
            <div style={{background:C.greenPale,border:`1px solid ${C.green}40`,borderRadius:10,padding:"14px 18px",
              textAlign:"center",marginBottom:14}}>
              <div style={{marginBottom:6}}><CheckCircle size={22} color={C.green}/></div>
              <div style={{fontWeight:800,color:C.green,fontSize:15,marginBottom:4}}>All done!</div>
              <div style={{fontSize:13,color:C.text}}>
                {poll.sent} email{poll.sent!==1?"s":""} sent successfully{poll.failed>0?`, ${poll.failed} failed`:""}.
              </div>
            </div>
          )}
          {/* Progress bar */}
          <div style={{marginBottom:6,fontSize:12,fontWeight:700,color:C.muted}}>
            Step 2 of 2 — Sending emails {phase==="queued"?"(server)":""}
          </div>
          <div style={{height:10,background:C.offWhite,borderRadius:6,overflow:"hidden",marginBottom:10,border:`1px solid ${C.border}`}}>
            <div style={{height:"100%",width:`${pollPct}%`,background:phase==="done"?C.green:C.blue,borderRadius:6,transition:"width .5s ease"}}/>
          </div>
          <div style={{display:"flex",gap:16,justifyContent:"center",marginBottom:14,fontSize:13}}>
            <span><strong style={{color:C.green}}>{poll.sent}</strong> sent</span>
            <span><strong style={{color:C.red}}>{poll.failed}</strong> failed</span>
            <span style={{color:C.muted}}>{poll.pending} remaining</span>
          </div>
          {phase==="queued"&&(
            <div style={{fontSize:11,color:C.muted,textAlign:"center",marginBottom:14}}>
              Progress updates every 5 seconds. This page is optional — sending will complete regardless.
            </div>
          )}
          {poll.failed>0&&phase==="done"&&(
            <div style={{background:C.amberPale,border:`1px solid ${C.amber}44`,borderRadius:8,padding:"9px 13px",marginBottom:12,fontSize:12,color:C.amber}}>
              {poll.failed} email{poll.failed!==1?"s":""} failed. Check the email logs for details.
            </div>
          )}
          <Btn onClick={onClose} color={C.blue} style={{width:"100%",justifyContent:"center"}}>
            {phase==="queued"?"Close (sending continues in background)":"Close"}
          </Btn>
        </>
      )}
    </Modal>
  );
}

// ─── STUDENTS PAGE ────────────────────────────────────────────────────────────
export function StudentsPage({ctx}){
  const {notify,selectedSection,bumpRefresh,pageParam,setPageParam}=ctx;
  const {schoolName:_stuPageSchoolName}=useSection();
  const _spSN=_stuPageSchoolName||"School Portal";
  const [students,setStudents]=useState([]);
  const [classes,setClasses]=useState([]);   // ALL classes (unfiltered) — needed for form dropdowns + section filter
  const [sections,setSections]=useState([]); // all active sections
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState("");
  const [sortBy,setSortBy]=useState("name_asc");
  const [selSection,setSelSection]=useState("");
  const [selClasses,setSelClasses]=useState(new Set());
  const [noEmailOnly,setNoEmailOnly]=useState(false);
  const [page,setPage]=useState(0);

  // Consume a filter passed in from another page (e.g. dashboard "Fix →" on the
  // "no email address" health check) — apply it once, then clear so it doesn't stick
  // on a later unrelated visit to this page.
  useEffect(()=>{
    if(pageParam?.filter==="no_email"){
      setNoEmailOnly(true);
      setPageParam(null);
    }
  },[pageParam]); // eslint-disable-line
  const [modal,setModal]=useState(false);
  const [bulkModal,setBulkModal]=useState(false);
  const [editId,setEditId]=useState(null);
  const blank={first_name:"",middle_name:"",last_name:"",email:"",gender:"Male",dob:"",age:"",useDob:true,class_id:"",admission_year:""};
  const [form,setForm]=useState(blank);
  const f=v=>setForm(p=>({...p,...v}));
  const [bulkFile,setBulkFile]=useState(null);
  const [bulkParsed,setBulkParsed]=useState([]);
  const [bulkSaving,setBulkSaving]=useState(false);
  const [bulkErrors,setBulkErrors]=useState([]);
  const [dupWarning,setDupWarning]=useState(null);         // {type,match,onConfirm}
  const [bulkDupInfo,setBulkDupInfo]=useState([]);          // [{row,dupType,match}]
  const [bulkFilter,setBulkFilter]=useState("all");         // "all"|"new"|"duplicates"
  const [bulkAction,setBulkAction]=useState("new_only");    // "all"|"new_only"|"review"
  const [bulkReviewQueue,setBulkReviewQueue]=useState([]);  // duplicates awaiting review
  const [lastRegistered,setLastRegistered]=useState(null);  // {count,entries:[{to,subject,html}]}
  const [showOnboarding,setShowOnboarding]=useState(false);
  const [selectedIds,setSelectedIds]=useState(new Set());   // multi-select for bulk delete
  const [bulkDelProg,setBulkDelProg]=useState({current:0,failed:0,total:0,currentLabel:"",isDone:false});
  const [showBulkDel,setShowBulkDel]=useState(false);

  const load=()=>{
    setLoading(true);
    // Always load ALL classes (null = no section filter) so the section dropdown always works
    Promise.all([db.getStudents(),db.getClasses(null),db.getSections(false)]).then(([s,c,sec])=>{
      let stus=s.data||[];
      // If the school-level section selector is active, scope the student list only
      if(selectedSection) stus=stus.filter(st=>st.classes?.section_id===selectedSection.id||String(st.classes?.section_id)===String(selectedSection.id));
      setStudents(stus);
      setClasses(c.data||[]);
      setSections((sec.data||[]).sort((a,b)=>a.name.localeCompare(b.name)));
      setLoading(false);
    });
  };
  useEffect(load,[selectedSection]);

  // Helpers defined BEFORE useMemo so they are in scope when the memo callback runs
  const getClass=id=>classes.find(c=>String(c.id)===String(id));
  const stuFullName=fullName; // alias to module-level fullName which honours name_order/name_case

  // Classes that belong to the currently-selected section (for the cascading class dropdown)
  const classesBySection=useMemo(()=>
    selSection ? classes.filter(c=>String(c.section_id)===selSection) : classes
  ,[classes,selSection]);

  // Reset page & class selections when section changes; reset page on other filter changes
  useEffect(()=>{setSelClasses(new Set());setPage(0);},[selSection]);
  useEffect(()=>{setPage(0);},[search,selClasses,sortBy,noEmailOnly]);

  const pageSize=parseInt(localStorage.getItem('rgs_rows_per_page')||'50',10);

  const filtered=useMemo(()=>{
    const q=search.toLowerCase();
    let list=students.filter(s=>{
      const full=fullName(s).toLowerCase();
      if(!full.includes(q)&&!s.name?.toLowerCase().includes(q)&&!String(s.id||"").toLowerCase().includes(q))return false;
      // Multi-class filter — if any classes selected, student must be in one of them
      if(selClasses.size>0&&!selClasses.has(String(s.class_id)))return false;
      // Section filter (only when no specific classes chosen)
      if(selSection&&selClasses.size===0){
        const stuSectionId=String(s.classes?.section_id??s.class_id?classes.find(c=>String(c.id)===String(s.class_id))?.section_id:"");
        if(stuSectionId!==selSection)return false;
      }
      if(noEmailOnly&&(s.email||(s.status||"active")!=="active"))return false;
      return true;
    });
    list=[...list].sort((a,b)=>{
      const fa=stuFullName(a).toLowerCase(), fb=stuFullName(b).toLowerCase();
      const ca=classes.find(c=>c.id===a.class_id)?.name||"";
      const cb=classes.find(c=>c.id===b.class_id)?.name||"";
      const ia=a.id||"", ib=b.id||"";
      const ya=+(a.admission_year||0), yb=+(b.admission_year||0);
      if(sortBy==="name_asc")  return fa<fb?-1:fa>fb?1:0;
      if(sortBy==="name_desc") return fa>fb?-1:fa<fb?1:0;
      if(sortBy==="id_asc")    return ia<ib?-1:ia>ib?1:0;
      if(sortBy==="id_desc")   return ia>ib?-1:ia<ib?1:0;
      if(sortBy==="class_asc") return ca<cb?-1:ca>cb?1:0;
      if(sortBy==="class_desc")return ca>cb?-1:ca<cb?1:0;
      if(sortBy==="year_asc")  return ya-yb;
      if(sortBy==="year_desc") return yb-ya;
      if(sortBy==="gender")    return (a.gender||"").localeCompare(b.gender||"");
      return 0;
    });
    return list;
  },[students,search,sortBy,classes,selSection,selClasses,noEmailOnly]);

  const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));
  const safePage=Math.min(page,Math.max(0,totalPages-1));
  const paged=filtered.slice(safePage*pageSize,(safePage+1)*pageSize);

  const save=async()=>{
    if(!form.first_name||!form.last_name){notify("First and Last name required","error");return;}
    if(!form.email){
      const go=await confirm({title:"No Email Address",
        message:"This student has no email address. They won't receive report cards, fee reminders, or login links by email. Continue anyway?",
        confirmLabel:"Add Without Email"});
      if(!go)return;
    }
    // Duplicate check for new students only
    if(!editId){
      const candidate={first_name:form.first_name,middle_name:form.middle_name||"",last_name:form.last_name,class_id:form.class_id||null};
      for(const st of students){
        const result=checkStudentDuplicate(candidate,st);
        if(result){setDupWarning({type:result,match:st,onConfirm:doSave});return;}
      }
    }
    doSave();
  };

  const doSave=async()=>{
    setDupWarning(null);
    const name=[form.first_name,form.middle_name,form.last_name].filter(Boolean).join(" ");
    const payload={
      name,
      first_name:form.first_name||null,
      middle_name:form.middle_name||null,
      last_name:form.last_name||null,
      email:form.email||null,
      gender:form.gender||'Male',
      class_id:form.class_id?+form.class_id:null,
      admission_year:form.admission_year||String(new Date().getFullYear()),
      dob:form.useDob&&form.dob?form.dob:null,
      age:!form.useDob&&form.age?+form.age:null,
    };
    try{
      if(editId){
        const {error}=await db.upsertStudent(payload,editId);
        if(error){console.error("[upsertStudent edit]",error);notify(error.message||error.details||"Failed to update student","error");}
        else{notify("Student updated ✓");setModal(false);load();}
      }else{
        const newId=await db.nextStudentId(db._studentIdPrefix||"RGS");
        const cls=classes.find(c=>String(c.id)===String(form.class_id));
        const {error}=await db.upsertStudent({...payload,id:newId,admission_number:newId,password_hash:newId});
        if(error){console.error("[upsertStudent new]",error);notify(error.message||error.details||"Failed to add student","error");}
        else{
          notify(`Student added — ID: ${newId} ✓`);
          setLastRegistered({count:1,entries:[{
            to:payload.email||null,
            subject:`Welcome to ${_spSN} Portal`,
            html:buildEmailHtml("Welcome to the Portal",[
              `This communication is regarding:`,
              `${name} · Student ID: ${newId} · Class: ${cls?.name||"—"}`,``,
              `Dear Parent/Guardian,`,``,
              `Your ward has been registered on the ${_spSN} portal.`,``,
              `YOUR LOGIN DETAILS`,
              `──────────────────────────────────────`,
              `Portal:     ${window.location.origin}`,
              `Student ID: ${newId}`,
              `Password:   ${newId}`,
              `Class:      ${cls?.name||"—"}`,
              `──────────────────────────────────────`,``,
              `Please keep these details safe and confidential.`,
              `The password is the Student ID — students may change it after logging in.`,``,
              `For assistance, contact the school administration.`,
            ].join("\n")),
          }]});
          setModal(false);load();
        }
      }
    }catch(e){console.error("[save student]",e);notify("Error: "+e.message,"error");}
  };
  const confirm=useConfirm();
  const del=async(id,name)=>{
    const stu=students.find(s=>s.id===id);
    const{blocks,warnings}=await db.checkDeleteStudent(id,stu?.class_id);
    // Hard interlocks — refuse deletion and explain why
    if(blocks.length){
      notify(
        `🔒 Interlock — Cannot delete "${name}"\n`+
        blocks.map(b=>`Reason: ${b.msg}.\nFix: ${b.fix}.`).join("\n\n"),
        "error"
      );
      return;
    }
    let message=`Delete student ${name} (${id})?`;
    if(warnings.length) message+=` They have ${warnings.join(", ")} which will also be removed.`;
    const ok=await confirm({title:"Delete Student?",message,confirmLabel:"Delete",danger:true,
      typeToConfirm:warnings.length?id:null});
    if(!ok)return;
    try{
      await db.cancelStudentBills(id);
      const {error}=await db.softDelete('student',id,ctx.user?.name||'admin');
      if(error)notify(error.message,"error");
      else{notify(`${name} moved to Recycle Bin`,"warn");load();bumpRefresh();}
    }catch(e){notify("Delete failed: "+e.message,"error");}
  };

  // ── BULK DELETE ──────────────────────────────────────────────────────────────
  const bulkDelete=async()=>{
    const ids=[...selectedIds];
    if(!ids.length)return;

    // ── Batch interlock pre-screen ────────────────────────────────────────────
    const selStudents=students.filter(s=>ids.includes(s.id));
    const classIds=[...new Set(selStudents.map(s=>s.class_id).filter(Boolean))];
    const {data:interlockData}=await db.checkBulkStudentInterlock(ids,classIds);
    const blockedByPayment=new Set((interlockData?.blockedStudentIds||[]).map(String));
    const publishedClsIds=new Set(interlockData?.publishedClassIds||[]);
    const blockedByPublish=new Set(
      selStudents.filter(s=>publishedClsIds.has(String(s.class_id))).map(s=>String(s.id))
    );
    const allBlocked=new Set([...blockedByPayment,...blockedByPublish]);
    const eligibleIds=ids.filter(id=>!allBlocked.has(String(id)));

    if(allBlocked.size>0&&eligibleIds.length===0){
      notify(
        `🔒 Interlock — Cannot delete any of the ${ids.length} selected student(s).\n`+
        `${blockedByPayment.size>0?`• ${blockedByPayment.size} have unrefunded payment records.\n`:""}`+
        `${blockedByPublish.size>0?`• ${blockedByPublish.size} are in classes with published report cards.\n`:""}`+
        `Fix: Resolve fees/unpublish report cards before deleting.`,
        "error"
      );
      return;
    }

    let confirmMsg=`This will permanently delete ${eligibleIds.length} student${eligibleIds.length!==1?"s":""} and all their associated data. This cannot be undone.`;
    if(allBlocked.size>0) confirmMsg+=`\n\n⚠️ ${allBlocked.size} student(s) are blocked by interlocks (payments or published cards) and will be SKIPPED.`;

    const ok=await confirm({title:`Delete ${eligibleIds.length} Student${eligibleIds.length!==1?"s":""}?`,
      message:confirmMsg,
      icon:null,confirmLabel:"Delete All",danger:true,typeToConfirm:"DELETE"});
    if(!ok)return;
    setBulkDelProg({current:0,failed:0,total:eligibleIds.length,currentLabel:"",isDone:false});
    setShowBulkDel(true);
    const by=ctx.user?.name||'admin';
    let current=0,failed=0;
    for(let i=0;i<eligibleIds.length;i+=10){
      const batch=eligibleIds.slice(i,i+10);
      await Promise.all(batch.map(async id=>{
        const stu=students.find(s=>s.id===id);
        const label=stu?stuFullName(stu):id;
        setBulkDelProg(p=>({...p,currentLabel:`Moving ${label} to Recycle Bin…`}));
        await db.cancelStudentBills(id);
        const {error}=await db.softDelete('student',id,by);
        if(error)failed++;else current++;
        setBulkDelProg(p=>({...p,current,failed}));
      }));
    }
    setBulkDelProg(p=>({...p,isDone:true,currentLabel:""}));
    setSelectedIds(new Set());
    load();bumpRefresh();
  };

  // ── SAVE ROWS TO DB (shared by saveBulk paths) ────────────────────────────
  const saveRowsToDb=async(rows)=>{
    const errs=[];let added=0;
    const emailEntries=[];
    // Fetch fresh student list from DB — guards against race condition where
    // students state was empty at parse time
    const {data:freshStudents}=await db.getStudents();
    const allStudents=freshStudents||students;
    for(const row of rows){
      if(!row.first_name||!row.last_name){errs.push(`Row ${row._line}: first_name and last_name required`);continue;}
      // Final duplicate guard: match on first_name + last_name + class_id (case-insensitive)
      // This is simpler & more reliable than checkStudentDuplicate which can miss on class_id mismatch
      const cls=classes.find(c=>c.name.toLowerCase()===row.class_name?.toLowerCase());
      const resolvedClassId=cls?.id||null;
      const norm=(s)=>(s||"").trim().toLowerCase();
      const isExact=allStudents.some(st=>
        norm(st.first_name)===norm(row.first_name)&&
        norm(st.last_name)===norm(row.last_name)&&
        (resolvedClassId===null||st.class_id===null?true:(String(st.class_id)===String(resolvedClassId)))
      );
      if(isExact){errs.push(`Row ${row._line} (${[row.first_name,row.last_name].join(" ")}): duplicate — skipped`);continue;}
      const name=[row.first_name,row.middle_name,row.last_name].filter(Boolean).join(" ");
      const newId=await db.nextStudentId(db._studentIdPrefix||"RGS");
      const payload={id:newId,admission_number:newId,name,
        first_name:row.first_name,middle_name:row.middle_name||null,last_name:row.last_name,
        gender:row.gender||"Male",email:row.email||null,phone:row.phone||null,
        dob:row.dob||null,age:row.age?+row.age:null,
        class_id:cls?.id||null,admission_year:row.admission_year||String(new Date().getFullYear()),
      };
      const {error}=await db.upsertStudent({...payload,password_hash:payload.id||""});
      if(error){
        // Catch DB-level unique constraint violations (safety net)
        if(error.code==="23505")errs.push(`Row ${row._line} (${name}): duplicate — skipped`);
        else errs.push(`Row ${row._line} (${name}): ${error.message||error.details||"Insert failed"}`);
      }
      else{
        added++;
        emailEntries.push({
          to:row.email||null,
          subject:`Welcome to ${_spSN} Portal`,
          html:buildEmailHtml("Welcome to the Portal",[
            `This communication is regarding:`,
            `${name} · Student ID: ${newId} · Class: ${cls?.name||"—"}`,``,
            `Dear Parent/Guardian,`,``,
            `Your ward has been registered on the ${_spSN} portal.`,``,
            `YOUR LOGIN DETAILS`,
            `──────────────────────────────────────`,
            `Portal:     ${window.location.origin}`,
            `Student ID: ${newId}`,
            `Password:   ${newId}`,
            `Class:      ${cls?.name||"—"}`,
            `──────────────────────────────────────`,``,
            `Please keep these details safe and confidential.`,
            `The password is the Student ID — students may change it after logging in.`,``,
            `For assistance, contact the school administration.`,
          ].join("\n")),
        });
      }
    }
    return{added,errs,emailEntries};
  };

  // ── BULK UPLOAD ─────────────────────────────────────────────────────────────
  const downloadTemplate=()=>{
    const XLSX=window.XLSX;
    if(!XLSX){notify("Template loading — please wait a moment and try again","warn");return;}
    const wb=XLSX.utils.book_new();
    const wsData=[
      ["First Name ★","Middle Name","Last Name ★","Gender","Date of Birth (YYYY-MM-DD)","Class","Email","Phone"],
      ["Amaka","Chioma","Okafor","Female","2015-03-14","JSS 1A","amaka@example.com","08012345678"],
    ];
    const ws=XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"]=[{wch:18},{wch:16},{wch:18},{wch:10},{wch:26},{wch:14},{wch:24},{wch:14}];
    XLSX.utils.book_append_sheet(wb,ws,"Student Data");
    XLSX.writeFile(wb,"RGS_Student_Upload_Template.xlsx");
  };

  const parseBulkFile=async(file)=>{
    setBulkFile(file);
    setBulkErrors([]);
    setBulkParsed([]);
    try{
      // Use SheetJS to parse xlsx
      const XLSX=window.XLSX;
      if(!XLSX){setBulkErrors(["SheetJS not loaded yet — please wait a moment and try again."]);return;}
      const ab=await file.arrayBuffer();
      const wb=XLSX.read(ab,{type:"array",cellDates:true});
      const sheetName=wb.SheetNames.find(n=>n.includes("Student Data"))||wb.SheetNames[0];
      const ws=wb.Sheets[sheetName];
      // Get raw data starting from row 3 (header), row 4 (hints), data from row 5
      const raw=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
      // Row index 2 = header row (0-indexed), row 3 = hints, rows 4+ = data
      if(raw.length<3){setBulkErrors(["File appears empty or invalid."]);return;}
      // Find header row — look for "first_name" or "First Name"
      let headerRowIdx=raw.findIndex(r=>r.some(c=>String(c).toLowerCase().includes("first")));
      if(headerRowIdx<0){setBulkErrors(["Could not find header row in file."]);return;}
      const headers=raw[headerRowIdx].map(h=>String(h).toLowerCase().replace(/[★\s]+/g,"_").replace(/_+$/,"").trim());
      // Normalise header keys
      const hmap={};
      headers.forEach((h,i)=>{
        if(h.includes("first"))hmap.first_name=i;
        else if(h.includes("middle"))hmap.middle_name=i;
        else if(h.includes("last"))hmap.last_name=i;
        else if(h.includes("gender"))hmap.gender=i;
        else if(h.includes("birth")||h==="dob")hmap.dob=i;
        else if(h.includes("age"))hmap.age=i;
        else if(h.includes("email"))hmap.email=i;
        else if(h.includes("phone"))hmap.phone=i;
        else if(h.includes("class"))hmap.class_name=i;
        else if(h.includes("year")||h.includes("admission"))hmap.admission_year=i;
      });
      const rows=[];
      // skip header row + example row (headerRowIdx+1 and headerRowIdx+2)
      for(let i=headerRowIdx+2;i<raw.length;i++){
        const row=raw[i];
        const get=(key)=>{
          const idx=hmap[key];
          if(idx===undefined)return"";
          const v=row[idx];
          if(v==null||v==="")return"";
          // Format dates properly
          if(key==="dob"&&v instanceof Date){
            return v.toISOString().split("T")[0];
          }
          return String(v).trim();
        };
        const fn=get("first_name"), ln=get("last_name");
        if(!fn&&!ln)continue; // skip blank rows
        rows.push({
          first_name:fn,middle_name:get("middle_name"),last_name:ln,
          gender:get("gender"),dob:get("dob"),age:get("age"),
          email:get("email"),phone:get("phone"),class_name:get("class_name"),
          admission_year:get("admission_year"),_line:i+1
        });
      }
      if(rows.length===0){setBulkErrors(["No valid student rows found. Check the file format."]);return;}
      // Annotate each row with duplicate status (check against existing students + earlier rows in same upload)
      const dupInfo=rows.map((row,idx)=>{
        const cls=classes.find(c=>c.name.toLowerCase()===row.class_name?.toLowerCase());
        const candidate={first_name:row.first_name,middle_name:row.middle_name||"",last_name:row.last_name,class_id:cls?.id||null};
        let dupType="new",match=null;
        for(const st of students){
          const r=checkStudentDuplicate(candidate,st);
          if(r==="exact"){dupType="exact";match=st;break;}
          if(r==="possible"&&!match){dupType="possible";match=st;}
        }
        if(dupType==="new"){
          for(let j=0;j<idx;j++){
            const pr=rows[j];const pc=classes.find(c=>c.name.toLowerCase()===pr.class_name?.toLowerCase());
            const prev={first_name:pr.first_name,middle_name:pr.middle_name||"",last_name:pr.last_name,class_id:pc?.id||null};
            const r=checkStudentDuplicate(candidate,prev);
            if(r==="exact"){dupType="exact";match={...pr,_source:"upload"};break;}
            if(r==="possible"&&!match){dupType="possible";match={...pr,_source:"upload"};}
          }
        }
        return{row,dupType,match};
      });
      setBulkDupInfo(dupInfo);
      setBulkFilter("all");
      setBulkParsed(rows);
    }catch(err){
      setBulkErrors(["Failed to parse file: "+err.message]);
    }
  };

  const saveBulk=async()=>{
    if(!bulkParsed.length){notify("No data to upload","error");return;}
    setBulkSaving(true);
    let rowsToSave;
    if(bulkAction==="new_only") rowsToSave=bulkDupInfo.filter(x=>x.dupType==="new").map(x=>x.row);
    else rowsToSave=bulkDupInfo.filter(x=>x.dupType!=="exact").map(x=>x.row); // "all" — still skip confirmed exact duplicates
    const{added,errs,emailEntries}=await saveRowsToDb(rowsToSave);
    // If review mode, also queue up duplicates for manual review after saving new ones
    if(bulkAction==="review"){
      const dups=bulkDupInfo.filter(x=>x.dupType!=="new");
      if(dups.length)setBulkReviewQueue(dups);
    }
    setBulkSaving(false);setBulkErrors(errs);
    if(added>0){notify(`${added} student(s) uploaded ✓`);load();}
    if(errs.length===0&&bulkAction!=="review"){
      setBulkModal(false);setBulkParsed([]);setBulkFile(null);setBulkDupInfo([]);
      if(added>0)setLastRegistered({count:added,entries:emailEntries});
    }else if(bulkAction==="review"&&bulkDupInfo.filter(x=>x.dupType!=="new").length===0){
      setBulkModal(false);setBulkParsed([]);setBulkFile(null);setBulkDupInfo([]);
      if(added>0)setLastRegistered({count:added,entries:emailEntries});
    }
  };

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="students" size={20}/>Students</h2>
          <div style={{color:C.muted,fontSize:12}}>{students.length} registered{selectedSection?` · ${selectedSection.name}`:""}</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <Btn onClick={()=>{setBulkParsed([]);setBulkFile(null);setBulkErrors([]);setBulkDupInfo([]);setBulkModal(true);}} color={C.green} outline>Bulk Upload</Btn>
          <Btn onClick={()=>{setForm(blank);setEditId(null);setModal(true);}} color={C.orange}>Add Student</Btn>
        </div>
      </div>

      {/* ── Post-registration banner ── */}
      {lastRegistered&&(
        <div style={{marginBottom:16,padding:"12px 16px",background:C.greenPale,border:`1px solid ${C.green}44`,borderRadius:10,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <span style={{flex:1,fontSize:13,color:C.green,fontWeight:700}}>
            {lastRegistered.count} student{lastRegistered.count!==1?"s":""} registered successfully.
          </span>
          <Btn onClick={()=>setShowOnboarding(true)} color={C.blue} outline style={{fontSize:12}}>
            Send Onboarding Emails
          </Btn>
          <button onClick={()=>setLastRegistered(null)}
            style={{background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:18,lineHeight:1,padding:"0 4px"}}>✕</button>
        </div>
      )}

      {/* ── Bulk delete bar ── */}
      {selectedIds.size>0&&(
        <div style={{marginBottom:12,padding:"10px 14px",background:C.redPale,border:`1px solid ${C.red}33`,borderRadius:8,display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:13,fontWeight:700,color:C.red}}>{selectedIds.size} student{selectedIds.size!==1?"s":""} selected</span>
          <Btn onClick={bulkDelete} color={C.red} style={{fontSize:12}}>Delete Selected</Btn>
          <Btn onClick={()=>setSelectedIds(new Set())} color={C.muted} outline style={{fontSize:12}}>Clear</Btn>
        </div>
      )}
      <Card>
        {/* ── Filter toolbar ── */}
        <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search name or student ID…"
            style={{flex:2,minWidth:180,padding:"9px 13px",border:`2px solid ${C.border}`,borderRadius:8,
              fontSize:13,background:C.offWhite,outline:"none"}}/>
          <select value={selSection} onChange={e=>setSelSection(e.target.value)}
            style={{flex:1,minWidth:130,padding:"9px 10px",border:`2px solid ${selSection?C.blue:C.border}`,
              borderRadius:8,fontSize:13,background:selSection?C.bluePale:"#fff",color:C.text,fontWeight:selSection?700:400,cursor:"pointer"}}>
            <option value="">All Sections</option>
            {sections.map(s=><option key={s.id} value={String(s.id)}>{s.name}</option>)}
          </select>
          <ClassMultiSelect
            classes={classesBySection}
            selClasses={selClasses}
            onToggle={id=>setSelClasses(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;})}
            onClear={()=>setSelClasses(new Set())}/>
          {(selSection||selClasses.size>0||search||noEmailOnly)&&(
            <button onClick={()=>{setSearch("");setSelSection("");setSelClasses(new Set());setNoEmailOnly(false);}}
              style={{padding:"9px 12px",border:`2px solid ${C.red}33`,borderRadius:8,fontSize:12,
                background:C.redPale,color:C.red,cursor:"pointer",fontWeight:700,whiteSpace:"nowrap"}}>
              Clear
            </button>
          )}
        </div>

        {/* Applied from the dashboard "no email" health check — shown so it's obvious
            why the list is filtered, with an easy way out. */}
        {noEmailOnly&&(
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,padding:"9px 13px",
            background:C.amberPale,border:`1px solid ${C.amber}44`,borderRadius:8,fontSize:12,color:C.amber}}>
            <AppIcon name="warning" size={14} color={C.amber}/>
            <span style={{flex:1}}>Showing only <b>active students with no email address</b> — from the dashboard health check.</span>
            <button onClick={()=>setNoEmailOnly(false)}
              style={{background:"none",border:"none",cursor:"pointer",color:C.amber,fontWeight:700,fontSize:12,textDecoration:"underline"}}>
              Show all students
            </button>
          </div>
        )}
        <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
            <span style={{fontSize:11,fontWeight:700,color:C.muted,whiteSpace:"nowrap"}}>Sort:</span>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value)}
              style={{padding:"7px 10px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:12,
                background:"#fff",cursor:"pointer",color:C.text,fontWeight:600}}>
              <option value="name_asc">Name A→Z</option>
              <option value="name_desc">Name Z→A</option>
              <option value="id_asc">ID Ascending</option>
              <option value="id_desc">ID Descending</option>
              <option value="class_asc">Class A→Z</option>
              <option value="class_desc">Class Z→A</option>
              <option value="year_asc">Admission Year ↑</option>
              <option value="year_desc">Admission Year ↓</option>
              <option value="gender">Gender</option>
            </select>
          </div>
          <span style={{fontSize:11,color:C.muted,whiteSpace:"nowrap",marginLeft:"auto"}}>
            {filtered.length} student{filtered.length!==1?"s":""} matched
            {filtered.length>pageSize?` · showing ${safePage*pageSize+1}–${Math.min((safePage+1)*pageSize,filtered.length)}`:""}
          </span>
        </div>
        {(
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead><tr style={{background:C.blue}}>
                <th style={{padding:"8px 10px",textAlign:"center"}}>
                  <input type="checkbox"
                    checked={paged.length>0&&paged.every(s=>selectedIds.has(s.id))}
                    onChange={e=>{
                      if(e.target.checked)setSelectedIds(prev=>{const n=new Set(prev);paged.forEach(s=>n.add(s.id));return n;});
                      else setSelectedIds(prev=>{const n=new Set(prev);paged.forEach(s=>n.delete(s.id));return n;});
                    }}
                    style={{accentColor:"#fff",cursor:"pointer"}}/>
                </th>
                {["#","Student ID","First Name","Middle Name","Last Name","Gender","DOB/Age","Class","Email","Actions"].map((h,i)=>(
                  <th key={i} style={{padding:"8px 10px",color:"#fff",textAlign:"left",fontWeight:700,fontSize:12,whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr></thead>
              {loading?<TableSkeleton rows={8} cols={11}/>:(
              <tbody>
                {paged.map((s,i)=>{
                  const cls=getClass(s.class_id);
                  const dobAge=s.dob?s.dob:s.age?`Age ${s.age}`:"—";
                  const absIdx=page*pageSize+i+1;
                  const isSel=selectedIds.has(s.id);
                  return(
                    <TRow key={s.id} i={i} cells={[
                      <input type="checkbox" checked={isSel}
                        onChange={e=>{setSelectedIds(prev=>{const n=new Set(prev);e.target.checked?n.add(s.id):n.delete(s.id);return n;});}}
                        style={{accentColor:C.blue,cursor:"pointer"}}/>,
                      <span style={{color:C.light,fontSize:11}}>{absIdx}</span>,
                      <span style={{color:C.blue,fontWeight:700}}>{s.id}</span>,
                      <span>{s.first_name||s.name||"—"}</span>,
                      <span style={{color:C.muted}}>{s.middle_name||"—"}</span>,
                      <strong>{s.last_name||"—"}</strong>,
                      <Badge color={s.gender==="Female"?"#9d174d":C.blue}>{s.gender||"—"}</Badge>,
                      <span style={{color:C.muted,fontSize:12}}>{dobAge}</span>,
                      <span>{cls?.name||"—"}</span>,
                      <span style={{color:C.muted,fontSize:11}}>{s.email||"—"}</span>,
                      <div style={{display:"flex",gap:5}}>
                        <Btn xs onClick={()=>{
                          setForm({
                            first_name:s.first_name||"",middle_name:s.middle_name||"",last_name:s.last_name||"",
                            email:s.email||"",gender:s.gender||"Male",dob:s.dob||"",age:s.age||"",
                            useDob:!!s.dob||!s.age,class_id:s.class_id||"",admission_year:s.admission_year||""
                          });
                          setEditId(s.id);setModal(true);
                        }} color={C.blue} outline><Pencil size={13}/></Btn>
                        <Btn xs onClick={()=>del(s.id,stuFullName(s))} color={C.red} outline><Trash2 size={13}/></Btn>
                      </div>
                    ]}/>
                  );
                })}
                {!filtered.length&&<tr><td colSpan={11}><EmptyState icon={<AppIcon name="students" size={28} color={C.muted}/>} title="No students found" message="Try adjusting the search or filters, or add a new student."/></td></tr>}
              </tbody>
              )}
            </table>
          </div>
        )}
        {/* ── Pagination ── */}
        {totalPages>1&&(
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginTop:16,flexWrap:"wrap"}}>
            <button onClick={()=>setPage(0)} disabled={safePage===0}
              style={{padding:"6px 10px",borderRadius:7,border:`1px solid ${C.border}`,background:safePage===0?C.offWhite:"#fff",
                color:safePage===0?C.light:C.text,cursor:safePage===0?"default":"pointer",fontWeight:700,fontSize:13}}>«</button>
            <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={safePage===0}
              style={{padding:"6px 14px",borderRadius:7,border:`1px solid ${C.border}`,background:safePage===0?C.offWhite:"#fff",
                color:safePage===0?C.light:C.text,cursor:safePage===0?"default":"pointer",fontWeight:600,fontSize:13}}>‹ Prev</button>
            {Array.from({length:totalPages},(_,i)=>i).filter(i=>i===0||i===totalPages-1||Math.abs(i-safePage)<=2).reduce((acc,i,idx,arr)=>{
              if(idx>0&&arr[idx-1]!==i-1)acc.push("…");
              acc.push(i); return acc;
            },[]).map((item,idx)=>
              item==="…"
                ?<span key={"e"+idx} style={{padding:"0 2px",color:C.muted,fontSize:13}}>…</span>
                :<button key={item} onClick={()=>setPage(item)}
                  style={{width:34,height:34,borderRadius:7,border:`2px solid ${item===safePage?C.blue:C.border}`,
                    background:item===safePage?C.blue:"#fff",color:item===safePage?"#fff":C.text,
                    cursor:"pointer",fontWeight:item===safePage?800:500,fontSize:13}}>{item+1}</button>
            )}
            <button onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))} disabled={safePage===totalPages-1}
              style={{padding:"6px 14px",borderRadius:7,border:`1px solid ${C.border}`,background:safePage===totalPages-1?C.offWhite:"#fff",
                color:safePage===totalPages-1?C.light:C.text,cursor:safePage===totalPages-1?"default":"pointer",fontWeight:600,fontSize:13}}>Next ›</button>
            <button onClick={()=>setPage(totalPages-1)} disabled={safePage===totalPages-1}
              style={{padding:"6px 10px",borderRadius:7,border:`1px solid ${C.border}`,background:safePage===totalPages-1?C.offWhite:"#fff",
                color:safePage===totalPages-1?C.light:C.text,cursor:safePage===totalPages-1?"default":"pointer",fontWeight:700,fontSize:13}}>»</button>
            <span style={{fontSize:11,color:C.muted,marginLeft:4}}>Page {safePage+1} of {totalPages}</span>
          </div>
        )}
      </Card>

      {/* ── ADD/EDIT MODAL ── */}
      {modal&&(
        <Modal title={editId?"Edit Student":"New Student"} onClose={()=>setModal(false)} width={560}>
          {!editId&&(
            <div style={{background:C.bluePale,border:`1px solid ${C.blue}22`,borderRadius:8,padding:"9px 13px",marginBottom:14,fontSize:12,color:C.blue}}>
              <strong>Student ID</strong> will be auto-generated as <strong>RGS/01, RGS/02…</strong> on save
            </div>
          )}
          {editId&&(
            <div style={{marginBottom:14}}>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>Student ID (read-only)</label>
              <div style={{padding:"9px 12px",background:C.offWhite,borderRadius:8,fontSize:13,border:`2px solid ${C.border}`,color:C.blue,fontWeight:700}}>{editId}</div>
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            <Inp label="First Name *" value={form.first_name} onChange={v=>f({first_name:v})} placeholder="Adaeze"/>
            <Inp label="Middle Name" value={form.middle_name} onChange={v=>f({middle_name:v})} placeholder="Chioma"/>
            <Inp label="Last Name *" value={form.last_name} onChange={v=>f({last_name:v})} placeholder="Okonkwo"/>
          </div>
          <Inp label="Email Address (optional)" type="email" value={form.email||""} onChange={v=>f({email:v})} placeholder="student@example.com"/>
          <Sel label="Gender" value={form.gender||"Male"} onChange={v=>f({gender:v})} options={["Male","Female"]}/>

          {/* DOB or Age toggle */}
          <div style={{marginBottom:13}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
              <label style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5}}>Date / Age</label>
              <div style={{display:"flex",gap:0,borderRadius:7,overflow:"hidden",border:`2px solid ${C.border}`}}>
                <button onClick={()=>f({useDob:true})} style={{padding:"3px 12px",fontSize:11,fontWeight:700,
                  background:form.useDob?C.blue:"transparent",color:form.useDob?"#fff":C.muted,border:"none",cursor:"pointer"}}>Date of Birth</button>
                <button onClick={()=>f({useDob:false})} style={{padding:"3px 12px",fontSize:11,fontWeight:700,
                  background:!form.useDob?C.blue:"transparent",color:!form.useDob?"#fff":C.muted,border:"none",cursor:"pointer"}}>Age</button>
              </div>
            </div>
            {form.useDob
              ?<input type="date" value={form.dob||""} onChange={e=>f({dob:e.target.value})}
                  style={{display:"block",width:"100%",padding:"9px 12px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:13,outline:"none"}}
                  onFocus={e=>e.target.style.borderColor=C.orange} onBlur={e=>e.target.style.borderColor=C.border}/>
              :<input type="number" min="1" max="25" value={form.age||""} onChange={e=>f({age:e.target.value})}
                  placeholder="e.g. 12"
                  style={{display:"block",width:"100%",padding:"9px 12px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:13,outline:"none"}}
                  onFocus={e=>e.target.style.borderColor=C.orange} onBlur={e=>e.target.style.borderColor=C.border}/>
            }
          </div>

          <Inp label="Admission Year" value={form.admission_year||""} onChange={v=>f({admission_year:v})} placeholder={String(new Date().getFullYear())}/>
          <Sel label="Class" value={form.class_id||""} onChange={v=>f({class_id:v})}
            options={[{value:"",label:"— Select Class —"},...classes.map(c=>({value:c.id,label:`${c.name}${c.sections?" ("+c.sections.code+")":""}`}))]}/>
          <div style={{display:"flex",gap:10,marginTop:6}}>
            <Btn onClick={save} color={C.orange} style={{flex:1}}>Save</Btn>
            <Btn onClick={()=>setModal(false)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
          </div>
        </Modal>
      )}

      {/* ── BULK UPLOAD MODAL ── */}
      {bulkModal&&(
        <Modal title="Bulk Student Upload" onClose={()=>setBulkModal(false)} width={660}>
          {/* Load SheetJS for xlsx parsing */}
          {typeof window!=="undefined"&&!window.XLSX&&(()=>{
            const s=document.createElement("script");
            s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
            document.head.appendChild(s);
            return null;
          })()}
          <div style={{background:C.bluePale,border:`1px solid ${C.blue}22`,borderRadius:10,padding:"13px 16px",marginBottom:16,fontSize:12,color:C.blue,lineHeight:1.8}}>
            <div style={{fontWeight:800,marginBottom:4}}>Instructions</div>
            <div>1. Download the <strong>Excel template</strong> — it includes a guide sheet</div>
            <div>2. Fill student data in the <strong>"Student Data"</strong> sheet starting row 5</div>
            <div>3. <strong>First Name</strong> and <strong>Last Name</strong> are required (★ columns)</div>
            <div>4. Use DOB format <strong>YYYY-MM-DD</strong>, or fill Age instead — not both</div>
            <div>5. Class name must match portal exactly (e.g. <strong>JSS 1A</strong>)</div>
            <div>6. Save as .xlsx and upload — Student IDs are auto-generated</div>
          </div>

          <div style={{display:"flex",gap:10,marginBottom:16}}>
            <Btn onClick={downloadTemplate} color={C.blue}>Download Excel Template (.xlsx)</Btn>
          </div>

          <div style={{marginBottom:14}}>
            <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>Upload Filled Excel File (.xlsx)</label>
            <input type="file" accept=".xlsx,.xls" onChange={e=>e.target.files[0]&&parseBulkFile(e.target.files[0])}
              style={{display:"block",width:"100%",padding:"9px 12px",border:`2px dashed ${C.border}`,borderRadius:8,fontSize:13,cursor:"pointer",background:C.offWhite}}/>
          </div>

          {bulkParsed.length>0&&(()=>{
            const nNew=bulkDupInfo.filter(x=>x.dupType==="new").length;
            const nPoss=bulkDupInfo.filter(x=>x.dupType==="possible").length;
            const nExact=bulkDupInfo.filter(x=>x.dupType==="exact").length;
            const filtered2=bulkFilter==="new"?bulkDupInfo.filter(x=>x.dupType==="new"):
              bulkFilter==="duplicates"?bulkDupInfo.filter(x=>x.dupType!=="new"):bulkDupInfo;
            return(
              <div style={{marginBottom:14}}>
                {/* Summary banner */}
                <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
                  <span style={{fontSize:12,color:C.green,fontWeight:700}}>{nNew} new</span>
                  {nPoss>0&&<span style={{fontSize:12,color:C.amber,fontWeight:700}}>{nPoss} possible duplicate{nPoss!==1?"s":""}</span>}
                  {nExact>0&&<span style={{fontSize:12,color:C.red,fontWeight:700}}>{nExact} exact duplicate{nExact!==1?"s":""}</span>}
                  <div style={{marginLeft:"auto",display:"flex",gap:4}}>
                    {["all","new","duplicates"].map(f=>(
                      <button key={f} onClick={()=>setBulkFilter(f)}
                        style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${bulkFilter===f?C.blue:C.border}`,
                          background:bulkFilter===f?C.blue:"#fff",color:bulkFilter===f?"#fff":C.text,fontSize:11,cursor:"pointer",fontWeight:600}}>
                        {f==="all"?"All":f==="new"?"New Only":"Duplicates"}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Preview table */}
                <div style={{overflowX:"auto",maxHeight:220,overflowY:"auto",border:`1px solid ${C.border}`,borderRadius:8}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <thead><tr style={{background:C.blue}}>
                      {["#","Status","First Name","Last","Gender","DOB/Age","Email","Class"].map((h,i)=>(
                        <th key={i} style={{padding:"6px 10px",color:"#fff",textAlign:"left",fontWeight:700,whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {filtered2.slice(0,20).map(({row:r,dupType},i)=>{
                        const badgeColor=dupType==="exact"?C.red:dupType==="possible"?C.amber:C.green;
                        const badgeLabel=dupType==="exact"?"Duplicate":dupType==="possible"?"Possible Dup":"New";
                        return(
                          <tr key={i} style={{background:i%2===0?C.white:C.offWhite}}>
                            <td style={{padding:"5px 10px",color:C.light}}>{r._line}</td>
                            <td style={{padding:"5px 10px"}}><span style={{fontSize:10,fontWeight:700,color:badgeColor,whiteSpace:"nowrap"}}>{badgeLabel}</span></td>
                            <td style={{padding:"5px 10px"}}>{r.first_name}</td>
                            <td style={{padding:"5px 10px"}}>{r.last_name}</td>
                            <td style={{padding:"5px 10px"}}>{r.gender}</td>
                            <td style={{padding:"5px 10px",color:C.muted}}>{r.dob||r.age?(r.dob||`Age ${r.age}`):"—"}</td>
                            <td style={{padding:"5px 10px",color:C.muted,fontSize:10}}>{r.email||"—"}</td>
                            <td style={{padding:"5px 10px"}}>{r.class_name}</td>
                          </tr>
                        );
                      })}
                      {filtered2.length>20&&<tr><td colSpan={8} style={{padding:"6px 10px",color:C.muted,fontSize:11}}>…and {filtered2.length-20} more rows</td></tr>}
                    </tbody>
                  </table>
                </div>
                {/* Action options */}
                {(nPoss>0||nExact>0)&&(
                  <div style={{marginTop:12,padding:"12px 14px",background:C.offWhite,border:`1px solid ${C.border}`,borderRadius:10}}>
                    <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>How to handle duplicates?</div>
                    {[
                      {v:"new_only",label:"Add new students only (skip all duplicates)",desc:"Recommended — safest option"},
                      {v:"all",label:"Add new + possible duplicates (skip confirmed exact duplicates)",desc:"Adds possible name-matches — exact matches always blocked"},
                      {v:"review",label:"Let me review each duplicate manually"},
                    ].map(o=>(
                      <label key={o.v} style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:8,cursor:"pointer"}}>
                        <input type="radio" checked={bulkAction===o.v} onChange={()=>setBulkAction(o.v)} style={{accentColor:C.blue,marginTop:2}}/>
                        <div>
                          <div style={{fontSize:12,fontWeight:700,color:C.text}}>{o.label}</div>
                          {o.desc&&<div style={{fontSize:11,color:C.muted}}>{o.desc}</div>}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {bulkErrors.length>0&&(
            <div style={{background:C.redPale,border:`1px solid ${C.red}22`,borderRadius:8,padding:"10px 14px",marginBottom:14}}>
              {bulkErrors.map((e,i)=><div key={i} style={{fontSize:12,color:C.red,marginBottom:2}}>{e}</div>)}
            </div>
          )}

          <div style={{display:"flex",gap:10,marginTop:4}}>
            <Btn onClick={saveBulk} color={C.orange} disabled={bulkSaving||!bulkParsed.length} style={{flex:1}}>
              {bulkSaving?"Uploading…":`Upload ${bulkParsed.length} Students`}
            </Btn>
            <Btn onClick={()=>setBulkModal(false)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
          </div>
        </Modal>
      )}
      {/* ── Duplicate warning modal (single registration) ── */}
      {dupWarning&&(
        <Modal title={dupWarning.type==="exact"?"Exact Duplicate Student":"Possible Duplicate Student"} onClose={()=>setDupWarning(null)} width={480}>
          <div style={{fontSize:13,color:C.text,lineHeight:1.8,marginBottom:14}}>
            A student with similar details already exists:
            <div style={{margin:"10px 0",padding:"10px 14px",background:C.redPale,border:`1px solid ${C.red}22`,borderRadius:8}}>
              <strong>Existing:</strong> {stuFullName(dupWarning.match)} · {classes.find(c=>String(c.id)===String(dupWarning.match.class_id))?.name||"—"} · ID: {dupWarning.match.id}
            </div>
            <div style={{padding:"10px 14px",background:C.bluePale,border:`1px solid ${C.blue}22`,borderRadius:8}}>
              <strong>New entry:</strong> {[form.first_name,form.middle_name,form.last_name].filter(Boolean).join(" ")} · {classes.find(c=>String(c.id)===String(form.class_id))?.name||"—"}
            </div>
          </div>
          <div style={{fontSize:12,color:C.muted,marginBottom:14}}>Are you sure you want to add this student?</div>
          <div style={{display:"flex",gap:10}}>
            <Btn onClick={dupWarning.onConfirm} color={C.orange} style={{flex:1}}>Add Anyway</Btn>
            <Btn onClick={()=>setDupWarning(null)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
          </div>
        </Modal>
      )}

      {/* ── Bulk review mode — one duplicate at a time ── */}
      {bulkReviewQueue.length>0&&(()=>{
        const {row,dupType,match}=bulkReviewQueue[0];
        const remaining=bulkReviewQueue.length;
        const cls=classes.find(c=>c.name.toLowerCase()===row.class_name?.toLowerCase());
        const name=[row.first_name,row.middle_name,row.last_name].filter(Boolean).join(" ");
        return(
          <Modal title={dupType==="exact"?"Exact Duplicate":"Possible Duplicate"} width={480}>
            <div style={{marginBottom:10,fontSize:12,color:C.muted}}>{remaining} duplicate{remaining!==1?"s":""} to review</div>
            <div style={{fontSize:13,color:C.text,marginBottom:14}}>
              <div style={{padding:"10px 14px",background:C.redPale,border:`1px solid ${C.red}22`,borderRadius:8,marginBottom:8}}>
                <strong>Existing:</strong> {match?stuFullName(match)||match.full_name||match.first_name:"—"}{match?.id?` · ID: ${match.id}`:""}
              </div>
              <div style={{padding:"10px 14px",background:C.bluePale,border:`1px solid ${C.blue}22`,borderRadius:8}}>
                <strong>New entry:</strong> {name} · {cls?.name||row.class_name||"—"}
              </div>
            </div>
            <div style={{display:"flex",gap:10}}>
              <Btn color={C.orange} style={{flex:1}} onClick={async()=>{
                const{added,errs,emailEntries}=await saveRowsToDb([row]);
                const next=bulkReviewQueue.slice(1);
                setBulkReviewQueue(next);
                if(added>0){load();setLastRegistered(prev=>prev?{count:(prev.count||0)+added,entries:[...(prev.entries||[]),...emailEntries]}:{count:added,entries:emailEntries});}
                if(next.length===0){setBulkModal(false);setBulkParsed([]);setBulkFile(null);setBulkDupInfo([]);}
              }}>Add Anyway</Btn>
              <Btn color={C.muted} outline style={{flex:1}} onClick={()=>{
                const next=bulkReviewQueue.slice(1);
                setBulkReviewQueue(next);
                if(next.length===0){setBulkModal(false);setBulkParsed([]);setBulkFile(null);setBulkDupInfo([]);}
              }}>Skip</Btn>
            </div>
          </Modal>
        );
      })()}

      {/* ── Onboarding email modal ── */}
      {showOnboarding&&lastRegistered&&(
        <OnboardingEmailModal entries={lastRegistered.entries} onClose={()=>{setShowOnboarding(false);setLastRegistered(null);}} type="student"/>
      )}

      {/* ── Bulk delete progress ── */}
      {showBulkDel&&(
        <BulkProgressModal title="Deleting Students…" total={bulkDelProg.total}
          current={bulkDelProg.current} currentLabel={bulkDelProg.currentLabel}
          failed={bulkDelProg.failed} isDone={bulkDelProg.isDone} canClose={bulkDelProg.isDone}
          onClose={()=>setShowBulkDel(false)}/>
      )}
    </div>
  );
}


// ─── TEACHER ADD STUDENTS PAGE ───────────────────────────────────────────────
export function TeacherAddStudentsPage({ctx}){
  const {user,notify}=ctx;
  const {schoolName:_teacherAddSN}=useSection();
  const _taSN=_teacherAddSN||"School Portal";
  const [classes,setClasses]=useState([]);
  const [tab,setTab]=useState("manual"); // "manual" | "bulk"
  const [modal,setModal]=useState(false);
  const [bulkModal,setBulkModal]=useState(false);
  const [myRequests,setMyRequests]=useState([]);
  const [loading,setLoading]=useState(true);
  const blank={first_name:"",middle_name:"",last_name:"",email:"",gender:"Male",dob:"",age:"",useDob:true,class_id:"",admission_year:""};
  const [form,setForm]=useState(blank);
  const ff=v=>setForm(p=>({...p,...v}));
  const [bulkFile,setBulkFile]=useState(null);
  const [bulkParsed,setBulkParsed]=useState([]);
  const [bulkSaving,setBulkSaving]=useState(false);
  const [bulkErrors,setBulkErrors]=useState([]);
  const [saving,setSaving]=useState(false);
  const confirm=useConfirm();

  const load=()=>{
    setLoading(true);
    Promise.all([
      db.getClasses(),
      db.getStudentRequests(null),
      db.getSettings(),
    ]).then(async([cl,rq,st])=>{
      const settingsMap={};(st.data||[]).forEach(r=>{settingsMap[r.key]=r.value;});
      let allClasses=cl.data||[];
      // If the "own class only" restriction is on, filter to teacher's assigned classes
      if(settingsMap.teacher_add_student_own_class_only==="true"&&user.teacher_db_id){
        const{data:ctRows}=await db.getTeacherClassIds(user.teacher_db_id);
        const myIds=new Set((ctRows||[]).map(r=>r.class_id));
        allClasses=allClasses.filter(c=>myIds.has(c.id));
      }
      setClasses(allClasses);
      const mine=(rq.data||[]).filter(r=>r.submitted_by===user.staff_id||r.submitted_by===user.name||r.teacher_name===user.name);
      setMyRequests(mine);
      setLoading(false);
    });
  };
  useEffect(load,[]);

  const submitManual=async()=>{
    if(!form.first_name||!form.last_name){notify("First and Last name required","error");return;}
    if(!form.email){
      const go=await confirm({title:"No Email Address",
        message:"This student has no email address. They won't receive report cards, fee reminders, or login links by email. Continue anyway?",
        confirmLabel:"Submit Without Email"});
      if(!go)return;
    }
    setSaving(true);
    const payload={
      submitted_by:user.staff_id||user.name,teacher_name:user.name,teacher_email:user.email||null,
      first_name:form.first_name,middle_name:form.middle_name||null,last_name:form.last_name,
      email:form.email||null,gender:form.gender||"Male",
      dob:form.useDob&&form.dob?form.dob:null,
      age:!form.useDob&&form.age?+form.age:null,
      class_id:form.class_id?+form.class_id:null,
      admission_year:form.admission_year||String(new Date().getFullYear()),
      source:"manual",status:"pending",
    };
    const {error}=await db.submitStudentRequest(payload);
    setSaving(false);
    if(error){notify(error.message,"error");return;}
    notify("✅ Student submitted for admin approval");
    db.createNotificationForAdmins(
      `New student request from ${user.name||"a teacher"}`,
      `${form.first_name} ${form.last_name} submitted for enrolment approval`,
      "info","student_request","approvals"
    ).catch(()=>{});
    db.sendAdminAlert({
      subject:`[Alert] New Student Request — ${form.first_name} ${form.last_name}`,
      html:buildAlertEmail("New Student Enrolment Request",
        [`Submitted by: ${user.name||"Teacher"}`,
         `Student name: ${form.first_name} ${form.middle_name||""} ${form.last_name}`.replace(/\s+/g," "),
         `Class: ${classes.find(c=>String(c.id)===String(form.class_id))?.name||"—"}`,
         `Gender: ${form.gender||"—"}`,
         `Time: ${new Date().toLocaleString("en-NG")}`],
        "info"),
      eventKey:"student_request"
    });
    setModal(false);setForm(blank);load();
  };

  // ── BULK PARSE (reuses same template/logic as admin StudentsPage) ──────────
  const downloadTemplate=()=>{
    const b64="UEsDBBQAAAAIAJwtbFxGx01IlQAAAM0AAAAQAAAAZG9jUHJvcHMvYXBwLnhtbE3PTQvCMAwG4L9SdreZih6kDkQ9ip68zy51hbYpbYT67+0EP255ecgboi6JIia2mEXxLuRtMzLHDUDWI/o+y8qhiqHke64x3YGMsRoPpB8eA8OibdeAhTEMOMzit7Dp1C5GZ3XPlkJ3sjpRJsPiWDQ6sScfq9wcChDneiU+ixNLOZcrBf+LU8sVU57mym/8ZAW/B7oXUEsDBBQAAAAIAJwtbFz2nuxn8gAAACsCAAARAAAAAAAAAAAAAACAAcMAAABkb2NQcm9wcy9jb3JlLnhtbFBLAQIUAxQAAAAIAJwtbFyZXJwjEAYAAJwnAAATAAAAAAAAAAAAAACAAeQBAAB4bC90aGVtZS90aGVtZTEueG1sUEsBAhQDFAAAAAgAnC1sXNvkg0V9DgAAF4QAABgAAAAAAAAAAAAAAICBJQgAAHhsL3dvcmtzaGVldHMvc2hlZXQxLnhtbFBLAQIUAxQAAAAIAJwtbFy6XiMjjwYAAK4aAAAYAAAAAAAAAAAAAACAgdgWAAB4bC93b3Jrc2hlZXRzL3NoZWV0Mi54bWxQSwECFAMUAAAACACcLWxc6QauD1AEAABAJwAADQAAAAAAAAAAAAAAgAGdHQAAeGwvc3R5bGVzLnhtbFBLAQIUAxQAAAAIAJwtbFyXirscwAAAABMCAAALAAAAAAAAAAAAAACAARgiAABfcmVscy8ucmVsc1BLAQIUAxQAAAAIAJwtbFwx5mA0WgEAAMACAAAPAAAAAAAAAAAAAACAAQEjAAB4bC93b3JrYm9vay54bWxQSwECFAMUAAAACACcLWxcjfcsWrQAAACJAgAAGgAAAAAAAAAAAAAAgAGIJAAAeGwvX3JlbHMvd29ya2Jvb2sueG1sLnJlbHNQSwECFAMUAAAACACcLWxcbqckvB4BAABXBAAAEwAAAAAAAAAAAAAAgAF0JQAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLBQYAAAAACgAKAIQCAADDJgAAAAA=";
    const binary=atob(b64);const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    const blob=new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);
    a.download="RGS_Student_Upload_Template.xlsx";a.click();URL.revokeObjectURL(a.href);
  };

  const parseBulkFile=async(file)=>{
    setBulkFile(file);setBulkErrors([]);setBulkParsed([]);
    try{
      const XLSX=window.XLSX;
      if(!XLSX){setBulkErrors(["SheetJS not loaded yet — please wait a moment."]);return;}
      const ab=await file.arrayBuffer();
      const wb=XLSX.read(ab,{type:"array",cellDates:true});
      const sheetName=wb.SheetNames.find(n=>n.includes("Student Data"))||wb.SheetNames[0];
      const ws=wb.Sheets[sheetName];
      const raw=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
      if(raw.length<3){setBulkErrors(["File appears empty or invalid."]);return;}
      let headerRowIdx=raw.findIndex(r=>r.some(c=>String(c).toLowerCase().includes("first")));
      if(headerRowIdx<0){setBulkErrors(["Could not find header row."]);return;}
      const headers=raw[headerRowIdx].map(h=>String(h).toLowerCase().replace(/[★\s]+/g,"_").replace(/_+$/,"").trim());
      const hmap={};
      headers.forEach((h,i)=>{
        if(h.includes("first"))hmap.first_name=i;
        else if(h.includes("middle"))hmap.middle_name=i;
        else if(h.includes("last"))hmap.last_name=i;
        else if(h.includes("gender"))hmap.gender=i;
        else if(h.includes("birth")||h==="dob")hmap.dob=i;
        else if(h.includes("age"))hmap.age=i;
        else if(h.includes("email"))hmap.email=i;
        else if(h.includes("class"))hmap.class_name=i;
        else if(h.includes("year")||h.includes("admission"))hmap.admission_year=i;
      });
      const rows=[];
      for(let i=headerRowIdx+2;i<raw.length;i++){
        const row=raw[i];
        const get=(key)=>{
          const idx=hmap[key];if(idx===undefined)return"";
          const v=row[idx];if(v==null||v==="")return"";
          if(key==="dob"&&v instanceof Date)return v.toISOString().split("T")[0];
          return String(v).trim();
        };
        const fn=get("first_name"),ln=get("last_name");
        if(!fn&&!ln)continue;
        rows.push({first_name:fn,middle_name:get("middle_name"),last_name:ln,
          gender:get("gender"),dob:get("dob"),age:get("age"),
          email:get("email"),class_name:get("class_name"),
          admission_year:get("admission_year"),_line:i+1});
      }
      if(rows.length===0){setBulkErrors(["No valid student rows found."]);return;}
      setBulkParsed(rows);
    }catch(err){setBulkErrors(["Failed to parse file: "+err.message]);}
  };

  const submitBulk=async()=>{
    if(!bulkParsed.length){notify("No data to submit","error");return;}
    setBulkSaving(true);
    const errs=[];
    const rows=bulkParsed.map(row=>{
      const cls=classes.find(c=>c.name.toLowerCase()===row.class_name?.toLowerCase());
      return{
        submitted_by:user.staff_id||user.name,teacher_name:user.name,teacher_email:user.email||null,
        first_name:row.first_name,middle_name:row.middle_name||null,last_name:row.last_name,
        email:row.email||null,gender:row.gender||"Male",
        dob:row.dob||null,age:row.age?+row.age:null,
        class_id:cls?.id||null,
        admission_year:row.admission_year||String(new Date().getFullYear()),
        source:"bulk",status:"pending",
      };
    });
    const {error}=await db.submitStudentRequestsBulk(rows);
    setBulkSaving(false);
    if(error){notify(error.message,"error");return;}
    notify(`✅ ${rows.length} student(s) submitted for admin approval`);
    db.sendAdminAlert({
      subject:`[Alert] Bulk Student Request — ${rows.length} student${rows.length!==1?"s":""} by ${user.name||"Teacher"}`,
      html:buildAlertEmail("Bulk Student Enrolment Request",
        [`Submitted by: ${user.name||"Teacher"}`,
         `Students submitted: ${rows.length}`,
         `Time: ${new Date().toLocaleString("en-NG")}`],
        "info"),
      eventKey:"student_request"
    });
    setBulkModal(false);setBulkParsed([]);setBulkFile(null);setBulkErrors([]);
    load();
  };

  const statusColor={pending:C.orange,approved:C.green,rejected:C.red};
  const statusIcon={pending:"…",approved:"✓",rejected:"✗"};

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="add-students" size={20}/>Add Students</h2>
          <div style={{color:C.muted,fontSize:12}}>Submissions require admin approval before going live</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <Btn onClick={()=>{setBulkParsed([]);setBulkFile(null);setBulkErrors([]);setBulkModal(true);}} color={C.green} outline>Bulk Upload</Btn>
          <Btn onClick={()=>{setForm(blank);setModal(true);}} color={C.orange}>Add Student</Btn>
        </div>
      </div>

      {/* Info banner */}
      <div style={{background:C.orangePale,border:`1px solid ${C.orange}40`,borderRadius:10,padding:"12px 16px",marginBottom:18,
        display:"flex",alignItems:"flex-start",gap:10,fontSize:13,color:C.orange}}>
        
        <div>
          <strong>Approval Workflow:</strong> Students you add here are sent to the admin for review.
          Once approved they will be added to the portal and assigned a Student ID automatically.
          You can track your submissions below.
        </div>
      </div>

      {/* My submissions */}
      <Card>
        <div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:14}}>My Submissions</div>
        {loading?<Spinner/>:myRequests.length===0?(
          <div style={{textAlign:"center",padding:32,color:C.light}}>No submissions yet — click Add Student or Bulk Upload to get started</div>
        ):(
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <Th cols={["Submitted","Name","Class","Source","Status","Admin Note"]}/>
              <tbody>
                {myRequests.map((r,i)=>{
                  const cls=classes.find(c=>c.id===r.class_id);
                  const name=fullName(r);
                  return(
                    <TRow key={r.id} i={i} cells={[
                      <span style={{color:C.muted,fontSize:11}}>{new Date(r.created_at).toLocaleDateString()}</span>,
                      <strong>{name}</strong>,
                      <span>{r.classes?.name||cls?.name||"—"}</span>,
                      <Badge color={r.source==="bulk"?C.blue:C.green}>{r.source}</Badge>,
                      <Badge color={statusColor[r.status]||C.muted}>{statusIcon[r.status]} {r.status}</Badge>,
                      <span style={{color:C.muted,fontSize:11}}>{r.admin_note||"—"}</span>,
                    ]}/>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── MANUAL ADD MODAL ── */}
      {modal&&(
        <Modal title="Submit Student for Approval" onClose={()=>setModal(false)} width={560}>
          <div style={{background:C.orangePale,border:`1px solid ${C.orange}22`,borderRadius:8,padding:"9px 13px",marginBottom:14,fontSize:12,color:C.orange}}>
            This student will be reviewed by the admin before being added to the system.
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            <Inp label="First Name *" value={form.first_name} onChange={v=>ff({first_name:v})} placeholder="Adaeze"/>
            <Inp label="Middle Name" value={form.middle_name} onChange={v=>ff({middle_name:v})} placeholder="Chioma"/>
            <Inp label="Last Name *" value={form.last_name} onChange={v=>ff({last_name:v})} placeholder="Okonkwo"/>
          </div>
          <Inp label="Email Address (optional)" type="email" value={form.email||""} onChange={v=>ff({email:v})} placeholder="student@example.com"/>
          <Sel label="Gender" value={form.gender||"Male"} onChange={v=>ff({gender:v})} options={["Male","Female"]}/>
          <div style={{marginBottom:13}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
              <label style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5}}>Date / Age</label>
              <div style={{display:"flex",gap:0,borderRadius:7,overflow:"hidden",border:`2px solid ${C.border}`}}>
                <button onClick={()=>ff({useDob:true})} style={{padding:"3px 12px",fontSize:11,fontWeight:700,
                  background:form.useDob?C.blue:"transparent",color:form.useDob?"#fff":C.muted,border:"none",cursor:"pointer"}}>Date of Birth</button>
                <button onClick={()=>ff({useDob:false})} style={{padding:"3px 12px",fontSize:11,fontWeight:700,
                  background:!form.useDob?C.blue:"transparent",color:!form.useDob?"#fff":C.muted,border:"none",cursor:"pointer"}}>Age</button>
              </div>
            </div>
            {form.useDob
              ?<input type="date" value={form.dob||""} onChange={e=>ff({dob:e.target.value})}
                  style={{display:"block",width:"100%",padding:"9px 12px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:13,outline:"none"}}/>
              :<input type="number" min="1" max="25" value={form.age||""} onChange={e=>ff({age:e.target.value})} placeholder="e.g. 12"
                  style={{display:"block",width:"100%",padding:"9px 12px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:13,outline:"none"}}/>
            }
          </div>
          <Inp label="Admission Year" value={form.admission_year||""} onChange={v=>ff({admission_year:v})} placeholder={String(new Date().getFullYear())}/>
          <Sel label="Class" value={form.class_id||""} onChange={v=>ff({class_id:v})}
            options={[{value:"",label:"— Select Class —"},...classes.map(c=>({value:c.id,label:`${c.name}${c.sections?" ("+c.sections.code+")":""}`}))]}/>
          <div style={{display:"flex",gap:10,marginTop:6}}>
            <Btn onClick={submitManual} color={C.orange} style={{flex:1}} disabled={saving}>{saving?"Submitting…":"Submit for Approval"}</Btn>
            <Btn onClick={()=>setModal(false)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
          </div>
        </Modal>
      )}

      {/* ── BULK UPLOAD MODAL ── */}
      {bulkModal&&(
        <Modal title="Bulk Student Upload (Pending Approval)" onClose={()=>setBulkModal(false)} width={660}>
          {typeof window!=="undefined"&&!window.XLSX&&(()=>{
            const s=document.createElement("script");
            s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
            document.head.appendChild(s);return null;
          })()}
          <div style={{background:C.orangePale,border:`1px solid ${C.orange}22`,borderRadius:10,padding:"12px 16px",marginBottom:16,fontSize:12,color:C.orange,lineHeight:1.8}}>
            <div style={{fontWeight:800,marginBottom:4}}>All bulk-uploaded students will be submitted for admin approval before going live.</div>
          </div>
          <div style={{background:C.bluePale,border:`1px solid ${C.blue}22`,borderRadius:10,padding:"13px 16px",marginBottom:16,fontSize:12,color:C.blue,lineHeight:1.8}}>
            <div style={{fontWeight:800,marginBottom:4}}>Instructions</div>
            <div>1. Download the Excel template — includes a guide sheet</div>
            <div>2. Fill data in the <strong>"Student Data"</strong> sheet starting row 5</div>
            <div>3. <strong>First Name</strong> and <strong>Last Name</strong> are required</div>
            <div>4. Class name must match portal exactly (e.g. <strong>JSS 1A</strong>)</div>
          </div>
          <div style={{display:"flex",gap:10,marginBottom:16}}>
            <Btn onClick={downloadTemplate} color={C.blue}>Download Excel Template (.xlsx)</Btn>
          </div>
          <div style={{marginBottom:14}}>
            <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>Upload Filled Excel File (.xlsx)</label>
            <input type="file" accept=".xlsx,.xls" onChange={e=>e.target.files[0]&&parseBulkFile(e.target.files[0])}
              style={{display:"block",width:"100%",padding:"9px 12px",border:`2px dashed ${C.border}`,borderRadius:8,fontSize:13,cursor:"pointer",background:C.offWhite}}/>
          </div>
          {bulkParsed.length>0&&(
            <div style={{marginBottom:14}}>
              <div style={{fontWeight:700,color:C.green,fontSize:13,marginBottom:8}}>{bulkParsed.length} rows parsed — preview:</div>
              <div style={{overflowX:"auto",maxHeight:200,overflowY:"auto",border:`1px solid ${C.border}`,borderRadius:8}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead><tr style={{background:C.blue}}>
                    {["#","First Name","Last","Gender","DOB/Age","Class"].map((h,i)=>(
                      <th key={i} style={{padding:"6px 10px",color:"#fff",textAlign:"left",fontWeight:700}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {bulkParsed.slice(0,8).map((r,i)=>(
                      <tr key={i} style={{background:i%2===0?C.white:C.offWhite}}>
                        <td style={{padding:"5px 10px",color:C.light}}>{r._line}</td>
                        <td style={{padding:"5px 10px"}}>{r.first_name}</td>
                        <td style={{padding:"5px 10px"}}>{r.last_name}</td>
                        <td style={{padding:"5px 10px"}}>{r.gender}</td>
                        <td style={{padding:"5px 10px",color:C.muted}}>{r.dob||r.age?(r.dob||`Age ${r.age}`):"—"}</td>
                        <td style={{padding:"5px 10px"}}>{r.class_name}</td>
                      </tr>
                    ))}
                    {bulkParsed.length>8&&<tr><td colSpan={6} style={{padding:"6px 10px",color:C.muted,fontSize:11}}>…and {bulkParsed.length-8} more rows</td></tr>}
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
            <Btn onClick={submitBulk} color={C.orange} disabled={bulkSaving||!bulkParsed.length} style={{flex:1}}>
              {bulkSaving?`Submitting…`:`Submit ${bulkParsed.length} Students for Approval`}
            </Btn>
            <Btn onClick={()=>setBulkModal(false)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}


// ─── ADMIN STUDENT APPROVALS PAGE ─────────────────────────────────────────────
export function StudentApprovalsPage({ctx}){
  const {user,notify,setPendingApprovals}=ctx;
  const {schoolName:_approvalSN}=useSection();
  const _schoolName=_approvalSN||"School Portal";
  const [pendingList,setPendingList]=useState([]);
  const [approvedList,setApprovedList]=useState([]);
  const [rejectedList,setRejectedList]=useState([]);
  const [classes,setClasses]=useState([]);
  const [loading,setLoading]=useState(true);
  const [filter,setFilter]=useState("pending");
  const [noteModal,setNoteModal]=useState(null); // {req, action}
  const [note,setNote]=useState("");
  const [viewModal,setViewModal]=useState(null); // req
  const [processing,setProcessing]=useState(false);
  const confirm=useConfirm();
  // Filters
  const [search,setSearch]=useState("");
  const [filterClass,setFilterClass]=useState("");
  const [filterSection,setFilterSection]=useState("");
  const [filterTeacher,setFilterTeacher]=useState("");
  const [filterSource,setFilterSource]=useState("");
  const [filterDateFrom,setFilterDateFrom]=useState("");
  const [filterDateTo,setFilterDateTo]=useState("");

  const load=()=>{
    setLoading(true);
    Promise.all([
      db.getStudentRequests("pending"),
      db.getStudentRequests("approved"),
      db.getStudentRequests("rejected"),
      db.getClasses(),
    ]).then(([pend,appr,rej,cl])=>{
      setPendingList(pend.data||[]);
      setApprovedList(appr.data||[]);
      setRejectedList(rej.data||[]);
      setClasses(cl.data||[]);
      setPendingApprovals((pend.data||[]).length);
      setLoading(false);
    });
  };
  useEffect(load,[]);

  // The visible list for the current tab — apply all filters
  const pending=pendingList;
  const approved=approvedList;
  const rejected=rejectedList;
  const rawRequests=filter==="pending"?pendingList:filter==="approved"?approvedList:rejectedList;

  const requests=useMemo(()=>{
    let list=rawRequests;
    if(search){
      const q=search.toLowerCase();
      list=list.filter(r=>{
        const name=fullName(r).toLowerCase();
        return name.includes(q)||String(r.id).includes(q);
      });
    }
    if(filterSection){
      const sectionClasses=new Set(classes.filter(c=>String(c.section_id)===filterSection).map(c=>c.id));
      list=list.filter(r=>sectionClasses.has(r.class_id));
    }
    if(filterClass) list=list.filter(r=>String(r.class_id)===filterClass);
    if(filterTeacher){
      list=list.filter(r=>(r.teacher_name||r.submitted_by||"")===filterTeacher);
    }
    if(filterSource) list=list.filter(r=>(r.source||"")===(filterSource));
    if(filterDateFrom){
      const from=new Date(filterDateFrom);
      list=list.filter(r=>new Date(r.created_at)>=from);
    }
    if(filterDateTo){
      const to=new Date(filterDateTo); to.setHours(23,59,59,999);
      list=list.filter(r=>new Date(r.created_at)<=to);
    }
    return list;
  },[rawRequests,search,filterSection,filterClass,filterTeacher,filterSource,filterDateFrom,filterDateTo,classes]);

  // Unique values for filter dropdowns
  const allRequests=[...pendingList,...approvedList,...rejectedList];
  const uniqueTeachers=useMemo(()=>[...new Set(allRequests.map(r=>r.teacher_name||r.submitted_by).filter(Boolean))].sort(),[allRequests]);
  const uniqueSections=useMemo(()=>{
    const secs={};classes.forEach(c=>{if(c.sections)secs[c.section_id]={id:c.section_id,name:c.sections.name||c.sections.code||'Section'};});
    return Object.values(secs);
  },[classes]);
  const filteredClasses=filterSection?classes.filter(c=>String(c.section_id)===filterSection):classes;
  const hasActiveFilters=!!(search||filterClass||filterSection||filterTeacher||filterSource||filterDateFrom||filterDateTo);
  const clearFilters=()=>{setSearch("");setFilterClass("");setFilterSection("");setFilterTeacher("");setFilterSource("");setFilterDateFrom("");setFilterDateTo("");};

  const openAction=(req,action)=>{setNoteModal({req,action});setNote("");};

  const submitAction=async()=>{
    if(!noteModal)return;
    const {req,action}=noteModal;
    const cls=classes.find(c=>c.id===req.class_id)||req.classes;
    const studentName=fullName(req);
    // Resolve teacher email — stored on request, or fall back to teachers table
    let teacherEmail=req.teacher_email||null;
    if(!teacherEmail&&(req.submitted_by||req.teacher_name)){
      const {data:tRows}=await db.getTeacherByNameOrStaffId(req.submitted_by,req.teacher_name);
      teacherEmail=(tRows&&tRows[0]?.email)||null;
    }
    // Always get admin email for copy
    const {data:nc}=await db.getNotifConfig();
    const adminEmail=nc?.admin_email||null;

    const _sendDecisionEmail=(outcome,extraRows,severity)=>{
      const rows=[
        `Student: ${studentName}`,
        `Class: ${cls?.name||"—"}`,
        ...extraRows,
        `Reviewed by: ${user.name||"Admin"}`,
        `Submitted by: ${req.teacher_name||req.submitted_by||"Teacher"}`,
        `Time: ${new Date().toLocaleString("en-NG")}`,
      ];
      const html=buildAlertEmail(`Student Enrolment Request ${outcome}`,rows,severity,_schoolName);
      const subject=`Student Request ${outcome} — ${studentName}`;
      if(teacherEmail) sendPortalEmail({to:teacherEmail,subject,html});
      if(adminEmail&&adminEmail!==teacherEmail) sendPortalEmail({to:adminEmail,subject:`[Copy] ${subject}`,html});
    };

    setProcessing(true);
    if(action==="approve"){
      const {data,error}=await db.approveAndCreateStudent(req.id,user.name||"admin");
      if(error){notify(error.message,"error");setProcessing(false);return;}
      notify(`✅ Approved — Student ID: ${data.id}`);
      _sendDecisionEmail("Approved",[`Student ID: ${data.id||"—"}`],"info");
    } else {
      const {error}=await db.reviewStudentRequest(req.id,"rejected",note,user.name||"admin");
      if(error){notify(error.message,"error");setProcessing(false);return;}
      notify("❌ Request rejected","warn");
      _sendDecisionEmail("Rejected",note?[`Reason: ${note}`]:[],"warn");
    }
    setProcessing(false);setNoteModal(null);load();
  };

  const approveAll=async()=>{
    const ok=await confirm({title:`Approve All ${pending.length} Requests?`,
      message:`This will create ${pending.length} student(s) in the system immediately.`,
      confirmLabel:"Approve All"});
    if(!ok)return;
    setProcessing(true);
    let count=0,errs=0;
    for(const req of pending){
      const {error}=await db.approveAndCreateStudent(req.id,user.name||"admin");
      if(error)errs++;else count++;
    }
    setProcessing(false);
    notify(`✅ ${count} approved${errs?`, ${errs} failed`:""}`);
    load();
  };

  const statusColor={pending:C.orange,approved:C.green,rejected:C.red};
  const statusIcon={pending:"…",approved:"✓",rejected:"✗"};

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="approvals" size={20}/>Student Approvals</h2>
          <div style={{color:C.muted,fontSize:12}}>Review and approve student additions submitted by teachers</div>
        </div>
        {filter==="pending"&&pending.length>0&&(
          <Btn onClick={approveAll} color={C.green} disabled={processing}>Approve All ({pending.length})</Btn>
        )}
      </div>

      {/* Summary cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:18}}>
        {[
          {label:"Pending",count:pending.length,color:C.orange,icon:"clock",val:"pending"},
          {label:"Approved",count:approved.length,color:C.green,icon:"check",val:"approved"},
          {label:"Rejected",count:rejected.length,color:C.red,icon:"close",val:"rejected"},
        ].map(s=>(
          <div key={s.val} onClick={()=>setFilter(s.val)}
            style={{background:filter===s.val?s.color:C.white,color:filter===s.val?"#fff":C.text,
              border:`2px solid ${s.color}`,borderRadius:12,padding:"16px 20px",cursor:"pointer",
              transition:"all .2s",textAlign:"center"}}>
            <div style={{display:"flex",justifyContent:"center",marginBottom:2}}>
              <AppIcon name={s.icon} size={28} color={filter===s.val?"#fff":s.color}/>
            </div>
            <div style={{fontSize:22,fontWeight:900}}>{s.count}</div>
            <div style={{fontSize:12,fontWeight:700,opacity:.8}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <Card style={{marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
          <Filter size={14} color={C.blue}/>
          <span style={{fontWeight:800,fontSize:12,color:C.blue}}>Filters</span>
          {hasActiveFilters&&(
            <button onClick={clearFilters} style={{marginLeft:"auto",background:"none",border:"none",color:C.red,fontSize:11,fontWeight:700,cursor:"pointer",textDecoration:"underline"}}>
              Clear all filters
            </button>
          )}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:10}}>
          {/* Search */}
          <div style={{position:"relative",gridColumn:"1 / 3"}}>
            <Search size={13} style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.muted,pointerEvents:"none"}}/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by student name…"
              style={{width:"100%",padding:"8px 10px 8px 32px",border:`1.5px solid ${C.border}`,borderRadius:8,fontSize:12,background:C.white,color:C.text,boxSizing:"border-box"}}/>
          </div>
          {/* Section */}
          <select value={filterSection} onChange={e=>{setFilterSection(e.target.value);setFilterClass("");}}
            style={{padding:"8px 10px",border:`1.5px solid ${C.border}`,borderRadius:8,fontSize:12,background:C.white,color:C.text}}>
            <option value="">All Sections</option>
            {uniqueSections.map(s=><option key={s.id} value={String(s.id)}>{s.name}</option>)}
          </select>
          {/* Class */}
          <select value={filterClass} onChange={e=>setFilterClass(e.target.value)}
            style={{padding:"8px 10px",border:`1.5px solid ${C.border}`,borderRadius:8,fontSize:12,background:C.white,color:C.text}}>
            <option value="">All Classes</option>
            {filteredClasses.map(c=><option key={c.id} value={String(c.id)}>{c.name}</option>)}
          </select>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10}}>
          {/* Teacher */}
          <select value={filterTeacher} onChange={e=>setFilterTeacher(e.target.value)}
            style={{padding:"8px 10px",border:`1.5px solid ${C.border}`,borderRadius:8,fontSize:12,background:C.white,color:C.text}}>
            <option value="">All Teachers</option>
            {uniqueTeachers.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
          {/* Source */}
          <select value={filterSource} onChange={e=>setFilterSource(e.target.value)}
            style={{padding:"8px 10px",border:`1.5px solid ${C.border}`,borderRadius:8,fontSize:12,background:C.white,color:C.text}}>
            <option value="">All Sources</option>
            <option value="single">Single</option>
            <option value="bulk">Bulk Upload</option>
          </select>
          {/* Date from */}
          <div>
            <label style={{fontSize:10,fontWeight:700,color:C.muted,display:"block",marginBottom:3}}>From</label>
            <input type="date" value={filterDateFrom} onChange={e=>setFilterDateFrom(e.target.value)}
              style={{width:"100%",padding:"6px 8px",border:`1.5px solid ${C.border}`,borderRadius:8,fontSize:12,background:C.white,color:C.text,boxSizing:"border-box"}}/>
          </div>
          {/* Date to */}
          <div>
            <label style={{fontSize:10,fontWeight:700,color:C.muted,display:"block",marginBottom:3}}>To</label>
            <input type="date" value={filterDateTo} onChange={e=>setFilterDateTo(e.target.value)}
              style={{width:"100%",padding:"6px 8px",border:`1.5px solid ${C.border}`,borderRadius:8,fontSize:12,background:C.white,color:C.text,boxSizing:"border-box"}}/>
          </div>
        </div>
      </Card>

      <Card>
        <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{fontWeight:700,fontSize:13,color:C.blue}}>{filter==="pending"?"Pending":filter==="approved"?"Approved":"Rejected"} Requests</span>
          <span style={{color:C.muted,fontSize:12}}>({requests.length}{hasActiveFilters?` of ${rawRequests.length}`:""})
          </span>
        </div>
        {loading?<Spinner/>:requests.length===0?(
          <div style={{textAlign:"center",padding:32,color:C.light}}>No {filter} requests</div>
        ):(
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <Th cols={filter==="pending"
                ?["Submitted","Teacher","Name","Gender","DOB/Age","Class","Source","Actions"]
                :["Date","Teacher","Name","Gender","Class","Source","Status","Note"]}/>
              <tbody>
                {requests.map((r,i)=>{
                  const cls=classes.find(c=>c.id===r.class_id)||r.classes;
                  const name=fullName(r);
                  const dobAge=r.dob?r.dob:r.age?`Age ${r.age}`:"—";
                  if(filter==="pending") return(
                    <TRow key={r.id} i={i} cells={[
                      <span style={{color:C.muted,fontSize:11}}>{new Date(r.created_at).toLocaleDateString()}</span>,
                      <span style={{color:C.blue,fontWeight:700}}>{r.teacher_name||r.submitted_by}</span>,
                      <strong>{name}</strong>,
                      <span>{r.gender}</span>,
                      <span style={{color:C.muted,fontSize:12}}>{dobAge}</span>,
                      <span>{cls?.name||"—"}</span>,
                      <Badge color={r.source==="bulk"?C.blue:C.green}>{r.source}</Badge>,
                      <div style={{display:"flex",gap:5}}>
                        <Btn xs onClick={()=>setViewModal(r)} color={C.blue} outline>View</Btn>
                        <Btn xs onClick={()=>openAction(r,"approve")} color={C.green}>Approve</Btn>
                        <Btn xs onClick={()=>openAction(r,"reject")} color={C.red} outline>Reject</Btn>
                      </div>
                    ]}/>
                  );
                  return(
                    <TRow key={r.id} i={i} cells={[
                      <span style={{color:C.muted,fontSize:11}}>{new Date(r.reviewed_at||r.created_at).toLocaleDateString()}</span>,
                      <span>{r.teacher_name||r.submitted_by}</span>,
                      <strong>{name}</strong>,
                      <span>{r.gender}</span>,
                      <span>{cls?.name||"—"}</span>,
                      <Badge color={r.source==="bulk"?C.blue:C.green}>{r.source}</Badge>,
                      <Badge color={statusColor[r.status]}>{statusIcon[r.status]} {r.status}</Badge>,
                      <div style={{display:"flex",gap:5,alignItems:"center"}}>
                        <span style={{color:C.muted,fontSize:11,flex:1}}>{r.admin_note||"—"}</span>
                        <Btn xs onClick={()=>setViewModal(r)} color={C.blue} outline>View</Btn>
                      </div>,
                    ]}/>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* View full details modal */}
      {viewModal&&(()=>{
        const r=viewModal;
        const cls=classes.find(c=>c.id===r.class_id)||r.classes;
        const Row=({label,val})=>val?(
          <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${C.border}`,fontSize:13}}>
            <span style={{color:C.muted,minWidth:130}}>{label}</span>
            <span style={{fontWeight:700,color:C.text,textAlign:"right"}}>{val}</span>
          </div>
        ):null;
        return(
          <Modal title="Student Request — Full Details" onClose={()=>setViewModal(null)} width={480}>
            <div style={{marginBottom:8}}>
              <Row label="First Name" val={r.first_name}/>
              <Row label="Middle Name" val={r.middle_name}/>
              <Row label="Last Name" val={r.last_name}/>
              <Row label="Gender" val={r.gender}/>
              <Row label="Date of Birth" val={r.dob}/>
              <Row label="Age" val={r.age?`${r.age} yrs`:null}/>
              <Row label="Student Email" val={r.email}/>
              <Row label="Class" val={cls?.name}/>
              <Row label="Admission Year" val={r.admission_year}/>
              <Row label="Submitted by" val={r.teacher_name||r.submitted_by}/>
              <Row label="Teacher Email" val={r.teacher_email}/>
              <Row label="Source" val={r.source}/>
              <Row label="Status" val={r.status}/>
              <Row label="Submitted on" val={new Date(r.created_at).toLocaleString("en-NG")}/>
              {r.reviewed_at&&<Row label="Reviewed on" val={new Date(r.reviewed_at).toLocaleString("en-NG")}/>}
              {r.reviewed_by&&<Row label="Reviewed by" val={r.reviewed_by}/>}
              {r.admin_note&&<Row label="Admin note" val={r.admin_note}/>}
            </div>
            {r.status==="pending"&&(
              <div style={{display:"flex",gap:8,marginTop:14}}>
                <Btn onClick={()=>{setViewModal(null);openAction(r,"approve");}} color={C.green} style={{flex:1}}>Approve</Btn>
                <Btn onClick={()=>{setViewModal(null);openAction(r,"reject");}} color={C.red} outline style={{flex:1}}>Reject</Btn>
              </div>
            )}
          </Modal>
        );
      })()}

      {/* Approve / Reject modal */}
      {noteModal&&(
        <Modal title={noteModal.action==="approve"?"Approve Student":"Reject Request"}
          onClose={()=>setNoteModal(null)} width={440}>
          {(()=>{
            const r=noteModal.req;
            const name=fullName(r);
            const cls=classes.find(c=>c.id===r.class_id)||r.classes;
            return(
              <>
                <div style={{background:C.offWhite,borderRadius:8,padding:"12px 14px",marginBottom:14,fontSize:13}}>
                  <div><strong>Name:</strong> {name}</div>
                  <div><strong>Gender:</strong> {r.gender}</div>
                  <div><strong>Class:</strong> {cls?.name||"—"}</div>
                  <div><strong>Submitted by:</strong> {r.teacher_name||r.submitted_by}</div>
                </div>
                {noteModal.action==="approve"?(
                  <>
                    <div style={{background:C.greenPale||"#f0fdf4",border:`1px solid ${C.green}40`,borderRadius:8,
                      padding:"10px 14px",marginBottom:!r.email?10:14,fontSize:12,color:C.green}}>
                      A Student ID will be auto-generated and the student will be added to the system.
                    </div>
                    {!r.email&&(
                      <div style={{background:"#fff8ed",border:`1.5px solid ${C.orange}`,borderRadius:8,
                        padding:"10px 14px",marginBottom:14,fontSize:12,color:C.orange,fontWeight:600,display:"flex",gap:8,alignItems:"flex-start"}}>
                        <span style={{fontSize:15}}>⚠️</span>
                        <span>This student has no email address — they won't receive report cards, fee reminders, or login links by email.</span>
                      </div>
                    )}
                  </>
                ):(
                  <div style={{marginBottom:14}}>
                    <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,
                      textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>Reason for rejection (optional)</label>
                    <textarea value={note} onChange={e=>setNote(e.target.value)} rows={3}
                      placeholder="e.g. Duplicate entry, missing information…"
                      style={{width:"100%",padding:"9px 12px",border:`2px solid ${C.border}`,borderRadius:8,
                        fontSize:13,resize:"vertical",outline:"none",boxSizing:"border-box"}}/>
                  </div>
                )}
                <div style={{display:"flex",gap:10}}>
                  <Btn onClick={submitAction} color={noteModal.action==="approve"?C.green:C.red}
                    style={{flex:1}} disabled={processing}>
                    {processing?"Processing…":noteModal.action==="approve"?"Confirm Approval":"Confirm Rejection"}
                  </Btn>
                  <Btn onClick={()=>setNoteModal(null)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
                </div>
              </>
            );
          })()}
        </Modal>
      )}
    </div>
  );
}


// ─── TEACHERS PAGE ────────────────────────────────────────────────────────────
