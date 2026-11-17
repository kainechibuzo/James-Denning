import {ReferenceBrand} from "../components/reference-brand.jsx";
import React,{useEffect,useState} from "react";
import {ShieldCheck,Loader2,CheckCircle2,AlertCircle,ArrowLeft} from "lucide-react";
import {supabase} from "../supabaseClient.js";

const panel={width:"min(100% - 32px,520px)",background:"#11151b",border:"1px solid #34353b",borderRadius:18,padding:24,color:"#eef2f7",boxShadow:"0 24px 80px rgba(0,0,0,.35)"};
const button={border:0,borderRadius:10,padding:"11px 16px",fontSize:13,fontWeight:800,cursor:"pointer"};
export function OAuthConsentPage(){
 const authorizationId=new URLSearchParams(window.location.search).get("authorization_id")||"";
 const [details,setDetails]=useState(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{
  let active=true;
  const load=async()=>{
   if(!authorizationId){setError("The authorization request is missing its ID.");setLoading(false);return;}
   const {data:sessionData,error:sessionError}=await supabase.auth.getSession();
   if(sessionError||!sessionData.session){setError("Sign in to James-Denning before approving an MCP connection.");setLoading(false);return;}
   const {data,error:detailsError}=await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
   if(detailsError)throw detailsError;
   if(active)setDetails(data||null);
  };
  load().catch(e=>{if(active)setError(e?.message||"Could not load the authorization request.");}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[authorizationId]);
 const decide=async(approve)=>{
  setBusy(true);setError("");
  try{
   const result=approve
    ?await supabase.auth.oauth.approveAuthorization(authorizationId)
    :await supabase.auth.oauth.denyAuthorization(authorizationId);
   if(result.error)throw result.error;
   const target=result.data?.redirect_url;
   if(!target)throw new Error("The identity provider did not return a redirect URL.");
   window.location.assign(target);
  }catch(e){setError(e?.message||"Could not complete the authorization decision.");setBusy(false);}
 };
 const client=details?.client_name||details?.client?.name||"An MCP client";
 const scopes=String(details?.scope||"").split(/\s+/).filter(Boolean);
 return <main className="jd-consent-shell" style={{minHeight:"100vh",background:"#090a0c",display:"grid",placeItems:"center",padding:16,fontFamily:"'JD Inter',Inter,system-ui,sans-serif"}}>
  <section className="jd-consent-card" style={panel}>
   <ReferenceBrand divided/>
   <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}><div className="jd-consent-icon" style={{width:42,height:42,borderRadius:12,background:"#17191c",display:"grid",placeItems:"center"}}><ShieldCheck size={22}/></div><div><div style={{fontSize:16,fontWeight:900}}>James-Denning access request</div><div style={{fontSize:11,color:"#a3a4ad"}}>Secure MCP authorisation</div></div></div>
   {loading?<div role="status" style={{padding:20,textAlign:"center",color:"#a3a4ad"}}><Loader2 size={20}/> Loading request…</div>:<>
    {error&&<div role="alert" style={{background:"#17191c",border:"1px solid #34353b",borderRadius:10,padding:12,fontSize:12,color:"#dedfe4",marginBottom:14}}><AlertCircle size={14} style={{verticalAlign:"middle",marginRight:6}}/>{error}</div>}
    {details&&<><p style={{fontSize:13,lineHeight:1.7,color:"#dedfe4"}}><strong>{client}</strong> is requesting access to your James-Denning workspace.</p>
     <div style={{border:"1px solid #34353b",borderRadius:10,padding:13,margin:"16px 0"}}>
      <div style={{fontSize:10,fontWeight:900,letterSpacing:".08em",color:"#a3a4ad",marginBottom:8}}>REQUESTED PERMISSIONS</div>
      {scopes.length?scopes.map(scope=><div key={scope} style={{fontSize:12,padding:"5px 0",color:"#dedfe4"}}>• {scope}</div>):<div style={{fontSize:12,color:"#dedfe4"}}>Basic account access requested</div>}
     </div>
     <p style={{fontSize:11,lineHeight:1.6,color:"#a3a4ad"}}>Only approve a client you trust. You can revoke connected app access from your account security settings. JD MCP tools are restricted to your organisation and manager/admin permissions.</p>
     <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:18}}>
      <button disabled={busy} onClick={()=>decide(false)} style={{...button,background:"#17191c",color:"#e5eaf0"}}>Deny</button>
      <button disabled={busy} onClick={()=>decide(true)} style={{...button,background:"#f1f2f5",color:"#10151b"}}>{busy?"Processing…":"Approve access"}</button>
     </div>
    </>}
   </>}
  </section>
 </main>;
}
