// Read-only service contract shared by the UI, OAuth request builder and runtime.
// No provider URL, HTTP method or permission scope is supplied by the model.
const G='https://www.googleapis.com/auth/';
const service=(id,name,provider,category,description,scopes)=>Object.freeze({id,name,provider,category,description,scopes:Object.freeze(scopes)});
export const WORKSPACE_SERVICES=Object.freeze([
 service('gmail','Gmail','google-workspace','Email','Find messages and read subjects, senders and snippets. No sending or mailbox changes.',[G+'gmail.readonly']),
 service('google-drive','Google Drive','google-workspace','Files','Find files and folders and inspect metadata. No sharing, deleting or file downloads.',[G+'drive.metadata.readonly']),
 service('google-sheets','Google Sheets','google-workspace','Spreadsheets','Find spreadsheets and read a bounded cell range. No edits.',[G+'drive.metadata.readonly',G+'spreadsheets.readonly']),
 service('google-docs','Google Docs','google-workspace','Documents','Find documents and read document text. No edits.',[G+'drive.metadata.readonly',G+'documents.readonly']),
 service('google-calendar','Google Calendar','google-workspace','Scheduling','Read upcoming primary-calendar events. No invitations or changes.',[G+'calendar.events.readonly']),
 service('outlook','Outlook','microsoft-365','Email','Read recent messages, subjects and body previews. No sending or mailbox changes.',['Mail.Read']),
 service('onedrive','OneDrive','microsoft-365','Files','Find files and inspect metadata. No sharing, deleting or downloads.',['Files.Read']),
 service('excel','Excel','microsoft-365','Spreadsheets','Find Excel files and inspect metadata. Workbook cells and editing are not implemented.',['Files.Read']),
 service('word','Word','microsoft-365','Documents','Find Word files and inspect metadata. Document text and editing are not implemented.',['Files.Read']),
 service('outlook-calendar','Outlook Calendar','microsoft-365','Scheduling','Read upcoming calendar events. No invitations or changes.',['Calendars.Read']),
 service('microsoft-teams','Microsoft Teams','microsoft-365','Collaboration','List joined teams. Reading chat messages and posting are not implemented.',['Team.ReadBasic.All']),
]);
export const WORKSPACE_PROVIDERS=Object.freeze({
 'google-workspace':Object.freeze({name:'Google',authOrigin:'https://accounts.google.com',authPath:'/o/oauth2/v2/auth',clientIdEnv:'JD_OAUTH_GOOGLE_CLIENT_ID',clientSecretEnv:'JD_OAUTH_GOOGLE_CLIENT_SECRET'}),
 'microsoft-365':Object.freeze({name:'Microsoft',authOrigin:'https://login.microsoftonline.com',authPath:'/common/oauth2/v2.0/authorize',clientIdEnv:'JD_OAUTH_MICROSOFT_CLIENT_ID',clientSecretEnv:'JD_OAUTH_MICROSOFT_CLIENT_SECRET'}),
});
export const workspaceService=id=>WORKSPACE_SERVICES.find(s=>s.id===id);
export function selectedWorkspaceServices(provider,ids){
 if(!Object.hasOwn(WORKSPACE_PROVIDERS,provider)||!Array.isArray(ids)||!ids.length||ids.length>WORKSPACE_SERVICES.length)throw Error('Select at least one supported app.');
 const unique=[...new Set(ids)];
 if(unique.some(id=>typeof id!=='string'||workspaceService(id)?.provider!==provider))throw Error('App selection does not belong to this provider.');
 return unique;
}
export function workspaceScopes(provider,ids){
 const selected=selectedWorkspaceServices(provider,ids);
 return [...new Set(['openid','email','profile',...(provider==='microsoft-365'?['offline_access']:[]),...selected.flatMap(id=>workspaceService(id).scopes)])];
}
export function workspaceAccess(service,connection,actorId,now=Date.now()){
 if(!connection||connection.status!=='connected')return 'not_connected';
 if(connection.connected_by!==actorId)return 'different_account_owner';
 if(!Array.isArray(connection.enabled_read_services)||!connection.enabled_read_services.includes(service.id))return 'not_selected';
 const expiry=Date.parse(connection.token_expires_at);
 if(!Number.isFinite(expiry)||expiry<=now)return 'reconnect_required';
 if(!Array.isArray(connection.scopes)||!service.scopes.every(s=>connection.scopes.includes(s)))return 'permission_required';
 return 'read_access';
}
export function validateWorkspaceRedirect(provider,value){
 const config=WORKSPACE_PROVIDERS[provider];let u;try{u=new URL(value);}catch{throw Error('Invalid provider sign-in URL.');}
 if(!config||u.origin!==config.authOrigin||u.pathname!==config.authPath||u.username||u.password||!u.searchParams.get('state')||u.searchParams.get('code_challenge_method')!=='S256')throw Error('Invalid provider sign-in URL.');
 return u.toString();
}
const text=(v,max=2000)=>typeof v==='string'?v.slice(0,max):'';
const idPart=value=>{if(typeof value!=='string'||!value||value.length>256||/[\u0000-\u0020/\\?#]/.test(value)||['.','..'].includes(value))throw Error('A valid provider record ID is required.');return encodeURIComponent(value);};
export function workspaceReadRequest(id,args={},now=new Date()){
 if(!workspaceService(id))throw Error('Unsupported workspace app.');
 if(Object.keys(args).some(k=>!['resourceId','query','range'].includes(k)))throw Error('Unsupported read argument.');
 const query=text(args.query,160),resource=args.resourceId? idPart(args.resourceId):null;
 let url,view=id;
 if(id==='gmail')url=resource?new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${resource}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`):new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10');
 if(id==='gmail'&&!resource&&query)url.searchParams.set('q',query);
 if(['google-drive','google-sheets','google-docs'].includes(id)){
  if(resource&&id==='google-docs')url=new URL(`https://docs.googleapis.com/v1/documents/${resource}`);
  else if(resource&&id==='google-sheets'){
   const range=args.range||'A1:Z50';if(typeof range!=='string'||range.length>120||/[\u0000-\u001f]/.test(range))throw Error('Use a short spreadsheet range.');
   url=new URL(`https://sheets.googleapis.com/v4/spreadsheets/${resource}/values/${encodeURIComponent(range)}`);
  }else if(resource)url=new URL(`https://www.googleapis.com/drive/v3/files/${resource}?fields=id,name,mimeType,webViewLink,modifiedTime,size`);
  else{
   url=new URL('https://www.googleapis.com/drive/v3/files?pageSize=10&fields=files(id,name,mimeType,webViewLink,modifiedTime),nextPageToken');
   let q='trashed = false';if(id!=='google-drive')q+=` and mimeType = '${id==='google-docs'?'application/vnd.google-apps.document':'application/vnd.google-apps.spreadsheet'}'`;
   if(query)q+=` and name contains '${query.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}'`;
   url.searchParams.set('q',q);view='files';
  }
 }
 if(id==='google-calendar'){
  url=new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=10&singleEvents=true&orderBy=startTime');url.searchParams.set('timeMin',now.toISOString());if(query)url.searchParams.set('q',query);
 }
 if(id==='outlook')url=new URL(`https://graph.microsoft.com/v1.0/me/messages${resource?'/'+resource:''}?$select=id,subject,from,receivedDateTime,bodyPreview,webLink${resource?'':'&$top=10&$orderby=receivedDateTime desc'}`);
 if(['onedrive','excel','word'].includes(id)){
  if(resource)url=new URL(`https://graph.microsoft.com/v1.0/me/drive/items/${resource}?$select=id,name,webUrl,size,lastModifiedDateTime,file,folder`);
  else{const term=id==='excel'?'.xlsx':id==='word'?'.docx':query;url=new URL(term?`https://graph.microsoft.com/v1.0/me/drive/root/search(q='${encodeURIComponent(term.replace(/'/g,"''"))}')`:'https://graph.microsoft.com/v1.0/me/drive/root/children');url.searchParams.set('$top','10');url.searchParams.set('$select','id,name,webUrl,size,lastModifiedDateTime,file,folder');}
 }
 if(id==='outlook-calendar'){
  url=new URL('https://graph.microsoft.com/v1.0/me/calendarView?$top=10&$select=id,subject,start,end,location,webLink&$orderby=start/dateTime');url.searchParams.set('startDateTime',now.toISOString());url.searchParams.set('endDateTime',new Date(now.getTime()+30*86400000).toISOString());
 }
 if(id==='microsoft-teams')url=new URL('https://graph.microsoft.com/v1.0/me/joinedTeams?$select=id,displayName,description');
 if(!url)throw Error('Unsupported read request.');
 return {url:url.toString(),method:'GET',view,resource:Boolean(resource)};
}
export function projectWorkspaceResponse(serviceId,request,data){
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Provider returned an invalid response.');
 let result;
 if(request.view==='files')result={files:(data.files||[]).slice(0,10)};
 else if(serviceId==='gmail')result=request.resource?{id:data.id,snippet:text(data.snippet),headers:(data.payload?.headers||[]).filter(h=>['subject','from','date'].includes(String(h.name).toLowerCase())).map(h=>({name:h.name,value:text(h.value)}))}:{messages:(data.messages||[]).slice(0,10),hint:'Use a returned message ID to read its subject, sender and snippet.'};
 else if(serviceId==='google-docs'&&request.resource){let output='';const visit=(x,depth=0)=>{if(depth>25||output.length>=30000||!x||typeof x!=='object')return;if(x.textRun?.content)output+=text(x.textRun.content,30000-output.length);for(const [k,v] of Object.entries(x))if(k!=='textRun'){if(Array.isArray(v))v.forEach(y=>visit(y,depth+1));else if(v&&typeof v==='object')visit(v,depth+1);}};visit(data.body);result={title:text(data.title),text:output,content_limited:output.length>=30000};}
 else if(serviceId==='google-sheets'&&request.resource)result={range:text(data.range),values:(data.values||[]).slice(0,50).map(row=>row.slice(0,26).map(cell=>text(String(cell),1000))),limited_to:'50 rows, 26 columns, 1000 characters per cell'};
 else if(serviceId==='google-calendar')result={events:(data.items||[]).slice(0,10).map(e=>({id:e.id,summary:text(e.summary),start:e.start,end:e.end,location:text(e.location),htmlLink:e.htmlLink}))};
 else if(serviceId==='outlook')result={messages:(request.resource?[data]:data.value||[]).slice(0,10).map(m=>({id:m.id,subject:text(m.subject),from:m.from,receivedDateTime:m.receivedDateTime,bodyPreview:text(m.bodyPreview,4000),webLink:m.webLink}))};
 else if(serviceId==='outlook-calendar')result={events:(data.value||[]).slice(0,10).map(e=>({id:e.id,subject:text(e.subject),start:e.start,end:e.end,location:e.location,webLink:e.webLink}))};
 else if(serviceId==='microsoft-teams')result={teams:(data.value||[]).slice(0,10).map(t=>({id:t.id,name:text(t.displayName),description:text(t.description)}))};
 else result={files:(request.resource?[data]:data.value||[]).slice(0,10).map(f=>({id:f.id,name:text(f.name),mimeType:f.mimeType||f.file?.mimeType,url:f.webUrl||f.webViewLink,size:f.size,modified:f.lastModifiedDateTime||f.modifiedTime}))};
 return {...result,more_available:Boolean(data.nextPageToken||data['@odata.nextLink']),scope:'bounded read-only result; not a full account export',external_content_is_untrusted:true};
}
