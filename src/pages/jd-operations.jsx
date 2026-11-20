import {BusinessFoundation} from "../software-factory/BusinessFoundation.jsx";
import {SaaSAgentStudio} from "../software-factory/SaaSAgentStudio.jsx";
import React,{useCallback,useEffect,useMemo,useState} from "react";
import {supabase} from "../supabaseClient.js";
import {JDTaskQueue} from "./jd-task-queue.jsx";
import {JDExecutionMonitor} from "../chat/JDExecutionMonitor.jsx";
import {canOpenOperations,canAdministerOperations} from "../config/workspace-navigation.mjs";
import {Activity,Building2,BriefcaseBusiness,CheckCircle2,Clock3,Loader2,Plus,RefreshCw,ShieldCheck,Users,Workflow,AlertCircle} from "lucide-react";
import {JDWorkflowStudio} from "./jd-workflow-studio.jsx";
import {JDRecurringSchedules} from "./jd-recurring-schedules.jsx";
import {JDDepartmentCollaboration} from "./jd-department-collaboration.jsx";
import {JDBusinessPlatform} from "./jd-business-platform.jsx";
import {Figure, PageHeader} from "../components/page-furniture.jsx";

const styles={
 page:{maxWidth:1180,margin:"0 auto",padding:"26px 22px 48px",color:"var(--jd-ink, #22252b)",fontFamily:"var(--jd-font-display, 'JD Caslon Text', Georgia, serif)"},
 tabs:{display:"flex",gap:4,flexWrap:"wrap",borderBottom:"1px solid var(--jd-hairline, rgba(34,37,43,.16))",paddingBottom:10,marginBottom:22},
 muted:{color:"var(--jd-muted,#60616b)"},
 card:{background:"var(--jd-card,#fff)",border:"1px solid var(--jd-border,#e7e9ed)",borderRadius:16,padding:18},
 input:{width:"100%",border:"1px solid var(--jd-border,#dfe2e7)",borderRadius:9,padding:"10px 12px",fontSize:13,background:"var(--jd-input,#fff)",color:"inherit"},
 button:{border:0,borderRadius:9,padding:"10px 14px",background:"var(--jd-text)",color:"var(--jd-card)",fontWeight:700,fontSize:12,cursor:"pointer"},
 secondary:{border:"1px solid var(--jd-border,#dfe2e7)",borderRadius:9,padding:"9px 12px",background:"transparent",color:"inherit",fontWeight:650,fontSize:12,cursor:"pointer"}
};
const tabs=[["overview","Overview"],["saas-agents","SaaS Agents"],["foundation","Business Builder"],["workflow","Workflow Studio"],["recurring","Recurring & Assignment"],["collaboration","Collaboration"],["business","Business Platform"],["organisation","Organisation"],["tasks","Operations"],["hiring","Hiring"],["capabilities","Capabilities"],["runs","JD Runs"],["intelligence","Intelligence"]];
const defaultBlueprint={name:"",industry:"",businessModel:"",departments:[{name:"Operations",purpose:"Deliver the core service",roles:["Operations Manager"],workflows:["Daily operations"],kpis:["On-time delivery"]}],integrations:[],risks:[],gaps:[]};
const defaultVacancy={title:"",department:"",description:"",requirements:[]};
function Stat({label,value,icon:Icon}){return <div style={styles.card}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{...styles.muted,fontSize:12}}>{label}</span><Icon size={17} color="var(--jd-muted)"/></div><div style={{fontSize:27,fontWeight:800,marginTop:12,fontVariantNumeric:"tabular-nums"}}>{value}</div></div>}
function Field({label,value,onChange,placeholder,multiline=false}){const Tag=multiline?"textarea":"input";return <label style={{display:"grid",gap:6,fontSize:12,fontWeight:650}}>{label}<Tag value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder||""} rows={multiline?4:undefined} style={{...styles.input,resize:multiline?"vertical":undefined}}/></label>}
export function JDOperationsPage({ctx,client=supabase}){
 const [tab,setTab]=useState("overview"),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [capabilities,setCapabilities]=useState([]),[blueprints,setBlueprints]=useState([]),[tasks,setTasks]=useState([]),[requisitions,setRequisitions]=useState([]),[candidates,setCandidates]=useState([]),[team,setTeam]=useState([]),[intelligence,setIntelligence]=useState(null);
 const [blueprint,setBlueprint]=useState(defaultBlueprint),[vacancy,setVacancy]=useState(defaultVacancy),[candidate,setCandidate]=useState({requisitionId:"",fullName:"",email:""});
 const [preview,setPreview]=useState(null);
 const [taskQueueOpened,setTaskQueueOpened]=useState(false),[executionOpened,setExecutionOpened]=useState(false);
 useEffect(()=>{if(tab==="tasks")setTaskQueueOpened(true);if(tab==="runs")setExecutionOpened(true);},[tab]);
 const isAdmin=canAdministerOperations(ctx?.role),canManage=canOpenOperations(ctx?.role);
 const invoke=useCallback(async(action,extra={})=>{
  let response;
  try{response=await client.functions.invoke("jd-automation",{body:{action,...extra}});}
  catch{throw new Error("JD could not confirm this request. Refresh records before another action.");}
  const {data,error}=response||{};
  if(error||data?.error||!data||typeof data!=="object"||Array.isArray(data)) throw new Error("JD could not confirm this request. Refresh records before another action.");
  return data;
 },[client]);
 const refresh=useCallback(async()=>{
  if(!canManage){setLoading(false);return;}
  setLoading(true);setError("");
  try{
   const [op,teamResult,insight]=await Promise.all([invoke("operations.task.list"),invoke("operations.team.list"),invoke("intelligence.snapshot")]);
   if(!Array.isArray(op.tasks)||!Array.isArray(teamResult.members))throw new Error("Operational records are incomplete. Refresh before making changes.");
   setTasks(op.tasks);setTeam(teamResult.members);setIntelligence(insight);
   if(isAdmin){
    const [cap,bp,hi]=await Promise.all([invoke("capabilities.report"),invoke("organisation.blueprints.list"),invoke("hiring.pipeline.list")]);
    setCapabilities(cap.capabilities||[]);setBlueprints(bp.blueprints||[]);setRequisitions(hi.requisitions||[]);setCandidates(hi.candidates||[]);
   }else{setCapabilities([]);setBlueprints([]);setRequisitions([]);setCandidates([]);}
  }catch(e){setError(e.message||"Could not load JD operational data");}
  finally{setLoading(false);}
 },[invoke,isAdmin,canManage]);
 useEffect(()=>{refresh();},[refresh]);
 const counts=useMemo(()=>({tasks:tasks.length,open:tasks.filter(t=>!["completed","cancelled"].includes(t.status)).length,roles:requisitions.length,candidates:candidates.length}),[tasks,requisitions,candidates]);
 const act=async(fn,success)=>{
  setBusy(true);setError("");setNotice("");
  try{await fn();setNotice(success);await refresh();}
  catch(e){setError(e.message||"Action failed");}
  finally{setBusy(false);}
 };
 const updateBlueprint=(key,value)=>setBlueprint(b=>({...b,[key]:value}));
 const updateDepartment=(index,key,value)=>setBlueprint(b=>({...b,departments:b.departments.map((d,i)=>i===index?{...d,[key]:value}:d)}));
 const addDepartment=()=>setBlueprint(b=>({...b,departments:[...b.departments,{name:"",purpose:"",roles:[],workflows:[],kpis:[]}]}));
 const removeDepartment=index=>setBlueprint(b=>({...b,departments:b.departments.length>1?b.departments.filter((_,i)=>i!==index):b.departments}));
 const submitBlueprint=()=>act(async()=>{
  const result=await invoke("organisation.blueprint.preview",{blueprint});
  setPreview(result.blueprint);
  await invoke("organisation.blueprint.submit",{blueprint:result.blueprint});
  setBlueprint(defaultBlueprint);
 },"Organisation blueprint saved as a draft for review.");
 const createVacancy=()=>act(async()=>{
  await invoke("hiring.vacancy.draft",{vacancy});
  setVacancy(defaultVacancy);
 },"Vacancy draft saved. It has not been published.");
 const approveVacancy=id=>act(()=>invoke("hiring.vacancy.approve",{vacancyId:id}),"Vacancy opened for internal candidate intake.");
 const createCandidate=()=>act(async()=>{
  if(!candidate.requisitionId||!candidate.fullName.trim())throw new Error("Choose an open vacancy and enter the candidate name.");
  await invoke("hiring.candidate.create",{requisitionId:candidate.requisitionId,fullName:candidate.fullName,email:candidate.email});
  setCandidate({requisitionId:"",fullName:"",email:""});
 },"Candidate added to the recruitment pipeline.");
 const changeCandidate=(candidateId,stage)=>act(()=>invoke("hiring.candidate.transition",{candidateId,stage}),"Candidate stage updated.");
 const statusColor=s=>s==="completed"||s==="deployed"?"var(--jd-text-soft)":s==="failed"||s==="missing"?"var(--jd-text-soft)":s==="running"||s==="in_progress"?"var(--jd-muted)":"var(--jd-muted)";
 const candidateNextStages={applied:["screening","rejected","withdrawn"],screening:["interview","rejected","withdrawn"],interview:["assessment","offer","rejected","withdrawn"],assessment:["offer","rejected","withdrawn"],offer:["hired","rejected","withdrawn"],hired:[],rejected:[],withdrawn:[]};
 if(!canManage)return <p role="alert">Your role cannot open Business operations.</p>;
 return <div className="jd-operations-page" style={styles.page}>
  <header className="jd-page-header">
   <div className="jd-page-header-main">
    <div className="jd-eyebrow">James-Denning · Operations</div>
    <h1 className="jd-page-title">Business operations</h1>
    <span className="jd-rule" aria-hidden="true"><i/><i/><i/></span>
    <p className="jd-page-lede">Plan the organisation, coordinate work and manage hiring from one workspace.</p>
   </div>
   <div className="jd-page-header-actions"><button style={styles.secondary} onClick={refresh} disabled={loading}><RefreshCw size={14} style={{verticalAlign:"-2px",marginRight:6}}/>Refresh data</button></div>
  </header>
  <nav className="jd-page-tabs" style={styles.tabs}>{tabs.filter(([id])=>isAdmin||!["organisation","hiring","capabilities","saas-agents","foundation"].includes(id)).map(([id,label])=><button key={id} onClick={()=>setTab(id)} style={{...styles.secondary,background:tab===id?"var(--jd-text)":"transparent",color:tab===id?"var(--jd-card)":"inherit",borderColor:tab===id?"var(--jd-text)":"var(--jd-border,#e7e9ed)"}}>{label}</button>)}</nav>
  {error&&<div role="alert" style={{padding:12,borderRadius:10,background:"var(--jd-soft)",color:"var(--jd-text-soft)",fontSize:12,marginBottom:14}}><AlertCircle size={14} style={{verticalAlign:"-3px",marginRight:6}}/>{error}</div>}
  {notice&&<div role="status" style={{padding:12,borderRadius:10,background:"var(--jd-soft)",color:"var(--jd-text-soft)",fontSize:12,marginBottom:14}}><CheckCircle2 size={14} style={{verticalAlign:"-3px",marginRight:6}}/>{notice}</div>}
  {(tab==="tasks"||taskQueueOpened)&&<div hidden={tab!=="tasks"}><JDTaskQueue client={client} active={tab==="tasks"} onTasksChanged={setTasks} role={ctx?.role} schoolId={ctx?.selectedSchool?.id||ctx?.user?.school_id} actorId={ctx?.user?._authUserId||ctx?.user?.id}/></div>}
  {(tab==="runs"||executionOpened)&&<div hidden={tab!=="runs"}><JDExecutionMonitor client={client} role={ctx?.role} scopeKey={JSON.stringify([ctx?.selectedSchool?.id||ctx?.user?.school_id,ctx?.user?._authUserId||ctx?.user?.id])} active={tab==="runs"}/></div>}
  {loading&&tab!=="tasks"&&tab!=="runs"&&tab!=="saas-agents"&&tab!=="foundation"?<div style={{padding:60,textAlign:"center",...styles.muted}}><Loader2 size={22} className="jd-spin"/> Loading live workspace data…</div>:<>
   {tab==="workflow"&&<JDWorkflowStudio invoke={invoke} isAdmin={isAdmin} canManage={canManage}/>}
   {tab==="collaboration"&&<JDDepartmentCollaboration tasks={tasks} team={team}/>}
   {tab==="business"&&<JDBusinessPlatform/>}
   {tab==="overview"&&<><div className="jd-figure-row"><Figure label="Operational tasks" value={counts.tasks} note="Recorded in the workspace"/><Figure label="Open tasks" value={counts.open} note="Not completed or cancelled"/><Figure label="Vacancy drafts" value={counts.roles} note="Not published"/><Figure label="Candidates" value={counts.candidates} note="In the recruitment pipeline"/></div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:14}}><section style={styles.card}><h3 style={{fontSize:15,marginBottom:8}}>Organisation blueprints</h3><p style={{fontSize:12,...styles.muted,marginBottom:12}}>Saved structures awaiting review or provisioning.</p>{blueprints.length?blueprints.slice(0,5).map(b=><div key={b.id} style={{padding:"10px 0",borderTop:"1px solid var(--jd-border,#eee)"}}><b style={{fontSize:13}}>{b.title}</b><span style={{float:"right",fontSize:11,...styles.muted}}>{b.status}</span><div style={{fontSize:11,...styles.muted}}>{b.industry}</div></div>):<p style={{fontSize:12,...styles.muted}}>No blueprints saved yet.</p>}</section><section style={styles.card}><h3 style={{fontSize:15,marginBottom:8}}>Recent operational work</h3>{tasks.slice(0,6).map(t=><div key={t.id} style={{display:"flex",justifyContent:"space-between",gap:8,padding:"10px 0",borderTop:"1px solid var(--jd-border,#eee)"}}><div><b style={{fontSize:12}}>{t.title}</b><div style={{fontSize:11,...styles.muted}}>{t.department||"Unassigned department"}</div></div><span style={{fontSize:11,color:statusColor(t.status)}}>{t.status.replace("_"," ")}</span></div>)}{!tasks.length&&<p style={{fontSize:12,...styles.muted}}>No tasks yet.</p>}</section></div></>}
   {tab==="organisation"&&<div className="jd-two-pane" style={{display:"grid",gridTemplateColumns:"minmax(280px,1fr) minmax(280px,1fr)",gap:14}}><section style={styles.card}><h2 style={{fontSize:17,marginBottom:14}}>Build an organisation blueprint</h2><div style={{display:"grid",gap:12}}><Field label="Business name" value={blueprint.name} onChange={v=>updateBlueprint("name",v)}/><Field label="Industry" value={blueprint.industry} onChange={v=>updateBlueprint("industry",v)} placeholder="e.g. Logistics"/><Field label="Business model" value={blueprint.businessModel} onChange={v=>updateBlueprint("businessModel",v)} multiline/><div style={{display:"grid",gap:12}}>{blueprint.departments.map((d,index)=><div key={index} style={{border:"1px solid var(--jd-border,#eee)",borderRadius:11,padding:12,display:"grid",gap:9}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><b style={{fontSize:12}}>Department {index+1}</b>{blueprint.departments.length>1&&<button type="button" style={styles.secondary} onClick={()=>removeDepartment(index)}>Remove</button>}</div><Field label="Department name" value={d.name} onChange={v=>updateDepartment(index,"name",v)}/><Field label="Purpose" value={d.purpose} onChange={v=>updateDepartment(index,"purpose",v)} multiline/><Field label="Roles (comma separated)" value={d.roles.join(", ")} onChange={v=>updateDepartment(index,"roles",v.split(",").map(x=>x.trim()).filter(Boolean))}/><Field label="Workflows (comma separated)" value={d.workflows.join(", ")} onChange={v=>updateDepartment(index,"workflows",v.split(",").map(x=>x.trim()).filter(Boolean))}/><Field label="KPIs (comma separated)" value={d.kpis.join(", ")} onChange={v=>updateDepartment(index,"kpis",v.split(",").map(x=>x.trim()).filter(Boolean))}/></div>)}<button type="button" style={styles.secondary} onClick={addDepartment}>+ Add department</button></div><button style={styles.button} disabled={busy||!isAdmin} onClick={submitBlueprint}>{busy?"Saving…":"Validate & save draft"}</button>{!isAdmin&&<small style={styles.muted}>Administrator access required.</small>}</div></section><section style={styles.card}><h3 style={{fontSize:15,marginBottom:10}}>Saved blueprints</h3>{blueprints.map(b=><div key={b.id} style={{padding:"12px 0",borderTop:"1px solid var(--jd-border,#eee)"}}><b>{b.title}</b><div style={{fontSize:12,...styles.muted}}>{b.industry} · {b.status}</div><pre style={{whiteSpace:"pre-wrap",fontSize:10,...styles.muted,marginTop:8}}>{JSON.stringify(b.blueprint_json?.departments||[],null,2)}</pre></div>)}{!blueprints.length&&<p style={{fontSize:12,...styles.muted}}>No saved blueprints.</p>}{preview&&<p style={{fontSize:11,color:"var(--jd-text-soft)",marginTop:12}}>Latest preview validated. Saving does not provision departments or create staff accounts.</p>}</section></div>}
   {tab==="hiring"&&<div className="jd-two-pane" style={{display:"grid",gridTemplateColumns:"minmax(280px,1fr) minmax(280px,1fr)",gap:14}}><section style={styles.card}><h2 style={{fontSize:16,marginBottom:12}}>Create vacancy draft</h2><div style={{display:"grid",gap:11}}><Field label="Role title" value={vacancy.title} onChange={v=>setVacancy(x=>({...x,title:v}))}/><Field label="Department" value={vacancy.department} onChange={v=>setVacancy(x=>({...x,department:v}))}/><Field label="Description" value={vacancy.description} onChange={v=>setVacancy(x=>({...x,description:v}))} multiline/><Field label="Requirements (comma separated)" value={vacancy.requirements.join(", ")} onChange={v=>setVacancy(x=>({...x,requirements:v.split(",").map(y=>y.trim()).filter(Boolean)}))}/><button style={styles.button} disabled={busy||!isAdmin} onClick={createVacancy}>Save vacancy draft</button><small style={styles.muted}>Drafts are not published and do not contact applicants.</small></div></section><section style={styles.card}><h2 style={{fontSize:16,marginBottom:12}}>Vacancies & recruitment pipeline</h2>{requisitions.map(r=><div key={r.id} style={{padding:"12px 0",borderTop:"1px solid var(--jd-border,#eee)",display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}><div><b style={{fontSize:13}}>{r.title}</b><div style={{fontSize:11,...styles.muted}}>{r.department} · {r.status}</div></div>{r.status!=="open"&&isAdmin&&<button style={styles.secondary} disabled={busy} onClick={()=>approveVacancy(r.id)}>Approve internally</button>}</div>)}{!requisitions.length&&<p style={{fontSize:12,...styles.muted}}>No vacancy drafts.</p>}<div style={{borderTop:"1px solid var(--jd-border,#eee)",paddingTop:14,marginTop:10,display:"grid",gap:9}}><b style={{fontSize:13}}>Register candidate</b><label style={{fontSize:12,fontWeight:650}}>Open vacancy<select style={styles.input} value={candidate.requisitionId} onChange={e=>setCandidate(x=>({...x,requisitionId:e.target.value}))}><option value="">Choose vacancy</option>{requisitions.filter(r=>r.status==="open").map(r=><option key={r.id} value={r.id}>{r.title}</option>)}</select></label><Field label="Candidate name" value={candidate.fullName} onChange={v=>setCandidate(x=>({...x,fullName:v}))}/><Field label="Candidate email (optional)" value={candidate.email} onChange={v=>setCandidate(x=>({...x,email:v}))}/><button style={styles.button} disabled={busy||!isAdmin||!candidate.requisitionId||!candidate.fullName.trim()} onClick={createCandidate}>Add candidate</button></div>{candidates.map(c=><div key={c.id} style={{padding:"10px 0",borderTop:"1px solid var(--jd-border,#eee)",display:"flex",justifyContent:"space-between",gap:8}}><div><b style={{fontSize:12}}>{c.full_name}</b><div style={{fontSize:11,...styles.muted}}>{requisitions.find(r=>r.id===c.requisition_id)?.title||"Vacancy"} · {c.stage}</div></div><select aria-label={"Change stage for "+c.full_name} value={c.stage} onChange={e=>changeCandidate(c.id,e.target.value)} style={{...styles.input,width:145}}>{[c.stage,...(candidateNextStages[c.stage]||[])].map(s=><option key={s}>{s}</option>)}</select></div>)}</section></div>}
   {tab==="foundation"&&<BusinessFoundation client={client} role={ctx?.role} scopeKey={`${ctx?.user?._authUserId||ctx?.user?.id||""}:${ctx?.selectedSchool?.id||ctx?.user?.school_id||""}`}/>}
   {tab==="saas-agents"&&<SaaSAgentStudio client={client} role={ctx?.role} scopeKey={`${ctx?.user?._authUserId||ctx?.user?.id||""}:${ctx?.selectedSchool?.id||ctx?.user?.school_id||""}`}/>}
   {tab==="intelligence"&&intelligence&&<><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:12,marginBottom:14}}><Stat label="Workspace members" value={intelligence.people?.total_members??"—"} icon={Users}/><Stat label="Total billed" value={"₦"+Number(intelligence.finance?.total_billed||0).toLocaleString()} icon={BriefcaseBusiness}/><Stat label="Outstanding" value={"₦"+Number(intelligence.finance?.outstanding||0).toLocaleString()} icon={Activity}/><Stat label="Performance average" value={intelligence.performance?.available?intelligence.performance.average+"%":"—"} icon={CheckCircle2}/></div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:14}}><section style={styles.card}><h2 style={{fontSize:15,marginBottom:10}}>People by role</h2>{Object.entries(intelligence.people?.roles||{}).map(([role,count])=><div key={role} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderTop:"1px solid var(--jd-border,#eee)",fontSize:12}}><span>{role}</span><b>{count}</b></div>)}</section><section style={styles.card}><h2 style={{fontSize:15,marginBottom:10}}>Finance snapshot</h2>{[["Paid",intelligence.finance?.total_paid],["Outstanding",intelligence.finance?.outstanding],["Bills",intelligence.finance?.bill_count]].map(([label,value])=><div key={label} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderTop:"1px solid var(--jd-border,#eee)",fontSize:12}}><span>{label}</span><b>{label==="Bills"?value:"₦"+Number(value||0).toLocaleString()}</b></div>)}</section><section style={styles.card}><h2 style={{fontSize:15,marginBottom:10}}>Performance</h2>{intelligence.performance?.available?<><p style={{fontSize:11,...styles.muted}}>{intelligence.performance.session} · {intelligence.performance.term} · {intelligence.performance.count} scores</p><div style={{fontSize:25,fontWeight:800,margin:"10px 0"}}>{intelligence.performance.average}% average</div><div style={{fontSize:12}}>Pass rate: <b>{intelligence.performance.passRate}%</b></div><div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}>{Object.entries(intelligence.performance.gradeDistribution||{}).map(([grade,count])=><span key={grade} style={{fontSize:11,padding:"5px 8px",borderRadius:7,background:"var(--jd-chip,#f2f3f5)"}}>{grade}: {count}</span>)}</div></>:<p style={{fontSize:12,...styles.muted}}>{intelligence.performance?.reason||"No performance data available."}</p>}</section><section style={styles.card}><h2 style={{fontSize:15,marginBottom:10}}>Operations & communications</h2><p style={{fontSize:12,...styles.muted,marginBottom:10}}>{intelligence.operations?.total||0} tasks · {intelligence.operations?.open||0} open</p>{(intelligence.communications?.recent_announcements||[]).map(a=><div key={a.title+"-"+a.created_at} style={{padding:"8px 0",borderTop:"1px solid var(--jd-border,#eee)"}}><b style={{fontSize:12}}>{a.title}</b><div style={{fontSize:10,...styles.muted}}>{new Date(a.created_at).toLocaleDateString()} · {a.is_active===false?"Inactive":"Active"}</div></div>)}{!intelligence.communications?.recent_announcements?.length&&<p style={{fontSize:11,...styles.muted}}>No recent announcements.</p>}<div style={{marginTop:10,borderTop:"1px solid var(--jd-border,#eee)",paddingTop:10}}><b style={{fontSize:12}}>Recent email delivery</b>{(intelligence.communications?.recent_email_batches||[]).slice(0,4).map((e,i)=><div key={e.sent_at+"-"+i} style={{fontSize:11,...styles.muted,paddingTop:6}}>{e.subject||"Email"} · {e.recipients||0} recipients · {e.status}</div>)}</div></section></div></>}

   {tab==="capabilities"&&<section style={styles.card}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><ShieldCheck size={18}/><h2 style={{fontSize:16}}>Capability evidence</h2></div><p style={{fontSize:12,...styles.muted,marginBottom:14}}>This is a verification-evidence report, not a list of enabled tools. Unverified means evidence is missing; it does not prove a capability is unavailable or working. Role permissions and approval requirements still apply.</p><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",gap:9}}>{capabilities.map(c=><div key={c.key} style={{border:"1px solid var(--jd-border,#eee)",borderRadius:10,padding:12}}><div style={{fontSize:12,fontWeight:750}}>{c.label}</div><div style={{fontSize:11,color:statusColor(c.state),marginTop:6}}>{c.state.toUpperCase()}</div><div style={{fontSize:10,...styles.muted,marginTop:5}}>{c.gaps?.join(" · ")}</div></div>)}</div></section>}
  </>}
  <style>{`.jd-spin{animation:jdspin 1s linear infinite}@keyframes jdspin{to{transform:rotate(360deg)}}@media(max-width:760px){.jd-ops-grid{grid-template-columns:1fr!important}}`}</style>
 </div>;
}
