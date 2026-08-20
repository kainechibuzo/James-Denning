/**
 * Permissions domain: PermissionsPage, SaveTemplateForm, ApplyTemplateBtn
 */
import React, { useState, useEffect } from "react";
import {
  AlertTriangle, ChevronDown, ChevronRight, ClipboardList, Download,
  Edit, Filter, History, Lock, Save, Shield, Target, Upload, User,
} from "lucide-react";
import { db } from "../supabaseClient.js";
import { C } from "../config/theme.js";
import { PERM_ROLE_DEFAULTS, PERM_GROUPS, RBAC_ROLES } from "../AppDemo.jsx";

export function SaveTemplateForm({roles,onSave}){
  const[name,setName]=useState("");const[role,setRole]=useState("teacher");
  return(<div style={{display:"flex",flexDirection:"column",gap:8}}>
    <input value={name} onChange={e=>setName(e.target.value)} placeholder="Template name (e.g. Default Staff)"
      style={{padding:"8px 10px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:12,outline:"none",background:C.white,color:C.text}}/>
    <select value={role} onChange={e=>setRole(e.target.value)}
      style={{padding:"8px 10px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:12}}>
      {roles.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}
    </select>
    <button onClick={()=>{if(name.trim()){onSave(role,name.trim());setName("");}}} disabled={!name.trim()}
      style={{padding:"8px 12px",borderRadius:8,background:"#1A4FA0",color:"#fff",border:"none",cursor:"pointer",fontSize:12,fontWeight:700,opacity:name.trim()?1:.5}}>
      Save Template
    </button>
  </div>);
}
export function ApplyTemplateBtn({roles,templateName,onApply}){
  const[open,setOpen]=useState(false);const[role,setRole]=useState("teacher");
  if(!open)return(<button onClick={()=>setOpen(true)} style={{padding:"4px 8px",borderRadius:6,border:`1px solid ${C.blue}`,background:C.bluePale,color:C.blue,cursor:"pointer",fontSize:11,fontWeight:700}}>Apply</button>);
  return(<div style={{display:"flex",gap:4,alignItems:"center"}}>
    <select value={role} onChange={e=>setRole(e.target.value)} style={{padding:"4px 6px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:11}}>
      {roles.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}
    </select>
    <button onClick={()=>{onApply(templateName,role);setOpen(false);}} style={{padding:"4px 6px",borderRadius:6,border:`1px solid ${C.blue}`,background:C.blue,color:"#fff",cursor:"pointer",fontSize:11,fontWeight:700}}>✓</button>
    <button onClick={()=>setOpen(false)} style={{padding:"4px 6px",borderRadius:6,border:`1px solid ${C.border}`,background:C.white,color:C.muted,cursor:"pointer",fontSize:11}}>✕</button>
  </div>);
}
// ─── PERMISSIONS PAGE ─────────────────────────────────────────────────────────────────────────────────
// Admin can control what roles and individual users can access
export function PermissionsPage({ctx}){
  const{notify,user}=ctx;
  const[tab,setTab]=useState("matrix");
  const[allRolePerms,setAllRolePerms]=useState([]);
  const[userPerms,setUserPerms]=useState([]);
  const[teachers,setTeachers]=useState([]);
  const[students,setStudents]=useState([]);
  const[selUserId,setSelUserId]=useState("");
  const[selUserType,setSelUserType]=useState("teacher");
  const[saving,setSaving]=useState(false);
  const[loading,setLoading]=useState(true);
  const[auditLog,setAuditLog]=useState([]);
  const[auditLoading,setAuditLoading]=useState(false);
  const[expandedGroups,setExpandedGroups]=useState(new Set(["academic","financial"]));
  const[matrixRole,setMatrixRole]=useState("teacher");
  const[templates,setTemplates]=useState({});
  const[filterText,setFilterText]=useState("");
  const[portalSettings,setPortalSettings]=useState({});

  const load=async()=>{
    setLoading(true);
    const[rp,t,s,sets]=await Promise.all([db.getRolePermissions(null),db.getTeachers(),db.getStudents(),db.getSettings()]);
    setAllRolePerms(rp.data||[]);setTeachers(t.data||[]);setStudents(s.data||[]);
    const sm={};(sets.data||[]).forEach(r=>{sm[r.key]=r.value;});setPortalSettings(sm);
    try{const tt=JSON.parse(sm.permission_templates||"{}");setTemplates(tt);}catch{}
    setLoading(false);
  };
  useEffect(()=>{load();},[]);

  const loadAudit=async()=>{
    setAuditLoading(true);
    const{data}=await db.getPermissionAuditLog(200);
    setAuditLog(data||[]);setAuditLoading(false);
  };
  useEffect(()=>{if(tab==="audit")loadAudit();},[tab]);

  const loadUserPerms=async(uid)=>{if(!uid)return;const{data}=await db.getUserPermissions(uid);setUserPerms(data||[]);};
  useEffect(()=>{loadUserPerms(selUserId);},[selUserId]);

  const isRolePermOn=(role,permId)=>{
    const p=allRolePerms.find(r=>r.role===role&&r.page_id===permId);
    if(p!==undefined)return p.allowed;
    return(PERM_ROLE_DEFAULTS[role]||[]).includes(permId);
  };
  const toggleRolePerm=async(role,permId)=>{
    const cur=isRolePermOn(role,permId);setSaving(true);
    await db.setRolePermission(role,permId,!cur);
    try{await db.logPermissionChange((user&&user.id)||"admin","role_perm",role,null,permId,cur,!cur);}catch{}
    const{data}=await db.getRolePermissions(null);setAllRolePerms(data||[]);setSaving(false);
    notify(permId+" "+(!cur?"enabled":"disabled")+" for "+role+" ✓");
  };
  const toggleUserPerm=async(permId)=>{
    if(!selUserId){notify("Select a user first","error");return;}
    const uP=userPerms.find(p=>p.page_id===permId);
    if(uP){
      await db.removeUserPermission(selUserType,selUserId,permId);
      try{await db.logPermissionChange((user&&user.id)||"admin","user_override_removed",selUserType,selUserId,permId,uP.allowed,null);}catch{}
    }else{
      const roleDefault=isRolePermOn(selUserType==="teacher"?"teacher":"student",permId);
      await db.setUserPermission(selUserType,selUserId,permId,!roleDefault);
      try{await db.logPermissionChange((user&&user.id)||"admin","user_override_set",selUserType,selUserId,permId,roleDefault,!roleDefault);}catch{}
    }
    await loadUserPerms(selUserId);notify("User permission updated ✓");
  };
  const bulkGroupToggle=async(role,groupId,enable)=>{
    const grp=PERM_GROUPS.find(g=>g.id===groupId);if(!grp)return;setSaving(true);
    await Promise.all(grp.perms.map(p=>db.setRolePermission(role,p.id,enable)));
    try{await db.logPermissionChange((user&&user.id)||"admin","bulk_group",role,null,"group:"+groupId,null,enable);}catch{}
    const{data}=await db.getRolePermissions(null);setAllRolePerms(data||[]);setSaving(false);
    notify("All "+grp.label+" "+(enable?"enabled":"disabled")+" for "+role+" ✓");
  };
  const bulkRoleToggle=async(role,enable)=>{
    setSaving(true);const all=PERM_GROUPS.flatMap(g=>g.perms);
    await Promise.all(all.map(p=>db.setRolePermission(role,p.id,enable)));
    try{await db.logPermissionChange((user&&user.id)||"admin","bulk_role",role,null,"ALL",null,enable);}catch{}
    const{data}=await db.getRolePermissions(null);setAllRolePerms(data||[]);setSaving(false);
    notify("All permissions "+(enable?"enabled":"disabled")+" for "+role+" ✓");
  };
  const resetRoleToDefaults=async(role)=>{
    setSaving(true);const all=PERM_GROUPS.flatMap(g=>g.perms);const defs=PERM_ROLE_DEFAULTS[role]||[];
    await Promise.all(all.map(p=>db.setRolePermission(role,p.id,defs.includes(p.id))));
    try{await db.logPermissionChange((user&&user.id)||"admin","role_reset",role,null,"ALL",null,"defaults");}catch{}
    const{data}=await db.getRolePermissions(null);setAllRolePerms(data||[]);setSaving(false);
    notify(role+" reset to defaults ✓");
  };
  const saveTemplate=async(role,tmplName)=>{
    const all=PERM_GROUPS.flatMap(g=>g.perms);const snap={};
    all.forEach(p=>{snap[p.id]=isRolePermOn(role,p.id);});
    const upd={...templates,[tmplName]:{role,perms:snap,savedAt:new Date().toISOString()}};
    setTemplates(upd);await db.setSetting("permission_templates",JSON.stringify(upd));
    notify('Template "'+tmplName+'" saved ✓');
  };
  const applyTemplate=async(tmplName,targetRole)=>{
    const tmpl=templates[tmplName];if(!tmpl){notify("Template not found","error");return;}
    setSaving(true);
    await Promise.all(Object.entries(tmpl.perms).map(([pid,val])=>db.setRolePermission(targetRole,pid,val)));
    try{await db.logPermissionChange((user&&user.id)||"admin","template_applied",targetRole,null,tmplName,null,"template");}catch{}
    const{data}=await db.getRolePermissions(null);setAllRolePerms(data||[]);setSaving(false);
    notify('Template "'+tmplName+'" applied to '+targetRole+' ✓');
  };
  const toggleGroup=id=>setExpandedGroups(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});

  const PT=({on,onChange,disabled=false,ovr=false})=>(
    <button onClick={onChange} disabled={disabled}
      style={{width:44,height:24,borderRadius:12,border:ovr?"2px solid "+C.orange:"none",cursor:disabled?"not-allowed":"pointer",
        background:on?C.green:"#cbd5e1",position:"relative",transition:"all .2s",opacity:disabled?.5:1,flexShrink:0}}>
      <div style={{position:"absolute",top:ovr?1:2,left:on?(ovr?18:22):2,width:ovr?18:20,height:ovr?18:20,
        borderRadius:"50%",background:"#fff",transition:"all .2s",boxShadow:"0 1px 4px rgba(0,0,0,.2)"}}/>
    </button>
  );

  const TABS2=[
    {id:"matrix",label:"Permission Matrix"},
    {id:"users", label:"User Overrides"},
    {id:"audit", label:"Audit Log"},
    {id:"templates",label:"Templates"},
  ];

  if(loading)return<div style={{padding:40,textAlign:"center",color:C.muted}}>Loading permissions…</div>;

  return(
    <div style={{maxWidth:1100,margin:"0 auto",padding:"0 4px"}}>
      <div style={{marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
          <Shield size={22} color={C.blue}/>
          <h2 style={{fontWeight:900,fontSize:18,color:C.blue,margin:0}}>Permissions & Access Control</h2>
          {saving&&<span style={{fontSize:11,color:C.orange,fontWeight:600}}>Saving…</span>}
        </div>
        <p style={{fontSize:12,color:C.muted,margin:0}}>Control what each role can see and do. Admin has permanent full access and cannot be restricted.</p>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10,marginBottom:20}}>
        {RBAC_ROLES.map(r=>{
          const allP=PERM_GROUPS.flatMap(g=>g.perms);
          const on=allP.filter(p=>isRolePermOn(r.id,p.id)).length;
          return(
            <div key={r.id} onClick={()=>{setMatrixRole(r.id);setTab("matrix");}}
              style={{background:C.white,border:"2px solid "+(matrixRole===r.id&&tab==="matrix"?r.color:C.border),borderRadius:10,padding:"12px 14px",cursor:"pointer",transition:"all .15s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                <span style={{fontWeight:800,fontSize:13,color:r.color}}>{r.label}</span>
                <span style={{fontSize:10,background:r.color+"18",color:r.color,padding:"2px 7px",borderRadius:99,fontWeight:700}}>{on}/{allP.length}</span>
              </div>
              <div style={{fontSize:10,color:C.muted,marginBottom:6}}>{r.desc}</div>
              <div style={{height:3,background:C.offWhite,borderRadius:2,overflow:"hidden"}}>
                <div style={{height:"100%",width:((on/allP.length)*100)+"%",background:r.color,borderRadius:2}}/>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{background:C.orangePale,border:`1px solid ${C.orange}40`,borderRadius:10,padding:"10px 14px",marginBottom:16,display:"flex",alignItems:"center",gap:8}}>
        <Shield size={14} color={C.orange}/>
        <span style={{fontSize:12,color:C.orange,fontWeight:600}}>Administrator (admin) has unrestricted access to all features and cannot be locked out. These settings only apply to other roles.</span>
      </div>

      <div style={{display:"flex",gap:2,borderBottom:"2px solid "+C.border,marginBottom:20,overflowX:"auto"}}>
        {TABS2.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"10px 16px",border:"none",background:"transparent",cursor:"pointer",fontWeight:700,fontSize:13,
              color:tab===t.id?C.blue:C.muted,borderBottom:tab===t.id?"3px solid "+C.blue:"3px solid transparent",
              marginBottom:-2,whiteSpace:"nowrap",transition:"all .15s"}}>
            {t.label}
          </button>
        ))}
      </div>

      {tab==="matrix"&&(
        <div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,flexWrap:"wrap"}}>
            {RBAC_ROLES.map(r=>(
              <button key={r.id} onClick={()=>setMatrixRole(r.id)}
                style={{padding:"6px 14px",borderRadius:8,border:"2px solid "+r.color,cursor:"pointer",
                  background:matrixRole===r.id?r.color:"transparent",color:matrixRole===r.id?"#fff":r.color,fontWeight:700,fontSize:12}}>
                {r.label}
              </button>
            ))}
            <div style={{flex:1}}/>
            <input value={filterText} onChange={e=>setFilterText(e.target.value)} placeholder="Filter…"
              style={{padding:"6px 10px",border:"1px solid "+C.border,borderRadius:8,fontSize:12,width:160,outline:"none"}}/>
            <button onClick={()=>bulkRoleToggle(matrixRole,true)} disabled={saving}
              style={{padding:"5px 10px",borderRadius:8,background:C.greenPale,color:C.green,border:"1px solid "+C.green,cursor:"pointer",fontSize:11,fontWeight:700}}>All ON</button>
            <button onClick={()=>bulkRoleToggle(matrixRole,false)} disabled={saving}
              style={{padding:"5px 10px",borderRadius:8,background:C.redPale,color:C.red,border:"1px solid "+C.red,cursor:"pointer",fontSize:11,fontWeight:700}}>All OFF</button>
            <button onClick={()=>resetRoleToDefaults(matrixRole)} disabled={saving}
              style={{padding:"5px 10px",borderRadius:8,background:C.offWhite,color:C.muted,border:"1px solid "+C.border,cursor:"pointer",fontSize:11,fontWeight:700}}>↺ Defaults</button>
          </div>
          {PERM_GROUPS.map(grp=>{
            const fp=filterText?grp.perms.filter(p=>p.label.toLowerCase().includes(filterText.toLowerCase())||p.desc.toLowerCase().includes(filterText.toLowerCase())):grp.perms;
            if(filterText&&fp.length===0)return null;
            const isExp=expandedGroups.has(grp.id)||!!filterText;
            const onCount=grp.perms.filter(p=>isRolePermOn(matrixRole,p.id)).length;
            return(
              <div key={grp.id} style={{background:C.white,border:"1px solid "+C.border,borderRadius:12,marginBottom:10,overflow:"hidden"}}>
                <div onClick={()=>toggleGroup(grp.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 16px",cursor:"pointer",background:grp.color+"08",borderBottom:isExp?"1px solid "+C.border:"none"}}>
                  <div style={{width:26,height:26,borderRadius:7,background:grp.color,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <Lock size={13} color="#fff"/>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:800,fontSize:13,color:C.text}}>{grp.label}</div>
                    <div style={{fontSize:10,color:C.muted}}>{onCount}/{grp.perms.length} enabled</div>
                  </div>
                  <button onClick={e=>{e.stopPropagation();bulkGroupToggle(matrixRole,grp.id,true);}} disabled={saving}
                    style={{padding:"3px 8px",fontSize:10,fontWeight:700,borderRadius:6,border:"1px solid "+C.green,background:C.greenPale,color:C.green,cursor:"pointer",marginRight:4}}>All ON</button>
                  <button onClick={e=>{e.stopPropagation();bulkGroupToggle(matrixRole,grp.id,false);}} disabled={saving}
                    style={{padding:"3px 8px",fontSize:10,fontWeight:700,borderRadius:6,border:"1px solid "+C.red,background:C.redPale,color:C.red,cursor:"pointer",marginRight:8}}>All OFF</button>
                  {isExp?<ChevronDown size={15} color={C.muted}/>:<ChevronRight size={15} color={C.muted}/>}
                </div>
                {isExp&&fp.map((perm,i)=>{
                  const on=isRolePermOn(matrixRole,perm.id);
                  return(
                    <div key={perm.id} style={{display:"flex",alignItems:"center",gap:12,padding:"9px 16px",
                      borderBottom:i<fp.length-1?"1px solid "+C.border:"none",background:i%2===0?C.white:C.offWhite}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,fontSize:12,color:C.text}}>{perm.label}</div>
                        <div style={{fontSize:10,color:C.muted,marginTop:1}}>{perm.desc}</div>
                        <div style={{fontSize:9,color:C.light,fontFamily:"monospace",marginTop:1}}>{perm.id}</div>
                      </div>
                      <PT on={on} onChange={()=>toggleRolePerm(matrixRole,perm.id)} disabled={saving}/>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {matrixRole==="teacher"&&(
            <div style={{background:C.white,border:"1px solid "+C.border,borderRadius:12,marginTop:10,overflow:"hidden"}}>
              <div style={{padding:"11px 16px",background:C.orangePale,borderBottom:"1px solid "+C.border,display:"flex",alignItems:"center",gap:8}}>
                <AlertTriangle size={15} color={C.orange}/>
                <span style={{fontWeight:800,fontSize:13,color:C.orange}}>Behaviour Restrictions (Staff)</span>
              </div>
              {/* Master: Reports restrict switch */}
              {(()=>{
                const masterKey="teacher_report_card_view_only";
                const masterOn=portalSettings[masterKey]==="true";
                const subPerms=[
                  {key:"teacher_rc_allow_print",    label:"Allow Print PDF"},
                  {key:"teacher_rc_allow_download", label:"Allow Download PDF"},
                  {key:"teacher_rc_allow_email",    label:"Allow Email"},
                  {key:"teacher_rc_allow_export",   label:"Allow Export All PDFs"},
                ];
                return(
                  <>
                    <div style={{display:"flex",alignItems:"center",gap:12,padding:"11px 16px",borderBottom:`1px solid ${C.border}`}}>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700,fontSize:12,color:C.text}}>Reports — Restrict Staff Actions</div>
                        <div style={{fontSize:10,color:C.muted,marginTop:2}}>Hides all admin actions (Publish, Approve, Customise, Clear, Email Section). Share is always available. Use sub-permissions below to individually re-enable Print, Download, Email, or Export.</div>
                      </div>
                      <PT on={masterOn} onChange={async()=>{
                        const v=(!masterOn).toString();await db.setSetting(masterKey,v);
                        setPortalSettings(p=>({...p,[masterKey]:v}));
                        notify("Report card restriction "+(!masterOn?"ON":"OFF")+" ✓");
                      }} disabled={saving}/>
                    </div>
                    {masterOn&&(
                      <div style={{background:C.offWhite,borderBottom:`1px solid ${C.border}`}}>
                        <div style={{padding:"7px 16px 4px",fontSize:10,fontWeight:800,color:C.muted,letterSpacing:.5,textTransform:"uppercase"}}>
                          Allowed actions for staff in restricted mode
                        </div>
                        {subPerms.map(({key,label},si)=>{
                          const on=portalSettings[key]==="true";
                          return(
                            <div key={key} style={{display:"flex",alignItems:"center",gap:12,
                              padding:"9px 16px 9px 28px",
                              borderTop:si>0?`1px solid ${C.border}`:undefined}}>
                              <div style={{flex:1,fontSize:12,color:C.text,fontWeight:600}}>{label}</div>
                              <PT on={on} onChange={async()=>{
                                const v=(!on).toString();await db.setSetting(key,v);
                                setPortalSettings(p=>({...p,[key]:v}));
                                notify(label+" "+(!on?"enabled":"disabled")+" ✓");
                              }} disabled={saving}/>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                );
              })()}
              {/* Master: My Groups restrict switch */}
              {(()=>{
                const masterKey="teacher_my_classes_restrict";
                const masterOn=portalSettings[masterKey]==="true";
                const subPerms=[
                  {key:"teacher_my_classes_allow_subject_access", label:"Allow Category-Staff Groups", help:"Show groups where the staff teaches a category (in addition to their form groups)."},
                  {key:"teacher_my_classes_allow_edit_students",  label:"Allow Edit Member Details",    help:"Show the Edit button on members in the staff's form groups. Category-staff groups remain view-only."},
                ];
                return(
                  <>
                    <div style={{display:"flex",alignItems:"center",gap:12,padding:"11px 16px",borderTop:`1px solid ${C.border}`}}>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700,fontSize:12,color:C.text}}>My Groups — Restrict Access</div>
                        <div style={{fontSize:10,color:C.muted,marginTop:2}}>When ON, the My Groups page is locked down to form groups and view-only. Use the sub-permissions below to re-enable category-staff access and edit actions individually. OFF (default) gives full access.</div>
                      </div>
                      <PT on={masterOn} onChange={async()=>{
                        const v=(!masterOn).toString();await db.setSetting(masterKey,v);
                        setPortalSettings(p=>({...p,[masterKey]:v}));
                        notify("My Groups restriction "+(!masterOn?"ON":"OFF")+" ✓");
                      }} disabled={saving}/>
                    </div>
                    {masterOn&&(
                      <div style={{background:C.offWhite,borderBottom:`1px solid ${C.border}`}}>
                        <div style={{padding:"7px 16px 4px",fontSize:10,fontWeight:800,color:C.muted,letterSpacing:.5,textTransform:"uppercase"}}>
                          Allowed operations on My Groups in restricted mode
                        </div>
                        {subPerms.map(({key,label,help},si)=>{
                          const on=portalSettings[key]==="true";
                          return(
                            <div key={key} style={{display:"flex",alignItems:"center",gap:12,
                              padding:"9px 16px 9px 28px",
                              borderTop:si>0?`1px solid ${C.border}`:undefined}}>
                              <div style={{flex:1}}>
                                <div style={{fontSize:12,color:C.text,fontWeight:600}}>{label}</div>
                                <div style={{fontSize:10,color:C.muted,marginTop:1}}>{help}</div>
                              </div>
                              <PT on={on} onChange={async()=>{
                                const v=(!on).toString();await db.setSetting(key,v);
                                setPortalSettings(p=>({...p,[key]:v}));
                                notify(label+" "+(!on?"enabled":"disabled")+" ✓");
                              }} disabled={saving}/>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                );
              })()}
              {/* Other behaviour restrictions */}
              {[
                {key:"teacher_subject_class_report_cards",label:"Reports — Restrict to Form Group Only",desc:"When ON, staff only see report cards for their form group. When OFF (default), staff also see groups where they are a category staff."},
                {key:"teacher_add_student_own_class_only",label:"Add Members — Own Group Only",desc:"Staff can only submit member requests for their assigned groups."},
              ].map(({key,label,desc},i)=>{
                const on=portalSettings[key]==="true";
                return(
                  <div key={key} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 16px",borderTop:`1px solid ${C.border}`}}>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:12,color:C.text}}>{label}</div>
                      <div style={{fontSize:10,color:C.muted,marginTop:2}}>{desc}</div>
                    </div>
                    <PT on={on} onChange={async()=>{
                      const v=(!on).toString();await db.setSetting(key,v);
                      setPortalSettings(p=>({...p,[key]:v}));
                      notify(label+" "+(!on?"ON":"OFF")+" ✓");
                    }} disabled={saving}/>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab==="users"&&(
        <div>
          <div style={{background:C.white,border:"1px solid "+C.border,borderRadius:12,padding:16,marginBottom:14}}>
            <div style={{fontWeight:800,fontSize:13,color:C.blue,marginBottom:10}}>Select User</div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              <select value={selUserType} onChange={e=>{setSelUserType(e.target.value);setSelUserId("");setUserPerms([]);}}
                style={{padding:"8px 12px",border:"1px solid "+C.border,borderRadius:8,fontSize:12,background:C.white,color:C.text}}>
                <option value="teacher">Staff / Staff</option>
                <option value="student">Member</option>
              </select>
              <select value={selUserId} onChange={e=>setSelUserId(e.target.value)}
                style={{flex:1,minWidth:200,padding:"8px 12px",border:"1px solid "+C.border,borderRadius:8,fontSize:12,background:C.white,color:C.text}}>
                <option value="">{"— Select "+(selUserType==="teacher"?"staff":"student")+" —"}</option>
                {(selUserType==="teacher"?teachers:students).map(m=>(
                  <option key={m.id} value={selUserType==="teacher"?m.staff_id:m.id}>
                    {selUserType==="teacher"?m.full_name:((m.first_name||"")+" "+(m.last_name||"")).trim()} ({selUserType==="teacher"?m.staff_id:m.id})
                  </option>
                ))}
              </select>
            </div>
            {selUserId&&<div style={{marginTop:8,fontSize:11,color:C.muted}}><span style={{color:C.orange,fontWeight:700}}>Orange border</span> = active override (click to remove and revert to role default)</div>}
          </div>
          {selUserId&&PERM_GROUPS.map(grp=>(
            <div key={grp.id} style={{background:C.white,border:"1px solid "+C.border,borderRadius:12,marginBottom:10,overflow:"hidden"}}>
              <div style={{padding:"10px 16px",background:grp.color+"08",borderBottom:"1px solid "+C.border,fontWeight:800,fontSize:12,color:grp.color}}>{grp.label}</div>
              {grp.perms.map((perm,i)=>{
                const uP=userPerms.find(p=>p.page_id===perm.id);
                const hasOvr=!!uP;
                const effOn=hasOvr?uP.allowed:isRolePermOn(selUserType==="teacher"?"teacher":"student",perm.id);
                return(
                  <div key={perm.id} style={{display:"flex",alignItems:"center",gap:12,padding:"9px 16px",
                    borderBottom:i<grp.perms.length-1?"1px solid "+C.border:"none",
                    background:hasOvr?C.orangePale:i%2===0?C.white:C.offWhite}}>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontWeight:700,fontSize:12,color:C.text}}>{perm.label}</span>
                        {hasOvr&&<span style={{fontSize:9,background:C.orange,color:"#fff",padding:"1px 6px",borderRadius:99,fontWeight:700}}>OVERRIDE</span>}
                      </div>
                      <div style={{fontSize:10,color:C.muted,marginTop:1}}>{perm.desc}</div>
                    </div>
                    <PT on={effOn} onChange={()=>toggleUserPerm(perm.id)} ovr={hasOvr}/>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {tab==="audit"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontWeight:800,fontSize:14,color:C.blue}}>Permission Change History</div>
            <button onClick={loadAudit} disabled={auditLoading}
              style={{padding:"6px 12px",borderRadius:8,border:"1px solid "+C.border,background:C.white,cursor:"pointer",fontSize:12,fontWeight:700,color:C.muted}}>↺ Refresh</button>
          </div>
          {auditLoading?<div style={{textAlign:"center",padding:32,color:C.muted}}>Loading…</div>
          :auditLog.length===0?(
            <div style={{textAlign:"center",padding:48,color:C.light}}>
              <ClipboardList size={36} color={C.muted} style={{marginBottom:8,display:"block",margin:"0 auto 8px"}}/>
              <div style={{fontWeight:700,color:C.blue}}>No audit entries yet</div>
              <div style={{fontSize:12,marginTop:4,color:C.muted}}>Permission changes will appear here</div>
            </div>
          ):(
            <div style={{background:C.white,border:"1px solid "+C.border,borderRadius:12,overflow:"hidden"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr style={{background:C.blue}}>
                    {["Time","Changed By","Action","Target","Permission","Before→After"].map(h=>(
                      <th key={h} style={{padding:"9px 12px",textAlign:"left",color:"#fff",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map((e2,i)=>(
                    <tr key={e2.id||i} style={{background:i%2===0?C.white:C.offWhite,borderBottom:"1px solid "+C.border}}>
                      <td style={{padding:"7px 12px",fontSize:11,color:C.muted,whiteSpace:"nowrap"}}>
                        {e2.created_at?new Date(e2.created_at).toLocaleString("en-NG",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):"—"}
                      </td>
                      <td style={{padding:"7px 12px",fontSize:11,fontWeight:700,color:C.blue}}>{e2.admin_id||"—"}</td>
                      <td style={{padding:"7px 12px",fontSize:10}}>
                        <span style={{background:C.bluePale,color:C.blue,padding:"2px 7px",borderRadius:99,fontWeight:700}}>{e2.action||"—"}</span>
                      </td>
                      <td style={{padding:"7px 12px",fontSize:11}}>
                        {e2.target_role&&<b style={{color:C.text}}>{e2.target_role}</b>}
                        {e2.target_user_id&&<span style={{color:C.muted}}> / {e2.target_user_id}</span>}
                      </td>
                      <td style={{padding:"7px 12px",fontSize:10,color:C.muted,fontFamily:"monospace",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e2.page_id||"—"}</td>
                      <td style={{padding:"7px 12px",fontSize:11,whiteSpace:"nowrap"}}>
                        {e2.old_value!=null&&<span style={{color:e2.old_value==="true"?C.green:C.red,fontWeight:700}}>{e2.old_value}</span>}
                        {e2.old_value!=null&&e2.new_value!=null&&<span style={{color:C.muted}}> → </span>}
                        {e2.new_value!=null&&<span style={{color:e2.new_value==="true"||e2.new_value==="template"||e2.new_value==="defaults"?C.green:C.red,fontWeight:700}}>{e2.new_value}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab==="templates"&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
            <div style={{background:C.white,border:"1px solid "+C.border,borderRadius:12,padding:16}}>
              <div style={{fontWeight:800,fontSize:13,color:C.blue,marginBottom:10}}>💾 Save Current as Template</div>
              <SaveTemplateForm roles={RBAC_ROLES} onSave={saveTemplate}/>
            </div>
            <div style={{background:C.white,border:"1px solid "+C.border,borderRadius:12,padding:16}}>
              <div style={{fontWeight:800,fontSize:13,color:C.blue,marginBottom:10}}>📁 Saved Templates ({Object.keys(templates).length})</div>
              {Object.keys(templates).length===0
                ?<div style={{textAlign:"center",padding:24,color:C.light,fontSize:12}}>No templates yet</div>
                :<div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {Object.entries(templates).map(([name,tmpl])=>(
                    <div key={name} style={{border:"1px solid "+C.border,borderRadius:8,padding:"9px 12px",display:"flex",alignItems:"center",gap:8}}>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700,fontSize:12,color:C.text}}>{name}</div>
                        <div style={{fontSize:10,color:C.muted}}>For: {tmpl.role} · {tmpl.savedAt?new Date(tmpl.savedAt).toLocaleDateString("en-NG"):"—"}</div>
                      </div>
                      <ApplyTemplateBtn roles={RBAC_ROLES} templateName={name} onApply={applyTemplate}/>
                      <button onClick={async()=>{
                        const u={...templates};delete u[name];setTemplates(u);
                        await db.setSetting("permission_templates",JSON.stringify(u));
                        notify('"'+name+'" deleted',"warn");
                      }} style={{padding:"4px 8px",borderRadius:6,border:"1px solid "+C.red,background:C.redPale,color:C.red,cursor:"pointer",fontSize:11,fontWeight:700}}>Del</button>
                    </div>
                  ))}
                </div>
              }
            </div>
          </div>
          <div style={{background:C.white,border:"1px solid "+C.border,borderRadius:12,padding:16}}>
            <div style={{fontWeight:800,fontSize:13,color:C.blue,marginBottom:12}}>📖 Role Reference Guide</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:10}}>
              {[
                {id:"admin",label:"Administrator",color:C.orange,items:["Full unrestricted access","Configure all settings","Manage all permissions","Cannot be locked out"]},
                {id:"teacher",label:"Staff",color:"#1A8C3C",items:["Upload & manage results","View group report cards","Take attendance","Post announcements","Limited to assigned groups"]},
                {id:"manager",label:"Manager",color:"#7C3AED",items:["Full financial access","Record & track payments","Generate billing bills","Create billing templates","View member list (read-only)"]},
                {id:"student",label:"Member",color:"#1A4FA0",items:["View own report cards","View own billing/payments","Access transcript","Read announcements"]},
              ].map(r=>(
                <div key={r.id} style={{border:"1.5px solid "+r.color+"30",borderRadius:10,padding:"12px 14px",background:r.color+"06"}}>
                  <div style={{fontWeight:800,fontSize:13,color:r.color,marginBottom:8}}>{r.label}</div>
                  {r.items.map(item=><div key={item} style={{fontSize:10,color:C.text,paddingLeft:6,marginBottom:2}}>• {item}</div>)}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
