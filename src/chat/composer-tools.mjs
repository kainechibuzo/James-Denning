export function mentionAt(text,caret){
 const before=text.slice(0,caret),match=before.match(/(?:^|\s)@([^@\n]{0,60})$/);
 return match?{start:before.lastIndexOf('@'),end:caret,query:match[1]}:null;
}
export function insertComposerText(text,selection,value){
 const start=selection?.start??text.length,end=selection?.end??text.length;
 const prefix=text.slice(0,start),suffix=text.slice(end);
 const insertion=(prefix&&!/\s$/.test(prefix)?' ':'')+value+' ';
 return {text:prefix+insertion+suffix,caret:prefix.length+insertion.length};
}
export function connectedChoices(servers,tools){
 const active=new Map(servers.filter(s=>s.status==='connected'&&typeof s.id==='string').map(s=>[s.id,s]));
 return tools.filter(t=>typeof t.id==='string'&&typeof t.name==='string'&&active.has(t.server_id)).map(t=>({id:'connector:'+t.id,label:t.name.slice(0,100),detail:String(active.get(t.server_id).name||'Connected service').slice(0,100),prompt:`For this request, discover and check the currently authorised MCP tool ${JSON.stringify(t.name.slice(0,100))} from service ${JSON.stringify(String(active.get(t.server_id).name||'').slice(0,100))} (tool reference ${t.id}). Use it only if available and permitted.`,kind:'connector'}));
}
