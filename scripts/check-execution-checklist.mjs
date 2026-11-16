import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const departments=['OPS','COM','FIN','CMP','HR','HSE','MNT','WHS','ENG'];
const implementations=['partial','implemented — unverified','not established','external gate'];
const statuses=['unverified','blocked','verified'];
export function validateChecklist(checklist,ledger,fileExists=existsSync){
 const expected=[...checklist.matchAll(/^- \[([ x])\] ((?:P\d-[A-Z]?\d+)|A\d+) (.+)$/gm)].map(([,checked,id,requirement])=>({id,requirement,checked:checked==='x'}));
 assert.equal(ledger.schemaVersion,1,'Unsupported ledger version');
 assert.match(ledger.baseCommit,/^[0-9a-f]{40}$/,'Record the inspected base commit');
 assert.equal(ledger.items.length,expected.length,'Every checkbox must have one ledger row');
 assert.equal(new Set(ledger.items.map(i=>i.id)).size,expected.length,'Duplicate checklist ID');
 function verification(row){
  assert.ok(statuses.includes(row.acceptance),`Invalid acceptance: ${row.id}`);
  if(row.acceptance!=='verified'){assert.equal(row.verification,null,`Do not attach a passing verification to unaccepted ${row.id}`);return;}
  const v=row.verification;
  assert.ok(v,`Verification required for ${row.id}`);
  for(const key of ['commit','environment','timestamp','procedure','expectedResult','actualResult','artifact','reviewer','limitations'])assert.ok(typeof v[key]==='string'&&v[key].trim(),`${row.id}: missing ${key}`);
  assert.match(v.commit,/^[0-9a-f]{40}$/);assert.ok(Number.isFinite(Date.parse(v.timestamp)));
  assert.ok(v.reviewer!==row.deliveryOwner&&!/unassigned|pending|arena coding agent/i.test(v.reviewer),'Independent reviewer required');
  assert.equal(v.reviewer,row.independentReviewer,'Reviewer must match verification');
 }
 for(const e of expected){
  const row=ledger.items.find(r=>r.id===e.id);assert.ok(row,`Missing ${e.id}`);assert.equal(row.requirement,e.requirement,`${e.id}: stale requirement`);
  assert.ok(implementations.includes(row.implementation),`${row.id}: invalid implementation status`);
  for(const key of ['assessment','nextAction','deliveryOwner','independentReviewer'])assert.ok(typeof row[key]==='string'&&row[key].trim(),`${row.id}: missing ${key}`);
  for(const key of ['sources','evidence']){assert.ok(Array.isArray(row[key])&&row[key].length,`${row.id}: missing ${key}`);for(const path of row[key])assert.ok(fileExists(path),`${row.id}: missing ${path}`);}
  verification(row);assert.equal(e.checked,row.acceptance==='verified',`${row.id}: checkbox/acceptance mismatch`);
 }
 const parents=ledger.items.filter(r=>/^P5-\d\d$/.test(r.id));
 const expanded=parents.flatMap(p=>departments.map(d=>`${p.id.slice(0,3)}${d}-${p.id.slice(3)}`));
 assert.equal(ledger.departments.length,expanded.length,'Missing department requirements');
 assert.equal(new Set(ledger.departments.map(r=>r.id)).size,expanded.length,'Duplicate department requirement');
 for(const id of expanded){const row=ledger.departments.find(r=>r.id===id);assert.ok(row,`Missing ${id}`);assert.equal(row.parent,`P5-${id.split('-')[2]}`);verification(row);}
 for(const parent of parents)if(parent.acceptance==='verified')assert.ok(ledger.departments.filter(r=>r.parent===parent.id).every(r=>r.acceptance==='verified'),`${parent.id}: all departments must pass`);
 return {total:expected.length,phaseItems:expected.filter(r=>r.id.startsWith('P')).length,acceptanceCriteria:expected.filter(r=>r.id.startsWith('A')).length,verified:ledger.items.filter(r=>r.acceptance==='verified').length,expandedWork:expected.filter(r=>r.id.startsWith('P')).length-parents.length+expanded.length};
}
export function renderChecklist(ledger,counts){
 const count=field=>Object.entries(ledger.items.reduce((out,r)=>(out[r[field]]=(out[r[field]]||0)+1,out),{})).map(([key,n])=>`${key}: **${n}**`).join(' · ');
 const link=p=>`[${p.split('/').at(-1)}](../${p})`;
 const escape=s=>s.replaceAll('|','\\|').replaceAll('\n',' ');
 let text=`# JD checklist reconciliation\n\nAssessed: **${ledger.assessedAt}** · base \`${ledger.baseCommit}\` · branch \`${ledger.branch}\`.\n\n${ledger.scope}\n\n## Exact accounting\n\n- **${counts.phaseItems} phase items + ${counts.acceptanceCriteria} final criteria = ${counts.total} checkbox lines**.\n- Department expansion: **${counts.expandedWork} work checks + ${counts.acceptanceCriteria} final criteria** (nine departments × ten requirements).\n- Formal verified completion: **${counts.verified}/${counts.total} (${(100*counts.verified/counts.total).toFixed(1)}%)**. This is not a measure of how much software exists.\n- Implementation assessment: ${count('implementation')}. These are categories, not weighted progress percentages.\n- Acceptance: ${count('acceptance')}. No box is earned from local tests or this inventory alone.\n\n**Reading this ledger:** “implemented — unverified” means a narrow code path has been implemented and locally exercised, not that its live acceptance gate passes. “Partial” means relevant code/evidence exists but the requirement has open engineering or verification work. “Not established” means this inspection did not establish the capability; it is not a claim that no external work exists. “External gate” requires business evidence, approval or independent acceptance that code cannot supply. Sources identify relevant implementations, not certification of every line in a large module. All unassigned owners/reviewers are explicit in the [machine-readable ledger](JD_CHECKLIST_STATUS.json).\n\n**Checked-assignment activation blockers:** isolated staging and fixtures; original incident correlation; independent reviewer; backend release rehearsal before checked mode is enabled. The shipping frontend defaults to the existing legacy contract so the other changes can merge without requiring the new backend. No production test writes, recruitment publication, legal/financial commitment or launch is authorised.\n\n`;
 for(const prefix of ['P1','P2','P3','P4','P5','P6','P7','P8','A']){
  text+=`## ${prefix==='A'?'Final acceptance':`Phase ${prefix.slice(1)}`}\n\n| Item | Assessment | Implementation/evidence mapping | Next action |\n|---|---|---|---|\n`;
  for(const row of ledger.items.filter(r=>prefix==='A'?r.id.startsWith('A'):r.id.startsWith(prefix+'-'))){
   text+=`| **${row.id}** ${escape(row.requirement)} | ${row.implementation}; acceptance **${row.acceptance}** | ${escape(row.assessment)} Sources: ${row.sources.map(link).join(', ')}. Evidence: ${row.evidence.map(link).join(', ')}. | ${escape(row.nextAction)} |\n`;
  }
  text+='\n';
 }
 text+='## Department acceptance register\n\nShared P5 boxes require all nine department records. The 90 scoped records below are separate and currently have no signed verification; a navigation label is not an operational integration.\n\n| Department | Scoped requirements | Verified |\n|---|---|---|\n';
 for(const key of departments){const rows=ledger.departments.filter(r=>r.id.startsWith(`P5-${key}-`));text+=`| ${rows[0].department} | ${rows.map(r=>`\`${r.id}\``).join(', ')} | ${rows.filter(r=>r.acceptance==='verified').length}/${rows.length} |\n`;}
 text+='\nGenerated from `JD_CHECKLIST_STATUS.json` by `node scripts/check-execution-checklist.mjs --write`. CI checks ID/title/source coverage, department expansion, checkbox consistency and verification metadata. This validates planning integrity, not application behaviour.\n';
 return text;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const ledger=JSON.parse(readFileSync('docs/JD_CHECKLIST_STATUS.json','utf8'));
 const counts=validateChecklist(readFileSync('docs/JD_MASTER_EXECUTION_CHECKLIST.md','utf8'),ledger);
 const rendered=renderChecklist(ledger,counts),target='docs/JD_CHECKLIST_STATUS.md';
 if(process.argv.includes('--write'))writeFileSync(target,rendered);else assert.equal(readFileSync(target,'utf8'),rendered,'Regenerate checklist report after ledger changes');
 console.log(JSON.stringify(counts));console.log('Checklist IDs, source links, verification metadata and rendered report are consistent. This is not runtime acceptance.');
}
