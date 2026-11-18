import React,{useEffect,useRef,useState} from 'react';
import {ArrowUpRight,X} from 'lucide-react';
import {supabase} from '../supabaseClient.js';
import {ConnectorLogo} from './ConnectorLogo.jsx';
import {tokenConnector,validateConnectorToken} from '../../supabase/functions/_shared/jd-connector-token-policy.mjs';

export function TokenConnectDialog({entry,onClose,onConnected}){
 const preset=tokenConnector(entry.id),dialog=useRef(null),mounted=useRef(true);
 const [token,setToken]=useState(''),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[ready,setReady]=useState(false),[checking,setChecking]=useState(true),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  mounted.current=true;const previous=document.activeElement,node=dialog.current,overflow=document.body.style.overflow;
  node.showModal();document.body.style.overflow='hidden';
  return()=>{mounted.current=false;node.close();document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};
 },[]);
 useEffect(()=>{
  let active=true;setReady(false);setChecking(true);setError('');
  supabase.functions.invoke('jd-connect',{body:{action:'servers.token_setup',providerId:entry.id}}).then(({data,error})=>{
   if(!active)return;if(error||data?.ready!==true||data?.providerId!==entry.id)throw Error('unavailable');setReady(true);
  }).catch(()=>{if(active)setError('Token setup is unavailable. Your operator may need to deploy the token backend or configure secure storage. No token has been sent.');}).finally(()=>{if(active)setChecking(false);});
  return()=>{active=false;};
 },[entry.id,attempt]);
 const submit=async event=>{
  event.preventDefault();if(busy||!ready||!confirm)return;
  let value;try{value=validateConnectorToken(token);}catch(e){setError(e.message);return;}
  setBusy(true);setError('');setToken(''); // Never retain a submitted token in the input.
  try{
   const {data,error}=await supabase.functions.invoke('jd-connect',{body:{action:'servers.token_connect',providerId:entry.id,bearerToken:value,confirm:true}});
   if(error||data?.error||!data?.server?.id||data.server.status!=='connected'||!Array.isArray(data.tools))throw Error('unconfirmed');
   if(mounted.current)onConnected();
  }catch{
   if(mounted.current)setError('Connection not confirmed. Check My connections before retrying. If it is not connected, check the token’s expiry, permissions and organisation approval, then paste it again. The provider may also be unavailable.');
  }finally{value='';if(mounted.current)setBusy(false);}
 };
 const trapFocus=event=>{
  if(event.key!=='Tab')return;
  const items=[...dialog.current.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled)')];
  const first=items[0],last=items.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
 };
 return <dialog ref={dialog} className="jd-token-dialog" aria-labelledby="jd-token-title" aria-describedby="jd-token-intro" onKeyDown={trapFocus} onCancel={event=>{event.preventDefault();if(!busy)onClose();}}>
  <div className="jd-token-head"><div className="jd-provider-title"><ConnectorLogo id={entry.id} name={entry.name}/><h2 id="jd-token-title">Connect {entry.name}</h2></div><button type="button" aria-label="Close token setup" disabled={busy} onClick={onClose}><X size={20}/></button></div>
  <p id="jd-token-intro">You’ll need a {preset.label.toLowerCase()} from {entry.name}. Get it from the page below, then paste it here.</p>
  <a className="jd-token-link" href={preset.credentialUrl} target="_blank" rel="noopener noreferrer">Get {entry.name} token <ArrowUpRight size={16}/><span className="jd-token-new-tab"> (opens a new tab)</span></a>
  <ol>{preset.steps.map(step=><li key={step}>{step}</li>)}</ol>
  <p className="jd-token-note">{preset.warning}</p>
  {checking&&<p role="status">Checking secure token storage…</p>}
  {error&&<div className="jd-token-error" role="alert"><p>{error}</p>{!ready&&!checking&&<button type="button" onClick={()=>setAttempt(n=>n+1)}>Retry setup check</button>}</div>}
  <form onSubmit={submit}>
   <label className="jd-token-field" htmlFor="jd-provider-token">{preset.label}<input id="jd-provider-token" type="password" value={token} onChange={e=>setToken(e.target.value)} disabled={!ready||busy} maxLength={8000} autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="Paste your token here" required/></label>
   <p className="jd-token-note">Stored encrypted on JD’s backend, never in browser storage. Private to you in this workspace. Expired tokens must be replaced here; JD cannot renew them automatically.</p>
   <label className="jd-token-confirm"><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)} disabled={!ready||busy}/>I authorise JD to store this token and discover tools. This does not approve write actions, purchases or deployments.</label>
   <div className="jd-token-actions"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" disabled={!ready||busy||!confirm||!token.trim()}>{busy?'Checking connection…':'Connect securely'}</button></div>
  </form>
  <p className="jd-token-note">One connection per provider endpoint per workspace. Replacing your token clears tool trust and previous grants. Disconnect removes it from JD; revoke it on the provider’s token page too. Never paste tokens into chat.</p>
  <a href={preset.docsUrl} target="_blank" rel="noopener noreferrer">Provider connection guide</a>
 </dialog>;
}
