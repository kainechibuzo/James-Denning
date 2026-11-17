import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateChecklist,renderChecklist} from './check-execution-checklist.mjs';
const checklist=readFileSync('docs/JD_MASTER_EXECUTION_CHECKLIST.md','utf8');
const ledger=JSON.parse(readFileSync('docs/JD_CHECKLIST_STATUS.json','utf8'));
const clone=()=>structuredClone(ledger);
const verifiedCount=ledger.items.filter(r=>r.acceptance==='verified').length;
// Fixture mutations target the first not-yet-accepted item so accepted rows do not mask the checks.
const openIndex=ledger.items.findIndex(r=>r.acceptance!=='verified');
const openId=ledger.items[openIndex].id;
test('all 222 checkbox lines and 90 department records map exactly once',()=>{
 assert.deepEqual(validateChecklist(checklist,ledger),{total:222,phaseItems:213,acceptanceCriteria:9,verified:verifiedCount,expandedWork:293});
 assert.equal(renderChecklist(ledger,validateChecklist(checklist,ledger)),readFileSync('docs/JD_CHECKLIST_STATUS.md','utf8'));
});
for(const [name,mutate] of [
 ['missing row',l=>l.items.pop()],['duplicate ID',l=>l.items[1].id=l.items[0].id],['stale requirement',l=>l.items[0].requirement='Changed'],['missing source',l=>l.items[0].sources=['does-not-exist']],['missing evidence',l=>l.items[0].evidence=[]],['invalid implementation',l=>l.items[0].implementation='100%'],['missing department',l=>l.departments.pop()],['duplicate department',l=>l.departments[1].id=l.departments[0].id],['unreviewed verification',l=>l.items[openIndex].acceptance='verified'],['invented department verification',l=>l.departments[0].acceptance='verified']
])test(`ledger rejects ${name}`,()=>{const l=clone();mutate(l);assert.throws(()=>validateChecklist(checklist,l));});
test('checking a master box without accepted evidence fails validation',()=>{
 assert.throws(()=>validateChecklist(checklist.replace(`- [ ] ${openId} `,`- [x] ${openId} `),ledger),/mismatch/);
});
test('self review cannot satisfy independent verification',()=>{
 const l=clone(),r=l.items[openIndex];r.acceptance='verified';r.independentReviewer=r.deliveryOwner;
 r.verification={commit:l.baseCommit,environment:'local',timestamp:'2026-11-16T20:00:00Z',procedure:'test',expectedResult:'pass',actualResult:'pass',artifact:'reference',reviewer:r.deliveryOwner,limitations:'none'};
 assert.throws(()=>validateChecklist(checklist.replace(`- [ ] ${openId} `,`- [x] ${openId} `),l),/Independent reviewer/);
});
