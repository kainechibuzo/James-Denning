// JD Skills Catalog dashboard: upload a skill ZIP into a private quarantine
// bucket, inspect it without executing anything, then — only after an
// independent administrator review — publish an immutable version for
// specialist discovery. Package content is untrusted data: scripts stay
// inert, loading a skill never grants tools, execution, hiring or billing.
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from '../supabaseClient.js';
import {skillsRequest} from '../software-factory/skills-client.mjs';
import {discoveryRequest} from '../software-factory/discovery-client.mjs';
import {STARTER_SKILLS,STARTER_SKILLS_SOURCE} from '../config/starter-skills.mjs';
import {AUTONOMOUS_SKILL_SOURCES} from '../../supabase/functions/_shared/jd-skills-source-index.mjs';
import {AlertCircle,Archive,Clock,Compass,FileCheck,Loader2,Package,RefreshCw,Search,ShieldCheck,Sparkles,Upload,XCircle} from 'lucide-react';

const styles={
 page:{maxWidth:1180,margin:'0 auto',padding:'26px 22px 48px',color:'var(--jd-text, #22252b)',fontFamily:"var(--jd-font-display, 'JD Caslon Text', Georgia, serif)"},
 tabs:{display:'flex',gap:4,flexWrap:'wrap',borderBottom:'1px solid var(--jd-hairline, rgba(34,37,43,.16))',paddingBottom:10,marginBottom:22},
 muted:{color:'var(--jd-muted,#60616b)'},
 card:{background:'var(--jd-card,#fff)',border:'1px solid var(--jd-border,#e7e9ed)',borderRadius:16,padding:18,marginBottom:14},
 boundary:{background:'var(--jd-filter,#f1e9dc)',border:'1px solid var(--jd-border,#e7e9ed)',borderRadius:12,padding:'12px 16px',margin:'14px 0',fontSize:13},
 input:{width:'100%',border:'1px solid var(--jd-border,#dfe2e7)',borderRadius:9,padding:'10px 12px',fontSize:13,background:'var(--jd-input,#fff)',color:'inherit',boxSizing:'border-box'},
 button:{border:0,borderRadius:9,padding:'10px 14px',background:'var(--jd-text,#22252b)',color:'var(--jd-card,#fff)',fontWeight:700,fontSize:12,cursor:'pointer'},
 secondary:{border:'1px solid var(--jd-border,#dfe2e7)',borderRadius:9,padding:'9px 12px',background:'transparent',color:'inherit',fontWeight:650,fontSize:12,cursor:'pointer'},
 danger:{border:'1px solid var(--jd-red,#8d2f26)',borderRadius:9,padding:'9px 12px',background:'transparent',color:'var(--jd-red,#8d2f26)',fontWeight:650,fontSize:12,cursor:'pointer'},
 nav:{display:'flex',gap:6,flexWrap:'wrap',margin:'10px 0'},
 chip:{display:'inline-block',border:'1px solid var(--jd-border,#dfe2e7)',borderRadius:999,padding:'3px 10px',fontSize:11,fontWeight:650,marginRight:6},
 code:{fontSize:11,wordBreak:'break-all',background:'var(--jd-filter,#f1e9dc)',padding:'1px 5px',borderRadius:5},
 list:{listStyle:'none',padding:0,margin:'8px 0'},
 error:{color:'var(--jd-red,#8d2f26)',fontWeight:650},
 notice:{color:'var(--jd-text-soft,#3d434c)',fontWeight:650},
};

const STATUS_LABEL={draft:'draft',needs_review:'needs review',approved:'approved',published:'published',deprecated:'deprecated',revoked:'revoked',rejected:'rejected'};
const LICENSE_LABEL={declared_with_license_file:'licence declared with LICENSE file',declared_only:'licence declared in frontmatter only',unlicensed_review_required:'unlicensed — review required',unknown:'licence not established'};

function Row({skill,selected,onSelect,disabled}){
 return <button type="button" disabled={disabled} onClick={()=>onSelect(skill.id)}
  aria-pressed={selected?'true':'false'}
  style={{...styles.secondary,fontWeight:selected?800:650,borderColor:selected?'var(--jd-text,#22252b)':'var(--jd-border,#dfe2e7)'}}>
  {skill.name} · v{skill.current_version} · {STATUS_LABEL[skill.status]||skill.status}
 </button>;
}

export function JdSkillsPage({ctx,client=supabase}){
 const role=ctx?.role;
 const isAdmin=['owner','admin'].includes(role);
 const [catalog,setCatalog]=useState(null),[selected,setSelected]=useState(null),[report,setReport]=useState(null);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(isAdmin),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [file,setFile]=useState(null),[importing,setImporting]=useState(false);
 const [confirm,setConfirm]=useState(null),[note,setNote]=useState('');
 const [discoverTask,setDiscoverTask]=useState(''),[discover,setDiscover]=useState(null);
 const [searchTask,setSearchTask]=useState(''),[searchResult,setSearchResult]=useState(null),[acquireReceipt,setAcquireReceipt]=useState(null);
 const [discoveryIdea,setDiscoveryIdea]=useState(''),[discoveryResult,setDiscoveryResult]=useState(null),[discoveryNote,setDiscoveryNote]=useState('');
 const [autonomyInfo,setAutonomyInfo]=useState(null);
 const alive=useRef(true),lock=useRef(false),requests=useRef(new Map());
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const requestId=key=>{if(!requests.current.has(key))requests.current.set(key,crypto.randomUUID());return requests.current.get(key);};
 async function run(task,apply,preserve=false){
  if(lock.current)return;lock.current=true;setBusy(true);
  if(!preserve){setError('');setNotice('');}
  let result,ok=false;
  try{result=await task();ok=true;}catch(e){if(alive.current)setError(e.message||'Skills outcome not confirmed.');}
  finally{lock.current=false;if(alive.current)setBusy(false);}
  if(ok&&alive.current&&apply)apply(result);
 }
 const api=body=>skillsRequest(client,role,body);
 const load=(skillId=null)=>run(()=>api({action:'skills.read',skillId:skillId||null}),c=>{setCatalog(c);setLoading(false);},true);
 useEffect(()=>{if(isAdmin)load(null);},[]);
 const current=catalog?.skills.find(s=>s.id===selected)||null;
 const versions=catalog?.versions||[],reviews=catalog?.reviews||[],imports=catalog?.imports||[];
 const select=id=>{setSelected(id);setConfirm(null);setReport(null);setDiscover(null);load(id);};
 function startImport(){
  if(file)performImport(file,`${file.name}:${file.size}:${file.lastModified}`);
 }
 async function importStarter(pkg){
  setError('');setNotice('');
  try{
   const res=await fetch(`${import.meta.env?.BASE_URL||'/'}skills/${pkg.file}`,{cache:'no-store'});
   if(!res.ok)throw Error('The starter package could not be loaded from this device.');
   const blob=await res.blob();
   performImport(new File([blob],pkg.file,{type:'application/zip'}),`starter:${pkg.id}:${blob.size}`);
  }catch(e){setError(e.message||'The starter package could not be loaded.');}
 }
 function performImport(importFile,requestBase){
  setImporting(true);
  run(async()=>{
   const create=await api({action:'skills.import.create',confirm:true,requestId:requestId(`create:${requestBase}`),filename:importFile.name});
   const stored=await client.storage.from(create.bucket).uploadToSignedUrl(create.upload.path,create.upload.token,importFile);
   if(stored?.error)throw Error('Quarantine upload failed; nothing was inspected or imported.');
   return await api({action:'skills.import.complete',confirm:true,requestId:requestId(`complete:${create.import_id}`),importId:create.import_id});
  },receipt=>{
   setReport(receipt);setImporting(false);setFile(null);
   setNotice(receipt.status==='needs_review'
   ?'Inspection complete without execution. The package now needs an independent review before publication.'
    :'Inspection failed and nothing was published. The recorded report explains why; the package was never executed.');
   load(selected);
  });
 }
 function mutate(action,extra={}){
  const body={action,skillId:selected,expectedVersion:current?.current_version||0,confirm:true,requestId:requestId(`${action}:${selected}:${current?.current_version||0}`),...extra};
  run(()=>api(body),()=>{
   setConfirm(null);setNote('');
   setNotice(action==='skills.decide'?'Review decision recorded and read back. Publication still requires a separate publish step by a reviewed administrator.':action==='skills.publish'?'Immutable version published for specialist discovery in this workspace. No tools were granted and nothing executes by itself.':'Lifecycle decision recorded and read back. Revoked skills disappear from discovery and can no longer be loaded.');
   load(selected);
  });
 }
 const searchSources=()=>run(async()=>api({action:'skills.search',task:searchTask,limit:6}),s=>{setSearchResult(s);setAcquireReceipt(null);});
 const acquireCandidate=id=>{
  const key=`acquire:${id}`;
  return run(async()=>api({action:'skills.acquire',confirm:true,requestId:requestId(key),name:id}),receipt=>{
   // Keep the id after an uncertain failure so retry replays the same attempt;
   // clear it only after a confirmed receipt so a later acquisition is new.
   requests.current.delete(key);
   setAcquireReceipt(receipt);setSearchResult(null);
  setNotice(receipt.state==='published'
   ?`JD acquired ${receipt.source.path.split('/').pop()} from ${receipt.source.repo} at pinned commit ${receipt.source.commit.slice(0,8)}, inspected it without executing anything and published it under policy jd-autonomous-v1. Every billable run that loads it still needs an explicit recorded cost confirmation.`
   :'JD acquired the package and inspected it without executing anything, but validation was not fully clean, so nothing was published automatically. Review the recorded report.');
  load(selected);
  });
 };
 const dapi=body=>discoveryRequest(client,role,body);
 const loadAutonomy=()=>run(async()=>dapi({action:'autonomy.read'}),a=>setAutonomyInfo(a),true);
 useEffect(()=>{loadAutonomy();},[]);
 const startDiscovery=()=>run(async()=>{
  const result=await dapi({action:'discovery.start',confirm:true,requestId:requestId(`discovery:${discoveryIdea.slice(0,40)}`),idea:discoveryIdea});
  return result;
 },d=>{setDiscoveryResult(d);setDiscoveryNote('');loadAutonomy();});
 const decideDiscovery=(decision,session)=>run(async()=>dapi({action:'discovery.decide',confirm:true,requestId:requestId(`discovery-decision:${session}`),
  sessionId:session,decision,note:discoveryNote||'Independent decision on this discovery proposal for the workspace.'}),()=>{
  setNotice(decision==='approve'?'Proposal approved. JD can now acquire the planned capabilities and proceed.':'Proposal declined and recorded. Nothing was acquired or spent.');
  setDiscoveryResult(null);loadAutonomy();
 });
 const proceedDiscovery=session=>run(async()=>dapi({action:'discovery.proceed',confirm:true,requestId:requestId(`discovery-proceed:${session}`),sessionId:session}),
  d=>{setDiscoveryResult(d);loadAutonomy();});
 if(!isAdmin)return <p role="status" style={{...styles.page,...styles.muted}}>Workspace administrator access is required.</p>;
 return <div style={styles.page}>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
   <h2 style={{margin:0,display:'flex',alignItems:'center',gap:9}}><Package size={22} aria-hidden="true"/>Skills Catalog</h2>
   <button type="button" style={styles.secondary} disabled={busy} onClick={()=>load(selected)}><RefreshCw size={14} aria-hidden="true"/> Refresh catalogue</button>
  </div>
  <p style={styles.muted}>Secure skill packages: upload a ZIP, JD quarantines and inspects it without executing anything, an independent administrator reviews, then the version publishes for specialist agents in this workspace.</p>
  <div style={styles.boundary} className="jd-agent-boundary">
   <strong>Uploading is not execution approval.</strong> Package contents are never executed during import, inspection, preview or loading. Scripts and binaries are recorded as inert attachments only. Loaded skill text is untrusted task data: it cannot grant tools, bypass approvals, hire, spend or change execution authority.
  </div>
  {error&&<p role="alert" style={styles.error}><AlertCircle size={14} aria-hidden="true"/> {error}</p>}
  {notice&&<p role="status" style={styles.notice}>{notice}</p>}
  {loading&&!catalog?<p style={styles.muted}><Loader2 size={14} className="jd-spin" aria-hidden="true"/> Loading catalogue…</p>:<>
   <section aria-label="Import a skill package" style={styles.card}>
    <h3 style={{marginTop:0}}>Import a skill package</h3>
    <form onSubmit={e=>{e.preventDefault();startImport();}}>
     <label style={{display:'grid',gap:6,fontSize:12,fontWeight:650}}>Skill package (.zip, up to 20 MiB)
      <input type="file" accept=".zip,application/zip" aria-label="Skill package ZIP" style={styles.input}
       onChange={e=>{setFile(e.target.files?.[0]||null);setReport(null);setNotice('');setError('');}}/>
     </label>
     <p style={{...styles.muted,fontSize:12}}>JD downloads the archive from quarantine, parses it in memory and verifies every entry — no package URL is fetched and no dependency is installed.</p>
     <button type="submit" style={styles.button} disabled={busy||!file}><Upload size={14} aria-hidden="true"/> {importing?'Inspecting…':'Upload to quarantine and inspect'}</button>
    </form>
    {report&&<div role="status" aria-label="Inspection report" style={{...styles.boundary,marginTop:12}}>
     <h4 style={{margin:'0 0 6px'}}><FileCheck size={15} aria-hidden="true"/> Inspection complete — {report.status==='needs_review'?'independent review required before publication':'validation failed; nothing published'}</h4>
     <p style={{...styles.muted,fontSize:12,margin:0}}>Import <code style={styles.code}>{report.import_id}</code> recorded with its full inspection report and manifest hash. The package was never executed.</p>
    </div>}
   </section>
   <section aria-label="Starter catalogue" style={styles.card}>
    <h3 style={{marginTop:0}}>Bring your own package (advanced)</h3>
    <p style={styles.muted}>Curated skills packaged from Anthropic's public skills repository ({STARTER_SKILLS_SOURCE}). Instruction and reference text only: upstream executable scripts were omitted because JD records package files as inert attachments and never executes, installs or fetches package content. Importing runs the same quarantine inspection; publication still requires an independent review.</p>
    <ul style={styles.list}>{STARTER_SKILLS.map(pkg=><li key={pkg.id} style={{display:'flex',alignItems:'center',gap:10,marginBottom:6,flexWrap:'wrap'}}>
     <button type="button" style={styles.secondary} disabled={busy} title={pkg.blurb} onClick={()=>importStarter(pkg)}>{pkg.title}</button>
     <span style={{...styles.muted,fontSize:12,flex:1,minWidth:200}}>{pkg.blurb}</span>
    </li>)}</ul>
   </section>
   <section aria-label="Included capabilities" style={styles.card}>
    <h3 style={{marginTop:0}}>Included capabilities — already there</h3>
    <p style={styles.muted}>Every capability below is part of your workspace: when a task needs one, JD acquires it automatically from the pinned public source (inspected without execution, provenance recorded) and it is ready within seconds. Nothing to upload, nothing to set up. Agentic time is metered per run against your workspace ceiling.</p>
    <div style={styles.nav}>{AUTONOMOUS_SKILL_SOURCES.map(entry=><span key={entry.id} style={styles.chip} title={`${entry.description} — ≈${entry.expectedMinutes} min/run`}>{entry.id.replace(/-/g,' ')}</span>)}</div>
    <p style={{...styles.muted,fontSize:11,margin:'8px 0 0'}}>{AUTONOMOUS_SKILL_SOURCES.length} capabilities · source {STARTER_SKILLS_SOURCE} · estimates shown on hover</p>
   </section>
   <section aria-label="Describe the work" style={styles.card}>
    <h3 style={{marginTop:0,display:'flex',alignItems:'center',gap:8}}><Compass size={17} aria-hidden="true"/>Describe the work — JD cooks it</h3>
    <p style={styles.muted}>Tell JD what you need done. The discovery agent researches it against the included capabilities, picks the skills and the specialist roles, and — {autonomyInfo?.mode==='autonomous'?'because this workspace runs autonomous, it proceeds without asking (spend ceiling still enforced)':'in assisted mode, waits for an independent administrator approval before anything is acquired or spent'}.</p>
    {autonomyInfo&&<p style={{...styles.muted,fontSize:11,margin:'0 0 8px'}}>Autonomy mode: <strong>{autonomyInfo.mode}</strong> · ceiling {Math.round(autonomyInfo.spend_ceiling_seconds/60)} min of agent time · rate {(autonomyInfo.agentic_rate_minor_per_hour/100).toFixed(2)} {autonomyInfo.currency}/h</p>}
    <form onSubmit={e=>{e.preventDefault();startDiscovery();}}>
     <label style={{display:'grid',gap:6,fontSize:12,fontWeight:650}}>What should JD get done?
      <textarea aria-label="Work description" rows={3} maxLength={4000} style={styles.input} value={discoveryIdea} onChange={e=>setDiscoveryIdea(e.target.value)} placeholder="Reconcile this month's supplier invoices against the ledger and draft the monthly leadership update"/>
     </label>
     <button type="submit" style={styles.button} disabled={busy||discoveryIdea.trim().length<10}><Sparkles size={14} aria-hidden="true"/> Cook this</button>
    </form>
    {discoveryResult&&<div role="status" aria-label="Discovery result" style={{...styles.boundary,marginTop:12}}>
     {discoveryResult.status==='proposed'&&<h4 style={{margin:'0 0 6px'}}>Proposal ready — independent approval required before acquisition</h4>}
     {discoveryResult.status==='proceeding'&&<h4 style={{margin:'0 0 6px'}}>Autonomous mode — JD is acquiring the planned capabilities</h4>}
     {discoveryResult.status==='completed'&&<h4 style={{margin:'0 0 6px'}}>Cooked — capabilities acquired, playbooks bound, nothing executed</h4>}
     {discoveryResult.plan&&<div style={{fontSize:12}}>
      {discoveryResult.plan.skills.map(s=><p key={s.id} style={{margin:'2px 0'}}><Sparkles size={12} aria-hidden="true"/> <strong>{s.name}</strong> — {s.description} <Clock size={11} aria-hidden="true"/> ≈{Math.round(s.expected_seconds/60)} min</p>)}
      <p style={{...styles.muted,margin:'4px 0'}}>Specialist roles: {(discoveryResult.plan.roles||[]).join(', ')||'—'} · estimated agent time ≈ {Math.round((discoveryResult.plan.estimated_seconds||0)/60)} min</p>
     </div>}
     {discoveryResult.receipt&&(discoveryResult.receipt.acquired?.length||discoveryResult.receipt.bound?.length||discoveryResult.receipt.errors?.length)?<div style={{fontSize:12}}>
      <p style={{margin:'4px 0'}}>Acquired: {discoveryResult.receipt.acquired?.map(a=>a.source?.path||a.skill_id).join(', ')||'none'} · bound playbooks: {discoveryResult.receipt.bound?.map(b=>`${b.role} ← v${b.version}`).join(', ')||'none'}{discoveryResult.receipt.errors?.length?` · stopped on: ${discoveryResult.receipt.errors.map(e=>e.id).join(', ')}`:''}</p>
     </div>:null}
     {discoveryResult.status==='proposed'&&<div style={{marginTop:8}}>
      <textarea aria-label="Decision note" rows={2} maxLength={1000} style={styles.input} value={discoveryNote} onChange={e=>setDiscoveryNote(e.target.value)} placeholder="Decision note (optional; recorded with the decision)"/>
      <div style={{display:'flex',gap:8,marginTop:8,flexWrap:'wrap'}}>
       <button type="button" style={styles.button} disabled={busy} onClick={()=>decideDiscovery('approve',discoveryResult.session_id)}>Approve and let JD proceed</button>
       <button type="button" style={styles.danger} disabled={busy} onClick={()=>decideDiscovery('decline',discoveryResult.session_id)}>Decline</button>
      </div>
     </div>}
     {discoveryResult.status==='completed'&&<p style={{...styles.muted,fontSize:12,margin:'6px 0 0'}}>Nothing was executed. Every billable run that loads an acquired capability still records its exact version and works within the spend ceiling.</p>}
    </div>}
   </section>
   <section aria-label="Ask JD to find a skill" style={styles.card}>
    <h3 style={{marginTop:0}}>Ask JD to find a skill</h3>
    <p style={styles.muted}>Describe the work: JD searches the allowlisted source catalogue (Anthropic's public skills repository), and can acquire a capability itself — fetch the pinned upstream text, inspect it in quarantine without executing anything and publish the validated version under policy jd-autonomous-v1. Provenance (repo, commit, package hash) is recorded immutably. Per-run agentic time is billed only after an explicit cost confirmation.</p>
    <form onSubmit={e=>{e.preventDefault();searchSources();}}>
     <label style={{display:'grid',gap:6,fontSize:12,fontWeight:650}}>What should the specialist be able to do?
      <textarea aria-label="Capability description" rows={2} maxLength={2000} style={styles.input} value={searchTask} onChange={e=>setSearchTask(e.target.value)} placeholder="Prepare a monthly supplier invoice reconciliation against the ledger"/>
     </label>
     <button type="submit" style={styles.secondary} disabled={busy||searchTask.trim().length<4}><Search size={14} aria-hidden="true"/> Search source catalogue</button>
    </form>
    {searchResult&&<div role="status" aria-label="Source catalogue matches" style={{...styles.boundary,marginTop:12}}>
     {searchResult.candidates.length===0?'No allowlisted source matched this description.':searchResult.candidates.map(c=><div key={c.id} style={{display:'flex',gap:10,alignItems:'flex-start',marginBottom:8,flexWrap:'wrap'}}>
      <div style={{flex:1,minWidth:220}}>
       <strong>{c.name}</strong> <span style={styles.chip}>{c.category}</span> {c.availability?.acquired&&<span style={styles.chip}>already in catalogue · {c.availability.status} · v{c.availability.version}</span>}
       <p style={{...styles.muted,fontSize:12,margin:'2px 0'}}>{c.description}</p>
       <p style={{...styles.muted,fontSize:11,margin:0}}><Clock size={11} aria-hidden="true"/> estimated agentic time ≈ {c.expectedMinutes} min/run · source {c.source.repo}/{c.source.path}</p>
      </div>
      {!c.availability?.acquired&&<button type="button" style={styles.button} disabled={busy} title="Fetch, inspect without execution and publish under jd-autonomous-v1" onClick={()=>acquireCandidate(c.id)}>Acquire</button>}
     </div>)}
     <p style={{...styles.muted,fontSize:12,margin:'6px 0 0'}}>{searchResult.notice}</p>
    </div>}
    {acquireReceipt&&<div role="status" aria-label="Acquisition receipt" style={{...styles.boundary,marginTop:12}}>
     <h4 style={{margin:'0 0 6px'}}><FileCheck size={15} aria-hidden="true"/> {acquireReceipt.state==='published'?'Acquired and published — provenance recorded':'Acquired and inspected — nothing published automatically'}</h4>
     <p style={{...styles.muted,fontSize:12,margin:0}}>Source {acquireReceipt.source.repo}/{acquireReceipt.source.path} @ <code style={styles.code}>{acquireReceipt.source.commit}</code> · package hash <code style={styles.code}>{acquireReceipt.package_hash}</code> · inspection {acquireReceipt.inspection.status} ({acquireReceipt.inspection.errors} errors, {acquireReceipt.inspection.warnings} warnings) · estimated agentic time ≈ {Math.round(acquireReceipt.estimated_seconds/60)} min/run · billing: {acquireReceipt.billing.model}. The package was never executed.</p>
    </div>}
   </section>
   <section aria-label="Skill catalogue" style={styles.card}>
    <h3 style={{marginTop:0}}>Catalogue</h3>
    {catalog?.skills?.length?<div style={styles.nav}>{catalog.skills.map(s=><Row key={s.id} skill={s} selected={selected===s.id} onSelect={select} disabled={busy}/>)}</div>:<p style={styles.muted}>No skills recorded yet. Import a package to begin.</p>}
    {current&&<>
     <div style={{...styles.boundary,marginTop:8}}>
      <strong>{current.name}</strong> · v{current.current_version} · {STATUS_LABEL[current.status]||current.status} {current.category&&<span style={styles.chip}>{current.category}</span>}
      <span style={styles.chip}>scope: {current.scope}</span>
     </div>
     <div style={styles.nav}>
      {[['approve','Approve review',current.status==='needs_review'],['reject','Reject review',current.status==='needs_review'],['publish','Publish approved version',current.status==='approved'],['revoke','Revoke',current.status!=='revoked'],['deprecate','Deprecate',current.status==='published']].map(([action,label,allowed])=>
       <button key={action} type="button" style={action==='revoke'||action==='reject'?styles.danger:styles.secondary} disabled={busy||!allowed} title={allowed?'':'Not available in the current state'} onClick={()=>{setConfirm(action);setNote('');}}>{label}</button>)}
     </div>
     {confirm&&<div role="group" aria-label="Confirm skills action" className="jd-agent-boundary">
      <h4 style={{margin:'0 0 6px'}}>Confirm {confirm} for {current.name} v{current.current_version}</h4>
      <p>An approving reviewer must differ from the importer of this version. Review happens without execution; publication only enables discovery and context loading, never tools or authority.</p>
      <label style={{display:'grid',gap:6,fontSize:12,fontWeight:650}}>Review note
       <textarea aria-label="Review note" rows={3} minLength={10} maxLength={1000} style={styles.input} value={note} onChange={e=>setNote(e.target.value)}/>
      </label>
      <button type="button" style={styles.button} disabled={busy||note.trim().length<10} onClick={()=>confirm==='approve'||confirm==='reject'?mutate('skills.decide',{decision:confirm,note}):confirm==='publish'?mutate('skills.publish',{note}):mutate('skills.lifecycle',{lifecycleAction:confirm,note})}>Confirm skills action</button>
      <button type="button" style={styles.secondary} disabled={busy} onClick={()=>setConfirm(null)}>Keep unchanged</button>
     </div>}
     {versions.length>0&&<details style={{marginTop:8}}><summary>Immutable versions ({versions.length})</summary>
      <ul style={styles.list}>{versions.map(v=><li key={v.version} style={{marginBottom:8}}>
       <strong>Version {v.version}</strong> · {LICENSE_LABEL[v.manifest?.license?.status]||''} · {v.manifest?.fileCount} files
       <br/><span style={styles.muted}>content hash <code style={styles.code}>{v.content_hash}</code></span>
       {v.manifest?.description&&<p style={{...styles.muted,fontSize:12,margin:'4px 0 0'}}>{v.manifest.description}</p>}
       {Array.isArray(v.manifest?.files)&&v.manifest.files.filter(f=>f.role==='inert_asset').length>0&&<p style={{...styles.muted,fontSize:12,margin:'4px 0 0'}}><Archive size={12} aria-hidden="true"/> Inert attachments (recorded, never executed): {v.manifest.files.filter(f=>f.role==='inert_asset').map(f=>f.path).join(', ')}</p>}
      </li>)}</ul>
     </details>}
     {reviews.length>0&&<details style={{marginTop:4}}><summary>Review decisions ({reviews.length})</summary>
      <ul style={styles.list}>{reviews.map(r=><li key={`${r.version}:${r.created_at}`}>Version {r.version} · {r.decision} · <span style={styles.muted}>{r.created_at}</span><p style={{...styles.muted,fontSize:12,margin:'2px 0 0'}}>{r.note}</p></li>)}</ul>
     </details>}
     {imports.length>0&&<details style={{marginTop:4}}><summary>Import history ({imports.length})</summary>
      <ul style={styles.list}>{imports.map(i=><li key={i.id}>{i.status} · <span style={styles.muted}>{i.completed_at||i.created_at}</span>{i.error_message&&<p style={{...styles.muted,fontSize:12,margin:'2px 0 0'}}>{i.error_message}</p>}</li>)}</ul>
     </details>}
    </>}
   </section>
   <section aria-label="Specialist discovery" style={styles.card}>
    <h3 style={{marginTop:0}}>Specialist discovery preview</h3>
    <p style={styles.muted}>Shows which published skills a specialist assignment would discover for a task. Metadata only: instructions load into context at run time, with the exact version recorded on the run.</p>
    <form onSubmit={e=>{e.preventDefault();run(async()=>{
     const reply=await client.functions.invoke('jd-automation',{body:{action:'skills.resolve',task:discoverTask,limit:5}});
     if(reply?.error||reply?.data?.error||!reply?.data?.discover||reply.data.discover.execution_granted!==false)throw Error('Discovery read-back is incomplete.');
     return reply.data.discover;
    },d=>{setDiscover(d);setNotice('');});}}>
     <label style={{display:'grid',gap:6,fontSize:12,fontWeight:650}}>Task description
      <textarea aria-label="Task description" rows={2} maxLength={2000} style={styles.input} value={discoverTask} onChange={e=>setDiscoverTask(e.target.value)} placeholder="Reconcile this month's supplier invoices against the ledger"/>
     </label>
     <button type="submit" style={styles.secondary} disabled={busy||discoverTask.trim().length<4}><ShieldCheck size={14} aria-hidden="true"/> Preview discovery</button>
    </form>
    {discover&&<div role="status" style={styles.boundary}>
     {discover.skills.length===0?'No published skill matched this task.':discover.skills.map(s=><p key={s.id} style={{margin:'2px 0'}}><strong>{s.name}</strong> v{s.version} — {s.description}</p>)}
     <p style={{...styles.muted,fontSize:12,margin:'6px 0 0'}}>{discover.notice}</p>
    </div>}
   </section>
  </>}
  <style>{`.jd-spin{animation:jdspin-skills 1s linear infinite}@keyframes jdspin-skills{to{transform:rotate(360deg)}}`}</style>
 </div>;
}
