/**
 * Access domain pages:
 *   TeacherAccessRequestPage, AccessRequestsAdminPage
 */
import React, { useState, useEffect } from "react";
import { db } from "../supabaseClient.js";
import { C } from "../config/theme.js";
import { Card, Btn, Badge, Modal, Spinner } from "../components/ui.jsx";
import { buildAlertEmail } from "../services/email/index.js";

// ─── TEACHER ACCESS REQUEST PAGE ─────────────────────────────────────────────
export function TeacherAccessRequestPage({ctx}){
  const {user,notify,selectedSchool}=ctx;
  const [classes,setClasses]=useState([]);
  const [selClass,setSelClass]=useState("");
  const [subjects,setSubjects]=useState([]);
  const [selectedSubjects,setSelectedSubjects]=useState(new Set());
  const [myRequests,setMyRequests]=useState([]);
  const [myGrants,setMyGrants]=useState([]);
  const [loading,setLoading]=useState(true);
  const [submitting,setSubmitting]=useState(false);

  const loadData=()=>{
    if(!user.teacher_db_id)return;
    setLoading(true);
    Promise.all([
      db.getClasses(),
      db.getSubjectAccessRequests({teacher_id:user.teacher_db_id}),
      db.getSubjectAccessGrants({teacher_id:user.teacher_db_id}),
    ]).then(([cl,req,gr])=>{
      setClasses(cl.data||[]);
      setMyRequests(req.data||[]);
      setMyGrants(gr.data||[]);
      setLoading(false);
    });
  };
  useEffect(loadData,[]);

  useEffect(()=>{
    setSelectedSubjects(new Set());
    if(!selClass)return;
    db.getClassSubjects(+selClass).then(({data})=>{
      setSubjects((data||[]).map(r=>r.section_subjects).filter(Boolean));
    });
  },[selClass]);

  const toggleSubj=(id)=>{
    setSelectedSubjects(prev=>{
      const n=new Set(prev);
      n.has(id)?n.delete(id):n.add(id);
      return n;
    });
  };

  const submit=async()=>{
    if(!selClass||selectedSubjects.size===0){notify("Select a group and at least one category","error");return;}
    if(!selectedSchool?.id){notify("No organization selected","error");return;}
    setSubmitting(true);
    const {error}=await db.createSubjectAccessRequest(
      selectedSchool.id, user.teacher_db_id, +selClass, [...selectedSubjects]
    );
    setSubmitting(false);
    if(error)notify(error.message,"error");
    else{
      notify("Access request submitted \u2713 \u2014 waiting for admin approval");
      // Tier A alert — access request submitted
      const cls=classes?.find(c=>String(c.id)===String(selClass));
      db.sendAdminAlert({
        subject:`[Alert] Access Request \u2014 ${user?.full_name||user?.name||"Staff"}`,
        html:buildAlertEmail("Category Access Request Submitted",
          [`Staff: ${user?.full_name||user?.name||"Staff"}`,
           `Group: ${cls?.name||selClass}`,
           `Categories requested: ${selectedSubjects.size}`,
           `Time: ${new Date().toLocaleString("en-NG")}`],
          "info"),
        eventKey:"access_request"
      });
      setSelClass(""); setSelectedSubjects(new Set()); setSubjects([]);
      loadData();
    }
  };

  const statusBadge=(s)=>({
    pending:<Badge color={C.orange}>Pending</Badge>,
    approved:<Badge color={C.green}>Approved</Badge>,
    rejected:<Badge color={C.red}>Rejected</Badge>,
  }[s]||<Badge color={C.muted}>{s}</Badge>);

  // Import Th and TRow inline since access.jsx doesn't import from ui.jsx by default
  // (they are exported from ui.jsx — just need to add them to the import above)
  if(loading)return <div style={{padding:32,textAlign:"center",color:C.muted}}>Loading…</div>;

  return(
    <div style={{maxWidth:860,margin:"0 auto",padding:"24px 16px"}}>
      <h2 style={{fontWeight:900,color:C.blue,fontSize:18,marginBottom:4}}>Request Category Access</h2>
      <p style={{color:C.muted,fontSize:13,marginBottom:20}}>
        Request temporary access to input scores for categories not in your regular assignment.
        Admin will review and approve or reject your request.
      </p>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:24}}>
        {/* Request form */}
        <Card>
          <h3 style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:14}}>New Request</h3>
          <div style={{marginBottom:10}}>
            <label style={{fontSize:12,color:C.muted,fontWeight:600,display:"block",marginBottom:4}}>Group</label>
            <select value={selClass} onChange={e=>setSelClass(e.target.value)}
              style={{width:"100%",padding:"9px 12px",border:`2px solid ${C.border}`,background:"inherit",
                color:C.text,borderRadius:8,fontSize:13}}>
              <option value="">— Select group —</option>
              {classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {selClass&&subjects.length>0&&(
            <div style={{marginBottom:12}}>
              <label style={{fontSize:12,color:C.muted,fontWeight:600,display:"block",marginBottom:6}}>
                Categories <span style={{color:C.muted,fontWeight:400}}>(select one or more)</span>
              </label>
              <div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden"}}>
                {subjects.map((s,i)=>{
                  const checked=selectedSubjects.has(s.id);
                  return(
                    <label key={s.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",
                      cursor:"pointer",background:checked?C.bluePale:"inherit",
                      borderTop:i>0?`1px solid ${C.border}`:"none",transition:"background .15s"}}>
                      <input type="checkbox" checked={checked} onChange={()=>toggleSubj(s.id)}
                        style={{accentColor:C.blue,width:15,height:15}}/>
                      <span style={{fontSize:13,fontWeight:checked?700:400,color:checked?C.blue:C.text}}>
                        {s.name}
                      </span>
                      {s.code&&<Badge color={C.muted} style={{marginLeft:"auto"}}>{s.code}</Badge>}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          {selClass&&subjects.length===0&&(
            <p style={{color:C.muted,fontSize:12,marginBottom:12}}>No categories found for this group.</p>
          )}

          <Btn onClick={submit} color={C.orange} disabled={submitting||!selClass||selectedSubjects.size===0}
            style={{width:"100%"}}>
            {submitting?"Submitting\u2026":`Submit Request (${selectedSubjects.size} subject${selectedSubjects.size!==1?"s":""})`}
          </Btn>
        </Card>

        {/* Active grants */}
        <Card>
          <h3 style={{fontWeight:800,color:C.green,fontSize:14,marginBottom:12}}>Approved Access</h3>
          {myGrants.length===0
            ?<p style={{color:C.muted,fontSize:12}}>No access grants yet.</p>
            :(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {myGrants.map(g=>(
                  <div key={g.id} style={{background:C.bluePale,borderRadius:8,padding:"8px 12px",fontSize:13}}>
                    <div style={{fontWeight:700,color:C.blue}}>{g.section_subjects?.name||"\u2014"}</div>
                    <div style={{color:C.muted,fontSize:11}}>Group: {g.classes?.name||"\u2014"}</div>
                    <div style={{color:C.muted,fontSize:11}}>
                      Granted {new Date(g.granted_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )
          }
        </Card>
      </div>

      {/* Request history */}
      <Card>
        <h3 style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:12}}>My Requests</h3>
        {myRequests.length===0
          ?<p style={{color:C.muted,fontSize:12}}>No requests submitted yet.</p>
          :(
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <thead>
                  <tr style={{background:C.offWhite,borderBottom:`2px solid ${C.border}`}}>
                    {["Date","Group","Categories","Status","Note"].map(h=>(
                      <th key={h} style={{padding:"8px 12px",textAlign:"left",fontSize:11,fontWeight:800,
                        color:C.muted,textTransform:"uppercase",letterSpacing:.5}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {myRequests.map((r,i)=>{
                    const cls=r.classes;
                    return(
                      <tr key={r.id} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?C.white:C.offWhite}}>
                        <td style={{padding:"9px 12px",fontSize:12,color:C.muted}}>{new Date(r.requested_at).toLocaleDateString()}</td>
                        <td style={{padding:"9px 12px",fontWeight:700}}>{cls?.name||"\u2014"}</td>
                        <td style={{padding:"9px 12px",fontSize:12}}>{r.subject_ids?.length||0} category(s)</td>
                        <td style={{padding:"9px 12px"}}>{statusBadge(r.status)}</td>
                        <td style={{padding:"9px 12px",color:C.muted,fontSize:12}}>{r.admin_note||"\u2014"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        }
      </Card>
    </div>
  );
}

// ─── ADMIN: ACCESS REQUESTS PAGE ─────────────────────────────────────────────
export function AccessRequestsAdminPage({ctx}){
  const {user,notify,selectedSchool,setPendingAccessRequests}=ctx;
  const [requests,setRequests]=useState([]);
  const [loading,setLoading]=useState(true);
  const [filter,setFilter]=useState("pending");
  const [acting,setActing]=useState(null);
  const [noteModal,setNoteModal]=useState(null);
  const [adminNote,setAdminNote]=useState("");
  const [allSubjects,setAllSubjects]=useState({});

  const loadData=()=>{
    setLoading(true);
    Promise.all([
      db.getSubjectAccessRequests(selectedSchool?.id?{school_id:selectedSchool.id}:{}),
      db.getSectionSubjects(),
    ]).then(([req,ss])=>{
      setRequests(req.data||[]);
      const map={};
      (ss.data||[]).forEach(s=>{map[s.id]=s.name;});
      setAllSubjects(map);
      const pCount=(req.data||[]).filter(r=>r.status==='pending').length;
      setPendingAccessRequests(pCount);
      setLoading(false);
    });
  };
  useEffect(loadData,[]);

  const handleApprove=async(req)=>{
    setNoteModal({request:req,action:'approve'});
    setAdminNote("");
  };
  const handleReject=async(req)=>{
    setNoteModal({request:req,action:'reject'});
    setAdminNote("");
  };

  const confirmAction=async()=>{
    if(!noteModal)return;
    const {request:req,action}=noteModal;
    setActing(req.id);
    setNoteModal(null);
    const status=action==='approve'?'approved':'rejected';
    const {error}=await db.reviewSubjectAccessRequest(req.id,status,user.teacher_db_id,adminNote);
    if(error){notify(error.message,"error");setActing(null);return;}
    if(action==='approve'){
      let assignErrors=0;
      for(const subjId of req.subject_ids||[]){
        const {error:ae}=await db.assignTeacherSubject(req.teacher_id,req.class_id,subjId);
        if(ae&&ae.code!=="23505") assignErrors++;
      }
      if(assignErrors>0) notify(`Request approved but ${assignErrors} assignment(s) failed \u2014 check Assignments page`,"warn");
      else notify("Request approved \u2014 categories permanently assigned to staff \u2713");
    } else {
      notify("Request rejected","warn");
    }
    setActing(null);
    loadData();
  };

  const statusBadge=(s)=>({
    pending:<Badge color={C.orange}>Pending</Badge>,
    approved:<Badge color={C.green}>Approved</Badge>,
    rejected:<Badge color={C.red}>Rejected</Badge>,
  }[s]||<Badge color={C.muted}>{s}</Badge>);

  const filtered=requests.filter(r=>filter==="all"||r.status===filter);

  if(loading)return <div style={{padding:32,textAlign:"center",color:C.muted}}>Loading…</div>;

  return(
    <div style={{maxWidth:960,margin:"0 auto",padding:"24px 16px"}}>
      <h2 style={{fontWeight:900,color:C.blue,fontSize:18,marginBottom:4}}>Category Access Requests</h2>
      <p style={{color:C.muted,fontSize:13,marginBottom:20}}>
        Review staff requests for temporary access to input scores for extra categories.
      </p>

      <div style={{display:"flex",gap:8,marginBottom:20}}>
        {[
          {v:"pending",label:"Pending",count:requests.filter(r=>r.status==='pending').length},
          {v:"approved",label:"Approved"},
          {v:"rejected",label:"Rejected"},
          {v:"all",label:"All"},
        ].map(f=>(
          <button key={f.v} onClick={()=>setFilter(f.v)}
            style={{padding:"6px 16px",borderRadius:8,border:`2px solid ${filter===f.v?C.blue:C.border}`,
              background:filter===f.v?C.blue:"inherit",color:filter===f.v?"#fff":C.text,
              fontWeight:filter===f.v?700:400,cursor:"pointer",fontSize:13,display:"flex",
              alignItems:"center",gap:6}}>
            {f.label}
            {f.count>0&&<span style={{background:C.orange,color:"#fff",borderRadius:8,
              fontSize:10,fontWeight:900,padding:"1px 6px"}}>{f.count}</span>}
          </button>
        ))}
      </div>

      <Card style={{marginBottom:20}}>
        <h3 style={{fontWeight:800,color:C.blue,fontSize:14,marginBottom:12}}>
          Requests {filtered.length>0&&<span style={{color:C.muted,fontWeight:400}}>({filtered.length})</span>}
        </h3>
        {filtered.length===0
          ?<p style={{color:C.muted,fontSize:13}}>No {filter==="all"?"":filter} requests.</p>
          :(
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {filtered.map(req=>{
                const subjNames=(req.subject_ids||[]).map(id=>allSubjects[id]||`Category #${id}`).join(", ");
                return(
                  <div key={req.id} style={{border:`1px solid ${C.border}`,borderRadius:10,
                    padding:"14px 16px",background:req.status==='pending'?"#fffbf5":"inherit"}}>
                    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                          <strong style={{fontSize:14,color:C.text}}>
                            {req.teachers?.full_name||"Unknown Staff"}
                          </strong>
                          <Badge color={C.muted} style={{fontSize:11}}>{req.teachers?.staff_id||"\u2014"}</Badge>
                          {statusBadge(req.status)}
                        </div>
                        <div style={{fontSize:13,color:C.muted,marginBottom:4}}>
                          <strong style={{color:C.text}}>Group:</strong> {req.classes?.name||"\u2014"}
                          {req.classes?.sections&&<span> \u00b7 {req.classes.sections.code}</span>}
                        </div>
                        <div style={{fontSize:13,marginBottom:4}}>
                          <strong style={{color:C.text}}>Categories:</strong>{" "}
                          <span style={{color:C.blue}}>{subjNames}</span>
                        </div>
                        <div style={{fontSize:11,color:C.muted}}>
                          Requested {new Date(req.requested_at).toLocaleString()}
                          {req.reviewed_at&&<span> \u00b7 Reviewed {new Date(req.reviewed_at).toLocaleString()}</span>}
                          {req.reviewer&&<span> by {req.reviewer.full_name}</span>}
                        </div>
                        {req.admin_note&&(
                          <div style={{marginTop:6,fontSize:12,background:C.bluePale,
                            borderRadius:6,padding:"4px 10px",color:C.blue}}>
                            Note: {req.admin_note}
                          </div>
                        )}
                      </div>
                      {req.status==='pending'&&(
                        <div style={{display:"flex",gap:8,flexShrink:0}}>
                          <Btn xs color={C.green} disabled={acting===req.id}
                            onClick={()=>handleApprove(req)}>
                            {acting===req.id?"\u2026":"\u2713 Approve"}
                          </Btn>
                          <Btn xs color={C.red} outline disabled={acting===req.id}
                            onClick={()=>handleReject(req)}>
                            \u2715 Reject
                          </Btn>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        }
      </Card>

      <div style={{background:C.bluePale,borderRadius:8,padding:"10px 14px",fontSize:12,color:C.blue}}>
        <strong>Note:</strong> Approved requests permanently assign the categories to the staff in the Assignments page.
        To remove access, go to <strong>Assignments → Category Staff</strong> and remove the assignment.
      </div>

      {noteModal&&(
        <Modal onClose={()=>setNoteModal(null)}>
          <h3 style={{fontWeight:800,color:noteModal.action==='approve'?C.green:C.red,
            fontSize:15,marginBottom:8}}>
            {noteModal.action==='approve'?"Approve Request":"Reject Request"}
          </h3>
          <p style={{fontSize:13,color:C.muted,marginBottom:12}}>
            {noteModal.action==='approve'
              ?`Grant ${noteModal.request.teachers?.full_name} access to the selected subjects in ${noteModal.request.classes?.name}?`
              :`Reject the request from ${noteModal.request.teachers?.full_name}?`
            }
          </p>
          <div style={{marginBottom:14}}>
            <label style={{fontSize:12,color:C.muted,fontWeight:600,display:"block",marginBottom:4}}>
              Note to staff (optional)
            </label>
            <textarea value={adminNote} onChange={e=>setAdminNote(e.target.value)}
              rows={3} placeholder="Add a note for the staff…"
              style={{width:"100%",padding:"8px 10px",border:`1px solid ${C.border}`,
                borderRadius:8,fontSize:13,color:C.text,background:"inherit",resize:"vertical",
                boxSizing:"border-box"}}/>
          </div>
          <div style={{display:"flex",gap:10}}>
            <Btn onClick={confirmAction}
              color={noteModal.action==='approve'?C.green:C.red} style={{flex:1}}>
              {noteModal.action==='approve'?"Approve & Grant Access":"Confirm Rejection"}
            </Btn>
            <Btn onClick={()=>setNoteModal(null)} color={C.muted} outline style={{flex:1}}>
              Cancel
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
