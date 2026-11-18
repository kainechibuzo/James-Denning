import React,{useEffect,useState} from 'react';
import {supabase} from '../supabaseClient.js';
import {ConnectorLogo} from './ConnectorLogo.jsx';
import {oauthProviderId} from '../../supabase/functions/_shared/jd-connector-oauth-policy.mjs';
async function call(body){const {data,error}=await supabase.functions.invoke('jd-connect-oauth',{body});if(error||data?.error)throw Error(data?.error||error?.message||'Sign-in request failed');return data;}
export function OAuthConnectPanel({entry,role,onClose,onConnections}){
 const providerId=oauthProviderId(entry.id),[provider,setProvider]=useState(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[sharing,setSharing]=useState('personal'),[confirm,setConfirm]=useState(false);
 useEffect(()=>{let active=true;call({action:'providers'}).then(d=>{if(!active)return;const p=d?.providers?.find(p=>p.id===providerId);if(!p)throw Error('Provider sign-in backend needs deployment.');setProvider(p);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[providerId]);
 const start=async()=>{
  // Open synchronously on the user's click; never expose provider credentials to JS.
  const popup=window.open('about:blank','_blank');if(!popup){setError('Allow the sign-in popup and try again.');return;}popup.opener=null;
  setBusy(true);setError('');setNotice('');
  try{const data=await call({action:'start',providerId,sharing,confirm:true});const url=new URL(data.authorization_url);if(url.protocol!=='https:'||url.origin!==data.authorization_origin||url.username||url.password||!url.searchParams.get('state')||url.searchParams.get('code_challenge_method')!=='S256')throw Error('Invalid sign-in destination.');popup.location.replace(url.toString());setNotice('Finish sign-in in the new tab, then return here and check your connections. Only successful tool discovery confirms a connection.');}catch(e){popup.close();setError(e.message);}finally{setBusy(false);}
 };
 return <section className="jd-connector-setup" aria-label={`Sign in to ${entry.name}`}>
  <div className="jd-connector-setup-head"><div className="jd-provider-title"><ConnectorLogo id={entry.id} name={entry.name}/><h2>Connect {entry.name}</h2></div><button onClick={onClose}>Close sign-in setup</button></div>
  <p>Sign in with {provider?.name||entry.name} and approve access. No PAT or API key to find or paste.</p>
  {loading&&<p role="status">Checking provider setup…</p>}
  {error&&<p role="alert">{error}</p>}
  {notice&&<p role="status">{notice}</p>}
  {provider&&!provider.configured&&<p role="status"><strong>Operator setup required.</strong> JD’s provider app registration, OAuth configuration and deployment must be completed first. You do not need to supply a secret.</p>}
  {provider?.configured&&<>
   <p>Requested provider scopes: {provider.scopes.length?provider.scopes.join(', '):'Provider-defined consent; review the provider’s approval screen.'}</p>
   <label className="jd-oauth-sharing">Who may use this account?<select aria-label="Connection sharing" value={sharing} onChange={e=>setSharing(e.target.value)} disabled={busy}><option value="personal">Only me in this workspace</option>{['owner','admin'].includes(role)&&<option value="organisation">Share with authorised workspace managers</option>}</select></label>
   <p>One connection per provider endpoint in this workspace. Keep the same sharing choice when reconnecting; existing history cannot be re-shared. Reconnecting replaces your existing credentials, clears elevated grants and resets tool trust. {providerId==='atlassian'?'Jira and Confluence share this single connection.':''}</p>
   <label className="jd-oauth-confirm"><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)} disabled={busy}/>I authorise this connection and its selected sharing scope. Signing in does not approve sending, sharing, deletion or deployment.</label>
   <button className="jd-oauth-continue" disabled={!confirm||busy} onClick={start}>{busy?'Opening sign-in…':`Continue with ${provider.name}`}</button>
  </>}
  <p>Tokens stay encrypted on JD’s backend. Supported refresh tokens renew automatically; revoked or expired access may require sign-in again. New tools require review; write-capable actions still require explicit human approval.</p>
  <div className="jd-connector-setup-actions"><button onClick={onConnections}>Check my connections</button><a href={entry.connection.docsUrl} target="_blank" rel="noopener noreferrer">Provider guide</a></div>
 </section>;
}
