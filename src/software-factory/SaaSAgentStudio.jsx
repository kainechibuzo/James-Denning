import React,{useEffect,useRef,useState} from 'react';
import {canDesignAgents,previewAgentTeam,editAgentBrief,exportAgentDesign,saveFoundationDesign} from './agent-design-client.mjs';
import './agent-studio.css';
const initial={name:'',brief:'',kind:'saas',backend:true,authentication:true,multiTenant:true,payments:false,research:false,preferredRoute:'native',agentNotes:{}};
export function SaaSAgentStudio({client,role,scopeKey}){
 if(!canDesignAgents(role))return <section className="jd-agent-studio" role="status">Agent design is available to workspace owners and administrators. No agent tools or permissions have been granted.</section>;
 return <AgentDesigner key={`${scopeKey}:${role}`} client={client} role={role}/>;
}
function AgentDesigner({client,role}){
 const [project,setProject]=useState(initial),[design,setDesign]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[saved,setSaved]=useState(false),[savedDocument,setSavedDocument]=useState(null);
 const saveId=useRef(null);
 const alive=useRef(true),lock=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const change=patch=>{setSaved(false);saveId.current=null;setProject(p=>({...p,...patch,agentNotes:{}}));setDesign(null);setError('');setNotice('Requirements changed. Generate a new preview; previous per-agent edits are not retained.');};
 async function preview(event){
  event.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');setDesign(null);
  try{const result=await previewAgentTeam(client,role,project);if(alive.current){setDesign(result);setNotice('Preview generated. No agents are running and no tools are connected by this action.');}}
  catch(e){if(alive.current)setError(e.message);}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 const edit=(agentId,note)=>{
  try{setSaved(false);saveId.current=null;setDesign(editAgentBrief(design,agentId,note));setError('');setNotice('Agent brief edited locally. Not saved to the workspace or evaluated.');}
  catch{setError('Agent brief could not be updated. Remove credentials and keep it under 1,200 characters.');}
 };
 async function save(){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');saveId.current ||= crypto.randomUUID();
  try{const r=await saveFoundationDesign(client,role,{design,requestId:saveId.current,documentId:savedDocument?.document_id||null,expectedVersion:savedDocument?.version||0});if(alive.current){setSavedDocument(r.receipt);setSaved(true);setNotice(`Team definition version ${r.receipt.version} saved and read back. Open Business Builder → Saved versions for content review. No agents activated.`);}}
  catch(e){if(alive.current)setError(e.message);}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 function download(){
  try{
   const content=exportAgentDesign(design),blob=new Blob([content],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
   link.href=url;link.download='jd-saas-agent-team.design.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   setNotice('Design file downloaded. This is not a saved workspace version, running agent team or deployment.');
  }catch{setError('Export was blocked because the design no longer validates. Regenerate the preview.');}
 }
 return <section className="jd-agent-studio" aria-label="SaaS Agent Studio">
  <header><p className="jd-agent-eyebrow">SOFTWARE FACTORY · DESIGN STAGE</p><h2>SaaS Agent Studio</h2><p>Design a specialised team for a SaaS product, website or internal tool—not a set of corporate departments.</p></header>
  <div className="jd-agent-boundary"><strong>Definitions, not running agents.</strong> This studio generates a preview and lets you export it. You can explicitly save team definitions to the version registry after its reviewed backend release. Connector binding and isolated execution are not activated here. Export before leaving this tab; local edits are not retained. Do not paste credentials or customer data.</div>
  <form onSubmit={preview}>
   <fieldset disabled={busy}><legend>Project requirements</legend>
    <div className="jd-agent-form-grid">
     <label>Project name<input required minLength={2} maxLength={120} value={project.name} onChange={e=>change({name:e.target.value})} placeholder="For example, inventory SaaS"/></label>
     <label>Product type<select value={project.kind} onChange={e=>change({kind:e.target.value})}><option value="saas">SaaS product</option><option value="website">Website</option><option value="internal-tool">Internal tool</option></select></label>
     <label className="jd-agent-wide">Product brief<textarea required minLength={12} maxLength={3000} rows={4} value={project.brief} onChange={e=>change({brief:e.target.value})} placeholder="Who is it for, what should it do, and what would a successful result look like?"/></label>
     <label>Preferred development route<select value={project.preferredRoute} onChange={e=>change({preferredRoute:e.target.value})}><option value="native">Native isolated coding</option><option value="repository">Repository-based development</option><option value="scaffolder">External scaffolding integration</option></select></label>
    </div>
    <div className="jd-agent-options">{[['backend','Backend and data storage'],['authentication','User authentication'],['multiTenant','Multiple customer organisations'],['payments','Payments'],['research','Live research requested']].map(([key,label])=><label key={key}><input type="checkbox" checked={project[key]} onChange={e=>change({[key]:e.target.checked})}/>{label}</label>)}</div>
    <p className="jd-agent-muted">Requirements are explicit—not inferred from a provider name. Change them to match the project. Changes clear the preview and per-agent edits.</p>
    <button type="submit">{busy?'Generating preview…':'Generate team preview'}</button>
   </fieldset>
  </form>
  {error&&<p className="jd-agent-error" role="alert">{error}</p>}{notice&&<p className="jd-agent-notice" role="status">{notice}</p>}
  {design&&<div>
   <div className="jd-agent-result-head"><div><h3>{design.project.name}</h3><span>{design.agents.length} proposed agent definitions · 0 authorised tools · 0 evaluations run</span></div><button type="button" disabled={busy} onClick={download}>Export design JSON</button><button type="button" disabled={busy||saved} onClick={save}>{saved?'Definition saved':'Save team definition for review'}</button></div>
   <div className="jd-agent-cards">{design.agents.map(agent=><article key={agent.id}>
    <div className="jd-agent-card-head"><h4>{agent.name}</h4><span>Proposed</span></div><p>{agent.responsibility}</p>
    <label>Project-specific brief for {agent.name}<textarea disabled={busy} maxLength={1200} rows={3} value={agent.projectSpecificBrief} onChange={e=>edit(agent.id,e.target.value)} placeholder="Optional project-specific constraints; cannot grant access or override approval rules."/></label>
    <details><summary>Instructions, requested tools and evaluation criteria</summary><h5>Operating instructions</h5><ul>{agent.instructions.map(text=><li key={text}>{text}</li>)}</ul><h5>Requested capabilities—not authorised tools</h5><ul>{agent.toolRequests.map(t=><li key={t.capability}><code>{t.capability}</code> · No binding</li>)}</ul><h5>Deliverables</h5><ul>{agent.deliverables.map(text=><li key={text}>{text}</li>)}</ul><h5>Evaluations · Not run</h5><ul>{agent.evaluations.map(t=><li key={t.expected}>{t.expected}</li>)}</ul><p>Proposed handoff: {agent.handoffTo.map(id=>design.agents.find(a=>a.id===id)?.name).join(', ')||'Human release review'}</p></details>
   </article>)}</div>
   <section className="jd-agent-requirements"><h3>Integration requirements</h3><p>These are capability needs, not a provider marketplace or an inspection of your connections. No official MCP integration, authorised server or discovered tool is asserted.</p><div className="jd-agent-cards">{design.connectorRequirements.map(c=><article key={c.capability}><h4>{c.capability.replaceAll('-',' ')}</h4><b>{c.importance}</b><p>{c.reason}</p><p><strong>Data:</strong> {c.dataAccess}</p><p><strong>Permissions:</strong> {c.permissions}</p><small>Connection not inspected · Official integration not verified · Tests not run</small></article>)}</div></section>
   <section><h3>Human checkpoints</h3><ol>{design.checkpoints.map(c=><li key={c.id}>{c.title} — <strong>{c.status.replaceAll('_',' ')}</strong></li>)}</ol><p>Authorised spend: $0. Authorised execution steps: 0. No code, research or deployment was executed.</p></section>
   <p className="jd-agent-muted">Save creates a versioned team-definition document and a content-review request, not running agents or permissions. Export remains a local file only. The Business Builder registry can inspect and restore saved versions.</p>
  </div>}
 </section>;
}
