import React,{lazy,Suspense,useEffect,useState} from "react";
import {supabase,db} from "./supabaseClient.js";
import {loadSession,loadSelectedSchool,saveSession,saveSelectedSchool} from "./utils/session.js";

// Keep the public entry lightweight. The full operations workspace, auth UI and
// marketing page are downloaded only when their route is actually needed.
const AppDemo=lazy(()=>import("./AppDemo.jsx"));
const EmailAuthPage=lazy(()=>import("./pages/saas-entry.jsx").then(m=>({default:m.EmailAuthPage})));
const PublicLanding=lazy(()=>import("./pages/public-landing.jsx").then(m=>({default:m.PublicLanding})));

function RouteLoading({label="Loading workspace…"}){
 return <div role="status" aria-live="polite" style={{minHeight:"100vh",background:"#090a0c",color:"#d8dce2",display:"grid",placeItems:"center",fontFamily:"system-ui",fontSize:14}}>{label}</div>;
}
class LazyRouteBoundary extends React.Component{
 constructor(props){super(props);this.state={failed:false};}
 static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(error){console.error("[JD] Route failed to load:",error);}
 render(){
  if(this.state.failed)return <main role="alert" style={{minHeight:"100vh",background:"#090a0c",color:"#f5f5f5",display:"grid",placeItems:"center",padding:24,fontFamily:"system-ui"}}><div style={{maxWidth:420,textAlign:"center"}}><h1 style={{fontSize:22}}>This page couldn’t load</h1><p style={{color:"#a7abb2",lineHeight:1.7}}>Check your connection and reload. Your account data has not been changed.</p><button onClick={()=>window.location.reload()} style={{background:"#fff",color:"#111",border:0,borderRadius:10,padding:"12px 18px",fontWeight:700,cursor:"pointer"}}>Reload page</button></div></main>;
  return this.props.children;
 }
}
function LazyRoute({children,label}){return <LazyRouteBoundary><Suspense fallback={<RouteLoading label={label}/ >}>{children}</Suspense></LazyRouteBoundary>;}

export default function App(){
 const [screen,setScreen]=useState("loading");
 const [authMode,setAuthMode]=useState("signin");
 const [bootError,setBootError]=useState("");
 const isApply=typeof window!=="undefined"&&window.location.pathname.startsWith("/apply/");
 const activate=async({user:authUser,profile,school})=>{
  if(!authUser?.id||!profile?.id||!school?.id)throw new Error("Your account is missing a valid workspace association. Please contact your administrator.");
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
  let recoveryMode=typeof window!=="undefined"&&(window.location.hash.includes("type=recovery")||window.location.hash.includes("type=invite")||window.location.search.includes("invite=1"));
  const {data:authListener}=supabase.auth.onAuthStateChange((event)=>{
   if(event==="PASSWORD_RECOVERY"||(event==="SIGNED_IN"&&(window.location.hash.includes("type=invite")||window.location.search.includes("invite=1")))){
    recoveryMode=true;setAuthMode("update");setScreen("auth");
   }
  });
  const boot=async()=>{
   try{
    const {data,error}=await supabase.auth.getSession();
    if(error)throw error;
    if(recoveryMode){setAuthMode("update");setScreen("auth");return}
    if(data.session?.user){
     const p=await supabase.from("profiles").select("*").eq("id",data.session.user.id).maybeSingle();
     if(p.error)throw p.error;
     if(p.data?.school_id){
      const s=await db.getSchool(p.data.school_id);
      if(s.error)throw s.error;
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
 if(screen==="loading")return <RouteLoading label="Loading James-Denning…"/>;
 if(screen==="app"||isApply)return <LazyRoute label="Opening your workspace…"><AppDemo/></LazyRoute>;
 if(screen==="legacy")return <LazyRoute label="Opening school portal…"><AppDemo/></LazyRoute>;
 if(screen==="auth")return <LazyRoute label="Loading secure account access…"><EmailAuthPage key={authMode} mode={authMode} onBack={()=>setScreen("landing")} onAuthenticated={onAuthenticated} onLegacy={()=>setScreen("legacy")}/></LazyRoute>;
 return <><LazyRoute label="Loading James-Denning…"><PublicLanding onSignIn={()=>{setAuthMode("signin");setScreen("auth")}} onGetStarted={()=>{setAuthMode("signup");setScreen("auth")}}/></LazyRoute>{bootError&&<div role="status" style={{position:"fixed",bottom:12,left:12,right:12,background:"#351b1b",color:"#ffb3b3",padding:10,borderRadius:8,fontSize:12}}>{bootError}</div>}</>;
}
