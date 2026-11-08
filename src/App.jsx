import React,{useEffect,useState} from "react";
import AppDemo from "./AppDemo.jsx";
import {PublicLanding,EmailAuthPage} from "./pages/saas-entry.jsx";
import {supabase,db} from "./supabaseClient.js";
import {loadSession,loadSelectedSchool,saveSession,saveSelectedSchool} from "./utils/session.js";

export default function App(){
 const [screen,setScreen]=useState("loading");
 const [authMode,setAuthMode]=useState("signin");
 const [bootError,setBootError]=useState("");
 const isApply=typeof window!=="undefined"&&window.location.pathname.startsWith("/apply/");
 const activate=async({user:authUser,profile,school})=>{
  db.setSchool(school.id,school.student_id_prefix||"SCH",school.name||"");
  saveSelectedSchool(school);
  const user={id:profile.id,role:profile.role||"admin",name:profile.full_name||authUser.email,email:authUser.email,school_id:school.id,_authUserId:authUser.id};
  if(["teacher","manager","bursar"].includes(user.role)){
   const t=await supabase.from("teachers").select("*").eq("profile_id",authUser.id).maybeSingle();
   if(t.data){user.staff_id=t.data.staff_id;user.teacher_db_id=t.data.id;user.name=t.data.display_name||t.data.full_name||user.name;user._userType="teacher";}
  }
  if(user.role==="student"){
   const link=await supabase.from("student_profiles").select("student_id").eq("profile_id",authUser.id).maybeSingle();
   if(link.data){const st=await supabase.from("students").select("*").eq("id",link.data.student_id).maybeSingle();if(st.data){user.student_id=st.data.id;user.class_id=st.data.class_id;user.name=st.data.display_name||st.data.name||user.name;user._userType="student";}}
  }
  saveSession(user);setScreen("app");
 };
 useEffect(()=>{
  if(isApply){setScreen("app");return}
  let alive=true;
  const {data:authListener}=supabase.auth.onAuthStateChange((event)=>{if(event==="PASSWORD_RECOVERY"){setAuthMode("update");setScreen("auth");}});
  const boot=async()=>{
   try{
    const {data}=await supabase.auth.getSession();
    if(data.session?.user){
     const p=await supabase.from("profiles").select("*").eq("id",data.session.user.id).maybeSingle();
     if(p.data?.school_id){
      const s=await db.getSchool(p.data.school_id);
      if(s.data){await activate({user:data.session.user,profile:p.data,school:s.data});return}
     }
    }
    const legacy=loadSession(),school=loadSelectedSchool();
    if(legacy&&school){db.setSchool(school.id,school.student_id_prefix||"SCH",school.name||"");setScreen("app");return}
    setScreen("landing");
   }catch(e){if(alive){setBootError(e?.message||"Unable to load account.");setScreen("landing")}}
  };
  boot();
  return()=>{alive=false;authListener.subscription.unsubscribe()};
 },[]);
 const onAuthenticated=payload=>activate(payload);
 if(screen==="loading")return <div style={{minHeight:"100vh",background:"#090a0c",color:"#d8b36a",display:"grid",placeItems:"center",fontFamily:"system-ui"}}>Loading James-Denning…</div>;
 if(screen==="app"||isApply)return <AppDemo/>;
 if(screen==="legacy")return <AppDemo/>;
 if(screen==="auth")return <EmailAuthPage mode={authMode} onBack={()=>setScreen("landing")} onAuthenticated={onAuthenticated} onLegacy={()=>setScreen("legacy")}/>;
 return <><PublicLanding onSignIn={()=>{setAuthMode("signin");setScreen("auth")}} onGetStarted={()=>{setAuthMode("signup");setScreen("auth")}}/>{bootError&&<div role="status" style={{position:"fixed",bottom:12,left:12,right:12,background:"#351b1b",color:"#ffb3b3",padding:10,borderRadius:8,fontSize:12}}>{bootError}</div>}</>;
}
