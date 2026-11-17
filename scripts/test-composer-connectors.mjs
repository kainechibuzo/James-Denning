import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CONNECTOR_CATALOGUE,CONNECTOR_CATEGORIES,filterConnectors,canManageConnectors} from '../src/connectors/catalogue.mjs';
import {mentionAt,insertComposerText,connectedChoices} from '../src/chat/composer-tools.mjs';
test('70 distinct sourced entries, eight business areas, no fabricated endpoint or connection',()=>{
 assert.equal(CONNECTOR_CATALOGUE.length,70);assert.equal(CONNECTOR_CATEGORIES.length,8);
 assert.equal(new Set(CONNECTOR_CATALOGUE.map(c=>c.id)).size,70);
 for(const c of CONNECTOR_CATALOGUE){assert.equal(c.endpoint,null);assert.equal(c.compatibility,'not_verified');assert.equal(c.listingStatus,'community_listed');assert.equal(new URL(c.sourceUrl).hostname,'github.com');}
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
