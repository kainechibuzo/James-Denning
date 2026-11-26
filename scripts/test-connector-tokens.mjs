import test from 'node:test';
import assert from 'node:assert/strict';
import {TOKEN_CONNECTORS,tokenConnector,tokenEndpoint,validateConnectorToken} from '../supabase/functions/_shared/jd-connector-token-policy.mjs';
import {CONNECTOR_CATALOGUE} from '../src/connectors/catalogue.mjs';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/migrations/20261118113318_jd_connector_pasted_tokens.sql','utf8');
for(const [id,p] of Object.entries(TOKEN_CONNECTORS))test(`${id}: pinned endpoint and sourced token instructions`,()=>{
 assert.equal(CONNECTOR_CATALOGUE.find(e=>e.id===id).endpoint,p.endpoint);
 assert.ok(sql.includes(`('${id}','${p.endpoint}'`),'DB and UI endpoint map agree');
 for(const u of [p.endpoint,p.credentialUrl,p.docsUrl]){const url=new URL(u);assert.equal(url.protocol,'https:');assert.equal(url.username,'');assert.equal(url.password,'');}
 assert.equal(p.steps.length,3);assert.ok(p.warning);assert.equal(tokenEndpoint(p.endpoint),true);assert.equal(tokenEndpoint(p.endpoint+'?token=secret'),false);
});
for(const id of ['notion','slack','gmail','vercel','constructor','__proto__',null])test(`${id}: no fabricated token route`,()=>assert.equal(tokenConnector(id),null));
for(const value of ['',null,'short','Bearer abcdefghijkl','https://example.com/key','abc\r\ndefghijkl','a'.repeat(8001)])test('reject malformed token '+String(value).slice(0,20),()=>assert.throws(()=>validateConnectorToken(value)));
test('accept opaque token and trim surrounding whitespace only',()=>assert.equal(validateConnectorToken('  SYNTHETIC_TOKEN_12345  '),'SYNTHETIC_TOKEN_12345'));
test('token dialog never persists credentials or renders provider errors',()=>{
 const ui=readFileSync('src/connectors/TokenConnectDialog.jsx','utf8');
 assert.doesNotMatch(ui,/localStorage|sessionStorage|console\.|JSON\.stringify|data\.error\s*\|\|/);
 assert.match(ui,/type="password"/);assert.match(ui,/setToken\(''\)/);assert.match(ui,/\.showModal\(\)/);assert.match(ui,/previous\.focus/);assert.match(ui,/rel="noopener noreferrer"/);
});
