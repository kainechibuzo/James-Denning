import React,{lazy,Suspense,useEffect,useState} from "react";
import {supabase,db} from "./supabaseClient.js";
import {workspaceIdentity} from "./auth/workspace-identity.mjs";
import {saveSession,saveSelectedSchool} from "./utils/session.js";

// Keep the public entry lightweight. The full operations workspace, auth UI and
// marketing page are downloaded only when their route is actually needed.
const AppDemo=lazy(()=>import("./AppDemo.jsx"));
const EmailAuthPage=lazy(()=>import("./pages/saas-entry.jsx").then(m=>({default:m.EmailAuthPage})));
const PublicLanding=lazy(()=>import("./pages/public-landing.jsx").then(m=>({default:m.PublicLanding})));
const OAuthConsentPage=lazy(()=>import("./pages/oauth-consent.jsx").then(m=>({default:m.OAuthConsentPage})));

function RouteLoading({label="Loading workspace…"}){
 return <div className="jd-route-state" role="status" aria-live="polite" style={{minHeight:"100vh",background:"var(--jd-canvas)",color:"var(--jd-text)",display:"grid",placeItems:"center",fontFamily:"'JD Inter',system-ui",fontSize:14}}>{label}</div>;
}
class LazyRouteBoundary extends React.Component{
 constructor(props){super(props);this.state={failed:false};}
 static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(error){console.error("[JD] Route failed to load:",error);}
 render(){
  if(this.state.failed)return <main className="jd-route-state" role="alert" style={{minHeight:"100vh",background:"var(--jd-canvas)",color:"var(--jd-text)",display:"grid",placeItems:"center",padding:24,fontFamily:"'JD Inter',system-ui"}}><div style={{maxWidth:420,textAlign:"center"}}><h1 style={{fontSize:22}}>This page couldn’t load</h1><p style={{color:"var(--jd-text)",lineHeight:1.7}}>Check your connection and reload. Your account data has not been changed.</p><button onClick={()=>window.location.reload()} style={{background:"var(--jd-card)",color:"var(--jd-text)",border:0,borderRadius:10,padding:"12px 18px",fontWeight:700,cursor:"pointer"}}>Reload page</button></div></main>;
  return this.props.children;
 }
}
function LazyRoute({children,label}){return <LazyRouteBoundary><Suspense fallback={<RouteLoading label={label}/>}>{children}</Suspense></LazyRouteBoundary>;}

export default function App(){
 const [screen,setScreen]=useState("loading");
 const [authMode,setAuthMode]=useState("signin");
 const [bootError,setBootError]=useState("");
 const isApply=typeof window!=="undefined"&&window.location.pathname.startsWith("/apply/");
 const isOAuthConsent=typeof window!=="undefined"&&window.location.pathname==="/oauth/consent";
 const activate=async({user:authUser,profile,school})=>{
  const user=workspaceIdentity({user:authUser,profile,school});
  db.setSchool(school.id,school.student_id_prefix||"SCH",school.name||""); // legacy column names, see docs/LEGACY_SCHEMA.md
  saveSelectedSchool(school);
  saveSession(user);setScreen(isOAuthConsent?"oauth-consent":"app");
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
     const verified=await supabase.auth.getUser();
     if(verified.error||!verified.data?.user||verified.data.user.id!==data.session.user.id)throw new Error("Your session could not be verified. Sign in again.");
     const p=await supabase.from("profiles").select("*").eq("id",verified.data.user.id).maybeSingle();
     if(p.error)throw p.error;
     if(p.data?.school_id){
      const s=await db.getSchool(p.data.school_id);
      if(s.error)throw s.error;
      if(s.data){await activate({user:verified.data.user,profile:p.data,school:s.data});return}
     }
    }
    setScreen(isOAuthConsent?"auth":"landing");
   }catch(e){if(alive){
    const safeMessages=["Your session could not be verified. Sign in again.","Your account is missing a valid workspace association. Please contact your administrator.","Your account role is missing or unsupported. Please contact your administrator."];
    setBootError(safeMessages.includes(e?.message)?e.message:"Unable to verify your account. Please sign in again.");setScreen(isOAuthConsent?"auth":"landing");
   }}
  };
  boot();
  return()=>{alive=false;authListener.subscription.unsubscribe()};
 },[]);
 const onAuthenticated=payload=>activate(payload);
 if(screen==="loading")return <RouteLoading label="Loading James-Denning…"/>;
 if(screen==="oauth-consent")return <LazyRoute label="Loading secure authorisation…"><OAuthConsentPage/></LazyRoute>;
 if(screen==="app"||isApply)return <LazyRoute label="Opening your workspace…"><AppDemo/></LazyRoute>;
 if(screen==="auth")return <LazyRoute label="Loading secure account access…"><EmailAuthPage key={authMode} mode={authMode} onBack={()=>setScreen("landing")} onAuthenticated={onAuthenticated}/></LazyRoute>;
 return <><LazyRoute label="Loading James-Denning…"><PublicLanding onSignIn={()=>{setAuthMode("signin");setScreen("auth")}} onGetStarted={()=>{setAuthMode("signup");setScreen("auth")}}/></LazyRoute>{bootError&&<div role="status" style={{position:"fixed",bottom:12,left:12,right:12,background:"var(--jd-card)",color:"var(--jd-text)",padding:10,borderRadius:8,fontSize:12}}>{bootError}</div>}</>;
}
