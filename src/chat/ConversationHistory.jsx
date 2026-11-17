import React,{useState} from 'react';
import {ArrowLeft,ArrowRight,MessageSquare,Plus,RefreshCw,Search} from 'lucide-react';
import './conversation-history.css';

export function ConversationHistory({conversations,loading,error,openingId,currentId,onOpen,onBack,onNew,onRefresh}){
 const [query,setQuery]=useState('');
 const matches=conversations.filter(chat=>(chat.title||'New conversation').toLowerCase().includes(query.trim().toLowerCase()));
 return <section className="jd-conversation-history" aria-labelledby="jd-history-title">
  <div className="jd-history-page-content">
   <header className="jd-history-page-head"><div><p className="jd-history-eyebrow">JD ASSISTANT</p><h1 id="jd-history-title">Conversation history</h1><p>Pick up a previous conversation, or start something new.</p></div><button type="button" onClick={onBack}><ArrowLeft size={16}/> Back to JD</button></header>
   <div className="jd-history-page-toolbar"><label><Search size={17}/><input type="search" aria-label="Search conversations" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search your conversations"/></label><button type="button" onClick={onRefresh} disabled={loading} aria-label="Refresh conversations"><RefreshCw size={17}/></button><button className="jd-history-create" type="button" onClick={onNew}><Plus size={16}/> New conversation</button></div>
   {error&&<p className="jd-history-error" role="alert">{error}</p>}
   {loading?<p role="status">Loading conversations…</p>:!matches.length?<div className="jd-history-page-empty"><MessageSquare size={28}/><h2>{query?'No matching conversations':'No saved conversations yet'}</h2><p>{query?'Try a different search.':'Start a conversation with JD. Your saved conversations will appear here.'}</p></div>:<div className="jd-history-page-list">{matches.map(chat=>{
    const date=chat.updated_at?new Date(chat.updated_at):null;
    const dateLabel=date&&!Number.isNaN(date.getTime())?date.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}):'Saved conversation';
    return <button type="button" key={chat.id} aria-current={chat.id===currentId?'true':undefined} aria-busy={openingId===chat.id} disabled={Boolean(openingId)} onClick={()=>onOpen(chat.id)}><MessageSquare size={19}/><span><strong>{chat.title||'New conversation'}</strong><small>{openingId===chat.id?'Opening…':dateLabel}</small></span><ArrowRight size={17}/></button>;
   })}</div>}
  </div>
 </section>;
}
