import {newRequestId} from "./conversation-state.mjs";
import React, {useRef, useState} from 'react';
import {validateResponse, validateAnswer} from '../../supabase/functions/_shared/jd-response.mjs';
import './structured-response.css';

function readDraft(key) { try { return JSON.parse(sessionStorage.getItem(key)||'null'); } catch { return null; } }
function Interaction({block, storageKey, answered, disabled, onSubmit}) {
  const [saved] = useState(()=>readDraft(storageKey));
  const [value,setValue] = useState(()=>{const v=answered?.values??saved?.values;return block.type==='choice'?(Array.isArray(v)?v.filter(x=>typeof x==='string'):[]):(v&&typeof v==='object'&&!Array.isArray(v)?v:{});});
  const requestId = useRef(saved?.requestId || newRequestId());
  const lock = useRef(false);
  const [state,setState] = useState(answered?'submitted':'waiting');
  const [error,setError] = useState('');
  const submitted = !!answered || state==='submitted';
  const busy=state==='submitting';
  const update = next => {
    setValue(next);setError('');
    try { sessionStorage.setItem(storageKey,JSON.stringify({values:next,requestId:requestId.current})); } catch { /* Storage can be disabled; server history remains authoritative. */ }
  };
  const submit = async event => {
    event.preventDefault();if(lock.current||disabled||submitted)return;
    let values;
    try { values=validateAnswer(block,value); } catch(e){setError(e.message);return;}
    lock.current=true;setState('submitting');setError('');
    try {
      // Keep the identifier through refresh/network uncertainty. It is removed
      // only after a server receipt; retrying cannot enqueue a second job.
      try {sessionStorage.setItem(storageKey,JSON.stringify({values,requestId:requestId.current}));}catch{}
      const ok=await onSubmit(values,requestId.current);
      if(!ok)throw Error('Your answer was not confirmed. Retry safely, or reopen the conversation to check its status.');
      setState('submitted');try{sessionStorage.removeItem(storageKey);}catch{}
    }catch(e){setError(e.message);setState('waiting');}finally{lock.current=false;}
  };
  const title=block.question||block.title;
  return <form className="jd-response-interaction" onSubmit={submit} aria-label={title}>
    <fieldset disabled={disabled||busy||submitted}>
      <legend>{title}</legend>
      {block.type==='choice' ? block.presentation==='dropdown' ? <label className="jd-response-field"><span>Select an option</span><select required value={value[0]||''} onChange={e=>update([e.target.value])}><option value="">Choose…</option>{block.options.map(o=><option key={o.value} value={o.value}>{o.label}{o.description?' — '+o.description:''}</option>)}</select></label> : <div className="jd-response-options">{block.options.map(o=><label key={o.value} className="jd-response-option"><input type={block.multiple?'checkbox':'radio'} name={storageKey} value={o.value} checked={value.includes(o.value)} onChange={e=>update(block.multiple ? e.target.checked?[...value,o.value]:value.filter(v=>v!==o.value) : [o.value])}/><span><strong>{o.label}</strong>{o.description&&<small>{o.description}</small>}</span></label>)}</div> : block.fields.map(f=><label className="jd-response-field" key={f.id}><span>{f.label}{f.required?' *':' (optional)'}</span>{f.description&&<small>{f.description}</small>}{f.type==='select'?<select required={f.required} value={value[f.id]??''} onChange={e=>update({...value,[f.id]:e.target.value})}><option value="">Choose…</option>{f.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>:f.type==='textarea'?<textarea required={f.required} maxLength={2000} value={value[f.id]??''} onChange={e=>update({...value,[f.id]:e.target.value})}/>:<input type={f.type} required={f.required} maxLength={2000} step={f.type==='number'?'any':undefined} min={f.type==='number'?f.min:undefined} max={f.type==='number'?f.max:undefined} value={value[f.id]??''} onChange={e=>update({...value,[f.id]:e.target.value})}/>}</label>)}
      {!submitted&&<button type="submit">{busy?'Submitting…':'Continue'}</button>}
    </fieldset>
    {submitted&&<p className="jd-response-receipt" role="status">Answer recorded. JD will continue in this conversation.</p>}
    {error&&<p className="jd-response-error" role="alert">{error}</p>}
  </form>;
}
export function StructuredResponse({response, messageId, scope, answers=[], streaming, disabled, renderMarkdown, onAnswer, onReview}) {
  const valid=validateResponse(response);
  if(!valid||streaming)return null;
  return <div className="jd-structured-response">{valid.blocks.map(block=>{
    if(block.type==='message')return <React.Fragment key={block.id}>{renderMarkdown(block.content)}</React.Fragment>;
    if(block.type==='choice'||block.type==='form')return <Interaction key={scope+':'+messageId+':'+block.id} block={block} storageKey={'jd:interaction:'+scope+':'+messageId+':'+block.id} answered={answers.find(a=>a.messageId===messageId&&a.blockId===block.id)} disabled={disabled||!messageId} onSubmit={(values,requestId)=>onAnswer({messageId,blockId:block.id,values},requestId)}/>;
    if(block.type==='approval')return <section className="jd-response-result" key={block.id}><p>{block.description}</p><button type="button" onClick={onReview}>Review recorded approval</button><small>A proposal is not an executed action. Check the recorded outcome in Review Centre.</small></section>;
    return <section className="jd-response-result" key={block.id}><h3>{block.title}</h3><p role="status">{block.status.replaceAll('_',' ')} · {block.source.replaceAll('_',' ')}</p><dl>{Object.entries(block.data).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>)}</dl></section>;
  })}</div>;
}
