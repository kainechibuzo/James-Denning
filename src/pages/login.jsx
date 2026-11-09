/**
 * Login domain: SchoolManagerModal, LoginPage
 */
import React, { useState, useEffect, useContext } from "react";
import {
  ArrowLeft, DollarSign, FileText, KeyRound, LayoutDashboard, Lock,
  School, Settings, Shield, User, X,
} from "lucide-react";
import { db } from "../supabaseClient.js";
import { C } from "../config/theme.js";
import { SectionCtx } from "../contexts/section.jsx";
import { useDark } from "../contexts/dark.jsx";
import { Logo, Toast, AppIcon, Btn, Inp, Modal, Spinner } from "../components/ui.jsx";

export function SchoolManagerModal({school, onClose, onSaved}){
  const {dark}=useDark();
  // Password gate
  const [gatePass,setGatePass]=useState("");
  const [gateErr,setGateErr]=useState("");
  const [unlocked,setUnlocked]=useState(false);
  // Form state
  const [form,setForm]=useState({
    name: school?.name||"",
    address: school?.address||"",
    phone: school?.phone||"",
    student_id_prefix: school?.student_id_prefix||"SCH",
    settings_password: school?.settings_password||"",
    admin_email: school?.admin_email||"",
    admin_name: school?.admin_name||"",
    admin_password: "",
  });
  const [logoPreview,setLogoPreview]=useState(school?.logo||null);
  const [logoBase64,setLogoBase64]=useState(null);
  const [saving,setSaving]=useState(false);
  const [saveErr,setSaveErr]=useState("");

  const tryUnlock=()=>{
    if(school?.settings_password && gatePass===school.settings_password) setUnlocked(true);
    else setGateErr("Incorrect password");
  };
  const handleLogoFile=(e)=>{
    const file=e.target.files?.[0]; if(!file)return;
    const reader=new FileReader();
    reader.onload=(ev)=>{ setLogoPreview(ev.target.result); setLogoBase64(ev.target.result); };
    reader.readAsDataURL(file);
  };
  const save=async()=>{
    if(!form.name.trim()){setSaveErr("Organization name is required");return;}
    setSaving(true); setSaveErr("");
    const fields={
      name: form.name.trim(),
      address: form.address.trim()||null,
      phone: form.phone.trim()||null,
      student_id_prefix: (form.student_id_prefix||"SCH").toUpperCase().trim(),
    };
    if(form.settings_password.trim()) fields.settings_password=form.settings_password.trim();
    if(logoBase64) fields.logo=logoBase64;
    if(form.admin_email.trim()) fields.admin_email=form.admin_email.trim();
    if(form.admin_name.trim()) fields.admin_name=form.admin_name.trim();
    if(form.admin_password.trim()) fields.admin_password=form.admin_password.trim();
    const {data,error}=await db.updateSchool(school.id, fields);
    setSaving(false);
    if(error){setSaveErr(error.message||"Save failed");return;}
    const updated={...school,...fields,logo:logoBase64||school?.logo};
    onSaved(updated);
    onClose();
  };
  const inp=(label,key,opts={})=>(
    <div style={{marginBottom:14}}>
      <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,
        textTransform:"uppercase",letterSpacing:.7,marginBottom:5}}>{label}</label>
      <input type={opts.type||"text"} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))}
        placeholder={opts.placeholder||""}
        style={{width:"100%",padding:"10px 12px",border:`1.5px solid ${C.border}`,borderRadius:9,
          fontSize:13,background:C.white,color:C.text,outline:"none",boxSizing:"border-box"}}/>
      {opts.hint&&<div style={{fontSize:11,color:C.light,marginTop:4}}>{opts.hint}</div>}
    </div>
  );

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:9999,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:C.card,borderRadius:20,width:"100%",maxWidth:480,
        maxHeight:"90vh",overflow:"hidden",display:"flex",flexDirection:"column",
        boxShadow:"0 32px 80px rgba(0,0,0,.4)"}}>
        {/* Header */}
        <div style={{padding:"20px 24px",borderBottom:`1px solid ${C.border}`,
          display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
          <div style={{fontWeight:800,fontSize:16,color:C.text}}>Organization Settings</div>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",
            color:C.muted,display:"flex",alignItems:"center"}}><X size={20}/></button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"20px 24px"}}>
          {!unlocked ? (
            <div>
              <div style={{textAlign:"center",marginBottom:20}}>
                <Lock size={36} color={C.muted} style={{display:"block",margin:"0 auto 10px"}}/>
                <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:4}}>Enter Settings Password</div>
                <div style={{fontSize:12,color:C.muted}}>This password protects organization settings</div>
              </div>
              <input type="password" value={gatePass} onChange={e=>{setGatePass(e.target.value);setGateErr("");}}
                onKeyDown={e=>e.key==="Enter"&&tryUnlock()}
                placeholder="Settings password"
                style={{width:"100%",padding:"11px 14px",border:`1.5px solid ${gateErr?C.red:C.border}`,
                  borderRadius:10,fontSize:14,background:C.white,color:C.text,outline:"none",
                  boxSizing:"border-box",marginBottom:8}}/>
              {gateErr&&<div style={{color:C.red,fontSize:12,marginBottom:8}}>{gateErr}</div>}
              <button onClick={tryUnlock}
                style={{width:"100%",background:`linear-gradient(135deg,#1A4FA0,#2563eb)`,
                  color:"#fff",border:"none",padding:"11px",borderRadius:10,fontSize:14,
                  fontWeight:700,cursor:"pointer"}}>Unlock</button>
            </div>
          ) : (
            <div>
              {/* Logo */}
              <div style={{marginBottom:16,textAlign:"center"}}>
                <div style={{marginBottom:8,fontSize:11,fontWeight:700,color:C.muted,
                  textTransform:"uppercase",letterSpacing:.7}}>Organization Logo</div>
                {logoPreview
                  ? <img src={logoPreview} alt="logo" style={{width:72,height:72,objectFit:"contain",
                      borderRadius:12,border:`1px solid ${C.border}`,background:C.offWhite,display:"block",margin:"0 auto 8px"}}/>
                  : <div style={{width:72,height:72,borderRadius:12,border:`1.5px dashed ${C.border}`,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      margin:"0 auto 8px",background:C.offWhite}}>
                      <School size={28} color={C.muted}/>
                    </div>
                }
                <label style={{cursor:"pointer",fontSize:12,color:C.blue,fontWeight:600}}>
                  {logoPreview?"Change logo":"Upload logo"}
                  <input type="file" accept="image/*" style={{display:"none"}} onChange={handleLogoFile}/>
                </label>
              </div>
              {inp("Business Name","name",{placeholder:"e.g. Your Business Name"})}
              {inp("Address","address",{placeholder:"e.g. 12 Organization Road, Lagos"})}
              {inp("Phone","phone",{placeholder:"e.g. +2348000000000"})}
              {inp("Member ID Prefix","student_id_prefix",{placeholder:"e.g. JD, ACM",hint:"Used for new member IDs e.g. JD/001"})}
              <hr style={{border:"none",borderTop:`1px solid ${C.border}`,margin:"16px 0"}}/>
              <div style={{fontSize:12,fontWeight:700,color:C.muted,textTransform:"uppercase",
                letterSpacing:.7,marginBottom:10}}>Admin Login</div>
              {inp("Admin Email","admin_email",{type:"email",placeholder:"admin@yourbusiness.com"})}
              {inp("Admin Name","admin_name",{placeholder:"e.g. Business Administrator"})}
              {inp("New Admin Password","admin_password",{type:"password",placeholder:"Leave blank to keep current"})}
              <hr style={{border:"none",borderTop:`1px solid ${C.border}`,margin:"16px 0"}}/>
              <div style={{fontSize:12,fontWeight:700,color:C.muted,textTransform:"uppercase",
                letterSpacing:.7,marginBottom:10}}>Security</div>
              {inp("New Settings Password","settings_password",{type:"password",placeholder:"Leave blank to keep current"})}
              {saveErr&&<div style={{color:C.red,fontSize:12,marginBottom:8,fontWeight:600}}>{saveErr}</div>}
            </div>
          )}
        </div>
        {unlocked&&(
          <div style={{padding:"16px 24px",borderTop:`1px solid ${C.border}`,
            display:"flex",gap:10,justifyContent:"flex-end",flexShrink:0}}>
            <button onClick={onClose}
              style={{padding:"9px 18px",borderRadius:9,border:`1.5px solid ${C.border}`,
                background:"none",color:C.muted,fontSize:13,fontWeight:600,cursor:"pointer"}}>
              Cancel
            </button>
            <button onClick={save} disabled={saving}
              style={{padding:"9px 22px",borderRadius:9,border:"none",
                background:`linear-gradient(135deg,#1A4FA0,#2563eb)`,
                color:"#fff",fontSize:13,fontWeight:700,cursor:saving?"not-allowed":"pointer",
                opacity:saving?.7:1}}>
              {saving?"Saving…":"Save Changes"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
export function LoginPage({login,loading,toasts,rmToast,selectedSchool,onChangeSchool,onSchoolUpdated}){
  const ctx=useContext(SectionCtx);
  const {dark,toggle:toggleDark}=useDark();
  const [id,setId]=useState("");
  const [pass,setPass]=useState("");
  const [showPass,setShowPass]=useState(false);
  const [err,setErr]=useState("");
  const [focusId,setFocusId]=useState(false);
  const [showManager,setShowManager]=useState(false);
  const [focusPw,setFocusPw]=useState(false);
  // Single-device kick notice
  const [wasKicked]=useState(()=>{
    try{
      // If the user signed out manually, suppress the "kicked" banner even if
      // a concurrent token-check race set the kicked flag at the same time.
      const manual=sessionStorage.getItem('rgs_manual_logout');
      if(manual){
        sessionStorage.removeItem('rgs_manual_logout');
        sessionStorage.removeItem('rgs_kicked_out');
        return false;
      }
      const v=sessionStorage.getItem('rgs_kicked_out');
      if(v)sessionStorage.removeItem('rgs_kicked_out');
      return!!v;
    }catch{return false;}
  });
  const [showReset,setShowReset]=useState(false);
  const [resetId,setResetId]=useState("");
  const [resetSending,setResetSending]=useState(false);
  const [resetMsg,setResetMsg]=useState("");

  const submitReset=async()=>{
    if(!resetId.trim()){setResetMsg("Enter your Staff ID or Member ID.");return;}
    setResetSending(true);setResetMsg("");
    // Look up user and send temp password
    const schoolId=selectedSchool?.id;
    if(!schoolId){setResetMsg("No organization selected.");setResetSending(false);return;}
    try{
      const[{data:teacher},{data:student}]=await Promise.all([
        db.loginFindTeacher(resetId.trim(),schoolId),
        db.loginFindStudent(resetId.trim(),schoolId),
      ]);
      const target=teacher||student;
      if(!target||!target.email){
        setResetMsg("No account found with that ID, or no email address on file. Contact your organization administrator.");
        setResetSending(false);return;
      }
      // Generate a random 8-char temp password
      const chars="ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
      const tmpPw=Array.from({length:8},()=>chars[Math.floor(Math.random()*chars.length)]).join("");
      // Update password_hash
      const table=teacher?"teachers":"students";
      await db._resetPassword(table,target.id,tmpPw,schoolId);
      // Send email via edge function
      const schoolName=ctx?.schoolName||"Your Organization";
      const role=teacher?"Staff":"Member";
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`,{
        method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`},
        body:JSON.stringify({
          to:target.email,
          subject:`${schoolName} — Password Reset`,
          html:`<p>Hello ${target.full_name||target.first_name||resetId},</p><p>Your temporary password is: <strong style="font-size:18px;letter-spacing:2px">${tmpPw}</strong></p><p>Please sign in with this password and change it immediately from your profile settings.</p><p>${schoolName}</p>`,
        })
      });
      setResetMsg(`✓ A temporary password has been sent to ${target.email.replace(/(.{2}).+(@.+)/,"$1***$2")}.`);
    }catch(e){setResetMsg("Something went wrong. Please contact your organization administrator.");}
    setResetSending(false);
  };
  const submit=async()=>{
    setErr("");
    const e=await login(id,pass);
    if(e) setErr(e);
  };
  const onKey=e=>{ if(e.key==="Enter") submit(); };
  const schoolName=ctx?.schoolName||"Your Organization";
  const [wideScreen,setWideScreen]=useState(()=>window.innerWidth>=768);
  useEffect(()=>{
    const onResize=()=>setWideScreen(window.innerWidth>=768);
    window.addEventListener("resize",onResize);
    return()=>window.removeEventListener("resize",onResize);
  },[]);



  return(
    <div style={{minHeight:"100vh",display:"flex",transition:"background .3s",
      background:"#f8f9fa"}}>

      {/* Left decorative panel — hidden on mobile */}
      {false&&wideScreen&&<div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",
        justifyContent:"center",padding:"48px 32px",position:"relative",overflow:"hidden",
        minWidth:0}}>
        {/* Decorative orbs */}
        <div style={{position:"absolute",width:400,height:400,borderRadius:"50%",
          background:"rgba(255,255,255,.03)",top:-100,left:-100}}/>
        <div style={{position:"absolute",width:300,height:300,borderRadius:"50%",
          background:"rgba(232,86,10,.08)",bottom:-80,right:-60}}/>
        <div style={{position:"absolute",width:200,height:200,borderRadius:"50%",
          background:"rgba(26,140,60,.06)",top:"40%",right:"10%"}}/>
        <div style={{textAlign:"center",position:"relative",zIndex:1}}>
          <Logo size={80}/>
          <div style={{color:"#fff",fontSize:26,fontWeight:900,marginTop:20,letterSpacing:"-.02em",lineHeight:1.2}}>
            {schoolName}
          </div>
          <div style={{color:"rgba(255,255,255,.5)",fontSize:12,marginTop:8,
            textTransform:"uppercase",letterSpacing:2,fontWeight:600}}>
            Business Management Portal
          </div>
          <div style={{marginTop:40,display:"flex",flexDirection:"column",gap:16,maxWidth:280}}>
            {[
              {icon:<LayoutDashboard size={16}/>,text:"Manage members, staff & groups"},
              {icon:<FileText size={16}/>,text:"Results, report cards & transcripts"},
              {icon:<DollarSign size={16}/>,text:"Billing billing, tracking & analytics"},
            ].map(f=>(
              <div key={f.text} style={{display:"flex",alignItems:"center",gap:12,
                background:"rgba(255,255,255,.06)",borderRadius:12,padding:"12px 16px",
                border:"1px solid rgba(255,255,255,.1)"}}>
                <span style={{fontSize:20,flexShrink:0}}>{f.icon}</span>
                <span style={{fontSize:13,color:"rgba(255,255,255,.75)",fontWeight:500,textAlign:"left"}}>{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>}

      {/* Right: Login form */}
      <div style={{width:"100%",maxWidth:440,minHeight:"100vh",margin:"0 auto",display:"flex",alignItems:"center",
        justifyContent:"center",padding:wideScreen?"96px 24px 32px":"88px 16px 28px",position:"relative",boxSizing:"border-box"}}>
        <div style={{width:"100%",background:"#fff",borderRadius:14,boxShadow:"none",
          border:"1px solid #dadce0",overflow:"hidden"}}>

          {/* Top accent bar */}
          <div style={{height:0}}/>

          <div style={{padding:"32px 32px 36px"}}>
            {/* Organization badge row */}
            {selectedSchool&&(
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20,
                padding:"9px 12px",borderRadius:10,background:"#fff",
                border:"1px solid #e8eaed"}}>
                {selectedSchool.logo
                  ? <img src={selectedSchool.logo} alt="" style={{width:28,height:28,objectFit:"contain",borderRadius:6,background:"#fff"}}/>
                  : <School size={18} color={C.blue}/>}
                <span style={{flex:1,fontSize:13,fontWeight:700,color:C.text}}>{selectedSchool.name}</span>
                <button onClick={()=>setShowManager(true)} title="Organization Settings"
                  style={{background:"none",border:"none",cursor:"pointer",color:C.muted,
                    display:"flex",alignItems:"center",padding:4,borderRadius:6}}>
                  <Settings size={15}/>
                </button>
                <button onClick={onChangeSchool} title="Change organization"
                  style={{background:"none",border:`1px solid ${C.border}`,cursor:"pointer",
                    color:C.muted,fontSize:11,fontWeight:600,padding:"3px 8px",borderRadius:6,
                    display:"flex",alignItems:"center",gap:4}}>
                  <ArrowLeft size={11}/> Change
                </button>
              </div>
            )}
            {/* Header */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:28}}>
              <div>
                <div style={{fontSize:23,fontWeight:650,color:"#202124",letterSpacing:"-.035em"}}>Welcome back</div>
                <div style={{fontSize:13,color:"#5f6368",marginTop:5}}>Sign in to your account</div>
              </div>

            </div>

            {/* Kicked-out notice */}
            {wasKicked&&(
              <div style={{background:C.amberPale,border:`1.5px solid ${C.amber}50`,
                borderRadius:10,padding:"12px 14px",marginBottom:16,
                display:"flex",alignItems:"flex-start",gap:10}}>
                <Shield size={16} color={C.amber} style={{flexShrink:0,marginTop:1}}/>
                <div>
                  <div style={{fontWeight:800,fontSize:13,color:C.amber}}>Signed out automatically</div>
                  <div style={{fontSize:12,color:C.muted,marginTop:2,lineHeight:1.5}}>
                    Your account was signed in on another device. Log in again to continue.
                  </div>
                </div>
              </div>
            )}

            {/* Error */}
            {err&&(
              <div style={{background:C.redPale,border:`1.5px solid ${C.red}40`,color:C.red,
                padding:"11px 14px",borderRadius:10,marginBottom:18,fontSize:13,fontWeight:600,
                display:"flex",alignItems:"flex-start",gap:8,animation:"fadeUp .2s ease",lineHeight:1.5}}>

                <span>{err}</span>
              </div>
            )}

            {/* User ID field */}
            <div style={{marginBottom:16}}>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:"#3c4043",
                textTransform:"none",letterSpacing:0,marginBottom:7,transition:"color .15s"}}>
                User ID
              </label>
              <div style={{position:"relative"}}>
                <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",
                  display:"flex",alignItems:"center",pointerEvents:"none",zIndex:1}}>
                  <AppIcon name="user" size={16} color={focusId?C.blue:C.muted}/>
                </span>
                <input value={id} onChange={e=>setId(e.target.value)} onKeyDown={onKey}
                  placeholder="Staff ID · Member ID · admin · PAR/…"
                  onFocus={e=>{setFocusId(true);e.target.style.borderColor=C.blue;e.target.style.boxShadow=`0 0 0 3px ${C.blue}18`;}}
                  onBlur={e=>{setFocusId(false);e.target.style.borderColor=C.border;e.target.style.boxShadow="none";}}
                  style={{display:"block",width:"100%",padding:"12px 14px 12px 40px",
                    border:`1px solid ${focusId?"#5f6368":"#dadce0"}`,borderRadius:8,
                    fontSize:13,background:C.white,color:C.text,outline:"none",
                    boxSizing:"border-box",transition:"border-color .15s,box-shadow .15s"}}/>
              </div>
              <div style={{fontSize:10.5,color:C.light,marginTop:5,lineHeight:1.6}}>
                Staff: Staff ID  ·  Members: Member ID  ·  Admin: <code style={{background:C.offWhite,padding:"1px 5px",borderRadius:4}}>admin</code>
              </div>
            </div>

            {/* Password field */}
            <div style={{marginBottom:22}}>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:"#3c4043",
                textTransform:"uppercase",letterSpacing:.7,marginBottom:6,transition:"color .15s"}}>
                Password
              </label>
              <div style={{position:"relative"}}>
                <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",
                  display:"flex",alignItems:"center",pointerEvents:"none",zIndex:1}}>
                  <AppIcon name="lock" size={16} color={focusPw?C.blue:C.muted}/>
                </span>
                <input type={showPass?"text":"password"} value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={onKey}
                  placeholder="Your password"
                  onFocus={e=>{setFocusPw(true);e.target.style.borderColor=C.blue;e.target.style.boxShadow=`0 0 0 3px ${C.blue}18`;}}
                  onBlur={e=>{setFocusPw(false);e.target.style.borderColor=C.border;e.target.style.boxShadow="none";}}
                  style={{display:"block",width:"100%",padding:"12px 44px 12px 40px",
                    border:`1px solid ${focusPw?"#5f6368":"#dadce0"}`,borderRadius:8,
                    fontSize:13,background:C.white,color:C.text,outline:"none",
                    boxSizing:"border-box",transition:"border-color .15s,box-shadow .15s"}}/>
                <button onClick={()=>setShowPass(p=>!p)} tabIndex={-1}
                  style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",
                    background:"none",border:"none",cursor:"pointer",color:C.muted,
                    display:"flex",alignItems:"center",padding:2}}>
                  <AppIcon name={showPass?"hide":"view"} size={16} color={C.muted}/>
                </button>
              </div>
            </div>

            {/* Sign in button */}
            <button onClick={submit} disabled={loading}
              style={{width:"100%",background:loading?"#9aa0a6":"#202124",
                color:"#fff",border:"none",padding:"13px",borderRadius:8,fontSize:14,fontWeight:600,
                cursor:loading?"not-allowed":"pointer",
                boxShadow:"none",
                display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                transition:"all .2s",letterSpacing:".01em"}}>
              {loading?(
                <><div style={{width:16,height:16,border:"2px solid rgba(255,255,255,.4)",
                  borderTop:"2px solid #fff",borderRadius:"50%",animation:"spin .7s linear infinite"}}/> Signing in…</>
              ):(
                <><span>Sign In</span><span style={{fontSize:16}}>→</span></>
              )}
            </button>
            <div style={{textAlign:"center",marginTop:10}}>
              <button onClick={()=>setShowReset(true)}
                style={{background:"none",border:"none",color:C.blue,fontSize:12,cursor:"pointer",
                  textDecoration:"underline",opacity:.7}}>
                Forgot password?
              </button>
            </div>

          </div>
        </div>

        {/* Toasts */}
        <div style={{position:"fixed",top:16,right:16,zIndex:9999,display:"flex",flexDirection:"column",gap:8}}>
          {toasts.map(t=><Toast key={t.id} t={t} rm={rmToast}/>)}
        </div>
      </div>

      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @media(max-width:640px){.login-left{display:none!important;}}
      `}</style>
      {showManager&&selectedSchool&&(
        <SchoolManagerModal
          school={selectedSchool}
          onClose={()=>setShowManager(false)}
          onSaved={(updated)=>{ onSchoolUpdated&&onSchoolUpdated(updated); setShowManager(false); }}
        />
      )}
      {showReset&&(
        <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,.55)",
          display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:C.white,borderRadius:16,padding:28,maxWidth:420,width:"100%",
            boxShadow:"0 24px 60px rgba(0,0,0,.35)",animation:"modalUp .25s ease"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
              <KeyRound size={20} color={C.blue}/>
              <div style={{fontSize:16,fontWeight:900,color:C.text}}>Reset Password</div>
            </div>
            <div style={{fontSize:12,color:C.muted,marginBottom:16,lineHeight:1.6}}>
              Enter your Staff ID or Member ID. A temporary password will be sent to your registered email address.
            </div>
            <input value={resetId} onChange={e=>setResetId(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&submitReset()}
              placeholder="Enter your ID (e.g. HLDS/01 or TCH-001)"
              style={{width:"100%",padding:"10px 12px",border:`2px solid ${C.border}`,borderRadius:9,
                fontSize:13,marginBottom:12,boxSizing:"border-box",background:C.white,color:C.text}}/>
            {resetMsg&&(
              <div style={{fontSize:12,padding:"8px 12px",borderRadius:8,marginBottom:12,
                background:resetMsg.startsWith("✓")?C.greenPale:C.redPale,
                color:resetMsg.startsWith("✓")?C.green:C.red,
                border:`1px solid ${resetMsg.startsWith("✓")?C.green:C.red}30`}}>
                {resetMsg}
              </div>
            )}
            <div style={{display:"flex",gap:8}}>
              <button onClick={submitReset} disabled={resetSending}
                style={{flex:1,padding:"10px",borderRadius:9,border:"none",
                  background:resetSending?"#CBD5E1":C.blue,color:"#fff",fontWeight:700,
                  fontSize:13,cursor:resetSending?"not-allowed":"pointer"}}>
                {resetSending?"Sending…":"Send Temporary Password"}
              </button>
              <button onClick={()=>{setShowReset(false);setResetMsg("");setResetId("");}}
                style={{padding:"10px 16px",borderRadius:9,border:`1px solid ${C.border}`,
                  background:"none",color:C.muted,fontSize:13,cursor:"pointer"}}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
