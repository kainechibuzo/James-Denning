import React,{useEffect,useState} from 'react';
import {supabase} from '../supabaseClient.js';
import {WORKSPACE_PROVIDERS,validateWorkspaceRedirect} from '../../supabase/functions/_shared/jd-workspace-connectors.mjs';
const accessLabel={not_connected:'Not connected',different_account_owner:'Another account owner',not_selected:'Not selected',reconnect_required:'Reconnect required',permission_required:'Permission missing',read_access:'Read access granted'};
async function call(action,extra={}){
 const {data,error}=await supabase.functions.invoke('jd-business-platform',{body:{action,...extra}});
 if(error||data?.error)throw Error(data?.error||error?.message||'Workspace connection request failed.');
 if(!data)throw Error('Workspace connection service returned no data.');
 return data;
}
export function WorkspaceConnectPanel({initialService,onClose}){
 const [providers,setProviders]=useState([]),[selected,setSelected]=useState(initialService?[initialService]:[]),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[loaded,setLoaded]=useState(false);
 const load=async()=>{setError('');setLoaded(false);try{const data=await call('workspace.catalog');if(!Array.isArray(data.providers))throw Error('Workspace app backend needs deployment.');setProviders(data.providers);setLoaded(true);}catch(e){setError(e.message);}};
 useEffect(()=>{let active=true;call('workspace.catalog').then(data=>{if(!active)return;if(!Array.isArray(data.providers))throw Error('Workspace app backend needs deployment.');setProviders(data.providers);setLoaded(true);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 const connect=async p=>{setBusy(p.id);setError('');try{const services=selected.filter(id=>p.services.some(s=>s.id===id));const data=await call('oauth.start',{providerId:p.id,services});window.location.assign(validateWorkspaceRedirect(p.id,data.authorization_url));}catch(e){setError(e.message);}finally{setBusy('');}};
 const disconnect=async p=>{if(!window.confirm('Erase your JD credentials for all '+p.name+' apps in this workspace? This does not revoke permissions at the provider.'))return;setBusy(p.id);setError('');try{const d=await call('workspace.disconnect',{providerId:p.id});setNotice(d.notice);await load();}catch(e){setError(e.message);}finally{setBusy('');}};
 return <section className="jd-connector-setup jd-workspace-apps" aria-label="Workspace app connections">
  <div className="jd-connector-setup-head"><h2>Connect your work apps</h2>{onClose&&<button onClick={onClose}>Close app setup</button>}</div>
  <p>Select only the apps JD may read when you ask. Reconnecting replaces the selected app set; select every app you want to keep. No sending, drafting, editing, sharing, deleting or publishing. Provider permissions can cover more data than JD’s implemented reads.</p>
  <p>One account per provider in this workspace. Only the person who connected it can use its data; it is not shared with other managers. Read access is a grant, not proof of a successful provider request.</p>
  {error&&<div role="alert"><p>{error}</p><button disabled={Boolean(busy)} onClick={load}>Retry app setup</button></div>}
  {notice&&<p role="status">{notice}</p>}
  {!loaded&&!error&&<p role="status">Checking app setup…</p>}
  {providers.map(p=><fieldset key={p.id} disabled={Boolean(busy)}><legend>{p.name||WORKSPACE_PROVIDERS[p.id]?.name}</legend>
   <p>{p.configured?'Provider sign-in is configured. Review and select apps below.':'Operator setup required: deploy the OAuth callback and configure the provider app, callback URL and encryption key.'}</p>
   {p.services.map(s=><label className="jd-workspace-app" key={s.id}><input type="checkbox" checked={selected.includes(s.id)} onChange={e=>setSelected(v=>e.target.checked?[...v,s.id]:v.filter(id=>id!==s.id))}/><span><strong>{s.name}</strong><small>{accessLabel[s.access]||'Access unknown'}</small><span>{s.description}</span><details><summary>Requested read permissions</summary><code>{s.scopes.join('\n')}</code></details></span></label>)}
   <div className="jd-connector-setup-actions"><button disabled={!loaded||Boolean(error)||!p.configured||!selected.some(id=>p.services.some(s=>s.id===id))} onClick={()=>connect(p)}>{busy===p.id?'Working…':'Continue with '+p.name}</button><button onClick={()=>disconnect(p)}>Disconnect {p.name} locally</button></div>
  </fieldset>)}
 </section>;
}
