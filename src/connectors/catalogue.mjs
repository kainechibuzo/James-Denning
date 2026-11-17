import entries from './catalogue.json' with {type:'json'};
export const CONNECTOR_CATALOGUE=Object.freeze(entries.map(Object.freeze));
export const CONNECTOR_CATEGORIES=Object.freeze([...new Set(entries.map(e=>e.category))]);
export const canManageConnectors=role=>['owner','admin','manager'].includes(role);
export function filterConnectors({query='',category='All',sort='name'}={}){
 const terms=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
 return CONNECTOR_CATALOGUE.filter(e=>(category==='All'||e.category===category)&&terms.every(t=>`${e.name} ${e.category} ${e.description}`.toLowerCase().includes(t))).sort((a,b)=>sort==='category'?a.category.localeCompare(b.category)||a.name.localeCompare(b.name):a.name.localeCompare(b.name));
}
