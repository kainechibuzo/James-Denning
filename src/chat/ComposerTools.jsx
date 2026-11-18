import React,{useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {AtSign,ChevronRight,Link2,Plus,Search,X} from 'lucide-react';
import {supabase} from '../supabaseClient.js';
import {canManageConnectors} from '../connectors/catalogue.mjs';
import {mentionAt,insertComposerText,connectedChoices} from './composer-tools.mjs';
import './composer-tools.css';

export function ComposerTools({draft,setDraft,onSend,isWorking,role,actions,onNavigate,children}){
 const [mode,setMode]=useState(null),[query,setQuery]=useState(''),[mention,setMention]=useState(null),[active,setActive]=useState(0),[remote,setRemote]=useState([]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0);
 const input=useRef(null),root=useRef(null),search=useRef(null),restoreInput=useRef(null),id=useId();
 // Restore focus/selection with the React commit, before the next input event.
 // A queued animation frame can otherwise overwrite a newer select-all/caret
 // move or steal focus after the user has already left the composer.
 useLayoutEffect(()=>{
  const restore=restoreInput.current;
  restoreInput.current=null;
  const element=input.current;
  if(!restore||!element)return;
  if(restore.text!==undefined&&element.value!==restore.text)return;
  element.focus();
  if(restore.caret!==undefined)element.setSelectionRange(restore.caret,restore.caret);
 });
 const open=Boolean(mode),allowed=canManageConnectors(role);
 const choices=[...actions.map((a,i)=>({id:'native:'+i,label:a.label,prompt:a.prompt,detail:'JD prompt shortcut',kind:'native'})),...(allowed&&!loading&&!error?remote:[])].filter(c=>`${c.label} ${c.detail}`.toLowerCase().includes(query.toLowerCase().trim())).slice(0,40);
 const close=(focus=false)=>{restoreInput.current=focus?{}:null;setMode(null);setMention(null);setQuery('');setRemote([]);};
 useEffect(()=>{if(!open)return;const outside=e=>{if(!root.current?.contains(e.target))close();};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[open]);
 useEffect(()=>{if(!open)return;let alive=true;setRemote([]);setError('');setLoading(allowed);
  if(allowed)Promise.all([supabase.functions.invoke('jd-connect',{body:{action:'servers.list'}}),supabase.functions.invoke('jd-connect',{body:{action:'tools.list'}})]).then(([s,t])=>{if(!alive)return;if(s.error||t.error||s.data?.error||t.data?.error||!Array.isArray(s.data?.servers)||!Array.isArray(t.data?.tools))throw Error('unavailable');setRemote(connectedChoices(s.data.servers,t.data.tools));}).catch(()=>{if(alive)setError('Connected tools could not be loaded. No connection status has been assumed.');}).finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;};
 },[open,allowed,reload]);
 useEffect(()=>{setActive(0);},[query,mode,remote]);
 useEffect(()=>{if(!draft)close();},[draft]);
 useEffect(()=>{if(mode==='menu')search.current?.focus();},[mode]);
 useEffect(()=>{if(open)document.getElementById(`${id}-option-${active}`)?.scrollIntoView({block:'nearest'});},[active,open,id]);
 const choose=item=>{if(!item)return;const selection=mode==='mention'?mention:{start:input.current?.selectionStart??draft.length,end:input.current?.selectionEnd??draft.length};const next=insertComposerText(draft,selection,item.prompt);setDraft(next.text);close();restoreInput.current={text:next.text,caret:next.caret};};
 const keydown=e=>{if(e.nativeEvent.isComposing||e.keyCode===229)return;
  if(open){if(e.key==='Escape'){e.preventDefault();close(true);return;}if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();setActive(n=>choices.length?(n+(e.key==='ArrowDown'?1:-1)+choices.length)%choices.length:0);return;}if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();choose(choices[active]);return;}if(e.key==='Tab'&&mode==='mention'&&choices[active]){e.preventDefault();choose(choices[active]);return;}}
  if(e.target===input.current&&e.key==='Enter'&&!e.shiftKey){e.preventDefault();onSend();}
 };
 const update=e=>{setDraft(e.target.value);const m=mentionAt(e.target.value,e.target.selectionStart);setMention(m);setMode(m?'mention':null);setQuery(m?.query||'');};
 const navigate=view=>{close();onNavigate(view);};
 return <div className="jd-composer-tools" ref={root} onKeyDown={e=>{if(e.key==="Escape"&&open){e.preventDefault();close(true);}}}>
  {open&&<div className="jd-tool-picker" role={mode==='menu'?'dialog':undefined} aria-label={mode==='menu'?'JD tools':undefined}>
   <div className="jd-tool-picker-head"><span>{mode==='mention'?'Mention a tool':'Tools & connections'}</span><button type="button" aria-label="Close tools menu" onClick={()=>close(true)}><X size={16}/></button></div>
   {mode==='menu'&&<label className="jd-tool-picker-search"><Search size={16}/><input ref={search} type="search" aria-label="Search JD tools" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={keydown} role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls={`${id}-list`} aria-activedescendant={choices.length?`${id}-option-${active}`:undefined} placeholder="Find a tool or connected service"/></label>}
   <div id={`${id}-list`} role="listbox" aria-label="Tool suggestions" className="jd-tool-options">{choices.map((item,index)=><button id={`${id}-option-${index}`} key={item.id} role="option" aria-selected={index===active} type="button" tabIndex={-1} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(item)}><span className="jd-tool-option-icon">{item.kind==='connector'?<Link2 size={16}/>:<AtSign size={16}/>}</span><span><strong>{item.label}</strong><small>{item.detail}</small></span><ChevronRight size={14}/></button>)}{!choices.length&&<p>No matching tools. Try another name.</p>}</div>
   {loading&&<p className="jd-tool-picker-note" role="status">Checking connected tools…</p>}{error&&<p className="jd-tool-picker-note" role="alert">{error} <button type="button" onClick={()=>setReload(n=>n+1)}>Retry</button></p>}
   {!loading&&!error&&!remote.length&&<p className="jd-tool-picker-note">{allowed?'No connected tools discovered. Add a server in Connectors.':'Connected tools require a workspace owner, admin or manager.'}</p>}
   <p className="jd-tool-picker-note">Shortcuts fill your draft. Nothing runs until you send; permissions and approvals still apply.</p>
   <div className="jd-tool-picker-links"><button type="button" onClick={()=>navigate('connectors')}><Link2 size={15}/> Connectors <span>Explore 70</span></button>{mode==='menu'&&<><button type="button" onClick={()=>navigate('review')}>Review Centre</button><button type="button" onClick={()=>navigate('runs')}>Automation runs</button></>}</div>
  </div>}
  <textarea ref={input} role={mode==='mention'?'combobox':undefined} aria-label="Message JD" value={draft} onChange={update} onKeyDown={keydown} onClick={e=>{if(mode==='mention'){const m=mentionAt(draft,e.currentTarget.selectionStart);setMention(m);setMode(m?'mention':null);setQuery(m?.query||'');}}} aria-expanded={mode==='mention'} aria-controls={mode==='mention'?`${id}-list`:undefined} aria-activedescendant={mode==='mention'&&choices.length?`${id}-option-${active}`:undefined} aria-autocomplete="list" placeholder={isWorking?'Send another request while JD works…':'Ask JD anything, or type @ for tools…'} rows={2}/>
  <div className="jd-compose-bottom"><div className="jd-composer-tools-controls"><button className="jd-add-tool" type="button" aria-label="Add tools and connectors" aria-haspopup="dialog" aria-expanded={mode==='menu'} onClick={()=>{if(mode==='menu'){close(true);}else{setQuery('');setMode('menu');setMention(null);}}}><Plus size={19}/></button><span className="jd-compose-hint">Use @ for tools</span></div>{children}</div>
 </div>;
}
