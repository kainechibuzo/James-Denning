// JD Skills Catalog dashboard: upload a skill ZIP into a private quarantine
// bucket, inspect it without executing anything, then — only after an
// independent administrator review — publish an immutable version for
// specialist discovery. Package content is untrusted data: scripts stay
// inert, loading a skill never grants tools, execution, hiring or billing.
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from '../supabaseClient.js';
import {skillsRequest} from '../software-factory/skills-client.mjs';
import {STARTER_SKILLS,STARTER_SKILLS_SOURCE} from '../config/starter-skills.mjs';
import {AlertCircle,Archive,FileCheck,Loader2,Package,RefreshCw,ShieldCheck,Upload,XCircle} from 'lucide-react';

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
    <h3 style={{marginTop:0}}>Starter catalogue</h3>
    <p style={styles.muted}>Curated skills packaged from Anthropic's public skills repository ({STARTER_SKILLS_SOURCE}). Instruction and reference text only: upstream executable scripts were omitted because JD records package files as inert attachments and never executes, installs or fetches package content. Importing runs the same quarantine inspection; publication still requires an independent review.</p>
    <ul style={styles.list}>{STARTER_SKILLS.map(pkg=><li key={pkg.id} style={{display:'flex',alignItems:'center',gap:10,marginBottom:6,flexWrap:'wrap'}}>
     <button type="button" style={styles.secondary} disabled={busy} title={pkg.blurb} onClick={()=>importStarter(pkg)}>{pkg.title}</button>
     <span style={{...styles.muted,fontSize:12,flex:1,minWidth:200}}>{pkg.blurb}</span>
    </li>)}</ul>
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
