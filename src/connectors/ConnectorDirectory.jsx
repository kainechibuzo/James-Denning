import React,{useState} from 'react';
import {ArrowLeft,ArrowUpRight,Check,Link2,Plus,Search,ShieldCheck,X} from 'lucide-react';
import {CONNECTOR_CATALOGUE,CONNECTOR_CATEGORIES,HOSTED_CONNECTOR_COUNT,filterConnectors,canManageConnectors,connectionLabel,supportsHostedAuth} from './catalogue.mjs';
import {JDConnectPanel} from '../components/jd-connect/JDConnectPanel.jsx';
import {WorkspaceConnectPanel} from './WorkspaceConnectPanel.jsx';
import {PRIORITY_CONNECTOR_IDS} from './catalogue.mjs';
import './connectors.css';

export function ConnectorDirectory({role,onBack,organizationName='Current workspace'}){
 const [tab,setTab]=useState('explore'),[query,setQuery]=useState(''),[category,setCategory]=useState('All'),[sort,setSort]=useState('name'),[selected,setSelected]=useState(null),[setup,setSetup]=useState(null),[availability,setAvailability]=useState('priority'),[appSetup,setAppSetup]=useState(null);
 const allowed=canManageConnectors(role);
 const entries=filterConnectors({query,category,sort}).filter(e=>availability==='all'||(availability==='priority'?PRIORITY_CONNECTOR_IDS.includes(e.id):availability==='native'?e.connection.kind==='native':availability==='hosted'?Boolean(e.endpoint):e.connection.kind==='manual'));
 const configure=(entry)=>{if(entry?.connection.kind==='native'){setSelected(null);setAppSetup(entry.id);setTab('apps');return;}setSelected(null);setSetup({name:entry?.name||'',endpoint:entry?.endpoint||'',key:Date.now()});setTab('connected');};
 const viewDetails=entry=>{if(entry.connection.kind==='native'){configure(entry);return;}setSelected(entry);requestAnimationFrame(()=>document.querySelector('.jd-connector-setup')?.scrollIntoView({block:'nearest'}));};
 return <section className="jd-connectors" aria-labelledby="jd-connectors-title"><div className="jd-connectors-inner">
  <header className="jd-connectors-head"><div><p className="jd-connectors-eyebrow">JD CONNECT</p><h1 id="jd-connectors-title">Your business, connected.</h1><p>Bring the services you use into the work you do with JD.</p></div>{onBack&&<button type="button" onClick={onBack}><ArrowLeft size={16}/> Back to JD</button>}</header>
  <p className="jd-connectors-count">Connections are scoped to {organizationName}. Switch organisations to manage another business.</p>
  <nav className="jd-connectors-tabs" aria-label="Connector views">
   <button type="button" aria-current={tab==='explore'?'page':undefined} onClick={()=>setTab('explore')}>Explore <span>{CONNECTOR_CATALOGUE.length}</span></button>
   <button type="button" aria-current={tab==='connected'?'page':undefined} onClick={()=>setTab('connected')}>My connections</button>
   <button type="button" aria-current={tab==='apps'?'page':undefined} onClick={()=>{setAppSetup(null);setTab('apps');}}>Work apps</button>
   {allowed&&<button className="jd-connectors-add" type="button" onClick={()=>configure(null)}><Plus size={16}/> Custom MCP server</button>}
  </nav>
  {tab==='explore'?<>
   <div className="jd-connectors-notice"><ShieldCheck size={18}/><p><strong>Everyday work apps, alongside your developer tools.</strong> Google and Microsoft apps use selected read-only API permissions. {HOSTED_CONNECTOR_COUNT} other listings have documented hosted MCP endpoints. The remote-MCP gateway supports Bearer tokens, not provider OAuth or custom auth headers; Slack, Notion and Vercel sign-in are still gated. A listing is not a connection: host allowlisting, permissions and explicit confirmation still apply.</p></div>
   <div className="jd-connectors-filters">
    <label className="jd-connectors-search"><Search size={17}/><input type="search" aria-label="Search connectors" placeholder="Search services or business needs" value={query} onChange={e=>setQuery(e.target.value)}/></label>
    <label>Business area<select aria-label="Connector category" value={category} onChange={e=>setCategory(e.target.value)}><option>All</option>{CONNECTOR_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label>
    <label>Setup<select aria-label="Connector setup" value={availability} onChange={e=>setAvailability(e.target.value)}><option value="priority">Useful shortlist</option><option value="all">All setups</option><option value="native">Read-only work apps</option><option value="hosted">Hosted URL</option><option value="custom">Custom endpoint</option></select></label>
    <label>Sort by<select aria-label="Sort connectors" value={sort} onChange={e=>setSort(e.target.value)}><option value="name">Name A–Z</option><option value="category">Business area</option></select></label>
   </div>
   <p className="jd-connectors-count" role="status">{entries.length} of {CONNECTOR_CATALOGUE.length} directory entries · workspace connections are managed separately</p>
   {selected&&<section className="jd-connector-setup" aria-label={`Setup ${selected.name}`}>
    <div className="jd-connector-setup-head"><h2>{selected.name}</h2><button type="button" aria-label="Close connector details" onClick={()=>setSelected(null)}><X size={17}/></button></div>
    <p>{selected.description}.</p>
    {selected.endpoint&&<label className="jd-published-endpoint">Published MCP URL<input aria-label="Published MCP URL" readOnly value={selected.endpoint}/></label>}
    <p>{selected.connection.note}</p>
    <ol><li>Review the provider’s setup, permissions and any charges.</li><li>{selected.endpoint?'The URL is prefilled. Complete the required authentication before connecting.':'Obtain a compatible HTTPS MCP endpoint from your operator or deployment. A repository URL is not an endpoint.'}</li><li>Ask your JD operator to allowlist the host. Connect explicitly and inspect discovered tools before granting access.</li></ol>
    <p>Hosted presets may use the provider’s server rather than the community project below. Published URLs have not been runtime-tested with your account. No code is installed and no service is connected by browsing.</p>
    <div className="jd-connector-setup-actions">
     <a href={selected.connection.docsUrl} target="_blank" rel="noopener noreferrer">Connection guide <ArrowUpRight size={15}/></a>
     <a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">Project source <ArrowUpRight size={15}/></a>
     {allowed?<button type="button" onClick={()=>configure(selected)}><Check size={15}/>{selected.endpoint?'Use hosted URL':'I have an endpoint'}</button>:<span>Ask a workspace owner, admin or manager to connect this service.</span>}
    </div>
   </section>}
   {entries.length?<div className="jd-connectors-grid">{entries.map(entry=><article key={entry.id}>
    <div className="jd-connector-card-top"><span className="jd-connector-monogram" aria-hidden="true">{entry.name.slice(0,2).toUpperCase()}</span><span className="jd-connector-label">{connectionLabel(entry)}</span></div>
    <p className="jd-connector-category">{entry.category}</p><h2>{entry.name}</h2><p className="jd-connector-description">{entry.description}</p>
    {entry.endpoint&&<p className="jd-connector-host">{new URL(entry.endpoint).hostname}</p>}
    {allowed&&(entry.connection.kind==='native'||entry.endpoint&&supportsHostedAuth(entry))&&<button className="jd-connector-connect" type="button" aria-label={`Connect ${entry.name}`} onClick={()=>configure(entry)}><Link2 size={15}/> Connect</button>}
    <button type="button" aria-label={`View setup for ${entry.name}`} onClick={()=>viewDetails(entry)}>View setup <ArrowUpRight size={15}/></button>
   </article>)}</div>:<div className="jd-connectors-empty"><Search size={25}/><h2>No matching connectors</h2><p>Try another name or business area, or add your own MCP server.</p><button type="button" onClick={()=>{setQuery('');setCategory('All');setAvailability('all');}}>Clear filters</button></div>}
  </>:tab==='apps'?(allowed?<WorkspaceConnectPanel key={appSetup||'work-apps'} initialService={appSetup} onClose={()=>setTab('explore')}/>:<div className="jd-connectors-empty"><h2>Managed by your workspace</h2><p>Ask a workspace owner, admin or manager to connect work apps.</p></div>):allowed?<JDConnectPanel role={role} key={setup?.key||'connections'} initialName={setup?.name} initialEndpoint={setup?.endpoint} openRegistration={Boolean(setup)}/>:<div className="jd-connectors-empty"><Link2 size={25}/><h2>Managed by your workspace</h2><p>Only workspace owners, admins and managers can inspect or change MCP connections. You can still explore the directory.</p></div>}
 </div></section>;
}
