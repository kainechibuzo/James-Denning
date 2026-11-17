// Presentation only; never grants database permissions or changes stored settings.
export function showEducationSettings(settings={}) {
 return settings.workspace_type==='education' && ![false,'false'].includes(settings.education_module_enabled);
}
export function configuredProjectLabel(url){
 try{const parsed=new URL(url);return parsed.protocol==='https:'&&!parsed.username&&!parsed.password&&/^[a-z]{20}\.supabase\.co$/.test(parsed.hostname)?parsed.hostname.split('.')[0]:'Custom or local endpoint';}
 catch{return 'Not available';}
}
