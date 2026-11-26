import {newRequestId} from "./conversation-state.mjs";
import React, {useRef, useState} from 'react';
import {Check, Clock3, Box, Star, Users} from 'lucide-react';
import {validateResponse, validateAnswer} from '../../supabase/functions/_shared/jd-response.mjs';
import {InlineConnectorCard} from './InlineConnectorCard.jsx';
import './structured-response.css';

function readDraft(key) { try { return JSON.parse(sessionStorage.getItem(key)||'null'); } catch { return null; } }

function Interaction({block, storageKey, answered, disabled, onSubmit}) {
  const [saved] = useState(()=>readDraft(storageKey));
  const [value,setValue] = useState(()=>{const v=answered?.values??saved?.values;return block.type==='choice'?(Array.isArray(v)?v.filter(x=>typeof x==='string'):[]):(v&&typeof v==='object'&&!Array.isArray(v)?v:{});});
  const requestId = useRef(saved?.requestId || newRequestId());
  const lock = useRef(false);
  const [state,setState] = useState(answered?'submitted':'waiting');
  const [error,setError] = useState('');
  const [customText,setCustomText] = useState(()=>{const v=answered?.values??saved?.values;return Array.isArray(v)?(v.find(x=>typeof x==='string'&&x.startsWith('custom:'))||'').slice(7):'';});
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
  const isTeamsVariant = block.type==='choice' && block.variant==='specialist_teams';
  return <form className={"jd-response-interaction"+(isTeamsVariant?" is-specialist-teams":"")} onSubmit={submit} aria-label={title}>
    <fieldset disabled={disabled||busy||submitted}>
      <legend>
        {isTeamsVariant && <span className="jd-response-legend-icon" aria-hidden="true"><Users size={16}/></span>}
        <span>{title}</span>
      </legend>
      {block.subtitle && <p className="jd-response-subtitle">{block.subtitle}</p>}
      {block.type==='choice' ? (block.presentation==='dropdown' ? <label className="jd-response-field"><span>Choose an option</span><select aria-label={title} required value={value[0]??''} onChange={e=>update(e.target.value?[e.target.value]:[])}><option value="">Choose…</option>{block.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label> : <><div className="jd-response-options">{block.options.map((o,index)=>{
        const checked = value.includes(o.value);
        const letter = String.fromCharCode(65+index);
        const hasHighlights = Array.isArray(o.highlights) && o.highlights.length > 0;
        const hasMeta = Boolean(o.estTime || o.estCost);
        return <label key={o.value} className={"jd-response-option"+(checked?" is-selected":"")+(hasHighlights||hasMeta?" is-rich":"")}>
          <input type={block.multiple?'checkbox':'radio'} name={storageKey} value={o.value} checked={checked} onChange={e=>update(block.multiple ? e.target.checked?[...value.filter(v=>!v.startsWith('custom:')),o.value]:value.filter(v=>v!==o.value) : [o.value])}/>
          <span className="jd-response-option-badge" aria-hidden="true">{letter}</span>
          <span className="jd-response-option-body">
            <span className="jd-response-option-head">
              <strong><span className="jd-response-option-letter">{letter}.</span> {o.label}</strong>
              {(o.recommended || o.badge) && <span className="jd-response-recommended-pill"><Star size={11} aria-hidden="true"/>{o.badge || 'Recommended'}</span>}
            </span>
            {(o.subtitle || o.rateLabel) && <span className="jd-response-option-subrow">
              {o.subtitle && <span className="jd-response-option-subtitle">{o.subtitle}</span>}
              {o.rateLabel && <span className="jd-response-option-rate">{o.rateLabel}</span>}
            </span>}
            {o.description && <small className="jd-response-option-desc">{o.description}</small>}
            {hasHighlights && <span className="jd-response-option-highlights">{o.highlights.map((item,hi)=><span key={hi} className="jd-response-highlight-item"><Check size={13} aria-hidden="true"/><span>{item}</span></span>)}</span>}
            {hasMeta && <span className="jd-response-option-meta">
              {o.estTime && <span><Clock3 size={13} aria-hidden="true"/>Est. time: {o.estTime}</span>}
              {o.estCost && <span><Box size={13} aria-hidden="true"/>Est. cost: {o.estCost}</span>}
            </span>}
          </span>
        </label>;
      })}{block.allowCustom&&<label className={"jd-response-option"+(value.some(v=>v.startsWith('custom:'))?" is-selected":"")}><input type={block.multiple?'checkbox':'radio'} name={storageKey} checked={value.some(v=>v.startsWith('custom:'))} onChange={e=>update(block.multiple ? e.target.checked?[...value.filter(v=>!v.startsWith('custom:')),'custom:'+customText.trim()]:value.filter(v=>!v.startsWith('custom:')) : ['custom:'+customText.trim()])}/><span className="jd-response-option-badge" aria-hidden="true">{String.fromCharCode(65+block.options.length)}</span><span className="jd-response-option-body"><span className="jd-response-option-head"><strong><span className="jd-response-option-letter">{String.fromCharCode(65+block.options.length)}.</span> {block.customLabel||'Something else'}</strong></span><small className="jd-response-option-desc">Write your own answer</small></span></label>}</div>{block.allowCustom&&value.some(v=>v.startsWith('custom:'))&&<label className="jd-response-field jd-response-custom-field"><span>{block.customLabel||'Your answer'}</span><input type="text" maxLength={500} value={customText} onChange={e=>{setCustomText(e.target.value);update(block.multiple?[...value.filter(v=>!v.startsWith('custom:')),'custom:'+e.target.value.trim()]:['custom:'+e.target.value.trim()]);}} placeholder="Type your answer…"/></label>}</>) : block.fields.map(f=><label className="jd-response-field" key={f.id}><span>{f.label}{f.required?' *':' (optional)'}</span>{f.description&&<small>{f.description}</small>}{f.type==='select'?<select required={f.required} value={value[f.id]??''} onChange={e=>update({...value,[f.id]:e.target.value})}><option value="">Choose…</option>{f.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>:f.type==='textarea'?<textarea required={f.required} maxLength={2000} value={value[f.id]??''} onChange={e=>update({...value,[f.id]:e.target.value})}/>:<input type={f.type} required={f.required} maxLength={2000} step={f.type==='number'?'any':undefined} min={f.type==='number'?f.min:undefined} max={f.type==='number'?f.max:undefined} value={value[f.id]??''} onChange={e=>update({...value,[f.id]:e.target.value})}/>}</label>)}
      {!submitted&&<div className="jd-response-submit-row"><button type="submit">{busy?'Submitting…':(block.submitLabel||'Submit')}</button></div>}
    </fieldset>
    {submitted&&<p className="jd-response-receipt" role="status">Answer recorded. JD will continue in this conversation.</p>}
    {error&&<p className="jd-response-error" role="alert">{error}</p>}
  </form>;
}

export function StructuredResponse({response, messageId, scope, role, answers=[], streaming, disabled, renderMarkdown, onAnswer, onReview, onConnectService, onDismissConnector}) {
  const valid=validateResponse(response);
  if(!valid||streaming)return null;
  return <div className="jd-structured-response">{valid.blocks.map(block=>{
    if(block.type==='message')return block.variant==='callout' ? <div className="jd-response-callout" key={block.id}>{renderMarkdown(block.content)}</div> : <React.Fragment key={block.id}>{renderMarkdown(block.content)}</React.Fragment>;
    if(block.type==='choice'||block.type==='form')return <Interaction key={scope+':'+messageId+':'+block.id} block={block} storageKey={'jd:interaction:'+scope+':'+messageId+':'+block.id} answered={answers.find(a=>a.messageId===messageId&&a.blockId===block.id)} disabled={disabled||!messageId} onSubmit={(values,requestId)=>onAnswer({messageId,blockId:block.id,values},requestId)}/>;
    if(block.type==='connector_prompt')return <InlineConnectorCard key={block.id} block={block} role={role} disabled={disabled} onConnect={onConnectService} onDismiss={onDismissConnector}/>;
    if(block.type==='approval')return <section className="jd-response-result" key={block.id}><p>{block.description}</p><button type="button" onClick={onReview}>Review recorded approval</button><small>A proposal is not an executed action. Check the recorded outcome in Review Centre.</small></section>;
    return <section className="jd-response-result" key={block.id}><h3>{block.title}</h3><p role="status">{block.status.replaceAll('_',' ')} · {block.source.replaceAll('_',' ')}</p><dl>{Object.entries(block.data).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>)}</dl></section>;
  })}</div>;
}
