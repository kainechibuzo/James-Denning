/**
 * Communications pages: Announcements, Mail Compose (+ EmailProgressModal), Mail Logs.
 */
import React, { useState, useEffect, useRef } from "react";
import {
  Pencil, Trash2, Search, FileText, Lock, RefreshCw, CheckCircle,
} from "lucide-react";
import { db, supabase } from "../supabaseClient.js";
import { C } from "../config/theme.js";
import { useSection } from "../contexts/section.jsx";
import { useConfirm } from "../contexts/confirm.jsx";
import { useIsMobile } from "../utils/hooks.js";
import { fullName } from "../utils/grades.js";
import { sendEmailBatchBackground } from "../services/email/index.js";
import {
  Card, Btn, Badge, Inp, Sel, Modal, Spinner, AppIcon,
} from "../components/ui.jsx";

// ─── ANNOUNCEMENTS ────────────────────────────────────────────────────────────
export function AnnouncePage({ctx}){
  const {notify}=ctx;
  const confirm=useConfirm();
  const [announcements,setAnnouncements]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modal,setModal]=useState(false);
  const [editId,setEditId]=useState(null);
  const blank={title:"",body:"",audience:"all"};
  const [form,setForm]=useState(blank);
  const f=v=>setForm(p=>({...p,...v}));

  const load=()=>{
    setLoading(true);
    db.getAnnouncements().then(({data})=>{setAnnouncements(data||[]);setLoading(false);});
  };
  useEffect(load,[]);

  const post=async()=>{
    if(!form.title||!form.body){notify("Title and body required","error");return;}
    const {error}=await db.upsertAnnouncement({...form,target_audience:[form.audience],is_active:true},editId);
    if(error)notify(error.message,"error");
    else{notify(editId?"Updated \u2713":"Announcement posted \u2713");setModal(false);setForm(blank);load();}
  };
  const del=async(id)=>{
    const __ok=await confirm({title:"Delete Announcement?",
        message:"Permanently remove this announcement? It will disappear for all users immediately.",
        confirmLabel:"Delete",danger:true});
    if(!__ok)return;
    const {error}=await db.deleteAnnouncement(id);
    if(error)notify(error.message,"error");
    else{notify("Deleted","warn");load();}
  };

  const audCol=a=>a==="students"?C.blue:a==="teachers"?C.green:C.orange;
  const getAud=a=>{
    if(Array.isArray(a))return a[0]||"all";
    return a||"all";
  };

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="announce" size={20}/>Announcements</h2>
        <Btn onClick={()=>{setForm(blank);setEditId(null);setModal(true);}} color={C.orange}>New Announcement</Btn>
      </div>
      {loading?<Spinner/>:(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {announcements.map(a=>{
            const aud=getAud(a.target_audience||a.audience);
            return(
              <Card key={a.id}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1,paddingRight:12}}>
                    <div style={{fontWeight:800,fontSize:14,color:C.blue,marginBottom:5}}>{a.title}</div>
                    <div style={{color:C.text,fontSize:13,lineHeight:1.6,marginBottom:8}}>{a.body}</div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <Badge color={audCol(aud)}>{aud}</Badge>
                      <span style={{fontSize:11,color:C.light}}>
                        {new Date(a.created_at).toLocaleDateString("en-NG",{day:"numeric",month:"long",year:"numeric"})}
                      </span>
                      {a.is_active===false&&<Badge color={C.red}>Inactive</Badge>}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:5}}>
                    <Btn xs onClick={()=>{setForm({title:a.title,body:a.body,audience:getAud(a.target_audience||a.audience)});setEditId(a.id);setModal(true);}} color={C.blue} outline><Pencil size={13}/></Btn>
                    <Btn xs onClick={()=>del(a.id)} color={C.red} outline><Trash2 size={13}/></Btn>
                  </div>
                </div>
              </Card>
            );
          })}
          {!announcements.length&&(
            <Card style={{textAlign:"center",padding:36}}><div style={{color:C.light}}>No announcements yet</div></Card>
          )}
        </div>
      )}
      {modal&&(
        <Modal title={editId?"Edit Announcement":"New Announcement"} onClose={()=>setModal(false)}>
          <Inp label="Title *" value={form.title} onChange={v=>f({title:v})} placeholder="e.g. Organization Closure Notice"/>
          <div style={{marginBottom:13}}>
            <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>Body *</label>
            <textarea value={form.body} onChange={e=>f({body:e.target.value})} rows={4}
              style={{width:"100%",padding:"9px 12px",border:`2px solid ${C.border}`,background:"inherit",color:C.text,borderRadius:8,fontSize:13,resize:"vertical",outline:"none"}}
              placeholder="Write your announcement\u2026"
              onFocus={e=>e.target.style.borderColor=C.orange}
              onBlur={e=>e.target.style.borderColor=C.border}/>
          </div>
          <Sel label="Audience" value={form.audience} onChange={v=>f({audience:v})}
            options={["all","students","teachers"]}/>
          <div style={{display:"flex",gap:10,marginTop:6}}>
            <Btn onClick={post} color={C.orange} style={{flex:1}}>Post</Btn>
            <Btn onClick={()=>setModal(false)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── EMAIL PROGRESS MODAL ─────────────────────────────────────────────────────
export function EmailProgressModal({emails,onClose,schoolId=""}){
  const isMobile=useIsMobile();
  const [rate,setRate]=useState(10);
  const [phase,setPhase]=useState("idle"); // idle | queuing | running | done
  const [batchId,setBatchId]=useState(null);
  const [prog,setProg]=useState({sent:0,failed:0,pending:0,total:0,failedRecipients:[],done:false});
  const pollerRef=useRef(null);
  const total=emails.length;

  const startSending=async()=>{
    setPhase("queuing");
    const{batchId:bid,error}=await sendEmailBatchBackground(emails,schoolId,rate);
    if(error){setPhase("idle");return;}
    setBatchId(bid);
    setPhase("running");
    pollerRef.current=setInterval(async()=>{
      const{data}=await db.getEmailQueueStatus(bid);
      if(!data)return;
      setProg(data);
      if(data.done){
        clearInterval(pollerRef.current);
        setPhase("done");
        db.logEmail({
          subject:emails[0]?.subject||"",
          body:"",
          recipient_count:data.total,
          delivered_count:data.sent,
          failed_count:data.failed,
          failed_recipients:data.failedRecipients,
          status:data.failed===0?"sent":data.sent===0?"failed":"partial",
          metadata:JSON.stringify({batch_id:bid}),
        });
      }
    },4000);
  };
  useEffect(()=>()=>{if(pollerRef.current)clearInterval(pollerRef.current);},[]);

  const pct=prog.total>0?Math.round((prog.sent+prog.failed)/prog.total*100):0;
  const remaining=prog.total>0?prog.total-prog.sent-prog.failed:total;

  return(
    <Modal title={phase==="idle"?"Send Emails":phase==="done"?"Sending Complete":"Sending in Background\u2026"} onClose={phase==="idle"||phase==="done"?onClose:null} width={500}>
      {phase==="idle"&&(
        <>
          <div style={{marginBottom:16,padding:"12px 16px",background:C.bluePale,borderRadius:10,fontSize:13,color:C.blue}}>
            <strong>{total} email{total!==1?"s":""}</strong> ready to send.
          </div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>Sending Speed</div>
            {[{r:10,label:"Safe \u2014 10/min",desc:"Recommended \u2014 avoids spam filters"},{r:20,label:"Fast \u2014 20/min",desc:"Faster but may trigger spam filters"}].map(o=>(
              <label key={o.r} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",border:`2px solid ${rate===o.r?C.blue:C.border}`,
                borderRadius:8,cursor:"pointer",marginBottom:8,background:rate===o.r?C.bluePale:"#fff"}}>
                <input type="radio" checked={rate===o.r} onChange={()=>setRate(o.r)} style={{accentColor:C.blue}}/>
                <div>
                  <div style={{fontWeight:700,fontSize:13,color:C.text}}>{o.label}</div>
                  <div style={{fontSize:11,color:C.muted}}>{o.desc} \u2014 Est. {Math.ceil(total/o.r)} min{Math.ceil(total/o.r)!==1?"s":""}</div>
                </div>
              </label>
            ))}
          </div>
          <div style={{background:C.greenPale,border:`1px solid ${C.green}44`,borderRadius:8,padding:"9px 13px",marginBottom:14,fontSize:12,color:C.green}}>
            Emails are sent server-side \u2014 <strong>you can close this modal or navigate away</strong> and sending will continue in the background.
          </div>
          <div style={{display:"flex",flexDirection:isMobile?"column-reverse":"row",gap:10}}>
            <Btn onClick={startSending} color={C.blue} style={{flex:1,justifyContent:"center"}}>Queue {total} Email{total!==1?"s":""}{isMobile?"":" for Sending"}</Btn>
            <Btn onClick={onClose} color={C.muted} outline style={{flex:1,justifyContent:"center"}}>Cancel</Btn>
          </div>
        </>
      )}
      {(phase==="queuing"||phase==="running")&&(
        <>
          {phase==="queuing"&&(
            <div style={{textAlign:"center",padding:"24px 0"}}>
              <Spinner/>
              <p style={{marginTop:12,color:C.muted,fontSize:13}}>Queuing emails\u2026</p>
            </div>
          )}
          {phase==="running"&&(
            <>
              <div style={{background:C.greenPale,border:`1px solid ${C.green}40`,borderRadius:8,padding:"8px 14px",marginBottom:14,fontSize:12,color:C.green}}>
                Sending in background \u2014 safe to close this modal or navigate away
              </div>
              <div style={{height:12,background:C.offWhite,borderRadius:6,overflow:"hidden",marginBottom:14,border:`1px solid ${C.border}`}}>
                <div style={{height:"100%",width:`${pct}%`,background:C.blue,borderRadius:6,transition:"width .6s ease"}}/>
              </div>
              <div style={{display:"flex",gap:16,justifyContent:"center",marginBottom:14,fontSize:13}}>
                <span><strong style={{color:C.green}}>{prog.sent}</strong> sent</span>
                <span><strong style={{color:C.red}}>{prog.failed}</strong> failed</span>
                <span>\u23f3 <strong style={{color:C.muted}}>{remaining}</strong> remaining</span>
              </div>
              <div style={{fontSize:11,color:C.light,textAlign:"center",marginBottom:8}}>
                {prog.total>0?`${prog.sent+prog.failed} / ${prog.total} processed`:"Waiting for server\u2026"}
              </div>
              <Btn onClick={onClose} color={C.muted} outline style={{width:"100%",justifyContent:"center",marginTop:8}}>
                Close (sending continues in background)
              </Btn>
            </>
          )}
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
              <div style={{fontWeight:700,fontSize:12,color:C.amber,marginBottom:6}}>{prog.failed} email{prog.failed!==1?"s":""} failed:</div>
              <div style={{maxHeight:120,overflowY:"auto"}}>
                {(prog.failedRecipients||[]).map((r,i)=>(
                  <div key={i} style={{fontSize:11,color:C.amber,marginBottom:2}}>\u2022 {r.email}{r.error?` \u2014 ${r.error}`:""}</div>
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

// ─── MAIL COMPOSE PAGE ────────────────────────────────────────────────────────
export function MailComposePage({ctx}){
  const {notify,role,canAccess,selectedSchool}=ctx;
  const {schoolName:_mailSchoolName}=useSection();
  const _mailSN=_mailSchoolName||"Business Portal";
  const canSend=role==="admin"||canAccess("action:send_email");
  const [teachers,setTeachers]=useState([]);
  const [students,setStudents]=useState([]);
  const [classes,setClasses]=useState([]);
  const [templates,setTemplates]=useState([]);
  const [selTemplate,setSelTemplate]=useState("");
  const [recipientType,setRecipientType]=useState("individual");
  const [selClass,setSelClass]=useState("");
  const [selIndividuals,setSelIndividuals]=useState([]);
  const [excludedEmails,setExcludedEmails]=useState([]);
  const [refineSearchQ,setRefineSearchQ]=useState("");
  const [searchQ,setSearchQ]=useState("");
  const [addManualQ,setAddManualQ]=useState("");
  const [manualEmail,setManualEmail]=useState("");
  const [subject,setSubject]=useState("");
  const [body,setBody]=useState("");
  const [msgKey,setMsgKey]=useState(0);
  const [sending,setSending]=useState(false);
  const [bulkEmailQueue,setBulkEmailQueue]=useState(null);
  const [tab,setTab]=useState("compose");
  const [tmplModal,setTmplModal]=useState(false);
  const [tmplForm,setTmplForm]=useState({name:"",subject:"",body:"",description:""});
  const [editTmplId,setEditTmplId]=useState(null);

  useEffect(()=>{
    Promise.all([db.getTeachers(),db.getStudents(),db.getClasses(),db.getEmailTemplates()]).then(([t,s,c,tmpl])=>{
      setTeachers(t.data||[]);setStudents(s.data||[]);setClasses(c.data||[]);setTemplates(tmpl.data||[]);
    });
  },[]);

  const applyTemplate=id=>{const t=templates.find(x=>x.id===+id);if(t){setSubject(t.subject);setBody(t.body);setMsgKey(k=>k+1);}};

  const allPeople=[
    ...(teachers||[]).filter(t=>t.email).map(t=>({email:t.email,name:t.full_name,type:"teacher"})),
    ...(students||[]).filter(s=>s.email).map(s=>({email:s.email,name:s.first_name?`${s.first_name} ${s.last_name||""}`.trim():s.name,type:"student"}))
  ];
  const filteredPeople=searchQ.length>1?allPeople.filter(p=>
    p.name?.toLowerCase().includes(searchQ.toLowerCase())||p.email?.toLowerCase().includes(searchQ.toLowerCase())
  ):[];

  const getRecipients=()=>{
    let list=[];
    if(recipientType==="individual") list=selIndividuals;
    else if(recipientType==="manual"){
      list=manualEmail.split(/[\s,;]+/).map(e=>e.trim()).filter(e=>e&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
        .map(e=>({email:e,name:e}));
    }
    else if(recipientType==="class") list=students.filter(s=>s.class_id===+selClass&&s.email)
      .map(s=>({email:s.email,name:s.first_name?`${s.first_name} ${s.last_name||""}`.trim():s.name}));
    else if(recipientType==="all-students") list=students.filter(s=>s.email)
      .map(s=>({email:s.email,name:s.first_name?`${s.first_name} ${s.last_name||""}`.trim():s.name}));
    else if(recipientType==="all-teachers") list=teachers.filter(t=>t.email).map(t=>({email:t.email,name:t.full_name}));
    else if(recipientType==="all") list=[
      ...students.filter(s=>s.email).map(s=>({email:s.email,name:s.first_name?`${s.first_name} ${s.last_name||""}`.trim():s.name})),
      ...teachers.filter(t=>t.email).map(t=>({email:t.email,name:t.full_name}))
    ];

    if(recipientType!=="individual" && recipientType!=="manual"){
      return list.filter(r=>!excludedEmails.includes(r.email));
    }
    return list;
  };

  const addManualRecipient=()=>{
    const e=addManualQ.trim();
    if(!e||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)){notify("Please enter a valid email address","error");return;}
    if(!selIndividuals.find(r=>r.email===e))setSelIndividuals(p=>[...p,{email:e,name:e}]);
    setAddManualQ("");
  };

  const buildEmailHtml=(subj,bodyText)=>{
    const year=new Date().getFullYear();
    const dateStr=new Date().toLocaleDateString("en-NG",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
    const esc=(s="")=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const BG="#f7f7f5";
    const WHITE="#ffffff";
    const ORANGE="#E8490F";
    const GREEN="#1B7A2F";
    const PURPLE="#4B3B8C";
    const BORDER="#e0ddd7";
    const TEXTDARK="#1a1a1a";
    const TEXTMID="#3d3d3d";
    const TEXTLIGHT="#777";
    const rows=bodyText.replace(/\r\n/g,"\n").replace(/\r/g,"\n").split("\n").map(l=>
      `<tr><td style="padding:3px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.75;color:${TEXTMID};">${esc(l)||"&nbsp;"}</td></tr>`
    ).join("");
    return`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>${esc(subj)}</title></head>
<body style="margin:0;padding:0;background:${BG};">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:28px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.09);">
  <tr>
    <td style="background:${ORANGE};height:6px;font-size:0;line-height:0;">&nbsp;</td>
    <td style="background:${GREEN};height:6px;font-size:0;line-height:0;width:60%;">&nbsp;</td>
    <td style="background:${PURPLE};height:6px;font-size:0;line-height:0;width:20%;">&nbsp;</td>
  </tr>
  <tr><td colspan="3" style="background:${WHITE};padding:32px 40px 24px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="vertical-align:middle;">
          <div style="font-family:Arial,sans-serif;font-size:20px;font-weight:800;color:${GREEN};letter-spacing:-0.4px;line-height:1.2;margin-bottom:5px;">${esc(_mailSN)}</div>
          <div style="font-family:Arial,sans-serif;font-size:11px;color:${TEXTLIGHT};letter-spacing:0.4px;">Organization update</div>
        </td>
        <td style="vertical-align:top;text-align:right;white-space:nowrap;">
          <div style="font-family:Arial,sans-serif;font-size:11px;color:${TEXTLIGHT};">${dateStr}</div>
        </td>
      </tr>
    </table>
  </td></tr>
  <tr><td colspan="3" style="background:${GREEN};padding:14px 40px;">
    <div style="font-family:Arial,sans-serif;font-size:16px;font-weight:700;color:${WHITE};">${esc(subj)}</div>
  </td></tr>
  <tr><td colspan="3" style="background:${WHITE};padding:36px 40px 28px;">
    <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
  </td></tr>
  <tr><td colspan="3" style="background:${WHITE};padding:0 40px;">
    <div style="border-top:2px solid ${BORDER};"></div>
  </td></tr>
  <tr><td colspan="3" style="background:#fafaf8;padding:24px 40px 20px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="vertical-align:top;">
          <div style="font-family:Georgia,serif;font-size:13px;font-weight:700;color:${GREEN};margin-bottom:8px;">${esc(_mailSN)}</div>
        </td>
        <td style="vertical-align:top;text-align:right;">
          <div style="font-family:Arial,sans-serif;font-size:11px;color:${TEXTLIGHT};line-height:1.9;">
            Sent via Business Portal<br/>
            &copy; ${year} ${esc(_mailSN)}<br/>
            All rights reserved.
          </div>
        </td>
      </tr>
    </table>
  </td></tr>
  <tr><td colspan="3" style="background:#f0ede8;padding:14px 40px;">
    <div style="font-family:Arial,sans-serif;font-size:11px;color:${TEXTLIGHT};text-align:center;line-height:1.7;">
      This is a computer-generated email. Please do not reply directly to this message.<br/>
      For enquiries, contact the organization administration office.
    </div>
  </td></tr>
  <tr>
    <td style="background:${PURPLE};height:5px;font-size:0;line-height:0;width:20%;">&nbsp;</td>
    <td style="background:${GREEN};height:5px;font-size:0;line-height:0;width:60%;">&nbsp;</td>
    <td style="background:${ORANGE};height:5px;font-size:0;line-height:0;">&nbsp;</td>
  </tr>
</table>
</td></tr>
</table>
</body></html>`;
  };

  const send=async()=>{
    if(!canSend){notify("No permission to send emails","error");return;}
    if(!subject.trim()||!body.trim()){notify("Category and body are required","error");return;}
    const recipients=getRecipients();
    if(!recipients.length){notify("No recipients selected","error");return;}
    setSending(true);
    const htmlBody=buildEmailHtml(subject,body);
    if(recipients.length===1){
      try{
        const resp=await supabase.functions.invoke("send-email",{
          body:{to:recipients[0].email,subject,html:htmlBody}
        });
        if(resp.error)throw new Error(resp.error.message||"Send failed");
        await db.logEmail({subject,body,recipient_count:1,delivered_count:1,failed_count:0,
          failed_recipients:[],status:"sent",
          metadata:JSON.stringify({type:recipientType,class_id:selClass||null})});
        notify("\u2705 Email sent");
        setSubject("");setBody("");setSelIndividuals([]);setSelTemplate("");setAddManualQ("");setMsgKey(k=>k+1);
      }catch(err){
        await db.logEmail({subject,body,recipient_count:1,delivered_count:0,failed_count:1,
          failed_recipients:[{email:recipients[0].email,error:err.message}],
          status:"failed",error_message:err.message,
          metadata:JSON.stringify({type:recipientType})});
        notify("Failed: "+err.message,"error");
      }
    } else {
      const htmlBody2=buildEmailHtml(subject,body);
      const emails=recipients.map(r=>({to:r.email,subject,html:htmlBody2}));
      setBulkEmailQueue(emails);
    }
    setSending(false);
  };

  const saveTmpl=async()=>{
    if(!tmplForm.name||!tmplForm.subject||!tmplForm.body){notify("Name, category and body required","error");return;}
    const {error}=await db.upsertEmailTemplate(tmplForm,editTmplId);
    if(error){notify(error.message,"error");return;}
    notify(editTmplId?"Template updated \u2713":"Template saved \u2713");
    const {data}=await db.getEmailTemplates();setTemplates(data||[]);
    setTmplModal(false);setTmplForm({name:"",subject:"",body:"",description:""});setEditTmplId(null);
  };

  const delTmpl=async(id,name)=>{
    await db.deleteEmailTemplate(id);notify(`"${name}" deleted`,"warn");
    const {data}=await db.getEmailTemplates();setTemplates(data||[]);
  };

  const recipients=getRecipients();
  const RTYPES=[
    {id:"individual",label:"Individual"},{id:"manual",label:"Manual Email"},
    {id:"class",label:"Group"},{id:"all-students",label:"All Members"},
    {id:"all-teachers",label:"All Staff"},{id:"all",label:"Everyone"}
  ];

  return(
    <div>
      <div style={{marginBottom:18}}>
        <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="mail" size={20}/>Send Email</h2>
        <p style={{color:C.muted,fontSize:12}}>Send emails to members, staff, groups or the entire organization.</p>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        {[{id:"compose",label:"Compose"},{id:"templates",label:"Templates"}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"8px 18px",borderRadius:8,border:`2px solid ${tab===t.id?C.blue:C.border}`,
              background:tab===t.id?C.blue:"transparent",color:tab===t.id?"#fff":C.muted,cursor:"pointer",fontSize:13,fontWeight:700}}>
            {t.label}
          </button>
        ))}
      </div>

      {tab==="compose"&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:16,alignItems:"start"}}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <Card>
              <div style={{fontWeight:800,color:C.blue,marginBottom:12,fontSize:14}}>Recipients</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                {RTYPES.map(rt=>(
                  <button key={rt.id} onClick={()=>{setRecipientType(rt.id);setSelIndividuals([]);setManualEmail("");setExcludedEmails([]);setRefineSearchQ("");}}
                    style={{padding:"6px 13px",borderRadius:7,fontSize:12,fontWeight:700,cursor:"pointer",
                      border:`2px solid ${recipientType===rt.id?C.blue:C.border}`,
                      background:recipientType===rt.id?C.bluePale:"transparent",
                      color:recipientType===rt.id?C.blue:C.muted}}>
                    {rt.label}
                  </button>
                ))}
              </div>
              {recipientType==="manual"&&(
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:4}}>EMAIL ADDRESS(ES)</label>
                  <input value={manualEmail} onChange={e=>setManualEmail(e.target.value)}
                    placeholder="e.g. contact@example.com, another@yahoo.com"
                    style={{width:"100%",padding:"9px 12px",border:`2px solid ${C.border}`,borderRadius:8,
                      fontSize:13,color:C.text,background:C.white,boxSizing:"border-box"}}/>
                  <div style={{fontSize:11,color:C.muted,marginTop:4}}>Separate multiple addresses with commas or spaces.</div>
                </div>
              )}
              {recipientType==="individual"&&(
                <div>
                  <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Search name or email\u2026"
                    style={{width:"100%",padding:"9px 12px",border:`2px solid ${C.border}`,borderRadius:8,
                      fontSize:13,marginBottom:6,boxSizing:"border-box",color:C.text,background:C.white}}/>
                  {filteredPeople.length>0&&(
                    <div style={{border:`1px solid ${C.border}`,borderRadius:8,maxHeight:150,overflowY:"auto",marginBottom:8}}>
                      {filteredPeople.slice(0,20).map(p=>(
                        <div key={p.email} onClick={()=>{
                          if(!selIndividuals.find(r=>r.email===p.email))
                            setSelIndividuals(prev=>[...prev,{email:p.email,name:p.name}]);
                          setSearchQ("");
                        }} style={{padding:"8px 12px",cursor:"pointer",borderBottom:`1px solid ${C.border}`,
                          display:"flex",justifyContent:"space-between",alignItems:"center"}}
                          onMouseEnter={e=>e.currentTarget.style.background=C.offWhite}
                          onMouseLeave={e=>e.currentTarget.style.background=""}>
                          <div>
                            <div style={{fontSize:13,fontWeight:600,color:C.text}}>{p.name}</div>
                            <div style={{fontSize:11,color:C.muted}}>{p.email} \u00b7 {p.type}</div>
                          </div>
                          <span style={{fontSize:11,color:C.blue,fontWeight:700}}>+ Add</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {selIndividuals.length>0&&(
                    <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
                      {selIndividuals.map(r=>(
                        <span key={r.email} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 10px",
                          borderRadius:20,background:C.bluePale,color:C.blue,fontSize:12,fontWeight:600}}>
                          {r.name}
                          <button onClick={()=>setSelIndividuals(p=>p.filter(x=>x.email!==r.email))}
                            style={{background:"none",border:"none",cursor:"pointer",color:C.blue,fontWeight:900,padding:0,fontSize:15}}>\xd7</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{display:"flex",gap:6,marginTop:4}}>
                    <input value={addManualQ} onChange={e=>setAddManualQ(e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&addManualRecipient()}
                      placeholder="Add email manually\u2026" type="email"
                      style={{flex:1,padding:"7px 11px",border:`1px dashed ${C.border}`,borderRadius:7,
                        fontSize:12,color:C.text,background:C.offWhite,boxSizing:"border-box"}}/>
                    <button onClick={addManualRecipient}
                      style={{padding:"7px 14px",borderRadius:7,background:C.blue,color:"#fff",border:"none",
                        fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>+ Add</button>
                  </div>
                </div>
              )}
              {recipientType==="class"&&(
                <div>
                  <Sel label="Group" value={selClass} onChange={v=>{setSelClass(v);setExcludedEmails([]);setRefineSearchQ("");}}
                    options={[{value:"",label:"Select group\u2026"},...classes.map(c=>({value:String(c.id),label:c.name}))]}/>
                </div>
              )}

              {recipientType!=="individual" && recipientType!=="manual" && (recipientType!=="class" || selClass) && (
                <div style={{marginTop:16,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
                  <div style={{background:C.offWhite,padding:"8px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${C.border}`}}>
                    <span style={{fontSize:11,fontWeight:800,color:C.blue}}>REFINE LIST</span>
                    <div style={{display:"flex",gap:10}}>
                      <button onClick={()=>setExcludedEmails([])} style={{background:"none",border:"none",color:C.blue,fontSize:11,fontWeight:700,cursor:"pointer"}}>Select All</button>
                      <button onClick={()=>{
                        let fullList=[];
                        if(recipientType==="class") fullList=students.filter(s=>s.class_id===+selClass && s.email).map(s=>s.email);
                        else if(recipientType==="all-students") fullList=students.filter(s=>s.email).map(s=>s.email);
                        else if(recipientType==="all-teachers") fullList=teachers.filter(t=>t.email).map(t=>t.email);
                        else if(recipientType==="all") fullList=[...students.filter(s=>s.email).map(s=>s.email), ...teachers.filter(t=>t.email).map(t=>t.email)];
                        setExcludedEmails(fullList);
                      }} style={{background:"none",border:"none",color:C.red,fontSize:11,fontWeight:700,cursor:"pointer"}}>Unselect All</button>
                    </div>
                  </div>
                  <div style={{padding:8}}>
                    <div style={{position:"relative",marginBottom:8}}>
                      <Search size={14} style={{position:"absolute",left:10,top:9,color:C.muted}}/>
                      <input value={refineSearchQ} onChange={e=>setRefineSearchQ(e.target.value)}
                        placeholder="Filter list\u2026"
                        style={{width:"100%",padding:"7px 10px 7px 30px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:12,boxSizing:"border-box",outline:"none"}}/>
                    </div>
                    <div style={{maxHeight:200,overflowY:"auto",display:"flex",flexDirection:"column",gap:2}}>
                      {(()=>{
                        let fullList=[];
                        if(recipientType==="class") fullList=students.filter(s=>s.class_id===+selClass && s.email).map(s=>({email:s.email,name:fullName(s)}));
                        else if(recipientType==="all-students") fullList=students.filter(s=>s.email).map(s=>({email:s.email,name:fullName(s)}));
                        else if(recipientType==="all-teachers") fullList=teachers.filter(t=>t.email).map(t=>({email:t.email,name:t.full_name}));
                        else if(recipientType==="all") fullList=[...students.filter(s=>s.email).map(s=>({email:s.email,name:fullName(s)})), ...teachers.filter(t=>t.email).map(t=>({email:t.email,name:t.full_name}))];
                        const filtered=refineSearchQ.length>0 ? fullList.filter(p=>p.name.toLowerCase().includes(refineSearchQ.toLowerCase()) || p.email.toLowerCase().includes(refineSearchQ.toLowerCase())) : fullList;
                        if(filtered.length===0) return <div style={{padding:20,textAlign:"center",fontSize:12,color:C.muted}}>No matches found.</div>;
                        return filtered.map(p=>(
                          <label key={p.email} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",borderRadius:6,cursor:"pointer",transition:"background .2s"}}
                            onMouseEnter={e=>e.currentTarget.style.background=C.offWhite}
                            onMouseLeave={e=>e.currentTarget.style.background=""}>
                            <input type="checkbox" checked={!excludedEmails.includes(p.email)}
                              onChange={()=>{
                                if(excludedEmails.includes(p.email)) setExcludedEmails(prev=>prev.filter(e=>e!==p.email));
                                else setExcludedEmails(prev=>[...prev, p.email]);
                              }}
                              style={{cursor:"pointer"}}/>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontSize:12,fontWeight:600,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div>
                              <div style={{fontSize:10,color:C.muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.email}</div>
                            </div>
                          </label>
                        ));
                      })()}
                    </div>
                  </div>
                </div>
              )}
              <div style={{marginTop:10,padding:"8px 12px",borderRadius:8,background:C.offWhite,fontSize:12,color:C.muted,fontWeight:600}}>
                {recipients.length} recipient{recipients.length!==1?"s":""} selected
                {recipients.length>0&&recipients.length<=4&&<span style={{marginLeft:8}}>{recipients.map(r=>r.name).join(", ")}</span>}
              </div>
            </Card>

            <Card>
              <div style={{fontWeight:800,color:C.blue,marginBottom:12,fontSize:14}}>Message</div>
              <div>
                <Sel label="Use Template (optional)" value={selTemplate}
                  onChange={v=>{setSelTemplate(v);if(v)applyTemplate(v);}}
                  options={[{value:"",label:"\u2014 No template \u2014"},...templates.map(t=>({value:String(t.id),label:t.name}))]}/>
              </div>
              <div style={{marginTop:10}}>
                <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:4}}>SUBJECT</label>
                <input key={`subj-${msgKey}`} defaultValue={subject} onChange={e=>setSubject(e.target.value)} placeholder="Email category\u2026"
                  style={{width:"100%",padding:"9px 12px",border:`2px solid ${C.border}`,borderRadius:8,
                    fontSize:13,color:C.text,background:C.white,boxSizing:"border-box"}}/>
              </div>
              <div style={{marginTop:10}}>
                <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:4}}>BODY</label>
                <div style={{fontSize:10,color:C.muted,marginBottom:4}}>
                  Placeholders: {"{student_name}"} {"{class_name}"} {"{term}"} {"{session}"}
                </div>
                <textarea key={`body-${msgKey}`} defaultValue={body} onChange={e=>setBody(e.target.value)}
                  placeholder="Write your message\u2026" rows={10}
                  style={{width:"100%",padding:"9px 12px",border:`2px solid ${C.border}`,borderRadius:8,
                    fontSize:13,color:C.text,background:C.white,boxSizing:"border-box",resize:"vertical",fontFamily:"inherit"}}/>
              </div>
              {canSend?(
                <Btn onClick={send} color={C.blue}
                  disabled={sending||!subject.trim()||!body.trim()||!recipients.length}
                  style={{marginTop:12,width:"100%",justifyContent:"center"}}>
                  {sending?`Sending to ${recipients.length}\u2026`:`Send to ${recipients.length} Recipient${recipients.length!==1?"s":""}`}
                </Btn>
              ):(
                <div style={{marginTop:12,padding:"10px",background:C.redPale,borderRadius:8,fontSize:12,color:C.red,fontWeight:600}}>
                  You don't have permission to send emails.
                </div>
              )}
            </Card>
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <Card style={{background:C.bluePale,border:`1px solid ${C.blue}22`}}>
              <div style={{fontWeight:800,color:C.blue,marginBottom:10,fontSize:13}}>Placeholders</div>
              {[["{student_name}","Member's full name"],["{class_name}","Group name"],
                ["{term}","Current period"],["{session}","Performance cycle"]].map(([k,v])=>(
                <div key={k} style={{marginBottom:7}}>
                  <code style={{fontSize:11,background:`${C.blue}18`,color:C.blue,padding:"2px 6px",borderRadius:4}}>{k}</code>
                  <span style={{fontSize:11,color:C.muted,marginLeft:6}}>{v}</span>
                </div>
              ))}
            </Card>
            <Card>
              <div style={{fontWeight:800,color:C.blue,marginBottom:10,fontSize:13}}>Quick Fill</div>
              {[
                {label:"Billing Reminder",sub:"Organization Billing Payment Reminder \u2013 {period}",body:
`Dear Member/Contact of {student_name},

We hope this message finds you well.

This is a friendly reminder that the billing charges for {student_name} ({class_name}) for the {term} of the {session} reporting cycle are now due.

Kindly ensure that payment is made at the earliest convenience to avoid any disruption to your account's account activities. You may pay via the Business Portal or visit the school's bursary during official hours.

Should you have any questions or require assistance, please do not hesitate to contact us at the organization administration office.

Thank you for your continued partnership in your account's education.

Warm regards,
The Finance Manager
${_mailSN}`},
                {label:"Report Ready",sub:"Your Report is Now Available \u2013 {period}",body:
`Dear Member/Contact of {student_name},

We are pleased to inform you that the report for {student_name} ({class_name}) for the {term} of the {session} reporting cycle is now available on the JAMES-DENNING.

To access it, please log in to the portal at your convenience. We encourage you to review the results with your account and celebrate their achievements while identifying areas for improvement together.

If you experience any difficulty accessing the portal, kindly contact our administrative office and we will be happy to assist you.

We remain committed to providing the best organization experience for your account.

Warm regards,
The Performance Office
${_mailSN}`},
                {label:"Organization Announcement",sub:`Important Notice from ${_mailSN}`,body:
`Dear Member/Contact,

We hope this message finds you and your team in good health.

We wish to bring an important matter to your attention:

[Insert announcement details here]

We appreciate your understanding and continued support. If you have any questions or concerns regarding this notice, please feel free to reach out to us at the organization administration office.

Thank you for being a valued member of the JAMES-DENNING community.

Warm regards,
The Management
${_mailSN}`},
                {label:"Resumption Notice",sub:"Organization Resumption Notice \u2013 {period} {cycle}",body:
`Dear Member/Contact of {student_name},

We trust you had a restful holiday.

We are pleased to announce that the next cycle begins for the {term} of the {session} reporting cycle. We look forward to welcoming all students back for another term of learning, growth, and excellence.

Please ensure your account/ward is:
\u2022 In full and neat required attire
\u2022 Equipped with all required textbooks and stationery
\u2022 Present and punctual on the resumption date

For any queries, please contact the organization office or reach us at the organization administration office.

We look forward to a productive and rewarding term ahead.

Warm regards,
The Management
${_mailSN}`},
                {label:"Event Invitation",sub:"Invitation \u2013 Upcoming Organization Event",body:
`Dear Member/Contact,

On behalf of the Management and Staff of ${_mailSN}, we warmly invite you to attend:

\ud83c\udf89 [Event Name]
\ud83d\udcc5 Date: [Date]
\ud83d\udd50 Time: [Time]
\ud83d\udccd Venue: [Venue]

[Brief description of the event]

Your presence would mean a great deal to us and to your account. Please make every effort to attend this special occasion.

Kindly confirm your attendance by reaching out to the organization office or emailing the organization administration office.

We look forward to seeing you!

Warm regards,
The Management
${_mailSN}`},
              ].map((a,i)=>(
                <div key={i} onClick={()=>{setSubject(a.sub);setBody(a.body);setMsgKey(k=>k+1);}} style={{padding:"8px 10px",borderRadius:8,background:C.offWhite,
                  marginBottom:6,cursor:"pointer",border:`1px solid ${C.border}`}}
                  onMouseEnter={e=>e.currentTarget.style.background=C.bluePale}
                  onMouseLeave={e=>e.currentTarget.style.background=C.offWhite}>
                  <div style={{fontSize:12,fontWeight:700,color:C.blue}}>{a.label}</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:2}}>{a.sub}</div>
                </div>
              ))}
            </Card>
          </div>
        </div>
      )}

      {tab==="templates"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <span style={{fontWeight:700,color:C.text,fontSize:14}}>{templates.length} template{templates.length!==1?"s":""}</span>
            <Btn onClick={()=>{setTmplModal(true);setEditTmplId(null);setTmplForm({name:"",subject:"",body:"",description:""}); }} color={C.blue}>
              + New Template
            </Btn>
          </div>
          {templates.length===0?(
            <Card style={{textAlign:"center",padding:44}}>
              <div style={{marginBottom:8}}><FileText size={40} color={C.muted}/></div>
              <div style={{fontWeight:700,color:C.blue}}>No templates yet</div>
              <div style={{color:C.muted,fontSize:13,marginTop:4}}>Create reusable email templates for announcements, reminders, and more.</div>
            </Card>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {templates.map(t=>(
                <Card key={t.id}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:800,color:C.blue,fontSize:14}}>{t.name}</div>
                      <div style={{fontSize:12,color:C.muted,marginTop:2}}><b>Category:</b> {t.subject}</div>
                      {t.description&&<div style={{fontSize:12,color:C.muted,marginTop:2}}>{t.description}</div>}
                      <div style={{fontSize:11,color:C.light,marginTop:4}}>{t.body?.slice(0,120)}\u2026</div>
                    </div>
                    <div style={{display:"flex",gap:6,flexShrink:0}}>
                      <Btn xs outline color={C.blue} onClick={()=>{setTab("compose");setSelTemplate(String(t.id));applyTemplate(String(t.id));}}>Use</Btn>
                      <Btn xs outline color={C.orange} onClick={()=>{setEditTmplId(t.id);setTmplForm({name:t.name,subject:t.subject,body:t.body,description:t.description||""});setTmplModal(true);}}>Edit</Btn>
                      <Btn xs outline color={C.red} onClick={()=>delTmpl(t.id,t.name)}>Delete</Btn>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {bulkEmailQueue&&<EmailProgressModal emails={bulkEmailQueue} schoolId={selectedSchool?.id||""} onClose={()=>{
        setBulkEmailQueue(null);
        setSubject("");setBody("");setSelIndividuals([]);setSelTemplate("");setAddManualQ("");setMsgKey(k=>k+1);
      }}/>}

      {tmplModal&&(
        <Modal title={editTmplId?"Edit Template":"New Template"} onClose={()=>{setTmplModal(false);setEditTmplId(null);}} width={560}>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {[{label:"TEMPLATE NAME",key:"name",ph:"e.g. Billing Reminder"},
              {label:"SUBJECT",key:"subject",ph:"Email category line"},
              {label:"DESCRIPTION (optional)",key:"description",ph:"Short description"}].map(f=>(
              <div key={f.key}>
                <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:4}}>{f.label}</label>
                <input value={tmplForm[f.key]} onChange={e=>setTmplForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.ph}
                  style={{width:"100%",padding:"9px 12px",border:`2px solid ${C.border}`,borderRadius:8,
                    fontSize:13,color:C.text,background:C.white,boxSizing:"border-box"}}/>
              </div>
            ))}
            <div>
              <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:4}}>BODY</label>
              <textarea value={tmplForm.body} onChange={e=>setTmplForm(p=>({...p,body:e.target.value}))}
                placeholder="Email body\u2026 Use {student_name}, {class_name}, {period}, {cycle}" rows={8}
                style={{width:"100%",padding:"9px 12px",border:`2px solid ${C.border}`,borderRadius:8,
                  fontSize:13,color:C.text,background:C.white,boxSizing:"border-box",resize:"vertical",fontFamily:"inherit"}}/>
            </div>
            <div style={{display:"flex",gap:8}}>
              <Btn onClick={saveTmpl} color={C.blue} style={{flex:1,justifyContent:"center"}}>Save Template</Btn>
              <Btn onClick={()=>{setTmplModal(false);setEditTmplId(null);}} color={C.muted} outline style={{flex:1,justifyContent:"center"}}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── MAIL LOGS PAGE ───────────────────────────────────────────────────────────
export function MailLogsPage({ctx}){
  const {notify,role,canAccess,selectedSchool}=ctx;
  const canView=role==="admin"||canAccess("page:mail-logs");
  const [logs,setLogs]=useState([]);
  const [batches,setBatches]=useState([]);
  const [loading,setLoading]=useState(true);
  const [expanded,setExpanded]=useState(null);
  const [search,setSearch]=useState("");
  const [filterStatus,setFilterStatus]=useState("");
  const [filterAge,setFilterAge]=useState("");
  const [page,setPage]=useState(0);
  const [retriggeringId,setRetriggeringId]=useState(null);
  const PAGE_SIZE=25;
  const [selIds,setSelIds]=useState(new Set());
  const toggleSel=id=>setSelIds(p=>{const s=new Set(p);s.has(id)?s.delete(id):s.add(id);return s;});
  const clearSel=()=>setSelIds(new Set());
  const [purgeModal,setPurgeModal]=useState(false);
  const [purgeAge,setPurgeAge]=useState("90");
  const [purging,setPurging]=useState(false);

  const load=()=>{
    if(!canView){setLoading(false);return;}
    setLoading(true);
    Promise.all([db.getEmailLogs(5000), db.getEmailBatches()]).then(([logsRes,batchRes])=>{
      setLogs(logsRes.data||[]);
      setBatches(batchRes.data||[]);
      setLoading(false);clearSel();setPage(0);
    });
  };
  useEffect(load,[]);

  const retrigger=async(batch)=>{
    setRetriggeringId(batch.batch_id);
    await db.retriggerBatch(batch.batch_id);
    try{
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email-batch`,{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`},
        body:JSON.stringify({batch_id:batch.batch_id,rate_per_min:10}),
      });
    }catch(e){}
    setRetriggeringId(null);
    notify("Batch re-triggered. Refresh in a moment to see updated counts.");
    setTimeout(()=>db.getEmailBatches().then(({data})=>setBatches(data||[])),5000);
  };

  if(!canView)return(
    <Card style={{textAlign:"center",padding:52}}>
      <div style={{marginBottom:10}}><Lock size={40} color={C.muted}/></div>
      <div style={{fontWeight:800,color:C.blue,fontSize:16}}>Access Denied</div>
      <div style={{color:C.muted,fontSize:13,marginTop:6}}>You don't have permission to view email logs.</div>
    </Card>
  );

  const cutoff=filterAge?new Date(Date.now()-+filterAge*86400000):null;
  const filtered=logs.filter(l=>{
    if(filterStatus&&l.status!==filterStatus)return false;
    if(cutoff&&new Date(l.sent_at)<cutoff)return false;
    if(search){
      const q=search.toLowerCase();
      if(!(l.subject||"").toLowerCase().includes(q)&&!(l.body||"").toLowerCase().includes(q)&&!(l.recipients||"").toLowerCase().includes(q))return false;
    }
    return true;
  });
  const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const paged=filtered.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
  const allPageSelected=paged.length>0&&paged.every(l=>selIds.has(l.id));
  const somePageSelected=!allPageSelected&&paged.some(l=>selIds.has(l.id));
  const togglePage=()=>allPageSelected?paged.forEach(l=>setSelIds(p=>{const s=new Set(p);s.delete(l.id);return s;})):paged.forEach(l=>setSelIds(p=>{const s=new Set(p);s.add(l.id);return s;}));

  const deleteOne=async(id,e)=>{
    e.stopPropagation();
    if(!window.confirm("Delete this log entry?"))return;
    await db.deleteEmailLog(id);
    setLogs(p=>p.filter(l=>l.id!==id));
    clearSel();
    notify("Log deleted");
  };

  const deleteSelected=async()=>{
    if(!selIds.size)return;
    if(!window.confirm(`Delete ${selIds.size} log entry${selIds.size!==1?"ies":"y"}?`))return;
    await db.deleteEmailLogs([...selIds]);
    setLogs(p=>p.filter(l=>!selIds.has(l.id)));
    clearSel();
    notify(`${selIds.size} log${selIds.size!==1?"s":""} deleted`);
  };

  const purge=async()=>{
    setPurging(true);
    const cutoffDate=new Date(Date.now()-+purgeAge*86400000).toISOString();
    const {error}=await db.deleteEmailLogsBefore(cutoffDate);
    setPurging(false);
    if(error){notify("Purge failed: "+error.message,"error");return;}
    setPurgeModal(false);
    notify(`Logs older than ${purgeAge} days purged \u2713`,"warn");
    load();
  };

  const SC={sent:C.green,failed:C.red,partial:C.amber};
  const SB={sent:C.greenPale,failed:C.redPale,partial:C.amberPale};

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18,flexWrap:"wrap",gap:10}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:900,color:C.blue,display:"flex",alignItems:"center",gap:8}}><AppIcon name="mail-logs" size={20}/>Email Logs</h2>
          <p style={{color:C.muted,fontSize:12}}>{logs.length.toLocaleString()} total entries \u00b7 Click a row to expand body</p>
        </div>
        <div style={{display:"flex",gap:8}}>
          <Btn onClick={load} color={C.blue} outline sm><RefreshCw size={13} style={{marginRight:4}}/>Refresh</Btn>
          <Btn onClick={()=>setPurgeModal(true)} color={C.red} outline sm>Purge Old Logs</Btn>
        </div>
      </div>

      {batches.length>0&&(
        <div style={{marginBottom:18}}>
          <div style={{fontSize:12,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.7,marginBottom:8}}>Batch Sends</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {batches.map(b=>{
              const pct=b.total>0?Math.round((b.sent+b.failed)/b.total*100):0;
              const isDone=b.pending===0;
              const hasStuck=b.pending>0;
              return(
                <Card key={b.batch_id} style={{padding:"14px 18px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                    <div style={{flex:1,minWidth:180}}>
                      <div style={{fontWeight:700,fontSize:13,color:C.text,marginBottom:2}}>{b.subject||"(no category)"}</div>
                      <div style={{fontSize:11,color:C.muted}}>
                        {new Date(b.created_at).toLocaleString("en-NG",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:true})}
                        {" \u00b7 "}{b.total} recipient{b.total!==1?"s":""}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:12,fontSize:12}}>
                      <span style={{color:C.green,fontWeight:700}}>\u2713 {b.sent} sent</span>
                      {b.failed>0&&<span style={{color:C.red,fontWeight:700}}>\u2717 {b.failed} failed</span>}
                      {b.pending>0&&<span style={{color:C.amber,fontWeight:700}}>\u23f3 {b.pending} pending</span>}
                    </div>
                    {hasStuck&&(
                      <button onClick={()=>retrigger(b)} disabled={retriggeringId===b.batch_id}
                        style={{background:C.amber,color:"#fff",border:"none",borderRadius:8,padding:"5px 12px",
                          fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0}}>
                        {retriggeringId===b.batch_id?"Retrying\u2026":"Retry Pending"}
                      </button>
                    )}
                    {isDone&&<span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,
                      background:b.failed===0?C.greenPale:C.amberPale,color:b.failed===0?C.green:C.amber,
                      border:`1px solid ${b.failed===0?C.green:C.amber}33`}}>
                      {b.failed===0?"Complete":"Partial"}
                    </span>}
                  </div>
                  <div style={{marginTop:10,height:6,background:C.offWhite,borderRadius:3,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pct}%`,background:b.failed>0?C.amber:C.green,borderRadius:3,transition:"width .4s"}}/>
                  </div>
                  {b.failedRecipients.length>0&&(
                    <div style={{marginTop:8,fontSize:11,color:C.red}}>
                      Failed: {b.failedRecipients.slice(0,5).map(r=>r.email).join(", ")}
                      {b.failedRecipients.length>5&&` +${b.failedRecipients.length-5} more`}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <Card style={{marginBottom:14,padding:"12px 16px"}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <input value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}
            placeholder="Search category or body\u2026"
            style={{flex:2,minWidth:180,padding:"8px 12px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:13,outline:"none"}}/>
          <select value={filterStatus} onChange={e=>{setFilterStatus(e.target.value);setPage(0);}}
            style={{padding:"8px 12px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:13,color:C.text,background:"#fff",outline:"none"}}>
            <option value="">All Statuses</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="partial">Partial</option>
          </select>
          <select value={filterAge} onChange={e=>{setFilterAge(e.target.value);setPage(0);}}
            style={{padding:"8px 12px",border:`2px solid ${C.border}`,borderRadius:8,fontSize:13,color:C.text,background:"#fff",outline:"none"}}>
            <option value="">All Time</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last year</option>
          </select>
          {(search||filterStatus||filterAge)&&(
            <Btn sm outline color={C.muted} onClick={()=>{setSearch("");setFilterStatus("");setFilterAge("");setPage(0);}}>Clear</Btn>
          )}
          <span style={{fontSize:12,color:C.muted,marginLeft:"auto"}}>{filtered.length.toLocaleString()} result{filtered.length!==1?"s":""}</span>
        </div>
      </Card>

      {selIds.size>0&&(
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",marginBottom:10,
          background:C.redPale,border:`1.5px solid ${C.red}44`,borderRadius:10,flexWrap:"wrap"}}>
          <span style={{fontWeight:700,color:C.red,fontSize:13,flex:1}}>
            {selIds.size} log{selIds.size!==1?"s":""} selected
          </span>
          <Btn sm onClick={deleteSelected} color={C.red}>Delete Selected</Btn>
          <Btn sm outline color={C.muted} onClick={clearSel}>Clear</Btn>
        </div>
      )}

      {loading?<Spinner/>:filtered.length===0?(
        <Card style={{textAlign:"center",padding:52}}>
          <div style={{fontSize:40,marginBottom:10}}>{logs.length===0?"\u2014":"?"}</div>
          <div style={{fontWeight:800,color:C.blue,fontSize:16}}>{logs.length===0?"No Emails Sent Yet":"No Results"}</div>
          <div style={{color:C.muted,fontSize:13,marginTop:6}}>{logs.length===0?"Emails sent through the portal will appear here.":"Try adjusting your filters."}</div>
        </Card>
      ):(
        <>
          <Card style={{padding:0,overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{background:C.blue}}>
                  <th style={{padding:"9px 12px",width:36}}>
                    <input type="checkbox" checked={allPageSelected}
                      ref={el=>{if(el)el.indeterminate=somePageSelected;}}
                      onChange={togglePage}
                      style={{width:15,height:15,cursor:"pointer",accentColor:"#fff"}}/>
                  </th>
                  {["Category","Recipients","Sent","Status",""].map((h,i)=>(
                    <th key={i} style={{padding:"9px 12px",color:"#fff",textAlign:"left",fontWeight:700,fontSize:11,whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((log,i)=>{
                  const sc=SC[log.status]||C.muted;
                  const sb=SB[log.status]||C.offWhite;
                  const isOpen=expanded===log.id;
                  const checked=selIds.has(log.id);
                  return(
                    <React.Fragment key={log.id}>
                      <tr style={{background:i%2===0?C.white:C.offWhite,borderBottom:`1px solid ${C.border}`,cursor:"pointer"}}
                        onClick={()=>setExpanded(isOpen?null:log.id)}>
                        <td style={{padding:"9px 12px"}} onClick={e=>e.stopPropagation()}>
                          <input type="checkbox" checked={checked} onChange={()=>toggleSel(log.id)}
                            style={{width:15,height:15,cursor:"pointer",accentColor:C.blue}}/>
                        </td>
                        <td style={{padding:"9px 12px",maxWidth:320,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {(()=>{let meta={};try{meta=JSON.parse(log.metadata||"{}")}catch(e){}return meta.batch_id?(
                            <span style={{fontSize:10,fontWeight:700,background:C.bluePale,color:C.blue,
                              border:`1px solid ${C.blue}33`,borderRadius:4,padding:"1px 6px",marginRight:6}}>BATCH</span>
                          ):null})()}
                          <span style={{fontWeight:700}}>{log.subject||"(no category)"}</span>
                        </td>
                        <td style={{padding:"9px 12px",color:C.muted,whiteSpace:"nowrap"}}>
                          <span style={{color:C.text,fontWeight:600}}>{log.recipient_count||1}</span>
                          {(log.delivered_count>0||log.failed_count>0)&&(
                            <span style={{fontSize:10,marginLeft:6}}>
                              <span style={{color:C.green}}>\u2713{log.delivered_count||0}</span>
                              {log.failed_count>0&&<span style={{color:C.red,marginLeft:3}}>\u2717{log.failed_count}</span>}
                            </span>
                          )}
                        </td>
                        <td style={{padding:"9px 12px",color:C.muted,whiteSpace:"nowrap",fontSize:12}}>
                          {new Date(log.sent_at).toLocaleString("en-NG",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:true})}
                        </td>
                        <td style={{padding:"9px 12px"}}>
                          <span style={{padding:"2px 10px",borderRadius:20,fontSize:11,fontWeight:700,
                            background:sb,color:sc,border:`1px solid ${sc}33`,whiteSpace:"nowrap"}}>
                            {log.status==="sent"?"Sent":log.status==="failed"?"Failed":"Partial"}
                          </span>
                        </td>
                        <td style={{padding:"9px 8px",textAlign:"right"}} onClick={e=>e.stopPropagation()}>
                          <button onClick={e=>deleteOne(log.id,e)}
                            title="Delete this log"
                            style={{background:"none",border:"none",cursor:"pointer",color:C.red,fontSize:16,padding:"2px 6px",borderRadius:6,lineHeight:1}}
                            onMouseEnter={e=>e.currentTarget.style.background=C.redPale}
                            onMouseLeave={e=>e.currentTarget.style.background="none"}>
                            <Trash2 size={14}/>
                          </button>
                        </td>
                      </tr>
                      {isOpen&&(
                        <tr style={{background:C.bluePale}}>
                          <td colSpan={6} style={{padding:"12px 16px 16px",borderBottom:`2px solid ${C.blue}22`}}>
                            <div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>Message Body</div>
                            <div style={{fontSize:12,color:C.text,whiteSpace:"pre-wrap",background:C.white,
                              border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",maxHeight:200,overflowY:"auto",lineHeight:1.7}}>
                              {log.body||"(no body stored)"}
                            </div>
                            {(log.delivered_count>0||log.failed_count>0)&&(
                              <div style={{display:"flex",gap:12,marginTop:8,fontSize:12}}>
                                <span style={{color:C.green,fontWeight:700}}>\u2713 {log.delivered_count||0} delivered</span>
                                {log.failed_count>0&&<span style={{color:C.red,fontWeight:700}}>\u2717 {log.failed_count} failed</span>}
                              </div>
                            )}
                            {log.failed_count>0&&Array.isArray(log.failed_recipients)&&log.failed_recipients.length>0&&(
                              <div style={{marginTop:8,padding:"8px 12px",background:C.redPale,borderRadius:8,fontSize:12,color:C.red}}>
                                <div style={{fontWeight:700,marginBottom:4}}>Failed recipients:</div>
                                {log.failed_recipients.map((r,i)=>(
                                  <div key={i} style={{marginBottom:2}}>\u2022 {typeof r==="object"?r.email||JSON.stringify(r):r}{typeof r==="object"&&r.error?` \u2014 ${r.error}`:""}</div>
                                ))}
                              </div>
                            )}
                            {log.error_message&&(
                              <div style={{marginTop:8,padding:"8px 12px",background:C.redPale,borderRadius:8,fontSize:12,color:C.red}}>
                                <b>Error:</b> {log.error_message}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {totalPages>1&&(
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginTop:14,flexWrap:"wrap"}}>
              <button onClick={()=>setPage(0)} disabled={page===0}
                style={{padding:"6px 10px",borderRadius:7,border:`1px solid ${C.border}`,background:page===0?C.offWhite:"#fff",color:page===0?C.light:C.text,cursor:page===0?"default":"pointer",fontWeight:700}}>\u00ab</button>
              <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0}
                style={{padding:"6px 14px",borderRadius:7,border:`1px solid ${C.border}`,background:page===0?C.offWhite:"#fff",color:page===0?C.light:C.text,cursor:page===0?"default":"pointer",fontWeight:600}}>\u2039 Prev</button>
              <span style={{fontSize:12,color:C.muted,padding:"0 6px"}}>Page {page+1} of {totalPages}</span>
              <button onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))} disabled={page===totalPages-1}
                style={{padding:"6px 14px",borderRadius:7,border:`1px solid ${C.border}`,background:page===totalPages-1?C.offWhite:"#fff",color:page===totalPages-1?C.light:C.text,cursor:page===totalPages-1?"default":"pointer",fontWeight:600}}>Next \u203a</button>
              <button onClick={()=>setPage(totalPages-1)} disabled={page===totalPages-1}
                style={{padding:"6px 10px",borderRadius:7,border:`1px solid ${C.border}`,background:page===totalPages-1?C.offWhite:"#fff",color:page===totalPages-1?C.light:C.text,cursor:page===totalPages-1?"default":"pointer",fontWeight:700}}>\u00bb</button>
            </div>
          )}
        </>
      )}

      {purgeModal&&(
        <Modal title="Purge Old Logs" onClose={()=>setPurgeModal(false)} width={400}>
          <div style={{marginBottom:14,fontSize:13,color:C.text,lineHeight:1.7}}>
            Permanently delete email log entries older than a chosen period. This cannot be undone.
          </div>
          <div style={{marginBottom:16}}>
            <label style={{fontSize:11,fontWeight:700,color:C.muted,display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>Delete logs older than</label>
            {[{v:"30",l:"30 days"},{v:"60",l:"60 days"},{v:"90",l:"90 days (recommended)"},{v:"180",l:"6 months"},{v:"365",l:"1 year"}].map(o=>(
              <label key={o.v} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",border:`2px solid ${purgeAge===o.v?C.red:C.border}`,
                borderRadius:8,cursor:"pointer",marginBottom:6,background:purgeAge===o.v?C.redPale:"#fff"}}>
                <input type="radio" checked={purgeAge===o.v} onChange={()=>setPurgeAge(o.v)} style={{accentColor:C.red}}/>
                <span style={{fontSize:13,color:C.text}}>{o.l}</span>
                <span style={{fontSize:11,color:C.muted,marginLeft:"auto"}}>
                  {logs.filter(l=>new Date(l.sent_at)<new Date(Date.now()-+o.v*86400000)).length} entries
                </span>
              </label>
            ))}
          </div>
          <div style={{background:C.redPale,border:`1px solid ${C.red}33`,borderRadius:8,padding:"9px 12px",marginBottom:14,fontSize:12,color:C.red}}>
            This will permanently delete {logs.filter(l=>new Date(l.sent_at)<new Date(Date.now()-+purgeAge*86400000)).length} log entries. This cannot be undone.
          </div>
          <div style={{display:"flex",gap:10}}>
            <Btn onClick={purge} color={C.red} disabled={purging} style={{flex:1}}>
              {purging?"Purging\u2026":"Purge Now"}
            </Btn>
            <Btn onClick={()=>setPurgeModal(false)} color={C.muted} outline style={{flex:1}}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
