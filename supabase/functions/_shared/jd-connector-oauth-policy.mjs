// Provider identities are fixed in source; OAuth app registrations belong to the
// operator, never to end users. Secrets are read only by Edge Functions.
export const MCP_OAUTH_PROVIDERS=Object.freeze({
 github:{name:'GitHub',endpoint:'https://api.githubcopilot.com/mcp/'},
 notion:{name:'Notion',endpoint:'https://mcp.notion.com/mcp'},
 slack:{name:'Slack',endpoint:'https://mcp.slack.com/mcp'},
 vercel:{name:'Vercel',endpoint:'https://mcp.vercel.com'},
 asana:{name:'Asana',endpoint:'https://mcp.asana.com/v2/mcp'},
 clickup:{name:'ClickUp',endpoint:'https://mcp.clickup.com/mcp'},
 todoist:{name:'Todoist',endpoint:'https://ai.todoist.net/mcp'},
 pipedrive:{name:'Pipedrive',endpoint:'https://mcp.pipedrive.ai/mcp'},
 atlassian:{name:'Atlassian',endpoint:'https://mcp.atlassian.com/v2/mcp'},
 airtable:{name:'Airtable',endpoint:'https://mcp.airtable.com/mcp'},
 supabase:{name:'Supabase',endpoint:'https://mcp.supabase.com/mcp'},
 cloudflare:{name:'Cloudflare',endpoint:'https://mcp.cloudflare.com/mcp'},
 linear:{name:'Linear',endpoint:'https://mcp.linear.app/mcp/readonly'},
});
export const oauthProviderId=id=>['jira','confluence'].includes(id)?'atlassian':Object.hasOwn(MCP_OAUTH_PROVIDERS,id)?id:null;
export function publicHttps(value){
 let u;try{u=new URL(value);}catch{throw Error('Operator OAuth URL is invalid.');}
 if(u.protocol!=='https:'||u.username||u.password||u.hash||(u.port&&u.port!=='443')||u.hostname==='localhost'||u.hostname.endsWith('.local')||u.hostname.endsWith('.internal')||/^[\d.]+$/.test(u.hostname)||u.hostname.includes(':'))throw Error('Operator OAuth URL must be public HTTPS.');
 return u;
}
export function oauthConfig(providerId,raw,allowedHosts){
 if(!Object.hasOwn(MCP_OAUTH_PROVIDERS,providerId))throw Error('Provider does not offer a configured sign-in route.');
 let all;try{all=JSON.parse(raw||'{}');}catch{throw Error('Operator OAuth configuration is invalid.');}
 const c=all[providerId];
 if(!c||typeof c.client_id!=='string'||!c.client_id.trim())throw Error('Provider sign-in needs operator setup. No API key is required from you.');
 const hosts=new Set(allowedHosts.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean));
 const endpoint=MCP_OAUTH_PROVIDERS[providerId].endpoint;
 for(const value of [c.authorization_endpoint,c.token_endpoint,...(c.revocation_endpoint?[c.revocation_endpoint]:[]),endpoint]){
  const url=publicHttps(value);if(url.search||!hosts.has(url.hostname))throw Error('Provider OAuth host is not on the operator allowlist.');
 }
 if(providerId==='github'&&(c.authorization_endpoint!=='https://github.com/login/oauth/authorize'||c.token_endpoint!=='https://github.com/login/oauth/access_token'||c.token_endpoint_auth_method==='none'))throw Error('GitHub MCP requires its registered confidential OAuth client.');
 if(providerId==='slack'&&(c.authorization_endpoint!=='https://slack.com/oauth/v2_user/authorize'||c.token_endpoint!=='https://slack.com/api/oauth.v2.user.access'||c.token_endpoint_auth_method==='none'))throw Error('Slack MCP requires its confidential user-token OAuth endpoints.');
 if(!Array.isArray(c.scopes)||c.scopes.some(s=>typeof s!=='string'||!s||/[\s,]/.test(s))||c.scopes.length>40)throw Error('Operator must configure reviewed provider scopes.');
 if(!['none','client_secret_post','client_secret_basic'].includes(c.token_endpoint_auth_method))throw Error('Unsupported provider OAuth client authentication.');
 if(c.token_endpoint_auth_method!=='none'&&(typeof c.client_secret!=='string'||!c.client_secret))throw Error('Operator OAuth app secret is missing.');
 if(![' ', ','].includes(c.scope_separator||' '))throw Error('Invalid OAuth scope separator.');
 if(c.resource&&c.resource!==endpoint)throw Error('OAuth resource must match the MCP endpoint.');
 // No arbitrary client-supplied parameters; only explicitly reviewed prompt flags.
 const extras=c.authorization_parameters||{};
 if(Object.keys(extras).some(k=>!['prompt','access_type','audience'].includes(k))||Object.values(extras).some(v=>typeof v!=='string'||v.length>500))throw Error('Unsupported OAuth authorization parameter.');
 return {...c,providerId,endpoint,scope_separator:c.scope_separator||' ',authorization_parameters:extras};
}
export function authorizationUrl(config,{state,challenge,redirect}){
 const u=publicHttps(config.authorization_endpoint);u.searchParams.set('client_id',config.client_id);u.searchParams.set('redirect_uri',publicHttps(redirect).toString());u.searchParams.set('response_type','code');u.searchParams.set('state',state);u.searchParams.set('code_challenge',challenge);u.searchParams.set('code_challenge_method','S256');
 u.searchParams.set('scope',config.scopes.join(config.scope_separator));if(config.resource)u.searchParams.set('resource',config.resource);
 for(const [k,v] of Object.entries(config.authorization_parameters))u.searchParams.set(k,v);
 return u.toString();
}
/** @returns {RequestInit} */
export function tokenRequest(config,values){
 const body=new URLSearchParams({...values,client_id:config.client_id});const headers={'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'};
 if(config.resource)body.set('resource',config.resource);
 if(config.token_endpoint_auth_method==='client_secret_post')body.set('client_secret',config.client_secret);
 if(config.token_endpoint_auth_method==='client_secret_basic')headers.Authorization='Basic '+btoa(encodeURIComponent(config.client_id)+':'+encodeURIComponent(config.client_secret));
 return {method:'POST',headers,body,redirect:'error',signal:AbortSignal.timeout(15000)};
}
export function tokenBundle(payload,previous=null,now=Date.now()){
 if(!payload||payload.error||payload.ok===false||typeof payload.access_token!=='string'||!payload.access_token||payload.access_token.length>16000||/[\r\n]/.test(payload.access_token))throw Error('Provider did not return a usable access token. Reconnect.');
 if(payload.token_type&&String(payload.token_type).toLowerCase()!=='bearer')throw Error('Provider returned an unsupported token type.');
 const expiry=payload.expires_in===undefined?null:Number(payload.expires_in);
 if(expiry!==null&&(!Number.isFinite(expiry)||expiry<=0||expiry>315360000))throw Error('Provider returned an invalid token expiry.');
 const refresh=payload.refresh_token??previous?.refresh_token??null;if(refresh!==null&&(typeof refresh!=='string'||refresh.length>16000))throw Error('Provider returned an invalid refresh token.');
 return {access_token:payload.access_token,refresh_token:refresh,expires_at:expiry===null?null:new Date(now+expiry*1000).toISOString(),scope:typeof payload.scope==='string'?payload.scope:previous?.scope||'',token_type:'Bearer'};
}
export async function oauthJson(response){
 if(!response.ok){await response.body?.cancel();throw Error('Provider authorization request failed (HTTP '+response.status+'). Reconnect or contact your operator.');}
 const reader=response.body?.getReader();if(!reader)throw Error('Empty provider response.');let size=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();throw Error('Provider OAuth response exceeds limit.');}chunks.push(value);}}finally{reader.releaseLock();}
 const out=new Uint8Array(size);let offset=0;for(const c of chunks){out.set(c,offset);offset+=c.length;}
 try{return JSON.parse(new TextDecoder().decode(out));}catch{throw Error('Provider returned invalid OAuth JSON.');}
}
export function canUseConnector(server,actor){return Boolean(server)&&(!server.access_owner_user_id||server.access_owner_user_id===actor);}

// Slack's documented user-only MCP endpoint returns token_type:"user", although
// MCP transport authenticates that user token with Authorization: Bearer.
// This exception is provider-specific; never accept arbitrary token types.
export function providerTokenBundle(providerId,payload,previous=null,now=Date.now()){
 if(providerId==='slack'&&payload?.token_type==='user')return tokenBundle({...payload,token_type:'Bearer',scope:payload.scope||payload.authed_user?.scope},previous,now);
 return tokenBundle(payload,previous,now);
}
