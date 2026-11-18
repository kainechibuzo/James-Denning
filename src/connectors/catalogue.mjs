import entries from './catalogue.json' with {type:'json'};
import {WORKSPACE_SERVICES} from '../../supabase/functions/_shared/jd-workspace-connectors.mjs';
export const PRIORITY_CONNECTOR_IDS=Object.freeze([...WORKSPACE_SERVICES.map(s=>s.id),'slack','notion','vercel','airtable','linear','resend','exa','firecrawl','github','supabase','cloudflare']);
const nativeEntries=WORKSPACE_SERVICES.map(s=>({...s,category:['gmail','outlook','google-calendar','outlook-calendar','microsoft-teams'].includes(s.id)?'Communication':'Projects & knowledge',sourceUrl:s.provider==='google-workspace'?'https://developers.google.com/workspace':'https://learn.microsoft.com/graph/overview',listingStatus:'native_api',compatibility:'not_verified',endpoint:null,connection:{kind:'native',auth:'oauth',docsUrl:s.provider==='google-workspace'?'https://developers.google.com/workspace':'https://learn.microsoft.com/graph/overview',note:s.description}}));
const combined=[...entries.filter(e=>!WORKSPACE_SERVICES.some(s=>s.id===e.id)),...nativeEntries];
export const CONNECTOR_CATALOGUE=Object.freeze(combined.map(e=>Object.freeze({...e,connection:Object.freeze(e.connection)})));
export const CONNECTOR_CATEGORIES=Object.freeze([...new Set(entries.map(e=>e.category))]);
export const canManageConnectors=role=>['owner','admin','manager'].includes(role);
export function filterConnectors({query='',category='All',sort='name'}={}){
 const terms=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
 return CONNECTOR_CATALOGUE.filter(e=>(category==='All'||e.category===category)&&terms.every(t=>`${e.name} ${e.category} ${e.description}`.toLowerCase().includes(t))).sort((a,b)=>sort==='category'?a.category.localeCompare(b.category)||a.name.localeCompare(b.name):a.name.localeCompare(b.name));
}
// A documented URL is a setup preset, never an access grant or live-health claim.
export const HOSTED_CONNECTOR_COUNT=CONNECTOR_CATALOGUE.filter(e=>e.endpoint).length;
export const supportsHostedAuth=entry=>['bearer','optional_bearer'].includes(entry?.connection?.auth);
export function connectionLabel(entry){
 if(entry.connection.kind==='native')return 'Read-only app';
 if(!entry.endpoint)return 'Custom setup';
 if(entry.connection.auth==='oauth')return 'Sign-in needed';
 if(!supportsHostedAuth(entry))return 'Auth setup needed';
 return 'Hosted URL';
}
export function connectorForEndpoint(endpoint){
 // Ignore query options and trailing slashes when identifying auth requirements.
 // Editing a known OAuth URL must not turn it into an anonymous/token preset.
 const identity=value=>{try{const u=new URL(value);return u.protocol==='https:'?u.origin+u.pathname.replace(/\/+$/,''):null;}catch{return null;}};
 const key=identity(endpoint);
 return key?CONNECTOR_CATALOGUE.find(e=>e.endpoint&&identity(e.endpoint)===key):undefined;
}
