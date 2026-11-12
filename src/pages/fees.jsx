/**
 * Billing domain: FeesPage, PaymentsPage, MyPaymentsPage, FeeItemsPage,
 * FeeTemplatesPage, FeeGeneratePage, PayItemModal, BillDetailModal,
 * FeeTrackerPage, FeeStatsPage, MyBillPage
 */
import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  AlertCircle, AlertTriangle, ArrowRight, BarChart3, Check, CheckCircle,
  ChevronDown, ChevronUp, Circle, CircleCheck, ClipboardList, Clock, Copy, CreditCard,
  DollarSign, Download, Edit, Filter, History, Info, Loader2, Lock, MapPin,
  Pencil, Receipt, ReceiptText, RotateCcw, Save, School, Search, Send, Tag,
  Trash2, UserPlus, Users, X, XCircle,
} from "lucide-react";
import { db } from "../supabaseClient.js";
import { C } from "../config/theme.js";
import { BulkProgressModal } from "./students.jsx";
import { EmailProgressModal } from "./comms.jsx";
import { useSection } from "../contexts/section.jsx";
import { useConfirm } from "../contexts/confirm.jsx";
import { useIsMobile } from "../utils/hooks.js";
import {
  Card, Btn, Badge, Inp, Sel, Modal, StatCard, Th, TRow,
  Spinner, AppIcon, ActionsMenu, SectionPillTabs, EmptyState,
} from "../components/ui.jsx";
import { buildEmailHtml, sendPortalEmail, buildAlertEmail } from "../services/email/index.js";
import { fullName, fmt } from "../utils/grades.js";
import {
  openHtmlDoc, downloadPDF, shareFilePDF, htmlToPdfBase64, pdfName,
} from "../services/pdf/capture.js";
import { buildPDF } from "../services/pdf/billing.js";
import {
  buildMultiPeriodTranscriptHTML, buildTranscriptHTML,
} from "../services/pdf/transcript.js";
import { isNative } from "../utils/platform.js";

export function FeesPage({ctx}){
  const {notify,selectedSection}=ctx;
  const [fees,setFees]=useState([]);
  const [classes,setClasses]=useState([]);
  const [sections,setSections]=useState([]);
  const [sessions,setSessions]=useState([]);
  const [terms,setTerms]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modal,setModal]=useState(false);
  const [editId,setEditId]=useState(null);
  const blank={class_id:"",section_id:"",session_id:"",term_id:"",fee_type:"Tuition",amount:""};
  const [form,setForm]=useState(blank);
  const f=v=>setForm(p=>({...p,...v}));
  const feeTypes=["Tuition","Development Billing","ICT Billing","Exam Billing","Sports Billing","PTA Levy","Books"];

  const load=()=>{
    setLoading(true);
    Promise.all([
      db.getFeeStructures({section_id:selectedSection?.id}),
      db.getClasses(selectedSection?.id),
      db.getSections(true),
      db.getSessions(),
      db.getTerms(),
    ]).then(([fe,cl,se,ss,t])=>{
      setFees(fe.data||[]);
      setClasses(cl.data||[]);
      setSections(se.data||[]);
      setSessions(ss.data||[]);
      setTerms(t.data||[]);
      setLoading(false);
    });
  };
  useEffect(load,[selectedSection]);

  const save=async()=>{
    if(!form.amount||!form.session_id){notify("Amount and cycle required","error");return;}
    const payload={
      ...form,
      class_id:form.class_id?+form.class_id:null,
      section_id:form.section_id?+form.section_id:null,
      session_id:+form.session_id,
      term_id:form.term_id?+form.term_id:null,
      amount:+form.amount,
    };
    const {error}=await db.upsertFee(payload,editId);
    if(error)notify(error.message,"error");
    else{notify(editId?"Billing updated ✓":"Billing added ✓");setModal(false);load();}
  };
  const del=async(id)=>{
    const __ok=await confirm({title:"Delete Billing?",
        message:"Remove this billing structure? Existing payment records will not be deleted but this billing will no longer appear.",
        confirmLabel:"Delete",danger:true});
    if(!__ok)return;
    const {error}=await db.deleteFee(id);
    if(error)notify(error.message,"error");
    else{notify("Deleted","warn");load();}
  };

  const filterTerms=terms.filter(t=>t.session_id===+form.session_id);

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="fee-items" size={20}/>Billing Structures</h2>
          {selectedSection&&<p style={{color:C.muted,fontSize:12}}>Viewing: {selectedSection.name}</p>}
        </div>
        <Btn onClick={()=>{setForm(blank);setEditId(null);setModal(true);}} color={C.orange}>Add Billing</Btn>
      </div>
      {loading?<Spinner/>:(
        <Card>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <Th cols={["Section","Group","Billing Type","Cycle","Period","Amount","Actions"]}/>
              <tbody>
                {fees.map((r,i)=>(
                  <TRow key={r.id} i={i} cells={[
                    r.sections?<Badge color={r.sections.color||C.blue}>{r.sections.code}</Badge>:<span style={{color:C.light}}>All</span>,
                    r.classes?<span>{r.classes.name}</span>:<span style={{color:C.light}}>All</span>,
                    <Badge color={C.purple}>{r.fee_type}</Badge>,
                    <span style={{color:C.muted}}>{r.sessions?.name||"—"}</span>,
                    <span style={{color:C.muted}}>{r.terms?.name||"All"}</span>,
                    <strong style={{color:C.green,fontSize:14}}>{fmt(r.amount)}</strong>,
                    <div style={{display:"flex",gap:5}}>
                      <Btn xs onClick={()=>{setForm({class_id:r.class_id||"",section_id:r.section_id||"",session_id:r.session_id||"",term_id:r.term_id||"",fee_type:r.fee_type,amount:r.amount});setEditId(r.id);setModal(true);}} color={C.blue} outline><Pencil size={13}/></Btn>
                      <Btn xs onClick={()=>del(r.id)} color={C.red} outline><Trash2 size={13}/></Btn>
                    </div>
                  ]}/>
                ))}
                {!fees.length&&<tr><td colSpan={7} style={{textAlign:"center",padding:32,color:C.light}}>No billing structures yet</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {modal&&(
        <Modal title={editId?"Edit Billing":"Add Billing Structure"} onClose={()=>setModal(false)}>
          <Sel label="Cycle *" value={form.session_id||""} onChange={v=>f({session_id:v,term_id:""})}
            options={[{value:"",label:"— Select Cycle —"},...sessions.map(s=>({value:s.id,label:s.name}))]}/>
          <Sel label="Period" value={form.term_id||""} onChange={v=>f({term_id:v})}
            options={[{value:"",label:"All Periods"},...filterTerms.map(t=>({value:t.id,label:t.name}))]}/>
          <Sel label="Section (blank = all)" value={form.section_id||""} onChange={v=>f({section_id:v,class_id:""})}
            options={[{value:"",label:"All Sections"},...sections.map(s=>({value:s.id,label:s.name}))]}/>
          <Sel label="Group (blank = all)" value={form.class_id||""} onChange={v=>f({class_id:v})}
            options={[{value:"",label:"All Groups"},...classes.filter(c=>!form.section_id||c.section_id===+form.section_id).map(c=>({value:c.id,label:c.name}))]}/>
          <Sel label="Billing Type" value={form.fee_type} onChange={v=>f({fee_type:v})} options={feeTypes}/>
          <Inp label="Amount (₦) *" type="number" value={form.amount} onChange={v=>f({amount:v})} placeholder="120000"/>
          <div style={{display:"flex",gap:10,marginTop:6}}>
            <Btn onClick={save} color={C.orange} style={{flex:1}}>Save</Btn>
            <Btn onClick={()=>setModal(false)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── PAYMENTS PAGE (Admin) ────────────────────────────────────────────────────
export function PaymentsPage({ctx}){
  const {notify}=ctx;
  const [payments,setPayments]=useState([]);
  const [students,setStudents]=useState([]);
  const [sessions,setSessions]=useState([]);
  const [terms,setTerms]=useState([]);
  const [fees,setFees]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modal,setModal]=useState(false);
  const blank={student_id:"",session_id:"",term_id:"",fee_structure_id:"",amount:"",payment_method:"Cash",status:"success"};
  const [form,setForm]=useState(blank);
  const f=v=>setForm(p=>({...p,...v}));

  const load=()=>{
    setLoading(true);
    Promise.all([db.getPayments(),db.getStudents(),db.getSessions(),db.getTerms(),db.getFeeStructures({})]).then(([p,s,ss,t,fe])=>{
      setPayments(p.data||[]);
      setStudents(s.data||[]);
      setSessions(ss.data||[]);
      setTerms(t.data||[]);
      setFees(fe.data||[]);
      setLoading(false);
    });
  };
  useEffect(load,[]);

  const totalCollected=payments.filter(p=>p.status==="success"||p.payment_status==="success").reduce((a,b)=>a+(b.amount||0),0);

  const savePayment=async()=>{
    if(!form.student_id||!form.session_id||!form.amount){notify("Member, cycle, and amount required","error");return;}
    const {error}=await db.upsertPayment({
      ...form,
      session_id:+form.session_id,
      term_id:form.term_id?+form.term_id:null,
      fee_structure_id:form.fee_structure_id?+form.fee_structure_id:null,
      amount:+form.amount,
      payment_date:new Date().toISOString().split('T')[0],
    });
    if(error)notify(error.message,"error");
    else{notify("Payment recorded ✓");setModal(false);load();}
  };

  const sc=s=>(s==="success")?C.green:(s==="pending")?C.amber:C.red;
  const filterTerms=terms.filter(t=>t.session_id===+form.session_id);

  return(
    <div>
      <div style={{marginBottom:18}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="fee-tracker" size={20}/>Payment Records</h2>
          <Btn onClick={()=>{setForm(blank);setModal(true);}} color={C.orange}>Record Payment</Btn>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:13,marginBottom:18}}>
        <StatCard label="Total Collected" value={fmt(totalCollected)} icon={<DollarSign size={18} color={C.green}/>} color={C.green}/>
        <StatCard label="Successful"      value={payments.filter(p=>p.status==="success"||p.payment_status==="success").length} icon={<CircleCheck size={18} color={C.blue}/>} color={C.blue}/>
        <StatCard label="Pending"         value={payments.filter(p=>p.status==="pending"||p.payment_status==="pending").length} icon={<Clock size={18} color={C.amber}/>} color={C.amber}/>
        <StatCard label="Total Members"  value={[...new Set(payments.map(p=>p.student_id))].length} icon={<Users size={18} color={C.purple}/>} color={C.purple}/>
      </div>
      {loading?<Spinner/>:(
        <Card>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <Th cols={["Member","Amount","Billing Type","Method","Status","Date"]}/>
              <tbody>
                {payments.map((p,i)=>{
                  const status=p.status||p.payment_status;
                  const feeType=p.fee_structures?.fee_type||p.fee_type||"—";
                  return(
                    <TRow key={p.id} i={i} cells={[
                      <strong>{p.students?fullName(p.students):p.student_id}</strong>,
                      <strong style={{color:C.green}}>{fmt(p.amount)}</strong>,
                      <Badge color={C.purple}>{feeType}</Badge>,
                      <span style={{color:C.muted}}>{p.payment_method||"—"}</span>,
                      <Badge color={sc(status)}>{(status||"—").toUpperCase()}</Badge>,
                      <span style={{color:C.muted,fontSize:12}}>{p.payment_date?new Date(p.payment_date).toLocaleDateString("en-NG"):"—"}</span>,
                    ]}/>
                  );
                })}
                {!payments.length&&<tr><td colSpan={6} style={{textAlign:"center",padding:32,color:C.light}}>No payment records</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {modal&&(
        <Modal title="Record Payment" onClose={()=>setModal(false)}>
          <Sel label="Member *" value={form.student_id||""} onChange={v=>f({student_id:v})}
            options={[{value:"",label:"— Select Member —"},...students.map(s=>({value:s.id,label:`${fullName(s)} (${s.id})`}))]}/>
          <Sel label="Cycle *" value={form.session_id||""} onChange={v=>f({session_id:v,term_id:"",fee_structure_id:""})}
            options={[{value:"",label:"— Select Cycle —"},...sessions.map(s=>({value:s.id,label:s.name}))]}/>
          <Sel label="Period" value={form.term_id||""} onChange={v=>f({term_id:v})}
            options={[{value:"",label:"All Periods"},...filterTerms.map(t=>({value:t.id,label:t.name}))]}/>
          <Sel label="Billing Structure" value={form.fee_structure_id||""} onChange={v=>{
            const fee=fees.find(f=>f.id===+v);
            f({fee_structure_id:v,amount:fee?fee.amount:form.amount});
          }} options={[{value:"",label:"— Custom amount —"},...fees.map(fe=>({value:fe.id,label:`${fe.fee_type} — ${fmt(fe.amount)}`}))]}/>
          <Inp label="Amount (₦) *" type="number" value={form.amount} onChange={v=>f({amount:v})}/>
          <Sel label="Payment Method" value={form.payment_method||"Cash"} onChange={v=>f({payment_method:v})}
            options={["Cash","Bank Transfer","Cheque","Online","POS"]}/>
          <Sel label="Status" value={form.status||"success"} onChange={v=>f({status:v})}
            options={["success","pending","failed"]}/>
          <div style={{display:"flex",gap:10,marginTop:6}}>
            <Btn onClick={savePayment} color={C.orange} style={{flex:1}}>Save</Btn>
            <Btn onClick={()=>setModal(false)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── MY PAYMENTS (Member) ────────────────────────────────────────────────────
export function MyPaymentsPage({ctx}){
  const {user}=ctx;
  const [entries,setEntries]=useState([]);
  const [loading,setLoading]=useState(true);
  const [activeTerm,setActiveTerm]=useState(null);   // {term, academic_year}

  useEffect(()=>{
    Promise.all([
      db.getFeeBills({student_id:user.student_id}),
      db.getSessions(),
      db.getTerms(),
    ]).then(([{data:bills},{data:sessions},{data:terms}])=>{
      // Resolve active session + term
      const activeSess=(sessions||[]).find(s=>s.is_active)||(sessions||[])[0];
      const activeTermRec=(terms||[]).find(t=>t.is_active&&t.session_id===activeSess?.id)
        ||(terms||[]).filter(t=>t.session_id===activeSess?.id)[0];
      const activeYear=activeSess?.name||"";
      const activeTermName=activeTermRec?.name||"";
      setActiveTerm({term:activeTermName,academic_year:activeYear});

      // Only show records for the active term
      const activeBills=(bills||[]).filter(b=>
        b.academic_year===activeYear && b.term===activeTermName
      );
      const all=[
        ...activeBills.flatMap(b=>(b.fee_payments||[]).map(p=>({...p,_type:"payment",term:b.term,academic_year:b.academic_year}))),
        ...activeBills.flatMap(b=>(b.fee_refunds||[]).map(r=>({...r,_type:"refund",term:b.term,academic_year:b.academic_year}))),
      ].sort((a,b)=>new Date(b.created_at||b.payment_date||b.refund_date)-new Date(a.created_at||a.payment_date||a.refund_date));
      setEntries(all);
      setLoading(false);
    });
  },[user.student_id]);

  const totalPaid=entries.filter(e=>e._type==="payment").reduce((a,e)=>a+(+e.amount||0),0);
  const totalRefunded=entries.filter(e=>e._type==="refund").reduce((a,e)=>a+(+e.amount||0),0);

  return(
    <div>
      <div style={{marginBottom:18}}>
        <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="my-payments" size={20}/>My Payments</h2>
        <p style={{color:C.muted,fontSize:12}}>
          {user.name}
          {activeTerm?.term&&<span style={{marginLeft:8,color:C.blue,fontWeight:700,fontSize:12}}>
            · {activeTerm.term} {activeTerm.academic_year}
          </span>}
        </p>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:13,marginBottom:18}}>
        <StatCard label="Total Paid"      value={fmt(totalPaid)}    icon={<CheckCircle size={18} color={C.green}/>} color={C.green}/>
        <StatCard label="Total Refunded"  value={fmt(totalRefunded)} icon={<RotateCcw size={18} color={C.amber}/>} color={C.amber}/>
        <StatCard label="Transactions"    value={entries.length}     icon={<ClipboardList size={18} color={C.blue}/>} color={C.blue}/>
      </div>
      {loading?<Spinner/>:(
        <Card>
          <div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:12}}>Transaction History</div>
          {entries.length===0
            ?<div style={{textAlign:"center",padding:24,color:C.light}}>No payment records yet</div>
            :<div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <Th cols={["Date & Time","Period","Amount","Method","Authorized By"]}/>
                <tbody>
                  {entries.map((e,i)=>{
                    const isRefund=e._type==="refund";
                    const rawDate=e.created_at||e.payment_date||e.refund_date;
                    const dateStr=rawDate?new Date(rawDate).toLocaleString("en-NG",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:true}):"—";
                    const methodLabel=isRefund?"↩️ Refund":e.payment_method==="paystack"?"Paystack":"Bank Transfer";
                    const authorLabel=isRefund?"Admin":e.payment_method==="paystack"?"Online":"Admin";
                    return(
                      <TRow key={e.id+e._type} i={i} cells={[
                        <span style={{color:C.muted,fontSize:12}}>{dateStr}</span>,
                        <span style={{color:C.muted}}>{e.term} {e.academic_year}</span>,
                        <strong style={{color:isRefund?C.red:C.green}}>{isRefund?"− ":"+ "}{fmt(e.amount)}</strong>,
                        <Badge color={isRefund?C.amber:e.payment_method==="paystack"?C.blue:C.green}>{methodLabel}</Badge>,
                        <span style={{color:C.muted,fontSize:12}}>{authorLabel}</span>,
                      ]}/>
                    );
                  })}
                </tbody>
              </table>
            </div>
          }
        </Card>
      )}
    </div>
  );
}



// ─── PDF BUILDER (shared by tracker + student bill page) ──────────────────────
// ─ buildPDF moved to services/pdf/billing.js
// ─ ActionsMenu, SectionPillTabs → components/ui.jsx
// ═══════════════════════════════════════════════════════════════════════════════
// FEES MODULE — Admin + Member Pages
// ═══════════════════════════════════════════════════════════════════════════════

// ── Helpers ───────────────────────────────────────────────────────────────────
const TERMS = ["1st Period","2nd Period","3rd Period"];
const STUDENT_TYPES = [{value:"all",label:"All Members"},{value:"new",label:"New Members"},{value:"old",label:"Old Members"}];

// ─── FEE ITEMS PAGE (Admin) ───────────────────────────────────────────────────
export function FeeItemsPage({ctx}){
  const {notify}=ctx;
  const [items,setItems]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modal,setModal]=useState(false);
  const [editId,setEditId]=useState(null);
  const blank={name:"",description:"",is_compulsory:true,is_active:true};
  const [form,setForm]=useState(blank);
  const f=v=>setForm(p=>({...p,...v}));
  const [itemBillCounts,setItemBillCounts]=useState({}); // {[fee_item_id]: count}

  const load=()=>{
    setLoading(true);
    Promise.all([db.getFeeItems(),db.getSessions()]).then(([{data},sessRes])=>{
      setItems(data||[]);
      // Load in-use counts for the active term
      const activeSess=sessRes.data?.find(s=>s.is_active);
      if(activeSess){
        db.getTerms(activeSess.id).then(({data:td})=>{
          const activeTerm=td?.find(x=>x.is_active)||td?.[0];
          if(activeTerm){
            db.getItemBillCounts(activeSess.name,activeTerm.name)
              .then(({data:c})=>setItemBillCounts(c||{}));
          }
        });
      }
      setLoading(false);
    });
  };
  useEffect(load,[]);

  const save=async()=>{
    if(!form.name.trim()){notify("Item name is required","error");return;}
    const {error}=await db.upsertFeeItem(form,editId);
    if(error)notify(error.message,"error");
    else{notify(editId?"Item updated ✓":"Item added ✓");setModal(false);load();}
  };
  const toggle=async(item)=>{
    const {error}=await db.upsertFeeItem({...item,is_active:!item.is_active},item.id);
    if(error)notify(error.message,"error");
    else{notify(item.is_active?"Item deactivated":"Item activated");load();}
  };
  const del=async(id,name)=>{
    // Interlock — block if item is used in templates or existing bills
    const usage=await db.getFeeItemUsage(id);
    if(usage.error){notify(usage.error.message,"error");return;}
    if(usage.billCount>0){
      notify(`🔒 Interlock — Cannot delete "${name}"\nReason: This item appears on ${usage.billCount} generated bill(s).\nFix: You cannot delete fee items that have already been billed. Deactivate it instead.`,"error");
      return;
    }
    if(usage.templateCount>0){
      const tNames=usage.templates.map(t=>t.fee_templates?.name||"Unknown").join(", ");
      notify(`🔒 Interlock — Cannot delete "${name}"\nReason: Used in ${usage.templateCount} template(s): ${tNames}.\nFix: Remove this item from those templates first, then delete.`,"error");
      return;
    }
    const ok=await confirm({title:"Delete Billing Item?",message:`Delete "${name}" permanently? This cannot be undone.`,confirmLabel:"Delete",danger:true});
    if(!ok)return;
    const {error}=await db.deleteFeeItem(id);
    if(error)notify(error.message,"error");
    else{notify(`"${name}" deleted`,"warn");load();}
  };

  const active=items.filter(i=>i.is_active);
  const inactive=items.filter(i=>!i.is_active);

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="fee-items" size={20}/>Billing Items</h2>
          <p style={{color:C.muted,fontSize:12}}>Define the line items that make up member bills</p>
        </div>
        <Btn onClick={()=>{setForm(blank);setEditId(null);setModal(true);}} color={C.orange}>Add Item</Btn>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12,marginBottom:18}}>
        <StatCard label="Total Items" value={items.length} icon={<Tag size={18} color={C.blue}/>} color={C.blue}/>
        <StatCard label="Active" value={active.length} icon={<CheckCircle size={18} color={C.green}/>} color={C.green}/>
        <StatCard label="Compulsory" value={items.filter(i=>i.is_compulsory&&i.is_active).length} icon={<MapPin size={18} color={C.orange}/>} color={C.orange}/>
        <StatCard label="Optional" value={items.filter(i=>!i.is_compulsory&&i.is_active).length} icon={<Circle size={18} color={C.purple}/>} color={C.purple}/>
      </div>

      {loading?<Spinner/>:(
        <Card>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <Th cols={["Item Name","Description","Type","This Period","Status","Actions"]}/>
              <tbody>
                {items.map((item,i)=>(
                  <TRow key={item.id} i={i} cells={[
                    <div>
                      <strong style={{color:C.text}}>{item.name}</strong>
                    </div>,
                    <span style={{color:C.muted,fontSize:12}}>{item.description||"—"}</span>,
                    <Badge color={item.is_compulsory?C.orange:C.purple}>
                      {item.is_compulsory?"Compulsory":"Optional"}
                    </Badge>,
                    itemBillCounts[item.id]>0
                      ? <Badge color={C.blue} title="Bills containing this item in the current period">
                          {itemBillCounts[item.id]} bill{itemBillCounts[item.id]!==1?"s":""}
                        </Badge>
                      : <span style={{fontSize:12,color:C.light}}>—</span>,
                    <Badge color={item.is_active?C.green:C.muted}>
                      {item.is_active?"Active":"Inactive"}
                    </Badge>,
                    <ActionsMenu items={[
                      {label:"Edit",onClick:()=>{setForm({name:item.name,description:item.description||"",is_compulsory:item.is_compulsory,is_active:item.is_active});setEditId(item.id);setModal(true);},color:C.blue},
                      {label:item.is_active?"Deactivate":"Activate",onClick:()=>toggle(item),color:item.is_active?C.amber:C.green},
                      null,
                      {label:"Delete",onClick:()=>del(item.id,item.name),danger:true},
                    ]}/>
                  ]}/>
                ))}
                {!items.length&&<tr><td colSpan={5} style={{textAlign:"center",padding:32,color:C.light}}>No billing items yet — click Add Item to get started</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {modal&&(
        <Modal title={editId?"Edit Billing Item":"New Billing Item"} onClose={()=>setModal(false)}>
          <Inp label="Item Name *" value={form.name} onChange={v=>f({name:v})} placeholder="e.g. Organization Billing, Transport, WAEC Billing"/>
          <Inp label="Description" value={form.description} onChange={v=>f({description:v})} placeholder="Brief description (optional)"/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
            <div style={{background:C.offWhite,borderRadius:10,padding:"12px 14px",border:`1px solid ${C.border}`}}>
              <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:8}}>TYPE</div>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13}}>
                <input type="checkbox" checked={form.is_compulsory} onChange={e=>f({is_compulsory:e.target.checked})}
                  style={{width:16,height:16,accentColor:C.orange}}/>
                <span style={{fontWeight:600,color:C.text}}>Compulsory</span>
              </label>
              <div style={{fontSize:11,color:C.muted,marginTop:4}}>Unchecked = Optional</div>
            </div>
            <div style={{background:C.offWhite,borderRadius:10,padding:"12px 14px",border:`1px solid ${C.border}`}}>
              <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:8}}>STATUS</div>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13}}>
                <input type="checkbox" checked={form.is_active} onChange={e=>f({is_active:e.target.checked})}
                  style={{width:16,height:16,accentColor:C.green}}/>
                <span style={{fontWeight:600,color:C.text}}>Active</span>
              </label>
              <div style={{fontSize:11,color:C.muted,marginTop:4}}>Inactive items won't appear in templates</div>
            </div>
          </div>
          <div style={{display:"flex",gap:10,marginTop:6}}>
            <Btn onClick={save} color={C.orange} style={{flex:1}}>Save Item</Btn>
            <Btn onClick={()=>setModal(false)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── FEE TEMPLATES PAGE (Admin) ───────────────────────────────────────────────
export function FeeTemplatesPage({ctx}){
  const {notify}=ctx;
  const [templates,setTemplates]=useState([]);
  const [allItems,setAllItems]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modal,setModal]=useState(false);
  const [detailModal,setDetailModal]=useState(null);
  const [editId,setEditId]=useState(null);
  const [sessions,setSessions]=useState([]);
  const [activeYear,setActiveYear]=useState("");
  const [activeTerm_,setActiveTerm_]=useState("");
  const [filterYear,setFilterYear]=useState("");
  const [filterTerm,setFilterTerm]=useState("");
  const [copySelection,setCopySelection]=useState(new Set());
  const toggleCopySelect=id=>setCopySelection(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  const [bulkCopying,setBulkCopying]=useState(false);
  // Copy target — user picks destination session + term (no default to active term)
  const [copyTargetSession,setCopyTargetSession]=useState("");
  const [copyTargetTerm,setCopyTargetTerm]=useState("");
  const [allTermsList,setAllTermsList]=useState([]); // all terms for copy-target dropdown
  const [templateBillCounts,setTemplateBillCounts]=useState({}); // {[template_id]: count}
  const [filterType,setFilterType]=useState(""); // ""=all | "standard" | "new_student"
  const blank=()=>({name:"",academic_year:"",term:"",class_level:"",student_type:"all",template_type:"standard"});
  const [form,setForm]=useState({name:"",academic_year:"",term:"",class_level:"",student_type:"all",template_type:"standard"});
  const f=v=>setForm(p=>({...p,...v}));
  // template items being edited
  const [tItems,setTItems]=useState([]);

  const load=()=>{
    setLoading(true);
    Promise.all([db.getFeeTemplates(),db.getFeeItems(true),db.getSessions(),db.getTerms()]).then(([t,i,s,tms])=>{
      if(t.error){console.error("[FeeTemplates] load error:",t.error.message);notify(t.error.message,"error");}
      setTemplates(t.data||[]);setAllItems(i.data||[]);
      const sessData=s.data||[];
      const termsData=tms.data||[];
      setSessions(sessData);
      setAllTermsList(termsData);
      // Track active session/term names for badge display only — NOT for auto-filtering
      const activeSess=sessData.find(x=>x.is_active);
      if(activeSess){
        setActiveYear(activeSess.name||"");
        const activeTerm=termsData.find(x=>x.is_active&&x.session_id===activeSess.id)||termsData.filter(x=>x.session_id===activeSess.id)[0];
        if(activeTerm){
          setActiveTerm_(activeTerm.name||"");
          db.getTemplateBillCounts(activeSess.name,activeTerm.name)
            .then(({data:c})=>setTemplateBillCounts(c||{}));
        }
      }
      setLoading(false);
    }).catch(e=>{console.error("[FeeTemplates] load failed:",e);notify("Failed to load templates: "+e.message,"error");setLoading(false);});
  };
  useEffect(load,[]);

  const openNew=()=>{
    setForm(blank());setEditId(null);
    setTItems(allItems.map(i=>({fee_item_id:i.id,name:i.name,amount:"",is_optional:!i.is_compulsory,included:false})));
    setModal(true);
  };
  const openEdit=(t)=>{
    setForm({name:t.name,academic_year:t.academic_year,term:t.term,class_level:t.class_level||"",student_type:t.student_type,template_type:t.template_type||"standard"});
    setEditId(t.id);
    const existing=t.fee_template_items||[];
    setTItems(allItems.map(i=>{
      const ex=existing.find(e=>e.fee_item_id===i.id);
      return{fee_item_id:i.id,name:i.name,amount:ex?ex.amount:"",is_optional:ex?ex.is_optional:!i.is_compulsory,included:!!ex,_tid:ex?.id};
    }));
    setModal(true);
  };

  const save=async()=>{
    if(!form.name||!form.academic_year||!form.term){notify("Name, year and period required","error");return;}
    const included=tItems.filter(i=>i.included&&i.amount!==""&&+i.amount>0);
    if(!included.length){notify("Add at least one billing item with an amount","error");return;}
    // save template
    const {data:tmpl,error}=await db.upsertFeeTemplate(form,editId);
    if(error){notify(error.message,"error");return;}
    const tid=tmpl.id;
    // delete old template items and re-insert
    await db.deleteTemplateItems(tid);
    const rows=included.map(i=>({template_id:tid,fee_item_id:i.fee_item_id,amount:+i.amount,is_optional:i.is_optional}));
    const {error:e2}=await db.insertTemplateItems(rows);
    if(e2){notify(e2.message,"error");return;}
    notify(editId?"Template updated ✓":"Template created ✓");setModal(false);load();
  };

  const del=async(id)=>{
    const ok=await confirm({title:"Delete Template?",message:"This will delete the template and all its line items. Bills already generated will not be affected.",icon:"📋",confirmLabel:"Delete",danger:true});
    if(!ok)return;
    const {error}=await db.deleteFeeTemplate(id);
    if(error)notify(error.message,"error");
    else{notify("Deleted","warn");load();}
  };

  // Resolve target session name + term name from copyTargetSession/copyTargetTerm ids
  const copyTargetSessName=sessions.find(s=>String(s.id)===copyTargetSession)?.name||"";
  const copyTargetTermName=allTermsList.find(t=>String(t.id)===copyTargetTerm)?.name||"";

  const copyToTerm=async(t)=>{
    if(!copyTargetSession||!copyTargetTerm){
      notify("Select a target cycle and period in the copy bar first","error");return;
    }
    const ok=await confirm({title:"Copy Template?",
      message:`Copy "${t.name}" into ${copyTargetSessName} · ${copyTargetTermName}?`,
      confirmLabel:"Copy"});
    if(!ok)return;
    const {data:tmpl,error}=await db.upsertFeeTemplate({
      name:t.name,academic_year:copyTargetSessName,term:copyTargetTermName,
      class_level:t.class_level,student_type:t.student_type,
      template_type:t.template_type||"standard",
    },null);
    if(error){notify(error.message,"error");return;}
    const items=(t.fee_template_items||[]).map(i=>({
      template_id:tmpl.id,fee_item_id:i.fee_item_id,
      amount:i.amount,is_optional:i.is_optional,
    }));
    if(items.length){
      const {error:e2}=await db.insertTemplateItems(items);
      if(e2){notify(e2.message,"error");return;}
    }
    notify(`Copied to ${copyTargetSessName} · ${copyTargetTermName} ✓`);
    setFilterYear(copyTargetSessName);setFilterTerm(copyTargetTermName);
    load();
  };

  const bulkCopyToTerm=async(visibleTemplates)=>{
    if(!copyTargetSession||!copyTargetTerm){
      notify("Select a target cycle and period in the copy bar first","error");return;
    }
    const toBeCopied=visibleTemplates.filter(t=>copySelection.has(t.id));
    if(!toBeCopied.length){notify("Select at least one template","error");return;}
    const ok=await confirm({title:`Copy ${toBeCopied.length} Template${toBeCopied.length!==1?"s":""}?`,
      message:`Copy ${toBeCopied.length} selected template${toBeCopied.length!==1?"s":""} into ${copyTargetSessName} · ${copyTargetTermName}?`,
      confirmLabel:"Copy All"});
    if(!ok)return;
    setBulkCopying(true);
    let done=0,failed=0;
    for(const t of toBeCopied){
      const {data:tmpl,error}=await db.upsertFeeTemplate({
        name:t.name,academic_year:copyTargetSessName,term:copyTargetTermName,
        class_level:t.class_level,student_type:t.student_type,
        template_type:t.template_type||"standard",
      },null);
      if(error){failed++;continue;}
      const items=(t.fee_template_items||[]).map(i=>({
        template_id:tmpl.id,fee_item_id:i.fee_item_id,
        amount:i.amount,is_optional:i.is_optional,
      }));
      if(items.length){
        const {error:e2}=await db.insertTemplateItems(items);
        if(e2){failed++;continue;}
      }
      done++;
    }
    setBulkCopying(false);
    setCopySelection(new Set());
    notify(`${done} template${done!==1?"s":""} copied to ${copyTargetSessName} · ${copyTargetTermName}${failed?` (${failed} failed)`:""}`,failed?"warn":"success");
    setFilterYear(copyTargetSessName);setFilterTerm(copyTargetTermName);
    load();
  };

  const totalOf=t=>(t.fee_template_items||[]).reduce((a,b)=>a+(+b.amount||0),0);

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="fee-templates" size={20}/>Billing Templates</h2>
          <p style={{color:C.muted,fontSize:12}}>Build billing bill templates per group, period and member type</p>
        </div>
        <Btn onClick={openNew} color={C.orange}>New Template</Btn>
      </div>

      {/* Cycle / Period filter bar */}
      {!loading&&(
        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:14,
          padding:"10px 14px",background:C.offWhite,borderRadius:10,border:`1px solid ${C.border}`}}>
          <span style={{fontSize:12,fontWeight:700,color:C.muted,whiteSpace:"nowrap"}}>Browse:</span>
          <select value={filterYear} onChange={e=>{setFilterYear(e.target.value);setCopySelection(new Set());}}
            style={{padding:"6px 10px",border:`1px solid ${C.border}`,borderRadius:7,fontSize:13,background:"#fff",color:C.text}}>
            <option value="">All Years</option>
            {sessions.map(s=><option key={s.id} value={s.name}>{s.name}{s.is_active?" (Active)":""}</option>)}
          </select>
          <select value={filterTerm} onChange={e=>{setFilterTerm(e.target.value);setCopySelection(new Set());}}
            style={{padding:"6px 10px",border:`1px solid ${C.border}`,borderRadius:7,fontSize:13,background:"#fff",color:C.text}}>
            <option value="">All Periods</option>
            {TERMS.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
          {(filterYear!==activeYear||filterTerm!==activeTerm_)&&(
            <Btn xs onClick={()=>{setFilterYear(activeYear);setFilterTerm(activeTerm_);setCopySelection(new Set());}} color={C.blue} outline>
              Back to Current Period
            </Btn>
          )}
          {/* New / Returning type filter */}
          <div style={{display:"flex",gap:4,marginLeft:"auto"}}>
            {[["","All"],["standard","Returning"],["new_student","New Enrolee"]].map(([v,l])=>(
              <button key={v} onClick={()=>setFilterType(v)}
                style={{padding:"4px 10px",borderRadius:20,border:`1px solid ${filterType===v?C.orange:C.border}`,
                  background:filterType===v?C.orangePale:C.white,
                  color:filterType===v?C.orange:C.muted,fontSize:12,fontWeight:filterType===v?700:400,cursor:"pointer"}}>
                {l}
              </button>
            ))}
          </div>
          <span style={{fontSize:12,color:C.muted}}>
            {(()=>{const ft=templates.filter(t=>(!filterYear||t.academic_year===filterYear)&&(!filterTerm||t.term===filterTerm)&&(!filterType||t.template_type===filterType));return `${ft.length} template${ft.length!==1?"s":""}`;})()}
          </span>
        </div>
      )}

      {loading?<Spinner/>:(()=>{
        const visibleTemplates=templates.filter(t=>
          (!filterYear||t.academic_year===filterYear)&&
          (!filterTerm||t.term===filterTerm)&&
          (!filterType||t.template_type===filterType));
        const isCurrentTerm=(t)=>t.academic_year===activeYear&&t.term===activeTerm_;
        const copyable=visibleTemplates; // any template can be copied to any term
        const allCopyableSelected=copyable.length>0&&copyable.every(t=>copySelection.has(t.id));
        return(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>

          {/* Copy action bar — session/term picker + bulk copy button */}
          <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",
            padding:"10px 14px",background:copySelection.size>0?C.orangePale:C.offWhite,
            borderRadius:10,border:`1px solid ${copySelection.size>0?C.orange:C.border}`,
            transition:"all .15s"}}>
            <span style={{fontSize:12,fontWeight:700,color:C.muted,whiteSpace:"nowrap"}}>Copy to:</span>
            <select value={copyTargetSession}
              onChange={e=>{setCopyTargetSession(e.target.value);setCopyTargetTerm("");}}
              style={{padding:"6px 10px",border:`1px solid ${copyTargetSession?C.orange:C.border}`,
                borderRadius:7,fontSize:13,background:"#fff",color:C.text,minWidth:130}}>
              <option value="">— Cycle —</option>
              {sessions.map(s=><option key={s.id} value={s.id}>{s.name}{s.is_active?" (Active)":""}</option>)}
            </select>
            <select value={copyTargetTerm} onChange={e=>setCopyTargetTerm(e.target.value)}
              disabled={!copyTargetSession}
              style={{padding:"6px 10px",border:`1px solid ${copyTargetTerm?C.orange:C.border}`,
                borderRadius:7,fontSize:13,background:"#fff",color:C.text,minWidth:130,
                opacity:copyTargetSession?1:.5}}>
              <option value="">— Period —</option>
              {allTermsList.filter(t=>t.session_id===+copyTargetSession).map(t=>(
                <option key={t.id} value={t.id}>{t.name}{t.is_active?" (Active)":""}</option>
              ))}
            </select>
            {copyable.length>0&&(
              <>
                <input type="checkbox" checked={allCopyableSelected}
                  onChange={()=>setCopySelection(allCopyableSelected?new Set():new Set(copyable.map(t=>t.id)))}
                  style={{width:16,height:16,accentColor:C.orange,cursor:"pointer",marginLeft:6}}/>
                <span style={{fontSize:13,color:C.muted}}>
                  {copySelection.size>0
                    ?<strong style={{color:C.orange}}>{copySelection.size} selected</strong>
                    :"Select to bulk copy"}
                </span>
              </>
            )}
            {copySelection.size>0&&(
              <>
                <Btn xs onClick={()=>bulkCopyToTerm(visibleTemplates)} color={C.orange}
                  disabled={bulkCopying||!copyTargetSession||!copyTargetTerm}>
                  {bulkCopying
                    ?<><Loader2 size={13} style={{animation:"spin 1s linear infinite"}}/> Copying…</>
                    :<><Copy size={13}/> Copy {copySelection.size} to {copyTargetTermName||"term"}</>}
                </Btn>
                <Btn xs onClick={()=>setCopySelection(new Set())} color={C.muted} outline>Clear</Btn>
              </>
            )}
          </div>

          {visibleTemplates.map(t=>{
            const canCopy=!isCurrentTerm(t);
            return(
            <Card key={t.id} style={copySelection.has(t.id)?{border:`2px solid ${C.orange}`,background:C.orangePale}:{}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10}}>
                {/* Checkbox — only on non-current-term cards */}
                {canCopy&&(
                  <div style={{paddingTop:2,paddingRight:4}}>
                    <input type="checkbox" checked={copySelection.has(t.id)} onChange={()=>toggleCopySelect(t.id)}
                      style={{width:16,height:16,accentColor:C.orange,cursor:"pointer"}}/>
                  </div>
                )}
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
                    <strong style={{fontSize:15,color:C.blue}}>{t.name}</strong>
                    {isCurrentTerm(t)&&<Badge color={C.green}>Current Period</Badge>}
                    {templateBillCounts[t.id]>0
                      ? <Badge color={C.orange} title="Bills generated using this template this period">
                          {templateBillCounts[t.id]} bill{templateBillCounts[t.id]!==1?"s":""}
                        </Badge>
                      : isCurrentTerm(t)&&<Badge color={C.muted}>Not in use</Badge>}
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
                    <Badge color={C.blue}>{t.academic_year}</Badge>
                    <Badge color={C.purple}>{t.term}</Badge>
                    {t.class_level&&<Badge color={C.orange}>{t.class_level}</Badge>}
                    <Badge color={C.amber}>{STUDENT_TYPES.find(s=>s.value===t.student_type)?.label||t.student_type}</Badge>
                    <Badge color={t.template_type==="new_student"?C.green:C.muted}>
                      {t.template_type==="new_student"?"New Enrolee":"Returning"}
                    </Badge>
                  </div>
                  <div style={{fontSize:13,color:C.muted}}>
                    <span>{(t.fee_template_items||[]).length} items</span>
                    <span style={{margin:"0 8px"}}>·</span>
                    <strong style={{color:C.green,fontSize:14}}>Total: {fmt(totalOf(t))}</strong>
                  </div>
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"flex-start"}}>
                  <Btn xs onClick={()=>setDetailModal(t)} color={C.blue} outline>View</Btn>
                  <Btn xs onClick={()=>openEdit(t)} color={C.blue} outline><Pencil size={13}/></Btn>
                  <Btn xs onClick={()=>copyToTerm(t)} color={C.orange} outline
                    title={copyTargetSession&&copyTargetTerm?`Copy to ${copyTargetTermName}`:"Set target cycle & period in the copy bar above"}>
                    <Copy size={13}/>
                  </Btn>
                  <Btn xs onClick={()=>del(t.id)} color={C.red} outline><Trash2 size={13}/></Btn>
                </div>
              </div>
            </Card>
            );
          })}
          {!visibleTemplates.length&&(
            <Card>
              <div style={{textAlign:"center",padding:40,color:C.light}}>
                <div style={{marginBottom:12}}><ClipboardList size={40} color={C.muted}/></div>
                {templates.length?(
                  <>
                    <div style={{fontSize:15,fontWeight:700,marginBottom:6}}>No templates for this period</div>
                    <div style={{fontSize:13,marginBottom:16,color:C.muted}}>
                      No templates match the current filter. Change the browse filters above or create a new template.
                    </div>
                  </>
                ):(
                  <>
                    <div style={{fontSize:15,fontWeight:700,marginBottom:6}}>No templates yet</div>
                    <div style={{fontSize:13,marginBottom:16}}>Create your first billing template to start generating bills</div>
                    <Btn onClick={openNew} color={C.orange}>Create Template</Btn>
                  </>
                )}
              </div>
            </Card>
          )}
        </div>
        );
      })()}

      {/* Create/Edit Modal */}
      {modal&&(
        <Modal title={editId?"Edit Template":"New Billing Template"} onClose={()=>setModal(false)} width={620}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <Inp label="Template Name *" value={form.name} onChange={v=>f({name:v})} placeholder="e.g. JSS3 Old Members - 2nd Period"/>
            <Sel label="Performance Year *" value={form.academic_year} onChange={v=>f({academic_year:v})}
              options={[{value:"",label:"— Select Year —"},...sessions.map(s=>({value:s.name,label:s.name+(s.is_active?" (Active)":"")}))]}/>

          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10}}>
            <Sel label="Period *" value={form.term} onChange={v=>f({term:v})} options={TERMS}/>
            <Inp label="Group Level" value={form.class_level} onChange={v=>f({class_level:v})} placeholder="JSS3 (optional)"/>
            <Sel label="Member Type" value={form.student_type} onChange={v=>f({student_type:v})}
              options={STUDENT_TYPES.map(s=>({value:s.value,label:s.label}))}/>
            <Sel label="Template Type *" value={form.template_type} onChange={v=>f({template_type:v})}
              options={[{value:"standard",label:"Returning Members"},{value:"new_student",label:"New Enrolees"}]}/>
          </div>
          {form.template_type==="new_student"&&(
            <div style={{padding:"8px 12px",background:C.greenPale,border:`1px solid ${C.green}40`,borderRadius:8,fontSize:12,color:C.green,marginTop:2}}>
              <strong>New Enrolee template</strong> — automatically applied to first-time members when a bill is generated for their group level and period.
            </div>
          )}

          <div style={{marginTop:14,marginBottom:8}}>
            <div style={{fontSize:13,fontWeight:700,color:C.blue,marginBottom:10}}>Billing Line Items</div>
            <div style={{background:C.offWhite,borderRadius:10,border:`1px solid ${C.border}`,overflow:"hidden"}}>
              <div style={{display:"grid",gridTemplateColumns:"auto 1fr 120px 90px",gap:0,padding:"8px 12px",
                background:C.border,fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5}}>
                <div style={{paddingRight:8}}>Include</div>
                <div>Item</div>
                <div>Amount (₦)</div>
                <div>Optional</div>
              </div>
              {tItems.map((item,idx)=>(
                <div key={item.fee_item_id} style={{display:"grid",gridTemplateColumns:"auto 1fr 120px 90px",
                  gap:0,padding:"8px 12px",borderTop:`1px solid ${C.border}`,
                  background:item.included?(C.white):(C.offWhite),alignItems:"center"}}>
                  <div style={{paddingRight:12}}>
                    <input type="checkbox" checked={item.included}
                      onChange={e=>setTItems(p=>p.map((t,i)=>i===idx?{...t,included:e.target.checked}:t))}
                      style={{width:16,height:16,accentColor:C.orange,cursor:"pointer"}}/>
                  </div>
                  <div style={{fontSize:13,fontWeight:item.included?600:400,color:item.included?C.text:C.muted}}>{item.name}</div>
                  <div>
                    <input type="number" value={item.amount} placeholder="0"
                      disabled={!item.included}
                      onChange={e=>setTItems(p=>p.map((t,i)=>i===idx?{...t,amount:e.target.value}:t))}
                      style={{width:"100%",padding:"5px 8px",border:`1px solid ${C.border}`,borderRadius:6,
                        fontSize:13,outline:"none",background:item.included?C.white:C.offWhite,
                        color:item.included?C.text:C.muted}}/>
                  </div>
                  <div style={{paddingLeft:8}}>
                    <input type="checkbox" checked={item.is_optional} disabled={!item.included}
                      onChange={e=>setTItems(p=>p.map((t,i)=>i===idx?{...t,is_optional:e.target.checked}:t))}
                      style={{width:14,height:14,accentColor:C.purple,cursor:item.included?"pointer":"default"}}/>
                    <span style={{fontSize:11,color:C.muted,marginLeft:4}}>Optional</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{marginTop:10,padding:"8px 12px",background:C.bluePale,borderRadius:8,
              display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:13,fontWeight:700,color:C.blue}}>Template Total</span>
              <strong style={{fontSize:16,color:C.green}}>
                {fmt(tItems.filter(i=>i.included&&i.amount).reduce((a,b)=>a+(+b.amount||0),0))}
              </strong>
            </div>
          </div>

          <div style={{display:"flex",gap:10,marginTop:14}}>
            <Btn onClick={save} color={C.orange} style={{flex:1}}>Save Template</Btn>
            <Btn onClick={()=>setModal(false)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
          </div>
        </Modal>
      )}

      {/* View Detail Modal */}
      {detailModal&&(
        <Modal title={detailModal.name} onClose={()=>setDetailModal(null)} width={500}>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
            <Badge color={C.blue}>{detailModal.academic_year}</Badge>
            <Badge color={C.purple}>{detailModal.term}</Badge>
            {detailModal.class_level&&<Badge color={C.orange}>{detailModal.class_level}</Badge>}
            <Badge color={C.amber}>{STUDENT_TYPES.find(s=>s.value===detailModal.student_type)?.label}</Badge>

          </div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead>
              <tr style={{background:C.offWhite}}>
                <th style={{padding:"8px 12px",textAlign:"left",fontWeight:700,color:C.muted,fontSize:11,textTransform:"uppercase"}}>Item</th>
                <th style={{padding:"8px 12px",textAlign:"right",fontWeight:700,color:C.muted,fontSize:11,textTransform:"uppercase"}}>Amount</th>
                <th style={{padding:"8px 12px",textAlign:"center",fontWeight:700,color:C.muted,fontSize:11,textTransform:"uppercase"}}>Type</th>
              </tr>
            </thead>
            <tbody>
              {(detailModal.fee_template_items||[]).map((item,i)=>(
                <tr key={item.id} style={{borderTop:`1px solid ${C.border}`,background:i%2===0?C.white:C.offWhite}}>
                  <td style={{padding:"9px 12px",fontWeight:600}}>{item.fee_items?.name||"—"}</td>
                  <td style={{padding:"9px 12px",textAlign:"right",color:C.green,fontWeight:700}}>{fmt(item.amount)}</td>
                  <td style={{padding:"9px 12px",textAlign:"center"}}>
                    <Badge color={item.is_optional?C.purple:C.orange}>{item.is_optional?"Optional":"Compulsory"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{borderTop:`2px solid ${C.border}`,background:C.bluePale}}>
                <td style={{padding:"10px 12px",fontWeight:900,color:C.blue}}>TOTAL</td>
                <td style={{padding:"10px 12px",textAlign:"right",fontWeight:900,color:C.green,fontSize:15}}>{fmt(totalOf(detailModal))}</td>
                <td/>
              </tr>
            </tfoot>
          </table>
          <div style={{marginTop:14}}>
            <Btn onClick={()=>setDetailModal(null)} color={C.muted} outline style={{width:"100%"}}>Close</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── FEE GENERATE PAGE (Admin) ────────────────────────────────────────────────
export function FeeGeneratePage({ctx}){
  const {notify}=ctx;
  const confirm=useConfirm();
  const [templates,setTemplates]=useState([]);
  const [students,setStudents]=useState([]);
  const [classes,setClasses]=useState([]);
  const [loading,setLoading]=useState(true);
  const [generating,setGenerating]=useState(false);
  const [genProgress,setGenProgress]=useState(null); // {current,total,failed,done}
  const [selectedTemplate,setSelectedTemplate]=useState("");
  const [selectedClasses,setSelectedClasses]=useState(new Set());
  const [classSearch,setClassSearch]=useState("");
  const [dueDate,setDueDate]=useState("");
  const [results,setResults]=useState(null);
  const [cfPrompt,setCfPrompt]=useState(null); // {owingStudents:[{id,name,balance}], owingMap}
  // Billing period selector — independent of active term
  const [sessions,setSessions]=useState([]);
  const [allTerms,setAllTerms]=useState([]);
  const [selBillSession,setSelBillSession]=useState(""); // selected session for billing
  const [selBillTerm,setSelBillTerm]=useState("");       // selected term for billing

  const toggleClass=id=>setSelectedClasses(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});

  useEffect(()=>{
    Promise.all([db.getFeeTemplates(),db.getStudents(),db.getClasses(),db.getSessions(),db.getTerms()]).then(([t,s,cl,sess,termsRes])=>{
      setTemplates(t.data||[]);
      setStudents(s.data||[]);
      setClasses(cl.data||[]);
      const sessData=sess.data||[];
      const termsData=termsRes.data||[];
      setSessions(sessData);
      setAllTerms(termsData);
      // Default to active session/term
      const activeSess=sessData.find(x=>x.is_active)||sessData[0];
      const activeTerm=termsData.find(x=>x.is_active&&x.session_id===activeSess?.id)||termsData.filter(x=>x.session_id===activeSess?.id)[0];
      if(activeSess)setSelBillSession(String(activeSess.id));
      if(activeTerm)setSelBillTerm(String(activeTerm.id));
      setLoading(false);
    });
  },[]);

  const template=templates.find(t=>String(t.id)===selectedTemplate);
  const templateItems=template?.fee_template_items||[];
  const templateCompulsoryTotal=templateItems.filter(i=>!i.is_optional).reduce((a,b)=>a+(+b.amount||0),0);
  const templateOptionalTotal=templateItems.filter(i=>i.is_optional).reduce((a,b)=>a+(+b.amount||0),0);
  const templateTotal=templateCompulsoryTotal+templateOptionalTotal; // kept for reference only

  // Only active students in selected classes
  const targetStudents=selectedClasses.size>0
    ?students.filter(s=>selectedClasses.has(s.class_id)&&(s.status||"active")==="active")
    :[];
  const newEnrolleesInClass=targetStudents.filter(s=>s.is_new_enrollee);

  // Step 1: detect owing students, prompt if found, then hand off to runGenerate
  const generate=async()=>{
    if(!template){notify("Select a template","error");return;}
    if(!targetStudents.length){notify("No members selected","error");return;}

    // Always check for previous-term owing balances before confirming
    const allIds=targetStudents.map(s=>s.id);
    const {data:owingBills}=await db.getOwingBillsForStudents(allIds,template.academic_year,template.term);
    const owingMap={};
    (owingBills||[]).forEach(b=>{
      const bal=parseFloat(b.balance)||0;
      if(bal<=0)return;
      const key=String(b.student_id);
      if(!owingMap[key])owingMap[key]={balance:0,billIds:[],bills:[]};
      owingMap[key].balance+=bal;
      owingMap[key].billIds.push(b.id);
      // Store full bill detail so we can create one CF line item per source bill
      owingMap[key].bills.push({id:b.id,balance:bal,term:b.term,academic_year:b.academic_year});
    });
    const owingStudents=targetStudents
      .filter(s=>owingMap[String(s.id)])
      .map(s=>({id:String(s.id),name:fullName(s),balance:owingMap[String(s.id)].balance}));

    if(owingStudents.length>0){
      // Show carry-forward prompt — admin decides yes/no
      setCfPrompt({owingStudents,owingMap});
      return;
    }
    // No owing students — go straight to generation with no carry-forward
    runGenerate({},false);
  };

  // Step 2: actual bill creation (called after carry-forward decision or directly if no owing)
  const runGenerate=async(owingMap,doCarryForward)=>{
    const ok=await confirm({title:"Generate Bills?",
      message:`This will generate ${targetStudents.length} bill(s) for ${template.name}. Members who already have a bill for this term/year will be skipped.`,
      confirmLabel:"Generate"});
    if(!ok)return;

    setGenerating(true);setResults(null);
    setGenProgress({current:0,total:targetStudents.length,failed:0,done:false});
    let created=0,errors=0;
    const items=template.fee_template_items||[];
    // Base total = compulsory items only; optional items start excluded from bill amount
    const baseTotal=items.filter(i=>!i.is_optional).reduce((a,b)=>a+(+b.amount||0),0);
    // If carry-forward declined, clear the map
    if(!doCarryForward) owingMap={};

    // ── Phase 1: single batch existence check (1 DB call for all students) ──
    const allIds=targetStudents.map(s=>s.id);
    const [{data:existingBills=[]},{data:corruptCFBills=[]}]=await Promise.all([
      db.getExistingBillsForStudents(allIds,template.academic_year,template.term),
      db.getCorruptCFBillsForStudents(allIds,template.academic_year,template.term),
    ]);
    const alreadyBilled=new Set((existingBills||[]).map(b=>b.student_id));
    const toProcess=targetStudents.filter(s=>!alreadyBilled.has(s.id));
    const skipped=targetStudents.length-toProcess.length;
    // Advance progress for skipped students immediately
    if(skipped>0) setGenProgress(p=>({...p,current:p.current+skipped}));

    // ── Phase 2: parallel bill creation in batches of 10 ──
    const BATCH=10;
    const auditEntries=[];
    for(let i=0;i<toProcess.length;i+=BATCH){
      const batch=toProcess.slice(i,i+BATCH);

      // Create all bills in this batch in parallel
      const billResults=await Promise.all(batch.map(async student=>{
        try{
          const owing=owingMap[String(student.id)]||null;
          const carryAmt=owing?owing.balance:0;
          const total=baseTotal+carryAmt;
          const {data:bill,error:bErr}=await db.upsertFeeBill({
            student_id:student.id,
            template_id:template.id,
            academic_year:template.academic_year,
            term:template.term,
            term_id:selBillTerm?+selBillTerm:null,
            session_id:selBillSession?+selBillSession:null,
            total_amount:total,
            amount_paid:0,
            status:"unpaid",
            due_date:dueDate||null,
            section_id:student.classes?.section_id||null,
            class_id:student.class_id||null,
          });
          if(bErr||!bill){
            console.error("[FeeGenerate] bill insert failed for",student.id,bErr?.message);
            return{ok:false};
          }
          return{ok:true,bill,student,carryAmt,carryBillIds:owing?.billIds||[],carryBills:owing?.bills||[]};
        }catch(e){
          console.error("[FeeGenerate] unexpected error for",student.id,":",e);
          return{ok:false};
        }
      }));

      // Collect items for all successful bills; bulk-insert in one call
      const batchItems=[];
      const batchBillIds=[];
      const carryBillIdsToMark=[];
      for(const r of billResults){
        if(!r.ok){errors++;continue;}
        batchBillIds.push(r.bill.id);
        const billTotal=baseTotal+(r.carryAmt||0);
        batchItems.push(...items.map(item=>({
          bill_id:r.bill.id,
          fee_item_id:item.fee_item_id,
          name:item.fee_items?.name||"Billing",
          amount:+item.amount,
          is_optional:item.is_optional,
          is_included:!item.is_optional, // compulsory=true, optional=false by default
          is_carry_forward:false,
        })));
        // Carry-forward line items — one per source bill for proper linking
        if(r.carryAmt>0){
          (r.carryBills||[]).forEach(srcBill=>{
            batchItems.push({
              bill_id:r.bill.id,
              fee_item_id:null,
              name:`Outstanding Balance — ${srcBill.term} ${srcBill.academic_year}`,
              amount:srcBill.balance,
              is_optional:false,
              is_included:true,
              is_carry_forward:true,
              source_bill_id:srcBill.id,
            });
          });
          carryBillIdsToMark.push(...r.carryBillIds);
        }
        auditEntries.push({
          bill_id:r.bill.id,student_id:r.student.id,
          action:"bill_generated",amount:billTotal,
          details:{template:template.name,term:template.term,year:template.academic_year,
            carry_forward:r.carryAmt>0,carried_amount:r.carryAmt||0},
        });
        created++;
      }
      if(batchItems.length){
        const {error:itemsErr}=await db.insertFeeBillItems(batchItems);
        if(itemsErr){
          console.error("[FeeGenerate] items bulk insert failed:",itemsErr.message);
          // Rollback entire batch — do NOT mark old bills as carried forward
          await db.deleteFeeBills(batchBillIds);
          created-=batchBillIds.length;
          errors+=batchBillIds.length;
          auditEntries.splice(auditEntries.length-batchBillIds.length);
        } else {
          // Only mark old bills as carried forward AFTER new bill + items are fully committed
          if(carryBillIdsToMark.length) await db.markBillsCarriedForward([...new Set(carryBillIdsToMark)]);
          // Clean up any corrupt CF bills for the same term that were superseded by new bills.
          // These exist only due to data corruption from failed previous runs.
          const newStudentIds=new Set(billResults.filter(r=>r.ok).map(r=>String(r.student.id)));
          const corruptToDelete=(corruptCFBills||[]).filter(b=>newStudentIds.has(String(b.student_id))).map(b=>b.id);
          if(corruptToDelete.length){
            await db.deleteFeeBills(corruptToDelete);
            console.log(`[FeeGenerate] Cleaned up ${corruptToDelete.length} corrupt CF bill(s) for same term`);
          }
        }
      }
      // Update progress after each batch
      setGenProgress(p=>({...p,current:skipped+created,failed:errors}));
    }

    // ── Phase 3: single bulk audit log insert ──
    if(auditEntries.length) await db.logFeeActionBatch(auditEntries);

    setGenerating(false);
    setGenProgress(p=>({...p,current:targetStudents.length,done:true}));
    setResults({created,skipped,errors,total:targetStudents.length});
    notify(`Done! ${created} bills generated, ${skipped} skipped, ${errors} errors`);
  };

  return(
    <div>
      <div style={{marginBottom:18}}>
        <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="fee-generate" size={20}/>Generate Bills</h2>
        <p style={{color:C.muted,fontSize:12}}>Bulk-generate billing bills for members based on a template</p>
      </div>

      {loading?<Spinner/>:(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          {/* Left: Config */}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <Card>
              <div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:10}}>1. Select Template</div>
              {(()=>{
                // Resolve selected session/term names for template matching
                const selSessRec=sessions.find(s=>String(s.id)===selBillSession);
                const selTermRec=allTerms.find(t=>String(t.id)===selBillTerm);
                const billingYear=selSessRec?.name||"";
                const billingTerm=selTermRec?.name||"";
                const visibleTemplates=billingYear&&billingTerm
                  ?templates.filter(t=>t.academic_year===billingYear&&t.term===billingTerm)
                  :templates;
                const billTerms=allTerms.filter(t=>t.session_id===+selBillSession);
                return(
                  <>
                    {/* Period selector */}
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                      <div>
                        <label style={{fontSize:11,color:C.muted,fontWeight:600,display:"block",marginBottom:3}}>Cycle</label>
                        <select value={selBillSession} onChange={e=>{setSelBillSession(e.target.value);setSelBillTerm("");setSelectedTemplate("");}}
                          style={{width:"100%",padding:"8px 10px",border:`2px solid ${C.blue}`,borderRadius:8,
                            fontSize:13,background:"inherit",color:C.text}}>
                          <option value="">— Any —</option>
                          {sessions.map(s=><option key={s.id} value={s.id}>{s.name}{s.is_active?" (active)":""}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{fontSize:11,color:C.muted,fontWeight:600,display:"block",marginBottom:3}}>Period</label>
                        <select value={selBillTerm} onChange={e=>{setSelBillTerm(e.target.value);setSelectedTemplate("");}}
                          disabled={!selBillSession}
                          style={{width:"100%",padding:"8px 10px",border:`2px solid ${C.blue}`,borderRadius:8,
                            fontSize:13,background:"inherit",color:C.text,opacity:selBillSession?1:.5}}>
                          <option value="">— Any —</option>
                          {billTerms.map(t=><option key={t.id} value={t.id}>{t.name}{t.is_active?" (active)":""}</option>)}
                        </select>
                      </div>
                    </div>
                    {billingYear&&billingTerm&&(
                      <div style={{fontSize:12,color:C.muted,marginBottom:8}}>
                        Showing templates for <strong style={{color:C.blue}}>{billingTerm} · {billingYear}</strong>
                      </div>
                    )}
                    {visibleTemplates.length===0?(
                      <div style={{padding:"14px 12px",background:C.orangePale,border:`1px solid ${C.orange}`,
                        borderRadius:8,fontSize:12,color:C.orange,display:"flex",gap:8,alignItems:"flex-start"}}>
                        <AlertCircle size={14} style={{flexShrink:0,marginTop:1}}/>
                        <span>No templates found for <strong>{billingTerm} {billingYear}</strong>. Go to <strong>Billing Templates</strong> to create or copy templates for this period.</span>
                      </div>
                    ):(
                      <Sel label="Billing Template *" value={selectedTemplate} onChange={v=>setSelectedTemplate(v)}
                        options={[{value:"",label:"— Select Template —"},...visibleTemplates.map(t=>({value:String(t.id),label:t.name}))]}/>
                    )}
                  </>
                );
              })()}
              {template&&(
                <div style={{marginTop:10,background:C.bluePale,borderRadius:8,padding:"10px 12px"}}>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
                    <Badge color={C.blue}>{template.academic_year}</Badge>
                    <Badge color={C.purple}>{template.term}</Badge>
                    {template.class_level&&<Badge color={C.orange}>{template.class_level}</Badge>}
                  </div>
                  <div style={{fontSize:12,color:C.muted,marginBottom:4}}>{templateItems.length} items ({templateItems.filter(i=>!i.is_optional).length} compulsory{templateItems.filter(i=>i.is_optional).length>0?`, ${templateItems.filter(i=>i.is_optional).length} optional`:""})</div>
                  <div style={{fontSize:15,fontWeight:800,color:C.green}}>Bill opens at: {fmt(templateCompulsoryTotal)}</div>
                  {templateOptionalTotal>0&&<div style={{fontSize:12,color:C.purple,marginTop:2}}>+ {fmt(templateOptionalTotal)} optional (not included by default)</div>}
                </div>
              )}
            </Card>

            <Card>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{fontWeight:800,color:C.blue,fontSize:14}}>2. Select Groups</div>
                <div style={{display:"flex",gap:6}}>
                  {selectedClasses.size>0&&<span style={{fontSize:12,color:C.orange,fontWeight:700}}>{selectedClasses.size} selected</span>}
                  <Btn xs onClick={()=>setSelectedClasses(new Set(classes.map(c=>c.id)))} color={C.blue} outline>All</Btn>
                  <Btn xs onClick={()=>setSelectedClasses(new Set())} color={C.muted} outline>Clear</Btn>
                </div>
              </div>
              {/* Search */}
              <input placeholder="Search groups…" value={classSearch} onChange={e=>setClassSearch(e.target.value)}
                style={{width:"100%",padding:"7px 10px",border:`1px solid ${C.border}`,borderRadius:7,
                  fontSize:13,marginBottom:8,outline:"none",boxSizing:"border-box"}}/>
              {/* Scrollable checkbox list */}
              <div style={{maxHeight:220,overflowY:"auto",border:`1px solid ${C.border}`,borderRadius:8}}>
                {classes.filter(c=>!classSearch||c.name.toLowerCase().includes(classSearch.toLowerCase())).map((c,i,arr)=>{
                  const stuCount=students.filter(s=>s.class_id===c.id&&(s.status||"active")==="active").length;
                  const checked=selectedClasses.has(c.id);
                  return(
                    <div key={c.id} onClick={()=>toggleClass(c.id)}
                      style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",cursor:"pointer",
                        background:checked?C.orangePale:i%2===0?C.white:C.offWhite,
                        borderBottom:i<arr.length-1?`1px solid ${C.border}`:"none",
                        transition:"background .1s"}}>
                      <input type="checkbox" checked={checked} onChange={()=>toggleClass(c.id)}
                        onClick={e=>e.stopPropagation()}
                        style={{width:15,height:15,accentColor:C.orange,cursor:"pointer",flexShrink:0}}/>
                      <span style={{flex:1,fontSize:13,fontWeight:checked?600:400,color:checked?C.text:C.muted}}>{c.name}</span>
                      <span style={{fontSize:11,color:C.muted,whiteSpace:"nowrap"}}>{stuCount} member{stuCount!==1?"s":""}</span>
                    </div>
                  );
                })}
                {classes.filter(c=>!classSearch||c.name.toLowerCase().includes(classSearch.toLowerCase())).length===0&&(
                  <div style={{padding:"14px 12px",fontSize:13,color:C.muted,textAlign:"center"}}>No groups match</div>
                )}
              </div>
              {targetStudents.length>0&&(
                <div style={{marginTop:10,padding:"8px 12px",background:C.bluePale,borderRadius:8,fontSize:13,color:C.blue}}>
                  <strong>{targetStudents.length}</strong> member{targetStudents.length!==1?"s":""} across <strong>{selectedClasses.size}</strong> group{selectedClasses.size!==1?"es":""} will be billed
                </div>
              )}
              {targetStudents.length>0&&newEnrolleesInClass.length>0&&(
                <div style={{marginTop:8,padding:"10px 12px",background:C.greenPale,border:`1px solid ${C.green}40`,
                  borderRadius:8,fontSize:12,color:C.green,display:"flex",gap:8,alignItems:"flex-start"}}>
                  <UserPlus size={15} style={{flexShrink:0,marginTop:1}}/>
                  <div>
                    <strong>{newEnrolleesInClass.length} new enrolee{newEnrolleesInClass.length!==1?"s":""}</strong> in selection.<br/>
                    {template?.template_type==="new_student"
                      ? <span style={{color:C.green}}>✓ Using a New Enrolee template — admission billing will be included.</span>
                      : <span style={{color:C.amber}}>⚠ You are using a <strong>Returning Members</strong> template. Switch to a <strong>New Enrolee</strong> template to include admission billing.</span>
                    }
                  </div>
                </div>
              )}
            </Card>

            <Card>
              <div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:14}}>3. Due Date (Optional)</div>
              <Inp label="Payment Due Date" type="date" value={dueDate} onChange={v=>setDueDate(v)}/>
            </Card>

          </div>

          {/* Right: Summary + Generate */}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <Card style={{border:`2px solid ${C.orange}`}}>
              <div style={{fontWeight:800,color:C.orange,fontSize:14,marginBottom:14}}>Generation Summary</div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{color:C.muted,fontSize:13}}>Template</span>
                  <strong style={{fontSize:13,color:C.text}}>{template?.name||"—"}</strong>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{color:C.muted,fontSize:13}}>Performance Year</span>
                  <strong style={{fontSize:13,color:C.text}}>{template?.academic_year||"—"}</strong>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{color:C.muted,fontSize:13}}>Period</span>
                  <strong style={{fontSize:13,color:C.text}}>{template?.term||"—"}</strong>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{color:C.muted,fontSize:13}}>Groups Selected</span>
                  <strong style={{fontSize:13,color:C.blue}}>{selectedClasses.size}</strong>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{color:C.muted,fontSize:13}}>Members to Bill</span>
                  <strong style={{fontSize:13,color:C.blue}}>{targetStudents.length}</strong>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{color:C.muted,fontSize:13}}>Bill Opens At (compulsory)</span>
                  <strong style={{fontSize:13,color:C.green}}>{fmt(templateCompulsoryTotal)}</strong>
                </div>
                {templateOptionalTotal>0&&(
                  <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                    <span style={{color:C.muted,fontSize:13}}>Optional Items (not billed)</span>
                    <span style={{fontSize:13,color:C.purple}}>+ {fmt(templateOptionalTotal)}</span>
                  </div>
                )}
                <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0"}}>
                  <span style={{fontWeight:700,fontSize:14,color:C.text}}>Min. Revenue Expected</span>
                  <strong style={{fontSize:16,color:C.green}}>{fmt(templateCompulsoryTotal*targetStudents.length)}</strong>
                </div>
              </div>
              <Btn onClick={generate} color={C.orange} style={{width:"100%",marginTop:8,fontSize:15,padding:"13px"}}
                disabled={generating||!template||!selectedClasses.size||!targetStudents.length}>
                {generating?"Generating...":"Generate Bills"}
              </Btn>
            </Card>

            {genProgress&&(
              <BulkProgressModal
                title="Generating Bills"
                total={genProgress.total}
                current={genProgress.current}
                failed={genProgress.failed}
                isDone={genProgress.done}
                canClose={true}
                onClose={()=>setGenProgress(null)}
              />
            )}

            {results&&(
              <Card style={{border:`2px solid ${results.errors?C.amber:C.green}`}}>
                <div style={{fontWeight:800,color:results.errors?C.amber:C.green,fontSize:14,marginBottom:12}}>
                  Generation Complete
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div style={{textAlign:"center",padding:"12px",background:C.greenPale,borderRadius:8}}>
                    <div style={{fontSize:24,fontWeight:900,color:C.green}}>{results.created}</div>
                    <div style={{fontSize:11,color:C.muted}}>Bills Created</div>
                  </div>
                  <div style={{textAlign:"center",padding:"12px",background:C.offWhite,borderRadius:8}}>
                    <div style={{fontSize:24,fontWeight:900,color:C.amber}}>{results.skipped}</div>
                    <div style={{fontSize:11,color:C.muted}}>Skipped (exists)</div>
                  </div>
                  {results.errors>0&&(
                    <div style={{textAlign:"center",padding:"12px",background:C.redPale,borderRadius:8,gridColumn:"span 2"}}>
                      <div style={{fontSize:24,fontWeight:900,color:C.red}}>{results.errors}</div>
                      <div style={{fontSize:11,color:C.muted}}>Errors</div>
                    </div>
                  )}
                </div>
              </Card>
            )}

            <Card>
              <div style={{fontWeight:700,color:C.muted,fontSize:12,marginBottom:10}}>How bill generation works</div>
              <ul style={{fontSize:12,color:C.muted,lineHeight:1.8,paddingLeft:16,margin:0}}>
                <li>Each member gets one bill per period per performance year</li>
                <li>Members with an existing bill for this period are skipped</li>
                <li>Optional items are included by default (members can opt out)</li>
                <li>Bill amounts are snapshotted — template changes won't affect existing bills</li>
                <li>If any members owe from a previous period, you will be prompted before bills are created</li>
              </ul>
            </Card>
          </div>
        </div>
      )}

      {/* ── Carry-Forward Prompt Modal ──────────────────────────────────────── */}
      {cfPrompt&&(
        <Modal title="Outstanding Balances Detected" onClose={()=>setCfPrompt(null)} width={520}>
          <div style={{padding:"12px 14px",background:C.orangePale,border:`1px solid ${C.orange}`,
            borderRadius:8,marginBottom:16,display:"flex",gap:10,alignItems:"flex-start"}}>
            <AlertCircle size={16} color={C.orange} style={{flexShrink:0,marginTop:1}}/>
            <div style={{fontSize:13,color:C.orange,lineHeight:1.6}}>
              <strong>{cfPrompt.owingStudents.length} member{cfPrompt.owingStudents.length!==1?"s":" "} in your selection</strong> {cfPrompt.owingStudents.length!==1?"have":"has"} an unpaid balance from a previous period.
              Would you like to carry these forward as a line item on their new bill?
            </div>
          </div>

          {/* Member list */}
          <div style={{maxHeight:220,overflowY:"auto",border:`1px solid ${C.border}`,borderRadius:8,marginBottom:16}}>
            {cfPrompt.owingStudents.map((s,i)=>(
              <div key={s.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                padding:"9px 14px",borderBottom:i<cfPrompt.owingStudents.length-1?`1px solid ${C.border}`:"none",
                fontSize:13,background:i%2===0?C.white:C.offWhite}}>
                <span style={{fontWeight:600,color:C.text}}>{s.name}</span>
                <span style={{fontWeight:800,color:C.red}}>{fmt(s.balance)}</span>
              </div>
            ))}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",padding:"8px 14px",
            background:C.offWhite,borderRadius:8,fontSize:13,marginBottom:16}}>
            <span style={{color:C.muted}}>Total outstanding</span>
            <strong style={{color:C.red}}>{fmt(cfPrompt.owingStudents.reduce((a,s)=>a+s.balance,0))}</strong>
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <Btn color={C.orange} style={{width:"100%"}}
              onClick={()=>{const m=cfPrompt.owingMap;setCfPrompt(null);runGenerate(m,true);}}>
              Yes — carry forward outstanding balances into new bills
            </Btn>
            <Btn color={C.blue} outline style={{width:"100%"}}
              onClick={()=>{setCfPrompt(null);runGenerate({},false);}}>
              No — generate bills without carry-forward
            </Btn>
            <Btn color={C.muted} outline style={{width:"100%"}} onClick={()=>setCfPrompt(null)}>
              Cancel
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── PAY ITEM MODAL ───────────────────────────────────────────────────────────
// Extracted as its own component so useState is never called conditionally
export function PayItemModal({bill,studentMap,onClose,onProceed,fmt,C}){
  const st=studentMap[bill.student_id];
  const name=st?fullName(st):bill.student_id;
  const allItems=(bill.fee_bill_items||[]); // show ALL items including previously excluded
  const compulsoryItems=allItems.filter(i=>!i.is_optional);
  const optionalItems=allItems.filter(i=>i.is_optional);
  // init from current is_included state so previously opt-out items start unchecked
  const [selOptional,setSelOptional]=useState(()=>new Set(optionalItems.filter(i=>i.is_included).map(i=>i.id)));
  const [payMode,setPayMode]=useState("full"); // "full" | "partial"
  const [partialAmt,setPartialAmt]=useState("");

  // Only subtract optional items that are currently in the balance (is_included) but being unchecked
  const deselectedOptionalTotal=optionalItems.filter(i=>i.is_included&&!selOptional.has(i.id)).reduce((a,i)=>a+(+i.amount||0),0);
  // Add back optional items that were previously excluded but are now being checked
  const readdedOptionalTotal=optionalItems.filter(i=>!i.is_included&&selOptional.has(i.id)).reduce((a,i)=>a+(+i.amount||0),0);
  const maxPayable=Math.max(0,+(bill.balance||0)-deselectedOptionalTotal+readdedOptionalTotal);
  const payNow=payMode==="full"?maxPayable:Math.min(Math.max(0,+partialAmt||0),maxPayable);
  const canProceed=maxPayable>0&&payNow>0&&(payMode==="full"||(+partialAmt>0&&+partialAmt<=maxPayable));

  return(
    <Modal title="Pay Billing Bill" onClose={onClose} width={520}>
      {/* Bill summary */}
      <div style={{background:C.bluePale,borderRadius:8,padding:"10px 14px",marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:14,color:C.blue}}>{name}</div>
        <div style={{fontSize:12,color:C.muted}}>{bill.term} · {bill.academic_year}</div>
        <div style={{display:"flex",gap:16,marginTop:6,fontSize:13}}>
          <span>Total Bill: <strong>{fmt(bill.total_amount)}</strong></span>
          <span>Paid: <strong style={{color:C.green}}>{fmt(bill.amount_paid)}</strong></span>
          <span>Balance: <strong style={{color:C.red}}>{fmt(bill.balance)}</strong></span>
        </div>
      </div>

      {/* Compulsory items — always included, no checkbox */}
      {compulsoryItems.length>0&&(
        <>
          <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>
            Compulsory Items
          </div>
          <div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden",marginBottom:12}}>
            {compulsoryItems.map((item,i)=>(
              <div key={item.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",
                borderBottom:i<compulsoryItems.length-1?`1px solid ${C.border}`:"none",
                background:C.white}}>
                <Lock size={14} color={C.muted} style={{flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600,color:C.text}}>{item.name}</div>
                  <div style={{fontSize:10,color:C.orange}}>Compulsory</div>
                </div>
                <strong style={{color:C.text,fontSize:13}}>{fmt(item.amount)}</strong>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Optional items — checkboxes (informational only, payment uses bill balance) */}
      {optionalItems.length>0&&(
        <>
          <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>
            Optional Items
          </div>
          <div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden",marginBottom:12}}>
            {optionalItems.map((item,i)=>{
              const checked=selOptional.has(item.id);
              return(
                <label key={item.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",
                  cursor:"pointer",borderBottom:i<optionalItems.length-1?`1px solid ${C.border}`:"none",
                  background:checked?C.white:C.offWhite,transition:"background .1s"}}>
                  <input type="checkbox" checked={checked}
                    onChange={e=>{setSelOptional(prev=>{const n=new Set(prev);e.target.checked?n.add(item.id):n.delete(item.id);return n;});}}
                    style={{width:16,height:16,accentColor:C.purple,cursor:"pointer"}}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:600,color:checked?C.text:C.muted}}>{item.name}</div>
                    <div style={{fontSize:10,color:C.purple}}>Optional</div>
                  </div>
                  <strong style={{color:checked?C.green:C.muted,fontSize:13}}>{fmt(item.amount)}</strong>
                </label>
              );
            })}
          </div>
        </>
      )}

      {/* Payment amount selector */}
      <div style={{background:C.offWhite,borderRadius:8,padding:"12px 14px",marginBottom:14,
        border:`1px solid ${C.border}`}}>
        <div style={{fontSize:12,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:10}}>
          How much would you like to pay?
        </div>
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <button onClick={()=>setPayMode("full")}
            style={{flex:1,padding:"9px",border:`2px solid ${payMode==="full"?C.green:C.border}`,
              borderRadius:8,background:payMode==="full"?C.greenPale:C.white,cursor:"pointer",
              fontWeight:700,fontSize:13,color:payMode==="full"?C.green:C.muted,transition:"all .15s"}}>
            Pay Full Balance<br/>
            <span style={{fontSize:12,fontWeight:400}}>{fmt(maxPayable)}</span>
          </button>
          <button onClick={()=>setPayMode("partial")}
            style={{flex:1,padding:"9px",border:`2px solid ${payMode==="partial"?C.blue:C.border}`,
              borderRadius:8,background:payMode==="partial"?C.bluePale:C.white,cursor:"pointer",
              fontWeight:700,fontSize:13,color:payMode==="partial"?C.blue:C.muted,transition:"all .15s"}}>
            Pay Partial Amount<br/>
            <span style={{fontSize:12,fontWeight:400}}>Enter amount below</span>
          </button>
        </div>
        {payMode==="partial"&&(
          <div>
            <input type="number" value={partialAmt} onChange={e=>setPartialAmt(e.target.value)}
              placeholder={`Enter amount (max ${fmt(maxPayable)})`}
              min={1} max={maxPayable}
              style={{width:"100%",padding:"9px 12px",border:`1.5px solid ${+partialAmt>maxPayable?C.red:C.blue}`,
                borderRadius:8,fontSize:14,fontWeight:600,outline:"none",boxSizing:"border-box"}}/>
            {+partialAmt>maxPayable&&(
              <div style={{fontSize:11,color:C.red,marginTop:4}}>Cannot exceed outstanding balance of {fmt(maxPayable)}</div>
            )}
          </div>
        )}
        <div style={{display:"flex",justifyContent:"space-between",fontSize:15,fontWeight:800,
          marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
          <span style={{color:C.blue}}>You will pay</span>
          <strong style={{color:C.green}}>{fmt(payNow)}</strong>
        </div>
      </div>

      <div style={{display:"flex",gap:10}}>
        <Btn onClick={()=>onProceed(payNow,[...selOptional])} color={C.green} style={{flex:1}} disabled={!canProceed}>
          Continue to Payment →
        </Btn>
        <Btn onClick={onClose} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
      </div>
    </Modal>
  );
}

// ─── STATUS MULTI-SELECT (checkbox dropdown) ─────────────────────────────────
// options: [{value,label,color}]. selected: Set of selected values (empty = all).
function StatusMultiSelect({options,selected,onToggle,onClear}){
  const [open,setOpen]=useState(false);
  const ref=useRef(null);
  useEffect(()=>{
    const handler=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    document.addEventListener("mousedown",handler);
    return()=>document.removeEventListener("mousedown",handler);
  },[]);
  const count=selected.size;
  const label=count===0?"All Statuses":count===1?options.find(o=>selected.has(o.value))?.label:`${count} statuses selected`;
  return(
    <div ref={ref} style={{position:"relative"}}>
      <button onClick={()=>setOpen(o=>!o)}
        style={{padding:"7px 10px",border:`1px solid ${count>0?C.blue:C.border}`,borderRadius:7,fontSize:12,
          background:count>0?C.bluePale:C.white,color:count>0?C.blue:C.text,fontWeight:count>0?700:400,
          cursor:"pointer",display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap"}}>
        {label}<span style={{fontSize:9,opacity:.6}}>{open?"▲":"▼"}</span>
      </button>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,zIndex:200,minWidth:170,
          background:C.white,border:`1.5px solid ${C.border}`,borderRadius:9,boxShadow:"0 8px 24px rgba(0,0,0,.12)",
          padding:6}}>
          {options.map(o=>{
            const checked=selected.has(o.value);
            return(
              <label key={o.value} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 9px",
                cursor:"pointer",borderRadius:6,fontSize:12}}
                onMouseEnter={e=>e.currentTarget.style.background=C.offWhite}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <input type="checkbox" checked={checked} onChange={()=>onToggle(o.value)}
                  style={{width:14,height:14,cursor:"pointer",accentColor:o.color||C.blue}}/>
                <span style={{color:checked?o.color||C.text:C.text,fontWeight:checked?700:400}}>{o.label}</span>
              </label>
            );
          })}
          {count>0&&(
            <button onClick={onClear}
              style={{width:"100%",marginTop:4,padding:"6px 9px",border:"none",borderTop:`1px solid ${C.border}`,
                background:"none",color:C.red,fontSize:11,fontWeight:700,cursor:"pointer",textAlign:"left"}}>
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── BILL DETAIL MODAL ────────────────────────────────────────────────────────
// Shows full compulsory + optional item breakdown. Optional items can be toggled
// (auto-saved to DB). Payment launches directly from here.
export function BillDetailModal({bill,name,payments,compulsoryItems,optionalItems,onClose,onPayment,onBillChange,openInvoicePDF,openReceiptPDF,downloadInvoicePDF,downloadReceiptPDF,shareInvoicePDF,shareReceiptPDF,statusColor,fmt,C,notify}){
  const confirm=useConfirm();
  // Initialise from current is_included state so previously deselected items start unchecked
  const [selOptional,setSelOptional]=useState(()=>new Set(optionalItems.filter(i=>i.is_included).map(i=>i.id)));
  const [toggling,setToggling]=useState(null); // id of item being saved
  const [removingDisc,setRemovingDisc]=useState(null); // id of discount being removed
  const [removingItem,setRemovingItem]=useState(null); // id of item being deleted
  const [editingItem,setEditingItem]=useState(null); // {id, name, amount} — compulsory item being edited
  const [editSaving,setEditSaving]=useState(false);
  // Add-item inline form state
  const [newItemName,setNewItemName]=useState("");
  const [newItemAmount,setNewItemAmount]=useState("");
  const [newItemOptional,setNewItemOptional]=useState(false);
  const [addingItem,setAddingItem]=useState(false);

  // Add a custom line item to this bill (name + amount). Persists via
  // insertFeeBillItems, recalcs totals, then refetches the bill so parent gets
  // the fresh snapshot (new item + updated total_amount/balance).
  const addCustomItem=async()=>{
    const nm=(newItemName||"").trim();
    const amt=+newItemAmount||0;
    if(!nm){notify("Item name is required","warn");return;}
    if(amt<=0){notify("Amount must be greater than zero","warn");return;}
    setAddingItem(true);
    try{
      const payload=[{bill_id:bill.id,name:nm,amount:amt,is_optional:!!newItemOptional,is_included:true}];
      const {error:iErr}=await db.insertFeeBillItems(payload);
      if(iErr){notify(`Failed to add item: ${iErr.message}`,"error");setAddingItem(false);return;}
      const {error:rErr}=await db.recalcBillTotals([bill.id]);
      if(rErr){notify(`Item added but totals failed to refresh: ${rErr.message}`,"warn");}
      await db.logFeeAction({
        bill_id:bill.id,student_id:bill.student_id,
        action:"item_added",amount:amt,
        details:{name:nm,is_optional:!!newItemOptional},
      });
      const {data:fresh}=await db.getFeeBill(bill.id);
      if(fresh) onBillChange(fresh);
      setNewItemName("");setNewItemAmount("");setNewItemOptional(false);
      notify(`Item "${nm}" added ✓`);
    }catch(e){
      notify(`Unexpected error: ${e.message}`,"error");
    }finally{setAddingItem(false);}
  };

  // Remove a custom-added line item
  const removeItem=async(item)=>{
    const ok=await confirm({
      title:"Remove Item?",
      message:`Remove "${item.name}" (${fmt(item.amount)}) from this bill? The bill total and balance will be recalculated.`,
      confirmLabel:"Remove",
      danger:true,
    });
    if(!ok)return;
    setRemovingItem(item.id);
    try{
      const {error:delErr}=await db.deleteFeeBillItems([item.id]);
      if(delErr){notify(`Could not remove item: ${delErr.message}`,"error");setRemovingItem(null);return;}
      const {error:rErr}=await db.recalcBillTotals([bill.id]);
      if(rErr){notify(`Item removed but totals failed to refresh: ${rErr.message}`,"warn");}
      await db.logFeeAction({
        bill_id:bill.id,student_id:bill.student_id,
        action:"item_removed",amount:+item.amount||0,
        details:{name:item.name,is_optional:!!item.is_optional},
      });
      const {data:fresh}=await db.getFeeBill(bill.id);
      if(fresh) onBillChange(fresh);
      notify(`Item "${item.name}" removed ✓`);
    }catch(e){
      notify(`Unexpected error: ${e.message}`,"error");
    }finally{setRemovingItem(null);}
  };

  // Remove a compulsory item with a stronger confirmation (audit-logged, compulsory-specific warning)
  const removeCompulsoryItem=async(item)=>{
    const ok=await confirm({
      title:"Remove Compulsory Item?",
      message:`Remove "${item.name}" (${fmt(item.amount)}) from this bill?\n\nThis is a compulsory item — removing it will reduce the bill total and must be justified. This action is permanently recorded in the audit log.`,
      confirmLabel:"Yes, Remove Item",
      danger:true,
    });
    if(!ok)return;
    setRemovingItem(item.id);
    try{
      const{error:delErr}=await db.deleteFeeBillItems([item.id]);
      if(delErr){notify(`Could not remove item: ${delErr.message}`,"error");setRemovingItem(null);return;}
      const{error:rErr}=await db.recalcBillTotals([bill.id]);
      if(rErr){notify(`Item removed but totals failed to refresh: ${rErr.message}`,"warn");}
      await db.logFeeAction({
        bill_id:bill.id,student_id:bill.student_id,
        action:"item_removed",amount:+item.amount||0,
        details:{name:item.name,is_optional:false,override:"compulsory_item_removed_by_admin"},
      });
      const{data:fresh}=await db.getFeeBill(bill.id);
      if(fresh) onBillChange(fresh);
      notify(`Compulsory item "${item.name}" removed and logged ✓`);
    }catch(e){
      notify(`Unexpected error: ${e.message}`,"error");
    }finally{setRemovingItem(null);}
  };

  // Edit a compulsory item's name and/or amount — confirmation + full audit trail
  const saveEditItem=async()=>{
    if(!editingItem)return;
    const newName=(editingItem.name||"").trim();
    const newAmt=+editingItem.amount||0;
    const origItem=compulsoryItems.find(i=>i.id===editingItem.id);
    if(!newName){notify("Item name cannot be empty","warn");return;}
    if(newAmt<=0){notify("Amount must be greater than zero","warn");return;}
    const nameChanged=newName!==origItem?.name;
    const amtChanged=newAmt!==(+origItem?.amount||0);
    if(!nameChanged&&!amtChanged){setEditingItem(null);return;}
    const changes=[];
    if(nameChanged)changes.push(`Name: "${origItem?.name}" → "${newName}"`);
    if(amtChanged)changes.push(`Amount: ${fmt(origItem?.amount)} → ${fmt(newAmt)}`);
    const ok=await confirm({
      title:"Edit Compulsory Item?",
      message:`Apply the following changes to this bill item?\n\n${changes.join("\n")}\n\nThis action is permanently recorded in the audit log.`,
      confirmLabel:"Save Changes",
      danger:false,
    });
    if(!ok)return;
    setEditSaving(true);
    try{
      const{error:updErr}=await db.updateFeeBillItem(editingItem.id,{name:newName,amount:newAmt});
      if(updErr){notify(`Could not update item: ${updErr.message}`,"error");setEditSaving(false);return;}
      const{error:rErr}=await db.recalcBillTotals([bill.id]);
      if(rErr){notify(`Item updated but totals failed to refresh: ${rErr.message}`,"warn");}
      await db.logFeeAction({
        bill_id:bill.id,student_id:bill.student_id,
        action:"item_edited",amount:newAmt,
        details:{
          prev_name:origItem?.name,new_name:newName,
          prev_amount:+origItem?.amount||0,new_amount:newAmt,
          is_optional:false,override:"compulsory_item_edited_by_admin",
        },
      });
      const{data:fresh}=await db.getFeeBill(bill.id);
      if(fresh) onBillChange(fresh);
      notify(`Item updated and logged ✓`);
      setEditingItem(null);
    }catch(e){
      notify(`Unexpected error: ${e.message}`,"error");
    }finally{setEditSaving(false);}
  };

  // Remove a discount — deletes the row, then recomputes bill totals from scratch
  // so total_amount/balance/status stay consistent with the remaining items and discounts.
  const removeDiscount=async(d)=>{
    const ok=await confirm({
      title:"Remove Discount?",
      message:`Remove "${d.label}" (${fmt(d.amount)}) from this bill? The bill total and balance will be recalculated.`,
      confirmLabel:"Remove",
      danger:true,
    });
    if(!ok)return;
    setRemovingDisc(d.id);
    try{
      const {error:delErr}=await db.deleteFeeDiscount(d.id);
      if(delErr){notify(`Could not remove discount: ${delErr.message}`,"error");setRemovingDisc(null);return;}
      const {error:recErr}=await db.recalcBillTotals([bill.id]);
      if(recErr){notify(`Discount removed but totals failed to refresh — please reload. (${recErr.message})`,"error");}
      await db.logFeeAction({
        bill_id:bill.id,student_id:bill.student_id,
        action:"discount_removed",amount:+d.amount||0,
        details:{label:d.label,type:d.discount_type,value:+d.value||0},
      });
      // Fetch the freshly recalculated bill and hand it back to parent
      const {data:fresh}=await db.getFeeBill(bill.id);
      if(fresh) onBillChange(fresh);
      notify(`Discount "${d.label}" removed ✓`);
    }catch(e){
      notify(`Unexpected error: ${e.message}`,"error");
    }finally{setRemovingDisc(null);}
  };

  // Recompute live total from compulsory sum + selected optional sum
  const compulsoryTotal=compulsoryItems.reduce((a,i)=>a+(+i.amount||0),0);
  const selectedOptTotal=optionalItems.filter(i=>selOptional.has(i.id)).reduce((a,i)=>a+(+i.amount||0),0);
  const liveTotal=compulsoryTotal+selectedOptTotal;
  const discountTotal=(bill.fee_discounts||[]).reduce((a,d)=>a+(+d.amount||0),0);
  const liveBillTotal=Math.max(0,liveTotal-discountTotal);
  const liveBalance=Math.max(0,liveBillTotal-(+bill.amount_paid||0));
  const livePaid=+bill.amount_paid||0;
  const liveStatus=livePaid<=0?"unpaid":liveBalance<=0?"paid":"partial";

  const toggleOptional=async(item)=>{
    const nowChecked=!selOptional.has(item.id);
    setSelOptional(prev=>{const n=new Set(prev);nowChecked?n.add(item.id):n.delete(item.id);return n;});
    setToggling(item.id);
    // Persist is_included change
    const {error:iErr}=await db.updateFeeBillItem(item.id,{is_included:nowChecked});
    if(iErr){notify("Failed to update item — please try again","error");
      // revert
      setSelOptional(prev=>{const n=new Set(prev);nowChecked?n.delete(item.id):n.add(item.id);return n;});
      setToggling(null);return;
    }
    // Recalculate bill totals from DB (items − discounts − paid) — single source of truth
    const {error:rErr}=await db.recalcBillTotals([bill.id]);
    if(rErr){notify("Item toggled but bill total update failed","warn");}
    const {data:fresh}=await db.getFeeBill(bill.id);
    if(fresh) onBillChange(fresh);
    setToggling(null);
  };

  return(
    <Modal title="Bill Details" onClose={onClose} width={540}>
      {/* Header */}
      <div style={{background:C.bluePale,borderRadius:8,padding:"12px 14px",marginBottom:14}}>
        <div style={{fontWeight:800,fontSize:15,color:C.blue}}>{name}</div>
        <div style={{fontSize:12,color:C.muted,marginBottom:6}}>{bill.student_id}</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
          <Badge color={C.blue}>{bill.academic_year}</Badge>
          <Badge color={C.purple}>{bill.term}</Badge>
          <Badge color={statusColor(liveStatus)}>{liveStatus.toUpperCase()}</Badge>
        </div>
        <div style={{display:"flex",gap:16,fontSize:13}}>
          <span>Total: <strong>{fmt(liveBillTotal)}</strong></span>
          <span>Paid: <strong style={{color:C.green}}>{fmt(bill.amount_paid)}</strong></span>
          <span>Balance: <strong style={{color:C.red}}>{fmt(liveBalance)}</strong></span>
        </div>
      </div>

      {/* Compulsory items */}
      {compulsoryItems.length>0&&(
        <>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5}}>Compulsory Items</div>
            <div style={{fontSize:10,color:C.muted,fontStyle:"italic"}}>Edit/remove requires confirmation · logged in audit trail</div>
          </div>
          <div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden",marginBottom:12}}>
            {compulsoryItems.map((item,i)=>(
              <div key={item.id}>
                {/* Normal row */}
                {editingItem?.id!==item.id&&(
                  <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",
                    borderBottom:i<compulsoryItems.length-1?`1px solid ${C.border}`:"none",background:C.white}}>
                    <Lock size={13} color={C.muted} style={{flexShrink:0}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:C.text,wordBreak:"break-word"}}>{item.name}</div>
                      <div style={{fontSize:10,color:C.orange}}>Compulsory</div>
                    </div>
                    <strong style={{color:C.text,fontSize:13,flexShrink:0}}>{fmt(item.amount)}</strong>
                    <button onClick={()=>setEditingItem({id:item.id,name:item.name,amount:String(item.amount)})}
                      disabled={!!removingItem} title="Edit item"
                      style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,
                        padding:"3px 6px",cursor:"pointer",color:C.blue,display:"flex",alignItems:"center",flexShrink:0}}>
                      <Pencil size={13}/>
                    </button>
                    <button onClick={()=>removeCompulsoryItem(item)} disabled={removingItem===item.id}
                      title="Remove item"
                      style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,
                        padding:"3px 6px",cursor:removingItem===item.id?"wait":"pointer",
                        color:C.red,display:"flex",alignItems:"center",flexShrink:0,
                        opacity:removingItem===item.id?0.5:1}}>
                      {removingItem===item.id?<Loader2 size={13} style={{animation:"spin 1s linear infinite"}}/>:<X size={13}/>}
                    </button>
                  </div>
                )}
                {/* Inline edit form */}
                {editingItem?.id===item.id&&(
                  <div style={{padding:"10px 14px",background:C.bluePale,
                    borderBottom:i<compulsoryItems.length-1?`1px solid ${C.border}`:"none",
                    borderLeft:`3px solid ${C.blue}`}}>
                    <div style={{fontSize:11,fontWeight:700,color:C.blue,marginBottom:8}}>Edit Item</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
                      <input value={editingItem.name}
                        onChange={e=>setEditingItem(p=>({...p,name:e.target.value}))}
                        placeholder="Item name" disabled={editSaving}
                        style={{flex:"2 1 160px",padding:"7px 10px",border:`1px solid ${C.border}`,
                          borderRadius:6,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
                      <input type="number" value={editingItem.amount}
                        onChange={e=>setEditingItem(p=>({...p,amount:e.target.value}))}
                        placeholder="Amount" min={0} disabled={editSaving}
                        style={{flex:"1 1 100px",padding:"7px 10px",border:`1px solid ${C.border}`,
                          borderRadius:6,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      <Btn onClick={saveEditItem} color={C.blue} disabled={editSaving||!editingItem.name.trim()||!(+editingItem.amount>0)} style={{fontSize:12,padding:"6px 12px"}}>
                        {editSaving?"Saving…":"Save & Log"}
                      </Btn>
                      <Btn onClick={()=>setEditingItem(null)} color={C.muted} outline disabled={editSaving} style={{fontSize:12,padding:"6px 12px"}}>Cancel</Btn>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Optional items — checkboxes, auto-saved */}
      {optionalItems.length>0&&(
        <>
          <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>Optional Items</div>
          <div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden",marginBottom:12}}>
            {optionalItems.map((item,i)=>{
              const checked=selOptional.has(item.id);
              const busy=toggling===item.id;
              return(
                <label key={item.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",
                  cursor:busy?"wait":"pointer",
                  borderBottom:i<optionalItems.length-1?`1px solid ${C.border}`:"none",
                  background:checked?C.white:C.offWhite,opacity:busy?.6:1,transition:"background .1s,opacity .15s"}}>
                  <input type="checkbox" checked={checked} disabled={busy}
                    onChange={()=>toggleOptional(item)}
                    style={{width:16,height:16,accentColor:C.purple,cursor:"pointer"}}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:600,color:checked?C.text:C.muted}}>{item.name}</div>
                    <div style={{fontSize:10,color:C.purple}}>Optional · {busy?"saving…":"click to toggle"}</div>
                  </div>
                  <strong style={{color:checked?C.green:C.muted,fontSize:13}}>{fmt(item.amount)}</strong>
                  <button onClick={e=>{e.preventDefault();e.stopPropagation();removeItem(item);}} disabled={removingItem===item.id}
                    title="Remove item"
                    style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,
                      padding:"3px 6px",cursor:removingItem===item.id?"wait":"pointer",
                      color:C.red,display:"flex",alignItems:"center",
                      opacity:removingItem===item.id?0.5:1}}>
                    <X size={14}/>
                  </button>
                </label>
              );
            })}
          </div>
        </>
      )}

      {/* Add custom item — inline form */}
      <div style={{border:`1px dashed ${C.border}`,borderRadius:8,padding:"10px 12px",marginBottom:12,background:C.offWhite}}>
        <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>
          Add Custom Item
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <input type="text" placeholder="Item name" value={newItemName}
            onChange={e=>setNewItemName(e.target.value)} disabled={addingItem}
            style={{flex:"2 1 140px",padding:"8px 10px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
          <input type="number" placeholder="Amount" value={newItemAmount}
            onChange={e=>setNewItemAmount(e.target.value)} disabled={addingItem} min={0}
            style={{flex:"1 1 100px",padding:"8px 10px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
          <Btn onClick={addCustomItem} color={C.blue} disabled={addingItem||!newItemName.trim()||!(+newItemAmount>0)} style={{flex:"0 0 auto"}}>
            {addingItem?"Adding…":"Add"}
          </Btn>
        </div>
        <label style={{display:"flex",alignItems:"center",gap:6,marginTop:8,fontSize:12,color:C.muted,cursor:"pointer"}}>
          <input type="checkbox" checked={newItemOptional}
            onChange={e=>setNewItemOptional(e.target.checked)} disabled={addingItem}
            style={{width:14,height:14,accentColor:C.purple,cursor:"pointer"}}/>
          Mark as optional (member can opt out before payment)
        </label>
      </div>

      {/* Discounts */}
      {(bill.fee_discounts||[]).length>0&&(
        <>
          <div style={{fontSize:11,fontWeight:700,color:C.green,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>Discounts Applied</div>
          <div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden",marginBottom:12}}>
            {(bill.fee_discounts||[]).map((d,i)=>(
              <div key={d.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,padding:"9px 14px",
                borderBottom:i<(bill.fee_discounts||[]).length-1?`1px solid ${C.border}`:"none",fontSize:13}}>
                <span style={{color:C.text,flex:1}}>{d.label}{d.discount_type==="percent"?` (${d.value}%)`:""}</span>
                <strong style={{color:C.green}}>− {fmt(d.amount)}</strong>
                <button onClick={()=>removeDiscount(d)} disabled={removingDisc===d.id}
                  title="Remove discount"
                  style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,
                    padding:"3px 6px",cursor:removingDisc===d.id?"wait":"pointer",
                    color:C.red,display:"flex",alignItems:"center",
                    opacity:removingDisc===d.id?0.5:1}}>
                  <X size={14}/>
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Running total */}
      <div style={{background:C.offWhite,borderRadius:8,padding:"10px 14px",marginBottom:14,
        border:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:13,fontWeight:700,color:C.blue}}>Bill Total</span>
        <strong style={{fontSize:16,color:C.green}}>{fmt(liveBillTotal)}</strong>
      </div>

      {/* Payment history */}
      {payments.length>0&&(
        <>
          <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>Payment History</div>
          <div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden",marginBottom:14}}>
            {payments.map((p,i)=>{
              const dt=p.payment_date||p.created_at;
              const dtStr=dt?new Date(dt).toLocaleDateString("en-NG",{day:"2-digit",month:"short",year:"numeric"}):"—";
              return(
                <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                  padding:"9px 14px",borderBottom:i<payments.length-1?`1px solid ${C.border}`:"none",
                  fontSize:13,background:p.is_refunded?"#fef2f2":C.white}}>
                  <div>
                    <div style={{fontWeight:600,color:p.is_refunded?C.red:C.text}}>{dtStr}</div>
                    <div style={{fontSize:11,color:C.muted}}>{p.payment_method==="paystack"?"Paystack":"Bank Transfer"}{p.bank_reference?` · ${p.bank_reference}`:""}{p.is_refunded?" · REFUNDED":""}</div>
                  </div>
                  <strong style={{color:p.is_refunded?C.red:C.green}}>{p.is_refunded?"−":""}{fmt(p.amount)}</strong>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Actions */}
      <div style={{display:"flex",gap:8,marginBottom:6}}>
        <Btn onClick={()=>openInvoicePDF(bill)} color={C.blue} outline style={{flex:1}}>Print Invoice/Receipt</Btn>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:8}}>
        <Btn onClick={()=>downloadInvoicePDF(bill)} color={C.blue} style={{flex:1}}>⬇ Download Invoice/Receipt</Btn>
      </div>
      {/* Share */}
      <div style={{display:"flex",gap:8,marginBottom:10}}>
        <button onClick={()=>shareInvoicePDF&&shareInvoicePDF(bill)}
          style={{flex:1,background:C.blue,border:"none",color:"#fff",padding:"9px 12px",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer"}}>
          Share Invoice/Receipt
        </button>
      </div>
      {bill.status!=="paid"&&(
        <Btn onClick={()=>onPayment(bill,[...selOptional])} color={C.green} style={{width:"100%",marginBottom:8}}>
          Record Payment →
        </Btn>
      )}
      <Btn onClick={onClose} color={C.muted} outline style={{width:"100%"}}>Close</Btn>
    </Modal>
  );
}

// ─── FEE TRACKER PAGE (Admin) ─────────────────────────────────────────────────
export function FeeTrackerPage({ctx}){
  const {notify,user,setPage}=ctx;
  const {schoolName:_schoolName,schoolLogo:_schoolLogo}=useSection();
  const schoolName=_schoolName||"Business Portal";
  const schoolLogo=_schoolLogo||null;
  const [tab,setTab]=useState("invoices"); // "invoices" | "receipts"
  const [bills,setBills]=useState([]);
  const [students,setStudents]=useState([]);
  const [sections,setSections]=useState([]);
  const [classes,setClasses]=useState([]);
  const [allPayments,setAllPayments]=useState([]);
  const [loading,setLoading]=useState(true);

  // Filters
  const [filterStatus,setFilterStatus]=useState("");
  const [filterYear,setFilterYear]=useState("");
  const [filterTerm,setFilterTerm]=useState("");
  const [filterSection,setFilterSection]=useState("");
  const [filterClass,setFilterClass]=useState("");
  const [search,setSearch]=useState("");

  // Modals
  const [payModal,setPayModal]=useState(null);
  const [refundModal,setRefundModal]=useState(null);
  const [discountModal,setDiscountModal]=useState(null);
  const [billDetailModal,setBillDetailModal]=useState(null);
  const [auditModal,setAuditModal]=useState(null);
  const [auditLog,setAuditLog]=useState([]);
  const [auditLoading,setAuditLoading]=useState(false);
  const [discountForm,setDiscountForm]=useState({label:"",discount_type:"fixed",value:""});
  const df=v=>setDiscountForm(p=>({...p,...v}));
  const [payForm,setPayForm]=useState({amount:"",payment_method:"bank_transfer",bank_reference:"",notes:"",payment_date:new Date().toISOString().split("T")[0],selected_optional_ids:[]});
  const pf=v=>setPayForm(p=>({...p,...v}));
  const [payItemModal,setPayItemModal]=useState(null); // item-selector before payment modal
  const [refundForm,setRefundForm]=useState({amount:"",reason:"",payment_id:"",refund_date:new Date().toISOString().split("T")[0]});
  const rf=v=>setRefundForm(p=>({...p,...v}));
  const [saving,setSaving]=useState(false);
  const _payInFlight=useRef(false); // synchronous guard against rapid double-submit
  const [receiptPrompt,setReceiptPrompt]=useState(null); // {bill, st, name, payAmt}
  const [feeEmailQueue,setFeeEmailQueue]=useState(null); // for EmailProgressModal
  const [delProgress,setDelProgress]=useState(null); // {current,total,failed,done}
  const [owingCallout,setOwingCallout]=useState(null); // [{studentId,name,balance,terms}]

  // Bulk selection
  const [selectedIds,setSelectedIds]=useState(new Set());
  const toggleSelect=(id)=>setSelectedIds(prev=>{const s=new Set(prev);s.has(id)?s.delete(id):s.add(id);return s;});
  const clearSelection=()=>setSelectedIds(new Set());

  const load=async()=>{
    setLoading(true);
    // Purge orphaned bills (deleted students) before fetching — runs first
    const{deleted}=await db.deleteOrphanedBills();
    if(deleted>0)console.log(`[FeeTracker] Removed ${deleted} orphaned bill(s) for deleted students`);
    const[b,s,sec,cl,p,sess,trms]=await Promise.all([
      db.getFeeBills(),
      db.getStudents(),
      db.getSections(false),
      db.getClasses(),
      db.getFeePayments(),
      db.getSessions(),
      db.getTerms(),
    ]);
    const allBills=b.data||[];

    // ── Auto-settle carried-forward bills ──
    // Rule: mark a CF bill as settled ONLY when the new-term bill that absorbed
    // it is (a) fully paid AND (b) at least 7 days old (safety window in case the
    // new bill gets deleted or refunded shortly after generation).
    // Time alone is NOT sufficient — the student must have actually paid.
    const ONE_WEEK_MS=7*24*60*60*1000;
    const now=Date.now();
    const cfUnpaid=allBills.filter(bill=>bill.carried_forward&&bill.status!=="paid");
    if(cfUnpaid.length){
      const studentBills={};
      allBills.forEach(bill=>{if(!bill.carried_forward)studentBills[bill.student_id]=(studentBills[bill.student_id]||[]).concat(bill);});
      const toMarkPaid=[];
      cfUnpaid.forEach(cfBill=>{
        const newBills=(studentBills[cfBill.student_id]||[])
          .filter(nb=>nb.academic_year!==cfBill.academic_year||nb.term!==cfBill.term);
        // Both conditions must be true: new bill is fully paid AND ≥7 days old
        const settled=newBills.some(nb=>{
          const isPaid=nb.status==="paid";
          const isOldEnough=(now-new Date(nb.created_at||0).getTime())>=ONE_WEEK_MS;
          return isPaid&&isOldEnough;
        });
        if(settled)toMarkPaid.push(cfBill.id);
      });
      if(toMarkPaid.length){
        await db.markBillsPaid(toMarkPaid);
        // CF line items are intentionally kept on the new bill — they serve as a permanent
        // receipt showing the carried-over debt was included and paid. Deleting them would
        // cause the new bill's balance to go negative (paid > total_amount).
        // Manual "Mark as Settled" in the CF tab still removes them (admin write-off path).
        console.log(`[FeeTracker] Auto-settled ${toMarkPaid.length} carried-forward bill(s) — new bill paid & ≥7 days old`);
        const refreshed=await db.getFeeBills();
        allBills.splice(0,allBills.length,...(refreshed.data||[]));
      }
    }
    const allStudents=s.data||[];
    setBills(allBills);
    setStudents(allStudents);
    setSections(sec.data||[]);
    setClasses(cl.data||[]);
    setAllPayments(p.data||[]);
    // ── Owing-from-previous-term callout ──
    // Only show bills from terms that are strictly BEFORE the current active term.
    // Bills for the current term (not yet due) and future terms are excluded.
    const allSessions=sess.data||[];
    const allTerms=trms.data||[];
    const activeSess=allSessions.find(s=>s.is_active)||allSessions[0];
    const activeTerm=allTerms.find(t=>t.is_active&&t.session_id===activeSess?.id)
      ||allTerms.filter(t=>t.session_id===activeSess?.id)[0];
    const activeTermId=activeTerm?.id||Infinity;
    const activeSessId=activeSess?.id||null;
    // Build a lookup: "termName__sessionName" → term DB id, for all terms in the active session
    const termIdByKey={};
    allTerms.forEach(t=>{
      const sName=allSessions.find(s=>s.id===t.session_id)?.name||"";
      termIdByKey[`${t.name}__${sName}`]=t.id;
    });
    // A bill is "previous term" only if:
    //   - it belongs to the active session AND its term_id < active term_id, OR
    //   - it belongs to a fully past session (session_id < active session_id numerically)
    const owingBills=allBills.filter(b=>{
      if(b.carried_forward||b.status==='paid')return false;
      const _sub=(b.fee_bill_items||[]).filter(x=>x.is_included).reduce((a,x)=>a+(+x.amount||0),0);
      const _disc=(b.fee_discounts||[]).reduce((a,d)=>a+(+d.amount||0),0);
      const _bal=Math.max(0,_sub-_disc-(+b.amount_paid||0));
      if(_bal<=0)return false;
      // Find this bill's session
      const billSess=allSessions.find(s=>s.name===b.academic_year);
      const billSessId=billSess?.id||null;
      // Past session entirely → include
      if(billSessId&&activeSessId&&billSessId<activeSessId)return true;
      // Same session — only include if the bill's term is BEFORE the active term
      if(billSessId===activeSessId){
        const billTermId=termIdByKey[`${b.term}__${b.academic_year}`]||null;
        return billTermId!==null&&billTermId<activeTermId;
      }
      return false;
    });
    // Group by student
    const owingByStudent={};
    owingBills.forEach(b=>{
      if(!owingByStudent[b.student_id])owingByStudent[b.student_id]={balance:0,terms:[]};
      // Use live balance (already computed in the filter above — recompute here for the total)
      const _sub=(b.fee_bill_items||[]).filter(x=>x.is_included).reduce((a,x)=>a+(+x.amount||0),0);
      const _disc=(b.fee_discounts||[]).reduce((a,d)=>a+(+d.amount||0),0);
      const _bal=Math.max(0,_sub-_disc-(+b.amount_paid||0));
      owingByStudent[b.student_id].balance+=_bal;
      owingByStudent[b.student_id].terms.push(`${b.term} ${b.academic_year}`);
    });
    const stuMap=Object.fromEntries(allStudents.map(s=>[s.id,s]));
    const owingList=Object.entries(owingByStudent).map(([sid,d])=>{
      const stu=stuMap[sid];
      return{studentId:sid,name:stu?fullName(stu):sid,
        balance:d.balance,terms:[...new Set(d.terms)]};
    }).filter(x=>x.balance>0);
    setOwingCallout(owingList.length?owingList:null);
    setLoading(false);
  };
  useEffect(()=>{load();},[]);

  const studentMap=Object.fromEntries(students.map(s=>[s.id,s]));
  const classMap=Object.fromEntries(classes.map(c=>[c.id,c]));
  const sectionMap=Object.fromEntries(sections.map(s=>[s.id,s]));

  const years=[...new Set(bills.map(b=>b.academic_year))].filter(Boolean);
  const filteredClasses=filterSection?classes.filter(c=>c.section_id===+filterSection):classes;

  // Compute live bill status from items + discounts + paid (ignores stale DB bill.status).
  // Used for filters, stat counters, and any row that needs up-to-date status.
  const liveBillStatus=(b)=>{
    const subt=(b.fee_bill_items||[]).filter(x=>x.is_included).reduce((a,x)=>a+(+x.amount||0),0);
    const disc=(b.fee_discounts||[]).reduce((a,d)=>a+(+d.amount||0),0);
    const paid=+b.amount_paid||0;
    const bal=Math.max(0,subt-disc-paid);
    return paid<=0?"unpaid":bal<=0?"paid":"partial";
  };
  const applyFilters=(b,includeCF=false)=>{
    if(!studentMap[b.student_id])return false; // student was deleted — hide orphaned bill
    if(b.carried_forward&&!includeCF)return false; // hide carried-forward bills unless explicitly shown
    if(filterStatus&&liveBillStatus(b)!==filterStatus)return false;
    if(filterYear&&b.academic_year!==filterYear)return false;
    if(filterTerm&&b.term!==filterTerm)return false;
    if(filterSection){
      const st=studentMap[b.student_id];
      const classData=st?.class_id?classMap[st.class_id]:null;
      if(classData?.section_id!==+filterSection)return false;
    }
    if(filterClass){
      const st=studentMap[b.student_id];
      if(String(st?.class_id)!==filterClass)return false;
    }
    if(search){
      const st=studentMap[b.student_id];
      const name=st?fullName(st).toLowerCase():"";
      if(!name.includes(search.toLowerCase())&&!String(b.student_id||"").toLowerCase().includes(search.toLowerCase()))return false;
    }
    return true;
  };
  const [showCarriedForward,setShowCarriedForward]=useState(false);
  const [cfSortCol,setCfSortCol]=useState("name");
  const [cfSortDir,setCfSortDir]=useState("asc");
  const toggleCfSort=col=>{setCfSortCol(col);setCfSortDir(p=>cfSortCol===col&&p==="asc"?"desc":"asc");};
  const filtered=bills.filter(b=>applyFilters(b,showCarriedForward));
  const cfCount=bills.filter(b=>b.carried_forward&&applyFilters(b,true)&&!applyFilters(b,false)).length;

  const allSelected=filtered.length>0&&filtered.every(b=>selectedIds.has(b.id));
  const someSelected=!allSelected&&filtered.some(b=>selectedIds.has(b.id));
  const toggleSelectAll=()=>allSelected?clearSelection():setSelectedIds(new Set(filtered.map(b=>b.id)));

  // ── Bulk Delete ────────────────────────────────────────────────────────────
  const bulkDelete=async()=>{
    const targets=filtered.filter(b=>selectedIds.has(b.id));
    const localHasPaid=targets.filter(b=>money(b.amount_paid)>0);
    const localCanDelete=targets.filter(b=>money(b.amount_paid)===0);
    if(!localCanDelete.length){
      notify(`Cannot delete: all ${localHasPaid.length} selected bill(s) have payments. Refund first.`,"error");return;
    }
    const msg=localHasPaid.length
      ?`Delete ${localCanDelete.length} bill(s)? ${localHasPaid.length} bill(s) with payments will be skipped.`
      :`Permanently delete ${localCanDelete.length} bill(s)? This cannot be undone.`;
    const ok=await confirm({title:"Delete Selected Bills?",message:msg,confirmLabel:"Delete",danger:true});
    if(!ok)return;

    const total=targets.length;
    setDelProgress({current:0,total,failed:0,done:false});
    let deleted=0,skipped=0,errors=0;

    // ── Phase 1: re-fetch all bills in parallel batches of 15 ──
    const BATCH=15;
    const freshBills=[];
    for(let i=0;i<targets.length;i+=BATCH){
      const batch=targets.slice(i,i+BATCH);
      const results=await Promise.all(batch.map(b=>fetchFreshBill(b.id)));
      for(const {data:fresh,error:fetchErr} of results){
        if(fetchErr){errors++;continue;}
        if(money(fresh.amount_paid)>0){skipped++;continue;}
        freshBills.push(fresh);
      }
      setDelProgress(p=>({...p,current:Math.min(i+BATCH,total)}));
    }

    // ── Phase 2: single bulk delete + single bulk audit insert ──
    if(freshBills.length){
      const billIds=freshBills.map(b=>b.id);
      const [{error:delErr}]=await Promise.all([
        db.deleteFeeBills(billIds),
        db.logFeeActionBatch(freshBills.map(b=>({
          bill_id:b.id,student_id:b.student_id,action:"bill_deleted",
          details:{term:b.term,year:b.academic_year,total:b.total_amount,paid:b.amount_paid},
        }))),
      ]);
      if(delErr){errors+=freshBills.length;}
      else deleted=freshBills.length;
    }

    setDelProgress(p=>({...p,current:total,failed:errors,done:true}));
    const parts=[
      deleted?`${deleted} deleted`:"",
      skipped?`${skipped} skipped (have payments)`:"",
      errors?`${errors} failed`:"",
    ].filter(Boolean).join(", ");
    notify(parts,(errors||skipped)?"warn":undefined);
    clearSelection();load();
  };

  // ── Bulk Email ─────────────────────────────────────────────────────────────
  const bulkSendReminders=async()=>{
    const targets=filtered.filter(b=>selectedIds.has(b.id)&&b.status!=="paid");
    const withEmail=targets.filter(b=>studentMap[b.student_id]?.email);
    if(!withEmail.length){notify("No selected unpaid bills have a member email on file","error");return;}
    const emails=withEmail.map(bill=>{
      const st=studentMap[bill.student_id];
      const name=fullName(st);
      const classData=st?.class_id?classMap[st.class_id]:null;
      return{
        to:st.email,
        subject:`Billing Payment Reminder \u2014 ${bill.term} ${bill.academic_year}`,
        html:buildEmailHtml(`Billing Payment Reminder \u2014 ${bill.term} ${bill.academic_year}`,[
          `Dear Member/Contact of ${name},`,``,
          `This is a friendly reminder that your ward\u2019s school`,
          `fees for ${bill.term} ${bill.academic_year} are currently outstanding.`,``,
          `ACCOUNT SUMMARY`,
          `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`,
          `Member:    ${name} (${bill.student_id})`,
          `Group:      ${classData?.name||"\u2014"}`,
          `Total Bill: \u20a6${(+bill.total_amount).toLocaleString()}`,
          `Paid:       \u20a6${(+bill.amount_paid).toLocaleString()}`,
          `Balance:    \u20a6${(+bill.balance).toLocaleString()}`,
          `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`,``,
          `Kindly make payment at your earliest convenience.`,``,
          `PAYMENT DETAILS`,
          `Bank:           United Bank of Africa (UBA)`,
          `Account Number: 1021639196`,
          `Reference:      ${bill.student_id}`,``,
          `You may also pay online via the Business Portal:`,
          `${window.location.origin}`,``,
          `For enquiries, contact the finance office.`,
          `Thank you.`,
        ].join("\n"))
      };
    });
    clearSelection();
    setFeeEmailQueue(emails);
  };

  const bulkSendReceipts=async()=>{
    const targets=filtered.filter(b=>selectedIds.has(b.id)&&b.amount_paid>0);
    const withEmail=targets.filter(b=>studentMap[b.student_id]?.email);
    if(!withEmail.length){notify("No selected bills with payments have a member email on file","error");return;}
    const emails=withEmail.map(bill=>{
      const st=studentMap[bill.student_id];
      const name=fullName(st);
      const classData=st?.class_id?classMap[st.class_id]:null;
      const payments=bill.fee_payments||[];
      const lastPay=payments[payments.length-1];
      const amount=lastPay?.amount||bill.amount_paid;
      const method=lastPay?.payment_method==="paystack"?"Paystack Online":"Bank Transfer (UBA)";
      const date=lastPay?.payment_date||"";
      const balance=+bill.balance;
      return{
        to:st.email,
        subject:`Billing Payment Receipt \u2014 ${bill.term} ${bill.academic_year}`,
        html:buildEmailHtml(`Billing Payment Receipt \u2014 ${bill.term} ${bill.academic_year}`,[
          `Dear Member/Contact of ${name},`,``,
          `A fee payment has been received for your ward.`,``,
          `PAYMENT DETAILS`,
          `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`,
          `Member:     ${name} (${bill.student_id})`,
          `Group:       ${classData?.name||"\u2014"}`,
          `Period:        ${bill.term} ${bill.academic_year}`,
          `Amount Paid: \u20a6${(+amount).toLocaleString()}`,
          `Method:      ${method}`,
          `Date:        ${date}`,
          `Balance:     \u20a6${balance.toLocaleString()}`,
          `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`,``,
          balance===0?"Your account is fully paid. Thank you!":`Outstanding balance: \u20a6${balance.toLocaleString()}. Please settle at your earliest convenience.`,``,
          `Please retain this as your official receipt.`,
          `For enquiries, contact the organization finance office.`,
        ].join("\n"))
      };
    });
    clearSelection();
    setFeeEmailQueue(emails);
  };

  // ── PDF helpers ────────────────────────────────────────────────────────────
  const _buildInvoiceHTML=(bill,isReceipt)=>{
    const st=studentMap[bill.student_id];
    const name=st?fullName(st):bill.student_id;
    const classData=st?.class_id?classMap[st.class_id]:null;
    const items=(bill.fee_bill_items||[]).filter(i=>i.is_included);
    const billNo=isReceipt?`JD-RCPT-${String(bill.id).padStart(5,"0")}`:`JD-BILL-${String(bill.id).padStart(5,"0")}`;
    const today=new Date().toLocaleDateString("en-NG",{day:"2-digit",month:"long",year:"numeric"});
    const isPaid=bill.status==="paid";
    const filename=pdfName(name,isReceipt?"RCPT":"INV",billNo.replace(/^JD-(BILL|RCPT)-/,""));
    return{html:buildPDF({bill,items,billNo,today,name,studentId:bill.student_id,className:classData?.name,isPaid,isReceipt,isNativePlatform:isNative(),filename,schoolName,schoolLogo}),filename,name};
  };
  const _isPaid=(bill)=>bill.status==="paid"||(bill.fee_payments||[]).length>0;
  const openBillPDF=(bill)=>{const{html,filename}=_buildInvoiceHTML(bill,_isPaid(bill));openHtmlDoc(html,{title:filename,showPDF:ctx.showPDF});};
  const downloadBillPDF=async(bill)=>{notify("Generating PDF…");const{html,filename}=_buildInvoiceHTML(bill,_isPaid(bill));await downloadPDF(html,filename,false);};
  const shareBillPDF=async(bill)=>{
    notify("Preparing PDF…");
    try{
      const isReceipt=_isPaid(bill);
      const{html,filename}=_buildInvoiceHTML(bill,isReceipt);
      const b64=await htmlToPdfBase64(html,{scale:3,quality:1.0,usePt:false});
      const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
      const blob=new Blob([bytes],{type:"application/pdf"});
      const st=studentMap[bill.student_id];const nm=st?fullName(st):bill.student_id;
      shareFilePDF(blob,filename,`${isReceipt?"Receipt":"Invoice"} — ${nm}`,`${nm} · Period ${bill.term} ${bill.academic_year}`);
    }catch(e){notify("Share failed: "+(e.message||e),"error");}
  };
  // Keep aliases for any existing references
  const openInvoicePDF=openBillPDF;
  const openReceiptPDF=openBillPDF;
  const downloadInvoicePDF=downloadBillPDF;
  const downloadReceiptPDF=downloadBillPDF;
  const shareInvoicePDF=shareBillPDF;
  const shareReceiptPDF=shareBillPDF;

  // ── Helpers ────────────────────────────────────────────────────────────────
  // Always fetch fresh bill data from DB before any mutation — never trust local state
  const fetchFreshBill=async(id)=>{
    const {data,error}=await db.getFeeBill(id);
    if(error||!data){return{error:error||new Error("Bill not found")};}
    return{data};
  };
  // Round to 2 decimal places to prevent floating-point drift
  // Warns loudly if a non-numeric value sneaks in — returns 0 to avoid corrupt totals
  const money=(n)=>{const v=+n;if(isNaN(v)){console.warn("[billing] money() received non-numeric value:",n,"— defaulting to 0");return 0;}return Math.round(v*100)/100;};
  // Derive consistent status from amounts
  const billStatus=(paid,total)=>paid>=total&&total>0?"paid":paid>0?"partial":"unpaid";

  // ── Record Payment ─────────────────────────────────────────────────────────
  const recordPayment=async()=>{
    // ① UI-level validation
    if(!payForm.amount||+payForm.amount<=0){notify("Enter a valid amount","error");return;}
    if(!payForm.payment_date){notify("Payment date is required","error");return;}
    const payAmt=money(payForm.amount);
    // Synchronous double-submit guard (handles the React async-state window)
    if(_payInFlight.current){notify("Payment is already being processed","warn");return;}

    // ② Confirmation dialog — show student name, amount, method before writing to DB
    const _st=payModal&&studentMap[payModal.student_id];
    const _stuName=_st?fullName(_st):"this member";
    const _method=payForm.payment_method==="bank_transfer"?"Bank Transfer":"Paystack Online";
    const _ref=payForm.bank_reference?.trim()?` (Ref: ${payForm.bank_reference.trim()})`:
      payForm.payment_method==="bank_transfer"?" No reference entered":"";
    if(!window.confirm(`Confirm payment record:\n\nStudent: ${_stuName}\nAmount:  ₦${Number(payAmt).toLocaleString()}\nMethod:  ${_method}${_ref}\nDate:    ${payForm.payment_date}\n\nThis will be saved to the database. Continue?`))return;

    _payInFlight.current=true;
    setSaving(true);
    try{
      // ② Re-fetch fresh bill from DB — ignore whatever is in local state
      const {data:fresh,error:fetchErr}=await fetchFreshBill(payModal.id);
      if(fetchErr){notify("Could not verify bill — please refresh and try again","error");setSaving(false);return;}

      // ③ Guard: block if bill is already fully paid
      if(fresh.status==="paid"){
        notify("This bill is already marked as paid. No further payment needed.","error");setSaving(false);return;
      }

      // ④ Sync optional item inclusion and recompute bill total from DB items
      const freshPaid=money(fresh.amount_paid);
      let freshTotal=money(fresh.total_amount);
      const freshItems=fresh.fee_bill_items||[];
      const selectedOptionalIds=new Set(payForm.selected_optional_ids||[]);
      const optionalFreshItems=freshItems.filter(i=>i.is_optional);
      if(optionalFreshItems.length>0){
        const toInclude=optionalFreshItems.filter(i=>selectedOptionalIds.has(i.id)).map(i=>i.id);
        const toExclude=optionalFreshItems.filter(i=>!selectedOptionalIds.has(i.id)).map(i=>i.id);
        await db.setFeeBillItemsInclusion(toInclude,toExclude);
        // Recompute total from actual item amounts
        const compulsorySum=freshItems.filter(i=>!i.is_optional).reduce((a,i)=>a+money(i.amount),0);
        const selectedOptSum=optionalFreshItems.filter(i=>selectedOptionalIds.has(i.id)).reduce((a,i)=>a+money(i.amount),0);
        freshTotal=money(compulsorySum+selectedOptSum);
      }

      // ⑤ Guard: payment must not exceed outstanding balance
      const outstanding=money(freshTotal-freshPaid);
      if(payAmt>outstanding){
        notify(`Payment of ${fmt(payAmt)} exceeds outstanding balance of ${fmt(outstanding)}. Enter the correct amount.`,"error");
        setSaving(false);return;
      }

      // ⑤ Guard: duplicate bank reference check
      if(payForm.payment_method==="bank_transfer"&&payForm.bank_reference?.trim()){
        const {data:dupCheck}=await db.checkDuplicateBankRef(payForm.bank_reference.trim());
        if(dupCheck){
          notify(`Bank reference "${payForm.bank_reference.trim()}" has already been used on another payment. Check and re-enter.`,"error");
          setSaving(false);return;
        }
      }

      // ⑥ Insert payment record
      const {data:payment,error:payErr}=await db.insertFeePayment({
        bill_id:fresh.id,student_id:fresh.student_id,
        amount:payAmt,
        payment_method:payForm.payment_method,
        bank_reference:payForm.bank_reference?.trim()||null,
        notes:payForm.notes?.trim()||null,
        payment_date:payForm.payment_date,
      });
      if(payErr){notify(`Payment failed: ${payErr.message}`,"error");setSaving(false);_payInFlight.current=false;return;}

      // ⑦ Update bill totals — computed from FRESH data, not stale modal state
      const newPaid=money(freshPaid+payAmt);
      const newStatus=billStatus(newPaid,freshTotal);
      const billUpdate={amount_paid:newPaid,status:newStatus};
      if(optionalFreshItems.length>0) billUpdate.total_amount=freshTotal; // persist recomputed total
      const {error:billErr}=await db.upsertFeeBill(billUpdate,fresh.id);
      if(billErr){
        // ⑧ ROLLBACK: payment was inserted but bill update failed — delete the orphaned payment
        await db.deleteFeePayment(payment.id);
        notify(`Critical: bill update failed and the payment was rolled back. Please try again. (${billErr.message})`,"error");
        setSaving(false);return;
      }

      // ⑨ Verify final DB state matches what we computed
      const {data:verify}=await fetchFreshBill(fresh.id);
      if(verify&&money(verify.amount_paid)!==newPaid){
        notify("Warning: final bill balance may be inconsistent. Please review the bill before proceeding.","warn");
      }

      await db.logFeeAction({
        bill_id:fresh.id,student_id:fresh.student_id,
        action:"payment_recorded",amount:payAmt,
        details:{method:payForm.payment_method,reference:payForm.bank_reference?.trim()||null,
          notes:payForm.notes?.trim()||null,prev_paid:freshPaid,new_paid:newPaid,new_status:newStatus},
      });

      notify("Payment recorded ✓");
      // Tier A alert — large payment
      if(payAmt>=100000){
        const _st2=payModal&&studentMap[payModal.student_id];
        db.sendAdminAlert({
          subject:`[Alert] Large Payment — ${fmt(payAmt)}`,
          html:buildAlertEmail("Large Payment Recorded",
            [`Amount: ${fmt(payAmt)}`,`Member: ${_st2?fullName(_st2):fresh.student_id}`,
             `Method: ${payForm.payment_method==="bank_transfer"?"Bank Transfer":"Paystack"}`,
             `Reference: ${payForm.bank_reference?.trim()||"—"}`,
             `Recorded by: ${ctx?.user?.full_name||ctx?.user?.name||"Admin"}`,
             `Time: ${new Date().toLocaleString("en-NG")}`],
            "warn"),
          eventKey:"large_payment"
        });
      }
      const promptSt=studentMap[fresh.id]||studentMap[fresh.student_id];
      const promptName=promptSt?fullName(promptSt):fresh.student_id;
      setReceiptPrompt({bill:{...fresh,amount_paid:newPaid,balance:Math.max(0,freshTotal-newPaid),status:newStatus},payAmt,name:promptName});
      setTimeout(()=>setReceiptPrompt(null),8000);
      setPayModal(null);
      setPayForm({amount:"",payment_method:"bank_transfer",bank_reference:"",notes:"",payment_date:new Date().toISOString().split("T")[0],selected_optional_ids:[]});
      load();
    }catch(e){
      notify(`Unexpected error: ${e.message}. No changes were saved.`,"error");
    }finally{setSaving(false);_payInFlight.current=false;}
  };

  // ── Process Refund ─────────────────────────────────────────────────────────
  const processRefund=async()=>{
    // ① UI-level validation
    if(!refundForm.amount||+refundForm.amount<=0){notify("Enter a valid refund amount","error");return;}
    if(!refundForm.reason.trim()){notify("Refund reason is required","error");return;}
    if(!refundForm.refund_date){notify("Refund date is required","error");return;}
    const refundAmt=money(refundForm.amount);

    setSaving(true);
    try{
      // ② Re-fetch fresh bill from DB
      const {data:fresh,error:fetchErr}=await fetchFreshBill(refundModal.id);
      if(fetchErr){notify("Could not verify bill — please refresh and try again","error");setSaving(false);return;}

      // ③ Guard: refund cannot exceed what has actually been paid (use FRESH data)
      const freshPaid=money(fresh.amount_paid);
      if(refundAmt>freshPaid){
        notify(`Refund of ${fmt(refundAmt)} exceeds amount already paid (${fmt(freshPaid)}). Check the amount.`,"error");
        setSaving(false);return;
      }
      if(freshPaid===0){
        notify("No payment has been recorded on this bill. Nothing to refund.","error");
        setSaving(false);return;
      }

      // ④ If a specific payment is linked, verify it belongs to this bill
      // Use fresh.fee_payments (already fetched via service role) — never the anon client (RLS blocks it)
      if(refundForm.payment_id){
        const pmtInBill=(fresh.fee_payments||[]).find(p=>String(p.id)===String(refundForm.payment_id));
        if(!pmtInBill){
          notify("The linked payment record could not be verified. Clear the payment reference and try again.","error");
          setSaving(false);return;
        }
      }

      // ⑤ Insert refund record
      const {data:refund,error:refErr}=await db.insertFeeRefund({
        bill_id:fresh.id,student_id:fresh.student_id,
        payment_id:refundForm.payment_id||null,
        amount:refundAmt,reason:refundForm.reason.trim(),
        refund_date:refundForm.refund_date,
      });
      if(refErr){notify(`Refund failed: ${refErr.message}`,"error");setSaving(false);return;}

      // ⑥ Update bill — computed from FRESH data
      const newPaid=money(Math.max(0,freshPaid-refundAmt));
      const freshTotal=money(fresh.total_amount);
      const newStatus=billStatus(newPaid,freshTotal);
      const {error:billErr}=await db.upsertFeeBill({amount_paid:newPaid,status:newStatus},fresh.id);
      if(billErr){
        // ⑦ ROLLBACK: delete the orphaned refund record
        await db.deleteFeeRefund(refund.id);
        notify(`Critical: bill update failed and the refund was rolled back. Please try again. (${billErr.message})`,"error");
        setSaving(false);return;
      }

      // Mark the specific payment as refunded so it can't be refunded again
      if(refundForm.payment_id){
        await db.markPaymentRefunded(refundForm.payment_id);
      }

      await db.logFeeAction({
        bill_id:fresh.id,student_id:fresh.student_id,
        action:"refund_processed",amount:refundAmt,
        details:{reason:refundForm.reason.trim(),payment_id:refundForm.payment_id||null,
          prev_paid:freshPaid,new_paid:newPaid,new_status:newStatus},
      });

      notify("Refund processed ✓");
      // Tier A alert — refund issued
      db.sendAdminAlert({
        subject:`[Alert] Billing Refund — ${fmt(refundAmt)}`,
        html:buildAlertEmail("Billing Refund Issued",
          [`Amount: ${fmt(refundAmt)}`,`Reason: ${refundForm.reason.trim()}`,
           `Bill ID: ${fresh.id}`,`Member ID: ${fresh.student_id}`,
           `Processed by: ${ctx?.user?.full_name||ctx?.user?.name||"Admin"}`,
           `Time: ${new Date().toLocaleString("en-NG")}`],
          "warn"),
        eventKey:"refund_issued"
      });
      setRefundModal(null);
      setRefundForm({amount:"",reason:"",payment_id:"",refund_date:new Date().toISOString().split("T")[0]});
      load();
    }catch(e){
      notify(`Unexpected error: ${e.message}. No changes were saved.`,"error");
    }finally{setSaving(false);}
  };

  // ── Clear Refunded Payment History ─────────────────────────────────────────
  // Only callable for payments that have already been fully refunded.
  // The refund already adjusted amount_paid — this is purely a record cleanup.
  const deletePayment=async(bill,payment,isRefunded)=>{
    if(!isRefunded){
      notify("Only refunded payment records can be cleared. Process a refund first.","error");
      return;
    }
    if(!window.confirm(`Clear this ${fmt(payment.amount)} payment record from history?\n\nThe refund has already been processed — this only removes the record. The bill balance is unaffected.`))return;
    setSaving(true);
    try{
      // ① Verify the payment still belongs to this bill (safety check)
      const{data:pmt}=await db.getFeePayment(payment.id);
      if(!pmt||pmt.bill_id!==bill.id){
        notify("Payment record could not be verified. Refresh and try again.","error");
        setSaving(false);return;
      }

      // ② Delete any linked fee_refunds rows for this payment first (FK safety)
      await db.deleteRefundsByPayment(payment.id);

      // ③ Delete the payment record itself
      const{error:delErr}=await db.deleteFeePayment(payment.id);
      if(delErr){notify(`Clear failed: ${delErr.message}`,"error");setSaving(false);return;}

      // ④ Bill amount_paid is NOT touched — the prior refund already corrected it
      await db.logFeeAction({
        bill_id:bill.id,student_id:bill.student_id,
        action:"payment_history_cleared",amount:money(payment.amount),
        details:{payment_id:payment.id,note:"Refunded payment record cleared by admin"},
      });

      notify("Payment history cleared ✓");
      load();
    }catch(e){
      notify(`Unexpected error: ${e.message}`,"error");
    }finally{setSaving(false);}
  };

  // ── Audit Log — Delete single entry (admin only) ──────────────────────────
  const deleteAuditEntry=async(entry)=>{
    if(user.role!=="admin"){notify("Admin only","error");return;}

    // Block deletion of payment_recorded entries that have not been refunded
    if(entry.action==="payment_recorded"){
      const pmtId=entry.details?.payment_id;
      if(!pmtId){
        notify("Cannot remove: this payment entry has no linked payment ID.","error");return;
      }
      // Check if the payment is refunded
      const{data:pmt}=await db.getFeePayment(pmtId);
      if(pmt&&!pmt.is_refunded){
        // Also check fee_refunds table as fallback
        const{data:refRec}=await db.checkRefundByPayment(pmtId);
        if(!refRec){
          notify("Cannot remove: this payment has not been refunded. Process a refund first.","error");
          return;
        }
      }
      // Payment is refunded — also wipe the fee_payments + fee_refunds rows
      // so the student portal clears too
      if(!window.confirm("Remove this payment audit entry and its linked payment/refund records from the member's history? This cannot be undone."))return;
      await Promise.all([
        db.deleteRefundsByPayment(pmtId),
        db.deleteFeePayment(pmtId),
      ]);
    } else {
      if(!window.confirm("Remove this audit entry? This cannot be undone."))return;
    }

    const{error}=await db.deleteFeeAuditEntry(entry.id);
    if(error){notify(`Failed: ${error.message}`,"error");return;}
    setAuditLog(prev=>prev.filter(e=>e.id!==entry.id));
    notify("Entry removed ✓");
    load();
  };

  // ── Audit Log — Clear all history for a bill (admin only) ─────────────────
  // Wipes fee_payments, fee_refunds, and fee_audit_log for the bill.
  // Guard: only allowed when amount_paid = 0 (all payments fully refunded).
  const clearAuditLog=async(billId)=>{
    if(user.role!=="admin"){notify("Admin only","error");return;}

    // Safety: verify bill is fully refunded before allowing wipe
    const{data:fresh,error:fetchErr}=await fetchFreshBill(billId);
    if(fetchErr){notify("Could not verify bill — refresh and try again","error");return;}
    if(money(fresh.amount_paid)>0){
      notify(`Cannot clear: ₦${money(fresh.amount_paid).toLocaleString()} is still recorded as paid. Refund all payments first.`,"error");
      return;
    }

    if(!window.confirm(
      "This will permanently clear:\n• All payment records\n• All refund records\n• The full audit log\n\nfor this bill. The bill itself remains intact.\n\nThis cannot be undone. Continue?"
    ))return;

    const{error:err}=await db.clearBillHistory(billId);
    if(err){notify(`Clear failed: ${err.message}`,"error");return;}

    setAuditLog([]);
    notify("Payment history and audit log cleared ✓");
    load();
  };

  // ── Apply Discount ────────────────────────────────────────────────────────
  const applyDiscount=async()=>{
    // ① UI-level validation
    if(!discountForm.label.trim()){notify("Enter a discount label","error");return;}
    if(!discountForm.value||+discountForm.value<=0){notify("Enter a valid discount value","error");return;}
    if(discountForm.discount_type==="percent"&&+discountForm.value>100){
      notify("Percentage discount cannot exceed 100%","error");return;
    }

    setSaving(true);
    try{
      // ② Re-fetch fresh bill from DB
      const {data:fresh,error:fetchErr}=await fetchFreshBill(discountModal.id);
      if(fetchErr){notify("Could not verify bill — please refresh and try again","error");setSaving(false);return;}

      const freshTotal=money(fresh.total_amount);
      const freshPaid=money(fresh.amount_paid);

      // ③ Compute discount amount from FRESH total
      const discountAmount=discountForm.discount_type==="percent"
        ?money(freshTotal*(+discountForm.value/100))
        :money(Math.min(+discountForm.value,freshTotal));
      if(discountAmount<=0){notify("Discount amount is zero","error");setSaving(false);return;}

      // ④ Guard: discount cannot reduce total below amount already paid
      const newTotal=money(freshTotal-discountAmount);
      if(newTotal<freshPaid){
        notify(`Discount would reduce the bill total to ${fmt(newTotal)}, which is less than what has already been paid (${fmt(freshPaid)}). Process a refund first.`,"error");
        setSaving(false);return;
      }

      // ⑤ Guard: resulting total must be positive
      if(newTotal<0){notify("Discount cannot exceed the total bill amount","error");setSaving(false);return;}

      // ⑥ Insert discount record
      const {data:discount,error:discErr}=await db.insertFeeDiscount({
        bill_id:fresh.id,student_id:fresh.student_id,
        label:discountForm.label.trim(),
        discount_type:discountForm.discount_type,
        value:+discountForm.value,amount:discountAmount,
      });
      if(discErr){notify(`Discount failed: ${discErr.message}`,"error");setSaving(false);return;}

      // ⑦ Recalculate bill totals — single source of truth: items − discounts − paid
      // This keeps total_amount, balance and status perfectly consistent going forward.
      const {error:billErr}=await db.recalcBillTotals([fresh.id]);
      if(billErr){
        // ⑧ ROLLBACK: delete the orphaned discount record
        await db.deleteFeeDiscount(discount.id);
        notify(`Critical: bill update failed and the discount was rolled back. Please try again. (${billErr.message})`,"error");
        setSaving(false);return;
      }
      const newStatus=billStatus(freshPaid,newTotal);

      await db.logFeeAction({
        bill_id:fresh.id,student_id:fresh.student_id,
        action:"discount_applied",amount:discountAmount,
        details:{label:discountForm.label.trim(),type:discountForm.discount_type,value:+discountForm.value,
          prev_total:freshTotal,new_total:newTotal,new_status:newStatus},
      });

      notify(`Discount of ${fmt(discountAmount)} applied ✓`);
      setDiscountModal(null);
      setDiscountForm({label:"",discount_type:"fixed",value:""});
      load();
    }catch(e){
      notify(`Unexpected error: ${e.message}. No changes were saved.`,"error");
    }finally{setSaving(false);}
  };

  // ── View Audit Log ────────────────────────────────────────────────────────
  const openAuditLog=async(bill)=>{
    setAuditModal(bill);setAuditLoading(true);setAuditLog([]);
    const {data}=await db.getFeeAuditLog(bill.id);
    setAuditLog(data||[]);setAuditLoading(false);
  };

  // ── Delete Bill ────────────────────────────────────────────────────────────
  const deleteBill=async(bill)=>{
    // ① Re-fetch from DB — never trust local state for a destructive action
    const {data:fresh,error:fetchErr}=await fetchFreshBill(bill.id);
    if(fetchErr){notify("Could not verify bill — please refresh and try again","error");return;}

    // ② Hard block if any payment exists (must be fully refunded first)
    if(money(fresh.amount_paid)>0){
      notify(`Cannot delete: ₦${(+fresh.amount_paid).toLocaleString()} has been paid. Refund the full amount first.`,"error");return;
    }

    const ok=await confirm({title:"Delete Bill?",
      message:`Permanently delete this bill for ${bill.student_id} (${fresh.term} ${fresh.academic_year})? This cannot be undone.`,
      confirmLabel:"Delete",danger:true});
    if(!ok)return;

    // ③ Re-verify one more time after the confirm dialog (another user could have made a payment in the meantime)
    const {data:recheck}=await fetchFreshBill(fresh.id);
    if(recheck&&money(recheck.amount_paid)>0){
      notify("A payment was recorded on this bill while the dialog was open. Deletion cancelled.","error");return;
    }

    await db.logFeeAction({
      bill_id:fresh.id,student_id:fresh.student_id,
      action:"bill_deleted",
      details:{term:fresh.term,year:fresh.academic_year,total:fresh.total_amount,paid:fresh.amount_paid},
    });

    // Before deleting, find any CF line items on new bills that reference this bill
    // and remove them — keeps new bills accurate
    const {data:linkedCFItems}=await db.getCFLineItemsBySourceBills([fresh.id]);
    const affectedNewBillIds=[...new Set((linkedCFItems||[]).map(i=>i.bill_id))];
    if(linkedCFItems?.length){
      await db.deleteFeeBillItems(linkedCFItems.map(i=>i.id));
    }

    const {error}=await db.deleteFeeBill(fresh.id);
    if(error){notify(`Delete failed: ${error.message}`,"error");return;}

    // Recalculate new bills that lost their CF line item
    if(affectedNewBillIds.length) await db.recalcBillTotals(affectedNewBillIds);

    notify("Bill deleted","warn");load();
  };

  // ── Email Reminder ─────────────────────────────────────────────────────────
  const sendReminder=async(bill)=>{
    const st=studentMap[bill.student_id];
    if(!st?.email){notify("No email on file for this member","error");return;}
    const name=fullName(st);
    const classData=st?.class_id?classMap[st.class_id]:null;
    const html=buildEmailHtml(`Billing Payment Reminder \u2014 ${bill.term} ${bill.academic_year}`,[
      `This communication is regarding:`,
      `${name} \u00b7 Member ID: ${bill.student_id} \u00b7 Group: ${classData?.name||"\u2014"}`,``,
      `Dear Member/Contact,`,``,
      `This is a friendly reminder that your ward\u2019s school`,
      `fees for ${bill.term} ${bill.academic_year} are currently outstanding.`,``,
      `ACCOUNT SUMMARY`,
      `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`,
      `Member:    ${name} (${bill.student_id})`,
      `Group:      ${classData?.name||"\u2014"}`,
      `Total Bill: \u20a6${(+bill.total_amount).toLocaleString()}`,
      `Paid:       \u20a6${(+bill.amount_paid).toLocaleString()}`,
      `Balance:    \u20a6${(+bill.balance).toLocaleString()}`,
      `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`,``,
      `Kindly make payment at your earliest convenience.`,``,
      `PAYMENT DETAILS`,
      `Bank:           United Bank of Africa (UBA)`,
      `Account Number: 1021639196`,
      `Reference:      ${bill.student_id}`,``,
      `You may also pay online via the Business Portal:`,
      `${window.location.origin}`,``,
      `For enquiries, contact the finance office.`,
      `Thank you.`,
    ].join("\n"));
    const res=await sendPortalEmail({to:st.email,subject:`Billing Payment Reminder \u2014 ${bill.term} ${bill.academic_year}`,html});
    if(res.ok)notify(`Reminder sent to ${st.email} \u2713`);
    else notify("Failed to send reminder","error");
  };

  const sendReceipt=async(bill)=>{
    const st=studentMap[bill.student_id];
    if(!st?.email){notify("No email on file for this member","error");return;}
    const name=fullName(st);
    const classData=st?.class_id?classMap[st.class_id]:null;
    const payments=bill.fee_payments||[];
    const lastPay=payments[payments.length-1];
    const amount=lastPay?.amount||bill.amount_paid;
    const method=lastPay?.payment_method==="paystack"?"Paystack Online":"Bank Transfer (UBA)";
    const date=lastPay?.payment_date||new Date().toISOString().split("T")[0];
    const balance=+bill.balance;
    // Build PDF attachment
    const billNo=`JD-RCPT-${String(bill.id).padStart(5,"0")}`;
    const today=new Date().toLocaleDateString("en-NG",{day:"2-digit",month:"long",year:"numeric"});
    const items=(bill.fee_bill_items||[]).filter(i=>i.is_included);
    const isPaid=bill.status==="paid";
    let attachments=[];
    try{
      const pdfHtml=buildPDF({bill,items,billNo,today,name,studentId:bill.student_id,className:classData?.name,isPaid,isReceipt:true,schoolName,schoolLogo});
      const b64=await htmlToPdfBase64(pdfHtml);
      attachments=[{name:`Receipt-${billNo}.pdf`,content:b64,mimeType:"application/pdf"}];
    }catch(e){console.warn("[sendReceipt] PDF generation failed, sending without attachment:",e);}
    const html=buildEmailHtml(`Billing Payment Receipt \u2014 ${bill.term} ${bill.academic_year}`,[
      `This communication is regarding:`,
      `${name} \u00b7 Member ID: ${bill.student_id} \u00b7 Group: ${classData?.name||"\u2014"}`,``,
      `Dear Member/Contact,`,``,
      `A fee payment has been received for your ward.`,``,
      `PAYMENT DETAILS`,
      `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`,
      `Member:     ${name} (${bill.student_id})`,
      `Group:       ${classData?.name||"\u2014"}`,
      `Period:        ${bill.term} ${bill.academic_year}`,
      `Amount Paid: \u20a6${(+amount).toLocaleString()}`,
      `Method:      ${method}`,
      `Date:        ${date}`,
      `Balance:     \u20a6${balance.toLocaleString()}`,
      `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`,``,
      balance===0?"Your account is fully paid. Thank you!":`Outstanding balance: \u20a6${balance.toLocaleString()}. Please settle at your earliest convenience.`,``,
      `Please retain this as your official receipt.`,
      `For enquiries, contact the organization finance office.`,
    ].join("\n"));
    const res=await sendPortalEmail({to:st.email,subject:`Billing Payment Receipt \u2014 ${bill.term} ${bill.academic_year}`,html,attachments});
    if(res.ok)notify(`Receipt sent to ${st.email} \u2713`);
    else notify("Failed to send receipt","error");
  };

  const sendInvoiceEmail=async(bill)=>{
    const st=studentMap[bill.student_id];
    if(!st?.email){notify("No email on file for this member","error");return;}
    const name=fullName(st);
    const classData=st?.class_id?classMap[st.class_id]:null;
    const items=(bill.fee_bill_items||[]).filter(i=>i.is_included);
    // Build PDF attachment
    const billNo=`JD-BILL-${String(bill.id).padStart(5,"0")}`;
    const today=new Date().toLocaleDateString("en-NG",{day:"2-digit",month:"long",year:"numeric"});
    const isPaid=bill.status==="paid";
    let attachments=[];
    try{
      const pdfHtml=buildPDF({bill,items,billNo,today,name,studentId:bill.student_id,className:classData?.name,isPaid,isReceipt:false,schoolName,schoolLogo});
      const b64=await htmlToPdfBase64(pdfHtml);
      attachments=[{name:`Invoice-${billNo}.pdf`,content:b64,mimeType:"application/pdf"}];
    }catch(e){console.warn("[sendInvoiceEmail] PDF generation failed, sending without attachment:",e);}
    const html=buildEmailHtml(`Billing Invoice \u2014 ${bill.term} ${bill.academic_year}`,[
      `This communication is regarding:`,
      `${name} \u00b7 Member ID: ${bill.student_id} \u00b7 Group: ${classData?.name||"\u2014"}`,``,
      `Dear Member/Contact,`,``,
      `Please find below the fee invoice for ${bill.term} ${bill.academic_year}.`,``,
      `INVOICE DETAILS`,
      `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`,
      `Member: ${name} (${bill.student_id})`,
      `Group:   ${classData?.name||"\u2014"}`,
      `Period:    ${bill.term} ${bill.academic_year}`,
      `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`,
      ...(items.length>0?items.map(item=>`${item.fee_item_name||"Billing item"}: \u20a6${(+item.amount).toLocaleString()}`):[]),
      `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`,
      `Total Bill: \u20a6${(+bill.total_amount).toLocaleString()}`,
      `Paid:       \u20a6${(+bill.amount_paid).toLocaleString()}`,
      `Balance:    \u20a6${(+bill.balance).toLocaleString()}`,
      `Status:     ${bill.status?.toUpperCase()}`,
      `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`,``,
      `PAYMENT DETAILS`,
      `Bank:           United Bank of Africa (UBA)`,
      `Account Number: 1021639196`,
      `Reference:      ${bill.student_id}`,``,
      `You may also pay online via the Business Portal:`,
      `${window.location.origin}`,``,
      `For enquiries, contact the finance office.`,
    ].join("\n"));
    const res=await sendPortalEmail({to:st.email,subject:`Billing Invoice \u2014 ${bill.term} ${bill.academic_year}`,html,attachments});
    if(res.ok)notify(`Invoice sent to ${st.email} \u2713`);
    else notify("Failed to send invoice","error");
  };

  // ── Export CSV ─────────────────────────────────────────────────────────────
  const exportCSV=()=>{
    const rows=[["Member ID","Name","Group","Section","Period","Year","Total","Paid","Balance","Status"]];
    filtered.forEach(b=>{
      const st=studentMap[b.student_id];
      const name=st?fullName(st):b.student_id;
      const classData=st?.class_id?classMap[st.class_id]:null;
      const secData=classData?.section_id?sectionMap[classData.section_id]:null;
      const _subt=(b.fee_bill_items||[]).filter(x=>x.is_included).reduce((a,x)=>a+(+x.amount||0),0);
      const _disc=(b.fee_discounts||[]).reduce((a,d)=>a+(+d.amount||0),0);
      const _paid=+b.amount_paid||0;
      const _liveTotal=Math.max(0,_subt-_disc);
      const _liveBal=Math.max(0,_liveTotal-_paid);
      const _liveStat=_liveTotal<=0?'paid':_paid<=0?'unpaid':_liveBal<=0?'paid':'partial';
      rows.push([b.student_id,name,classData?.name||"",secData?.name||"",b.term,b.academic_year,_liveTotal,_paid,_liveBal,_liveStat]);
    });
    const csv=rows.map(r=>r.join(",")).join("\n");
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    a.download=`JD_Billing_${tab}_${Date.now()}.csv`;a.click();
  };

  const statusColor=s=>s==="paid"?C.green:s==="partial"?C.amber:C.red;

  // ── Summaries — always exclude carried-forward bills from financial totals ──
  const activeFiltered=filtered.filter(b=>!b.carried_forward);
  const totalExpected=activeFiltered.reduce((a,b)=>a+(+b.total_amount||0),0);
  const totalCollected=activeFiltered.reduce((a,b)=>a+(+b.amount_paid||0),0);
  const totalOutstanding=activeFiltered.reduce((a,b)=>a+(+b.balance||0),0);

  // Receipts tab: all payments across filtered bills
  const filteredBillIds=new Set(filtered.map(b=>b.id));
  const filteredPayments=allPayments.filter(p=>filteredBillIds.has(p.bill_id));
  const totalRefunded=filtered.reduce((a,b)=>a+(b.fee_refunds||[]).reduce((x,r)=>x+(+r.amount||0),0),0);

  // ── Shared Filters Bar ─────────────────────────────────────────────────────
  // NOTE: kept as plain JSX (not a sub-component) to avoid focus loss on re-render
  const filtersBarJSX=(
    <Card style={{marginBottom:14}}>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr 1fr",gap:10,alignItems:"end"}}>
        <div>
          <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>Search</label>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name or Member ID…"
            style={{width:"100%",padding:"8px 12px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,outline:"none",color:C.text,background:C.white}}/>
        </div>
        <Sel label="Section" value={filterSection} onChange={v=>{setFilterSection(v);setFilterClass("");}}
          options={[{value:"",label:"All Sections"},...sections.map(s=>({value:String(s.id),label:s.name}))]}/>
        <Sel label="Group" value={filterClass} onChange={setFilterClass}
          options={[{value:"",label:"All Groups"},...filteredClasses.map(c=>({value:String(c.id),label:c.name}))]}/>
        <Sel label="Status" value={filterStatus} onChange={setFilterStatus}
          options={[{value:"",label:"All Statuses"},{value:"paid",label:"Paid"},{value:"partial",label:"Partial"},{value:"unpaid",label:"Unpaid"}]}/>
        <Sel label="Year" value={filterYear} onChange={setFilterYear}
          options={[{value:"",label:"All Years"},...years.map(y=>({value:y,label:y}))]}/>
        <Sel label="Period" value={filterTerm} onChange={setFilterTerm}
          options={[{value:"",label:"All Periods"},...TERMS.map(t=>({value:t,label:t}))]}/>
      </div>
      {cfCount>0&&(
        <div style={{marginTop:10,display:"flex",alignItems:"center",gap:10}}>
          <button onClick={()=>setShowCarriedForward(p=>!p)}
            style={{fontSize:12,color:showCarriedForward?C.orange:C.muted,background:"none",border:`1px solid ${showCarriedForward?C.orange:C.border}`,
              borderRadius:6,padding:"4px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
            <History size={13}/>{showCarriedForward?"Hide":"Show"} {cfCount} carried-forward bill{cfCount!==1?"s":""}
          </button>
          {showCarriedForward&&<span style={{fontSize:11,color:C.muted}}>Carried-forward bills are shown for reference only and excluded from financial totals.</span>}
        </div>
      )}
    </Card>
  );

  return(
    <div>
      {/* Page Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="fee-tracker" size={20}/>Payment Tracker</h2>
          <p style={{color:C.muted,fontSize:12}}>Manage invoices, record payments and process refunds</p>
        </div>
        <Btn onClick={exportCSV} color={C.green} outline>Export CSV</Btn>
      </div>

      {/* ── Owing from previous terms callout ── */}
      {owingCallout&&(
        <Card style={{marginBottom:16,border:`2px solid ${C.amber}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <AlertTriangle size={16} color={C.amber}/>
              <span style={{fontWeight:800,color:C.amber,fontSize:14}}>
                Outstanding Balances from Previous Periods — {owingCallout.length} member{owingCallout.length!==1?"s":""}
              </span>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <span style={{fontSize:12,color:C.muted}}>
                Total: <strong style={{color:C.red}}>{fmt(owingCallout.reduce((a,x)=>a+x.balance,0))}</strong>
              </span>
              <Btn xs color={C.orange} onClick={()=>setPage("fee-generate")}>Generate with Carry-Forward →</Btn>
            </div>
          </div>
          <div style={{maxHeight:200,overflowY:"auto",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:6}}>
            {owingCallout.map(x=>(
              <div key={x.studentId} style={{padding:"8px 12px",background:C.orangePale,borderRadius:7,
                border:`1px solid ${C.orange}40`,display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{x.name}</div>
                  <div style={{fontSize:10,color:C.muted}}>{x.terms.join(" · ")}</div>
                </div>
                <span style={{fontSize:12,fontWeight:800,color:C.red,flexShrink:0}}>{fmt(x.balance)}</span>
              </div>
            ))}
          </div>
          <div style={{marginTop:8,fontSize:11,color:C.muted}}>
            These bills are not carried forward yet. Use the Carry-Forward toggle in Bill Generation to include these balances in the new period's bills.
          </div>
        </Card>
      )}

      {/* Summary Cards — Row 1: counts, Row 2: amounts */}
      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:18}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
          <StatCard label="Total Bills" value={filtered.length} icon={<ReceiptText size={18} color={C.blue}/>} color={C.blue}/>
          <StatCard label="Paid" value={filtered.filter(b=>liveBillStatus(b)==="paid").length} icon={<CheckCircle size={18} color={C.green}/>} color={C.green}/>
          <StatCard label="Unpaid" value={filtered.filter(b=>liveBillStatus(b)==="unpaid").length} icon={<XCircle size={18} color={C.red}/>} color={C.red}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
          <StatCard label="Expected" value={fmt(totalExpected)} icon={<DollarSign size={18} color={C.blue}/>} color={C.blue}/>
          <StatCard label="Collected" value={fmt(totalCollected)} icon={<CheckCircle size={18} color={C.green}/>} color={C.green}/>
          <StatCard label="Outstanding" value={fmt(totalOutstanding)} icon={<AlertTriangle size={18} color={C.red}/>} color={C.red}/>
          <StatCard label="Refunded" value={fmt(totalRefunded)} icon={<RotateCcw size={18} color={C.purple}/>} color={C.purple}/>
        </div>
      </div>

      {/* Section Pill Tabs */}
      <SectionPillTabs sections={sections} value={filterSection}
        onChange={v=>{setFilterSection(v);setFilterClass("");}}/>

      {/* Tab Switcher */}
      <div style={{display:"flex",gap:0,marginBottom:16,borderRadius:10,overflow:"hidden",border:`1px solid ${C.border}`,width:"fit-content"}}>
        {[{id:"invoices",label:"Invoices",desc:"Bills & PDF invoices"},
          {id:"receipts",label:"Receipts",desc:"Payments & refunds"},
          {id:"carried-fwd",label:`Carried Forward${bills.filter(b=>b.carried_forward).length?` (${bills.filter(b=>b.carried_forward).length})`:""}`,desc:"Rolled-over balances"}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"10px 28px",border:"none",cursor:"pointer",fontSize:13,fontWeight:700,
              background:tab===t.id?(t.id==="carried-fwd"?C.orange:C.blue):C.white,
              color:tab===t.id?"#fff":t.id==="carried-fwd"?C.orange:C.muted,
              transition:"all .2s"}}>
            {t.label}
          </button>
        ))}
      </div>

      {loading?<Spinner/>:(
        <>
          {filtersBarJSX}

          {/* ── Bulk Action Bar ─────────────────────────────────────────────── */}
          {selectedIds.size>0&&(
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",marginBottom:10,
              background:C.bluePale,border:`1.5px solid ${C.blue}`,borderRadius:10,flexWrap:"wrap"}}>
              <span style={{fontWeight:700,color:C.blue,fontSize:13,flex:1}}>
                {selectedIds.size} bill{selectedIds.size!==1?"s":""} selected
              </span>
              <Btn sm onClick={bulkSendReminders} color={C.blue} outline>Send Reminders</Btn>
              <Btn sm onClick={bulkSendReceipts} color={C.green} outline>Send Receipts</Btn>
              <Btn sm onClick={bulkDelete} color={C.red} outline>Delete Selected</Btn>
              <Btn sm onClick={clearSelection} color={C.muted} outline>Clear</Btn>
            </div>
          )}

          {/* ══ INVOICES TAB ══════════════════════════════════════════════════ */}
          {tab==="invoices"&&(
            <Card>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                  <thead>
                    <tr style={{background:C.blue}}>
                      <th style={{padding:"9px 13px",width:36}}>
                        <input type="checkbox" checked={allSelected} ref={el=>{if(el)el.indeterminate=someSelected;}}
                          onChange={toggleSelectAll}
                          style={{width:15,height:15,cursor:"pointer",accentColor:"#fff"}}/>
                      </th>
                      {["Member","Group","Period / Year","Total","Paid","Balance","Status","Actions"].map((c,i)=>(
                        <th key={i} style={{padding:"9px 13px",color:"#fff",textAlign:"left",fontWeight:700,fontSize:11,whiteSpace:"nowrap"}}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((bill,i)=>{
                      const st=studentMap[bill.student_id];
                      const name=st?fullName(st):bill.student_id;
                      const classData=st?.class_id?classMap[st.class_id]:null;
                      const secData=classData?.section_id?sectionMap[classData.section_id]:null;
                      const checked=selectedIds.has(bill.id);
                      // Compute live totals/status — ignore stale DB bill.balance/total_amount/status
                      const _subt=(bill.fee_bill_items||[]).filter(x=>x.is_included).reduce((a,x)=>a+(+x.amount||0),0);
                      const _disc=(bill.fee_discounts||[]).reduce((a,d)=>a+(+d.amount||0),0);
                      const _tot=Math.max(0,_subt-_disc);
                      const _paid=+bill.amount_paid||0;
                      const _bal=Math.max(0,_tot-_paid);
                      const _stat=_paid<=0?"unpaid":_bal<=0?"paid":"partial";
                      return(
                        <TRow key={bill.id} i={i} cells={[
                          <input type="checkbox" checked={checked} onChange={()=>toggleSelect(bill.id)}
                            style={{width:15,height:15,cursor:"pointer",accentColor:C.blue}}/>,
                          <div>
                            <div style={{display:"flex",alignItems:"center",gap:5,fontWeight:700}}>
                              {name}
                              {_disc>0&&(
                                <span title={`Discount applied: ${fmt(_disc)}`}
                                  style={{display:"inline-flex",alignItems:"center",gap:2,
                                    background:"#f3e8ff",color:"#7c3aed",borderRadius:5,
                                    padding:"1px 5px",fontSize:10,fontWeight:700,whiteSpace:"nowrap"}}>
                                  <Tag size={9}/> {fmt(_disc)}
                                </span>
                              )}
                            </div>
                            <div style={{fontSize:11,color:C.muted}}>{bill.student_id}</div>
                          </div>,
                          <div>
                            <div style={{fontWeight:600,fontSize:12}}>{classData?.name||"—"}</div>
                            {secData&&<div style={{fontSize:10,color:C.muted}}>{secData.name}</div>}
                          </div>,
                          <div>
                            <div style={{fontWeight:600}}>{bill.term}</div>
                            <div style={{fontSize:11,color:C.muted}}>{bill.academic_year}</div>
                          </div>,
                          <strong>{fmt(_tot)}</strong>,
                          <span style={{color:C.green,fontWeight:600}}>{fmt(_paid)}</span>,
                          <strong style={{color:_bal>0?C.red:C.green}}>{fmt(_bal)}</strong>,
                          <div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>
                            <Badge color={statusColor(_stat)}>{_stat.toUpperCase()}</Badge>
                            {bill.carried_forward&&<Badge color={C.muted} style={{fontSize:10}}>Carried Fwd</Badge>}
                          </div>,
                          <ActionsMenu items={[
                            {label:"View Details",    onClick:()=>setBillDetailModal(bill)},
                            {label:"Audit Log",       onClick:()=>openAuditLog(bill),     color:C.muted},
                            null,
                            _stat!=="paid"&&!bill.carried_forward?{label:"Record Payment",  onClick:()=>setPayItemModal(bill), color:C.green}:null,
                            {label:"Apply Discount",  onClick:()=>setDiscountModal(bill), color:C.purple},
                            {label:"Process Refund",  onClick:()=>setRefundModal(bill),   color:C.amber},
                            null,
                            {label:"Print Invoice/Receipt",    onClick:()=>openInvoicePDF(bill)},
                            {label:"Download Invoice/Receipt", onClick:()=>downloadInvoicePDF(bill)},
                            {label:"Send Reminder",   onClick:()=>sendReminder(bill),  disabled:!studentMap[bill.student_id]?.email},
                            {label:"Send Receipt",    onClick:()=>sendReceipt(bill),   disabled:!studentMap[bill.student_id]?.email||(bill.fee_payments||[]).length===0},
                            {label:"Send Invoice",    onClick:()=>sendInvoiceEmail(bill), disabled:!studentMap[bill.student_id]?.email},
                            null,
                            {label:"Share Invoice/Receipt",onClick:()=>shareInvoicePDF(bill)},
                            null,
                            {label:"Delete Bill",     onClick:()=>deleteBill(bill),       danger:true},
                          ].filter(Boolean)}/>
                        ]}/>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!filtered.length&&(
                <EmptyState icon={<AppIcon name="receipt" size={28} color={C.muted}/>} title="No bills found"
                  message="No invoices match the current filters. Generate bills or adjust the filters above."/>
              )}
            </Card>
          )}

          {/* ══ RECEIPTS TAB ══════════════════════════════════════════════════ */}
          {tab==="receipts"&&(
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {/* Payments list per bill */}
              {filtered.filter(b=>(b.fee_payments||[]).length>0||(b.fee_refunds||[]).length>0).map((bill,bi)=>{
                const st=studentMap[bill.student_id];
                const name=st?fullName(st):bill.student_id;
                const classData=st?.class_id?classMap[st.class_id]:null;
                const payments=bill.fee_payments||[];
                const refunds=bill.fee_refunds||[];
                const refundedPmtIds=new Set(refunds.filter(r=>r.payment_id).map(r=>String(r.payment_id)));
                // Live-computed status (ignore stale DB bill.status)
                const _subt=(bill.fee_bill_items||[]).filter(x=>x.is_included).reduce((a,x)=>a+(+x.amount||0),0);
                const _disc=(bill.fee_discounts||[]).reduce((a,d)=>a+(+d.amount||0),0);
                const _paid=+bill.amount_paid||0;
                const _bal=Math.max(0,_subt-_disc-_paid);
                const _stat=_paid<=0?"unpaid":_bal<=0?"paid":"partial";
                return(
                  <Card key={bill.id}>
                    {/* Bill header */}
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",
                      marginBottom:12,paddingBottom:12,borderBottom:`1px solid ${C.border}`}}>
                      <div>
                        <div style={{fontWeight:800,fontSize:14,color:C.blue}}>{name}</div>
                        <div style={{fontSize:12,color:C.muted}}>{bill.student_id} · {classData?.name||""} · {bill.term} {bill.academic_year}</div>
                      </div>
                      <div style={{display:"flex",gap:6,alignItems:"center"}}>
                        <Badge color={statusColor(_stat)}>{_stat.toUpperCase()}</Badge>
                        <Btn xs onClick={()=>openBillPDF(bill)} color={C.purple} outline>Invoice/Receipt PDF</Btn>
                        <Btn xs onClick={()=>setRefundModal(bill)} color={C.red} outline>Refund</Btn>
                      </div>
                    </div>

                    {/* Payments */}
                    {payments.length>0&&(
                      <>
                        <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>Payments</div>
                        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,marginBottom:refunds.length?12:0}}>
                          <Th cols={["Date & Time","Method","Reference","Amount","Status",""]}/>
                          <tbody>
                            {payments.map((p,pi)=>{
                              const ts=p.created_at||p.payment_date;
                              const dtStr=ts?new Date(ts).toLocaleString("en-NG",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:true}):"—";
                              return(
                                <TRow key={p.id} i={pi} cells={[
                                  <span style={{color:C.muted,fontSize:11}}>{dtStr}</span>,
                                  <span>{p.payment_method==="paystack"?"Paystack":"Bank Transfer"}</span>,
                                  <span style={{color:C.muted,fontSize:11}}>{p.bank_reference||p.paystack_reference||"—"}</span>,
                                  <strong style={{color:(p.is_refunded||refundedPmtIds.has(String(p.id)))?C.muted:C.green,textDecoration:(p.is_refunded||refundedPmtIds.has(String(p.id)))?"line-through":"none"}}>{fmt(p.amount)}</strong>,
                                  (p.is_refunded||refundedPmtIds.has(String(p.id)))
                                    ?<Badge color={C.red}>Refunded</Badge>
                                    :<Badge color={C.green}>✓ Paid</Badge>,
                                  (p.is_refunded||refundedPmtIds.has(String(p.id)))
                                    ?<Btn xs onClick={()=>deletePayment(bill,p,true)} color={C.red} outline title="Clear this refunded record from history">Clear</Btn>
                                    :<span style={{fontSize:11,color:C.muted}}>—</span>
                                ]}/>
                              );
                            })}
                          </tbody>
                        </table>
                      </>
                    )}

                    {/* Refunds */}
                    {refunds.length>0&&(
                      <>
                        <div style={{fontSize:11,fontWeight:700,color:C.red,textTransform:"uppercase",letterSpacing:.5,marginBottom:6,marginTop:8}}>Refunds</div>
                        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                          <Th cols={["Date","Reason","Amount"]}/>
                          <tbody>
                            {refunds.map((r,ri)=>(
                              <TRow key={r.id} i={ri} cells={[
                                <span style={{color:C.muted}}>{new Date(r.refund_date).toLocaleDateString("en-NG")}</span>,
                                <span style={{color:C.text}}>{r.reason}</span>,
                                <strong style={{color:C.red}}>−{fmt(r.amount)}</strong>
                              ]}/>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}

                    {/* Summary row */}
                    <div style={{display:"flex",gap:20,marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`,fontSize:12}}>
                      <span style={{color:C.muted}}>Total Bill: <strong style={{color:C.text}}>{fmt(bill.total_amount)}</strong></span>
                      <span style={{color:C.muted}}>Collected: <strong style={{color:C.green}}>{fmt(bill.amount_paid)}</strong></span>
                      <span style={{color:C.muted}}>Refunded: <strong style={{color:C.red}}>{fmt(refunds.reduce((a,r)=>a+(+r.amount||0),0))}</strong></span>
                      <span style={{color:C.muted}}>Balance: <strong style={{color:+bill.balance>0?C.red:C.green}}>{fmt(bill.balance)}</strong></span>
                    </div>
                  </Card>
                );
              })}

              {filtered.filter(b=>(b.fee_payments||[]).length>0||(b.fee_refunds||[]).length>0).length===0&&(
                <Card>
                  <div style={{textAlign:"center",padding:40,color:C.light}}>
                    <div style={{marginBottom:10}}><CreditCard size={36} color={C.muted}/></div>
                    <div style={{fontWeight:700,marginBottom:6}}>No payment records found</div>
                    <div style={{fontSize:13}}>Payments will appear here once recorded</div>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* ══ CARRIED FORWARD TAB ═══════════════════════════════════════════ */}
          {tab==="carried-fwd"&&(()=>{
            const cfBills=bills.filter(b=>b.carried_forward);
            // Build lookup: for each CF bill student, find the new term bill that absorbed it
            const newBillByStudent={};
            bills.filter(b=>!b.carried_forward).forEach(nb=>{
              if(!newBillByStudent[nb.student_id])newBillByStudent[nb.student_id]=[];
              newBillByStudent[nb.student_id].push(nb);
            });
            const cfPaid=cfBills.filter(b=>b.status==="paid").length;
            const cfUnpaidBills=cfBills.filter(b=>b.status!=="paid");
            const cfOriginalDebt=cfBills.reduce((a,b)=>a+(+b.total_amount||0),0);
            const cfCarriedBalance=cfBills.filter(b=>b.status!=="paid").reduce((a,b)=>a+(+b.balance||0),0);
            // Filter CF bills by search/section/class/year/term
            const cfFiltered=cfBills.filter(b=>{
              if(!studentMap[b.student_id])return false;
              if(filterYear&&b.academic_year!==filterYear)return false;
              if(filterTerm&&b.term!==filterTerm)return false;
              if(filterSection){
                const st=studentMap[b.student_id];
                const cd=st?.class_id?classMap[st.class_id]:null;
                if(cd?.section_id!==+filterSection)return false;
              }
              if(filterClass){
                const st=studentMap[b.student_id];
                if(String(st?.class_id)!==filterClass)return false;
              }
              if(search){
                const st=studentMap[b.student_id];
                const nm=st?fullName(st).toLowerCase():"";
                if(!nm.includes(search.toLowerCase())&&!b.student_id.toLowerCase().includes(search.toLowerCase()))return false;
              }
              return true;
            });
            // Sort CF bills
            const cfSorted=[...cfFiltered].sort((a,b)=>{
              const dir=cfSortDir==="asc"?1:-1;
              const stA=studentMap[a.student_id];
              const stB=studentMap[b.student_id];
              const nameA=stA?fullName(stA).toLowerCase():"";
              const nameB=stB?fullName(stB).toLowerCase():"";
              const clsA=stA?.class_id?classMap[stA.class_id]?.name||"":"";
              const clsB=stB?.class_id?classMap[stB.class_id]?.name||"":"";
              if(cfSortCol==="name")return nameA<nameB?-dir:nameA>nameB?dir:0;
              if(cfSortCol==="class")return clsA<clsB?-dir:clsA>clsB?dir:0;
              if(cfSortCol==="term"){
                const tA=`${a.academic_year}${a.term}`;
                const tB=`${b.academic_year}${b.term}`;
                return tA<tB?-dir:tA>tB?dir:0;
              }
              if(cfSortCol==="total")return((+a.total_amount||0)-(+b.total_amount||0))*dir;
              if(cfSortCol==="balance")return((+a.balance||0)-(+b.balance||0))*dir;
              if(cfSortCol==="status")return(a.status||"").localeCompare(b.status||"")*dir;
              return 0;
            });
            const SortTh=({col,label})=>{
              const active=cfSortCol===col;
              return(
                <th onClick={()=>toggleCfSort(col)}
                  style={{padding:"9px 13px",color:"#fff",textAlign:"left",fontWeight:700,fontSize:11,
                    whiteSpace:"nowrap",cursor:"pointer",userSelect:"none",
                    background:active?"rgba(0,0,0,0.15)":"transparent"}}>
                  <span style={{display:"inline-flex",alignItems:"center",gap:4}}>
                    {label}
                    {active?(cfSortDir==="asc"?<ChevronUp size={11}/>:<ChevronDown size={11}/>)
                      :<span style={{opacity:.4}}><ChevronUp size={11}/></span>}
                  </span>
                </th>
              );
            };
            return(
              <div>
                {/* Info banner */}
                <Card style={{marginBottom:14,border:`1.5px solid ${C.orange}`,background:C.orangePale}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                    <History size={20} color={C.orange} style={{marginTop:2,flexShrink:0}}/>
                    <div>
                      <div style={{fontWeight:800,color:C.orange,fontSize:13,marginBottom:4}}>About Carried-Forward Bills</div>
                      <div style={{fontSize:12,color:C.text,lineHeight:1.6}}>
                        These are <strong>old bills whose outstanding balance was rolled into a new period's bill</strong>.
                        The debt has already been included in the member's current invoice — these records are kept for audit purposes only.
                        A carried-forward bill is automatically marked as <em>settled</em> once <strong>the new period's bill has been fully paid</strong> and has been active for at least 7 days (grace period in case the new bill is deleted or refunded).
                      </div>
                    </div>
                  </div>
                </Card>

                {/* CF Summary stats */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
                  <StatCard label="Total CF Bills" value={cfBills.length} icon={<History size={18} color={C.orange}/>} color={C.orange}/>
                  <StatCard label="Auto-Settled" value={cfPaid} icon={<CheckCircle size={18} color={C.green}/>} color={C.green}/>
                  <StatCard label="Awaiting Settlement" value={cfUnpaidBills.length} icon={<Clock size={18} color={C.amber}/>} color={C.amber}/>
                  <StatCard label="Carried Balance" value={fmt(cfCarriedBalance)} icon={<ArrowRight size={18} color={C.red}/>} color={C.red}/>
                </div>

                {cfFiltered.length===0?(
                  <Card>
                    <div style={{textAlign:"center",padding:40,color:C.light}}>
                      <History size={36} color={C.muted} style={{marginBottom:10}}/>
                      <div style={{fontWeight:700,marginBottom:6}}>No carried-forward bills</div>
                      <div style={{fontSize:13}}>When bill balances are rolled into a new period, the old bills will appear here.</div>
                    </div>
                  </Card>
                ):(
                  <Card>
                    <div style={{overflowX:"auto"}}>
                      <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                        <thead>
                          <tr style={{background:C.orange}}>
                            <SortTh col="name"    label="Member"/>
                            <SortTh col="class"   label="Group"/>
                            <SortTh col="term"    label="Original Period"/>
                            <SortTh col="total"   label="Original Bill"/>
                            <SortTh col="balance" label="Carried Balance"/>
                            <SortTh col="status"  label="Status"/>
                            <th style={{padding:"9px 13px",color:"#fff",textAlign:"left",fontWeight:700,fontSize:11,whiteSpace:"nowrap"}}>New Bill</th>
                            <th style={{padding:"9px 13px",color:"#fff",textAlign:"left",fontWeight:700,fontSize:11,whiteSpace:"nowrap"}}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cfSorted.map((bill,i)=>{
                            const st=studentMap[bill.student_id];
                            const name=st?fullName(st):bill.student_id;
                            const classData=st?.class_id?classMap[st.class_id]:null;
                            const secData=classData?.section_id?sectionMap[classData.section_id]:null;
                            // Find corresponding new bill(s) for this student in a different term/year
                            const newBills=(newBillByStudent[bill.student_id]||[])
                              .filter(nb=>nb.academic_year!==bill.academic_year||nb.term!==bill.term);
                            const latestNewBill=newBills.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0];
                            // Settlement status: new bill must be PAID and ≥7 days old
                            const daysSince=latestNewBill
                              ?Math.floor((Date.now()-new Date(latestNewBill.created_at||0).getTime())/(24*60*60*1000))
                              :null;
                            const newBillIsPaid=latestNewBill?.status==="paid";
                            const newBillIsOldEnough=daysSince!==null&&daysSince>=7;
                            // What's blocking auto-settlement?
                            let settlementHint=null;
                            if(bill.status!=="paid"&&latestNewBill){
                              if(!newBillIsPaid&&!newBillIsOldEnough)settlementHint=`Awaiting payment + ${7-daysSince}d grace`;
                              else if(!newBillIsPaid)settlementHint="Awaiting new bill payment";
                              else if(!newBillIsOldEnough)settlementHint=`Grace period: ${7-daysSince}d remaining`;
                            }
                            return(
                              <TRow key={bill.id} i={i} cells={[
                                <div>
                                  <div style={{fontWeight:700}}>{name}</div>
                                  <div style={{fontSize:11,color:C.muted}}>{bill.student_id}</div>
                                </div>,
                                <div>
                                  <div style={{fontWeight:600,fontSize:12}}>{classData?.name||"—"}</div>
                                  {secData&&<div style={{fontSize:10,color:C.muted}}>{secData.name}</div>}
                                </div>,
                                <div>
                                  <div style={{fontWeight:600}}>{bill.term}</div>
                                  <div style={{fontSize:11,color:C.muted}}>{bill.academic_year}</div>
                                </div>,
                                <strong>{fmt(bill.total_amount)}</strong>,
                                <strong style={{color:+bill.balance>0?C.red:C.green}}>{fmt(bill.balance)}</strong>,
                                <div>
                                  {bill.status==="paid"
                                    ?<Badge color={C.green}>SETTLED</Badge>
                                    :<Badge color={C.amber}>PENDING</Badge>}
                                </div>,
                                <div>
                                  {latestNewBill?(
                                    <div>
                                      <div style={{fontSize:11,fontWeight:600,color:newBillIsPaid?C.green:C.blue}}>
                                        {latestNewBill.term} {latestNewBill.academic_year}
                                        {newBillIsPaid&&<span style={{marginLeft:4,color:C.green}}>✓ Paid</span>}
                                      </div>
                                      {bill.status!=="paid"&&settlementHint&&(
                                        <div style={{fontSize:10,color:C.muted,marginTop:2}}>{settlementHint}</div>
                                      )}
                                    </div>
                                  ):<span style={{fontSize:11,color:C.muted}}>—</span>}
                                </div>,
                                <ActionsMenu items={[
                                  {label:"View Details",    onClick:()=>setBillDetailModal(bill)},
                                  {label:"Audit Log",       onClick:()=>openAuditLog(bill), color:C.muted},
                                  null,
                                  {label:"Print Invoice/Receipt",    onClick:()=>openInvoicePDF(bill)},
                                  {label:"Download Invoice/Receipt", onClick:()=>downloadInvoicePDF(bill)},
                                  bill.status!=="paid"?{label:"Mark as Settled",onClick:async()=>{
                                    const ok=await confirm({title:"Mark as Settled?",message:`Mark this carried-forward bill for ${name} (${bill.term} ${bill.academic_year}) as paid/settled?`,confirmLabel:"Mark Settled"});
                                    if(!ok)return;
                                    await db.markBillsPaid([bill.id]);
                                    // Remove CF line item from the linked new bill and recalculate
                                    const {data:linkedItems}=await db.getCFLineItemsBySourceBills([bill.id]);
                                    if(linkedItems?.length){
                                      const affectedBillIds=[...new Set(linkedItems.map(i=>i.bill_id))];
                                      await db.deleteFeeBillItems(linkedItems.map(i=>i.id));
                                      await db.recalcBillTotals(affectedBillIds);
                                    }
                                    notify("Carried-forward bill marked as settled ✓");
                                    load();
                                  },color:C.green}:null,
                                  null,
                                  {label:"Share Invoice/Receipt",onClick:()=>shareInvoicePDF(bill)},
                                  null,
                                  {label:"Delete Bill",     onClick:()=>deleteBill(bill), danger:true},
                                ].filter(Boolean)}/>
                              ]}/>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}
              </div>
            );
          })()}
        </>
      )}

      {/* ── Item Selector Modal (before payment) ────────────────────────── */}
      {payItemModal&&(
        <PayItemModal
          bill={payItemModal}
          studentMap={studentMap}
          onClose={()=>setPayItemModal(null)}
          onProceed={(payableAmount,selectedOptionalIds)=>{setPayItemModal(null);setPayModal(payItemModal);pf({amount:String(payableAmount),selected_optional_ids:selectedOptionalIds||[]});}}
          fmt={fmt}
          C={C}
        />
      )}

      {/* ── Record Payment Modal ──────────────────────────────────────────── */}
      {payModal&&(()=>{
        const st=studentMap[payModal.student_id];
        const name=st?fullName(st):payModal.student_id;
        return(
          <Modal title="Record Payment" onClose={()=>setPayModal(null)}>
            <div style={{background:C.bluePale,borderRadius:8,padding:"10px 14px",marginBottom:14}}>
              <div style={{fontWeight:700,fontSize:14,color:C.blue}}>{name}</div>
              <div style={{fontSize:12,color:C.muted}}>{payModal.term} · {payModal.academic_year}</div>
              <div style={{display:"flex",gap:16,marginTop:6,fontSize:13}}>
                <span>Bill: <strong>{fmt(payModal.total_amount)}</strong></span>
                <span>Paid: <strong style={{color:C.green}}>{fmt(payModal.amount_paid)}</strong></span>
                <span>Balance: <strong style={{color:C.red}}>{fmt(payModal.balance)}</strong></span>
              </div>
            </div>
            <Inp label="Amount (₦) *" type="number" value={payForm.amount} onChange={v=>pf({amount:v})} placeholder="Enter amount"/>
            <Sel label="Payment Method" value={payForm.payment_method} onChange={v=>pf({payment_method:v})}
              options={[{value:"bank_transfer",label:"Bank Transfer (UBA)"},{value:"paystack",label:"Paystack Online"}]}/>
            <Inp label="Bank / Transaction Reference" value={payForm.bank_reference} onChange={v=>pf({bank_reference:v})} placeholder="UBA transaction ref"/>
            <Inp label="Payment Date" type="date" value={payForm.payment_date} onChange={v=>pf({payment_date:v})}/>
            <Inp label="Notes" value={payForm.notes} onChange={v=>pf({notes:v})} placeholder="Optional"/>
            <div style={{display:"flex",gap:10,marginTop:6}}>
              <Btn onClick={recordPayment} color={C.green} style={{flex:1}} disabled={saving}>{saving?"Saving...":"Record Payment"}</Btn>
              <Btn onClick={()=>setPayModal(null)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
            </div>
          </Modal>
        );
      })()}

      {/* ── Refund Modal ─────────────────────────────────────────────────── */}
      {refundModal&&(()=>{
        const st=studentMap[refundModal.student_id];
        const name=st?fullName(st):refundModal.student_id;
        const payments=refundModal.fee_payments||[];
        const refundedIds=new Set((refundModal.fee_refunds||[]).filter(r=>r.payment_id).map(r=>String(r.payment_id)));
        const refundablePayments=payments.filter(p=>!p.is_refunded&&!refundedIds.has(String(p.id)));
        return(
          <Modal title="Process Refund" onClose={()=>{setRefundModal(null);setRefundForm({amount:"",reason:"",payment_id:"",refund_date:new Date().toISOString().split("T")[0]});}}>
            <div style={{background:C.redPale,borderRadius:8,padding:"10px 14px",marginBottom:14,border:`1px solid ${C.red}22`}}>
              <div style={{fontWeight:700,fontSize:14,color:C.red}}>{name}</div>
              <div style={{fontSize:12,color:C.muted}}>{refundModal.term} · {refundModal.academic_year}</div>
              <div style={{display:"flex",gap:16,marginTop:6,fontSize:13}}>
                <span>Total Paid: <strong style={{color:C.green}}>{fmt(refundModal.amount_paid)}</strong></span>
                <span>Max Refund: <strong style={{color:C.red}}>{fmt(refundModal.amount_paid)}</strong></span>
              </div>
            </div>
            {refundablePayments.length>0&&(
              <Sel label="Select payment to refund" value={refundForm.payment_id}
                onChange={v=>{
                  const p=refundablePayments.find(x=>String(x.id)===v);
                  rf({payment_id:v, amount:p?String(p.amount):refundForm.amount});
                }}
                options={[{value:"",label:"— General refund (no specific payment) —"},...refundablePayments.map(p=>{
                  const ts=p.created_at||p.payment_date;
                  const dtStr=ts?new Date(ts).toLocaleString("en-NG",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:true}):"?";
                  return{value:String(p.id),label:`${dtStr} — ${fmt(p.amount)} (${p.payment_method==="paystack"?"Paystack":"Bank"})` };
                })]}/>
            )}
            {payments.length>0&&refundablePayments.length===0&&(
              <div style={{background:C.greenPale,borderRadius:8,padding:"10px 12px",fontSize:12,color:C.green,marginBottom:10}}>
                ✓ All payment records for this bill have already been refunded.
              </div>
            )}
            <Inp label="Refund Amount (₦) *" type="number" value={refundForm.amount} onChange={v=>rf({amount:v})} placeholder="Amount to refund"/>
            <Inp label="Reason for Refund *" value={refundForm.reason} onChange={v=>rf({reason:v})} placeholder="e.g. Duplicate payment, member withdrawal…"/>
            <Inp label="Refund Date" type="date" value={refundForm.refund_date} onChange={v=>rf({refund_date:v})}/>
            <div style={{background:C.orangePale,borderRadius:8,padding:"10px 12px",fontSize:12,color:C.amber,marginBottom:10}}>
              This will reduce the member's recorded payment amount and update their bill status accordingly.
            </div>
            <div style={{display:"flex",gap:10}}>
              <Btn onClick={processRefund} color={C.red} style={{flex:1}} disabled={saving}>{saving?"Processing...":"Process Refund"}</Btn>
              <Btn onClick={()=>{setRefundModal(null);setRefundForm({amount:"",reason:"",payment_id:"",refund_date:new Date().toISOString().split("T")[0]});}} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
            </div>
          </Modal>
        );
      })()}

      {/* ── Audit Log Modal ─────────────────────────────────────────────────── */}
      {auditModal&&(()=>{
        const st=studentMap[auditModal.student_id];
        const name=st?fullName(st):auditModal.student_id;
        const actionLabel={
          bill_generated:"Bill Generated",
          payment_recorded:"Payment Recorded",
          refund_processed:"Refund Processed",
          discount_applied:"Discount Applied",
          discount_removed:"Discount Removed",
          payment_history_cleared:"Payment Cleared",
          bill_deleted:"Bill Deleted",
        };
        const actionColor={
          bill_generated:C.blue,
          payment_recorded:C.green,
          refund_processed:C.amber,
          discount_applied:C.purple,
          discount_removed:C.orange,
          payment_history_cleared:C.red,
          bill_deleted:C.red,
        };
        return(
          <Modal title="Audit Log" onClose={()=>setAuditModal(null)} width={560}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",
              background:C.bluePale,borderRadius:8,padding:"10px 14px",marginBottom:14}}>
              <div>
                <div style={{fontWeight:700,fontSize:14,color:C.blue}}>{name}</div>
                <div style={{fontSize:12,color:C.muted}}>{auditModal.term} · {auditModal.academic_year}</div>
              </div>
              {user.role==="admin"&&auditLog.length>0&&(
                <Btn xs onClick={()=>clearAuditLog(auditModal.id)} color={C.red} outline>Clear All</Btn>
              )}
            </div>
            {auditLoading?<Spinner/>:auditLog.length===0?(
              <div style={{textAlign:"center",padding:32,color:C.light}}>
                <div style={{marginBottom:8}}><ClipboardList size={28} color={C.muted}/></div>
                <div>No audit records for this bill yet</div>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:420,overflowY:"auto"}}>
                {auditLog.map(entry=>(
                  <div key={entry.id} style={{display:"flex",gap:12,padding:"10px 12px",
                    background:C.offWhite,borderRadius:8,border:`1px solid ${C.border}`}}>
                    <div style={{width:4,borderRadius:4,flexShrink:0,
                      background:actionColor[entry.action]||C.muted}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                        <div style={{fontWeight:700,fontSize:13,color:actionColor[entry.action]||C.text}}>
                          {actionLabel[entry.action]||entry.action}
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                          {entry.amount!=null&&(
                            <div style={{fontWeight:800,fontSize:13,
                              color:entry.action==="refund_processed"?C.red:
                                    entry.action==="discount_applied"?C.green:C.green}}>
                              {entry.action==="refund_processed"||entry.action==="discount_applied"?"− ":""}{fmt(entry.amount)}
                            </div>
                          )}
                          {user.role==="admin"&&(
                            <Btn xs onClick={()=>deleteAuditEntry(entry)} color={C.red} outline title="Remove this entry"><Trash2 size={13}/></Btn>
                          )}
                        </div>
                      </div>
                      <div style={{fontSize:11,color:C.muted,marginTop:2}}>
                        By <strong>{entry.performed_by}</strong> · {new Date(entry.created_at).toLocaleString("en-NG",{
                          day:"2-digit",month:"short",year:"numeric",
                          hour:"2-digit",minute:"2-digit"})}
                      </div>
                      {entry.details&&Object.keys(entry.details).length>0&&(
                        <div style={{marginTop:6,fontSize:11,color:C.muted,
                          background:C.white,borderRadius:6,padding:"5px 8px",
                          border:`1px solid ${C.border}`}}>
                          {Object.entries(entry.details)
                            .filter(([k,v])=>v!=null&&v!=="")
                            .map(([k,v])=>(
                              <span key={k} style={{marginRight:10}}>
                                <span style={{textTransform:"capitalize"}}>{k.replace(/_/g," ")}</span>:{" "}
                                <strong>{typeof v==="number"&&k!=="value"?fmt(v):String(v)}</strong>
                              </span>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Btn onClick={()=>setAuditModal(null)} color={C.muted} outline style={{width:"100%",marginTop:14}}>Close</Btn>
          </Modal>
        );
      })()}

      {/* ── Discount Modal ───────────────────────────────────────────────────── */}
      {discountModal&&(()=>{
        const bill=discountModal;
        const st=studentMap[bill.student_id];
        const name=st?fullName(st):bill.student_id;
        const rawPreview=discountForm.value&&+discountForm.value>0
          ?(discountForm.discount_type==="percent"
              ?+(bill.total_amount||0)*(+discountForm.value/100)
              :Math.min(+discountForm.value,+(bill.total_amount||0)))
          :0;
        const previewAmt=Math.round(rawPreview*100)/100;
        const previewNewTotal=Math.max(0,+(bill.total_amount||0)-previewAmt);
        return(
          <Modal title="Apply Discount" onClose={()=>{setDiscountModal(null);setDiscountForm({label:"",discount_type:"fixed",value:""});}}>
            <div style={{background:C.bluePale,borderRadius:8,padding:"10px 14px",marginBottom:14}}>
              <div style={{fontWeight:700,fontSize:14,color:C.blue}}>{name}</div>
              <div style={{fontSize:12,color:C.muted}}>{bill.term} · {bill.academic_year}</div>
              <div style={{display:"flex",gap:20,marginTop:6,fontSize:13}}>
                <span>Current Total: <strong>{fmt(bill.total_amount)}</strong></span>
                <span>Paid: <strong style={{color:C.green}}>{fmt(bill.amount_paid)}</strong></span>
              </div>
            </div>
            <Inp label="Discount Label *" value={discountForm.label} onChange={v=>df({label:v})}
              placeholder="e.g. Staff discount, Scholarship, Sibling discount…"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <Sel label="Discount Type" value={discountForm.discount_type} onChange={v=>df({discount_type:v})}
                options={[{value:"fixed",label:"₦ Fixed Amount"},{value:"percent",label:"% Percentage"}]}/>
              <Inp label={discountForm.discount_type==="percent"?"Percentage (%) *":"Amount (₦) *"}
                type="number" value={discountForm.value} onChange={v=>df({value:v})}
                placeholder={discountForm.discount_type==="percent"?"e.g. 10":"e.g. 20000"}/>
            </div>
            {previewAmt>0&&(
              <div style={{background:C.greenPale,borderRadius:8,padding:"12px 14px",marginTop:6,
                border:`1px solid ${C.green}44`}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:6}}>
                  <span style={{color:C.muted}}>Discount Amount</span>
                  <strong style={{color:C.green}}>− {fmt(previewAmt)}</strong>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:14,fontWeight:800,
                  paddingTop:6,borderTop:`1px solid ${C.green}33`}}>
                  <span style={{color:C.blue}}>New Bill Total</span>
                  <strong style={{color:C.blue}}>{fmt(previewNewTotal)}</strong>
                </div>
              </div>
            )}
            {(bill.fee_discounts||[]).length>0&&(
              <div style={{marginTop:8,background:C.offWhite,borderRadius:8,padding:"8px 12px"}}>
                <div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:6,
                  textTransform:"uppercase",letterSpacing:.5}}>Previously Applied</div>
                {(bill.fee_discounts||[]).map(d=>(
                  <div key={d.id} style={{display:"flex",justifyContent:"space-between",
                    fontSize:12,color:C.muted,padding:"2px 0"}}>
                    <span>{d.label}{d.discount_type==="percent"?` (${d.value}%)`:""}</span>
                    <span style={{color:C.green}}>− {fmt(d.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{display:"flex",gap:10,marginTop:10}}>
              <Btn onClick={applyDiscount} color={C.green} style={{flex:1}} disabled={saving}>
                {saving?"Applying...":"Apply Discount"}
              </Btn>
              <Btn onClick={()=>{setDiscountModal(null);setDiscountForm({label:"",discount_type:"fixed",value:""}); }} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
            </div>
          </Modal>
        );
      })()}

      {/* ── Bill Detail Modal ─────────────────────────────────────────────── */}
      {billDetailModal&&(()=>{
        const st=studentMap[billDetailModal.student_id];
        const name=st?fullName(st):billDetailModal.student_id;
        const payments=billDetailModal.fee_payments||[];
        const allItems=billDetailModal.fee_bill_items||[];
        const compulsoryItems=allItems.filter(i=>!i.is_optional);
        const optionalItems=allItems.filter(i=>i.is_optional);
        return(
          <BillDetailModal
            bill={billDetailModal}
            name={name}
            payments={payments}
            compulsoryItems={compulsoryItems}
            optionalItems={optionalItems}
            onClose={()=>setBillDetailModal(null)}
            onPayment={(bill,optionalIds)=>{
              setBillDetailModal(null);
              setPayModal(bill);
              pf({amount:String(Math.max(0,bill.balance||0)),selected_optional_ids:optionalIds});
            }}
            onBillChange={updatedBill=>{
              // Refresh the bill in local state and reopen detail
              setBillDetailModal(updatedBill);
              setBills(prev=>prev.map(b=>b.id===updatedBill.id?{...b,...updatedBill}:b));
            }}
            openInvoicePDF={openInvoicePDF}
            openReceiptPDF={openReceiptPDF}
            downloadInvoicePDF={downloadInvoicePDF}
            downloadReceiptPDF={downloadReceiptPDF}
            shareInvoicePDF={shareInvoicePDF}
            shareReceiptPDF={shareReceiptPDF}
            statusColor={statusColor}
            fmt={fmt}
            C={C}
            notify={notify}
          />
        );
      })()}

      {/* ── Payment receipt prompt ─────────────────────────────────────────── */}
      {receiptPrompt&&(
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",
          background:C.white,border:`2px solid ${C.blue}`,borderRadius:14,
          padding:"14px 20px",boxShadow:"0 8px 32px rgba(0,0,0,.18)",
          zIndex:9999,display:"flex",gap:14,alignItems:"center",minWidth:340,maxWidth:420}}>
          <div style={{flex:1}}>
            <div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:3}}>Send receipt to parent?</div>
            <div style={{fontSize:12,color:C.muted}}>Payment of ₦{(+receiptPrompt.payAmt).toLocaleString()} for {receiptPrompt.name}</div>
          </div>
          <Btn sm onClick={()=>{sendReceipt(receiptPrompt.bill);setReceiptPrompt(null);}} color={C.green}>Email</Btn>
          <Btn sm onClick={async()=>{
            await shareBillPDF(receiptPrompt.bill);
            setReceiptPrompt(null);
          }} color={C.blue}>Share</Btn>
          <Btn sm onClick={()=>setReceiptPrompt(null)} color={C.muted} outline>Skip</Btn>
        </div>
      )}
      {feeEmailQueue&&<EmailProgressModal emails={feeEmailQueue} onClose={()=>setFeeEmailQueue(null)}/>}
      {delProgress&&(
        <BulkProgressModal
          title="Deleting Bills"
          total={delProgress.total}
          current={delProgress.current}
          failed={delProgress.failed}
          isDone={delProgress.done}
          canClose={true}
          onClose={()=>setDelProgress(null)}
        />
      )}
    </div>
  );
}


// ─── FEE STATISTICS PAGE (Admin) ──────────────────────────────────────────────
export function FeeStatsPage({ctx}){
  const {schoolName:_sectionName,schoolLogo:_sectionLogo}=useSection();
  const [bills,setBills]=useState([]);
  const [payments,setPayments]=useState([]);
  const [students,setStudents]=useState([]);
  const [classes,setClasses]=useState([]);
  const [sections,setSections]=useState([]);
  const [loading,setLoading]=useState(true);
  const [filterYear,setFilterYear]=useState("");
  const [filterTerm,setFilterTerm]=useState("");
  const [filterSection,setFilterSection]=useState("");
  const [panel,setPanel]=useState(null);
  const [panelSearch,setPanelSearch]=useState("");
  const [itemPanel,setItemPanel]=useState(null);
  const [viewMode,setViewMode]=useState("overview"); // "overview" | "items"
  const [selItem,setSelItem]=useState("");
  const [itemClassFilter,setItemClassFilter]=useState("");
  const [itemStatusFilter,setItemStatusFilter]=useState(new Set()); // multi-select — empty = all statuses
  const [itemSearch,setItemSearch]=useState("");
  const [feeItems,setFeeItems]=useState([]);
  const [filterClass,setFilterClass]=useState("");
  const [stuLedger,setStuLedger]=useState(null); // {studentId,studentName}
  const [pdfOrientation,setPdfOrientation]=useState("portrait"); // "portrait"|"landscape"
  const [reportSortBy,setReportSortBy]=useState("class"); // "class"|"name"|"status"|"balance"|"paid"
  // Privacy Mode — hides Naira figures in every generated report (all reports funnel through
  // pdfWrap), for when a report is handed to staff who shouldn't see financial details.
  // Defaults OFF each session so it's a deliberate choice, not a silent default.
  const [privacyMode,setPrivacyMode]=useState(false);
  const [dbSchoolName,setDbSchoolName]=useState(""); // fallback from portal settings
  const [dbSchoolLogo,setDbSchoolLogo]=useState(""); // fallback from portal settings

  useEffect(()=>{
    Promise.all([
      db.getFeeBills(),db.getFeePayments(),db.getStudents(),
      db.getClasses(),db.getSections(false),db.getSessions(),db.getFeeItems(),
      db.getPortalSettings?.()??Promise.resolve({data:null}),
      db.getSchools?.()??Promise.resolve({data:[]}),
    ]).then(([b,p,s,cl,sec,sess,fi,ps,sc])=>{
      // Recompute balance/status from embedded items+discounts so discounted bills
      // are never shown as owing, even if recalcBillTotals wasn't called for older records.
      const enrichedBills=(b.data||[]).map(bill=>{
        const subt=(bill.fee_bill_items||[]).filter(x=>x.is_included).reduce((a,x)=>a+(+x.amount||0),0);
        const disc=(bill.fee_discounts||[]).reduce((a,d)=>a+(+d.amount||0),0);
        const paid=+bill.amount_paid||0;
        const liveTotal=Math.max(0,subt-disc);
        const liveBal=Math.max(0,liveTotal-paid);
        const liveStatus=liveTotal<=0?'paid':paid<=0?'unpaid':liveBal<=0?'paid':'partial';
        return{...bill,total_amount:liveTotal,balance:liveBal,status:liveStatus};
      });
      setBills(enrichedBills);setPayments(p.data||[]);setStudents(s.data||[]);
      setClasses(cl.data||[]);setSections(sec.data||[]);setFeeItems(fi.data||[]);
      // Fallback school name/logo from portal settings or schools table
      const settings=ps?.data||{};
      const sch=(sc?.data||[])[0]||{};
      setDbSchoolName(settings.school_name||sch.name||"");
      setDbSchoolLogo(settings.portal_logo_base64||sch.logo||"");
      const activeSess=sess.data?.find(x=>x.is_active);
      if(activeSess){
        setFilterYear(prev=>prev||activeSess.name||"");
        db.getTerms(activeSess.id).then(({data:td})=>{
          const at=td?.find(x=>x.is_active)||td?.[0];
          if(at)setFilterTerm(prev=>prev||at.name||"");
        });
      }
      setLoading(false);
    });
  },[]);

  const studentMap=Object.fromEntries(students.map(s=>[s.id,s]));
  const classMap=Object.fromEntries(classes.map(c=>[c.id,c]));
  const years=[...new Set(bills.map(b=>b.academic_year))].filter(Boolean);

  const filteredBills=useMemo(()=>bills.filter(b=>{
    if(filterYear&&b.academic_year!==filterYear)return false;
    if(filterTerm&&b.term!==filterTerm)return false;
    if(filterSection){
      const st=studentMap[b.student_id];
      const cls=st?.class_id?classMap[st.class_id]:null;
      if(String(cls?.section_id)!==filterSection)return false;
    }
    if(filterClass){
      const st=studentMap[b.student_id];
      if(String(st?.class_id||"")!==filterClass)return false;
    }
    return true;
  }),[bills,filterYear,filterTerm,filterSection,filterClass,studentMap,classMap]);

  const filteredPayments=useMemo(()=>payments.filter(p=>{
    const bill=bills.find(b=>b.id===p.bill_id);
    if(!bill)return false;
    if(filterYear&&bill.academic_year!==filterYear)return false;
    if(filterTerm&&bill.term!==filterTerm)return false;
    if(filterSection){
      const st=studentMap[bill.student_id];
      const cls=st?.class_id?classMap[st.class_id]:null;
      if(String(cls?.section_id)!==filterSection)return false;
    }
    return true;
  }),[payments,bills,filterYear,filterTerm,filterSection,studentMap,classMap]);

  const totalExpected=filteredBills.reduce((a,b)=>a+(+b.total_amount||0),0);
  const totalCollected=filteredBills.reduce((a,b)=>a+(+b.amount_paid||0),0);
  const totalOutstanding=filteredBills.reduce((a,b)=>a+(+b.balance||0),0);
  const collectionRate=totalExpected>0?Math.round((totalCollected/totalExpected)*100):0;
  const paidBills=filteredBills.filter(b=>b.status==="paid");
  const partialBills=filteredBills.filter(b=>b.status==="partial");
  const unpaidBills=filteredBills.filter(b=>b.status==="unpaid");

  // Daily inflow (last 30 days)
  const last30=Array.from({length:30},(_,i)=>{const d=new Date();d.setDate(d.getDate()-29+i);return d.toISOString().split("T")[0];});
  const dailyInflow=last30.map(day=>{
    const dayPayments=filteredPayments.filter(p=>p.payment_date&&p.payment_date.startsWith(day));
    const total=dayPayments.reduce((a,b)=>a+(+b.amount||0),0);
    return{day:day.slice(5),total,payments:dayPayments,date:day};
  });
  const maxDaily=Math.max(...dailyInflow.map(d=>d.total),1);

  // Payment method split
  const paystackTotal=filteredPayments.filter(p=>p.payment_method==="paystack").reduce((a,b)=>a+(+b.amount||0),0);
  const bankTotal=filteredPayments.filter(p=>p.payment_method==="bank_transfer").reduce((a,b)=>a+(+b.amount||0),0);
  const grandPayTotal=paystackTotal+bankTotal||1;

  // Top defaulters
  const defaulters=filteredBills.filter(b=>+b.balance>0).sort((a,b)=>(+b.balance)-(+a.balance));

  // Recent payments
  const recentPayments=[...filteredPayments].sort((a,b)=>new Date(b.created_at||b.payment_date)-new Date(a.created_at||a.payment_date));

  // ── Group collection leaderboard ───────────────────────────────────────────
  const classLeaderboard=useMemo(()=>{
    const map={};
    filteredBills.forEach(b=>{
      const st=studentMap[b.student_id];
      const cls=st?.class_id?classMap[st.class_id]:null;
      const key=cls?.name||"Unknown";
      if(!map[key])map[key]={name:key,classId:String(st?.class_id||""),expected:0,collected:0,outstanding:0,paid:0,partial:0,unpaid:0,count:0};
      map[key].expected+=(+b.total_amount||0);
      map[key].collected+=(+b.amount_paid||0);
      map[key].outstanding+=(+b.balance||0);
      if(b.status==="paid")map[key].paid++;
      else if(b.status==="partial")map[key].partial++;
      else map[key].unpaid++;
      map[key].count++;
    });
    return Object.values(map)
      .map(c=>({...c,rate:c.expected>0?Math.round((c.collected/c.expected)*100):0}))
      .sort((a,b)=>a.rate-b.rate);
  },[filteredBills,studentMap,classMap]);

  // ── Refund stats ───────────────────────────────────────────────────────────
  const refundStats=useMemo(()=>{
    const all=filteredBills.flatMap(b=>(b.fee_refunds||[]).map(r=>({...r,student_id:b.student_id,term:b.term,year:b.academic_year})));
    const total=all.reduce((a,r)=>a+(+r.amount||0),0);
    return{all,total,count:all.length};
  },[filteredBills]);

  // ── Discount stats ─────────────────────────────────────────────────────────
  const discountStats=useMemo(()=>{
    const all=filteredBills.flatMap(b=>(b.fee_discounts||[]).map(d=>({...d,term:b.term,year:b.academic_year})));
    const total=all.reduce((a,d)=>a+(+d.amount||0),0);
    // Group by label for breakdown
    const byLabel={};
    all.forEach(d=>{const k=d.label||"Unnamed";if(!byLabel[k])byLabel[k]={label:k,total:0,count:0};byLabel[k].total+=(+d.amount||0);byLabel[k].count++;});
    const breakdown=Object.values(byLabel).sort((a,b)=>b.total-a.total);
    return{all,total,count:all.length,breakdown};
  },[filteredBills]);

  // ── At-risk: partial bills where last payment was >30 days ago ─────────────
  const atRisk=useMemo(()=>{
    const cutoff=new Date();cutoff.setDate(cutoff.getDate()-30);
    return filteredBills.filter(b=>{
      if(b.status!=="partial")return false;
      const pays=(b.fee_payments||[]).filter(p=>!p.is_refunded);
      if(!pays.length)return false;
      const lastDate=pays.reduce((mx,p)=>{const d=new Date(p.payment_date||p.created_at);return d>mx?d:mx;},new Date(0));
      return lastDate<cutoff;
    }).sort((a,b)=>(+b.balance)-(+a.balance));
  },[filteredBills]);

  // ── Billing Item Breakdown ─────────────────────────────────────────────────────
  const itemBreakdown=useMemo(()=>{
    const map={};
    filteredBills.forEach(bill=>{
      (bill.fee_bill_items||[]).filter(i=>i.is_included!==false).forEach(item=>{
        const name=item.name||item.item_name||"Unnamed Item";
        if(!map[name])map[name]={name,totalBilled:0,bills:[],optional:!!item.is_optional};
        map[name].totalBilled+=+(item.amount||0);
        map[name].bills.push(bill);
      });
    });
    return Object.values(map).sort((a,b)=>b.bills.length-a.bills.length);
  },[filteredBills]);

  // Helpers
  const stuName=sid=>{const s=studentMap[sid];return s?fullName(s):sid;};
  const stuClass=sid=>{const s=studentMap[sid];return s?.class_id?classMap[s.class_id]?.name||"—":"—";};

  const openPanel=(title,color,blist)=>{setPanel({title,color,bills:blist});setPanelSearch("");};
  const closePanel=()=>{setPanel(null);setPanelSearch("");};

  // ── PDF Generation Engine ─────────────────────────────────────────────────
  const schoolName=_sectionName||dbSchoolName||"Business Portal";
  const schoolLogo=_sectionLogo||dbSchoolLogo||"";
  const filterLabel=[filterYear,filterTerm].filter(Boolean).join(" · ")||"All Periods";

  // ── Bill sort helper — applies to all student-list PDFs ───────────────────
  const sortBillsFn=(bills)=>{
    const s=[...bills];
    if(reportSortBy==="class") return s.sort((a,b)=>stuClass(a.student_id).localeCompare(stuClass(b.student_id))||stuName(a.student_id).localeCompare(stuName(b.student_id)));
    if(reportSortBy==="name")  return s.sort((a,b)=>stuName(a.student_id).localeCompare(stuName(b.student_id)));
    if(reportSortBy==="status"){
      const o={paid:0,partial:1,unpaid:2};
      return s.sort((a,b)=>(o[a.status]??3)-(o[b.status]??3)||stuClass(a.student_id).localeCompare(stuClass(b.student_id)));
    }
    if(reportSortBy==="balance") return s.sort((a,b)=>(+b.balance||0)-(+a.balance||0));
    if(reportSortBy==="paid")    return s.sort((a,b)=>(+b.amount_paid||0)-(+a.amount_paid||0));
    return s;
  };
  const sortLabel={class:"Group",name:"Name (A–Z)",status:"Status",balance:"Balance ↓",paid:"Amount Paid ↓"}[reportSortBy]||"Group";

  // Privacy Mode masking — every report funnels through pdfWrap, so masking the ₦-prefixed
  // figures here (the exact, distinctive output of fmt()) covers all 14+ report generators
  // from one place. Only ever touches "₦<digits>" text, never CSS/layout, so it's safe to
  // run over the full HTML string.
  const maskMoney=(html)=>html.replace(/₦[\d,]+(\.\d+)?/g,"₦•••••");

  const pdfWrap=(title,body,orient=pdfOrientation)=>{
    const isLandscape=orient==="landscape";
    if(privacyMode) body=maskMoney(body);
    const logoHtml=schoolLogo
      ?`<img src="${schoolLogo}" alt="${schoolName}" style="height:${isLandscape?"60px":"72px"};object-fit:contain;margin-bottom:10px;display:block;margin-left:auto;margin-right:auto;border-radius:4px;"/>`
      :`<div style="width:${isLandscape?"56px":"68px"};height:${isLandscape?"56px":"68px"};border-radius:50%;background:linear-gradient(135deg,#1A4FA0,#0d2d6e);display:flex;align-items:center;justify-content:center;margin:0 auto 10px;font-size:${isLandscape?"22pt":"26pt"};font-weight:900;color:#fff;font-family:Georgia,serif;">🏫</div>`;
    const confidentialMsg=`Confidential — For authorised use of ${schoolName} only.`;
    const genDate=new Date().toLocaleString("en-NG",{day:"2-digit",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"});
    return`<!DOCTYPE html><html><head>
<meta charset="utf-8"/><title>${title} — ${schoolName}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Segoe UI',system-ui,Arial,sans-serif;font-size:${isLandscape?"9.5pt":"10.5pt"};color:#1e293b;background:#fff;}
/* ── Print bar (screen only) ── */
.print-bar{position:fixed;top:0;left:0;right:0;z-index:9999;
  background:linear-gradient(90deg,#0d2d6e,#1A4FA0);color:#fff;
  padding:11px 22px;display:flex;align-items:center;justify-content:space-between;gap:12px;
  font-family:inherit;box-shadow:0 2px 12px rgba(0,0,0,.25);}
.pb-title{font-weight:800;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:52vw;letter-spacing:-.2px;}
.pb-meta{font-size:10.5px;opacity:.65;white-space:nowrap;}
.pb-btns{display:flex;gap:8px;flex-shrink:0;}
.pb-btns button{border:none;border-radius:8px;padding:8px 18px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:opacity .15s;}
.btn-save{background:#fff;color:#1A4FA0;}
.btn-close{background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.28)!important;}
.bar-spacer{height:50px;}
/* ── Cover ── */
.cover{padding:${isLandscape?"18px 32px 16px":"26px 32px 20px"};
  background:linear-gradient(160deg,#0d2d6e 0%,#1A4FA0 50%,#1e56b0 100%);
  color:#fff;margin-bottom:22px;position:relative;overflow:hidden;}
.cover::after{content:"";position:absolute;top:-40px;right:-40px;width:220px;height:220px;
  border-radius:50%;background:rgba(255,255,255,.05);pointer-events:none;}
.cover-inner{position:relative;z-index:1;text-align:center;}
.school-name{font-size:${isLandscape?"16pt":"19pt"};font-weight:900;color:#fff;letter-spacing:-.4px;margin-bottom:2px;line-height:1.2;}
.school-sub{font-size:9pt;color:rgba(255,255,255,.6);margin-bottom:14px;}
.report-badge{display:inline-block;background:rgba(255,255,255,.15);
  border:1px solid rgba(255,255,255,.3);border-radius:20px;
  padding:5px 18px;font-size:${isLandscape?"11pt":"12pt"};font-weight:800;
  color:#fff;letter-spacing:-.2px;margin-bottom:8px;}
.cover-meta{font-size:8.5pt;color:rgba(255,255,255,.55);margin-top:6px;}
.cover-meta span{margin:0 8px;}
/* ── Content ── */
.body-wrap{padding:0 ${isLandscape?"20px":"16px"};}
.section{margin-bottom:22px;break-inside:avoid;}
.section-head{font-size:${isLandscape?"10pt":"11pt"};font-weight:800;color:#1A4FA0;
  padding:8px 14px;background:#EFF6FF;border-left:4px solid #1A4FA0;
  margin-bottom:10px;border-radius:0 6px 6px 0;display:flex;align-items:center;gap:6px;}
/* ── Tables ── */
table{width:100%;border-collapse:collapse;font-size:${isLandscape?"8pt":"9pt"};margin-top:0;}
thead th{background:#1A4FA0;color:#fff;padding:${isLandscape?"6px 9px":"7px 11px"};
  text-align:left;font-weight:700;font-size:${isLandscape?"7.5pt":"8.5pt"};letter-spacing:.2px;}
thead th:first-child{border-radius:0;}
td{padding:${isLandscape?"5px 9px":"6px 11px"};border-bottom:1px solid #f1f5f9;vertical-align:middle;}
tbody tr:nth-child(even) td{background:#f8fafc;}
tbody tr:hover td{background:#eff6ff;}
tfoot td,tfoot th{background:#dbeafe;font-weight:800;color:#1e40af;
  padding:${isLandscape?"6px 9px":"7px 11px"};border-top:2px solid #93c5fd;}
/* ── Status badges ── */
.badge-paid{color:#15803d;font-weight:700;}
.badge-partial{color:#b45309;font-weight:700;}
.badge-unpaid{color:#dc2626;font-weight:700;}
.badge-not_billed{color:#64748b;font-weight:700;}
/* ── Row highlighting (defaulters at a glance) — !important beats the zebra-stripe td rule ── */
tr.row-partial td{background:#fef3c7!important;}
tr.row-unpaid td{background:#fee2e2!important;}
.pill{display:inline-block;padding:2px 8px;border-radius:10px;font-size:7.5pt;font-weight:700;}
.pill-paid{background:#dcfce7;color:#15803d;}
.pill-partial{background:#fef3c7;color:#b45309;}
.pill-unpaid{background:#fee2e2;color:#dc2626;}
/* ── Stat grid ── */
.stat-grid{display:grid;grid-template-columns:repeat(${isLandscape?"8":"4"},1fr);gap:10px;margin-bottom:6px;}
.stat-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;
  padding:${isLandscape?"9px 6px":"12px 8px"};text-align:center;}
.stat-val{font-size:${isLandscape?"12pt":"15pt"};font-weight:900;line-height:1.1;}
.stat-lbl{font-size:7pt;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-top:3px;}
/* ── Group page header (for class-per-page reports) ── */
.class-page-hdr{background:linear-gradient(90deg,#1e40af,#1A4FA0);
  border-radius:8px 8px 0 0;padding:10px 14px;margin-bottom:0;}
.class-page-name{font-size:${isLandscape?"12pt":"13pt"};font-weight:900;color:#fff;letter-spacing:-.3px;}
.class-page-meta{font-size:8pt;color:rgba(255,255,255,.75);margin-top:3px;}
/* ── Footer ── */
.footer{text-align:center;font-size:7.5pt;color:#94a3b8;margin-top:24px;
  padding:12px 20px;border-top:1px solid #e2e8f0;background:#f8fafc;}
.pb{break-before:page;}
@media print{
  .print-bar,.bar-spacer{display:none!important;}
  @page{size:A4${isLandscape?" landscape":""};margin:1cm 1.2cm;}
  body{print-color-adjust:exact;-webkit-print-color-adjust:exact;}
  .section{break-inside:avoid;}
  .pb{break-before:page;}
}
</style></head><body>
<div class="print-bar">
  <div style="display:flex;align-items:center;gap:16px;min-width:0;">
    <div class="pb-title">${schoolName} · ${title}</div>
    <div class="pb-meta">${filterLabel} &nbsp;·&nbsp; Sorted by ${sortLabel} &nbsp;·&nbsp; ${isLandscape?"Landscape":"Portrait"}${privacyMode?' &nbsp;·&nbsp; 🔒 Privacy Mode':''}</div>
  </div>
  <div class="pb-btns">
    <button class="btn-save" onclick="window.print()">⬇&nbsp;&nbsp;Save as PDF</button>
    <button class="btn-close" onclick="window.close()">✕&nbsp; Close</button>
  </div>
</div>
<div class="bar-spacer"></div>
<div class="cover">
  <div class="cover-inner">
    ${logoHtml}
    <div class="school-name">${schoolName}</div>
    <div class="school-sub">Business Management Portal</div>
    <div class="report-badge">${title}</div>
    <div class="cover-meta">
      <span>📅 Period: ${filterLabel}</span>
      <span>🔀 Sorted by: ${sortLabel}</span>
      <span>🕐 Generated: ${genDate}</span>
      ${privacyMode?'<span>🔒 Privacy Mode — figures hidden</span>':''}
    </div>
  </div>
</div>
<div class="body-wrap">
${body}
</div>
<div class="footer">
  <div>${confidentialMsg}</div>
  <div style="margin-top:3px;color:#cbd5e1;">${schoolName} &nbsp;·&nbsp; Billing Report &nbsp;·&nbsp; ${new Date().getFullYear()} &nbsp;·&nbsp; Page <span class="page-num"></span></div>
</div>
</body></html>`;
  };

  const openPDF=(html,title="Billing Analytics")=>{
    openHtmlDoc(html,{title,showPDF:ctx.showPDF});
  };

  // Build summary stats HTML block (shared between widgets + full report)
  const summaryStatsBody=()=>`
    <div class="section">
      <div class="section-head">📊 Financial Overview</div>
      <div class="stat-grid">
        ${[
          {l:"Total Expected",v:fmt(totalExpected),c:"#1A4FA0"},
          {l:"Total Collected",v:fmt(totalCollected),c:"#15803d"},
          {l:"Outstanding",v:fmt(totalOutstanding),c:"#dc2626"},
          {l:"Collection Rate",v:`${collectionRate}%`,c:collectionRate>=75?"#15803d":collectionRate>=50?"#d97706":"#dc2626"},
          {l:"Fully Paid",v:paidBills.length,c:"#15803d"},
          {l:"Partial",v:partialBills.length,c:"#d97706"},
          {l:"Unpaid",v:unpaidBills.length,c:"#dc2626"},
          {l:"Total Bills",v:filteredBills.length,c:"#1A4FA0"},
        ].map(s=>`<div class="stat-box"><div class="stat-val" style="color:${s.c}">${s.v}</div><div class="stat-lbl">${s.l}</div></div>`).join("")}
      </div>
    </div>`;

  const dlSummary=()=>openPDF(pdfWrap("Billing Overview Summary",summaryStatsBody()));

  const dlDailyInflow=()=>{
    const rows=dailyInflow.filter(d=>d.total>0);
    const body=`<div class="section">
      <div class="section-head">📈 Daily Payment Inflow (Last 30 Days)</div>
      <table><thead><tr><th>#</th><th>Date</th><th>Transactions</th><th>Amount Collected</th></tr></thead><tbody>
        ${rows.length===0?`<tr><td colspan="4" style="text-align:center;padding:20px;color:#94a3b8">No payments in this period</td></tr>`
          :rows.map((d,i)=>`<tr><td>${i+1}</td><td>${d.date}</td><td>${d.payments.length}</td><td class="badge-paid">${fmt(d.total)}</td></tr>`).join("")}
      </tbody>
      ${rows.length>0?`<tfoot><tr><td colspan="2"></td><td style="font-weight:800">${rows.reduce((a,d)=>a+d.payments.length,0)}</td><td style="font-weight:900;color:#15803d">${fmt(rows.reduce((a,d)=>a+d.total,0))}</td></tr></tfoot>`:""}
      </table></div>`;
    openPDF(pdfWrap("Daily Payment Inflow Report",body));
  };

  const dlPaymentMethods=()=>{
    const body=`<div class="section">
      <div class="section-head">💳 Payment Method Analysis</div>
      <table><thead><tr><th>Method</th><th>Amount Collected</th><th>Share</th><th>Transactions</th></tr></thead><tbody>
        <tr><td>🏦 Bank Transfer</td><td class="badge-paid">${fmt(bankTotal)}</td><td>${Math.round((bankTotal/grandPayTotal)*100)}%</td>
          <td>${filteredPayments.filter(p=>p.payment_method==="bank_transfer").length}</td></tr>
        <tr><td>💳 Paystack</td><td class="badge-paid">${fmt(paystackTotal)}</td><td>${Math.round((paystackTotal/grandPayTotal)*100)}%</td>
          <td>${filteredPayments.filter(p=>p.payment_method==="paystack").length}</td></tr>
      </tbody>
      <tfoot><tr><td>Total</td><td>${fmt(bankTotal+paystackTotal)}</td><td>100%</td><td>${filteredPayments.length}</td></tr></tfoot>
      </table></div>`;
    openPDF(pdfWrap("Payment Method Report",body));
  };

  // ── Table column definitions shared across all student-list PDFs ─────────────
  const BILL_TH=`<tr><th>#</th><th>Member</th><th>ID</th><th>Group</th><th>Period</th><th>Year</th><th>Total Bill</th><th>Paid</th><th>Balance</th><th>Status</th></tr>`;
  const billTr=(b,i)=>`<tr>
    <td style="color:#94a3b8;font-size:7.5pt;width:28px">${i+1}</td>
    <td style="font-weight:700">${stuName(b.student_id)}</td>
    <td style="color:#64748b;font-size:7.5pt">${b.student_id}</td>
    <td>${stuClass(b.student_id)}</td>
    <td>${b.term||"—"}</td><td>${b.academic_year||"—"}</td>
    <td>${fmt(b.total_amount)}</td>
    <td class="badge-paid">${fmt(b.amount_paid)}</td>
    <td class="${+b.balance>0?"badge-unpaid":""}">${fmt(b.balance)}</td>
    <td><span class="pill pill-${b.status||"unpaid"}">${(b.status||"unpaid").toUpperCase()}</span></td></tr>`;

  const billTfoot=(list)=>list.length===0?"":`<tfoot><tr>
    <td colspan="6" style="font-weight:800">Totals</td>
    <td style="font-weight:900">${fmt(list.reduce((a,b)=>a+(+b.total_amount||0),0))}</td>
    <td class="badge-paid" style="font-weight:900">${fmt(list.reduce((a,b)=>a+(+b.amount_paid||0),0))}</td>
    <td class="badge-unpaid" style="font-weight:900">${fmt(list.reduce((a,b)=>a+(+b.balance||0),0))}</td>
    <td></td></tr></tfoot>`;

  // Build the full student-list HTML — one table per class (with page break) when sorted by class,
  // otherwise one flat table.
  const buildBillsHTML=(list,sectionTitle,sectionIcon="📋")=>{
    if(!list.length) return`<div class="section"><div class="section-head">${sectionIcon} ${sectionTitle}</div><p style="padding:20px;text-align:center;color:#94a3b8">No records found</p></div>`;

    if(reportSortBy!=="class"){
      // Flat single table
      return`<div class="section">
        <div class="section-head">${sectionIcon} ${sectionTitle} — ${list.length} Member${list.length!==1?"s":""}</div>
        <table><thead>${BILL_TH}</thead><tbody>
          ${list.map((b,i)=>billTr(b,i)).join("")}
        </tbody>${billTfoot(list)}</table></div>`;
    }

    // Group-per-page: group by class, each group = its own section div with page break
    const groups={};
    const order=[];
    list.forEach(b=>{
      const cls=stuClass(b.student_id);
      if(!groups[cls]){groups[cls]=[];order.push(cls);}
      groups[cls].push(b);
    });

    let html=`<div class="section">
      <div class="section-head">${sectionIcon} ${sectionTitle} — ${list.length} Member${list.length!==1?"s":""} across ${order.length} class${order.length!==1?"es":""}</div>
    </div>`;

    order.forEach((cls,gi)=>{
      const grp=groups[cls];
      const grpTotal=grp.reduce((a,b)=>a+(+b.total_amount||0),0);
      const grpPaid=grp.reduce((a,b)=>a+(+b.amount_paid||0),0);
      const grpBal=grp.reduce((a,b)=>a+(+b.balance||0),0);
      const grpPct=grpTotal>0?Math.round((grpPaid/grpTotal)*100):0;
      html+=`<div class="section${gi>0?" pb":""}">
        <div class="class-page-hdr">
          <div class="class-page-name">📚 ${cls}</div>
          <div class="class-page-meta">${grp.length} student${grp.length!==1?"s":" "} &nbsp;·&nbsp; Expected: ${fmt(grpTotal)} &nbsp;·&nbsp; Collected: ${fmt(grpPaid)} &nbsp;·&nbsp; Balance: ${fmt(grpBal)} &nbsp;·&nbsp; Rate: ${grpPct}%</div>
        </div>
        <table><thead>${BILL_TH}</thead><tbody>
          ${grp.map((b,i)=>billTr(b,i)).join("")}
        </tbody><tfoot><tr>
          <td colspan="6" style="font-weight:800">${cls} Totals</td>
          <td style="font-weight:900">${fmt(grpTotal)}</td>
          <td class="badge-paid" style="font-weight:900">${fmt(grpPaid)}</td>
          <td class="badge-unpaid" style="font-weight:900">${fmt(grpBal)}</td>
          <td></td></tr></tfoot></table>
      </div>`;
    });
    return html;
  };

  const dlDefaulters=(allOrSlice="all")=>{
    const raw=allOrSlice==="all"?defaulters:defaulters.slice(0,10);
    const list=sortBillsFn(raw);
    const body=list.length===0
      ?`<div class="section"><div class="section-head">⚠️ Outstanding Balances</div><p style="padding:30px;text-align:center;color:#94a3b8;font-size:14pt">🎉 No outstanding balances!</p></div>`
      :buildBillsHTML(list,"Outstanding Balances","⚠️");
    openPDF(pdfWrap("Defaulters Report",body));
  };

  const dlPayments=()=>{
    const body=`<div class="section">
      <div class="section-head">✅ All Payments — ${recentPayments.length} Record${recentPayments.length!==1?"s":""}</div>
      <table><thead><tr><th>#</th><th>Member</th><th>Group</th><th>Amount</th><th>Method</th><th>Date</th><th>Reference</th></tr></thead><tbody>
        ${recentPayments.length===0?`<tr><td colspan="7" style="text-align:center;padding:20px;color:#94a3b8">No payments recorded yet</td></tr>`
          :recentPayments.map((p,i)=>`<tr>
            <td>${i+1}</td><td style="font-weight:700">${stuName(p.student_id)}</td>
            <td>${stuClass(p.student_id)}</td>
            <td class="badge-paid">${fmt(p.amount)}</td>
            <td>${p.payment_method==="paystack"?"Paystack":p.payment_method==="bank_transfer"?"Bank Transfer":"—"}</td>
            <td>${p.payment_date?new Date(p.payment_date).toLocaleDateString("en-NG"):"—"}</td>
            <td style="font-size:8.5pt;color:#64748b">${p.paystack_reference||p.bank_reference||"—"}</td></tr>`).join("")}
      </tbody>
      ${recentPayments.length>0?`<tfoot><tr><td colspan="3">Total Collected</td><td style="font-weight:900;color:#15803d">${fmt(recentPayments.reduce((a,p)=>a+(+p.amount||0),0))}</td><td colspan="3"></td></tr></tfoot>`:""}
      </table></div>`;
    openPDF(pdfWrap("Payments Report",body));
  };

  const dlFeeItems=()=>{
    const body=`<div class="section">
      <div class="section-head">📦 Billing Item Breakdown — ${itemBreakdown.length} Item${itemBreakdown.length!==1?"s":""}</div>
      <table><thead><tr><th>#</th><th>Billing Item</th><th>Type</th><th>Members</th><th>Paid</th><th>Partial</th><th>Unpaid</th><th>Collection Rate</th><th>Total Expected</th></tr></thead><tbody>
        ${itemBreakdown.length===0?`<tr><td colspan="9" style="text-align:center;padding:20px;color:#94a3b8">No items found</td></tr>`
          :itemBreakdown.map((item,i)=>{
            const paid=item.bills.filter(b=>b.status==="paid").length;
            const partial=item.bills.filter(b=>b.status==="partial").length;
            const unpaid=item.bills.filter(b=>b.status==="unpaid").length;
            const pct=item.bills.length?Math.round((paid/item.bills.length)*100):0;
            return `<tr>
              <td>${i+1}</td><td style="font-weight:700">${item.name}</td>
              <td>${item.optional?"Optional":"Compulsory"}</td>
              <td>${item.bills.length}</td>
              <td class="badge-paid">${paid}</td>
              <td class="badge-partial">${partial}</td>
              <td class="badge-unpaid">${unpaid}</td>
              <td style="font-weight:700;color:${pct>=75?"#15803d":pct>=50?"#d97706":"#dc2626"}">${pct}%</td>
              <td>${fmt(item.totalBilled)}</td></tr>`;
          }).join("")}
      </tbody></table></div>`;
    openPDF(pdfWrap("Billing Item Breakdown Report",body));
  };

  const dlPanel=(pnl,bills)=>{
    if(!pnl||!bills)return;
    const list=sortBillsFn(bills);
    const icon=pnl.title?.toLowerCase().includes("paid")?"✅":pnl.title?.toLowerCase().includes("partial")?"🔶":"⚠️";
    const body=buildBillsHTML(list,pnl.title,icon);
    openPDF(pdfWrap(pnl.title,body));
  };

  const dlFullReport=()=>{
    const parts=[];
    // Summary
    parts.push(summaryStatsBody());
    // Daily inflow table
    const inflowRows=dailyInflow.filter(d=>d.total>0);
    parts.push(`<div class="section pb">
      <div class="section-head">📈 Daily Payment Inflow (Last 30 Days)</div>
      <table><thead><tr><th>#</th><th>Date</th><th>Transactions</th><th>Amount</th></tr></thead><tbody>
        ${inflowRows.length===0?`<tr><td colspan="4" style="text-align:center;padding:16px;color:#94a3b8">No payments in this period</td></tr>`
          :inflowRows.map((d,i)=>`<tr><td>${i+1}</td><td>${d.date}</td><td>${d.payments.length}</td><td class="badge-paid">${fmt(d.total)}</td></tr>`).join("")}
      </tbody></table></div>`);
    // Payment methods
    parts.push(`<div class="section">
      <div class="section-head">💳 Payment Method Split</div>
      <table><thead><tr><th>Method</th><th>Amount</th><th>Share</th><th>Transactions</th></tr></thead><tbody>
        <tr><td>🏦 Bank Transfer</td><td class="badge-paid">${fmt(bankTotal)}</td><td>${Math.round((bankTotal/grandPayTotal)*100)}%</td><td>${filteredPayments.filter(p=>p.payment_method==="bank_transfer").length}</td></tr>
        <tr><td>💳 Paystack</td><td class="badge-paid">${fmt(paystackTotal)}</td><td>${Math.round((paystackTotal/grandPayTotal)*100)}%</td><td>${filteredPayments.filter(p=>p.payment_method==="paystack").length}</td></tr>
      </tbody><tfoot><tr><td>Total</td><td>${fmt(bankTotal+paystackTotal)}</td><td>100%</td><td>${filteredPayments.length}</td></tr></tfoot></table></div>`);
    // Defaulters — sorted per user preference, class-per-page if sorted by class
    const sortedDefaulters=sortBillsFn(defaulters);
    parts.push(`<div class="pb">${buildBillsHTML(sortedDefaulters,"All Defaulters","⚠️")}</div>`);
    // All Payments
    parts.push(`<div class="section pb">
      <div class="section-head">✅ All Payments (${recentPayments.length})</div>
      <table><thead><tr><th>#</th><th>Member</th><th>Group</th><th>Amount</th><th>Method</th><th>Date</th></tr></thead><tbody>
        ${recentPayments.length===0?`<tr><td colspan="6" style="text-align:center;padding:16px;color:#94a3b8">No payments recorded yet</td></tr>`
          :recentPayments.map((p,i)=>`<tr>
            <td>${i+1}</td><td style="font-weight:700">${stuName(p.student_id)}</td>
            <td>${stuClass(p.student_id)}</td>
            <td class="badge-paid">${fmt(p.amount)}</td>
            <td>${p.payment_method==="paystack"?"Paystack":"Bank Transfer"}</td>
            <td>${p.payment_date?new Date(p.payment_date).toLocaleDateString("en-NG"):"—"}</td></tr>`).join("")}
      </tbody>${recentPayments.length>0?`<tfoot><tr><td colspan="3">Total Collected</td><td style="font-weight:900;color:#15803d">${fmt(recentPayments.reduce((a,p)=>a+(+p.amount||0),0))}</td><td colspan="2"></td></tr></tfoot>`:""}</table></div>`);
    // Billing Items
    parts.push(`<div class="section pb">
      <div class="section-head">📦 Billing Item Breakdown (${itemBreakdown.length} items)</div>
      <table><thead><tr><th>#</th><th>Billing Item</th><th>Type</th><th>Members</th><th>Paid</th><th>Partial</th><th>Unpaid</th><th>Rate</th></tr></thead><tbody>
        ${itemBreakdown.map((item,i)=>{
          const paid=item.bills.filter(b=>b.status==="paid").length;
          const partial=item.bills.filter(b=>b.status==="partial").length;
          const unpaid=item.bills.filter(b=>b.status==="unpaid").length;
          const pct=item.bills.length?Math.round((paid/item.bills.length)*100):0;
          return `<tr><td>${i+1}</td><td style="font-weight:700">${item.name}</td><td>${item.optional?"Optional":"Compulsory"}</td>
            <td>${item.bills.length}</td><td class="badge-paid">${paid}</td>
            <td class="badge-partial">${partial}</td><td class="badge-unpaid">${unpaid}</td>
            <td style="font-weight:700;color:${pct>=75?"#15803d":pct>=50?"#d97706":"#dc2626"}">${pct}%</td></tr>`;
        }).join("")}
      </tbody></table></div>`);
    // Group leaderboard
    parts.push(`<div class="section pb">
      <div class="section-head">🏆 Group Collection Leaderboard</div>
      <table><thead><tr><th>Rank</th><th>Group</th><th>Rate</th><th>Collected</th><th>Outstanding</th><th>Paid</th><th>Partial</th><th>Unpaid</th><th>Bills</th></tr></thead><tbody>
        ${classLeaderboard.length===0?`<tr><td colspan="9" style="text-align:center;padding:16px;color:#94a3b8">No data</td></tr>`
          :classLeaderboard.map((cls,i)=>`<tr>
            <td style="font-weight:700">#${i+1}</td>
            <td style="font-weight:800">${cls.name}</td>
            <td style="font-weight:800;color:${cls.rate>=75?"#15803d":cls.rate>=50?"#d97706":"#dc2626"}">${cls.rate}%</td>
            <td class="badge-paid">${fmt(cls.collected)}</td>
            <td class="${cls.outstanding>0?"badge-unpaid":""}">${fmt(cls.outstanding)}</td>
            <td class="badge-paid">${cls.paid}</td>
            <td class="badge-partial">${cls.partial}</td>
            <td class="badge-unpaid">${cls.unpaid}</td>
            <td>${cls.count}</td></tr>`).join("")}
      </tbody>
      <tfoot><tr><td colspan="2" style="font-weight:800">Organization Total</td>
        <td style="font-weight:800;color:${collectionRate>=75?"#15803d":collectionRate>=50?"#d97706":"#dc2626"}">${collectionRate}%</td>
        <td style="font-weight:800;color:#15803d">${fmt(totalCollected)}</td>
        <td style="font-weight:800;color:#dc2626">${fmt(totalOutstanding)}</td>
        <td style="font-weight:800;color:#15803d">${paidBills.length}</td>
        <td style="font-weight:800;color:#d97706">${partialBills.length}</td>
        <td style="font-weight:800;color:#dc2626">${unpaidBills.length}</td>
        <td style="font-weight:800">${filteredBills.length}</td></tr></tfoot>
      </table></div>`);
    // At-risk
    parts.push(`<div class="section pb">
      <div class="section-head">⚠️ At-Risk Members — Partial, Silent 30+ Days (${atRisk.length})</div>
      <table><thead><tr><th>#</th><th>Member</th><th>ID</th><th>Group</th><th>Period</th><th>Year</th><th>Balance</th><th>Days Since Last Payment</th></tr></thead><tbody>
        ${atRisk.length===0?`<tr><td colspan="8" style="text-align:center;padding:16px;color:#94a3b8">No at-risk members 🎉</td></tr>`
          :atRisk.map((b,i)=>{
            const pays=(b.fee_payments||[]).filter(p=>!p.is_refunded);
            const lastDate=pays.length?pays.reduce((mx,p)=>{const d=new Date(p.payment_date||p.created_at);return d>mx?d:mx;},new Date(0)):null;
            const days=lastDate?Math.round((Date.now()-lastDate)/(864e5)):null;
            return`<tr>
              <td>${i+1}</td><td style="font-weight:700">${stuName(b.student_id)}</td>
              <td style="color:#64748b">${b.student_id}</td><td>${stuClass(b.student_id)}</td>
              <td>${b.term||"—"}</td><td>${b.academic_year||"—"}</td>
              <td class="badge-partial">${fmt(b.balance)}</td>
              <td style="font-weight:700;color:${days>60?"#dc2626":"#d97706"}">${days!==null?`${days} days`:"—"}</td></tr>`;
          }).join("")}
      </tbody></table></div>`);
    // Refunds
    parts.push(`<div class="section pb">
      <div class="section-head">↩ Refunds (${refundStats.count}) — Total Returned: ${fmt(refundStats.total)}</div>
      <table><thead><tr><th>#</th><th>Member</th><th>ID</th><th>Group</th><th>Amount</th><th>Reason</th><th>Date</th><th>Period</th><th>Year</th></tr></thead><tbody>
        ${refundStats.count===0?`<tr><td colspan="9" style="text-align:center;padding:16px;color:#94a3b8">No refunds in this period</td></tr>`
          :refundStats.all.map((r,i)=>`<tr>
            <td>${i+1}</td><td style="font-weight:700">${stuName(r.student_id)}</td>
            <td style="color:#64748b">${r.student_id}</td><td>${stuClass(r.student_id)}</td>
            <td class="badge-unpaid">${fmt(r.amount)}</td>
            <td>${r.reason||"—"}</td>
            <td>${r.refund_date?new Date(r.refund_date).toLocaleDateString("en-NG"):"—"}</td>
            <td>${r.term||"—"}</td><td>${r.year||"—"}</td></tr>`).join("")}
      </tbody>
      ${refundStats.count>0?`<tfoot><tr><td colspan="4">Total Refunded</td><td style="font-weight:900;color:#dc2626">${fmt(refundStats.total)}</td><td colspan="4"></td></tr></tfoot>`:""}</table></div>`);
    // Discounts
    parts.push(`<div class="section pb">
      <div class="section-head">🏷 Discounts Applied (${discountStats.count}) — Total Waived: ${fmt(discountStats.total)}</div>
      <table><thead><tr><th>#</th><th>Member</th><th>ID</th><th>Group</th><th>Label</th><th>Type</th><th>Value</th><th>Amount Waived</th><th>Period</th><th>Year</th></tr></thead><tbody>
        ${discountStats.count===0?`<tr><td colspan="10" style="text-align:center;padding:16px;color:#94a3b8">No discounts in this period</td></tr>`
          :discountStats.all.map((d,i)=>`<tr>
            <td>${i+1}</td><td style="font-weight:700">${stuName(d.student_id)}</td>
            <td style="color:#64748b">${d.student_id}</td><td>${stuClass(d.student_id)}</td>
            <td style="font-weight:700">${d.label||"—"}</td>
            <td>${d.discount_type==="percent"?"Percent":"Fixed"}</td>
            <td>${d.discount_type==="percent"?`${d.value}%`:fmt(d.value)}</td>
            <td style="font-weight:700;color:#7C3AED">${fmt(d.amount)}</td>
            <td>${d.term||"—"}</td><td>${d.year||"—"}</td></tr>`).join("")}
      </tbody>
      ${discountStats.count>0?`<tfoot><tr><td colspan="7">Total Discounted</td><td style="font-weight:900;color:#7C3AED">${fmt(discountStats.total)}</td><td colspan="2"></td></tr></tfoot>`:""}</table></div>`);
    openPDF(pdfWrap("Complete Billing Analytics Report",parts.join("")));
  };

  const dlClassLeaderboard=()=>{
    const body=`<div class="section">
      <div class="section-head">🏆 Group Collection Leaderboard — Ranked by Collection Rate</div>
      <table><thead><tr><th>Rank</th><th>Group</th><th>Rate</th><th>Collected</th><th>Outstanding</th><th>Paid</th><th>Partial</th><th>Unpaid</th><th>Bills</th></tr></thead><tbody>
        ${classLeaderboard.length===0?`<tr><td colspan="9" style="text-align:center;padding:20px;color:#94a3b8">No data for this period</td></tr>`
          :classLeaderboard.map((cls,i)=>`<tr>
            <td style="font-weight:700">#${i+1}</td>
            <td style="font-weight:800">${cls.name}</td>
            <td style="font-weight:800;color:${cls.rate>=75?"#15803d":cls.rate>=50?"#d97706":"#dc2626"}">${cls.rate}%</td>
            <td class="badge-paid">${fmt(cls.collected)}</td>
            <td class="${cls.outstanding>0?"badge-unpaid":""}">${fmt(cls.outstanding)}</td>
            <td class="badge-paid">${cls.paid}</td>
            <td class="badge-partial">${cls.partial}</td>
            <td class="badge-unpaid">${cls.unpaid}</td>
            <td>${cls.count}</td></tr>`).join("")}
      </tbody>
      <tfoot><tr><td colspan="2" style="font-weight:800">Organization Total</td>
        <td style="font-weight:800;color:${collectionRate>=75?"#15803d":collectionRate>=50?"#d97706":"#dc2626"}">${collectionRate}%</td>
        <td style="font-weight:800;color:#15803d">${fmt(totalCollected)}</td>
        <td style="font-weight:800;color:#dc2626">${fmt(totalOutstanding)}</td>
        <td style="font-weight:800;color:#15803d">${paidBills.length}</td>
        <td style="font-weight:800;color:#d97706">${partialBills.length}</td>
        <td style="font-weight:800;color:#dc2626">${unpaidBills.length}</td>
        <td style="font-weight:800">${filteredBills.length}</td></tr></tfoot>
      </table></div>`;
    openPDF(pdfWrap("Group Collection Leaderboard",body));
  };

  const dlAtRisk=()=>{
    const body=`<div class="section">
      <div class="section-head">⚠️ At-Risk Members — ${atRisk.length} Record${atRisk.length!==1?"s":""}</div>
      <table><thead><tr><th>#</th><th>Member</th><th>ID</th><th>Group</th><th>Period</th><th>Year</th><th>Total Bill</th><th>Paid</th><th>Balance</th><th>Days Silent</th></tr></thead><tbody>
        ${atRisk.length===0?`<tr><td colspan="10" style="text-align:center;padding:20px;color:#94a3b8">No at-risk members 🎉</td></tr>`
          :atRisk.map((b,i)=>{
            const pays=(b.fee_payments||[]).filter(p=>!p.is_refunded);
            const lastDate=pays.length?pays.reduce((mx,p)=>{const d=new Date(p.payment_date||p.created_at);return d>mx?d:mx;},new Date(0)):null;
            const days=lastDate?Math.round((Date.now()-lastDate)/(864e5)):null;
            return`<tr>
              <td>${i+1}</td><td style="font-weight:700">${stuName(b.student_id)}</td>
              <td style="color:#64748b">${b.student_id}</td><td>${stuClass(b.student_id)}</td>
              <td>${b.term||"—"}</td><td>${b.academic_year||"—"}</td>
              <td>${fmt(b.total_amount)}</td><td class="badge-paid">${fmt(b.amount_paid)}</td>
              <td class="badge-partial">${fmt(b.balance)}</td>
              <td style="font-weight:700;color:${days>60?"#dc2626":"#d97706"}">${days!==null?`${days} days`:"—"}</td></tr>`;
          }).join("")}
      </tbody>
      ${atRisk.length>0?`<tfoot><tr><td colspan="8">Total Outstanding (at-risk)</td><td style="font-weight:900;color:#d97706">${fmt(atRisk.reduce((a,b)=>a+(+b.balance||0),0))}</td><td></td></tr></tfoot>`:""}</table></div>`;
    openPDF(pdfWrap("At-Risk Members Report",body));
  };

  const dlRefunds=()=>{
    const body=`<div class="section">
      <div class="section-head">↩ Refunds — ${refundStats.count} Record${refundStats.count!==1?"s":""} · Total: ${fmt(refundStats.total)}</div>
      <table><thead><tr><th>#</th><th>Member</th><th>ID</th><th>Group</th><th>Amount</th><th>Reason</th><th>Date</th><th>Period</th><th>Year</th></tr></thead><tbody>
        ${refundStats.count===0?`<tr><td colspan="9" style="text-align:center;padding:20px;color:#94a3b8">No refunds in this period</td></tr>`
          :refundStats.all.map((r,i)=>`<tr>
            <td>${i+1}</td><td style="font-weight:700">${stuName(r.student_id)}</td>
            <td style="color:#64748b">${r.student_id}</td><td>${stuClass(r.student_id)}</td>
            <td class="badge-unpaid">${fmt(r.amount)}</td>
            <td>${r.reason||"—"}</td>
            <td>${r.refund_date?new Date(r.refund_date).toLocaleDateString("en-NG"):"—"}</td>
            <td>${r.term||"—"}</td><td>${r.year||"—"}</td></tr>`).join("")}
      </tbody>
      ${refundStats.count>0?`<tfoot><tr><td colspan="4">Total Refunded</td><td style="font-weight:900;color:#dc2626">${fmt(refundStats.total)}</td><td colspan="4"></td></tr></tfoot>`:""}</table></div>`;
    openPDF(pdfWrap("Refunds Report",body));
  };

  const dlDiscounts=()=>{
    // Breakdown summary + full list
    const summaryRows=discountStats.breakdown.map((d,i)=>`<tr>
      <td>${i+1}</td><td style="font-weight:700">${d.label}</td>
      <td>${d.count}</td><td style="font-weight:700;color:#7C3AED">${fmt(d.total)}</td></tr>`).join("");
    const detailRows=discountStats.all.map((d,i)=>`<tr>
      <td>${i+1}</td><td style="font-weight:700">${stuName(d.student_id)}</td>
      <td style="color:#64748b">${d.student_id}</td><td>${stuClass(d.student_id)}</td>
      <td style="font-weight:700">${d.label||"—"}</td>
      <td>${d.discount_type==="percent"?"Percent":"Fixed"}</td>
      <td>${d.discount_type==="percent"?`${d.value}%`:fmt(d.value)}</td>
      <td style="font-weight:700;color:#7C3AED">${fmt(d.amount)}</td>
      <td>${d.term||"—"}</td><td>${d.year||"—"}</td></tr>`).join("");
    const body=`
      <div class="section">
        <div class="section-head">🏷 Discount Summary by Type</div>
        <table><thead><tr><th>#</th><th>Discount Label</th><th>Members</th><th>Total Waived</th></tr></thead>
        <tbody>${summaryRows||`<tr><td colspan="4" style="text-align:center;padding:20px;color:#94a3b8">No discounts in this period</td></tr>`}</tbody>
        ${discountStats.count>0?`<tfoot><tr><td colspan="2">Total</td><td>${discountStats.count}</td><td style="font-weight:900;color:#7C3AED">${fmt(discountStats.total)}</td></tr></tfoot>`:""}</table>
      </div>
      <div class="section pb">
        <div class="section-head">🏷 All Discounts — ${discountStats.count} Record${discountStats.count!==1?"s":""}</div>
        <table><thead><tr><th>#</th><th>Member</th><th>ID</th><th>Group</th><th>Label</th><th>Type</th><th>Value</th><th>Amount Waived</th><th>Period</th><th>Year</th></tr></thead>
        <tbody>${detailRows||`<tr><td colspan="10" style="text-align:center;padding:20px;color:#94a3b8">No discounts in this period</td></tr>`}</tbody>
        ${discountStats.count>0?`<tfoot><tr><td colspan="7">Total Discounted</td><td style="font-weight:900;color:#7C3AED">${fmt(discountStats.total)}</td><td colspan="2"></td></tr></tfoot>`:""}</table>
      </div>`;
    openPDF(pdfWrap("Discounts Report",body));
  };

  const dlStudentLedger=(sid,name)=>{
    const stuBills=bills.filter(b=>String(b.student_id)===String(sid))
      .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    const allPays=stuBills.flatMap(b=>(b.fee_payments||[]).filter(p=>!p.is_refunded));
    const allRefunds=stuBills.flatMap(b=>(b.fee_refunds||[]));
    const allDiscs=stuBills.flatMap(b=>(b.fee_discounts||[]));
    const totalPaid=allPays.reduce((a,p)=>a+(+p.amount||0),0);
    const totalRef=allRefunds.reduce((a,r)=>a+(+r.amount||0),0);
    const totalDisc=allDiscs.reduce((a,d)=>a+(+d.amount||0),0);
    const totalOwed=stuBills.reduce((a,b)=>a+(+b.balance||0),0);
    const billsHtml=stuBills.map(b=>{
      const pays=(b.fee_payments||[]).sort((a,x)=>new Date(x.payment_date||x.created_at)-new Date(a.payment_date||a.created_at));
      const refs=b.fee_refunds||[];
      const discs=b.fee_discounts||[];
      const statusColor=b.status==="paid"?"#15803d":b.status==="partial"?"#d97706":"#dc2626";
      return`<div class="section">
        <div class="section-head" style="display:flex;justify-content:space-between;">
          <span>${b.term||"—"} · ${b.academic_year||"—"}</span>
          <span style="color:${statusColor};font-weight:900">${b.status?.toUpperCase()}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:8px">
          ${[["Total Bill",fmt(b.total_amount),"#1A4FA0"],["Paid",fmt(b.amount_paid),"#15803d"],["Balance",fmt(b.balance),+b.balance>0?"#dc2626":"#64748b"],["Discounts",fmt(discs.reduce((a,d)=>a+(+d.amount||0),0)),"#7C3AED"]].map(([l,v,c])=>`
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px;text-align:center">
              <div style="font-size:12pt;font-weight:900;color:${c}">${v}</div>
              <div style="font-size:7.5pt;color:#64748b;font-weight:600;text-transform:uppercase">${l}</div>
            </div>`).join("")}
        </div>
        ${pays.length>0?`<table style="margin-bottom:6px"><thead><tr><th>Payment</th><th>Method</th><th>Reference</th><th>Date</th></tr></thead><tbody>
          ${pays.map(p=>`<tr><td class="badge-paid">${fmt(p.amount)}</td>
            <td>${p.payment_method==="paystack"?"Paystack":"Bank Transfer"}</td>
            <td style="font-size:8pt;color:#64748b">${p.paystack_reference||p.bank_reference||"—"}</td>
            <td>${p.payment_date?new Date(p.payment_date).toLocaleDateString("en-NG"):"—"}</td></tr>`).join("")}
          </tbody></table>`:""}
        ${discs.length>0?`<table style="margin-bottom:6px"><thead><tr><th>Discount</th><th>Type</th><th>Value</th><th>Waived</th></tr></thead><tbody>
          ${discs.map(d=>`<tr><td style="font-weight:700;color:#7C3AED">${d.label||"—"}</td>
            <td>${d.discount_type==="percent"?"Percent":"Fixed"}</td>
            <td>${d.discount_type==="percent"?`${d.value}%`:fmt(d.value)}</td>
            <td style="font-weight:700;color:#7C3AED">${fmt(d.amount)}</td></tr>`).join("")}
          </tbody></table>`:""}
        ${refs.length>0?`<table><thead><tr><th>Refund</th><th>Reason</th><th>Date</th></tr></thead><tbody>
          ${refs.map(r=>`<tr><td class="badge-unpaid">${fmt(r.amount)}</td>
            <td>${r.reason||"—"}</td>
            <td>${r.refund_date?new Date(r.refund_date).toLocaleDateString("en-NG"):"—"}</td></tr>`).join("")}
          </tbody></table>`:""}
      </div>`;
    }).join("");
    const summaryBlock=`
      <div class="stat-grid" style="margin-bottom:20px">
        ${[["Total Paid",fmt(totalPaid),"#15803d"],["Outstanding",fmt(totalOwed),totalOwed>0?"#dc2626":"#64748b"],["Refunded",fmt(totalRef),"#dc2626"],["Discounts",fmt(totalDisc),"#7C3AED"]]
          .map(([l,v,c])=>`<div class="stat-box"><div class="stat-val" style="color:${c}">${v}</div><div class="stat-lbl">${l}</div></div>`).join("")}
      </div>`;
    openPDF(pdfWrap(`Member Ledger — ${name}`,summaryBlock+billsHtml));
  };

  // Small download button used in each card header
  const DlBtn=({onClick,label="PDF"})=>(
    <button onClick={onClick} title={`Download ${label} as PDF`}
      style={{display:"flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:6,border:`1px solid ${C.border}`,
        background:C.white,color:C.muted,fontSize:11,fontWeight:600,cursor:"pointer",
        transition:"all .15s",flexShrink:0}}
      onMouseEnter={e=>{e.currentTarget.style.background=C.redPale;e.currentTarget.style.color=C.red;e.currentTarget.style.borderColor=C.red+"40";}}
      onMouseLeave={e=>{e.currentTarget.style.background=C.white;e.currentTarget.style.color=C.muted;e.currentTarget.style.borderColor=C.border;}}>
      {label}
    </button>
  );

  const panelBills=panel?(panel.bills||[]).filter(b=>{
    const n=stuName(b.student_id).toLowerCase();
    return!panelSearch||n.includes(panelSearch.toLowerCase())||b.student_id?.toLowerCase().includes(panelSearch.toLowerCase());
  }):[];

  const itemPanelBills=itemPanel?(itemPanel.bills||[]).filter(b=>{
    const n=stuName(b.student_id).toLowerCase();
    return!panelSearch||n.includes(panelSearch.toLowerCase())||b.student_id?.toLowerCase().includes(panelSearch.toLowerCase());
  }):[];

  // Clickable student name — opens ledger modal
  const StuLink=({sid,style={}})=>(
    <button onClick={e=>{e.stopPropagation();setStuLedger({studentId:sid,studentName:stuName(sid)});}}
      title="View full payment history"
      style={{background:"none",border:"none",cursor:"pointer",textAlign:"left",padding:0,
        fontWeight:700,color:C.blue,...style}}>
      {stuName(sid)}
    </button>
  );

  // Clickable stat card
  const ClickStat=({label,value,icon,color,bills:blist,subtext})=>(
    <div onClick={()=>openPanel(label,color,blist||filteredBills)} style={{
      background:C.white,borderRadius:13,padding:"16px 18px",boxShadow:"0 2px 8px rgba(0,0,0,.06)",
      cursor:"pointer",transition:"all .15s",border:`2px solid transparent`,position:"relative",
      borderColor:panel?.title===label?color:"transparent"}}
      onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 4px 18px rgba(0,0,0,.13)";e.currentTarget.style.transform="translateY(-2px)";}}
      onMouseLeave={e=>{e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,.06)";e.currentTarget.style.transform="";}}>
      <div style={{fontSize:22,marginBottom:4}}>{icon}</div>
      <div style={{fontSize:20,fontWeight:900,color}}>{value}</div>
      <div style={{fontSize:11,color:C.muted,fontWeight:600}}>{label}</div>
      {subtext&&<div style={{fontSize:10,color:C.light,marginTop:2}}>{subtext}</div>}
      <div style={{position:"absolute",top:10,right:10,fontSize:10,color:C.light,opacity:.6}}>click to view ›</div>
    </div>
  );

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:10}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="fee-stats" size={20}/>Billing Analytics</h2>
          <p style={{color:C.muted,fontSize:12}}>
            {viewMode==="overview"?"Financial overview — click any widget for details":"Full breakdown of payments grouped by billing item and group"}
          </p>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{display:"flex",background:C.offWhite,borderRadius:8,padding:3,gap:3}}>
            {[["overview","Overview"],["items","Items"]].map(([m,lbl])=>(
              <button key={m} onClick={()=>{setViewMode(m);setPanel(null);setItemPanel(null);}}
                style={{padding:"6px 14px",borderRadius:6,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,
                  background:viewMode===m?C.blue:"transparent",color:viewMode===m?"#fff":C.muted,transition:"all .15s"}}>
                {lbl}
              </button>
            ))}
          </div>
          <Sel label="" value={filterYear} onChange={setFilterYear}
            options={[{value:"",label:"All Years"},...years.map(y=>({value:y,label:y}))]}/>
          <Sel label="" value={filterTerm} onChange={setFilterTerm}
            options={[{value:"",label:"All Periods"},...TERMS.map(t=>({value:t,label:t}))]}/>
          {/* Sort order picker */}
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:11,color:C.muted,fontWeight:600,whiteSpace:"nowrap"}}>Sort PDF by:</span>
            <select value={reportSortBy} onChange={e=>setReportSortBy(e.target.value)}
              style={{padding:"6px 10px",borderRadius:8,border:`1.5px solid ${C.border}`,fontSize:12,
                fontWeight:700,color:C.blue,background:C.bluePale,outline:"none",cursor:"pointer"}}>
              <option value="class">Group (A–Z)</option>
              <option value="name">Member Name (A–Z)</option>
              <option value="status">Status (Paid → Unpaid)</option>
              <option value="balance">Balance (Highest first)</option>
              <option value="paid">Amount Paid (Highest first)</option>
            </select>
          </div>
          {/* Orientation toggle */}
          <div style={{display:"flex",background:C.offWhite,borderRadius:8,padding:3,gap:2}}>
            {[["portrait","◻ Portrait"],["landscape","▭ Landscape"]].map(([val,lbl])=>(
              <button key={val} onClick={()=>setPdfOrientation(val)}
                style={{padding:"5px 11px",borderRadius:6,border:"none",cursor:"pointer",fontWeight:700,fontSize:11,
                  background:pdfOrientation===val?C.blue:"transparent",
                  color:pdfOrientation===val?"#fff":C.muted,transition:"all .15s",whiteSpace:"nowrap"}}>
                {lbl}
              </button>
            ))}
          </div>
          {/* Privacy Mode toggle — hides ₦ figures in every generated report (PDF + CSV).
              Off by default each session so it's a deliberate choice before handing a
              report to staff who shouldn't see financial details. */}
          <button onClick={()=>setPrivacyMode(p=>!p)}
            title="Hide monetary figures in generated reports — use before sharing with staff who shouldn't see financial details"
            style={{display:"flex",alignItems:"center",gap:6,padding:"7px 13px",borderRadius:8,
              border:`1.5px solid ${privacyMode?C.purple:C.border}`,cursor:"pointer",fontWeight:700,fontSize:11,
              background:privacyMode?C.purple:C.white,color:privacyMode?"#fff":C.muted,
              transition:"all .15s",whiteSpace:"nowrap"}}>
            {privacyMode?"🔒 Privacy Mode: ON":"🔓 Privacy Mode: Off"}
          </button>
          <button onClick={dlFullReport}
            style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",
              borderRadius:9,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,
              background:`linear-gradient(135deg,#DC2626,#B91C1C)`,color:"#fff",
              boxShadow:"0 3px 10px rgba(220,38,38,.35)",transition:"all .15s",whiteSpace:"nowrap"}}
            onMouseEnter={e=>e.currentTarget.style.transform="translateY(-1px)"}
            onMouseLeave={e=>e.currentTarget.style.transform="none"}
            title="Download all widgets as a single PDF report">
            Full Report PDF
          </button>
        </div>
      </div>
      <SectionPillTabs sections={sections} value={filterSection} onChange={v=>{setFilterSection(v);setFilterClass("");}}/>
      {viewMode==="overview"&&(
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,marginTop:4,flexWrap:"wrap"}}>
          <span style={{fontSize:11,color:C.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:.4}}>Group:</span>
          <select value={filterClass} onChange={e=>setFilterClass(e.target.value)}
            style={{padding:"5px 10px",border:`1px solid ${filterClass?C.blue:C.border}`,borderRadius:7,
              fontSize:12,outline:"none",color:filterClass?C.blue:C.text,fontWeight:filterClass?700:400,
              background:filterClass?C.bluePale:C.white,cursor:"pointer"}}>
            <option value="">All Groups</option>
            {[...classes].sort((a,b)=>a.name.localeCompare(b.name)).map(c=>(
              <option key={c.id} value={String(c.id)}>{c.name}</option>
            ))}
          </select>
          {filterClass&&(
            <button onClick={()=>setFilterClass("")}
              style={{fontSize:11,color:C.muted,background:"none",border:"none",cursor:"pointer",padding:"2px 4px"}}>
              Clear ×
            </button>
          )}
        </div>
      )}

      {loading?<Spinner/>:(<>

      {/* ══════════ ITEM ANALYSIS VIEW ══════════ */}
      {viewMode==="items"&&(()=>{
        // Build full dataset: per item → rows with bill+student+class info
        // allItems: items that appear in bills within the current filter period
        const usedNames=new Set(
          filteredBills.flatMap(b=>(b.fee_bill_items||[]).filter(i=>i.is_included!==false).map(i=>i.name).filter(Boolean))
        );
        // Driven entirely by what's actually on bills this period — NOT intersected with the
        // fee_items master list. Bills can include one-off/custom items (e.g. "Additional
        // payment on graduation") that were never added to that master list; intersecting
        // with it silently hid those items (and everyone billed for them) from this view.
        const allItems=[...usedNames].sort();

        const activeItem=selItem||(allItems[0]||"");

        const itemRows=filteredBills.flatMap(bill=>{
          const items=(bill.fee_bill_items||[]).filter(i=>i.is_included!==false&&i.name===activeItem);
          if(!items.length)return[];
          const item=items[0];
          const stu=studentMap[bill.student_id]||{};
          const cls=stu.class_id?classMap[stu.class_id]:null;
          const lastPay=[...(bill.fee_payments||[])].sort((a,b)=>new Date(b.created_at||b.payment_date)-new Date(a.created_at||a.payment_date))[0];
          return[{
            studentId:bill.student_id,
            studentName:fullName(stu)||bill.student_id,
            className:cls?.name||"—",
            classId:stu.class_id||"",
            gender:stu.gender||"—",
            itemName:activeItem,
            itemAmount:+(item.amount||0),
            itemOptional:!!item.is_optional,
            billStatus:bill.status,
            totalBill:+(bill.total_amount||0),
            amountPaid:+(bill.amount_paid||0),
            balance:+(bill.balance||0),
            lastPayDate:lastPay?(lastPay.created_at||lastPay.payment_date):null,
            lastPayMethod:lastPay?.payment_method||"",
            lastPayRef:lastPay?.paystack_reference||lastPay?.bank_reference||"",
            term:bill.term,
            year:bill.academic_year,
            billId:bill.id,
          }];
        });

        // Members who were never billed for this item at all — previously invisible.
        // Universe = active students matching the same section/class filters as filteredBills,
        // minus anyone who already has a row (i.e. was billed) for this item.
        const billedStudentIds=new Set(itemRows.map(r=>String(r.studentId)));
        const notBilledRows=students.filter(s=>{
          if((s.status||"active")!=="active")return false;
          if(billedStudentIds.has(String(s.id)))return false;
          if(filterSection){
            const cls=classMap[s.class_id];
            if(String(cls?.section_id)!==filterSection)return false;
          }
          if(filterClass&&String(s.class_id)!==filterClass)return false;
          return true;
        }).map(s=>{
          const cls=s.class_id?classMap[s.class_id]:null;
          return{
            studentId:String(s.id),
            studentName:fullName(s)||s.id,
            className:cls?.name||"—",
            classId:s.class_id||"",
            gender:s.gender||"—",
            itemName:activeItem,
            itemAmount:0,
            itemOptional:false,
            billStatus:"not_billed",
            totalBill:0,
            amountPaid:0,
            balance:0,
            lastPayDate:null,
            lastPayMethod:"",
            lastPayRef:"",
            term:filterTerm,
            year:filterYear,
            billId:`not-billed-${s.id}`,
          };
        });

        const allRows=[...itemRows,...notBilledRows];

        // Group by class
        const classGroups={};
        allRows.forEach(r=>{
          const k=r.className;
          if(!classGroups[k])classGroups[k]=[];
          classGroups[k].push(r);
        });

        // Apply filters
        const visibleRows=allRows.filter(r=>{
          if(itemClassFilter&&r.className!==itemClassFilter)return false;
          if(itemStatusFilter.size>0&&!itemStatusFilter.has(r.billStatus))return false;
          if(itemSearch){
            const q=itemSearch.toLowerCase();
            if(!r.studentName.toLowerCase().includes(q)&&!r.studentId.toLowerCase().includes(q))return false;
          }
          return true;
        });

        // Summary stats for active item (billed-only, so "Members Billed" keeps its meaning)
        const iTotal=itemRows.length;
        const iPaid=itemRows.filter(r=>r.billStatus==="paid").length;
        const iPartial=itemRows.filter(r=>r.billStatus==="partial").length;
        const iUnpaid=itemRows.filter(r=>r.billStatus==="unpaid").length;
        const iNotBilled=notBilledRows.length;
        const iExpected=itemRows.reduce((a,r)=>a+r.itemAmount,0);
        // Rate = % of students who have fully paid their bill (amountPaid ≠ total bill, so never use ratio)
        const iRate=iTotal>0?Math.round((iPaid/iTotal)*100):0;

        // Export CSV
        const exportCSV=()=>{
          const headers=["Member Name","Member ID","Group","Gender","Item","Item Amount","Bill Status","Total Bill","Amount Paid","Balance","Last Payment Date","Payment Method","Reference","Period","Year"];
          const rows=visibleRows.map(r=>{
            const nb=r.billStatus==="not_billed";
            const money=v=>nb?"—":privacyMode?"•••":v;
            return[
              r.studentName,r.studentId,r.className,r.gender,r.itemName,money(r.itemAmount),statusLabel(r.billStatus),
              money(r.totalBill),money(r.amountPaid),money(r.balance),
              r.lastPayDate?new Date(r.lastPayDate).toLocaleString("en-NG"):"—",
              r.lastPayMethod||"—",r.lastPayRef||"—",r.term,r.year
            ];
          });
          const csv=[headers,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
          const a=document.createElement("a");
          a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
          a.download=`${activeItem.replace(/\s+/g,"_")}_payments.csv`;
          a.click();
        };

        const statusCol=s=>s==="paid"?C.green:s==="partial"?C.amber:s==="not_billed"?C.muted:C.red;
        // Row background — partial (owing part) in orange, unpaid (owing in full) in red,
        // so defaulters are visible at a glance without reading the badge text.
        const rowBg=(r,i)=>r.billStatus==="partial"?`${C.amber}18`:r.billStatus==="unpaid"?`${C.red}18`:(i%2===0?C.white:C.offWhite);
        const statusLabel=s=>s==="not_billed"?"Not Billed":s.charAt(0).toUpperCase()+s.slice(1);
        const uniqueClasses=[...new Set(allRows.map(r=>r.className))].sort();

        return(
          <div>
            {/* Item selector sidebar + main */}
            <div style={{display:"grid",gridTemplateColumns:"220px 1fr",gap:16,alignItems:"start"}}>

              {/* Left: item selector */}
              <Card style={{position:"sticky",top:80,padding:14}}>
                <div style={{fontWeight:800,color:C.blue,fontSize:12,marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>
                  Select Billing Item
                </div>
                {/* Dropdown */}
                <select value={activeItem} onChange={e=>{setSelItem(e.target.value);setItemClassFilter("");setItemStatusFilter(new Set());setItemSearch("");}}
                  style={{width:"100%",padding:"9px 10px",border:`2px solid ${C.blue}`,borderRadius:8,fontSize:13,
                    fontWeight:700,color:C.blue,marginBottom:14,outline:"none",cursor:"pointer",background:"#fff"}}>
                  {allItems.length===0
                    ?<option value="">— No items for this period —</option>
                    :allItems.map(name=><option key={name} value={name}>{name}</option>)
                  }
                </select>
                {/* Quick-pick list */}
                <div style={{fontSize:11,color:C.muted,fontWeight:600,marginBottom:6,textTransform:"uppercase",letterSpacing:.4}}>All Items</div>
                <div style={{maxHeight:"calc(100vh - 320px)",overflowY:"auto"}}>
                  {allItems.length===0?(
                    <div style={{color:C.light,fontSize:12,padding:"10px 0"}}>No billing items found for this period.</div>
                  ):allItems.map(name=>{
                    const cnt=filteredBills.filter(b=>(b.fee_bill_items||[]).some(i=>i.is_included!==false&&i.name===name)).length;
                    const active=activeItem===name;
                    return(
                      <div key={name} onClick={()=>{setSelItem(name);setItemClassFilter("");setItemStatusFilter(new Set());setItemSearch("");}}
                        style={{padding:"9px 10px",cursor:"pointer",display:"flex",justifyContent:"space-between",
                          alignItems:"center",borderRadius:7,marginBottom:2,transition:"all .1s",
                          background:active?C.bluePale:"transparent",
                          border:`1px solid ${active?C.blue:"transparent"}`}}>
                        <div style={{fontWeight:active?700:500,fontSize:12,color:active?C.blue:C.text,flex:1,marginRight:6,lineHeight:1.3}}>{name}</div>
                        <Badge color={active?C.blue:C.muted} style={{fontSize:10}}>{cnt}</Badge>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Right: full analysis */}
              <div>
                {/* Stats bar */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:10,marginBottom:14}}>
                  {[
                    {label:"Members Billed",val:iTotal,color:C.blue},
                    {label:"Fully Paid",val:iPaid,color:C.green},
                    {label:"Partial",val:iPartial,color:C.amber},
                    {label:"Unpaid",val:iUnpaid,color:C.red},
                    {label:"Not Billed",val:iNotBilled,color:C.muted},
                    {label:"Expected",val:fmt(iExpected),color:C.blue},
                    {label:"Collection Rate",val:`${iRate}%`,color:iRate>=75?C.green:iRate>=50?C.amber:C.red},
                  ].map(({label,val,color,icon})=>(
                    <div key={label} style={{background:C.white,borderRadius:10,padding:"10px 12px",boxShadow:"0 1px 6px rgba(0,0,0,.06)",textAlign:"center"}}>
                      <div style={{fontSize:18,marginBottom:2}}>{icon}</div>
                      <div style={{fontWeight:900,fontSize:16,color}}>{val}</div>
                      <div style={{fontSize:10,color:C.muted,fontWeight:600}}>{label}</div>
                    </div>
                  ))}
                </div>

                {/* Filters + Export */}
                <Card style={{marginBottom:14,padding:"12px 16px"}}>
                  <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                    <input value={itemSearch} onChange={e=>setItemSearch(e.target.value)} placeholder="Search member…"
                      style={{padding:"7px 11px",border:`1px solid ${C.border}`,borderRadius:7,fontSize:12,outline:"none",width:180}}/>
                    <select value={itemClassFilter} onChange={e=>setItemClassFilter(e.target.value)}
                      style={{padding:"7px 10px",border:`1px solid ${C.border}`,borderRadius:7,fontSize:12,outline:"none"}}>
                      <option value="">All Groups</option>
                      {uniqueClasses.map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                    <StatusMultiSelect
                      options={[
                        {value:"paid",label:"Fully Paid",color:C.green},
                        {value:"partial",label:"Partial",color:C.amber},
                        {value:"unpaid",label:"Unpaid",color:C.red},
                        {value:"not_billed",label:"Not Billed",color:C.muted},
                      ]}
                      selected={itemStatusFilter}
                      onToggle={v=>setItemStatusFilter(prev=>{const n=new Set(prev);n.has(v)?n.delete(v):n.add(v);return n;})}
                      onClear={()=>setItemStatusFilter(new Set())}/>
                    <div style={{flex:1}}/>
                    <span style={{fontSize:12,color:C.muted}}>{visibleRows.length} record{visibleRows.length!==1?"s":""}</span>
                    <Btn onClick={exportCSV} color={C.green} xs>⬇ CSV</Btn>
                    <button onClick={()=>{
                      // Build item-analysis PDF for current visible rows grouped by class
                      const grouped={};
                      visibleRows.forEach(r=>{if(!grouped[r.className])grouped[r.className]=[];grouped[r.className].push(r);});
                      const statusCol=s=>s==="paid"?"#15803d":s==="partial"?"#d97706":s==="not_billed"?"#64748b":"#dc2626";
                      const sections=Object.entries(grouped).sort(([a],[b])=>a.localeCompare(b)).map(([cls,rows],sIdx)=>{
                        const billed=rows.filter(r=>r.billStatus!=="not_billed");
                        const notBilledCt=rows.length-billed.length;
                        const cPaid=billed.filter(r=>r.billStatus==="paid").length;
                        const cCollected=billed.reduce((a,r)=>a+r.amountPaid,0);
                        const cExpected=billed.reduce((a,r)=>a+r.itemAmount,0);
                        const cRate=billed.length>0?Math.round((cPaid/billed.length)*100):0;
                        return `<div class="section${sIdx>0?' pb':''}">
                          <div class="section-head">${cls} — ${billed.length} student${billed.length!==1?"s":""} billed${notBilledCt>0?` &nbsp;|&nbsp; ${notBilledCt} not billed`:""} &nbsp;|&nbsp; ${cRate}% collected &nbsp;|&nbsp; ${fmt(cCollected)} / ${fmt(cExpected)}</div>
                          <table><thead><tr><th>#</th><th>Member</th><th>ID</th><th>Gender</th><th>Status</th><th>Item Amt</th><th>Total Bill</th><th>Paid</th><th>Balance</th><th>Last Payment</th><th>Method</th></tr></thead><tbody>
                            ${rows.map((r,i)=>`<tr class="${r.billStatus==="partial"?"row-partial":r.billStatus==="unpaid"?"row-unpaid":""}">
                              <td>${i+1}</td><td style="font-weight:700">${r.studentName}</td>
                              <td style="color:#64748b">${r.studentId}</td><td>${r.gender}</td>
                              <td class="badge-${r.billStatus}">${statusLabel(r.billStatus)}</td>
                              <td style="font-weight:600">${r.billStatus==="not_billed"?"—":fmt(r.itemAmount)}</td>
                              <td>${r.billStatus==="not_billed"?"—":fmt(r.totalBill)}</td>
                              <td class="badge-paid">${r.billStatus==="not_billed"?"—":fmt(r.amountPaid)}</td>
                              <td style="font-weight:${r.balance>0?700:400};color:${r.balance>0?"#dc2626":"#64748b"}">${r.balance>0?fmt(r.balance):"—"}</td>
                              <td style="font-size:8.5pt;color:#64748b">${r.lastPayDate?new Date(r.lastPayDate).toLocaleDateString("en-NG"):"—"}</td>
                              <td style="font-size:8.5pt;color:#64748b">${r.lastPayMethod==="paystack"?"Paystack":r.lastPayMethod==="bank_transfer"?"Bank":"—"}</td>
                            </tr>`).join("")}
                          </tbody>
                          <tfoot><tr><td colspan="4"></td><td style="font-weight:800">Total</td>
                            <td style="font-weight:800;color:#1A4FA0">${fmt(cExpected)}</td><td></td>
                            <td style="font-weight:800;color:#15803d">${fmt(cCollected)}</td>
                            <td style="font-weight:800;color:#dc2626">${fmt(billed.reduce((a,r)=>a+r.balance,0))}</td>
                            <td colspan="2" style="color:#64748b">${cRate}% collection rate</td></tr></tfoot>
                          </table></div>`;
                      });
                      openPDF(pdfWrap(`Item Analysis — ${activeItem}`,
                        `<div style="margin-bottom:16px;font-size:10pt;color:#64748b">Item: <strong style="color:#1A4FA0">${activeItem}</strong> &nbsp;|&nbsp; ${visibleRows.length} students &nbsp;|&nbsp; ${iRate}% overall collection rate</div>`
                        +sections.join("")));
                    }}
                      style={{display:"flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:6,
                        border:`1px solid ${C.border}`,background:C.white,color:C.muted,
                        fontSize:11,fontWeight:600,cursor:"pointer",transition:"all .15s"}}
                      onMouseEnter={e=>{e.currentTarget.style.background=C.redPale;e.currentTarget.style.color=C.red;}}
                      onMouseLeave={e=>{e.currentTarget.style.background=C.white;e.currentTarget.style.color=C.muted;}}>
                      PDF
                    </button>
                  </div>
                </Card>

                {/* Grouped table by class */}
                {itemClassFilter?(
                  /* Flat table when class is filtered */
                  <Card style={{overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:900}}>
                      <thead>
                        <tr style={{background:C.blue,color:"#fff"}}>
                          {["#","Member","ID","Gender","Status","Item Amount","Total Bill","Paid","Balance","Last Payment","Method","Reference"].map((h,i)=>(
                            <th key={i} style={{padding:"9px 10px",textAlign:"left",fontWeight:700,fontSize:11,whiteSpace:"nowrap"}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRows.length===0?(
                          <tr><td colSpan={12} style={{textAlign:"center",padding:32,color:C.light}}>No records found</td></tr>
                        ):visibleRows.map((r,i)=>(
                          <tr key={r.billId} style={{background:rowBg(r,i),borderBottom:`1px solid ${C.border}`}}>
                            <td style={{padding:"8px 10px",color:C.muted}}>{i+1}</td>
                            <td style={{padding:"8px 10px",fontWeight:700}}>{r.studentName}</td>
                            <td style={{padding:"8px 10px",color:C.muted}}>{r.studentId}</td>
                            <td style={{padding:"8px 10px",color:C.muted}}>{r.gender}</td>
                            <td style={{padding:"8px 10px"}}><Badge color={statusCol(r.billStatus)}>{statusLabel(r.billStatus)}</Badge></td>
                            <td style={{padding:"8px 10px",fontWeight:600}}>{r.billStatus==="not_billed"?"—":fmt(r.itemAmount)}</td>
                            <td style={{padding:"8px 10px"}}>{r.billStatus==="not_billed"?"—":fmt(r.totalBill)}</td>
                            <td style={{padding:"8px 10px",color:C.green,fontWeight:700}}>{r.billStatus==="not_billed"?"—":fmt(r.amountPaid)}</td>
                            <td style={{padding:"8px 10px",color:r.balance>0?C.red:C.muted,fontWeight:r.balance>0?700:400}}>{r.balance>0?fmt(r.balance):"—"}</td>
                            <td style={{padding:"8px 10px",color:C.muted,fontSize:11,whiteSpace:"nowrap"}}>
                              {r.lastPayDate?new Date(r.lastPayDate).toLocaleString("en-NG",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—"}
                            </td>
                            <td style={{padding:"8px 10px",color:C.muted}}>{r.lastPayMethod==="paystack"?"Paystack":r.lastPayMethod==="bank_transfer"?"Bank":"—"}</td>
                            <td style={{padding:"8px 10px",fontSize:10,color:C.muted,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.lastPayRef||"—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                ):(
                  /* Grouped by class when no class filter */
                  <div style={{display:"flex",flexDirection:"column",gap:14}}>
                    {Object.entries(classGroups).sort(([a],[b])=>a.localeCompare(b)).map(([cls,rows])=>{
                      const visRows=rows.filter(r=>{
                        if(itemStatusFilter.size>0&&!itemStatusFilter.has(r.billStatus))return false;
                        if(itemSearch){const q=itemSearch.toLowerCase();if(!r.studentName.toLowerCase().includes(q)&&!r.studentId.toLowerCase().includes(q))return false;}
                        return true;
                      });
                      if(!visRows.length)return null;
                      const billedRows=rows.filter(r=>r.billStatus!=="not_billed");
                      const clsPaid=billedRows.filter(r=>r.billStatus==="paid").length;
                      const clsPartial=billedRows.filter(r=>r.billStatus==="partial").length;
                      const clsUnpaid=billedRows.filter(r=>r.billStatus==="unpaid").length;
                      const clsNotBilled=rows.length-billedRows.length;
                      const clsCollected=billedRows.reduce((a,r)=>a+r.amountPaid,0);
                      const clsExpected=billedRows.reduce((a,r)=>a+r.itemAmount,0);
                      const clsRate=billedRows.length>0?Math.round((clsPaid/billedRows.length)*100):0;
                      return(
                        <Card key={cls} style={{padding:0,overflow:"hidden"}}>
                          {/* Group header */}
                          <div style={{background:`linear-gradient(135deg,${C.blue},${C.blueDark})`,padding:"12px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                            <div>
                              <div style={{color:"#fff",fontWeight:900,fontSize:15}}>{cls}</div>
                              <div style={{color:"rgba(255,255,255,.7)",fontSize:11}}>{billedRows.length} billed for {activeItem}{clsNotBilled>0?` · ${clsNotBilled} not billed`:""}</div>
                            </div>
                            <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                              <span style={{color:"rgba(255,255,255,.85)",fontSize:12}}>{clsPaid} paid</span>
                              <span style={{color:"rgba(255,255,255,.85)",fontSize:12}}>{clsPartial} partial</span>
                              <span style={{color:"rgba(255,255,255,.85)",fontSize:12}}>{clsUnpaid} unpaid</span>
                              {clsNotBilled>0&&<span style={{color:"rgba(255,255,255,.85)",fontSize:12}}>{clsNotBilled} not billed</span>}
                              <Badge color={clsRate>=75?"#15803d":clsRate>=50?"#92400e":"#b91c1c"}
                                style={{background:"rgba(255,255,255,.15)",color:"#fff",fontSize:12,fontWeight:700}}>{clsRate}% collected</Badge>
                              <span style={{color:"rgba(255,255,255,.85)",fontSize:12,fontWeight:700}}>{fmt(clsCollected)} / {fmt(clsExpected)}</span>
                            </div>
                          </div>
                          <div style={{overflowX:"auto"}}>
                            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                              <thead>
                                <tr style={{background:C.offWhite}}>
                                  {["#","Member","ID","Gender","Status","Item Amt","Total Bill","Paid","Balance","Last Payment","Method"].map((h,i)=>(
                                    <th key={i} style={{padding:"8px 10px",textAlign:"left",fontWeight:700,fontSize:11,color:C.muted,borderBottom:`2px solid ${C.border}`,whiteSpace:"nowrap"}}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {visRows.map((r,i)=>(
                                  <tr key={r.billId} style={{background:rowBg(r,i),borderBottom:`1px solid ${C.border}`}}>
                                    <td style={{padding:"8px 10px",color:C.light,fontSize:11}}>{i+1}</td>
                                    <td style={{padding:"8px 10px",fontWeight:700,color:C.text}}>{r.studentName}</td>
                                    <td style={{padding:"8px 10px",color:C.muted,fontSize:11}}>{r.studentId}</td>
                                    <td style={{padding:"8px 10px",color:C.muted}}>{r.gender}</td>
                                    <td style={{padding:"8px 10px"}}><Badge color={statusCol(r.billStatus)}>{statusLabel(r.billStatus)}</Badge></td>
                                    <td style={{padding:"8px 10px",fontWeight:600}}>{r.billStatus==="not_billed"?"—":fmt(r.itemAmount)}</td>
                                    <td style={{padding:"8px 10px",color:C.muted}}>{r.billStatus==="not_billed"?"—":fmt(r.totalBill)}</td>
                                    <td style={{padding:"8px 10px",color:C.green,fontWeight:700}}>{r.billStatus==="not_billed"?"—":fmt(r.amountPaid)}</td>
                                    <td style={{padding:"8px 10px",fontWeight:r.balance>0?700:400,color:r.balance>0?C.red:C.muted}}>{r.balance>0?fmt(r.balance):"—"}</td>
                                    <td style={{padding:"8px 10px",color:C.muted,fontSize:11,whiteSpace:"nowrap"}}>
                                      {r.lastPayDate?new Date(r.lastPayDate).toLocaleString("en-NG",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}):"No payment"}
                                    </td>
                                    <td style={{padding:"8px 10px",color:C.muted,fontSize:11}}>{r.lastPayMethod==="paystack"?"Paystack":r.lastPayMethod==="bank_transfer"?"Bank":"—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr style={{background:C.bluePale,borderTop:`2px solid ${C.blue}`}}>
                                  <td colSpan={5} style={{padding:"8px 10px",fontWeight:800,color:C.blue,fontSize:12}}>Group Total</td>
                                  <td style={{padding:"8px 10px",fontWeight:800,color:C.blue}}>{fmt(clsExpected)}</td>
                                  <td style={{padding:"8px 10px",color:C.muted}}>—</td>
                                  <td style={{padding:"8px 10px",fontWeight:800,color:C.green}}>{fmt(clsCollected)}</td>
                                  <td style={{padding:"8px 10px",fontWeight:800,color:C.red}}>{fmt(rows.reduce((a,r)=>a+r.balance,0))}</td>
                                  <td colSpan={2} style={{padding:"8px 10px",color:C.muted,fontSize:11}}>{clsRate}% collection rate</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══════════ OVERVIEW TAB ══════════ */}
      {viewMode==="overview"&&(
        <div style={{display:"grid",gridTemplateColumns:panel||itemPanel?"1fr 380px":"1fr",gap:16,alignItems:"start"}}>
          <div>
            {/* Summary Cards */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontSize:11,color:C.muted,fontWeight:600}}>Click any card to drill down into those bills</div>
              <DlBtn onClick={dlSummary} label="Summary PDF"/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",gap:12,marginBottom:20}}>
              <ClickStat label="Total Expected" value={fmt(totalExpected)} icon={<DollarSign size={18} color={C.blue}/>} color={C.blue} bills={filteredBills}/>
              <ClickStat label="Total Collected" value={fmt(totalCollected)} icon={<CheckCircle size={18} color={C.green}/>} color={C.green} bills={filteredBills.filter(b=>+b.amount_paid>0)}/>
              <ClickStat label="Outstanding" value={fmt(totalOutstanding)} icon={<AlertTriangle size={18} color={C.red}/>} color={C.red} bills={defaulters}/>
              <ClickStat label="Collection Rate" value={`${collectionRate}%`} icon={<BarChart3 size={18}/>}
                color={collectionRate>=75?C.green:collectionRate>=50?C.amber:C.red} bills={filteredBills}
                subtext={`${filteredBills.length} total bills`}/>
              <ClickStat label="Fully Paid" value={paidBills.length} icon={<CheckCircle size={18} color={C.green}/>} color={C.green} bills={paidBills}
                subtext={fmt(paidBills.reduce((a,b)=>a+(+b.total_amount||0),0))}/>
              <ClickStat label="Partial" value={partialBills.length} icon={<Clock size={18} color={C.amber}/>} color={C.amber} bills={partialBills}
                subtext={fmt(partialBills.reduce((a,b)=>a+(+b.balance||0),0)+" remaining")}/>
              <ClickStat label="Unpaid" value={unpaidBills.length} icon={<XCircle size={18} color={C.red}/>} color={C.red} bills={unpaidBills}
                subtext={fmt(unpaidBills.reduce((a,b)=>a+(+b.total_amount||0),0))}/>
            </div>

            {/* Charts row */}
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:16,marginBottom:16}}>
              {/* Daily Inflow Chart */}
              <Card>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                  <div style={{fontWeight:800,color:C.blue,fontSize:14}}>Daily Payment Inflow (Last 30 Days)</div>
                  <DlBtn onClick={dlDailyInflow} label="Inflow PDF"/>
                </div>
                <div style={{display:"flex",alignItems:"flex-end",gap:2,height:120,paddingBottom:20}}>
                  {dailyInflow.map((d,i)=>(
                    <div key={i} title={`${d.day}: ${fmt(d.total)}`}
                      onClick={()=>d.total>0&&openPanel(`Payments on ${d.date}`,C.blue,
                        d.payments.map(p=>bills.find(b=>b.id===p.bill_id)).filter(Boolean))}
                      style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,cursor:d.total>0?"pointer":"default"}}>
                      <div style={{width:"100%",background:d.total>0?C.blue:C.border,
                        height:`${Math.max(2,(d.total/maxDaily)*100)}px`,
                        borderRadius:"2px 2px 0 0",transition:"height .3s",minHeight:d.total>0?4:2}}/>
                      {i%5===0&&<div style={{fontSize:8,color:C.muted,transform:"rotate(-45deg)",marginTop:2,whiteSpace:"nowrap"}}>{d.day}</div>}
                    </div>
                  ))}
                </div>
                {filteredPayments.length===0&&<div style={{textAlign:"center",color:C.light,fontSize:13}}>No payment data for selected period</div>}
              </Card>

              {/* Payment Method Split */}
              <Card>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                  <div style={{fontWeight:800,color:C.blue,fontSize:14}}>Payment Method Split</div>
                  <DlBtn onClick={dlPaymentMethods} label="Methods PDF"/>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  {[
                    {label:"Bank Transfer",total:bankTotal,color:C.blue,method:"bank_transfer"},
                    {label:"Paystack",total:paystackTotal,color:C.green,method:"paystack"},
                  ].map(({label,total,color,method})=>(
                    <div key={method} onClick={()=>openPanel(label,color,
                      [...new Set(filteredPayments.filter(p=>p.payment_method===method).map(p=>p.bill_id))]
                        .map(id=>bills.find(b=>b.id===id)).filter(Boolean))}
                      style={{cursor:"pointer"}} title="Click to see members">
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                        <span style={{fontSize:13,color:C.muted}}>{label}</span>
                        <strong style={{fontSize:13}}>{Math.round((total/grandPayTotal)*100)}%</strong>
                      </div>
                      <div style={{height:10,background:C.border,borderRadius:99,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${(total/grandPayTotal)*100}%`,background:color,borderRadius:99,transition:"width .5s"}}/>
                      </div>
                      <div style={{fontSize:12,color:C.muted,marginTop:3}}>{fmt(total)}</div>
                    </div>
                  ))}
                  <div style={{marginTop:8,textAlign:"center",padding:"14px",background:C.offWhite,borderRadius:10}}>
                    <div style={{fontSize:11,color:C.muted,marginBottom:6}}>COLLECTION RATE</div>
                    <div style={{fontSize:36,fontWeight:900,color:collectionRate>=75?C.green:collectionRate>=50?C.amber:C.red}}>{collectionRate}%</div>
                    <div style={{height:8,background:C.border,borderRadius:99,overflow:"hidden",marginTop:8}}>
                      <div style={{height:"100%",width:`${collectionRate}%`,
                        background:collectionRate>=75?C.green:collectionRate>=50?C.amber:C.red,borderRadius:99,transition:"width .5s"}}/>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Top Defaulters + Recent */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
              <Card>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,gap:6,flexWrap:"wrap"}}>
                  <div style={{fontWeight:800,color:C.red,fontSize:14}}>Top Defaulters</div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    {defaulters.length>5&&<button onClick={()=>openPanel("Outstanding Balances",C.red,defaulters)}
                      style={{fontSize:11,color:C.blue,background:"none",border:"none",cursor:"pointer"}}>View all {defaulters.length} →</button>}
                    <DlBtn onClick={()=>dlDefaulters("all")} label="Defaulters PDF"/>
                  </div>
                </div>
                {defaulters.length===0?(
                  <div style={{textAlign:"center",padding:24,color:C.light}}>No outstanding balances!</div>
                ):(
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <Th cols={["Member","Balance"]}/>
                    <tbody>
                      {defaulters.slice(0,5).map((bill,i)=>(
                        <TRow key={bill.id} i={i} cells={[
                          <div><StuLink sid={bill.student_id}/>
                            <div style={{fontSize:10,color:C.muted}}>{bill.term} · {bill.academic_year}</div></div>,
                          <strong style={{color:C.red}}>{fmt(bill.balance)}</strong>
                        ]}/>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>

              <Card>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,gap:6,flexWrap:"wrap"}}>
                  <div style={{fontWeight:800,color:C.green,fontSize:14}}>Recent Payments</div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    {recentPayments.length>5&&<button onClick={()=>openPanel("All Payments",C.green,
                      [...new Set(recentPayments.map(p=>p.bill_id))].map(id=>bills.find(b=>b.id===id)).filter(Boolean))}
                      style={{fontSize:11,color:C.blue,background:"none",border:"none",cursor:"pointer"}}>View all →</button>}
                    <DlBtn onClick={dlPayments} label="Payments PDF"/>
                  </div>
                </div>
                {recentPayments.length===0?(
                  <div style={{textAlign:"center",padding:24,color:C.light}}>No payments recorded yet</div>
                ):(
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <Th cols={["Member","Amount","Date"]}/>
                    <tbody>
                      {recentPayments.slice(0,5).map((p,i)=>(
                        <TRow key={p.id} i={i} cells={[
                          <div><StuLink sid={p.student_id}/>
                            <div style={{fontSize:10,color:C.muted}}>{p.payment_method==="paystack"?"Paystack":"Bank"}</div></div>,
                          <strong style={{color:C.green}}>{fmt(p.amount)}</strong>,
                          <span style={{color:C.muted,fontSize:11}}>{new Date(p.payment_date||p.created_at).toLocaleDateString("en-NG")}</span>
                        ]}/>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            </div>

            {/* ── Billing Item Breakdown summary → launch full view ── */}
            {itemBreakdown.length>0&&(
              <Card>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,gap:8,flexWrap:"wrap"}}>
                  <div>
                    <div style={{fontWeight:800,color:C.blue,fontSize:14}}>Payment by Billing Item</div>
                    <p style={{fontSize:12,color:C.muted,marginTop:2}}>{itemBreakdown.length} billing item{itemBreakdown.length!==1?"s":""} detected — click any item or open full analysis</p>
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <DlBtn onClick={dlFeeItems} label="Items PDF"/>
                    <Btn onClick={()=>setViewMode("items")} color={C.orange} xs>Full Item Analysis →</Btn>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:8}}>
                  {itemBreakdown.map(item=>{
                    const paid=item.bills.filter(b=>b.status==="paid").length;
                    const partial=item.bills.filter(b=>b.status==="partial").length;
                    const unpaid=item.bills.filter(b=>b.status==="unpaid").length;
                    const pct=item.bills.length?Math.round((paid/item.bills.length)*100):0;
                    return(
                      <div key={item.name}
                        onClick={()=>{setSelItem(item.name);setViewMode("items");setPanel(null);setItemPanel(null);}}
                        style={{border:`2px solid ${C.border}`,borderRadius:10,padding:"11px 13px",cursor:"pointer",transition:"all .13s",background:C.white}}
                        onMouseEnter={e=>{e.currentTarget.style.borderColor=C.orange;e.currentTarget.style.background=C.orangePale;}}
                        onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.background=C.white;}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                          <div style={{fontWeight:700,fontSize:12,color:C.text,flex:1,paddingRight:4,lineHeight:1.3}}>{item.name}</div>
                          <Badge color={item.optional?C.amber:C.blue} style={{fontSize:9}}>{item.optional?"Opt":"Comp"}</Badge>
                        </div>
                        <div style={{fontSize:20,fontWeight:900,color:C.blue}}>{item.bills.length} <span style={{fontSize:11,fontWeight:400,color:C.muted}}>members</span></div>
                        <div style={{height:5,background:C.border,borderRadius:99,overflow:"hidden",margin:"6px 0"}}>
                          <div style={{height:"100%",width:`${pct}%`,background:pct>=75?C.green:pct>=50?C.amber:C.red,borderRadius:99}}/>
                        </div>
                        <div style={{display:"flex",gap:6,fontSize:10}}>
                          <span style={{color:C.green}}>{paid}</span>
                          <span style={{color:C.amber}}>{partial} partial</span>
                          <span style={{color:C.red}}>{unpaid}</span>
                          <span style={{marginLeft:"auto",color:C.muted}}>{pct}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
            {/* ── GROUP LEADERBOARD ── */}
            {classLeaderboard.length>0&&(
              <Card style={{marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,gap:8,flexWrap:"wrap"}}>
                  <div>
                    <div style={{fontWeight:800,color:C.blue,fontSize:14}}>Group Collection Leaderboard</div>
                    <p style={{fontSize:12,color:C.muted,marginTop:2}}>Worst payers first — click a row to filter everything to that group</p>
                  </div>
                  <DlBtn onClick={dlClassLeaderboard} label="Leaderboard PDF"/>
                </div>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <thead>
                      <tr style={{background:C.offWhite}}>
                        {["Rank","Group","Collection Rate","Collected","Outstanding","Paid","Partial","Unpaid","Bills"].map((h,i)=>(
                          <th key={i} style={{padding:"8px 10px",textAlign:"left",fontWeight:700,fontSize:11,color:C.muted,borderBottom:`2px solid ${C.border}`,whiteSpace:"nowrap"}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {classLeaderboard.map((cls,i)=>{
                        const rateCol=cls.rate>=75?C.green:cls.rate>=50?C.amber:C.red;
                        const isActive=filterClass===cls.classId;
                        return(
                          <tr key={cls.name}
                            onClick={()=>setFilterClass(isActive?"":cls.classId)}
                            style={{background:isActive?C.bluePale:i%2===0?C.white:C.offWhite,
                              borderBottom:`1px solid ${C.border}`,cursor:"pointer",
                              outline:isActive?`2px solid ${C.blue}`:"none",outlineOffset:-1}}>
                            <td style={{padding:"8px 10px",color:C.muted,fontWeight:700,fontSize:11}}>#{i+1}</td>
                            <td style={{padding:"8px 10px",fontWeight:800,color:isActive?C.blue:C.text}}>{cls.name}</td>
                            <td style={{padding:"8px 10px",minWidth:160}}>
                              <div style={{display:"flex",alignItems:"center",gap:8}}>
                                <div style={{flex:1,height:8,background:C.border,borderRadius:99,overflow:"hidden"}}>
                                  <div style={{height:"100%",width:`${cls.rate}%`,background:rateCol,borderRadius:99,transition:"width .4s"}}/>
                                </div>
                                <span style={{fontWeight:800,color:rateCol,minWidth:36,textAlign:"right"}}>{cls.rate}%</span>
                              </div>
                            </td>
                            <td style={{padding:"8px 10px",color:C.green,fontWeight:700}}>{fmt(cls.collected)}</td>
                            <td style={{padding:"8px 10px",color:cls.outstanding>0?C.red:C.muted,fontWeight:cls.outstanding>0?700:400}}>{fmt(cls.outstanding)}</td>
                            <td style={{padding:"8px 10px",color:C.green,fontWeight:600}}>{cls.paid}</td>
                            <td style={{padding:"8px 10px",color:C.amber,fontWeight:600}}>{cls.partial}</td>
                            <td style={{padding:"8px 10px",color:C.red,fontWeight:600}}>{cls.unpaid}</td>
                            <td style={{padding:"8px 10px",color:C.muted}}>{cls.count}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{background:C.bluePale,borderTop:`2px solid ${C.blue}`}}>
                        <td colSpan={2} style={{padding:"8px 10px",fontWeight:800,color:C.blue}}>Total</td>
                        <td style={{padding:"8px 10px",fontWeight:800,color:collectionRate>=75?C.green:collectionRate>=50?C.amber:C.red}}>{collectionRate}%</td>
                        <td style={{padding:"8px 10px",fontWeight:800,color:C.green}}>{fmt(totalCollected)}</td>
                        <td style={{padding:"8px 10px",fontWeight:800,color:C.red}}>{fmt(totalOutstanding)}</td>
                        <td style={{padding:"8px 10px",fontWeight:800,color:C.green}}>{paidBills.length}</td>
                        <td style={{padding:"8px 10px",fontWeight:800,color:C.amber}}>{partialBills.length}</td>
                        <td style={{padding:"8px 10px",fontWeight:800,color:C.red}}>{unpaidBills.length}</td>
                        <td style={{padding:"8px 10px",fontWeight:800,color:C.blue}}>{filteredBills.length}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            )}

            {/* ── AT RISK + REFUNDS/DISCOUNTS row ── */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>

              {/* At-Risk Members */}
              <Card>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,gap:6,flexWrap:"wrap"}}>
                  <div>
                    <div style={{fontWeight:800,color:C.amber,fontSize:14}}>⚠ At-Risk Members</div>
                    <p style={{fontSize:11,color:C.muted,marginTop:2}}>Partial payments, gone silent for 30+ days</p>
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                    <DlBtn onClick={dlAtRisk} label="At-Risk PDF"/>
                    {atRisk.length>5&&(
                      <button onClick={()=>openPanel("At-Risk Members",C.amber,atRisk)}
                        style={{fontSize:11,color:C.blue,background:"none",border:"none",cursor:"pointer"}}>
                        View all {atRisk.length} →
                      </button>
                    )}
                  </div>
                </div>
                {atRisk.length===0?(
                  <div style={{textAlign:"center",padding:24,color:C.light,fontSize:13}}>
                    No at-risk members 🎉
                  </div>
                ):(
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <Th cols={["Member","Balance","Last Payment"]}/>
                    <tbody>
                      {atRisk.slice(0,6).map((bill,i)=>{
                        const pays=(bill.fee_payments||[]).filter(p=>!p.is_refunded);
                        const lastPay=pays.length?pays.reduce((mx,p)=>new Date(p.payment_date||p.created_at)>new Date(mx.payment_date||mx.created_at)?p:mx):null;
                        const daysSince=lastPay?Math.round((Date.now()-new Date(lastPay.payment_date||lastPay.created_at))/(864e5)):null;
                        return(
                          <TRow key={bill.id} i={i} cells={[
                            <div>
                              <StuLink sid={bill.student_id}/>
                              <div style={{fontSize:10,color:C.muted}}>{stuClass(bill.student_id)}</div>
                            </div>,
                            <strong style={{color:C.amber}}>{fmt(bill.balance)}</strong>,
                            <span style={{color:daysSince>60?C.red:C.amber,fontSize:11}}>
                              {daysSince!==null?`${daysSince}d ago`:"—"}
                            </span>
                          ]}/>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </Card>

              {/* Refunds card */}
              <Card>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4,gap:6}}>
                  <div style={{fontWeight:800,color:C.red,fontSize:14}}>Refunds</div>
                  <DlBtn onClick={dlRefunds} label="Refunds PDF"/>
                </div>
                <p style={{fontSize:11,color:C.muted,marginBottom:12}}>{refundStats.count} refund{refundStats.count!==1?"s":""} — {fmt(refundStats.total)} returned</p>
                {refundStats.count===0?(
                  <div style={{textAlign:"center",padding:20,color:C.light,fontSize:13}}>No refunds in this period</div>
                ):(
                  <>
                    <div style={{display:"flex",gap:10,marginBottom:12}}>
                      <div style={{flex:1,background:C.redPale,borderRadius:10,padding:"10px 12px",textAlign:"center"}}>
                        <div style={{fontSize:18,fontWeight:900,color:C.red}}>{refundStats.count}</div>
                        <div style={{fontSize:10,color:C.muted,fontWeight:600}}>REFUNDS</div>
                      </div>
                      <div style={{flex:1,background:C.redPale,borderRadius:10,padding:"10px 12px",textAlign:"center"}}>
                        <div style={{fontSize:16,fontWeight:900,color:C.red}}>{fmt(refundStats.total)}</div>
                        <div style={{fontSize:10,color:C.muted,fontWeight:600}}>TOTAL RETURNED</div>
                      </div>
                    </div>
                    <div style={{maxHeight:220,overflowY:"auto",display:"flex",flexDirection:"column",gap:5}}>
                      {refundStats.all.slice(0,8).map((r,i)=>(
                        <div key={r.id||i} style={{padding:"7px 10px",background:C.offWhite,borderRadius:7,
                          display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                          <div style={{flex:1,minWidth:0}}>
                            <StuLink sid={r.student_id}/>
                            <div style={{fontSize:10,color:C.muted,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.reason||"No reason"}</div>
                          </div>
                          <div style={{textAlign:"right",flexShrink:0}}>
                            <div style={{fontWeight:700,color:C.red,fontSize:12}}>{fmt(r.amount)}</div>
                            <div style={{fontSize:10,color:C.muted}}>{r.refund_date?new Date(r.refund_date).toLocaleDateString("en-NG"):"—"}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </Card>
            </div>

            {/* ── DISCOUNTS ── */}
            {discountStats.count>0&&(
              <Card style={{marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,gap:8,flexWrap:"wrap"}}>
                  <div>
                    <div style={{fontWeight:800,color:C.purple,fontSize:14}}>Discounts Applied</div>
                    <p style={{fontSize:12,color:C.muted,marginTop:2}}>{discountStats.count} discount{discountStats.count!==1?"s":""} — {fmt(discountStats.total)} waived</p>
                  </div>
                  <DlBtn onClick={dlDiscounts} label="Discounts PDF"/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                  {/* Breakdown by label */}
                  <div>
                    <div style={{fontSize:11,color:C.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:.4,marginBottom:8}}>By Type</div>
                    <div style={{display:"flex",flexDirection:"column",gap:5}}>
                      {discountStats.breakdown.map(d=>(
                        <div key={d.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                          padding:"7px 10px",background:C.purplePale,borderRadius:7}}>
                          <div>
                            <div style={{fontWeight:600,fontSize:12,color:C.text}}>{d.label}</div>
                            <div style={{fontSize:10,color:C.muted}}>{d.count} member{d.count!==1?"s":""}</div>
                          </div>
                          <strong style={{color:C.purple}}>{fmt(d.total)}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Recent discounts */}
                  <div>
                    <div style={{fontSize:11,color:C.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:.4,marginBottom:8}}>Recent</div>
                    <div style={{maxHeight:200,overflowY:"auto",display:"flex",flexDirection:"column",gap:5}}>
                      {[...discountStats.all].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,8).map((d,i)=>(
                        <div key={d.id||i} style={{padding:"7px 10px",background:C.offWhite,borderRadius:7,
                          display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                          <div style={{flex:1,minWidth:0}}>
                            <StuLink sid={d.student_id}/>
                            <div style={{fontSize:10,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                              {d.label} {d.discount_type==="percent"?`(${d.value}%)`:`(fixed)`}
                            </div>
                          </div>
                          <strong style={{color:C.purple,flexShrink:0}}>{fmt(d.amount)}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            )}

          </div>

          {/* ── Drill-down Panel (stat card click) ── */}
          {panel&&(
            <div style={{position:"sticky",top:80}}>
              <Card style={{border:`2px solid ${panel.color}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,gap:6}}>
                  <div style={{fontWeight:800,fontSize:14,color:panel.color,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{panel.title}</div>
                  <div style={{display:"flex",gap:5,alignItems:"center",flexShrink:0}}>
                    <DlBtn onClick={()=>dlPanel(panel,panelBills)} label="PDF"/>
                    <button onClick={closePanel} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:C.muted,lineHeight:1,padding:"2px 4px"}}>×</button>
                  </div>
                </div>
                <input value={panelSearch} onChange={e=>setPanelSearch(e.target.value)}
                  placeholder="Search members…"
                  style={{width:"100%",padding:"7px 10px",border:`1px solid ${C.border}`,borderRadius:7,fontSize:12,marginBottom:10,outline:"none"}}/>
                <div style={{fontSize:11,color:C.muted,marginBottom:8}}>{panelBills.length} record{panelBills.length!==1?"s":""}</div>
                <div style={{maxHeight:520,overflowY:"auto",display:"flex",flexDirection:"column",gap:6}}>
                  {panelBills.length===0?(
                    <div style={{textAlign:"center",padding:24,color:C.light}}>No records found</div>
                  ):panelBills.map((bill,i)=>{
                    const statusCol=bill.status==="paid"?C.green:bill.status==="partial"?C.amber:C.red;
                    return(
                      <div key={bill.id} style={{padding:"10px 12px",background:C.offWhite,borderRadius:8,
                        border:`1px solid ${C.border}`}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                          <div>
                            <div style={{fontWeight:700,fontSize:12}}>{stuName(bill.student_id)}</div>
                            <div style={{fontSize:10,color:C.muted}}>{stuClass(bill.student_id)} · {bill.student_id}</div>
                            <div style={{fontSize:10,color:C.muted}}>{bill.term} · {bill.academic_year}</div>
                          </div>
                          <Badge color={statusCol}>{bill.status}</Badge>
                        </div>
                        <div style={{display:"flex",gap:12,marginTop:6,fontSize:11}}>
                          <span>Bill: <strong>{fmt(bill.total_amount)}</strong></span>
                          <span style={{color:C.green}}>Paid: <strong>{fmt(bill.amount_paid)}</strong></span>
                          {+bill.balance>0&&<span style={{color:C.red}}>Bal: <strong>{fmt(bill.balance)}</strong></span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          )}

          {/* ── Item Drill-down Panel (overview mode mini panel) ── */}
          {itemPanel&&(
            <div style={{position:"sticky",top:80}}>
              <Card style={{border:`2px solid ${C.orange}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <div style={{fontWeight:800,fontSize:14,color:C.orange}}>{itemPanel.itemName}</div>
                  <button onClick={()=>{setItemPanel(null);setPanelSearch("");}}
                    style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:C.muted}}>×</button>
                </div>
                <div style={{fontSize:11,color:C.muted,marginBottom:10}}>
                  {itemPanel.bills.filter(b=>b.status==="paid").length} paid ·{" "}
                  {itemPanel.bills.filter(b=>b.status==="partial").length} partial ·{" "}
                  {itemPanel.bills.filter(b=>b.status==="unpaid").length} unpaid
                </div>
                <input value={panelSearch} onChange={e=>setPanelSearch(e.target.value)}
                  placeholder="Search members…"
                  style={{width:"100%",padding:"7px 10px",border:`1px solid ${C.border}`,borderRadius:7,fontSize:12,marginBottom:10,outline:"none"}}/>
                <div style={{display:"flex",gap:6,marginBottom:10}}>
                  {[["All",null],["Paid","paid"],["Partial","partial"],["Unpaid","unpaid"]].map(([lbl,val])=>{
                    const count=val?itemPanel.bills.filter(b=>b.status===val).length:itemPanel.bills.length;
                    return(
                      <button key={lbl} style={{padding:"4px 10px",borderRadius:99,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,
                        background:C.offWhite,color:C.muted}} title={`${count} ${lbl}`}>{lbl} ({count})</button>
                    );
                  })}
                </div>
                <div style={{maxHeight:500,overflowY:"auto",display:"flex",flexDirection:"column",gap:6}}>
                  {itemPanelBills.length===0?(
                    <div style={{textAlign:"center",padding:24,color:C.light}}>No records found</div>
                  ):itemPanelBills.map((bill)=>{
                    const statusCol=bill.status==="paid"?C.green:bill.status==="partial"?C.amber:C.red;
                    const item=(bill.fee_bill_items||[]).find(i=>i.item_name===itemPanel.itemName);
                    return(
                      <div key={bill.id} style={{padding:"10px 12px",background:C.offWhite,borderRadius:8,border:`1px solid ${C.border}`}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                          <div>
                            <div style={{fontWeight:700,fontSize:12}}>{stuName(bill.student_id)}</div>
                            <div style={{fontSize:10,color:C.muted}}>{stuClass(bill.student_id)} · {bill.student_id}</div>
                          </div>
                          <Badge color={statusCol}>{bill.status}</Badge>
                        </div>
                        <div style={{display:"flex",gap:12,marginTop:5,fontSize:11}}>
                          {item&&<span>Item: <strong>{fmt(item.amount)}</strong></span>}
                          <span style={{color:C.green}}>Paid: <strong>{fmt(bill.amount_paid)}</strong></span>
                          {+bill.balance>0&&<span style={{color:C.red}}>Bal: <strong>{fmt(bill.balance)}</strong></span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          )}
        </div>
      )}
      </>)}

      {/* ══════════ MEMBER LEDGER MODAL ══════════ */}
      {stuLedger&&(()=>{
        const sid=stuLedger.studentId;
        const stuBills=bills.filter(b=>String(b.student_id)===String(sid))
          .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
        const allPays=stuBills.flatMap(b=>(b.fee_payments||[]).map(p=>({...p,bill:b}))).sort((a,b)=>new Date(b.payment_date||b.created_at)-new Date(a.payment_date||a.created_at));
        const allRefunds=stuBills.flatMap(b=>(b.fee_refunds||[]).map(r=>({...r,bill:b})));
        const allDiscounts=stuBills.flatMap(b=>(b.fee_discounts||[]).map(d=>({...d,bill:b})));
        const totalPaid=allPays.filter(p=>!p.is_refunded).reduce((a,p)=>a+(+p.amount||0),0);
        const totalRefunded=allRefunds.reduce((a,r)=>a+(+r.amount||0),0);
        const totalDiscounted=allDiscounts.reduce((a,d)=>a+(+d.amount||0),0);
        const totalOwed=stuBills.reduce((a,b)=>a+(+b.balance||0),0);
        return(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
            onClick={()=>setStuLedger(null)}>
            <div style={{background:C.white,borderRadius:16,width:"100%",maxWidth:700,maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 32px 64px rgba(0,0,0,.2)"}}
              onClick={e=>e.stopPropagation()}>
              {/* Header */}
              <div style={{padding:"18px 22px",borderBottom:`2px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
                <div>
                  <div style={{fontWeight:900,fontSize:17,color:C.blue}}>{stuLedger.studentName}</div>
                  <div style={{fontSize:12,color:C.muted,marginTop:2}}>{stuClass(sid)} · ID: {sid} · Full payment history</div>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <DlBtn onClick={()=>dlStudentLedger(sid,stuLedger.studentName)} label="PDF"/>
                  <button onClick={()=>setStuLedger(null)}
                    style={{background:"none",border:"none",cursor:"pointer",fontSize:22,color:C.muted,lineHeight:1,padding:"4px 8px"}}>×</button>
                </div>
              </div>
              {/* Summary row */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:0,flexShrink:0,borderBottom:`1px solid ${C.border}`}}>
                {[
                  {l:"Total Paid",v:fmt(totalPaid),c:C.green},
                  {l:"Outstanding",v:fmt(totalOwed),c:totalOwed>0?C.red:C.muted},
                  {l:"Refunded",v:fmt(totalRefunded),c:C.red},
                  {l:"Discounts",v:fmt(totalDiscounted),c:C.purple},
                ].map(({l,v,c},i)=>(
                  <div key={i} style={{padding:"12px 16px",textAlign:"center",borderRight:i<3?`1px solid ${C.border}`:"none"}}>
                    <div style={{fontWeight:900,fontSize:16,color:c}}>{v}</div>
                    <div style={{fontSize:10,color:C.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:.4,marginTop:2}}>{l}</div>
                  </div>
                ))}
              </div>
              {/* Body: tabs */}
              <div style={{flex:1,overflowY:"auto",padding:"16px 22px"}}>
                {stuBills.length===0?(
                  <div style={{textAlign:"center",padding:40,color:C.light}}>No bills on record for this member</div>
                ):stuBills.map(bill=>{
                  const billPays=(bill.fee_payments||[]).sort((a,b)=>new Date(b.payment_date||b.created_at)-new Date(a.payment_date||a.created_at));
                  const billRefunds=bill.fee_refunds||[];
                  const billDiscounts=bill.fee_discounts||[];
                  const statusCol=bill.status==="paid"?C.green:bill.status==="partial"?C.amber:C.red;
                  return(
                    <div key={bill.id} style={{marginBottom:14,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
                      {/* Bill header */}
                      <div style={{padding:"10px 14px",background:C.offWhite,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
                        <div>
                          <span style={{fontWeight:800,fontSize:13,color:C.text}}>{bill.term||"—"} · {bill.academic_year||"—"}</span>
                          {bill.class_id&&<span style={{fontSize:11,color:C.muted,marginLeft:8}}>{stuClass(sid)}</span>}
                        </div>
                        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                          <span style={{fontSize:11,color:C.muted}}>Bill: <strong>{fmt(bill.total_amount)}</strong></span>
                          <span style={{fontSize:11,color:C.green}}>Paid: <strong>{fmt(bill.amount_paid)}</strong></span>
                          {+bill.balance>0&&<span style={{fontSize:11,color:C.red}}>Bal: <strong>{fmt(bill.balance)}</strong></span>}
                          <Badge color={statusCol}>{bill.status}</Badge>
                        </div>
                      </div>
                      {/* Payments */}
                      {billPays.length>0&&(
                        <div style={{padding:"8px 14px"}}>
                          {billPays.map((p,i)=>(
                            <div key={p.id||i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                              padding:"5px 0",borderBottom:i<billPays.length-1?`1px solid ${C.borderLight}`:"none",gap:8}}>
                              <div style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0}}>
                                <div style={{width:6,height:6,borderRadius:99,background:p.is_refunded?C.red:C.green,flexShrink:0}}/>
                                <span style={{fontSize:11,color:p.is_refunded?C.red:C.green,fontWeight:700}}>{fmt(p.amount)}</span>
                                <span style={{fontSize:11,color:C.muted}}>{p.payment_method==="paystack"?"Paystack":p.payment_method==="bank_transfer"?"Bank Transfer":"—"}</span>
                                {p.is_refunded&&<Badge color={C.red} style={{fontSize:9}}>refunded</Badge>}
                              </div>
                              <div style={{fontSize:11,color:C.muted,flexShrink:0}}>
                                {p.payment_date?new Date(p.payment_date).toLocaleDateString("en-NG",{day:"2-digit",month:"short",year:"numeric"}):"—"}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Discounts */}
                      {billDiscounts.length>0&&billDiscounts.map((d,i)=>(
                        <div key={d.id||i} style={{padding:"5px 14px",background:C.purplePale,display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                          <span style={{fontSize:11,color:C.purple}}>🏷 Discount: {d.label}</span>
                          <span style={{fontWeight:700,color:C.purple,fontSize:11}}>−{fmt(d.amount)}</span>
                        </div>
                      ))}
                      {/* Refunds */}
                      {billRefunds.length>0&&billRefunds.map((r,i)=>(
                        <div key={r.id||i} style={{padding:"5px 14px",background:C.redPale,display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                          <span style={{fontSize:11,color:C.red}}>↩ Refund: {r.reason||"No reason"}</span>
                          <span style={{fontWeight:700,color:C.red,fontSize:11}}>{fmt(r.amount)} · {r.refund_date?new Date(r.refund_date).toLocaleDateString("en-NG"):"—"}</span>
                        </div>
                      ))}
                      {billPays.length===0&&billDiscounts.length===0&&billRefunds.length===0&&(
                        <div style={{padding:"10px 14px",fontSize:11,color:C.light,fontStyle:"italic"}}>No payments recorded for this bill</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}

// ─── MY BILL PAGE (Member) ───────────────────────────────────────────────────
export function MyBillPage({ctx}){
  const {user,notify}=ctx;
  const {schoolName:_schoolNameBill,schoolLogo:_billSchoolLogo}=useSection();
  const _billSchoolName=_schoolNameBill||"Business Portal";
  const isMobile=useIsMobile();
  const [bills,setBills]=useState([]);
  const [loading,setLoading]=useState(true);
  const [activeBill,setActiveBill]=useState(null);
  const [paying,setPaying]=useState(false);
  const [payMode,setPayMode]=useState("full"); // "full"|"partial"
  const [partialAmt,setPartialAmt]=useState("");

  useEffect(()=>{
    db.getFeeBills({student_id:user.student_id}).then(({data})=>{
      // Exclude carried-forward bills — the debt has moved to the new term's bill
      const b=(data||[]).filter(x=>!x.carried_forward);
      setBills(b);
      if(b.length)setActiveBill(b[0]);
      setLoading(false);
    });
  },[user.student_id]);

  const toggleItem=async(item)=>{
    if(!item.is_optional){notify("Compulsory items cannot be removed","error");return;}
    if(+activeBill.amount_paid>0){notify("Optional items cannot be changed after a payment has been recorded. Contact the organization administrator.","error");return;}
    const newIncluded=!item.is_included;
    await db.updateFeeBillItem(item.id,{is_included:newIncluded});
    // Recalculate from DB (items − discounts − paid) — single source of truth
    await db.recalcBillTotals([activeBill.id]);
    // Refresh
    db.getFeeBills({student_id:user.student_id}).then(({data})=>{
      const b=data||[];setBills(b);
      setActiveBill(b.find(x=>x.id===activeBill.id)||b[0]);
    });
    notify(newIncluded?"Item added back ✓":"Item removed ✓");
  };

  const payWithPaystack=()=>{
    if(!activeBill){notify("No bill selected","error");return;}
    const _items=(activeBill.fee_bill_items||[]).filter(i=>i.is_included);
    const _sub=_items.reduce((a,i)=>a+(+i.amount||0),0);
    const _disc=(activeBill.fee_discounts||[]).reduce((a,d)=>a+(+d.amount||0),0);
    const balance=Math.max(0,_sub-_disc-(+activeBill.amount_paid||0));
    if(balance<=0){notify("No balance to pay","error");return;}
    const chosenAmt=payMode==="full"?balance:Math.round(+(partialAmt||0)*100)/100;
    if(!chosenAmt||chosenAmt<=0){notify("Enter a valid amount","error");return;}
    if(chosenAmt>balance+0.01){notify(`Amount cannot exceed balance of ${fmt(balance)}`,"error");return;}
    const key=import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;
    if(!key||key.includes("xxxx")){notify("Paystack is not configured. Contact the organization administrator.","error");return;}
    const st=user;
    const handler=window.PaystackPop?.setup({
      key,
      email:st.email||`${st.student_id}@school.edu`,
      amount:Math.round(chosenAmt*100), // Paystack expects kobo
      currency:"NGN",
      ref:`RGS-${activeBill.id}-${Date.now()}`,
      metadata:{student_id:st.student_id,bill_id:activeBill.id,name:st.name},
      // Paystack rejects async functions — use a regular function and invoke async logic inside
      callback:function(response){
        (async()=>{
          setPaying(true);
          notify("Verifying payment with Paystack…");
          try{
            const {data:{session}}=await supabase.auth.getSession();
            const res=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-payment`,{
              method:"POST",
              headers:{"Content-Type":"application/json","Authorization":`Bearer ${session?.access_token}`},
              body:JSON.stringify({
                reference:response.reference,
                bill_id:activeBill.id,
                student_id:st.student_id,
              }),
            });
            const result=await res.json();
            if(!res.ok||result.error){
              notify(`Payment verification failed: ${result.error}. Please contact the organization office with your reference: ${response.reference}`,"error");
            }else{
              notify("Payment successful and verified ✓");
              db.getFeeBills({student_id:user.student_id}).then(({data})=>{
                const b=data||[];setBills(b);setActiveBill(b.find(x=>x.id===activeBill.id)||b[0]);
              });
            }
          }catch(e){
            notify(`Network error during verification. Save your reference: ${response.reference} and contact the organization office.`,"error");
          }finally{setPaying(false);}
        })();
      },
      onClose:()=>{}
    });
    handler?.openIframe();
  };

  const printBill=(type="bill")=>{
    const bill=activeBill;
    const items=(bill.fee_bill_items||[]).filter(i=>i.is_included);
    const isReceipt=type==="receipt";
    const billNo=`${isReceipt?"JD-RCPT":"JD-BILL"}-${String(bill.id).padStart(5,"0")}`;
    const today=new Date().toLocaleDateString("en-NG",{day:"2-digit",month:"long",year:"numeric"});
    const isPaid=bill.status==="paid";
    const html=buildPDF({bill,items,billNo,today,name:user.name||user.student_id,studentId:user.student_id,className:null,isPaid,isReceipt,isNativePlatform:isNative(),schoolName:_billSchoolName,schoolLogo:_billSchoolLogo||null});
    openHtmlDoc(html,{title:billNo,showPDF:ctx.showPDF});
  };

  const statusColor=s=>s==="paid"?C.green:s==="partial"?C.amber:C.red;

  if(loading)return <Spinner/>;

  return(
    <div>
      <div style={{marginBottom:18}}>
        <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="receipt" size={20}/>My Billing Bill</h2>
        <p style={{color:C.muted,fontSize:12}}>{user.name}</p>
      </div>

      {bills.length===0?(
        <Card>
          <div style={{textAlign:"center",padding:48,color:C.light}}>
            <div style={{marginBottom:12}}><ReceiptText size={40} color={C.muted}/></div>
            <div style={{fontSize:15,fontWeight:700,marginBottom:6}}>No bills yet</div>
            <div style={{fontSize:13}}>Your billing bill will appear here once generated by the organization</div>
          </div>
        </Card>
      ):(
        <>
          {/* Bill Selector if multiple terms */}
          {bills.length>1&&(
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
              {bills.map(b=>(
                <button key={b.id} onClick={()=>setActiveBill(b)}
                  style={{padding:"7px 16px",borderRadius:20,border:`2px solid ${activeBill?.id===b.id?C.orange:C.border}`,
                    background:activeBill?.id===b.id?C.orangePale:C.white,cursor:"pointer",
                    fontSize:13,fontWeight:700,color:activeBill?.id===b.id?C.orange:C.text}}>
                  {b.term} · {b.academic_year}
                </button>
              ))}
            </div>
          )}

          {activeBill&&(()=>{
            // Compute effective totals from raw data — don't trust stale DB balance/total_amount
            const _billItems=(activeBill.fee_bill_items||[]).filter(i=>i.is_included);
            const _billSubtotal=_billItems.reduce((a,i)=>a+(+i.amount||0),0);
            const _billDiscounts=(activeBill.fee_discounts||[]).reduce((a,d)=>a+(+d.amount||0),0);
            const _billTotal=Math.max(0,_billSubtotal-_billDiscounts);
            const _billPaid=+activeBill.amount_paid||0;
            const _billBalance=Math.max(0,_billTotal-_billPaid);
            const _billStatus=_billPaid<=0?"unpaid":_billBalance<=0?"paid":"partial";
            return(
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {/* ── Actions strip (mobile: top; desktop: inline right) ── */}
              <div style={{display:"flex",flexDirection:isMobile?"column":"row",gap:12,alignItems:"flex-start"}}>

                {/* Balance + Pay card */}
                <Card style={{flex:isMobile?"none":"0 0 260px",width:isMobile?"100%":"260px"}}>
                  <div style={{textAlign:"center",marginBottom:12}}>
                    <div style={{fontSize:32,fontWeight:900,color:statusColor(_billStatus),lineHeight:1}}>
                      {fmt(_billBalance)}
                    </div>
                    <div style={{fontSize:12,color:C.muted,marginTop:4}}>Balance Due</div>
                    <Badge color={statusColor(_billStatus)} style={{marginTop:8,fontSize:12}}>
                      {_billStatus.toUpperCase()}
                    </Badge>
                  </div>
                  {_billBalance>0&&(
                    <>
                      <div style={{display:"flex",gap:6,marginBottom:8}}>
                        <button onClick={()=>{setPayMode("full");setPartialAmt("");}}
                          style={{flex:1,padding:"8px 4px",border:`2px solid ${payMode==="full"?C.green:C.border}`,
                            borderRadius:8,background:payMode==="full"?C.greenPale:C.white,cursor:"pointer",
                            fontWeight:700,fontSize:12,color:payMode==="full"?C.green:C.muted}}>
                          Full<br/><span style={{fontWeight:400,fontSize:11}}>{fmt(_billBalance)}</span>
                        </button>
                        <button onClick={()=>setPayMode("partial")}
                          style={{flex:1,padding:"8px 4px",border:`2px solid ${payMode==="partial"?C.blue:C.border}`,
                            borderRadius:8,background:payMode==="partial"?C.bluePale:C.white,cursor:"pointer",
                            fontWeight:700,fontSize:12,color:payMode==="partial"?C.blue:C.muted}}>
                          Partial<br/><span style={{fontWeight:400,fontSize:11}}>Custom</span>
                        </button>
                      </div>
                      {payMode==="partial"&&(
                        <input type="number" value={partialAmt} onChange={e=>setPartialAmt(e.target.value)}
                          placeholder={`Max ${fmt(_billBalance)}`}
                          min={1} max={_billBalance}
                          style={{width:"100%",padding:"9px 12px",
                            border:`1.5px solid ${+partialAmt>_billBalance?C.red:C.blue}`,
                            borderRadius:8,fontSize:13,fontWeight:600,marginBottom:8,
                            outline:"none",boxSizing:"border-box"}}/>
                      )}
                      <Btn onClick={payWithPaystack} color={C.green} style={{width:"100%",marginBottom:8,justifyContent:"center"}}
                        disabled={paying||(payMode==="partial"&&(!(+partialAmt>0)||+partialAmt>_billBalance))}>
                        {paying?"Processing…":"Pay Online"}
                      </Btn>
                    </>
                  )}
                  <Btn onClick={()=>printBill(+activeBill.amount_paid>0?"receipt":"bill")} color={C.blue} outline
                    style={{width:"100%",marginBottom:6,justifyContent:"center"}}>
                    Print Invoice/Receipt
                  </Btn>
                </Card>

                {/* Bill detail card */}
                <Card style={{flex:1,padding:0,overflow:"hidden",width:"100%"}}>
                {/* Header */}
                <div style={{background:`linear-gradient(135deg,${C.blue},${C.blueDark})`,
                  padding:"18px 20px",color:"#fff"}}>
                  <div style={{fontSize:17,fontWeight:900,marginBottom:2,lineHeight:1.3}}>
                    {_billSchoolName}
                  </div>
                  <div style={{fontSize:12,opacity:.8,marginTop:3}}>
                    {activeBill.term} {activeBill.academic_year} · Billing Bill
                  </div>
                  <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
                    <Badge color="#fff" style={{color:C.blue,fontSize:11}}>{user.name||user.student_id}</Badge>
                    <Badge color={statusColor(_billStatus)} style={{color:"#fff",fontSize:11}}>
                      {_billStatus.toUpperCase()}
                    </Badge>
                  </div>
                </div>

                {/* Items */}
                <div style={{padding:"0 0 16px"}}>
                  {/* Horizontal scroll wrapper for mobile */}
                  <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",minWidth:360}}>
                    <thead>
                      <tr style={{background:C.offWhite}}>
                        <th style={{padding:"10px 16px",textAlign:"left",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",whiteSpace:"nowrap"}}>Item</th>
                        <th style={{padding:"10px 10px",textAlign:"center",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",whiteSpace:"nowrap"}}>Type</th>
                        <th style={{padding:"10px 16px",textAlign:"right",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",whiteSpace:"nowrap"}}>Amount</th>
                        <th style={{padding:"10px 10px",textAlign:"center",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",whiteSpace:"nowrap"}}>Opt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(activeBill.fee_bill_items||[]).map((item,i)=>(
                        <tr key={item.id} style={{borderBottom:`1px solid ${C.border}`,
                          opacity:item.is_included?1:0.45,background:i%2===0?C.white:C.offWhite}}>
                          <td style={{padding:"12px 20px",fontWeight:600,color:C.text,
                            textDecoration:item.is_included?"none":"line-through"}}>
                            {item.name}
                          </td>
                          <td style={{padding:"12px 12px",textAlign:"center"}}>
                            <Badge color={item.is_optional?C.purple:C.orange} style={{fontSize:10}}>
                              {item.is_optional?"Optional":"Compulsory"}
                            </Badge>
                          </td>
                          <td style={{padding:"12px 20px",textAlign:"right",fontWeight:700,
                            color:item.is_included?C.green:C.muted}}>
                            {fmt(item.amount)}
                          </td>
                          <td style={{padding:"12px 12px",textAlign:"center"}}>
                            {item.is_optional?(
                              +activeBill.amount_paid>0
                                ? <Lock size={13} color={C.muted} title="Locked after payment"/>
                                : <label style={{cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                                    <input type="checkbox" checked={!item.is_included}
                                      onChange={()=>toggleItem(item)}
                                      style={{width:14,height:14,accentColor:C.red,cursor:"pointer"}}/>
                                    <span style={{fontSize:10,color:C.muted}}>Opt out</span>
                                  </label>
                            ):<span style={{fontSize:10,color:C.light}}>—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      {(activeBill.fee_discounts||[]).length>0&&(activeBill.fee_discounts||[]).map(d=>(
                        <tr key={d.id} style={{background:C.greenPale}}>
                          <td colSpan={2} style={{padding:"8px 20px",color:C.green,fontWeight:700}}>
                            {d.discount_type==="percent"?` (${d.value}%)`:""}</td>
                          <td style={{padding:"8px 20px",textAlign:"right",color:C.green,fontWeight:700}}>− {fmt(d.amount)}</td>
                          <td/>
                        </tr>
                      ))}
                      <tr style={{background:C.offWhite,borderTop:`2px solid ${C.border}`}}>
                        <td colSpan={2} style={{padding:"12px 20px",fontWeight:900,fontSize:15,color:C.blue}}>TOTAL</td>
                        <td style={{padding:"12px 20px",textAlign:"right",fontWeight:900,fontSize:16,color:C.green}}>{fmt(_billTotal)}</td>
                        <td/>
                      </tr>
                      {_billPaid>0&&(
                        <tr>
                          <td colSpan={2} style={{padding:"8px 20px",color:C.green,fontWeight:700}}>Amount Paid</td>
                          <td style={{padding:"8px 20px",textAlign:"right",color:C.green,fontWeight:700}}>{fmt(_billPaid)}</td>
                          <td/>
                        </tr>
                      )}
                      {_billBalance>0&&(
                        <tr style={{background:C.redPale}}>
                          <td colSpan={2} style={{padding:"10px 20px",color:C.red,fontWeight:900,fontSize:14}}>Balance Due</td>
                          <td style={{padding:"10px 20px",textAlign:"right",color:C.red,fontWeight:900,fontSize:15}}>{fmt(_billBalance)}</td>
                          <td/>
                        </tr>
                      )}
                    </tfoot>
                  </table>
                  </div>{/* end scroll wrapper */}

                  {/* Banking Info */}
                  <div style={{margin:"14px 16px 0",padding:"12px 14px",background:C.offWhite,
                    borderRadius:10,border:`1px solid ${C.border}`,fontSize:13,color:C.muted}}>
                    <strong style={{color:C.text,fontSize:12}}>Banking Information</strong>
                    <div style={{marginTop:5,fontWeight:600,color:C.text,letterSpacing:.5}}>
                      United Bank of Africa: <span style={{fontFamily:"monospace",fontSize:14}}>1021639196</span>
                    </div>
                    {activeBill.due_date&&(
                      <div style={{marginTop:4,fontSize:12}}>
                        Due: <strong style={{color:C.red}}>
                          {new Date(activeBill.due_date).toLocaleDateString("en-NG")}
                        </strong>
                      </div>
                    )}
                  </div>
                </div>
                </Card>{/* end bill detail card */}
              </div>{/* end actions+detail row */}

              {/* Transaction History — full width below */}
              {((activeBill.fee_payments||[]).length>0||(activeBill.fee_refunds||[]).length>0)&&(
                <Card>
                  <div style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:14,
                    display:"flex",alignItems:"center",gap:6}}>
                    Transaction History
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:0}}>
                    {[
                      ...(activeBill.fee_payments||[]).map(p=>({...p,_type:"payment"})),
                      ...(activeBill.fee_refunds||[]).map(r=>({...r,_type:"refund"})),
                    ].sort((a,b)=>new Date(a.created_at||a.payment_date||a.refund_date)-new Date(b.created_at||b.payment_date||b.refund_date))
                    .map((entry,idx,arr)=>{
                      const isRefund=entry._type==="refund";
                      const rawDate=entry.created_at||entry.payment_date||entry.refund_date;
                      const dateStr=rawDate?new Date(rawDate).toLocaleString("en-NG",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:true}):"—";
                      const methodIcon=isRefund?"↩":entry.payment_method==="paystack"?"card":"bank";
                      const methodLabel=isRefund?"Refund":entry.payment_method==="paystack"?"Paystack":"Bank Transfer";
                      const authorLabel=isRefund?"Authorized by Admin":entry.payment_method==="paystack"?"Online Payment":"Recorded by Admin";
                      return(
                        <div key={entry.id+entry._type}
                          style={{display:"flex",alignItems:"flex-start",gap:12,
                            padding:"12px 0",
                            borderBottom:idx<arr.length-1?`1px solid ${C.borderLight}`:"none"}}>
                          {/* Icon dot */}
                          <div style={{width:36,height:36,borderRadius:10,flexShrink:0,
                            background:isRefund?C.redPale:C.greenPale,
                            display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>
                            {methodIcon}
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                              <div>
                                <div style={{fontWeight:700,fontSize:13,color:C.text}}>{methodLabel}</div>
                                <div style={{fontSize:11,color:C.muted,marginTop:1}}>{authorLabel}</div>
                                {isRefund&&entry.reason&&(
                                  <div style={{fontSize:11,color:C.orange,marginTop:1}}>Reason: {entry.reason}</div>
                                )}
                                {!isRefund&&entry.bank_reference&&(
                                  <div style={{fontSize:10,color:C.light,marginTop:1,fontFamily:"monospace"}}>Ref: {entry.bank_reference}</div>
                                )}
                                <div style={{fontSize:11,color:C.light,marginTop:2}}>{dateStr}</div>
                              </div>
                              <div style={{fontWeight:800,fontSize:16,
                                color:isRefund?C.red:C.green,whiteSpace:"nowrap"}}>
                                {isRefund?"−":"+"}  {fmt(entry.amount)}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}
            </div>
          );})()}
        </>
      )}
    </div>
  );
}

// AnnouncePage -> src/pages/comms.jsx

// ─ buildMultiPeriodTranscriptHTML, buildTranscriptHTML, openTranscriptPDF moved to services/pdf/transcript.js

// ─── TRANSCRIPT PAGE ──────────────────────────────────────────────────────────
