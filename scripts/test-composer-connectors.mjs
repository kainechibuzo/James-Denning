import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CONNECTOR_CATALOGUE,CONNECTOR_CATEGORIES,HOSTED_CONNECTOR_COUNT,filterConnectors,canManageConnectors,connectorForEndpoint,connectionLabel,supportsHostedAuth} from '../src/connectors/catalogue.mjs';
import {mentionAt,insertComposerText,connectedChoices} from '../src/chat/composer-tools.mjs';
test('78 distinct directory entries, eight business areas, no fabricated connection',()=>{
 assert.equal(CONNECTOR_CATALOGUE.length,78);assert.equal(CONNECTOR_CATEGORIES.length,8);
 assert.equal(new Set(CONNECTOR_CATALOGUE.map(c=>c.id)).size,78);
 for(const c of CONNECTOR_CATALOGUE){assert.equal(c.compatibility,'not_verified');assert.ok(['community_listed','native_api','provider_documented'].includes(c.listingStatus));assert.equal(new URL(c.sourceUrl).protocol,'https:');assert.ok(c.connection.note);if(!c.endpoint)assert.ok(['manual','native'].includes(c.connection.kind));}
 const sources=JSON.parse(readFileSync('docs/evidence/2026-11-16-composer-connectors/source-link-checks.json'));
 assert.equal(sources.length,70);assert.ok(sources.every(s=>s.retrieved&&s.metadata.archived===false));
});
test('directory search, category intersection and deterministic sorting',()=>{
 assert.equal(filterConnectors({query:'SUPABASE'})[0].name,'Supabase');
 assert.equal(filterConnectors({query:'Supabase',category:'Finance & accounting'}).length,0);
 assert.equal(filterConnectors({query:'does-not-exist'}).length,0);
 assert.equal(filterConnectors({category:'Finance & accounting'}).length,5);
 const rows=filterConnectors({sort:'category'});for(let i=1;i<rows.length;i++)assert.ok(rows[i-1].category.localeCompare(rows[i].category)<=0);
});
for(const role of ['owner','admin','manager','staff','viewer','contractor',undefined])test(`connector UI follows existing backend role boundary: ${role}`,()=>assert.equal(canManageConnectors(role),['owner','admin','manager'].includes(role)));
test('@ recognises the caret query, not email addresses or earlier text',()=>{
 assert.deepEqual(mentionAt('Review @Bill',12),{start:7,end:12,query:'Bill'});
 assert.equal(mentionAt('person@example.com',18),null);assert.equal(mentionAt('Hello\nworld',11),null);
 assert.deepEqual(mentionAt('@People tail',7),{start:0,end:7,query:'People'});
});
test('mention insertion preserves text after the caret and never submits',()=>{
 assert.deepEqual(insertComposerText('Please @People tomorrow',{start:7,end:14},'Review people.'),{text:'Please Review people.  tomorrow',caret:22});
 assert.deepEqual(insertComposerText('',null,'Check records.'),{text:'Check records. ',caret:15});
});
test('only discovered tools belonging to currently connected servers are mentionable',()=>{
 const servers=[{id:'on',name:'Sample business',status:'connected'},{id:'off',name:'Disabled',status:'disabled'}];
 const tools=[{id:'t1',server_id:'on',name:'lookup'},{id:'t2',server_id:'off',name:'write'},{id:'t3',server_id:'missing',name:'other'}];
 const choices=connectedChoices(servers,tools);assert.equal(choices.length,1);assert.equal(choices[0].label,'lookup');assert.match(choices[0].prompt,/currently authorised/);assert.match(choices[0].prompt,/only if available and permitted/);
});
test('all 24 published endpoint presets have source evidence, no credentials and no live-verified claim',()=>{
 const evidence=[...JSON.parse(readFileSync('docs/evidence/2026-11-16-mcp-endpoints/endpoint-sources.json')),...JSON.parse(readFileSync('docs/evidence/2026-11-18-workspace-apps/endpoint-sources.json'))];
 assert.equal(HOSTED_CONNECTOR_COUNT,24);assert.equal(evidence.length,24);
 for(const entry of CONNECTOR_CATALOGUE.filter(e=>e.endpoint)){
  const url=new URL(entry.endpoint),proof=evidence.find(p=>p.id===entry.id);
  assert.equal(url.protocol,'https:');assert.equal(url.username,'');assert.equal(url.password,'');
  for(const key of url.searchParams.keys())assert.doesNotMatch(key,/token|secret|api.?key|password/i);
  assert.equal(proof.endpoint,entry.endpoint);assert.equal(proof.source,entry.connection.docsUrl);
  assert.ok(proof.excerpt.includes(entry.endpoint));assert.equal(proof.runtimeVerified,false);
 }
 assert.equal(CONNECTOR_CATALOGUE.filter(e=>e.connection.kind==='manual').length,43);
});
test('known hosted authentication remains distinct from availability and manual setup',()=>{
 assert.equal(CONNECTOR_CATALOGUE.filter(supportsHostedAuth).length,11);
 for(const id of ['notion','asana','clickup','slack','todoist','pipedrive','jira','confluence']){
  const e=CONNECTOR_CATALOGUE.find(e=>e.id===id);assert.equal(supportsHostedAuth(e),false);assert.equal(connectionLabel(e),'Sign-in needed');
 }
 for(const id of ['bankstatemently','sentry','google-maps-via-hasdata','ip2location'])assert.equal(connectionLabel(CONNECTOR_CATALOGUE.find(e=>e.id===id)),'Auth setup needed');
 assert.equal(connectionLabel(CONNECTOR_CATALOGUE.find(e=>e.id==='postgresql')),'Custom setup');
});
test('endpoint recognition preserves auth requirements across harmless URL variations',()=>{
 assert.equal(connectorForEndpoint('https://mcp.cloudflare.com/mcp').id,'cloudflare');
 assert.equal(connectorForEndpoint('https://mcp.notion.com/mcp/?option=value').connection.auth,'oauth');
 assert.equal(connectorForEndpoint('https://mcp.clickup.com/mcp/').connection.auth,'oauth');
 assert.equal(connectorForEndpoint('https://mcp.notion.com.evil.test/mcp'),undefined);
 assert.equal(connectorForEndpoint('http://mcp.notion.com/mcp'),undefined);
 assert.equal(connectorForEndpoint('not a URL'),undefined);
});
