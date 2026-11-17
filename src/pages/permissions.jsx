/**
 * Permissions page: role permission matrix and permission change history.
 * Admin always has full access; this page configures owner and manager grants.
 */
import React, { useState, useEffect } from "react";
import { History, RotateCcw, Shield } from "lucide-react";
import { db } from "../supabaseClient.js";
import { C } from "../config/theme.js";
import { PERM_ROLE_DEFAULTS, PERM_GROUPS, RBAC_ROLES } from "../config/permissions.mjs";
import { Card, Btn, Badge, Spinner } from "../components/ui.jsx";

export function PermissionsPage({ctx}){
  const {notify,user}=ctx;
  const [tab,setTab]=useState("matrix");
  const [role,setRole]=useState(RBAC_ROLES[0].id);
  const [rolePerms,setRolePerms]=useState([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [audit,setAudit]=useState([]);
  const [auditLoading,setAuditLoading]=useState(false);
  const actor=(user&&(user._authUserId||user.id))||"admin";

  const reload=async()=>{const {data}=await db.getRolePermissions(null);setRolePerms(data||[]);};
  useEffect(()=>{reload().finally(()=>setLoading(false));},[]);
  useEffect(()=>{
    if(tab!=="audit")return;
    setAuditLoading(true);
    db.getPermissionAuditLog(200).then(({data})=>{setAudit(data||[]);setAuditLoading(false);});
  },[tab]);

  const isOn=(r,permId)=>{
    const row=rolePerms.find(p=>p.role===r&&p.page_id===permId);
    if(row!==undefined)return row.allowed;
    return (PERM_ROLE_DEFAULTS[r]||[]).includes(permId);
  };
  const toggle=async(permId)=>{
    const current=isOn(role,permId);
    setSaving(true);
    const {error}=await db.setRolePermission(role,permId,!current);
    if(!error){try{await db.logPermissionChange(actor,"role_perm",role,null,permId,current,!current);}catch{}}
    await reload();setSaving(false);
    if(error)notify(error.message||"Permission could not be saved","error");
    else notify(`${permId} ${!current?"enabled":"disabled"} for ${role}`);
  };
  const resetDefaults=async()=>{
    setSaving(true);
    const defaults=PERM_ROLE_DEFAULTS[role]||[];
    const all=PERM_GROUPS.flatMap(g=>g.perms);
    await Promise.all(all.map(p=>db.setRolePermission(role,p.id,defaults.includes(p.id))));
    try{await db.logPermissionChange(actor,"role_reset",role,null,"ALL",null,"defaults");}catch{}
    await reload();setSaving(false);notify(`${role} reset to defaults`);
  };

  const tabBtn=(id,label,Icon)=>(
    <button key={id} type="button" onClick={()=>setTab(id)} aria-pressed={tab===id}
      style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:9,cursor:"pointer",
        border:`1px solid ${tab===id?C.blue:C.border}`,background:tab===id?C.bluePale:C.white,
        color:tab===id?C.blue:C.muted,fontWeight:700,fontSize:12}}>
      <Icon size={14}/>{label}
    </button>
  );

  if(loading)return <Spinner text="Loading permissions…"/>;
  const selected=RBAC_ROLES.find(r=>r.id===role);

  return(
    <div style={{maxWidth:900,margin:"0 auto",paddingBottom:40}}>
      <h2 style={{fontSize:20,fontWeight:900,color:C.text,margin:"0 0 4px"}}>Permissions</h2>
      <p style={{fontSize:12,color:C.muted,margin:"0 0 16px"}}>Admins always have full access. Navigation follows these grants; backend policies remain the authority.</p>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        {tabBtn("matrix","Role permissions",Shield)}
        {tabBtn("audit","Change history",History)}
      </div>

      {tab==="matrix"&&(
        <Card>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:14}}>
            {RBAC_ROLES.map(r=>(
              <button key={r.id} type="button" onClick={()=>setRole(r.id)} aria-pressed={role===r.id}
                style={{padding:"6px 14px",borderRadius:20,cursor:"pointer",fontSize:12,fontWeight:700,
                  border:`1.5px solid ${r.color}`,background:role===r.id?r.color:"transparent",color:role===r.id?"#fff":r.color}}>
                {r.label}
              </button>
            ))}
            <div style={{flex:1}}/>
            <Btn sm outline color={C.muted} onClick={resetDefaults} disabled={saving}><RotateCcw size={12}/> Reset to defaults</Btn>
          </div>
          {selected&&<p style={{fontSize:12,color:C.muted,margin:"0 0 14px"}}>{selected.desc}</p>}
          {PERM_GROUPS.map(group=>(
            <div key={group.id} style={{marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:800,letterSpacing:1,textTransform:"uppercase",color:group.color,marginBottom:6}}>{group.label}</div>
              {group.perms.map(perm=>{
                const on=isOn(role,perm.id);
                return(
                  <label key={perm.id} style={{display:"flex",alignItems:"center",gap:12,padding:"9px 12px",
                    border:`1px solid ${C.border}`,borderRadius:9,marginBottom:6,cursor:saving?"wait":"pointer",background:C.white}}>
                    <input type="checkbox" checked={on} disabled={saving} onChange={()=>toggle(perm.id)} style={{accentColor:C.blue}}/>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:700,color:C.text}}>{perm.label}</div>
                      <div style={{fontSize:11,color:C.muted}}>{perm.desc}</div>
                    </div>
                    <Badge color={on?C.green:C.muted}>{on?"Allowed":"Denied"}</Badge>
                  </label>
                );
              })}
            </div>
          ))}
        </Card>
      )}

      {tab==="audit"&&(
        <Card>
          {auditLoading?<Spinner text="Loading history…"/>:audit.length===0?(
            <p style={{fontSize:13,color:C.muted,margin:0}}>No permission changes recorded yet.</p>
          ):(
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead><tr>{["When","Action","Role","Permission","Change"].map(h=>(
                  <th key={h} style={{textAlign:"left",padding:"8px 10px",borderBottom:`1px solid ${C.border}`,color:C.muted}}>{h}</th>
                ))}</tr></thead>
                <tbody>{audit.map(row=>(
                  <tr key={row.id}>
                    <td style={{padding:"8px 10px",borderBottom:`1px solid ${C.border}`}}>{row.created_at?new Date(row.created_at).toLocaleString():"—"}</td>
                    <td style={{padding:"8px 10px",borderBottom:`1px solid ${C.border}`}}>{row.action||"—"}</td>
                    <td style={{padding:"8px 10px",borderBottom:`1px solid ${C.border}`}}>{row.target_role||"—"}</td>
                    <td style={{padding:"8px 10px",borderBottom:`1px solid ${C.border}`}}>{row.page_id||"—"}</td>
                    <td style={{padding:"8px 10px",borderBottom:`1px solid ${C.border}`}}>{String(row.old_value??"—")} → {String(row.new_value??"—")}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
