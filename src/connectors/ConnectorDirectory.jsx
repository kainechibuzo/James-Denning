import React,{useState} from 'react';
import {ArrowLeft,ArrowUpRight,Link2,Search,ShieldCheck,X} from 'lucide-react';
import {CONNECTOR_CATALOGUE,CONNECTOR_CATEGORIES,filterConnectors,canManageConnectors,PRIORITY_CONNECTOR_IDS} from './catalogue.mjs';
import {oauthProviderId} from '../../supabase/functions/_shared/jd-connector-oauth-policy.mjs';
import {JDConnectPanel} from '../components/jd-connect/JDConnectPanel.jsx';
import {WorkspaceConnectPanel} from './WorkspaceConnectPanel.jsx';
import {TokenConnectDialog} from './TokenConnectDialog.jsx';
import {tokenConnector} from '../../supabase/functions/_shared/jd-connector-token-policy.mjs';
import {OAuthConnectPanel} from './OAuthConnectPanel.jsx';
import {ConnectorLogo} from './ConnectorLogo.jsx';
import {supabase} from '../supabaseClient.js';
import './connectors.css';
const route=e=>tokenConnector(e.id)?'token':e.connection.kind==='native'?'work':oauthProviderId(e.id)?'oauth':['exa','firecrawl'].includes(e.id)?'public':'unavailable';
const label=e=>({token:'API key / token',work:'Account sign-in',oauth:'Account sign-in',public:'Limited public access',unavailable:'Not available yet'})[route(e)];
export function ConnectorDirectory({role,onBack,organizationName='Current workspace',initialConnectorId=null}){
 const initialEntry=initialConnectorId?CONNECTOR_CATALOGUE.find(e=>e.id===initialConnectorId)||null:null;
 const initialRoute=initialEntry&&canManageConnectors(role)?route(initialEntry):null;
 const [tab,setTab]=useState(initialRoute==='work'?'apps':initialRoute==='oauth'?'oauth':'explore'),[query,setQuery]=useState(initialEntry&&!['work','oauth'].includes(initialRoute)?initialEntry.name:''),[category,setCategory]=useState('All'),[sort,setSort]=useState('name'),[selected,setSelected]=useState(initialEntry&&!['token','work','oauth'].includes(initialRoute)?initialEntry:null),[availability,setAvailability]=useState(initialEntry?'all':'priority'),[appSetup,setAppSetup]=useState(initialRoute==='work'?initialEntry.id:null),[oauth,setOAuth]=useState(initialRoute==='oauth'?initialEntry:null),[tokenEntry,setTokenEntry]=useState(initialRoute==='token'?initialEntry:null),[connectionRevision,setConnectionRevision]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const allowed=canManageConnectors(role);
 const entries=filterConnectors({query,category,sort}).filter(e=>availability==='all'||(availability==='priority'?PRIORITY_CONNECTOR_IDS.includes(e.id):availability==='token'?route(e)==='token':availability==='signin'?['oauth','work'].includes(route(e)):availability==='public'?route(e)==='public':route(e)==='unavailable'));
 const configure=entry=>{setError('');setSelected(null);if(route(entry)==='token'){setTokenEntry(entry);}else if(route(entry)==='work'){setAppSetup(entry.id);setTab('apps');}else if(route(entry)==='oauth'){setOAuth(entry);setTab('oauth');}else setSelected(entry);};
 const publicConnect=async entry=>{setBusy(true);setError('');try{const {data,error}=await supabase.functions.invoke('jd-connect',{body:{action:'servers.public_connect',providerId:entry.id,confirm:true}});if(error||data?.error)throw Error(data?.error||error.message);if(!data?.server?.id||!Array.isArray(data.tools))throw Error('Connection not confirmed.');setTab('connected');}catch(e){setError(e.message);}finally{setBusy(false);}};
 const details=entry=>{setSelected(entry);requestAnimationFrame(()=>document.querySelector('.jd-connector-setup')?.scrollIntoView({block:'nearest'}));};
 return <section className="jd-connectors" aria-labelledby="jd-connectors-title"><div className="jd-connectors-inner">
  <header className="jd-connectors-head"><div><p className="jd-connectors-eyebrow">JD CONNECT</p><h1 id="jd-connectors-title">Your business, connected.</h1><p>Connect the services you use. We’ll show you where to get your token.</p></div>{onBack&&<button type="button" onClick={onBack}><ArrowLeft size={16}/> Back to JD</button>}</header>
  <p className="jd-connectors-count">Connections are scoped to {organizationName}. Personal accounts stay private unless explicitly shared.</p>
  <nav className="jd-connectors-tabs" aria-label="Connector views">
   <button type="button" aria-current={tab==='explore'?'page':undefined} onClick={()=>setTab('explore')}>Explore <span>{CONNECTOR_CATALOGUE.length}</span></button>
   <button type="button" aria-current={tab==='connected'?'page':undefined} onClick={()=>setTab('connected')}>My connections</button>
   <button type="button" aria-current={tab==='apps'?'page':undefined} onClick={()=>{setAppSetup(null);setTab('apps');}}>Work apps</button>
  </nav>
  {tab==='explore'?<>
   <div className="jd-connectors-notice"><ShieldCheck size={18}/><p><strong>Choose a service. Get your token. Connect.</strong> Supported services include a link to their token page and step-by-step instructions. Some services still require account sign-in or custom setup. A directory listing is not a live connection or permission to take consequential actions.</p></div>
   <div className="jd-connectors-filters">
    <label className="jd-connectors-search"><Search size={17}/><input type="search" aria-label="Search connectors" placeholder="Search services or business needs" value={query} onChange={e=>setQuery(e.target.value)}/></label>
    <label>Business area<select aria-label="Connector category" value={category} onChange={e=>setCategory(e.target.value)}><option>All</option>{CONNECTOR_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label>
    <label>Setup<select aria-label="Connector setup" value={availability} onChange={e=>setAvailability(e.target.value)}><option value="priority">Useful shortlist</option><option value="all">All setups</option><option value="token">API key / token</option><option value="signin">Account sign-in</option><option value="public">Limited public access</option><option value="unavailable">Not available yet</option></select></label>
    <label>Sort by<select aria-label="Sort connectors" value={sort} onChange={e=>setSort(e.target.value)}><option value="name">Name A–Z</option><option value="category">Business area</option></select></label>
   </div>
   <p className="jd-connectors-count" role="status">{entries.length} of {CONNECTOR_CATALOGUE.length} directory entries · setup and connection status are separate</p>
   {error&&<p role="alert">{error}</p>}
   {selected&&<section className="jd-connector-setup" aria-label={`Setup ${selected.name}`}>
    <div className="jd-connector-setup-head"><div className="jd-provider-title"><ConnectorLogo id={selected.id} name={selected.name}/><h2>{selected.name}</h2></div><button type="button" aria-label="Close connector details" onClick={()=>setSelected(null)}><X size={17}/></button></div>
    <p>{selected.description}</p>
    {route(selected)==='unavailable'?<p><strong>No supported token connection yet.</strong> This service needs a compatible hosted endpoint or a different authentication method. Do not paste a token for it into another service’s form.</p>:route(selected)==='token'?<p>Open token setup for the credential-page link and instructions. Paste a dedicated, least-privilege token into the secure field, not into chat. Connection is confirmed only after tool discovery succeeds.</p>:route(selected)==='public'?<p>Limited anonymous access, with provider rate limits and tool restrictions. No account or key is needed. Your operator must enable the host. Connect explicitly to discover tools; do not submit private data to a public service without authorisation.</p>:<p>Use provider sign-in and review the requested access. No token to copy. Operator registration and provider approval may be prerequisites. Connection is confirmed only after the applicable verification succeeds.</p>}
    <div className="jd-connector-setup-actions"><a href={selected.connection.docsUrl} target="_blank" rel="noopener noreferrer">Provider guide <ArrowUpRight size={15}/></a>
     {allowed&&route(selected)!=='unavailable'&&<button disabled={busy} onClick={()=>route(selected)==='public'?publicConnect(selected):configure(selected)}>{busy?'Connecting…':route(selected)==='public'?'Connect limited public access':route(selected)==='token'?'Set up token':'Set up sign-in'}</button>}
     {!allowed&&<span>Ask a workspace owner, admin or manager to connect this service.</span>}
    </div>
   </section>}
   {entries.length?<div className="jd-connectors-grid">{entries.map(entry=><article key={entry.id}>
    <div className="jd-connector-card-top"><ConnectorLogo id={entry.id} name={entry.name}/><span className="jd-connector-label">{label(entry)}</span></div>
    <p className="jd-connector-category">{entry.category}</p><h2>{entry.name}</h2><p className="jd-connector-description">{entry.description}</p>
    {allowed&&['token','work','oauth'].includes(route(entry))&&<button className="jd-connector-connect" type="button" aria-label={`Connect ${entry.name}`} onClick={()=>configure(entry)}><Link2 size={15}/> Connect</button>}
    <button type="button" aria-label={`View setup for ${entry.name}`} onClick={()=>details(entry)}>View setup <ArrowUpRight size={15}/></button>
   </article>)}</div>:<div className="jd-connectors-empty"><Search size={25}/><h2>No matching connectors</h2><p>Try another name or business area.</p><button type="button" onClick={()=>{setQuery('');setCategory('All');setAvailability('all');}}>Clear filters</button></div>}
  </>:!allowed?<div className="jd-connectors-empty"><Link2 size={25}/><h2>Managed by your workspace</h2><p>Ask a workspace owner, admin or manager to connect services.</p></div>:tab==='apps'?<WorkspaceConnectPanel key={appSetup||'work-apps'} initialService={appSetup} onClose={()=>setTab('explore')}/>:tab==='oauth'&&oauth?<OAuthConnectPanel key={oauth.id} entry={oauth} role={role} onClose={()=>setTab('explore')} onConnections={()=>setTab('connected')}/>:<JDConnectPanel key={connectionRevision} role={role} onSignIn={id=>{const entry=CONNECTOR_CATALOGUE.find(e=>id.startsWith('token:')?e.id===id.slice(6):oauthProviderId(e.id)===id);if(entry)configure(entry);else setTab('explore');}}/>}
  {allowed&&tokenEntry&&<TokenConnectDialog key={tokenEntry.id} entry={tokenEntry} onClose={()=>setTokenEntry(null)} onConnected={()=>{setTokenEntry(null);setConnectionRevision(n=>n+1);setTab('connected');}}/>}
 </div></section>;
}
